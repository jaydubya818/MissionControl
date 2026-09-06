import { computeCanonicalHash } from "./genomeHash";
import type { MutationCtx } from "../_generated/server";

const money = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
const profileDigest = (value: unknown): value is string => typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value);

/** Detects the only pre-executor timeout that the control plane can close
 * without guessing about worker state. A PENDING Attempt has never received a
 * lease, so expiring this window preserves a definitive no-execution result. */
export function offlineAttemptClaimWindowExpired(input: {
  status: string;
  startedAt?: number;
  lease?: unknown;
  maxTotalWallClockMs?: number;
}, now: number) {
  return input.status === "PENDING"
    && input.lease === undefined
    && typeof input.startedAt === "number"
    && Number.isFinite(input.startedAt)
    && typeof input.maxTotalWallClockMs === "number"
    && Number.isFinite(input.maxTotalWallClockMs)
    && input.maxTotalWallClockMs > 0
    && now - input.startedAt > input.maxTotalWallClockMs;
}

/** Runs inside WorkOrder admission's transaction. Reads shared reservation
 * scopes so concurrent admissions conflict and retry against committed holds. */
export async function reserveOfflineAttemptBudget(ctx: MutationCtx, input: {
  runId: string; version: any; workOrder: any; mission: any; policy: any; now: number;
}) {
  const { version, workOrder, mission, policy } = input;
  const approved = workOrder.metadata?.implementationPolicy;
  if (!mission || mission._id !== workOrder.missionId || mission.projectId !== workOrder.projectId
    || !policy?.active || policy._id !== version.policyEnvelopeId || policy.projectId !== workOrder.projectId
    || policy.tenantId !== workOrder.tenantId || !money(mission.budgetUsd) || !money(mission.spentUsd)
    || !money(policy.rules?.maxResourceCostUsd) || policy.rules.maxResourceCostUsd <= 0
    || !money(approved?.maxCostUsd) || !Number.isInteger(approved?.maxAttempts)
    || approved.maxAttempts < version.budget.maxAttempts || !money(approved.timeoutMinutes)
    || approved.timeoutMinutes < version.budget.maxRuntimeMinutes) {
    throw new Error("Offline resource reservation requires explicit current Mission, policy and approved WorkOrder limits.");
  }
  const [missionRuns, projectRuns, workOrderRuns] = await Promise.all([
    ctx.db.query("workflowRuns").withIndex("by_mission", q => q.eq("missionId", mission._id)).collect(),
    ctx.db.query("workflowRuns").withIndex("by_project", q => q.eq("projectId", workOrder.projectId)).collect(),
    ctx.db.query("workflowRuns").withIndex("by_work_order", q => q.eq("workOrderId", workOrder._id)).collect(),
  ]);
  const committed = (runs: any[]) => runs.reduce((sum, run) => {
    if (!money(run.reservedCostUsd) || !money(run.spentUsd)) throw new Error("Shared resource reservation includes an unsettled unknown cost.");
    return sum + Math.max(run.reservedCostUsd, run.spentUsd);
  }, 0);
  const base = offlineAttemptBudget({ runId: input.runId, factoryConfigurationDigest: version.configurationDigest,
    executionProfileDigest: version.executionProfileDigest, factoryBudget: version.budget,
    approvedWorkOrderCapUsd: approved.maxCostUsd,
    missionBudgetRemainingUsd: mission.budgetUsd - mission.spentUsd - committed(missionRuns),
    policyBudgetRemainingUsd: policy.rules.maxResourceCostUsd - committed(projectRuns.filter(run => run.policyEnvelopeId === policy._id)),
    // Producer and verifier share the approved WorkOrder envelope. A separate
    // purpose must not hide attempts or outstanding resource reservations.
    priorAttempts: workOrderRuns, now: input.now });
  const { authorizationDigest: _baseDigest, ...authorization } = base;
  const frozen = { ...authorization, policyEnvelopeId: policy._id as string, policyEnvelopeDigest: computeCanonicalHash(policy),
    workOrderPolicyDigest: computeCanonicalHash(approved) };
  return { ...frozen, authorizationDigest: computeCanonicalHash(frozen) };
}

/** Resource reservation only. This cannot authorize a provider call or assert measured cost. */
export function offlineAttemptBudget(input: {
  runId: string;
  factoryConfigurationDigest: string;
  executionProfileDigest: string;
  factoryBudget: { maxCostUsd: number; maxAttempts: number; maxRuntimeMinutes: number };
  approvedWorkOrderCapUsd: number;
  missionBudgetRemainingUsd: number;
  policyBudgetRemainingUsd: number;
  priorAttempts: Array<{
    status: string;
    spentUsd?: number;
    reservedCostUsd?: number;
    executionCostAuthorization?: { actualCost: { status: string; usd?: number } };
  }>;
  now: number;
}) {
  const cap = input.factoryBudget;
  if (!input.runId || input.runId.length > 160 || !/^factory-v1-[a-f0-9]{8}$/.test(input.factoryConfigurationDigest)
    || !profileDigest(input.executionProfileDigest) || !money(input.now)
    || !money(cap.maxCostUsd) || cap.maxCostUsd <= 0 || cap.maxCostUsd > 1000
    || !Number.isInteger(cap.maxAttempts) || cap.maxAttempts < 1 || cap.maxAttempts > 3
    || !money(cap.maxRuntimeMinutes) || cap.maxRuntimeMinutes <= 0 || cap.maxRuntimeMinutes > 480
    || !money(input.approvedWorkOrderCapUsd) || !money(input.missionBudgetRemainingUsd)
    || !money(input.policyBudgetRemainingUsd) || input.priorAttempts.length >= cap.maxAttempts) {
    throw new Error("Offline Attempt budget authority is incomplete or exhausted.");
  }
  let priorCommittedUsd = 0;
  for (const run of input.priorAttempts) {
    if (!money(run.reservedCostUsd) || !money(run.spentUsd)) throw new Error("Prior Attempt resource cost is unknown.");
    // Neither a terminal state nor a MEASURED label establishes trusted cost
    // provenance. Hold the reservation until a separate governed settlement
    // path proves its release; this offline qualification does not add one.
    priorCommittedUsd += Math.max(run.reservedCostUsd, run.spentUsd);
  }
  const remainingBeforeReservationUsd = Math.min(
    input.approvedWorkOrderCapUsd - priorCommittedUsd,
    input.missionBudgetRemainingUsd,
    input.policyBudgetRemainingUsd,
  );
  // Reserve the entire admitted per-Attempt resource ceiling; no inferred price estimate.
  if (!money(remainingBeforeReservationUsd) || remainingBeforeReservationUsd < cap.maxCostUsd) {
    throw new Error("Offline Attempt resource reservation exceeds remaining authority.");
  }
  const authorization = {
    schema: "work-order-offline-cost-authorization/v1" as const,
    reservationId: input.runId,
    factoryConfigurationDigest: input.factoryConfigurationDigest,
    executionProfileDigest: input.executionProfileDigest,
    maxProviderCalls: 0 as const,
    maxProviderLiabilityUsd: 0 as const,
    estimatedCostUsd: cap.maxCostUsd,
    reservedCostUsd: cap.maxCostUsd,
    hardLimitUsd: cap.maxCostUsd,
    priorCommittedUsd,
    remainingBeforeReservationUsd,
    budgetSource: "WORK_ORDER_IMPLEMENTATION_POLICY" as const,
    estimationInputs: {
      method: "FULL_RESOURCE_CEILING_RESERVATION" as const,
      approvedWorkOrderCapUsd: input.approvedWorkOrderCapUsd,
      missionBudgetRemainingUsd: input.missionBudgetRemainingUsd,
      policyBudgetRemainingUsd: input.policyBudgetRemainingUsd,
      factoryBudget: cap,
      priorAttemptCount: input.priorAttempts.length,
    },
    actualCost: { status: "UNAVAILABLE" as const, reason: "Resource cost has not been measured; no provider execution is authorized." },
    authorizedAt: input.now,
  };
  return { ...authorization, authorizationDigest: computeCanonicalHash(authorization) };
}
