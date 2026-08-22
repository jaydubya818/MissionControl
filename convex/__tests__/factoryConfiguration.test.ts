import { describe, expect, it } from "vitest";
import {
  factoryConfigurationDigest,
  validFactoryBudget,
  validFactoryExecutorBinding,
  validFactoryExecutionBinding,
  type FactoryConfigurationInput,
} from "../lib/factoryConfiguration";
import { CODEX_V1_HARNESS_MANIFEST, harnessCapabilityManifestDigest } from "@mission-control/workflow-engine";

const configuration: FactoryConfigurationInput = {
  purpose: "SOFTWARE",
  repositoryId: "repository-1",
  workflowId: "workflow-1",
  executor: { adapter: "codex", version: "v1" },
  harnessCapabilityManifest: CODEX_V1_HARNESS_MANIFEST,
  harnessCapabilityManifestDigest: harnessCapabilityManifestDigest(CODEX_V1_HARNESS_MANIFEST),
  harnessEffectiveConfigSha256: CODEX_V1_HARNESS_MANIFEST.effectiveConfigSha256,
  modelCatalogId: "model-route-1",
  modelRouteDigest: `sha256:${"a".repeat(64)}`,
  executionBackend: "persistent-worker",
  codeScopeIds: ["scope-b", "scope-a"],
  agentBindings: [
    { workflowAgentId: "implementer", agentVersionId: "agent-version-1" },
    { workflowAgentId: "reviewer", agentVersionId: "agent-version-2" },
  ],
  policyEnvelopeId: "policy-1",
  budget: { maxCostUsd: 100, maxRuntimeMinutes: 120, maxAttempts: 2 },
  verifierIds: ["verifier-b", "verifier-a"],
  riskBoundary: "YELLOW",
  recovery: { pause: true, cancel: true, retry: true, resume: true },
};

describe("Factory configuration", () => {
  it("produces the same digest for semantically identical verifier order", () => {
    expect(factoryConfigurationDigest(configuration)).toBe(
      factoryConfigurationDigest({
        ...configuration,
        verifierIds: ["verifier-a", "verifier-b"],
      })
    );
  });

  it("changes the digest when material authority changes", () => {
    expect(factoryConfigurationDigest(configuration)).not.toBe(
      factoryConfigurationDigest({
        ...configuration,
        executor: { adapter: "codex", version: "v2" },
      })
    );
    expect(factoryConfigurationDigest(configuration)).not.toBe(
      factoryConfigurationDigest({
        ...configuration,
        harnessEffectiveConfigSha256: "f".repeat(64),
      })
    );
    expect(factoryConfigurationDigest(configuration)).not.toBe(
      factoryConfigurationDigest({
        ...configuration,
        modelRouteDigest: `sha256:${"b".repeat(64)}`,
      })
    );
  });

  it("binds Factory purpose into the immutable configuration digest", () => {
    expect(factoryConfigurationDigest(configuration)).not.toBe(
      factoryConfigurationDigest({ ...configuration, purpose: "VERIFICATION" })
    );
  });

  it("canonicalizes code scopes and agent binding order", () => {
    expect(factoryConfigurationDigest(configuration)).toBe(
      factoryConfigurationDigest({
        ...configuration,
        codeScopeIds: ["scope-a", "scope-b"],
        agentBindings: [...configuration.agentBindings].reverse(),
      })
    );
  });

  it("changes the digest when path or agent authority changes", () => {
    expect(factoryConfigurationDigest(configuration)).not.toBe(
      factoryConfigurationDigest({
        ...configuration,
        codeScopeIds: ["scope-a"],
      })
    );
    expect(factoryConfigurationDigest(configuration)).not.toBe(
      factoryConfigurationDigest({
        ...configuration,
        agentBindings: [{ workflowAgentId: "implementer", agentVersionId: "agent-version-3" }],
      })
    );
  });

  it("enforces bounded V1 budget and retry limits", () => {
    expect(validFactoryBudget(configuration.budget)).toBe(true);
    expect(validFactoryBudget({ ...configuration.budget, maxCostUsd: 0 })).toBe(false);
    expect(validFactoryBudget({ ...configuration.budget, maxRuntimeMinutes: 481 })).toBe(false);
    expect(validFactoryBudget({ ...configuration.budget, maxAttempts: 4 })).toBe(false);
  });

  it("accepts bounded provider-neutral harness identities without granting authority", () => {
    expect(validFactoryExecutorBinding({ adapter: "codex", version: "v1" })).toBe(true);
    expect(validFactoryExecutorBinding({ adapter: "deepseek-harness", version: "v1" })).toBe(true);
    expect(validFactoryExecutorBinding({ adapter: "loom", version: "v1" })).toBe(true);
    expect(validFactoryExecutorBinding({ adapter: " loom", version: "v1" })).toBe(false);
    expect(validFactoryExecutorBinding({ adapter: "loom", version: "v1\nunsafe" })).toBe(false);
  });

  it("binds remote execution to one immutable profile and fail-closed recovery", () => {
    expect(validFactoryExecutionBinding(configuration)).toBe(true);
    expect(validFactoryExecutionBinding({
      executionBackend: "remote-sandbox",
      sandboxProfileId: "profile-1",
      sandboxProfileDigest: "sha256:profile",
      riskBoundary: "YELLOW",
      recovery: { pause: false, cancel: true, retry: true, resume: false },
    })).toBe(true);
    expect(validFactoryExecutionBinding({
      executionBackend: "remote-sandbox",
      sandboxProfileId: "profile-1",
      sandboxProfileDigest: "sha256:profile",
      riskBoundary: "RED",
      recovery: { pause: false, cancel: true, retry: true, resume: false },
    })).toBe(false);
    expect(validFactoryExecutionBinding({
      executionBackend: "remote-sandbox",
      riskBoundary: "GREEN",
      recovery: { pause: false, cancel: true, retry: true, resume: false },
    })).toBe(false);
  });

  it("changes the Factory digest when execution backend or profile authority changes", () => {
    const remote = {
      ...configuration,
      executionBackend: "remote-sandbox" as const,
      sandboxProfileId: "profile-1",
      sandboxProfileDigest: "sha256:profile-1",
      recovery: { pause: false, cancel: true, retry: true, resume: false },
    };
    expect(factoryConfigurationDigest(remote)).not.toBe(factoryConfigurationDigest(configuration));
    expect(factoryConfigurationDigest({ ...remote, sandboxProfileDigest: "sha256:profile-2" })).not.toBe(factoryConfigurationDigest(remote));
  });
});
