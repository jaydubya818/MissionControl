/**
 * Anti-self-attestation tests for CI evidence (D2).
 *
 * Each test is one of the attacks from the threat model, expressed as the state
 * the system would actually be in — not as an assertion about internals.
 */

import { describe, expect, it } from "vitest";
import {
  classifyCiDefinitionAuthority,
  classifyPrCheckAuthority,
  evaluateCiMergeAuthority,
  isAuthorityLaundering,
  resolveEvidenceIndependence,
} from "../lib/evidenceAuthority";
import { mergeAuthoritySatisfied } from "../lib/prEvaluation";

/** A genuine GitHub App attestation: every provenance field present. */
function attested(overrides: Record<string, unknown> = {}) {
  return {
    source: "GITHUB" as const,
    provider: "GITHUB",
    installationId: "inst_1",
    providerRepositoryId: "9001",
    headSha: "cafe1234",
    sourceEventId: "delivery-abc",
    ciStatus: "PASS" as const,
    ...overrides,
  };
}

describe("a worker's self-reported completion is never CI evidence", () => {
  it("classifies a workflow-run-derived row as EXECUTION_CLAIM regardless of ciStatus", () => {
    // The laundering path: prChecks mapped `run.status === "COMPLETED"` onto
    // `ciStatus: "PASS"` and stamped `ciProvider: "github"` on the result.
    const resolution = classifyPrCheckAuthority({ source: "WORKFLOW" });
    expect(resolution.authority).toBe("EXECUTION_CLAIM");
    expect(resolution.reason).toMatch(/reporting on itself/);
  });

  it("classifies a codegen-derived row as EXECUTION_CLAIM", () => {
    expect(classifyPrCheckAuthority({ source: "CODEGEN" }).authority).toBe("EXECUTION_CLAIM");
  });

  it("refuses merge authority for a passing execution claim", () => {
    const decision = evaluateCiMergeAuthority({
      row: { source: "WORKFLOW", ciStatus: "PASS" },
      now: 1_000,
    });
    expect(decision.satisfied).toBe(false);
    expect(decision.refusal).toBe("NOT_EXTERNALLY_ATTESTED");
  });

  it("blocks the full merge decision even when every other gate is green", () => {
    // Regression for the exact chain: run reports COMPLETED -> ciStatus PASS ->
    // mergeAuthoritySatisfied -> merge recorded.
    expect(
      mergeAuthoritySatisfied({
        ciStatus: "PASS",
        gatesPass: true,
        approvalStatus: "APPROVED",
        humanConfirmed: true,
        ciAuthoritySatisfied: false,
      }),
    ).toBe(false);
  });
});

describe("a GitHub label without GitHub provenance is not an attestation", () => {
  it("fails closed when the trusted projection fields are missing", () => {
    const resolution = classifyPrCheckAuthority({ source: "GITHUB" });
    expect(resolution.authority).toBe("EXECUTION_CLAIM");
    expect(resolution.missingProvenance).toEqual([
      "installationId",
      "providerRepositoryId",
      "provider",
      "headSha",
      "sourceEventId",
    ]);
  });

  it("accepts a complete GitHub App attestation", () => {
    expect(classifyPrCheckAuthority(attested()).authority).toBe("EXTERNAL_CI_ATTESTATION");
  });
});

describe("currentness and scope", () => {
  it("rejects a valid CI result bound to a previous candidate SHA", () => {
    const decision = evaluateCiMergeAuthority({
      row: attested({ headSha: "old0000" }),
      expectedHeadSha: "new1111",
      now: 1_000,
    });
    expect(decision.satisfied).toBe(false);
    expect(decision.refusal).toBe("STALE_HEAD");
  });

  it("rejects a valid GitHub check from a different repository", () => {
    const decision = evaluateCiMergeAuthority({
      row: attested({ providerRepositoryId: "1" }),
      expectedProviderRepositoryId: "2",
      expectedHeadSha: "cafe1234",
      now: 1_000,
    });
    expect(decision.satisfied).toBe(false);
    expect(decision.refusal).toBe("REPOSITORY_MISMATCH");
  });

  it("rejects an expired attestation", () => {
    const decision = evaluateCiMergeAuthority({
      row: attested({ attestationExpiresAt: 500 }),
      expectedHeadSha: "cafe1234",
      now: 1_000,
    });
    expect(decision.satisfied).toBe(false);
    expect(decision.refusal).toBe("ATTESTATION_EXPIRED");
  });

  it("does not let a replayed old event restore currentness for a newer candidate", () => {
    // Replaying yesterday's genuinely-signed SUCCESS is still bound to the SHA
    // it was observed against; it cannot vouch for a candidate written after it.
    const replayed = attested({ headSha: "yesterday" });
    expect(
      evaluateCiMergeAuthority({ row: replayed, expectedHeadSha: "today", now: 2_000 }).refusal,
    ).toBe("STALE_HEAD");
  });

  it("admits a current, in-scope, unexpired attestation", () => {
    const decision = evaluateCiMergeAuthority({
      row: attested({ attestationExpiresAt: 5_000 }),
      expectedHeadSha: "cafe1234",
      expectedProviderRepositoryId: "9001",
      now: 1_000,
    });
    expect(decision.satisfied).toBe(true);
    expect(decision.authority).toBe("EXTERNAL_CI_ATTESTATION");
  });
});

describe("a candidate-authored workflow is observed, not independent", () => {
  it("marks CI definition candidate-dependent when the candidate edited the workflow", () => {
    // GitHub really did run it and really did report SUCCESS. The candidate
    // wrote what SUCCESS means.
    const resolution = classifyCiDefinitionAuthority({
      candidatePaths: [".github/workflows/verify.yml", "src/feature.ts"],
    });
    expect(resolution.authority).toBe("CANDIDATE_DEPENDENT");
    expect(resolution.definingPaths).toEqual([".github/workflows/verify.yml"]);
  });

  it("keeps the observation class intact while refusing independence", () => {
    const independence = resolveEvidenceIndependence({
      observation: "EXTERNAL_CI_ATTESTATION",
      definition: "CANDIDATE_DEPENDENT",
    });
    // Still externally observed — we do not pretend GitHub did not see it.
    expect(independence.observation).toBe("EXTERNAL_CI_ATTESTATION");
    // But not independent evidence.
    expect(independence.independent).toBe(false);
    expect(independence.reason).toMatch(/wrote for itself/);
  });

  it("treats an org-level workflow the repository cannot modify as independent", () => {
    const resolution = classifyCiDefinitionAuthority({
      candidatePaths: [".github/workflows/verify.yml"],
      observedWorkflowRef: "acme/ci-policy/.github/workflows/verify.yml@abc123",
      trustedWorkflowRefs: ["acme/ci-policy/.github/workflows/verify.yml@abc123"],
    });
    expect(resolution.authority).toBe("INDEPENDENT");
  });

  it("grants independence only when both axes are strong", () => {
    expect(
      resolveEvidenceIndependence({
        observation: "EXTERNAL_CI_ATTESTATION",
        definition: "INDEPENDENT",
      }).independent,
    ).toBe(true);
    expect(
      resolveEvidenceIndependence({ observation: "EXECUTION_CLAIM", definition: "INDEPENDENT" })
        .independent,
    ).toBe(false);
  });
});

describe("authority never increases by copying", () => {
  it("flags an execution claim presented as an external attestation", () => {
    expect(isAuthorityLaundering("EXTERNAL_CI_ATTESTATION", ["EXECUTION_CLAIM"])).toBe(true);
  });

  it("flags an execution claim presented as independent verifier evidence", () => {
    expect(isAuthorityLaundering("INDEPENDENT_VERIFIER_ATTESTATION", ["EXECUTION_CLAIM"])).toBe(
      true,
    );
  });

  it("permits a derivation that is no stronger than its weakest-adequate input", () => {
    expect(isAuthorityLaundering("EXECUTION_CLAIM", ["EXTERNAL_CI_ATTESTATION"])).toBe(false);
    expect(
      isAuthorityLaundering("EXTERNAL_CI_ATTESTATION", ["EXTERNAL_CI_ATTESTATION"]),
    ).toBe(false);
  });
});
