import { describe, expect, it } from "vitest";
import { buildTaskEventId } from "../lib/taskEvents";

describe("task event identity", () => {
  const baseArgs = {
    taskId: "task_123" as any,
    eventType: "TASK_TRANSITION" as const,
    actorType: "AGENT" as const,
    actorId: "agent_1",
    relatedId: "transition_1",
  };

  it("builds deterministic ids for identical inputs", () => {
    const first = buildTaskEventId(baseArgs);
    const second = buildTaskEventId(baseArgs);

    expect(first).toBe(second);
    expect(first.startsWith("te_")).toBe(true);
  });

  it("changes id when related entity changes", () => {
    const first = buildTaskEventId(baseArgs);
    const second = buildTaskEventId({
      ...baseArgs,
      relatedId: "transition_2",
    });

    expect(first).not.toBe(second);
  });

  it("changes id when lifecycle status changes", () => {
    const start = buildTaskEventId({
      ...baseArgs,
      eventType: "TOOL_CALL",
      beforeState: { status: "RUNNING" },
      afterState: { status: "RUNNING" },
    });
    const end = buildTaskEventId({
      ...baseArgs,
      eventType: "TOOL_CALL",
      beforeState: { status: "RUNNING" },
      afterState: { status: "SUCCESS" },
    });

    expect(start).not.toBe(end);
  });

  it("changes id when rule id changes", () => {
    const first = buildTaskEventId({
      ...baseArgs,
      eventType: "POLICY_DECISION",
      ruleId: "policy.budget.daily",
    });
    const second = buildTaskEventId({
      ...baseArgs,
      eventType: "POLICY_DECISION",
      ruleId: "policy.operator.paused",
    });

    expect(first).not.toBe(second);
  });
});
