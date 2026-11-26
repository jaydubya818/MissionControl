export const LEARNING_SIGNAL_TYPES = [
  "HUMAN_CORRECTION",
  "REPEATED_INSTRUCTION",
  "VERIFICATION_FAILURE",
  "DETERMINISTIC_GATE_FAILURE",
  "RETRY_REQUIRED",
  "RECOVERY_REQUIRED",
  "CONTEXT_MISS",
  "CONTEXT_OVERLOAD",
  "MODEL_ROUTING_MISMATCH",
  "TOOL_SELECTION_MISMATCH",
  "RECIPE_MISMATCH",
  "PROMPT_AMBIGUITY",
  "AGENT_CONFIG_DRIFT",
  "UNNECESSARY_AGENT_USAGE",
  "TOKEN_WASTE",
  "HUMAN_INTERVENTION",
  "REPEATED_REVIEW_FINDING",
] as const;

export type LearningSignalType = (typeof LEARNING_SIGNAL_TYPES)[number];
export type LearningSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export const IMPROVEMENT_CANDIDATE_TYPES = [
  "ADD_DETERMINISTIC_GATE",
  "MODIFY_GATE",
  "UPDATE_PROMPT",
  "UPDATE_AGENT_RULE",
  "ADD_OR_UPDATE_SKILL",
  "UPDATE_CONTEXT_POLICY",
  "CHANGE_RECIPE",
  "CHANGE_RETRY_POLICY",
  "CHANGE_MODEL_ROUTING",
  "CHANGE_TOOL_CONFIG",
  "REPLACE_AGENT_WITH_CODE",
  "ADD_DOCUMENTATION",
] as const;

export type ImprovementCandidateType =
  (typeof IMPROVEMENT_CANDIDATE_TYPES)[number];

export interface LearningSignalInput {
  projectId: string;
  repositoryKey: string;
  signalType: LearningSignalType;
  deterministicKey: string;
  evidenceFingerprint: string;
  evidenceRefs: string[];
  observedAt: number;
  confidence: number;
  severity: LearningSeverity;
  reason: string;
  acceptanceAuthority: false;
  observedModelCalls?: number;
  observedTokens?: number;
  observedCostUsd?: number;
}

export interface LearningClusterProjection {
  projectId: string;
  repositoryKey: string;
  signalType: LearningSignalType;
  deterministicKey: string;
  clusterKey: string;
  occurrenceCount: number;
  evidenceCount: number;
  evidenceFingerprints: string[];
  evidenceRefs: string[];
  firstObservedAt: number;
  lastObservedAt: number;
  confidence: number;
  severity: LearningSeverity;
  reason: string;
  qualifiesForCandidate: boolean;
  observedCostImpact?: {
    modelCalls?: number;
    tokens?: number;
    costUsd?: number;
  };
  acceptanceAuthority: false;
}

export interface ImprovementCandidateProjection {
  candidateType: ImprovementCandidateType;
  problemStatement: string;
  proposedChange: string;
  expectedBenefit: string;
  risk: LearningSeverity;
  estimatedEffort: "SMALL" | "MEDIUM" | "LARGE";
  evidenceCount: number;
  confidence: number;
  observedCostImpact?: LearningClusterProjection["observedCostImpact"];
  acceptanceAuthority: false;
}

export interface ObservationLearningSignal {
  signalType: Extract<
    LearningSignalType,
    "CONTEXT_MISS" | "CONTEXT_OVERLOAD" | "RECIPE_MISMATCH" | "UNNECESSARY_AGENT_USAGE"
  >;
  deterministicKey: string;
  reason: string;
  confidence: number;
  severity: LearningSeverity;
}

export interface MissionSpecLearningSignal {
  signalType: Extract<LearningSignalType, "PROMPT_AMBIGUITY" | "CONTEXT_MISS">;
  deterministicKey: string;
  reason: string;
  confidence: number;
  severity: LearningSeverity;
  findingCode: string;
}

/**
 * Project deterministic Spec Quality findings into advisory learning inputs.
 * The projection never changes the Spec, Constitution, recipes, or quality
 * rules; the existing recurring-evidence threshold still controls whether a
 * human-reviewable improvement candidate may be created.
 */
export function deriveMissionSpecLearningSignals(findings: Array<{
  code: string;
  path: string;
  message: string;
  blocking: boolean;
}>): MissionSpecLearningSignal[] {
  return findings.flatMap((finding) => {
    const ambiguity = /AMBIGU|PLACEHOLDER|CLARIFICATION|MEASURABLE/.test(finding.code);
    const coverageGap = /ACCEPTANCE|VERIFICATION|COVERAGE|REQUIRED_SECTION|REPOSITORY_SCOPE/.test(finding.code);
    if (!ambiguity && !coverageGap) return [];
    return [{
      signalType: ambiguity ? "PROMPT_AMBIGUITY" as const : "CONTEXT_MISS" as const,
      deterministicKey: `mission-spec:${finding.code}:${finding.path.replace(/\[\d+\]/g, "[]")}`,
      reason: boundedText(finding.message),
      confidence: 1,
      severity: finding.blocking ? "MEDIUM" as const : "LOW" as const,
      findingCode: boundedText(finding.code, 100),
    }];
  }).sort((left, right) =>
    left.deterministicKey.localeCompare(right.deterministicKey)
  );
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

const DETERMINISTIC_AGENT_OPERATION = /\b(?:format(?:ting)?|lint(?:ing)?|type[ -]?check|schema check|codegen|code generation|known transform|json transform|deterministic validation|gate result|pass\/fail|passing\/failing)\b/i;

/**
 * Project only explicit Factory Memory sufficiency markers and a small fixed
 * allowlist of known deterministic agent operations. This is intentionally
 * not semantic classification.
 */
export function deriveObservationLearningSignals(input: {
  type: string;
  name: string;
  metadata?: unknown;
  output?: unknown;
}): ObservationLearningSignal[] {
  const metadata = objectValue(input.metadata);
  const detail = objectValue(metadata.detail);
  const output = objectValue(input.output);
  const signals: ObservationLearningSignal[] = [];

  if (input.type === "AGENT") {
    const explicitlyDeterministic = metadata.deterministicOperation === true
      || metadata.deterministic === true
      || metadata.operationClass === "DETERMINISTIC";
    if (explicitlyDeterministic || DETERMINISTIC_AGENT_OPERATION.test(input.name)) {
      signals.push({
        signalType: "UNNECESSARY_AGENT_USAGE",
        deterministicKey: `agent-operation:${input.name}`,
        reason: `Agent handled a deterministic operation: ${boundedText(input.name, 300)}`,
        confidence: explicitlyDeterministic ? 1 : 0.85,
        severity: "MEDIUM",
      });
    }
  }

  if (
    input.type === "RETRIEVAL"
    && metadata.domain === "FACTORY_MEMORY"
    && metadata.factoryObservationType === "context.sufficiency"
  ) {
    const missingSources = [detail.missingSources, detail.requiredSourcesMissing]
      .flatMap((value) => Array.isArray(value) ? value : [])
      .filter((value): value is string => typeof value === "string" && Boolean(value.trim()))
      .map((value) => boundedText(value, 200))
      .sort();
    const insufficient = detail.sufficient === false
      || detail.status === "INSUFFICIENT"
      || output.resultCount === 0;
    if (insufficient) {
      signals.push({
        signalType: "CONTEXT_MISS",
        deterministicKey: `context-sufficiency:${missingSources.join(",") || boundedText(input.name, 300)}`,
        reason: missingSources.length
          ? `Context was explicitly insufficient; missing ${missingSources.join(", ")}.`
          : "Factory Memory recorded explicit context insufficiency.",
        confidence: 1,
        severity: "MEDIUM",
      });
    }
    if (detail.overloaded === true || detail.contextOverload === true) {
      signals.push({
        signalType: "CONTEXT_OVERLOAD",
        deterministicKey: `context-overload:${boundedText(input.name, 300)}`,
        reason: "Factory Memory explicitly marked the context package as overloaded.",
        confidence: 1,
        severity: "MEDIUM",
      });
    }
  }

  return signals;
}

export function deriveRecipeMismatch(input: {
  workflowId: string;
  steps: Array<{ stepId: string; retryCount: number; error?: string }>;
}): ObservationLearningSignal | null {
  const buildIndex = input.steps.findIndex((step) => /\bbuild\b/i.test(step.stepId));
  const typecheckFailureIndex = input.steps.findIndex((step) =>
    step.retryCount > 0 && /type[ -]?check|\btsc\b|type error/i.test(`${step.stepId} ${step.error ?? ""}`));
  if (buildIndex < 0 || typecheckFailureIndex <= buildIndex) return null;
  return {
    signalType: "RECIPE_MISMATCH",
    deterministicKey: `recipe:${input.workflowId}:build-before-typecheck`,
    reason: `Recipe ${boundedText(input.workflowId, 200)} reached typecheck failure after Build.`,
    confidence: 1,
    severity: "MEDIUM",
  };
}

const SEVERITY_RANK: Record<LearningSeverity, number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
  CRITICAL: 3,
};

function boundedText(value: string, maximum = 500): string {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maximum);
}

/**
 * Normalize only volatile identity fragments. This intentionally avoids
 * semantic guessing; unlike errors still remain separate clusters.
 */
export function normalizeLearningSignature(value: string): string {
  return boundedText(value, 1_000)
    .toLowerCase()
    .replace(/\b[0-9a-f]{7,64}\b/g, "<revision>")
    .replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,36}\b/g, "<uuid>")
    .replace(/([/\\][^\s:]+):\d+(?::\d+)?/g, "$1:<line>")
    .replace(/\b(?:run|attempt|trace|request|job)[-:#\s]+\d+\b/g, "$1:<id>")
    .replace(/\b\d{3,}\b/g, "<number>")
    .replace(/\s+/g, " ")
    .trim();
}

export function learningClusterKey(input: Pick<
  LearningSignalInput,
  "projectId" | "repositoryKey" | "signalType" | "deterministicKey"
>): string {
  return [
    boundedText(input.projectId, 120).toLowerCase(),
    boundedText(input.repositoryKey, 300).toLowerCase(),
    input.signalType,
    normalizeLearningSignature(input.deterministicKey),
  ].join("|");
}

function maximumSeverity(values: LearningSeverity[]): LearningSeverity {
  return [...values].sort(
    (left, right) => SEVERITY_RANK[right] - SEVERITY_RANK[left],
  )[0] ?? "LOW";
}

function finiteNonNegative(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

function observedCostImpact(
  signals: LearningSignalInput[],
): LearningClusterProjection["observedCostImpact"] {
  const modelCalls = signals
    .map((item) => finiteNonNegative(item.observedModelCalls))
    .filter((item): item is number => item !== undefined);
  const tokens = signals
    .map((item) => finiteNonNegative(item.observedTokens))
    .filter((item): item is number => item !== undefined);
  const cost = signals
    .map((item) => finiteNonNegative(item.observedCostUsd))
    .filter((item): item is number => item !== undefined);
  if (!modelCalls.length && !tokens.length && !cost.length) return undefined;
  return {
    ...(modelCalls.length
      ? { modelCalls: modelCalls.reduce((sum, value) => sum + value, 0) }
      : {}),
    ...(tokens.length
      ? { tokens: tokens.reduce((sum, value) => sum + value, 0) }
      : {}),
    ...(cost.length
      ? { costUsd: cost.reduce((sum, value) => sum + value, 0) }
      : {}),
  };
}

export function aggregateLearningSignals(
  signals: LearningSignalInput[],
  options: {
    minimumOccurrences: number;
    maximumEvidenceItems: number;
    windowStart: number;
  },
): {
  clusters: LearningClusterProjection[];
  candidates: ImprovementCandidateProjection[];
  duplicatesSuppressed: number;
} {
  if (!Number.isInteger(options.minimumOccurrences) || options.minimumOccurrences < 1) {
    throw new Error("Learning clusters require a positive occurrence threshold.");
  }
  if (!Number.isInteger(options.maximumEvidenceItems) || options.maximumEvidenceItems < 1) {
    throw new Error("Learning clusters require a positive evidence cap.");
  }

  const groups = new Map<string, LearningSignalInput[]>();
  let duplicatesSuppressed = 0;
  for (const item of signals) {
    if (item.acceptanceAuthority !== false) {
      throw new Error("Learning signals cannot carry acceptance authority.");
    }
    if (!Number.isFinite(item.observedAt) || item.observedAt < options.windowStart) {
      continue;
    }
    if (!Number.isFinite(item.confidence) || item.confidence < 0 || item.confidence > 1) {
      throw new Error("Learning signal confidence must be between zero and one.");
    }
    const key = learningClusterKey(item);
    const current = groups.get(key) ?? [];
    if (current.some(
      (existing) => existing.evidenceFingerprint === item.evidenceFingerprint,
    )) {
      duplicatesSuppressed += 1;
      continue;
    }
    current.push(item);
    groups.set(key, current);
  }

  const clusters = [...groups.entries()]
    .map(([clusterKey, members]): LearningClusterProjection => {
      const ordered = [...members].sort(
        (left, right) => left.observedAt - right.observedAt,
      );
      const evidenceRefs = [...new Set(ordered.flatMap((item) => item.evidenceRefs))]
        .slice(0, options.maximumEvidenceItems);
      return {
        projectId: ordered[0].projectId,
        repositoryKey: ordered[0].repositoryKey,
        signalType: ordered[0].signalType,
        deterministicKey: normalizeLearningSignature(
          ordered[0].deterministicKey,
        ),
        clusterKey,
        occurrenceCount: ordered.length,
        evidenceCount: evidenceRefs.length,
        evidenceFingerprints: ordered
          .map((item) => item.evidenceFingerprint)
          .slice(0, options.maximumEvidenceItems),
        evidenceRefs,
        firstObservedAt: ordered[0].observedAt,
        lastObservedAt: ordered[ordered.length - 1].observedAt,
        confidence:
          ordered.reduce((sum, item) => sum + item.confidence, 0) /
          ordered.length,
        severity: maximumSeverity(ordered.map((item) => item.severity)),
        reason: boundedText(ordered[ordered.length - 1].reason),
        qualifiesForCandidate: ordered.length >= options.minimumOccurrences,
        observedCostImpact: observedCostImpact(ordered),
        acceptanceAuthority: false,
      };
    })
    .sort((left, right) => right.lastObservedAt - left.lastObservedAt);

  return {
    clusters,
    candidates: clusters
      .filter((cluster) => cluster.qualifiesForCandidate)
      .map(buildImprovementCandidate),
    duplicatesSuppressed,
  };
}

function candidateTypeForCluster(
  cluster: LearningClusterProjection,
): ImprovementCandidateType {
  switch (cluster.signalType) {
    case "VERIFICATION_FAILURE":
    case "DETERMINISTIC_GATE_FAILURE":
      return "MODIFY_GATE";
    case "HUMAN_CORRECTION":
      return /typecheck|lint|format|schema|test|build|deterministic.gate|acceptance.criterion|human.defect/.test(cluster.deterministicKey)
        ? "ADD_DETERMINISTIC_GATE"
        : "UPDATE_AGENT_RULE";
    case "REPEATED_REVIEW_FINDING":
      return /security|deterministic.gate|acceptance.criterion|human.defect/.test(cluster.deterministicKey)
        ? "ADD_DETERMINISTIC_GATE"
        : /architecture/.test(cluster.deterministicKey)
          ? "ADD_DOCUMENTATION"
          : "UPDATE_AGENT_RULE";
    case "UNNECESSARY_AGENT_USAGE":
    case "TOKEN_WASTE":
      return "REPLACE_AGENT_WITH_CODE";
    case "CONTEXT_MISS":
    case "CONTEXT_OVERLOAD":
      return "UPDATE_CONTEXT_POLICY";
    case "MODEL_ROUTING_MISMATCH":
      return "CHANGE_MODEL_ROUTING";
    case "TOOL_SELECTION_MISMATCH":
      return "CHANGE_TOOL_CONFIG";
    case "RECIPE_MISMATCH":
      return "CHANGE_RECIPE";
    case "RETRY_REQUIRED":
    case "RECOVERY_REQUIRED":
      return "CHANGE_RETRY_POLICY";
    case "PROMPT_AMBIGUITY":
      return "UPDATE_PROMPT";
    case "AGENT_CONFIG_DRIFT":
    case "REPEATED_INSTRUCTION":
    case "HUMAN_INTERVENTION":
      return "UPDATE_AGENT_RULE";
  }
}

function candidateRisk(cluster: LearningClusterProjection): LearningSeverity {
  if (
    [
      "DETERMINISTIC_GATE_FAILURE",
      "MODEL_ROUTING_MISMATCH",
      "TOOL_SELECTION_MISMATCH",
      "RETRY_REQUIRED",
      "RECOVERY_REQUIRED",
    ].includes(cluster.signalType)
  ) {
    return cluster.severity === "CRITICAL" ? "CRITICAL" : "HIGH";
  }
  return cluster.severity;
}

const CHANGE_COPY: Record<ImprovementCandidateType, {
  change: string;
  benefit: string;
  effort: "SMALL" | "MEDIUM" | "LARGE";
}> = {
  ADD_DETERMINISTIC_GATE: {
    change: "Add a deterministic check at the earliest applicable Factory phase.",
    benefit: "Fail earlier and avoid repeated model interpretation or repair work.",
    effort: "SMALL",
  },
  MODIFY_GATE: {
    change: "Review and update the affected deterministic gate through governed work.",
    benefit: "Reduce repeated gate failure while preserving verification authority.",
    effort: "MEDIUM",
  },
  UPDATE_PROMPT: {
    change: "Test a bounded prompt clarification against the frozen baseline.",
    benefit: "Reduce ambiguity without silently changing active agent behavior.",
    effort: "SMALL",
  },
  UPDATE_AGENT_RULE: {
    change: "Review the affected agent instruction and propose a scoped rule update.",
    benefit: "Reduce repeated steering and inconsistent handoff behavior.",
    effort: "SMALL",
  },
  ADD_OR_UPDATE_SKILL: {
    change: "Propose a focused, versioned skill change through the Context Registry.",
    benefit: "Make repeated execution guidance reusable while retaining version history.",
    effort: "MEDIUM",
  },
  UPDATE_CONTEXT_POLICY: {
    change: "Adjust the bounded context-source policy in a governed experiment.",
    benefit: "Improve context relevance while controlling token load.",
    effort: "MEDIUM",
  },
  CHANGE_RECIPE: {
    change: "Compare the current recipe with a frozen candidate phase composition.",
    benefit: "Improve first-pass verification and reduce avoidable repair loops.",
    effort: "MEDIUM",
  },
  CHANGE_RETRY_POLICY: {
    change: "Evaluate a bounded retry-policy change under higher-risk governance.",
    benefit: "Reduce repeated recovery while preserving worker fencing and lineage.",
    effort: "LARGE",
  },
  CHANGE_MODEL_ROUTING: {
    change: "Compare the current route with a policy-compliant candidate route.",
    benefit: "Improve outcome quality or cost without mutating Model Routing automatically.",
    effort: "MEDIUM",
  },
  CHANGE_TOOL_CONFIG: {
    change: "Review the affected tool permission or selection through governed work.",
    benefit: "Reduce tool mismatch without expanding permissions silently.",
    effort: "MEDIUM",
  },
  REPLACE_AGENT_WITH_CODE: {
    change: "Replace the repeated deterministic agent step with bounded code or a gate.",
    benefit: "Remove unnecessary model interpretation while retaining approval and evidence gates.",
    effort: "MEDIUM",
  },
  ADD_DOCUMENTATION: {
    change: "Add operator-facing documentation through a governed WorkOrder.",
    benefit: "Make the correct bounded workflow easier to discover and repeat.",
    effort: "SMALL",
  },
};

export function buildImprovementCandidate(
  cluster: LearningClusterProjection,
): ImprovementCandidateProjection {
  if (cluster.acceptanceAuthority !== false) {
    throw new Error("Learning clusters cannot carry acceptance authority.");
  }
  const candidateType = candidateTypeForCluster(cluster);
  const copy = CHANGE_COPY[candidateType];
  return {
    candidateType,
    problemStatement: boundedText(
      `${cluster.occurrenceCount} recurring ${cluster.signalType.toLowerCase().replace(/_/g, " ")} signals: ${cluster.reason}`,
      1_000,
    ),
    proposedChange: copy.change,
    expectedBenefit: copy.benefit,
    risk: candidateRisk(cluster),
    estimatedEffort: copy.effort,
    evidenceCount: cluster.evidenceCount,
    confidence: cluster.confidence,
    observedCostImpact: cluster.observedCostImpact,
    acceptanceAuthority: false,
  };
}

export interface ImprovementMetrics {
  sampleSize: number;
  successRate?: number;
  averageScore?: number | null;
  firstPassVerificationRate?: number;
  averageRetries?: number;
  humanInterventionRate?: number;
  averageDurationMs?: number;
  averageTokens?: number;
  averageCostUsd?: number;
  deterministicFailures?: number;
}

export function recommendImprovementPromotion(input: {
  baseline: ImprovementMetrics;
  candidate: ImprovementMetrics;
}): {
  recommendation:
    | "PROMOTION_RECOMMENDED"
    | "HOLD_RECOMMENDED"
    | "REJECT_RECOMMENDED";
  sampleLabel: "LOW_SAMPLE" | "OBSERVED_COMPARISON";
  statisticallySignificant: false;
  autoPromote: false;
  improvements: string[];
  regressions: string[];
  comparisonWarnings: string[];
} {
  const minimumSample = Math.min(
    input.baseline.sampleSize,
    input.candidate.sampleSize,
  );
  const improvements: string[] = [];
  const regressions: string[] = [];
  const comparisonWarnings: string[] = [];
  const compareHigher = (
    label: string,
    baseline: number | undefined,
    candidate: number | undefined,
  ) => {
    if (baseline === undefined || candidate === undefined || baseline === candidate) return;
    (candidate > baseline ? improvements : regressions).push(label);
  };
  const compareLower = (
    label: string,
    baseline: number | undefined,
    candidate: number | undefined,
  ) => {
    if (baseline === undefined || candidate === undefined || baseline === candidate) return;
    (candidate < baseline ? improvements : regressions).push(label);
  };

  compareHigher("success rate", input.baseline.successRate, input.candidate.successRate);
  const baselineScore = input.baseline.averageScore;
  const candidateScore = input.candidate.averageScore;
  const scores = [baselineScore, candidateScore];
  if (scores.some((score) => score !== undefined
    && (typeof score !== "number" || !Number.isFinite(score) || score < 0 || score > 1))) {
    comparisonWarnings.push("Quality scores must be finite numbers between 0 and 1.");
  } else if ((baselineScore === undefined) !== (candidateScore === undefined)) {
    comparisonWarnings.push("Quality score is missing for one variant.");
  } else if (typeof baselineScore === "number" && typeof candidateScore === "number") {
    compareHigher("quality score", baselineScore, candidateScore);
  }
  compareHigher(
    "first-pass verification",
    input.baseline.firstPassVerificationRate,
    input.candidate.firstPassVerificationRate,
  );
  compareLower("retries", input.baseline.averageRetries, input.candidate.averageRetries);
  compareLower(
    "human interventions",
    input.baseline.humanInterventionRate,
    input.candidate.humanInterventionRate,
  );
  compareLower("duration", input.baseline.averageDurationMs, input.candidate.averageDurationMs);
  compareLower("tokens", input.baseline.averageTokens, input.candidate.averageTokens);
  compareLower("cost", input.baseline.averageCostUsd, input.candidate.averageCostUsd);
  compareLower(
    "deterministic failures",
    input.baseline.deterministicFailures,
    input.candidate.deterministicFailures,
  );

  return {
    recommendation: regressions.length
      ? "REJECT_RECOMMENDED"
      : comparisonWarnings.length
        ? "HOLD_RECOMMENDED"
        : improvements.length
          ? "PROMOTION_RECOMMENDED"
          : "HOLD_RECOMMENDED",
    sampleLabel: minimumSample < 30 ? "LOW_SAMPLE" : "OBSERVED_COMPARISON",
    statisticallySignificant: false,
    autoPromote: false,
    improvements,
    regressions,
    comparisonWarnings,
  };
}
