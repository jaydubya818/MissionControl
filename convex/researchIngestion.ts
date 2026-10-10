import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  query,
  type MutationCtx,
} from "./lib/missionScopedFunctions";
import type { Doc, Id } from "./_generated/dataModel";
import {
  FACTORY_PERMISSIONS,
  requireWorkspacePermission,
} from "./lib/companyAccess";
import {
  RESEARCH_RUN_LEASE_MS,
  RESEARCH_RUN_MAX_ATTEMPTS,
  RESEARCH_MANUAL_PROJECT_CONCURRENCY,
  RESEARCH_RUN_VERIFIER,
  manualRunEligibilityIssues,
  manualRunStartDecision,
  retryDelayMs,
} from "./lib/researchIngestionPolicy";

const COLLECTOR_IDENTITY = "service:research-ingestion-collector-v1";
const VERIFIER_IDENTITY = `service:${RESEARCH_RUN_VERIFIER}`;
const WORKFLOW_ID = "manual-research-ingestion-v1";

const cursorValidator = v.object({
  providerCursor: v.optional(v.string()),
  etag: v.optional(v.string()),
  lastModified: v.optional(v.string()),
  knownItems: v.array(v.object({
    providerItemId: v.string(),
    contentHash: v.string(),
  })),
});

const receiptValidator = v.object({
  finalUrl: v.string(),
  statusCode: v.number(),
  requestCount: v.number(),
  bytesRead: v.number(),
  elapsedMs: v.number(),
  itemCount: v.number(),
  duplicateCount: v.number(),
  changedItemCount: v.number(),
  notModified: v.boolean(),
  etag: v.optional(v.string()),
  lastModified: v.optional(v.string()),
});

const observationValidator = v.object({
  providerItemId: v.string(),
  canonicalUrl: v.string(),
  title: v.string(),
  author: v.optional(v.string()),
  publishedAt: v.optional(v.number()),
  retrievedAt: v.number(),
  normalizedExcerpt: v.string(),
  contentHash: v.string(),
  adapterName: v.string(),
  adapterVersion: v.string(),
  language: v.optional(v.string()),
  contentType: v.literal("FEED_ENTRY"),
  safetyScanResult: v.union(v.literal("PASSED"), v.literal("QUARANTINED")),
  detectedInstructionLikeContent: v.boolean(),
  quarantineReasons: v.array(v.string()),
  priorContentHash: v.optional(v.string()),
});

const artifactEvidenceValidator = v.object({
  schemaVersion: v.literal("research-evidence-v1"),
  sourceId: v.string(),
  sourceVersion: v.number(),
  workflowRunId: v.string(),
  adapter: v.object({
    name: v.string(),
    version: v.string(),
  }),
  receipt: receiptValidator,
  cursorBefore: cursorValidator,
  cursorAfter: cursorValidator,
  observations: v.array(v.object({
    providerItemId: v.string(),
    contentHash: v.string(),
    excerptHash: v.string(),
  })),
});

type Cursor = {
  providerCursor?: string;
  etag?: string;
  lastModified?: string;
  knownItems: Array<{ providerItemId: string; contentHash: string }>;
};

function boundedText(value: string, label: string, maximum: number): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${label} is required.`);
  if (trimmed.length > maximum) throw new Error(`${label} cannot exceed ${maximum} characters.`);
  return trimmed;
}

function optionalBoundedText(value: string | undefined, label: string, maximum: number): string | undefined {
  if (value == null || value.trim() === "") return undefined;
  return boundedText(value, label, maximum);
}

function boundedNonNegativeInteger(value: number, label: string, maximum: number): number {
  if (!Number.isInteger(value) || value < 0 || value > maximum) {
    throw new Error(`${label} must be an integer between 0 and ${maximum}.`);
  }
  return value;
}

function requireSha256(value: string, label: string): string {
  if (!/^[a-f0-9]{64}$/i.test(value)) throw new Error(`${label} must be a SHA-256 digest.`);
  return value.toLowerCase();
}

function normalizeCursor(cursor: Cursor): Cursor {
  if (cursor.knownItems.length > 500) throw new Error("Research cursor cannot contain more than 500 known items.");
  const unique = new Map<string, string>();
  for (const item of cursor.knownItems) {
    unique.set(
      boundedText(item.providerItemId, "Provider item ID", 500),
      requireSha256(item.contentHash, "Cursor content hash"),
    );
  }
  return {
    providerCursor: optionalBoundedText(cursor.providerCursor, "Provider cursor", 1_000),
    etag: optionalBoundedText(cursor.etag, "ETag", 1_000),
    lastModified: optionalBoundedText(cursor.lastModified, "Last-Modified value", 1_000),
    knownItems: [...unique.entries()].slice(-500).map(([providerItemId, contentHash]) => ({
      providerItemId,
      contentHash,
    })),
  };
}

function sourceCursor(source: Doc<"researchSources">): Cursor {
  return normalizeCursor(source.cursorState ?? {
    providerCursor: source.providerCursor,
    etag: source.etag,
    lastModified: source.lastModified,
    knownItems: [],
  });
}

function workflowSteps(now: number) {
  return [
    {
      stepId: "discover",
      status: "RUNNING" as const,
      kind: "AGENT" as const,
      isolation: "READ_ONLY" as const,
      failurePolicy: "RETRY" as const,
      startedAt: now,
      retryCount: 0,
    },
    {
      stepId: "persist-checkpoint",
      status: "PENDING" as const,
      dependsOn: ["discover"],
      kind: "REDUCE" as const,
      isolation: "READ_ONLY" as const,
      failurePolicy: "BLOCK" as const,
      retryCount: 0,
    },
    {
      stepId: "independent-verification",
      status: "PENDING" as const,
      dependsOn: ["persist-checkpoint"],
      kind: "VERIFY" as const,
      isolation: "READ_ONLY" as const,
      failurePolicy: "BLOCK" as const,
      retryCount: 0,
    },
  ];
}

async function nextEventSequence(ctx: MutationCtx, workflowRunId: Id<"workflowRuns">): Promise<number> {
  const events = await ctx.db
    .query("runEvents")
    .withIndex("by_run_sequence", (q) => q.eq("workflowRunId", workflowRunId))
    .collect();
  return events.reduce((maximum, event) => Math.max(maximum, event.sequenceNumber), 0) + 1;
}

async function insertRunEvent(
  ctx: MutationCtx,
  run: Doc<"workflowRuns">,
  input: {
    idempotencyKey: string;
    eventType: "RUN_STARTED" | "STEP_COMPLETED" | "ARTIFACT_CREATED" | "CHECKPOINT_CREATED" | "RETRY_STARTED" | "RUN_FAILED" | "RUN_COMPLETED";
    workflowStep?: string;
    actor: string;
    status: string;
    commandSummary: string;
    evidenceArtifactIds?: Id<"runArtifacts">[];
    verificationReceiptId?: Id<"verificationReceipts">;
    errorCategory?: string;
    errorSummary?: string;
    metadata?: unknown;
  },
) {
  const existing = await ctx.db
    .query("runEvents")
    .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", input.idempotencyKey))
    .first();
  if (existing) return existing._id;
  const now = Date.now();
  return await ctx.db.insert("runEvents", {
    tenantId: run.tenantId,
    projectId: run.projectId,
    workOrderId: run.workOrderId,
    workflowRunId: run._id,
    idempotencyKey: input.idempotencyKey,
    eventType: input.eventType,
    workflowStep: input.workflowStep,
    sequenceNumber: await nextEventSequence(ctx, run._id),
    actor: input.actor,
    commandSummary: input.commandSummary.slice(0, 500),
    status: input.status,
    startedAt: now,
    endedAt: now,
    verificationReceiptId: input.verificationReceiptId,
    evidenceArtifactIds: input.evidenceArtifactIds,
    errorCategory: input.errorCategory,
    errorSummary: input.errorSummary?.slice(0, 1_000),
    metadata: input.metadata,
  });
}

export const listRunsBySource = query({
  args: {
    projectId: v.id("projects"),
    sourceId: v.id("researchSources"),
  },
  handler: async (ctx, args) => {
    await requireWorkspacePermission(ctx, args.projectId, FACTORY_PERMISSIONS.VIEW);
    const source = await ctx.db.get(args.sourceId);
    if (!source || source.projectId !== args.projectId) {
      throw new Error("Research source is unavailable or unauthorized.");
    }
    return await ctx.db
      .query("researchSourceRuns")
      .withIndex("by_source", (q) => q.eq("sourceId", args.sourceId))
      .order("desc")
      .take(20);
  },
});

export const listObservationsByRun = query({
  args: {
    projectId: v.id("projects"),
    sourceRunId: v.id("researchSourceRuns"),
  },
  handler: async (ctx, args) => {
    await requireWorkspacePermission(ctx, args.projectId, FACTORY_PERMISSIONS.VIEW);
    const sourceRun = await ctx.db.get(args.sourceRunId);
    if (!sourceRun || sourceRun.projectId !== args.projectId) {
      throw new Error("Research run is unavailable or unauthorized.");
    }
    const observations = await Promise.all(sourceRun.observationIds.map((id) => ctx.db.get(id)));
    return observations.filter((observation) => observation != null);
  },
});

export const beginManualRun = internalMutation({
  args: {
    projectId: v.id("projects"),
    sourceId: v.id("researchSources"),
    idempotencyKey: v.string(),
    executionId: v.string(),
    leaseId: v.string(),
  },
  handler: async (ctx, args) => {
    const access = await requireWorkspacePermission(
      ctx,
      args.projectId,
      FACTORY_PERMISSIONS.MANAGE_AUTOMATION,
    );
    const source = await ctx.db.get(args.sourceId);
    if (!source || source.projectId !== args.projectId || source.tenantId !== access.project.tenantId) {
      throw new Error("Research source is unavailable or unauthorized.");
    }
    const eligibilityIssues = manualRunEligibilityIssues(source);
    if (eligibilityIssues.length > 0) throw new Error(eligibilityIssues.join(" "));
    const idempotencyKey = boundedText(args.idempotencyKey, "Idempotency key", 256);
    const executionId = boundedText(args.executionId, "Execution ID", 100);
    const leaseId = boundedText(args.leaseId, "Lease ID", 100);
    const now = Date.now();
    const existing = await ctx.db
      .query("researchSourceRuns")
      .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", idempotencyKey))
      .first();
    if (existing && (existing.projectId !== args.projectId || existing.sourceId !== args.sourceId)) {
      throw new Error("Idempotency key is already bound to another research source.");
    }
    const decision = manualRunStartDecision(existing, now);
    if (existing && (decision === "REPLAY" || decision === "IN_PROGRESS" || decision === "BACKOFF" || decision === "EXHAUSTED")) {
      return {
        decision,
        sourceRunId: existing._id,
        sourceRunStatus: existing.status,
        workOrderId: existing.workOrderId,
        workflowRunId: existing.workflowRunId,
        source: null,
      };
    }

    const activeRuns = await ctx.db
      .query("researchSourceRuns")
      .withIndex("by_source_status", (q) => q.eq("sourceId", source._id).eq("status", "RUNNING"))
      .collect();
    if (activeRuns.some((run) => run._id !== existing?._id && (run.lease?.expiresAt ?? 0) > now)) {
      throw new Error("Another manual collection already holds this source lease.");
    }
    const activeProjectRuns = await ctx.db
      .query("researchSourceRuns")
      .withIndex("by_project_status", (q) => q.eq("projectId", args.projectId).eq("status", "RUNNING"))
      .collect();
    if (activeProjectRuns.filter((run) => run._id !== existing?._id && (run.lease?.expiresAt ?? 0) > now).length >= RESEARCH_MANUAL_PROJECT_CONCURRENCY) {
      throw new Error(`This workspace already has ${RESEARCH_MANUAL_PROJECT_CONCURRENCY} active manual research runs.`);
    }

    const cursorBefore = sourceCursor(source);
    if (existing) {
      if (existing.sourceVersion !== source.version) {
        throw new Error("Research source authority changed after this run started; create a new manual run with a new idempotency key.");
      }
      const run = await ctx.db.get(existing.workflowRunId);
      const workOrder = await ctx.db.get(existing.workOrderId);
      if (!run || !workOrder) throw new Error("Research recovery lineage is incomplete.");
      const attemptCount = existing.attemptCount + 1;
      const steps = workflowSteps(now).map((step) => ({
        ...step,
        retryCount: attemptCount - 1,
      }));
      await ctx.db.patch(existing._id, {
        status: "RUNNING",
        sourceVersion: source.version,
        cursorBefore,
        lease: {
          leaseId,
          ownerId: COLLECTOR_IDENTITY,
          claimedAt: now,
          expiresAt: now + RESEARCH_RUN_LEASE_MS,
        },
        attemptCount,
        requestedBy: access.actorId,
        failureCode: undefined,
        failureMessage: undefined,
        retryable: undefined,
        nextRetryAt: undefined,
        failedAt: undefined,
        updatedAt: now,
      });
      await ctx.db.patch(run._id, {
        status: "RUNNING",
        currentStepIndex: 0,
        steps,
        completedAt: undefined,
        failureReason: undefined,
        startedAt: now,
      });
      await ctx.db.patch(workOrder._id, {
        state: "IN_PROGRESS",
        verificationStatus: "PENDING",
        blockingIssue: undefined,
        updatedAt: now,
      });
      await insertRunEvent(ctx, run, {
        idempotencyKey: `${idempotencyKey}:retry:${attemptCount}`,
        eventType: "RETRY_STARTED",
        workflowStep: "discover",
        actor: COLLECTOR_IDENTITY,
        status: "RUNNING",
        commandSummary: `Retrying manual collection attempt ${attemptCount}`,
        metadata: { sourceId: source._id, sourceVersion: source.version, leaseId },
      });
      return {
        decision: "RETRY" as const,
        sourceRunId: existing._id,
        sourceRunStatus: "RUNNING" as const,
        workOrderId: workOrder._id,
        workflowRunId: run._id,
        source: {
          canonicalUrl: source.canonicalUrl!,
          sourceVersion: source.version,
          maxItemsPerRun: source.maxItemsPerRun,
          cursor: cursorBefore,
          leaseId,
        },
      };
    }

    const workOrderId = await ctx.db.insert("workOrders", {
      tenantId: source.tenantId,
      projectId: source.projectId,
      idempotencyKey: `${idempotencyKey}:work-order`,
      title: `Manual research intake: ${source.displayName}`.slice(0, 200),
      desiredOutcome: `Collect bounded evidence from the exact approved source ${source.canonicalUrl}, persist artifact, observations, and cursor atomically, then independently verify lineage.`.slice(0, 2_000),
      context: `Source ${source._id} version ${source.version}; explicit operator-triggered read-only collection.`,
      workflowId: WORKFLOW_ID,
      priority: 3,
      riskLevel: "LOW",
      requestedBy: access.actorId,
      assignedAgent: COLLECTOR_IDENTITY,
      isMutating: false,
      acceptanceCriteria: [{
        id: "atomic-evidence-verification",
        title: "Artifact, observations, and cursor share verified lineage",
        description: "An independent verifier must reopen persisted evidence, recompute its digest, and validate source, run, artifact, observation, and cursor lineage.",
        verificationMethod: "CHECKLIST",
        status: "PENDING",
      }],
      constraints: [
        "No automatic or recurring scheduling",
        "No model invocation, messaging, recommendation creation, or repository write",
        `Maximum ${source.maxItemsPerRun} items from the exact approved host`,
      ],
      sourceOfTruthRefs: [
        { kind: "URL", label: source.displayName, location: source.canonicalUrl! },
        { kind: "DOC", label: "Governed continuous-learning plan, Phase 2", location: "docs/plans/2026-08-08-feat-governed-continuous-learning-plan.md" },
      ],
      state: "IN_PROGRESS",
      verificationStatus: "PENDING",
      approvalStatus: "NOT_REQUIRED",
      currentRevisionNumber: 1,
      createdAt: now,
      updatedAt: now,
      metadata: {
        source: "researchIngestion.beginManualRun",
        researchSourceId: source._id,
        researchSourceVersion: source.version,
        trigger: "MANUAL",
        schedulingEnabled: false,
      },
    });
    const steps = workflowSteps(now);
    const workflowRunId = await ctx.db.insert("workflowRuns", {
      tenantId: source.tenantId,
      runId: `research-${executionId}`,
      workflowId: WORKFLOW_ID,
      workflowVersion: 1,
      workflowSnapshot: {
        id: WORKFLOW_ID,
        version: 1,
        steps: ["discover", "persist-checkpoint", "independent-verification"],
      },
      projectId: source.projectId,
      workOrderId,
      workOrderRevisionNumber: 1,
      isMutating: false,
      allowedTools: ["network:approved-source-read", "database:research-evidence-write"],
      status: "RUNNING",
      currentStepIndex: 0,
      totalSteps: steps.length,
      steps,
      context: {
        source: "researchIngestion.beginManualRun",
        researchSourceId: source._id,
        researchSourceVersion: source.version,
        cursorBefore,
        schedulingEnabled: false,
      },
      topology: "LINEAR",
      maxConcurrency: 1,
      initialInput: `Collect up to ${source.maxItemsPerRun} items from the exact approved Research Watchlist source.`,
      runtime: "convex-node",
      executionEnvironment: "CLOUD",
      startedAt: now,
      metadata: {
        sourceRunIdempotencyKey: idempotencyKey,
        collectorIdentity: COLLECTOR_IDENTITY,
        verifierIdentity: VERIFIER_IDENTITY,
      },
    });
    await ctx.db.patch(workOrderId, { currentExecutionRunId: workflowRunId });
    const sourceRunId = await ctx.db.insert("researchSourceRuns", {
      tenantId: source.tenantId,
      projectId: source.projectId,
      sourceId: source._id,
      workOrderId,
      workflowRunId,
      observationIds: [],
      trigger: "MANUAL",
      status: "RUNNING",
      sourceVersion: source.version,
      adapterName: source.adapter.name,
      adapterVersion: source.adapter.version,
      cursorBefore,
      lease: {
        leaseId,
        ownerId: COLLECTOR_IDENTITY,
        claimedAt: now,
        expiresAt: now + RESEARCH_RUN_LEASE_MS,
      },
      discoveredItemCount: 0,
      insertedObservationCount: 0,
      duplicateObservationCount: 0,
      quarantinedObservationCount: 0,
      attemptCount: 1,
      requestedBy: access.actorId,
      idempotencyKey,
      startedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("workOrderEvents", {
      tenantId: source.tenantId,
      projectId: source.projectId,
      workOrderId,
      workflowRunId,
      idempotencyKey: `${idempotencyKey}:work-order-created`,
      eventType: "WORK_ORDER_CREATED",
      fromState: "DRAFT",
      toState: "IN_PROGRESS",
      actorType: "HUMAN",
      actorId: access.actorId,
      summary: `Created manual research intake for ${source.displayName}`,
      timestamp: now,
      metadata: { sourceId: source._id, sourceVersion: source.version, schedulingEnabled: false },
    });
    const workflowRun = await ctx.db.get(workflowRunId);
    if (!workflowRun) throw new Error("Workflow run creation failed.");
    await insertRunEvent(ctx, workflowRun, {
      idempotencyKey: `${idempotencyKey}:run-started`,
      eventType: "RUN_STARTED",
      workflowStep: "discover",
      actor: COLLECTOR_IDENTITY,
      status: "RUNNING",
      commandSummary: `Started manual collection for ${source.displayName}`,
      metadata: { sourceId: source._id, sourceVersion: source.version, leaseId },
    });
    return {
      decision: "START" as const,
      sourceRunId,
      sourceRunStatus: "RUNNING" as const,
      workOrderId,
      workflowRunId,
      source: {
        canonicalUrl: source.canonicalUrl!,
        sourceVersion: source.version,
        maxItemsPerRun: source.maxItemsPerRun,
        cursor: cursorBefore,
        leaseId,
      },
    };
  },
});

export const commitManualRun = internalMutation({
  args: {
    sourceRunId: v.id("researchSourceRuns"),
    leaseId: v.string(),
    sourceVersion: v.number(),
    adapterName: v.string(),
    adapterVersion: v.string(),
    cursorAfter: cursorValidator,
    receipt: receiptValidator,
    observations: v.array(observationValidator),
    artifactHash: v.string(),
    artifactEvidence: artifactEvidenceValidator,
  },
  handler: async (ctx, args) => {
    const sourceRun = await ctx.db.get(args.sourceRunId);
    if (!sourceRun) throw new Error("Research source run not found.");
    if (sourceRun.status === "AWAITING_VERIFICATION" || sourceRun.status === "VERIFIED") {
      return sourceRun;
    }
    if (sourceRun.status !== "RUNNING" || sourceRun.lease?.leaseId !== args.leaseId) {
      throw new Error("Research source run lease is stale or unavailable.");
    }
    if (sourceRun.lease.expiresAt <= Date.now()) throw new Error("Research source run lease expired before commit.");
    const [source, workflowRun, workOrder] = await Promise.all([
      ctx.db.get(sourceRun.sourceId),
      ctx.db.get(sourceRun.workflowRunId),
      ctx.db.get(sourceRun.workOrderId),
    ]);
    if (!source || !workflowRun || !workOrder) throw new Error("Research run lineage is incomplete.");
    if (source.projectId !== sourceRun.projectId || source.tenantId !== sourceRun.tenantId) {
      throw new Error("Research source workspace lineage changed before commit.");
    }
    if (source.state !== "ACTIVE" || source.version !== args.sourceVersion || source.version !== sourceRun.sourceVersion) {
      throw new Error("Research source authority changed before commit; no evidence was persisted.");
    }
    const eligibilityIssues = manualRunEligibilityIssues(source);
    if (eligibilityIssues.length > 0) throw new Error(eligibilityIssues.join(" "));
    if (args.observations.length > source.maxItemsPerRun || args.observations.length > 100) {
      throw new Error("Adapter results exceeded the approved source item cap.");
    }
    const artifactHash = requireSha256(args.artifactHash, "Artifact evidence hash");
    const adapterName = boundedText(args.adapterName, "Adapter name", 100);
    const adapterVersion = boundedText(args.adapterVersion, "Adapter version", 100);
    if (adapterName !== "mission-control-web-rss" || adapterVersion !== "1.0.0") {
      throw new Error("Adapter receipt does not match the approved manual Web/RSS runtime.");
    }
    const cursorAfter = normalizeCursor(args.cursorAfter);
    const finalUrl = new URL(boundedText(args.receipt.finalUrl, "Final provider URL", 2_048));
    const sourceUrl = new URL(source.canonicalUrl!);
    if (finalUrl.protocol !== "https:" || finalUrl.hostname.toLowerCase() !== sourceUrl.hostname.toLowerCase()) {
      throw new Error("Provider receipt escaped the exact approved source host.");
    }
    const receipt = {
      finalUrl: finalUrl.toString(),
      statusCode: boundedNonNegativeInteger(args.receipt.statusCode, "Provider status", 599),
      requestCount: boundedNonNegativeInteger(args.receipt.requestCount, "Provider request count", 20),
      bytesRead: boundedNonNegativeInteger(args.receipt.bytesRead, "Provider bytes read", 5_000_000),
      elapsedMs: boundedNonNegativeInteger(args.receipt.elapsedMs, "Provider elapsed time", 300_000),
      itemCount: boundedNonNegativeInteger(args.receipt.itemCount, "Provider item count", 100),
      duplicateCount: boundedNonNegativeInteger(args.receipt.duplicateCount, "Provider duplicate count", 500),
      changedItemCount: boundedNonNegativeInteger(args.receipt.changedItemCount, "Provider changed-item count", 100),
      notModified: args.receipt.notModified,
      etag: optionalBoundedText(args.receipt.etag, "Provider ETag", 1_000),
      lastModified: optionalBoundedText(args.receipt.lastModified, "Provider Last-Modified value", 1_000),
    };
    if (![304].includes(receipt.statusCode) && (receipt.statusCode < 200 || receipt.statusCode >= 300)) {
      throw new Error("Provider receipt status is not a successful feed response.");
    }
    if (receipt.itemCount !== args.observations.length
      || receipt.changedItemCount > receipt.itemCount
      || (receipt.notModified && (receipt.statusCode !== 304 || receipt.itemCount !== 0))) {
      throw new Error("Provider receipt counts do not reconcile with the bounded observation payload.");
    }
    const now = Date.now();
    const artifactId = await ctx.db.insert("runArtifacts", {
      tenantId: sourceRun.tenantId,
      projectId: sourceRun.projectId,
      workOrderId: sourceRun.workOrderId,
      workflowRunId: sourceRun.workflowRunId,
      idempotencyKey: `${sourceRun.idempotencyKey}:artifact`,
      artifactType: "STRUCTURED_OUTPUT",
      name: `Manual research evidence: ${source.displayName}`.slice(0, 200),
      description: "Bounded normalized provider evidence committed atomically with observations and cursor checkpoint.",
      externalLocation: `mission-control://research-source-runs/${sourceRun._id}`,
      contentHash: artifactHash,
      producer: COLLECTOR_IDENTITY,
      retentionPolicy: `${source.retentionDays} days`,
      sensitivity: "UNTRUSTED_EXTERNAL_CONTENT",
      createdAt: now,
      metadata: {
        schemaVersion: "research-evidence-v1",
        sourceId: source._id,
        sourceVersion: source.version,
        sourceRunId: sourceRun._id,
        evidence: args.artifactEvidence,
      },
    });

    const observationIds: Id<"researchObservations">[] = [];
    let duplicateObservationCount = receipt.duplicateCount;
    let quarantinedObservationCount = 0;
    for (const raw of args.observations) {
      const providerItemId = boundedText(raw.providerItemId, "Provider item ID", 500);
      const contentHash = requireSha256(raw.contentHash, "Observation content hash");
      if (raw.adapterName !== adapterName || raw.adapterVersion !== adapterVersion) {
        throw new Error("Observation adapter lineage does not match the provider receipt.");
      }
      if (raw.normalizedExcerpt.length > 2_000) {
        throw new Error("Observation excerpt exceeded the 2,000-character persistence limit.");
      }
      if (!Number.isFinite(raw.retrievedAt) || raw.retrievedAt < 0 || raw.retrievedAt > now + 5 * 60_000) {
        throw new Error("Observation retrieval timestamp is invalid.");
      }
      if (raw.publishedAt != null && (!Number.isFinite(raw.publishedAt) || raw.publishedAt < 0 || raw.publishedAt > now + 24 * 60 * 60_000)) {
        throw new Error("Observation publication timestamp is invalid.");
      }
      const canonicalUrl = new URL(boundedText(raw.canonicalUrl, "Observation canonical URL", 2_048));
      if (canonicalUrl.protocol !== "https:" || canonicalUrl.hostname.toLowerCase() !== sourceUrl.hostname.toLowerCase()) {
        throw new Error("Observation escaped the exact approved source host.");
      }
      const sameProvider = await ctx.db
        .query("researchObservations")
        .withIndex("by_source_provider_item", (q) => q.eq("sourceId", source._id).eq("providerItemId", providerItemId))
        .order("desc")
        .collect();
      if (sameProvider.some((observation) => observation.contentHash === contentHash)) {
        duplicateObservationCount += 1;
        continue;
      }
      const sameContent = await ctx.db
        .query("researchObservations")
        .withIndex("by_source_content_hash", (q) => q.eq("sourceId", source._id).eq("contentHash", contentHash))
        .first();
      if (sameContent) {
        duplicateObservationCount += 1;
        continue;
      }
      const superseded = sameProvider.find((observation) => observation.state === "ACTIVE");
      const quarantineReasons = [...new Set(raw.quarantineReasons.map((reason) => boundedText(reason, "Quarantine reason", 160)))].slice(0, 10);
      const quarantined = raw.safetyScanResult === "QUARANTINED" || quarantineReasons.length > 0;
      if (quarantined) quarantinedObservationCount += 1;
      const observationId = await ctx.db.insert("researchObservations", {
        tenantId: source.tenantId,
        projectId: source.projectId,
        sourceId: source._id,
        workflowRunId: workflowRun._id,
        runArtifactId: artifactId,
        providerItemId,
        canonicalUrl: canonicalUrl.toString(),
        authorName: optionalBoundedText(raw.author, "Observation author", 300),
        title: boundedText(raw.title, "Observation title", 300),
        normalizedExcerpt: raw.normalizedExcerpt,
        publishedAt: raw.publishedAt,
        retrievedAt: raw.retrievedAt,
        state: "ACTIVE",
        supersedesObservationId: superseded?._id,
        contentHash,
        adapterVersion: boundedText(raw.adapterVersion, "Adapter version", 100),
        language: optionalBoundedText(raw.language, "Observation language", 32),
        contentType: raw.contentType,
        trustClassification: "UNKNOWN",
        safetyScanStatus: quarantined ? "QUARANTINED" : "PASSED",
        detectedInstructionLikeContent: raw.detectedInstructionLikeContent,
        quarantineReason: quarantineReasons.length > 0 ? quarantineReasons.join(", ").slice(0, 1_000) : undefined,
        extractionStatus: quarantined ? "PENDING" : "COMPLETE",
        citedClaimIds: [],
        verificationDecision: "PENDING",
        retentionDays: source.retentionDays,
        sensitivity: "UNTRUSTED_EXTERNAL_CONTENT",
        rightsTermsReference: `source-policy:${source._id}:v${source.version}`,
        purgeAt: now + source.retentionDays * 24 * 60 * 60 * 1_000,
        idempotencyKey: `${sourceRun.idempotencyKey}:observation:${providerItemId}:${contentHash}`.slice(0, 1_000),
        createdAt: now,
      });
      if (superseded) await ctx.db.patch(superseded._id, { state: "SUPERSEDED" });
      observationIds.push(observationId);
    }

    await ctx.db.patch(source._id, {
      providerCursor: cursorAfter.providerCursor,
      etag: cursorAfter.etag,
      lastModified: cursorAfter.lastModified,
      cursorState: {
        ...cursorAfter,
        checkpointedAt: now,
        workflowRunId: workflowRun._id,
      },
      lastSuccessfulRunAt: now,
      lastError: undefined,
      nextRetryAt: undefined,
      consecutiveFailureCount: 0,
      updatedBy: COLLECTOR_IDENTITY,
      updatedAt: now,
    });
    await ctx.db.patch(sourceRun._id, {
      runArtifactId: artifactId,
      observationIds,
      status: "AWAITING_VERIFICATION",
      cursorAfter,
      lease: undefined,
      receipt,
      adapterName,
      adapterVersion,
      artifactHash,
      discoveredItemCount: args.observations.length,
      insertedObservationCount: observationIds.length,
      duplicateObservationCount,
      quarantinedObservationCount,
      committedAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(workflowRun._id, {
      status: "RUNNING",
      currentStepIndex: 2,
      checkpointAt: now,
      checkpointSummary: `Committed artifact ${artifactId}, ${observationIds.length} observations, and source cursor atomically.`,
      steps: workflowRun.steps.map((step) => step.stepId === "discover"
        ? { ...step, status: "DONE" as const, completedAt: now, output: `Discovered ${args.observations.length} bounded items.` }
        : step.stepId === "persist-checkpoint"
          ? { ...step, status: "DONE" as const, startedAt: now, completedAt: now, output: `Committed ${observationIds.length} new observations and cursor.` }
          : { ...step, status: "RUNNING" as const, startedAt: now }),
    });
    await ctx.db.patch(workOrder._id, {
      state: "AWAITING_VERIFICATION",
      verificationStatus: "PENDING",
      blockingIssue: undefined,
      updatedAt: now,
    });
    await insertRunEvent(ctx, workflowRun, {
      idempotencyKey: `${sourceRun.idempotencyKey}:discover-completed`,
      eventType: "STEP_COMPLETED",
      workflowStep: "discover",
      actor: COLLECTOR_IDENTITY,
      status: "COMPLETED",
      commandSummary: `Discovered ${args.observations.length} bounded provider items`,
      metadata: { receipt },
    });
    await insertRunEvent(ctx, workflowRun, {
      idempotencyKey: `${sourceRun.idempotencyKey}:artifact-created`,
      eventType: "ARTIFACT_CREATED",
      workflowStep: "persist-checkpoint",
      actor: COLLECTOR_IDENTITY,
      status: "COMPLETED",
      commandSummary: "Persisted bounded research evidence artifact",
      evidenceArtifactIds: [artifactId],
      metadata: { artifactHash, observationCount: observationIds.length },
    });
    await insertRunEvent(ctx, workflowRun, {
      idempotencyKey: `${sourceRun.idempotencyKey}:cursor-checkpoint`,
      eventType: "CHECKPOINT_CREATED",
      workflowStep: "persist-checkpoint",
      actor: COLLECTOR_IDENTITY,
      status: "COMPLETED",
      commandSummary: "Checkpointed research source cursor atomically with evidence",
      evidenceArtifactIds: [artifactId],
      metadata: { cursorAfter, sourceVersion: source.version },
    });
    return await ctx.db.get(sourceRun._id);
  },
});

export const failManualRun = internalMutation({
  args: {
    sourceRunId: v.id("researchSourceRuns"),
    leaseId: v.string(),
    failureCode: v.string(),
    failureMessage: v.string(),
    retryable: v.boolean(),
    retryAfterMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const sourceRun = await ctx.db.get(args.sourceRunId);
    if (!sourceRun || sourceRun.status !== "RUNNING" || sourceRun.lease?.leaseId !== args.leaseId) {
      return sourceRun;
    }
    if (sourceRun.runArtifactId || sourceRun.observationIds.length > 0 || sourceRun.committedAt) {
      throw new Error("Committed research evidence cannot be converted into a collection failure.");
    }
    const [source, workflowRun, workOrder] = await Promise.all([
      ctx.db.get(sourceRun.sourceId),
      ctx.db.get(sourceRun.workflowRunId),
      ctx.db.get(sourceRun.workOrderId),
    ]);
    if (!source || !workflowRun || !workOrder) throw new Error("Research run lineage is incomplete.");
    const failureCode = boundedText(args.failureCode, "Failure code", 100);
    const failureMessage = boundedText(args.failureMessage, "Failure message", 1_000);
    const retryable = args.retryable && sourceRun.attemptCount < RESEARCH_RUN_MAX_ATTEMPTS;
    const nextRetryAt = retryable ? Date.now() + retryDelayMs(sourceRun.attemptCount, args.retryAfterMs) : undefined;
    const now = Date.now();
    await ctx.db.patch(sourceRun._id, {
      status: "FAILED",
      lease: undefined,
      failureCode,
      failureMessage,
      retryable,
      nextRetryAt,
      failedAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(source._id, {
      lastError: `${failureCode}: ${failureMessage}`.slice(0, 1_000),
      nextRetryAt,
      consecutiveFailureCount: source.consecutiveFailureCount + 1,
      updatedBy: COLLECTOR_IDENTITY,
      updatedAt: now,
    });
    await ctx.db.patch(workflowRun._id, {
      status: "FAILED",
      completedAt: now,
      failureReason: failureMessage,
      steps: workflowRun.steps.map((step, index) => index === workflowRun.currentStepIndex
        ? { ...step, status: "FAILED" as const, completedAt: now, error: failureMessage }
        : step),
    });
    await ctx.db.patch(workOrder._id, {
      state: "BLOCKED",
      verificationStatus: "PENDING",
      blockingIssue: retryable
        ? `Collection failed; retry is available${nextRetryAt ? ` after ${new Date(nextRetryAt).toISOString()}` : ""}.`
        : "Collection failed and requires operator review.",
      requiredHumanAction: retryable ? "Retry the manual collection." : "Review the source policy and provider failure.",
      updatedAt: now,
    });
    await insertRunEvent(ctx, workflowRun, {
      idempotencyKey: `${sourceRun.idempotencyKey}:attempt:${sourceRun.attemptCount}:failed`,
      eventType: "RUN_FAILED",
      workflowStep: workflowRun.steps[workflowRun.currentStepIndex]?.stepId,
      actor: COLLECTOR_IDENTITY,
      status: "FAILED",
      commandSummary: failureMessage,
      errorCategory: failureCode,
      errorSummary: failureMessage,
      metadata: { retryable, nextRetryAt, attemptCount: sourceRun.attemptCount },
    });
    await ctx.db.insert("workOrderEvents", {
      tenantId: sourceRun.tenantId,
      projectId: sourceRun.projectId,
      workOrderId: sourceRun.workOrderId,
      workflowRunId: sourceRun.workflowRunId,
      idempotencyKey: `${sourceRun.idempotencyKey}:attempt:${sourceRun.attemptCount}:work-order-failed`,
      eventType: "RUN_FAILED",
      fromState: workOrder.state,
      toState: "BLOCKED",
      actorType: "SYSTEM",
      actorId: COLLECTOR_IDENTITY,
      summary: failureMessage,
      timestamp: now,
      metadata: { failureCode, retryable, nextRetryAt },
    });
    return await ctx.db.get(sourceRun._id);
  },
});

export const authorizeVerification = internalQuery({
  args: {
    projectId: v.id("projects"),
    sourceRunId: v.id("researchSourceRuns"),
  },
  handler: async (ctx, args) => {
    await requireWorkspacePermission(ctx, args.projectId, FACTORY_PERMISSIONS.MANAGE_AUTOMATION);
    const sourceRun = await ctx.db.get(args.sourceRunId);
    if (!sourceRun || sourceRun.projectId !== args.projectId) {
      throw new Error("Research run is unavailable or unauthorized.");
    }
    return { sourceRunId: sourceRun._id, status: sourceRun.status };
  },
});

export const getVerificationBundle = internalQuery({
  args: { sourceRunId: v.id("researchSourceRuns") },
  handler: async (ctx, args) => {
    const sourceRun = await ctx.db.get(args.sourceRunId);
    if (!sourceRun) throw new Error("Research source run not found.");
    const [artifact, workflowRun, workOrder, source, observations] = await Promise.all([
      sourceRun.runArtifactId ? ctx.db.get(sourceRun.runArtifactId) : null,
      ctx.db.get(sourceRun.workflowRunId),
      ctx.db.get(sourceRun.workOrderId),
      ctx.db.get(sourceRun.sourceId),
      Promise.all(sourceRun.observationIds.map((id) => ctx.db.get(id))),
    ]);
    if (!artifact || !workflowRun || !workOrder || !source) {
      throw new Error("Committed research evidence lineage is incomplete.");
    }
    return {
      sourceRun,
      artifact,
      workflowRun,
      workOrder,
      source,
      observations: observations.filter((observation) => observation != null),
    };
  },
});

export const recordVerification = internalMutation({
  args: {
    sourceRunId: v.id("researchSourceRuns"),
    recomputedHash: v.string(),
    issues: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const sourceRun = await ctx.db.get(args.sourceRunId);
    if (!sourceRun) throw new Error("Research source run not found.");
    if (sourceRun.status === "VERIFIED" && sourceRun.verificationReceiptId) return sourceRun;
    if (sourceRun.status !== "AWAITING_VERIFICATION" || !sourceRun.runArtifactId) {
      throw new Error("Research source run is not awaiting evidence verification.");
    }
    const [artifact, workflowRun, workOrder, observations] = await Promise.all([
      ctx.db.get(sourceRun.runArtifactId),
      ctx.db.get(sourceRun.workflowRunId),
      ctx.db.get(sourceRun.workOrderId),
      Promise.all(sourceRun.observationIds.map((id) => ctx.db.get(id))),
    ]);
    if (!artifact || !workflowRun || !workOrder || observations.some((observation) => !observation)) {
      throw new Error("Research verification lineage is incomplete.");
    }
    const recomputedHash = requireSha256(args.recomputedHash, "Recomputed evidence hash");
    const issues = args.issues.map((issue) => boundedText(issue, "Verification issue", 500)).slice(0, 20);
    const passed = issues.length === 0;
    const now = Date.now();
    const receiptIdempotencyKey = `${sourceRun.idempotencyKey}:verification:${recomputedHash}:${passed ? "passed" : "failed"}`;
    const existingReceipt = await ctx.db
      .query("verificationReceipts")
      .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", receiptIdempotencyKey))
      .first();
    const verificationReceiptId = existingReceipt?._id ?? await ctx.db.insert("verificationReceipts", {
      tenantId: sourceRun.tenantId,
      projectId: sourceRun.projectId,
      workOrderId: workOrder._id,
      acceptanceCriterionId: "atomic-evidence-verification",
      workflowRunId: workflowRun._id,
      idempotencyKey: receiptIdempotencyKey,
      verificationMethod: "CHECKLIST",
      commandOrCheck: "Reopen persisted artifact and observations; recompute evidence digest; validate source, run, artifact, observation, and cursor lineage.",
      result: passed
        ? `Independent verification passed for ${sourceRun.insertedObservationCount} persisted observations.`
        : `Independent verification failed: ${issues.join(" ")}`.slice(0, 2_000),
      evidenceLocation: `mission-control://research-source-runs/${sourceRun._id}`,
      artifactReference: String(artifact._id),
      verifier: VERIFIER_IDENTITY,
      status: passed ? "PASSED" : "FAILED",
      linkedRunArtifactIds: [artifact._id],
      workOrderRevisionNumber: workOrder.currentRevisionNumber ?? 1,
      recordedAt: now,
      metadata: {
        sourceRunId: sourceRun._id,
        artifactHash: artifact.contentHash,
        recomputedHash,
        issues,
        collectorIdentity: artifact.producer,
        verifierIdentity: VERIFIER_IDENTITY,
      },
    });
    await ctx.db.patch(artifact._id, {
      verificationReceiptId,
      acceptanceCriterionId: "atomic-evidence-verification",
    });
    if (!passed) {
      const failureMessage = issues.join(" ").slice(0, 1_000);
      await ctx.db.patch(sourceRun._id, {
        verificationReceiptId,
        updatedAt: now,
      });
      await ctx.db.patch(workflowRun._id, {
        status: "FAILED",
        completedAt: now,
        failureReason: failureMessage,
        steps: workflowRun.steps.map((step) => step.stepId === "independent-verification"
          ? { ...step, status: "FAILED" as const, completedAt: now, error: failureMessage }
          : step),
      });
      await ctx.db.patch(workOrder._id, {
        state: "AWAITING_VERIFICATION",
        verificationStatus: "FAIL",
        blockingIssue: failureMessage,
        requiredHumanAction: "Retry independent evidence verification.",
        updatedAt: now,
      });
      return await ctx.db.get(sourceRun._id);
    }

    for (const observation of observations) {
      await ctx.db.patch(observation!._id, {
        verificationDecision: observation!.safetyScanStatus === "QUARANTINED" ? "REJECTED" : "ACCEPTED",
      });
    }
    await ctx.db.patch(sourceRun._id, {
      status: "VERIFIED",
      verificationReceiptId,
      verifiedAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(workflowRun._id, {
      status: "COMPLETED",
      currentStepIndex: workflowRun.totalSteps,
      completedAt: now,
      failureReason: undefined,
      steps: workflowRun.steps.map((step) => step.stepId === "independent-verification"
        ? { ...step, status: "DONE" as const, completedAt: now, error: undefined, output: "Independent evidence verification passed." }
        : step),
    });
    await ctx.db.patch(workOrder._id, {
      state: "DONE",
      verificationStatus: "PASS",
      acceptanceCriteria: workOrder.acceptanceCriteria.map((criterion) => ({ ...criterion, status: "PASS" as const })),
      acceptedRevisionNumber: workOrder.currentRevisionNumber ?? 1,
      blockingIssue: undefined,
      requiredHumanAction: undefined,
      updatedAt: now,
    });
    await insertRunEvent(ctx, workflowRun, {
      idempotencyKey: `${sourceRun.idempotencyKey}:verified`,
      eventType: "RUN_COMPLETED",
      workflowStep: "independent-verification",
      actor: VERIFIER_IDENTITY,
      status: "COMPLETED",
      commandSummary: "Independent evidence verification passed",
      evidenceArtifactIds: [artifact._id],
      verificationReceiptId,
      metadata: { recomputedHash, observationCount: observations.length },
    });
    await ctx.db.insert("workOrderEvents", {
      tenantId: sourceRun.tenantId,
      projectId: sourceRun.projectId,
      workOrderId: workOrder._id,
      workflowRunId: workflowRun._id,
      idempotencyKey: `${sourceRun.idempotencyKey}:work-order-verified`,
      eventType: "VERIFICATION_RECORDED",
      fromState: workOrder.state,
      toState: "DONE",
      actorType: "SYSTEM",
      actorId: VERIFIER_IDENTITY,
      summary: "Independent evidence verification passed; manual research WorkOrder completed.",
      timestamp: now,
      metadata: { verificationReceiptId, artifactId: artifact._id },
    });
    return await ctx.db.get(sourceRun._id);
  },
});
