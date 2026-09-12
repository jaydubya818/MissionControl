import { describe, expect, it } from "vitest";

import { getFactoryRecipe } from "../factoryExperience/recipeCatalog";
import {
  defaultProjectConstitution,
  emptyMissionSpec,
  evaluationForRevision,
  finalizationForRevision,
  hydrateChecklistDispositions,
  missionSpecCompleteness,
  missionSpecWithCurrentMissionScope,
  nextMissionSpecId,
} from "./missionSpecModel";

const mission = {
  _id: "mission-1",
  objective: "Operators can trace exact planning lineage.",
  constraints: ["No execution authority"],
  repositoryId: "repository-1",
  codeScopeIds: ["scope-1"],
  sourceOfTruthRefs: [{ kind: "DOC" as const, label: "Architecture", location: "docs/architecture.md" }],
};

describe("Mission Spec UI model", () => {
  it("scaffolds only existing Mission facts and recipe versions", () => {
    const values = emptyMissionSpec({ mission, recipe: getFactoryRecipe("full-sdlc") });

    expect(values.problem).toBe("");
    expect(values.outcome).toBe(mission.objective);
    expect(values.repositoryScope).toEqual({ repositoryId: "repository-1", codeScopeIds: ["scope-1"] });
    expect(values.sources).toEqual([{ id: "SOURCE-001", kind: "DOC", label: "Architecture", location: "docs/architecture.md" }]);
    expect(values.recipe).toMatchObject({ recipeId: "full-sdlc", specTemplateVersion: 1, checklistVersion: 1, riskProfile: "HIGH" });
  });

  it("hydrates all three checklist classifications without turning them into evidence", () => {
    const constitution = { content: defaultProjectConstitution() };
    const values = hydrateChecklistDispositions(emptyMissionSpec({ mission }), constitution);

    expect(values.checklistDispositions).toEqual([
      expect.objectContaining({ classification: "REQUIREMENTS_QUALITY", disposition: "MISSING" }),
      expect.objectContaining({ classification: "GOVERNANCE_CONSTRAINT", disposition: "MISSING" }),
      expect.objectContaining({ classification: "EVIDENCE_BEARING_VERIFICATION", disposition: "MISSING" }),
    ]);
    expect(values.verificationExpectations).toEqual([]);
  });

  it("creates stable IDs independent of presentation order", () => {
    const values = emptyMissionSpec({ mission });
    values.requirements = [
      { id: "REQ-002", title: "Second", description: "Second", priority: "MUST", sourceStoryIds: [] },
      { id: "REQ-001", title: "First", description: "First", priority: "MUST", sourceStoryIds: [] },
    ];
    expect(nextMissionSpecId(values, "REQ")).toBe("REQ-003");
  });

  it("carries a changed Mission repository scope into a new immutable Spec draft", () => {
    const values = emptyMissionSpec({
      mission: { ...mission, repositoryId: undefined, codeScopeIds: [] },
    });

    const next = missionSpecWithCurrentMissionScope(values, mission);

    expect(next.repositoryScope).toEqual({
      repositoryId: "repository-1",
      codeScopeIds: ["scope-1"],
    });
    expect(values.repositoryScope).toEqual({
      repositoryId: undefined,
      codeScopeIds: [],
    });
    expect(missionSpecWithCurrentMissionScope(next, mission)).toBe(next);
  });

  it("reports honest incomplete state and selects exact revision records", () => {
    const values = emptyMissionSpec({ mission });
    expect(missionSpecCompleteness(values).percentage).toBeLessThan(50);
    const evaluations = [
      { _id: "eval-1", missionSpecRevisionId: "spec-1", evaluatedAt: 1 },
      { _id: "eval-2", missionSpecRevisionId: "spec-1", evaluatedAt: 2 },
      { _id: "eval-3", missionSpecRevisionId: "spec-2", evaluatedAt: 3 },
    ];
    expect(evaluationForRevision(evaluations, "spec-1")?._id).toBe("eval-2");
    expect(finalizationForRevision([{ missionSpecRevisionId: "spec-2", decisionType: "FINALIZED" }], "spec-1")).toBeNull();
  });
});
