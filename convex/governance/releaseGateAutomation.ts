import { v } from "convex/values";
import { internalMutation } from "../lib/missionScopedFunctions";
import { appendChangeRecord } from "../lib/armAudit";

type GateStatus = "PASS" | "WARN" | "FAIL";

async function recordAutomatedGate(
  ctx: any,
  input: {
    deploymentId: any;
    status: GateStatus;
    rationale: string;
    evidenceRefs: string[];
    automationKey: string;
    qcRunId?: any;
    contextEvalRunId?: any;
    harnessPrCheckId?: any;
  }
) {
  const existing = await ctx.db
    .query("releaseGateEvaluations")
    .withIndex("by_automation_key", (q: any) => q.eq("automationKey", input.automationKey))
    .unique();
  if (existing) return existing;

  const deployment = await ctx.db.get(input.deploymentId);
  if (!deployment) throw new Error("Linked deployment not found");

  const id = await ctx.db.insert("releaseGateEvaluations", {
    ...input,
    mode: "SHADOW",
    createdAt: Date.now(),
  });

  await appendChangeRecord(ctx.db as any, {
    tenantId: deployment.tenantId,
    templateId: deployment.templateId,
    versionId: deployment.targetVersionId,
    type: "DEPLOYMENT_CREATED",
    summary: `Automated shadow release gate ${input.status}: ${input.rationale}`,
    relatedTable: "releaseGateEvaluations",
    relatedId: id,
    payload: { automationKey: input.automationKey, source: input.qcRunId ? "QC" : "CONTEXT_EVAL" },
  });

  return await ctx.db.get(id);
}

export const fromQcRun = internalMutation({
  args: { qcRunId: v.id("qcRuns") },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.qcRunId);
    if (!run?.releaseDeploymentId || !["COMPLETED", "FAILED"].includes(run.status)) return null;

    const failed = run.status === "FAILED" || run.riskGrade === "RED" || run.gatePassed === false;
    const passed = run.status === "COMPLETED" && run.riskGrade === "GREEN" && run.gatePassed === true;
    const status: GateStatus = failed ? "FAIL" : passed ? "PASS" : "WARN";
    const rationale = failed
      ? `QC ${run.runId} ${run.status === "FAILED" ? "failed" : "reported release-blocking evidence"}.`
      : passed
        ? `QC ${run.runId} completed green with all configured gates passed.`
        : `QC ${run.runId} completed without sufficient green, passed-gate evidence.`;
    const evidenceRefs = [
      `qcRun:${run._id}`,
      ...(run.evidenceHash ? [`evidenceHash:${run.evidenceHash}`] : []),
      ...(run.commitSha ? [`commit:${run.commitSha}`] : []),
    ];

    return await recordAutomatedGate(ctx, {
      deploymentId: run.releaseDeploymentId,
      status,
      rationale,
      evidenceRefs,
      qcRunId: run._id,
      automationKey: `qc:${run._id}`,
    });
  },
});

export const fromContextEvalRun = internalMutation({
  args: { contextEvalRunId: v.id("contextEvalRuns") },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.contextEvalRunId);
    if (!run?.releaseDeploymentId || !["COMPLETED", "FAILED"].includes(run.status)) return null;

    const results = run.results ?? [];
    const allCriteriaPassed = results.length > 0 && results.every((result) => result.criteriaPassed === result.criteriaTotal);
    const nonRegressing = run.candidateScore !== undefined && run.baselineScore !== undefined && run.candidateScore >= run.baselineScore;
    const strongCandidate = run.candidateScore !== undefined && run.candidateScore >= 80;
    const passed = run.status === "COMPLETED" && allCriteriaPassed && nonRegressing && strongCandidate;
    const status: GateStatus = run.status === "FAILED" ? "FAIL" : passed ? "PASS" : "WARN";
    const rationale = run.status === "FAILED"
      ? `Context evaluation ${run._id} failed before producing complete evidence.`
      : passed
        ? `Context evaluation met all criteria with candidate score ${run.candidateScore} and no baseline regression.`
        : `Context evaluation completed but did not meet the shadow PASS threshold (all criteria, no regression, candidate score ≥80).`;

    return await recordAutomatedGate(ctx, {
      deploymentId: run.releaseDeploymentId,
      status,
      rationale,
      evidenceRefs: [
        `contextEvalRun:${run._id}`,
        ...(run.candidateScore !== undefined ? [`candidateScore:${run.candidateScore}`] : []),
        ...(run.baselineScore !== undefined ? [`baselineScore:${run.baselineScore}`] : []),
      ],
      contextEvalRunId: run._id,
      automationKey: `contextEval:${run._id}`,
    });
  },
});

export const fromGithubCi = internalMutation({
  args: { harnessPrCheckId: v.id("harnessPrChecks") },
  handler: async (ctx, args) => {
    const check = await ctx.db.get(args.harnessPrCheckId);
    if (!check?.releaseDeploymentId) return null;

    const status: GateStatus = check.ciStatus === "PASS" ? "PASS" : check.ciStatus === "FAIL" ? "FAIL" : "WARN";
    const rationale = check.ciStatus === "PASS"
      ? `GitHub CI passed for ${check.prUrl}.`
      : check.ciStatus === "FAIL"
        ? `GitHub CI reported failing checks for ${check.prUrl}.`
        : `GitHub CI is ${check.ciStatus ?? "UNKNOWN"}. Release evidence is incomplete.`;

    return await recordAutomatedGate(ctx, {
      deploymentId: check.releaseDeploymentId,
      status,
      rationale,
      evidenceRefs: [
        `pr:${check.prUrl}`,
        ...(check.ciRunUrl ? [`ciRun:${check.ciRunUrl}`] : []),
        ...(check.sourceRef ? [`commit:${check.sourceRef}`] : []),
      ],
      harnessPrCheckId: check._id,
      automationKey: `githubCi:${check._id}:${check.syncedAt}`,
    });
  },
});
