import assert from 'node:assert/strict';
import { execFile as callback } from 'node:child_process';
import { promisify } from 'node:util';
import { randomBytes } from 'node:crypto';
import { DockerSandboxProvider } from '../../apps/orchestration-server/src/dockerSandboxProvider.ts';
import { reconcileSandboxOrphans } from '../../apps/orchestration-server/src/sandboxReconciler.ts';
const execFile = promisify(callback);

export async function qualifyLocalResource({ insert, mutate, query, tenantId, projectId, missionId, workOrderId, authority, nativeFactory }) {
  const image = process.env.CAPABILITY_TEST_DOCKER_IMAGE;
  const dockerPath = process.env.CAPABILITY_TEST_DOCKER_BIN;
  const socketPath = process.env.CAPABILITY_TEST_DOCKER_SOCKET;
  assert.match(image ?? '', /@sha256:[a-f0-9]{64}$/);
  assert.ok(dockerPath?.startsWith('/') && socketPath?.startsWith('/'));
  const docker = async args => (await execFile(dockerPath, ['--host', `unix://${socketPath}`, ...args], {
    timeout: 30000, maxBuffer: 1000000, env: { PATH: '/usr/bin:/bin', HOME: process.env.HOME },
  })).stdout.trim();
  const [imageRecord] = JSON.parse(await docker(['image', 'inspect', image]));
  assert.equal(imageRecord.Architecture, 'amd64');
  assert.equal(imageRecord.Os, 'linux');
  assert.ok(imageRecord.RepoDigests.includes(image));
  assert.equal(Object.keys(imageRecord.Config.Volumes ?? {}).length, 0);
  const provider = new DockerSandboxProvider({ image, imageId: imageRecord.Id, platform: 'linux/amd64', dockerPath, socketPath });
  const resourceName = `mc-attempt-${randomBytes(8).toString('hex')}`;
  const leaseId = `qualification-${randomBytes(16).toString('hex')}`;
  const manifestDigest = `sha256:${randomBytes(32).toString('hex')}`;
  let allocation;
  try {
    const id = await docker(['create', '--pull=never', '--platform=linux/amd64', '--name', resourceName,
      '--label', 'mc.provider=factory/docker-offline/v1', '--label', `mc.lease=${leaseId}`, '--label', `mc.manifest=${manifestDigest}`,
      '--user=10001:10001', '--read-only', '--network=none', '--cap-drop=ALL', '--security-opt=no-new-privileges',
      '--cpus=1', '--memory=128m', '--memory-swap=128m', '--pids-limit=32', '--ipc=private', '--cgroupns=private',
      '--log-driver=none', '--entrypoint=node', image, '-e', 'setTimeout(() => process.exit(0), 120000)']);
    allocation = { provider: 'DOCKER', providerResourceId: id, resourceName, state: 'RUNNING', createdAt: Date.now(),
      providerMetadata: { schema: 'factory-docker-resource/v1', image, leaseId, manifestDigest } };
    await docker(['start', id]);
    const [running] = JSON.parse(await docker(['inspect', id]));
    assert.equal(running.State.Running, true);
    assert.equal(running.HostConfig.NetworkMode, 'none');
    assert.deepEqual(running.Mounts, []);
    const now = Date.now(), runId = `resource-recovery-${randomBytes(8).toString('hex')}`;
    const workflowRunId = await insert('workflowRuns', { tenantId, projectId, missionId, workOrderId, runId,
      repositoryId: nativeFactory.repositoryId, factoryDefinitionVersionId: nativeFactory.versionId,
      factoryConfigurationDigest: nativeFactory.configurationDigest, workflowId: 'synthetic-resource-recovery', status: 'RUNNING',
      executionManifest: { version: 'factory-execution-manifest/v2', executionBackend: 'remote-sandbox', qualification: 'cleanup-only-no-execution-grant' },
      lease: { leaseId, ownerId: 'synthetic-recovery-worker', claimedAt: now, heartbeatAt: now, expiresAt: now + 120000 },
      currentStepIndex: 0, totalSteps: 1, steps: [{ stepId: 'recovery', status: 'RUNNING', retryCount: 0 }],
      context: { fixture: 'cleanup-only-not-remote-admission' }, initialInput: '', startedAt: now, reservedCostUsd: 12,
      capabilityAuthorities: [authority] });
    const allocationId = await insert('sandboxAllocations', { ...allocation, tenantId, projectId, workOrderId, workflowRunId,
      factoryDefinitionVersionId: nativeFactory.versionId, attemptId: runId, attemptLeaseId: leaseId, manifestDigest,
      profileId: nativeFactory.sandboxId, profileDigest: 'synthetic-cleanup-only', profileSnapshot: { qualification: 'cleanup-only' },
      sourceSha: 'synthetic-cleanup-only', requestedAt: now, updatedAt: now });
    const candidates = await query('factory/attempts:listSandboxReconcileCandidatesInternal', { projectId, repositoryId: nativeFactory.repositoryId });
    const candidate = candidates.find(row => row.allocation._id === allocationId);
    assert.ok(candidate, 'Revocation must expose even an unexpired native lease for cleanup');
    assert.equal(candidate.attemptLeaseCurrent, false);
    const credentialBroker = { revoke: async () => { throw Error('No credentials are permitted in this fixture'); } };
    const before = await reconcileSandboxOrphans({ candidates: [candidate], providers: new Map(), credentialBroker });
    assert.equal(before.failed, 1);
    assert.equal((await query('qualificationFixture:read', { id: allocationId })).state, 'RUNNING');
    assert.equal(JSON.parse(await docker(['inspect', id]))[0].State.Running, true);
    let receipt;
    const health = await reconcileSandboxOrphans({ candidates: [candidate], providers: new Map([['DOCKER', provider]]), credentialBroker,
      onReceipt: async observed => {
        receipt = observed.termination;
        await mutate('factory/attempts:reportSandboxReconcileInternal', { workflowRunId, resourceName, ownerId: 'synthetic-recovery-worker', termination: receipt });
      } });
    assert.equal(health.failed, 0, JSON.stringify(health.failures));
    assert.equal(health.reconciled, 1);
    assert.equal(receipt.resourceAbsent, true);
    assert.equal(await docker(['ps', '--all', '--quiet', '--no-trunc', '--filter', `id=${id}`]), '');
    const durable = await query('qualificationFixture:read', { id: allocationId });
    assert.equal(durable.state, 'TERMINATED');
    assert.deepEqual(durable.teardownReceipt, receipt);
    const preserved = await query('qualificationFixture:read', { id: workflowRunId });
    assert.equal(preserved.status, 'RUNNING');
    assert.equal(preserved.reservedCostUsd, 12);
    assert.equal(preserved.sandboxTeardownVerifiedAt, receipt.confirmedAbsentAt);
    assert.equal((await mutate('factory/attempts:reportSandboxReconcileInternal', {
      workflowRunId, resourceName, ownerId: 'synthetic-recovery-worker', termination: receipt })).reconciled, false);
    assert.equal((await provider.terminate(allocation)).resourceAbsent, true);
    return { status: 'PASS', image, imageId: imageRecord.Id, network: 'NONE', credentials: 'NONE',
      observedRunning: true, canonicalTermination: true, durableConvexAbsence: true,
      reservationPreserved: true, paidExecution: 'NOT_RUN', remoteAdmission: 'NOT_RUN' };
  } finally {
    if (allocation) await provider.terminate(allocation);
  }
}
