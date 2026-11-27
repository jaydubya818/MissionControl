import { readFileSync } from 'node:fs';
import { qualifiedLocalDelegationIdentity } from '../lib/localDelegationQualification';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enterpriseDelegationApproval, prepareCanonicalDelegation } from '../lib/enterpriseDelegationAdmission';

// Authentication/local mirror admission are separately exercised against the
// real database. This retained synthetic admission tests immutable correlations.
vi.mock('../lib/enterpriseQualificationAccess', () => ({ requireEnterpriseQualificationOwner: async () => ({}) }));
vi.mock('../lib/localRepositoryAdmission', () => ({ loadLocalRepositoryAdmission: async (_ctx: any, repository: any) => ({
  admission: repository.localAdmission, digest: repository.localAdmissionDigest,
}) }));
const retained = JSON.parse(readFileSync(new URL('./fixtures/nativeHybridAuthority.json', import.meta.url), 'utf8'));
let f: any;
function context() {
  const rows = Object.values(f).filter((r: any) => r && typeof r === 'object' && r._id) as any[];
  return { db: { get: async (id: string) => rows.find(r => r._id === id),
    query: () => ({ withIndex: () => ({ collect: async () => f.extraApproval ? [f.approval, f.extraApproval] : [f.approval] }) }) } };
}
const check = () => enterpriseDelegationApproval(context(), f.plan, f.binding, f.run);
beforeEach(() => { vi.stubEnv('MC_NATIVE_SUCCESSOR_QUALIFICATION', '1'); vi.stubEnv('MC_ENTERPRISE_COMPATIBILITY_FIXTURES', '1'); vi.stubEnv('MC_LOCAL_DELEGATION_QUALIFICATION', undefined); f = structuredClone(retained); f.mission.ownerOperatorId = f.operator._id; vi.useFakeTimers(); vi.setSystemTime(f.now); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
describe('canonical isolated delegation exact approval', () => {
  it('accepts the retained real database admission with its immutable source projection', async () => {
    expect((await check()).approvalDecisionId).toBe(f.approval._id);
  });
  it('requires the same trusted host admission through later dispatch and readback inspection', async () => {
    const q = JSON.parse(readFileSync(new URL('./fixtures/hostFactoryQualification.json', import.meta.url), 'utf8'));
    const a = f.repository.localAdmission;
    const record = { schema: 'local-delegation-host-admission/v1', tenantId: a.tenantId, projectId: a.projectId,
      operatorId: a.operatorId, repositoryId: f.repository._id, admissionDigest: f.repository.localAdmissionDigest,
      expiresAt: a.expiresAt, qualification: q };
    vi.stubEnv('MC_LOCAL_DELEGATION_QUALIFICATION', JSON.stringify(record));
    const configuration = JSON.parse(q.configurationCanonical);
    const identity = qualifiedLocalDelegationIdentity({ sourceDigest: q.sourceDigest, configuration, repositoryId: f.repository._id,
      admission: a, admissionDigest: record.admissionDigest, now: f.now });
    f.version.executionProfileSnapshot = { sourceSha: q.sourceSha, sourceDigest: q.sourceDigest,
      factoryVersion: identity.factoryVersion, configuration, qualificationDigest: identity.qualificationDigest };
    f.version.executionProfileDigest = 'sha256:' + identity.configurationDigest;
    f.factory.enterpriseRegistration.config.factoryVersion = identity.factoryVersion;
    const inspect = () => prepareCanonicalDelegation(context(), f.workOrder, f.version._id);
    expect((await inspect()).version._id).toBe(f.version._id);
    const priorApprover = f.plan.approvedBy;
    f.foreignOperator = { ...f.operator, _id: 'foreign-owner', authId: 'foreign-auth' };
    f.mission.ownerOperatorId = f.foreignOperator._id; f.plan.approvedBy = f.foreignOperator._id;
    await expect(inspect()).rejects.toThrow(); // another legitimate Mission owner cannot reuse this host admission
    f.mission.ownerOperatorId = f.operator._id; f.plan.approvedBy = priorApprover;
    expect((await inspect()).version._id).toBe(f.version._id);
    record.expiresAt -= 1; vi.stubEnv('MC_LOCAL_DELEGATION_QUALIFICATION', JSON.stringify(record));
    await expect(inspect()).rejects.toThrow(); // changed trusted record invalidates frozen snapshot
    record.expiresAt += 1; vi.stubEnv('MC_LOCAL_DELEGATION_QUALIFICATION', JSON.stringify(record));
    f.repository.localAdmissionDigest = 'changed'; await expect(inspect()).rejects.toThrow();
    f.repository.localAdmissionDigest = record.admissionDigest;
    vi.stubEnv('MC_LOCAL_DELEGATION_QUALIFICATION', undefined); await expect(inspect()).rejects.toThrow();
  });
  const faults: Record<string, (f: any) => void> = {
    'foreign source digest': f => { f.binding.sourceSnapshotDigest = 'sha256:' + '0'.repeat(64); },
    'foreign model policy': f => { f.binding.modelPolicyDigest = 'sha256:' + '0'.repeat(64); },
    'foreign verifier policy': f => { f.binding.verificationPolicyDigest = 'sha256:' + '0'.repeat(64); },
    'missing required effect': f => { f.binding.allowedEffects = ['repository.read']; },
    'allowance escalation': f => { f.binding.maxSpendMicrousd = 81; },
    'changed Plan': f => { f.plan.summary += ' changed'; },
    'different current Plan': f => { f.mission.currentPlanId = 'other'; },
    'inactive owner': f => { f.operator.active = false; },
    'foreign admission owner': f => { f.repository.localAdmission.operatorId = 'other'; },
    'foreign owner tenant': f => { f.operator.tenantId = 'other'; },
    'revoked registry': f => { f.factory.enterpriseRegistration.revokedAt = f.now; },
    'wrong FactoryVersion': f => { f.factory.enterpriseRegistration.config.factoryVersion = '0'.repeat(64); },
    'unavailable policy': f => { f.policy.active = false; },
    'changed policy': f => { f.policy.rules.maxResourceCostUsd = 2; },
    'changed WorkOrder allowance': f => { f.workOrder.metadata.implementationPolicy.maxCostUsd = 1; },
    'changed Factory allowance': f => { f.version.budget.maxCostUsd = 1; },
    'changed execution profile': f => { f.version.executionProfileDigest = 'sha256:' + '0'.repeat(64); },
    'changed frozen profile': f => { f.version.executionProfileSnapshot.configuration.executor = 'other'; },
    'changed workflow': f => { f.workflow.description += ' changed'; },
    'inactive workflow': f => { f.workflow.active = false; },
    'foreign source mapping': f => { f.run.executionManifest.delegatedSourceRepository = 'other/repository'; },
    'changed local baseline': f => { f.repository.localAdmission.baselineCommit = '0'.repeat(40); },
    'stale source tree': f => { f.binding.baseTree = '0'.repeat(40); },
    'foreign task': f => { f.binding.taskId = 'other'; },
    'foreign profile binding': f => { f.binding.executionProfileDigest = 'sha256:' + '0'.repeat(64); },
    'foreign execution manifest': f => { f.run.executionManifestDigest = 'sha256:' + '0'.repeat(64); },
    'revoked owner approval': f => { f.approval.revokedAt = f.now; },
    'expired owner approval': f => { f.approval.expiresAt = f.now - 1; },
    'foreign approver': f => { f.approval.approver = 'other'; },
    'superseded approval': f => { f.approval.supersededByApprovalDecisionId = 'other'; },
    'ambiguous approval': f => { f.extraApproval = { ...f.approval, _id: 'other' }; },
  };
  it.each(Object.entries(faults))('denies %s', async (name, apply) => {
    apply(f);
    const capabilityFaults = ['foreign source digest', 'foreign model policy', 'foreign verifier policy', 'missing required effect', 'allowance escalation'];
    await expect(check()).rejects.toThrow(capabilityFaults.includes(name) ? 'DELEGATION_CAPABILITY_CHANGED' : undefined);
  });
  it('preserves legacy qualified approval lookup', async () => {
    const approval = { bindingDigest: 'historical' };
    expect(await enterpriseDelegationApproval(context(), { metadata: { enterpriseDelegationApproval: approval } }, f.binding, {})).toEqual(approval);
  });
});
