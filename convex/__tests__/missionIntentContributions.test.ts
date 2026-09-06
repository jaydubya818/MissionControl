import { describe, expect, it } from "vitest";
import {
  MISSION_INTENT_AUTHORITY_PROFILE,
  assertMissionIntentText,
  missionIntentContributionDigest,
  projectMissionIntentContributions,
  type MissionIntentContributionShape,
} from "../lib/missionIntentContributions";

const contribution = (overrides: Partial<MissionIntentContributionShape> = {}): MissionIntentContributionShape => ({
  _id: "contribution-1",
  contributionKey: "QA-AC-001",
  revisionNumber: 1,
  missionSpecRevisionId: "spec-current",
  missionSpecDigest: "sha256:current",
  contributorRole: "QA",
  targetSection: "ACCEPTANCE_EXPECTATIONS",
  targetItemId: "AC-001",
  title: "Add a denied-path criterion",
  body: "An unauthorized contributor receives a durable denial without changing the Spec.",
  evidenceExpectation: "Browser evidence and an authorization test prove the denial.",
  proposedBy: "qa@example.com",
  proposedActorType: "HUMAN",
  proposedActorSource: "AUTHENTICATED",
  proposedAt: 1,
  ...overrides,
});

describe("shared builder intent projection", () => {
  it("derives proposed, conflicting, stale, superseded, and decided states without rewriting history", () => {
    const rows = projectMissionIntentContributions({
      currentSpecRevisionId: "spec-current",
      currentSpecDigest: "sha256:current",
      contributions: [
        contribution(),
        contribution({ _id: "contribution-2", contributionKey: "PRODUCT-AC-001", contributorRole: "PRODUCT", proposedAt: 2 }),
        contribution({ _id: "contribution-old", contributionKey: "DESIGN-UX-001", revisionNumber: 1, targetSection: "RISKS", targetItemId: undefined, proposedAt: 3 }),
        contribution({ _id: "contribution-new", contributionKey: "DESIGN-UX-001", revisionNumber: 2, supersedesContributionId: "contribution-old", targetSection: "RISKS", targetItemId: undefined, proposedAt: 4 }),
        contribution({ _id: "contribution-stale", contributionKey: "ENG-SCOPE-001", missionSpecRevisionId: "spec-old", missionSpecDigest: "sha256:old", targetSection: "REPOSITORY_SCOPE", targetItemId: undefined, proposedAt: 5 }),
      ],
      decisions: [{ contributionId: "contribution-new", decision: "ACCEPTED", reason: "Use this as input", decidedBy: "operator", decidedAt: 6 }],
    });
    expect(Object.fromEntries(rows.map((row) => [row._id, row.state]))).toEqual({
      "contribution-stale": "STALE",
      "contribution-new": "ACCEPTED",
      "contribution-old": "SUPERSEDED",
      "contribution-2": "CONFLICT",
      "contribution-1": "CONFLICT",
    });
    expect(rows.find((row) => row._id === "contribution-1")?.conflictIds).toEqual(["contribution-2"]);
  });

  it("keeps the contribution authority profile proposal-only", () => {
    expect(Object.values(MISSION_INTENT_AUTHORITY_PROFILE).every((value) => value === false)).toBe(true);
  });

  it("bounds required text and hashes exact attribution", () => {
    expect(() => assertMissionIntentText(" ", "Proposed change", 20)).toThrow("Proposed change is required");
    const { _id: _ignoredId, proposedAt: _ignoredTime, ...input } = contribution();
    const { _id: _anotherId, proposedAt: _anotherTime, ...anotherInput } = contribution({ proposedBy: "another-agent" });
    const digest = missionIntentContributionDigest(input);
    expect(digest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(digest).not.toBe(missionIntentContributionDigest(anotherInput));
  });
});
