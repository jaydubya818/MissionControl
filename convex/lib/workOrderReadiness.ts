export type ReadinessCheck = {
  code: string;
  label: string;
  status: "PASS" | "BLOCKED" | "DEFERRED" | "NOT_APPLICABLE";
  boundary: "ADMISSION" | "PRE_EXECUTION" | "VERIFICATION";
  reason: string;
};

/** A projection is not an authorization, reservation, or completion receipt. */
export function summarizeWorkOrderReadiness(checks: ReadinessCheck[]) {
  const blockers = checks.filter((check) => check.status === "BLOCKED");
  const pending = checks.filter((check) => check.status === "DEFERRED");
  const admissionEligible = checks.some((check) => check.boundary === "ADMISSION" && check.status === "PASS")
    && !checks.some((check) => check.boundary === "ADMISSION"
      && (check.status === "BLOCKED" || check.status === "DEFERRED"));
  return {
    schemaVersion: "work-order-readiness/v1" as const,
    authoritative: false as const,
    admissionEligible,
    executionReady: admissionEligible && !checks.some((check) => check.boundary === "PRE_EXECUTION"
      && (check.status === "BLOCKED" || check.status === "DEFERRED")),
    status: !admissionEligible ? "BLOCKED" as const : pending.length ? "PREPARATION_REQUIRED" as const : "CHECKS_PASSED" as const,
    checks,
    blockers,
    pending,
  };
}

export function planReadiness(input: {
  missionId?: string;
  currentPlanId?: string;
  plan?: { _id: string; missionId: string; status: string; revisionNumber: number } | null;
  workOrderPlanRevision?: number;
  releasedAt?: number;
}): ReadinessCheck[] {
  if (!input.missionId) return [{ code: "plan", label: "Governed Plan", status: "NOT_APPLICABLE",
    boundary: "ADMISSION", reason: "Direct WorkOrder path; not proof of the Mission pilot lineage." }];
  const plan = input.plan;
  return [
    { code: "plan-approved", label: "Plan approved", passed: plan?.status === "APPROVED",
      reason: "Approve the exact governed Plan revision before dispatch." },
    { code: "plan-current", label: "Plan revision current", passed: Boolean(plan
      && plan.missionId === input.missionId && plan._id === input.currentPlanId
      && plan.revisionNumber === input.workOrderPlanRevision),
      reason: "WorkOrder must reference the Mission's current approved Plan and exact revision." },
    { code: "work-order-released", label: "WorkOrder released", passed: Boolean(input.releasedAt),
      reason: "Release the WorkOrder through governed Plan ingestion." },
  ].map(({ passed, ...check }) => ({ ...check, status: passed ? "PASS" : "BLOCKED", boundary: "ADMISSION" }));
}
