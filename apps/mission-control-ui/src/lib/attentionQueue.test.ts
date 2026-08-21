import { describe, expect, it } from "vitest";
import { buildAttentionQueue, type AttentionQueueInput } from "./attentionQueue";

function approval(id: string, riskLevel: "RED" | "YELLOW" = "YELLOW") {
  return {
    _id: id,
    _creationTime: 1,
    actionSummary: `approval ${id}`,
    riskLevel,
    justification: "needs a human",
  } as any;
}

function alert(id: string) {
  return { _id: id, _creationTime: 1, title: `alert ${id}`, description: "production is down" } as any;
}

function failedTask(id: string) {
  return { _id: id, _creationTime: 1, title: `failed ${id}` } as any;
}

function input(overrides: Partial<AttentionQueueInput> = {}): AttentionQueueInput {
  return {
    approvals: [],
    blockedTasks: [],
    needsApprovalTasks: [],
    failedTasks: [],
    alerts: [],
    openApproval: () => {},
    openTask: () => {},
    ...overrides,
  };
}

describe("attention queue", () => {
  it("does not let a backlog of warnings hide open alerts", () => {
    // Regression: items were appended strictly by category (approvals first,
    // alerts last) and then sliced to 12, so 12 YELLOW approvals pushed every
    // open alert and failed task off the queue entirely — during exactly the
    // incident the queue exists for.
    const queue = buildAttentionQueue(
      input({
        approvals: Array.from({ length: 12 }, (_, i) => approval(`a${i}`)),
        alerts: [alert("critical")],
        failedTasks: [failedTask("t1")],
        limit: 12,
      }),
    );
    const ids = queue.items.map((item) => item.id);
    expect(ids).toContain("alert-critical");
    expect(ids).toContain("failed-t1");
  });

  it("orders error-tone rows ahead of warning-tone rows", () => {
    const queue = buildAttentionQueue(
      input({
        approvals: [approval("warn"), approval("red", "RED")],
        alerts: [alert("a1")],
      }),
    );
    expect(queue.items.map((item) => item.badgeTone)).toEqual(["error", "error", "warning"]);
  });

  it("reports what it could not show instead of dropping it silently", () => {
    const queue = buildAttentionQueue(
      input({
        approvals: Array.from({ length: 30 }, (_, i) => approval(`a${i}`)),
        limit: 12,
      }),
    );
    expect(queue.items).toHaveLength(12);
    expect(queue.totalCount).toBe(30);
    expect(queue.hiddenCount).toBe(18);
  });

  it("reports no overflow when everything fits", () => {
    const queue = buildAttentionQueue(input({ alerts: [alert("a1")], limit: 12 }));
    expect(queue.hiddenCount).toBe(0);
    expect(queue.totalCount).toBe(1);
  });
});
