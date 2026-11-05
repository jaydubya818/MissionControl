import { describe, expect, it } from "vitest";
import {
  assertMissionDraftWorkspace,
  changedMissionDraftFields,
  missionScopeStatus,
  missionDraftNextAction,
  validateMissionDraftInput,
} from "../lib/missionDraft";

const validDraft = {
  title: "Trusted routing",
  objective: "Make Mission routing reliable",
  context: "PR 1",
  constraints: ["No state-machine changes"],
  sourceOfTruthRefs: [{ kind: "PRD", label: "PR 1", location: "docs/pr1.md" }],
  owner: "Platform",
  budgetUsd: 12.5,
  stopCondition: "Focused tests pass",
  maxReadOnlyConcurrency: 2,
  maxCorrectiveIterations: 1,
};

describe("Mission draft mutation contract", () => {
  it("validates the complete create and update payload", () => {
    expect(() => validateMissionDraftInput(validDraft)).not.toThrow();
  });

  it("rejects invalid numeric guardrails server-side", () => {
    expect(() => validateMissionDraftInput({ ...validDraft, budgetUsd: -1 }))
      .toThrow("Mission budget must be zero or greater");
    expect(() => validateMissionDraftInput({ ...validDraft, maxReadOnlyConcurrency: 0 }))
      .toThrow("Mission read-only concurrency must be a whole number of at least 1");
    expect(() => validateMissionDraftInput({ ...validDraft, maxCorrectiveIterations: 1.5 }))
      .toThrow("Mission corrective iterations must be a whole number of at least 0");
  });

  it("records one meaningful changed-field set rather than keystrokes", () => {
    expect(changedMissionDraftFields(validDraft, {
      ...validDraft,
      title: "Trusted Mission routing",
      budgetUsd: 15,
    })).toEqual(["title", "budgetUsd"]);
    expect(changedMissionDraftFields(validDraft, validDraft)).toEqual([]);
  });

  it("rejects reads and updates outside the active workspace", () => {
    const mission = { projectId: "workspace-1" };
    expect(missionScopeStatus(mission, "workspace-1")).toBe("FOUND");
    expect(missionScopeStatus(mission, "workspace-2")).toBe("SCOPE_MISMATCH");
    expect(missionScopeStatus(null, "workspace-1")).toBe("NOT_FOUND");
    expect(() => assertMissionDraftWorkspace(mission, "workspace-2"))
      .toThrow("Mission does not belong to the active workspace");
  });

  it("does not audit an omitted environment as a change", () => {
    expect(changedMissionDraftFields({ ...validDraft, executionEnvironment: "LOCAL" }, {
      ...validDraft, title: "Changed title",
    })).toEqual(["title"]);
  });

  it("keeps zero-budget intake blocked and guides a fully assigned draft to Plan review", () => {
    const mission = { ownerMemberId: "owner", owningTeamId: "team", repositoryId: "repo", codeScopeIds: ["scope"], executionEnvironment: "LOCAL" as const };
    expect(missionDraftNextAction({ ...mission, budgetUsd: 0 })).toContain("positive budget");
    expect(missionDraftNextAction({ ...mission, budgetUsd: 1 })).toBe("Prepare and review the canonical Plan.");
    expect(missionDraftNextAction({ ...mission, budgetUsd: 1, executionEnvironment: undefined })).toContain("execution environment");
  });
});
