import { describe, expect, it } from "vitest";
import {
  buildFactoryExecutionManifest,
  factorySandboxResourceName,
  type FactoryExecutionManifestInput,
} from "../lib/executionManifest";
import { computeCanonicalHash } from "../lib/genomeHash";
import {
  CODEX_V1_HARNESS_MANIFEST,
  CODEX_V1_RUNTIME_ARTIFACT,
  DEEPSEEK_V1_HARNESS_MANIFEST,
  DEEPSEEK_V1_RUNTIME_ARTIFACT,
  harnessCapabilityManifestDigest,
  harnessRuntimeArtifactDigest,
} from "@mission-control/workflow-engine";
import {
  exactModelRouteDigest,
  exactModelRouteQualificationSnapshot,
  exactModelRouteSnapshot,
  modelRouteQualificationDigest,
} from "../lib/modelRouteAdmission";

function legacyQualificationSnapshot(routeDigest: string) {
  return {
    schema: "factory-model-route-qualification/v1" as const,
    routeDigest,
    evidence: { reference: "docs/evidence/legacy.json", digest: `sha256:${"7".repeat(64)}` },
    scope: { workloadClasses: ["SOFTWARE_CHANGE"], riskClasses: ["YELLOW"] },
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
}

const codexCapabilityManifestDigest = harnessCapabilityManifestDigest(CODEX_V1_HARNESS_MANIFEST);
const codexRuntimeArtifactDigest = harnessRuntimeArtifactDigest(CODEX_V1_RUNTIME_ARTIFACT);
const legacyCodexRouteSnapshot = {
  schema: "factory-model-route/v1" as const,
  provider: "openai",
  providerRoute: "openai",
  modelId: "gpt-5",
  capabilityIdentity: {
    adapter: "codex",
    version: "v1",
    capabilityManifestDigest: codexCapabilityManifestDigest,
    effectiveConfigSha256: CODEX_V1_HARNESS_MANIFEST.effectiveConfigSha256,
  },
  runtimeIdentity: {
    kind: "CODEX_CLI" as const,
    cliVersion: CODEX_V1_RUNTIME_ARTIFACT.version!,
    executableSha256: CODEX_V1_RUNTIME_ARTIFACT.executableSha256!,
  },
};
const legacyCodexRouteDigest = exactModelRouteDigest(legacyCodexRouteSnapshot);
const legacyCodexQualificationSnapshot = legacyQualificationSnapshot(legacyCodexRouteDigest);
const legacyCodexQualificationDigest = modelRouteQualificationDigest(legacyCodexQualificationSnapshot);
const codexV2RouteSnapshot = exactModelRouteSnapshot({
  provider: "openai",
  providerRoute: "openai",
  modelId: "gpt-5",
});
const codexV2RouteDigest = exactModelRouteDigest(codexV2RouteSnapshot);
const codexV2QualificationSnapshot = exactModelRouteQualificationSnapshot({
  routeDigest: codexV2RouteDigest,
  evidenceReference: "docs/evidence/codex-v2.json",
  evidenceDigest: `sha256:${"8".repeat(64)}`,
  workloadClasses: ["SOFTWARE_CHANGE"],
  riskClasses: ["YELLOW"],
  promotedBy: "operator-1",
  promotedAt: 1,
  compatibility: {
    adapter: "codex",
    version: "v1",
    capabilityManifestDigest: codexCapabilityManifestDigest,
    effectiveConfigSha256: CODEX_V1_HARNESS_MANIFEST.effectiveConfigSha256,
    runtimeArtifactDigest: codexRuntimeArtifactDigest,
    executionBackend: "persistent-worker",
  },
});
const codexV2QualificationDigest = modelRouteQualificationDigest(codexV2QualificationSnapshot);

const input: FactoryExecutionManifestInput = {
  runId: "run-1",
  missionId: "mission-1",
  missionPlanId: "plan-1",
  missionPlanVersion: 2,
  qualityContractDigest: "sha256:quality-contract",
  workOrderId: "work-order-1",
  workOrderRevisionNumber: 3,
  taskId: "task-1",
  task: {
    title: "Implement the approved buyer gate",
    description: "Preserve the approved copy and run the exact buyer-gate checks before committing.",
  },
  factoryDefinitionVersionId: "factory-version-1",
  factoryConfigurationDigest: "factory-v1-test",
  factoryPurpose: "SOFTWARE",
  repositoryId: "repository-1",
  repository: "sellerfi/sandbox",
  defaultBranch: "main",
  baseSha: "a".repeat(40),
  branch: "mc/work-order-1",
  worktree: "/tmp/worktrees/work-order-1",
  executor: {
    adapter: "codex",
    version: "v1",
    capabilityManifest: CODEX_V1_HARNESS_MANIFEST,
    capabilityManifestSha256: codexCapabilityManifestDigest,
    effectiveConfigSha256: CODEX_V1_HARNESS_MANIFEST.effectiveConfigSha256,
    runtimeArtifact: CODEX_V1_RUNTIME_ARTIFACT,
    runtimeArtifactDigest: codexRuntimeArtifactDigest,
  },
  executionBackend: "persistent-worker",
  modelRoute: {
    catalogId: "legacy-codex-route",
    routeDigest: legacyCodexRouteDigest,
    routeSnapshot: legacyCodexRouteSnapshot,
    qualificationDigest: legacyCodexQualificationDigest,
    qualificationSnapshot: legacyCodexQualificationSnapshot,
  },
  sandboxProfile: { isolation: "WORKSPACE_WRITE", requiredCapabilities: ["workspace-write", "git-worktree"] },
  workflow: {
    workflowId: "implementation",
    version: 4,
    name: "Implementation",
    description: "Implement and verify",
    agents: [{ id: "implementer", persona: "Implementer" }],
    steps: [{ id: "implement", agent: "implementer", input: "Implement {{task}}", timeoutMinutes: 30 }],
  },
  workOrder: {
    title: "Add the buyer gate",
    desiredOutcome: "Buyers see a trusted decision gate",
    riskLevel: "MEDIUM",
    acceptanceCriteria: [{ id: "ac-1", title: "Gate is visible" }],
    constraints: ["No schema changes"],
  },
  agentBindings: [{
    workflowAgentId: "implementer",
    agentVersionId: "agent-version-1",
    agentVersion: 2,
    genomeHash: "genome-1",
    promptBundleHash: "prompt-1",
    toolManifestHash: "tools-1",
    model: { provider: "openai", modelId: "gpt-5" },
  }],
  codeScopes: [{ id: "scope-1", slug: "ui", includePaths: ["apps/ui/**"], excludePaths: ["apps/ui/generated/**"] }],
  allowedTools: ["apply_patch", "exec_command"],
  routedModel: "gpt-5",
  maxAttempts: 3,
  maxCostUsd: 5,
  maxRuntimeMinutes: 60,
  initialContext: { task: "Add the buyer gate" },
};

const v2Input: FactoryExecutionManifestInput = {
  ...input,
  modelRoute: {
    catalogId: "codex-v2-route",
    routeDigest: codexV2RouteDigest,
    routeSnapshot: codexV2RouteSnapshot,
    qualificationDigest: codexV2QualificationDigest,
    qualificationSnapshot: codexV2QualificationSnapshot,
  },
};

describe("Factory execution manifest", () => {
  it("preserves the exact historical V1 manifest projection for a frozen legacy route", () => {
    const result = buildFactoryExecutionManifest(input);
    expect(result.manifest.version).toBe("factory-execution-manifest/v1");
    if (result.manifest.version !== "factory-execution-manifest/v1") throw new Error("expected V1 manifest");
    expect(result.digest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(result.manifest.causation).toMatchObject({
      missionId: "mission-1",
      taskId: "task-1",
      qualityContractDigest: "sha256:quality-contract",
    });
    expect(result.manifest.workflow.steps[0]).toMatchObject({
      agentVersionId: "agent-version-1",
      promptBundleHash: "prompt-1",
      toolManifestHash: "tools-1",
      modelRoute: "gpt-5",
    });
    expect(result.manifest.repository).toMatchObject({
      baseSha: "a".repeat(40),
      allowedPaths: ["apps/ui/**"],
      excludedPaths: ["apps/ui/generated/**"],
    });
    expect(result.manifest.harness).toMatchObject({
      adapter: "codex",
      version: "v1",
      executionBackend: "persistent-worker",
      requiredCapabilities: ["git-worktree", "workspace-write"],
      harnessId: "codex-cli",
      capabilityManifestSha256: codexCapabilityManifestDigest,
      modelRouteSnapshot: legacyCodexRouteSnapshot,
    });
    expect(result.manifest).not.toHaveProperty("modelRoute");
    expect(result.manifest).not.toHaveProperty("executionBackend");
    expect(result.manifest.retryPolicy).toEqual({
      schema: "factory-remote-retry-policy/v1",
      maxAttempts: 3,
      maxTotalWallClockMs: 3_600_000,
      maxModelSpendUsd: 5,
      maxProviderResources: 1,
      retryableFailureClasses: ["RETRYABLE_INFRA", "RETRYABLE_EXECUTION"],
      failClosedFailureClasses: ["NON_RETRYABLE_RESULT", "UNKNOWN"],
    });
    expect(result.manifest.intent).toMatchObject({ title: "Add the buyer gate", acceptanceCriterionIds: ["ac-1"] });
    expect(result.manifest.intent.selectedTask).toEqual(input.task);
    expect(result.manifest.workOrderSpecification).toMatchObject({ riskLevel: "MEDIUM", acceptanceCriteria: [{ id: "ac-1" }] });
    expect(result.manifest.compiledPrompt).toContain("The control plane owns those actions.");
    expect(result.manifest.compiledPrompt).toContain("Selected Child Task: Implement the approved buyer gate");
    expect(result.manifest.compiledPrompt).toContain("Task instructions: Preserve the approved copy and run the exact buyer-gate checks before committing.");
    expect(result.manifest.compiledPromptHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("emits a decomposed V2 manifest with independent model, harness runtime, and backend bindings", () => {
    const result = buildFactoryExecutionManifest(v2Input);
    expect(result.manifest.version).toBe("factory-execution-manifest/v2");
    if (result.manifest.version !== "factory-execution-manifest/v2") throw new Error("expected V2 manifest");
    expect(result.manifest.modelRoute).toEqual(v2Input.modelRoute);
    expect(result.manifest.executionBackend).toBe("persistent-worker");
    expect(result.manifest.harness).toMatchObject({
      adapter: "codex",
      version: "v1",
      harnessId: "codex-cli",
      capabilityManifestSha256: codexCapabilityManifestDigest,
      effectiveConfigSha256: CODEX_V1_HARNESS_MANIFEST.effectiveConfigSha256,
      runtimeArtifact: CODEX_V1_RUNTIME_ARTIFACT,
      runtimeArtifactDigest: codexRuntimeArtifactDigest,
      isolation: "WORKSPACE_WRITE",
      requiredCapabilities: ["git-worktree", "workspace-write"],
    });
    for (const legacyField of [
      "provider",
      "model",
      "modelCatalogId",
      "modelRouteDigest",
      "modelRouteSnapshot",
      "modelQualificationDigest",
      "executionBackend",
    ]) {
      expect(result.manifest.harness).not.toHaveProperty(legacyField);
    }
  });

  it("is deterministic and changes its digest when execution authority changes", () => {
    const first = buildFactoryExecutionManifest(v2Input).digest;
    const repeated = buildFactoryExecutionManifest({
      ...v2Input,
      executor: { ...v2Input.executor, runtimeArtifact: { ...v2Input.executor.runtimeArtifact } },
      modelRoute: { ...v2Input.modelRoute, routeSnapshot: { ...codexV2RouteSnapshot } },
    }).digest;
    const second = buildFactoryExecutionManifest({
      ...v2Input,
      codeScopes: [{ ...v2Input.codeScopes[0], includePaths: ["apps/admin/**"] }],
    }).digest;
    expect(repeated).toBe(first);
    expect(second).not.toBe(first);
  });

  it("keeps a Task-less manifest digest stable across Convex storage", () => {
    const result = buildFactoryExecutionManifest({ ...input, taskId: undefined, task: undefined });
    const storedManifest = JSON.parse(JSON.stringify(result.manifest));

    expect(storedManifest.causation).not.toHaveProperty("taskId");
    expect(result.digest).toBe(`sha256:${computeCanonicalHash(storedManifest)}`);
  });

  it("fails closed when a selected Task is missing its frozen instructions", () => {
    expect(() => buildFactoryExecutionManifest({ ...input, task: undefined })).toThrow(/Task identity and instructions together/);
  });

  it("changes its digest when the verification contract changes", () => {
    const first = buildFactoryExecutionManifest(v2Input).digest;
    const second = buildFactoryExecutionManifest({
      ...v2Input,
      workOrder: { ...v2Input.workOrder, verificationContract: { schemaVersion: 1, enforcementMode: "ENFORCED", requireHumanReview: false, checks: [] } },
    }).digest;
    expect(second).not.toBe(first);
  });

  it("fails closed when a workflow agent has no approved binding", () => {
    expect(() => buildFactoryExecutionManifest({ ...input, agentBindings: [] })).toThrow(/missing agent binding/);
  });

  it("fails closed when a mutable branch is supplied instead of an exact base SHA", () => {
    expect(() => buildFactoryExecutionManifest({ ...input, baseSha: "origin/main" })).toThrow(/immutable full base SHA/);
  });

  it("carries the approved planning SHA into causation and fails closed on dispatch drift", () => {
    const planningRepositorySha = "a".repeat(40);
    const bound = buildFactoryExecutionManifest({ ...input, planningRepositorySha });
    expect(bound.manifest.causation.planningRepositorySha).toBe(planningRepositorySha);
    expect(bound.manifest.repository.planningRepositorySha).toBe(planningRepositorySha);
    expect(() => buildFactoryExecutionManifest({
      ...input,
      planningRepositorySha,
      baseSha: "b".repeat(40),
    })).toThrow(/does not match the approved Plan planning repository SHA/);
  });

  it("requires an exact model route and validates V1 and V2 route digests", () => {
    expect(() => buildFactoryExecutionManifest({ ...v2Input, modelRoute: undefined as never })).toThrow(/exact qualified model-route/);
    for (const candidate of [input, v2Input]) {
      expect(() => buildFactoryExecutionManifest({
        ...candidate,
        modelRoute: { ...candidate.modelRoute, routeDigest: `sha256:${"0".repeat(64)}` },
      })).toThrow(/exact qualified model-route/);
      expect(() => buildFactoryExecutionManifest({
        ...candidate,
        modelRoute: { ...candidate.modelRoute, qualificationDigest: `sha256:${"0".repeat(64)}` },
      })).toThrow(/exact qualified model-route/);
    }
  });

  it("keeps V1 and V2 qualification schemas explicit instead of fabricating compatibility", () => {
    const legacyQualificationForV2 = legacyQualificationSnapshot(codexV2RouteDigest);
    expect(() => buildFactoryExecutionManifest({
      ...v2Input,
      modelRoute: {
        ...v2Input.modelRoute,
        qualificationSnapshot: legacyQualificationForV2,
        qualificationDigest: modelRouteQualificationDigest(legacyQualificationForV2),
      },
    })).toThrow(/matching model-route and qualification schema/);

    const v2QualificationForLegacyRoute = exactModelRouteQualificationSnapshot({
      routeDigest: legacyCodexRouteDigest,
      evidenceReference: "docs/evidence/not-a-legacy-upgrade.json",
      evidenceDigest: `sha256:${"3".repeat(64)}`,
      workloadClasses: ["SOFTWARE_CHANGE"],
      riskClasses: ["YELLOW"],
      promotedBy: "operator-1",
      promotedAt: 5,
      compatibility: codexV2QualificationSnapshot.compatibility,
    });
    expect(() => buildFactoryExecutionManifest({
      ...input,
      modelRoute: {
        ...input.modelRoute,
        qualificationSnapshot: v2QualificationForLegacyRoute,
        qualificationDigest: modelRouteQualificationDigest(v2QualificationForLegacyRoute),
      },
    })).toThrow(/matching model-route and qualification schema/);
  });

  it("rejects invalid runtime-artifact provenance and exact legacy runtime drift", () => {
    expect(() => buildFactoryExecutionManifest({
      ...v2Input,
      executor: { ...v2Input.executor, runtimeArtifactDigest: `sha256:${"0".repeat(64)}` },
    })).toThrow(/runtime-artifact binding/);

    const driftedArtifact = { ...CODEX_V1_RUNTIME_ARTIFACT, version: "0.147.0" };
    const driftedArtifactDigest = harnessRuntimeArtifactDigest(driftedArtifact);
    expect(() => buildFactoryExecutionManifest({
      ...v2Input,
      executor: {
        ...v2Input.executor,
        runtimeArtifact: driftedArtifact,
        runtimeArtifactDigest: driftedArtifactDigest,
      },
    })).toThrow(/qualification does not admit/);
    expect(() => buildFactoryExecutionManifest({
      ...input,
      executor: {
        ...input.executor,
        runtimeArtifact: driftedArtifact,
        runtimeArtifactDigest: driftedArtifactDigest,
      },
    })).toThrow(/Legacy execution manifest route does not match/);
  });

  it("rejects a cross-wired legacy route and harness identity", () => {
    const crossWiredRoute = {
      ...legacyCodexRouteSnapshot,
      capabilityIdentity: {
        adapter: "deepseek-harness",
        version: "0.2.0",
        capabilityManifestDigest: harnessCapabilityManifestDigest(DEEPSEEK_V1_HARNESS_MANIFEST),
        effectiveConfigSha256: DEEPSEEK_V1_HARNESS_MANIFEST.effectiveConfigSha256,
      },
    };
    const crossWiredRouteDigest = exactModelRouteDigest(crossWiredRoute);
    const crossWiredQualificationSnapshot = legacyQualificationSnapshot(crossWiredRouteDigest);
    expect(() => buildFactoryExecutionManifest({
      ...input,
      modelRoute: {
        ...input.modelRoute,
        routeSnapshot: crossWiredRoute,
        routeDigest: crossWiredRouteDigest,
        qualificationSnapshot: crossWiredQualificationSnapshot,
        qualificationDigest: modelRouteQualificationDigest(crossWiredQualificationSnapshot),
      },
    })).toThrow(/Legacy execution manifest route does not match/);
  });

  it("requires every executable role to resolve to one route while excluding deterministic gates", () => {
    const reviewer = {
      ...v2Input.agentBindings[0],
      workflowAgentId: "reviewer",
      agentVersionId: "agent-version-2",
      model: { provider: "openai", modelId: "gpt-5-mini" },
    };
    const secondStep = { id: "review", agent: "reviewer", input: "Review", timeoutMinutes: 10 };
    expect(() => buildFactoryExecutionManifest({
      ...v2Input,
      routedModel: undefined,
      workflow: { ...v2Input.workflow, steps: [...v2Input.workflow.steps, secondStep] },
      agentBindings: [...v2Input.agentBindings, reviewer],
    })).toThrow(/Every executable workflow role/);

    const withGate = buildFactoryExecutionManifest({
      ...v2Input,
      routedModel: undefined,
      workflow: {
        ...v2Input.workflow,
        steps: [...v2Input.workflow.steps, { ...secondStep, kind: "GATE" }],
      },
      agentBindings: [...v2Input.agentBindings, {
        ...reviewer,
        model: { provider: "different-gate-provider", modelId: "deterministic-gate" },
      }],
    });
    expect(withGate.manifest.workflow.steps).toHaveLength(2);
  });

  it("binds V2 route reasoning controls to every executable role", () => {
    const reasoningRoute = exactModelRouteSnapshot({
      provider: "openai",
      providerRoute: "openai",
      modelId: "gpt-5",
      reasoningConfig: { effort: "high", temperature: 0.2, maxTokens: 16_384 },
    });
    const reasoningRouteDigest = exactModelRouteDigest(reasoningRoute);
    const reasoningQualification = exactModelRouteQualificationSnapshot({
      routeDigest: reasoningRouteDigest,
      evidenceReference: "docs/evidence/codex-v2-reasoning.json",
      evidenceDigest: `sha256:${"9".repeat(64)}`,
      workloadClasses: ["SOFTWARE_CHANGE"],
      riskClasses: ["YELLOW"],
      promotedBy: "operator-1",
      promotedAt: 5,
      compatibility: codexV2QualificationSnapshot.compatibility,
    });
    const reviewer = {
      ...v2Input.agentBindings[0],
      workflowAgentId: "reviewer",
      agentVersionId: "agent-version-2",
      model: {
        provider: "openai",
        modelId: "gpt-5",
        temperature: 0.2,
        maxTokens: 16_384,
      },
    };
    const reasoningInput: FactoryExecutionManifestInput = {
      ...v2Input,
      modelRoute: {
        ...v2Input.modelRoute,
        routeSnapshot: reasoningRoute,
        routeDigest: reasoningRouteDigest,
        qualificationSnapshot: reasoningQualification,
        qualificationDigest: modelRouteQualificationDigest(reasoningQualification),
      },
      workflow: {
        ...v2Input.workflow,
        steps: [
          ...v2Input.workflow.steps,
          { id: "review", agent: "reviewer", input: "Review", timeoutMinutes: 10 },
        ],
      },
      agentBindings: [
        { ...v2Input.agentBindings[0], model: reviewer.model },
        reviewer,
      ],
    };

    expect(buildFactoryExecutionManifest(reasoningInput).manifest.version).toBe("factory-execution-manifest/v2");
    expect(() => buildFactoryExecutionManifest({
      ...reasoningInput,
      agentBindings: [
        reasoningInput.agentBindings[0],
        {
          ...reviewer,
          model: { ...reviewer.model, maxTokens: 8_192 },
        },
      ],
    })).toThrow(/same exact inference route/);
    const mismatchedRoute = exactModelRouteSnapshot({
      provider: "openai",
      providerRoute: "openai",
      modelId: "gpt-5",
      reasoningConfig: { effort: "high", temperature: 0.4, maxTokens: 16_384 },
    });
    const mismatchedRouteDigest = exactModelRouteDigest(mismatchedRoute);
    const mismatchedQualification = exactModelRouteQualificationSnapshot({
      routeDigest: mismatchedRouteDigest,
      evidenceReference: "docs/evidence/codex-v2-reasoning-mismatch.json",
      evidenceDigest: `sha256:${"a".repeat(64)}`,
      workloadClasses: ["SOFTWARE_CHANGE"],
      riskClasses: ["YELLOW"],
      promotedBy: "operator-1",
      promotedAt: 6,
      compatibility: codexV2QualificationSnapshot.compatibility,
    });
    expect(() => buildFactoryExecutionManifest({
      ...reasoningInput,
      modelRoute: {
        ...reasoningInput.modelRoute,
        routeSnapshot: mismatchedRoute,
        routeDigest: mismatchedRouteDigest,
        qualificationSnapshot: mismatchedQualification,
        qualificationDigest: modelRouteQualificationDigest(mismatchedQualification),
      },
    })).toThrow(/reasoning controls/);
  });

  it("requires at least one executable workflow role", () => {
    expect(() => buildFactoryExecutionManifest({
      ...v2Input,
      workflow: {
        ...v2Input.workflow,
        steps: [{ ...v2Input.workflow.steps[0], kind: "GATE" }],
      },
    })).toThrow(/at least one executable workflow model role/);
  });

  it("freezes remote sandbox execution into the decomposed V2 manifest", () => {
    const remoteImageDigest = `sha256:${"7".repeat(64)}`;
    const remoteRuntimeArtifact = {
      schemaVersion: "harness-runtime-artifact/v1" as const,
      kind: "CONTAINER_IMAGE" as const,
      name: `${CODEX_V1_HARNESS_MANIFEST.identity.harnessId}-sandbox`,
      version: "sandbox-v1",
      executableSha256: null,
      imageDigest: remoteImageDigest,
    };
    const remoteRuntimeArtifactDigest = harnessRuntimeArtifactDigest(remoteRuntimeArtifact);
    const sandbox = {
      resourceName: factorySandboxResourceName({
        projectId: "project-1",
        workflowRunId: input.runId,
        attemptId: input.runId,
      }),
      profileId: "profile-1",
      profileDigest: "sha256:profile",
      profileSnapshot: {
        schema: "factory-sandbox-profile/v1",
        provider: "EXE_DEV",
        providerProfileVersion: "sandbox-v1",
        machine: { image: `factory-sandbox@${remoteImageDigest}` },
        security: { image: { digest: remoteImageDigest } },
      },
      supervisorVersion: "mission-control-supervisor/v1" as const,
      resultContract: { schema: "factory-sandbox-result/v1" as const, independentHostValidationRequired: true as const },
      credentialGrants: [{ kind: "INFERENCE" as const, secretValueIncluded: false as const, githubAuthority: "NONE" as const, providerAuthority: "NONE" as const }],
      teardown: { credentialsRevokedBeforePublication: true as const, resourceAbsenceRequiredBeforePublication: true as const },
    };
    const remoteQualificationSnapshot = exactModelRouteQualificationSnapshot({
      routeDigest: codexV2RouteDigest,
      evidenceReference: "docs/evidence/codex-v2-remote.json",
      evidenceDigest: `sha256:${"6".repeat(64)}`,
      workloadClasses: ["SOFTWARE_CHANGE"],
      riskClasses: ["YELLOW"],
      promotedBy: "operator-1",
      promotedAt: 2,
      compatibility: {
        adapter: "codex",
        version: "v1",
        capabilityManifestDigest: codexCapabilityManifestDigest,
        effectiveConfigSha256: CODEX_V1_HARNESS_MANIFEST.effectiveConfigSha256,
        runtimeArtifactDigest: remoteRuntimeArtifactDigest,
        executionBackend: "remote-sandbox",
      },
    });
    const remoteInput = {
      ...v2Input,
      executionBackend: "remote-sandbox",
      executor: {
        ...v2Input.executor,
        runtimeArtifact: remoteRuntimeArtifact,
        runtimeArtifactDigest: remoteRuntimeArtifactDigest,
      },
      modelRoute: {
        ...v2Input.modelRoute,
        qualificationSnapshot: remoteQualificationSnapshot,
        qualificationDigest: modelRouteQualificationDigest(remoteQualificationSnapshot),
      },
      sandboxProfile: { isolation: "WORKSPACE_WRITE", requiredCapabilities: ["remote-sandbox", "git-worktree"] },
      sandbox,
    } as const;
    const result = buildFactoryExecutionManifest(remoteInput);

    expect(result.manifest.version).toBe("factory-execution-manifest/v2");
    if (result.manifest.version !== "factory-execution-manifest/v2") throw new Error("expected V2 manifest");
    expect(result.manifest.causation.workflowRunId).toBe(input.runId);
    expect(result.manifest.sandbox?.resourceName).toBe(factorySandboxResourceName({
      projectId: "project-1",
      workflowRunId: result.manifest.causation.workflowRunId,
      attemptId: input.runId,
    }));
    expect(result.manifest.executionBackend).toBe("remote-sandbox");
    expect(result.manifest.harness).not.toHaveProperty("executionBackend");
    expect(result.manifest.sandbox).toEqual(sandbox);
    expect(result.digest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(() => buildFactoryExecutionManifest({
      ...remoteInput,
      sandbox: {
        ...sandbox,
        profileSnapshot: {
          ...sandbox.profileSnapshot,
          machine: { image: `factory-sandbox@sha256:${"8".repeat(64)}` },
          security: { image: { digest: `sha256:${"8".repeat(64)}` } },
        },
      },
    })).toThrow(/runtime artifact does not match/);
  });

  it("rejects a remote backend without a frozen Sandbox Profile contract", () => {
    expect(() => buildFactoryExecutionManifest({ ...v2Input, executionBackend: "remote-sandbox" })).toThrow(/frozen Sandbox Profile/);
  });

  it("freezes the exact DeepSeek V2 tuple and rejects unsupported backend or harness/model combinations", () => {
    const deepSeekRouteSnapshot = exactModelRouteSnapshot({
      provider: "local-ollama",
      providerRoute: "local-ollama",
      modelId: "qwen3.5:35b-a3b-q8_0",
    });
    const deepSeekRouteDigest = exactModelRouteDigest(deepSeekRouteSnapshot);
    const deepSeekCapabilityDigest = harnessCapabilityManifestDigest(DEEPSEEK_V1_HARNESS_MANIFEST);
    const deepSeekRuntimeDigest = harnessRuntimeArtifactDigest(DEEPSEEK_V1_RUNTIME_ARTIFACT);
    const deepSeekQualificationSnapshot = exactModelRouteQualificationSnapshot({
      routeDigest: deepSeekRouteDigest,
      evidenceReference: "docs/evidence/deepseek-v2.json",
      evidenceDigest: `sha256:${"5".repeat(64)}`,
      workloadClasses: ["SOFTWARE_CHANGE"],
      riskClasses: ["YELLOW"],
      promotedBy: "operator-1",
      promotedAt: 3,
      compatibility: {
        adapter: "deepseek-harness",
        version: "0.2.0",
        capabilityManifestDigest: deepSeekCapabilityDigest,
        effectiveConfigSha256: DEEPSEEK_V1_HARNESS_MANIFEST.effectiveConfigSha256,
        runtimeArtifactDigest: deepSeekRuntimeDigest,
        executionBackend: "persistent-worker",
      },
    });
    const deepSeekInput: FactoryExecutionManifestInput = {
      ...v2Input,
      executor: {
        adapter: "deepseek-harness",
        version: "0.2.0",
        capabilityManifest: DEEPSEEK_V1_HARNESS_MANIFEST,
        capabilityManifestSha256: deepSeekCapabilityDigest,
        effectiveConfigSha256: DEEPSEEK_V1_HARNESS_MANIFEST.effectiveConfigSha256,
        runtimeArtifact: DEEPSEEK_V1_RUNTIME_ARTIFACT,
        runtimeArtifactDigest: deepSeekRuntimeDigest,
      },
      modelRoute: {
        catalogId: "deepseek-v2-route",
        routeDigest: deepSeekRouteDigest,
        routeSnapshot: deepSeekRouteSnapshot,
        qualificationDigest: modelRouteQualificationDigest(deepSeekQualificationSnapshot),
        qualificationSnapshot: deepSeekQualificationSnapshot,
      },
      agentBindings: input.agentBindings.map((binding) => ({
        ...binding,
        model: { provider: "local-ollama", modelId: "qwen3.5:35b-a3b-q8_0" },
      })),
      routedModel: "qwen3.5:35b-a3b-q8_0",
    };
    const result = buildFactoryExecutionManifest(deepSeekInput);
    expect(result.manifest.version).toBe("factory-execution-manifest/v2");
    if (result.manifest.version !== "factory-execution-manifest/v2") throw new Error("expected V2 manifest");
    expect(result.manifest.harness).toMatchObject({
      harnessId: "deepseek-harness",
      harnessVersion: "0.1.0-rc.5",
      harnessCommit: "47f943859bef60e4160492346772ded9b24f765a",
      runtimeArtifact: DEEPSEEK_V1_RUNTIME_ARTIFACT,
    });
    expect(() => buildFactoryExecutionManifest({ ...deepSeekInput, executionBackend: "remote-sandbox" })).toThrow(/does not support the execution backend/);
    const crossWiredQualificationSnapshot = exactModelRouteQualificationSnapshot({
      routeDigest: codexV2RouteDigest,
      evidenceReference: "docs/evidence/cross-wire.json",
      evidenceDigest: `sha256:${"4".repeat(64)}`,
      workloadClasses: ["SOFTWARE_CHANGE"],
      riskClasses: ["YELLOW"],
      promotedBy: "operator-1",
      promotedAt: 4,
      compatibility: deepSeekQualificationSnapshot.compatibility,
    });
    expect(() => buildFactoryExecutionManifest({
      ...deepSeekInput,
      modelRoute: {
        ...v2Input.modelRoute,
        qualificationSnapshot: crossWiredQualificationSnapshot,
        qualificationDigest: modelRouteQualificationDigest(crossWiredQualificationSnapshot),
      },
      agentBindings: v2Input.agentBindings,
      routedModel: "gpt-5",
    })).toThrow(/does not admit every frozen executable/);
  });
});
