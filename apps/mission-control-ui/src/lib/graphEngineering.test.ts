import { describe, expect, it } from "vitest";
import {
  buildGraphDispatchTarget,
  graphDispatchPresentation,
  graphDispatchState,
  summarizeGraphExecution,
} from "./graphEngineering";

describe("Graph Engineering presentation", () => {
  it("summarizes fan-out, verification, failures, and progress", () => {
    const summary = summarizeGraphExecution({
      status: "RUNNING",
      steps: [
        { status: "DONE", kind: "AGENT" },
        { status: "DONE", kind: "AGENT" },
        { status: "RUNNING", kind: "AGENT" },
        { status: "DONE", kind: "VERIFY" },
        { status: "FAILED", kind: "VERIFY", error: "Source conflict unresolved" },
        { status: "PENDING", kind: "REDUCE" },
        { status: "BLOCKED", kind: "GATE" },
      ],
    });

    expect(summary).toMatchObject({
      total: 7,
      complete: 3,
      active: 1,
      failed: 1,
      blocked: 1,
      verificationTotal: 2,
      verificationComplete: 1,
      progressPercent: 43,
      failureReason: "Source conflict unresolved",
    });
  });

  it("keeps dispatch explicit and routes failed runs to recovery", () => {
    expect(graphDispatchState({
      loading: false,
      workOrder: { state: "READY" },
      run: null,
    })).toBe("READY");

    expect(graphDispatchState({
      loading: false,
      workOrder: { state: "BLOCKED" },
      run: { status: "FAILED", steps: [] },
    })).toBe("RECOVERY_REQUIRED");
  });

  it("identifies the evidence-bound gate as awaiting approval", () => {
    expect(graphDispatchState({
      loading: false,
      workOrder: { state: "IN_PROGRESS" },
      run: {
        status: "RUNNING",
        steps: [{ status: "RUNNING", kind: "GATE" }],
      },
    })).toBe("AWAITING_APPROVAL");
  });

  it("routes a frozen Research Brief through the server-owned claim graph", () => {
    expect(buildGraphDispatchTarget({
      cycleId: "cycle-1",
      workOrderId: "work-order-1",
      workOrderRevision: 3,
      researchSourceRunIds: ["run-b", "run-a", "run-a"],
    })).toEqual({
      kind: "CONTINUOUS_RESEARCH",
      cycleId: "cycle-1",
    });
  });

  it("explains the frozen evidence and independent verification boundary", () => {
    const presentation = graphDispatchPresentation({
      evidenceBound: true,
      observationCount: 2,
    });

    expect(presentation.title).toBe("Frozen-evidence claim graph");
    expect(presentation.buttonLabel).toBe("Dispatch evidence graph");
    expect(presentation.retryButtonLabel).toBe("Replace and retry safely");
    expect(presentation.readyDetail).toContain("2 frozen observations");
    expect(presentation.readyDetail).toContain("separate Evidence Reviewer Task");
    expect(presentation.boundaryDetail).toContain("Web discovery");
    expect(presentation.boundaryDetail).toContain("repository changes are excluded");
  });
});
