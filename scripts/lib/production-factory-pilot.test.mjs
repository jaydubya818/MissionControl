import { describe, expect, it } from "vitest";
import {
  PILOT_SCHEMA,
  buildPilotSchedule,
  buildReliabilityScorecard,
  validatePilotDataset,
} from "./production-factory-pilot.mjs";

describe("Production Factory Pilot V1 evidence contract", () => {
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

  it("rejects missing repetitions, autonomy expansion, and fabricated zero cost", () => {
    const errors = validatePilotDataset({
      schemaVersion: PILOT_SCHEMA,
      baseline: { sha: "75981d8ae1bd49e235cc1478bac3d0f853fc717f", runtimeContract: 30 },
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
    ]));
  });
});
