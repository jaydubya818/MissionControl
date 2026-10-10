import { afterEach, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extractQualifiedDocker } from './qualified-docker.mjs';
import { lock, sha256 } from './evidence.mjs';

const roots = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });

async function fixture(machine = 62) {
  const root = await mkdtemp(join(tmpdir(), 'qualified-docker-test-'));
  roots.push(root);
  await mkdir(join(root, 'docker'));
  const bytes = Buffer.alloc(64);
  Buffer.from('7f454c460201', 'hex').copy(bytes);
  bytes.writeUInt16LE(machine, 18);
  await writeFile(join(root, 'docker/docker'), bytes);
  const archive = join(root, 'archive.tgz'), executable = join(root, 'qualified');
  execFileSync('tar', ['-czf', archive, '-C', root, 'docker/docker']);
  const identity = { archiveSha256: sha256(await readFile(archive)), executableSha256: sha256(bytes) };
  return { archive, executable, identity, bytes };
}

it('writes only byte-verified Linux x86-64 Docker with private executable permissions', async () => {
  const f = await fixture();
  await extractQualifiedDocker(f.archive, f.executable, f.identity);
  expect((await readFile(f.executable)).equals(f.bytes)).toBe(true);
  expect((await stat(f.executable)).mode & 0o777).toBe(0o700);
  await expect(extractQualifiedDocker(f.archive, f.executable, f.identity)).rejects.toThrow('EEXIST');
});

it('rejects altered archive before creating an executable', async () => {
  const f = await fixture();
  await writeFile(f.archive, Buffer.from('changed archive'));
  await expect(extractQualifiedDocker(f.archive, f.executable, f.identity)).rejects.toThrow('Docker archive differs');
  await expect(stat(f.executable)).rejects.toThrow('ENOENT');
});

it('rejects archive-valid but unadmitted CLI bytes', async () => {
  const f = await fixture();
  await expect(extractQualifiedDocker(f.archive, f.executable, { ...f.identity, executableSha256: '0'.repeat(64) })).rejects.toThrow('Docker CLI differs');
  await expect(stat(f.executable)).rejects.toThrow('ENOENT');
});

it('rejects a different host architecture even with matching hashes', async () => {
  const f = await fixture(183);
  await expect(extractQualifiedDocker(f.archive, f.executable, f.identity)).rejects.toThrow('Linux x86-64');
  await expect(stat(f.executable)).rejects.toThrow('ENOENT');
});

it('keeps distribution executable identity equal to the existing admitted Linux host identity', async () => {
  const source = await readFile(new URL('../../packages/workflow-engine/src/harnessManifests.ts', import.meta.url), 'utf8');
  const admitted = source.match(/"linux\/x64": "([a-f0-9]{64})"/);
  expect(admitted?.[1]).toBe(lock.dockerLinuxArchive.executableSha256);
});
