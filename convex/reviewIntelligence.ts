import { v } from "convex/values";
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./lib/missionScopedFunctions";
import type { Doc, Id } from "./_generated/dataModel";
import { COMPANY_PERMISSIONS } from "./lib/companyAccess";
import {
  assertAuthorizedDeliveryRecord,
  requireAuthorizedDeliveryScope,
} from "./lib/deliveryAuthorization";
import { resolveFlag, type FlagRow } from "./lib/flags";
import { getCurrentVerificationResult } from "./lib/currentVerification";
import { loadFactoryAttemptReviewReadModel } from "./lib/factoryReviewReadModel";
import {
  boundedReviewText,
  normalizeReviewCorrection,
  REVIEW_INTELLIGENCE_FLAG,
  reviewIntelligenceDigest,
} from "./lib/reviewIntelligence";
import {
  decisionCandidateCategoryValidator,
  decisionCandidateStatusValidator,
  decisionCandidateTargetValidator,
  residualFindingValidator,
  reviewActionValidator,
  reviewCorrectionCategoryValidator,
} from "./lib/reviewIntelligenceValidators";

type ReviewCtx = QueryCtx | MutationCtx;

async function resolveHumanActor(ctx: ReviewCtx) {
  const identity = await ctx.auth.getUserIdentity();
  return identity
    ? { actorId: identity.subject, actorSource: "AUTHENTICATED" as const }
    : { actorId: "development:local-operator", actorSource: "DEVELOPMENT_FALLBACK" as const };
}

async function loadReviewSubject(
  ctx: ReviewCtx,
  workOrderId: Id<"workOrders">,
  workflowRunId: Id<"workflowRuns">,
) {
  const [workOrder, run] = await Promise.all([ctx.db.get(workOrderId), ctx.db.get(workflowRunId)]);
  if (!workOrder || !workOrder.projectId) throw new Error("WorkOrder is unavailable or unauthorized.");
  if (!run || run.workOrderId !== workOrder._id) throw new Error("Attempt does not belong to this WorkOrder.");
  return { workOrder, run };
}

async function requireReviewSubject(
  ctx: ReviewCtx,
  workOrderId: Id<"workOrders">,
  workflowRunId: Id<"workflowRuns">,
  permission?: (typeof COMPANY_PERMISSIONS)[keyof typeof COMPANY_PERMISSIONS],
) {
  const { workOrder, run } = await loadReviewSubject(ctx, workOrderId, workflowRunId);
  const access = await requireAuthorizedDeliveryScope(ctx, workOrder.projectId, permission);
  assertAuthorizedDeliveryRecord(access, workOrder);
  return { workOrder, run };
}

function assertExactCandidate(
  workOrder: Doc<"workOrders">,
  run: Doc<"workflowRuns">,
  expectedWorkOrderRevisionNumber: number,
  expectedCandidateRevision?: string,
) {
  const revision = workOrder.currentRevisionNumber ?? 1;
  if (expectedWorkOrderRevisionNumber !== revision || run.workOrderRevisionNumber !== revision) {
    throw new Error("Review subject is stale because the WorkOrder revision changed.");
  }
  if (expectedCandidateRevision && run.headSha !== expectedCandidateRevision) {
    throw new Error("Review subject is stale because the candidate revision changed.");
  }
}

function assertReviewRecordScope(
  record: { projectId: Id<"projects">; repositoryId?: Id<"workspaceRepositories">; workOrderId: Id<"workOrders">; workflowRunId: Id<"workflowRuns"> },
  workOrder: Doc<"workOrders">,
  run: Doc<"workflowRuns">,
) {
  if (record.projectId !== workOrder.projectId || record.workOrderId !== workOrder._id
    || record.workflowRunId !== run._id || (record.repositoryId && record.repositoryId !== workOrder.repositoryId)) {
    throw new Error("Review record is outside the exact WorkOrder workspace/repository/Attempt scope.");
  }
}

function reviewSubject(workOrder: Doc<"workOrders">, run: Doc<"workflowRuns">) {
  const value = {
    workOrderId: String(workOrder._id),
    workOrderRevisionNumber: workOrder.currentRevisionNumber ?? 1,
    missionSpecRevisionId: workOrder.missionSpecLineage?.missionSpecRevisionId
      ? String(workOrder.missionSpecLineage.missionSpecRevisionId)
      : null,
    missionSpecDigest: workOrder.missionSpecLineage?.missionSpecDigest ?? null,
    missionPlanId: workOrder.missionPlanId ? String(workOrder.missionPlanId) : null,
    qualityContractDigest: workOrder.qualityContractDigest ?? null,
    workflowRunId: String(run._id),
    candidateRevision: run.headSha ?? null,
    pullRequestUrl: run.pullRequestUrl ?? null,
  };
  return { value, digest: reviewIntelligenceDigest("review-package-subject/v1", value) };
}

export const getAttemptReviewContext = query({
  args: { workOrderId: v.id("workOrders"), workflowRunId: v.id("workflowRuns") },
  handler: async (ctx, args) => {
    const { workOrder, run } = await requireReviewSubject(ctx, args.workOrderId, args.workflowRunId);
    const [decisions, judgments, residualAnalyses] = await Promise.all([
      ctx.db.query("decisionCandidates").withIndex("by_attempt_created", (q) => q.eq("workflowRunId", run._id)).order("asc").collect(),
      ctx.db.query("reviewJudgments").withIndex("by_attempt_recorded", (q) => q.eq("workflowRunId", run._id)).order("asc").collect(),
      ctx.db.query("residualReviewAnalyses").withIndex("by_attempt_created", (q) => q.eq("workflowRunId", run._id)).order("asc").collect(),
    ]);
    for (const record of [...decisions, ...judgments, ...residualAnalyses]) {
      assertReviewRecordScope(record, workOrder, run);
    }
    const subject = reviewSubject(workOrder, run);
    return {
      reviewPackageDigest: subject.digest,
      subject: subject.value,
      decisions,
      judgments,
      residualAnalyses: residualAnalyses.map((analysis) => ({
        ...analysis,
        current: analysis.candidateRevision === run.headSha
          && analysis.workOrderRevisionNumber === (workOrder.currentRevisionNumber ?? 1),
      })),
      authority: {
        reviewPackage: "PROJECTION",
        decisions: "ADVISORY",
        residualAnalysis: "ADVISORY",
        acceptanceMutation: "workOrders.accept",
      },
    };
  },
});

export const createHumanDecisionCandidate = mutation({
  args: {
    workOrderId: v.id("workOrders"), workflowRunId: v.id("workflowRuns"),
    expectedWorkOrderRevisionNumber: v.number(), expectedCandidateRevision: v.optional(v.string()),
    category: decisionCandidateCategoryValidator, proposedTarget: decisionCandidateTargetValidator,
    summary: v.string(), rationale: v.optional(v.string()), sourceReference: v.string(),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    const { workOrder, run } = await requireReviewSubject(
      ctx, args.workOrderId, args.workflowRunId, COMPANY_PERMISSIONS.UPDATE_DELIVERY,
    );
    assertExactCandidate(workOrder, run, args.expectedWorkOrderRevisionNumber, args.expectedCandidateRevision);
    const actor = await resolveHumanActor(ctx);
    const existing = await ctx.db.query("decisionCandidates")
      .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", args.idempotencyKey)).first();
    if (existing) {
      if (existing.workOrderId !== workOrder._id || existing.workflowRunId !== run._id
        || existing.workOrderRevisionNumber !== args.expectedWorkOrderRevisionNumber
        || existing.candidateRevision !== run.headSha
        || existing.category !== args.category || existing.proposedTarget !== args.proposedTarget) {
        throw new Error("Idempotency key belongs to another exact Decision Candidate scope.");
      }
      return existing;
    }
    const summary = boundedReviewText(args.summary);
    const rationale = args.rationale ? boundedReviewText(args.rationale) : undefined;
    const sourceReference = boundedReviewText(args.sourceReference, 500);
    if (!summary || !sourceReference || args.idempotencyKey.length > 300) throw new Error("Bounded summary, source reference, and idempotency key are required.");
    const id = await ctx.db.insert("decisionCandidates", {
      tenantId: workOrder.tenantId, projectId: workOrder.projectId!, repositoryId: workOrder.repositoryId,
      missionId: workOrder.missionId, missionSpecRevisionId: workOrder.missionSpecLineage?.missionSpecRevisionId,
      missionPlanId: workOrder.missionPlanId, workOrderId: workOrder._id,
      workOrderRevisionNumber: workOrder.currentRevisionNumber ?? 1, workflowRunId: run._id,
      sourceSessionId: String(run._id), candidateRevision: run.headSha, pullRequestUrl: run.pullRequestUrl,
      category: args.category, proposedTarget: args.proposedTarget, origin: "HUMAN",
      originActorId: actor.actorId, capturedBy: actor.actorId, trustedSource: actor.actorSource === "AUTHENTICATED",
      summary, rationale, sourceReference,
      contentDigest: reviewIntelligenceDigest("decision-candidate/v1", {
        workOrderId: String(workOrder._id), workflowRunId: String(run._id), category: args.category,
        proposedTarget: args.proposedTarget, summary, rationale, sourceReference,
      }),
      status: "PROPOSED", idempotencyKey: args.idempotencyKey, createdAt: Date.now(), acceptanceAuthority: false,
    });
    return await ctx.db.get(id);
  },
});

export const decideCandidate = mutation({
  args: {
    decisionCandidateId: v.id("decisionCandidates"),
    status: decisionCandidateStatusValidator,
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const candidate = await ctx.db.get(args.decisionCandidateId);
    if (!candidate) throw new Error("Decision Candidate not found.");
    const { workOrder, run } = await requireReviewSubject(
      ctx, candidate.workOrderId, candidate.workflowRunId, COMPANY_PERMISSIONS.APPROVE_DELIVERY,
    );
    assertReviewRecordScope(candidate, workOrder, run);
    if (!["ACCEPTED_FOR_REVISION", "REJECTED", "SUPERSEDED"].includes(args.status)) {
      throw new Error("Decision Candidate review may only accept for a new revision, reject, or supersede.");
    }
    if (candidate.status !== "PROPOSED") throw new Error("Only a proposed Decision Candidate can be decided.");
    assertExactCandidate(workOrder, run, candidate.workOrderRevisionNumber, candidate.candidateRevision);
    const actor = await resolveHumanActor(ctx);
    await ctx.db.patch(candidate._id, {
      status: args.status, decisionReason: boundedReviewText(args.reason),
      decidedBy: actor.actorId, decidedAt: Date.now(),
    });
    return await ctx.db.get(candidate._id);
  },
});

export const linkGovernedRevision = mutation({
  args: {
    decisionCandidateId: v.id("decisionCandidates"),
    artifactType: v.union(v.literal("SPEC_REVISION"), v.literal("PLAN_REVISION"), v.literal("WORK_ORDER_REVISION"), v.literal("ADR_DOCUMENTATION")),
    artifactId: v.string(),
  },
  handler: async (ctx, args) => {
    const candidate = await ctx.db.get(args.decisionCandidateId);
    if (!candidate) throw new Error("Decision Candidate not found.");
    const { workOrder, run } = await requireReviewSubject(ctx, candidate.workOrderId, candidate.workflowRunId, COMPANY_PERMISSIONS.APPROVE_DELIVERY);
    assertReviewRecordScope(candidate, workOrder, run);
    if (candidate.status !== "ACCEPTED_FOR_REVISION") throw new Error("Candidate must be accepted for a separately governed revision first.");
    const acceptedAt = candidate.decidedAt ?? candidate.createdAt;
    let valid = args.artifactType === "ADR_DOCUMENTATION" && /^(docs\/|https:\/\/)/.test(args.artifactId);
    if (args.artifactType === "SPEC_REVISION") {
      const id = ctx.db.normalizeId("missionSpecRevisions", args.artifactId);
      const [record, original] = await Promise.all([
        id ? ctx.db.get(id) : null,
        candidate.missionSpecRevisionId ? ctx.db.get(candidate.missionSpecRevisionId) : null,
      ]);
      valid = Boolean(record && original && record.missionId === candidate.missionId
        && record.revisionNumber > original.revisionNumber && record.createdAt >= acceptedAt);
    } else if (args.artifactType === "PLAN_REVISION") {
      const id = ctx.db.normalizeId("missionPlans", args.artifactId);
      const [record, original] = await Promise.all([
        id ? ctx.db.get(id) : null,
        candidate.missionPlanId ? ctx.db.get(candidate.missionPlanId) : null,
      ]);
      valid = Boolean(record && original && record.missionId === candidate.missionId
        && record.revisionNumber > original.revisionNumber && record.createdAt >= acceptedAt);
    } else if (args.artifactType === "WORK_ORDER_REVISION") {
      const id = ctx.db.normalizeId("workOrderRevisions", args.artifactId);
      const record = id ? await ctx.db.get(id) : null;
      valid = Boolean(record && record.workOrderId === candidate.workOrderId
        && record.revisionNumber > candidate.workOrderRevisionNumber && record.createdAt >= acceptedAt);
    }
    if (!valid) throw new Error("Governed result does not match the Decision Candidate lineage.");
    await ctx.db.patch(candidate._id, {
      status: "RESOLVED", resultingArtifactType: args.artifactType,
      resultingArtifactId: boundedReviewText(args.artifactId, 500),
    });
    return await ctx.db.get(candidate._id);
  },
});

export const recordReviewJudgment = mutation({
  args: {
    workOrderId: v.id("workOrders"), workflowRunId: v.id("workflowRuns"),
    expectedWorkOrderRevisionNumber: v.number(), expectedCandidateRevision: v.optional(v.string()),
    reviewPackageDigest: v.string(), action: reviewActionValidator,
    correctionCategory: v.optional(reviewCorrectionCategoryValidator),
    summary: v.string(), sourceReference: v.optional(v.string()), idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    const requiresApproval = ["ACKNOWLEDGE_RESIDUAL_RISK", "APPROVE_REVIEW_PACKAGE"].includes(args.action);
    const { workOrder, run } = await requireReviewSubject(ctx, args.workOrderId, args.workflowRunId,
      requiresApproval ? COMPANY_PERMISSIONS.APPROVE_DELIVERY : COMPANY_PERMISSIONS.UPDATE_DELIVERY);
    assertExactCandidate(workOrder, run, args.expectedWorkOrderRevisionNumber, args.expectedCandidateRevision);
    const currentSubject = reviewSubject(workOrder, run);
    if (currentSubject.digest !== args.reviewPackageDigest) throw new Error("Review Package is stale or does not match this exact candidate.");
    if (args.action === "APPROVE_REVIEW_PACKAGE") {
      const currentPackage = await loadFactoryAttemptReviewReadModel(ctx, { run, workOrder });
      if (currentPackage.reviewPackage.status !== "READY") {
        throw new Error("Only an exact-current READY Review Package can be approved.");
      }
    }
    if ((args.action === "CORRECTION") !== Boolean(args.correctionCategory)) {
      throw new Error("A correction category is required only for correction judgments.");
    }
    if (args.idempotencyKey.length > 300) throw new Error("Review judgment idempotency key is too long.");
    const existing = await ctx.db.query("reviewJudgments")
      .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", args.idempotencyKey)).first();
    if (existing) {
      if (existing.workOrderId !== workOrder._id || existing.workflowRunId !== run._id
        || existing.workOrderRevisionNumber !== args.expectedWorkOrderRevisionNumber
        || existing.candidateRevision !== run.headSha
        || existing.reviewPackageDigest !== args.reviewPackageDigest || existing.action !== args.action) {
        throw new Error("Idempotency key belongs to another exact Review Judgment scope.");
      }
      return existing;
    }
    const actor = await resolveHumanActor(ctx);
    const summary = boundedReviewText(args.summary);
    if (!summary) throw new Error("A bounded review summary is required.");
    const id = await ctx.db.insert("reviewJudgments", {
      tenantId: workOrder.tenantId, projectId: workOrder.projectId!, repositoryId: workOrder.repositoryId,
      missionId: workOrder.missionId, missionSpecRevisionId: workOrder.missionSpecLineage?.missionSpecRevisionId,
      missionPlanId: workOrder.missionPlanId, workOrderId: workOrder._id,
      workOrderRevisionNumber: workOrder.currentRevisionNumber ?? 1, workflowRunId: run._id,
      candidateRevision: run.headSha, pullRequestUrl: run.pullRequestUrl,
      reviewPackageDigest: args.reviewPackageDigest, action: args.action,
      correctionCategory: args.correctionCategory, summary,
      sourceReference: args.sourceReference ? boundedReviewText(args.sourceReference, 500) : undefined,
      normalizedCorrection: args.action === "CORRECTION" ? normalizeReviewCorrection(summary) : undefined,
      actorId: actor.actorId, actorSource: actor.actorSource, idempotencyKey: args.idempotencyKey,
      recordedAt: Date.now(), acceptanceAuthority: false,
    });
    return await ctx.db.get(id);
  },
});

export const recordAgentDecisionCandidate = internalMutation({
  args: {
    workOrderId: v.id("workOrders"), workflowRunId: v.id("workflowRuns"), serviceActorId: v.string(),
    category: decisionCandidateCategoryValidator, proposedTarget: decisionCandidateTargetValidator,
    summary: v.string(), rationale: v.optional(v.string()), sourceReference: v.string(), idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    const { workOrder, run } = await loadReviewSubject(ctx, args.workOrderId, args.workflowRunId);
    if (args.idempotencyKey.length > 300) throw new Error("Decision Candidate idempotency key is too long.");
    const existing = await ctx.db.query("decisionCandidates")
      .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", args.idempotencyKey)).first();
    if (existing) {
      if (existing.workOrderId !== workOrder._id || existing.workflowRunId !== run._id) {
        throw new Error("Idempotency key belongs to another review scope.");
      }
      return existing;
    }
    const summary = boundedReviewText(args.summary);
    const sourceReference = boundedReviewText(args.sourceReference, 500);
    if (!summary || !sourceReference || !args.serviceActorId.startsWith("service:")) throw new Error("Trusted service attribution and bounded content are required.");
    const rationale = args.rationale ? boundedReviewText(args.rationale) : undefined;
    const id = await ctx.db.insert("decisionCandidates", {
      tenantId: workOrder.tenantId, projectId: workOrder.projectId!, repositoryId: workOrder.repositoryId,
      missionId: workOrder.missionId, missionSpecRevisionId: workOrder.missionSpecLineage?.missionSpecRevisionId,
      missionPlanId: workOrder.missionPlanId, workOrderId: workOrder._id,
      workOrderRevisionNumber: workOrder.currentRevisionNumber ?? 1, workflowRunId: run._id,
      sourceSessionId: String(run._id), candidateRevision: run.headSha, pullRequestUrl: run.pullRequestUrl,
      category: args.category, proposedTarget: args.proposedTarget, origin: "AGENT",
      originActorId: args.serviceActorId, capturedBy: args.serviceActorId, trustedSource: true,
      summary, rationale, sourceReference,
      contentDigest: reviewIntelligenceDigest("decision-candidate/v1", {
        workOrderId: String(workOrder._id), workflowRunId: String(run._id), category: args.category,
        proposedTarget: args.proposedTarget, summary, rationale, sourceReference,
      }),
      status: "PROPOSED", idempotencyKey: args.idempotencyKey, createdAt: Date.now(), acceptanceAuthority: false,
    });
    return await ctx.db.get(id);
  },
});

export const recordResidualAnalysis = internalMutation({
  args: {
    workOrderId: v.id("workOrders"), workflowRunId: v.id("workflowRuns"),
    verificationRunId: v.id("verificationRuns"), reviewerId: v.string(), provider: v.string(), model: v.string(),
    promptVersion: v.string(), contextDigest: v.string(), findings: v.array(residualFindingValidator),
    tokenUsage: v.optional(v.object({ input: v.optional(v.number()), output: v.optional(v.number()), cached: v.optional(v.number()), total: v.optional(v.number()) })),
    estimatedCostUsd: v.optional(v.number()), idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    const { workOrder, run } = await loadReviewSubject(ctx, args.workOrderId, args.workflowRunId);
    if (args.idempotencyKey.length > 300) throw new Error("Residual-analysis idempotency key is too long.");
    const rows = await ctx.db.query("featureFlags").withIndex("by_key", (q) => q.eq("key", REVIEW_INTELLIGENCE_FLAG)).collect() as FlagRow[];
    if (!resolveFlag(rows, REVIEW_INTELLIGENCE_FLAG, workOrder.projectId).enabled) throw new Error("Residual AI review is disabled.");
    const [verificationRun, current] = await Promise.all([
      ctx.db.get(args.verificationRunId), getCurrentVerificationResult(ctx, workOrder),
    ]);
    if (!verificationRun || verificationRun.workOrderId !== workOrder._id || verificationRun.sourceAttemptId !== run._id) {
      throw new Error("Residual analysis verification lineage does not match the exact Attempt.");
    }
    if (!current.current || !current.eligible || current.verificationRunId !== verificationRun._id
      || current.sourceAttemptId !== run._id || verificationRun.verdict !== "VERIFIED") {
      throw new Error("Residual analysis requires exact-current deterministic VERIFIED evidence.");
    }
    const executionActorId = run.executionClaimedBy?.trim();
    const reviewerId = boundedReviewText(args.reviewerId, 300);
    const implementationAgentIds = (run.executionManifest?.workflow?.steps ?? [])
      .map((step: any) => typeof step.workflowAgentId === "string" ? step.workflowAgentId.trim() : "")
      .filter(Boolean);
    const reviewerMatchesImplementationAgent = implementationAgentIds.some((agentId: string) =>
      reviewerId === agentId || reviewerId.endsWith(`:${agentId}`));
    if (!executionActorId || !reviewerId || reviewerId === executionActorId || reviewerMatchesImplementationAgent) {
      throw new Error("Residual reviewer must be attributable and distinct from the execution worker.");
    }
    if (!verificationRun.verificationSubjectId || !verificationRun.verificationSubjectDigest
      || !verificationRun.verificationPlanId || !verificationRun.verificationPlanDigest
      || !current.evidenceSetDigest || !verificationRun.sourceRevision || !verificationRun.candidateRevision) {
      throw new Error("Exact verification IDs and digests are required for residual analysis.");
    }
    const contextDigest = boundedReviewText(args.contextDigest, 200);
    const provider = boundedReviewText(args.provider, 100);
    const model = boundedReviewText(args.model, 200);
    const promptVersion = boundedReviewText(args.promptVersion, 100);
    if (!contextDigest || !provider || !model || !promptVersion) {
      throw new Error("Residual analysis requires bounded model and context provenance.");
    }
    for (const value of Object.values(args.tokenUsage ?? {})) {
      if (value != null && (!Number.isFinite(value) || value < 0)) throw new Error("Residual-analysis token telemetry must be finite and non-negative.");
    }
    if (args.estimatedCostUsd != null && (!Number.isFinite(args.estimatedCostUsd) || args.estimatedCostUsd < 0)) {
      throw new Error("Residual-analysis cost telemetry must be finite and non-negative.");
    }
    const existing = await ctx.db.query("residualReviewAnalyses")
      .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", args.idempotencyKey)).first();
    if (existing) {
      if (existing.workOrderId !== workOrder._id || existing.workflowRunId !== run._id
        || existing.verificationRunId !== verificationRun._id || existing.contextDigest !== contextDigest) {
        throw new Error("Idempotency key belongs to another residual-analysis scope.");
      }
      return existing;
    }
    const findings = args.findings.slice(0, 50).map((finding) => ({
      ...finding, authority: "ADVISORY" as const,
      findingId: boundedReviewText(finding.findingId, 200), summary: boundedReviewText(finding.summary),
      rationale: finding.rationale ? boundedReviewText(finding.rationale) : undefined,
      fileReferences: finding.fileReferences.map((item) => boundedReviewText(item, 500)).slice(0, 20),
      confidence: typeof finding.confidence === "number" ? Math.max(0, Math.min(1, finding.confidence)) : undefined,
    }));
    const id = await ctx.db.insert("residualReviewAnalyses", {
      tenantId: workOrder.tenantId, projectId: workOrder.projectId!, repositoryId: workOrder.repositoryId,
      missionId: workOrder.missionId, workOrderId: workOrder._id,
      workOrderRevisionNumber: workOrder.currentRevisionNumber ?? 1, workflowRunId: run._id,
      verificationRunId: verificationRun._id, verificationSubjectId: verificationRun.verificationSubjectId,
      verificationSubjectDigest: verificationRun.verificationSubjectDigest,
      verificationPlanId: verificationRun.verificationPlanId, verificationPlanDigest: verificationRun.verificationPlanDigest,
      evidenceSetDigest: current.evidenceSetDigest, sourceRevision: verificationRun.sourceRevision,
      candidateRevision: verificationRun.candidateRevision, contextDigest,
      reviewerId, executionActorId,
      provider, model, promptVersion, tokenUsage: args.tokenUsage,
      estimatedCostUsd: args.estimatedCostUsd, findings, idempotencyKey: args.idempotencyKey,
      createdAt: Date.now(), authority: "ADVISORY", acceptanceAuthority: false,
    });
    return await ctx.db.get(id);
  },
});
