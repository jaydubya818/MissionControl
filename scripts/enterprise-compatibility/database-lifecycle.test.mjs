import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { mkdtemp, mkdir, writeFile, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startFixtureDatabase } from './database.mjs';
import { runFixtureCommand } from './fixture-process-diagnostics.mjs';
const state = vi.hoisted(() => ({ stopFails: false, spawnFails: false }));
vi.mock('node:child_process', async original => ({ ...await original(), spawn: () => {
  const child = new EventEmitter(); Object.assign(child, { pid: 123, exitCode: null, signalCode: null,
    kill: () => { if (state.stopFails) throw Error('STOP_REFUSED'); child.exitCode = 0; queueMicrotask(() => child.emit('exit', 0)); return true; } });
  if (state.spawnFails) { child.pid = undefined; queueMicrotask(() => child.emit('error', Object.assign(Error('PRIVATE_SECRET'), { code: 'ENOENT' }))); }
  else queueMicrotask(() => child.emit('spawn'));
  return child;
} }));
vi.mock('./fixture-process-diagnostics.mjs', async original => ({ ...await original(), runFixtureCommand: vi.fn(() => 'PRIVATE_KEY') }));
vi.mock('convex/browser', () => ({ ConvexHttpClient: class { setAdminAuth() {} async mutation() { return {}; } }, ConvexClient: class {} }));
let root, audit;
beforeEach(async () => {
  state.stopFails = false; state.spawnFails = false; vi.mocked(runFixtureCommand).mockReset().mockReturnValue('PRIVATE_KEY');
  root = await mkdtemp(join(tmpdir(), 'mc-fixture-lifecycle-test-')); audit = join(root, 'audit.jsonl');
  await mkdir(join(root, 'convex/factory'), { recursive: true }); await mkdir(join(root, 'scripts/enterprise-compatibility'), { recursive: true }); await mkdir(join(root, 'node_modules'));
  for (const file of ['convex/schema.ts', 'convex/factory/enterpriseCompatibility.ts', 'scripts/enterprise-compatibility/seed.js']) await writeFile(join(root, file), '');
  vi.stubEnv('MC_COMPATIBILITY_CONVEX_BINARY', '/fixture/backend'); vi.stubEnv('MC_GOLDEN_DATABASE_AUDIT', audit);
  vi.stubGlobal('fetch', async () => ({ ok: true }));
});
afterEach(async () => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); await rm(root, { recursive: true, force: true }); });
const audits = async () => (await readFile(audit, 'utf8')).trim().split('\n').map(JSON.parse);
it('preserves the same owned database across restart and confirms cleanup only after exit', async () => {
  const db = await startFixtureDatabase(root); await db.restart(); await db.destroy();
  expect((await audits()).map(e => e.status)).toEqual(['CREATED', 'DESTROYED']);
  await expect(stat(db.root)).rejects.toMatchObject({ code: 'ENOENT' });
});
it('removes owned files but does not attest DESTROYED when stopping the backend fails', async () => {
  const db = await startFixtureDatabase(root); state.stopFails = true;
  await expect(db.destroy()).rejects.toThrow('STOP_REFUSED');
  expect((await audits()).map(e => e.status)).toEqual(['CREATED']);
  await expect(stat(db.root)).rejects.toMatchObject({ code: 'ENOENT' });
});
it('closes and cleans the startup descriptor when spawning fails without exposing the child message', async () => {
  state.spawnFails = true; await expect(startFixtureDatabase(root)).rejects.toThrow('"code":"ENOENT"');
  const entries = await audits(); expect(entries.map(e => e.status)).toEqual(['CREATED', 'DESTROYED']);
  await expect(stat(entries[0].root)).rejects.toMatchObject({ code: 'ENOENT' });
});
it('cleans the owned directory when key generation fails before backend startup', async () => {
  vi.mocked(runFixtureCommand).mockImplementation(() => { throw Error('SANITIZED_KEYGEN_FAILURE'); });
  await expect(startFixtureDatabase(root)).rejects.toThrow('SANITIZED_KEYGEN_FAILURE');
  const entries = await audits(); expect(entries.map(e => e.status)).toEqual(['CREATED', 'DESTROYED']);
  await expect(stat(entries[0].root)).rejects.toMatchObject({ code: 'ENOENT' });
});
