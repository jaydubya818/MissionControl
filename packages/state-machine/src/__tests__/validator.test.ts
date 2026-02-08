import { describe, it, expect } from "vitest";
import {
  validateTransition,
  validateTransitions,
  canActorTransition,
  getValidNextStatuses,
  explainTransition,
  TransitionContext,
} from "../validator";

describe("validateTransition", () => {
  it("allows valid transition with correct actor", () => {
    const result = validateTransition({
      from: "INBOX",
      to: "ASSIGNED",
      actor: "agent",
      artifacts: { assigneeIds: ["agent-1"] },
    });
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("rejects invalid transition path", () => {
    const result = validateTransition({
      from: "INBOX",
      to: "DONE",
      actor: "human",
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Invalid transition");
  });

  it("rejects transition by unauthorized actor", () => {
    const result = validateTransition({
      from: "REVIEW",
      to: "DONE",
      actor: "agent",
      artifacts: { approvalRecord: "approved" },
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("not allowed");
  });

  it("rejects transition with missing required artifacts", () => {
    const result = validateTransition({
      from: "INBOX",
      to: "ASSIGNED",
      actor: "agent",
      // missing assigneeIds
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Missing required artifacts");
    expect(result.error).toContain("assigneeIds");
  });

  it("rejects transition with empty assigneeIds", () => {
    const result = validateTransition({
      from: "INBOX",
      to: "ASSIGNED",
      actor: "agent",
      artifacts: { assigneeIds: [] },
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("assigneeIds");
  });

  it("warns when transitioning from terminal state", () => {
    const result = validateTransition({
      from: "DONE",
      to: "REVIEW",
      actor: "human",
    });
    expect(result.valid).toBe(true);
    expect(result.warning).toContain("terminal state");
  });

  it("allows system to block IN_PROGRESS tasks", () => {
    const result = validateTransition({
      from: "IN_PROGRESS",
      to: "BLOCKED",
      actor: "system",
    });
    expect(result.valid).toBe(true);
  });

  it("allows IN_PROGRESS -> FAILED by system", () => {
    const result = validateTransition({
      from: "IN_PROGRESS",
      to: "FAILED",
      actor: "system",
    });
    expect(result.valid).toBe(true);
  });

  it("allows FAILED -> INBOX by human (retry)", () => {
    const result = validateTransition({
      from: "FAILED",
      to: "INBOX",
      actor: "human",
    });
    expect(result.valid).toBe(true);
    expect(result.warning).toContain("terminal state");
  });

  it("rejects agent transitioning FAILED -> INBOX", () => {
    const result = validateTransition({
      from: "FAILED",
      to: "INBOX",
      actor: "agent",
    });
    expect(result.valid).toBe(false);
  });

  it("requires deliverable and selfReview for IN_PROGRESS -> REVIEW", () => {
    const noArtifacts = validateTransition({
      from: "IN_PROGRESS",
      to: "REVIEW",
      actor: "agent",
    });
    expect(noArtifacts.valid).toBe(false);
    expect(noArtifacts.error).toContain("deliverable");

    const withArtifacts = validateTransition({
      from: "IN_PROGRESS",
      to: "REVIEW",
      actor: "agent",
      artifacts: { deliverable: "result", selfReview: "looks good" },
    });
    expect(withArtifacts.valid).toBe(true);
  });

  it("requires approvalRecord for REVIEW -> DONE", () => {
    const noApproval = validateTransition({
      from: "REVIEW",
      to: "DONE",
      actor: "human",
    });
    expect(noApproval.valid).toBe(false);
    expect(noApproval.error).toContain("approvalRecord");

    const withApproval = validateTransition({
      from: "REVIEW",
      to: "DONE",
      actor: "human",
      artifacts: { approvalRecord: "approved by Jay" },
    });
    expect(withApproval.valid).toBe(true);
  });
});

describe("validateTransitions (bulk)", () => {
  it("validates multiple transitions", () => {
    const contexts: TransitionContext[] = [
      { from: "INBOX", to: "ASSIGNED", actor: "agent", artifacts: { assigneeIds: ["a1"] } },
      { from: "INBOX", to: "DONE", actor: "agent" }, // invalid
      { from: "IN_PROGRESS", to: "BLOCKED", actor: "system" },
    ];
    const results = validateTransitions(contexts);
    expect(results).toHaveLength(3);
    expect(results[0].valid).toBe(true);
    expect(results[1].valid).toBe(false);
    expect(results[2].valid).toBe(true);
  });
});

describe("canActorTransition", () => {
  it("agents can transition from INBOX", () => {
    expect(canActorTransition("INBOX", "agent")).toBe(true);
  });

  it("agents can transition from IN_PROGRESS", () => {
    expect(canActorTransition("IN_PROGRESS", "agent")).toBe(true);
  });

  it("no actor can transition from CANCELED", () => {
    expect(canActorTransition("CANCELED", "agent")).toBe(false);
    expect(canActorTransition("CANCELED", "human")).toBe(false);
    expect(canActorTransition("CANCELED", "system")).toBe(false);
  });

  it("only human can transition from FAILED", () => {
    expect(canActorTransition("FAILED", "human")).toBe(true);
    expect(canActorTransition("FAILED", "agent")).toBe(false);
    expect(canActorTransition("FAILED", "system")).toBe(false);
  });
});

describe("getValidNextStatuses", () => {
  it("returns valid next statuses for INBOX by agent", () => {
    const next = getValidNextStatuses("INBOX", "agent");
    expect(next).toContain("ASSIGNED");
    expect(next).not.toContain("DONE");
    expect(next).not.toContain("CANCELED");
  });

  it("returns more options for human than agent from REVIEW", () => {
    const agentNext = getValidNextStatuses("REVIEW", "agent");
    const humanNext = getValidNextStatuses("REVIEW", "human");
    expect(humanNext.length).toBeGreaterThan(agentNext.length);
    expect(humanNext).toContain("DONE");
    expect(agentNext).not.toContain("DONE");
  });

  it("returns empty array for CANCELED", () => {
    expect(getValidNextStatuses("CANCELED", "human")).toEqual([]);
    expect(getValidNextStatuses("CANCELED", "agent")).toEqual([]);
  });
});

describe("explainTransition", () => {
  it("explains valid transition", () => {
    // Use a transition that doesn't require artifacts
    const explanation = explainTransition("IN_PROGRESS", "BLOCKED", "system");
    expect(explanation).toContain("Valid transition");
  });

  it("explains invalid transition", () => {
    const explanation = explainTransition("INBOX", "DONE", "agent");
    expect(explanation).toContain("Invalid transition");
  });

  it("explains actor permission error", () => {
    const explanation = explainTransition("REVIEW", "DONE", "agent");
    expect(explanation).toContain("not allowed");
  });
});
