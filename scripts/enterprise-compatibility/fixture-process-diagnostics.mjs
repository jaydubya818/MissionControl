import { execFileSync } from 'node:child_process';
import { open } from 'node:fs/promises';
import { join } from 'node:path';

const stages = new Set(['BACKEND_START', 'KEYGEN', 'PREPARE_FUNCTIONS', 'ENABLE_FIXTURES', 'ENABLE_ACCOUNTING', 'ENABLE_NATIVE', 'SET_ENVIRONMENT']);
const codes = new Set(['ETIMEDOUT', 'ENOENT', 'EACCES', 'ENOBUFS', 'ENOMEM', 'EAGAIN']);
const signals = new Set(['SIGTERM', 'SIGKILL', 'SIGABRT', 'SIGSEGV', 'SIGINT']);
function outputDiagnostic(value) {
  // Output markers are untrusted observations, never successful-stage evidence.
  const buffer = typeof value === 'string' ? Buffer.from(value) : Buffer.isBuffer(value) ? value : Buffer.alloc(0);
  const tail = buffer.subarray(Math.max(0, buffer.length - 6000));
  const text = tail.toString('utf8');
  return { bytes: buffer.length, inspectedTailBytes: tail.length, markers: [
    ['PREPARING', 'Preparing Convex functions...'],
    ['FUNCTIONS_READY', 'Convex functions ready!'],
    ['RETRYING_REQUEST', 'Retrying request (attempt '],
  ].filter(([, marker]) => text.includes(marker)).map(([name]) => name) };
}
export function fixtureProcessFailure(stage, error, elapsedMs, timeoutMs = null) {
  if (!stages.has(stage)) throw Error('Invalid fixture command stage');
  // Child messages include argv (admin keys) and arbitrary server output.
  // Preserve only fixed diagnostic fields; never attach the original Error as a cause.
  const code = error?.code, signal = error?.signal, status = error?.status;
  const diagnostic = { stage, code: codes.has(code) ? code : 'UNCLASSIFIED',
    signal: signals.has(signal) ? signal : null,
    status: Number.isInteger(status) && status >= 0 && status <= 255 ? status : null,
    elapsedMs: Number.isFinite(elapsedMs) && elapsedMs >= 0 ? Math.round(elapsedMs) : null,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs >= 0 ? timeoutMs : null,
    stdout: outputDiagnostic(error?.stdout), stderr: outputDiagnostic(error?.stderr) };
  return Error('Disposable fixture command failed: ' + JSON.stringify(diagnostic));
}
export function runFixtureCommand(stage, executable, args, options) {
  if (!stages.has(stage)) throw Error('Invalid fixture command stage');
  const startedAt = performance.now();
  try { return execFileSync(executable, args, options); }
  catch (error) { throw fixtureProcessFailure(stage, error, performance.now() - startedAt, options.timeout); }
}

export async function openFixtureBackendLog(root) {
  const path = join(root, 'backend.stderr.log'), handle = await open(path, 'a', 0o600);
  let closed = false;
  return {
    fd: handle.fd,
    async diagnostic() {
      const reader = await open(path, 'r');
      try {
        const { size } = await reader.stat(), bytes = Math.min(size, 6000), buffer = Buffer.alloc(bytes);
        const { bytesRead } = await reader.read(buffer, 0, bytes, Math.max(0, size - bytes));
        const tail = buffer.subarray(0, bytesRead).toString('utf8');
        return { bytes: size, inspectedTailBytes: bytesRead, markers: [
          ['ADDRESS_IN_USE', 'Address already in use'],
          ['PANIC', 'panicked at'],
          ['FUNCTION_TIMEOUT_1S', 'Function execution timed out (maximum duration: 1s)'],
        ].filter(([, marker]) => tail.includes(marker)).map(([name]) => name) };
      } finally { await reader.close(); }
    },
    async close() { if (!closed) { closed = true; await handle.close(); } },
  };
}
