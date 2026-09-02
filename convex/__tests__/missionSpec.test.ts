import { describe, expect, it } from "vitest";
import {
  MISSION_SPEC_LIMITS,
  analyzeSpecPlanConsistency,
  planIncludesExcludedScope,
  assertMissionSpecBounds,
  evaluateMissionSpecQuality,
  missionSpecDigest,
  projectConstitutionDigest,
  type MissionSpecContent,
  type ProjectConstitutionContent,
} from "../lib/missionSpec";
import {
  demoMissionPlanAssertions,
  demoMissionPlanBlueprint,
  demoMissionSpecRevision1,
  demoMissionSpecRevision2,
  demoMissionSpecRevision3,
  demoProjectConstitution,
} from "../lib/missionSpecDemo";

function constitution(): ProjectConstitutionContent {
  return {
    summary: "Specifications are explicit, accessible, secure, and independently verifiable.",
    principles: [{
      id: "PRINCIPLE-001",
      title: "Verification first",
      description: "Every delivery outcome has evidence-bearing verification.",
      category: "TESTING",
    }],
    requiredSpecSections: ["NON_FUNCTIONAL_REQUIREMENTS", "NON_GOALS", "CONSTRAINTS", "RISKS", "SOURCES"],
    checklistItems: [
      {
        id: "CHECK-REQ-001",
        title: "Requirements are testable",
        description: "Every requirement is clear and maps to acceptance.",
        classification: "REQUIREMENTS_QUALITY",
        required: true,
      },
      {
        id: "CHECK-VERIFY-001",
        title: "Focused tests",
        description: "The exact focused suite must produce durable evidence.",
        classification: "EVIDENCE_BEARING_VERIFICATION",
        required: true,
      },
    ],
  };
}

function completeSpec(): MissionSpecContent {
  return {
    problem: "Operators cannot prove which durable intent authorized a released WorkOrder.",
    outcome: "Every newly governed Mission has immutable, machine-traceable planning lineage.",
    measurableOutcomes: [{ id: "OUTCOME-001", description: "Lineage remains exact", metric: "Incorrect rebinds", target: "0" }],
    personas: [{ id: "PERSONA-001", name: "Mission operator", needs: "Trustworthy intent-to-evidence lineage" }],
    userStories: [{
      id: "STORY-001",
      personaId: "PERSONA-001",
      title: "Inspect approved lineage",
      outcome: "The operator sees the exact revision behind delivery.",
      priority: "P0",
      scenarios: [{ id: "SCENARIO-001", given: "A finalized Spec", when: "A Plan is approved", then: "The Plan and WorkOrder retain its exact digest" }],
    }],
    requirements: [{ id: "REQ-001", title: "Immutable binding", description: "The Plan must retain the exact finalized Spec revision and digest.", priority: "MUST", sourceStoryIds: ["STORY-001"] }],
    nonFunctionalRequirements: [{ id: "NFR-001", title: "Fail closed", description: "Lineage mismatch must stop Plan submission without releasing work.", category: "RELIABILITY", priority: "MUST", sourceStoryIds: ["STORY-001"] }],
    acceptanceExpectations: [
      {
        id: "AC-001",
        title: "Exact revision persists",
        description: "The exact Spec revision remains attached after a newer revision exists.",
        requirementIds: ["REQ-001"],
        verificationExpectationIds: ["VERIFY-001"],
        givenWhenThen: { given: "Plan bound to revision two", when: "revision three is created", then: "the Plan still points to revision two" },
      },
      {
        id: "AC-002",
        title: "Mismatch fails closed",
        description: "A digest mismatch cannot submit the Plan.",
        requirementIds: ["NFR-001"],
        verificationExpectationIds: ["VERIFY-001"],
      },
    ],
    verificationExpectations: [{
      id: "VERIFY-001",
      title: "Focused lineage tests",
      description: "Run the deterministic Mission Spec and Plan lineage suite.",
      method: "TEST",
      category: "UNIT_TEST",
      evidenceCategory: "TEST_RESULT",
      acceptanceExpectationIds: ["AC-001", "AC-002"],
      checklistItemIds: ["CHECK-VERIFY-001"],
      mandatory: true,
    }],
    definitionOfDone: [{ id: "DOD-001", description: "Exact lineage is visible and regression tested.", acceptanceExpectationIds: ["AC-001", "AC-002"] }],
    constraints: [{ id: "CONSTRAINT-001", description: "The Spec Intake path must not release or accept work." }],
    nonGoals: [{ id: "NONGOAL-001", description: "Install a second orchestration engine" }],
    risks: [{ id: "RISK-001", description: "Spec checks could be mistaken for verification.", severity: "HIGH", mitigation: "Keep checklist classifications and authority tests explicit." }],
    edgeCases: [{ id: "EDGE-001", description: "A newer Spec is created after Plan approval.", expectedBehavior: "Existing Plan and WorkOrder lineage remains unchanged." }],
    repositoryScope: { repositoryId: "repository-1", codeScopeIds: ["scope-1"] },
    sources: [{ id: "SOURCE-001", kind: "DOC", label: "Approved architecture", location: "docs/architecture/spec-intake.md" }],
    clarifications: [{ id: "CLARIFY-001", findingCode: "MEASURABLE_OUTCOME_MISSING", question: "What measurable result proves lineage?", answer: "Zero silent rebinds.", status: "RESOLVED" }],
    checklistDispositions: [
      { checklistItemId: "CHECK-REQ-001", classification: "REQUIREMENTS_QUALITY", disposition: "SATISFIED", reason: "Every MUST requirement maps to acceptance." },
      { checklistItemId: "CHECK-VERIFY-001", classification: "EVIDENCE_BEARING_VERIFICATION", disposition: "SATISFIED", reason: "VERIFY-001 maps to the focused suite." },
    ],
  };
}

describe("Mission Spec deterministic quality", () => {
  it("passes a complete bounded specification and hashes reordering canonically", () => {
    const spec = completeSpec();
    expect(evaluateMissionSpecQuality({ spec, constitution: constitution() })).toEqual({ rulesetVersion: 1, result: "PASS", findings: [] });
    expect(missionSpecDigest({ ...spec, requirements: [...spec.requirements].reverse() })).toBe(missionSpecDigest(spec));
    expect(projectConstitutionDigest(constitution())).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("returns bounded explainable findings for incomplete deterministic intake", () => {
    const spec = completeSpec();
    spec.measurableOutcomes = [];
    spec.repositoryScope.repositoryId = undefined;
    spec.acceptanceExpectations[0].verificationExpectationIds = [];
    spec.clarifications[0] = { ...spec.clarifications[0], answer: undefined, status: "OPEN" };
    const result = evaluateMissionSpecQuality({ spec, constitution: constitution() });
    expect(result.result).toBe("FAIL");
    expect(result.findings.map((item) => item.code)).toEqual(expect.arrayContaining([
      "MEASURABLE_OUTCOME_MISSING",
      "REPOSITORY_SCOPE_MISSING",
      "ACCEPTANCE_VERIFICATION_MISSING",
      "CLARIFICATION_UNRESOLVED",
    ]));
    expect(result.findings.every((item) => item.nextAction.length > 0)).toBe(true);
    expect(result.findings.length).toBeLessThanOrEqual(MISSION_SPEC_LIMITS.findings);
  });

  it("requires globally stable identities and detects conflicting scope", () => {
    const spec = completeSpec();
    spec.requirements[0].id = "bad-index-0";
    spec.nonGoals.push({ id: "NONGOAL-002", description: "The Plan must not retain the exact finalized Spec revision and digest." });
    const result = evaluateMissionSpecQuality({ spec, constitution: constitution() });
    expect(result.findings.map((item) => item.code)).toEqual(expect.arrayContaining([
      "STABLE_ID_INVALID",
      "UNRESOLVED_CONTRADICTION",
    ]));
  });

  it("never lets requirements-quality checks masquerade as evidence", () => {
    const spec = completeSpec();
    spec.verificationExpectations[0].checklistItemIds = ["CHECK-REQ-001"];
    const result = evaluateMissionSpecQuality({ spec, constitution: constitution() });
    expect(result.findings.map((item) => item.code)).toContain("NON_EVIDENCE_CHECKLIST_USED_FOR_VERIFICATION");
  });

  it("rejects unbounded collections before persistence or evaluation", () => {
    const spec = completeSpec();
    spec.personas = Array.from({ length: MISSION_SPEC_LIMITS.personas + 1 }, (_, index) => ({ id: `PERSONA-${index + 1}`, name: `Persona ${index + 1}`, needs: "Bounded behavior" }));
    expect(() => assertMissionSpecBounds(spec)).toThrow(`personas is limited to ${MISSION_SPEC_LIMITS.personas}`);
  });
});

describe("Spec to Plan requirements coverage", () => {
  it("distinguishes explicit non-goal guardrails from affirmative scope", () => {
    expect(planIncludesExcludedScope(
      "Do not modify the upstream repository.",
      "Modify the upstream repository."
    )).toBe(false);
    expect(planIncludesExcludedScope(
      "Modify the upstream repository to publish the change.",
      "Modify the upstream repository."
    )).toBe(true);
    expect(planIncludesExcludedScope(
      "Modifying the upstream repository remains out of scope.",
      "Modifying the upstream repository"
    )).toBe(false);
  });

  it("projects the full stable requirement-to-verification path", () => {
    const spec = completeSpec();
    const result = analyzeSpecPlanConsistency({
      spec,
      repositoryId: "repository-1",
      planSummary: "Implement immutable Mission lineage.",
      assertions: [
        { assertionId: "ASSERT-001", title: "Exact revision", outcome: "Revision retained", passCondition: "Tests pass", requiredEvidence: "Test output", sourceRequirementIds: ["REQ-001"], sourceAcceptanceExpectationIds: ["AC-001"], sourceVerificationExpectationIds: ["VERIFY-001"] },
        { assertionId: "ASSERT-002", title: "Mismatch closes", outcome: "Submission fails", passCondition: "Mutation rejects", requiredEvidence: "Test output", sourceRequirementIds: ["NFR-001"], sourceAcceptanceExpectationIds: ["AC-002"], sourceVerificationExpectationIds: ["VERIFY-001"] },
      ],
      workOrderBlueprints: [{ id: "WORK-001", title: "Implement", desiredOutcome: "Immutable lineage", assertionIds: ["ASSERT-001", "ASSERT-002"] }],
    });
    expect(result.findings).toEqual([]);
    expect(result.coverage.complete).toBe(true);
    expect(result.coverage.rows[0]).toMatchObject({
      specRequirementId: "NFR-001",
      planAssertionIds: ["ASSERT-002"],
      workOrderBlueprintIds: ["WORK-001"],
      acceptanceCriterionIds: ["ASSERT-002"],
      verificationCheckIds: ["spec:VERIFY-001"],
    });
  });

  it("explains missing task and verification coverage", () => {
    const spec = completeSpec();
    const result = analyzeSpecPlanConsistency({
      spec,
      repositoryId: "repository-1",
      planSummary: "A partial plan",
      assertions: [{ assertionId: "ASSERT-001", title: "Partial", outcome: "Partial", passCondition: "Partial", requiredEvidence: "None", sourceRequirementIds: ["REQ-001"], sourceAcceptanceExpectationIds: ["AC-001"], sourceVerificationExpectationIds: [] }],
      workOrderBlueprints: [],
    });
    expect(result.findings.map((item) => item.code)).toEqual(expect.arrayContaining([
      "PLAN_WORK_ORDER_COVERAGE_MISSING",
      "ACCEPTANCE_VERIFICATION_COVERAGE_MISSING",
      "SPEC_PLAN_REQUIREMENT_UNCOVERED",
    ]));
  });
});

describe("Spec Intake golden-path fixture", () => {
  it("proves failed r1, finalized-quality r2, complete Plan coverage, and distinct r3 lineage", () => {
    const revision1 = demoMissionSpecRevision1("repository-1", "scope-1");
    const revision2 = demoMissionSpecRevision2("repository-1", "scope-1");
    const revision3 = demoMissionSpecRevision3("repository-1", "scope-1");
    const constitution = demoProjectConstitution();
    expect(evaluateMissionSpecQuality({ spec: revision1, constitution }).result).toBe("FAIL");
    expect(evaluateMissionSpecQuality({ spec: revision2, constitution })).toMatchObject({ result: "PASS", findings: [] });
    expect(missionSpecDigest(revision3)).not.toBe(missionSpecDigest(revision2));
    const analysis = analyzeSpecPlanConsistency({
      spec: revision2,
      assertions: demoMissionPlanAssertions(),
      workOrderBlueprints: [demoMissionPlanBlueprint({ workflowId: "feature-dev", version: 1 })],
      planSummary: "Implement immutable Spec intake and exact Plan-to-WorkOrder lineage.",
      repositoryId: "repository-1",
    });
    expect(analysis.findings).toEqual([]);
    expect(analysis.coverage.complete).toBe(true);
  });
});
