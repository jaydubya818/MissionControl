import { describe, expect, it } from "vitest";
import {
  canApplyPlanningCandidate,
  resolvePlanningRunPresentation,
  shouldShowPlanReleaseReadOnlyNotice,
} from "./missionPlanningPresentation";

describe("Mission planning presentation semantics", () => {
  const bound = { _id: "run-bound", status: "SUCCEEDED", adoptedPlanId: "plan-1" };
  const latest = { _id: "run-latest", status: "SUCCEEDED" };

  it("keeps Plan-bound provenance separate from a newer unadopted candidate", () => {
    expect(resolvePlanningRunPresentation([latest, bound], {
      status: "APPROVED",
      planningRunId: "run-bound",
    })).toEqual({ boundRun: bound, latestUnadoptedRun: latest });
  });

  it("allows candidate adoption only into an absent or editable draft Plan", () => {
    expect(canApplyPlanningCandidate(null)).toBe(true);
    expect(canApplyPlanningCandidate({ status: "DRAFT" })).toBe(true);
    expect(canApplyPlanningCandidate({ status: "PROPOSED" })).toBe(false);
    expect(canApplyPlanningCandidate({ status: "APPROVED" })).toBe(false);
  });

  it("suppresses the feature-flag editing warning for an approved Plan", () => {
    expect(shouldShowPlanReleaseReadOnlyNotice(false, { status: "APPROVED" })).toBe(false);
    expect(shouldShowPlanReleaseReadOnlyNotice(false, { status: "DRAFT" })).toBe(true);
  });
});
