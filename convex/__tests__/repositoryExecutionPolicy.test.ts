import { describe, expect, it } from "vitest";
import { ISOLATED_CONTAINER_POLICY, ISOLATED_INVOCATION_EFFECTIVE_CONFIG, ISOLATED_INVOCATION_RUNTIME_ARTIFACT } from "@mission-control/workflow-engine/harness-contract";
import {
  evaluateRepositoryRemoteExecutionPolicy,
  normalizeRepositoryDataClassification,
  sandboxHasProviderEnforcedEgress,
} from "../lib/repositoryExecutionPolicy";

function providerEnforcedSnapshot() {
  return {
    readiness: { providerEgressEnforcementProven: true },
    qualification: { providerEgress: { providerEnforced: true } },
    security: { network: { providerEnforced: true } },
  };
}

describe("repository remote execution policy", () => {
  it("limits deterministic isolation to public work with an exact deny-all policy", () => {
    const snapshot = { schema: "factory-sandbox-profile/v2", provider: "LOCAL_CONTAINER", profileKey: "synthetic-isolation", version: 1,
      imageDigest: ISOLATED_INVOCATION_RUNTIME_ARTIFACT.imageDigest,
      bridgeDigest: ISOLATED_INVOCATION_EFFECTIVE_CONFIG.bridgeImplementationDigest,
      backendDigest: ISOLATED_INVOCATION_EFFECTIVE_CONFIG.backendImplementationDigest,
      isolationPolicy: ISOLATED_CONTAINER_POLICY,
      qualification: { evidenceReference: "synthetic-evidence", evidenceDigest: `sha256:${"a".repeat(64)}`, validUntil: 10000 } };
    const evaluate = (repositoryDataClassification: unknown, dataBoundaryCount = 0, sandboxProfileSnapshot: unknown = snapshot) =>
      evaluateRepositoryRemoteExecutionPolicy({ executionBackend: "isolated-container", repositoryDataClassification, dataBoundaryCount, sandboxProfileSnapshot });
    expect(evaluate("PUBLIC")).toMatchObject({ allowed: true, providerEnforcedEgressProven: false });
    for (const classification of [undefined, "INTERNAL", "CONFIDENTIAL", "RESTRICTED"]) expect(evaluate(classification).allowed).toBe(false);
    expect(evaluate("PUBLIC", 1).allowed).toBe(false);
    expect(evaluate("PUBLIC", 0, {}).allowed).toBe(false);
    expect(evaluate("PUBLIC", 0, { ...snapshot, isolationPolicy: { network: "HOST" } }).allowed).toBe(false);
    expect(evaluateRepositoryRemoteExecutionPolicy({ executionBackend: "unknown" as any, repositoryDataClassification: "PUBLIC" }).allowed).toBe(false);
  });
  it("treats legacy unclassified repositories as sensitive", () => {
    expect(normalizeRepositoryDataClassification(undefined)).toBe("UNCLASSIFIED");
    expect(evaluateRepositoryRemoteExecutionPolicy({
      executionBackend: "remote-sandbox",
      repositoryDataClassification: undefined,
      sandboxProfileSnapshot: {},
    })).toMatchObject({
      allowed: false,
      providerEnforcedEgressRequired: true,
      reasonCode: "PROVIDER_EGRESS_REQUIRED_FOR_SENSITIVE_REPOSITORY",
    });
  });

  it.each(["INTERNAL", "CONFIDENTIAL", "RESTRICTED"])(
    "blocks a %s repository on a guest-only remote profile",
    (repositoryDataClassification) => {
      expect(evaluateRepositoryRemoteExecutionPolicy({
        executionBackend: "remote-sandbox",
        repositoryDataClassification,
        sandboxProfileSnapshot: {
          readiness: { providerEgressEnforcementProven: false },
          qualification: { providerEgress: { providerEnforced: false } },
          security: { network: { providerEnforced: false } },
        },
      }).allowed).toBe(false);
    },
  );

  it("allows sensitive repositories on governed local execution", () => {
    expect(evaluateRepositoryRemoteExecutionPolicy({
      executionBackend: "persistent-worker",
      repositoryDataClassification: "RESTRICTED",
    }).allowed).toBe(true);
  });

  it("requires three independent provider-enforcement attestations", () => {
    expect(sandboxHasProviderEnforcedEgress(providerEnforcedSnapshot())).toBe(true);
    expect(sandboxHasProviderEnforcedEgress({
      ...providerEnforcedSnapshot(),
      security: { network: { providerEnforced: false } },
    })).toBe(false);
  });

  it("allows public remote work only while it has no sensitive data boundary", () => {
    expect(evaluateRepositoryRemoteExecutionPolicy({
      executionBackend: "remote-sandbox",
      repositoryDataClassification: "PUBLIC",
      sandboxProfileSnapshot: {},
    }).allowed).toBe(true);
    expect(evaluateRepositoryRemoteExecutionPolicy({
      executionBackend: "remote-sandbox",
      repositoryDataClassification: "PUBLIC",
      sandboxProfileSnapshot: {},
      dataBoundaryCount: 1,
    })).toMatchObject({
      allowed: false,
      reasonCode: "PROVIDER_EGRESS_REQUIRED_FOR_SENSITIVE_WORK",
    });
  });

  it("allows sensitive remote work only with provider-enforced evidence", () => {
    expect(evaluateRepositoryRemoteExecutionPolicy({
      executionBackend: "remote-sandbox",
      repositoryDataClassification: "INTERNAL",
      sandboxProfileSnapshot: providerEnforcedSnapshot(),
    }).allowed).toBe(true);
  });
});
