export function factoryWorkflowContractIssues(workflow: any): string[] {
  if (!workflow?.active || !Array.isArray(workflow.steps) || workflow.steps.length === 0) {
    return ["workflow-unavailable"];
  }
  const issues: string[] = [];
  for (const step of workflow.steps) {
    const stepId = typeof step?.id === "string" ? step.id : "unknown-step";
    if (/STATUS\s*:\s*done/i.test(String(step?.expects ?? ""))) {
      issues.push(`${stepId}:heuristic-completion`);
    }
    if (step?.kind !== "GATE") {
      const required = Array.isArray(step?.outputSchema?.required) ? step.outputSchema.required : [];
      if (step?.outputSchema?.type !== "object" || !required.includes("status") || step?.outputSchema?.properties?.status?.type !== "string") {
        issues.push(`${stepId}:structured-status-required`);
      }
    }
    if (/\bgh\s+pr\s+(?:create|merge|review)\b|approve\s+for\s+merge|merge\s+(?:the\s+)?pull\s+request/i.test(String(step?.input ?? ""))) {
      issues.push(`${stepId}:provider-authority-forbidden`);
    }
  }
  return issues;
}

export type WorkflowRunCompatibilityClassification =
  | "CURRENT"
  | "LEGACY_BUT_VALID"
  | "MALFORMED"
  | "INCOMPLETE"
  | "STALE_SCHEMA"
  | "GENUINELY_INVALID";

/** Read-only compatibility projection. It never rewrites source status or
 * invents a terminal outcome for historical records. */
export function workflowRunCompatibilityProjection(
  run: any,
  installedWorkflow: any,
  now = Date.now(),
) {
  const originalStatus = typeof run?.status === "string" ? run.status : null;
  const steps = Array.isArray(run?.steps) ? run.steps : [];
  const snapshot = run?.workflowSnapshot;
  const sourceWorkflow = snapshot && typeof snapshot === "object" ? snapshot : installedWorkflow;
  const contractIssues = factoryWorkflowContractIssues(sourceWorkflow);
  const terminal = ["COMPLETED", "FAILED", "CANCELED"].includes(originalStatus ?? "");
  const completedWithNoCompletedStep = originalStatus === "COMPLETED"
    && steps.length > 0
    && steps.every((step: any) => step?.status !== "DONE" && step?.status !== "SKIPPED");
  const malformed = !run || typeof run !== "object" || !originalStatus || !Array.isArray(run.steps);
  const staleNonTerminal = ["PENDING", "RUNNING", "PAUSED"].includes(originalStatus ?? "")
    && Number.isFinite(run?.startedAt)
    && now - run.startedAt > 24 * 60 * 60 * 1_000;

  let classification: WorkflowRunCompatibilityClassification;
  if (malformed) classification = "MALFORMED";
  else if (completedWithNoCompletedStep) classification = "GENUINELY_INVALID";
  else if (!run.workflowVersion || !snapshot) classification = terminal ? "LEGACY_BUT_VALID" : "INCOMPLETE";
  else if (contractIssues.length > 0) classification = "STALE_SCHEMA";
  else if (staleNonTerminal) classification = "INCOMPLETE";
  else classification = "CURRENT";

  const normalizedStatus = classification === "GENUINELY_INVALID" || classification === "MALFORMED"
    ? null
    : originalStatus;
  return {
    schema: "factory-workflow-run-compatibility/v1" as const,
    classification,
    original: {
      status: originalStatus,
      workflowId: typeof run?.workflowId === "string" ? run.workflowId : null,
      workflowVersion: Number.isSafeInteger(run?.workflowVersion) ? run.workflowVersion : null,
      snapshotPresent: Boolean(snapshot),
    },
    normalized: {
      status: normalizedStatus,
      lineage: normalizedStatus === null ? "UNRESOLVED" as const : "PRESERVED_SOURCE" as const,
    },
    contractIssues,
    staleNonTerminal,
    executionEligible: classification === "CURRENT",
  };
}
