/**
 * Meta loop inbox — suggestions from observed failures.
 */

import { v } from "convex/values";
import { action, internalMutation, mutation, query } from "../_generated/server";
import { api, internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { buildMetaMeasurement, sanitizeMetaSignalText } from "../lib/metaLoopSignals";
import {
  FACTORY_PERMISSIONS,
  requireWorkspacePermission,
  type FactoryPermission,
} from "../lib/companyAccess";
import { requireFactoryActionWithAudit } from "../lib/factoryActionAuthorization";

const kindArg = v.union(
  v.literal("VERIFIER"),
  v.literal("SKILL_UPDATE"),
  v.literal("EVAL_SCENARIO"),
  v.literal("MAINTENANCE"),
  v.literal("RULE_RETIRE"),
  v.literal("DELEGATION")
);

const statusArg = v.union(
  v.literal("OPEN"),
  v.literal("ACCEPTED"),
  v.literal("WORK_ORDERED"),
  v.literal("IMPLEMENTED"),
  v.literal("VERIFIED"),
  v.literal("EFFECTIVE"),
  v.literal("DISMISSED"),
  v.literal("SNOOZED"),
  v.literal("REJECTED"),
  v.literal("ROLLED_BACK"),
  v.literal("RETIRED")
);

async function requireSuggestionPermission(
  ctx: any,
  suggestionId: Id<"metaLoopSuggestions">,
  permission: FactoryPermission
): Promise<{ suggestion: Doc<"metaLoopSuggestions">; access: Awaited<ReturnType<typeof requireWorkspacePermission>> }> {
  const suggestion = await ctx.db.get(suggestionId) as Doc<"metaLoopSuggestions"> | null;
  if (!suggestion?.projectId) {
    throw new Error("Improvement proposal is unavailable or unauthorized");
  }
  const access = await requireWorkspacePermission(ctx, suggestion.projectId, permission);
  return { suggestion, access };
}

export const listInbox = query({
  args: {
    projectId: v.id("projects"),
    status: v.optional(statusArg),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireWorkspacePermission(ctx, args.projectId, FACTORY_PERMISSIONS.VIEW);
    const status = args.status ?? "OPEN";
    let rows = await ctx.db
      .query("metaLoopSuggestions")
      .withIndex("by_status", (q) => q.eq("status", status))
      .collect();
    rows = rows.filter((r) => r.projectId === args.projectId);
    rows.sort((a, b) => b.createdAt - a.createdAt);
    return rows.slice(0, args.limit ?? 40);
  },
});

export const get = query({
  args: { suggestionId: v.id("metaLoopSuggestions") },
  handler: async (ctx, args) =>
    (await requireSuggestionPermission(ctx, args.suggestionId, FACTORY_PERMISSIONS.VIEW)).suggestion,
});

export const listHistory = query({
  args: { projectId: v.id("projects"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireWorkspacePermission(ctx, args.projectId, FACTORY_PERMISSIONS.VIEW);
    let rows = await ctx.db.query("metaLoopSuggestions").withIndex("by_project", (q) => q.eq("projectId", args.projectId)).collect();
    rows = rows.filter((row) => row.status !== "OPEN").sort((a, b) => (b.resolvedAt ?? b.createdAt) - (a.resolvedAt ?? a.createdAt));
    return rows.slice(0, args.limit ?? 20);
  },
});

export const seedDemoSuggestions = mutation({
  args: {
    projectId: v.id("projects"),
    confirmation: v.string(),
  },
  handler: async (ctx, args) => {
    await requireWorkspacePermission(ctx, args.projectId, FACTORY_PERMISSIONS.IMPROVE);
    if (process.env.ALLOW_DEMO_SEEDING !== "true" || args.confirmation !== "SEED_DEMO_META_LOOP") {
      throw new Error("Demo meta-loop seeding is disabled outside an explicit development fixture run");
    }
    const now = Date.now();
    const demos = [
      {
        kind: "VERIFIER" as const,
        title: "Logger misuse ×3",
        summary: "Add verifier: structured logging required in convex/",
        sourceRef: "PR-1842",
      },
      {
        kind: "EVAL_SCENARIO" as const,
        title: "Empty list boundary",
        summary: "Extract eval from mutation testing miss on cart service",
        sourceRef: "PR-1901",
      },
      {
        kind: "DELEGATION" as const,
        title: "Weekly version bump",
        summary: "High success rate — automate semver bump workflow",
        sourceRef: "tasks",
      },
      {
        kind: "RULE_RETIRE" as const,
        title: "Stale import rule",
        summary: "Model 4.5 handles imports — re-eval verifier vr-12",
        sourceRef: "model-release",
      },
    ];
    const ids = [];
    for (const d of demos) {
      const id = await ctx.db.insert("metaLoopSuggestions", {
        projectId: args.projectId,
        kind: d.kind,
        title: d.title,
        summary: d.summary,
        status: "OPEN",
        sourceRef: d.sourceRef,
        createdAt: now,
      });
      ids.push(id);
    }
    return ids;
  },
});

export const applyResolution = internalMutation({
  args: {
    suggestionId: v.id("metaLoopSuggestions"),
    status: statusArg,
    actorId: v.string(),
    workOrderId: v.optional(v.id("workOrders")),
    taskId: v.optional(v.id("tasks")),
    missionId: v.optional(v.id("missions")),
    missionPlanId: v.optional(v.id("missionPlans")),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { suggestion: row, access } = await requireSuggestionPermission(
      ctx,
      args.suggestionId,
      FACTORY_PERMISSIONS.IMPROVE
    );
    await ctx.db.patch(args.suggestionId, {
      status: args.status,
      workOrderId: args.workOrderId,
      taskId: args.taskId,
      missionId: args.missionId,
      missionPlanId: args.missionPlanId,
      dismissalReason: args.reason,
      resolvedAt: args.status === "ACCEPTED" && args.missionPlanId
        ? undefined
        : Date.now(),
    });
    await ctx.db.insert("activities", {
      projectId: row.projectId,
      actorType: "HUMAN",
      actorId: args.actorId,
      action: `META_LOOP_${args.status}`,
      description: args.status === "DISMISSED"
        ? `Dismissed improvement proposal: ${args.reason}`
        : args.missionPlanId
          ? `Submitted governed Mission plan for improvement proposal: ${row.title}`
          : `Created governed work for improvement proposal: ${row.title}`,
      targetType: "META_LOOP_SUGGESTION",
      targetId: row._id,
      metadata: {
        missionId: args.missionId,
        missionPlanId: args.missionPlanId,
        workOrderId: args.workOrderId,
        taskId: args.taskId,
        reason: args.reason,
      },
    });
    return args.suggestionId;
  },
});

export const resolve = action({
  args: {
    suggestionId: v.id("metaLoopSuggestions"),
    action: v.union(v.literal("ACCEPT"), v.literal("DISMISS")),
    /** @deprecated Browser actor labels are ignored; authority is server-derived. */
    actorId: v.optional(v.string()),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{
    suggestionId: string;
    missionId?: string;
    missionPlanId?: string;
    workOrderId?: string;
    taskId?: string;
  }> => {
    const suggestion = await ctx.runQuery(api.factory.metaLoop.get, { suggestionId: args.suggestionId });
    if (!suggestion) throw new Error("Suggestion not found");
    if (!suggestion.projectId) throw new Error("A workspace-scoped suggestion is required");
    const learningCandidate = suggestion.acceptanceAuthority === false && Boolean(suggestion.learningClusterId);
    if (args.action === "DISMISS" && !["OPEN", "SNOOZED"].includes(suggestion.status)) {
      throw new Error("Only open or snoozed suggestions can be dismissed");
    }
    if (args.action === "ACCEPT" && !learningCandidate && suggestion.status !== "OPEN") {
      throw new Error("Only open suggestions can be accepted");
    }
    if (args.action === "ACCEPT" && learningCandidate && suggestion.status !== "ACCEPTED") {
      throw new Error("Factory Learning candidates require a human-approved experiment before governed work can be created");
    }
    const authorization = await requireFactoryActionWithAudit(ctx, {
      projectId: suggestion.projectId,
      permission: FACTORY_PERMISSIONS.APPROVE,
      operation: "META_LOOP_RESOLVE",
    });
    const actorId = authorization.actorId;
    if (args.action === "DISMISS") {
      const reason = args.reason?.trim();
      if (!reason) throw new Error("A dismissal reason is required");
      await ctx.runMutation(internal.factory.metaLoop.applyResolution, {
        suggestionId: args.suggestionId,
        status: "DISMISSED",
        actorId,
        reason,
      });
      return { suggestionId: String(args.suggestionId) };
    }
    const experimentReview = learningCandidate
      ? await ctx.runQuery(api.factory.learning.getExperimentReview, { candidateId: args.suggestionId })
      : null;
    if (learningCandidate && (!experimentReview || experimentReview.experiment.status !== "COMPLETED")) {
      throw new Error("Complete the linked canonical experiment before creating governed implementation work");
    }
    const project = await ctx.runQuery(api.projects.get, { projectId: suggestion.projectId });
    if (!project) throw new Error("Suggestion workspace not found");
    if (!project.githubRepo) throw new Error("Connect an approved repository before accepting repository-changing improvement work");
    const evidenceLinks = [
      ...(suggestion.sourceLinks ?? (suggestion.sourceRef ? [suggestion.sourceRef] : [])),
      ...(experimentReview ? [`experiment:${experimentReview.experiment._id}`] : []),
    ];
    if (learningCandidate) {
      if (suggestion.missionId && suggestion.missionPlanId) {
        return {
          suggestionId: String(args.suggestionId),
          missionId: String(suggestion.missionId),
          missionPlanId: String(suggestion.missionPlanId),
        };
      }
      const planReleaseEnabled = await ctx.runQuery(api.featureFlags.isEnabled, {
        key: "missions.plan-release-v1",
        projectId: suggestion.projectId,
      });
      if (!planReleaseEnabled) {
        throw new Error("Enable missions.plan-release-v1 before promoting an improvement into governed Mission work");
      }
      const workflow = await ctx.runQuery(api.workflows.get, { workflowId: "feature-dev" });
      if (!workflow?.active) {
        throw new Error("The active feature-dev workflow is required before promoting an improvement");
      }
      const missionResult = await ctx.runMutation(api.missions.createDraft, {
        projectId: suggestion.projectId,
        idempotencyKey: `factory-learning:${args.suggestionId}:mission`,
        title: `Improve: ${suggestion.title}`,
        objective: suggestion.proposedChange ?? suggestion.summary,
        context: `${suggestion.problemStatement ?? suggestion.summary}\n\nExpected benefit: ${suggestion.expectedBenefit ?? "Measure against the approved baseline."}\nEvidence count: ${suggestion.evidenceCount ?? 1}. Confidence: ${suggestion.confidence ?? 0.5}.`,
        constraints: [
          "Implement only the human-promoted Factory improvement.",
          "Preserve failed evidence and the approved experiment lineage.",
          "Do not bypass approval, verification, publication, or acceptance authority.",
        ],
        sourceOfTruthRefs: evidenceLinks.map((location, index) => ({
          kind: location.startsWith("http") ? "URL" as const : "DOC" as const,
          label: `Factory Learning evidence ${index + 1}`,
          location,
        })),
        stopCondition: "Stop when the approved improvement is implemented, independently verified, and ready for ordinary human review, or when operator intervention is required.",
        repositoryId: suggestion.repositoryId,
        maxCorrectiveIterations: 2,
        metadata: {
          source: "FACTORY_LEARNING_V1",
          factoryLearningCandidateId: args.suggestionId,
          experimentId: suggestion.experimentId,
          acceptanceAuthority: false,
        },
      });
      const planResult = await ctx.runMutation(api.missions.savePlanDraft, {
        projectId: suggestion.projectId,
        missionId: missionResult.mission._id,
        idempotencyKey: `factory-learning:${args.suggestionId}:plan`,
        summary: `Implement the approved ${suggestion.candidateType?.toLowerCase().replace(/_/g, " ") ?? "Factory improvement"} and measure it against experiment ${experimentReview!.experiment._id}.`,
        rollbackApproach: "Keep the current Factory behavior as the baseline and revert the candidate change if the approved verification or measured outcome regresses.",
        workOrderBlueprints: [{
          id: "factory-learning-implementation",
          title: `Implement: ${suggestion.title}`,
          desiredOutcome: suggestion.proposedChange ?? suggestion.summary,
          workflowId: workflow.workflowId,
          workflowVersion: workflow.version,
          sequence: 1,
          role: "WORKER",
          isMutating: true,
          priority: suggestion.impact === "CRITICAL" ? 1 : 2,
          riskLevel: suggestion.risk ?? "MEDIUM",
          modelComplexity: "STANDARD",
          branchStrategy: "isolated-worktree",
          constraints: [
            "Implement only the approved candidate scope.",
            "Do not alter acceptance or verification authority from learning output.",
          ],
          requiredApprovals: ["IMPLEMENTATION"],
          implementationPolicy: {
            allowedCommands: ["pnpm test", "pnpm run typecheck"],
            independentVerification: {
              executable: "pnpm",
              args: ["test"],
              category: "UNIT_TEST",
              commandClass: "TEST",
              evidenceCategory: "TEST_RESULT",
              timeoutMs: 30 * 60_000,
            },
            maxFilesChanged: 40,
            maxLinesChanged: 3_000,
            maxAttempts: 2,
            timeoutMinutes: 60,
            stopCondition: "Stop after the approved scope and verification commands pass and the review-ready pull request identity is persisted.",
          },
          dependsOnBlueprintIds: [],
          assertionIds: ["factory-learning-result"],
        }],
        assertions: [{
          assertionId: "factory-learning-result",
          title: "Approved Factory improvement is implemented and verified",
          outcome: suggestion.proposedChange ?? suggestion.summary,
          verificationMethod: "TEST",
          passCondition: "The approved verification commands pass against the exact candidate revision without weakening governance authority.",
          requiredEvidence: "Persist exact command output, candidate revision identity, experiment lineage, and independent verification evidence.",
          requiresIndependentValidation: true,
          waiverAllowed: false,
        }],
        metadata: {
          source: "FACTORY_LEARNING_V1",
          factoryLearningCandidateId: args.suggestionId,
          experimentId: suggestion.experimentId,
          acceptanceAuthority: false,
        },
      });
      if (!planResult.plan) throw new Error("Governed Mission plan could not be created");
      const submitted = await ctx.runMutation(api.missions.submitPlan, {
        projectId: suggestion.projectId,
        missionId: missionResult.mission._id,
        planId: planResult.plan._id,
        idempotencyKey: `factory-learning:${args.suggestionId}:submit-plan`,
      });
      if (!submitted.plan) throw new Error("Governed Mission plan could not be submitted");
      await ctx.runMutation(internal.factory.metaLoop.applyResolution, {
        suggestionId: args.suggestionId,
        status: "ACCEPTED",
        actorId,
        missionId: missionResult.mission._id,
        missionPlanId: planResult.plan._id,
      });
      return {
        suggestionId: String(args.suggestionId),
        missionId: String(missionResult.mission._id),
        missionPlanId: String(planResult.plan._id),
      };
    }
    const workOrderResult = await ctx.runMutation(api.workOrders.create, {
      projectId: suggestion.projectId,
      idempotencyKey: `meta-loop:${args.suggestionId}:work-order`,
      title: `Improve: ${suggestion.title}`,
      desiredOutcome: suggestion.proposedChange ?? suggestion.summary,
      context: `${suggestion.problemStatement ?? suggestion.summary}\n\nExpected benefit: ${suggestion.expectedBenefit ?? "Validate the proposed improvement."}\nEvidence count: ${suggestion.evidenceCount ?? 1}. Confidence: ${suggestion.confidence ?? 0.5}. Sources: ${evidenceLinks.join(", ")}.`,
      workflowId: "feature-dev",
      repository: project.githubRepo,
      branchStrategy: "isolated-worktree",
      priority: suggestion.impact === "CRITICAL" ? 1 : 2,
      riskLevel: suggestion.risk ?? (suggestion.kind === "RULE_RETIRE" ? "HIGH" : "MEDIUM"),
      requestedBy: actorId,
      isMutating: true,
      requiredApprovals: ["IMPLEMENTATION"],
      acceptanceCriteria: [
        { id: "implemented", title: "Improvement implemented", verificationMethod: "TEST", status: "PENDING" },
        { id: "measured", title: "Outcome measured against baseline", verificationMethod: "CHECKLIST", status: "PENDING" },
        ...(learningCandidate ? [{
          id: "experiment-lineage",
          title: "Implementation preserves the approved experiment lineage",
          verificationMethod: "CHECKLIST" as const,
          status: "PENDING" as const,
        }] : []),
      ],
      constraints: ["Use an isolated worktree", "Preserve failed evidence", "Do not bypass approval or verification"],
      sourceOfTruthRefs: evidenceLinks.map((location, index) => ({
        kind: location.startsWith("http") ? "URL" as const : "DOC" as const,
        label: `Meta-loop evidence ${index + 1}`,
        location,
      })),
      state: "AWAITING_APPROVAL",
      approvalStatus: "PENDING",
      metadata: {
        metaLoopSuggestionId: args.suggestionId,
        dedupeKey: suggestion.dedupeKey,
        learningClusterId: suggestion.learningClusterId,
        experimentId: suggestion.experimentId,
        experimentRecommendation: experimentReview?.recommendation,
        factoryLearningAcceptanceAuthority: false,
      },
    });
    const workOrderId = workOrderResult.workOrder._id;
    const taskResult = await ctx.runMutation(internal.tasks.createInternal, {
      projectId: suggestion.projectId,
      workOrderId,
      title: suggestion.title,
      description: suggestion.summary,
      type: "ENGINEERING",
      priority: suggestion.impact === "CRITICAL" ? 1 : 2,
      idempotencyKey: `meta-loop:${args.suggestionId}:task`,
      source: "MISSION_PROMPT",
      sourceRef: String(args.suggestionId),
      createdBy: "HUMAN",
      createdByRef: actorId,
      metadata: { metaLoopSuggestionId: args.suggestionId },
    });
    if (!taskResult.task) throw new Error("Governed implementation Task could not be created");
    await ctx.runMutation(internal.factory.metaLoop.applyResolution, {
      suggestionId: args.suggestionId,
      status: "WORK_ORDERED",
      actorId,
      workOrderId,
      taskId: taskResult.task._id,
    });
    return { suggestionId: String(args.suggestionId), workOrderId: String(workOrderId), taskId: String(taskResult.task._id) };
  },
});

export const ingestWorkflowFailure = internalMutation({
  args: { workflowRunId: v.id("workflowRuns") },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.workflowRunId);
    if (!run || run.status !== "FAILED" || !run.projectId) return { created: false };
    const failedStep = run.steps.find((step) => step.status === "FAILED");
    const surface = `${run.workflowId}:${failedStep?.stepId ?? "run"}`;
    const dedupeKey = `workflow-failure:${run.projectId}:${surface}`;
    const existing = await ctx.db.query("metaLoopSuggestions")
      .withIndex("by_dedupe", (q) => q.eq("dedupeKey", dedupeKey))
      .first();
    if (existing) {
      const sourceLink = `workflow-run:${run.runId}`;
      const sourceLinks = existing.sourceLinks ?? [];
      if (sourceLinks.includes(sourceLink)) {
        return { created: false, suggestionId: existing._id, reason: "duplicate-signal" };
      }
      await ctx.db.patch(existing._id, {
        evidenceCount: (existing.evidenceCount ?? 1) + 1,
        sourceLinks: [...sourceLinks, sourceLink],
      });
      return { created: false, suggestionId: existing._id };
    }
    const id = await ctx.db.insert("metaLoopSuggestions", {
      projectId: run.projectId,
      kind: "EVAL_SCENARIO",
      title: `Prevent repeat failure in ${surface}`,
      summary: sanitizeMetaSignalText(failedStep?.error ?? run.failureReason ?? `Workflow ${run.runId} failed`),
      status: "OPEN",
      sourceRef: `workflow-run:${run.runId}`,
      sourceLinks: [`workflow-run:${run.runId}`],
      dedupeKey,
      evidenceCount: 1,
      confidence: 0.75,
      impact: "HIGH",
      affectedSurface: surface,
      payload: { type: "WORKFLOW_FAILURE", workflowRunId: run._id, workOrderId: run.workOrderId, failedStepId: failedStep?.stepId },
      createdAt: Date.now(),
    });
    return { created: true, suggestionId: id };
  },
});

export const ingestSignal = internalMutation({
  args: {
    projectId: v.id("projects"),
    kind: kindArg,
    signalClass: v.string(),
    target: v.string(),
    title: v.string(),
    summary: v.string(),
    sourceRef: v.string(),
    sourceLinks: v.array(v.string()),
    evidenceCount: v.optional(v.number()),
    confidence: v.number(),
    impact: v.string(),
    payload: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const dedupeKey = `signal:${args.projectId}:${args.signalClass}:${args.target}`;
    const existing = await ctx.db.query("metaLoopSuggestions")
      .withIndex("by_dedupe", (q) => q.eq("dedupeKey", dedupeKey))
      .first();
    if (existing) {
      const newLinks = args.sourceLinks.filter((link) => !(existing.sourceLinks ?? []).includes(link));
      if (newLinks.length === 0) return { created: false, suggestionId: existing._id, reason: "duplicate-signal" };
      await ctx.db.patch(existing._id, {
        sourceLinks: [...(existing.sourceLinks ?? []), ...newLinks],
        evidenceCount: (existing.evidenceCount ?? 1) + (args.evidenceCount ?? newLinks.length),
        confidence: Math.max(existing.confidence ?? 0, args.confidence),
      });
      return { created: false, suggestionId: existing._id, reason: "evidence-aggregated" };
    }
    const id = await ctx.db.insert("metaLoopSuggestions", {
      projectId: args.projectId,
      kind: args.kind,
      title: args.title,
      summary: sanitizeMetaSignalText(args.summary),
      status: "OPEN",
      sourceRef: args.sourceRef,
      sourceLinks: args.sourceLinks,
      dedupeKey,
      evidenceCount: args.evidenceCount ?? args.sourceLinks.length,
      confidence: args.confidence,
      impact: args.impact,
      affectedSurface: args.target,
      payload: { ...(args.payload ?? {}), signalClass: args.signalClass },
      createdAt: Date.now(),
    });
    return { created: true, suggestionId: id };
  },
});

export const recordMeasurement = mutation({
  args: {
    suggestionId: v.id("metaLoopSuggestions"),
    baseline: v.number(),
    result: v.number(),
    target: v.number(),
    unit: v.string(),
    evidenceRefs: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const { suggestion: row, access } = await requireSuggestionPermission(
      ctx,
      args.suggestionId,
      FACTORY_PERMISSIONS.IMPROVE
    );
    if (!row.workOrderId) throw new Error("Measurement requires linked governed work");
    if (args.evidenceRefs.length === 0) throw new Error("Measurement evidence is required");
    const measurement = buildMetaMeasurement(args);
    const { verdict } = measurement;
    await ctx.db.patch(row._id, {
      status: verdict === "MET" ? "EFFECTIVE" : "VERIFIED",
      measurement,
    });
    if (verdict === "MISSED") {
      const dedupeKey = `${row.dedupeKey ?? row._id}:measurement-missed`;
      const existing = await ctx.db.query("metaLoopSuggestions").withIndex("by_dedupe", (q) => q.eq("dedupeKey", dedupeKey)).first();
      if (!existing) {
        await ctx.db.insert("metaLoopSuggestions", {
          projectId: row.projectId,
          kind: "MAINTENANCE",
          title: `Continue improvement: ${row.title}`,
          summary: `Measured ${args.result}${args.unit} against target ${args.target}${args.unit}. One bounded follow-up is required.`,
          status: "OPEN",
          sourceRef: `meta-loop:${row._id}:measurement`,
          sourceLinks: args.evidenceRefs,
          dedupeKey,
          evidenceCount: args.evidenceRefs.length,
          confidence: 0.9,
          impact: row.impact,
          affectedSurface: row.affectedSurface,
          createdAt: Date.now(),
        });
      }
    }
    await ctx.db.insert("activities", {
      projectId: row.projectId,
      actorType: "HUMAN",
      actorId: access.actorId,
      action: "META_LOOP_MEASUREMENT_RECORDED",
      description: `Measured ${row.title}: ${args.result}${args.unit} against ${args.target}${args.unit}`,
      targetType: "META_LOOP_SUGGESTION",
      targetId: row._id,
      metadata: { verdict, baseline: args.baseline, result: args.result, target: args.target },
    });
    return { verdict };
  },
});

export const transitionLifecycle = mutation({
  args: {
    suggestionId: v.id("metaLoopSuggestions"),
    toStatus: v.union(v.literal("IMPLEMENTED"), v.literal("VERIFIED"), v.literal("ROLLED_BACK"), v.literal("RETIRED")),
    /** @deprecated Browser actor labels are ignored; authority is server-derived. */
    actorId: v.optional(v.string()),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { suggestion: row, access } = await requireSuggestionPermission(
      ctx,
      args.suggestionId,
      FACTORY_PERMISSIONS.APPROVE
    );
    const actorId = access.actorId;
    const allowed: Record<string, string[]> = {
      WORK_ORDERED: ["IMPLEMENTED", "ROLLED_BACK", "RETIRED"],
      IMPLEMENTED: ["VERIFIED", "ROLLED_BACK", "RETIRED"],
      VERIFIED: ["ROLLED_BACK", "RETIRED"],
      EFFECTIVE: ["ROLLED_BACK", "RETIRED"],
    };
    if (!(allowed[row.status] ?? []).includes(args.toStatus)) {
      throw new Error(`Meta-loop lifecycle cannot transition from ${row.status} to ${args.toStatus}`);
    }
    const reason = args.reason?.trim();
    if (["ROLLED_BACK", "RETIRED"].includes(args.toStatus) && !reason) {
      throw new Error(`${args.toStatus} requires a retained reason`);
    }
    if (args.toStatus === "IMPLEMENTED") {
      const workOrder = row.workOrderId ? await ctx.db.get(row.workOrderId) : null;
      if (!workOrder || workOrder.state !== "DONE") throw new Error("Implemented status requires an accepted WorkOrder");
    }
    await ctx.db.patch(row._id, { status: args.toStatus, resolvedAt: Date.now(), dismissalReason: reason });
    await ctx.db.insert("activities", {
      projectId: row.projectId,
      actorType: "HUMAN",
      actorId,
      action: `META_LOOP_${args.toStatus}`,
      description: `${row.title} transitioned to ${args.toStatus}${reason ? `: ${reason}` : ""}`,
      targetType: "META_LOOP_SUGGESTION",
      targetId: row._id,
    });
    return await ctx.db.get(row._id);
  },
});

export const create = mutation({
  args: {
    projectId: v.id("projects"),
    kind: kindArg,
    title: v.string(),
    summary: v.string(),
    sourceRef: v.optional(v.string()),
    packageId: v.optional(v.id("contextPackages")),
    sourceLinks: v.optional(v.array(v.string())),
    evidenceCount: v.optional(v.number()),
    confidence: v.optional(v.number()),
    impact: v.optional(v.string()),
    affectedSurface: v.optional(v.string()),
    dedupeKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireWorkspacePermission(ctx, args.projectId, FACTORY_PERMISSIONS.IMPROVE);
    return ctx.db.insert("metaLoopSuggestions", {
      projectId: args.projectId,
      kind: args.kind,
      title: args.title,
      summary: sanitizeMetaSignalText(args.summary),
      status: "OPEN",
      sourceRef: args.sourceRef,
      packageId: args.packageId,
      sourceLinks: args.sourceLinks,
      evidenceCount: args.evidenceCount ?? 1,
      confidence: args.confidence,
      impact: args.impact,
      affectedSurface: args.affectedSurface,
      dedupeKey: args.dedupeKey,
      createdAt: Date.now(),
    });
  },
});
