import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { deriveVerificationStatus, currentWorkflowStepLabel, totalWorkflowRetries } from "./lib/workOrders";
import { ACTIVE_RUN_STATUSES, nextStateForRunStatus, validateDispatchable } from "./lib/workOrderDispatch";
import { resolveFlag } from "./lib/flags";

function generateRunId(): string {
  return Math.random().toString(36).substring(2, 10);
}

async function logWorkOrderEvent(
  ctx: any,
  args: {
    workOrderId: any;
    projectId?: any;
    tenantId?: any;
    workflowRunId?: any;
    eventType:
      | "WORK_ORDER_CREATED"
      | "DISPATCH_REQUESTED"
      | "DISPATCHED"
      | "RUN_COMPLETED"
      | "RUN_FAILED"
      | "RUN_CANCELED"
      | "RUN_RETRIED"
      | "STATE_SYNCED";
    fromState?: string;
    toState?: string;
    actorType: "AGENT" | "HUMAN" | "SYSTEM";
    actorId?: string;
    summary: string;
    idempotencyKey?: string;
    metadata?: any;
  }
) {
  if (args.idempotencyKey) {
    const existing = await ctx.db
      .query("workOrderEvents")
      .withIndex("by_idempotency", (q: any) => q.eq("idempotencyKey", args.idempotencyKey))
      .first();
    if (existing) return existing;
  }

  return await ctx.db.insert("workOrderEvents", {
    tenantId: args.tenantId,
    projectId: args.projectId,
    workOrderId: args.workOrderId,
    workflowRunId: args.workflowRunId,
    idempotencyKey: args.idempotencyKey,
    eventType: args.eventType,
    fromState: args.fromState as any,
    toState: args.toState as any,
    actorType: args.actorType,
    actorId: args.actorId,
    summary: args.summary,
    timestamp: Date.now(),
    metadata: args.metadata,
  });
}

const workOrderRisk = v.union(
  v.literal("LOW"),
  v.literal("MEDIUM"),
  v.literal("HIGH"),
  v.literal("CRITICAL")
);

const workOrderState = v.union(
  v.literal("DRAFT"),
  v.literal("READY"),
  v.literal("DISPATCHED"),
  v.literal("IN_PROGRESS"),
  v.literal("BLOCKED"),
  v.literal("AWAITING_APPROVAL"),
  v.literal("AWAITING_VERIFICATION"),
  v.literal("DONE"),
  v.literal("CANCELED")
);

const verificationStatus = v.union(
  v.literal("PENDING"),
  v.literal("PASS"),
  v.literal("FAIL"),
  v.literal("WAIVED")
);

const approvalStatus = v.union(
  v.literal("NOT_REQUIRED"),
  v.literal("PENDING"),
  v.literal("APPROVED"),
  v.literal("REJECTED"),
  v.literal("CONDITIONAL")
);

const acceptanceCriterion = v.object({
  id: v.string(),
  title: v.string(),
  description: v.optional(v.string()),
  verificationMethod: v.optional(v.union(
    v.literal("MANUAL"),
    v.literal("COMMAND"),
    v.literal("TEST"),
    v.literal("CHECKLIST")
  )),
  status: verificationStatus,
});

const sourceOfTruthRef = v.object({
  kind: v.union(
    v.literal("REPO"),
    v.literal("DOC"),
    v.literal("PRD"),
    v.literal("ISSUE"),
    v.literal("URL")
  ),
  label: v.string(),
  location: v.string(),
});

function summarizeRun(run: any) {
  return {
    _id: run._id,
    runId: run.runId,
    workflowId: run.workflowId,
    status: run.status,
    runtime: run.runtime,
    model: run.model,
    worktree: run.worktree,
    currentStepLabel: currentWorkflowStepLabel(run.steps, run.currentStepIndex),
    retryCount: totalWorkflowRetries(run.steps),
    failureReason: run.failureReason ?? run.steps.find((step: any) => step.status === "FAILED")?.error,
    humanInterventions: run.humanInterventions ?? 0,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
  };
}

async function loadExecutionSummaries(ctx: any, workOrderIds: string[]) {
  const summaries = new Map<string, any[]>();

  await Promise.all(
    workOrderIds.map(async (workOrderId) => {
      const runs = await ctx.db
        .query("workflowRuns")
        .withIndex("by_work_order", (q: any) => q.eq("workOrderId", workOrderId))
        .order("desc")
        .collect();
      summaries.set(workOrderId, runs.map(summarizeRun));
    })
  );

  return summaries;
}

export const list = query({
  args: {
    projectId: v.optional(v.id("projects")),
    state: v.optional(workOrderState),
    riskLevel: v.optional(workOrderRisk),
    repository: v.optional(v.string()),
    assignedAgent: v.optional(v.string()),
    requestedBy: v.optional(v.string()),
    verificationStatus: v.optional(verificationStatus),
    approvalStatus: v.optional(approvalStatus),
    workflowId: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const candidateLimit = Math.max(args.limit ?? 100, 500);
    let rows = args.projectId
      ? await ctx.db
          .query("workOrders")
          .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
          .order("desc")
          .take(candidateLimit)
      : await ctx.db.query("workOrders").order("desc").take(candidateLimit);

    const runMap = await loadExecutionSummaries(ctx, rows.map((row) => row._id));

    if (args.state) rows = rows.filter((row) => row.state === args.state);
    if (args.riskLevel) rows = rows.filter((row) => row.riskLevel === args.riskLevel);
    if (args.repository) rows = rows.filter((row) => row.repository === args.repository);
    if (args.assignedAgent) rows = rows.filter((row) => row.assignedAgent === args.assignedAgent);
    if (args.requestedBy) rows = rows.filter((row) => row.requestedBy === args.requestedBy);
    if (args.verificationStatus) rows = rows.filter((row) => row.verificationStatus === args.verificationStatus);
    if (args.approvalStatus) rows = rows.filter((row) => row.approvalStatus === args.approvalStatus);
    if (args.workflowId) {
      rows = rows.filter((row) => (runMap.get(row._id) ?? []).some((run) => run.workflowId === args.workflowId));
    }

    return rows.map((row) => {
      const runs = runMap.get(row._id) ?? [];
      const latestRun = runs[0] ?? null;
      return {
        ...row,
        linkedExecutionRuns: runs.length,
        latestExecutionRun: latestRun,
      };
    }).slice(0, args.limit ?? candidateLimit);
  },
});

export const get = query({
  args: { workOrderId: v.id("workOrders") },
  handler: async (ctx, args) => {
    const workOrder = await ctx.db.get(args.workOrderId);
    if (!workOrder) return null;

    const executionRuns = await ctx.db
      .query("workflowRuns")
      .withIndex("by_work_order", (q) => q.eq("workOrderId", args.workOrderId))
      .order("desc")
      .collect();
    const events = await ctx.db
      .query("workOrderEvents")
      .withIndex("by_work_order", (q) => q.eq("workOrderId", args.workOrderId))
      .order("desc")
      .collect();

    const legacyTask = workOrder.legacyTaskId ? await ctx.db.get(workOrder.legacyTaskId) : null;
    const project = workOrder.projectId ? await ctx.db.get(workOrder.projectId) : null;

    return {
      workOrder,
      project,
      legacyTask,
      executionRuns: executionRuns.map(summarizeRun),
      events,
    };
  },
});

export const create = mutation({
  args: {
    projectId: v.optional(v.id("projects")),
    legacyTaskId: v.optional(v.id("tasks")),
    idempotencyKey: v.optional(v.string()),
    title: v.string(),
    desiredOutcome: v.string(),
    context: v.optional(v.string()),
    workflowId: v.optional(v.string()),
    repository: v.optional(v.string()),
    branchStrategy: v.optional(v.string()),
    priority: v.optional(v.union(v.literal(1), v.literal(2), v.literal(3), v.literal(4))),
    riskLevel: v.optional(workOrderRisk),
    requestedBy: v.optional(v.string()),
    assignedAgent: v.optional(v.string()),
    assignedSquad: v.optional(v.string()),
    acceptanceCriteria: v.array(acceptanceCriterion),
    constraints: v.optional(v.array(v.string())),
    dependencies: v.optional(v.array(v.string())),
    sourceOfTruthRefs: v.optional(v.array(sourceOfTruthRef)),
    requiredApprovals: v.optional(v.array(v.string())),
    state: v.optional(workOrderState),
    approvalStatus: v.optional(approvalStatus),
    blockingIssue: v.optional(v.string()),
    requiredHumanAction: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    if (args.idempotencyKey) {
      const existing = await ctx.db
        .query("workOrders")
        .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", args.idempotencyKey))
        .first();
      if (existing) return { workOrder: existing, created: false };
    }

    const project = args.projectId ? await ctx.db.get(args.projectId) : null;
    const now = Date.now();
    const finalCriteria = args.acceptanceCriteria.map((criterion) => ({
      ...criterion,
      status: criterion.status ?? "PENDING",
    }));

    const workOrderId = await ctx.db.insert("workOrders", {
      tenantId: project?.tenantId,
      projectId: args.projectId,
      legacyTaskId: args.legacyTaskId,
      idempotencyKey: args.idempotencyKey,
      title: args.title,
      desiredOutcome: args.desiredOutcome,
      context: args.context,
      workflowId: args.workflowId,
      repository: args.repository,
      branchStrategy: args.branchStrategy,
      priority: args.priority ?? 3,
      riskLevel: args.riskLevel ?? "MEDIUM",
      requestedBy: args.requestedBy,
      assignedAgent: args.assignedAgent,
      assignedSquad: args.assignedSquad,
      acceptanceCriteria: finalCriteria,
      constraints: args.constraints,
      dependencies: args.dependencies,
      sourceOfTruthRefs: args.sourceOfTruthRefs,
      requiredApprovals: args.requiredApprovals,
      state: args.state ?? "READY",
      verificationStatus: deriveVerificationStatus(finalCriteria),
      approvalStatus: args.approvalStatus ?? ((args.requiredApprovals?.length ?? 0) > 0 ? "PENDING" : "NOT_REQUIRED"),
      blockingIssue: args.blockingIssue,
      requiredHumanAction: args.requiredHumanAction,
      createdAt: now,
      updatedAt: now,
      metadata: args.metadata,
    });

    const workOrder = await ctx.db.get(workOrderId);

    await ctx.db.insert("activities", {
      tenantId: project?.tenantId,
      projectId: args.projectId,
      actorType: "HUMAN",
      actorId: args.requestedBy,
      action: "WORK_ORDER_CREATED",
      description: `WorkOrder \"${args.title}\" created`,
      targetType: "WORK_ORDER",
      targetId: workOrderId,
      metadata: { repository: args.repository },
    });

    await logWorkOrderEvent(ctx, {
      tenantId: project?.tenantId,
      projectId: args.projectId,
      workOrderId,
      eventType: "WORK_ORDER_CREATED",
      actorType: "HUMAN",
      actorId: args.requestedBy,
      summary: `Created work order ${args.title}`,
      idempotencyKey: args.idempotencyKey ? `${args.idempotencyKey}:created` : undefined,
      metadata: { repository: args.repository, workflowId: args.workflowId },
    });

    return { workOrder, created: true };
  },
});

export const dispatch = mutation({
  args: {
    workOrderId: v.id("workOrders"),
    workflowId: v.optional(v.string()),
    actorType: v.union(v.literal("HUMAN"), v.literal("SYSTEM"), v.literal("AGENT")),
    actorId: v.optional(v.string()),
    idempotencyKey: v.string(),
    runtime: v.optional(v.string()),
    model: v.optional(v.string()),
    worktree: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Feature-gated: work-order dispatch stays off until the delivery
    // control plane is complete (docs/FEATURE_FLAGS.md)
    const flagRows = await ctx.db
      .query("featureFlags")
      .withIndex("by_key", (q) => q.eq("key", "delivery.workorders"))
      .collect();
    if (!resolveFlag(flagRows, "delivery.workorders").enabled) {
      throw new Error(
        'Work-order dispatch is disabled — enable the "delivery.workorders" feature flag'
      );
    }

    const existingEvent = await ctx.db
      .query("workOrderEvents")
      .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", `${args.idempotencyKey}:dispatched`))
      .first();

    if (existingEvent?.workflowRunId) {
      const existingRun = await ctx.db.get(existingEvent.workflowRunId);
      return { created: false, run: existingRun, reason: "idempotent-replay" };
    }

    const workOrder = await ctx.db.get(args.workOrderId);
    if (!workOrder) {
      throw new Error("WorkOrder not found");
    }

    const resolvedWorkflowId = args.workflowId ?? workOrder.workflowId;
    if (!resolvedWorkflowId) {
      throw new Error("WorkOrder cannot be dispatched without a workflowId");
    }

    const workflow = await ctx.db
      .query("workflows")
      .withIndex("by_workflow_id", (q) => q.eq("workflowId", resolvedWorkflowId))
      .first();

    if (!workflow || !workflow.active) {
      throw new Error(`Workflow not available for dispatch: ${resolvedWorkflowId}`);
    }

    const existingRuns = await ctx.db
      .query("workflowRuns")
      .withIndex("by_work_order", (q) => q.eq("workOrderId", args.workOrderId))
      .collect();

    const dispatchable = validateDispatchable({
      state: workOrder.state,
      riskLevel: workOrder.riskLevel,
      approvalStatus: workOrder.approvalStatus,
      requiredApprovals: workOrder.requiredApprovals,
      hasWorkflowId: !!resolvedWorkflowId,
      activeRunStatuses: existingRuns.map((run) => run.status as any),
    });
    if (!dispatchable.ok) {
      throw new Error(`WorkOrder is not dispatchable (${("reason" in dispatchable ? dispatchable.reason : "unknown")})`);
    }

    const steps = workflow.steps.map((step) => ({
      stepId: step.id,
      status: "PENDING" as const,
      taskId: undefined,
      agentId: undefined,
      startedAt: undefined,
      completedAt: undefined,
      retryCount: 0,
      error: undefined,
      output: undefined,
    }));

    await logWorkOrderEvent(ctx, {
      tenantId: workOrder.tenantId,
      projectId: workOrder.projectId,
      workOrderId: workOrder._id,
      eventType: "DISPATCH_REQUESTED",
      fromState: workOrder.state,
      toState: "DISPATCHED",
      actorType: args.actorType,
      actorId: args.actorId,
      summary: `Dispatch requested for workflow ${resolvedWorkflowId}`,
      idempotencyKey: `${args.idempotencyKey}:request`,
      metadata: { runtime: args.runtime, model: args.model, worktree: args.worktree },
    });

    const now = Date.now();
    const runId = generateRunId();
    const runDocId = await ctx.db.insert("workflowRuns", {
      tenantId: workOrder.tenantId,
      runId,
      workflowId: resolvedWorkflowId,
      projectId: workOrder.projectId,
      workOrderId: workOrder._id,
      parentTaskId: workOrder.legacyTaskId,
      status: "PENDING",
      currentStepIndex: 0,
      totalSteps: workflow.steps.length,
      steps,
      context: { workOrderId: workOrder._id, source: "workOrders.dispatch" },
      initialInput: workOrder.desiredOutcome,
      runtime: args.runtime,
      model: args.model,
      worktree: args.worktree,
      startedAt: now,
      metadata: { dispatchIdempotencyKey: args.idempotencyKey },
    });

    await ctx.db.patch(workOrder._id, {
      workflowId: resolvedWorkflowId,
      state: "DISPATCHED",
      currentExecutionRunId: runDocId,
      updatedAt: now,
      blockingIssue: undefined,
      requiredHumanAction: undefined,
    });

    await ctx.db.insert("activities", {
      tenantId: workOrder.tenantId,
      projectId: workOrder.projectId,
      actorType: args.actorType,
      actorId: args.actorId,
      action: "WORK_ORDER_DISPATCHED",
      description: `Dispatched work order ${workOrder.title} via ${resolvedWorkflowId}`,
      targetType: "WORK_ORDER",
      targetId: workOrder._id,
      metadata: { workflowRunId: runDocId, runId },
    });

    await logWorkOrderEvent(ctx, {
      tenantId: workOrder.tenantId,
      projectId: workOrder.projectId,
      workOrderId: workOrder._id,
      workflowRunId: runDocId,
      eventType: "DISPATCHED",
      fromState: workOrder.state,
      toState: "DISPATCHED",
      actorType: args.actorType,
      actorId: args.actorId,
      summary: `Execution run ${runId} created for ${resolvedWorkflowId}`,
      idempotencyKey: `${args.idempotencyKey}:dispatched`,
      metadata: { runId, runtime: args.runtime, model: args.model, worktree: args.worktree },
    });

    const run = await ctx.db.get(runDocId);
    return { created: true, run };
  },
});

export const syncExecutionOutcome = internalMutation({
  args: {
    workflowRunId: v.id("workflowRuns"),
    eventType: v.union(
      v.literal("RUN_COMPLETED"),
      v.literal("RUN_FAILED"),
      v.literal("RUN_CANCELED"),
      v.literal("STATE_SYNCED")
    ),
    summary: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.workflowRunId);
    if (!run?.workOrderId) return { synced: false, reason: "no-linked-work-order" };

    const workOrder = await ctx.db.get(run.workOrderId);
    if (!workOrder) return { synced: false, reason: "work-order-missing" };

    if (workOrder.projectId && run.projectId && workOrder.projectId !== run.projectId) {
      throw new Error("WorkOrder and workflowRun project mismatch");
    }

    const nextState = nextStateForRunStatus({
      currentState: workOrder.state as any,
      runStatus: run.status as any,
      verificationStatus: workOrder.verificationStatus as any,
    });
    const nextPatch: Record<string, unknown> = {
      state: nextState,
      updatedAt: Date.now(),
      currentExecutionRunId: ACTIVE_RUN_STATUSES.includes(run.status as any) ? run._id : undefined,
    };

    if (run.status === "FAILED") {
      nextPatch.blockingIssue = run.failureReason ?? "Execution run failed";
      nextPatch.requiredHumanAction = "Review failure and retry or revise the work order.";
    } else if (run.status === "CANCELED") {
      nextPatch.requiredHumanAction = "Work order canceled. Re-open or replace if value is still desired.";
    } else if (run.status === "COMPLETED") {
      nextPatch.blockingIssue = undefined;
      nextPatch.requiredHumanAction = nextState === "AWAITING_VERIFICATION"
        ? "Record completion evidence against acceptance criteria."
        : undefined;
      if (nextState === "DONE") {
        nextPatch.currentExecutionRunId = undefined;
      }
    } else {
      nextPatch.blockingIssue = undefined;
      nextPatch.requiredHumanAction = undefined;
    }

    await ctx.db.patch(workOrder._id, nextPatch);

    await logWorkOrderEvent(ctx, {
      tenantId: workOrder.tenantId,
      projectId: workOrder.projectId,
      workOrderId: workOrder._id,
      workflowRunId: run._id,
      eventType: args.eventType,
      fromState: workOrder.state,
      toState: nextState,
      actorType: "SYSTEM",
      summary: args.summary ?? `Synchronized work order state from workflow run status ${run.status}`,
      metadata: { workflowRunStatus: run.status, failureReason: run.failureReason },
    });

    return { synced: true, state: nextState };
  },
});

export const recordRetry = internalMutation({
  args: {
    workflowRunId: v.id("workflowRuns"),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.workflowRunId);
    if (!run?.workOrderId) return { synced: false, reason: "no-linked-work-order" };

    const workOrder = await ctx.db.get(run.workOrderId);
    if (!workOrder) return { synced: false, reason: "work-order-missing" };

    await ctx.db.patch(workOrder._id, {
      state: "IN_PROGRESS",
      blockingIssue: undefined,
      requiredHumanAction: undefined,
      currentExecutionRunId: run._id,
      updatedAt: Date.now(),
    });

    await logWorkOrderEvent(ctx, {
      tenantId: workOrder.tenantId,
      projectId: workOrder.projectId,
      workOrderId: workOrder._id,
      workflowRunId: run._id,
      eventType: "RUN_RETRIED",
      fromState: workOrder.state,
      toState: "IN_PROGRESS",
      actorType: "SYSTEM",
      summary: `Retry recorded for workflow run ${run.runId}`,
      metadata: { retryCount: totalWorkflowRetries(run.steps) },
    });

    return { synced: true };
  },
});

export const seedDemo = mutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db
      .query("workOrders")
      .order("desc")
      .take(20);

    if (existing.some((row) => row.metadata?.seedTag === "software-factory-demo")) {
      return { seeded: false, reason: "already-seeded" };
    }

    const firstProject = await ctx.db.query("projects").order("asc").first();
    const now = Date.now();

    const demoOrders = [
      {
        title: "Deliver WorkOrder queue and detail surface",
        desiredOutcome: "Operators can define a work order with acceptance criteria and inspect linked execution runs.",
        context: "MissionControl needs to pivot from agent activity monitoring to software-factory outcome tracking.",
        workflowId: "feature-dev",
        repository: "jaydubya818/MissionControl",
        branchStrategy: "feat/software-factory-workorders in isolated worktree",
        priority: 1 as const,
        riskLevel: "HIGH" as const,
        requestedBy: "Hermes",
        assignedAgent: "Pi",
        assignedSquad: "Software Factory",
        acceptanceCriteria: [
          { id: "ac-1", title: "Work queue renders real work orders", verificationMethod: "MANUAL" as const, status: "PASS" as const },
          { id: "ac-2", title: "Acceptance criteria are visible on detail view", verificationMethod: "MANUAL" as const, status: "PASS" as const },
          { id: "ac-3", title: "Linked execution runs are visible", verificationMethod: "MANUAL" as const, status: "PENDING" as const },
        ],
        constraints: ["No broad rewrite", "Keep Convex as source of truth"],
        sourceOfTruthRefs: [
          { kind: "REPO" as const, label: "MissionControl repo", location: "github.com/jaydubya818/MissionControl" },
          { kind: "DOC" as const, label: "Software factory brief", location: "docs/software-factory/information-architecture.md" },
        ],
        requiredApprovals: ["UI behavior", "Schema change review"],
        state: "IN_PROGRESS" as const,
        approvalStatus: "PENDING" as const,
        requiredHumanAction: "Review schema and UI slice before expanding into analytics.",
      },
      {
        title: "Harden verification traceability",
        desiredOutcome: "Each acceptance criterion is paired with explicit evidence before work can be marked complete.",
        context: "Current MissionControl review surfaces do not yet form a criterion-level traceability matrix.",
        workflowId: "quality-audit",
        repository: "jaydubya818/MissionControl",
        branchStrategy: "verification-receipts follow-up branch",
        priority: 2 as const,
        riskLevel: "MEDIUM" as const,
        requestedBy: "Jay",
        assignedAgent: "Pi",
        assignedSquad: "Quality",
        acceptanceCriteria: [
          { id: "ac-1", title: "VerificationReceipt contract exists", verificationMethod: "CHECKLIST" as const, status: "PENDING" as const },
          { id: "ac-2", title: "Criteria map to evidence", verificationMethod: "TEST" as const, status: "PENDING" as const },
        ],
        constraints: ["Reuse QC and approval infrastructure where practical"],
        sourceOfTruthRefs: [
          { kind: "PRD" as const, label: "Factory requirements", location: "docs/software-factory/domain-contracts.md" },
        ],
        state: "READY" as const,
        approvalStatus: "NOT_REQUIRED" as const,
      },
      {
        title: "Resume blocked SellerFi deployment fix",
        desiredOutcome: "Unblock repository-specific work by clarifying risk, required approval, and next governed run.",
        context: "Current blocked work is visible in task states but not in a software-factory request detail view.",
        workflowId: "bug-fix",
        repository: "jaydubya818/SellerFi",
        branchStrategy: "resume existing worktree and preserve branch history",
        priority: 2 as const,
        riskLevel: "CRITICAL" as const,
        requestedBy: "Hermes",
        assignedAgent: "Pi",
        assignedSquad: "Operations",
        acceptanceCriteria: [
          { id: "ac-1", title: "Blocking issue is explicit", verificationMethod: "MANUAL" as const, status: "FAIL" as const },
          { id: "ac-2", title: "Human attention request is explicit", verificationMethod: "MANUAL" as const, status: "PENDING" as const },
        ],
        constraints: ["Do not deploy without verification evidence"],
        dependencies: ["approval:sellerfi-prod-change"],
        sourceOfTruthRefs: [
          { kind: "REPO" as const, label: "SellerFi", location: "github.com/jaydubya818/SellerFi" },
        ],
        requiredApprovals: ["Production deploy approval"],
        state: "BLOCKED" as const,
        approvalStatus: "PENDING" as const,
        blockingIssue: "Waiting on production verification evidence and deploy approval.",
        requiredHumanAction: "Jay to review production change risk before retry.",
      },
    ];

    const inserted: Array<{ _id: any; title: string }> = [];

    for (const [index, order] of demoOrders.entries()) {
      const workOrderId = await ctx.db.insert("workOrders", {
        tenantId: firstProject?.tenantId,
        projectId: firstProject?._id,
        title: order.title,
        desiredOutcome: order.desiredOutcome,
        context: order.context,
        workflowId: order.workflowId,
        repository: order.repository,
        branchStrategy: order.branchStrategy,
        priority: order.priority,
        riskLevel: order.riskLevel,
        requestedBy: order.requestedBy,
        assignedAgent: order.assignedAgent,
        assignedSquad: order.assignedSquad,
        acceptanceCriteria: order.acceptanceCriteria,
        constraints: order.constraints,
        dependencies: order.dependencies,
        sourceOfTruthRefs: order.sourceOfTruthRefs,
        requiredApprovals: order.requiredApprovals,
        state: order.state,
        verificationStatus: deriveVerificationStatus(order.acceptanceCriteria),
        approvalStatus: order.approvalStatus,
        blockingIssue: order.blockingIssue,
        requiredHumanAction: order.requiredHumanAction,
        createdAt: now - index * 60_000,
        updatedAt: now - index * 45_000,
        metadata: { seedTag: "software-factory-demo" },
      });

      inserted.push({ _id: workOrderId, title: order.title });

      await ctx.db.insert("workflowRuns", {
        tenantId: firstProject?.tenantId,
        runId: `wo-demo-${index + 1}`,
        workflowId: index === 2 ? "bug-fix" : "feature-dev",
        projectId: firstProject?._id,
        workOrderId,
        status: index === 0 ? "RUNNING" : index === 1 ? "PENDING" : "FAILED",
        currentStepIndex: index === 0 ? 2 : index === 1 ? 0 : 1,
        totalSteps: 4,
        steps: [
          { stepId: "plan", status: "DONE", retryCount: 0, startedAt: now - 30_000, completedAt: now - 20_000, taskId: undefined, agentId: undefined, error: undefined, output: "Plan complete" },
          { stepId: "implement", status: index === 2 ? "FAILED" : "DONE", retryCount: index === 2 ? 2 : 0, startedAt: now - 20_000, completedAt: index === 2 ? now - 10_000 : now - 10_000, taskId: undefined, agentId: undefined, error: index === 2 ? "Verification evidence missing" : undefined, output: index === 2 ? undefined : "Implementation complete" },
          { stepId: "verify", status: index === 0 ? "RUNNING" : "PENDING", retryCount: 0, startedAt: index === 0 ? now - 10_000 : undefined, completedAt: undefined, taskId: undefined, agentId: undefined, error: undefined, output: undefined },
          { stepId: "review", status: "PENDING", retryCount: 0, startedAt: undefined, completedAt: undefined, taskId: undefined, agentId: undefined, error: undefined, output: undefined },
        ],
        context: { source: "seedDemo" },
        initialInput: order.desiredOutcome,
        runtime: index === 0 ? "Pi" : "Workflow Executor",
        model: index === 0 ? "claude-sonnet-4.5" : "claude-opus-4.1",
        worktree: index === 2 ? ".worktrees/sellerfi-hotfix" : ".worktrees/mission-control-factory",
        failureReason: index === 2 ? "Blocked pending approval and verification evidence" : undefined,
        humanInterventions: index === 2 ? 1 : 0,
        startedAt: now - (index + 1) * 120_000,
        completedAt: index === 2 ? now - 60_000 : undefined,
        metadata: { seedTag: "software-factory-demo" },
      });
    }

    return {
      seeded: true,
      count: inserted.length,
      items: inserted,
    };
  },
});
