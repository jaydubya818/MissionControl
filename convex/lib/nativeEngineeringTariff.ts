import { computeCanonicalHash } from "./genomeHash";
import type { MutationCtx } from "../_generated/server";
import type { EnterpriseReservation } from "./enterpriseAttemptAccounting";
import { enterpriseMissionOwner } from "./enterpriseMissionOwner";
import { SUCCESSOR_ISOLATED_IMAGE_BINDING, SUCCESSOR_ISOLATED_EFFECTIVE_CONFIG } from "@mission-control/workflow-engine/harness-contract";

export const NATIVE_ENGINEERING_TARIFF_POLICY = Object.freeze({ schema: "enterprise-native-tariff-policy/v1",
  basis: "DETERMINISTIC_ENGINEERING_ZERO_CHARGE", providerCalls: 0, resourceCost: "UNMEASURED" });
export type NativeEngineeringTariff = {
  schema: "enterprise-native-engineering-tariff/v1";
  basis: "DETERMINISTIC_ENGINEERING_ZERO_CHARGE";
  approvedBy: string; approvedAt: number; expiresAt: number;
  baseReservationDigest: string; executionManifestDigest: string;
  runtimeImage: string; digest: string;
};

function assertManifest(reservation: EnterpriseReservation, manifest: any) {
  const cause = manifest?.causation, profile = manifest?.executionProfile;
  if (manifest?.version !== "factory-execution-manifest/v4" || manifest.executionBackend !== "isolated-container"
    || manifest.harness?.adapter !== "isolated-invocation" || manifest.harness.version !== "3"
    || manifest.budgetReservationId !== reservation.attemptId || cause?.workflowRunId !== reservation.attemptId
    || cause.workOrderId !== reservation.workOrderId || cause.workOrderRevisionId !== reservation.workOrderRevisionId
    || cause.workOrderRevisionNumber !== reservation.workOrderRevisionNumber || cause.missionId !== reservation.missionId
    || cause.factoryConfigurationDigest !== reservation.factoryVersion
    || profile?.profileDigest !== reservation.executionProfileDigest
    || profile.profileSnapshot?.runtimeArtifact?.snapshot?.imageDigest !== SUCCESSOR_ISOLATED_IMAGE_BINDING.manifestDigest
    || profile.profileSnapshot?.offlinePolicy?.bridge?.implementationDigest !== SUCCESSOR_ISOLATED_EFFECTIVE_CONFIG.bridgeImplementationDigest
    || profile.profileSnapshot?.offlinePolicy?.backend?.implementationDigest !== SUCCESSOR_ISOLATED_EFFECTIVE_CONFIG.backendImplementationDigest
    || manifest.workflow?.steps?.length !== 1 || manifest.workflow.steps[0].kind !== "DETERMINISTIC") {
    throw Error("ENTERPRISE_NATIVE_MANIFEST_MISMATCH");
  }
}

export function validateNativeEngineeringTariff(reservation: EnterpriseReservation, manifest?: any) {
  const tariff = reservation.nativeTariff;
  if (!tariff) throw Error("ENTERPRISE_NATIVE_TARIFF_REQUIRED");
  const { digest, ...body } = tariff;
  const { digest: _reservationDigest, nativeTariff: _tariff, ...base } = reservation;
  if (tariff.schema !== "enterprise-native-engineering-tariff/v1" || tariff.basis !== "DETERMINISTIC_ENGINEERING_ZERO_CHARGE"
    || digest !== computeCanonicalHash(body) || reservation.provider !== "isolated-container" || reservation.tariff
    || tariff.baseReservationDigest !== computeCanonicalHash(base) || tariff.approvedBy !== reservation.ownerId
    || !Number.isSafeInteger(tariff.approvedAt) || tariff.approvedAt > reservation.authorizedAt
    || tariff.expiresAt !== reservation.expiresAt || tariff.runtimeImage !== SUCCESSOR_ISOLATED_IMAGE_BINDING.manifestDigest
    || !/^sha256:[a-f0-9]{64}$/.test(tariff.executionManifestDigest)) throw Error("ENTERPRISE_NATIVE_TARIFF_INVALID");
  if (manifest) {
    assertManifest(reservation, manifest);
    if (tariff.executionManifestDigest !== `sha256:${computeCanonicalHash(manifest)}`) throw Error("ENTERPRISE_NATIVE_TARIFF_MANIFEST_MISMATCH");
  }
  return tariff;
}

/** Part of the existing admission transaction, before any claim is possible.
 * The approved Plan explicitly includes the zero-charge qualification policy. */
export async function freezeNativeEngineeringTariff<T extends { enterprise?: EnterpriseReservation; authorizationDigest: string }>(
  ctx: MutationCtx, authorization: T, manifest: any, mission: any,
): Promise<T> {
  const reservation = authorization.enterprise;
  if (!reservation || manifest?.harness?.version !== "3") return authorization;
  assertManifest(reservation, manifest);
  const planId = ctx.db.normalizeId("missionPlans", manifest.causation.missionPlanId);
  const operatorId = ctx.db.normalizeId("operators", reservation.ownerId);
  const [plan, operator] = await Promise.all([planId ? ctx.db.get(planId) : null, operatorId ? ctx.db.get(operatorId) : null]);
  if (!plan || plan.status !== "APPROVED" || plan.projectId !== reservation.projectId || plan.missionId !== reservation.missionId
    || plan.tenantId !== reservation.tenantId || mission?._id !== reservation.missionId || mission.currentPlanId !== plan._id
    || await enterpriseMissionOwner(ctx, mission) !== reservation.ownerId || !operator?.active || operator.tenantId !== reservation.tenantId
    || (plan.approvedBy !== operator.authId && plan.approvedBy !== String(operator._id))
    || plan.decidedActorSource !== "AUTHENTICATED" || !plan.approvedAt
    || computeCanonicalHash(plan.metadata?.nativeEngineeringTariffPolicy) !== computeCanonicalHash(NATIVE_ENGINEERING_TARIFF_POLICY)
    || manifest.causation.missionPlanDigest !== `sha256:${computeCanonicalHash(plan)}`) {
    throw Error("ENTERPRISE_NATIVE_TARIFF_NOT_APPROVED");
  }
  const body: Omit<NativeEngineeringTariff, "digest"> = { schema: "enterprise-native-engineering-tariff/v1",
    basis: "DETERMINISTIC_ENGINEERING_ZERO_CHARGE", approvedBy: reservation.ownerId, approvedAt: plan.approvedAt,
    expiresAt: reservation.expiresAt, baseReservationDigest: reservation.digest,
    executionManifestDigest: `sha256:${computeCanonicalHash(manifest)}`, runtimeImage: SUCCESSOR_ISOLATED_IMAGE_BINDING.manifestDigest };
  const { digest: _oldDigest, ...base } = reservation;
  const next = { ...base, nativeTariff: { ...body, digest: computeCanonicalHash(body) } };
  const enterprise = { ...next, digest: computeCanonicalHash(next) };
  validateNativeEngineeringTariff(enterprise, manifest);
  const { authorizationDigest: _oldAuthorization, ...rest } = authorization;
  const frozen = { ...rest, enterprise };
  return { ...frozen, authorizationDigest: computeCanonicalHash(frozen) } as T;
}
