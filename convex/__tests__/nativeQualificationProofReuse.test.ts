import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { canonicalDigest, canonicalHash } from '@mission-control/shared';
import { verificationContractDigest } from '@mission-control/workflow-engine/verification-identity';
import { createNativeQualificationEvidenceChecker, nativeQualificationEvidenceIsCurrent } from '../lib/nativeQualificationEvidence';
import { validateNativeExecutedProof } from '../lib/nativeExecutedProof';
import { resolveCurrentAttemptExecutionProfile } from '../lib/attemptExecutionProfile';

// Count the expensive validation boundary. Its real accounting/profile/proof
// semantics are qualified by their own tests and the hosted native control run.
vi.mock('../lib/nativeExecutedProof', () => ({ validateNativeExecutedProof: vi.fn() }));
vi.mock('../lib/attemptExecutionProfile', () => ({ resolveCurrentAttemptExecutionProfile: vi.fn() }));
vi.mock('../lib/localRepositoryAdmission', () => ({ loadLocalRepositoryAdmission: async () => ({ environment: {} }) }));
vi.mock('../lib/factoryQualificationScope', () => ({ assertQualificationActivation: () => {} }));
vi.mock('../lib/factoryWorkflowContract', () => ({ deterministicFactoryVersionIssues: () => [] }));
vi.mock('../lib/enterpriseAttemptAccounting', () => ({ validateReservation: (r: any) => r, attemptExposure: () => 0 }));
const proof = vi.mocked(validateNativeExecutedProof), profile = vi.mocked(resolveCurrentAttemptExecutionProfile);
beforeEach(() => { vi.resetAllMocks(); vi.stubEnv('MC_NATIVE_SUCCESSOR_QUALIFICATION', '1'); });
afterEach(() => { vi.unstubAllEnvs(); });

function fixture() {
  const now = 1000, quality = { exact: 'quality' }, qualityDigest = `sha256:${canonicalHash(quality)}`;
  const scope = { tenantId: 'tenant', projectId: 'project' };
  const specification = { requirements: [], acceptanceCriteria: [], negativeConstraints: [], positiveConstraints: [],
    dataBoundaries: [], requiredApprovals: [], verificationContract: { schemaVersion: 2, enforcementMode: 'ENFORCED' } };
  const wo: any = { ...scope, ...specification, _id: 'wo', missionId: 'mission', missionPlanId: 'plan', missionPlanRevision: 1,
    repositoryId: 'repository', currentRevisionId: 'revision', currentRevisionNumber: 1, approvalStatus: 'APPROVED',
    qualityContractDigest: qualityDigest, verificationContractDigest: verificationContractDigest(specification.verificationContract, qualityDigest) };
  const plan: any = { ...scope, _id: 'plan', status: 'APPROVED', revisionNumber: 1, qualityContractDigest: qualityDigest,
    qualityContractProjection: quality, approvedBy: 'owner', decidedActorSource: 'AUTHENTICATED' };
  const policy = { ...scope, _id: 'policy', active: true };
  const rows: any = { plan, policy, owner: { ...scope, _id: 'owner', active: true },
    mission: { ...scope, _id: 'mission', currentPlanId: 'plan', ownerOperatorId: 'owner' },
    repository: { provider: 'LOCAL', localAdmission: { productionAuthority: 'NONE', publicationAuthority: 'NONE', expiresAt: 10000 } },
    revision: { status: 'APPLIED' }, workflow: { version: 1 } };
  const runs: any[] = ['source', 'verifier'].map((id, index) => {
    rows[`version-${id}`] = { _id: `version-${id}`, factoryDefinitionId: `factory-${id}`, workflowId: 'workflow',
      policyEnvelopeId: 'policy', configurationDigest: 'configuration', executionProfileDigest: 'profile' };
    rows[`factory-${id}`] = { status: 'ACTIVE', activeVersionId: `version-${id}` };
    return { ...scope, _id: id, status: 'COMPLETED', attemptPurpose: index ? 'VERIFICATION' : 'IMPLEMENTATION',
      verificationSubject: { provider: 'LOCAL_GIT', candidateSha: 'candidate', treeSha: 'tree' }, repositoryId: 'repository',
      workOrderRevisionId: 'revision', workOrderRevisionNumber: 1, qualityContractDigest: qualityDigest,
      executionCostAuthorization: { enterprise: { ownerId: 'owner' }, policyEnvelopeDigest: canonicalHash(policy) },
      factoryDefinitionVersionId: `version-${id}`, factoryConfigurationDigest: 'configuration', executionProfileDigest: 'profile',
      executionProfileQualificationSnapshot: { validUntil: 10000 },
      executionManifest: { causation: { missionPlanId: 'plan', missionPlanVersion: 1, missionPlanDigest: `sha256:${canonicalHash(plan)}`,
        factoryConfigurationDigest: 'configuration', factoryDefinitionVersionId: `version-${id}` },
        workOrderSpecification: specification, workflow: { workflowVersion: 1 } },
      enterpriseSettlement: { nativeUsage: { responseArtifactId: `artifact-${id}`, responseDigest: `digest-${id}` }, proofDigest: `digest-${id}` } };
  });
  proof.mockImplementation(async (_ctx, run, _reservation, artifactId) => ({
    artifact: { _id: artifactId, metadata: { disposition: 'CURRENT_AT_INGESTION' } },
    proof: { container: { id: `container-${run._id}` } },
    parsed: { result: { status: 'SUCCESS', completedAt: 900 }, packetDigest: `digest-${run._id}`,
      request: { workload: { reference: 'verify-document-bytes/v1', input: { producerAttemptId: 'source',
        candidateSha: 'candidate', candidateTreeSha: 'tree', subjectDigest: 'subject', verificationPlanDigest: 'verification-plan' } } } },
  } as any));
  const observation = { observedAt: 950, expiresAt: 1500, candidateCommit: 'candidate', candidateTree: 'tree' };
  const envelope: any = { ...scope, provenance: 'SYNTHETIC', independence: { passed: true }, sourceAttemptId: 'source',
    verificationAttemptId: 'verifier', recordedAt: 960, verificationSubjectDigest: 'subject', verificationPlanDigest: 'verification-plan',
    metadata: { authority: 'NONE', evidenceOrigin: 'CONTROL_FIXTURE', serverDerivedIndependence: true,
      nativeCandidateObservation: observation, nativeCandidateObservationDigest: canonicalDigest('native-candidate-observation/v1', observation),
      retainedResponseArtifactId: 'artifact-verifier', retainedResponseDigest: 'digest-verifier' } };
  const ctx: any = { db: { get: async (id: string) => rows[id] } };
  return { ctx, wo, runs, rows, envelope, now, checker: () => createNativeQualificationEvidenceChecker(ctx, wo, runs, now) };
}
it('five envelopes validate two exact run proofs once per gate instead of ten times', async () => {
  const f = fixture();
  for (let i = 0; i < 5; i++) expect(await nativeQualificationEvidenceIsCurrent(f.ctx, f.wo, structuredClone(f.envelope), f.runs, f.now)).toBe(true);
  expect(proof).toHaveBeenCalledTimes(10); expect(profile).toHaveBeenCalledTimes(10);
  proof.mockClear(); profile.mockClear(); const current = f.checker();
  for (let i = 0; i < 5; i++) expect(await current(structuredClone(f.envelope))).toBe(true);
  expect(proof).toHaveBeenCalledTimes(2); expect(profile).toHaveBeenCalledTimes(2);
});
for (const [name, change] of [
  ['wrong source', (e: any) => { e.sourceAttemptId = 'foreign'; }],
  ['wrong verifier', (e: any) => { e.verificationAttemptId = 'foreign'; }],
  ['same attempt', (e: any) => { e.verificationAttemptId = e.sourceAttemptId; }],
  ['wrong tenant', (e: any) => { e.tenantId = 'foreign'; }],
  ['wrong proof artifact', (e: any) => { e.metadata.retainedResponseArtifactId = 'other'; }],
  ['wrong proof digest', (e: any) => { e.metadata.retainedResponseDigest = 'other'; }],
  ['wrong subject', (e: any) => { e.verificationSubjectDigest = 'other'; }],
  ['missing observation', (e: any) => { delete e.metadata.nativeCandidateObservation; }],
  ['expired observation', (e: any) => { e.metadata.nativeCandidateObservation.expiresAt = 999; }],
  ['forged freshness', (e: any) => { e.metadata.nativeCandidateObservation.observedAt = 961;
    e.metadata.nativeCandidateObservationDigest = canonicalDigest('native-candidate-observation/v1', e.metadata.nativeCandidateObservation); }],
  ['changed candidate', (e: any) => { e.metadata.nativeCandidateObservation.candidateCommit = 'other'; }],
] as const) it(`checks ${name} on each envelope even after a valid proof was reused`, async () => {
  const f = fixture(), current = f.checker(); expect(await current(f.envelope)).toBe(true);
  const changed = structuredClone(f.envelope); change(changed); expect(await current(changed)).toBe(false);
});
it('does not reuse validation for a different immutable run record with the same id', async () => {
  const f = fixture(), current = f.checker(); expect(await current(f.envelope)).toBe(true);
  f.runs[1] = { ...f.runs[1], enterpriseSettlement: { ...f.runs[1].enterpriseSettlement,
    nativeUsage: { ...f.runs[1].enterpriseSettlement.nativeUsage, responseArtifactId: 'other-artifact' } } };
  expect(await current(f.envelope)).toBe(false); expect(proof).toHaveBeenCalledTimes(3);
});
it('fresh gate calls revalidate current profile, factory, owner and time; no cross-request reuse', async () => {
  const f = fixture(); expect(await f.checker()(f.envelope)).toBe(true);
  profile.mockRejectedValueOnce(Error('PROFILE_REVOKED')); expect(await f.checker()(f.envelope)).toBe(false);
  f.rows['factory-source'].status = 'ARCHIVED'; expect(await f.checker()(f.envelope)).toBe(false);
  f.rows['factory-source'].status = 'ACTIVE'; f.rows.owner.active = false; expect(await f.checker()(f.envelope)).toBe(false);
  f.rows.owner.active = true;
  expect(await createNativeQualificationEvidenceChecker(f.ctx, f.wo, f.runs, 1501)(f.envelope)).toBe(false);
});
it('failed proof validation remains fail-closed for every envelope in that snapshot', async () => {
  const f = fixture(), current = f.checker(); proof.mockRejectedValueOnce(Error('MALFORMED_PROOF'));
  expect(await current(f.envelope)).toBe(false); expect(await current(structuredClone(f.envelope))).toBe(false);
  expect(proof).toHaveBeenCalledTimes(1);
});
