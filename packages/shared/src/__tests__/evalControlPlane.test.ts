import { describe, expect, it } from "vitest";
import scenarioEvidence from "../../../../docs/testing/evidence/system-factory-e2e-v2/scenario-evidence.json";
import { canonicalDigest } from "../canonicalDigest.js";
import {
  applyEvalMutations,
  buildEvalBaseline,
  evaluateSuiteRun,
  evalSuiteDigest,
  publicEvalSuite,
  runSuiteNegativeControls,
  validateEvalBaseline,
  validateEvalReceipt,
  type EvalCaseOutcome,
  type EvalRunProvenance,
} from "../evalControlPlane.js";
import { MISSION_CONTROL_GOLDEN_SUITE_V1 } from "../missionControlGoldenSuite.js";

const suite = MISSION_CONTROL_GOLDEN_SUITE_V1;
const suiteDigest = evalSuiteDigest(suite);

function provenance(overrides: Partial<EvalRunProvenance> = {}): EvalRunProvenance {
  return {
    repository: "jaydubya818/MissionControl",
    revision: "0123456789abcdef0123456789abcdef01234567",
    adapter: {
      id: "system-factory-scenario-evidence",
      version: "1.0.0",
      digest: canonicalDigest("mission-control/eval-adapter", { id: "system-factory-scenario-evidence", version: "1.0.0" }),
    },
    runtime: { name: "node", version: "22.0.0" },
    datasetDigest: suiteDigest,
    resolvedConfigDigest: canonicalDigest("mission-control/eval-config", { suite: suiteDigest, seed: "mission-control-golden-v1" }),
    seed: "mission-control-golden-v1",
    artifacts: [{
      path: "docs/testing/evidence/system-factory-e2e-v2/scenario-evidence.json",
      digest: canonicalDigest("mission-control/eval-artifact", scenarioEvidence),
    }],
    ...overrides,
  };
}

function outcomes(actual: unknown = scenarioEvidence): EvalCaseOutcome[] {
  return suite.cases.map((testCase) => ({
    caseKey: testCase.key,
    status: "SCORED",
    actual,
    evidenceRefs: ["docs/testing/evidence/system-factory-e2e-v2/scenario-evidence.json"],
    durationMs: 1,
    costUsd: 0,
  }));
}

function receipt(actual: unknown = scenarioEvidence) {
  return evaluateSuiteRun({
    suite,
    runId: "eval-run-test",
    idempotencyKey: "eval-run-test",
    runStatus: "COMPLETED",
    provenance: provenance(),
    outcomes: outcomes(actual),
    startedAt: "2026-09-02T16:00:00.000Z",
    finishedAt: "2026-09-02T16:00:01.000Z",
  });
}

describe("Mission Control eval control plane", () => {
  it("scores the qualified golden path and reports the missing token accounting honestly", () => {
    const result = receipt();

    expect(result.verdict).toBe("WARN");
    expect(result.publishable).toBe(true);
    expect(result.releaseBlocking).toBe(false);
    expect(result.acceptanceAuthority).toBe(false);
    expect(result.metrics.blockingPassed).toBe(6);
    expect(result.metrics.blockingCases).toBe(6);
    expect(result.metrics.advisoryPassed).toBe(0);
    expect(result.results.find((row) => row.caseKey === "economics-attribution")).toMatchObject({
      verdict: "FAIL",
      failedAssertionCodes: ["tokens-recorded"],
      failureOrigin: "SYSTEM_UNDER_TEST",
    });
    expect(validateEvalReceipt(result)).toEqual([]);
  });

  it("keeps sealed assertions and negative controls out of the candidate-facing manifest", () => {
    const publicManifest = publicEvalSuite(suite);
    const serialized = JSON.stringify(publicManifest);

    expect(publicManifest.manifestDigest).toBe(suiteDigest);
    expect(serialized).not.toContain("sealedAssertions");
    expect(serialized).not.toContain("negativeControl");
    expect(serialized).not.toContain("human operator");
    expect(serialized).not.toContain("tokens-recorded");
  });

  it("proves every golden case can fail under its declared negative control", () => {
    const controls = runSuiteNegativeControls(suite, scenarioEvidence);

    expect(controls).toHaveLength(7);
    expect(controls.every((control) => control.passed)).toBe(true);
  });

  it("makes missing, duplicate, skipped, and errored outcomes invalid rather than passing", () => {
    const incomplete = outcomes().slice(1);
    incomplete.push({
      caseKey: suite.cases[1].key,
      status: "SCORED",
      actual: scenarioEvidence,
      evidenceRefs: ["duplicate"],
    });
    incomplete[1] = {
      caseKey: suite.cases[2].key,
      status: "ERROR",
      failureOrigin: "INFRASTRUCTURE",
      error: "provider unavailable",
      evidenceRefs: [],
    };

    const result = evaluateSuiteRun({
      suite,
      runId: "eval-run-invalid",
      idempotencyKey: "eval-run-invalid",
      runStatus: "COMPLETED",
      provenance: provenance(),
      outcomes: incomplete,
      startedAt: "2026-09-02T16:00:00.000Z",
      finishedAt: "2026-09-02T16:00:01.000Z",
    });

    expect(result.verdict).toBe("INVALID");
    expect(result.publishable).toBe(false);
    expect(result.metrics.skippedCases).toBeGreaterThan(0);
    expect(result.metrics.invalidCases).toBeGreaterThan(0);
    expect(result.accountingErrors).not.toEqual([]);
  });

  it("detects case and slice regressions against an immutable baseline", () => {
    const sourceReceipt = receipt();
    const baseline = buildEvalBaseline({
      baselineId: "mission-control-golden-v1-main",
      suite,
      receipt: sourceReceipt,
      createdAt: "2026-09-02T16:01:00.000Z",
    });
    const degraded = applyEvalMutations(scenarioEvidence, [{
      path: "authority.observabilityHasAcceptanceMutation",
      value: true,
    }]);
    const candidate = evaluateSuiteRun({
      suite,
      baseline,
      runId: "eval-run-regression",
      idempotencyKey: "eval-run-regression",
      runStatus: "COMPLETED",
      provenance: provenance(),
      outcomes: outcomes(degraded),
      startedAt: "2026-09-02T16:02:00.000Z",
      finishedAt: "2026-09-02T16:02:01.000Z",
    });

    expect(candidate.verdict).toBe("FAIL");
    expect(candidate.regressions).toEqual(expect.arrayContaining([
      expect.objectContaining({ scope: "CASE", key: "bounded-human-authority", blocking: true }),
      expect.objectContaining({ scope: "SLICE", key: "authority", blocking: true }),
    ]));
    expect(validateEvalBaseline(baseline)).toEqual([]);
    expect(validateEvalBaseline({ ...baseline, createdAt: "tampered" })).toContain("Baseline digest does not match its contents.");
  });

  it("refuses to publish receipts with incomplete provenance", () => {
    const result = evaluateSuiteRun({
      suite,
      runId: "eval-run-unpinned",
      idempotencyKey: "eval-run-unpinned",
      runStatus: "COMPLETED",
      provenance: provenance({ revision: "main" }),
      outcomes: outcomes(),
      startedAt: "2026-09-02T16:00:00.000Z",
      finishedAt: "2026-09-02T16:00:01.000Z",
    });

    expect(result.verdict).toBe("INVALID");
    expect(result.publishable).toBe(false);
    expect(result.accountingErrors).toContain("provenance: Revision must be a pinned Git commit.");
  });
});
