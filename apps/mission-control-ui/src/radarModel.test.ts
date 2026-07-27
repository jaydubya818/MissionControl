import { describe, expect, it } from "vitest";
import {
  blockedDueSoonTasks,
  buildRadarSummary,
  dueSoonTasks,
  relativeDueLabel,
} from "./radarModel";

const NOW = new Date("2026-07-25T12:00:00Z").getTime();

describe("radar model", () => {
  const tasks = [
    { _id: "t1", title: "Overdue open", status: "IN_PROGRESS", dueAt: NOW - 2 * 24 * 60 * 60 * 1000 },
    { _id: "t2", title: "Due today", status: "ASSIGNED", dueAt: NOW + 6 * 60 * 60 * 1000 },
    { _id: "t3", title: "Blocked soon", status: "BLOCKED", dueAt: NOW + 2 * 24 * 60 * 60 * 1000 },
    { _id: "t4", title: "Done overdue", status: "DONE", dueAt: NOW - 24 * 60 * 60 * 1000 },
    { _id: "t5", title: "Far future", status: "ASSIGNED", dueAt: NOW + 10 * 24 * 60 * 60 * 1000 },
  ];

  it("builds exception-first summary counts", () => {
    expect(
      buildRadarSummary(tasks, [
        { _id: "a1", title: "Warn", severity: "WARNING" },
        { _id: "a2", title: "Critical", severity: "CRITICAL" },
        { _id: "a3", title: "Error", severity: "ERROR" },
      ], NOW)
    ).toEqual({
      overdue: 1,
      dueNext24Hours: 1,
      blockedDueSoon: 1,
      criticalAlerts: 2,
    });
  });

  it("returns due-soon tasks sorted ascending", () => {
    expect(dueSoonTasks(tasks, NOW).map((task) => task._id)).toEqual(["t2", "t3"]);
  });

  it("filters blocked due-soon tasks", () => {
    expect(blockedDueSoonTasks(tasks, NOW).map((task) => task._id)).toEqual(["t3"]);
  });

  it("formats relative due labels", () => {
    expect(relativeDueLabel(NOW - 2 * 24 * 60 * 60 * 1000, NOW)).toBe("Overdue by 2 days");
    expect(relativeDueLabel(NOW + 6 * 60 * 60 * 1000, NOW)).toBe("Due within 6 hours");
    expect(relativeDueLabel(NOW + 2 * 24 * 60 * 60 * 1000, NOW)).toBe("Due in 2 days");
  });
});
