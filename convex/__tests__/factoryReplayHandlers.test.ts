import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";
import * as replay from "../factory/replay";
import * as learning from "../factory/learning";
import * as metaLoop from "../factory/metaLoop";
import * as observability from "../observability";
import { evaluateFactoryAction } from "../companyContext";
import { requireAuthorizedDeliveryRecord } from "../lib/deliveryAuthorization";
import { dispatchWorkOrder } from "../workOrders";
import { validateExecutionRoutingExperimentVariants } from "../lib/executionRouting";
import { replayAttemptSetDigest } from "../lib/factoryReplay";
import { context, handler, installCase, installEvidence, installManifest, NOW } from "./fixtures/factoryReplay.fixture";

// Only the admitted dispatch boundary is controlled. Auth, persistence,
// creation, replay guards, currentness, comparison and mutation handlers are real.
vi.mock("../workOrders", async importOriginal => ({ ...await importOriginal<typeof import("../workOrders")>(), dispatchWorkOrder: vi.fn() }));
vi.mock("../lib/executionRouting", async importOriginal => ({ ...await importOriginal<typeof import("../lib/executionRouting")>(),
  validateExecutionRoutingExperimentVariants: vi.fn() }));

beforeEach(() => {
  vi.spyOn(Date, "now").mockReturnValue(NOW);
  vi.mocked(validateExecutionRoutingExperimentVariants).mockReset().mockImplementation(async (ctx, args) =>
    Promise.all(args.factoryDefinitionVersionIds.map(async id => ({ factoryDefinitionVersionId: id,
      configurationDigest: (await ctx.db.get(id))!.configurationDigest, admittedAt: NOW }))) as any);
  vi.mocked(dispatchWorkOrder).mockReset().mockImplementation(async (ctx, args, options) => {
    const prior = await ctx.db.query("workOrderEvents").withIndex("by_idempotency", q => q.eq("idempotencyKey", `${args.idempotencyKey}:dispatched`)).first();
    if (prior) return { created: false, run: await ctx.db.get(prior.workflowRunId!), reason: "idempotent-replay" };
    const wo = (await ctx.db.get(args.workOrderId))!;
    const id = await ctx.db.insert("workflowRuns", { projectId: wo.projectId, workOrderId: wo._id, attemptPurpose: "IMPLEMENTATION",
      status: "PENDING", startedAt: NOW, factoryDefinitionVersionId: args.factoryDefinitionVersionId,
      factoryConfigurationDigest: (await ctx.db.get(args.factoryDefinitionVersionId!))!.configurationDigest,
      workOrderRevisionNumber: wo.currentRevisionNumber, executionBaseSha: wo.planningRepositorySha,
      context: options?.initialContext, metadata: { fixture: true } } as any);
    await ctx.db.insert("workOrderEvents", { workOrderId: wo._id, workflowRunId: id, idempotencyKey: `${args.idempotencyKey}:dispatched` } as any);
    return { created: true, run: (await ctx.db.get(id))!, reason: "controlled-dispatch-boundary" };
  });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

const freezeArgs = { experimentId: "experiment", minimumPairs: 1, maxAttemptsPerCase: 2 };
const caseArgs = { manifestId: "manifest", variantId: "variant-baseline", caseKey: "item-0" };

describe("authenticated frozen replay mutation flow", () => {
  it("freezes full data and evaluator definitions once, without deriving outcomes or dispatching", async () => {
    const f = context();
    const first = await f.invoke(replay.freeze, freezeArgs);
    const second = await f.invoke(replay.freeze, freezeArgs);
    expect(first.created).toBe(true); expect(second.created).toBe(false);
    expect(first.manifest).toEqual(second.manifest);
    expect(first.manifest.definition.datasetItems[0].input.prompt).toBe("frozen case 0");
    expect(first.manifest.definition.evaluators[0].definition.configuration.rubric).toContain("persists");
    f.tables.evalDatasetItems[0].input.prompt = "later edit";
    f.tables.evalDefinitions[0].configuration.rubric = "later rubric";
    expect(f.tables.factoryReplayManifests[0].definition.datasetItems[0].input.prompt).toBe("frozen case 0");
    expect(f.tables.factoryReplayManifests[0].definition.evaluators[0].definition.configuration.rubric).not.toBe("later rubric");
    expect(f.tables.activities).toHaveLength(1);
    expect(dispatchWorkOrder).not.toHaveBeenCalled();
    await expect(f.invoke(replay.freeze, { ...freezeArgs, maxAttemptsPerCase: 1 })).rejects.toThrow(/limits cannot/);
  });

  it.each([
    ["anonymous demo", { authenticated: false }], ["other project", { scopedProject: "other-project" }], ["viewer mutation", { role: "Viewer" }],
  ])("refuses %s without mutating data", async (_label, options) => {
    vi.stubEnv("MC_ALLOW_ANONYMOUS_COMPANY_CONTEXT", "1");
    const f = context(options);
    await expect(f.invoke(replay.freeze, freezeArgs)).rejects.toThrow(/authenticat|permit|unauthorized/i);
    expect(f.writes).toHaveLength(0);
  });

  it.each([
    ["changed dataset version", (f: ReturnType<typeof context>) => { f.tables.evalDatasets[0].version++; }],
    ["changed source contract", (f: ReturnType<typeof context>) => { f.tables.workOrders[0].desiredOutcome = "changed"; }],
    ["duplicate dataset case", (f: ReturnType<typeof context>) => { f.tables.evalDatasetItems.push(f.tables.evalDatasetItems[0]); }],
    ["cross-project dataset case", (f: ReturnType<typeof context>) => { f.tables.evalDatasetItems[0].projectId = "other-project"; }],
    ["duplicate evaluator", (f: ReturnType<typeof context>) => { f.tables.experiments[0].evalDefinitionIds.push("evaluator"); }],
    ["disabled evaluator", (f: ReturnType<typeof context>) => { f.tables.evalDefinitions[0].enabled = false; }],
    ["missing independent contract", (f: ReturnType<typeof context>) => { f.tables.workOrders[0].verificationContract.independence.required = false; }],
    ["mutable source revision", (f: ReturnType<typeof context>) => { f.tables.workOrders[0].planningRepositorySha = "main"; }],
    ["executor override", (f: ReturnType<typeof context>) => { f.tables.experimentVariants[0].executor = "bypass"; }],
  ])("refuses %s at freeze", async (_label, change) => {
    const f = context(); change(f);
    await expect(f.invoke(replay.freeze, freezeArgs)).rejects.toThrow();
    expect(f.tables.factoryReplayManifests).toBeUndefined();
    expect(f.writes).toHaveLength(0);
  });

  it.each([0, NaN, 1.5, 6])("refuses invalid maximum attempt count %s", async maxAttemptsPerCase => {
    const f = context(); await expect(f.invoke(replay.freeze, { ...freezeArgs, maxAttemptsPerCase })).rejects.toThrow(/attempt|threshold/);
  });

  it("prepares a fresh policy-required pending WorkOrder without copying Mission authority or approval", async () => {
    const f = context(); installManifest(f);
    f.tables.workOrders[0].missionId = "prior-mission";
    const binding = await f.invoke(replay.prepareCase, caseArgs);
    const wo = f.find(binding.workOrderId)!;
    expect(wo).toMatchObject({ state: "AWAITING_APPROVAL", approvalStatus: "PENDING", currentRevisionNumber: 1,
      planningRepositorySha: f.tables.workOrders[0].planningRepositorySha });
    expect(wo.missionId).toBeUndefined(); expect(f.tables.approvalDecisions).toBeUndefined();
    expect(wo.acceptanceCriteria[0].status).toBe("PENDING");
    expect(await f.invoke(replay.prepareCase, caseArgs)).toEqual(binding);
    expect(f.tables.workOrders).toHaveLength(2);
    expect(f.tables.factoryReplayCases).toHaveLength(1);
    await expect(f.invoke(replay.dispatchCase, { caseId: binding._id })).rejects.toThrow(/own current approval/);
    expect(dispatchWorkOrder).not.toHaveBeenCalled();
  });

  it("allows the canonical no-approval policy and dispatches without introducing an owner approval round", async () => {
    const f = context({ approvals: [] }); installManifest(f);
    const binding = await f.invoke(replay.prepareCase, caseArgs);
    expect(f.find(binding.workOrderId)).toMatchObject({ state: "READY", approvalStatus: "NOT_REQUIRED" });
    const result = await f.invoke(replay.dispatchCase, { caseId: binding._id });
    expect(result.created).toBe(true);
    expect(f.tables.approvalDecisions).toBeUndefined();
  });

  it.each(["PENDING", "REVOKED", "EXPIRED", "REJECTED"])("refuses an explicit %s decision even when policy otherwise requires none", async status => {
    const f = context({ approvals: [] }); installManifest(f); const { binding, wo } = installCase(f);
    f.tables.approvalDecisions = [{ _id: "explicit-decision", workOrderId: wo._id, approvalType: "EXPLICIT_REVIEW", status, createdAt: NOW }];
    await expect(f.invoke(replay.dispatchCase, { caseId: binding._id })).rejects.toThrow(/own current approval/);
    expect(dispatchWorkOrder).not.toHaveBeenCalled();
  });

  it.each(["contract", "revision", "approval"])("refuses %s changes after binding, before canonical dispatch", async kind => {
    const f = context(); installManifest(f); const { binding, wo } = installCase(f);
    if (kind === "contract") wo.desiredOutcome = "Changed";
    if (kind === "revision") wo.currentRevisionNumber++;
    if (kind === "approval") f.tables.approvalDecisions[0].status = "REVOKED";
    await expect(f.invoke(replay.dispatchCase, { caseId: binding._id })).rejects.toThrow(/changed|approval/);
    expect(dispatchWorkOrder).not.toHaveBeenCalled();
  });

  it("binds only fresh matching same-project WorkOrders and refuses one WorkOrder reused by two slots", async () => {
    const f = context(); installManifest(f); const { binding, wo } = installCase(f);
    f.tables.factoryReplayCases = [];
    await f.invoke(replay.bindCase, { ...caseArgs, workOrderId: wo._id });
    await expect(f.invoke(replay.bindCase, { ...caseArgs, variantId: "variant-candidate", workOrderId: wo._id })).rejects.toThrow(/fresh/);
    await expect(f.invoke(replay.bindCase, { ...caseArgs, workOrderId: "source-work" })).rejects.toThrow(/already bound/);
    const fresh = { ...structuredClone(wo), _id: "fresh" }; f.tables.workOrders.push(fresh);
    f.tables.workflowRuns = [{ _id: "past-run", workOrderId: fresh._id }];
    await expect(f.invoke(replay.bindCase, { ...caseArgs, variantId: "variant-candidate", workOrderId: fresh._id })).rejects.toThrow(/fresh/);
    f.tables.workflowRuns = []; f.find(fresh._id)!.projectId = "other-project";
    await expect(f.invoke(replay.bindCase, { ...caseArgs, variantId: "variant-candidate", workOrderId: fresh._id })).rejects.toThrow(/unauthorized/);
  });

  it("delegates exact runtime, authenticated actor and frozen linkage once, with stable canonical idempotency", async () => {
    const f = context(); installManifest(f); const { binding } = installCase(f);
    const args = { caseId: binding._id, executorHostId: "host", worktree: "/work/replay", branch: "mc/replay", taskId: "child-task",
      capabilityPermits: { myeve: { message: "permit", keyId: "key", signature: "sig" }, relay: { message: "permit", keyId: "key", signature: "sig" } } };
    const first = await f.invoke(replay.dispatchCase, args), second = await f.invoke(replay.dispatchCase, args);
    expect(first.created).toBe(true); expect(second.created).toBe(false); expect(second.run._id).toBe(first.run._id);
    expect(f.tables.workflowRuns).toHaveLength(1);
    const call = vi.mocked(dispatchWorkOrder).mock.calls[0];
    expect(call[0]).toBe(f.ctx);
    expect(call[1]).toMatchObject({ actorType: "HUMAN", actorId: "operator", factoryDefinitionVersionId: "version-baseline",
      idempotencyKey: `factory-replay:${binding._id}:initial`, executorHostId: "host", worktree: "/work/replay", branch: "mc/replay",
      taskId: "child-task",
      capabilityPermits: args.capabilityPermits });
    expect(call[2]).toMatchObject({ initialContext: { factoryReplay: { caseId: binding._id,
      manifestDigest: f.tables.factoryReplayManifests[0].digest, workloadDigest: f.tables.factoryReplayManifests[0].definition.cases[0].workloadDigest } } });
    expect(f.tables.experiments[0].status).toBe("RUNNING");
    expect(f.tables.activities.filter(row => row.action === "FACTORY_REPLAY_CASE_DISPATCHED")).toHaveLength(1);
  });

  it("reaches real canonical dispatch and cannot bypass its capability admission", async () => {
    const actual = await vi.importActual<typeof import("../workOrders")>("../workOrders");
    vi.mocked(dispatchWorkOrder).mockImplementationOnce(actual.dispatchWorkOrder);
    vi.stubEnv("MC_CAPABILITY_CONTROL_ENABLED", "true");
    vi.stubEnv("MC_CAPABILITY_ENVIRONMENT", "not-qualified");
    const f = context(); installManifest(f); const { binding } = installCase(f);
    await expect(f.invoke(replay.dispatchCase, { caseId: binding._id })).rejects.toThrow("CAPABILITY_INSTALLATION_UNQUALIFIED");
    expect(f.tables.workflowRuns).toBeUndefined();
  });

  it("rolls back dispatch if Guarded Auto selected a different Factory Version", async () => {
    const f = context(); installManifest(f); const { binding, wo } = installCase(f);
    vi.mocked(dispatchWorkOrder).mockImplementationOnce(async (ctx, args, options) => {
      const id = await ctx.db.insert("workflowRuns", { projectId: "project", workOrderId: wo._id,
        factoryDefinitionVersionId: "version-candidate", context: options?.initialContext } as any);
      return { created: true, run: await ctx.db.get(id) } as any;
    });
    await expect(f.invoke(replay.dispatchCase, { caseId: binding._id })).rejects.toThrow(/frozen replay identity/);
    expect(f.tables.workflowRuns).toBeUndefined();
    expect(f.tables.experiments[0].status).toBe("DRAFT");
  });

  it("retains failed attempts and permits exactly the same bounded retry on repeated submission", async () => {
    const f = context(); installManifest(f); const { binding } = installCase(f);
    const first = await f.invoke(replay.dispatchCase, { caseId: binding._id }); f.find(first.run._id)!.status = "FAILED";
    await expect(f.invoke(replay.dispatchCase, { caseId: binding._id, retryOfWorkflowRunId: first.run._id })).rejects.toThrow(/reason/);
    const args = { caseId: binding._id, retryOfWorkflowRunId: first.run._id, retryReason: "Repair worker startup and repeat" };
    const retry = await f.invoke(replay.dispatchCase, args);
    expect((await f.invoke(replay.dispatchCase, args)).run._id).toBe(retry.run._id);
    f.find(retry.run._id)!.status = "FAILED";
    await expect(f.invoke(replay.dispatchCase, { ...args, retryOfWorkflowRunId: retry.run._id })).rejects.toThrow(/budget/);
    expect(f.tables.workflowRuns).toHaveLength(2);
    expect(f.tables.workflowRuns.every(row => row.status === "FAILED")).toBe(true);
  });

  it("records immutable attributed reports for the exact quiescent attempt set", async () => {
    const f = context(); installManifest(f); const { binding } = installCase(f); const e = installEvidence(f, binding);
    f.tables.factoryReplayInterventionReports = []; e.source.humanInterventions = 1;
    const args = { caseId: binding._id, ownerCount: 1, assistantOutsideFactoryCount: 2, evidenceRefs: ["operator-session-1"] };
    const result = await f.invoke(replay.recordInterventions, args);
    expect(result.ownerCount).toBe(1);
    expect(await f.invoke(replay.recordInterventions, args)).toEqual(result);
    expect(f.tables.factoryReplayInterventionReports).toHaveLength(1);
    await expect(f.invoke(replay.recordInterventions, { ...args, ownerCount: 0 })).rejects.toThrow(/counts|observed|evidence/);
    await expect(f.invoke(replay.recordInterventions, { ...args, assistantOutsideFactoryCount: 3 })).rejects.toThrow(/immutable/);
    f.find(e.source._id)!.status = "RUNNING";
    await expect(f.invoke(replay.recordInterventions, args)).rejects.toThrow(/quiescent/);
  });

  it("rejects human aggregate and deterministic fixture overwrites of a frozen experiment", async () => {
    const f = context(); installManifest(f);
    await expect(f.invoke(observability.recordExperimentOutcome, { experimentId: "experiment", variantId: "variant-baseline",
      sampleSize: 1, successRate: 1, averageScore: 1, averageDurationMs: 1, averageCostUsd: 0 })).rejects.toThrow(/Frozen replay/);
    await expect(f.invoke(observability.completeDeterministicExperimentInternal, { experimentId: "experiment" })).rejects.toThrow(/frozen canonical replay/i);
  });

  it("consumes the actual duration evaluator producer's implementation version instead of confusing it with definition revision", async () => {
    const f = context();
    Object.assign(f.tables.evalDefinitions[0], { evaluatorType: "DETERMINISTIC", scoreType: "BOOLEAN", version: 7,
      configuration: { thresholdMs: 1000 } });
    const manifest = installManifest(f); const b = installCase(f); const e = installEvidence(f, b.binding);
    e.source.status = "COMPLETED";
    e.report.attemptSetDigest = replayAttemptSetDigest(f.tables.workflowRuns as any);
    f.tables.traces = [{ _id: "trace", projectId: "project", workflowRunId: e.source._id, status: "SUCCESS",
      durationMs: 700, externalTraceId: "trace-example" }];
    const score = await f.invoke(observability.runDurationEvaluator, { traceId: "trace", evalDefinitionId: "evaluator", thresholdMs: 1000 });
    expect(score.evaluator.version).toBe("duration-threshold/v1");
    expect(manifest.definition.evaluators[0].implementationVersion).toBe("duration-threshold/v1");
    expect(manifest.definition.evaluators[0].definition.version).toBe(7);
    const result = await handler(replay.getReview)(f.ctx, { experimentId: "experiment" });
    expect(result.cases[0]).toMatchObject({ state: "VERIFIED", comparable: true, scores: { evaluator: 1 },
      evaluatorScoreIds: [score._id] });
  });

  it("denies anonymous frozen replay review through the existing Learning projection", async () => {
    vi.stubEnv("MC_ALLOW_ANONYMOUS_COMPANY_CONTEXT", "1");
    const f = context({ authenticated: false }); installManifest(f);
    await expect(handler(learning.getExperimentReview)(f.ctx, { candidateId: "suggestion" })).rejects.toThrow(/Authenticated replay/);
  });

  it("reconciles idempotently from current evidence and Learning never trusts a stale completed aggregate", async () => {
    const f = context(); installManifest(f); const b = installCase(f); installEvidence(f, b.binding, { cost: 1 });
    const c = installCase(f, "candidate"); const e = installEvidence(f, c.binding, { cost: 0.1 });
    const result = await f.invoke(replay.reconcile, { manifestId: "manifest" });
    expect(result.review.comparison).toMatchObject({ complete: true, matchedPairs: 1 });
    expect(f.tables.experiments[0].status).toBe("COMPLETED");
    expect((await f.invoke(replay.reconcile, { manifestId: "manifest" })).changed).toBe(false);
    const initial = await handler(learning.getExperimentReview)(f.ctx, { candidateId: "suggestion" });
    expect(initial.variants[0]._id).toBe("variant-baseline");
    expect(initial.recommendation.recommendation).toBe("PROMOTION_RECOMMENDED");
    expect(initial.recommendation.autoPromote).toBe(false);
    e.receipt.validUntil = NOW;
    const stale = await handler(learning.getExperimentReview)(f.ctx, { candidateId: "suggestion" });
    expect(stale.recommendation.recommendation).toBe("HOLD_RECOMMENDED");
    expect(stale.replay.comparison.matchedPairs).toBe(0);
    expect(stale.experiment.status).toBe("COMPLETED");
  });

  it.each(["stale receipt", "regressed score", "missing scores"])("blocks governed promotion with %s even after stored completion", async scenario => {
    const f = context(); installManifest(f); const b = installCase(f); installEvidence(f, b.binding, { cost: 1 });
    const c = installCase(f, "candidate"); const e = installEvidence(f, c.binding, { cost: 0.1 });
    await f.invoke(replay.reconcile, { manifestId: "manifest" });
    Object.assign(f.tables.metaLoopSuggestions[0], { acceptanceAuthority: false, learningClusterId: "cluster", status: "ACCEPTED" });
    if (scenario === "stale receipt") e.receipt.validUntil = NOW;
    if (scenario === "regressed score") e.evaluation.value = 0.2;
    if (scenario === "missing scores") f.tables.evalScores = [];
    f.ctx.runQuery = async (ref: any, args: any) => {
      const name = getFunctionName(ref);
      if (name === "factory/metaLoop:get") return handler(metaLoop.get)(f.ctx, args);
      if (name === "companyContext:evaluateFactoryAction") return handler(evaluateFactoryAction)(f.ctx, args);
      if (name === "factory/learning:getExperimentReview") return handler(learning.getExperimentReview)(f.ctx, args);
      throw new Error(`Unexpected query after failed comparison: ${name}`);
    };
    f.ctx.runMutation = vi.fn(async () => { throw new Error("Unexpected governed mutation"); });
    await expect(handler(metaLoop.resolve)(f.ctx, { suggestionId: "suggestion", action: "ACCEPT" })).rejects.toThrow(/current complete matched comparison/);
    expect(f.ctx.runMutation).not.toHaveBeenCalled();
  });

  it("exposes scoped review to a viewer while denying writes", async () => {
    const f = context({ role: "Viewer" });
    f.tables.orgMembers = [{ _id: "member", operatorId: "operator", tenantId: "tenant", active: true,
      projectAccess: [{ projectId: "project" }] }];
    f.tables.workOrders[0].ownerMemberId = "member";
    installManifest(f);
    expect((await handler(replay.getReview)(f.ctx, { experimentId: "experiment" })).comparison.denominator).toBe(1);
    await expect(f.invoke(replay.reconcile, { manifestId: "manifest" })).rejects.toThrow(/permit|unauthorized/i);
  });
});

describe("canonical delivery visibility for frozen replay", () => {
  function restricted() {
    const f = context({ role: "Analyst" });
    f.tables.roles[0].permissions = ["factory.improve"];
    Object.assign(f.tables.workOrders[0], { owningTeamId: "private-team", ownerMemberId: "private-owner", constraints: ["Private source constraint"] });
    f.tables.evalDatasetItems[0].input.workOrder.constraints = ["Private source constraint"];
    return f;
  }

  it("refuses a source denied by the ordinary delivery-record guard before freezing", async () => {
    const f = restricted();
    await expect(requireAuthorizedDeliveryRecord(f.ctx, "project" as any, f.tables.workOrders[0])).rejects.toThrow(/unavailable|unauthorized/);
    await expect(f.invoke(replay.freeze, freezeArgs)).rejects.toThrow(/unavailable|unauthorized/);
    expect(f.tables.factoryReplayManifests).toBeUndefined();
    expect(f.writes).toHaveLength(0);
  });

  it.each([
    ["repeated freeze", replay.freeze, freezeArgs],
    ["direct review", replay.getReview, { experimentId: "experiment" }],
    ["Learning review", learning.getExperimentReview, { candidateId: "suggestion" }],
    ["prepare", replay.prepareCase, caseArgs],
    ["bind", replay.bindCase, { ...caseArgs, workOrderId: "work-baseline-item-0" }],
    ["dispatch", replay.dispatchCase, { caseId: "case-baseline-item-0" }],
    ["interventions", replay.recordInterventions, { caseId: "case-baseline-item-0", ownerCount: 0, assistantOutsideFactoryCount: 0, evidenceRefs: ["report"] }],
    ["reconcile", replay.reconcile, { manifestId: "manifest" }],
    ["batch", replay.getDispatchBatch, { manifestId: "manifest", cursor: 0, limit: 1 }],
  ])("refuses hidden frozen/source data through %s", async (_label, fn, args) => {
    const f = restricted(); installManifest(f); installCase(f);
    await expect(f.invoke(fn, args)).rejects.toThrow(/unavailable|unauthorized/);
    expect(f.writes).toHaveLength(0);
    expect(dispatchWorkOrder).not.toHaveBeenCalled();
  });

  it("rechecks the frozen ownership scope even after the current source moves into a visible scope", async () => {
    const f = restricted(); installManifest(f);
    f.tables.orgMembers = [{ _id: "member", operatorId: "operator", tenantId: "tenant", active: true,
      projectAccess: [{ projectId: "project" }] }];
    f.tables.workOrders[0].ownerMemberId = "member";
    await expect(requireAuthorizedDeliveryRecord(f.ctx, "project" as any, f.tables.workOrders[0])).resolves.toBeDefined();
    await expect(handler(replay.getReview)(f.ctx, { experimentId: "experiment" })).rejects.toThrow(/unavailable|unauthorized/);
  });

  it("refuses the entire set when a bound WorkOrder becomes hidden rather than returning a filtered denominator", async () => {
    const f = context({ role: "Analyst", count: 2 }); f.tables.roles[0].permissions = ["factory.improve"];
    f.tables.orgMembers = [{ _id: "member", operatorId: "operator", tenantId: "tenant", active: true,
      projectAccess: [{ projectId: "project" }] }];
    f.tables.workOrders[0].ownerMemberId = "member";
    installManifest(f); const b = installCase(f);
    expect((await handler(replay.getReview)(f.ctx, { experimentId: "experiment" })).comparison.denominator).toBe(2);
    b.wo.ownerMemberId = "private-owner"; b.wo.owningTeamId = "private-team";
    await expect(handler(replay.getReview)(f.ctx, { experimentId: "experiment" })).rejects.toThrow(/unavailable|unauthorized/);
    await expect(f.invoke(replay.freeze, freezeArgs)).rejects.toThrow(/unavailable|unauthorized/);
    expect(f.tables.factoryReplayManifests[0].definition.cases).toHaveLength(2);
  });
});

describe("bounded authenticated replay batch runner", () => {
  function runnerFixture() {
    const f = context({ count: 2 }); installManifest(f);
    f.ctx.runQuery = async (ref: any, args: any) => {
      expect(getFunctionName(ref)).toBe("factory/replay:getDispatchBatch");
      return handler(replay.getDispatchBatch)(f.ctx, args);
    };
    f.ctx.runMutation = async (ref: any, args: any) => {
      expect(getFunctionName(ref)).toBe("factory/replay:dispatchCase");
      return f.invoke(replay.dispatchCase, args);
    };
    return f;
  }

  it("returns per-case dispatch/blocked counts, stable continuation, and idempotent repeated batches", async () => {
    const f = runnerFixture(); const b = installCase(f); const c = installCase(f, "candidate");
    f.tables.approvalDecisions.find(row => row.workOrderId === c.wo._id)!.status = "PENDING";
    const first = await handler(replay.dispatchPending)(f.ctx, { manifestId: "manifest", limit: 2,
      runtimeBindings: [{ caseId: b.binding._id, executorHostId: "host", worktree: "/work/baseline" }] });
    expect(first).toMatchObject({ dispatched: 1, alreadyDispatched: 0, blocked: 1, nextCursor: 2, totalSlots: 4, liveReplayQualified: false });
    expect(first.results[1].reason).toContain("approval");
    const repeated = await handler(replay.dispatchPending)(f.ctx, { manifestId: "manifest", limit: 2 });
    expect(repeated).toMatchObject({ dispatched: 0, alreadyDispatched: 1, blocked: 1, nextCursor: 2 });
    const last = await handler(replay.dispatchPending)(f.ctx, { manifestId: "manifest", limit: 2, cursor: 2 });
    expect(last).toMatchObject({ dispatched: 0, blocked: 2, nextCursor: null });
    expect(last.results.every((item: any) => item.reason === "UNBOUND")).toBe(true);
    expect(f.tables.workflowRuns).toHaveLength(1);
  });

  it("never auto-retries a failed case and leaves the failure visible", async () => {
    const f = runnerFixture(); const b = installCase(f); const e = installEvidence(f, b.binding); e.source.status = "FAILED";
    const result = await handler(replay.dispatchPending)(f.ctx, { manifestId: "manifest", limit: 1 });
    expect(result.results[0]).toMatchObject({ status: "BLOCKED", reason: "REQUIRES_EXPLICIT_RETRY" });
    expect(dispatchWorkOrder).not.toHaveBeenCalled();
  });

  it("revalidates a WorkOrder changed between the batch query and dispatch transaction", async () => {
    const f = runnerFixture(); const b = installCase(f);
    const runQuery = f.ctx.runQuery;
    f.ctx.runQuery = async (...args: any[]) => { const batch = await runQuery(...args); b.wo.desiredOutcome = "Raced mutation"; return batch; };
    const result = await handler(replay.dispatchPending)(f.ctx, { manifestId: "manifest", limit: 1 });
    expect(result).toMatchObject({ dispatched: 0, blocked: 1 });
    expect(result.results[0].reason).toContain("changed");
    expect(dispatchWorkOrder).not.toHaveBeenCalled();
  });

  it("rejects anonymous actions, oversized batches, and runtime bindings outside the selected scope", async () => {
    const f = runnerFixture();
    await expect(handler(replay.dispatchPending)(f.ctx, { manifestId: "manifest", limit: 11 })).rejects.toThrow(/one to ten/);
    await expect(handler(replay.dispatchPending)(f.ctx, { manifestId: "manifest", runtimeBindings: [{ caseId: "foreign-case" }] })).rejects.toThrow(/outside/);
    f.ctx.auth.getUserIdentity.mockResolvedValue(null);
    await expect(handler(replay.dispatchPending)(f.ctx, { manifestId: "manifest" })).rejects.toThrow(/Authenticated/);
  });
});
