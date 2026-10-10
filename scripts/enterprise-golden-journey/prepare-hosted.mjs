import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, appendFile } from 'node:fs/promises';
import { join } from 'node:path';
import { lock, sha256 } from './evidence.mjs';
const suite = process.argv[2], temp = process.env.RUNNER_TEMP;
assert.ok(temp && process.env.GITHUB_ENV, 'Hosted ephemeral runner required');
const run = (cmd, args, options = {}) => execFileSync(cmd, args, { stdio: 'inherit', ...options });
const set = (name, value) => appendFile(process.env.GITHUB_ENV, `${name}=${value}\n`);
async function checkout(name, sha, path) {
  run('git', ['init', path]);
  run('git', ['-C', path, 'fetch', '--depth=1', `https://github.com/jaydubya818/${name}.git`, sha]);
  run('git', ['-C', path, 'checkout', '--detach', 'FETCH_HEAD']);
  assert.equal(execFileSync('git', ['-C', path, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), sha);
}
// Resolve pinned source revisions even when the live integration is unavailable.
await checkout('MyEveBot', lock.myEve, join(temp, 'golden-myeve'));
if (['contracts', 'browser-journey'].includes(suite)) process.exit(0);
const archive = join(temp, 'convex.zip'), convex = join(temp, 'convex');
run('curl', ['--fail', '--location', '--proto', '=https', '--output', archive, lock.convexLinuxArchive.url]);
assert.equal(sha256(await readFile(archive)), lock.convexLinuxArchive.sha256);
await mkdir(convex); run('unzip', ['-q', archive, '-d', convex]);
run('chmod', ['+x', join(convex, 'convex-local-backend')]);
await set('MC_COMPATIBILITY_CONVEX_BINARY', join(convex, 'convex-local-backend'));
await set('MC_GOLDEN_DOCKER', '/usr/bin/docker');
if (['delegated-execution', 'hybrid-mission'].includes(suite)) {
  const partner = join(temp, 'golden-myfactory'), fixture = join(temp, 'golden-fixture.git');
  await checkout('MyFactory', lock.myFactory, partner);
  run('npm', ['ci', '--prefix', partner, '--ignore-scripts', '--no-audit', '--no-fund']);
  run('git', ['init', '--bare', fixture]);
  // The provider bundles this revision from a second repository. A shallow
  // source rejects that ref update, so retain its complete pinned ancestry.
  run('git', ['--git-dir=' + fixture, 'fetch', '--no-tags', 'https://github.com/jaydubya818/MyFactory.git', `${lock.myFactoryFixtureSource}:refs/heads/fixture`]);
  assert.equal(execFileSync('git', ['--git-dir=' + fixture, 'rev-parse', 'refs/heads/fixture'], { encoding: 'utf8' }).trim(), lock.myFactoryFixtureSource);
  await set('MC_LOCAL_MYFACTORY_ROOT', partner); await set('MYFACTORY_FIXTURE_GIT', fixture);
  run('docker', ['pull', lock.providerImage]); run('docker', ['pull', lock.postgresImage]);
  run('docker', ['tag', lock.postgresImage, 'postgres:17']);
}
if (['native-execution', 'hybrid-mission', 'security-recovery'].includes(suite)) {
  const url = process.env.MC_GOLDEN_RUNTIME_PACKAGE_URL;
  if (!url) { console.log('Exact native runtime distribution unavailable. Runner will report NOT_RUN.'); process.exit(0); }
  assert.equal(new URL(url).protocol, 'https:');
  const packagePath = join(temp, 'runtime.tar'), build = join(temp, 'golden-runtime');
  run('curl', ['--fail', '--location', '--proto', '=https', '--proto-redir', '=https', '--output', packagePath, url]);
  assert.equal(sha256(await readFile(packagePath)), lock.runtimePackageSha256);
  await mkdir(build); run('tar', ['-xf', packagePath, '-C', build]);
  for (const [name, digest] of Object.entries(lock.runtimeFiles)) assert.equal(sha256(await readFile(join(build, name))), digest);
  run('docker', ['load', '-i', join(build, 'image.tar')]);
  // The canonical local-repository admission intentionally restricts this prefix.
  run('sudo', ['install', '-d', '-m', '1777', '/private/tmp']);
  await set('MC_GOLDEN_RUNTIME_BUILD', build);
}
