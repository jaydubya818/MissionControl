export const FACTORY_DEPENDENCY_TYPES = [
  "ACCEPTED_OUTPUT_REQUIRED",
  "EXECUTION_COMPLETE",
  "ARTIFACT_AVAILABLE",
  "OPTIONAL",
  "INFORMATIONAL",
] as const;

export type FactoryDependencyType = typeof FACTORY_DEPENDENCY_TYPES[number];
export type FactoryTerminalOutcome =
  | "ACCEPTED"
  | "PRODUCT_FAILED"
  | "FACTORY_FAILED"
  | "BLOCKED"
  | "CANCELLED"
  | "SUPERSEDED";

export type FactoryFailureOwner = "PRODUCT" | "FACTORY" | "ENVIRONMENT" | "CONTRACT" | "DEPENDENCY";

export function factoryOperationalControlEffect(input: {
  mode: "NORMAL" | "PAUSED" | "DRAINING" | "KILLED" | "QUARANTINED";
  operation: "CLAIM" | "ACTIVE_EXECUTION" | "CANCEL_SELECTED";
}) {
  if (input.operation === "CANCEL_SELECTED") return { allow: true, abortActive: true, durableCancellationRequired: true };
  if (input.operation === "ACTIVE_EXECUTION") {
    if (input.mode === "PAUSED" || input.mode === "DRAINING" || input.mode === "NORMAL") {
      return { allow: true, abortActive: false, durableCancellationRequired: false };
    }
    return { allow: false, abortActive: true, durableCancellationRequired: input.mode === "KILLED" };
  }
  return {
    allow: input.mode === "NORMAL",
    abortActive: false,
    durableCancellationRequired: false,
  };
}

export interface FactoryRunMemberLike {
  factoryRunId: unknown;
  workOrderId: unknown;
  workOrderRevisionNumber: number;
  sourcePlanRevision: number;
  sequence: number;
  addedAt: number;
}

export interface FactoryWorkOrderLike {
  _id: unknown;
  title?: string;
  state?: string;
  currentRevisionNumber?: number;
  acceptedRevisionNumber?: number;
  verificationStatus?: string;
  blockingIssue?: string;
  requiredHumanAction?: string;
}

export interface FactoryDependencyLike {
  workOrderId: unknown;
  dependsOnWorkOrderId: unknown;
  dependencyType?: FactoryDependencyType;
  requiredRevisionNumber?: number;
}

export interface FactoryDependencyEvaluation {
  satisfied: boolean;
  blocking: boolean;
  dependencyType: FactoryDependencyType;
  reasonCode: string;
  summary: string;
}

export function evaluateFactoryDependency(input: {
  dependency: FactoryDependencyLike;
  predecessor?: FactoryWorkOrderLike | null;
  executionTerminal?: boolean;
  artifactAvailable?: boolean;
}): FactoryDependencyEvaluation {
  const dependencyType = input.dependency.dependencyType ?? "ACCEPTED_OUTPUT_REQUIRED";
  if (dependencyType === "OPTIONAL" || dependencyType === "INFORMATIONAL") {
    return {
      satisfied: true,
      blocking: false,
      dependencyType,
      reasonCode: dependencyType,
      summary: dependencyType === "OPTIONAL" ? "Optional dependency does not block dispatch." : "Informational dependency does not block dispatch.",
    };
  }
  if (!input.predecessor) {
    return {
      satisfied: false,
      blocking: true,
      dependencyType,
      reasonCode: "DEPENDENCY_NOT_FOUND",
      summary: "The predecessor is not a member of this Factory Run.",
    };
  }
  if (dependencyType === "EXECUTION_COMPLETE") {
    return {
      satisfied: input.executionTerminal === true,
      blocking: input.executionTerminal !== true,
      dependencyType,
      reasonCode: input.executionTerminal ? "EXECUTION_COMPLETE" : "EXECUTION_NOT_TERMINAL",
      summary: input.executionTerminal ? "Predecessor execution is terminal." : "Predecessor execution has not reached a terminal state.",
    };
  }
  if (dependencyType === "ARTIFACT_AVAILABLE") {
    return {
      satisfied: input.artifactAvailable === true,
      blocking: input.artifactAvailable !== true,
      dependencyType,
      reasonCode: input.artifactAvailable ? "ARTIFACT_AVAILABLE" : "ARTIFACT_UNAVAILABLE",
      summary: input.artifactAvailable ? "Required predecessor artifact is available." : "Required predecessor artifact is not available.",
    };
  }
  const requiredRevision = input.dependency.requiredRevisionNumber ?? input.predecessor.currentRevisionNumber ?? 1;
  const accepted = input.predecessor.state === "DONE"
    && input.predecessor.acceptedRevisionNumber === requiredRevision
    && (input.predecessor.currentRevisionNumber ?? 1) === requiredRevision;
  return {
    satisfied: accepted,
    blocking: !accepted,
    dependencyType,
    reasonCode: accepted ? "ACCEPTED_REVISION_MATCH" : "ACCEPTED_OUTPUT_REQUIRED",
    summary: accepted
      ? `Predecessor revision ${requiredRevision} is accepted.`
      : `Predecessor revision ${requiredRevision} must be accepted before dispatch.`,
  };
}

export function classifyFactoryTerminalOutcome(input: {
  accepted?: boolean;
  cancelled?: boolean;
  superseded?: boolean;
  terminal?: boolean;
  verificationVerdict?: string | null;
  failedChecks?: number;
  failureOwner?: FactoryFailureOwner | null;
  dependenciesBlocked?: boolean;
}): { outcome: FactoryTerminalOutcome | null; reasonCode: string; summary: string } {
  if (input.superseded) return { outcome: "SUPERSEDED", reasonCode: "SUPERSEDED", summary: "A newer governed subject replaced this one." };
  if (input.cancelled) return { outcome: "CANCELLED", reasonCode: "CANCELLED_BY_AUTHORITY", summary: "Execution was cancelled by an authorized actor or policy." };
  if (input.accepted) return { outcome: "ACCEPTED", reasonCode: "EXACT_REVISION_ACCEPTED", summary: "The exact current revision is verified and accepted." };
  if (input.failureOwner === "PRODUCT" && (input.failedChecks ?? 0) > 0) {
    return { outcome: "PRODUCT_FAILED", reasonCode: "CANDIDATE_ASSERTION_FAILED", summary: "Candidate-bearing evidence disproved a required product assertion." };
  }
  if (["FACTORY", "ENVIRONMENT", "CONTRACT"].includes(input.failureOwner ?? "")) {
    return {
      outcome: input.failureOwner === "ENVIRONMENT" ? "BLOCKED" : "FACTORY_FAILED",
      reasonCode: input.failureOwner === "ENVIRONMENT" ? "VERIFICATION_ENVIRONMENT_UNAVAILABLE" : `${input.failureOwner}_FAILURE`,
      summary: input.failureOwner === "ENVIRONMENT"
        ? "The required verification environment could not be established."
        : "Factory infrastructure or the governed contract failed independently of product behavior.",
    };
  }
  if (input.dependenciesBlocked || input.failureOwner === "DEPENDENCY" || input.verificationVerdict === "BLOCKED") {
    return { outcome: "BLOCKED", reasonCode: "ADVANCEMENT_BLOCKED", summary: "A named dependency, policy, or authority gate prevents advancement." };
  }
  if (input.terminal && input.verificationVerdict === "NOT_VERIFIED") {
    return { outcome: "FACTORY_FAILED", reasonCode: "NOT_VERIFIED_WITHOUT_PRODUCT_EVIDENCE", summary: "Verification ended without qualifying product-failure evidence." };
  }
  return { outcome: null, reasonCode: "NON_TERMINAL", summary: "The governed lifecycle is still active." };
}

export type FactoryCrashPoint =
  | "LEASED_BEFORE_EXECUTOR"
  | "PRODUCER_RUNNING"
  | "CANDIDATE_CAPTURED_BEFORE_FINALIZATION"
  | "VERIFIER_RUNNING"
  | "VERDICT_PERSISTED_BEFORE_RECONCILIATION"
  | "ACCEPTANCE_TRANSITION";

export interface FactoryReconciliationResult {
  disposition: "STALE" | "RECOVERABLE" | "BLOCKED" | "TERMINAL";
  reasonCode: string;
  preserveAttempt: true;
  createNewAttempt: boolean;
  actions: string[];
}

export function reconcileFactoryCrashPoint(input: {
  crashPoint: FactoryCrashPoint;
  leaseLive: boolean;
  processLive: boolean;
  candidateCaptured: boolean;
  verdictPersisted: boolean;
  accepted: boolean;
}): FactoryReconciliationResult {
  if (input.accepted) {
    return { disposition: "TERMINAL", reasonCode: "ACCEPTANCE_DURABLE", preserveAttempt: true, createNewAttempt: false, actions: ["RECONCILE_PARENTS"] };
  }
  if (input.verdictPersisted) {
    return { disposition: "RECOVERABLE", reasonCode: "VERDICT_AWAITS_RECONCILIATION", preserveAttempt: true, createNewAttempt: false, actions: ["RECONCILE_WORK_ORDER", "RECONCILE_FACTORY_RUN"] };
  }
  if (input.candidateCaptured) {
    return { disposition: "RECOVERABLE", reasonCode: "CANDIDATE_AWAITS_FINALIZATION", preserveAttempt: true, createNewAttempt: false, actions: ["FINALIZE_PRODUCER_FROM_CANDIDATE", "SCHEDULE_VERIFICATION"] };
  }
  if (input.processLive && input.leaseLive) {
    return { disposition: "BLOCKED", reasonCode: "OWNER_STILL_LIVE", preserveAttempt: true, createNewAttempt: false, actions: ["WAIT_FOR_OWNER"] };
  }
  if (!input.leaseLive || !input.processLive) {
    return {
      disposition: "STALE",
      reasonCode: input.crashPoint === "VERIFIER_RUNNING" ? "VERIFIER_OWNER_LOST" : "EXECUTOR_OWNER_LOST",
      preserveAttempt: true,
      createNewAttempt: true,
      actions: ["MARK_EXISTING_ATTEMPT_STALE", "CREATE_GOVERNED_RECOVERY_ATTEMPT"],
    };
  }
  return { disposition: "BLOCKED", reasonCode: "RECONCILIATION_EVIDENCE_INCOMPLETE", preserveAttempt: true, createNewAttempt: false, actions: ["REQUEST_OPERATOR_REVIEW"] };
}

function id(value: unknown) {
  return String(value ?? "");
}

function latest<T>(rows: T[], at: (row: T) => number) {
  return [...rows].sort((left, right) => at(right) - at(left))[0] ?? null;
}

export function buildWorkOrderProgress(input: {
  workOrder: FactoryWorkOrderLike;
  tasks?: Array<{ status?: string }>;
  attempts?: Array<any>;
  verificationRuns?: Array<any>;
  evidence?: Array<any>;
  acceptance?: { eligible?: boolean; accepted?: boolean; reasons?: string[] } | null;
  dependencies?: Array<FactoryDependencyLike & { predecessor?: FactoryWorkOrderLike | null; executionTerminal?: boolean; artifactAvailable?: boolean }>;
}) {
  const tasks = input.tasks ?? [];
  const attempts = input.attempts ?? [];
  const verificationRuns = input.verificationRuns ?? [];
  const evidence = input.evidence ?? [];
  const currentAttempt = latest(attempts, (attempt) => attempt._creationTime ?? attempt.startedAt ?? 0);
  const latestVerification = latest(verificationRuns, (run) => run.createdAt ?? run.startedAt ?? 0);
  const sourceAttempt = attempts.find((attempt) => id(attempt._id) === id(latestVerification?.sourceAttemptId))
    ?? attempts.find((attempt) => attempt.attemptPurpose === "IMPLEMENTATION" && attempt.headSha)
    ?? null;
  const dependencyResults = (input.dependencies ?? []).map((dependency) => ({
    workOrderId: id(dependency.dependsOnWorkOrderId),
    ...evaluateFactoryDependency({
      dependency,
      predecessor: dependency.predecessor,
      executionTerminal: dependency.executionTerminal,
      artifactAvailable: dependency.artifactAvailable,
    }),
  }));
  const counts = {
    total: tasks.length,
    accepted: tasks.filter((task) => ["DONE", "COMPLETED"].includes(task.status ?? "")).length,
    active: tasks.filter((task) => ["IN_PROGRESS", "RUNNING", "REVIEW"].includes(task.status ?? "")).length,
    blocked: tasks.filter((task) => task.status === "BLOCKED").length,
    failed: tasks.filter((task) => task.status === "FAILED").length,
  };
  const checks = latestVerification?.checks ?? [];
  const acceptance = input.acceptance ?? null;
  const unsatisfied = dependencyResults.filter((result) => result.blocking && !result.satisfied);
  const currentGate = input.workOrder.state === "DONE" ? "ACCEPTED"
    : unsatisfied.length ? "DEPENDENCIES"
      : !sourceAttempt?.headSha ? "EXECUTION"
        : latestVerification?.verdict !== "VERIFIED" ? "VERIFICATION"
          : !acceptance?.accepted ? "ACCEPTANCE" : "ACCEPTED";
  const blockingReason = unsatisfied[0]?.summary
    ?? input.workOrder.blockingIssue
    ?? acceptance?.reasons?.[0]
    ?? null;
  return {
    workOrderId: id(input.workOrder._id),
    title: input.workOrder.title ?? "Untitled WorkOrder",
    revision: input.workOrder.currentRevisionNumber ?? 1,
    approvalState: input.workOrder.state === "AWAITING_APPROVAL" ? "PENDING" : "APPROVED_OR_NOT_REQUIRED",
    lifecycleState: input.workOrder.state ?? "DRAFT",
    tasks: counts,
    attempt: {
      currentAttemptId: currentAttempt?._id ? id(currentAttempt._id) : null,
      executionStatus: currentAttempt?.status ?? null,
      runtimeStatus: currentAttempt?.runtimeDisposition ?? (currentAttempt?.lease ? "OWNED" : null),
    },
    candidate: {
      exists: Boolean(sourceAttempt?.headSha),
      candidateId: sourceAttempt?.verificationSubject?.subjectId ?? null,
      commit: sourceAttempt?.headSha ?? null,
      tree: sourceAttempt?.treeSha ?? null,
      revision: sourceAttempt?.workOrderRevisionNumber ?? null,
    },
    verification: {
      latestVerificationAttempt: latestVerification?.workflowRunId ? id(latestVerification.workflowRunId) : null,
      executionStatus: latestVerification?.status ?? null,
      verdict: latestVerification?.verdict ?? null,
      verifiedChecks: checks.filter((check: any) => check.status === "PASS").length,
      failedChecks: checks.filter((check: any) => check.status === "FAIL").length,
      blockedChecks: checks.filter((check: any) => ["BLOCKED_BY_DEPENDENCY", "NOT_EVALUATED", "TIMED_OUT", "ERROR"].includes(check.status)).length,
    },
    acceptance: {
      eligible: acceptance?.eligible === true,
      accepted: acceptance?.accepted === true || input.workOrder.state === "DONE",
      blockingReason,
    },
    dependencies: {
      satisfied: dependencyResults.filter((result) => result.satisfied).length,
      unsatisfied: unsatisfied.length,
      blockers: unsatisfied,
    },
    evidence: {
      total: evidence.length,
      immutableHistoryAvailable: evidence.length > 0,
    },
    progress: {
      currentGate,
      nextRequiredAction: currentGate === "DEPENDENCIES" ? "Accept the required predecessor revision."
        : currentGate === "EXECUTION" ? "Dispatch an approved producer Attempt."
          : currentGate === "VERIFICATION" ? "Complete independent verification."
            : currentGate === "ACCEPTANCE" ? "Record governed acceptance for the verified candidate."
              : "No further action required.",
    },
  };
}

export function compareVerificationHistory(input: {
  verificationRuns: Array<any>;
  attempts: Array<any>;
  evidence: Array<any>;
}) {
  const attemptsById = new Map(input.attempts.map((attempt) => [id(attempt._id), attempt]));
  return [...input.verificationRuns]
    .sort((left, right) => (right.createdAt ?? 0) - (left.createdAt ?? 0))
    .map((run) => {
      const verifier = attemptsById.get(id(run.workflowRunId));
      const producer = attemptsById.get(id(run.sourceAttemptId));
      const runEvidence = input.evidence.filter((item) => id(item.verificationRunId) === id(run._id));
      const productFailures = (run.checks ?? []).filter((check: any) => check.status === "FAIL").length;
      const outcome = run.verdict === "VERIFIED"
        ? { outcome: null, reasonCode: "VERIFIED_AWAITING_ACCEPTANCE", summary: "Independent verification passed; acceptance remains a separate durable decision." }
        : classifyFactoryTerminalOutcome({
          terminal: ["COMPLETED", "FAILED", "CANCELED"].includes(run.status),
          cancelled: run.status === "CANCELED",
          verificationVerdict: run.verdict,
          failedChecks: productFailures,
          failureOwner: productFailures > 0 ? "PRODUCT" : run.status === "FAILED" ? "FACTORY" : run.verdict === "BLOCKED" ? "DEPENDENCY" : null,
        });
      return {
        verificationRunId: id(run._id),
        attemptId: id(run.workflowRunId),
        candidateCommit: run.candidateRevision ?? producer?.headSha ?? null,
        candidateTree: producer?.treeSha ?? null,
        producerIdentity: producer ? {
          attemptId: id(producer._id),
          invocationId: producer.executorInvocationId ?? null,
          adapter: producer.executorAdapter ?? null,
        } : null,
        verifierIdentity: verifier ? {
          attemptId: id(verifier._id),
          invocationId: verifier.executorInvocationId ?? null,
          adapter: verifier.executorAdapter ?? null,
        } : null,
        executionResult: run.status,
        verificationVerdict: run.verdict ?? null,
        terminalOutcome: outcome.outcome,
        outcomeReason: outcome.summary,
        evidenceResults: runEvidence.map((item) => ({ checkId: item.checkId, result: item.result, summary: item.summary })),
        timestamp: run.completedAt ?? run.createdAt ?? run.startedAt ?? null,
      };
    });
}

export function summarizeFactoryRun(input: {
  factoryRunId: unknown;
  members: FactoryRunMemberLike[];
  workOrders: FactoryWorkOrderLike[];
  dependencies?: FactoryDependencyLike[];
}) {
  const members = input.members
    .filter((member) => id(member.factoryRunId) === id(input.factoryRunId))
    .sort((left, right) => left.sequence - right.sequence);
  const workOrdersById = new Map(input.workOrders.map((workOrder) => [id(workOrder._id), workOrder]));
  const memberIds = new Set(members.map((member) => id(member.workOrderId)));
  const rows = members.map((member) => workOrdersById.get(id(member.workOrderId))).filter(Boolean) as FactoryWorkOrderLike[];
  const dependencyRows = (input.dependencies ?? []).filter((dependency) => memberIds.has(id(dependency.workOrderId)));
  const eligible = members.filter((member) => {
    const dependencies = dependencyRows.filter((dependency) => id(dependency.workOrderId) === id(member.workOrderId));
    return dependencies.every((dependency) => evaluateFactoryDependency({
      dependency,
      predecessor: workOrdersById.get(id(dependency.dependsOnWorkOrderId)),
    }).satisfied);
  });
  const counts = {
    total: rows.length,
    accepted: rows.filter((row) => row.state === "DONE" && row.acceptedRevisionNumber === (row.currentRevisionNumber ?? 1)).length,
    active: rows.filter((row) => ["DISPATCHED", "IN_PROGRESS", "AWAITING_VERIFICATION"].includes(row.state ?? "")).length,
    blocked: rows.filter((row) => ["BLOCKED", "AWAITING_APPROVAL"].includes(row.state ?? "")).length,
    failed: rows.filter((row) => row.verificationStatus === "FAIL").length,
  };
  const outcome = counts.total > 0 && counts.accepted === counts.total
    ? classifyFactoryTerminalOutcome({ accepted: true })
    : rows.some((row) => row.verificationStatus === "FAIL")
      ? classifyFactoryTerminalOutcome({ terminal: true, verificationVerdict: "NOT_VERIFIED", failedChecks: 1, failureOwner: "PRODUCT" })
      : rows.some((row) => row.state === "CANCELED")
        ? classifyFactoryTerminalOutcome({ cancelled: true })
        : { outcome: null, reasonCode: "NON_TERMINAL", summary: "The Factory Run has unfinished member WorkOrders." };
  return {
    counts,
    outcome,
    memberWorkOrderIds: members.map((member) => id(member.workOrderId)),
    dispatchFrontier: eligible
      .filter((member) => !["DONE", "DISPATCHED", "IN_PROGRESS", "AWAITING_VERIFICATION"].includes(workOrdersById.get(id(member.workOrderId))?.state ?? ""))
      .map((member) => id(member.workOrderId)),
    criticalPathWorkOrderId: members.find((member) => workOrdersById.get(id(member.workOrderId))?.state !== "DONE")
      ? id(members.find((member) => workOrdersById.get(id(member.workOrderId))?.state !== "DONE")!.workOrderId)
      : null,
  };
}
