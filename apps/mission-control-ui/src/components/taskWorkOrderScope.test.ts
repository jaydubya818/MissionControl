import { describe, expect, it } from "vitest";
import { resolveTaskWorkOrderScope } from "./taskWorkOrderScope";

const WORK_ORDERS = [
  { _id: "wo-1", title: "Foundation" },
  { _id: "wo-2", title: "Dashboard" },
];

describe("task WorkOrder scope", () => {
  it("keeps the board unscoped when no WorkOrder was requested", () => {
    expect(resolveTaskWorkOrderScope(null, undefined)).toEqual({
      status: "UNSCOPED",
      workOrder: null,
    });
  });

  it("waits for the scoped WorkOrder inventory before showing cards", () => {
    expect(resolveTaskWorkOrderScope("wo-1", undefined)).toEqual({
      status: "LOADING",
      workOrder: null,
    });
  });

  it("resolves an exact WorkOrder match", () => {
    expect(resolveTaskWorkOrderScope("wo-2", WORK_ORDERS)).toEqual({
      status: "FOUND",
      workOrder: WORK_ORDERS[1],
    });
  });

  it("fails closed when the WorkOrder is unavailable in the workspace", () => {
    expect(resolveTaskWorkOrderScope("wo-other-workspace", WORK_ORDERS)).toEqual({
      status: "UNAVAILABLE",
      workOrder: null,
    });
  });
});
