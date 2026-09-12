import { describe, expect, it } from "vitest";
import { classifyWorkOrderRisk, validateWorkOrderSpecification } from "../lib/workOrderSpecification";

const valid = {
  title: "Add evidence gate",
  desiredOutcome: "Work can advance only with proof",
  riskLevel: "MEDIUM",
  requirements: [{ id: "req-1", title: "Gate", description: "Require proof", type: "FUNCTIONAL", priority: "MUST" }],
  acceptanceCriteria: [{ id: "ac-1", title: "Gate blocks", requirementIds: ["req-1"], status: "PENDING" }],
  negativeConstraints: [{ id: "no-schema", type: "NO_SCHEMA_CHANGES", description: "Do not change schema" }],
  changeBudget: {
    maxFilesChanged: 5, maxLinesChanged: 200, allowedPaths: ["src/**"], deniedPaths: ["src/auth/**"],
    allowedCommandClasses: ["TEST"], prohibitedCommandClasses: ["DESTRUCTIVE"],
    allowDependencyChanges: false, allowSchemaChanges: false, allowMigrations: false, allowInfrastructureChanges: false,
  },
  verificationContract: { schemaVersion: 1, enforcementMode: "ENFORCED", requireHumanReview: false, checks: [{
    id: "unit", name: "Unit tests", category: "UNIT_TEST", verifierId: "command", mandatory: true,
    acceptanceCriterionIds: ["ac-1"], evidenceCategory: "TEST_RESULT",
  }] },
};

describe("WorkOrder executable specification", () => {
  it("accepts a mapped enforced contract", () => expect(validateWorkOrderSpecification(valid)).toEqual({ valid: true, issues: [] }));

  it("rejects unmapped criteria and invalid budgets", () => {
    const result = validateWorkOrderSpecification({ ...valid, changeBudget: { ...valid.changeBudget, maxFilesChanged: 0 }, verificationContract: { ...valid.verificationContract, checks: [] } });
    expect(result.valid).toBe(false);
    expect(result.issues.join(" ")).toMatch(/not mapped|positive integer/);
  });

  it("rejects unknown requirement and criterion references", () => {
    const result = validateWorkOrderSpecification({ ...valid,
      acceptanceCriteria: [{ ...valid.acceptanceCriteria[0], requirementIds: ["missing"] }],
      verificationContract: { ...valid.verificationContract, checks: [{ ...valid.verificationContract.checks[0], acceptanceCriterionIds: ["missing"] }] },
    });
    expect(result.issues.join(" ")).toMatch(/unknown requirement missing|unknown criterion missing/);
  });

  it("upgrades explainable risk for payments and infrastructure", () => {
    expect(classifyWorkOrderRisk({ ...valid, desiredOutcome: "Change escrow payout behavior" })).toMatchObject({ riskLevel: "CRITICAL" });
    expect(classifyWorkOrderRisk({ ...valid, desiredOutcome: "Change authentication session rules" })).toMatchObject({ riskLevel: "HIGH" });
  });

  it("does not treat explicitly denied scope as requested authority", () => {
    const result = classifyWorkOrderRisk({
      ...valid,
      negativeConstraints: [
        { id: "no-secrets", type: "NO_PLAINTEXT_SECRETS", description: "Do not introduce plaintext secrets" },
        { id: "no-auth", type: "NO_AUTH_CHANGES", description: "Authentication is outside scope" },
      ],
      changeBudget: { ...valid.changeBudget, deniedPaths: ["src/auth/**", ".github/workflows/**"] },
    });
    expect(result.riskLevel).toBe("MEDIUM");
    expect(result.riskReasons).toEqual(["Operator-selected medium risk."]);
  });

  it("does not promote prose that explicitly denies sensitive authority", () => {
    const result = classifyWorkOrderRisk({
      ...valid,
      riskLevel: "LOW",
      context: "Qualification-only local repository; no inference, transmission, publication, or production authority.",
    });
    expect(result.riskLevel).toBe("LOW");
    expect(result.riskReasons).toEqual(["Operator-selected low risk."]);
  });

  it("requires an explicit approval when the contract reserves human review", () => {
    const result = validateWorkOrderSpecification({
      ...valid,
      verificationContract: { ...valid.verificationContract, requireHumanReview: true },
      requiredApprovals: [],
    });
    expect(result.issues.join(" ")).toMatch(/Human review requires/);
  });

  it("accepts an enforced policy-v2 contract with frozen risks and separate-Attempt independence", () => {
    const result = validateWorkOrderSpecification({
      ...valid,
      verificationContract: {
        ...valid.verificationContract,
        schemaVersion: 2,
        requiredRisks: [{
          id: "risk-auth",
          description: "Authorization boundary regresses",
          severity: "CRITICAL",
          source: "WORK_ORDER",
          requiredEvidenceIds: ["unit"],
        }],
        independence: { required: true, minimumBoundary: "SEPARATE_ATTEMPT" },
      },
    });
    expect(result).toEqual({ valid: true, issues: [] });
  });

  it("rejects policy-v2 independence spoofing and verifier-defined risk evidence", () => {
    const result = validateWorkOrderSpecification({
      ...valid,
      verificationContract: {
        ...valid.verificationContract,
        schemaVersion: 2,
        requiredRisks: [{
          id: "risk-auth",
          description: "Authorization boundary regresses",
          severity: "CRITICAL",
          source: "WORK_ORDER",
          requiredEvidenceIds: ["verifier-invented-check"],
        }],
        independence: { required: false, minimumBoundary: "SEPARATE_ATTEMPT" },
      },
    });
    expect(result.valid).toBe(false);
    expect(result.issues.join(" ")).toMatch(/unknown or optional evidence|requires separate-Attempt independence/);
  });
});
