import { describe, expect, it } from "vitest";
import { compileMissionWorkOrderContract } from "../lib/missionWorkOrderContract";
import type { MissionPlanAssertionInput, MissionPlanBlueprintInput } from "../lib/missionPlan";
import type { MissionSpecContent } from "../lib/missionSpec";
import { validateWorkOrderSpecification } from "../lib/workOrderSpecification";

const assertion: MissionPlanAssertionInput = {
  assertionId: "focused-tests",
  title: "Focused tests pass",
  outcome: "The approved behavior is regression tested.",
  verificationMethod: "TEST",
  passCondition: "The exact command exits zero.",
  requiredEvidence: "Durable test output",
  requiresIndependentValidation: true,
  waiverAllowed: false,
};

const blueprint: MissionPlanBlueprintInput = {
  id: "implement",
  title: "Implement the approved change",
  desiredOutcome: "The candidate matches the Mission contract.",
  workflowId: "software-delivery",
  workflowVersion: 1,
  sequence: 1,
  role: "WORKER",
  isMutating: true,
  priority: 2,
  riskLevel: "MEDIUM",
  branchStrategy: "isolated-worktree",
  constraints: ["Preserve the acceptance boundary"],
  requiredApprovals: [],
  implementationPolicy: {
    allowedCommands: ["pnpm test"],
    independentVerification: {
      executable: "pnpm",
      args: ["test"],
      category: "UNIT_TEST",
      commandClass: "TEST",
      evidenceCategory: "TEST_RESULT",
      timeoutMs: 1_800_000,
    },
    maxFilesChanged: 25,
    maxLinesChanged: 2_000,
    maxAttempts: 2,
    timeoutMinutes: 30,
    stopCondition: "Stop after exact candidate verification and PR lineage are durable.",
  },
  dependsOnBlueprintIds: [],
  assertionIds: [assertion.assertionId],
};

const spec = {
  requirements: [{
    id: "REQ-001",
    title: "Exact binding",
    description: "The Plan and WorkOrder retain the exact Spec revision.",
    priority: "MUST",
    sourceStoryIds: ["STORY-001"],
  }],
  nonFunctionalRequirements: [],
  verificationExpectations: [{
    id: "VERIFY-001",
    title: "Spec lineage test",
    description: "Run exact lineage regression tests.",
    method: "TEST",
    category: "UNIT_TEST",
    evidenceCategory: "TEST_RESULT",
    acceptanceExpectationIds: ["AC-001"],
    checklistItemIds: ["CHECK-VERIFY-001"],
    mandatory: true,
  }],
} as MissionSpecContent;

describe("Mission WorkOrder contract compiler", () => {
  it("materializes an enforced exact-argv verifier and bounded local authority", () => {
    const contract = compileMissionWorkOrderContract({
      blueprint,
      assertions: [assertion],
      rollbackApproach: "Revert the candidate commit.",
      codeScopes: [{
        includePaths: ["apps/mission-control-ui/src/**", "convex/**"],
        excludePaths: ["convex/_generated/**"],
      }],
    });

    expect(contract.verificationContract).toMatchObject({
      schemaVersion: 2,
      enforcementMode: "ENFORCED",
      requireHumanReview: false,
      independence: { required: true, minimumBoundary: "SEPARATE_ATTEMPT" },
      requiredRisks: [{
        id: "mission:exact-candidate-integrity",
        severity: "MEDIUM",
        requiredEvidenceIds: ["mission:independent-verification"],
      }],
      checks: [{
        verifierId: "factory-command/v1",
        mandatory: true,
        acceptanceCriterionIds: ["focused-tests"],
        command: { executable: "pnpm", args: ["test"], commandClass: "TEST" },
      }],
    });
    expect(contract.changeBudget).toMatchObject({
      maxFilesChanged: 25,
      maxLinesChanged: 2_000,
      allowedPaths: ["apps/mission-control-ui/src/**", "convex/**"],
      allowInfrastructureChanges: false,
    });
    expect(contract.acceptanceCriteria[0]).toMatchObject({
      requiredEvidence: [{ category: "TEST_RESULT", minimumCount: 1, independent: true }],
    });
    expect(contract.requiredApprovals).toEqual([]);
    expect(contract.metadata.planApprovalRequirements).toEqual([]);
    expect(contract.metadata.independentVerification.subject).toBe("IMMUTABLE_CANDIDATE_SHA");
  });

  it("fails closed when mutating work has no approved code scope", () => {
    expect(() => compileMissionWorkOrderContract({
      blueprint,
      assertions: [assertion],
      rollbackApproach: "Revert.",
      codeScopes: [],
    })).toThrow("approved repository code scope");
  });

  it("fails closed when mutating work has no explicit rollback approach", () => {
    expect(() => compileMissionWorkOrderContract({
      blueprint,
      assertions: [assertion],
      codeScopes: [{ includePaths: ["convex/**"], excludePaths: [] }],
    })).toThrow("explicit rollback approach");
  });

  it("keeps legacy read-only Mission blueprints compatible without inventing rollback metadata", () => {
    const contract = compileMissionWorkOrderContract({
      blueprint: { ...blueprint, isMutating: false, implementationPolicy: undefined },
      assertions: [assertion],
      codeScopes: [],
    });

    expect(contract.metadata).toEqual({});
    expect(contract).not.toHaveProperty("verificationContract");
  });

  it("retains Plan-gate requirements as audit metadata without creating duplicate WorkOrder gates", () => {
    const contract = compileMissionWorkOrderContract({
      blueprint: {
        ...blueprint,
        requiredApprovals: ["Confirm exact planning SHA", "Approve contract decision"],
      },
      assertions: [assertion],
      rollbackApproach: "Revert the candidate commit.",
      codeScopes: [{ includePaths: ["convex/**"], excludePaths: [] }],
    });

    expect(contract.requiredApprovals).toEqual([]);
    expect(contract.metadata.planApprovalRequirements).toEqual([
      "Approve contract decision",
      "Confirm exact planning SHA",
    ]);
  });

  it("maps only evidence-bearing Spec expectations into WorkOrder verification", () => {
    const contract = compileMissionWorkOrderContract({
      blueprint,
      assertions: [{
        ...assertion,
        sourceRequirementIds: ["REQ-001"],
        sourceAcceptanceExpectationIds: ["AC-001"],
        sourceVerificationExpectationIds: ["VERIFY-001"],
      }],
      rollbackApproach: "Revert the candidate commit.",
      codeScopes: [{ includePaths: ["convex/**"], excludePaths: [] }],
      spec,
    });

    expect(contract.requirements).toEqual([expect.objectContaining({ id: "REQ-001" })]);
    expect(contract.verificationContract?.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "spec:VERIFY-001",
        verifierId: "factory-command/v1",
        command: expect.objectContaining({ executable: "pnpm", args: ["test"] }),
      }),
    ]));
    expect(contract.acceptanceCriteria[0].requiredEvidence).toEqual([
      { category: "TEST_RESULT", minimumCount: 1, independent: true },
    ]);
    expect(JSON.stringify(contract)).not.toContain("CHECK-REQ-001");
  });

  it("does not synthesize an unenforceable verifier contract for a read-only validator WorkOrder", () => {
    const contract = compileMissionWorkOrderContract({
      blueprint: {
        ...blueprint,
        role: "VALIDATOR",
        isMutating: false,
        branchStrategy: undefined,
        implementationPolicy: undefined,
        dependsOnBlueprintIds: ["implement"],
      },
      assertions: [{
        ...assertion,
        sourceRequirementIds: ["REQ-001"],
        sourceAcceptanceExpectationIds: ["AC-001"],
        sourceVerificationExpectationIds: ["VERIFY-001"],
      }],
      codeScopes: [],
      spec,
    });

    expect(contract).not.toHaveProperty("verificationContract");
    expect(contract.metadata).toMatchObject({ specVerificationExpectationIds: ["VERIFY-001"] });
    expect(validateWorkOrderSpecification({
      title: "Validate the candidate",
      desiredOutcome: "Produce independent read-only evidence.",
      riskLevel: "MEDIUM",
      ...contract,
    })).toEqual({ valid: true, issues: [] });
  });
});
