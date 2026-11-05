// Starts (or restarts) the disposable owner-local MissionControl Convex backend on 127.0.0.1 and pushes THIS worktree's functions.
// The deployed copy's auth.config.ts trusts ONLY the temporary local identity issuer (data: JWKS, no network). Production Clerk is not
// configured in it and nothing here reaches a hosted Convex deployment. Usage: node scripts/owner-local/backend.mjs [start|push|stop]
import { spawn, execFileSync } from 'node:child_process';
import { cp, rm, symlink, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { MC_DIR, MC_PORT, MC_SITE_PORT, MC_URL, MC_SITE, LOCAL_ISSUER, LOCAL_AUDIENCE, issuerKey, ensureSecret, newSecret, writeSecret } from './common.mjs';

const ROOT = resolve(new URL('../..', import.meta.url).pathname);
const BIN = process.env.MC_LOCAL_CONVEX_BIN ?? '/Users/jaywest/.cache/convex/binaries/precompiled-2026-09-28-5c7cb5b/convex-local-backend';
const INSTANCE = 'owner-local-missioncontrol';
const project = join(MC_DIR, 'project'), storage = join(MC_DIR, 'storage'), db = join(MC_DIR, 'db.sqlite3'), pidFile = join(MC_DIR, 'backend.pid');
const secret = ensureSecret('mc-instance-secret', newSecret);
const env = { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: '/private/tmp', CONVEX_DISABLE_TELEMETRY: '1', DISABLE_BEACON: '1' };
const cli = join(ROOT, 'node_modules/convex/bin/main.js');

function adminKey() {
  const key = execFileSync(BIN, ['keygen', 'admin-key', '--instance-name', INSTANCE, '--instance-secret', secret], { encoding: 'utf8' }).trim();
  writeSecret('mc-admin-key', key);
  return key;
}
async function up() {
  for (let i = 0; i < 150; i++) { try { if ((await fetch(MC_URL + '/version')).ok) return; } catch {} await new Promise(r => setTimeout(r, 200)); }
  throw Error('backend did not start; see ' + join(MC_DIR, 'backend.log'));
}
async function start() {
  if (existsSync(pidFile)) { try { process.kill(Number(readFileSync(pidFile, 'utf8')), 0); console.log('backend already running'); return; } catch {} }
  await mkdir(MC_DIR, { recursive: true });
  const log = openSync(join(MC_DIR, 'backend.log'), 'a');
  const child = spawn(BIN, ['--interface', '127.0.0.1', '--port', String(MC_PORT), '--site-proxy-port', String(MC_SITE_PORT), '--convex-origin', MC_URL,
    '--convex-site', MC_SITE, '--instance-name', INSTANCE, '--instance-secret', secret, '--local-storage', storage, '--disable-beacon', db],
    { env, stdio: ['ignore', log, log], detached: true });
  child.unref(); writeFileSync(pidFile, String(child.pid));
  await up(); console.log('backend up', MC_URL, 'pid', child.pid);
}
async function push() {
  const { jwks } = issuerKey();
  await rm(project, { recursive: true, force: true }); await mkdir(project, { recursive: true });
  await cp(join(ROOT, 'convex'), join(project, 'convex'), { recursive: true, filter: s => !s.includes('/__tests__') && !/\/crons\.[jt]s$/.test(s) });
  await symlink(join(ROOT, 'packages'), join(project, 'packages'));
  await symlink(join(ROOT, 'node_modules'), join(project, 'node_modules'));
  await writeFile(join(project, 'package.json'), JSON.stringify({ type: 'module', dependencies: { convex: '1.42.3' } }));
  await writeFile(join(project, 'convex.json'), '{}');
  const data = 'data:text/plain;charset=utf-8;base64,' + Buffer.from(JSON.stringify(jwks)).toString('base64');
  // Disposable copy only: the local issuer is the ONLY trusted provider. The committed convex/auth.config.ts is unchanged.
  await writeFile(join(project, 'convex/auth.config.ts'), `export default { providers: [{ type: "customJwt", issuer: ${JSON.stringify(LOCAL_ISSUER)}, jwks: ${JSON.stringify(data)}, algorithm: "ES256", applicationID: ${JSON.stringify(LOCAL_AUDIENCE)} }] };\n`);
  await cp(join(ROOT, 'scripts/owner-local/ownerLocalOperator.ts'), join(project, 'convex/ownerLocalOperator.ts'));
  const key = adminKey();
  execFileSync(process.execPath, [cli, 'dev', '--once', '--typecheck', 'disable', '--codegen', 'enable', '--url', MC_URL, '--admin-key', key],
    { cwd: project, env, stdio: ['ignore', 'inherit', 'inherit'], timeout: 300000 });
  console.log('functions pushed');
}
async function stop() {
  if (!existsSync(pidFile)) return;
  try { process.kill(Number(readFileSync(pidFile, 'utf8')), 'SIGTERM'); } catch {}
  await rm(pidFile, { force: true }); console.log('backend stopped');
}
const cmd = process.argv[2] ?? 'start';
if (cmd === 'start') { await start(); await push(); }
else if (cmd === 'push') await push();
else if (cmd === 'stop') await stop();
else if (cmd === 'reset') { await stop(); await new Promise(r => setTimeout(r, 1500)); await rm(storage, { recursive: true, force: true }); await rm(db, { force: true }); await start(); await push(); }
