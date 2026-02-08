import { describe, expect, it } from "vitest";
import { evaluateOperatorGate } from "../lib/operatorControls";

describe("operator controls gate", () => {
  it("allows all operations in NORMAL mode", () => {
    const result = evaluateOperatorGate({
      mode: "NORMAL",
      actorType: "AGENT",
      operation: "RUN_START",
    });

    expect(result.decision).toBe("ALLOW");
  });

  it("denies agent run starts in PAUSED mode", () => {
    const result = evaluateOperatorGate({
      mode: "PAUSED",
      actorType: "AGENT",
      operation: "RUN_START",
    });

    expect(result.decision).toBe("DENY");
    expect(result.reason).toContain("PAUSED");
  });

  it("requires explicit approval for human actions in QUARANTINED mode", () => {
    const result = evaluateOperatorGate({
      mode: "QUARANTINED",
      actorType: "HUMAN",
      operation: "TRANSITION",
    });

    expect(result.decision).toBe("NEEDS_APPROVAL");
  });

  it("blocks new runs in DRAINING mode", () => {
    const result = evaluateOperatorGate({
      mode: "DRAINING",
      actorType: "AGENT",
      operation: "RUN_START",
    });

    expect(result.decision).toBe("DENY");
    expect(result.reason).toContain("DRAINING");
  });
});
