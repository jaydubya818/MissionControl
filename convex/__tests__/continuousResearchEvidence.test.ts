import { describe, expect, it } from "vitest";
import {
  continuousResearchObservationDisposition,
  continuousResearchDesiredOutcome,
  continuousResearchWorkOrderDispatchIssues,
  MAX_CONTINUOUS_RESEARCH_EXCERPT_CHARS,
  MAX_CONTINUOUS_RESEARCH_OBSERVATIONS,
  MAX_CONTINUOUS_RESEARCH_PACKET_BYTES,
} from "../lib/continuousResearchEvidence";

describe("continuous research evidence dispatch", () => {
  it("includes only active, safety-passed evidence awaiting claim review", () => {
    expect(continuousResearchObservationDisposition({
      state: "ACTIVE",
      safetyScanStatus: "PASSED",
      verificationDecision: "ACCEPTED",
      sourceDecision: "PENDING",
    })).toBe("INCLUDE");
  });

  it("keeps quarantined evidence excluded", () => {
    expect(continuousResearchObservationDisposition({
      state: "ACTIVE",
      safetyScanStatus: "QUARANTINED",
      verificationDecision: "REJECTED",
      sourceDecision: "REJECTED",
    })).toBe("EXCLUDE");
  });

  it("fails closed when evidence was pre-accepted or changed after freezing", () => {
    expect(() => continuousResearchObservationDisposition({
      state: "ACTIVE",
      safetyScanStatus: "PASSED",
      verificationDecision: "ACCEPTED",
      sourceDecision: "ACCEPTED",
    })).toThrow("awaiting independent claim review");
    expect(() => continuousResearchObservationDisposition({
      state: "SUPERSEDED",
      safetyScanStatus: "PASSED",
      verificationDecision: "ACCEPTED",
      sourceDecision: "PENDING",
    })).toThrow("deleted or superseded");
  });

  it("keeps the immutable run context inside explicit count and byte budgets", () => {
    expect(MAX_CONTINUOUS_RESEARCH_OBSERVATIONS).toBe(25);
    expect(MAX_CONTINUOUS_RESEARCH_EXCERPT_CHARS).toBe(1_200);
    expect(MAX_CONTINUOUS_RESEARCH_PACKET_BYTES).toBe(48 * 1024);
  });

  it("requires the WorkOrder authority to match the frozen-evidence boundary", () => {
    const desiredOutcome = continuousResearchDesiredOutcome("Stop after verification.");
    expect(continuousResearchWorkOrderDispatchIssues({
      state: "READY",
      workflowId: "continuous-research",
      desiredOutcome,
      expectedDesiredOutcome: desiredOutcome,
      isMutating: false,
      metadata: { loopEngineering: true, graphEngineering: true },
    })).toEqual([]);

    expect(continuousResearchWorkOrderDispatchIssues({
      state: "DISPATCHED",
      workflowId: "continuous-research",
      desiredOutcome,
      expectedDesiredOutcome: desiredOutcome,
      isMutating: false,
      metadata: { loopEngineering: true, graphEngineering: true },
    })).toEqual([]);

    expect(continuousResearchWorkOrderDispatchIssues({
      state: "READY",
      workflowId: "continuous-research",
      desiredOutcome: "Research broadly and recommend changes.",
      expectedDesiredOutcome: desiredOutcome,
      isMutating: false,
      metadata: { loopEngineering: true, graphEngineering: true },
    })).toEqual(["The WorkOrder objective is broader than the frozen-evidence claim boundary."]);
  });
});
