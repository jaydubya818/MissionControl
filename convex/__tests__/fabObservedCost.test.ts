import { describe, expect, it } from "vitest";
import { fabObservedCost, type FabCostEvent } from "../lib/fabObservedCost";
import evidence from "../../docs/testing/evidence/live-retry-2026-10-04/producer-inspector.json";

const run = { _id: "run", executionManifestDigest: "manifest" };
const event: FabCostEvent = { _id: "event", workflowRunId: "run", actor: "service:worker",
  commandSummary: "model_completed", metadata: { executionManifestDigest: "manifest",
    harnessAdapter: "fab", harnessAdapterVersion: "v1", fabSessionId: "session", modelCall: 1,
    usage: { costUsd: 0.01 } } };

describe("Fab observed cost reconciliation", () => {
  it("recovers the failed Research Lab Attempt's eight persisted model costs", () => {
    const result = fabObservedCost(evidence.run, evidence.events as FabCostEvent[]);
    expect(result.observedUsd).toBeCloseTo(0.0102412, 10);
    expect(result.eventIds).toHaveLength(8);
  });
  it("does not double count duplicated model-call reports", () => {
    expect(fabObservedCost(run, [event, { ...event, _id: "duplicate" }])).toEqual({ observedUsd: 0.01, eventIds: ["event"] });
  });
  it("rejects conflicting amounts for the same model call", () => {
    expect(() => fabObservedCost(run, [event, { ...event, metadata: { ...event.metadata, usage: { costUsd: 1 } } }]))
      .toThrow("Conflicting");
  });
  it.each([null, -1, NaN, Infinity, undefined])("does not turn invalid or missing cost %s into measured spend", (costUsd) => {
    expect(fabObservedCost(run, [{ ...event, metadata: { ...event.metadata, usage: { costUsd } } }]).eventIds).toEqual([]);
  });
  it("ignores events outside the Attempt, manifest, service, or harness boundary", () => {
    const invalid = [{ ...event, workflowRunId: "other" }, { ...event, actor: "human" },
      { ...event, metadata: { ...event.metadata, executionManifestDigest: "other" } },
      { ...event, metadata: { ...event.metadata, harnessAdapter: "other" } }];
    expect(fabObservedCost(run, invalid).eventIds).toEqual([]);
  });
});
