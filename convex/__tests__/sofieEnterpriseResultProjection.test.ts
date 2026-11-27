import { createHash } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import { projectEnterpriseResult } from '../lib/sofieEnterpriseResult';
import { enterpriseDigest } from '../../packages/shared/src/sofieEnterprise';
import { getCurrentVerificationRoutingOutcome } from '../lib/currentVerification';
// These tests isolate response projection after trusted gate/accounting decisions;
// they do not qualify execution, accounting, or independent evidence custody.
vi.mock('../lib/currentVerification', () => ({ getCurrentVerificationRoutingOutcome: vi.fn() }));
vi.mock('../lib/enterpriseAttemptAccounting', () => ({ scopeAttemptExposures: () => [0, 0] }));
const digest = 'sha256:' + '1'.repeat(64);
function fixture() {
  const scope = { tenantId: 'tenant', projectId: 'project', missionId: 'mission' };
  const owner = { _id: 'owner', active: true, tenantId: 'tenant', authId: 'user_Owner123' };
  const mission = { ...scope, _id: 'mission', ownerOperatorId: 'owner', currentPlanId: 'plan', state: 'AWAITING_ACCEPTANCE' };
  const workOrder = { ...scope, _id: 'work', missionPlanId: 'plan', missionPlanRevision: 1, state: 'DONE', currentRevisionId: 'revision', currentRevisionNumber: 1,
    qualityContractDigest: digest, verificationContractDigest: digest, verificationContract: { schemaVersion: 2, enforcementMode: 'ENFORCED' }, metadata: { missionBlueprintId: 'blueprint' } };
  const assertion = { ...scope, _id: 'assertion', assertionId: 'check', status: 'PASS', requiresIndependentValidation: true,
    validatorWorkflowRunId: 'verifier', verificationReceiptId: 'receipt', linkedWorkOrderIds: ['work'] };
  const plan = { ...scope, _id: 'plan', revisionNumber: 1, qualityContractDigest: digest, approvedBy: 'owner', status: 'APPROVED',
    decidedActorSource: 'AUTHENTICATED', approvedAt: 1, releasedWorkOrderIds: ['work'], workOrderBlueprints: [{ id: 'blueprint' }], assertions: [{ assertionId: 'check' }] };
  const source = { ...scope, _id: 'source', workOrderId: 'work', workOrderRevisionId: 'revision', status: 'COMPLETED', executorInvocationId: 'producer-invocation', factoryDefinitionVersionId: 'producer-factory',
    executionCostAuthorization: { enterprise: { ownerId: 'owner', provider: 'isolated-container', factoryVersion: 'producer-version', digest } },
    enterpriseSettlement: { basis: 'DETERMINISTIC_ENGINEERING_ZERO_CHARGE', digest, proofDigest: digest, nativeUsage: { runtimeImage: digest } } };
  const verifier = { ...scope, _id: 'verifier', headSha: 'candidate', workOrderId: 'work', workOrderRevisionId: 'revision', status: 'COMPLETED', executorInvocationId: 'verifier-invocation', factoryDefinitionVersionId: 'verifier-factory',
    factoryConfigurationDigest: 'verifier-version', enterpriseSettlement: { digest } };
  const receipt = { ...scope, _id: 'receipt', workOrderId: 'work', evidenceEnvelopeIds: ['evidence'], validUntil: Date.now() + 60000,
    status: 'PASSED', validationAssertionId: 'assertion', acceptanceCriterionId: 'check', sourceAttemptId: 'source', verificationAttemptId: 'verifier',
    workflowRunId: 'verifier', workOrderRevisionNumber: 1, verificationRunId: 'verification-run', verificationPlanDigest: digest, verificationContractDigest: digest, candidateRevision: 'candidate' };
  const artifact = { ...scope, _id: 'artifact', workOrderId: 'work', workflowRunId: 'source' };
  const evidence = { ...scope, _id: 'evidence', workOrderId: 'work', sourceAttemptId: 'source', verificationAttemptId: 'verifier' };
  const handoff = { ...scope, _id: 'handoff', workOrderId: 'work', workflowRunId: 'source', outcome: 'COMPLETE', artifactIds: ['artifact'], createdAt: 1, incompleteAssertionIds: [], unknownAssertionIds: [] };
  const rows: any = { owner, mission, plan, source, verifier, receipt, artifact, evidence };
  const tables: any = { workOrders: [workOrder], validationAssertions: [assertion], missionHandoffs: [handoff] };
  const ctx: any = { db: { get: async (id: string) => rows[id] ?? null, query: (table: string) => { const q = { withIndex: () => q, order: () => q, take: async () => tables[table] ?? [] }; return q; } } };
  const connection: any = { ...scope, ownerId: 'owner', expiresAt: Date.now() + 60000, resultScope: { missionId: 'mission', planId: 'plan', planRevision: 1, planDigest: enterpriseDigest(plan) } };
  vi.mocked(getCurrentVerificationRoutingOutcome).mockResolvedValue({ eligible: true, current: true, verifiedOutcome: 'SUCCESS', sourceAttemptId: 'source', verificationAttemptId: 'verifier', verificationReceiptId: 'receipt',
    evidenceSetDigest: digest, candidateRevision: 'candidate', verificationRunId: 'verification-run', verificationPlanDigest: digest } as any);
  return { rows, run: () => projectEnterpriseResult(ctx, connection, 'mission' as any, connection.resultScope.planDigest) };
}
beforeEach(() => vi.clearAllMocks());
it('emits a complete producer/verifier projection after successful trusted decisions', async () => {
  const result = await fixture().run();
  expect(result.status).toBe('AVAILABLE');
  expect(result.workOrders[0]).toMatchObject({ factoryDefinitionVersionId: 'producer-factory', verifierInvocationId: 'verifier-invocation', runtimeImage: digest, verifierSettlementDigest: digest });
});
for (const [name, change] of [
  ['missing producer factory', (r: any) => { delete r.source.factoryDefinitionVersionId; }],
  ['missing verifier invocation', (r: any) => { delete r.verifier.executorInvocationId; }],
  ['missing verifier factory', (r: any) => { delete r.verifier.factoryDefinitionVersionId; }],
  ['missing verifier version', (r: any) => { delete r.verifier.factoryConfigurationDigest; }],
  ['missing runtime image', (r: any) => { delete r.source.enterpriseSettlement.nativeUsage; }],
  ['missing verifier settlement', (r: any) => { delete r.verifier.enterpriseSettlement; }],
  ['same execution invocation', (r: any) => { r.verifier.executorInvocationId = r.source.executorInvocationId; }],
] as const) it(`returns honest unavailability for ${name}, never a malformed AVAILABLE response`, async () => {
  const f = fixture(); change(f.rows); const result = await f.run();
  expect(result.status).toBe('NOT_AVAILABLE');
  expect(result.reasons).toContain('RESULT_PROJECTION_INCOMPLETE');
  expect(result.workOrders).toEqual([]);
});

function delegatedFixture() {
  const f = fixture(), r = f.rows;
  r.source.executionCostAuthorization.enterprise.provider = 'local-docker';
  const signed = { execution: { factoryVersion: 'producer-version' }, candidate: { commit: 'candidate' },
    localExecution: { ownerScope: 'owner', producerAllocation: 'producer-invocation', verifierAllocation: 'verifier-invocation' } };
  const bytes = Buffer.from(JSON.stringify(signed));
  const proofDigest = 'sha256:' + createHash('sha256').update(bytes).digest('hex');
  r.source.enterpriseSettlement.proofDigest = proofDigest;
  delete r.source.enterpriseSettlement.nativeUsage;
  r.verifier.enterpriseAccountingParent = { resultDigest: proofDigest };
  delete r.verifier.factoryDefinitionVersionId;
  delete r.verifier.factoryConfigurationDigest;
  delete r.verifier.enterpriseSettlement;
  r.verifier.metadata = { factoryVersion: 'producer-version', producerAllocation: 'producer-invocation', verifierAllocation: 'verifier-invocation', observationOnly: true, evaluationMode: 'IMPORTED_SIGNED_FACTORY_EVIDENCE' };
  r.evidence.metadata = { resultDigest: proofDigest };
  r.artifact.metadata = { authenticatedResponse: { envelope: { payload: { result: { encoded: bytes.toString('base64') } } } } };
  return f;
}
it('retains a complete signed delegated projection with observer verifier identity', async () => {
  const result = await delegatedFixture().run();
  expect(result.status).toBe('AVAILABLE');
  expect(result.workOrders[0]).toMatchObject({ provider: 'local-docker', runtimeImage: null, verifierSettlementDigest: null, verifierFactoryDefinitionVersionId: null, verifierFactoryVersion: 'producer-version' });
});
for (const [name, change] of [
  ['unexpected runtime image', (r: any) => { r.source.enterpriseSettlement.nativeUsage = { runtimeImage: digest }; }],
  ['unexpected verifier settlement', (r: any) => { r.verifier.enterpriseSettlement = { digest }; }],
  ['conflicting verifier factory version', (r: any) => { r.verifier.factoryConfigurationDigest = 'other-version'; }],
] as const) it(`does not emit a malformed delegated Result for ${name}`, async () => {
  const f = delegatedFixture(); change(f.rows); const result = await f.run();
  expect(result.status).toBe('NOT_AVAILABLE');
  expect(result.reasons).toContain('RESULT_PROJECTION_INCOMPLETE');
});
