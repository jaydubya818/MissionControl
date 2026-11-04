import "./support/domainFunctions";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  aggregateLearningSignals,
  buildImprovementCandidate,
  deriveObservationLearningSignals,
  deriveMissionSpecLearningSignals,
  deriveRecipeMismatch,
  IMPROVEMENT_CANDIDATE_TYPES,
  learningClusterKey,
  normalizeLearningSignature,
  recommendImprovementPromotion,
  type LearningSignalInput,
} from "../lib/factoryLearning";
import { getDashboard, harnessLearningContext, refresh } from "../factory/learning";
import { resolve as resolveMetaLoop } from "../factory/metaLoop";

function functionHandler<T extends (...args: any[]) => any>(registered: unknown): T {
  return (registered as { _handler: T })._handler;
}

function signal(
  overrides: Partial<LearningSignalInput> = {},
): LearningSignalInput {
  return {
    projectId: "workspace-a",
    repositoryKey: "sellerfi/marketplace",
    signalType: "HUMAN_CORRECTION",
    deterministicKey: "typescript:typecheck",
    evidenceFingerprint: "evidence-1",
    evidenceRefs: ["trace:trace-1"],
    observedAt: Date.UTC(2026, 7, 16),
    confidence: 0.9,
    severity: "MEDIUM",
    reason: "TypeScript typecheck was requested after the build completed.",
    acceptanceAuthority: false,
    ...overrides,
  };
}

describe("Factory Learning deterministic domain", () => {
  it("fails dashboard reads and refresh writes closed for anonymous callers", async () => {
    const originalDemoFlag = process.env.MC_ALLOW_ANONYMOUS_COMPANY_CONTEXT;
    delete process.env.MC_ALLOW_ANONYMOUS_COMPANY_CONTEXT;
    try {
      const project = { _id: "project-1", tenantId: "tenant-1", githubRepo: "sellerfi/marketplace" };
      const ctx = {
        db: { get: async (id: string) => id === project._id ? project : null },
        auth: { getUserIdentity: async () => null },
      } as any;
      await expect(functionHandler(getDashboard)(ctx, { projectId: project._id })).rejects.toThrow(/unavailable or unauthorized/);
      await expect(functionHandler(refresh)(ctx, { projectId: project._id })).rejects.toThrow(/unavailable or unauthorized/);
    } finally {
      if (originalDemoFlag === undefined) delete process.env.MC_ALLOW_ANONYMOUS_COMPANY_CONTEXT;
      else process.env.MC_ALLOW_ANONYMOUS_COMPANY_CONTEXT = originalDemoFlag;
    }
  });

  it("normalizes volatile error details into a stable recurring identity", () => {
    expect(
      normalizeLearningSignature(
        "TS2322 at src/cart.ts:184 — commit 9efbd401c2f8 and run 182731",
      ),
    ).toBe(
      normalizeLearningSignature(
        "TS2322 at src/cart.ts:291 — commit d0e5ff2ff57d and run 182799",
      ),
    );
  });

  it("turns three identical correction signals into one cluster and one candidate", () => {
    const signals = [
      signal(),
      signal({ evidenceFingerprint: "evidence-2", evidenceRefs: ["trace:trace-2"] }),
      signal({ evidenceFingerprint: "evidence-3", evidenceRefs: ["trace:trace-3"] }),
    ];

    const result = aggregateLearningSignals(signals, {
      minimumOccurrences: 3,
      maximumEvidenceItems: 20,
      windowStart: Date.UTC(2026, 7, 1),
    });

    expect(result.clusters).toHaveLength(1);
    expect(result.clusters[0]).toMatchObject({
      occurrenceCount: 3,
      evidenceCount: 3,
      qualifiesForCandidate: true,
      acceptanceAuthority: false,
    });
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      candidateType: "ADD_DETERMINISTIC_GATE",
      risk: "MEDIUM",
      acceptanceAuthority: false,
    });
  });

  it("suppresses duplicate evidence and cannot create infinite candidates", () => {
    const duplicate = signal();
    const result = aggregateLearningSignals(
      [duplicate, duplicate, duplicate, duplicate],
      { minimumOccurrences: 3, maximumEvidenceItems: 20, windowStart: 0 },
    );

    expect(result.clusters[0]).toMatchObject({
      occurrenceCount: 1,
      evidenceCount: 1,
      qualifiesForCandidate: false,
    });
    expect(result.duplicatesSuppressed).toBe(3);
    expect(result.candidates).toHaveLength(0);
  });

  it("never clusters signals across workspace or repository scope", () => {
    const result = aggregateLearningSignals(
      [
        signal(),
        signal({ evidenceFingerprint: "evidence-2", repositoryKey: "sellerfi/api" }),
        signal({ evidenceFingerprint: "evidence-3", projectId: "workspace-b" }),
      ],
      { minimumOccurrences: 1, maximumEvidenceItems: 20, windowStart: 0 },
    );

    expect(result.clusters).toHaveLength(3);
    expect(new Set(result.clusters.map((cluster) => cluster.clusterKey)).size).toBe(3);
    expect(learningClusterKey(signal())).not.toBe(
      learningClusterKey(signal({ repositoryKey: "sellerfi/api" })),
    );
  });

  it("maps deterministic work, context misses, and routing mismatches to bounded candidates", () => {
    const automation = buildImprovementCandidate({
      ...aggregateLearningSignals(
        [signal({ signalType: "UNNECESSARY_AGENT_USAGE", deterministicKey: "tool:format" })],
        { minimumOccurrences: 1, maximumEvidenceItems: 20, windowStart: 0 },
      ).clusters[0],
    });
    const context = buildImprovementCandidate({
      ...aggregateLearningSignals(
        [signal({ signalType: "CONTEXT_MISS", deterministicKey: "source:adr-004" })],
        { minimumOccurrences: 1, maximumEvidenceItems: 20, windowStart: 0 },
      ).clusters[0],
    });
    const routing = buildImprovementCandidate({
      ...aggregateLearningSignals(
        [signal({ signalType: "MODEL_ROUTING_MISMATCH", deterministicKey: "planner:economy" })],
        { minimumOccurrences: 1, maximumEvidenceItems: 20, windowStart: 0 },
      ).clusters[0],
    });

    expect(automation).toMatchObject({
      candidateType: "REPLACE_AGENT_WITH_CODE",
      observedCostImpact: undefined,
    });
    expect(context.candidateType).toBe("UPDATE_CONTEXT_POLICY");
    expect(routing).toMatchObject({
      candidateType: "CHANGE_MODEL_ROUTING",
      risk: "HIGH",
    });
  });

  it("extracts only explicit or allowlisted context, automation, and recipe signals", () => {
    expect(deriveObservationLearningSignals({
      type: "AGENT",
      name: "Format generated schema",
    })).toEqual([expect.objectContaining({
      signalType: "UNNECESSARY_AGENT_USAGE",
      confidence: 0.85,
    })]);
    expect(deriveObservationLearningSignals({
      type: "RETRIEVAL",
      name: "Factory Memory context.sufficiency",
      output: { resultCount: 0 },
      metadata: {
        domain: "FACTORY_MEMORY",
        factoryObservationType: "context.sufficiency",
        detail: { sufficient: false, missingSources: ["ADR-004"] },
      },
    })).toEqual([expect.objectContaining({
      signalType: "CONTEXT_MISS",
      deterministicKey: "context-sufficiency:ADR-004",
    })]);
    expect(deriveObservationLearningSignals({
      type: "AGENT",
      name: "Design checkout strategy",
    })).toEqual([]);
    expect(deriveRecipeMismatch({
      workflowId: "build-test",
      steps: [
        { stepId: "build", retryCount: 0 },
        { stepId: "test", retryCount: 1, error: "tsc reported a type error" },
      ],
    })).toMatchObject({
      signalType: "RECIPE_MISMATCH",
      deterministicKey: "recipe:build-test:build-before-typecheck",
    });
  });

  it("projects Spec defects as advisory recurring evidence with exact finding lineage", () => {
    const signals = deriveMissionSpecLearningSignals([
      { code: "AMBIGUOUS_PLACEHOLDER", path: "requirements[3].description", message: "Replace TBD.", blocking: true },
      { code: "ACCEPTANCE_VERIFICATION_MISSING", path: "acceptanceExpectations[0]", message: "Map verification.", blocking: true },
      { code: "STABLE_ID_INVALID", path: "requirements[0].id", message: "Use a stable ID.", blocking: true },
    ]);
    expect(signals).toHaveLength(2);
    expect(signals).toEqual(expect.arrayContaining([
      expect.objectContaining({ signalType: "PROMPT_AMBIGUITY", findingCode: "AMBIGUOUS_PLACEHOLDER" }),
      expect.objectContaining({ signalType: "CONTEXT_MISS", findingCode: "ACCEPTANCE_VERIFICATION_MISSING" }),
    ]));
  });

  it("keeps the V1 candidate taxonomy exact and bounded", () => {
    expect(IMPROVEMENT_CANDIDATE_TYPES).toEqual([
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
    ]);
  });

  it("projects bounded harness identity into advisory learning context without granting acceptance authority", () => {
    expect(harnessLearningContext({
      harness: {
        harnessId: "deepseek-harness",
        harnessVersion: "0.1.0-rc.5",
        adapter: "deepseek-harness",
        version: "0.2.0",
        capabilityManifestSha256: `sha256:${"a".repeat(64)}`,
        effectiveConfigSha256: "b".repeat(64),
      },
      publicationPermit: "must-not-project",
    })).toEqual({
      harnessId: "deepseek-harness",
      harnessVersion: "0.1.0-rc.5",
      adapter: "deepseek-harness",
      adapterVersion: "0.2.0",
      capabilityManifestSha256: `sha256:${"a".repeat(64)}`,
      effectiveConfigSha256: "b".repeat(64),
    });
  });

  it("promotes learning through a submitted Mission plan instead of direct repository work", async () => {
    const suggestion = {
      _id: "candidate-1",
      projectId: "project-1",
      repositoryId: "repository-1",
      title: "replace agent with code: formatting",
      summary: "Formatting repeatedly consumed an agent turn.",
      status: "ACCEPTED",
      kind: "DELEGATION",
      candidateType: "REPLACE_AGENT_WITH_CODE",
      proposedChange: "Replace the repeated formatter step with deterministic code.",
      expectedBenefit: "Remove unnecessary model interpretation.",
      evidenceCount: 4,
      confidence: 1,
      impact: "MEDIUM",
      risk: "MEDIUM",
      sourceLinks: ["trace:1"],
      experimentId: "experiment-1",
      learningClusterId: "cluster-1",
      acceptanceAuthority: false,
    };
    const queryResults = [
      suggestion,
      { allowed: true, actorId: "operator-2", projectExists: true },
      { experiment: { _id: "experiment-1", status: "COMPLETED" } },
      { _id: "project-1", githubRepo: "sellerfi/marketplace", githubBranch: "main" },
      true,
      { workflowId: "feature-dev", version: 3, active: true },
    ];
    const mutationCalls: Array<{ args: any }> = [];
    const ctx = {
      runQuery: async () => {
        if (!queryResults.length) throw new Error("Unexpected query reference");
        return queryResults.shift();
      },
      runMutation: async (_reference: unknown, args: any) => {
        mutationCalls.push({ args });
        if (mutationCalls.length === 1) {
          return { mission: { _id: "mission-1" }, created: true };
        }
        if (mutationCalls.length === 2) {
          return { plan: { _id: "plan-1" }, created: true };
        }
        if (mutationCalls.length === 3) {
          return { plan: { _id: "plan-1", status: "PROPOSED" }, created: true };
        }
        if (mutationCalls.length === 4) return "candidate-1";
        throw new Error("Learning promotion attempted an unexpected mutation");
      },
    } as any;

    const result = await functionHandler(resolveMetaLoop)(ctx, {
      suggestionId: "candidate-1",
      action: "ACCEPT",
    });

    expect(result).toEqual({
      suggestionId: "candidate-1",
      missionId: "mission-1",
      missionPlanId: "plan-1",
    });
    expect(mutationCalls).toHaveLength(4);
    expect(mutationCalls[0].args.idempotencyKey).toBe("factory-learning:candidate-1:mission");
    expect(mutationCalls[2].args.idempotencyKey).toBe("factory-learning:candidate-1:submit-plan");
    expect(mutationCalls[3].args).toMatchObject({
      suggestionId: "candidate-1",
      status: "ACCEPTED",
      missionId: "mission-1",
      missionPlanId: "plan-1",
    });
    expect(mutationCalls[1].args).toMatchObject({
      missionId: "mission-1",
      metadata: {
        factoryLearningCandidateId: "candidate-1",
        acceptanceAuthority: false,
      },
      workOrderBlueprints: [{
        workflowId: "feature-dev",
        branchStrategy: "isolated-worktree",
        isMutating: true,
      }],
    });
  });

  it("has no code path that can accept work or manufacture verification evidence", () => {
    const learningSource = readFileSync(
      new URL("../factory/learning.ts", import.meta.url),
      "utf8",
    );
    const promotionSource = readFileSync(
      new URL("../factory/metaLoop.ts", import.meta.url),
      "utf8",
    );
    for (const source of [learningSource, promotionSource]) {
      expect(source).not.toContain("workOrders.accept");
      expect(source).not.toMatch(/ctx\.db\.insert\(\s*["']verificationReceipts["']/);
      expect(source).not.toMatch(/ctx\.db\.insert\(\s*["']evidenceEnvelopes["']/);
    }
  });

  it("compares baseline and candidate without claiming significance or auto-promoting", () => {
    const lowSample = recommendImprovementPromotion({
      baseline: {
        sampleSize: 4,
        successRate: 0.5,
        firstPassVerificationRate: 0.5,
        averageRetries: 1.5,
        humanInterventionRate: 0.5,
        averageDurationMs: 12_000,
        averageTokens: 1_200,
        averageCostUsd: 3,
        deterministicFailures: 2,
      },
      candidate: {
        sampleSize: 4,
        successRate: 0.75,
        firstPassVerificationRate: 0.75,
        averageRetries: 0.5,
        humanInterventionRate: 0.25,
        averageDurationMs: 9_000,
        averageTokens: 900,
        averageCostUsd: 2,
        deterministicFailures: 1,
      },
    });

    expect(lowSample).toMatchObject({
      recommendation: "PROMOTION_RECOMMENDED",
      sampleLabel: "LOW_SAMPLE",
      statisticallySignificant: false,
      autoPromote: false,
    });

    const regression = recommendImprovementPromotion({
      baseline: { sampleSize: 40, successRate: 0.9, deterministicFailures: 1 },
      candidate: { sampleSize: 40, successRate: 0.8, deterministicFailures: 3 },
    });
    expect(regression.recommendation).toBe("REJECT_RECOMMENDED");
    expect(regression.autoPromote).toBe(false);
  });
});
