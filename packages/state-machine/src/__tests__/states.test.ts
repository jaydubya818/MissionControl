import { describe, it, expect } from "vitest";
import { STATE_DEFINITIONS, isTerminalStatus, getRequiredArtifacts } from "../states";

describe("State Definitions", () => {
  it("defines exactly 9 states", () => {
    expect(Object.keys(STATE_DEFINITIONS)).toHaveLength(9);
  });

  it("includes all expected states", () => {
    const expected = [
      "INBOX", "ASSIGNED", "IN_PROGRESS", "REVIEW",
      "NEEDS_APPROVAL", "BLOCKED", "FAILED", "DONE", "CANCELED",
    ];
    expect(Object.keys(STATE_DEFINITIONS).sort()).toEqual(expected.sort());
  });

  it("marks DONE, CANCELED, and FAILED as terminal", () => {
    expect(STATE_DEFINITIONS.DONE.terminal).toBe(true);
    expect(STATE_DEFINITIONS.CANCELED.terminal).toBe(true);
    expect(STATE_DEFINITIONS.FAILED.terminal).toBe(true);
  });

  it("marks non-terminal states correctly", () => {
    const nonTerminal = ["INBOX", "ASSIGNED", "IN_PROGRESS", "REVIEW", "NEEDS_APPROVAL", "BLOCKED"];
    for (const status of nonTerminal) {
      expect(STATE_DEFINITIONS[status as keyof typeof STATE_DEFINITIONS].terminal).toBe(false);
    }
  });

  it("each definition has matching status field", () => {
    for (const [key, def] of Object.entries(STATE_DEFINITIONS)) {
      expect(def.status).toBe(key);
    }
  });

  it("each definition has a description", () => {
    for (const def of Object.values(STATE_DEFINITIONS)) {
      expect(def.description).toBeTruthy();
      expect(typeof def.description).toBe("string");
    }
  });
});

describe("isTerminalStatus", () => {
  it("returns true for terminal states", () => {
    expect(isTerminalStatus("DONE")).toBe(true);
    expect(isTerminalStatus("CANCELED")).toBe(true);
    expect(isTerminalStatus("FAILED")).toBe(true);
  });

  it("returns false for non-terminal states", () => {
    expect(isTerminalStatus("INBOX")).toBe(false);
    expect(isTerminalStatus("ASSIGNED")).toBe(false);
    expect(isTerminalStatus("IN_PROGRESS")).toBe(false);
    expect(isTerminalStatus("REVIEW")).toBe(false);
    expect(isTerminalStatus("NEEDS_APPROVAL")).toBe(false);
    expect(isTerminalStatus("BLOCKED")).toBe(false);
  });
});

describe("getRequiredArtifacts", () => {
  it("returns workPlan and assigneeIds for IN_PROGRESS", () => {
    const artifacts = getRequiredArtifacts("IN_PROGRESS");
    expect(artifacts).toContain("workPlan");
    expect(artifacts).toContain("assigneeIds");
  });

  it("returns deliverable and selfReview for REVIEW", () => {
    const artifacts = getRequiredArtifacts("REVIEW");
    expect(artifacts).toContain("deliverable");
    expect(artifacts).toContain("selfReview");
  });

  it("returns deliverable and approvalRecord for DONE", () => {
    const artifacts = getRequiredArtifacts("DONE");
    expect(artifacts).toContain("deliverable");
    expect(artifacts).toContain("approvalRecord");
  });

  it("returns empty array for states without required artifacts", () => {
    expect(getRequiredArtifacts("INBOX")).toEqual([]);
    expect(getRequiredArtifacts("ASSIGNED")).toEqual([]);
    expect(getRequiredArtifacts("BLOCKED")).toEqual([]);
    expect(getRequiredArtifacts("CANCELED")).toEqual([]);
    expect(getRequiredArtifacts("FAILED")).toEqual([]);
    expect(getRequiredArtifacts("NEEDS_APPROVAL")).toEqual([]);
  });
});
