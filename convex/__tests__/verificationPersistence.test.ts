import { describe, expect, it } from "vitest";
import { recomputeVerificationPacket } from "../lib/verificationPersistence";

const workOrder = {
  riskLevel: "MEDIUM",
  riskReasons: ["bounded change"],
  requiredApprovals: [],
  acceptanceCriteria: [{ id: "ac-1", title: "Gate works", requiredEvidence: [{ category: "TEST_RESULT", minimumCount: 1, independent: true }] }],
  changeBudget: undefined,
  negativeConstraints: [],
  verificationContract: { requireHumanReview: false, checks: [{
    id: "unit", name: "Unit tests", category: "UNIT_TEST", verifierId: "factory-command/v1", mandatory: true,
    acceptanceCriterionIds: ["ac-1"], evidenceCategory: "TEST_RESULT",
  }] },
};

function packet(overrides: any = {}) {
  const now = Date.now();
  return {
    engineVersion: "verification-engine/v1", sourceRevision: "base", candidateRevision: "head",
    startedAt: now, completedAt: now + 1,
    checks: [{
      checkId: "unit", status: "PASS", summary: "passed", startedAt: now, completedAt: now + 1, durationMs: 1,
      evidence: [{ evidenceKey: "unit-output", category: "TEST_RESULT", result: "PASS", summary: "8 tests passed",
        acceptanceCriterionIds: ["ac-1"], producer: { id: "factory-command/v1", role: "INDEPENDENT_VERIFIER", independent: true } }],
      violations: [],
    }],
    ...overrides,
  };
}

describe("verification packet recomputation", () => {
  it("derives VERIFIED from independently produced evidence", () => {
    expect(recomputeVerificationPacket(workOrder, packet())).toMatchObject({ verdict: "VERIFIED", requirementsPassed: 1, requirementsFailed: 0 });
  });

  it("blocks when a mandatory verifier did not report", () => {
    const result = recomputeVerificationPacket(workOrder, packet({ verdict: "VERIFIED", checks: [] }));
    expect(result.verdict).toBe("BLOCKED");
    expect(result.verdictReasons.join(" ")).toMatch(/did not report|lacks required evidence/);
  });

  it("does not verify a passing check that lacks its required evidence", () => {
    const supplied = packet();
    supplied.checks[0].evidence = [];
    const result = recomputeVerificationPacket(workOrder, supplied);
    expect(result.verdict).toBe("NOT_VERIFIED");
    expect(result.verdictReasons.join(" ")).toMatch(/lacks required evidence/);
  });

  it("rejects evidence mapped outside the approved criterion contract", () => {
    const invalid = packet();
    invalid.checks[0].evidence[0].acceptanceCriterionIds = ["other"];
    expect(() => recomputeVerificationPacket(workOrder, invalid)).toThrow(/unknown criterion/);
  });

  it("derives BLOCKED from a blocking policy failure", () => {
    const constrained = { ...workOrder, negativeConstraints: [{ id: "no-auth", type: "NO_AUTH_CHANGES", description: "No auth" }] };
    const policyFailure = {
      checkId: "factory-negative-constraints", status: "FAIL", summary: "auth changed", violations: ["auth changed"],
      metadata: { blocking: true }, evidence: [],
    };
    expect(recomputeVerificationPacket(constrained, packet({ checks: [policyFailure, ...packet().checks] })).verdict).toBe("BLOCKED");
  });

  it("does not reinterpret producer independent=true as policy-v2 independence", () => {
    const policyV2 = {
      ...workOrder,
      verificationContract: {
        ...workOrder.verificationContract,
        schemaVersion: 2,
        enforcementMode: "ENFORCED",
        requiredRisks: [],
        independence: { required: true, minimumBoundary: "SEPARATE_ATTEMPT" },
      },
    };
    const result = recomputeVerificationPacket(policyV2, packet());
    expect(result.verdict).toBe("NOT_VERIFIED");
    expect(result.coverage[0].missingEvidence.join(" ")).toContain("independent");
  });
});
