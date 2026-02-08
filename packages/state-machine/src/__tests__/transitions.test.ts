import { describe, it, expect } from "vitest";
import {
  TRANSITION_RULES,
  getValidTransitions,
  findTransitionRule,
  isValidTransition,
} from "../transitions";

describe("Transition Rules", () => {
  it("has no duplicate rules", () => {
    const keys = TRANSITION_RULES.map((r) => `${r.from}->${r.to}`);
    const unique = new Set(keys);
    expect(keys.length).toBe(unique.size);
  });

  it("all rules reference valid states", () => {
    const validStates = [
      "INBOX", "ASSIGNED", "IN_PROGRESS", "REVIEW",
      "NEEDS_APPROVAL", "BLOCKED", "FAILED", "DONE", "CANCELED",
    ];
    for (const rule of TRANSITION_RULES) {
      expect(validStates).toContain(rule.from);
      expect(validStates).toContain(rule.to);
    }
  });

  it("CANCELED has no outbound transitions", () => {
    const fromCanceled = TRANSITION_RULES.filter((r) => r.from === "CANCELED");
    expect(fromCanceled).toHaveLength(0);
  });

  it("FAILED has limited outbound transitions (human only)", () => {
    const fromFailed = TRANSITION_RULES.filter((r) => r.from === "FAILED");
    expect(fromFailed.length).toBeGreaterThan(0);
    for (const rule of fromFailed) {
      expect(rule.allowedActors).toEqual(["human"]);
    }
  });

  it("DONE can be reopened by human only", () => {
    const fromDone = TRANSITION_RULES.filter((r) => r.from === "DONE");
    expect(fromDone.length).toBeGreaterThan(0);
    for (const rule of fromDone) {
      expect(rule.allowedActors).toEqual(["human"]);
    }
  });

  it("every rule has a description", () => {
    for (const rule of TRANSITION_RULES) {
      expect(rule.description).toBeTruthy();
    }
  });

  it("every rule has at least one allowed actor", () => {
    for (const rule of TRANSITION_RULES) {
      expect(rule.allowedActors.length).toBeGreaterThan(0);
    }
  });
});

describe("getValidTransitions", () => {
  it("returns transitions from INBOX", () => {
    const transitions = getValidTransitions("INBOX");
    expect(transitions.length).toBeGreaterThan(0);
    const targets = transitions.map((r) => r.to);
    expect(targets).toContain("ASSIGNED");
    expect(targets).toContain("CANCELED");
  });

  it("returns no transitions from CANCELED", () => {
    const transitions = getValidTransitions("CANCELED");
    expect(transitions).toHaveLength(0);
  });

  it("returns transitions from IN_PROGRESS that include FAILED", () => {
    const transitions = getValidTransitions("IN_PROGRESS");
    const targets = transitions.map((r) => r.to);
    expect(targets).toContain("REVIEW");
    expect(targets).toContain("BLOCKED");
    expect(targets).toContain("FAILED");
  });
});

describe("findTransitionRule", () => {
  it("finds INBOX -> ASSIGNED rule", () => {
    const rule = findTransitionRule("INBOX", "ASSIGNED");
    expect(rule).toBeDefined();
    expect(rule?.allowedActors).toContain("agent");
    expect(rule?.requiresArtifacts).toContain("assigneeIds");
  });

  it("returns undefined for invalid transition", () => {
    const rule = findTransitionRule("INBOX", "DONE");
    expect(rule).toBeUndefined();
  });

  it("returns undefined for CANCELED -> anything", () => {
    const rule = findTransitionRule("CANCELED", "INBOX");
    expect(rule).toBeUndefined();
  });
});

describe("isValidTransition", () => {
  it("allows valid transitions", () => {
    expect(isValidTransition("INBOX", "ASSIGNED")).toBe(true);
    expect(isValidTransition("ASSIGNED", "IN_PROGRESS")).toBe(true);
    expect(isValidTransition("IN_PROGRESS", "REVIEW")).toBe(true);
    expect(isValidTransition("REVIEW", "DONE")).toBe(true);
    expect(isValidTransition("IN_PROGRESS", "FAILED")).toBe(true);
  });

  it("rejects invalid transitions", () => {
    expect(isValidTransition("INBOX", "DONE")).toBe(false);
    expect(isValidTransition("INBOX", "REVIEW")).toBe(false);
    expect(isValidTransition("CANCELED", "INBOX")).toBe(false);
    expect(isValidTransition("DONE", "IN_PROGRESS")).toBe(false);
  });

  it("allows self-loop detection: no state can transition to itself", () => {
    const states = ["INBOX", "ASSIGNED", "IN_PROGRESS", "REVIEW",
      "NEEDS_APPROVAL", "BLOCKED", "FAILED", "DONE", "CANCELED"] as const;
    for (const state of states) {
      expect(isValidTransition(state, state)).toBe(false);
    }
  });
});
