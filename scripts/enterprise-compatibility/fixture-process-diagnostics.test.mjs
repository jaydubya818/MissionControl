import { afterEach, expect, it } from 'vitest';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm, stat, appendFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fixtureProcessFailure, openFixtureBackendLog, runFixtureCommand } from './fixture-process-diagnostics.mjs';
const roots = [], children = [];
afterEach(async () => {
  for (const child of children.splice(0)) if (child.exitCode === null && child.signalCode === null) {
    const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited;
  }
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});
const directory = async () => { const root = await mkdtemp(join(tmpdir(), 'mc-fixture-process-test-')); roots.push(root); return root; };
const producer = `process.stderr.write(Buffer.alloc(8*1024*1024,120),()=>require('node:fs').writeFileSync(process.argv[1],'ready'));setInterval(()=>{},1000)`;
const waiter = `const end=Date.now()+Number(process.argv[2]);(async()=>{while(Date.now()<end){if(require('node:fs').existsSync(process.argv[1]))return;await new Promise(r=>setTimeout(r,20));}process.exit(4)})()`;
it('reproduces pipe backpressure while the owning process waits synchronously', async () => {
  const root = await directory(), marker = join(root, 'ready');
  const backend = spawn(process.execPath, ['-e', producer, marker], { stdio: ['ignore', 'ignore', 'pipe'] }); children.push(backend);
  let bytes = 0; backend.stderr.on('data', chunk => { bytes += chunk.length; });
  await once(backend, 'spawn');
  expect(() => execFileSync(process.execPath, ['-e', waiter, marker, '500'], { timeout: 2000, stdio: 'pipe' })).toThrow();
  expect(bytes).toBe(0);
});
it('keeps the backend progressing during synchronous consumers and across restart', async () => {
  const root = await directory();
  for (let index = 0; index < 2; index++) {
    const log = await openFixtureBackendLog(root), marker = join(root, `ready-${index}`);
    const backend = spawn(process.execPath, ['-e', producer, marker], { stdio: ['ignore', 'ignore', log.fd] }); children.push(backend);
    await once(backend, 'spawn'); await log.close(); // child owns its duplicated descriptor
    runFixtureCommand('PREPARE_FUNCTIONS', process.execPath, ['-e', waiter, marker, '4000'], { timeout: 5000, stdio: 'pipe' });
    const detail = await log.diagnostic(); expect(detail.bytes).toBe((index + 1) * 8 * 1024 * 1024);
    expect(detail.inspectedTailBytes).toBe(6000); expect(detail.markers).toEqual([]);
    expect((await stat(join(root, 'backend.stderr.log'))).mode & 0o777).toBe(0o600);
    expect(() => execFileSync(process.execPath, ['-e', ''], { stdio: ['ignore', 'ignore', log.fd] })).toThrow();
    const exited = once(backend, 'exit'); backend.kill('SIGTERM'); await exited; await log.close();
  }
});
it('retains only allowlisted tail markers and no log text or secrets', async () => {
  const root = await directory(), log = await openFixtureBackendLog(root); await log.close();
  await appendFile(join(root, 'backend.stderr.log'), 'panicked at\n' + 'x'.repeat(7000) + '\nPRIVATE_SECRET Address already in use\n');
  const detail = await log.diagnostic();
  expect(detail.inspectedTailBytes).toBe(6000); expect(detail.markers).toEqual(['ADDRESS_IN_USE']);
  expect(JSON.stringify(detail)).not.toMatch(/PRIVATE_SECRET|xxxx|panicked at/);
});
it('reports a real CLI timeout without retaining argv, stderr or the original error', () => {
  let failure;
  try { runFixtureCommand('PREPARE_FUNCTIONS', process.execPath, ['-e', "process.stderr.write('PRIVATE_SECRET');setInterval(()=>{},1000)", 'PRIVATE_ARG'], { timeout: 100, stdio: 'pipe' }); }
  catch (error) { failure = error; }
  const detail = JSON.parse(failure.message.slice(failure.message.indexOf('{')));
  expect(detail).toMatchObject({ stage: 'PREPARE_FUNCTIONS', code: 'ETIMEDOUT', signal: 'SIGTERM', status: null, timeoutMs: 100 });
  expect(detail.elapsedMs).toBeGreaterThanOrEqual(90); expect(failure.cause).toBeUndefined();
  expect(failure.message).not.toMatch(/PRIVATE_SECRET|PRIVATE_ARG|setInterval/);
});
it('distinguishes nonzero exit and unavailable executable without output leakage', () => {
  expect(() => runFixtureCommand('ENABLE_NATIVE', process.execPath, ['-e', "process.stderr.write('PRIVATE_SECRET');process.exit(7)"], { timeout: 2000, stdio: 'pipe' })).toThrow('"status":7');
  expect(() => runFixtureCommand('KEYGEN', '/nonexistent/mc-fixture-executable', ['PRIVATE_ARG'], { encoding: 'utf8' })).toThrow('"code":"ENOENT"');
});
it('does not serialize arbitrary process fields or unknown codes', () => {
  const error = fixtureProcessFailure('BACKEND_START', { code: 'PRIVATE_SECRET', signal: 'PRIVATE_SECRET', status: 'PRIVATE_SECRET', stderr: 'PRIVATE_SECRET', spawnargs: ['PRIVATE_SECRET'] }, 123);
  expect(error.message).toContain('"code":"UNCLASSIFIED"'); expect(error.message).not.toContain('PRIVATE_SECRET');
});
