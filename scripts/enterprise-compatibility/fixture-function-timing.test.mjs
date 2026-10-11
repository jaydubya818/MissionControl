import { expect, it, vi } from 'vitest';
import { completedResultFunctionTiming, readFixtureFunctionLogPage, captureCompletedResultFunctionTiming } from './fixture-function-timing.mjs';
const pair = n => [{ kind: 'Completion', identifier: 'sofieEnterprise:apply', udfType: 'Mutation', executionId: `private-mutation-${n}`,
  parentExecutionId: `private-action-${n}`, requestId: `private-request-${n}`, componentPath: null,
  executionTime: 0.48, userExecutionTime: 0.31, cachedResult: false, willRetry: false, error: null,
  success: { secret: 'PRIVATE_RESULT' }, logLines: ['PRIVATE_LOG'], usageStats: { private: true } },
{ kind: 'Completion', identifier: 'sofieEnterprise:command', udfType: 'Action', executionId: `private-action-${n}`,
  requestId: `private-request-${n}`, componentPath: null, executionTime: 0.53, userExecutionTime: 0.35,
  cachedResult: false, willRetry: false, error: null }];
const entries = () => Array.from({ length: 6 }, (_, n) => pair(n)).flat();
it('correlates actual backend action/mutation shape regardless of order and exports only bounded numeric metrics', () => {
  const input = entries().reverse(); input.push({ identifier: 'unrelated:read', logLines: ['PRIVATE_OTHER'] });
  input.push({ kind: 'Progress', identifier: 'sofieEnterprise:command', logLines: ['PRIVATE_PROGRESS'] });
  const result = completedResultFunctionTiming(input);
  expect(result.status).toBe('COMPLETE'); expect(result.commandSamples).toBe(6); expect(result.applySamples).toBe(6);
  expect(result.samples[0]).toEqual({ commandExecutionMs: 530, commandUserExecutionMs: 350, applyExecutionMs: 480, applyUserExecutionMs: 310 });
  expect(result.observedUserExecutionMarginMs).toBe(690);
  expect(JSON.stringify(result)).not.toMatch(/private-|PRIVATE_|requestId|executionId|logLines|success|usageStats/);
});
it.each(['missing', 'extra', 'duplicate', 'request', 'parent', 'nested-command', 'reused-request', 'type', 'retry', 'cached', 'error', 'progress', 'component', 'missing-user-time', 'negative', 'nan', 'infinite', 'oversized'])('fails closed on %s telemetry', fault => {
  const e = entries();
  if (fault === 'missing') e.pop();
  if (fault === 'extra') e.push(...pair(7));
  if (fault === 'duplicate') e[2] = structuredClone(e[0]);
  if (fault === 'request') e[0].requestId = 'another-request';
  if (fault === 'parent') e[0].parentExecutionId = 'another-action';
  if (fault === 'nested-command') e[1].parentExecutionId = 'another-action';
  if (fault === 'reused-request') { e[2].requestId = e[0].requestId; e[3].requestId = e[0].requestId; }
  if (fault === 'type') e[0].udfType = 'Action';
  if (fault === 'retry') e[0].willRetry = true;
  if (fault === 'cached') e[0].cachedResult = true;
  if (fault === 'error') e[0].error = 'PRIVATE_EXCEPTION';
  if (fault === 'progress') e[0].kind = 'Progress';
  if (fault === 'component') e[0].componentPath = 'foreign';
  if (fault === 'missing-user-time') delete e[0].userExecutionTime;
  if (fault === 'negative') e[0].executionTime = -1;
  if (fault === 'nan') e[0].executionTime = NaN;
  if (fault === 'infinite') e[0].executionTime = Infinity;
  if (fault === 'oversized') e[0].executionTime = 1801;
  const r = completedResultFunctionTiming(e); expect(r.status).toBe('UNQUALIFIED');
  expect(JSON.stringify(r)).not.toMatch(/PRIVATE|private|another|foreign/);
});
it('does not call getters or serializers while sanitizing backend-like records', () => {
  const e = entries(), hostile = vi.fn(() => { throw Error('PRIVATE_SECRET'); });
  Object.defineProperty(e[0], 'userExecutionTime', { get: hostile }); e[0].toJSON = hostile;
  expect(completedResultFunctionTiming(e).status).toBe('UNQUALIFIED'); expect(hostile).not.toHaveBeenCalled();
});
it('does not silently clamp a measured negative headroom into a passing sample', () => {
  const e = entries(); e[0].userExecutionTime = 1.1;
  expect(completedResultFunctionTiming(e).observedUserExecutionMarginMs).toBe(-100);
});
it('reads only the existing local backend endpoint with a bounded deadline and no redirects', async () => {
  const fetcher = vi.fn(async () => Response.json({ entries: entries(), newCursor: 12 }));
  const page = await readFixtureFunctionLogPage('http://127.0.0.1:3489', 'PRIVATE_KEY', 10, fetcher);
  expect(page.newCursor).toBe(12); const [url, options] = fetcher.mock.calls[0];
  expect(url).toBe('http://127.0.0.1:3489/api/stream_function_logs?cursor=10');
  expect(options.headers.Authorization).toBe('Convex PRIVATE_KEY'); expect(options.redirect).toBe('error'); expect(options.signal).toBeInstanceOf(AbortSignal);
  await expect(readFixtureFunctionLogPage('https://production.invalid', 'PRIVATE_KEY', 0, fetcher)).rejects.toThrow('INVALID_TELEMETRY_TARGET');
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it('rejects bounded-body overflow, malformed JSON and regressing cursors', async () => {
  await expect(readFixtureFunctionLogPage('http://127.0.0.1:3489', 'key', 0, async () => new Response('x'.repeat(8 * 1024 * 1024 + 1)))).rejects.toThrow('TELEMETRY_TOO_LARGE');
  await expect(readFixtureFunctionLogPage('http://127.0.0.1:3489', 'key', 0, async () => new Response('PRIVATE_BAD_JSON'))).rejects.toThrow();
  await expect(readFixtureFunctionLogPage('http://127.0.0.1:3489', 'key', 20, async () => Response.json({ entries: [], newCursor: 19 }))).rejects.toThrow('INVALID_TELEMETRY_PAGE');
});
it('bookends only the measured operation and preserves its returned proof object', async () => {
  const calls = [], proof = { signedProof: 'UNCHANGED' }, retained = [];
  const read = async cursor => { calls.push(cursor); return cursor === 0 ? { entries: pair(99), newCursor: 10 } : { entries: entries(), newCursor: 20 }; };
  const result = await captureCompletedResultFunctionTiming(read, async () => { calls.push('operation'); return proof; }, e => retained.push(e));
  expect(result).toBe(proof); expect(calls).toEqual([0, 'operation', 10]); expect(retained[0].status).toBe('COMPLETE');
});
it('does not turn missing telemetry into a successful timing qualification or skip the actual consumer', async () => {
  const retained = [], operation = vi.fn(async () => 'proof');
  const result = await captureCompletedResultFunctionTiming(async () => { throw Error('PRIVATE_KEY backendbody'); }, operation, e => retained.push(e));
  expect(result).toBe('proof'); expect(operation).toHaveBeenCalledTimes(1); expect(retained).toEqual([{ schema: 'fixture-completed-result-function-timing/v1', status: 'UNQUALIFIED', reason: 'TELEMETRY_UNAVAILABLE' }]);
});
it('retains a fixed failure classification without swallowing the original consumer failure', async () => {
  const retained = [], original = Error('original consumer failure');
  await expect(captureCompletedResultFunctionTiming(async () => ({ entries: entries(), newCursor: 10 }), async () => { throw original; }, e => retained.push(e))).rejects.toBe(original);
  expect(retained[0].reason).toBe('CONSUMER_FAILED'); expect(JSON.stringify(retained)).not.toContain('original consumer failure');
});
it('preserves the original consumer error on dual failure and rejects retention failure after a successful consumer', async () => {
  const original = Error('consumer failure'), retention = Error('retention failure');
  const read = async () => ({ entries: entries(), newCursor: 10 }), retain = async () => { throw retention; };
  await expect(captureCompletedResultFunctionTiming(read, async () => { throw original; }, retain)).rejects.toBe(original);
  await expect(captureCompletedResultFunctionTiming(read, async () => 'proof', retain)).rejects.toBe(retention);
});
