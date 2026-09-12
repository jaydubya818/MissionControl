import { renderMarkdownWorkloadIssues, type RenderMarkdownWorkload } from "@mission-control/workflow-engine/harness-contract";
import { verifyDocumentTemplateIssues, type VerifyDocumentTemplate } from "@mission-control/workflow-engine/harness-contract";
import { isNoInferenceConstraint, OFFLINE_EXECUTION_PROFILE_SCHEMA } from "./offlineExecutionPolicy";
import { computeCanonicalHash } from "./genomeHash";

export const DETERMINISTIC_WORKFLOW_CONTRACT = "factory-workflow-contract/v2";

/** Composition compatibility only. Callers must still load and validate the
 * current admitted profile, workspace authority and all canonical gates. */
export function deterministicFactoryOperation(input: {
  workflow: unknown;
  profileSnapshot: unknown;
  purpose: string;
  riskBoundary: string;
  agentBindings: unknown[];
  modelRoute?: unknown;
  modelCatalogId?: unknown;
  modelRouteDigest?: unknown;
}): RenderMarkdownWorkload | VerifyDocumentTemplate {
  const profile = input.profileSnapshot as Record<string, any> | null;
  if (!profile || profile.schema !== OFFLINE_EXECUTION_PROFILE_SCHEMA
    || profile.executionBackend !== "isolated-container"
    || !isNoInferenceConstraint(profile.modelRoute)
    || !["SOFTWARE", "VERIFICATION"].includes(input.purpose) || input.riskBoundary !== "GREEN"
    || input.agentBindings.length !== 0
    || input.modelRoute !== undefined || input.modelCatalogId !== undefined || input.modelRouteDigest !== undefined
    || factoryWorkflowContractIssues(input.workflow).length > 0) {
    throw new Error("Deterministic Factory requires an exact offline profile, bounded purpose/GREEN scope and no inference authority");
  }
  const operation = deterministicWorkflowOperation(input.workflow);
  const verification = input.purpose === "VERIFICATION";
  if (verification
    ? operation.reference !== "verify-document-bytes/v1"
      || computeCanonicalHash(profile.offlinePolicy?.capabilities) !== computeCanonicalHash(["verify-document-bytes"])
      || computeCanonicalHash(profile.isolationModes) !== computeCanonicalHash(["READ_ONLY"])
    : operation.reference !== "render-markdown/v1"
      || computeCanonicalHash(profile.offlinePolicy?.capabilities) !== computeCanonicalHash(["render-markdown", "synthetic-receipt"])) {
    throw new Error("Deterministic operation does not match the exact Factory purpose and capability scope");
  }
  return operation;
}

export function deterministicFactoryVersionIssues(version: any, workflow: unknown): string[] {
  if (version?.executionBackend !== "isolated-container") return ["deterministic-backend-required"];
  if (!isNoInferenceConstraint(version.inferenceConstraint)
    || ["modelCatalogId", "modelRouteDigest", "modelRouteSnapshot", "modelQualificationDigest", "modelQualificationSnapshot"]
      .some(field => version[field] !== undefined)) return ["deterministic-inference-authority-forbidden"];
  try {
    const operation = deterministicFactoryOperation({ workflow, profileSnapshot: version.executionProfileSnapshot,
      purpose: version.purpose, riskBoundary: version.riskBoundary, agentBindings: version.agentBindings ?? [] });
    return computeCanonicalHash(operation) === computeCanonicalHash(version.deterministicOperation)
      ? [] : ["deterministic-operation-identity-mismatch"];
  } catch { return ["deterministic-composition-invalid"]; }
}

/** Registered deterministic operations have no inference role or ambient tools.
 * The normal Factory/Attempt and independent verification gates still apply. */
export function deterministicWorkflowOperation(workflow: any): RenderMarkdownWorkload | VerifyDocumentTemplate {
  if (workflow?.contractVersion !== DETERMINISTIC_WORKFLOW_CONTRACT
    || !Array.isArray(workflow.agents) || workflow.agents.length !== 0
    || !Array.isArray(workflow.steps) || workflow.steps.length !== 1
    || (workflow.topology !== undefined && workflow.topology !== "LINEAR")
    || (workflow.maxConcurrency !== undefined && workflow.maxConcurrency !== 1)
    || workflow.convergence !== undefined) throw new Error("Deterministic workflow shape is invalid");
  const step = workflow.steps[0];
  const allowedStepFields = new Set(["id", "kind", "agent", "retryLimit", "timeoutMinutes", "dependsOn", "failurePolicy", "isolation", "input", "expects", "outputSchema"]);
  if (!step || typeof step !== "object" || Array.isArray(step)
    || Object.keys(step).some(key => !allowedStepFields.has(key))
    || typeof step.id !== "string" || !/^[a-z][a-z0-9-]{0,99}$/.test(step.id)
    || step.kind !== "DETERMINISTIC" || step.agent !== "" || step.retryLimit !== 0
    || !Number.isFinite(step.timeoutMinutes) || step.timeoutMinutes <= 0 || step.timeoutMinutes > 1
    || (step.dependsOn !== undefined && (!Array.isArray(step.dependsOn) || step.dependsOn.length !== 0))
    || step.modelTier !== undefined || step.condition !== undefined
    || (step.failurePolicy !== undefined && step.failurePolicy !== "BLOCK")
    || (step.isolation !== undefined && step.isolation !== "WORKTREE")
    || typeof step.input !== "string" || step.input.length > 20_000) throw new Error("Deterministic step authority is invalid");
  const operation: unknown = JSON.parse(step.input);
  if (renderMarkdownWorkloadIssues(operation).length && verifyDocumentTemplateIssues(operation).length) throw new Error("Deterministic operation is invalid");
  return operation as RenderMarkdownWorkload | VerifyDocumentTemplate;
}

export function factoryWorkflowContractIssues(workflow: any): string[] {
  if (!workflow?.active || !Array.isArray(workflow.steps) || workflow.steps.length === 0) {
    return ["workflow-unavailable"];
  }
  const issues: string[] = [];
  if (workflow.contractVersion === DETERMINISTIC_WORKFLOW_CONTRACT) {
    try { deterministicWorkflowOperation(workflow); } catch { issues.push("deterministic-workflow-invalid"); }
  } else if (workflow.steps.some((step: any) => step?.kind === "DETERMINISTIC")) {
    issues.push("deterministic-workflow-version-required");
  }
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
