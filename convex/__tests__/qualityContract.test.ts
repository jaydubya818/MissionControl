import { describe, expect, it } from "vitest";
import { compileApprovedPlanQualityContract } from "../lib/qualityContract";

const input = {
  missionId: "mission-1",
  missionPlanId: "plan-1",
  missionPlanRevision: 3,
  objective: "Add business justification",
  businessContext: "Improve governed Mission intake",
  constraints: ["No unrelated changes", "Preserve existing requests"],
  sourceOfTruthRefs: [{ kind: "ISSUE", label: "Golden path", location: "lab-1" }],
  repository: "jaydubya818/mission-control-factory-lab",
  repositoryBranch: "main",
  summary: "Implement the field through UI and API",
  rollbackApproach: "Revert the pull request",
  assertions: [{
    assertionId: "REQ-1",
    title: "Business justification is required",
    outcome: "Empty requests fail",
    verificationMethod: "BROWSER",
    passCondition: "The form blocks an empty value",
    requiredEvidence: "Browser result",
    requiresIndependentValidation: true,
    waiverAllowed: false,
  }],
  workOrderBlueprints: [{
    id: "implement",
    title: "Add the required field",
    desiredOutcome: "Validated UI and API behavior",
    workflowId: "implementation",
    workflowVersion: 1,
    sequence: 1,
    role: "WORKER",
    isMutating: true,
    riskLevel: "MEDIUM",
    constraints: ["Preserve compatibility"],
    requiredApprovals: ["HUMAN_REVIEW"],
    dependsOnBlueprintIds: [],
    assertionIds: ["REQ-1"],
  }],
};

describe("approved Plan Quality Contract projection", () => {
  it("produces one deterministic digest tied to the Plan revision", () => {
    const first = compileApprovedPlanQualityContract(input);
    const reordered = compileApprovedPlanQualityContract({
      ...input,
      constraints: [...input.constraints].reverse(),
    });

    expect(first.digest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(reordered.digest).toBe(first.digest);
    expect(first.projection.source).toMatchObject({
      missionPlanId: "plan-1",
      missionPlanRevision: 3,
    });
  });

  it("changes when approved quality authority changes", () => {
    const first = compileApprovedPlanQualityContract(input).digest;
    const revised = compileApprovedPlanQualityContract({
      ...input,
      missionPlanRevision: 4,
    }).digest;

    expect(revised).not.toBe(first);
  });

  it("freezes the Planning Agent repository SHA into the approved quality contract", () => {
    const planningRepositorySha = "a".repeat(40);
    const bound = compileApprovedPlanQualityContract({ ...input, planningRepositorySha });

    expect(bound.projection.schemaVersion).toBe(3);
    expect(bound.projection.repository.planningRepositorySha).toBe(planningRepositorySha);
    expect(bound.digest).not.toBe(compileApprovedPlanQualityContract(input).digest);
  });

  it("freezes exact Spec, Constitution, coverage, and non-authoritative checklist lineage", () => {
    const specBound = compileApprovedPlanQualityContract({
      ...input,
      assertions: [{
        ...input.assertions[0],
        sourceRequirementIds: ["REQ-001"],
        sourceAcceptanceExpectationIds: ["AC-001"],
        sourceVerificationExpectationIds: ["VERIFY-001"],
      }],
      specLineage: {
        missionSpecRevisionId: "spec-revision-2",
        missionSpecDigest: "sha256:spec",
        missionSpecQualityEvaluationId: "spec-evaluation-2",
        projectConstitutionRevisionId: "constitution-1",
        projectConstitutionDigest: "sha256:constitution",
        requirementsCoverage: {
          schemaVersion: 1,
          rows: [{
            specRequirementId: "REQ-001",
            acceptanceExpectationIds: ["AC-001"],
            planAssertionIds: ["REQ-1"],
            workOrderBlueprintIds: ["implement"],
            acceptanceCriterionIds: ["REQ-1"],
            verificationCheckIds: ["spec:VERIFY-001"],
            complete: true,
          }],
          complete: true,
          digest: "sha256:coverage",
        },
        checklistLineage: {
          requirementsQualityItemIds: ["CHECK-REQ-001"],
          governanceConstraintItemIds: ["CHECK-GOV-001"],
          evidenceBearingVerificationItemIds: ["CHECK-VERIFY-001"],
        },
      },
    });

    expect(specBound.projection).toMatchObject({
      schemaVersion: 2,
      source: {
        missionSpecRevisionId: "spec-revision-2",
        projectConstitutionRevisionId: "constitution-1",
      },
      checklistLineage: {
        requirementsQualityItemIds: ["CHECK-REQ-001"],
        evidenceBearingVerificationItemIds: ["CHECK-VERIFY-001"],
      },
    });
  });
});
