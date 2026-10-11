// Disposable fixture telemetry only. Uses the endpoint/seconds fields consumed by
// the installed Convex CLI logs implementation; never exports raw log events.
const LIMIT_BYTES = 8 * 1024 * 1024;
const MAX_ENTRIES = 4096;
const MAX_SAMPLES = 32;
const value = (object, key) => Object.getOwnPropertyDescriptor(object ?? {}, key)?.value;
const finite = (n, max) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= max;
const id = n => typeof n === 'string' && n.length > 0 && n.length <= 256;
const fail = reason => ({ schema: 'fixture-completed-result-function-timing/v1', status: 'UNQUALIFIED', reason });

export function completedResultFunctionTiming(entries, expectedCommands = 6) {
  if (!Array.isArray(entries) || entries.length > MAX_ENTRIES || !Number.isSafeInteger(expectedCommands)
    || expectedCommands < 1 || expectedCommands > MAX_SAMPLES) return fail('INVALID_TELEMETRY');
  const selected = entries.filter(e => value(e, 'kind') === 'Completion'
    && ['sofieEnterprise:command', 'sofieEnterprise:apply'].includes(value(e, 'identifier')));
  const commands = selected.filter(e => value(e, 'identifier') === 'sofieEnterprise:command');
  const applies = selected.filter(e => value(e, 'identifier') === 'sofieEnterprise:apply');
  if (commands.length !== expectedCommands || applies.length !== expectedCommands) return fail('INCOMPLETE_OR_EXTRA_SAMPLES');
  const executions = new Set();
  for (const e of selected) {
    if (value(e, 'kind') !== 'Completion' || !id(value(e, 'executionId')) || !id(value(e, 'requestId'))
      || executions.has(value(e, 'executionId')) || value(e, 'willRetry') !== false || value(e, 'cachedResult') !== false
      || value(e, 'componentPath') != null || !finite(value(e, 'executionTime'), 1800)
      || !finite(value(e, 'userExecutionTime'), 1800)) return fail('INVALID_OR_AMBIGUOUS_SAMPLE');
    if (value(e, 'error') != null) return fail('FUNCTION_FAILED');
    executions.add(value(e, 'executionId'));
  }
  const samples = [], requests = new Set();
  for (const command of commands) {
    const matches = applies.filter(e => value(e, 'parentExecutionId') === value(command, 'executionId')
      && value(e, 'requestId') === value(command, 'requestId'));
    if (value(command, 'udfType') !== 'Action' || value(command, 'parentExecutionId') != null
      || requests.has(value(command, 'requestId')) || matches.length !== 1 || value(matches[0], 'udfType') !== 'Mutation')
      return fail('UNMATCHED_FUNCTION_PAIR');
    requests.add(value(command, 'requestId'));
    const apply = matches[0];
    samples.push({ commandExecutionMs: value(command, 'executionTime') * 1000,
      commandUserExecutionMs: value(command, 'userExecutionTime') * 1000,
      applyExecutionMs: value(apply, 'executionTime') * 1000,
      applyUserExecutionMs: value(apply, 'userExecutionTime') * 1000 });
  }
  const maxApplyUserExecutionMs = Math.max(...samples.map(s => s.applyUserExecutionMs));
  return { schema: 'fixture-completed-result-function-timing/v1', status: 'COMPLETE',
    scope: 'POSITIVE_COMPLETED_RESULT_CONSUMER_WINDOW', commandSamples: commands.length, applySamples: applies.length, samples,
    maxApplyExecutionMs: Math.max(...samples.map(s => s.applyExecutionMs)), maxApplyUserExecutionMs,
    mutationUserExecutionLimitMs: 1000, observedUserExecutionMarginMs: 1000 - maxApplyUserExecutionMs,
    semantics: 'Backend executionTime excludes client network latency; userExecutionTime excludes system overhead. Neither is adapter elapsed time or a CPU profile.',
    limitation: 'Observed fixture samples only; no future latency guarantee, percentile qualification, or production performance claim.' };
}

export async function readFixtureFunctionLogPage(url, key, cursor, fetcher = fetch) {
  // No caller-controlled remote deployment or URL credentials are admitted.
  const target = new URL(url);
  if (target.protocol !== 'http:' || target.hostname !== '127.0.0.1' || target.username || target.password
    || target.pathname !== '/' || target.search || target.hash || !finite(cursor, Number.MAX_SAFE_INTEGER)) throw Error('INVALID_TELEMETRY_TARGET');
  const response = await fetcher(`${target.origin}/api/stream_function_logs?cursor=${cursor}`, {
    headers: { Authorization: `Convex ${key}` }, signal: AbortSignal.timeout(2000), redirect: 'error' });
  if (!response.ok || !response.body) throw Error('TELEMETRY_UNAVAILABLE');
  const reader = response.body.getReader(), chunks = []; let bytes = 0;
  try {
    for (;;) {
      const { value: chunk, done } = await reader.read(); if (done) break;
      bytes += chunk.byteLength; if (bytes > LIMIT_BYTES) throw Error('TELEMETRY_TOO_LARGE'); chunks.push(chunk);
    }
  } finally { await reader.cancel().catch(() => {}); }
  const page = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (!Array.isArray(page.entries) || page.entries.length > MAX_ENTRIES || !finite(page.newCursor, Number.MAX_SAFE_INTEGER)
    || page.newCursor < cursor) throw Error('INVALID_TELEMETRY_PAGE');
  return page;
}

export async function captureCompletedResultFunctionTiming(readPage, operation, retain) {
  let cursor, valueReturned, operationFailed = false;
  try { cursor = (await readPage(0)).newCursor; } catch { /* Qualification remains explicitly unqualified. */ }
  try { valueReturned = await operation(); return valueReturned; }
  catch (error) { operationFailed = true; throw error; }
  finally {
    let evidence = fail('TELEMETRY_UNAVAILABLE');
    if (cursor !== undefined) {
      try {
        const page = await readPage(cursor);
        evidence = completedResultFunctionTiming(page.entries);
      } catch { /* Never retain raw backend errors, response bodies, or keys. */ }
    }
    if (operationFailed) evidence = fail('CONSUMER_FAILED');
    try { await retain(evidence); }
    catch (error) { if (!operationFailed) throw error; }
  }
}
