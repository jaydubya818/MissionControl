import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';
import { lock } from '../enterprise-golden-journey/evidence.mjs';
import { verifyHostFactoryIdentity } from '../enterprise-golden-journey/host-factory-identity.mjs';
import { canonicalDigest, canonicalHash, factoryDelegationBindingDigest, bindEngineeringTariff } from '@mission-control/shared';
import { LOCAL_PROVIDER_QUALIFICATION_SHA, verifyLocalDelegationResult, verifyLocalCustodyObservation } from '../../apps/orchestration-server/src/myFactoryLocalCompatibility.js';
import { compatibility } from '../enterprise-compatibility/fixtures.mjs';
import { createLocalCompatibilityTransport } from '../enterprise-compatibility/local-transport.mjs';

export async function prepareHybridProvider() {
  const root = resolve(process.env.MC_LOCAL_MYFACTORY_ROOT!);
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  assert.equal(git('rev-parse', 'HEAD'), LOCAL_PROVIDER_QUALIFICATION_SHA); assert.equal(git('status', '--porcelain'), '');
  const load = (file: string) => import(pathToFileURL(resolve(root, file)).href);
  const partner = { ...await load('packages/hosted-routing/src/result.ts'), sourceSha: LOCAL_PROVIDER_QUALIFICATION_SHA };
  const { localFixture, qualifyHost, createLocalFactory } = await load('apps/cloud-control/test/fixtures/local-factory.mjs');
  const { startPostgres } = await load('apps/cloud-control/test/fixtures/local-postgres.mjs');
  const { localSourceIdentity } = await load('apps/cloud-control/src/local-source-identity.mjs');
  const { validateLocalConfiguration, validateLocalHostQualification } = await load('packages/hosted-routing/src/local-provenance.ts');
  const { observeLocalRuntime, localPolicySha256, localHarnessSha256 } = await load('apps/cloud-control/src/local-execution-provider.mjs');
  const f = await localFixture(root);
  const initialConfiguration = structuredClone(f.configuration);
  try {
    await qualifyHost(f);
    assert.equal(git('rev-parse', 'HEAD'), lock.myFactory); assert.equal(git('status', '--porcelain'), '');
    assert.equal(f.sourceDigest, localSourceIdentity(root));
    assert.deepEqual(f.configuration, { ...initialConfiguration, local: { ...initialConfiguration.local,
      hostQualificationSha256: partner.digest(f.hostQualification) } });
    assert.deepEqual(f.runtime, await observeLocalRuntime(lock.providerImage));
    validateLocalConfiguration(f.configuration);
    validateLocalHostQualification(f.configuration.local, f.hostQualification);
    assert.equal(f.configuration.local.policySha256, localPolicySha256);
    assert.equal(f.configuration.local.harnessSha256, localHarnessSha256);
    assert.equal(f.configuration.local.implementationSha256, partner.sha256(await readFile(resolve(root, 'apps/cloud-control/src/local-execution-provider.mjs'))));
    const qualification = { schema: 'golden-host-factory-qualification/v1', sourceSha: lock.myFactory,
      historicalFactoryVersion: lock.factoryVersion, sourceDigest: f.sourceDigest, factoryVersion: f.version(),
      configurationDigest: partner.digest(f.configuration), configurationCanonical: partner.canonical(f.configuration),
      runtimeCanonical: partner.canonical(f.runtime.runtime), hostQualificationCanonical: partner.canonical(f.hostQualification) };
    verifyHostFactoryIdentity(qualification, lock);
    return { f, partner, createLocalFactory, startPostgres, root, qualification };
  } catch (error) { await f.stop(); throw error; }
}

export async function executeHybridDelegation({ provider, db, workOrderId, repositoryId, policyId, dispatchScope, mutate, query, step }: any) {
  const { f, partner, createLocalFactory, startPostgres, root } = provider;
  const s = db.seed, inspect = (id: string) => query('nativeFixture:inspectRecord', { id });
  let wo = await inspect(workOrderId);
  // Same retained commit/tree and immutable local FactoryVersion. Repository
  // alias binds the request to this newly admitted disposable Mission source.
  assert.equal(f.request.repository, 'jaydubya818/MyFactory');
  f.request.deadline = new Date(Date.now() + 175000).toISOString();
  const workflowId = await mutate('workflows:registerProduction', { projectId: s.projectId, workflowId: 'hybrid-delegated',
    name: 'Qualified MyFactory local delegation', description: 'Exact local delegated execution only.', topology: 'LINEAR', maxConcurrency: 1, agents: [{ id: 'delegation-boundary', persona: 'Await authenticated MyFactory Result; no model execution.' }], active: true,
    steps: [{ id: 'delegate', kind: 'GATE', agent: '', retryLimit: 0, timeoutMinutes: 3, input: 'Await exact owner-approved delegated admission and authenticated Factory Result.',
      expects: 'Authenticated Factory Result', outputSchema: { type: 'object', required: ['status'], properties: { status: { type: 'string' } } } }] });
  const definitionId = await mutate('factory/configuration:create', { repositoryId, name: 'Preserved MyFactory local qualification', purpose: 'SOFTWARE', isolatedQualification: true });
  const versionId = await mutate('factory/enterpriseCompatibility:registerLocalVersion', { projectId: s.projectId, factoryDefinitionId: definitionId,
    workflowId, policyEnvelopeId: policyId, sourceDigest: f.sourceDigest, configuration: f.configuration });
  await mutate('factory/enterpriseCompatibility:register', { projectId: s.projectId, factoryDefinitionId: definitionId, config: {
    kind: 'MYFACTORY', factoryId: f.signing.factoryId, factoryVersion: f.version(), definitionVersionId: versionId,
    capabilities: ['BOUNDED_DELEGATION', 'SIGNED_RESULT'], capacity: 1, admissionPolicy: 'FIXTURE_ONLY', compatibility,
    executionProvider: 'LOCAL_DOCKER_QUALIFICATION', localProviderSourceSha: LOCAL_PROVIDER_QUALIFICATION_SHA } });
  await mutate('factory/enterpriseCompatibility:assess', { projectId: s.projectId, factoryDefinitionId: definitionId,
    expectedRevision: 1, health: 'HEALTHY', evidenceDigest: canonicalDigest('local-host-qualification/v1', f.hostQualification),
    validUntil: Date.parse(f.request.deadline), revoke: false });
  const checkIds = f.policy.checks.map((c: any) => c.id);
  const verificationContract = { ...wo.verificationContract, requireHumanReview: false,
    requiredRisks: wo.verificationContract.requiredRisks.map((risk: any) => ({ ...risk, requiredEvidenceIds: checkIds })),
    checks: checkIds.map((id: string) => ({ id, name: id, category: 'UNIT_TEST', verifierId: 'delegated-local', mandatory: true,
      acceptanceCriterionIds: wo.acceptanceCriteria.map((c: any) => c.id), evidenceCategory: 'TEST_RESULT' })) };
  const revision = await mutate('workOrders:requestWorkOrderRevision', { workOrderId, idempotencyKey: 'hybrid-delegation-contract',
    changeSummary: 'Bind preserved MyFactory protected checks and exact delegated allowance.', reason: 'Isolated canonical hybrid qualification.',
    patch: { workflowId: 'hybrid-delegated', verificationContract, requiredApprovals: ['HUMAN_REVIEW'],
      changeBudget: { ...wo.changeBudget, allowedPaths: f.request.input.allowedPaths, maxFilesChanged: 1, maxLinesChanged: 100 },
      metadata: { ...wo.metadata, implementationPolicy: { ...wo.metadata.implementationPolicy, timeoutMinutes: 3, maxAttempts: 1, maxCostUsd: 0.00008 } } } });
  if (revision.revision.status === 'PENDING_APPROVAL') await mutate('workOrders:approveWorkOrderRevision', { workOrderRevisionId: revision.revision._id });
  const scopeApproval = await mutate('workOrders:requestApprovalDecision', { workOrderId, approvalType: 'HUMAN_REVIEW',
    requestedAction: 'Approve this exact isolated delegated WorkOrder revision.', idempotencyKey: 'hybrid-delegated-scope', expiresAt: Date.parse(f.request.deadline) });
  await mutate('workOrders:decideApprovalDecision', { approvalDecisionId: scopeApproval.approvalDecision._id, decision: 'APPROVE', reason: 'Approved exact deterministic local scope; no publication or production authority.' });
  const task = await mutate('tasks:create', { projectId: s.projectId, workOrderId, title: 'Execute exact local MyFactory delegation', type: 'ENGINEERING', priority: 3,
    source: 'DASHBOARD', createdBy: 'HUMAN', createdByRef: 'user_SyntheticHandoffQualification', idempotencyKey: 'hybrid-delegated-task' });
  for (const toStatus of ['ASSIGNED', 'READY']) {
    const transitioned = await mutate('tasks:transition', { projectId: s.projectId, taskId: task.task._id, toStatus, actorType: 'HUMAN',
      actorUserId: 'user_SyntheticHandoffQualification', reason: 'Ready for bounded isolated delegation.', idempotencyKey: 'hybrid-delegated-task-' + toStatus });
    assert.equal(transitioned.success, true);
  }
  const dispatchArgs = { ...dispatchScope, workOrderId, taskId: task.task._id, workflowId: 'hybrid-delegated',
    factoryDefinitionVersionId: versionId, isolatedLocalDelegation: true, idempotencyKey: 'hybrid-delegated-dispatch' };
  const dispatch = await step('delegatedCanonicalDispatch', () => mutate('workOrders:dispatch', dispatchArgs));
  assert.equal(dispatch.created, true); assert.equal(dispatch.run.executionCostAuthorization, undefined);
  const run = dispatch.run; wo = await inspect(workOrderId);
  const mission = await inspect(wo.missionId), plan = await inspect(wo.missionPlanId), request = f.request;
  const now = Date.now();
  const rawBinding = { schema: 'factory-delegation-binding/v1', delegationId: 'hybrid-' + randomUUID(), tenantId: s.tenantId, projectId: s.projectId,
    missionId: mission._id, missionSpecRevisionId: mission.currentSpecRevisionId, missionPlanId: plan._id, missionPlanRevision: plan.revisionNumber,
    missionPlanDigest: canonicalDigest('mission-plan-fixture/v1', { revision: plan.revisionNumber, summary: plan.summary, blueprints: plan.workOrderBlueprints, assertions: plan.assertions ?? [] }),
    workOrderId, workOrderRevisionId: wo.currentRevisionId, workOrderRevisionNumber: wo.currentRevisionNumber, taskId: task.task._id, workflowRunId: run._id,
    executionManifestDigest: run.executionManifestDigest, qualityContractDigest: wo.qualityContractDigest, authorityGeneration: 1,
    factoryId: f.signing.factoryId, factoryVersion: f.version(), executionProtocol: 'MYFACTORY_EXECUTION_V2', clientId: 'missioncontrol-local', ownerScope: s.operatorId,
    partnerWorkId: request.workId, partnerWorkGeneration: 1, partnerRequestId: request.requestId, partnerRequestDigest: partner.digest(request),
    repositoryId, repository: request.repository, baseCommit: request.source.commit, baseTree: request.source.tree,
    sourceSnapshotDigest: canonicalDigest('factory-fixture-source/v1', request.source), executionProfileDigest: 'sha256:' + partner.digest(f.configuration),
    modelPolicyDigest: canonicalDigest('factory-fixture-model/v1', { model: f.configuration.model, evidenceClass: 'DETERMINISTIC' }),
    verificationPolicyDigest: 'sha256:' + partner.digest(f.policy), allowedEffects: ['repository.read', 'sandbox.write', 'candidate.create', 'verification.request'],
    budgetReservationId: '', maxSpendMicrousd: 80, issuedAt: now - 1000, expiresAt: Date.parse(request.deadline), deadline: Date.parse(request.deadline) };
  rawBinding.budgetReservationId = rawBinding.delegationId;
  const { binding: b, tariff } = bindEngineeringTariff(rawBinding as any, Date.now()), bindingDigest = factoryDelegationBindingDigest(b);
  const verificationSpec = { id: workOrderId, revisionNumber: wo.currentRevisionNumber, title: wo.title, requirements: wo.requirements,
    riskLevel: wo.riskLevel, riskReasons: wo.riskReasons, requiredApprovals: wo.requiredApprovals,
    acceptanceCriteria: wo.acceptanceCriteria.map(({ status, ...criterion }: any) => criterion), negativeConstraints: wo.negativeConstraints,
    changeBudget: wo.changeBudget, verificationContract: wo.verificationContract };
  const approval = await mutate('workOrders:requestApprovalDecision', { workOrderId, workflowRunId: run._id, approvalType: 'DELEGATION_EXECUTION',
    requestedAction: 'Approve exact authenticated delegation, tariff and verifier contract.', expiresAt: b.expiresAt,
    idempotencyKey: b.delegationId + ':approval', metadata: { schema: 'enterprise-delegation-approval/v1', bindingDigest,
      planDigest: `sha256:${canonicalHash(plan)}`, ownerActorId: s.operatorId, leaseId: randomUUID(), tariff, verificationSpec,
      checkIdsDigest: canonicalDigest('enterprise-check-ids/v1', checkIds) } });
  await mutate('workOrders:decideApprovalDecision', { approvalDecisionId: approval.approvalDecision._id, decision: 'APPROVE',
    reason: 'Approve only these exact ephemeral local delegation identities and zero-charge engineering tariff.' });
  const mut = (name: string, args: any, client = db.owner) => mutate('factory/enterpriseCompatibility:' + name, { projectId: s.projectId, ...args }, client);
  const read = (name: string, args: any) => query('factory/enterpriseCompatibility:' + name, { projectId: s.projectId, ...args });
  for (const client of [db.peer, db.other, db.anonymous]) await assert.rejects(() => mut('admitTrial', { missionId: mission._id, factoryDefinitionId: definitionId, binding: b }, client));
  const checks: string[] = [];
  async function deniedFault(name: string, id: string, patch: any, action: () => Promise<any>) {
    const original = await inspect(id);
    await mutate('nativeFixture:fault', { id, patch });
    try { await assert.rejects(action); checks.push(name); }
    finally {
      const restore = Object.fromEntries(Object.keys(patch).filter(k => original[k] !== undefined).map(k => [k, original[k]]));
      await mutate('nativeFixture:fault', { id, patch: restore, unset: Object.keys(patch).filter(k => original[k] === undefined) });
    }
  }
  const admission = () => mut('admitTrial', { missionId: mission._id, factoryDefinitionId: definitionId, binding: b });
  const version = await inspect(versionId), workflow = await inspect(workflowId);
  await deniedFault('wrong-execution-profile', versionId, { executionProfileDigest: 'sha256:' + '0'.repeat(64) }, admission);
  await deniedFault('changed-workflow', workflowId, { description: workflow.description + ' changed' }, admission);
  await deniedFault('changed-plan', plan._id, { summary: plan.summary + ' changed' }, admission);
  await deniedFault('revoked-exact-approval', approval.approvalDecision._id, { revokedAt: Date.now() }, admission);
  await deniedFault('stale-workorder', workOrderId, { currentRevisionNumber: wo.currentRevisionNumber + 1 }, admission);
  const trialId = await step('delegatedAdmission', () => mut('admitTrial', { missionId: mission._id, factoryDefinitionId: definitionId, binding: b }));
  assert.equal(await mut('admitTrial', { missionId: mission._id, factoryDefinitionId: definitionId, binding: b }), trialId);
  await step('delegatedAuthorityRecords', async () => ({ now: Date.now(), binding: b, run: await inspect(run._id), workOrder: await inspect(workOrderId),
    plan: await inspect(plan._id), mission: await inspect(mission._id), version: await inspect(versionId), factory: await inspect(definitionId),
    workflow: await inspect(workflowId), policy: await inspect(policyId), repository: await inspect(repositoryId),
    approval: await inspect(approval.approvalDecision._id), operator: await inspect(s.operatorId), member: await inspect(s.memberId) }));
  await deniedFault('changed-source-mapping', run._id, { executionManifest: { ...run.executionManifest, delegatedSourceRepository: 'other/repository' } }, admission);
  const claim = () => mut('claimTrial', { trialId });
  const policy = await inspect(policyId);
  await deniedFault('revoked-policy-after-reservation', policyId, { active: false }, claim);
  await deniedFault('changed-policy-after-reservation', policyId, { rules: { ...policy.rules, maxResourceCostUsd: 2 } }, claim);
  await deniedFault('expired-exact-approval', approval.approvalDecision._id, { expiresAt: Date.now() - 1 }, claim);
  assert.equal(await mut('claimTrial', { trialId }), true); assert.equal(await mut('claimTrial', { trialId }), false);
  f.executionBinding = { ownerScope: b.ownerScope, delegationDigest: bindingDigest.slice(7), repository: b.repository, sourceSnapshotSha256: partner.digest(request.source) };
  const pg = await startPostgres(root); let wire: any;
  try {
    const authority = () => read('assertExecutionAuthority', { trialId });
    const factory = await createLocalFactory(f, pg.pool, authority);
    wire = await createLocalCompatibilityTransport({ b, bindingDigest, factory, authority }, { canonicalAccounting: true, partner });
    await assert.rejects(async () => { try { await wire.call('ADMIT', request); } catch (error) { if (wire.admissions === 0) { console.error('ADMISSION_FAILED', String(error)); } throw error; } });
    assert.equal(wire.admissions, 1, 'Actual admission must precede the injected lost acknowledgement');
    const prepared = await wire.call('STATUS', { requestId: request.requestId });
    await mut('observeTrial', { trialId, revision: 1, state: 'PREPARED', partnerRunId: prepared.runId, partnerWorkOrderId: prepared.workOrderId,
      receiptDigest: canonicalDigest('hybrid-status/v1', prepared) });
    const identity = factory.identity(prepared); await factory.control.dispatch(identity); await factory.execute(identity);
    const result = await wire.call('RESULT', { requestId: request.requestId });
    await mut('observeTrial', { trialId, revision: 2, state: result.state, partnerRunId: prepared.runId, partnerWorkOrderId: prepared.workOrderId,
      receiptDigest: canonicalDigest('hybrid-terminal/v1', { state: result.state, runId: prepared.runId }) });
    const reserved = await inspect(run._id);
    const projection = verifyLocalDelegationResult(result.result, b, partner, { workOrderId: prepared.workOrderId, runId: prepared.runId,
      keys: [f.signing.key], now: Date.now(), tariff, admittedAt: reserved.executionCostAuthorization.enterprise.authorizedAt });
    const verified = partner.verifyResult(result.result, { factoryId: b.factoryId, factoryVersion: b.factoryVersion,
      requestId: b.partnerRequestId, workOrderId: prepared.workOrderId, runId: prepared.runId, keys: [f.signing.key], now: Date.now(),
      localProvider: { provider: 'local-docker', ownerScope: b.ownerScope, delegationDigest: bindingDigest.slice(7) } }).manifest.execution;
    const verifiedExecutionIdentity = { factoryVersion: verified.factoryVersion, sourceDigest: verified.sourceDigest,
      configurationDigest: verified.configurationDigest, runtimeSha256: verified.configuration.local.runtimeSha256,
      hostQualificationSha256: verified.configuration.local.hostQualificationSha256 };
    verifyHostFactoryIdentity(provider.qualification, lock, b, verifiedExecutionIdentity);
    const delivery = { ...projection, custodyObservation: verifyLocalCustodyObservation(result.observation, projection, b, Date.now()), authenticatedResponse: result.authenticatedResponse };
    const gateId = await mut('ingestExecutionResult', { trialId, ...delivery });
    assert.equal(await mut('ingestExecutionResult', { trialId, ...delivery }), gateId);
    const gate = await step('delegatedEnterpriseGate', () => mutate('factory/enterpriseQualification:evaluate', { workOrderId, idempotencyKey: 'hybrid-delegated-gate' }));
    assert.equal(gate.current.eligible, true, JSON.stringify(gate.current));
    const accepted = await step('delegatedAcceptance', () => mutate('workOrders:accept', { workOrderId, actorType: 'HUMAN',
      isolatedEnterpriseQualification: true, idempotencyKey: 'hybrid-delegated-accept' }));
    assert.equal(accepted.accepted, true, JSON.stringify(accepted));
    const final = await inspect(run._id); assert.ok(final.enterpriseSettlement); assert.equal(final.enterpriseSettlement.chargedMicrousd, 0);
    const artifacts = (await query('nativeFixture:inspect', { table: 'runArtifacts' })).filter((a: any) => a.workflowRunId === run._id);
    return { run: final, workOrderId, trialId, binding: b, gateId, candidateCommit: projection.candidateCommit, candidateTree: projection.candidateTree,
      resultDigest: projection.resultDigest, verifiedExecutionIdentity, artifactIds: artifacts.map((a: any) => a._id), factoryEvidence: factory.evidence, admissionRequests: wire.admissions, authorityControls: checks };
  } finally { if (wire) { wire.server.closeAllConnections(); wire.server.close(); } await pg.stop(); }
}
