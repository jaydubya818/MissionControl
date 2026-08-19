import { describe, expect, it } from "vitest";
import {
  PILOT_SCHEMA,
  PILOT_BASELINE_SHA,
  buildPilotSchedule,
  buildPilotExecutionPrompt,
  buildReliabilityScorecard,
  validatePilotDataset,
} from "./production-factory-pilot.mjs";

describe("Production Factory Pilot V2 evidence contract", () => {
  it("schedules five workload classes three times with a bounded remote subset", () => {
    const schedule = buildPilotSchedule();
    expect(schedule).toHaveLength(15);
    expect(new Set(schedule.map((item) => item.workload.class))).toHaveLength(5);
    expect(schedule.filter((item) => item.backend === "remote-sandbox")).toHaveLength(3);
  });

  it("keeps missing cleanup and cost telemetry from improving scorecard dimensions", () => {
    const scorecard = buildReliabilityScorecard([
      {
        eventualSuccess: true,
        firstPassSuccess: true,
        retries: 0,
        verification: { verdict: "VERIFIED" },
        cleanup: { observed: false, passed: null },
        context: { sufficient: true },
        evidenceCompleteness: 1,
        review: { correctionRequired: false },
        cost: { totalUsd: null },
        metrics: { totalCycleMs: 100 },
      },
    ]);
    expect(scorecard.dimensions.cleanupReliability.observedValue).toBeNull();
    expect(scorecard.dimensions.cleanupReliability.coverage).toBe(0);
    expect(scorecard.dimensions.costEfficiency.observedValue).toBeNull();
    expect(scorecard.dimensions.costEfficiency.coverage).toBe(0);
  });

  it("freezes the qualified remote result instruction and fresh recovery identity", () => {
    const prompt = buildPilotExecutionPrompt("Implement the fixture.", [
      { id: "A-1", title: "First criterion" },
      { id: "A-2", title: "Second criterion" },
    ], 2);
    expect(prompt).toContain('"schema":"factory-result/v1"');
    expect(prompt).toContain("COMPLETED, BLOCKED, or FAILED");
    expect(prompt).toContain("every listed acceptance criterion ID must appear exactly once");
    expect(prompt).toContain("A-1, A-2");
    expect(prompt).toContain("[A-2] Second criterion");
    expect(prompt).toContain("new recovery Attempt with fresh identity");
  });

  it("rejects missing repetitions, autonomy expansion, and fabricated zero cost", () => {
    const errors = validatePilotDataset({
      schemaVersion: PILOT_SCHEMA,
      baseline: { sha: PILOT_BASELINE_SHA, runtimeContract: 30 },
      executions: [{
        workloadClass: "BUG_FIX",
        attempts: [{}],
        lineage: { workOrderId: "wo-1", specDigest: "sha256:x" },
        cost: { observed: false, totalUsd: 0 },
      }],
      routingShadow: { guardedAutoEnabled: true },
      authority: { canonicalAcceptance: "other" },
    });
    expect(errors).toEqual(expect.arrayContaining([
      "At least 15 governed executions are required.",
      "Five materially different workload classes are required.",
      "Unknown cost cannot be represented as zero.",
      "Guarded Auto must remain disabled.",
      "Canonical acceptance authority is incorrect.",
      "At least three comparable Remote Sandbox executions must succeed.",
      "Every execution requires a valid terminal structured result.",
    ]));
  });

  it("requires terminal structured results and three successful remote samples", () => {
    const executions = Array.from({ length: 15 }, (_value, index) => ({
      workloadClass: ["BUG_FIX", "FEATURE", "REFACTOR", "SECURITY_POLICY", "DATA_SCHEMA_MIGRATION"][index % 5],
      backend: index < 3 ? "remote-sandbox" : "persistent-worker",
      eventualSuccess: true,
      terminalStructuredResult: true,
      attempts: [{}],
      lineage: { workOrderId: `wo-${index}`, specDigest: "sha256:x" },
      cost: { observed: false, totalUsd: null },
    }));
    expect(validatePilotDataset({
      schemaVersion: PILOT_SCHEMA,
      baseline: { sha: PILOT_BASELINE_SHA, runtimeContract: 30 },
      executions,
      routingShadow: { guardedAutoEnabled: false },
      authority: { canonicalAcceptance: "workOrders.accept" },
    })).toEqual([]);
  });
});
