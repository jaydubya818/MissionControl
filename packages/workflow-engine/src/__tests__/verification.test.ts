import { describe, expect, it } from "vitest";
import {
  ChangeBudgetVerifier,
  NegativeConstraintVerifier,
  VerificationEngine,
  type CandidateChange,
  type Verifier,
  type WorkOrderVerificationSpec,
} from "../verification.js";

const candidate: CandidateChange = {
  sourceRevision: "base-sha",
  candidateRevision: "candidate-sha",
  changedFiles: ["src/feature.ts", "src/feature.test.ts"],
  deletedFiles: [],
  linesAdded: 30,
  linesDeleted: 5,
  diff: "+export const enabled = true;",
};

function workOrder(overrides: Partial<WorkOrderVerificationSpec> = {}): WorkOrderVerificationSpec {
  return {
    id: "work-order-1",
    revisionNumber: 1,
    title: "Add verified behavior",
    riskLevel: "MEDIUM",
    riskReasons: ["Business logic change"],
    acceptanceCriteria: [{
      id: "ac-1",
      title: "Feature is covered",
      requiredEvidence: [{ category: "TEST_RESULT", minimumCount: 1, independent: true }],
    }],
    negativeConstraints: [{ id: "no-schema", type: "NO_SCHEMA_CHANGES", description: "Must not change schema" }],
    changeBudget: {
      maxFilesChanged: 3,
      maxLinesChanged: 50,
      allowedPaths: ["src/**"],
      deniedPaths: ["src/auth/**"],
      allowedCommandClasses: ["TEST"],
      prohibitedCommandClasses: ["DESTRUCTIVE", "PRODUCTION_ACCESS"],
      allowDependencyChanges: false,
      allowSchemaChanges: false,
      allowMigrations: false,
      allowInfrastructureChanges: false,
    },
    verificationContract: {
      schemaVersion: 1,
      enforcementMode: "ENFORCED",
      requireHumanReview: false,
      checks: [{
        id: "unit",
        name: "Unit tests",
        category: "UNIT_TEST",
        verifierId: "deterministic-test",
        mandatory: true,
        acceptanceCriterionIds: ["ac-1"],
        evidenceCategory: "TEST_RESULT",
      }],
    },
    requiredApprovals: [],
    ...overrides,
  };
}

const passingTestVerifier: Verifier = {
  id: "deterministic-test",
  name: "Deterministic test",
  supports: (check) => check.verifierId === "deterministic-test",
  execute: async (context, check) => ({
    checkId: check.id,
    name: check.name,
    category: check.category,
    verifierId: "deterministic-test",
    mandatory: check.mandatory,
    status: "PASS",
    summary: "Tests passed.",
    acceptanceCriterionIds: check.acceptanceCriterionIds,
    startedAt: 1,
    completedAt: 2,
    durationMs: 1,
    violations: [],
    evidence: [{
      evidenceKey: `${context.workflowRunId}:${check.id}`,
      category: "TEST_RESULT",
      result: "PASS",
      summary: "1 test passed.",
      acceptanceCriterionIds: check.acceptanceCriterionIds,
      producer: { id: "deterministic-test", role: "VERIFIER", independent: true },
    }],
  }),
};

function baseVerifiers(testVerifier: Verifier = passingTestVerifier) {
  return [new ChangeBudgetVerifier(), new NegativeConstraintVerifier(), testVerifier];
}

describe("VerificationEngine", () => {
  it("produces VERIFIED only when mandatory checks pass and criteria have evidence", async () => {
    const result = await new VerificationEngine(baseVerifiers()).execute({ workflowRunId: "run-1", workOrder: workOrder(), candidate });
    expect(result.verdict).toBe("VERIFIED");
    expect(result.coverage).toEqual([expect.objectContaining({ criterionId: "ac-1", status: "EVIDENCED" })]);
    // Four, not three: the always-on verification-authority system check runs
    // ahead of the change budget and negative constraints. See
    // verificationAuthority.ts — it cannot be omitted by the WorkOrder under test.
    expect(result.checks.map((check) => check.status)).toEqual(["PASS", "PASS", "PASS", "PASS"]);
    expect(result.checks.map((check) => check.verifierId)).toContain("factory-verification-authority");
  });

  it("returns NOT_VERIFIED when tests pass but mandatory criterion evidence is missing", async () => {
    const nonEvidencing: Verifier = { ...passingTestVerifier, execute: async (context, check) => ({ ...(await passingTestVerifier.execute(context, check)), evidence: [] }) };
    const result = await new VerificationEngine(baseVerifiers(nonEvidencing)).execute({ workflowRunId: "run-1", workOrder: workOrder(), candidate });
    expect(result.checks.find((check) => check.checkId === "unit")?.status).toBe("PASS");
    expect(result.verdict).toBe("NOT_VERIFIED");
    expect(result.verdictReasons.join(" ")).toContain("ac-1 lacks required evidence");
  });

  it("returns BLOCKED when the file budget or protected path is exceeded", async () => {
    const result = await new VerificationEngine(baseVerifiers()).execute({
      workflowRunId: "run-1",
      workOrder: workOrder(),
      candidate: { ...candidate, changedFiles: ["src/feature.ts", "src/feature.test.ts", "src/extra.ts", "src/auth/provider.ts"], linesAdded: 60 },
    });
    expect(result.verdict).toBe("BLOCKED");
    expect(result.violations.join(" ")).toMatch(/maximum 3|Protected paths modified/);
  });

  it("returns NOT_VERIFIED for a failed mandatory deterministic check", async () => {
    const failing: Verifier = { ...passingTestVerifier, execute: async (context, check) => ({
      ...(await passingTestVerifier.execute(context, check)), status: "FAIL", summary: "Tests failed.",
      evidence: [{ evidenceKey: `${context.workflowRunId}:${check.id}`, category: "TEST_RESULT", result: "FAIL", summary: "1 test failed.", acceptanceCriterionIds: check.acceptanceCriterionIds, producer: { id: "deterministic-test", role: "VERIFIER", independent: true } }],
    }) };
    const result = await new VerificationEngine(baseVerifiers(failing)).execute({ workflowRunId: "run-1", workOrder: workOrder(), candidate });
    expect(result.verdict).toBe("NOT_VERIFIED");
    expect(result.checks.find((check) => check.checkId === "unit")?.status).toBe("FAIL");
  });

  it("returns NOT_CONFIGURED and never verifies when a required verifier is missing", async () => {
    const spec = workOrder({ verificationContract: { schemaVersion: 1, enforcementMode: "ENFORCED", requireHumanReview: false, checks: [{
      id: "independent", name: "Independent review", category: "INDEPENDENT_REVIEW", verifierId: "unavailable-independent-agent", mandatory: true,
      acceptanceCriterionIds: ["ac-1"], evidenceCategory: "REVIEW_RESULT",
    }] } });
    const result = await new VerificationEngine(baseVerifiers()).execute({ workflowRunId: "run-1", workOrder: spec, candidate });
    expect(result.verdict).toBe("NOT_VERIFIED");
    expect(result.checks.find((check) => check.checkId === "independent")?.status).toBe("NOT_CONFIGURED");
  });

  it.each(["SKIPPED", "ERROR"] as const)("does not convert mandatory %s into PASS", async (status) => {
    const verifier: Verifier = { ...passingTestVerifier, execute: async (context, check) => ({ ...(await passingTestVerifier.execute(context, check)), status, evidence: [] }) };
    const result = await new VerificationEngine(baseVerifiers(verifier)).execute({ workflowRunId: "run-1", workOrder: workOrder(), candidate });
    expect(result.verdict).toBe("NOT_VERIFIED");
  });

  it("blocks suspicious verification weakening", async () => {
    const result = await new VerificationEngine(baseVerifiers()).execute({
      workflowRunId: "run-1",
      workOrder: workOrder({ negativeConstraints: [{ id: "keep-tests", type: "NO_ASSERTION_WEAKENING", description: "Must not weaken assertions" }] }),
      candidate: { ...candidate, diff: "- expect(result).toBe(true)\n+ test.skip('result', () => {})" },
    });
    expect(result.verdict).toBe("BLOCKED");
    expect(result.violations.join(" ")).toContain("keep-tests");
  });
});
