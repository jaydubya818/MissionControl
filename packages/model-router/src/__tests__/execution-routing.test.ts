import { describe, expect, it } from "vitest";
import {
  EXECUTION_ROUTING_ALGORITHM_VERSION,
  resolveExecutionRoute,
  workOrderRiskToExecutionTier,
  type ExecutionRoutingCandidate,
  type ExecutionRoutingInput,
} from "../execution-routing";

const cutoffAt = Date.UTC(2026, 7, 17);

function candidate(
  key: string,
  overrides: Partial<ExecutionRoutingCandidate> = {},
): ExecutionRoutingCandidate {
  return {
    tuple: {
      tupleKey: key,
      factoryDefinitionId: `factory-${key}`,
      factoryDefinitionVersionId: `version-${key}`,
      factoryVersion: 1,
      factoryConfigurationDigest: `sha256:${key}`,
      harness: {
        adapter: "codex",
        version: "v1",
        capabilityManifestDigest: `sha256:harness-${key}`,
        maturity: "PRODUCTION",
      },
      model: {
        provider: "openai",
        modelId: `model-${key}`,
        contextWindow: 200_000,
        estimatedCostPerRunUsd: 0.2,
      },
      backend: "persistent-worker",
      riskBoundary: "YELLOW",
      budget: { maxCostUsd: 5, maxRuntimeMinutes: 30, maxAttempts: 3 },
    },
    eligibility: {
      factoryActive: true,
      factoryVersionActive: true,
      readiness: "PASS",
      readinessCurrent: true,
      readinessDigestMatches: true,
      workflowMatches: true,
      repositoryMatches: true,
      repositoryAccess: true,
      workerEligible: true,
      harnessCapabilitiesSatisfied: true,
      harnessModelSupported: true,
      backendSupported: true,
      isolationSupported: true,
      networkPolicySatisfied: true,
      credentialPolicySatisfied: true,
      modelApproved: true,
      modelAvailable: true,
      productionCertified: true,
    },
    evidence: {
      windowStartedAt: cutoffAt - 30 * 86_400_000,
      cutoffAt,
      attemptCount: 10,
      verifiedAttemptCount: 8,
      repositoryAttemptCount: 10,
      verifiedSuccessRate: 0.9,
      firstPassSuccessRate: 0.8,
      retryAvoidanceRate: 0.9,
      timeToVerifiedCandidateMs: 10_000,
      modelCostUsd: 1,
      computeCostUsd: 1,
      totalCostUsd: 2,
      totalCostPerVerifiedSuccessUsd: 0.25,
      contextMissAvoidanceRate: 1,
      qualityGateAvoidanceRate: 0.9,
      cancellationFailureAvoidanceRate: 1,
    },
    ...overrides,
  };
}

function input(candidates: ExecutionRoutingCandidate[]): ExecutionRoutingInput {
  return {
    riskTier: "YELLOW",
    candidates,
    fallbackTupleKey: candidates[0]?.tuple.tupleKey,
    policy: {
      mode: "GUARDED_AUTO",
      policyVersion: 1,
      guardedAutoPromoted: true,
      guardedAutoEnabled: true,
      minimumVerifiedAttempts: 5,
      minimumEvidenceCoverage: 0.6,
      minimumScoreMargin: 5,
      evidenceWindowDays: 30,
      maximumEstimatedCostUsd: 1,
      minimumContextWindow: 100_000,
    },
  };
}

describe("execution routing V1", () => {
  it("selects a known-good eligible tuple with a frozen algorithm version", () => {
    const result = resolveExecutionRoute(input([candidate("known-good")]));
    expect(result).toMatchObject({
      algorithmVersion: EXECUTION_ROUTING_ALGORITHM_VERSION,
      status: "SELECTED",
      recommendedTupleKey: "known-good",
      appliedTupleKey: "known-good",
      guardedAutoApplied: true,
    });
  });

  it("rejects a cheaper ineligible tuple before scoring", () => {
    const cheap = candidate("cheap", {
      tuple: { ...candidate("cheap").tuple, model: { ...candidate("cheap").tuple.model, estimatedCostPerRunUsd: 0.01 } },
      eligibility: { ...candidate("cheap").eligibility, repositoryAccess: false },
    });
    const result = resolveExecutionRoute(input([candidate("safe"), cheap]));
    expect(result.recommendedTupleKey).toBe("safe");
    expect(result.candidates.find((item) => item.tuple.tupleKey === "cheap")).toMatchObject({
      eligible: false,
      score: undefined,
      rejectionCodes: ["REPOSITORY_ACCESS_MISSING"],
    });
  });

  it("rejects a fast uncertified harness", () => {
    const fast = candidate("fast", {
      tuple: { ...candidate("fast").tuple, harness: { ...candidate("fast").tuple.harness, maturity: "EXPERIMENTAL" } },
      eligibility: { ...candidate("fast").eligibility, productionCertified: false },
    });
    const result = resolveExecutionRoute(input([fast]));
    expect(result.status).toBe("EXHAUSTED");
    expect(result.candidates[0].rejectionCodes).toContain("PRODUCTION_CERTIFICATION_MISSING");
  });

  it("fails model and provider availability closed before scoring", () => {
    const unavailable = candidate("unavailable", {
      eligibility: { ...candidate("unavailable").eligibility, modelAvailable: false },
    });
    const result = resolveExecutionRoute(input([unavailable]));
    expect(result.status).toBe("EXHAUSTED");
    expect(result.candidates[0]).toMatchObject({
      score: undefined,
      rejectionCodes: ["MODEL_UNAVAILABLE"],
    });
  });

  it("fails an unknown cost estimate closed against the frozen Factory budget", () => {
    const unknownCost = candidate("unknown-cost", {
      tuple: {
        ...candidate("unknown-cost").tuple,
        model: { ...candidate("unknown-cost").tuple.model, estimatedCostPerRunUsd: undefined },
      },
    });
    const result = resolveExecutionRoute(input([unknownCost]));
    expect(result.status).toBe("EXHAUSTED");
    expect(result.candidates[0].rejectionCodes).toContain("BUDGET_ESTIMATE_UNKNOWN");
  });

  it("fails a known estimate closed when it exceeds the remaining approved budget", () => {
    const routing = input([candidate("over-budget")]);
    routing.policy.maximumEstimatedCostUsd = 0.1;
    const result = resolveExecutionRoute(routing);
    expect(result.status).toBe("EXHAUSTED");
    expect(result.candidates[0].rejectionCodes).toContain("BUDGET_EXCEEDED");
  });

  it("preserves missing telemetry as unknown and falls back conservatively", () => {
    const unknown = candidate("unknown", {
      evidence: {
        windowStartedAt: cutoffAt - 30 * 86_400_000,
        cutoffAt,
        attemptCount: 0,
        verifiedAttemptCount: 0,
        repositoryAttemptCount: 0,
      },
    });
    const routing = input([candidate("baseline"), unknown]);
    routing.fallbackTupleKey = "baseline";
    const result = resolveExecutionRoute(routing);
    const snapshot = result.candidates.find((item) => item.tuple.tupleKey === "unknown")!;
    expect(snapshot.score).toBeUndefined();
    expect(snapshot.evidenceCoverage).toBe(0);
    expect(snapshot.metrics.every((metric) => metric.observed === false)).toBe(true);
    expect(result.appliedTupleKey).toBe("baseline");
  });

  it("does not let 60% coverage produce a 95-point ranking by dropping unknown weights", () => {
    const partial = candidate("partial", {
      evidence: {
        windowStartedAt: cutoffAt - 30 * 86_400_000,
        cutoffAt,
        attemptCount: 10,
        verifiedAttemptCount: 8,
        repositoryAttemptCount: 10,
        verifiedSuccessRate: 0.95,
        firstPassSuccessRate: 0.95,
        retryAvoidanceRate: 0.95,
      },
    });
    const supported = candidate("supported", {
      evidence: {
        ...candidate("supported").evidence,
        verifiedSuccessRate: 0.625,
        firstPassSuccessRate: 0.625,
        retryAvoidanceRate: 0.625,
        contextMissAvoidanceRate: 0.625,
        qualityGateAvoidanceRate: 0.625,
        cancellationFailureAvoidanceRate: 0.625,
      },
    });
    const result = resolveExecutionRoute(input([partial, supported]));
    const partialResult = result.candidates.find((item) => item.tuple.tupleKey === "partial")!;
    const supportedResult = result.candidates.find((item) => item.tuple.tupleKey === "supported")!;
    expect(partialResult).toMatchObject({ score: 57, evidenceCoverage: 0.6 });
    expect(supportedResult).toMatchObject({ score: 70, evidenceCoverage: 1 });
    expect(result.recommendedTupleKey).toBe("supported");
  });

  it("never rewards missing cost, latency, reliability, or diagnostic telemetry", () => {
    const missingCases: Array<keyof ExecutionRoutingCandidate["evidence"]> = [
      "totalCostPerVerifiedSuccessUsd",
      "timeToVerifiedCandidateMs",
      "verifiedSuccessRate",
      "qualityGateAvoidanceRate",
    ];
    for (const metric of missingCases) {
      const complete = candidate(`complete-${metric}`);
      const partialEvidence = { ...candidate(`partial-${metric}`).evidence, [metric]: undefined };
      const partial = candidate(`partial-${metric}`, { evidence: partialEvidence });
      const result = resolveExecutionRoute(input([partial, complete]));
      const completeResult = result.candidates.find((item) => item.tuple.tupleKey === complete.tuple.tupleKey)!;
      const partialResult = result.candidates.find((item) => item.tuple.tupleKey === partial.tuple.tupleKey)!;
      expect(partialResult.metrics.find((item) => item.metric === metric)).toMatchObject({ observed: false });
      expect(partialResult.score).toBeLessThan(completeResult.score!);
      expect(result.recommendedTupleKey).toBe(complete.tuple.tupleKey);
    }
  });

  it("keeps incomplete evidence inspectable in Advisory mode", () => {
    const partial = candidate("partial", {
      evidence: {
        ...candidate("partial").evidence,
        totalCostPerVerifiedSuccessUsd: undefined,
        timeToVerifiedCandidateMs: undefined,
      },
    });
    const routing = input([candidate("baseline"), partial]);
    routing.policy.mode = "ADVISORY";
    routing.fallbackTupleKey = "baseline";
    const result = resolveExecutionRoute(routing);
    const partialResult = result.candidates.find((item) => item.tuple.tupleKey === "partial")!;
    expect(partialResult.evidenceCoverage).toBe(0.8);
    expect(partialResult.metrics.filter((metric) => !metric.observed).map((metric) => metric.metric)).toEqual([
      "timeToVerifiedCandidateMs",
      "totalCostPerVerifiedSuccessUsd",
    ]);
    expect(result.candidates).toHaveLength(2);
    expect(result.appliedTupleKey).toBe("baseline");
    expect(result.guardedAutoApplied).toBe(false);
  });

  it("withholds Guarded Auto when the governed minimum coverage is unmet", () => {
    const partial = candidate("partial", {
      evidence: {
        ...candidate("partial").evidence,
        verifiedSuccessRate: 1,
        firstPassSuccessRate: 1,
        retryAvoidanceRate: 1,
        timeToVerifiedCandidateMs: undefined,
        totalCostPerVerifiedSuccessUsd: undefined,
        contextMissAvoidanceRate: 1,
        qualityGateAvoidanceRate: 1,
        cancellationFailureAvoidanceRate: 1,
      },
    });
    const baseline = candidate("baseline", {
      evidence: {
        ...candidate("baseline").evidence,
        verifiedSuccessRate: 0.5,
        firstPassSuccessRate: 0.5,
        retryAvoidanceRate: 0.5,
        contextMissAvoidanceRate: 0.5,
        qualityGateAvoidanceRate: 0.5,
        cancellationFailureAvoidanceRate: 0.5,
      },
    });
    const routing = input([baseline, partial]);
    routing.fallbackTupleKey = "baseline";
    routing.policy.minimumEvidenceCoverage = 0.9;
    const result = resolveExecutionRoute(routing);
    expect(result.recommendedTupleKey).toBe("partial");
    expect(result.appliedTupleKey).toBe("baseline");
    expect(result.guardedAutoApplied).toBe(false);
    expect(result.fallbackReason).toContain("INSUFFICIENT_EVIDENCE_COVERAGE");
  });

  it("uses the certified fallback when evidence is insufficient", () => {
    const sparseWinner = candidate("sparse", {
      evidence: {
        ...candidate("sparse").evidence,
        verifiedAttemptCount: 1,
        verifiedSuccessRate: 1,
        firstPassSuccessRate: 1,
      },
    });
    const baseline = candidate("baseline", {
      evidence: {
        ...candidate("baseline").evidence,
        verifiedSuccessRate: 0.5,
        firstPassSuccessRate: 0.5,
      },
    });
    const routing = input([baseline, sparseWinner]);
    routing.fallbackTupleKey = "baseline";
    const result = resolveExecutionRoute(routing);
    expect(result.guardedAutoApplied).toBe(false);
    expect(result.appliedTupleKey).toBe("baseline");
    expect(result.fallbackReason).toContain("INSUFFICIENT_VERIFIED_ATTEMPTS");
  });

  it("lets an eligible exact pin win regardless of score", () => {
    const routing = input([
      candidate("high-score"),
      candidate("pin", { evidence: { ...candidate("pin").evidence, verifiedSuccessRate: 0.6 } }),
    ]);
    routing.policy.mode = "PINNED";
    routing.pinnedTupleKey = "pin";
    const result = resolveExecutionRoute(routing);
    expect(result.appliedTupleKey).toBe("pin");
    expect(result.explanation).toContain("operator-pinned");
  });

  it("blocks rather than silently falling through when a pin is ineligible", () => {
    const pinned = candidate("pin", {
      eligibility: { ...candidate("pin").eligibility, workerEligible: false, workerReason: "worker-heartbeat-stale" },
    });
    const routing = input([candidate("baseline"), pinned]);
    routing.policy.mode = "PINNED";
    routing.pinnedTupleKey = "pin";
    const result = resolveExecutionRoute(routing);
    expect(result.status).toBe("EXHAUSTED");
    expect(result.fallbackReason).toBe("PIN_INELIGIBLE");
    expect(result.candidates[1].rejectionCodes).toContain("WORKER_HEARTBEAT_STALE");
  });

  it("constrains risk and never auto-routes RED work", () => {
    const yellow = candidate("yellow");
    const red = candidate("red", { tuple: { ...candidate("red").tuple, riskBoundary: "RED" } });
    const routing = input([yellow, red]);
    routing.riskTier = "RED";
    routing.fallbackTupleKey = "red";
    const result = resolveExecutionRoute(routing);
    expect(result.candidates[0].rejectionCodes).toContain("RISK_BOUNDARY_EXCEEDED");
    expect(result.guardedAutoApplied).toBe(false);
    expect(result.appliedTupleKey).toBe("red");
    expect(result.fallbackReason).toContain("RED_RISK_REQUIRES_OPERATOR_SELECTION");
  });

  it("keeps Advisory non-mutating and deterministic across candidate order", () => {
    const better = candidate("better");
    const worse = candidate("worse", { evidence: { ...candidate("worse").evidence, verifiedSuccessRate: 0.5 } });
    const left = input([better, worse]);
    left.policy.mode = "ADVISORY";
    left.fallbackTupleKey = "worse";
    const right = { ...left, candidates: [worse, better] };
    expect(resolveExecutionRoute(left)).toMatchObject({ recommendedTupleKey: "better", appliedTupleKey: "worse" });
    expect(resolveExecutionRoute(right)).toMatchObject({ recommendedTupleKey: "better", appliedTupleKey: "worse" });
  });

  it("blocks Advisory when the operator-selected baseline is ineligible", () => {
    const invalidBaseline = candidate("baseline", {
      eligibility: { ...candidate("baseline").eligibility, backendSupported: false },
    });
    const routing = input([invalidBaseline, candidate("recommended")]);
    routing.policy.mode = "ADVISORY";
    routing.fallbackTupleKey = "baseline";
    const result = resolveExecutionRoute(routing);
    expect(result).toMatchObject({
      status: "EXHAUSTED",
      recommendedTupleKey: "recommended",
      fallbackReason: "ADVISORY_BASELINE_INELIGIBLE",
    });
    expect(result.appliedTupleKey).toBeUndefined();
  });

  it("maps existing WorkOrder risk without inventing another source of truth", () => {
    expect(workOrderRiskToExecutionTier("LOW")).toBe("GREEN");
    expect(workOrderRiskToExecutionTier("MEDIUM")).toBe("YELLOW");
    expect(workOrderRiskToExecutionTier("HIGH")).toBe("RED");
    expect(workOrderRiskToExecutionTier("CRITICAL")).toBe("RED");
  });
});
