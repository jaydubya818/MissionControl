export const EXECUTION_ROUTING_ALGORITHM_VERSION = "execution-routing/v1";

export type ExecutionRoutingMode = "ADVISORY" | "GUARDED_AUTO" | "PINNED";
export type ExecutionRiskTier = "GREEN" | "YELLOW" | "RED";
export type ExecutionBackend = "persistent-worker" | "remote-sandbox";

export type ExecutionEligibilityReasonCode =
  | "FACTORY_NOT_ACTIVE"
  | "FACTORY_VERSION_NOT_ACTIVE"
  | "FACTORY_READINESS_MISSING"
  | "FACTORY_READINESS_BLOCKED"
  | "FACTORY_READINESS_STALE"
  | "FACTORY_DIGEST_MISMATCH"
  | "WORKFLOW_MISMATCH"
  | "REPOSITORY_MISMATCH"
  | "REPOSITORY_ACCESS_MISSING"
  | "WORKER_UNAVAILABLE"
  | "WORKER_HEARTBEAT_STALE"
  | "HARNESS_CAPABILITY_MISSING"
  | "HARNESS_MODEL_UNSUPPORTED"
  | "BACKEND_UNSUPPORTED"
  | "ISOLATION_UNSUPPORTED"
  | "NETWORK_POLICY_UNSATISFIED"
  | "CREDENTIAL_POLICY_UNSATISFIED"
  | "MODEL_NOT_APPROVED"
  | "MODEL_UNAVAILABLE"
  | "RISK_BOUNDARY_EXCEEDED"
  | "BUDGET_ESTIMATE_UNKNOWN"
  | "BUDGET_EXCEEDED"
  | "CONTEXT_WINDOW_INSUFFICIENT"
  | "PRODUCTION_CERTIFICATION_MISSING";

export interface ExecutionTuple {
  tupleKey: string;
  factoryDefinitionId: string;
  factoryDefinitionVersionId: string;
  factoryVersion: number;
  factoryConfigurationDigest: string;
  harness: {
    adapter: string;
    version: string;
    capabilityManifestDigest: string;
    maturity: "EXPERIMENTAL" | "PREVIEW" | "PRODUCTION";
  };
  model: {
    provider: string;
    modelId: string;
    contextWindow?: number;
    estimatedCostPerRunUsd?: number;
  };
  backend: ExecutionBackend;
  riskBoundary: ExecutionRiskTier;
  budget: {
    maxCostUsd: number;
    maxRuntimeMinutes: number;
    maxAttempts: number;
  };
}

export interface ExecutionEligibilityFacts {
  factoryActive: boolean;
  factoryVersionActive: boolean;
  readiness: "PASS" | "BLOCKED" | "MISSING";
  readinessCurrent: boolean;
  readinessDigestMatches: boolean;
  workflowMatches: boolean;
  repositoryMatches: boolean;
  repositoryAccess: boolean;
  workerEligible: boolean;
  workerReason?: string;
  harnessCapabilitiesSatisfied: boolean;
  harnessModelSupported: boolean;
  backendSupported: boolean;
  isolationSupported: boolean;
  networkPolicySatisfied: boolean;
  credentialPolicySatisfied: boolean;
  modelApproved: boolean;
  modelAvailable: boolean;
  productionCertified: boolean;
  qualificationCertified?: boolean;
}

export interface ExecutionEvidence {
  windowStartedAt: number;
  cutoffAt: number;
  attemptCount: number;
  verifiedAttemptCount: number;
  repositoryAttemptCount: number;
  verifiedSuccessRate?: number;
  firstPassSuccessRate?: number;
  retryAvoidanceRate?: number;
  timeToVerifiedCandidateMs?: number;
  modelCostUsd?: number;
  computeCostUsd?: number;
  totalCostUsd?: number;
  totalCostPerVerifiedSuccessUsd?: number;
  contextMissAvoidanceRate?: number;
  qualityGateAvoidanceRate?: number;
  cancellationFailureAvoidanceRate?: number;
}

export interface ExecutionRoutingCandidate {
  tuple: ExecutionTuple;
  eligibility: ExecutionEligibilityFacts;
  evidence: ExecutionEvidence;
}

export interface ExecutionRoutingPolicy {
  mode: ExecutionRoutingMode;
  policyVersion: number;
  guardedAutoPromoted: boolean;
  guardedAutoEnabled: boolean;
  minimumVerifiedAttempts: number;
  minimumEvidenceCoverage: number;
  minimumScoreMargin: number;
  evidenceWindowDays: number;
  maximumEstimatedCostUsd?: number;
  minimumContextWindow?: number;
}

export interface ExecutionRoutingInput {
  riskTier: ExecutionRiskTier;
  candidates: ExecutionRoutingCandidate[];
  policy: ExecutionRoutingPolicy;
  admissionMode?: "PRODUCTION" | "QUALIFICATION";
  fallbackTupleKey?: string;
  pinnedTupleKey?: string;
}

export interface ExecutionRoutingMetricScore {
  metric: keyof Pick<
    ExecutionEvidence,
    | "verifiedSuccessRate"
    | "firstPassSuccessRate"
    | "retryAvoidanceRate"
    | "timeToVerifiedCandidateMs"
    | "totalCostPerVerifiedSuccessUsd"
    | "contextMissAvoidanceRate"
    | "qualityGateAvoidanceRate"
    | "cancellationFailureAvoidanceRate"
  >;
  weight: number;
  observed: boolean;
  rawValue?: number;
  normalizedScore?: number;
}

export interface ExecutionRoutingCandidateResult {
  tuple: ExecutionTuple;
  eligible: boolean;
  rejectionCodes: ExecutionEligibilityReasonCode[];
  rejectionReasons: string[];
  score?: number;
  evidenceCoverage: number;
  metrics: ExecutionRoutingMetricScore[];
  evidence: ExecutionEvidence;
}

export interface ExecutionRoutingResult {
  algorithmVersion: typeof EXECUTION_ROUTING_ALGORITHM_VERSION;
  status: "SELECTED" | "EXHAUSTED";
  mode: ExecutionRoutingMode;
  candidates: ExecutionRoutingCandidateResult[];
  recommendedTupleKey?: string;
  appliedTupleKey?: string;
  fallbackTupleKey?: string;
  explanation: string;
  fallbackReason?: string;
  guardedAutoApplied: boolean;
}

const RISK_RANK: Record<ExecutionRiskTier, number> = { GREEN: 0, YELLOW: 1, RED: 2 };
const METRIC_WEIGHTS: Array<{ metric: ExecutionRoutingMetricScore["metric"]; weight: number; lowerIsBetter?: boolean }> = [
  { metric: "verifiedSuccessRate", weight: 30 },
  { metric: "firstPassSuccessRate", weight: 20 },
  { metric: "retryAvoidanceRate", weight: 10 },
  { metric: "timeToVerifiedCandidateMs", weight: 10, lowerIsBetter: true },
  { metric: "totalCostPerVerifiedSuccessUsd", weight: 10, lowerIsBetter: true },
  { metric: "contextMissAvoidanceRate", weight: 5 },
  { metric: "qualityGateAvoidanceRate", weight: 10 },
  { metric: "cancellationFailureAvoidanceRate", weight: 5 },
];
const TOTAL_METRIC_WEIGHT = METRIC_WEIGHTS.reduce((sum, metric) => sum + metric.weight, 0);

const REASONS: Record<ExecutionEligibilityReasonCode, string> = {
  FACTORY_NOT_ACTIVE: "Factory definition is not active.",
  FACTORY_VERSION_NOT_ACTIVE: "Factory Version is not the active version.",
  FACTORY_READINESS_MISSING: "Factory readiness evidence is missing.",
  FACTORY_READINESS_BLOCKED: "Factory readiness assessment is blocked.",
  FACTORY_READINESS_STALE: "Factory readiness assessment is stale.",
  FACTORY_DIGEST_MISMATCH: "Factory readiness evidence does not match the frozen configuration digest.",
  WORKFLOW_MISMATCH: "Factory Version does not match the WorkOrder workflow.",
  REPOSITORY_MISMATCH: "Factory Version does not match the WorkOrder repository.",
  REPOSITORY_ACCESS_MISSING: "No current worker has read/write access to the repository.",
  WORKER_UNAVAILABLE: "No current worker satisfies the frozen Factory binding.",
  WORKER_HEARTBEAT_STALE: "The matching worker heartbeat is stale.",
  HARNESS_CAPABILITY_MISSING: "Harness capabilities do not satisfy the WorkOrder requirements.",
  HARNESS_MODEL_UNSUPPORTED: "Harness does not support the frozen provider and model.",
  BACKEND_UNSUPPORTED: "Execution backend is not supported by the harness or worker.",
  ISOLATION_UNSUPPORTED: "Required isolation is not supported.",
  NETWORK_POLICY_UNSATISFIED: "Network policy cannot be enforced by this tuple.",
  CREDENTIAL_POLICY_UNSATISFIED: "Credential policy cannot be enforced by this tuple.",
  MODEL_NOT_APPROVED: "Model is not approved for this WorkOrder.",
  MODEL_UNAVAILABLE: "Model or provider is unavailable.",
  RISK_BOUNDARY_EXCEEDED: "WorkOrder risk exceeds the Factory Version risk boundary.",
  BUDGET_ESTIMATE_UNKNOWN: "Estimated execution cost is unknown under a hard budget constraint.",
  BUDGET_EXCEEDED: "Estimated cost exceeds the WorkOrder or routing budget.",
  CONTEXT_WINDOW_INSUFFICIENT: "Model context window is below the required minimum.",
  PRODUCTION_CERTIFICATION_MISSING: "Tuple is not production-certified.",
};

function boundedRate(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value) && value >= 0 && value <= 1;
}

function boundedNonNegative(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value) && value >= 0;
}

function rejectionCodes(candidate: ExecutionRoutingCandidate, input: ExecutionRoutingInput) {
  const { eligibility: facts, tuple } = candidate;
  const codes: ExecutionEligibilityReasonCode[] = [];
  if (!facts.factoryActive) codes.push("FACTORY_NOT_ACTIVE");
  if (!facts.factoryVersionActive) codes.push("FACTORY_VERSION_NOT_ACTIVE");
  if (facts.readiness === "MISSING") codes.push("FACTORY_READINESS_MISSING");
  if (facts.readiness === "BLOCKED") codes.push("FACTORY_READINESS_BLOCKED");
  if (!facts.readinessCurrent) codes.push("FACTORY_READINESS_STALE");
  if (!facts.readinessDigestMatches) codes.push("FACTORY_DIGEST_MISMATCH");
  if (!facts.workflowMatches) codes.push("WORKFLOW_MISMATCH");
  if (!facts.repositoryMatches) codes.push("REPOSITORY_MISMATCH");
  if (!facts.repositoryAccess) codes.push("REPOSITORY_ACCESS_MISSING");
  if (!facts.workerEligible) {
    codes.push(facts.workerReason === "worker-heartbeat-stale" ? "WORKER_HEARTBEAT_STALE" : "WORKER_UNAVAILABLE");
  }
  if (!facts.harnessCapabilitiesSatisfied) codes.push("HARNESS_CAPABILITY_MISSING");
  if (!facts.harnessModelSupported) codes.push("HARNESS_MODEL_UNSUPPORTED");
  if (!facts.backendSupported) codes.push("BACKEND_UNSUPPORTED");
  if (!facts.isolationSupported) codes.push("ISOLATION_UNSUPPORTED");
  if (!facts.networkPolicySatisfied) codes.push("NETWORK_POLICY_UNSATISFIED");
  if (!facts.credentialPolicySatisfied) codes.push("CREDENTIAL_POLICY_UNSATISFIED");
  if (!facts.modelApproved) codes.push("MODEL_NOT_APPROVED");
  if (!facts.modelAvailable) codes.push("MODEL_UNAVAILABLE");
  if (RISK_RANK[tuple.riskBoundary] < RISK_RANK[input.riskTier]) codes.push("RISK_BOUNDARY_EXCEEDED");
  const maximumEstimatedCostUsd = Math.min(
    tuple.budget.maxCostUsd,
    input.policy.maximumEstimatedCostUsd ?? Number.POSITIVE_INFINITY,
  );
  if (tuple.model.estimatedCostPerRunUsd === undefined) codes.push("BUDGET_ESTIMATE_UNKNOWN");
  else if (tuple.model.estimatedCostPerRunUsd > maximumEstimatedCostUsd) codes.push("BUDGET_EXCEEDED");
  if (
    input.policy.minimumContextWindow !== undefined
    && (tuple.model.contextWindow === undefined || tuple.model.contextWindow < input.policy.minimumContextWindow)
  ) codes.push("CONTEXT_WINDOW_INSUFFICIENT");
  const certificationSatisfied = input.admissionMode === "QUALIFICATION"
    ? facts.qualificationCertified === true && tuple.tupleKey === input.fallbackTupleKey
    : facts.productionCertified && tuple.harness.maturity === "PRODUCTION";
  if (!certificationSatisfied) codes.push("PRODUCTION_CERTIFICATION_MISSING");
  return [...new Set(codes)];
}

function comparisonRange(
  candidates: ExecutionRoutingCandidate[],
  metric: ExecutionRoutingMetricScore["metric"],
) {
  const values = candidates
    .map((candidate) => candidate.evidence[metric])
    .filter((value): value is number => boundedNonNegative(value));
  return values.length ? { minimum: Math.min(...values), maximum: Math.max(...values) } : undefined;
}

function normalizedMetricScore(
  value: number,
  lowerIsBetter: boolean,
  range: { minimum: number; maximum: number } | undefined,
) {
  if (!lowerIsBetter) return Math.max(0, Math.min(1, value));
  if (!range || range.maximum === range.minimum) return 1;
  return 1 - (value - range.minimum) / (range.maximum - range.minimum);
}

export function resolveExecutionRoute(input: ExecutionRoutingInput): ExecutionRoutingResult {
  const preflight = input.candidates.map((candidate) => ({ candidate, codes: rejectionCodes(candidate, input) }));
  const eligible = preflight.filter((item) => item.codes.length === 0).map((item) => item.candidate);
  const ranges = new Map(METRIC_WEIGHTS.map(({ metric }) => [metric, comparisonRange(eligible, metric)]));
  const results = preflight.map(({ candidate, codes }): ExecutionRoutingCandidateResult => {
    const metrics = METRIC_WEIGHTS.map(({ metric, weight, lowerIsBetter }) => {
      const value = candidate.evidence[metric];
      const observed = lowerIsBetter ? boundedNonNegative(value) : boundedRate(value);
      return {
        metric,
        weight,
        observed,
        rawValue: observed ? value : undefined,
        normalizedScore: observed
          ? normalizedMetricScore(value as number, Boolean(lowerIsBetter), ranges.get(metric))
          : undefined,
      };
    });
    const observedWeight = metrics.reduce((sum, metric) => sum + (metric.observed ? metric.weight : 0), 0);
    const weightedScore = metrics.reduce(
      (sum, metric) => sum + (metric.normalizedScore === undefined ? 0 : metric.normalizedScore * metric.weight),
      0,
    );
    return {
      tuple: candidate.tuple,
      eligible: codes.length === 0,
      rejectionCodes: codes,
      rejectionReasons: codes.map((code) => REASONS[code]),
      score: codes.length === 0 && observedWeight > 0
        ? Math.round((weightedScore / TOTAL_METRIC_WEIGHT) * 10_000) / 100
        : undefined,
      evidenceCoverage: observedWeight / TOTAL_METRIC_WEIGHT,
      metrics,
      evidence: candidate.evidence,
    };
  });
  const eligibleResults = results
    .filter((candidate) => candidate.eligible)
    .sort((left, right) => (right.score ?? -1) - (left.score ?? -1)
      || right.evidenceCoverage - left.evidenceCoverage
      || right.evidence.repositoryAttemptCount - left.evidence.repositoryAttemptCount
      || left.tuple.tupleKey.localeCompare(right.tuple.tupleKey));
  const fallback = input.fallbackTupleKey
    ? eligibleResults.find((candidate) => candidate.tuple.tupleKey === input.fallbackTupleKey)
    : eligibleResults[0];

  if (!eligibleResults.length) {
    return {
      algorithmVersion: EXECUTION_ROUTING_ALGORITHM_VERSION,
      status: "EXHAUSTED",
      mode: input.policy.mode,
      candidates: results,
      explanation: "No production-certified execution tuple satisfies every hard eligibility constraint.",
      fallbackReason: "NO_ELIGIBLE_TUPLE",
      guardedAutoApplied: false,
    };
  }

  if (input.policy.mode === "PINNED") {
    const pinned = eligibleResults.find((candidate) => candidate.tuple.tupleKey === input.pinnedTupleKey);
    if (!pinned) {
      return {
        algorithmVersion: EXECUTION_ROUTING_ALGORITHM_VERSION,
        status: "EXHAUSTED",
        mode: input.policy.mode,
        candidates: results,
        recommendedTupleKey: eligibleResults[0].tuple.tupleKey,
        fallbackTupleKey: fallback?.tuple.tupleKey,
        explanation: "The pinned execution tuple is missing or ineligible; dispatch must not silently fall through.",
        fallbackReason: "PIN_INELIGIBLE",
        guardedAutoApplied: false,
      };
    }
    return {
      algorithmVersion: EXECUTION_ROUTING_ALGORITHM_VERSION,
      status: "SELECTED",
      mode: input.policy.mode,
      candidates: results,
      recommendedTupleKey: pinned.tuple.tupleKey,
      appliedTupleKey: pinned.tuple.tupleKey,
      fallbackTupleKey: fallback?.tuple.tupleKey,
      explanation: "The exact operator-pinned tuple is eligible and wins selection.",
      guardedAutoApplied: false,
    };
  }

  const recommended = eligibleResults[0];
  if (input.policy.mode === "ADVISORY") {
    if (!fallback) {
      return {
        algorithmVersion: EXECUTION_ROUTING_ALGORITHM_VERSION,
        status: "EXHAUSTED",
        mode: input.policy.mode,
        candidates: results,
        recommendedTupleKey: recommended.tuple.tupleKey,
        fallbackTupleKey: input.fallbackTupleKey,
        explanation: "The operator-selected baseline is ineligible; Advisory mode will not switch execution silently.",
        fallbackReason: "ADVISORY_BASELINE_INELIGIBLE",
        guardedAutoApplied: false,
      };
    }
    return {
      algorithmVersion: EXECUTION_ROUTING_ALGORITHM_VERSION,
      status: "SELECTED",
      mode: input.policy.mode,
      candidates: results,
      recommendedTupleKey: recommended.tuple.tupleKey,
      appliedTupleKey: fallback?.tuple.tupleKey,
      fallbackTupleKey: fallback?.tuple.tupleKey,
      explanation: "Advisory mode records the recommendation while the current certified tuple remains authoritative.",
      fallbackReason: recommended.tuple.tupleKey === fallback?.tuple.tupleKey ? undefined : "ADVISORY_ONLY",
      guardedAutoApplied: false,
    };
  }

  const runnerUp = eligibleResults[1];
  const scoreMargin = runnerUp
    ? (recommended.score ?? -1) - (runnerUp.score ?? -1)
    : Number.POSITIVE_INFINITY;
  const guardedReasons = [
    !input.policy.guardedAutoEnabled ? "GUARDED_AUTO_FLAG_DISABLED" : null,
    !input.policy.guardedAutoPromoted ? "GUARDED_AUTO_NOT_PROMOTED" : null,
    input.riskTier === "RED" ? "RED_RISK_REQUIRES_OPERATOR_SELECTION" : null,
    recommended.evidence.verifiedAttemptCount < input.policy.minimumVerifiedAttempts ? "INSUFFICIENT_VERIFIED_ATTEMPTS" : null,
    recommended.evidenceCoverage < input.policy.minimumEvidenceCoverage ? "INSUFFICIENT_EVIDENCE_COVERAGE" : null,
    scoreMargin < input.policy.minimumScoreMargin ? "INSUFFICIENT_SCORE_MARGIN" : null,
  ].filter((reason): reason is string => Boolean(reason));
  const autoApplied = guardedReasons.length === 0;
  if (!autoApplied && !fallback) {
    return {
      algorithmVersion: EXECUTION_ROUTING_ALGORITHM_VERSION,
      status: "EXHAUSTED",
      mode: input.policy.mode,
      candidates: results,
      recommendedTupleKey: recommended.tuple.tupleKey,
      fallbackTupleKey: input.fallbackTupleKey,
      explanation: `Guarded Auto was withheld and the conservative fallback is ineligible: ${guardedReasons.join(", ")}.`,
      fallbackReason: ["FALLBACK_INELIGIBLE", ...guardedReasons].join(","),
      guardedAutoApplied: false,
    };
  }
  return {
    algorithmVersion: EXECUTION_ROUTING_ALGORITHM_VERSION,
    status: "SELECTED",
    mode: input.policy.mode,
    candidates: results,
    recommendedTupleKey: recommended.tuple.tupleKey,
    appliedTupleKey: autoApplied ? recommended.tuple.tupleKey : fallback?.tuple.tupleKey,
    fallbackTupleKey: fallback?.tuple.tupleKey,
    explanation: autoApplied
      ? "Guarded Auto applied the highest-scoring eligible tuple after every promotion and evidence gate passed."
      : `Guarded Auto withheld autonomous selection: ${guardedReasons.join(", ")}.`,
    fallbackReason: autoApplied ? undefined : guardedReasons.join(","),
    guardedAutoApplied: autoApplied,
  };
}

export function workOrderRiskToExecutionTier(risk: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"): ExecutionRiskTier {
  if (risk === "LOW") return "GREEN";
  if (risk === "MEDIUM") return "YELLOW";
  return "RED";
}
