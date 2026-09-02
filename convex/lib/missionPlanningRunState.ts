export const NONTERMINAL_MISSION_PLANNING_STATUSES = [
  "QUEUED",
  "RESEARCHING",
  "GENERATING",
  "VALIDATING",
] as const;

export type MissionPlanningHarnessPhase = "RESEARCH" | "GENERATION";

export function selectActiveMissionPlanningRun<T extends { status: string; createdAt: number }>(runs: T[]): T | null {
  return runs
    .filter((run) => NONTERMINAL_MISSION_PLANNING_STATUSES.includes(run.status as any))
    .sort((left, right) => left.createdAt - right.createdAt)[0] ?? null;
}

export function appendMissionPlanningExecutionReceipt(
  existing: unknown[] | undefined,
  receipt: any,
  planningRepositorySha: string,
) {
  assertMissionPlanningExecutionReceipt(receipt, planningRepositorySha);
  const receipts = Array.isArray(existing) ? [...existing] : [];
  const duplicateIndex = receipts.findIndex((candidate: any) =>
    candidate?.executionId === receipt.executionId && candidate?.phase === receipt.phase
  );
  if (duplicateIndex < 0) return [...receipts, receipt];
  if (JSON.stringify(receipts[duplicateIndex]) !== JSON.stringify(receipt)) {
    throw new Error("Planning execution receipt identity was reused with different evidence.");
  }
  return receipts;
}

export function requireCompletedMissionPlanningReceipts(receipts: unknown[] | undefined) {
  const values = Array.isArray(receipts) ? receipts as any[] : [];
  for (const phase of ["RESEARCH", "GENERATION"] as const) {
    if (!values.some((receipt) => receipt?.phase === phase && receipt?.status === "COMPLETED")) {
      throw new Error(`Planning success requires a durable completed ${phase.toLowerCase()} execution receipt.`);
    }
  }
  return values;
}

function assertMissionPlanningExecutionReceipt(receipt: any, planningRepositorySha: string) {
  if (!receipt
    || !["RESEARCH", "GENERATION"].includes(receipt.phase)
    || typeof receipt.executionId !== "string"
    || !receipt.executionId
    || !["COMPLETED", "FAILED", "CANCELED", "TIMED_OUT"].includes(receipt.status)
    || !receipt.harness
    || !receipt.provenance
    || !receipt.promptIdentity
    || receipt.repository?.baselineCommit !== planningRepositorySha) {
    throw new Error("Planning execution receipt is incomplete or is not bound to the exact planning SHA.");
  }
  if (receipt.status === "COMPLETED"
    && (receipt.repository?.headCommit !== planningRepositorySha
      || receipt.repository?.headChanged
      || receipt.repository?.changedFiles?.length
      || receipt.repository?.scopeViolations?.length)) {
    throw new Error("Completed planning execution receipt violates the exact read-only repository boundary.");
  }
}
