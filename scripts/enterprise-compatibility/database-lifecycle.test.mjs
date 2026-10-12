import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { mkdtemp, mkdir, writeFile, readFile, rm, stat, readlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startFixtureDatabase } from './database.mjs';
import { runFixtureCommand } from './fixture-process-diagnostics.mjs';
const state = vi.hoisted(() => ({ stopFails: false, spawnFails: false, environments: [] }));
vi.mock('node:child_process', async original => ({ ...await original(), spawn: (_binary, _args, options) => {
  state.environments.push(options.env);
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
  state.stopFails = false; state.spawnFails = false; state.environments = []; vi.mocked(runFixtureCommand).mockReset().mockReturnValue('PRIVATE_KEY');
  root = await mkdtemp(join(tmpdir(), 'mc-fixture-lifecycle-test-')); audit = join(root, 'audit.jsonl');
  await mkdir(join(root, 'convex/factory'), { recursive: true }); await mkdir(join(root, 'scripts/enterprise-compatibility'), { recursive: true }); await mkdir(join(root, 'node_modules'));
  for (const file of ['convex/schema.ts', 'convex/factory/enterpriseCompatibility.ts', 'scripts/enterprise-compatibility/seed.js']) await writeFile(join(root, file), '');
  vi.stubEnv('MC_COMPATIBILITY_CONVEX_BINARY', '/fixture/backend'); vi.stubEnv('MC_GOLDEN_DATABASE_AUDIT', audit);
  vi.stubGlobal('fetch', async () => ({ ok: true }));
});
afterEach(async () => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); await rm(root, { recursive: true, force: true }); });
const audits = async () => (await readFile(audit, 'utf8')).trim().split('\n').map(JSON.parse);
it('shares a filtered CI environment across the backend and CLI without inheriting provider credentials', async () => {
  vi.stubEnv('CI', ''); vi.stubEnv('VERCEL', '1'); vi.stubEnv('OPENAI_API_KEY', 'PRIVATE_PROVIDER_KEY');
  vi.stubEnv('CONVEX_DEPLOY_KEY', 'PRIVATE_DEPLOY_KEY');
  const db = await startFixtureDatabase(root);
  try {
    const env = state.environments[0];
    expect(env.CI).toBe('1');
    expect(Object.keys(env).sort()).toEqual(['CI', 'CONVEX_SELF_HOSTED_ADMIN_KEY', 'CONVEX_SELF_HOSTED_URL', 'CONVEX_TELEMETRY_DISABLED', 'HOME', 'PATH']);
    expect(JSON.stringify(env)).not.toMatch(/PRIVATE_PROVIDER_KEY|PRIVATE_DEPLOY_KEY|VERCEL/);
    for (const [stage, , , options] of vi.mocked(runFixtureCommand).mock.calls) {
      if (stage !== 'KEYGEN') expect(options.env).toBe(env);
    }
    await db.restart(); expect(state.environments[1]).toBe(env);
  } finally { await db.destroy(); }
});
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

it.each([{ nativeExecution: true, canonicalAccounting: true }, { installedPermits: true }])(
  'retains copied handler dependencies without enabling unrelated fixtures: %j', async options => {
    const files = {
      'convex/lib/serviceCommandAuth.ts': '', 'convex/sofieEnterprise.ts': '', 'convex/lib/factoryMemory.ts': '',
      'convex/sofieExecutionPermits.ts': 'import "../packages/shared/src/executionPermit";',
      'convex/sofieFactoryResults.ts': 'import "../packages/shared/src/factoryResult/protocol";',
      'convex/sofiePermitControlDelivery.ts': '', 'convex/sofieExecutionPermitState.ts': '',
      'convex/lib/offlineAttemptBudget.ts': '', 'convex/lib/companyAccess.ts': '',
      'packages/shared/src/executionPermit.ts': 'export const permit = true;',
      'packages/shared/src/factoryResult/protocol.ts': 'import "./signature";',
      'packages/shared/src/factoryResult/signature.ts': 'export const signature = true;',
      'packages/shared/package.json': '{"type":"module"}',
      'scripts/qualification/native-fixture.js': '', 'scripts/qualification/installed-permit-fixture.js': '',
      'scripts/enterprise-golden-journey/isolation-fixture.js': '',
      'scripts/enterprise-compatibility/accounting-fixture.js': '',
    };
    for (const [file, content] of Object.entries(files)) {
      const path = join(root, file); await mkdir(join(path, '..'), { recursive: true }); await writeFile(path, content);
    }
    await mkdir(join(root, 'packages/shared/node_modules'));
    const db = await startFixtureDatabase(root, options);
    try {
      for (const file of ['packages/shared/src/executionPermit.ts', 'packages/shared/src/factoryResult/protocol.ts',
        'packages/shared/src/factoryResult/signature.ts', 'packages/shared/package.json'])
        expect(await readFile(join(db.root, file), 'utf8')).toBe(files[file]);
      expect(await readlink(join(db.root, 'packages/shared/node_modules'))).toBe(join(root, 'packages/shared/node_modules'));
      const commands = vi.mocked(runFixtureCommand).mock.calls.map(([stage]) => stage);
      expect(commands.includes('ENABLE_NATIVE')).toBe(!!options.nativeExecution);
      expect(commands.includes('ENABLE_ACCOUNTING')).toBe(!!options.canonicalAccounting);
      if (options.installedPermits) expect((await stat(join(db.root, 'convex/installedPermitFixture.js'))).isFile()).toBe(true);
      else await expect(stat(join(db.root, 'convex/installedPermitFixture.js'))).rejects.toMatchObject({ code: 'ENOENT' });
    } finally { await db.destroy(); }
  },
);
