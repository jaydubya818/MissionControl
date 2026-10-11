import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { lock, sha256 } from './evidence.mjs';

export async function extractQualifiedDocker(archive, executable, identity) {
  assert.equal(sha256(await readFile(archive)), identity.archiveSha256, 'Docker archive differs from qualified distribution');
  const bytes = execFileSync('tar', ['-xOzf', archive, 'docker/docker'], { maxBuffer: 64 * 1024 * 1024 });
  assert.equal(sha256(bytes), identity.executableSha256, 'Docker CLI differs from admitted executable');
  assert.equal(bytes.subarray(0, 6).toString('hex'), '7f454c460201', 'Linux 64-bit little-endian ELF required');
  assert.equal(bytes.readUInt16LE(18), 62, 'Linux x86-64 Docker CLI required');
  await writeFile(executable, bytes, { flag: 'wx', mode: 0o700 });
}

export async function prepareQualifiedDocker(temp) {
  assert.equal(process.platform, 'linux');
  assert.equal(process.arch, 'x64');
  const identity = lock.dockerLinuxArchive;
  assert.equal(new URL(identity.url).origin, 'https://download.docker.com');
  const directory = join(temp, 'qualified-docker');
  await mkdir(directory);
  const archive = join(directory, 'docker.tgz'), executable = join(directory, 'docker');
  try {
    execFileSync('curl', ['--fail', '--location', '--proto', '=https', '--proto-redir', '=https', '--output', archive, identity.url], { stdio: 'inherit' });
    await extractQualifiedDocker(archive, executable, identity);
    const version = execFileSync(executable, ['--version'], { encoding: 'utf8' }).trim();
    const buildx = execFileSync(executable, ['buildx', 'version'], { encoding: 'utf8' }).trim();
    const evidence = { ...identity, version, buildx, executable };
    await writeFile(join(directory, 'identity.json'), JSON.stringify(evidence, null, 2) + '\n');
    console.log(JSON.stringify({ qualifiedDocker: evidence }));
    return executable;
  } finally {
    await rm(archive, { force: true });
  }
}
