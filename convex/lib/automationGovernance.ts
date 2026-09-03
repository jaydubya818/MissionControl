export const AUTOMATION_POLICY_VERSION = "automation-v1";
export const AUTOMATION_CADENCE_MS = 7 * 24 * 60 * 60 * 1000;
/** Historical value retained so existing decisions keep their original audit meaning. */
export const AUTOMATION_ACTOR_IDENTITY_SOURCE = "CLIENT_ASSERTED_TRUSTED_OPERATOR" as const;
export const AUTOMATION_AUTHENTICATED_ACTOR_IDENTITY_SOURCE = "AUTHENTICATED_OPERATOR" as const;
export const AUTOMATION_DEMO_ACTOR_IDENTITY_SOURCE = "LOCAL_DEMO_OPERATOR" as const;
export const AUTOMATION_SYSTEM_ACTOR_IDENTITY_SOURCE = "SYSTEM" as const;

export function automationOperatorIdentitySource(mode: "AUTHENTICATED" | "DEMO") {
  return mode === "AUTHENTICATED"
    ? AUTOMATION_AUTHENTICATED_ACTOR_IDENTITY_SOURCE
    : AUTOMATION_DEMO_ACTOR_IDENTITY_SOURCE;
}

export type AutomationStatus = "DRAFT" | "DISABLED" | "ACTIVE" | "PAUSED" | "SUSPENDED" | "RETIRED" | "ARCHIVED";

export interface AutomationCandidatePayload {
  type: "AUTOMATION_CANDIDATE";
  candidateId: string;
  pattern: string;
  workflowId?: string;
  repository?: string;
  supportingWorkOrderIds: string[];
  occurrences: number;
  receiptCount: number;
  suggestedCadence: string;
  confidence: number;
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  estimatedHumanMinutesSaved: number;
  recommendedAutonomyLevel: "LEVEL_0" | "LEVEL_1";
}

export function isAutomationCandidatePayload(value: unknown): value is AutomationCandidatePayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Partial<AutomationCandidatePayload>;
  return payload.type === "AUTOMATION_CANDIDATE"
    && typeof payload.candidateId === "string"
    && typeof payload.pattern === "string"
    && Array.isArray(payload.supportingWorkOrderIds);
}

export function buildDisabledAutomationDefinition<ProjectId, CandidateId>(input: {
  projectId: ProjectId;
  sourceCandidateId: CandidateId;
  actorId: string;
  candidate: {
    pattern: string;
    repository?: string;
    suggestedCadence: string;
    riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  };
  workflow: { workflowId: string; version: number };
  now: number;
}) {
  return {
    projectId: input.projectId,
    sourceCandidateId: input.sourceCandidateId,
    definitionVersion: 1,
    name: input.candidate.pattern.replace(/^Workflow:\s*/, ""),
    description: `Governed repetition of ${input.candidate.pattern}`,
    ownerId: input.actorId,
    workflowId: input.workflow.workflowId,
    workflowVersion: `v${input.workflow.version}`,
    triggerType: "SCHEDULE" as const,
    triggerConfig: {
      cron: input.candidate.suggestedCadence,
      timezone: "America/Los_Angeles",
    },
    scope: input.candidate.repository ?? `workflow:${input.workflow.workflowId}`,
    repositoryIds: input.candidate.repository ? [input.candidate.repository] : [],
    environmentIds: [],
    autonomyLevel: "LEVEL_1" as const,
    isMutating: false,
    riskLevel: input.candidate.riskLevel,
    requiredApprovalTypes: ["operator"],
    verificationContract: {
      receiptRequired: true,
      independentValidatorRequired: true,
    },
    evidenceRequirements: ["passing verification receipt", "operator scope review"],
    maxDurationSeconds: 1800,
    maxRetries: 1,
    maxCostUsd: 5,
    concurrencyLimit: 1,
    idempotencyStrategy: "definition-and-cadence-window",
    overlapPolicy: "SKIP" as const,
    catchUpPolicy: "RUN_ONCE" as const,
    status: "DISABLED" as const,
    reliabilityState: "PROBATION" as const,
    health: "UNKNOWN" as const,
    createdAt: input.now,
    updatedAt: input.now,
  };
}

export function nextScheduledAt(now: number): number {
  return now + AUTOMATION_CADENCE_MS;
}

export function isReviewGateDue(
  definition: { status: AutomationStatus; nextRunAt?: number },
  now: number
): boolean {
  return definition.status === "ACTIVE" && (definition.nextRunAt == null || definition.nextRunAt <= now);
}

export function reviewGateIdempotencyKey(definitionId: string, scheduledAt: number): string {
  return `automation:${definitionId}:review-gate:${Math.floor(scheduledAt / AUTOMATION_CADENCE_MS)}`;
}

export function isAutomationSelfApproval(input: {
  automationDefinitionId?: string;
  requestedBy?: string;
  approver?: string;
}): boolean {
  if (!input.automationDefinitionId) return false;
  return !input.approver
    || input.approver === input.requestedBy
    || input.approver.startsWith("automation-");
}

export function buildReviewGate(
  definition: {
    id: string;
    name: string;
    workflowId: string;
    workflowVersion: string;
    scope: string;
    riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    requiredApprovalTypes: string[];
    verificationContract: unknown;
    triggerConfig: unknown;
  },
  scheduledAt: number
) {
  return {
    idempotencyKey: reviewGateIdempotencyKey(definition.id, scheduledAt),
    kind: "AUTOMATION" as const,
    title: `Review automation: ${definition.name}`,
    desiredOutcome: `Review and explicitly dispatch ${definition.workflowId}@${definition.workflowVersion} within the approved automation scope.`,
    context: "Created by a LEVEL_1 Automation. V1 scheduled Automations are restricted to read-only WorkOrders.",
    workflowId: definition.workflowId,
    priority: 3 as const,
    riskLevel: definition.riskLevel,
    isMutating: false,
    requestedBy: "automation-scheduler",
    requiredApprovals: definition.requiredApprovalTypes.length > 0
      ? definition.requiredApprovalTypes
      : ["operator"],
    state: "AWAITING_APPROVAL" as const,
    approvalStatus: "PENDING" as const,
    requiredHumanAction: "Review workflow version, scope, cost limit, and verification contract before dispatch.",
    acceptanceCriteria: [
      {
        id: "automation-scope-review",
        title: "Operator confirms automation scope and workflow version",
        description: `${definition.scope} · ${definition.workflowId}@${definition.workflowVersion}`,
        verificationMethod: "MANUAL" as const,
        status: "PENDING" as const,
      },
      {
        id: "automation-verification-contract",
        title: "Independent verification contract is acknowledged",
        description: JSON.stringify(definition.verificationContract),
        verificationMethod: "CHECKLIST" as const,
        status: "PENDING" as const,
      },
    ],
    metadata: {
      automationDefinitionId: definition.id,
      automationDefinitionName: definition.name,
      automationWorkflowVersion: definition.workflowVersion,
      automationCadenceWindow: reviewGateIdempotencyKey(definition.id, scheduledAt),
      automationCadence: definition.triggerConfig,
      automationTrigger: "SCHEDULE",
      automationScope: definition.scope,
      automationPolicy: {
        autonomyLevel: "LEVEL_1",
        isMutating: false,
        approvalRequired: true,
        independentReceiptRequired: true,
      },
      verificationContract: definition.verificationContract,
    },
  };
}

export function suspensionReason(input: {
  verificationFailed?: boolean;
  requiredReceiptMissing?: boolean;
  workflowVersionChanged?: boolean;
  costExceeded?: boolean;
  runtimeExceeded?: boolean;
}): string | null {
  if (input.verificationFailed) return "Verification failed";
  if (input.requiredReceiptMissing) return "Required receipt is missing";
  if (input.workflowVersionChanged) return "Workflow version changed";
  if (input.costExceeded) return "Cost limit exceeded";
  if (input.runtimeExceeded) return "Runtime limit exceeded";
  return null;
}

export function calculateAutomationMetrics(input: {
  definitions: Array<{ status: AutomationStatus }>;
  reviewGates: Array<{
    state: string;
    verificationStatus: string;
    approvalStatus: string;
    metadata?: { costUsd?: number; durationMs?: number };
  }>;
}) {
  const completed = input.reviewGates.filter((gate) => gate.state === "DONE");
  const passed = input.reviewGates.filter((gate) => gate.verificationStatus === "PASS");
  const missingReceipts = input.reviewGates.filter((gate) =>
    gate.state !== "AWAITING_APPROVAL" && gate.verificationStatus === "PENDING"
  ).length;
  return {
    active: input.definitions.filter((definition) => definition.status === "ACTIVE").length,
    paused: input.definitions.filter((definition) => definition.status === "PAUSED").length,
    suspended: input.definitions.filter((definition) => definition.status === "SUSPENDED").length,
    waitingApprovals: input.reviewGates.filter((gate) => gate.approvalStatus === "PENDING").length,
    failedRuns: input.reviewGates.filter((gate) => gate.verificationStatus === "FAIL").length,
    missingReceipts,
    verificationPassRate: input.reviewGates.length === 0 ? 0 : passed.length / input.reviewGates.length,
    successRate: input.reviewGates.length === 0 ? 0 : completed.length / input.reviewGates.length,
    costUsd: input.reviewGates.reduce((sum, gate) => sum + (gate.metadata?.costUsd ?? 0), 0),
  };
}
