import { describe, expect, it } from "vitest";
import { computeCanonicalHash } from "../lib/genomeHash";
import {
  MODEL_ROUTE_COST_POLICY_SCHEMA,
  EXACT_MODEL_ROUTE_SCHEMA,
  LEGACY_EXACT_MODEL_ROUTE_SCHEMA,
  LEGACY_MODEL_ROUTE_QUALIFICATION_SCHEMA,
  MODEL_ROUTE_QUALIFICATION_SCHEMA,
  exactModelRouteDigest,
  exactModelRouteIssues,
  exactModelRouteQualificationSnapshot,
  exactModelRouteSnapshot,
  modelRouteCostPolicyDigest,
  modelRouteQualifiedFor,
  frozenLegacyModelRouteEligibleForExecution,
  frozenLegacyModelRouteProductionEligible,
  legacyExactModelRouteDigest,
  legacyModelRouteMatchesExecution,
  modelRouteEligibleForNewFactoryVersion,
  modelRouteExecutionCompatibilityBinding,
  modelRouteExecutionCompatibilityMatches,
  modelRouteProductionEligible,
  modelRouteQualificationDigest,
} from "../lib/modelRouteAdmission";

const compatibility = modelRouteExecutionCompatibilityBinding({
  adapter: "generic-harness",
  version: "v1",
  capabilityManifestDigest: `sha256:${"1".repeat(64)}`,
  effectiveConfigSha256: "2".repeat(64),
  runtimeArtifactDigest: `sha256:${"3".repeat(64)}`,
  executionBackend: "persistent-worker",
});

const routeSnapshot = exactModelRouteSnapshot({
  provider: " Anthropic ",
  providerRoute: " Vertex-AI ",
  modelId: "claude-tool-model",
  reasoningConfig: {
    effort: " HIGH ",
    maxTokens: 16_384,
    temperature: 0.2,
  },
});
const routeDigest = exactModelRouteDigest(routeSnapshot);
const qualificationSnapshot = exactModelRouteQualificationSnapshot({
  routeDigest,
  evidenceReference: " docs/evidence.json ",
  evidenceDigest: `sha256:${"4".repeat(64)}`,
  workloadClasses: ["SOFTWARE_CHANGE", "BUG_FIX"],
  riskClasses: ["YELLOW", "GREEN"],
  promotedBy: " operator-1 ",
  promotedAt: 1,
  compatibility,
});
const qualificationDigest = modelRouteQualificationDigest(qualificationSnapshot);
const promoted = {
  routeSnapshot,
  routeDigest,
  enabled: true,
  qualificationStatus: "EVIDENCE_QUALIFIED",
  admissionStatus: "PRODUCTION_PILOT_ELIGIBLE",
  qualificationSnapshot,
  qualificationDigest,
};

const legacyRouteSnapshot = {
  schema: LEGACY_EXACT_MODEL_ROUTE_SCHEMA,
  provider: "openai",
  providerRoute: "openai",
  modelId: "gpt-5.6-terra",
  capabilityIdentity: {
    adapter: "codex",
    version: "v1",
    capabilityManifestDigest: "sha256:7e8b7435f6dab9a8a9a09b90ae1791110c3593ad1b38cdc48227d18069ec1c06",
    effectiveConfigSha256: "94daa9e3e1ee5ce2e3d8ca9116ec29c1a1eb8d78e232d1abb383cbdf2e7d6081",
  },
  runtimeIdentity: {
    kind: "CODEX_CLI",
    cliVersion: "0.146.0",
    executableSha256: "ae1d3ffe6d48aec6a4dc3f50e7eb8e0d11962485a6a9406c5a7012139383da02",
  },
} as const;
const legacyRouteDigest = "sha256:026b1d795909f7b6cf7592e750fd421829081b65ce3016f7f5f50a243a155e1f";
const legacyQualificationSnapshot = {
  schema: LEGACY_MODEL_ROUTE_QUALIFICATION_SCHEMA,
  routeDigest: legacyRouteDigest,
  evidence: { reference: "docs/legacy-evidence.json", digest: `sha256:${"5".repeat(64)}` },
  scope: { workloadClasses: ["SOFTWARE_CHANGE"], riskClasses: ["GREEN"] },
  promotedBy: "operator-1",
  promotedAt: 1,
  authority: {
    executionOnly: true,
    routing: false,
    verification: false,
    acceptance: false,
    publication: false,
    merge: false,
  },
};
const legacyQualificationDigest = modelRouteQualificationDigest(legacyQualificationSnapshot);
const legacyPromoted = {
  routeSnapshot: legacyRouteSnapshot,
  routeDigest: legacyRouteDigest,
  enabled: true,
  qualificationStatus: "EVIDENCE_QUALIFIED",
  admissionStatus: "PRODUCTION_PILOT_ELIGIBLE",
  qualificationSnapshot: legacyQualificationSnapshot,
  qualificationDigest: legacyQualificationDigest,
};
const frozenLegacyExecution = {
  adapter: "codex",
  version: "v1",
  capabilityManifestDigest: legacyRouteSnapshot.capabilityIdentity.capabilityManifestDigest,
  effectiveConfigSha256: legacyRouteSnapshot.capabilityIdentity.effectiveConfigSha256,
  executionBackend: "persistent-worker" as const,
  executableSha256: legacyRouteSnapshot.runtimeIdentity.executableSha256,
};

describe("exact model route admission", () => {
  it("constructs a canonical inference-only V2 route without Codex or harness identity", () => {
    expect(routeSnapshot).toEqual({
      schema: EXACT_MODEL_ROUTE_SCHEMA,
      provider: "anthropic",
      providerRoute: "vertex-ai",
      modelId: "claude-tool-model",
      reasoningConfig: {
        effort: "high",
        temperature: 0.2,
        maxTokens: 16_384,
      },
    });
    expect(routeSnapshot).not.toHaveProperty("capabilityIdentity");
    expect(routeSnapshot).not.toHaveProperty("runtimeIdentity");
    expect(JSON.stringify(routeSnapshot)).not.toContain("CODEX_CLI");
    expect(exactModelRouteDigest(routeSnapshot)).toBe(routeDigest);
  });

  it("normalizes route input deterministically and makes reasoning controls part of identity", () => {
    const equivalent = exactModelRouteSnapshot({
      provider: "ANTHROPIC",
      providerRoute: "VERTEX-AI",
      modelId: "claude-tool-model",
      reasoningConfig: { effort: "high", temperature: 0.2, maxTokens: 16_384 },
    });
    const changedReasoning = exactModelRouteSnapshot({
      provider: "anthropic",
      providerRoute: "vertex-ai",
      modelId: "claude-tool-model",
      reasoningConfig: { effort: "medium", temperature: 0.2, maxTokens: 16_384 },
    });
    expect(exactModelRouteDigest(equivalent)).toBe(routeDigest);
    expect(exactModelRouteDigest(changedReasoning)).not.toBe(routeDigest);
  });

  it("represents DeepSeek without a Codex semantic dependency", () => {
    const deepSeekRoute = exactModelRouteSnapshot({
      provider: "DeepSeek",
      providerRoute: "DeepSeek",
      modelId: "deepseek-coder",
    });
    expect(deepSeekRoute).toEqual({
      schema: EXACT_MODEL_ROUTE_SCHEMA,
      provider: "deepseek",
      providerRoute: "deepseek",
      modelId: "deepseek-coder",
    });
    expect(exactModelRouteIssues(deepSeekRoute)).toEqual([]);
  });

  it("rejects harness/runtime contamination and unknown route fields", () => {
    const contaminated = {
      ...routeSnapshot,
      capabilityIdentity: { adapter: "codex" },
      runtimeIdentity: { kind: "CODEX_CLI" },
    };
    expect(exactModelRouteIssues(contaminated)).toEqual(expect.arrayContaining([
      "route-fields-invalid",
      "harness-identity-not-allowed",
      "runtime-identity-not-allowed",
    ]));
    expect(() => exactModelRouteDigest(contaminated)).toThrow("Exact model route identity is invalid");
  });

  it("does not treat registration as qualification", () => {
    expect(modelRouteProductionEligible({
      routeSnapshot,
      routeDigest,
      enabled: false,
      qualificationStatus: "UNQUALIFIED",
      admissionStatus: "DISABLED",
    })).toBe(false);
    expect(modelRouteEligibleForNewFactoryVersion({
      routeSnapshot,
      routeDigest,
      enabled: false,
      qualificationStatus: "UNQUALIFIED",
      admissionStatus: "DISABLED",
    }, compatibility)).toBe(false);
  });

  it("admits a V2 route only for its exact qualified harness/runtime/backend tuple", () => {
    expect(qualificationSnapshot.schema).toBe(MODEL_ROUTE_QUALIFICATION_SCHEMA);
    expect(qualificationSnapshot.scope).toEqual({
      workloadClasses: ["BUG_FIX", "SOFTWARE_CHANGE"],
      riskClasses: ["GREEN", "YELLOW"],
    });
    expect(modelRouteProductionEligible(promoted)).toBe(true);
    expect(modelRouteEligibleForNewFactoryVersion(promoted, compatibility)).toBe(true);
    expect(modelRouteExecutionCompatibilityMatches(qualificationSnapshot, compatibility)).toBe(true);

    for (const mismatch of [
      { ...compatibility, adapter: "wrong-harness" },
      { ...compatibility, version: "v2" },
      { ...compatibility, capabilityManifestDigest: `sha256:${"6".repeat(64)}` },
      { ...compatibility, effectiveConfigSha256: "7".repeat(64) },
      { ...compatibility, runtimeArtifactDigest: `sha256:${"8".repeat(64)}` },
      { ...compatibility, executionBackend: "remote-sandbox" as const },
    ]) {
      expect(modelRouteEligibleForNewFactoryVersion(promoted, mismatch)).toBe(false);
    }
  });

  it("keeps model identity stable when harness/runtime compatibility changes", () => {
    const otherCompatibility = modelRouteExecutionCompatibilityBinding({
      ...compatibility,
      adapter: "another-harness",
      runtimeArtifactDigest: `sha256:${"9".repeat(64)}`,
    });
    const otherQualification = exactModelRouteQualificationSnapshot({
      routeDigest,
      evidenceReference: "docs/evidence.json",
      evidenceDigest: `sha256:${"4".repeat(64)}`,
      workloadClasses: ["BUG_FIX", "SOFTWARE_CHANGE"],
      riskClasses: ["GREEN", "YELLOW"],
      promotedBy: "operator-1",
      promotedAt: 1,
      compatibility: otherCompatibility,
    });
    expect(exactModelRouteDigest(routeSnapshot)).toBe(routeDigest);
    expect(modelRouteQualificationDigest(otherQualification)).not.toBe(qualificationDigest);
  });

  it("fails closed on route, qualification, and authority tampering", () => {
    expect(modelRouteProductionEligible({
      ...promoted,
      routeSnapshot: { ...routeSnapshot, modelId: "tampered-model" },
    })).toBe(false);
    expect(modelRouteProductionEligible({
      ...promoted,
      routeDigest: `sha256:${"0".repeat(64)}`,
    })).toBe(false);
    expect(modelRouteProductionEligible({
      ...promoted,
      qualificationSnapshot: {
        ...qualificationSnapshot,
        authority: { ...qualificationSnapshot.authority, routing: true },
      },
    })).toBe(false);
    expect(modelRouteProductionEligible({
      ...promoted,
      qualificationSnapshot: {
        ...qualificationSnapshot,
        compatibility: {
          ...qualificationSnapshot.compatibility,
          runtimeArtifactDigest: `sha256:${"0".repeat(64)}`,
        },
      },
    })).toBe(false);
  });

  it("preserves the historical V1 validation and canonical digest", () => {
    expect(exactModelRouteIssues(legacyRouteSnapshot)).toEqual([]);
    expect(legacyExactModelRouteDigest(legacyRouteSnapshot)).toBe(legacyRouteDigest);
    expect(exactModelRouteDigest(legacyRouteSnapshot)).toBe(legacyRouteDigest);
    expect(modelRouteProductionEligible(legacyPromoted)).toBe(true);
    expect(frozenLegacyModelRouteProductionEligible(legacyPromoted)).toBe(true);
  });

  it("quarantines V1 eligibility to exact frozen legacy execution", () => {
    expect(modelRouteEligibleForNewFactoryVersion(legacyPromoted, compatibility)).toBe(false);
    expect(legacyModelRouteMatchesExecution(legacyRouteSnapshot, frozenLegacyExecution)).toBe(true);
    expect(frozenLegacyModelRouteEligibleForExecution(legacyPromoted, frozenLegacyExecution)).toBe(true);
    expect(frozenLegacyModelRouteEligibleForExecution(legacyPromoted, {
      ...frozenLegacyExecution,
      adapter: "deepseek",
    })).toBe(false);
    expect(frozenLegacyModelRouteEligibleForExecution(legacyPromoted, {
      ...frozenLegacyExecution,
      executableSha256: "0".repeat(64),
    })).toBe(false);
    expect(frozenLegacyModelRouteEligibleForExecution(legacyPromoted, {
      ...frozenLegacyExecution,
      executionBackend: "remote-sandbox",
      imageDigest: `sha256:${"0".repeat(64)}`,
    })).toBe(false);
  });

  it("does not let V1 and V2 qualification schemas cross-authorize", () => {
    expect(modelRouteProductionEligible({
      ...promoted,
      qualificationSnapshot: legacyQualificationSnapshot,
      qualificationDigest: legacyQualificationDigest,
    })).toBe(false);
    expect(modelRouteProductionEligible({
      ...legacyPromoted,
      qualificationSnapshot,
      qualificationDigest,
    })).toBe(false);
  });

  it("requires exact repository, workload, RED scope, and auditable cost identity", () => {
    const costPolicy = {
      schema: MODEL_ROUTE_COST_POLICY_SCHEMA,
      method: "FULL_APPROVED_WORK_ORDER_CAP_RESERVATION",
      currency: "USD",
      estimatedCostPerRunUsd: 24,
      reservationMode: "FULL_ESTIMATE",
      actualCostTelemetry: "UNAVAILABLE",
      unknownActualCostReason: "Saved ChatGPT authentication does not expose authoritative USD telemetry.",
      evidence: { reference: "docs/red-route.md", digest: `sha256:${"5".repeat(64)}` },
      source: {
        kind: "APPROVED_WORK_ORDER",
        workOrderId: "work-order-1",
        workOrderRevisionNumber: 1,
        missionPlanId: "plan-1",
        missionPlanRevision: 1,
        planEstimatedCostUsd: 32,
        workOrderEstimatedCostUsd: 24,
        hardLimitUsd: 24,
        maxRuntimeMinutes: 60,
        maxAttempts: 3,
      },
    };
    const redQualification = {
      ...qualificationSnapshot,
      scope: {
        workloadClasses: ["SOFTWARE_CHANGE"],
        riskClasses: ["RED", "YELLOW"],
        repositoryIds: ["repository-1"],
      },
      costPolicy,
    };
    const redRoute = {
      routeSnapshot,
      routeDigest,
      enabled: true,
      qualificationStatus: "EVIDENCE_QUALIFIED",
      admissionStatus: "PRODUCTION_PILOT_ELIGIBLE",
      qualificationSnapshot: redQualification,
      qualificationDigest: `sha256:${computeCanonicalHash({ namespace: MODEL_ROUTE_QUALIFICATION_SCHEMA, value: redQualification })}`,
      riskApproved: true,
      estimatedCostPerRunUsd: 24,
      costPolicySnapshot: costPolicy,
      costPolicyDigest: modelRouteCostPolicyDigest(costPolicy),
    };
    expect(modelRouteQualifiedFor(redRoute, {
      workloadClass: "SOFTWARE_CHANGE",
      riskClass: "RED",
      repositoryId: "repository-1",
    })).toBe(true);
    expect(modelRouteQualifiedFor(redRoute, {
      workloadClass: "SOFTWARE_CHANGE",
      riskClass: "RED",
      repositoryId: "repository-2",
    })).toBe(false);
    expect(modelRouteQualifiedFor(redRoute, {
      workloadClass: "MISSION_PLANNING",
      riskClass: "YELLOW",
      repositoryId: "repository-1",
    })).toBe(false);
    expect(modelRouteProductionEligible({ ...redRoute, estimatedCostPerRunUsd: 0 })).toBe(false);
  });
});
