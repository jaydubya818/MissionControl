import { describe, expect, it } from "vitest";
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
