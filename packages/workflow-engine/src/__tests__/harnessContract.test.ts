import { describe, expect, it } from "vitest";
import {
  CODEX_V1_RUNTIME_ARTIFACT,
  CODEX_V1_HARNESS_MANIFEST,
  DEEPSEEK_V1_HARNESS_MANIFEST,
  DEEPSEEK_V1_RUNTIME_ARTIFACT,
  boundedProviderMetadata,
  harnessCapabilityManifestDigest,
  harnessCapabilityRequirementsSatisfied,
  harnessManifestIssues,
  harnessNormalizedResultIssues,
  harnessExecutionRequestDigest,
  harnessRuntimeArtifactDigest,
  harnessRuntimeArtifactIssues,
  type HarnessNormalizedResult,
} from "../index.js";

function normalizedResult(): HarnessNormalizedResult {
  return {
    schemaVersion: "harness-result/v1",
    executionId: "attempt-1",
    status: "COMPLETED",
    harness: CODEX_V1_HARNESS_MANIFEST.identity,
    provenance: {
      provider: "openai",
      model: "gpt-5.6-terra",
      capabilityManifestSha256: harnessCapabilityManifestDigest(CODEX_V1_HARNESS_MANIFEST),
      effectiveConfigSha256: CODEX_V1_HARNESS_MANIFEST.effectiveConfigSha256,
      executableSha256: null,
      requestSha256: `sha256:${"a".repeat(64)}`,
      providerMetadata: { protocol: "jsonl" },
    },
    timing: { startedAt: 10, finishedAt: 20, wallClockMs: 10 },
    repository: {
      root: "/tmp/repository",
      workingDirectory: "/tmp/repository",
      baselineCommit: null,
      headCommit: null,
      headChanged: false,
      changedFiles: [],
      scopeViolations: [],
    },
    events: { items: [], toolCalls: null, modelRequests: null, retries: null, sessionCount: null },
    usage: { inputTokens: null, outputTokens: null, cacheReadTokens: null, cacheWriteTokens: null, costUsd: null },
    exitCode: 0,
    signal: null,
    output: "{}",
    structuredOutput: { schema: null, summary: null },
    error: null,
    cancellation: { requested: false, mode: "NONE" },
    cleanup: { status: "NOT_RUN", completedAt: null, error: null },
  };
}

describe("generic harness contract", () => {
  it("keeps exact stable adapter-effective manifests for both concrete adapters", () => {
    expect(harnessManifestIssues(CODEX_V1_HARNESS_MANIFEST)).toEqual([]);
    expect(harnessManifestIssues(DEEPSEEK_V1_HARNESS_MANIFEST)).toEqual([]);
    expect(harnessCapabilityManifestDigest(CODEX_V1_HARNESS_MANIFEST)).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(harnessCapabilityManifestDigest({ ...CODEX_V1_HARNESS_MANIFEST })).toBe(harnessCapabilityManifestDigest(CODEX_V1_HARNESS_MANIFEST));
    expect(DEEPSEEK_V1_HARNESS_MANIFEST.identity).toMatchObject({
      harnessVersion: "0.1.0-rc.5",
      harnessCommit: "47f943859bef60e4160492346772ded9b24f765a",
    });
  });

  it("records capability differences instead of flattening them", () => {
    expect(CODEX_V1_HARNESS_MANIFEST.telemetry.modelRequests).toBe("UNSUPPORTED");
    expect(DEEPSEEK_V1_HARNESS_MANIFEST.telemetry.modelRequests).toBe("SUPPORTED");
    expect(CODEX_V1_HARNESS_MANIFEST.context.resume).toBe("UNSUPPORTED");
    expect(DEEPSEEK_V1_HARNESS_MANIFEST.context.resume).toBe("UNSUPPORTED");
    expect(DEEPSEEK_V1_HARNESS_MANIFEST.streaming.modelDeltas).toBe("UNSUPPORTED");
    expect(harnessCapabilityRequirementsSatisfied(CODEX_V1_HARNESS_MANIFEST, [
      { capability: "filesystem.write", minimumSupport: "SUPPORTED" },
      { capability: "cancellation.support", minimumSupport: "PARTIAL" },
    ])).toBe(true);
  });

  it("requires canonical, kind-specific runtime artifact digests", () => {
    expect(harnessRuntimeArtifactIssues(CODEX_V1_RUNTIME_ARTIFACT)).toEqual([]);
    expect(CODEX_V1_RUNTIME_ARTIFACT).not.toHaveProperty("closureSha256");
    expect(harnessRuntimeArtifactDigest(CODEX_V1_RUNTIME_ARTIFACT)).toBe("sha256:dbd2a09c812ba8b2a5b5425f5386b0c65b2a399e40813374597d20bcfcd855fc");
    expect(harnessRuntimeArtifactIssues(DEEPSEEK_V1_RUNTIME_ARTIFACT)).toEqual([]);
    expect(DEEPSEEK_V1_RUNTIME_ARTIFACT.closureSha256).toBe("f340dda4710952d53ea3611ace0d04959c1410aeeb9f6464254c644e4aedfa83");

    const executableWithImage = {
      ...CODEX_V1_RUNTIME_ARTIFACT,
      imageDigest: `sha256:${"a".repeat(64)}`,
    };
    expect(harnessRuntimeArtifactIssues(executableWithImage)).toContain("runtime-artifact-image-not-allowed");
    expect(() => harnessRuntimeArtifactDigest(executableWithImage)).toThrow(/runtime artifact is invalid/);

    const containerWithExecutable = {
      ...CODEX_V1_RUNTIME_ARTIFACT,
      kind: "CONTAINER_IMAGE" as const,
      executableSha256: "b".repeat(64),
      imageDigest: `sha256:${"a".repeat(64)}`,
    };
    expect(harnessRuntimeArtifactIssues(containerWithExecutable)).toContain("runtime-artifact-executable-not-allowed");

    expect(harnessRuntimeArtifactIssues({
      ...CODEX_V1_RUNTIME_ARTIFACT,
      executableSha256: "A".repeat(64),
    })).toContain("runtime-artifact-executable-digest-noncanonical");
    expect(harnessRuntimeArtifactIssues({
      ...containerWithExecutable,
      executableSha256: null,
      imageDigest: `sha256:${"A".repeat(64)}`,
    })).toContain("runtime-artifact-image-digest-noncanonical");
    expect(harnessRuntimeArtifactIssues({
      ...CODEX_V1_RUNTIME_ARTIFACT,
      closureSha256: "A".repeat(64),
    })).toContain("runtime-artifact-closure-digest-noncanonical");
    expect(harnessRuntimeArtifactIssues({
      ...CODEX_V1_RUNTIME_ARTIFACT,
      closureSha256: "not-a-digest",
    })).toContain("runtime-artifact-closure-digest-invalid");
    expect(harnessRuntimeArtifactIssues({
      ...CODEX_V1_RUNTIME_ARTIFACT,
      provider: "openai",
    })).toContain("runtime-artifact-fields-invalid");
  });

  it("accepts unavailable telemetry as null and rejects fabricated invalid values", () => {
    const result = normalizedResult();
    expect(harnessNormalizedResultIssues(result)).toEqual([]);
    expect(harnessNormalizedResultIssues({
      ...result,
      events: { ...result.events, modelRequests: -1 },
    })).toContain("result-telemetry-invalid");
    expect(harnessNormalizedResultIssues({
      ...result,
      harness: { ...result.harness, harnessCommit: "not-a-commit" },
    })).toContain("result-harness-identity-invalid");
    expect(harnessNormalizedResultIssues({
      ...result,
      events: { ...result.events, items: [{
        executionId: result.executionId,
        sequence: 1,
        type: "EXECUTION_COMPLETED",
        occurredAt: 20,
        summary: "done",
        metadata: Object.fromEntries(Array.from({ length: 101 }, (_, index) => [`key${index}`, index])),
      }] },
    })).toContain("result-events-invalid");
  });

  it("bounds provider-specific metadata to scalar diagnostic values", () => {
    expect(boundedProviderMetadata({ route: "chatgpt", cached: false, calls: 2, cost: null })).toEqual({
      route: "chatgpt", cached: false, calls: 2, cost: null,
    });
    expect(() => boundedProviderMetadata({ nested: { secret: true } })).toThrow(/scalar/);
    expect(() => boundedProviderMetadata(Object.fromEntries(Array.from({ length: 51 }, (_, index) => [`K${index}`, index])))).toThrow(/50/);
  });

  it("binds exact model-route identity into requests and validates additive result provenance", () => {
    const baseRequest = {
      executionId: "attempt-1",
      repositoryRoot: "/tmp/repository",
      workingDirectory: "/tmp/repository",
      prompt: "Implement it.",
      provider: "openai",
      model: "gpt-5.6-terra",
      allowedPaths: ["src/**"],
      timeoutMs: 60_000,
      isolation: "WORKSPACE_WRITE" as const,
    };
    const exactRequest = {
      ...baseRequest,
      modelRouteDigest: `sha256:${"b".repeat(64)}`,
      providerRoute: "openai",
      reasoningConfig: { effort: "high" },
    };
    expect(harnessExecutionRequestDigest(exactRequest)).not.toBe(harnessExecutionRequestDigest(baseRequest));

    const result = normalizedResult();
    result.provenance.modelRouteDigest = exactRequest.modelRouteDigest;
    result.provenance.providerRoute = exactRequest.providerRoute;
    result.provenance.reasoningConfig = exactRequest.reasoningConfig;
    expect(harnessNormalizedResultIssues(result)).toEqual([]);

    result.provenance.reasoningConfig = { temperature: 3 };
    expect(harnessNormalizedResultIssues(result)).toContain("result-provenance-invalid");
  });
});
