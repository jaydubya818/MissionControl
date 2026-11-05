import { v } from "convex/values";
import { internalMutation } from "../lib/missionScopedFunctions";
import { internal } from "../_generated/api";
import {
  buildChangeReviewLenses,
  buildMutationTestingReport,
  shouldPreserveManualPrLineage,
  type PrCheckSignals,
} from "../lib/harnessPrChecks";
import {
  normalizeTrustedGithubPrProjection,
  shouldBlockForPrHeadMismatch,
  shouldClearRecoveredPrHeadBlock,
  verificationReceiptsInvalidatedByPrHead,
} from "../lib/githubCiIngest";
import { ciBlockedHead, ciBlockCanRecover } from "../lib/prEvaluation";
import {
  appendCurrentVerificationQualityGateDecision,
  getCurrentVerificationResult,
} from "../lib/currentVerification";

export const applyCiIngest = internalMutation({
  args: {
    projectId: v.optional(v.id("projects")),
    repositoryId: v.optional(v.id("workspaceRepositories")),
    installationId: v.optional(v.string()),
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
    provider: v.optional(v.literal("GITHUB")),
    providerRepositoryId: v.optional(v.string()),
    providerPullRequestId: v.optional(v.string()),
    draft: v.optional(v.boolean()),
    attestationExpiresAt: v.optional(v.number()),
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
    const trustedProjection = normalizeTrustedGithubPrProjection({
      repositoryId: args.repositoryId,
      installationId: args.installationId,
      provider: args.provider,
      providerRepositoryId: args.providerRepositoryId,
      providerPullRequestId: args.providerPullRequestId,
      draft: args.draft,
      attestationExpiresAt: args.attestationExpiresAt,
    });

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
      repositoryId: trustedProjection.repositoryId,
      installationId: trustedProjection.installationId,
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
      provider: trustedProjection.provider,
      providerRepositoryId: trustedProjection.providerRepositoryId,
      providerPullRequestId: trustedProjection.providerPullRequestId,
      draft: trustedProjection.draft,
      headSha: args.headSha,
      attestationExpiresAt: trustedProjection.attestationExpiresAt,
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
    let currentWorkOrder: any;
    let currentQualityGateDecisionId: any;
    let currentVerificationEligible: boolean | undefined;
    if (linkedWorkOrderId && doc.headSha && doc.provider === "GITHUB"
      && doc.repositoryId && doc.installationId && doc.providerRepositoryId
      && doc.providerPullRequestId && doc.attestationExpiresAt) {
      currentWorkOrder = await ctx.db.get(linkedWorkOrderId);
      const policyV2Enforced = currentWorkOrder?.verificationContract?.schemaVersion === 2
        && currentWorkOrder.verificationContract.enforcementMode === "ENFORCED";
      if (policyV2Enforced) {
        const current = await getCurrentVerificationResult(ctx, currentWorkOrder, now);
        currentVerificationEligible = current.eligible;
        const decision = await appendCurrentVerificationQualityGateDecision(
          ctx,
          currentWorkOrder,
          current,
          `github-pr-sync:${id}:${doc.headSha}:${now}`,
          now,
        );
        currentQualityGateDecisionId = decision?._id;
        if (shouldClearRecoveredPrHeadBlock({
          policyV2Enforced,
          currentVerificationEligible,
          blockingIssue: currentWorkOrder.blockingIssue,
        })) {
          await ctx.db.patch(linkedWorkOrderId, {
            state: "AWAITING_VERIFICATION",
            blockingIssue: undefined,
            requiredHumanAction: "Ready for explicit acceptance.",
            updatedAt: now,
          });
          await ctx.db.insert("workOrderEvents", {
            tenantId: currentWorkOrder.tenantId,
            projectId: currentWorkOrder.projectId,
            workOrderId: currentWorkOrder._id,
            eventType: "STATE_SYNCED",
            actorType: "SYSTEM",
            summary: `Exact-current verification recovered on pull-request head ${doc.headSha}`,
            timestamp: now,
            metadata: {
              evaluationId: id,
              headSha: doc.headSha,
              qualityGateDecisionId: currentQualityGateDecisionId,
              exactCurrentVerificationRecovered: true,
            },
          });
        }
      }
    }
    if (linkedWorkOrderId && doc.headSha && doc.provider === "GITHUB"
      && doc.repositoryId && doc.installationId && doc.providerRepositoryId
      && doc.providerPullRequestId && doc.attestationExpiresAt) {
      const workOrder = currentWorkOrder ?? await ctx.db.get(linkedWorkOrderId);
      const receipts = await ctx.db
        .query("verificationReceipts")
        .withIndex("by_work_order", (q) => q.eq("workOrderId", linkedWorkOrderId))
        .collect();
      const mismatchedReceipts = verificationReceiptsInvalidatedByPrHead(
        receipts,
        doc.headSha,
      );
      if (workOrder && !["CANCELED", "SUPERSEDED"].includes(workOrder.state)) {
        const policyV2Enforced = workOrder.verificationContract?.schemaVersion === 2
          && workOrder.verificationContract.enforcementMode === "ENFORCED";
        if (shouldBlockForPrHeadMismatch({
          policyV2Enforced,
          currentVerificationEligible,
          mismatchedReceiptCount: mismatchedReceipts.length,
        })) {
          const priorCandidateRevisions = [...new Set(
            mismatchedReceipts
              .map((receipt) => receipt.candidateRevision)
              .filter((candidate): candidate is string => Boolean(candidate))
          )];
          if (!policyV2Enforced) {
            for (const receipt of mismatchedReceipts) {
              await ctx.db.patch(receipt._id, {
                status: "STALE",
                invalidatedAt: now,
                invalidationReason: `pr-head-mismatch:${doc.headSha}`,
              });
            }
          }
          await ctx.db.patch(linkedWorkOrderId, {
            state: "BLOCKED",
            blockingIssue: `Verified candidate head does not match pull-request head ${doc.headSha}`,
            requiredHumanAction: "Create one bounded recovery Attempt and independently reverify the exact pull-request head before acceptance.",
            updatedAt: now,
          });
          await ctx.db.insert("workOrderEvents", {
            tenantId: workOrder.tenantId,
            projectId: workOrder.projectId,
            workOrderId: workOrder._id,
            workflowRunId: doc.workflowRunId,
            eventType: "VERIFICATION_STALE",
            actorType: "SYSTEM",
            summary: `Pull-request head ${doc.headSha} invalidated evidence for ${priorCandidateRevisions.join(", ")}`,
            timestamp: now,
            metadata: {
              evaluationId: id,
              prUrl: doc.prUrl,
              priorCandidateRevisions,
              observedHeadSha: doc.headSha,
              invalidatedReceiptIds: policyV2Enforced ? [] : mismatchedReceipts.map((receipt) => receipt._id),
              liveEligibilityInvalidatedReceiptIds: mismatchedReceipts.map((receipt) => receipt._id),
              staleQualityGateDecisionId: currentQualityGateDecisionId,
              historicalEvidencePreserved: policyV2Enforced,
            },
          });
        }
      }
    }
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
