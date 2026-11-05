import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { runtimePullFailure } from './runtime-recovery-status.mjs';

test('only explicit registry authorization denials are NOT_RUN, with sanitized reasons', () => {
  for (const stderr of ['unauthorized: authentication required', 'denied: denied', 'denied: permission_denied', 'unexpected status from HEAD request: 403 Forbidden']) {
    const failure = runtimePullFailure({ stderr: stderr + '\nsecret-example-value' });
    assert.equal(failure.status, 'NOT_RUN');
    assert.ok(!failure.reason.includes('secret-example-value'));
  }
  for (const stderr of ['digest mismatch', 'network unavailable', 'Cannot connect to the Docker daemon', 'permission denied opening local socket', ''])
    assert.equal(runtimePullFailure({ stderr }).status, 'FAIL');
});

test('required runtime recovery exits nonzero for permission denial and integrity or infrastructure failure', async () => {
  const root = await mkdtemp(join(tmpdir(), 'runtime-recovery-denied-'));
  try {
    const docker = join(root, 'docker');
    await writeFile(docker, '#!/bin/sh\nprintf "%s\\n" "$TEST_PULL_ERROR" >&2\nexit 1\n');
    await chmod(docker, 0o700);
    for (const [index, error, status] of [[0, 'unauthorized: authentication required', 'NOT_RUN'], [1, 'digest mismatch', 'FAIL'], [2, 'network unavailable', 'FAIL']]) {
      const output = join(root, String(index));
      const result = spawnSync(process.execPath, [resolve('scripts/enterprise-golden-journey/recover-ghcr-runtime.mjs'), output], { encoding: 'utf8', env: { ...process.env, MC_GOLDEN_DOCKER: docker, TEST_PULL_ERROR: error } });
      assert.equal(result.status, 1, result.stderr);
      const report = JSON.parse(await readFile(join(output, 'recovery.json'), 'utf8'));
      assert.equal(report.status, status);
      assert.equal(report.rebuilt, false); assert.equal(report.published, false);
      assert.equal(report.binding, undefined);
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});
