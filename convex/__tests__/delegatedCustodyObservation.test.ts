import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { canonicalDigest } from '@mission-control/shared';
import { getCurrentVerificationRoutingOutcome } from '../lib/currentVerification';
import { enterpriseDelegationApproval } from '../lib/enterpriseDelegationAdmission';
import { evaluateCurrentVerificationEligibility } from '@mission-control/workflow-engine/verification-currentness';
vi.mock('../lib/nativeQualificationEvidence', () => ({ createNativeQualificationEvidenceChecker: () => async () => false }));
vi.mock('../lib/enterpriseDelegationAdmission', async original => ({ ...await original<any>(), enterpriseDelegationApproval: vi.fn() }));
vi.mock('@mission-control/workflow-engine/verification-currentness', async original => ({ ...await original<any>(),
  evaluateCurrentVerificationEligibility: vi.fn(input => input) }));
const retained = JSON.parse(readFileSync(new URL('./fixtures/nativeHybridAuthority.json', import.meta.url), 'utf8'));
let f: any, envelope: any, artifact: any, ctx: any;
beforeEach(() => {
  vi.stubEnv('MC_ENTERPRISE_CANONICAL_ACCOUNTING', '1');
  f = structuredClone(retained); f.mission.ownerOperatorId = f.operator._id; f.run.status = 'COMPLETED';
  const bindingDigest = f.approval.metadata.bindingDigest, resultDigest = 'sha256:' + '1'.repeat(64);
  const observation = { candidateCommit: 'a'.repeat(40), candidateTree: 'b'.repeat(40), observedAt: f.now, expiresAt: f.now + 60000 };
  const scope = { projectId: f.workOrder.projectId, tenantId: f.workOrder.tenantId, workOrderId: f.workOrder._id };
  const trial = { _id: 'trial', ...scope, factoryDefinitionId: f.factory._id, binding: f.binding, bindingDigest,
    registrationDigest: f.factory.enterpriseRegistration.digest, state: 'COMPLETED' };
  const verifier = { _id: 'verifier', ...scope, status: 'COMPLETED', repositoryId: f.binding.repositoryId,
    enterpriseAccountingParent: { workflowRunId: f.run._id, reservationDigest: f.run.executionCostAuthorization.enterprise.digest, bindingDigest, resultDigest } };
  artifact = { _id: 'artifact', ...scope, workflowRunId: f.run._id, contentHash: resultDigest, metadata: {
    authenticatedResponse: { retained: true }, resultDigest, bindingDigest, factoryVersion: f.binding.factoryVersion, custodyObservation: observation } };
  envelope = { _id: 'envelope', ...scope, provenance: 'SYNTHETIC', artifactIds: [artifact._id], sourceAttemptId: f.run._id,
    verificationAttemptId: verifier._id, metadata: { authority: 'ISOLATED_ENTERPRISE_QUALIFICATION', trialId: trial._id,
      bindingDigest, resultDigest, factoryVersion: f.binding.factoryVersion, custodyObservation: observation,
      authenticatedResponseDigest: canonicalDigest('enterprise-authenticated-readback/v1', artifact.metadata.authenticatedResponse) } };
  const rows = [...Object.values(f), trial, verifier, artifact, { _id: f.binding.workOrderRevisionId, status: 'APPLIED' },
    { _id: f.workOrder.projectId, enterpriseAccountingMode: 'ISOLATED_DETERMINISTIC' }].filter((r: any) => r?._id) as any[];
  const tables: any = { workflowRuns: [f.run, verifier], evidenceEnvelopes: [envelope] };
  ctx = { db: { get: async (id: string) => rows.find(r => r._id === id),
    query: (table: string) => ({ withIndex: () => ({ collect: async () => tables[table] ?? [] }) }) } };
  vi.mocked(enterpriseDelegationApproval).mockResolvedValue(f.approval.metadata);
});
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
const run = () => getCurrentVerificationRoutingOutcome(ctx, f.workOrder, f.now, 'ACCEPTANCE', true);
it('passes a valid delegated custody observation to the currentness evaluator', async () => {
  await run();
  const input = vi.mocked(evaluateCurrentVerificationEligibility).mock.calls[0][0];
  expect(input.verificationEvidence).toHaveLength(1);
  expect(input.localCandidateObservations).toHaveLength(1);
  expect(input.localCandidateObservations?.[0].candidateSha).toBe('a'.repeat(40));
});
it.each(['missing envelope', 'both missing', 'both null'])('excludes %s custody without throwing or accepting evidence', async fault => {
  if (fault === 'both null') { envelope.metadata.custodyObservation = null; artifact.metadata.custodyObservation = null; }
  else { delete envelope.metadata.custodyObservation; if (fault === 'both missing') delete artifact.metadata.custodyObservation; }
  await expect(run()).resolves.toBeDefined();
  const input = vi.mocked(evaluateCurrentVerificationEligibility).mock.calls[0][0];
  expect(input.verificationEvidence).toEqual([]);
  expect(input.localCandidateObservations).toEqual([]);
});
