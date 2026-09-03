import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  AUTOMATION_POLICY_VERSION,
  automationOperatorIdentitySource,
  buildDisabledAutomationDefinition,
  calculateAutomationMetrics,
  isAutomationCandidatePayload,
  nextScheduledAt,
} from "./lib/automationGovernance";
import {
  isCandidateEligibleForActivation,
  loadRepetitiveTaskCandidates,
} from "./lib/repetitiveTaskCandidates";
import { FACTORY_PERMISSIONS, requireWorkspacePermission } from "./lib/companyAccess";
import { SKILL_AUTOMATION_POLICY_VERSION } from "./lib/skillAutomation";

const decisionArgs = {
  reason: v.string(),
};

async function requireAutomationPermission(
  ctx: any,
  projectId: any,
  permission: (typeof FACTORY_PERMISSIONS)[keyof typeof FACTORY_PERMISSIONS],
) {
  const access = await requireWorkspacePermission(ctx, projectId, permission);
  return {
    ...access,
    actorIdentitySource: automationOperatorIdentitySource(access.membership.mode),
  };
}

function policyVersionForDefinition(definition: { sourceSkillId?: unknown }) {
  return definition.sourceSkillId
    ? SKILL_AUTOMATION_POLICY_VERSION
    : AUTOMATION_POLICY_VERSION;
}

export const getControlPlane = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    await requireAutomationPermission(ctx, args.projectId, FACTORY_PERMISSIONS.VIEW);
    const [definitions, decisions, suggestions, workOrders, receipts, scheduledJobs, workflows, evaluations, workflowRuns, runEvents, runArtifacts] = await Promise.all([
      ctx.db.query("automationDefinitions").withIndex("by_project", (q: any) => q.eq("projectId", args.projectId)).collect(),
      ctx.db.query("automationDecisions").withIndex("by_project", (q: any) => q.eq("projectId", args.projectId)).collect(),
      ctx.db.query("metaLoopSuggestions").withIndex("by_project", (q: any) => q.eq("projectId", args.projectId)).collect(),
      ctx.db.query("workOrders").withIndex("by_project", (q: any) => q.eq("projectId", args.projectId)).collect(),
      ctx.db.query("verificationReceipts").withIndex("by_project", (q: any) => q.eq("projectId", args.projectId)).collect(),
      ctx.db.query("scheduledJobs").withIndex("by_project", (q: any) => q.eq("projectId", args.projectId)).collect(),
      ctx.db.query("workflows").collect(),
      ctx.db.query("automationEvaluations").withIndex("by_project", (q: any) => q.eq("projectId", args.projectId)).collect(),
      ctx.db.query("workflowRuns").withIndex("by_project", (q: any) => q.eq("projectId", args.projectId)).collect(),
      ctx.db.query("runEvents").withIndex("by_project", (q: any) => q.eq("projectId", args.projectId)).collect(),
      ctx.db.query("runArtifacts").collect(),
    ]);
    const now = Date.now();
    const workflowById = new Map(workflows.map((workflow: any) => [workflow.workflowId, workflow]));
    const detected = await loadRepetitiveTaskCandidates(ctx, args.projectId);
    const suggestionByCandidate = new Map(
      suggestions
        .filter((suggestion: any) => isAutomationCandidatePayload(suggestion.payload))
        .map((suggestion: any) => [suggestion.payload.candidateId, suggestion])
    );
    const candidates = detected.map((candidate) => ({
      ...candidate,
      suggestionId: suggestionByCandidate.get(candidate.id)?._id,
      status: suggestionByCandidate.get(candidate.id)?.status === "ACCEPTED"
        ? "ACCEPTED"
        : suggestionByCandidate.get(candidate.id)?.status === "DISMISSED"
          ? "REJECTED"
          : isCandidateEligibleForActivation(candidate)
            ? "ELIGIBLE"
            : "INELIGIBLE",
      eligible: isCandidateEligibleForActivation(candidate),
      eligibilityReason: !candidate.workflowId
        ? "A versioned Workflow is required."
        : candidate.receiptCount < 1
          ? "At least one fresh passing verification receipt is required."
          : null,
      workflow: candidate.workflowId ? workflowById.get(candidate.workflowId) ?? null : null,
      supportingWorkOrders: candidate.supportingWorkOrderIds
        .map((id) => workOrders.find((workOrder: any) => String(workOrder._id) === id))
        .filter(Boolean)
        .map((workOrder: any) => ({
          _id: workOrder._id,
          title: workOrder.title,
          state: workOrder.state,
          verificationStatus: workOrder.verificationStatus,
        })),
    }));
    const reviewGates = workOrders.filter((workOrder: any) => workOrder.metadata?.automationDefinitionId);
    const receiptByWorkOrder = new Map<string, any[]>();
    for (const receipt of receipts) {
      const key = String(receipt.workOrderId);
      receiptByWorkOrder.set(key, [...(receiptByWorkOrder.get(key) ?? []), receipt]);
    }
    const runs = reviewGates.map((workOrder: any) => {
      const definition = definitions.find((item: any) =>
        String(item._id) === String(workOrder.metadata?.automationDefinitionId)
      );
      const runReceipts = (receiptByWorkOrder.get(String(workOrder._id)) ?? [])
        .sort((a: any, b: any) => b.recordedAt - a.recordedAt);
      const receiptState = runReceipts.some((receipt: any) => receipt.status === "FAILED")
        ? "FAILED"
        : runReceipts.some((receipt: any) => receipt.status === "PASSED" && !receipt.invalidatedAt && (!receipt.validUntil || receipt.validUntil > now))
          ? "FRESH"
          : runReceipts.some((receipt: any) => receipt.status === "STALE" || receipt.invalidatedAt || (receipt.validUntil && receipt.validUntil <= now))
            ? "STALE"
            : "MISSING";
      const dispatchState = ["DISPATCHED", "IN_PROGRESS", "AWAITING_VERIFICATION", "DONE"].includes(workOrder.state)
        ? "DISPATCHED"
        : workOrder.approvalStatus === "APPROVED"
          ? "APPROVED_AWAITING_DISPATCH"
          : "NOT_DISPATCHED";
      return {
        workOrder,
        definition,
        receipts: runReceipts,
        cadenceWindow: workOrder.metadata?.automationCadenceWindow ?? workOrder.idempotencyKey,
        dispatchState,
        receiptState,
        idempotencyResult: "REVIEW_GATE_CREATED",
        costUsd: workOrder.metadata?.costUsd ?? 0,
        durationMs: workOrder.metadata?.durationMs,
        evaluation: evaluations.find((item: any) => item.workOrderId === workOrder._id) ?? null,
        workflowRun: workflowRuns.filter((item: any) => item.workOrderId === workOrder._id).sort((a: any, b: any) => b.startedAt - a.startedAt)[0] ?? null,
        events: runEvents.filter((item: any) => item.workOrderId === workOrder._id).sort((a: any, b: any) => a.sequenceNumber - b.sequenceNumber),
        artifacts: runArtifacts.filter((item: any) => item.workOrderId === workOrder._id),
      };
    });
    const enrichedDefinitions = definitions.map((definition: any) => {
      const definitionRuns = runs
        .filter((run: any) => String(run.definition?._id) === String(definition._id))
        .sort((a: any, b: any) => b.workOrder.createdAt - a.workOrder.createdAt);
      const latestRun = definitionRuns[0];
      const workflow = workflowById.get(definition.workflowId) ?? null;
      const configuredVersion = Number(String(definition.workflowVersion).replace(/^v/, ""));
      const scheduleConflict = definitions.some((other: any) =>
        other._id !== definition._id
        && other.status === "ACTIVE"
        && definition.status === "ACTIVE"
        && other.triggerConfig?.cron === definition.triggerConfig?.cron
        && other.triggerConfig?.timezone === definition.triggerConfig?.timezone
        && other.scope === definition.scope
      );
      return {
        ...definition,
        workflow,
        workflowActive: workflow?.active ?? false,
        workflowVersionMismatch: workflow ? workflow.version !== configuredVersion : true,
        scheduleConflict,
        approvalStatus: latestRun?.workOrder.approvalStatus ?? "NOT_STARTED",
        verificationStatus: latestRun?.workOrder.verificationStatus ?? "NOT_STARTED",
        actualCostUsd: definitionRuns.reduce((sum: number, run: any) => sum + run.costUsd, 0),
        runCount: definitionRuns.length,
      };
    });
    const baseMetrics = calculateAutomationMetrics({
      definitions,
      reviewGates,
    });
    const receiptRows = runs.flatMap((run: any) => {
      const criteria = run.workOrder.acceptanceCriteria ?? [];
      return criteria.map((criterion: any) => {
        const receipt = run.receipts.find((item: any) => item.acceptanceCriterionId === criterion.id);
        const evidenceState = !receipt
          ? "MISSING"
          : receipt.status === "PASSED" && receipt.invalidatedAt == null && (!receipt.validUntil || receipt.validUntil > now)
            ? "FRESH"
            : receipt.status === "PASSED" && receipt.validUntil && receipt.validUntil <= now
              ? "EXPIRED"
              : receipt.invalidatedAt || receipt.status === "STALE"
                ? "STALE"
                : receipt.status;
        return {
          ...(receipt ?? {
            _id: `missing:${run.workOrder._id}:${criterion.id}`,
            workOrderId: run.workOrder._id,
            acceptanceCriterionId: criterion.id,
            status: "MISSING",
          }),
          evidenceState,
          criterionTitle: criterion.title,
          automationDefinitionId: run.definition?._id,
          automationName: run.definition?.name,
          workOrderTitle: run.workOrder.title,
        };
      });
    });
    const metrics = {
      ...baseMetrics,
      disabled: definitions.filter((definition: any) => definition.status === "DISABLED").length,
      candidatesAwaitingReview: candidates.filter((candidate) => ["ELIGIBLE", "DETECTED"].includes(candidate.status)).length,
      awaitingVerification: reviewGates.filter((workOrder: any) => workOrder.state === "AWAITING_VERIFICATION").length,
      failedReviewGates: reviewGates.filter((workOrder: any) =>
        workOrder.state === "BLOCKED" || workOrder.verificationStatus === "FAIL"
      ).length,
      overdueReceipts: receiptRows.filter((receipt: any) => ["MISSING", "EXPIRED", "STALE"].includes(receipt.evidenceState)).length,
      estimatedHumanMinutesSaved: candidates
        .filter((candidate) => candidate.status === "ACCEPTED")
        .reduce((sum, candidate) => sum + candidate.estimatedHumanMinutesSaved, 0),
      idempotentSkips: definitions.filter((definition: any) => definition.lastResult === "IDEMPOTENT_SKIP").length,
    };
    return {
      definitions: enrichedDefinitions.sort((a: any, b: any) => b.updatedAt - a.updatedAt),
      decisions: decisions.sort((a: any, b: any) => b.decidedAt - a.decidedAt),
      candidates,
      runs,
      receipts: receiptRows,
      scheduledJobs,
      evaluations: evaluations.sort((a: any, b: any) => b.createdAt - a.createdAt),
      metrics,
    };
  },
});

export const getDefinition = query({
  args: {
    projectId: v.id("projects"),
    automationDefinitionId: v.id("automationDefinitions"),
  },
  handler: async (ctx, args) => {
    await requireAutomationPermission(ctx, args.projectId, FACTORY_PERMISSIONS.VIEW);
    const definition = await ctx.db.get(args.automationDefinitionId);
    if (!definition || definition.projectId !== args.projectId) {
      throw new Error("Automation is outside the selected workspace");
    }
    const decisions = await ctx.db
      .query("automationDecisions")
      .withIndex("by_definition", (q) => q.eq("automationDefinitionId", args.automationDefinitionId))
      .collect();
    return { definition, decisions: decisions.sort((a, b) => b.decidedAt - a.decidedAt) };
  },
});

export const acceptCandidate = mutation({
  args: {
    projectId: v.id("projects"),
    candidateId: v.string(),
    ...decisionArgs,
  },
  handler: async (ctx, args) => {
    const access = await requireAutomationPermission(
      ctx,
      args.projectId,
      FACTORY_PERMISSIONS.MANAGE_AUTOMATION,
    );
    const candidate = (await loadRepetitiveTaskCandidates(ctx, args.projectId))
      .find((item) => item.id === args.candidateId);
    if (!candidate) throw new Error("Automation Candidate is no longer eligible");
    if (!candidate.workflowId) throw new Error("Design and version a Workflow before accepting this candidate");
    if (candidate.receiptCount < 1) throw new Error("A passing, fresh verification receipt is required");

    const sourceRef = `repetitive-task:${args.projectId}:${candidate.id}`;
    const suggestions = await ctx.db
      .query("metaLoopSuggestions")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    let suggestion = suggestions.find((item) => item.sourceRef === sourceRef);
    const payload = {
      type: "AUTOMATION_CANDIDATE" as const,
      candidateId: candidate.id,
      pattern: candidate.pattern,
      workflowId: candidate.workflowId,
      repository: candidate.repository,
      supportingWorkOrderIds: candidate.supportingWorkOrderIds,
      occurrences: candidate.occurrences,
      receiptCount: candidate.receiptCount,
      suggestedCadence: candidate.suggestedCadence,
      confidence: candidate.confidence,
      riskLevel: candidate.riskLevel,
      estimatedHumanMinutesSaved: candidate.estimatedHumanMinutesSaved,
      recommendedAutonomyLevel: candidate.recommendedAutonomyLevel,
    };
    if (!suggestion) {
      const suggestionId = await ctx.db.insert("metaLoopSuggestions", {
        projectId: args.projectId,
        kind: "DELEGATION",
        title: `Automation Candidate: ${candidate.pattern}`,
        summary: `${candidate.occurrences} occurrences with ${candidate.receiptCount} eligible receipts.`,
        status: "ACCEPTED",
        sourceRef,
        payload,
        createdAt: Date.now(),
        resolvedAt: Date.now(),
      });
      suggestion = (await ctx.db.get(suggestionId)) ?? undefined;
    }
    if (!suggestion) throw new Error("Failed to persist Automation Candidate");

    const existing = await ctx.db
      .query("automationDefinitions")
      .withIndex("by_source_candidate", (q) => q.eq("sourceCandidateId", suggestion!._id))
      .first();
    if (existing) return { definitionId: existing._id, created: false };

    const workflow = await ctx.db
      .query("workflows")
      .withIndex("by_workflow_id", (q) => q.eq("workflowId", candidate.workflowId!))
      .first();
    if (!workflow || !workflow.active) throw new Error("The candidate Workflow must exist and be active");

    const now = Date.now();
    if (suggestion.status !== "ACCEPTED") {
      await ctx.db.patch(suggestion._id, { status: "ACCEPTED", resolvedAt: now, payload });
    }
    const definitionId = await ctx.db.insert(
      "automationDefinitions",
      buildDisabledAutomationDefinition({
        projectId: args.projectId,
        sourceCandidateId: suggestion._id,
        actorId: access.actorId,
        candidate,
        workflow,
        now,
      })
    );
    await ctx.db.insert("automationDecisions", {
      projectId: args.projectId,
      automationDefinitionId: definitionId,
      decisionType: "CREATED",
      actorId: access.actorId,
      actorIdentitySource: access.actorIdentitySource,
      reason: args.reason,
      policyVersion: AUTOMATION_POLICY_VERSION,
      definitionVersion: 1,
      decidedAt: now,
    });
    await ctx.db.insert("automationDecisions", {
      projectId: args.projectId,
      automationDefinitionId: definitionId,
      candidateId: candidate.id,
      decisionType: "ACCEPTED",
      actorId: access.actorId,
      actorIdentitySource: access.actorIdentitySource,
      reason: args.reason,
      policyVersion: AUTOMATION_POLICY_VERSION,
      definitionVersion: 1,
      decidedAt: now,
    });
    return { definitionId, created: true };
  },
});

export const rejectCandidate = mutation({
  args: {
    projectId: v.id("projects"),
    candidateId: v.string(),
    ...decisionArgs,
  },
  handler: async (ctx, args) => {
    const access = await requireAutomationPermission(
      ctx,
      args.projectId,
      FACTORY_PERMISSIONS.MANAGE_AUTOMATION,
    );
    const candidate = (await loadRepetitiveTaskCandidates(ctx, args.projectId))
      .find((item) => item.id === args.candidateId);
    if (!candidate) throw new Error("Automation Candidate is no longer available");
    const sourceRef = `repetitive-task:${args.projectId}:${candidate.id}`;
    const suggestions = await ctx.db
      .query("metaLoopSuggestions")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    const existing = suggestions.find((item) => item.sourceRef === sourceRef);
    const payload = {
      type: "AUTOMATION_CANDIDATE" as const,
      candidateId: candidate.id,
      pattern: candidate.pattern,
      workflowId: candidate.workflowId,
      repository: candidate.repository,
      supportingWorkOrderIds: candidate.supportingWorkOrderIds,
      occurrences: candidate.occurrences,
      receiptCount: candidate.receiptCount,
      suggestedCadence: candidate.suggestedCadence,
      confidence: candidate.confidence,
      riskLevel: candidate.riskLevel,
      estimatedHumanMinutesSaved: candidate.estimatedHumanMinutesSaved,
      recommendedAutonomyLevel: candidate.recommendedAutonomyLevel,
    };
    if (existing) {
      await ctx.db.patch(existing._id, {
        status: "DISMISSED",
        payload,
        resolvedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("metaLoopSuggestions", {
        projectId: args.projectId,
        kind: "DELEGATION",
        title: `Automation Candidate: ${candidate.pattern}`,
        summary: args.reason,
        status: "DISMISSED",
        sourceRef,
        payload,
        createdAt: Date.now(),
        resolvedAt: Date.now(),
      });
    }
    await ctx.db.insert("automationDecisions", {
      projectId: args.projectId,
      candidateId: candidate.id,
      decisionType: "REJECTED",
      actorId: access.actorId,
      actorIdentitySource: access.actorIdentitySource,
      reason: args.reason,
      policyVersion: AUTOMATION_POLICY_VERSION,
      definitionVersion: 0,
      decidedAt: Date.now(),
    });
    return { changed: true };
  },
});

export const requestCandidateEvidence = mutation({
  args: {
    projectId: v.id("projects"),
    candidateId: v.string(),
    ...decisionArgs,
  },
  handler: async (ctx, args) => {
    const access = await requireAutomationPermission(
      ctx,
      args.projectId,
      FACTORY_PERMISSIONS.MANAGE_AUTOMATION,
    );
    const candidate = (await loadRepetitiveTaskCandidates(ctx, args.projectId))
      .find((item) => item.id === args.candidateId);
    if (!candidate) throw new Error("Automation Candidate is no longer available");
    await ctx.db.insert("automationDecisions", {
      projectId: args.projectId,
      candidateId: candidate.id,
      decisionType: "POLICY_BLOCKED",
      actorId: access.actorId,
      actorIdentitySource: access.actorIdentitySource,
      reason: `More evidence requested: ${args.reason}`,
      policyVersion: AUTOMATION_POLICY_VERSION,
      definitionVersion: 0,
      decidedAt: Date.now(),
    });
    return { changed: true };
  },
});

export const activate = mutation({
  args: {
    projectId: v.id("projects"),
    automationDefinitionId: v.id("automationDefinitions"),
    ...decisionArgs,
  },
  handler: async (ctx, args) => {
    const access = await requireAutomationPermission(
      ctx,
      args.projectId,
      FACTORY_PERMISSIONS.MANAGE_AUTOMATION,
    );
    const definition = await ctx.db.get(args.automationDefinitionId);
    if (!definition || definition.projectId !== args.projectId) throw new Error("Automation is outside the selected workspace");
    if (definition.isMutating || definition.autonomyLevel !== "LEVEL_1") {
      throw new Error("V1 activation only supports read-only LEVEL_1 Automations");
    }
    if (definition.sourceSkillId && (definition.validationStatus !== "PASSED" || definition.reviewStatus !== "APPROVED")) {
      throw new Error("Skill Automations require passed validation and explicit approval before activation");
    }
    if (definition.status === "ACTIVE") return { changed: false, definitionId: definition._id };
    if (!["DISABLED", "PAUSED"].includes(definition.status)) throw new Error(`Cannot activate an Automation from ${definition.status}`);
    const now = Date.now();
    await ctx.db.patch(definition._id, {
      status: "ACTIVE",
      activatedBy: access.actorId,
      activatedAt: now,
      activationReason: args.reason,
      activationPolicyVersion: policyVersionForDefinition(definition),
      pausedBy: undefined,
      pausedAt: undefined,
      pauseReason: undefined,
      nextRunAt: now,
      health: "HEALTHY",
      updatedAt: now,
    });
    await ctx.db.insert("automationDecisions", {
      projectId: args.projectId,
      automationDefinitionId: definition._id,
      decisionType: definition.status === "PAUSED" ? "RESUMED" : "ACTIVATED",
      actorId: access.actorId,
      actorIdentitySource: access.actorIdentitySource,
      reason: args.reason,
      policyVersion: policyVersionForDefinition(definition),
      definitionVersion: definition.definitionVersion,
      decidedAt: now,
    });
    return { changed: true, definitionId: definition._id };
  },
});

export const pause = mutation({
  args: {
    projectId: v.id("projects"),
    automationDefinitionId: v.id("automationDefinitions"),
    ...decisionArgs,
  },
  handler: async (ctx, args) => {
    const access = await requireAutomationPermission(
      ctx,
      args.projectId,
      FACTORY_PERMISSIONS.MANAGE_AUTOMATION,
    );
    const definition = await ctx.db.get(args.automationDefinitionId);
    if (!definition || definition.projectId !== args.projectId) throw new Error("Automation is outside the selected workspace");
    if (definition.status === "PAUSED") return { changed: false };
    if (definition.status !== "ACTIVE") throw new Error(`Cannot pause an Automation from ${definition.status}`);
    const now = Date.now();
    await ctx.db.patch(definition._id, {
      status: "PAUSED",
      pausedBy: access.actorId,
      pausedAt: now,
      pauseReason: args.reason,
      nextRunAt: undefined,
      health: "ATTENTION",
      updatedAt: now,
    });
    await ctx.db.insert("automationDecisions", {
      projectId: args.projectId,
      automationDefinitionId: definition._id,
      decisionType: "PAUSED",
      actorId: access.actorId,
      actorIdentitySource: access.actorIdentitySource,
      reason: args.reason,
      policyVersion: policyVersionForDefinition(definition),
      definitionVersion: definition.definitionVersion,
      decidedAt: now,
    });
    return { changed: true };
  },
});

export const retire = mutation({
  args: {
    projectId: v.id("projects"),
    automationDefinitionId: v.id("automationDefinitions"),
    ...decisionArgs,
  },
  handler: async (ctx, args) => {
    const access = await requireAutomationPermission(
      ctx,
      args.projectId,
      FACTORY_PERMISSIONS.MANAGE_AUTOMATION,
    );
    const definition = await ctx.db.get(args.automationDefinitionId);
    if (!definition || definition.projectId !== args.projectId) {
      throw new Error("Automation is outside the selected workspace");
    }
    if (definition.status === "RETIRED") return { changed: false };
    if (definition.status === "ACTIVE") {
      throw new Error("Pause the Automation before retiring it");
    }
    const now = Date.now();
    await ctx.db.patch(definition._id, {
      status: "RETIRED",
      nextRunAt: undefined,
      health: "UNKNOWN",
      updatedAt: now,
    });
    await ctx.db.insert("automationDecisions", {
      projectId: args.projectId,
      automationDefinitionId: definition._id,
      decisionType: "RETIRED",
      actorId: access.actorId,
      actorIdentitySource: access.actorIdentitySource,
      reason: args.reason,
      policyVersion: policyVersionForDefinition(definition),
      definitionVersion: definition.definitionVersion,
      decidedAt: now,
    });
    return { changed: true };
  },
});

export const previewNextRun = query({
  args: { projectId: v.id("projects"), automationDefinitionId: v.id("automationDefinitions") },
  handler: async (ctx, args) => {
    await requireAutomationPermission(ctx, args.projectId, FACTORY_PERMISSIONS.VIEW);
    const definition = await ctx.db.get(args.automationDefinitionId);
    if (!definition || definition.projectId !== args.projectId) throw new Error("Automation is outside the selected workspace");
    return { nextRunAt: definition.nextRunAt ?? nextScheduledAt(Date.now()) };
  },
});
