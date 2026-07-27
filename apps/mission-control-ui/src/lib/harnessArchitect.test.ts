import { describe, expect, it } from "vitest";
import { ARCHITECT_FLOW, MERGE_GATES, EXECUTABLE_CONSTRAINTS } from "./harnessArchitect";

describe("harnessArchitect", () => {
  it("defines issue-to-ship flow", () => {
    expect(ARCHITECT_FLOW[0]?.id).toBe("triage");
    expect(ARCHITECT_FLOW.some((s) => s.id === "plan-loop")).toBe(true);
    expect(ARCHITECT_FLOW[ARCHITECT_FLOW.length - 1]?.id).toBe("notify");
  });

  it("has five merge gates", () => {
    expect(MERGE_GATES).toHaveLength(5);
  });

  it("lists executable AGENTS.md constraints", () => {
    expect(EXECUTABLE_CONSTRAINTS.some((c) => c.id === "ts-strict")).toBe(true);
  });
});
