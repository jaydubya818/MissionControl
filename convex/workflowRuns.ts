/**
 * Workflow Runs — Convex Functions
 * 
 * Execution state and progress tracking for multi-agent workflows.
 */

import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { appendOpEvent } from "./lib/armAudit";
import { resolveAgentRef } from "./lib/agentResolver";
import { buildContinuousEvidenceLineage, buildEvidenceLineage, buildFileChanges, buildRetryTimeline, orderRunEvents, summarizeRunEvents } from "./lib/runInspector";
import { summarizeWorkflowObservability } from "./lib/workflowObservability";
import { reconcileTerminalWorkflowSteps } from "./lib/workflowRunState";
import { snapshotWorkflowDefinition } from "./lib/workflowSnapshot";
import { assertAuthorizedDeliveryRecord, requireAuthorizedDeliveryScope } from "./lib/deliveryAuthorization";
import { COMPANY_PERMISSIONS } from "./lib/companyAccess";
import { buildExecutionRecoverySummary } from "./lib/executionRecovery";
import { buildReviewPackage } from "./lib/reviewPackage";

// ============================================================================
// HELPERS
// ============================================================================

function generateRunId(): string {
  // Generate short 8-character ID (similar to Antfarm's run IDs)
  return Math.random().toString(36).substring(2, 10);
}

const runEventType = v.union(
  v.literal("RUN_STARTED"),
  v.literal("EXECUTION_CLAIMED"),
  v.literal("CANCELLATION_REQUESTED"),
  v.literal("POLICY_DEVIATION"),
  v.literal("PULL_REQUEST_CREATED"),
  v.literal("STEP_STARTED"),
  v.literal("STEP_COMPLETED"),
  v.literal("TOOL_CALLED"),
  v.literal("COMMAND_EXECUTED"),
  v.literal("FILE_CHANGED"),
  v.literal("ARTIFACT_CREATED"),
  v.literal("CHECKPOINT_CREATED"),
  v.literal("RETRY_STARTED"),
  v.literal("RETRY_COMPLETED"),
  v.literal("HUMAN_INTERVENTION_REQUESTED"),
  v.literal("RUN_PAUSED"),
  v.literal("RUN_RESUMED"),
  v.literal("RUN_FAILED"),
  v.literal("RUN_CANCELED"),
  v.literal("RUN_COMPLETED")
);

const runArtifactType = v.union(
  v.literal("CODE_DIFF"),
  v.literal("TEST_OUTPUT"),
  v.literal("BUILD_OUTPUT"),
  v.literal("LOG_BUNDLE"),
  v.literal("SCREENSHOT"),
  v.literal("GENERATED_DOCUMENT"),
  v.literal("VERIFICATION_EVIDENCE"),
  v.literal("PULL_REQUEST"),
  v.literal("CHECKPOINT"),
  v.literal("STRUCTURED_OUTPUT"),
  v.literal("OTHER")
);

async function nextSequenceNumber(ctx: any, workflowRunId: any) {
  const events = await ctx.db
    .query("runEvents")
    .withIndex("by_run", (q: any) => q.eq("workflowRunId", workflowRunId))
    .collect();
  return events.reduce((max: number, event: any) => Math.max(max, event.sequenceNumber), 0) + 1;
}

async function insertRunEvent(ctx: any, args: {
  workflowRunId: any;
  workOrderId?: any;
  projectId?: any;
  tenantId?: any;
  idempotencyKey?: string;
  eventType: string;
  workflowStep?: string;
  sequenceNumber?: number;
  actor?: string;
  agentId?: any;
  toolName?: string;
  commandSummary?: string;
  status?: string;
  startedAt?: number;
  endedAt?: number;
  durationMs?: number;
  retryNumber?: number;
  verificationReceiptId?: any;
  evidenceArtifactIds?: any[];
  errorCategory?: string;
  errorSummary?: string;
  metadata?: any;
}) {
  if (args.idempotencyKey) {
    const existing = await ctx.db
      .query("runEvents")
      .withIndex("by_idempotency", (q: any) => q.eq("idempotencyKey", args.idempotencyKey))
      .first();
    if (existing) return { event: existing, created: false };
  }

  const sequenceNumber = args.sequenceNumber ?? await nextSequenceNumber(ctx, args.workflowRunId);
  const startedAt = args.startedAt;
  const endedAt = args.endedAt;
  const durationMs = args.durationMs ?? (startedAt && endedAt ? Math.max(endedAt - startedAt, 0) : undefined);
  const eventId = await ctx.db.insert("runEvents", {
    tenantId: args.tenantId,
    projectId: args.projectId,
    workOrderId: args.workOrderId,
    workflowRunId: args.workflowRunId,
    idempotencyKey: args.idempotencyKey,
    eventType: args.eventType as any,
    workflowStep: args.workflowStep,
    sequenceNumber,
    actor: args.actor,
    agentId: args.agentId,
    toolName: args.toolName,
    commandSummary: args.commandSummary,
    status: args.status,
    startedAt,
    endedAt,
    durationMs,
    retryNumber: args.retryNumber,
    verificationReceiptId: args.verificationReceiptId,
    evidenceArtifactIds: args.evidenceArtifactIds,
    errorCategory: args.errorCategory,
    errorSummary: args.errorSummary,
    metadata: args.metadata,
  });
  return { event: await ctx.db.get(eventId), created: true };
}

async function insertRunArtifact(ctx: any, args: {
  workflowRunId: any;
  workOrderId?: any;
  projectId?: any;
  tenantId?: any;
  idempotencyKey?: string;
  artifactType: string;
  name: string;
  description?: string;
  repositoryPath?: string;
  externalLocation?: string;
  contentHash?: string;
  producer?: string;
  verificationReceiptId?: any;
  acceptanceCriterionId?: string;
  producingEventId?: any;
  retentionPolicy?: string;
  sensitivity?: string;
  metadata?: any;
}) {
  if (args.idempotencyKey) {
    const existing = await ctx.db
      .query("runArtifacts")
      .withIndex("by_idempotency", (q: any) => q.eq("idempotencyKey", args.idempotencyKey))
      .first();
    if (existing) return { artifact: existing, created: false };
  }

  const artifactId = await ctx.db.insert("runArtifacts", {
    tenantId: args.tenantId,
    projectId: args.projectId,
    workOrderId: args.workOrderId,
    workflowRunId: args.workflowRunId,
    idempotencyKey: args.idempotencyKey,
    artifactType: args.artifactType as any,
    name: args.name,
    description: args.description,
    repositoryPath: args.repositoryPath,
    externalLocation: args.externalLocation,
    contentHash: args.contentHash,
    producer: args.producer,
    verificationReceiptId: args.verificationReceiptId,
    acceptanceCriterionId: args.acceptanceCriterionId,
    producingEventId: args.producingEventId,
    retentionPolicy: args.retentionPolicy,
    sensitivity: args.sensitivity,
    createdAt: Date.now(),
    metadata: args.metadata,
  });
  return { artifact: await ctx.db.get(artifactId), created: true };
}

async function appendReceiptArtifactLink(ctx: any, verificationReceiptId: any, artifactId: any) {
  const receipt = await ctx.db.get(verificationReceiptId);
  if (!receipt) return;
  const linked = Array.from(new Set([...(receipt.linkedRunArtifactIds ?? []), artifactId]));
  await ctx.db.patch(verificationReceiptId, { linkedRunArtifactIds: linked });
}

function redactExecutionPrompt<T extends Record<string, any> | null>(run: T): T {
  if (!run?.executionManifest) return run;
  return {
    ...run,
    executionManifest: {
      ...run.executionManifest,
      compiledPrompt: undefined,
    },
  } as T;
}

// ============================================================================
// QUERIES
// ============================================================================

/**
 * List workflow runs
 */
export const list = query({
  args: {
    projectId: v.optional(v.id("projects")),
    repositoryId: v.optional(v.id("workspaceRepositories")),
    workflowId: v.optional(v.string()),
    status: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Build query based on filters
    if (args.repositoryId && args.status) {
      return (await ctx.db
        .query("workflowRuns")
        .withIndex("by_repository_status", (q) =>
          q.eq("repositoryId", args.repositoryId).eq("status", args.status as any)
        )
        .order("desc")
        .take(args.limit ?? 100))
        .filter((run) => !args.projectId || run.projectId === args.projectId)
        .map(redactExecutionPrompt);
    }

    if (args.projectId && args.status) {
      return (await ctx.db
        .query("workflowRuns")
        .withIndex("by_project_status", (q) => 
          q.eq("projectId", args.projectId).eq("status", args.status as any)
        )
        .order("desc")
        .take(args.limit ?? 100)).map(redactExecutionPrompt);
    }
    
    if (args.projectId) {
      return (await ctx.db
        .query("workflowRuns")
        .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
        .order("desc")
        .take(args.limit ?? 100)).map(redactExecutionPrompt);
    }
    
    if (args.workflowId) {
      return (await ctx.db
        .query("workflowRuns")
        .withIndex("by_workflow_id", (q) => q.eq("workflowId", args.workflowId!))
        .order("desc")
        .take(args.limit ?? 100)).map(redactExecutionPrompt);
    }
    
    if (args.status) {
      return (await ctx.db
        .query("workflowRuns")
        .withIndex("by_status", (q) => q.eq("status", args.status as any))
        .order("desc")
        .take(args.limit ?? 100)).map(redactExecutionPrompt);
    }
    
    return (await ctx.db
      .query("workflowRuns")
      .order("desc")
      .take(args.limit ?? 100)).map(redactExecutionPrompt);
  },
});

/**
 * Get a workflow run by run ID
 */
export const get = query({
  args: { runId: v.string() },
  handler: async (ctx, args) => {
    return redactExecutionPrompt(await ctx.db
      .query("workflowRuns")
      .withIndex("by_run_id", (q) => q.eq("runId", args.runId))
      .first());
  },
});

/**
 * Get workflow run by Convex _id
 */
export const getById = query({
  args: { id: v.id("workflowRuns") },
  handler: async (ctx, args) => {
    return redactExecutionPrompt(await ctx.db.get(args.id));
  },
});

export const listEvents = query({
  args: { workflowRunId: v.id("workflowRuns") },
  handler: async (ctx, args) => {
    const events = await ctx.db
      .query("runEvents")
      .withIndex("by_run_sequence", (q) => q.eq("workflowRunId", args.workflowRunId))
      .collect();
    return orderRunEvents(events as any);
  },
});

export const listArtifacts = query({
  args: { workflowRunId: v.id("workflowRuns") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("runArtifacts")
      .withIndex("by_run", (q) => q.eq("workflowRunId", args.workflowRunId))
      .order("desc")
      .collect();
  },
});

export const getInspector = query({
  args: {
    workflowRunId: v.id("workflowRuns"),
    verificationReceiptId: v.optional(v.id("verificationReceipts")),
    acceptanceCriterionId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.workflowRunId);
    if (!run) return null;

    const workOrder = run.workOrderId ? await ctx.db.get(run.workOrderId) : null;
    const access = await requireAuthorizedDeliveryScope(ctx, workOrder?.projectId ?? run.projectId);
    if (workOrder) assertAuthorizedDeliveryRecord(access, workOrder);

    const [installedWorkflow, events, artifacts, receipts, verificationRuns, evidenceEnvelopes, linkedAgentRuns] = await Promise.all([
      ctx.db.query("workflows").withIndex("by_workflow_id", (q) => q.eq("workflowId", run.workflowId)).first(),
      ctx.db.query("runEvents").withIndex("by_run_sequence", (q) => q.eq("workflowRunId", run._id)).collect(),
      ctx.db.query("runArtifacts").withIndex("by_run", (q) => q.eq("workflowRunId", run._id)).order("desc").collect(),
      run.workOrderId
        ? ctx.db.query("verificationReceipts").withIndex("by_run", (q) => q.eq("workflowRunId", run._id)).collect()
        : [],
      run.workOrderId
        ? ctx.db.query("verificationRuns").withIndex("by_run", (q) => q.eq("workflowRunId", run._id)).order("desc").collect()
        : [],
      run.workOrderId
        ? ctx.db.query("evidenceEnvelopes").withIndex("by_run", (q) => q.eq("workflowRunId", run._id)).order("desc").collect()
        : [],
      ctx.db.query("runs").withIndex("by_workflow_run", (q) => q.eq("workflowRunId", run._id)).take(201),
    ]);

    const orderedEvents = orderRunEvents(events as any);
    const eventSummary = summarizeRunEvents(orderedEvents as any);
    const fileChanges = buildFileChanges(orderedEvents as any);
    const retryTimeline = buildRetryTimeline(orderedEvents as any);
    const evidenceLineage = buildEvidenceLineage({
      verificationReceiptId: args.verificationReceiptId ?? null,
      acceptanceCriterionId: args.acceptanceCriterionId ?? null,
      events: orderedEvents as any,
      artifacts: artifacts as any,
    });
    const approvalId = typeof run.context?.approvalId === "string"
      ? ctx.db.normalizeId("approvals", run.context.approvalId)
      : null;
    const approval = approvalId ? await ctx.db.get(approvalId) : null;
    const continuousEvidenceLineage = buildContinuousEvidenceLineage({
      context: run.context,
      approval: approval as any,
      fileChanges,
      artifacts: artifacts as any,
      receipts: receipts as any,
    });
    const [workOrderReceipts, prChecks, missionPlan, factoryVersion] = await Promise.all([
      workOrder
        ? ctx.db.query("verificationReceipts").withIndex("by_work_order", (q) => q.eq("workOrderId", workOrder._id)).collect()
        : [],
      workOrder
        ? ctx.db.query("harnessPrChecks").withIndex("by_work_order", (q) => q.eq("workOrderId", workOrder._id)).collect()
        : [],
      workOrder?.missionPlanId ? ctx.db.get(workOrder.missionPlanId) : null,
      run.factoryDefinitionVersionId ? ctx.db.get(run.factoryDefinitionVersionId) : null,
    ]);
    const configuredMaxAttempts = Number(
      workOrder?.metadata?.implementationPolicy?.maxAttempts
      ?? factoryVersion?.budget?.maxAttempts,
    );
    const recovery = buildExecutionRecoverySummary({
      run,
      now: Date.now(),
      maxAttempts: Number.isFinite(configuredMaxAttempts) ? configuredMaxAttempts : null,
    });
    const reviewPackage = buildReviewPackage({
      now: Date.now(),
      run,
      workOrder,
      receipts: workOrderReceipts,
      prChecks,
      events: orderedEvents,
      fileChanges,
      rollbackApproach: missionPlan?.rollbackApproach
        ?? (typeof workOrder?.metadata?.rollbackApproach === "string"
          ? workOrder.metadata.rollbackApproach
          : null),
    });
    const inspectorRun = run.executionManifest
      ? {
          ...run,
          executionManifest: {
            ...(run.executionManifest as Record<string, unknown>),
            compiledPrompt: undefined,
          },
        }
      : run;

    return {
      run: inspectorRun,
      workflow: run.workflowSnapshot ?? installedWorkflow,
      workOrder,
      events: orderedEvents,
      artifacts,
      verificationReceipts: receipts,
      verificationRuns,
      evidenceEnvelopes,
      summary: {
        revisionNumber: run.workOrderRevisionNumber ?? null,
        currentStep: run.steps[run.currentStepIndex]?.stepId ?? null,
        durationMs: (run.completedAt ?? Date.now()) - run.startedAt,
        retryCount: eventSummary.retryCount,
        humanInterventionRequired: eventSummary.humanInterventionRequired,
        failureSummary: run.failureReason ?? eventSummary.failure,
        blockingIssue: workOrder?.blockingIssue ?? run.failureReason ?? null,
      },
      observability: summarizeWorkflowObservability({
        workflowRun: run,
        agentRuns: linkedAgentRuns.slice(0, 200),
        now: Date.now(),
        truncated: linkedAgentRuns.length > 200,
      }),
      fileChanges,
      retryTimeline,
      evidenceLineage,
      continuousEvidenceLineage,
      recovery,
      reviewPackage,
    };
  },
});

/**
 * Search workflow runs by query string (matches runId or initial input)
 */
export const search = query({
  args: {
    query: v.string(),
    projectId: v.optional(v.id("projects")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let runs = await ctx.db
      .query("workflowRuns")
      .order("desc")
      .take(args.limit ?? 100);
    
    if (args.projectId) {
      runs = runs.filter((r) => r.projectId === args.projectId);
    }
    
    const lowerQuery = args.query.toLowerCase();
    return runs.filter((r) =>
      r.runId.toLowerCase().includes(lowerQuery) ||
      r.initialInput.toLowerCase().includes(lowerQuery)
    );
  },
});

// ============================================================================
// MUTATIONS
// ============================================================================

/**
 * Start a new workflow run
 */
export const start = mutation({
  args: {
    workflowId: v.string(),
    projectId: v.optional(v.id("projects")),
    workOrderId: v.optional(v.id("workOrders")),
    workOrderRevisionNumber: v.optional(v.number()),
    workOrderRevisionId: v.optional(v.id("workOrderRevisions")),
    parentTaskId: v.optional(v.id("tasks")),
    initialInput: v.string(),
    runtime: v.optional(v.string()),
    model: v.optional(v.string()),
    worktree: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Get workflow definition
    const workflow = await ctx.db
      .query("workflows")
      .withIndex("by_workflow_id", (q) => q.eq("workflowId", args.workflowId))
      .first();
    
    if (!workflow) {
      throw new Error(`Workflow not found: ${args.workflowId}`);
    }
    
    if (!workflow.active) {
      throw new Error(`Workflow is not active: ${args.workflowId}`);
    }
    
    // Initialize step states
    const topology = workflow.topology ?? "LINEAR";
    const steps = workflow.steps.map((step, index) => ({
      stepId: step.id,
      status: "PENDING" as const,
      dependsOn:
        step.dependsOn ??
        (topology === "LINEAR" && index > 0 ? [workflow.steps[index - 1].id] : []),
      kind: step.kind ?? "AGENT",
      modelTier: step.modelTier,
      isolation: step.isolation,
      failurePolicy: step.failurePolicy ?? "RETRY",
      conditionResult: undefined,
      structuredOutput: undefined,
      taskId: undefined,
      agentId: undefined,
      startedAt: undefined,
      completedAt: undefined,
      retryCount: 0,
      error: undefined,
      output: undefined,
    }));
    
    const now = Date.now();
    const runId = generateRunId();
    const workflowSnapshot = snapshotWorkflowDefinition(workflow);
    
    // Create workflow run
    const id = await ctx.db.insert("workflowRuns", {
      runId,
      workflowId: args.workflowId,
      workflowVersion: workflow.version,
      workflowSnapshot,
      projectId: args.projectId,
      workOrderId: args.workOrderId,
      workOrderRevisionNumber: args.workOrderRevisionNumber,
      workOrderRevisionId: args.workOrderRevisionId,
      parentTaskId: args.parentTaskId,
      status: "PENDING",
      currentStepIndex: 0,
      totalSteps: workflow.steps.length,
      steps,
      context: { task: args.initialInput },
      topology,
      maxConcurrency: workflow.maxConcurrency ?? 1,
      initialInput: args.initialInput,
      runtime: args.runtime,
      model: args.model,
      worktree: args.worktree,
      startedAt: now,
    });
    await appendOpEvent(ctx.db as any, {
      tenantId: undefined,
      projectId: args.projectId,
      workflowRunId: id,
      type: "WORKFLOW_STEP_STARTED",
      payload: {
        runId,
        workflowId: args.workflowId,
        stepIndex: 0,
      },
    });
    
    // Log activity
    await ctx.db.insert("activities", {
      projectId: args.projectId,
      actorType: "SYSTEM",
      action: "WORKFLOW_STARTED",
      description: `Started workflow run ${runId} for ${workflow.name}`,
      targetType: "WORKFLOW_RUN",
      targetId: id,
      metadata: {
        workflowId: args.workflowId,
        runId,
        initialInput: args.initialInput,
      },
    });

    await insertRunEvent(ctx, {
      workflowRunId: id,
      workOrderId: args.workOrderId,
      projectId: args.projectId,
      eventType: "RUN_STARTED",
      workflowStep: workflow.steps[0]?.id,
      actor: "system",
      status: "PENDING",
      startedAt: now,
      commandSummary: `Workflow ${args.workflowId} created`,
      metadata: { runId, workflowId: args.workflowId, initialInput: args.initialInput },
      idempotencyKey: `run-start:${runId}`,
    });
    
    return { runId, id };
  },
});

export const recordEvent = mutation({
  args: {
    workflowRunId: v.id("workflowRuns"),
    idempotencyKey: v.optional(v.string()),
    eventType: runEventType,
    workflowStep: v.optional(v.string()),
    sequenceNumber: v.optional(v.number()),
    actor: v.optional(v.string()),
    agentId: v.optional(v.id("agents")),
    toolName: v.optional(v.string()),
    commandSummary: v.optional(v.string()),
    status: v.optional(v.string()),
    startedAt: v.optional(v.number()),
    endedAt: v.optional(v.number()),
    durationMs: v.optional(v.number()),
    retryNumber: v.optional(v.number()),
    verificationReceiptId: v.optional(v.id("verificationReceipts")),
    evidenceArtifactIds: v.optional(v.array(v.id("runArtifacts"))),
    errorCategory: v.optional(v.string()),
    errorSummary: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.workflowRunId);
    if (!run) throw new Error("Workflow run not found");

    const result = await insertRunEvent(ctx, {
      ...args,
      workOrderId: run.workOrderId,
      projectId: run.projectId,
      tenantId: run.tenantId,
    });

    if (args.eventType === "HUMAN_INTERVENTION_REQUESTED") {
      await ctx.db.patch(run._id, { humanInterventions: (run.humanInterventions ?? 0) + 1 });
    }
    if (args.eventType === "RUN_PAUSED") {
      await ctx.db.patch(run._id, { status: "PAUSED" });
    }
    if (args.eventType === "RUN_RESUMED") {
      await ctx.db.patch(run._id, { status: "RUNNING" });
    }

    return result;
  },
});

export const recordEventInternal = internalMutation({
  args: {
    workflowRunId: v.id("workflowRuns"),
    idempotencyKey: v.optional(v.string()),
    eventType: runEventType,
    workflowStep: v.optional(v.string()),
    sequenceNumber: v.optional(v.number()),
    actor: v.optional(v.string()),
    agentId: v.optional(v.id("agents")),
    toolName: v.optional(v.string()),
    commandSummary: v.optional(v.string()),
    status: v.optional(v.string()),
    startedAt: v.optional(v.number()),
    endedAt: v.optional(v.number()),
    durationMs: v.optional(v.number()),
    retryNumber: v.optional(v.number()),
    verificationReceiptId: v.optional(v.id("verificationReceipts")),
    evidenceArtifactIds: v.optional(v.array(v.id("runArtifacts"))),
    errorCategory: v.optional(v.string()),
    errorSummary: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.workflowRunId);
    if (!run) throw new Error("Workflow run not found");
    return await insertRunEvent(ctx, {
      ...args,
      workOrderId: run.workOrderId,
      projectId: run.projectId,
      tenantId: run.tenantId,
    });
  },
});

export const createArtifact = mutation({
  args: {
    workflowRunId: v.id("workflowRuns"),
    idempotencyKey: v.optional(v.string()),
    artifactType: runArtifactType,
    name: v.string(),
    description: v.optional(v.string()),
    repositoryPath: v.optional(v.string()),
    externalLocation: v.optional(v.string()),
    contentHash: v.optional(v.string()),
    producer: v.optional(v.string()),
    verificationReceiptId: v.optional(v.id("verificationReceipts")),
    acceptanceCriterionId: v.optional(v.string()),
    producingEventId: v.optional(v.id("runEvents")),
    retentionPolicy: v.optional(v.string()),
    sensitivity: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.workflowRunId);
    if (!run) throw new Error("Workflow run not found");
    const result = await insertRunArtifact(ctx, {
      ...args,
      workOrderId: run.workOrderId,
      projectId: run.projectId,
      tenantId: run.tenantId,
    });
    if (result.created && args.verificationReceiptId) {
      await appendReceiptArtifactLink(ctx, args.verificationReceiptId, result.artifact._id);
    }
    if (result.created) {
      await insertRunEvent(ctx, {
        workflowRunId: run._id,
        workOrderId: run.workOrderId,
        projectId: run.projectId,
        tenantId: run.tenantId,
        eventType: args.artifactType === "CHECKPOINT" ? "CHECKPOINT_CREATED" : "ARTIFACT_CREATED",
        workflowStep: run.steps[run.currentStepIndex]?.stepId,
        actor: args.producer,
        status: "COMPLETED",
        commandSummary: args.name,
        evidenceArtifactIds: [result.artifact._id],
        verificationReceiptId: args.verificationReceiptId,
        metadata: { artifactType: args.artifactType, repositoryPath: args.repositoryPath, externalLocation: args.externalLocation },
        idempotencyKey: args.idempotencyKey ? `${args.idempotencyKey}:event` : undefined,
      });
    }
    return result;
  },
});

export const linkArtifactToVerificationReceipt = mutation({
  args: {
    runArtifactId: v.id("runArtifacts"),
    verificationReceiptId: v.id("verificationReceipts"),
  },
  handler: async (ctx, args) => {
    const [artifact, receipt] = await Promise.all([
      ctx.db.get(args.runArtifactId),
      ctx.db.get(args.verificationReceiptId),
    ]);
    if (!artifact || !receipt) throw new Error("Artifact or verification receipt not found");
    if (artifact.workflowRunId !== receipt.workflowRunId || artifact.workOrderId !== receipt.workOrderId) {
      throw new Error("Artifact and verification receipt must belong to the same run and work order");
    }
    await ctx.db.patch(args.runArtifactId, {
      verificationReceiptId: receipt._id,
      acceptanceCriterionId: receipt.acceptanceCriterionId,
    });
    await appendReceiptArtifactLink(ctx, receipt._id, artifact._id);
    return await ctx.db.get(args.runArtifactId);
  },
});

/**
 * Update step status
 */
export const updateStep = mutation({
  args: {
    runId: v.string(),
    stepIndex: v.number(),
    status: v.union(
      v.literal("PENDING"),
      v.literal("RUNNING"),
      v.literal("DONE"),
      v.literal("FAILED"),
      v.literal("SKIPPED"),
      v.literal("BLOCKED")
    ),
    taskId: v.optional(v.id("tasks")),
    agentId: v.optional(v.id("agents")),
    error: v.optional(v.string()),
    output: v.optional(v.string()),
    structuredOutput: v.optional(v.any()),
    conditionResult: v.optional(v.boolean()),
    failureReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db
      .query("workflowRuns")
      .withIndex("by_run_id", (q) => q.eq("runId", args.runId))
      .first();
    
    if (!run) {
      throw new Error(`Workflow run not found: ${args.runId}`);
    }
    
    const steps = [...run.steps];
    const step = steps[args.stepIndex];
    
    if (!step) {
      throw new Error(`Step index out of bounds: ${args.stepIndex}`);
    }
    
    const now = Date.now();
    
    // Update step
    steps[args.stepIndex] = {
      ...step,
      status: args.status as any,
      taskId: args.taskId ?? step.taskId,
      agentId: args.agentId ?? step.agentId,
      startedAt: args.status === "RUNNING" ? now : step.startedAt,
      completedAt: (args.status === "DONE" || args.status === "FAILED") ? now : step.completedAt,
      error: args.error ?? step.error,
      output: args.output ?? step.output,
      structuredOutput: args.structuredOutput ?? step.structuredOutput,
      conditionResult: args.conditionResult ?? step.conditionResult,
    };
    
    await ctx.db.patch(run._id, {
      steps,
      failureReason: args.failureReason ?? run.failureReason,
    });
    const instanceRef = args.agentId
      ? await resolveAgentRef({ db: ctx.db as any }, { agentId: args.agentId, createIfMissing: true })
      : null;
    if (args.status === "RUNNING") {
      await ctx.db.patch(run._id, { status: "RUNNING", currentStepIndex: args.stepIndex });
      await insertRunEvent(ctx, {
        workflowRunId: run._id,
        workOrderId: run.workOrderId,
        projectId: run.projectId,
        tenantId: run.tenantId,
        eventType: "STEP_STARTED",
        workflowStep: step.stepId,
        actor: args.agentId ? "agent" : "system",
        agentId: args.agentId,
        status: "RUNNING",
        startedAt: now,
        retryNumber: step.retryCount,
        idempotencyKey: `step-start:${run.runId}:${args.stepIndex}:${step.retryCount}`,
      });
      if (run.workOrderId) {
        await ctx.runMutation(internal.workOrders.syncExecutionOutcome, {
          workflowRunId: run._id,
          eventType: "STATE_SYNCED",
          summary: `Workflow run ${run.runId} is running`,
        });
      }
      await appendOpEvent(ctx.db as any, {
        tenantId: run.tenantId,
        projectId: run.projectId,
        workflowRunId: run._id,
        taskId: args.taskId,
        instanceId: instanceRef?.instanceId,
        versionId: instanceRef?.versionId,
        type: "WORKFLOW_STEP_STARTED",
        payload: {
          runId: args.runId,
          stepIndex: args.stepIndex,
          stepId: step.stepId,
        },
      });
    } else if (args.status === "DONE") {
      await insertRunEvent(ctx, {
        workflowRunId: run._id,
        workOrderId: run.workOrderId,
        projectId: run.projectId,
        tenantId: run.tenantId,
        eventType: "STEP_COMPLETED",
        workflowStep: step.stepId,
        actor: args.agentId ? "agent" : "system",
        agentId: args.agentId,
        status: "COMPLETED",
        startedAt: step.startedAt,
        endedAt: now,
        retryNumber: step.retryCount,
        commandSummary: args.output,
        idempotencyKey: `step-complete:${run.runId}:${args.stepIndex}:${step.retryCount}`,
      });
      if (step.retryCount > 0) {
        await insertRunEvent(ctx, {
          workflowRunId: run._id,
          workOrderId: run.workOrderId,
          projectId: run.projectId,
          tenantId: run.tenantId,
          eventType: "RETRY_COMPLETED",
          workflowStep: step.stepId,
          actor: args.agentId ? "agent" : "system",
          agentId: args.agentId,
          status: "COMPLETED",
          retryNumber: step.retryCount,
          commandSummary: args.output,
          idempotencyKey: `retry-complete:${run.runId}:${args.stepIndex}:${step.retryCount}`,
        });
      }
      await appendOpEvent(ctx.db as any, {
        tenantId: run.tenantId,
        projectId: run.projectId,
        workflowRunId: run._id,
        taskId: args.taskId,
        instanceId: instanceRef?.instanceId,
        versionId: instanceRef?.versionId,
        type: "WORKFLOW_STEP_COMPLETED",
        payload: {
          runId: args.runId,
          stepIndex: args.stepIndex,
          stepId: step.stepId,
        },
      });
    } else if (args.status === "FAILED") {
      if (step.retryCount > 0) {
        await insertRunEvent(ctx, {
          workflowRunId: run._id,
          workOrderId: run.workOrderId,
          projectId: run.projectId,
          tenantId: run.tenantId,
          eventType: "RETRY_COMPLETED",
          workflowStep: step.stepId,
          actor: args.agentId ? "agent" : "system",
          agentId: args.agentId,
          status: "FAILED",
          retryNumber: step.retryCount,
          errorSummary: args.failureReason ?? args.error ?? run.failureReason,
          idempotencyKey: `retry-complete:${run.runId}:${args.stepIndex}:${step.retryCount}`,
        });
      }
      await appendOpEvent(ctx.db as any, {
        tenantId: run.tenantId,
        projectId: run.projectId,
        workflowRunId: run._id,
        taskId: args.taskId,
        instanceId: instanceRef?.instanceId,
        versionId: instanceRef?.versionId,
        type: "WORKFLOW_STEP_FAILED",
        payload: {
          runId: args.runId,
          stepIndex: args.stepIndex,
          stepId: step.stepId,
          error: args.error,
        },
      });
    }

    return { success: true };
  },
});

/**
 * Advance workflow to next step
 */
export const advance = mutation({
  args: {
    runId: v.string(),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db
      .query("workflowRuns")
      .withIndex("by_run_id", (q) => q.eq("runId", args.runId))
      .first();
    
    if (!run) {
      throw new Error(`Workflow run not found: ${args.runId}`);
    }
    
    const nextIndex = run.currentStepIndex + 1;
    
    if (nextIndex >= run.totalSteps) {
      // Workflow complete
      await ctx.db.patch(run._id, {
        status: "COMPLETED",
        completedAt: Date.now(),
      });

      await insertRunEvent(ctx, {
        workflowRunId: run._id,
        workOrderId: run.workOrderId,
        projectId: run.projectId,
        tenantId: run.tenantId,
        eventType: "RUN_COMPLETED",
        workflowStep: run.steps[run.currentStepIndex]?.stepId,
        actor: "system",
        status: "COMPLETED",
        startedAt: run.startedAt,
        endedAt: Date.now(),
        idempotencyKey: `run-complete:${run.runId}`,
      });

      if (run.workOrderId) {
        await ctx.runMutation(internal.workOrders.syncExecutionOutcome, {
          workflowRunId: run._id,
          eventType: "RUN_COMPLETED",
          summary: `Workflow run ${run.runId} completed`,
        });
      }
      
      return { complete: true };
    }
    
    // Move to next step
    await ctx.db.patch(run._id, {
      currentStepIndex: nextIndex,
    });
    
    return { complete: false, nextIndex };
  },
});

/**
 * Durable operator cancellation. Active workers observe this through their
 * signed heartbeat; unclaimed/expired work is canceled immediately.
 */
export const requestCancellation = mutation({
  args: {
    workflowRunId: v.id("workflowRuns"),
    reason: v.string(),
    actorId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.workflowRunId);
    if (!run) throw new Error("Workflow run not found");
    if (!run.workOrderId) throw new Error("Only WorkOrder execution runs can be canceled here.");
    const workOrder = await ctx.db.get(run.workOrderId);
    if (!workOrder) throw new Error("Linked WorkOrder not found");
    const access = await requireAuthorizedDeliveryScope(ctx, workOrder.projectId, COMPANY_PERMISSIONS.UPDATE_DELIVERY);
    assertAuthorizedDeliveryRecord(access, workOrder);
    if (["COMPLETED", "FAILED", "CANCELED"].includes(run.status)) {
      return { requested: false, status: run.status };
    }
    const now = Date.now();
    const reason = args.reason.trim();
    if (!reason) throw new Error("A cancellation reason is required.");
    if (run.factoryContinuation?.status === "PUBLICATION_AUTHORIZED") {
      return {
        requested: false,
        status: run.status,
        reason: "Publication is already authorized and must reconcile the exact provider write before cancellation can be evaluated.",
      };
    }
    await ctx.db.patch(run._id, {
      cancellationRequestedAt: run.cancellationRequestedAt ?? now,
      cancellationRequestedBy: args.actorId ?? "operator",
      checkpointSummary: `Cancellation requested: ${reason}`,
      checkpointAt: now,
    });
    await insertRunEvent(ctx, {
      workflowRunId: run._id,
      workOrderId: run.workOrderId,
      projectId: run.projectId,
      tenantId: run.tenantId,
      eventType: "CANCELLATION_REQUESTED",
      workflowStep: run.steps[run.currentStepIndex]?.stepId,
      actor: args.actorId ?? "operator",
      status: "PENDING",
      startedAt: now,
      commandSummary: reason,
      idempotencyKey: `cancellation-request:${run._id}`,
    });
    const hasActiveLease = Boolean(run.executionClaimId && (run.executionLeaseExpiresAt ?? 0) > now);
    const isFactoryAttempt = Boolean(run.factoryDefinitionVersionId && run.executionManifestDigest);
    if (hasActiveLease && !isFactoryAttempt) return { requested: true, status: run.status };

    if (isFactoryAttempt && run.factoryContinuation) {
      const continuation = run.factoryContinuation;
      if (continuation.approvalDecisionId) {
        const approval = await ctx.db.get(continuation.approvalDecisionId);
        if (approval && ["PENDING", "APPROVED"].includes(approval.status)) {
          await ctx.db.patch(approval._id, {
            status: "REVOKED",
            decidedAt: now,
            revokedAt: now,
            reason,
          });
        }
      }
      for (const receiptId of [continuation.verificationReceiptId, continuation.resolvedVerificationReceiptId]) {
        if (!receiptId) continue;
        const receipt = await ctx.db.get(receiptId);
        if (receipt && receipt.status !== "STALE") {
          await ctx.db.patch(receipt._id, {
            status: "STALE",
            invalidatedAt: now,
            invalidationReason: reason,
          });
        }
      }
    }

    const steps = reconcileTerminalWorkflowSteps(run.steps, "CANCELED", reason, now);
    await ctx.db.patch(run._id, {
      status: "CANCELED",
      steps,
      completedAt: now,
      failureReason: reason,
      executionPhase: "TERMINAL",
      executionLeaseExpiresAt: now,
      lease: undefined,
      factoryContinuation: run.factoryContinuation
        ? {
            ...run.factoryContinuation,
            status: "CLOSED",
            closedAt: now,
            closureReason: reason,
          }
        : undefined,
    });
    await insertRunEvent(ctx, {
      workflowRunId: run._id,
      workOrderId: run.workOrderId,
      projectId: run.projectId,
      tenantId: run.tenantId,
      eventType: "RUN_CANCELED",
      workflowStep: run.steps[run.currentStepIndex]?.stepId,
      actor: args.actorId ?? "operator",
      status: "CANCELED",
      startedAt: run.startedAt,
      endedAt: now,
      errorSummary: reason,
      idempotencyKey: `run-canceled:${run._id}`,
    });
    await ctx.runMutation(internal.workOrders.syncExecutionOutcome, {
      workflowRunId: run._id,
      eventType: "RUN_CANCELED",
      summary: `Workflow run ${run.runId} canceled before execution claim.`,
    });
    return { requested: true, status: "CANCELED" as const };
  },
});

/**
 * Update workflow run status
 */
export const updateStatus = mutation({
  args: {
    runId: v.string(),
    status: v.string(),
    failureReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db
      .query("workflowRuns")
      .withIndex("by_run_id", (q) => q.eq("runId", args.runId))
      .first();
    
    if (!run) {
      throw new Error(`Workflow run not found: ${args.runId}`);
    }
    
    const updates: any = {
      status: args.status,
    };

    if (args.failureReason !== undefined) {
      updates.failureReason = args.failureReason;
    }
    
    if (args.status === "COMPLETED" || args.status === "FAILED") {
      updates.completedAt = Date.now();
    }

    if (args.status === "CANCELED") {
      updates.completedAt = Date.now();
    }

    if (args.status === "FAILED" || args.status === "CANCELED") {
      updates.steps = reconcileTerminalWorkflowSteps(
        run.steps,
        args.status,
        args.failureReason,
        updates.completedAt
      );
    }
    
    await ctx.db.patch(run._id, updates);

    if (args.status === "PAUSED") {
      await insertRunEvent(ctx, {
        workflowRunId: run._id,
        workOrderId: run.workOrderId,
        projectId: run.projectId,
        tenantId: run.tenantId,
        eventType: "RUN_PAUSED",
        workflowStep: run.steps[run.currentStepIndex]?.stepId,
        actor: "system",
        status: "PAUSED",
        startedAt: run.startedAt,
        endedAt: Date.now(),
        errorSummary: args.failureReason,
        idempotencyKey: `run-paused:${run.runId}:${Date.now()}`,
      });
    }

    if (args.status === "RUNNING" && run.status === "PAUSED") {
      await insertRunEvent(ctx, {
        workflowRunId: run._id,
        workOrderId: run.workOrderId,
        projectId: run.projectId,
        tenantId: run.tenantId,
        eventType: "RUN_RESUMED",
        workflowStep: run.steps[run.currentStepIndex]?.stepId,
        actor: "system",
        status: "RUNNING",
        startedAt: Date.now(),
        idempotencyKey: `run-resumed:${run.runId}:${Date.now()}`,
      });
    }

    if (args.status === "FAILED") {
      await insertRunEvent(ctx, {
        workflowRunId: run._id,
        workOrderId: run.workOrderId,
        projectId: run.projectId,
        tenantId: run.tenantId,
        eventType: "RUN_FAILED",
        workflowStep: run.steps[run.currentStepIndex]?.stepId,
        actor: "system",
        status: "FAILED",
        startedAt: run.startedAt,
        endedAt: updates.completedAt,
        errorCategory: "RUN_FAILURE",
        errorSummary: args.failureReason,
        idempotencyKey: `run-failed:${run.runId}`,
      });
      await ctx.scheduler.runAfter(0, internal.factory.metaLoop.ingestWorkflowFailure, {
        workflowRunId: run._id,
      });
    }

    if (args.status === "COMPLETED") {
      await insertRunEvent(ctx, {
        workflowRunId: run._id,
        workOrderId: run.workOrderId,
        projectId: run.projectId,
        tenantId: run.tenantId,
        eventType: "RUN_COMPLETED",
        workflowStep: run.steps[run.currentStepIndex]?.stepId,
        actor: "system",
        status: "COMPLETED",
        startedAt: run.startedAt,
        endedAt: updates.completedAt,
        idempotencyKey: `run-complete:${run.runId}`,
      });
    }

    if (run.workOrderId) {
      await ctx.runMutation(internal.workOrders.syncExecutionOutcome, {
        workflowRunId: run._id,
        eventType:
          args.status === "COMPLETED"
            ? "RUN_COMPLETED"
            : args.status === "FAILED"
              ? "RUN_FAILED"
              : args.status === "CANCELED"
                ? "RUN_CANCELED"
                : "STATE_SYNCED",
        summary: `Workflow run ${run.runId} status changed to ${args.status}`,
      });
    }
    
    return { success: true };
  },
});

/**
 * Update workflow context (variables passed between steps)
 */
export const updateContext = mutation({
  args: {
    runId: v.string(),
    context: v.any(),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db
      .query("workflowRuns")
      .withIndex("by_run_id", (q) => q.eq("runId", args.runId))
      .first();
    
    if (!run) {
      throw new Error(`Workflow run not found: ${args.runId}`);
    }
    
    await ctx.db.patch(run._id, {
      context: { ...run.context, ...args.context },
    });
    
    return { success: true };
  },
});

/**
 * Increment retry count for a step
 */
export const incrementRetry = mutation({
  args: {
    runId: v.string(),
    stepIndex: v.number(),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db
      .query("workflowRuns")
      .withIndex("by_run_id", (q) => q.eq("runId", args.runId))
      .first();
    
    if (!run) {
      throw new Error(`Workflow run not found: ${args.runId}`);
    }
    
    const steps = [...run.steps];
    const step = steps[args.stepIndex];
    
    if (!step) {
      throw new Error(`Step index out of bounds: ${args.stepIndex}`);
    }
    
    steps[args.stepIndex] = {
      ...step,
      retryCount: step.retryCount + 1,
    };
    
    await ctx.db.patch(run._id, { steps });

    await insertRunEvent(ctx, {
      workflowRunId: run._id,
      workOrderId: run.workOrderId,
      projectId: run.projectId,
      tenantId: run.tenantId,
      eventType: "RETRY_STARTED",
      workflowStep: step.stepId,
      actor: "system",
      status: "RUNNING",
      retryNumber: step.retryCount + 1,
      errorSummary: step.error,
      metadata: { checkpointArtifactId: null },
      idempotencyKey: `retry-start:${run.runId}:${args.stepIndex}:${step.retryCount + 1}`,
    });

    if (run.workOrderId) {
      await ctx.runMutation(internal.workOrders.recordRetry, {
        workflowRunId: run._id,
      });
    }
    
    return { retryCount: steps[args.stepIndex].retryCount };
  },
});
