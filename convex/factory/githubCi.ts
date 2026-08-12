import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import {
  buildChangeReviewLenses,
  buildMutationTestingReport,
  shouldPreserveManualPrLineage,
  type PrCheckSignals,
} from "../lib/harnessPrChecks";
import { ciBlockedHead, ciBlockCanRecover } from "../lib/prEvaluation";

export const applyCiIngest = internalMutation({
  args: {
    projectId: v.optional(v.id("projects")),
    workOrderId: v.optional(v.id("workOrders")),
    workflowRunId: v.optional(v.id("workflowRuns")),
    taskId: v.optional(v.id("tasks")),
    loopEngineeringCycleId: v.optional(v.id("loopEngineeringCycles")),
    lineageStatus: v.optional(v.union(
      v.literal("EXPLICIT_ARTIFACT"),
      v.literal("EXACT_BRANCH"),
      v.literal("UNCORRELATED")
    )),
    releaseDeploymentId: v.optional(v.id("deployments")),
    prUrl: v.string(),
    prNumber: v.optional(v.number()),
    repoFullName: v.string(),
    branch: v.optional(v.string()),
    title: v.optional(v.string()),
    prState: v.optional(v.union(v.literal("OPEN"), v.literal("CLOSED"), v.literal("MERGED"))),
    mergeActor: v.optional(v.string()),
    mergedAt: v.optional(v.number()),
    mergeCommitSha: v.optional(v.string()),
    ciStatus: v.optional(
      v.union(
        v.literal("PASS"),
        v.literal("FAIL"),
        v.literal("PENDING"),
        v.literal("UNKNOWN")
      )
    ),
    ciRunUrl: v.optional(v.string()),
    headSha: v.optional(v.string()),
    checkRuns: v.optional(
      v.array(
        v.object({
          name: v.string(),
          status: v.string(),
          conclusion: v.optional(v.union(v.string(), v.null())),
          html_url: v.optional(v.string()),
          details_url: v.optional(v.string()),
        })
      )
    ),
    signals: v.optional(
      v.object({
        testPassCount: v.optional(v.number()),
        testFailCount: v.optional(v.number()),
        diffLineCount: v.optional(v.number()),
        verificationPassRate: v.optional(v.number()),
        ciStatus: v.optional(
          v.union(
            v.literal("PASS"),
            v.literal("FAIL"),
            v.literal("PENDING"),
            v.literal("UNKNOWN")
          )
        ),
        securityFindingCount: v.optional(v.number()),
        qcFindings: v.optional(
          v.array(
            v.object({
              title: v.optional(v.string()),
              category: v.optional(v.string()),
              severity: v.string(),
            })
          )
        ),
      })
    ),
    sourceRef: v.optional(v.string()),
    sourceEventId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.releaseDeploymentId) {
      const deployment = await ctx.db.get(args.releaseDeploymentId);
      if (!deployment) throw new Error("Linked deployment not found");
      if (deployment.status !== "PENDING") {
        throw new Error("GitHub CI evidence can only be linked to a pending deployment");
      }
    }
    const signals: PrCheckSignals = {
      qcFindings: args.signals?.qcFindings ?? [],
      testPassCount: args.signals?.testPassCount,
      testFailCount: args.signals?.testFailCount,
      diffLineCount: args.signals?.diffLineCount,
      verificationPassRate: args.signals?.verificationPassRate,
      securityFindingCount: args.signals?.securityFindingCount,
    };

    const changeReviewLenses = buildChangeReviewLenses(signals);
    const mutationTesting = buildMutationTestingReport(signals);
    const now = Date.now();

    if (args.sourceEventId) {
      const duplicateEvent = await ctx.db.query("harnessPrChecks")
        .withIndex("by_source_event", (q) => q.eq("sourceEventId", args.sourceEventId))
        .first();
      if (duplicateEvent) return duplicateEvent._id;
    }
    const previousRows = await ctx.db.query("harnessPrChecks")
      .withIndex("by_pr_url", (q) => q.eq("prUrl", args.prUrl))
      .collect();
    previousRows.sort((a, b) => b.syncedAt - a.syncedAt);
    const previous = previousRows[0];
    const existing = args.headSha
      ? await ctx.db.query("harnessPrChecks")
          .withIndex("by_pr_head", (q) => q.eq("prUrl", args.prUrl).eq("headSha", args.headSha))
          .first()
      : previousRows.find((row) => !row.headSha);
    const priorEvaluation = existing?.previousEvaluationId
      ? await ctx.db.get(existing.previousEvaluationId)
      : previous && previous._id !== existing?._id
        ? previous
        : undefined;
    const releaseDeploymentId = args.releaseDeploymentId ?? existing?.releaseDeploymentId ?? previous?.releaseDeploymentId;

    const existingMetadata = existing?.metadata && typeof existing.metadata === "object"
      ? existing.metadata as Record<string, unknown>
      : {};
    const preserveManualLineage = shouldPreserveManualPrLineage(
      existingMetadata.lineageStatus,
      args.lineageStatus
    );
    const inheritPriorLineage = args.lineageStatus == null || preserveManualLineage;
    const lineageStatus = preserveManualLineage
      ? String(existingMetadata.lineageStatus)
      : args.lineageStatus ?? "LEGACY_UNVERIFIED";
    const doc = {
      projectId: args.projectId,
      workOrderId: args.workOrderId ?? (inheritPriorLineage ? existing?.workOrderId ?? previous?.workOrderId : undefined),
      workflowRunId: args.workflowRunId ?? (inheritPriorLineage ? existing?.workflowRunId ?? previous?.workflowRunId : undefined),
      taskId: args.taskId ?? (inheritPriorLineage ? existing?.taskId ?? previous?.taskId : undefined),
      loopEngineeringCycleId: args.loopEngineeringCycleId ?? (inheritPriorLineage ? existing?.loopEngineeringCycleId ?? previous?.loopEngineeringCycleId : undefined),
      previousEvaluationId: existing?.previousEvaluationId ?? (previous && previous._id !== existing?._id ? previous._id : undefined),
      releaseDeploymentId,
      prUrl: args.prUrl,
      prNumber: args.prNumber,
      repoFullName: args.repoFullName,
      branch: args.branch,
      title: args.title,
      prState: args.prState,
      mergeActor: args.mergeActor,
      mergedAt: args.mergedAt,
      mergeCommitSha: args.mergeCommitSha,
      ciStatus: args.ciStatus ?? "UNKNOWN",
      ciRunUrl: args.ciRunUrl,
      ciProvider: "github",
      source: "GITHUB" as const,
      sourceRef: args.sourceRef ?? args.headSha,
      sourceEventId: args.sourceEventId,
      headSha: args.headSha,
      changeReviewLenses,
      mutationTesting,
      syncedAt: now,
      createdAt: existing?.createdAt ?? now,
      metadata: {
        ...existingMetadata,
        lineageStatus,
        headSha: args.headSha,
        checkRuns: args.checkRuns,
        diffLineCount: args.signals?.diffLineCount,
      },
    };

    const id = existing
      ? existing._id
      : await ctx.db.insert("harnessPrChecks", doc);
    if (existing) {
      await ctx.db.patch(existing._id, doc);
    }
    const linkedWorkOrderId = doc.workOrderId;
    if (linkedWorkOrderId && doc.ciStatus === "FAIL") {
      const workOrder = await ctx.db.get(linkedWorkOrderId);
      if (workOrder && !["CANCELED", "SUPERSEDED"].includes(workOrder.state)) {
        await ctx.db.patch(linkedWorkOrderId, {
          state: "BLOCKED",
          blockingIssue: `Required CI failed for ${args.headSha ?? args.prUrl}`,
          requiredHumanAction: "Start one bounded correction Attempt on this WorkOrder after reviewing the failed checks.",
          updatedAt: now,
        });
      }
    }
    if (linkedWorkOrderId && doc.ciStatus === "PASS") {
      const workOrder = await ctx.db.get(linkedWorkOrderId);
      const blockedHeadSha = ciBlockedHead(workOrder?.blockingIssue);
      const blockedEvaluation = blockedHeadSha
        ? await ctx.db.query("harnessPrChecks")
            .withIndex("by_pr_head", (q) => q.eq("prUrl", args.prUrl).eq("headSha", blockedHeadSha))
            .first()
        : null;
      if (workOrder && ciBlockCanRecover({
        ciStatus: doc.ciStatus,
        blockingIssue: workOrder.blockingIssue,
        priorHeadSha: blockedEvaluation?.ciStatus === "FAIL" ? blockedEvaluation.headSha : undefined,
        headSha: doc.headSha,
      })) {
        await ctx.db.patch(linkedWorkOrderId, {
          state: "AWAITING_APPROVAL",
          blockingIssue: undefined,
          requiredHumanAction: "Review the passing replacement head and decide merge approval.",
          updatedAt: now,
        });
        await ctx.db.insert("workOrderEvents", {
          tenantId: workOrder.tenantId,
          projectId: workOrder.projectId,
          workOrderId: workOrder._id,
          eventType: "STATE_SYNCED",
          actorType: "SYSTEM",
          summary: `Passing CI on ${doc.headSha} cleared the prior-head CI block`,
          timestamp: now,
          metadata: {
            priorEvaluationId: blockedEvaluation?._id,
            evaluationId: id,
            priorHeadSha: blockedEvaluation?.headSha,
            headSha: doc.headSha,
          },
        });
      }
    }
    if (doc.projectId && doc.ciStatus === "FAIL") {
      await ctx.scheduler.runAfter(0, internal.factory.metaLoop.ingestSignal, {
        projectId: doc.projectId,
        kind: "EVAL_SCENARIO",
        signalClass: "CI_FAILURE",
        target: `${args.repoFullName}:${args.checkRuns?.filter((check) => check.conclusion === "failure").map((check) => check.name).sort().join(",") || "required-check"}`,
        title: `Prevent recurring CI failure in ${args.repoFullName}`,
        summary: `Required CI failed for ${args.prUrl} at head ${args.headSha ?? "unknown"}.`,
        sourceRef: args.sourceEventId ?? args.headSha ?? args.prUrl,
        sourceLinks: [args.prUrl, ...(args.ciRunUrl ? [args.ciRunUrl] : [])],
        confidence: 0.9,
        impact: "HIGH",
        payload: { prUrl: args.prUrl, headSha: args.headSha, workOrderId: linkedWorkOrderId },
      });
    }
    if (releaseDeploymentId) {
      await ctx.scheduler.runAfter(0, internal.governance.releaseGateAutomation.fromGithubCi, { harnessPrCheckId: id });
    }
    if (
      doc.prState === "MERGED"
      && doc.mergeCommitSha
      && doc.mergedAt
      && doc.workOrderId
      && doc.workflowRunId
    ) {
      await ctx.scheduler.runAfter(0, internal.factory.releases.ensureFromMergedPrInternal, {
        evaluationId: id,
      });
    }
    return id;
  },
});
