export interface PlanningRunPresentationRecord {
  _id: unknown;
  status: string;
  adoptedPlanId?: unknown;
}

export interface PlanningPlanPresentationRecord {
  status: string;
  planningRunId?: unknown;
}

export function planningRunId(value: unknown) {
  return value == null ? null : String(value);
}

export function canApplyPlanningCandidate(plan: PlanningPlanPresentationRecord | null) {
  return plan === null || plan.status === "DRAFT";
}

export function resolvePlanningRunPresentation<T extends PlanningRunPresentationRecord>(
  runs: T[],
  plan: PlanningPlanPresentationRecord | null,
) {
  const boundId = planningRunId(plan?.planningRunId);
  const boundRun = boundId
    ? runs.find((run) => planningRunId(run._id) === boundId) ?? null
    : null;
  const latestUnadoptedRun = runs.find((run) =>
    !run.adoptedPlanId && planningRunId(run._id) !== boundId
  ) ?? null;
  return { boundRun, latestUnadoptedRun };
}

export function shouldShowPlanReleaseReadOnlyNotice(
  enabled: boolean,
  plan: PlanningPlanPresentationRecord | null,
) {
  return !enabled && plan?.status !== "APPROVED";
}
