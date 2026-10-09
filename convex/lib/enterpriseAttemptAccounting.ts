import { computeCanonicalHash } from "./genomeHash";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { verifyEngineeringTariff, factoryDelegationBindingDigest, type EngineeringTariff, type FactoryDelegationBinding } from "@mission-control/shared";

export type EnterpriseReservation = {
  schema: "enterprise-attempt-reservation/v1";
  tenantId: string; projectId: string; ownerId: string; missionId: string;
  workOrderId: string; workOrderRevisionId: string; workOrderRevisionNumber: number;
  attemptId: string; delegationId: string; factoryId: string; factoryVersion: string;
  provider: "isolated-container" | "local-docker"; modelPolicyDigest: string;
  executionProfileDigest: string; bindingDigest: string; idempotencyKey: string;
  ceilingMicrousd: number; authorizedAt: number; expiresAt: number;
  missionCeilingMicrousd: number; workOrderCeilingMicrousd: number;
  dailyCeilingMicrousd: number; policyCeilingMicrousd: number;
  digest: string;
  tariff?: EngineeringTariff;
};
export type EnterpriseSettlement = {
  reservationDigest: string; proofDigest: string; settledAt: number;
  chargedMicrousd: number; basis: "PROVEN_NOT_DISPATCHED" | "DETERMINISTIC_ENGINEERING_ZERO_CHARGE";
  tariffDigest?: string; resourceCost?: "UNMEASURED";
  digest: string;
};

export function microusd(value: number): number {
  const result = Math.round(value * 1_000_000);
  if (!Number.isFinite(value) || value < 0 || !Number.isSafeInteger(result)
    || Math.abs(result / 1_000_000 - value) > Number.EPSILON * Math.max(1, value)) {
    throw Error("ENTERPRISE_MONEY_INVALID");
  }
  return result;
}
function integer(value: number) {
  if (!Number.isSafeInteger(value) || value < 0) throw Error("ENTERPRISE_MONEY_INVALID");
  return value;
}
function sum(values: number[]) { return values.reduce((a, b) => integer(a + integer(b)), 0); }
export function reservationDigest(value: Omit<EnterpriseReservation, "digest">) { return computeCanonicalHash(value); }
export function validateReservation(value: EnterpriseReservation) {
  const { digest, ...body } = value;
  if (digest !== reservationDigest(body) || value.schema !== "enterprise-attempt-reservation/v1"
    || value.ceilingMicrousd <= 0 || value.expiresAt <= value.authorizedAt
    || !Number.isSafeInteger(value.authorizedAt) || !Number.isSafeInteger(value.expiresAt)) throw Error("ENTERPRISE_AUTHORITY_INVALID");
  for (const amount of [value.ceilingMicrousd, value.missionCeilingMicrousd, value.workOrderCeilingMicrousd,
    value.dailyCeilingMicrousd, value.policyCeilingMicrousd]) integer(amount);
  for (const key of ["tenantId", "projectId", "ownerId", "missionId", "workOrderId", "workOrderRevisionId",
    "attemptId", "delegationId", "factoryId", "factoryVersion", "idempotencyKey", "modelPolicyDigest",
    "executionProfileDigest", "bindingDigest"] as const) if (!value[key]) throw Error("ENTERPRISE_IDENTITY_INCOMPLETE");
  return value;
}

export function attemptExposure(run: any, dailyAt?: number): number {
  const reservation: EnterpriseReservation | undefined = run.executionCostAuthorization?.enterprise;
  if (!reservation) {
    if (microusd(run.reservedCostUsd) !== 0 || microusd(run.spentUsd) !== 0
      || run.executionCostAuthorization || run.status !== "PENDING" || run.lease || run.executionClaimedAt !== undefined) {
      throw Error("ENTERPRISE_LEGACY_AUTHORITY_UNQUALIFIED");
    }
    return 0;
  }
  validateReservation(reservation);
  if (run.runId !== reservation.attemptId || run.projectId !== reservation.projectId
    || run.tenantId !== reservation.tenantId || run.missionId !== reservation.missionId
    || run.workOrderId !== reservation.workOrderId || run.workOrderRevisionId !== reservation.workOrderRevisionId) {
    throw Error("ENTERPRISE_RESERVATION_SCOPE_MISMATCH");
  }
  const receipt: EnterpriseSettlement | undefined = run.enterpriseSettlement;
  if (!receipt) return reservation.ceilingMicrousd;
  const { digest, ...body } = receipt;
  if (computeCanonicalHash(body) !== digest || receipt.reservationDigest !== reservation.digest
    || !["PROVEN_NOT_DISPATCHED", "DETERMINISTIC_ENGINEERING_ZERO_CHARGE"].includes(receipt.basis) || receipt.chargedMicrousd !== 0
    || receipt.settledAt < reservation.authorizedAt || !receipt.proofDigest) throw Error("ENTERPRISE_SETTLEMENT_INVALID");
  if (receipt.basis === "DETERMINISTIC_ENGINEERING_ZERO_CHARGE"
    && (!reservation.tariff || receipt.tariffDigest !== reservation.tariff.digest || receipt.resourceCost !== "UNMEASURED")) {
    throw Error("ENTERPRISE_SETTLEMENT_INVALID");
  }
  return dailyAt === undefined || receipt.settledAt >= Math.floor(dailyAt / 86400000) * 86400000
    ? integer(receipt.chargedMicrousd) : 0;
}

export function scopeExposure(runs: any[], dailyAt?: number) {
  return sum(runs.map(run => {
    const link = run.enterpriseAccountingParent;
    if (!link) return attemptExposure(run, dailyAt);
    const parent = runs.find(candidate => candidate._id === link.workflowRunId);
    const reservation = parent?.executionCostAuthorization?.enterprise;
    if (!parent || parent === run || parent.enterpriseAccountingParent || !reservation
      || reservation.provider !== "local-docker" || reservation.digest !== link.reservationDigest
      || reservation.bindingDigest !== link.bindingDigest || !/^sha256:[a-f0-9]{64}$/.test(link.resultDigest)
      || run.tenantId !== parent.tenantId || run.projectId !== parent.projectId || run.missionId !== parent.missionId
      || run.workOrderId !== parent.workOrderId || run.workOrderRevisionId !== parent.workOrderRevisionId
      || run.attemptPurpose !== "VERIFICATION" || run.status !== "COMPLETED" || run.lease || run.executionCostAuthorization
      || run.executionClaimedAt !== undefined || run.spentUsd !== 0 || run.reservedCostUsd !== 0
      || run.metadata?.signedFactoryResultDigest !== link.resultDigest
      || run.verificationAttemptBinding?.sourceAttemptId !== parent._id) throw Error("ENTERPRISE_ACCOUNTING_PARENT_INVALID");
    attemptExposure(parent, dailyAt);
    return 0;
  }));
}

export async function enterpriseProject(ctx: QueryCtx | MutationCtx, projectId: Id<"projects">) {
  const project = await ctx.db.get(projectId);
  if (project?.enterpriseAccountingMode !== "ISOLATED_DETERMINISTIC") return null;
  if (process.env.MC_ENTERPRISE_CANONICAL_ACCOUNTING !== "1") throw Error("ENTERPRISE_ACCOUNTING_DISABLED");
  return project;
}

export async function denyEnterprisePaidAuthority(ctx: QueryCtx | MutationCtx, projectId: Id<"projects">) {
  // The persistent marker fences paid authority even when the qualification flag is disabled.
  if ((await ctx.db.get(projectId))?.enterpriseAccountingMode) throw Error("ENTERPRISE_PAID_AUTHORITY_NOT_QUALIFIED");
}

export async function assertEnterpriseAttemptExecution(ctx: QueryCtx | MutationCtx, run: any, provider: EnterpriseReservation["provider"]) {
  if (!run.projectId || !await enterpriseProject(ctx, run.projectId)) return;
  const reservation = validateReservation(run.executionCostAuthorization?.enterprise);
  if (reservation.provider !== provider || run.enterpriseSettlement || reservation.attemptId !== run.runId || reservation.tenantId !== run.tenantId
    || reservation.workOrderId !== run.workOrderId || reservation.missionId !== run.missionId
    || reservation.workOrderRevisionId !== run.workOrderRevisionId || reservation.expiresAt <= Date.now()
    || run.executionCostAuthorization.maxProviderCalls !== 0) throw Error("ENTERPRISE_EXECUTION_NOT_RESERVED");
}

export async function reserveEnterpriseAttempt(ctx: MutationCtx, input: {
  runId: string; workOrder: any; mission: any; version: any; policy: any; now: number;
  tariff?: EngineeringTariff;
  delegation?: { id: string; factoryId: string; factoryVersion: string; provider: "local-docker";
    modelPolicyDigest: string; executionProfileDigest: string; bindingDigest: string; expiresAt: number; maximumMicrousd: number };
}) {
  const project = await enterpriseProject(ctx, input.workOrder.projectId);
  if (!project) return null;
  const { workOrder: wo, mission, version, policy, now, delegation } = input;
  if (!mission || mission.tenantId !== project.tenantId || wo.tenantId !== project.tenantId
    || mission.projectId !== project._id || wo.missionId !== mission._id || mission.spentUsd !== 0
    || !mission.owner || wo.approvalStatus !== "APPROVED" || !wo.currentRevisionId
    || !policy?.active || policy.projectId !== project._id || policy.tenantId !== project.tenantId
    || version.policyEnvelopeId !== policy._id) throw Error("ENTERPRISE_SCOPE_UNAVAILABLE");
  const [runs, controls, inference, provider] = await Promise.all([
    ctx.db.query("workflowRuns").withIndex("by_project", q => q.eq("projectId", project._id)).collect(),
    ctx.db.query("operatorControls").withIndex("by_project", q => q.eq("projectId", project._id)).order("desc").first(),
    ctx.db.query("inferenceReservations").withIndex("by_project", q => q.eq("projectId", project._id)).first(),
    ctx.db.query("factoryProviderReservations").withIndex("by_project_key", q => q.eq("projectId", project._id)).first(),
  ]);
  if (inference || provider || !controls || controls.tenantId !== project.tenantId || controls.mode !== "NORMAL") {
    throw Error("ENTERPRISE_SHARED_AUTHORITY_UNQUALIFIED");
  }
  const cap = delegation?.maximumMicrousd ?? microusd(version.budget.maxCostUsd);
  const approved = wo.metadata?.implementationPolicy;
  const body: Omit<EnterpriseReservation, "digest"> = {
    schema: "enterprise-attempt-reservation/v1", tenantId: String(project.tenantId), projectId: String(project._id),
    ownerId: mission.owner, missionId: String(mission._id), workOrderId: String(wo._id),
    workOrderRevisionId: String(wo.currentRevisionId), workOrderRevisionNumber: wo.currentRevisionNumber,
    attemptId: input.runId, delegationId: delegation?.id ?? `native:${input.runId}`,
    factoryId: delegation?.factoryId ?? String(version.factoryDefinitionId),
    factoryVersion: delegation?.factoryVersion ?? version.configurationDigest,
    provider: delegation?.provider ?? "isolated-container",
    modelPolicyDigest: delegation?.modelPolicyDigest ?? computeCanonicalHash({ provider: "none", maximumCalls: 0 }),
    executionProfileDigest: delegation?.executionProfileDigest ?? version.executionProfileDigest,
    bindingDigest: delegation?.bindingDigest ?? computeCanonicalHash({ runId: input.runId, version: version.configurationDigest, revision: wo.currentRevisionId }),
    idempotencyKey: delegation?.id ?? input.runId, ceilingMicrousd: cap, authorizedAt: now,
    expiresAt: delegation?.expiresAt ?? now + version.budget.maxRuntimeMinutes * 60000,
    missionCeilingMicrousd: microusd(mission.budgetUsd), workOrderCeilingMicrousd: microusd(approved?.maxCostUsd),
    dailyCeilingMicrousd: microusd(controls.dailyBudgetUsd!), policyCeilingMicrousd: microusd(policy.rules.maxResourceCostUsd),
    ...(input.tariff ? { tariff: input.tariff } : {}),
  };
  const reservation = validateReservation({ ...body, digest: reservationDigest(body) });
  if (reservation.expiresAt <= now || reservation.expiresAt > now + version.budget.maxRuntimeMinutes * 60000
    || cap > microusd(controls.perRunBudgetUsd!)
    || cap > microusd(version.budget.maxCostUsd)) throw Error("ENTERPRISE_ALLOWANCE_EXPANDED");
  const prior = runs.find(run => run.executionCostAuthorization?.schema === "work-order-offline-cost-authorization/v1"
    && (run.executionCostAuthorization.enterprise?.idempotencyKey === reservation.idempotencyKey
      || run.runId === input.runId));
  if (prior) {
    const existing = (prior.executionCostAuthorization as any).enterprise as EnterpriseReservation;
    const { digest: _a, authorizedAt: _b, ...expected } = reservation;
    const { digest: _c, authorizedAt: _d, ...actual } = validateReservation(existing);
    if (computeCanonicalHash(expected) !== computeCanonicalHash(actual)) throw Error("ENTERPRISE_RESERVATION_CONFLICT");
    return existing;
  }
  for (const target of runs.filter(run => run.runId === input.runId)) {
    if (target.status !== "PENDING" || target.lease || target.executionClaimedAt !== undefined
      || target.executionClaimId || target.executionCostAuthorization || target.enterpriseSettlement
      || microusd(target.spentUsd!) !== 0 || microusd(target.reservedCostUsd!) !== 0) {
      throw Error("ENTERPRISE_EXISTING_ATTEMPT_NOT_VIRGIN");
    }
  }
  const chargedRuns = runs.filter(run => run.runId !== input.runId);
  if (runs.filter(run => run.runId === input.runId).length > 1
    || runs.some(run => run.runId === input.runId && (run.workOrderId !== wo._id || run.missionId !== mission._id))) {
    throw Error("ENTERPRISE_ATTEMPT_IDENTITY_CONFLICT");
  }
  if (chargedRuns.some(run => run.tenantId !== project.tenantId)) throw Error("ENTERPRISE_SCOPE_UNAVAILABLE");
  const missionRuns = chargedRuns.filter(run => run.missionId === mission._id);
  const workOrderRuns = chargedRuns.filter(run => run.workOrderId === wo._id);
  if (!Number.isInteger(approved?.maxAttempts) || !Number.isInteger(version.budget.maxAttempts)
    || workOrderRuns.length >= Math.min(approved.maxAttempts, version.budget.maxAttempts)
    || approved.timeoutMinutes < version.budget.maxRuntimeMinutes) throw Error("ENTERPRISE_ATTEMPTS_EXHAUSTED");
  for (const [exposure, ceiling] of [
    [scopeExposure(missionRuns), body.missionCeilingMicrousd],
    [scopeExposure(workOrderRuns), body.workOrderCeilingMicrousd],
    [scopeExposure(chargedRuns, now), body.dailyCeilingMicrousd],
    [scopeExposure(chargedRuns.filter(run => run.policyEnvelopeId === policy._id)), body.policyCeilingMicrousd],
  ]) if (sum([exposure, cap]) > ceiling) throw Error("ENTERPRISE_BUDGET_EXHAUSTED");
  return reservation;
}

export async function settleUndispatchedEnterpriseAttempt(ctx: MutationCtx, run: any, now: number) {
  const reservation = validateReservation(run.executionCostAuthorization?.enterprise);
  const proofDigest = computeCanonicalHash({ reservation: reservation.digest,
    proof: reservation.provider === "local-docker" ? "NEVER_SENT_DELEGATION" : "NEVER_LEASED_PENDING" });
  if (run.enterpriseSettlement) {
    attemptExposure(run);
    if (run.enterpriseSettlement.proofDigest !== proofDigest) throw Error("ENTERPRISE_SETTLEMENT_CONFLICT");
    return run.enterpriseSettlement;
  }
  if (reservation.provider === "local-docker") {
    if (run.executionClaimedAt !== undefined || run.executionClaimId) throw Error("ENTERPRISE_EXPOSURE_UNKNOWN");
    const trial = await ctx.db.query("factoryDelegationTrials").withIndex("by_project_delegation",
      q => q.eq("projectId", run.projectId).eq("delegationId", reservation.delegationId)).unique();
    if (!trial || trial.bindingDigest !== reservation.bindingDigest || trial.state !== "RESERVED"
      || trial.binding.workflowRunId !== run._id || trial.partnerRunId || trial.observationRevision !== 0) {
      throw Error("ENTERPRISE_EXPOSURE_UNKNOWN");
    }
  } else if (run.status !== "PENDING" || run.lease || run.executionClaimedAt !== undefined
    || run.executionClaimId || run.metadata?.enterpriseDelegationId) {
    throw Error("ENTERPRISE_EXPOSURE_UNKNOWN");
  }
  const receipt = { reservationDigest: reservation.digest, proofDigest, settledAt: now,
    chargedMicrousd: 0, basis: "PROVEN_NOT_DISPATCHED" as const };
  const settlement = { ...receipt, digest: computeCanonicalHash(receipt) };
  await ctx.db.patch(run._id, { status: "CANCELED", cancellationRequestedAt: now,
    reservedCostUsd: 0, enterpriseSettlement: settlement });
  return settlement;
}

export async function settleExecutedEnterpriseAttempt(ctx: MutationCtx, run: any, binding: FactoryDelegationBinding,
  proof: { bindingDigest: string; resultDigest: string; cleanupConfirmed: true; tariffDigest?: string }, now: number) {
  const reservation = validateReservation(run.executionCostAuthorization?.enterprise);
  attemptExposure(run);
  if (!reservation.tariff || reservation.provider !== "local-docker" || proof.cleanupConfirmed !== true
    || proof.tariffDigest !== reservation.tariff.digest || proof.bindingDigest !== reservation.bindingDigest
    || proof.bindingDigest !== factoryDelegationBindingDigest(binding) || !/^sha256:[a-f0-9]{64}$/.test(proof.resultDigest)) {
    throw Error("ENTERPRISE_SETTLEMENT_PROOF_REQUIRED");
  }
  verifyEngineeringTariff(binding, reservation.tariff, reservation.authorizedAt);
  if (run.enterpriseSettlement) {
    if (run.enterpriseSettlement.proofDigest !== proof.resultDigest
      || run.enterpriseSettlement.tariffDigest !== proof.tariffDigest) throw Error("ENTERPRISE_SETTLEMENT_CONFLICT");
    return run.enterpriseSettlement;
  }
  const body = { reservationDigest: reservation.digest, proofDigest: proof.resultDigest, settledAt: now, chargedMicrousd: 0,
    basis: "DETERMINISTIC_ENGINEERING_ZERO_CHARGE" as const, tariffDigest: reservation.tariff.digest, resourceCost: "UNMEASURED" as const };
  const receipt = { ...body, digest: computeCanonicalHash(body) };
  await ctx.db.patch(run._id, { enterpriseSettlement: receipt, reservedCostUsd: 0, spentUsd: 0 });
  return receipt;
}
