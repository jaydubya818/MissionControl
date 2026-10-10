import { describe, expect, it } from 'vitest';
import { freezeNativeEngineeringTariff, validateNativeEngineeringTariff, NATIVE_ENGINEERING_TARIFF_POLICY } from '../lib/nativeEngineeringTariff';
import { attemptExposure, reservationDigest } from '../lib/enterpriseAttemptAccounting';
import { computeCanonicalHash } from '../lib/genomeHash';
import { SUCCESSOR_ISOLATED_IMAGE_BINDING, SUCCESSOR_ISOLATED_EFFECTIVE_CONFIG } from '@mission-control/workflow-engine/harness-contract';

function fixture() {
  const reservation: any = { schema: 'enterprise-attempt-reservation/v1', tenantId: 'tenant', projectId: 'project', ownerId: 'owner',
    missionId: 'mission', workOrderId: 'wo', workOrderRevisionId: 'revision', workOrderRevisionNumber: 1, attemptId: 'run', delegationId: 'native:run',
    factoryId: 'factory', factoryVersion: 'factory-v1-12345678', provider: 'isolated-container', modelPolicyDigest: 'model', executionProfileDigest: 'profile',
    bindingDigest: 'binding', idempotencyKey: 'run', ceilingMicrousd: 80, authorizedAt: 1000, expiresAt: 2000,
    missionCeilingMicrousd: 100, workOrderCeilingMicrousd: 100, dailyCeilingMicrousd: 100, policyCeilingMicrousd: 100 };
  reservation.digest = reservationDigest(reservation);
  const plan: any = { _id: 'plan', tenantId: 'tenant', projectId: 'project', missionId: 'mission', status: 'APPROVED',
    approvedBy: 'owner-auth', approvedAt: 900, decidedActorSource: 'AUTHENTICATED', metadata: { nativeEngineeringTariffPolicy: NATIVE_ENGINEERING_TARIFF_POLICY } };
  const mission: any = { _id: 'mission', currentPlanId: 'plan', owner: 'owner' };
  const operator: any = { _id: 'owner', tenantId: 'tenant', authId: 'owner-auth', active: true };
  const manifest: any = { version: 'factory-execution-manifest/v4', executionBackend: 'isolated-container', harness: { adapter: 'isolated-invocation', version: '3' },
    budgetReservationId: 'run', causation: { workflowRunId: 'run', workOrderId: 'wo', workOrderRevisionId: 'revision', workOrderRevisionNumber: 1,
      missionId: 'mission', missionPlanId: 'plan', missionPlanDigest: 'sha256:' + computeCanonicalHash(plan), factoryConfigurationDigest: 'factory-v1-12345678' },
    executionProfile: { profileDigest: 'profile', profileSnapshot: { runtimeArtifact: { snapshot: { imageDigest: SUCCESSOR_ISOLATED_IMAGE_BINDING.manifestDigest } },
      offlinePolicy: { bridge: { implementationDigest: SUCCESSOR_ISOLATED_EFFECTIVE_CONFIG.bridgeImplementationDigest }, backend: { implementationDigest: SUCCESSOR_ISOLATED_EFFECTIVE_CONFIG.backendImplementationDigest } } } },
    workflow: { steps: [{ kind: 'DETERMINISTIC' }] } };
  const authorization = { enterprise: reservation, authorizationDigest: 'initial' };
  const ctx: any = { db: { normalizeId: (_table: string, id: string) => id, get: async (id: string) => id === 'plan' ? plan : id === 'owner' ? operator : null } };
  return { authorization, ctx, plan, mission, operator, manifest };
}

describe('native admission-time engineering tariff', () => {
  it('freezes exact approved authority and keeps UNKNOWN exposure despite terminal state', async () => {
    const f = fixture(), original = structuredClone(f.authorization);
    const frozen = await freezeNativeEngineeringTariff(f.ctx, f.authorization, f.manifest, f.mission);
    expect(f.authorization).toEqual(original);
    expect(validateNativeEngineeringTariff(frozen.enterprise, f.manifest).approvedBy).toBe('owner');
    expect(frozen.enterprise.digest).not.toBe(original.enterprise.digest);
    for (const status of ['RUNNING', 'COMPLETED', 'FAILED', 'CANCELED']) {
      expect(attemptExposure({ _id: 'attempt', runId: 'run', tenantId: 'tenant', projectId: 'project', missionId: 'mission',
        workOrderId: 'wo', workOrderRevisionId: 'revision', status, executionCostAuthorization: frozen, reservedCostUsd: 0, spentUsd: 0 })).toBe(80);
    }
  });
  it.each(['plan-owner', 'mission-owner', 'tenant', 'inactive', 'unapproved', 'policy', 'plan-revision', 'source', 'runtime', 'attempt'])('denies changed %s before execution', async field => {
    const f = fixture();
    if (field === 'plan-owner') f.plan.approvedBy = 'someone-else';
    if (field === 'mission-owner') f.mission.owner = 'someone-else';
    if (field === 'tenant') f.operator.tenantId = 'other';
    if (field === 'inactive') f.operator.active = false;
    if (field === 'unapproved') f.plan.status = 'DRAFT';
    if (field === 'policy') f.plan.metadata = {};
    if (field === 'plan-revision') f.mission.currentPlanId = 'other';
    if (field === 'source') f.manifest.workflow.steps[0].kind = 'AGENT';
    if (field === 'runtime') f.manifest.executionProfile.profileSnapshot.runtimeArtifact.snapshot.imageDigest = 'sha256:' + 'a'.repeat(64);
    if (field === 'attempt') f.manifest.budgetReservationId = 'other';
    await expect(freezeNativeEngineeringTariff(f.ctx, f.authorization, f.manifest, f.mission)).rejects.toThrow();
  });
  it('binds approved reservation ceiling, expiry and exact manifest against recomputed outer hashes', async () => {
    const f = fixture(); const frozen = await freezeNativeEngineeringTariff(f.ctx, f.authorization, f.manifest, f.mission);
    for (const field of ['ceilingMicrousd', 'expiresAt', 'ownerId', 'attemptId']) {
      const changed: any = structuredClone(frozen.enterprise); changed[field] = typeof changed[field] === 'number' ? changed[field] + 1 : 'other';
      const { digest: _digest, ...body } = changed; changed.digest = reservationDigest(body);
      expect(() => validateNativeEngineeringTariff(changed, f.manifest)).toThrow();
    }
    const changed = structuredClone(f.manifest); changed.workflow.steps[0].input = 'substituted';
    expect(() => validateNativeEngineeringTariff(frozen.enterprise, changed)).toThrow();
  });
});
