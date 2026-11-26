import { describe, expect, it } from "vitest";
import { assertReplayManifest, compareReplayCases, replayAttemptSetDigest, replayDigest } from "../lib/factoryReplay";
import { loadReplayReview } from "../lib/factoryReplayPersistence";
import { getCurrentVerificationRoutingOutcome } from "../lib/currentVerification";
import { context, installCase, installEvidence, installManifest, NOW, type Fixture } from "./fixtures/factoryReplay.fixture";

function fixture(count = 1) {
  const f = context({ count });
  const manifest = installManifest(f);
  const { binding, wo } = installCase(f);
  const evidence = installEvidence(f, binding);
  return { ...f, manifest, binding, wo, ...evidence };
}

async function review(f: Fixture) {
  return (await loadReplayReview(f.ctx, "experiment" as any, NOW))!;
}

function refreshReport(f: ReturnType<typeof fixture>) {
  f.report.attemptSetDigest = replayAttemptSetDigest(f.tables.workflowRuns.filter(row => row.workOrderId === f.wo._id) as any);
}

describe("frozen replay projection from controlled canonical records", () => {
  it("uses the real canonical prepublication evaluator and retains exact per-case identity", async () => {
    const f = fixture();
    const current = await getCurrentVerificationRoutingOutcome(f.ctx, f.wo, NOW, "PREPUBLICATION");
    expect(current, current.reasons.join(" ")).toMatchObject({ eligible: true, current: true, verifiedOutcome: "SUCCESS" });
    const result = await review(f);
    expect(result.cases[0]).toMatchObject({ state: "VERIFIED", comparable: true, sourceAttemptId: f.source._id,
      verificationRunId: f.result._id, receiptId: f.receipt._id, subjectDigest: f.source.verificationSubject.digest,
      costUsd: 2, totalAttemptDurationMs: 700, ownerInterventions: 0, assistantOutsideFactoryInterventions: 0,
      interventionSource: "OPERATOR_REPORTED", scores: { evaluator: 1 } });
    expect(result.cases[1]).toMatchObject({ state: "UNBOUND", comparable: false });
    expect(result.comparison).toMatchObject({ denominator: 1, matchedPairs: 0, complete: false, sampleSufficient: false,
      statisticallySignificant: false, autoPromote: false });
    expect(result.comparison.recommendation.recommendation).toBe("HOLD_RECOMMENDED");
    expect(result.unattendedCompletionEstablished).toBe(false);
    expect(result.releaseAcceptanceEstablished).toBe(false);
  });

  it.each([
    ["changed contract", (f: ReturnType<typeof fixture>) => { f.wo.desiredOutcome = "Changed"; }],
    ["changed revision", (f: ReturnType<typeof fixture>) => { f.wo.currentRevisionNumber++; }],
    ["wrong factory", (f: ReturnType<typeof fixture>) => { f.source.factoryDefinitionVersionId = "version-candidate"; }],
    ["wrong configuration", (f: ReturnType<typeof fixture>) => { f.source.factoryConfigurationDigest = "different"; }],
    ["wrong source revision", (f: ReturnType<typeof fixture>) => { f.source.executionBaseSha = "d".repeat(40); }],
    ["wrong replay linkage", (f: ReturnType<typeof fixture>) => { f.source.context.factoryReplay.caseId = "other"; }],
    ["wrong candidate", (f: ReturnType<typeof fixture>) => { f.source.headSha = "d".repeat(40); }],
    ["tampered subject", (f: ReturnType<typeof fixture>) => { f.source.verificationSubject.digest = "tampered"; }],
    ["same producer", (f: ReturnType<typeof fixture>) => { f.verifier.executorInvocationId = f.source.executorInvocationId; }],
    ["synthetic envelope", (f: ReturnType<typeof fixture>) => { f.envelope.provenance = "SYNTHETIC"; }],
    ["cross-project envelope", (f: ReturnType<typeof fixture>) => { f.envelope.projectId = "other-project"; }],
    ["wrong evidence source", (f: ReturnType<typeof fixture>) => { f.envelope.sourceAttemptId = "other-source"; }],
    ["wrong evidence plan", (f: ReturnType<typeof fixture>) => { f.envelope.verificationPlanDigest = "other-plan"; }],
    ["fixture authority marker", (f: ReturnType<typeof fixture>) => { (f.envelope as any).metadata = { evidenceOrigin: "CONTROL_FIXTURE" }; }],
    ["wrapped producer fixture marker", (f: ReturnType<typeof fixture>) => { (f.envelope as any).metadata = { verifierMetadata: { fixture: true } }; }],
    ["offline invocation", (f: ReturnType<typeof fixture>) => { f.source.executionManifest.version = "factory-execution-manifest/v4"; f.source.executionManifestDigest = replayDigest(f.source.executionManifest); }],
    ["unknown manifest schema", (f: ReturnType<typeof fixture>) => { f.source.executionManifest.version = "unknown"; f.source.executionManifestDigest = replayDigest(f.source.executionManifest); }],
  ])("refuses %s as a qualified result", async (_label, change) => {
    const f = fixture(); change(f);
    const result = (await review(f)).cases[0];
    expect(result.state).not.toBe("VERIFIED");
    expect(result.comparable).toBe(false);
  });

  it("rejects the complete view when a bound WorkOrder is outside the manifest project", async () => {
    const f = fixture(); f.wo.projectId = "other-project";
    await expect(review(f)).rejects.toThrow(/unavailable|unauthorized/);
  });

  it.each([
    ["expired receipt", (f: ReturnType<typeof fixture>) => { f.receipt.validUntil = NOW; }],
    ["invalidated receipt", (f: ReturnType<typeof fixture>) => { (f.receipt as any).invalidatedAt = NOW - 1; }],
    ["wrong decision digest", (f: ReturnType<typeof fixture>) => { f.receipt.decisionInputDigest = `sha256:${"0".repeat(64)}`; }],
    ["incomplete evidence set", (f: ReturnType<typeof fixture>) => { f.receipt.evidenceEnvelopeIds.push("missing"); }],
    ["failed mandatory check", (f: ReturnType<typeof fixture>) => { f.receipt.checks[0].status = "FAIL"; }],
    ["newer failed verifier", (f: ReturnType<typeof fixture>) => { f.tables.workflowRuns.push({ ...f.verifier, _id: "newer-verifier", status: "FAILED", startedAt: NOW - 10 }); }],
    ["newer running verifier", (f: ReturnType<typeof fixture>) => { f.tables.workflowRuns.push({ ...f.verifier, _id: "newer-verifier", status: "RUNNING", startedAt: NOW - 10 }); }],
  ])("rechecks currentness for %s rather than reusing an older pass", async (_label, change) => {
    const f = fixture();
    expect((await review(f)).cases[0].comparable).toBe(true);
    change(f);
    const result = (await review(f)).cases[0];
    expect(result.comparable).toBe(false);
    expect(result.state).not.toBe("VERIFIED");
  });

  it.each([
    ["changed evaluator definition", (f: ReturnType<typeof fixture>) => { f.tables.evalDefinitions[0].configuration.rubric = "Changed after freezing"; }],
    ["wrong evaluator version", (f: ReturnType<typeof fixture>) => { f.evaluation.evaluator.version = "v2"; }],
    ["wrong score type", (f: ReturnType<typeof fixture>) => { f.evaluation.scoreType = "BOOLEAN"; f.evaluation.value = true as any; }],
    ["wrong experiment", (f: ReturnType<typeof fixture>) => { (f.evaluation as any).experimentId = "other-experiment"; }],
    ["wrong variant", (f: ReturnType<typeof fixture>) => { (f.evaluation as any).experimentVariantId = "variant-candidate"; }],
    ["wrong evaluator id", (f: ReturnType<typeof fixture>) => { f.evaluation.evalDefinitionId = "other"; }],
    ["wrong Attempt", (f: ReturnType<typeof fixture>) => { f.evaluation.workflowRunId = f.verifier._id; }],
    ["cross-project score", (f: ReturnType<typeof fixture>) => { f.evaluation.projectId = "other-project"; }],
    ["stale score", (f: ReturnType<typeof fixture>) => { f.evaluation.createdAt = f.source.startedAt - 1; }],
    ["fixture judge", (f: ReturnType<typeof fixture>) => { (f.evaluation.evaluator as any).model = "fixture-judge"; }],
    ["nonfinite score", (f: ReturnType<typeof fixture>) => { f.evaluation.value = NaN; }],
    ["wrong observation", (f: ReturnType<typeof fixture>) => { (f.evaluation as any).observationId = "observation"; (f.evaluation as any).traceId = "trace";
      f.tables.traceObservations = [{ _id: "observation", traceId: "other-trace", projectId: "project" }]; }],
  ])("holds unmatched %s even when candidate verification passes", async (_label, change) => {
    const f = fixture(); change(f);
    const result = (await review(f)).cases[0];
    expect(result).toMatchObject({ state: "VERIFIED", comparable: false, scores: {} });
    expect(result.reasons).toContain("EVALUATOR_EVIDENCE_MISSING_OR_INVALID:evaluator");
  });

  it("retains failed Attempts, measured spend, unknown cost, and separate intervention attribution", async () => {
    const f = fixture();
    const failed = { ...structuredClone(f.source), _id: "failed-before-success", status: "FAILED", startedAt: NOW - 2000,
      completedAt: NOW - 1500, candidateReadyAt: NOW - 1500, verificationSubject: undefined, executorInvocationId: "failed-invocation",
      executionCostAuthorization: { actualCost: { status: "UNAVAILABLE" } }, humanInterventions: 1 };
    f.tables.workflowRuns.unshift(failed);
    f.report.ownerCount = 1; f.report.assistantOutsideFactoryCount = 3; refreshReport(f);
    let result = (await review(f)).cases[0];
    expect(result).toMatchObject({ state: "VERIFIED", implementationAttempts: 2, failedAttemptIds: [failed._id],
      costUsd: null, knownCostUsd: 2, unknownCostAttempts: [failed._id], ownerInterventions: 1,
      assistantOutsideFactoryInterventions: 3, totalAttemptDurationMs: 1200, comparable: false });
    failed.executionCostAuthorization.actualCost = { status: "MEASURED", usd: 0.5 } as any;
    refreshReport(f);
    result = (await review(f)).cases[0];
    expect(result).toMatchObject({ costUsd: 2.5, comparable: true, failedAttemptIds: [failed._id] });
  });

  it("does not reuse a report after attempt cost/intervention identity changes or undercount owner interventions", async () => {
    const f = fixture(); f.source.humanInterventions = 1;
    expect((await review(f)).cases[0]).toMatchObject({ ownerInterventions: null, assistantOutsideFactoryInterventions: null, comparable: false });
    refreshReport(f);
    expect((await review(f)).cases[0].ownerInterventions).toBeNull();
    f.report.ownerCount = 1;
    expect((await review(f)).cases[0]).toMatchObject({ ownerInterventions: 1, comparable: true });
  });

  it("shows external evaluator cost as unattributed rather than silently treating it as free", async () => {
    const f = context();
    Object.assign(f.tables.evalDefinitions[0], { evaluatorType: "EXTERNAL", configuration: { evaluatorVersion: "external/v2" } });
    installManifest(f); const b = installCase(f); const e = installEvidence(f, b.binding);
    e.evaluation.evaluator.type = "EXTERNAL"; e.evaluation.evaluator.version = "external/v2";
    const result = (await review(f)).cases[0];
    expect(result).toMatchObject({ state: "VERIFIED", scores: { evaluator: 1 }, costUsd: 2,
      costScope: "RETAINED_ATTEMPTS", unattributedEvaluatorCostIds: ["evaluator"], comparable: false });
    expect(result.reasons).toContain("EVALUATOR_PROVIDER_COST_UNATTRIBUTED");
  });

  it("preserves a failed source without inventing a candidate or treating absent costs as zero", async () => {
    const f = fixture(); f.source.status = "FAILED"; delete (f.source as any).verificationSubject;
    delete (f.source as any).executionCostAuthorization; refreshReport(f);
    const result = (await review(f)).cases[0];
    expect(result).toMatchObject({ state: "FAILED", failedAttemptIds: [f.source._id],
      comparable: false, costUsd: null, knownCostUsd: 1 });
    expect(result.candidateRevision).toBeUndefined();
  });

  it("compares canonically verified prepublication evidence with pending human review without granting release authority", async () => {
    const f = fixture(); f.result.verdict = "REQUIRES_HUMAN_REVIEW";
    f.receipt.verdict = "REQUIRES_HUMAN_REVIEW"; f.receipt.status = "PENDING";
    const result = await review(f);
    expect(result.cases[0]).toMatchObject({ state: "VERIFIED", humanReviewPending: true, comparable: true });
    expect(result.releaseAcceptanceEstablished).toBe(false);
  });

  it("counts every frozen case and rejects a case-level quality regression hidden by an average gain", async () => {
    const f = fixture(2);
    const baseline2 = installCase(f, "baseline", "item-1"); installEvidence(f, baseline2.binding, { score: 0.1 });
    const candidate1 = installCase(f, "candidate"); installEvidence(f, candidate1.binding, { score: 0.9, cost: 0.1 });
    let result = await review(f);
    expect(result.comparison).toMatchObject({ denominator: 2, matchedPairs: 1, complete: false, sampleSufficient: false });
    const candidate2 = installCase(f, "candidate", "item-1"); installEvidence(f, candidate2.binding, { score: 1, cost: 0.1 });
    result = await review(f);
    expect(result.comparison).toMatchObject({ denominator: 2, matchedPairs: 2, complete: true, sampleSufficient: true });
    expect(result.comparison.recommendation).toMatchObject({ recommendation: "REJECT_RECOMMENDED", autoPromote: false, statisticallySignificant: false });
    expect(result.comparison.recommendation.regressions).toContain("case evaluator:item-0:evaluator");
  });

  it("holds below the explicit pair threshold and detects outside-assistant regressions", async () => {
    const f = fixture(2); const c = installCase(f, "candidate"); installEvidence(f, c.binding, { cost: 0.1 });
    const incomplete = await review(f);
    expect(incomplete.comparison.recommendation.recommendation).toBe("HOLD_RECOMMENDED");
    expect(incomplete.comparison.recommendation.comparisonWarnings).toContain("Matched pairs are below the declared minimum.");
    const f2 = fixture(); const c2 = installCase(f2, "candidate"); installEvidence(f2, c2.binding, { cost: 0.1, assistant: 1 });
    expect((await review(f2)).comparison.recommendation.regressions).toContain("assistant interventions outside the factory");
  });

  it("cannot promote a verified-to-failed case when its failure lacks comparable evaluator evidence", async () => {
    const f = fixture(); const c = installCase(f, "candidate"); const e = installEvidence(f, c.binding, { cost: 0.1 });
    e.source.status = "FAILED"; delete (e.source as any).verificationSubject;
    const result = await review(f);
    expect(result.comparison.recommendation).toMatchObject({ recommendation: "REJECT_RECOMMENDED" });
    expect(result.comparison.recommendation.regressions).toContain("verified outcome:item-0");
  });

  it("rejects duplicate cases, mutable dataset contents, ambiguous/cross-project bindings, and partial reads", async () => {
    const f = fixture();
    const duplicate = structuredClone(f.manifest); duplicate.definition.cases.push(duplicate.definition.cases[0]);
    duplicate.digest = replayDigest(duplicate.definition);
    expect(() => assertReplayManifest(duplicate as any)).toThrow(/integrity/);
    const changed = structuredClone(f.manifest); changed.definition.datasetItems[0].input.prompt = "changed";
    changed.digest = replayDigest(changed.definition);
    expect(() => assertReplayManifest(changed as any)).toThrow(/integrity/);
    f.tables.factoryReplayCases.push({ ...f.binding, _id: "duplicate" });
    await expect(review(f)).rejects.toThrow(/ambiguous/);
    f.tables.factoryReplayCases.pop(); f.binding.projectId = "other-project";
    await expect(review(f)).rejects.toThrow(/ambiguous/);
    f.binding.projectId = "project";
    for (let i = 0; i < 201; i++) f.tables.evalScores.push({ ...f.evaluation, _id: `score-overflow-${i}` });
    await expect(review(f)).rejects.toThrow(/bounded read/);
  });
});
