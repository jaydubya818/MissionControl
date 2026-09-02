import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  appendMissionPlanningExecutionReceipt,
  requireCompletedMissionPlanningReceipts,
  selectActiveMissionPlanningRun,
} from "../lib/missionPlanningRunState";

function receipt(phase: "RESEARCH" | "GENERATION", status = "COMPLETED") {
  return {
    phase,
    executionId: `run-1:${phase.toLowerCase()}`,
    status,
    harness: { adapter: "codex", version: "v1" },
    provenance: { requestSha256: `sha256:${"a".repeat(64)}` },
    promptIdentity: { version: `mission-planner-${phase.toLowerCase()}/v1`, digest: `sha256:${"b".repeat(64)}` },
    repository: {
      baselineCommit: "c".repeat(40),
      headCommit: "c".repeat(40),
      headChanged: false,
      changedFiles: [],
      scopeViolations: [],
    },
  };
}

describe("Mission planning run invariants", () => {
  it("returns the same active run for racing request snapshots, including QUEUED", () => {
    const queued = { _id: "run-1", status: "QUEUED", createdAt: 10 };
    const terminal = { _id: "run-0", status: "SUCCEEDED", createdAt: 1 };
    expect(selectActiveMissionPlanningRun([terminal, queued])).toBe(queued);
    expect(selectActiveMissionPlanningRun([terminal, queued])).toBe(queued);
  });

  it("creates exactly one run when two client requests are transactionally serialized", () => {
    const rows: Array<{ _id: string; status: string; createdAt: number }> = [];
    const request = () => {
      const active = selectActiveMissionPlanningRun(rows);
      if (active) return { run: active, created: false };
      const run = { _id: `run-${rows.length + 1}`, status: "QUEUED", createdAt: rows.length + 1 };
      rows.push(run);
      return { run, created: true };
    };

    const first = request();
    const second = request();
    expect([first.created, second.created]).toEqual([true, false]);
    expect(second.run).toBe(first.run);
    expect(rows).toHaveLength(1);
  });

  it("guards by Mission and nonterminal status before the server insert", () => {
    const source = readFileSync(path.resolve(process.cwd(), "convex/missionPlanning.ts"), "utf8");
    const activeGuard = source.indexOf('withIndex("by_mission_status"');
    const insert = source.indexOf('ctx.db.insert("missionPlanningRuns"');
    expect(activeGuard).toBeGreaterThan(-1);
    expect(insert).toBeGreaterThan(activeGuard);
    expect(source).toContain('duplicateReason: "ACTIVE_RUN_EXISTS"');
  });

  it("persists idempotent research and generation receipts across retries", () => {
    const research = receipt("RESEARCH");
    const generation = receipt("GENERATION");
    const afterResearch = appendMissionPlanningExecutionReceipt([], research, "c".repeat(40));
    expect(appendMissionPlanningExecutionReceipt(afterResearch, research, "c".repeat(40))).toEqual(afterResearch);
    const complete = appendMissionPlanningExecutionReceipt(afterResearch, generation, "c".repeat(40));
    expect(requireCompletedMissionPlanningReceipts(complete)).toEqual([research, generation]);
  });

  it("rejects completed receipts with SHA drift or missing phases", () => {
    const drifted = { ...receipt("GENERATION"), repository: { ...receipt("GENERATION").repository, headCommit: "d".repeat(40) } };
    expect(() => appendMissionPlanningExecutionReceipt([], drifted, "c".repeat(40))).toThrow(/read-only repository boundary/);
    expect(() => requireCompletedMissionPlanningReceipts([receipt("RESEARCH")])).toThrow(/generation execution receipt/);
  });
});
