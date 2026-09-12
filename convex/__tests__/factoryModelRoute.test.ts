import { describe, expect, it } from "vitest";
import {
  CODEX_V1_HARNESS_MANIFEST,
  CODEX_V1_RUNTIME_ARTIFACT,
  DEEPSEEK_V1_HARNESS_MANIFEST,
  DEEPSEEK_V1_RUNTIME_ARTIFACT,
  harnessCapabilityManifestDigest,
  harnessRuntimeArtifactDigest,
} from "@mission-control/workflow-engine/harness-contract";
import {
  factoryModelRouteCompatibility,
  factoryVersionModelRouteOptions,
  factoryWorkflowModelRouteMatches,
  frozenFactoryModelRouteEligible,
  matchingFactoryModelRouteQualifications,
  resolveFactoryWorkflowModelRoute,
  selectFrozenFactoryPlanningModelRoute,
} from "../lib/factoryModelRoute";
import {
  LEGACY_EXACT_MODEL_ROUTE_SCHEMA,
  LEGACY_MODEL_ROUTE_QUALIFICATION_SCHEMA,
  exactModelRouteDigest,
  exactModelRouteQualificationSnapshot,
  exactModelRouteSnapshot,
  modelRouteEligibleForNewFactoryVersion,
  modelRouteQualificationDigest,
} from "../lib/modelRouteAdmission";

const deepSeekHarness = {
  adapter: DEEPSEEK_V1_HARNESS_MANIFEST.identity.adapterId,
  version: DEEPSEEK_V1_HARNESS_MANIFEST.identity.adapterVersion,
  capabilityManifestSha256: harnessCapabilityManifestDigest(DEEPSEEK_V1_HARNESS_MANIFEST),
  effectiveConfigSha256: DEEPSEEK_V1_HARNESS_MANIFEST.effectiveConfigSha256,
  runtimeArtifact: DEEPSEEK_V1_RUNTIME_ARTIFACT,
  runtimeArtifactSha256: harnessRuntimeArtifactDigest(DEEPSEEK_V1_RUNTIME_ARTIFACT),
  capabilityManifest: DEEPSEEK_V1_HARNESS_MANIFEST,
};

const codexHarness = {
  adapter: CODEX_V1_HARNESS_MANIFEST.identity.adapterId,
  version: CODEX_V1_HARNESS_MANIFEST.identity.adapterVersion,
  capabilityManifestSha256: harnessCapabilityManifestDigest(CODEX_V1_HARNESS_MANIFEST),
  effectiveConfigSha256: CODEX_V1_HARNESS_MANIFEST.effectiveConfigSha256,
  runtimeArtifact: CODEX_V1_RUNTIME_ARTIFACT,
  runtimeArtifactSha256: harnessRuntimeArtifactDigest(CODEX_V1_RUNTIME_ARTIFACT),
  capabilityManifest: CODEX_V1_HARNESS_MANIFEST,
};

const v2RouteSnapshot = exactModelRouteSnapshot({
  provider: "local-ollama",
  providerRoute: "local-ollama",
  modelId: "qwen3.5:35b-a3b-q8_0",
});
const v2RouteDigest = exactModelRouteDigest(v2RouteSnapshot);
const v2Compatibility = factoryModelRouteCompatibility({
  harness: deepSeekHarness,
  executionBackend: "persistent-worker",
});
const v2QualificationSnapshot = exactModelRouteQualificationSnapshot({
  routeDigest: v2RouteDigest,
  evidenceReference: "docs/evidence/deepseek.json",
  evidenceDigest: `sha256:${"1".repeat(64)}`,
  workloadClasses: ["SOFTWARE_CHANGE"],
  riskClasses: ["GREEN"],
  promotedBy: "operator-1",
  promotedAt: 1,
  compatibility: v2Compatibility,
});
const v2QualificationDigest = modelRouteQualificationDigest(v2QualificationSnapshot);
const v2Route = {
  routeSnapshot: v2RouteSnapshot,
  routeDigest: v2RouteDigest,
  enabled: true,
  qualificationStatus: "EVIDENCE_QUALIFIED",
  admissionStatus: "PRODUCTION_PILOT_ELIGIBLE",
  qualificationSnapshot: v2QualificationSnapshot,
  qualificationDigest: v2QualificationDigest,
};
const v2Version = {
  modelRouteSnapshot: v2RouteSnapshot,
  modelRouteDigest: v2RouteDigest,
  modelQualificationSnapshot: v2QualificationSnapshot,
  modelQualificationDigest: v2QualificationDigest,
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
  evidence: {
    reference: "docs/legacy-evidence.json",
    digest: `sha256:${"2".repeat(64)}`,
  },
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
const legacyRoute = {
  routeSnapshot: legacyRouteSnapshot,
  routeDigest: legacyRouteDigest,
  enabled: true,
  qualificationStatus: "EVIDENCE_QUALIFIED",
  admissionStatus: "PRODUCTION_PILOT_ELIGIBLE",
  qualificationSnapshot: legacyQualificationSnapshot,
  qualificationDigest: legacyQualificationDigest,
};
const legacyVersion = {
  modelRouteSnapshot: legacyRouteSnapshot,
  modelRouteDigest: legacyRouteDigest,
  modelQualificationSnapshot: legacyQualificationSnapshot,
  modelQualificationDigest: legacyQualificationDigest,
};

describe("Factory model-route composition", () => {
  it("admits a V2 planning route without legacy capability identity", () => {
    const routeSnapshot = exactModelRouteSnapshot({
      provider: "openai",
      providerRoute: "openai",
      modelId: "gpt-5.6-terra",
      reasoningConfig: { effort: "high" },
    });
    const routeDigest = exactModelRouteDigest(routeSnapshot);
    const qualificationSnapshot = exactModelRouteQualificationSnapshot({
      routeDigest,
      evidenceReference: "docs/evidence/planning.json",
      evidenceDigest: `sha256:${"3".repeat(64)}`,
      workloadClasses: ["MISSION_PLANNING"],
      riskClasses: ["YELLOW"],
      promotedBy: "operator-1",
      promotedAt: 2,
      compatibility: factoryModelRouteCompatibility({
        harness: codexHarness,
        executionBackend: "persistent-worker",
      }),
    });
    const qualificationDigest = modelRouteQualificationDigest(qualificationSnapshot);
    const route = {
      _id: "planning-v2",
      projectId: "project-1",
      provider: routeSnapshot.provider,
      modelId: routeSnapshot.modelId,
      displayName: "Planning V2",
      routeSnapshot,
      routeDigest,
      enabled: true,
      qualificationStatus: "EVIDENCE_QUALIFIED",
      admissionStatus: "PRODUCTION_PILOT_ELIGIBLE",
      qualificationSnapshot,
      qualificationDigest,
    };
    const version = {
      modelRouteSnapshot: routeSnapshot,
      modelRouteDigest: routeDigest,
      modelQualificationSnapshot: qualificationSnapshot,
      modelQualificationDigest: qualificationDigest,
    };

    expect(routeSnapshot).not.toHaveProperty("capabilityIdentity");
    expect(selectFrozenFactoryPlanningModelRoute({
      routes: [route],
      selectedCatalogId: route._id,
      projectId: "project-1",
      version,
      harness: codexHarness,
      executionBackend: "persistent-worker",
      repositoryId: "repository-1",
    })).toBe(route);
    expect(selectFrozenFactoryPlanningModelRoute({
      routes: [route],
      selectedCatalogId: route._id,
      projectId: "project-1",
      version,
      harness: codexHarness,
      executionBackend: "remote-sandbox",
      repositoryId: "repository-1",
    })).toBeNull();
  });

  it("never substitutes an eligible V1 sibling for the Factory Version's frozen route", () => {
    const routeSnapshot = exactModelRouteSnapshot({
      provider: "openai",
      providerRoute: "openai",
      modelId: "gpt-5.6-terra",
    });
    const routeDigest = exactModelRouteDigest(routeSnapshot);
    const qualificationSnapshot = exactModelRouteQualificationSnapshot({
      routeDigest,
      evidenceReference: "docs/evidence/planning-v2.json",
      evidenceDigest: `sha256:${"4".repeat(64)}`,
      workloadClasses: ["MISSION_PLANNING"],
      riskClasses: ["YELLOW"],
      promotedBy: "operator-1",
      promotedAt: 3,
      compatibility: factoryModelRouteCompatibility({
        harness: codexHarness,
        executionBackend: "persistent-worker",
      }),
    });
    const qualificationDigest = modelRouteQualificationDigest(qualificationSnapshot);
    const frozenV2 = {
      _id: "frozen-v2",
      provider: "openai",
      modelId: "gpt-5.6-terra",
      routeSnapshot,
      routeDigest,
      enabled: false,
      qualificationStatus: "UNQUALIFIED",
      admissionStatus: "DISABLED",
      qualificationSnapshot,
      qualificationDigest,
    };
    const legacyPlanningQualification = {
      ...legacyQualificationSnapshot,
      scope: { workloadClasses: ["MISSION_PLANNING"], riskClasses: ["YELLOW"] },
    };
    const legacyPlanningDigest = modelRouteQualificationDigest(legacyPlanningQualification);
    const legacySibling = {
      _id: "legacy-sibling",
      provider: "openai",
      modelId: "gpt-5.6-terra",
      ...legacyRoute,
      qualificationSnapshot: legacyPlanningQualification,
      qualificationDigest: legacyPlanningDigest,
    };
    const version = {
      modelRouteSnapshot: routeSnapshot,
      modelRouteDigest: routeDigest,
      modelQualificationSnapshot: qualificationSnapshot,
      modelQualificationDigest: qualificationDigest,
    };

    expect(selectFrozenFactoryPlanningModelRoute({
      routes: [legacySibling, frozenV2],
      selectedCatalogId: frozenV2._id,
      projectId: "project-1",
      version,
      harness: codexHarness,
      executionBackend: "persistent-worker",
      repositoryId: "repository-1",
    })).toBeNull();
  });

  it("keeps an exact frozen V1 route planning-compatible without synthesizing V2 identity", () => {
    const qualificationSnapshot = {
      ...legacyQualificationSnapshot,
      scope: { workloadClasses: ["MISSION_PLANNING"], riskClasses: ["YELLOW"] },
    };
    const qualificationDigest = modelRouteQualificationDigest(qualificationSnapshot);
    const route = {
      _id: "planning-v1",
      provider: legacyRouteSnapshot.provider,
      modelId: legacyRouteSnapshot.modelId,
      ...legacyRoute,
      qualificationSnapshot,
      qualificationDigest,
    };

    expect(selectFrozenFactoryPlanningModelRoute({
      routes: [route],
      selectedCatalogId: route._id,
      projectId: "project-1",
      version: {
        ...legacyVersion,
        modelQualificationSnapshot: qualificationSnapshot,
        modelQualificationDigest: qualificationDigest,
      },
      harness: codexHarness,
      executionBackend: "persistent-worker",
      repositoryId: "repository-1",
    })).toBe(route);
  });

  it("offers every promoted V2 qualification instance and excludes a legacy sibling", () => {
    const currentRouteSnapshot = exactModelRouteSnapshot({
      provider: "openai",
      providerRoute: "openai",
      modelId: "gpt-5.6-terra",
    });
    const currentRouteDigest = exactModelRouteDigest(currentRouteSnapshot);
    const currentQualificationSnapshot = exactModelRouteQualificationSnapshot({
      routeDigest: currentRouteDigest,
      evidenceReference: "docs/evidence/current-route.json",
      evidenceDigest: `sha256:${"3".repeat(64)}`,
      workloadClasses: ["SOFTWARE_CHANGE"],
      riskClasses: ["GREEN"],
      promotedBy: "operator-1",
      promotedAt: 2,
      compatibility: factoryModelRouteCompatibility({
        harness: codexHarness,
        executionBackend: "persistent-worker",
      }),
    });
    const currentQualificationDigest = modelRouteQualificationDigest(currentQualificationSnapshot);
    const currentRoute = {
      provider: "openai",
      modelId: "gpt-5.6-terra",
      routeSnapshot: currentRouteSnapshot,
      routeDigest: currentRouteDigest,
      enabled: true,
      qualificationStatus: "EVIDENCE_QUALIFIED",
      admissionStatus: "PRODUCTION_PILOT_ELIGIBLE",
      qualificationSnapshot: currentQualificationSnapshot,
      qualificationDigest: currentQualificationDigest,
    };

    expect(factoryVersionModelRouteOptions([
      { _id: "legacy-first", provider: "openai", modelId: "gpt-5.6-terra", ...legacyRoute },
      { _id: "current-a", ...currentRoute },
      { _id: "current-b", ...currentRoute },
    ]).map((route) => route._id)).toEqual(["current-a", "current-b"]);
  });

  it("requires every non-GATE workflow role to use one exact provider/model", () => {
    const workflow = {
      steps: [
        { id: "implement", agent: "implementer", kind: "AGENT" },
        { id: "approval", agent: "operator", kind: "GATE" },
        { id: "review", agent: "reviewer", kind: "AGENT" },
      ],
    };
    const agentBindings = [
      { workflowAgentId: "implementer" },
      { workflowAgentId: "operator" },
      { workflowAgentId: "reviewer" },
    ];
    const sharedRoute = { provider: "openai", modelId: "gpt-5.6-terra" };
    const input = {
      workflow,
      agentBindings,
      agentVersions: [
        { genome: { modelConfig: sharedRoute } },
        { genome: { modelConfig: { provider: "deepseek", modelId: "gate-only-model" } } },
        { model: sharedRoute },
      ],
    };

    expect(resolveFactoryWorkflowModelRoute(input)).toEqual({
      provider: "openai",
      modelId: "gpt-5.6-terra",
    });
    expect(factoryWorkflowModelRouteMatches(input, sharedRoute)).toBe(true);

    expect(() => resolveFactoryWorkflowModelRoute({
      ...input,
      agentVersions: [
        { genome: { modelConfig: sharedRoute } },
        input.agentVersions[1],
        { model: { provider: "openai", modelId: "different-model" } },
      ],
    })).toThrow("Every executable workflow role must use the same exact model route");
    expect(() => resolveFactoryWorkflowModelRoute({
      ...input,
      agentVersions: [
        { genome: { modelConfig: sharedRoute } },
        input.agentVersions[1],
        { model: { provider: "anthropic", modelId: sharedRoute.modelId } },
      ],
    })).toThrow("Every executable workflow role must use the same exact model route");
  });

  it("does not let GATE roles select a Factory model route", () => {
    expect(() => resolveFactoryWorkflowModelRoute({
      workflow: { steps: [{ id: "approval", agent: "operator", kind: "GATE" }] },
      agentBindings: [{ workflowAgentId: "operator" }],
      agentVersions: [{ genome: { modelConfig: { provider: "openai", modelId: "gate-model" } } }],
    })).toThrow("Factory workflow requires at least one executable model role");
  });

  it("requires every V2 executable role to match the frozen reasoning controls", () => {
    const workflow = {
      steps: [
        { id: "implement", agent: "implementer", kind: "AGENT" },
        { id: "review", agent: "reviewer", kind: "AGENT" },
      ],
    };
    const agentBindings = [
      { workflowAgentId: "implementer" },
      { workflowAgentId: "reviewer" },
    ];
    const exactRoute = exactModelRouteSnapshot({
      provider: "openai",
      providerRoute: "openai",
      modelId: "gpt-5.6-terra",
      reasoningConfig: { effort: "high", temperature: 0.2, maxTokens: 16_384 },
    });
    const matchingModel = {
      provider: "openai",
      modelId: "gpt-5.6-terra",
      temperature: 0.2,
      maxTokens: 16_384,
    };

    expect(factoryWorkflowModelRouteMatches({
      workflow,
      agentBindings,
      agentVersions: [
        { genome: { modelConfig: matchingModel } },
        { model: matchingModel },
      ],
    }, exactRoute)).toBe(true);
    expect(factoryWorkflowModelRouteMatches({
      workflow,
      agentBindings,
      agentVersions: [
        { genome: { modelConfig: matchingModel } },
        { model: { ...matchingModel, temperature: 0.4 } },
      ],
    }, exactRoute)).toBe(false);
    expect(factoryWorkflowModelRouteMatches({
      workflow,
      agentBindings,
      agentVersions: [
        { genome: { modelConfig: matchingModel } },
        { model: matchingModel },
      ],
    }, {
      ...exactRoute,
      reasoningConfig: { ...exactRoute.reasoningConfig, maxTokens: 8_192 },
    })).toBe(false);
  });

  it("rejects noncanonical Agent Version providers at the shared V2 admission boundary", () => {
    const input = {
      workflow: { steps: [{ id: "implement", agent: "implementer", kind: "AGENT" }] },
      agentBindings: [{ workflowAgentId: "implementer" }],
      agentVersions: [{ model: {
        provider: "OpenAI",
        modelId: "gpt-5.6-terra",
        temperature: 0.2,
        maxTokens: 16_384,
      } }],
    };
    const exactRoute = exactModelRouteSnapshot({
      provider: "openai",
      providerRoute: "openai",
      modelId: "gpt-5.6-terra",
      reasoningConfig: { effort: "high", temperature: 0.2, maxTokens: 16_384 },
    });

    expect(resolveFactoryWorkflowModelRoute(input)).toEqual({
      provider: "openai",
      modelId: "gpt-5.6-terra",
    });
    expect(factoryWorkflowModelRouteMatches(input, exactRoute)).toBe(false);
    expect(factoryWorkflowModelRouteMatches(input, legacyRouteSnapshot)).toBe(true);
  });

  it("does not invent reasoning identity for frozen V1 routes", () => {
    expect(factoryWorkflowModelRouteMatches({
      workflow: {
        steps: [
          { id: "implement", agent: "implementer", kind: "AGENT" },
          { id: "review", agent: "reviewer", kind: "AGENT" },
        ],
      },
      agentBindings: [
        { workflowAgentId: "implementer" },
        { workflowAgentId: "reviewer" },
      ],
      agentVersions: [
        { model: { provider: "openai", modelId: "gpt-5.6-terra", temperature: 0.1 } },
        { model: { provider: "openai", modelId: "gpt-5.6-terra", temperature: 0.9 } },
      ],
    }, legacyRouteSnapshot)).toBe(true);
  });

  it("resolves qualification instances by exact tuple and scope before cardinality", () => {
    const workflow = {
      workflow: { steps: [{ id: "implement", agent: "implementer", kind: "AGENT" }] },
      agentBindings: [{ workflowAgentId: "implementer" }],
      agentVersions: [{ model: { provider: "local-ollama", modelId: "qwen3.5:35b-a3b-q8_0" } }],
    };
    const remoteCompatibility = factoryModelRouteCompatibility({
      harness: codexHarness,
      executionBackend: "remote-sandbox",
    });
    const remoteQualification = exactModelRouteQualificationSnapshot({
      routeDigest: v2RouteDigest,
      evidenceReference: "docs/evidence/other-tuple.json",
      evidenceDigest: `sha256:${"3".repeat(64)}`,
      workloadClasses: ["SOFTWARE_CHANGE"],
      riskClasses: ["GREEN"],
      promotedBy: "operator-1",
      promotedAt: 2,
      compatibility: remoteCompatibility,
    });
    const wrongScopeQualification = exactModelRouteQualificationSnapshot({
      routeDigest: v2RouteDigest,
      evidenceReference: "docs/evidence/wrong-scope.json",
      evidenceDigest: `sha256:${"4".repeat(64)}`,
      workloadClasses: ["VERIFICATION"],
      riskClasses: ["YELLOW"],
      promotedBy: "operator-1",
      promotedAt: 3,
      compatibility: v2Compatibility,
    });
    const candidates = [
      { _id: "qualified-local", ...v2Route },
      {
        _id: "unqualified-draft",
        routeSnapshot: v2RouteSnapshot,
        routeDigest: v2RouteDigest,
        enabled: false,
        qualificationStatus: "UNQUALIFIED",
        admissionStatus: "DISABLED",
      },
      {
        _id: "qualified-remote",
        ...v2Route,
        qualificationSnapshot: remoteQualification,
        qualificationDigest: modelRouteQualificationDigest(remoteQualification),
      },
      {
        _id: "wrong-scope",
        ...v2Route,
        qualificationSnapshot: wrongScopeQualification,
        qualificationDigest: modelRouteQualificationDigest(wrongScopeQualification),
      },
    ];

    expect(matchingFactoryModelRouteQualifications({
      routes: candidates,
      workflow,
      compatibility: v2Compatibility,
      riskClass: "GREEN",
      workloadClass: "SOFTWARE_CHANGE",
    }).map((route) => route._id)).toEqual(["qualified-local"]);
    expect(matchingFactoryModelRouteQualifications({
      routes: candidates,
      workflow,
      compatibility: remoteCompatibility,
      riskClass: "GREEN",
      workloadClass: "SOFTWARE_CHANGE",
    }).map((route) => route._id)).toEqual(["qualified-remote"]);
    expect(matchingFactoryModelRouteQualifications({
      routes: [...candidates, { _id: "duplicate-local", ...v2Route }],
      workflow,
      compatibility: v2Compatibility,
      riskClass: "GREEN",
      workloadClass: "SOFTWARE_CHANGE",
    })).toHaveLength(2);
    expect(matchingFactoryModelRouteQualifications({
      routes: [...candidates, { _id: "duplicate-local", ...v2Route }],
      selectedCatalogId: "duplicate-local",
      workflow,
      compatibility: v2Compatibility,
      riskClass: "GREEN",
      workloadClass: "SOFTWARE_CHANGE",
    }).map((route) => route._id)).toEqual(["duplicate-local"]);
  });

  it("requires the exact V2 route, qualification, harness, runtime artifact, and backend", () => {
    expect(frozenFactoryModelRouteEligible({
      route: v2Route,
      version: v2Version,
      harness: deepSeekHarness,
      executionBackend: "persistent-worker",
    })).toBe(true);

    expect(frozenFactoryModelRouteEligible({
      route: v2Route,
      version: {
        ...v2Version,
        modelRouteSnapshot: { ...v2RouteSnapshot, modelId: "cross-wired-model" },
      },
      harness: deepSeekHarness,
      executionBackend: "persistent-worker",
    })).toBe(false);
    expect(frozenFactoryModelRouteEligible({
      route: v2Route,
      version: {
        ...v2Version,
        modelQualificationDigest: `sha256:${"0".repeat(64)}`,
      },
      harness: deepSeekHarness,
      executionBackend: "persistent-worker",
    })).toBe(false);
  });

  it("fails closed for cross-wired harness, runtime artifact, configuration, or backend", () => {
    for (const mismatch of [
      { harness: codexHarness, executionBackend: "persistent-worker" as const },
      {
        harness: {
          ...deepSeekHarness,
          runtimeArtifact: CODEX_V1_RUNTIME_ARTIFACT,
          runtimeArtifactSha256: codexHarness.runtimeArtifactSha256,
        },
        executionBackend: "persistent-worker" as const,
      },
      {
        harness: { ...deepSeekHarness, effectiveConfigSha256: "0".repeat(64) },
        executionBackend: "persistent-worker" as const,
      },
      { harness: deepSeekHarness, executionBackend: "remote-sandbox" as const },
    ]) {
      expect(frozenFactoryModelRouteEligible({
        route: v2Route,
        version: v2Version,
        ...mismatch,
      })).toBe(false);
    }
  });

  it("keeps the exact historical V1 fixture eligible only through the frozen legacy path", () => {
    expect(exactModelRouteDigest(legacyRouteSnapshot)).toBe(legacyRouteDigest);
    expect(codexHarness.capabilityManifestSha256).toBe(
      legacyRouteSnapshot.capabilityIdentity.capabilityManifestDigest,
    );
    expect(codexHarness.effectiveConfigSha256).toBe(
      legacyRouteSnapshot.capabilityIdentity.effectiveConfigSha256,
    );
    expect(frozenFactoryModelRouteEligible({
      route: legacyRoute,
      version: legacyVersion,
      harness: codexHarness,
      executionBackend: "persistent-worker",
    })).toBe(true);
    expect(modelRouteEligibleForNewFactoryVersion(
      legacyRoute,
      factoryModelRouteCompatibility({
        harness: codexHarness,
        executionBackend: "persistent-worker",
      }),
    )).toBe(false);
    expect(frozenFactoryModelRouteEligible({
      route: legacyRoute,
      version: legacyVersion,
      harness: codexHarness,
      executionBackend: "remote-sandbox",
    })).toBe(false);
  });
});
