import { describe, expect, it } from "vitest";
import { navCountForView } from "./navCounts";

describe("navCountForView", () => {
  const stats = {
    taskCount: 52,
    turns: 12,
    skillCount: 9,
    facts: 9,
    alertCount: 104,
    events: 3,
    traceFiles: 5,
  };

  it("returns task count for tasks nav", () => {
    expect(navCountForView("tasks", stats, 52, 0)).toBe(52);
  });

  it("returns execution count for execution nav", () => {
    expect(navCountForView("execution", stats, 52, 0)).toBe(12);
  });

  it("returns alert count for telemetry nav", () => {
    expect(navCountForView("telemetry", stats, 52, 0)).toBe(104);
  });

  it("returns approval count for audit nav", () => {
    expect(navCountForView("audit", stats, 52, 4)).toBe(4);
  });

  it("hides zero counts", () => {
    expect(navCountForView("tasks", stats, 0, 0)).toBeUndefined();
    expect(navCountForView("telemetry", { ...stats, alertCount: 0 }, 0, 0)).toBeUndefined();
  });

  it("returns undefined for unmapped views", () => {
    expect(navCountForView("home", stats, 52, 0)).toBeUndefined();
  });
});
