import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { canonicalHash } from '@mission-control/shared';
import { it, expect, vi } from 'vitest';
import { FactoryAttemptWorker, DEFAULT_DEPENDENCIES } from '../factoryAttemptWorker.js';
import { CodexV1ExecutorAdapter } from '../codexExecutorAdapter.js';
import { DockerSandboxProvider, DOCKER_CANDIDATE_IDENTITY, DOCKER_PROVIDER_ID } from '../dockerSandboxProvider.js';
import { profile, executionManifest } from './fixtures/remoteWorkerFixture.js';
const exec = promisify(execFile);

it.runIf(process.env.MC_DOCKER_QUALIFICATION === '1').each(['result', 'cancel', 'timeout', 'startup-failure', 'budget-denial', 'cleanup-failure'] as const)('dispatches through the real Factory worker into hardened Docker: %s and cleanup', async mode => {
  const root = await mkdtemp(path.join(tmpdir(), 'mc-docker-worker-'));
  const prior = process.env.MISSION_CONTROL_SERVICE_COMMAND_SECRET;
  process.env.MISSION_CONTROL_SERVICE_COMMAND_SECRET = 'local-qualification-fixture';
  let worker: FactoryAttemptWorker | undefined;
  let capturedAllocation: any;
  try {
    const git = (args: string[]) => exec('git', args, { cwd: root });
    await git(['init', '-b', 'main']);
    await git(['config', 'user.name', 'Qualification Fixture']); await git(['config', 'user.email', 'fixture@example.test']);
    await git(['remote', 'add', 'origin', 'https://github.com/qualification/disposable.git']);
    await mkdir(path.join(root, 'src')); await writeFile(path.join(root, 'src/fixture.txt'), 'unchanged\n');
    await git(['add', '.']); await git(['commit', '-m', 'Disposable qualification baseline']);
    const sourceSha = (await git(['rev-parse', 'HEAD'])).stdout.trim();
    const identity = mode === 'startup-failure' ? { ...DOCKER_CANDIDATE_IDENTITY, image: `mission-control/factory-docker-qualification@sha256:${'0'.repeat(64)}` } : DOCKER_CANDIDATE_IDENTITY;
    const p = profile();
    Object.assign(p, { provider: 'DOCKER', providerProfile: DOCKER_PROVIDER_ID, providerProfileVersion: '1', machine: { image: identity.image, cpu: 1, memoryMb: 512, diskGb: 5 } });
    p.supervisor.transport = 'DOCKER_STDIN'; p.credentials.inference = 'NONE'; p.network.egress = 'RESTRICTED_ALLOWLIST';
    if (mode === 'timeout' || process.env.MC_DOCKER_DEATH_CHILD) p.runtime.maxRuntimeMs = 5_000;
    const worktree = path.join(root, '.mission-control/worktrees/probe');
    const manifest = executionManifest(p, sourceSha, worktree);
    manifest.harness.modelRouteSnapshot.runtimeIdentity.imageDigest = identity.image.split("@")[1];
    manifest.sandbox.credentialGrants = [];
    const digest = `sha256:${canonicalHash(manifest)}`;
    const run = { _id: 'offline-workflow', runId: 'factory-run-remote', projectId: 'project-1', repositoryId: 'repository-1', factoryDefinitionVersionId: 'factory-version-1', executionManifestDigest: digest, executionManifest: manifest, executorAdapter: 'codex', executorVersion: 'v1', status: 'PENDING' };
    const reports: any[] = [];
    let claimed = false;
    const client = {
      query: vi.fn(async (_q, args) => args.status === 'PENDING' && !claimed ? [run] : []),
      action: vi.fn(async (action, command) => {
        const payload = JSON.parse(command.payloadJson);
        if (action === 'serviceCommands:listFactorySandboxReconcileCandidates') return mode === 'cleanup-failure' && reports.some(r=>r?.terminal) && capturedAllocation ? [{allocation:{...capturedAllocation,profileSnapshot:p,workflowRunId:run._id},attemptLeaseCurrent:false}] : [];
        if (action === 'serviceCommands:reportFactorySandboxReconcile') { reports.push({reconciliation:payload}); return {accepted:true}; }
        if (action === 'serviceCommands:claimFactoryAttempt') {
          claimed = true;
          return { ...run, claimed: true, workflowRunId: run._id, workOrderId: 'work-order-1', checkoutRoot: root, worktree, branch: 'mc/docker-fixture', defaultBranch: 'main', repository: 'qualification/disposable', providerRepositoryId: '101', installation: { appId: '202', installationId: '303' }, lease: { leaseId: payload.leaseId, ownerId: 'factory-execution-worker', workerId: 'docker-qualification-worker', workerSessionId: 'docker-qualification-session', workerGeneration: 7, claimedAt: Date.now(), heartbeatAt: Date.now(), expiresAt: Date.now() + 120_000 } };
        }
        if (action === 'serviceCommands:renewFactoryAttempt') return { renewed: true };
        if (action === 'serviceCommands:authorizeFactoryPublication') throw new Error('Publication forbidden in qualification');
        reports.push(payload.packet); return { accepted: true };
      }),
    } as any;
    const adapter = new CodexV1ExecutorAdapter();
    const original = adapter.createRemoteInvocation.bind(adapter);
    if (mode !== 'budget-denial' && mode !== 'cleanup-failure') adapter.createRemoteInvocation = (request, context) => ({ ...original(request, context), command: 'node', args: ['/opt/factory/qualification.mjs'] });
    const provider = new DockerSandboxProvider(identity);
    const allocate = provider.allocate.bind(provider); provider.allocate = async request => { capturedAllocation = await allocate(request); return capturedAllocation; };
    if (mode === 'cleanup-failure') { const terminate = provider.terminate.bind(provider); let failed = false; provider.terminate = async allocation => { if (!failed) {failed = true; throw new Error('Fixture teardown transport unavailable');} return terminate(allocation); }; }
    const start = provider.start.bind(provider);
    provider.start = async request => { const receipt = await start(request); if (process.env.MC_DOCKER_DEATH_CHILD) { await writeFile(process.env.MC_DOCKER_DEATH_CHILD, JSON.stringify(request.allocation)); await new Promise(resolve => setTimeout(resolve, 500)); process.kill(process.pid, 'SIGKILL'); } if (mode === 'cancel') setTimeout(() => { void worker?.stop(); }, 100); return receipt; };
    const broker = { mint: vi.fn(() => { throw new Error('Credential mint forbidden'); }), revoke: vi.fn() };
    worker = new FactoryAttemptWorker(client, adapter, true, 60_000, { ...DEFAULT_DEPENDENCIES, getGithubAppId: () => undefined, loadGithubAppPrivateKey: () => undefined, createSandboxProvider: () => provider, createSandboxCredentialBroker: () => broker as any }, { projectId: 'project-1', repositoryId: 'repository-1' }, { workerId: 'docker-qualification-worker', sessionId: 'docker-qualification-session', maxConcurrentRuns: 1 });
    await worker.tick();
    await vi.waitFor(() => expect(reports.some(r => r?.terminal)).toBe(true), { timeout: 60_000, interval: 250 });
    const result = reports.find(r => r?.sandbox?.operation === 'RESULT')?.sandbox;
    const evidence = { schema: 'factory-docker-worker-qualification/v1', image: DOCKER_CANDIDATE_IDENTITY.image, sourceSha, fixtureOnly: true, reports, worker: worker.status() };
    if (process.env.MC_DOCKER_EVIDENCE) await writeFile(mode === 'result' ? process.env.MC_DOCKER_EVIDENCE : process.env.MC_DOCKER_EVIDENCE.replace('.json', `-${mode}.json`), JSON.stringify(evidence, null, 2) + '\n');
    expect(broker.mint).not.toHaveBeenCalled();
    if (mode === 'startup-failure') { expect(reports.some(r => r?.sandbox?.operation === 'RESULT')).toBe(false); expect(reports.at(-1)?.terminal?.status).toBe('FAILED'); return; }
    if (mode === 'cleanup-failure') {
      expect(reports.at(-1)?.terminal?.status).toBe('FAILED');
      expect(JSON.stringify(reports)).toContain('CLEANUP');
      const recovery = new FactoryAttemptWorker(client, adapter, true, 60_000, { ...DEFAULT_DEPENDENCIES, createSandboxProvider: () => new DockerSandboxProvider(identity), createSandboxCredentialBroker: () => broker as any }, { projectId: 'project-1', repositoryId: 'repository-1' }, { workerId: 'docker-qualification-worker', sessionId: 'recovery-session', maxConcurrentRuns: 1 });
      try { await recovery.tick(); expect(recovery.status().cleanupHealth?.reconciled).toBe(1); expect(reports.some(r=>r?.reconciliation?.termination?.resourceAbsent)).toBe(true); }
      finally { await recovery.stop(); }
      if (process.env.MC_DOCKER_EVIDENCE) await writeFile(process.env.MC_DOCKER_EVIDENCE.replace('.json','-cleanup-recovery.json'),JSON.stringify({schema:'factory-docker-cleanup-recovery/v1',fixtureOnly:true,providerCalls:0,reports},null,2));
      return;
    }
    expect(reports.some(r => r?.sandbox?.operation === 'TERMINATED' && r.sandbox.receipt.resourceAbsent)).toBe(true);
    if (mode === 'budget-denial') { expect(reports.at(-1)?.terminal?.remoteFailure?.code).toBe('DOCKER_BUDGET_DENIED'); expect(reports.some(r => r?.sandbox?.operation === 'RESULT')).toBe(false); return; }
    if (mode === 'timeout') { expect(reports.some(r => r?.sandbox?.operation === 'RESULT')).toBe(false); expect(reports.at(-1)?.terminal?.status).toBe('FAILED'); expect(JSON.stringify(reports)).toMatch(/TIMEOUT|deadline|timeout/i); return; }
    if (mode === 'cancel') { expect(reports.some(r => r?.sandbox?.operation === 'RESULT')).toBe(false); return; }
    expect(reports.some(r => r?.sandbox?.operation === 'RESULT')).toBe(true);
    const summary = reports.flatMap(r => r?.artifacts ?? []).map(a => a.description).find(d => d?.includes('factory-docker-probes/v1'));
    expect(summary).toBeDefined();
    expect(JSON.parse(summary).checks).toHaveLength(27);
    expect(new Set(JSON.parse(summary).checks.map((c: { name: string }) => c.name)).size).toBe(27);
    expect(JSON.parse(summary).checks.every((c: { passed: boolean }) => c.passed)).toBe(true);
    expect(reports.at(-1)?.terminal?.status).toBe('FAILED');
    expect(result).toBeDefined();
  } finally {
    await worker?.stop(); if (capturedAllocation) await new DockerSandboxProvider(DOCKER_CANDIDATE_IDENTITY).terminate(capturedAllocation); await rm(root, { recursive: true, force: true });
    if (prior === undefined) delete process.env.MISSION_CONTROL_SERVICE_COMMAND_SECRET; else process.env.MISSION_CONTROL_SERVICE_COMMAND_SECRET = prior;
  }
}, 90_000);

// A separate Vitest worker process owns the actual FactoryAttemptWorker and is
// killed after start. Its shutdown handlers cannot perform cleanup.
it.runIf(process.env.MC_DOCKER_QUALIFICATION === '1' && !process.env.MC_DOCKER_DEATH_CHILD)('reconciles Docker after actual worker process death', async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'mc-worker-death-'));
 const allocationFile=path.join(root,'allocation.json');
 let allocation:any;
 try {
  const child=await exec('pnpm',['exec','vitest','run','src/__tests__/dockerFactoryWorker.test.ts','-t','hardened Docker: result'],{env:{...process.env,MC_DOCKER_DEATH_CHILD:allocationFile,MC_DOCKER_EVIDENCE:''},timeout:30000,maxBuffer:1024*1024}).then(()=>({failed:false}),()=>({failed:true}));
  expect(child.failed).toBe(true);
  allocation=JSON.parse(await readFile(allocationFile,'utf8'));
  let running=true;
  await vi.waitFor(async()=>{const result=await exec(DOCKER_CANDIDATE_IDENTITY.dockerPath,['--host',`unix://${DOCKER_CANDIDATE_IDENTITY.socketPath}`,'inspect','--format','{{.State.Running}}',allocation.providerResourceId]);running=result.stdout.trim()==='true';expect(running).toBe(false);},{timeout:15000,interval:500});
  const recovered=new DockerSandboxProvider(DOCKER_CANDIDATE_IDENTITY);
  const receipt=await recovered.terminate(allocation);expect(receipt.resourceAbsent).toBe(true);
  if(process.env.MC_DOCKER_EVIDENCE)await writeFile(process.env.MC_DOCKER_EVIDENCE.replace('.json','-worker-death.json'),JSON.stringify({schema:'factory-docker-worker-death/v1',fixtureOnly:true,providerCalls:0,workerProcessKilled:true,containerStoppedWithoutWorker:true,allocation,receipt},null,2));
 } finally {if(allocation)await new DockerSandboxProvider(DOCKER_CANDIDATE_IDENTITY).terminate(allocation);await rm(root,{recursive:true,force:true});}
},60000);
