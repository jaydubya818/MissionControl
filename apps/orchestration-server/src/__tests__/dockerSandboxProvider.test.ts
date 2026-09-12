import { describe, it, expect } from 'vitest';
import { DockerSandboxProvider, DOCKER_CANDIDATE_IDENTITY, DOCKER_PROVIDER_ID, assertDockerContainerPolicy, dockerSupervisorConfig } from '../dockerSandboxProvider.js';
import { profile } from './fixtures/remoteWorkerFixture.js';
import type { SandboxAllocationRequest } from '../sandboxProvider.js';
const request = { resourceName: 'mc-attempt-1234567890abcdef', attemptLeaseId: 'lease-7', manifestDigest: `sha256:${'a'.repeat(64)}` } as SandboxAllocationRequest;
function inspection(): any { return { Image: DOCKER_CANDIDATE_IDENTITY.imageId, Name: '/'+request.resourceName, Config: { User: '10001:10001', Labels: { 'mc.lease': request.attemptLeaseId, 'mc.manifest': request.manifestDigest, 'mc.provider': DOCKER_PROVIDER_ID }, Entrypoint: ['node'], Cmd: ['/opt/factory/bridge.mjs'], Env: ['PATH=/usr/bin:/bin'] }, Mounts: [], HostConfig: { ReadonlyRootfs: true, Privileged: false, NetworkMode: 'none', CapDrop: ['ALL'], CapAdd: [], SecurityOpt: ['no-new-privileges'], PidMode: '', IpcMode: 'private', CgroupnsMode: 'private', NanoCpus: 1e9, Memory: 536870912, MemorySwap: 536870912, PidsLimit: 64, Binds: [], Devices: [], VolumesFrom: [], PortBindings: {}, Tmpfs: { '/var/lib/mission-control/attempt': 'rw,nosuid,nodev,noexec,size=134217728,uid=10001,gid=10001,mode=0700', '/tmp': 'rw,nosuid,nodev,noexec,size=16777216,uid=10001,gid=10001,mode=0700' } } }; }
describe('Docker fail-closed boundary controls', () => {
  it('accepts only the exact inspected policy', () => expect(() => assertDockerContainerPolicy(inspection(), DOCKER_CANDIDATE_IDENTITY.imageId, request)).not.toThrow());
  it.each(['image','privileged','mount','socket','network','pid','capability','seccomp','root','lease','memory','tmpfs','command','credential'])('denies %s substitution', kind => {
    const a = inspection();
    if (kind === 'image') a.Image = 'wrong';
    if (kind === 'privileged') a.HostConfig.Privileged = true;
    if (kind === 'mount') a.Mounts = [{ Type: 'bind', Source: '/Users', Destination: '/host' }];
    if (kind === 'socket') a.HostConfig.Binds = ['/var/run/docker.sock:/var/run/docker.sock'];
    if (kind === 'network') a.HostConfig.NetworkMode = 'host';
    if (kind === 'pid') a.HostConfig.PidMode = 'host';
    if (kind === 'capability') a.HostConfig.CapAdd = ['SYS_ADMIN'];
    if (kind === 'seccomp') a.HostConfig.SecurityOpt = ['seccomp=unconfined'];
    if (kind === 'root') a.Config.User = '0';
    if (kind === 'lease') a.Config.Labels['mc.lease'] = 'old';
    if (kind === 'memory') a.HostConfig.Memory = 0;
    if (kind === 'tmpfs') a.HostConfig.Tmpfs['/tmp'] = 'rw,size=999999999';
    if (kind === 'command') a.Config.Cmd = ['anything'];
    if (kind === 'credential') a.Config.Env.push('OPENAI_API_KEY=fixture-not-secret');
    expect(() => assertDockerContainerPolicy(a, DOCKER_CANDIDATE_IDENTITY.imageId, request)).toThrow();
  });
  it('rejects mutable image and stale resource authority without contacting Docker', async () => {
    expect(() => new DockerSandboxProvider({ ...DOCKER_CANDIDATE_IDENTITY, image: 'node:latest' })).toThrow();
    const p = new DockerSandboxProvider(DOCKER_CANDIDATE_IDENTITY);
    await expect(p.terminate({ provider: 'DOCKER', providerResourceId: 'another-container', resourceName: 'mc-attempt-1234567890abcdef', state: 'RUNNING', createdAt: 1 })).rejects.toThrow('stale');
  });
  it('rejects unsupported profile/backend', async () => { expect((await new DockerSandboxProvider(DOCKER_CANDIDATE_IDENTITY).validateProfile(profile())).dispatchable).toBe(false); });
});

it.runIf(process.env.MC_DOCKER_QUALIFICATION === '1')('recovers teardown after provider restart, rejects stale identity and tolerates already-absent teardown', async () => {
  const p = profile();
  p.provider = 'DOCKER'; p.providerProfile = DOCKER_PROVIDER_ID; p.providerProfileVersion = '1';
  p.machine = { image: DOCKER_CANDIDATE_IDENTITY.image, cpu: 1, memoryMb: 512, diskGb: 5 };
  p.supervisor.transport = 'DOCKER_STDIN'; p.credentials.inference = 'NONE'; p.network.egress = 'RESTRICTED_ALLOWLIST';
  const provider = new DockerSandboxProvider(DOCKER_CANDIDATE_IDENTITY);
  const allocation = await provider.allocate({ ...request, projectId: 'fixture-project', workOrderId: 'fixture-wo', workflowRunId: 'fixture-run', attemptId: 'fixture-attempt', sourceSha: 'a'.repeat(40), profile: p, requestedAt: Date.now() });
  const recovered = new DockerSandboxProvider(DOCKER_CANDIDATE_IDENTITY);
  try {
    const stale = { ...allocation, providerMetadata: { ...allocation.providerMetadata, leaseId: 'stale' } };
    await expect(new DockerSandboxProvider(DOCKER_CANDIDATE_IDENTITY).cancel(stale, 'stale')).rejects.toThrow('ownership');
    await recovered.cancel(allocation, 'Recovery stops work');
    expect((await recovered.terminate(allocation)).resourceAbsent).toBe(true);
    expect((await new DockerSandboxProvider(DOCKER_CANDIDATE_IDENTITY).terminate(allocation)).resourceAbsent).toBe(true);
  } finally { await new DockerSandboxProvider(DOCKER_CANDIDATE_IDENTITY).terminate(allocation); }
}, 30_000);

it('validates a distinct configuration image ID without confusing it with the manifest digest', () => {
 const actual = inspection(); const configId = `sha256:${'b'.repeat(64)}`; actual.Image = configId;
 expect(() => assertDockerContainerPolicy(actual, configId, request)).not.toThrow();
 expect(() => assertDockerContainerPolicy(actual, DOCKER_CANDIDATE_IDENTITY.imageId, request)).toThrow();
});
it('carries the server admission instant into a v3 supervisor request and denies its omission', () => {
 const input:any = {executionManifest:{version:'factory-execution-manifest/v3'},profileAdmittedAt:1234};
 expect(dockerSupervisorConfig(input).profileAdmittedAt).toBe(1234);
 for(const value of [undefined,0,NaN]) expect(()=>dockerSupervisorConfig({...input,profileAdmittedAt:value})).toThrow('governed profile admission');
});

it.runIf(process.env.MC_DOCKER_QUALIFICATION === '1')('recovers a REQUESTED journal after the Docker create reply is lost, without adopting another lease', async () => {
  const p = profile();
  Object.assign(p, { provider: 'DOCKER', providerProfile: DOCKER_PROVIDER_ID, providerProfileVersion: '1', machine: { image: DOCKER_CANDIDATE_IDENTITY.image, cpu: 1, memoryMb: 512, diskGb: 5 } });
  p.supervisor.transport = 'DOCKER_STDIN'; p.credentials.inference = 'NONE'; p.network.egress = 'RESTRICTED_ALLOWLIST';
  const provider = new DockerSandboxProvider(DOCKER_CANDIDATE_IDENTITY);
  const allocation = await provider.allocate({ ...request, projectId: 'fixture-project', workOrderId: 'fixture-wo', workflowRunId: 'fixture-run', attemptId: 'fixture-attempt', sourceSha: 'a'.repeat(40), profile: p, requestedAt: Date.now() });
  const journal: any = { provider: 'DOCKER', resourceName: request.resourceName, state: 'REQUESTED', profileSnapshot: p, attemptLeaseId: request.attemptLeaseId, manifestDigest: request.manifestDigest };
  try {
    await expect(new DockerSandboxProvider(DOCKER_CANDIDATE_IDENTITY).terminate({ ...journal, attemptLeaseId: 'another-lease' })).rejects.toThrow('ownership');
    expect((await provider.inspect(allocation)).state).toBe('READY');
    const recovered = await new DockerSandboxProvider(DOCKER_CANDIDATE_IDENTITY).terminate(journal);
    expect(recovered.providerResourceId).toBe(allocation.providerResourceId);
    expect(recovered.allocationRecoveryProof?.attemptLeaseId).toBe(request.attemptLeaseId);
    await expect(new DockerSandboxProvider(DOCKER_CANDIDATE_IDENTITY).terminate(journal)).rejects.toThrow('creation outcome remains unknown');
    await expect(new DockerSandboxProvider({ ...DOCKER_CANDIDATE_IDENTITY, socketPath: '/tmp/fdlc-nonexistent-docker.sock' }).terminate(journal)).rejects.toThrow();
    if (process.env.MC_DOCKER_EVIDENCE) {
      const { writeFile } = await import('node:fs/promises');
      await writeFile(process.env.MC_DOCKER_EVIDENCE.replace('.json', '-request-recovery.json'), JSON.stringify({ fixtureOnly: true, providerCalls: 0, recovered, missingIdRemainsUnresolved: true }, null, 2));
    }
  } finally { await new DockerSandboxProvider(DOCKER_CANDIDATE_IDENTITY).terminate(allocation); }
}, 30_000);
