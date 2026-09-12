import { v } from "convex/values";
import { internalMutation, mutation, query } from "../_generated/server";
import { FACTORY_PERMISSIONS, requireWorkspacePermission } from "../lib/companyAccess";
import { computeCanonicalHash } from "../lib/genomeHash";
import {
  MCP_MAX_QUALIFICATION_LIFETIME_MS,
  MCP_QUALIFICATION_OPERATION,
  MCP_QUALIFICATION_SERVER,
  MCP_CONTEXT7_SERVER,
  executionProfileToolGrantBinding,
  mcpToolGrantDigest,
  mcpToolGrantIssues,
  mcpToolGrantSnapshot,
  mcpToolVersionDigest,
  mcpToolVersionIssues,
  qualificationFixtureToolVersionSnapshot,
  context7ToolVersionSnapshot,
} from "../lib/governedMcp";

const governedMcpReceiptValidator = v.object({
  schema: v.literal("governed-mcp-tool-call-receipt/v1"),
  callId: v.string(),
  phase: v.union(v.literal("AUTHORIZATION"), v.literal("COMPLETION")),
  sequence: v.union(v.literal(1), v.literal(2)),
  status: v.union(v.literal("ALLOWED"), v.literal("DENIED"), v.literal("SUCCEEDED"), v.literal("FAILED"), v.literal("CANCELED"), v.literal("TIMED_OUT")),
  reason: v.string(),
  projectId: v.string(),
  workOrderId: v.string(),
  workflowRunId: v.id("workflowRuns"),
  attemptId: v.string(),
  attemptLeaseId: v.string(),
  workerId: v.string(),
  workerSessionId: v.string(),
  workerGeneration: v.number(),
  executionProfileId: v.id("factoryExecutionProfiles"),
  executionProfileDigest: v.string(),
  toolGrantId: v.id("mcpToolGrants"),
  toolGrantDigest: v.string(),
  toolVersionId: v.id("mcpToolVersions"),
  toolVersionDigest: v.string(),
  operation: v.string(),
  requestDigest: v.string(),
  requestBytes: v.number(),
  retryCount: v.literal(0),
  costStatus: v.literal("UNKNOWN"),
  outputDigest: v.optional(v.string()),
  outputBytes: v.optional(v.number()),
  poisoningDetected: v.optional(v.boolean()),
  redactionApplied: v.optional(v.boolean()),
  serverImplementationDigest: v.string(),
  expectedServerVersion: v.optional(v.string()),
  observedServerVersion: v.optional(v.string()),
  expectedInputSchemaDigest: v.optional(v.string()),
  observedInputSchemaDigest: v.optional(v.string()),
  occurredAt: v.number(),
  durationMs: v.optional(v.number()),
  authority: v.literal("HOST_BROKER"),
});

export const list = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    await requireWorkspacePermission(ctx, args.projectId, FACTORY_PERMISSIONS.VIEW);
    const [versions, grants] = await Promise.all([
      ctx.db.query("mcpToolVersions").withIndex("by_project", (q) => q.eq("projectId", args.projectId)).collect(),
      ctx.db.query("mcpToolGrants").withIndex("by_project", (q) => q.eq("projectId", args.projectId)).collect(),
    ]);
    const now = Date.now();
    return {
      maturity: versions.some((item) => item.serverKey === MCP_CONTEXT7_SERVER && item.enabled)
        ? "QUALIFIED_ONE_REAL_READ_ONLY_SERVICE" as const
        : "QUALIFICATION_FIXTURE" as const,
      versions: versions.map((item) => ({ ...item, current: item.enabled && item.qualificationStatus === "EVIDENCE_QUALIFIED" && (item.qualificationExpiresAt ?? 0) > now })),
      grants: grants.map((item) => ({ ...item, current: item.state === "ACTIVE" && item.expiresAt > now })),
      limitations: ["Exactly one admitted real service operation", "No write operations", "No dynamic discovery authority", "No agent-visible credentials"],
    };
  },
});

export const registerQualificationFixture = mutation({
  args: { projectId: v.id("projects"), implementationDigest: v.string(), registrationIdempotencyKey: v.string() },
  handler: async (ctx, args) => {
    const access = await requireWorkspacePermission(ctx, args.projectId, FACTORY_PERMISSIONS.MANAGE_AUTOMATION);
    const key = bounded(args.registrationIdempotencyKey, 200, "Tool Version registration key");
    const snapshot = qualificationFixtureToolVersionSnapshot(args.implementationDigest);
    const digest = mcpToolVersionDigest(snapshot);
    const existing = await ctx.db.query("mcpToolVersions").withIndex("by_registration", (q) => q.eq("projectId", args.projectId).eq("registrationIdempotencyKey", key)).first();
    if (existing) {
      if (existing.toolVersionDigest !== digest || computeCanonicalHash(existing.immutableSnapshot) !== computeCanonicalHash(snapshot)) throw new Error("Tool Version idempotency key is bound to another identity.");
      return { toolVersionId: existing._id, toolVersionDigest: digest, created: false as const };
    }
    const now = Date.now();
    const id = await ctx.db.insert("mcpToolVersions", {
      tenantId: access.project.tenantId, projectId: args.projectId,
      serverKey: MCP_QUALIFICATION_SERVER, serverVersion: "1.0.0",
      toolVersionDigest: digest, immutableSnapshot: snapshot,
      registrationIdempotencyKey: key, enabled: false, qualificationStatus: "UNQUALIFIED",
      createdBy: access.actorId, createdAt: now,
    });
    return { toolVersionId: id, toolVersionDigest: digest, created: true as const };
  },
});

export const registerContext7QueryDocs = mutation({
  args: { projectId: v.id("projects"), registrationIdempotencyKey: v.string() },
  handler: async (ctx, args) => {
    const access = await requireWorkspacePermission(ctx, args.projectId, FACTORY_PERMISSIONS.MANAGE_AUTOMATION);
    const key = bounded(args.registrationIdempotencyKey, 200, "Tool Version registration key");
    const snapshot = context7ToolVersionSnapshot();
    const digest = mcpToolVersionDigest(snapshot);
    const existing = await ctx.db.query("mcpToolVersions").withIndex("by_registration", (q) => q.eq("projectId", args.projectId).eq("registrationIdempotencyKey", key)).first();
    if (existing) {
      if (existing.toolVersionDigest !== digest || computeCanonicalHash(existing.immutableSnapshot) !== computeCanonicalHash(snapshot)) throw new Error("Tool Version idempotency key is bound to another identity.");
      return { toolVersionId: existing._id, toolVersionDigest: digest, created: false as const };
    }
    const now = Date.now();
    const id = await ctx.db.insert("mcpToolVersions", {
      tenantId: access.project.tenantId, projectId: args.projectId,
      serverKey: MCP_CONTEXT7_SERVER, serverVersion: snapshot.server.version,
      toolVersionDigest: digest, immutableSnapshot: snapshot,
      registrationIdempotencyKey: key, enabled: false, qualificationStatus: "UNQUALIFIED",
      createdBy: access.actorId, createdAt: now,
    });
    return { toolVersionId: id, toolVersionDigest: digest, created: true as const };
  },
});

export const qualifyVersion = mutation({
  args: {
    toolVersionId: v.id("mcpToolVersions"), expectedDigest: v.string(),
    evidenceReference: v.string(), evidenceDigest: v.string(), validUntil: v.number(),
  },
  handler: async (ctx, args) => {
    const version = await ctx.db.get(args.toolVersionId);
    if (!version) throw new Error("Tool Version is unavailable or unauthorized.");
    const access = await requireWorkspacePermission(ctx, version.projectId, FACTORY_PERMISSIONS.APPROVE);
    if (version.qualificationStatus !== "UNQUALIFIED" || version.qualificationDigest) throw new Error("Tool Version qualification is single-use.");
    if (version.toolVersionDigest !== args.expectedDigest || mcpToolVersionDigest(version.immutableSnapshot) !== args.expectedDigest) throw new Error("Tool Version digest does not match reviewed bytes.");
    const now = Date.now();
    if (args.validUntil <= now || args.validUntil - now > MCP_MAX_QUALIFICATION_LIFETIME_MS) throw new Error("Tool Version qualification expiry is invalid.");
    if (!/^sha256:[a-f0-9]{64}$/.test(args.evidenceDigest)) throw new Error("Tool Version evidence digest is invalid.");
    const evidence = {
      schema: "governed-mcp-qualification/v1", toolVersionDigest: args.expectedDigest,
      reference: bounded(args.evidenceReference, 1_000, "Tool Version evidence reference"),
      digest: args.evidenceDigest, approvedBy: access.actorId, approvedAt: now, validUntil: args.validUntil,
      admission: version.serverKey === MCP_CONTEXT7_SERVER ? "QUALIFIED_REAL_READ_ONLY_SERVICE" : "QUALIFICATION_FIXTURE",
      realServiceAdmitted: version.serverKey === MCP_CONTEXT7_SERVER,
    };
    const qualificationDigest = `sha256:${computeCanonicalHash(evidence)}`;
    await ctx.db.patch(version._id, { enabled: true, qualificationStatus: "EVIDENCE_QUALIFIED", qualificationEvidence: evidence, qualificationDigest, qualificationExpiresAt: args.validUntil, qualifiedBy: access.actorId, qualifiedAt: now });
    return { toolVersionId: version._id, toolVersionDigest: version.toolVersionDigest, qualificationDigest };
  },
});

export const createGrant = mutation({
  args: { projectId: v.id("projects"), toolVersionId: v.id("mcpToolVersions"), grantKey: v.string(), expiresAt: v.number(), registrationIdempotencyKey: v.string() },
  handler: async (ctx, args) => {
    const access = await requireWorkspacePermission(ctx, args.projectId, FACTORY_PERMISSIONS.MANAGE_AUTOMATION);
    const tool = await ctx.db.get(args.toolVersionId);
    const now = Date.now();
    if (!tool || tool.projectId !== args.projectId || !tool.enabled || tool.qualificationStatus !== "EVIDENCE_QUALIFIED" || (tool.qualificationExpiresAt ?? 0) <= now) throw new Error("Tool Grant requires one current exact qualified Tool Version.");
    if (mcpToolVersionIssues(tool.immutableSnapshot).length > 0
      || mcpToolVersionDigest(tool.immutableSnapshot) !== tool.toolVersionDigest) {
      throw new Error("Tool Grant requires unchanged Tool Version bytes.");
    }
    const key = bounded(args.registrationIdempotencyKey, 200, "Tool Grant registration key");
    const grantKey = bounded(args.grantKey, 64, "Tool Grant key").toLowerCase();
    const effectiveExpiresAt = Math.min(args.expiresAt, tool.qualificationExpiresAt!);
    const existing = await ctx.db.query("mcpToolGrants").withIndex("by_registration", (q) => q.eq("projectId", args.projectId).eq("registrationIdempotencyKey", key)).first();
    if (existing) {
      if (existing.grantKey !== grantKey || existing.toolVersionId !== tool._id
        || existing.toolVersionDigest !== tool.toolVersionDigest || existing.expiresAt !== effectiveExpiresAt
        || mcpToolGrantDigest(existing.immutableSnapshot) !== existing.grantDigest) {
        throw new Error("Tool Grant idempotency key is bound to another identity.");
      }
      return { toolGrantId: existing._id, grantDigest: existing.grantDigest, created: false as const };
    }
    const versions = await ctx.db.query("mcpToolGrants").withIndex("by_project", (q) => q.eq("projectId", args.projectId)).collect();
    const nextVersion = versions.filter((item) => item.grantKey === grantKey).reduce((max, item) => Math.max(max, item.version), 0) + 1;
    const snapshot = mcpToolGrantSnapshot({ grantKey, version: nextVersion, projectId: String(args.projectId), toolVersionId: String(tool._id), toolVersionDigest: tool.toolVersionDigest, toolVersionSnapshot: tool.immutableSnapshot, issuedAt: now, expiresAt: effectiveExpiresAt });
    const digest = mcpToolGrantDigest(snapshot);
    const id = await ctx.db.insert("mcpToolGrants", {
      tenantId: access.project.tenantId, projectId: args.projectId, grantKey, version: nextVersion,
      grantDigest: digest, immutableSnapshot: snapshot, toolVersionId: tool._id, toolVersionDigest: tool.toolVersionDigest,
      state: "ACTIVE", issuedAt: now, expiresAt: snapshot.expiresAt, registrationIdempotencyKey: key,
      createdBy: access.actorId, createdAt: now,
    });
    return { toolGrantId: id, grantDigest: digest, created: true as const };
  },
});

export const revokeGrant = mutation({
  args: { toolGrantId: v.id("mcpToolGrants"), expectedDigest: v.string(), reason: v.string() },
  handler: async (ctx, args) => {
    const grant = await ctx.db.get(args.toolGrantId);
    if (!grant) throw new Error("Tool Grant is unavailable or unauthorized.");
    const access = await requireWorkspacePermission(ctx, grant.projectId, FACTORY_PERMISSIONS.APPROVE);
    if (grant.grantDigest !== args.expectedDigest || mcpToolGrantDigest(grant.immutableSnapshot) !== args.expectedDigest) throw new Error("Tool Grant revocation identity mismatch.");
    if (grant.state !== "ACTIVE") throw new Error("Tool Grant is not active.");
    const now = Date.now();
    await ctx.db.patch(grant._id, { state: "REVOKED", revokedBy: access.actorId, revokedAt: now, revocationReason: bounded(args.reason, 1_000, "Revocation reason") });
    return { toolGrantId: grant._id, revokedAt: now };
  },
});

export const recordReceiptInternal = internalMutation({
  args: { receipt: governedMcpReceiptValidator },
  handler: async (ctx, args) => {
    let receipt = args.receipt;
    const [run, profile, grant, tool] = await Promise.all([
      ctx.db.get(receipt.workflowRunId),
      ctx.db.get(receipt.executionProfileId),
      ctx.db.get(receipt.toolGrantId),
      ctx.db.get(receipt.toolVersionId),
    ]);
    validateReceiptEnvelope(receipt);
    if (!run?.projectId || !run.workOrderId || run._id !== receipt.workflowRunId
      || String(run._id) !== receipt.attemptId || String(run.projectId) !== receipt.projectId
      || String(run.workOrderId) !== receipt.workOrderId) throw new Error("MCP receipt Attempt scope is substituted.");
    if (!profile || profile.projectId !== run.projectId || run.executionProfileId !== profile._id
      || run.executionProfileDigest !== receipt.executionProfileDigest || profile.profileDigest !== receipt.executionProfileDigest
      || !grant || profile.toolGrantId !== grant._id || profile.toolGrantDigest !== receipt.toolGrantDigest
      || grant.projectId !== run.projectId || grant.grantDigest !== receipt.toolGrantDigest
      || mcpToolGrantIssues(grant.immutableSnapshot).length > 0
      || mcpToolGrantDigest(grant.immutableSnapshot) !== receipt.toolGrantDigest
      || !tool || tool.projectId !== run.projectId || grant.toolVersionId !== tool._id
      || grant.toolVersionDigest !== receipt.toolVersionDigest || tool.toolVersionDigest !== receipt.toolVersionDigest
      || mcpToolVersionIssues(tool.immutableSnapshot).length > 0
      || mcpToolVersionDigest(tool.immutableSnapshot) !== receipt.toolVersionDigest
      || receipt.serverImplementationDigest !== tool.immutableSnapshot.server.implementationDigest
      || receipt.expectedServerVersion !== tool.immutableSnapshot.server.version
      || receipt.expectedInputSchemaDigest !== tool.immutableSnapshot.operation.inputSchemaDigest) {
      throw new Error("MCP receipt authority chain is substituted.");
    }
    validateReceiptSemantics(receipt, tool.immutableSnapshot.operation, Date.now());
    const samePhaseReceipts = await ctx.db.query("mcpToolCallReceipts")
      .withIndex("by_call_phase", (q) => q.eq("callId", receipt.callId).eq("phase", receipt.phase))
      .collect();
    if (receipt.phase === "AUTHORIZATION" && receipt.status === "ALLOWED") {
      let denialReason = samePhaseReceipts.some((item) => item.status === "ALLOWED")
        ? "REPLAY_DENIED"
        : authorizationDenialReason({ receipt, run, profile, grant, tool, now: Date.now() });
      if (!denialReason) {
        const priorAllowed = await ctx.db.query("mcpToolCallReceipts")
          .withIndex("by_attempt_grant_phase", (q) => q
            .eq("workflowRunId", run._id)
            .eq("toolGrantId", grant._id)
            .eq("phase", "AUTHORIZATION"))
          .collect();
        if (priorAllowed.filter((item) => item.status === "ALLOWED").length >= grant.immutableSnapshot.maxCallsPerAttempt) {
          denialReason = "CALL_BUDGET_EXHAUSTED";
        }
      }
      if (denialReason) receipt = { ...receipt, status: "DENIED", reason: denialReason };
    }
    const lateOrStale = receipt.phase === "COMPLETION" && Boolean(
      run.status !== "RUNNING" || run.cancellationRequestedAt || !run.lease
      || run.lease.leaseId !== receipt.attemptLeaseId
      || run.lease.workerId !== receipt.workerId
      || run.lease.workerSessionId !== receipt.workerSessionId
      || run.lease.workerGeneration !== receipt.workerGeneration
      || run.lease.expiresAt <= Date.now(),
    );
    const receiptDigest = `sha256:${computeCanonicalHash(receipt.phase === "COMPLETION"
      ? { ...receipt, lateOrStale }
      : receipt)}`;
    const exactExisting = samePhaseReceipts.find((item) => item.receiptDigest === receiptDigest);
    if (exactExisting) return {
      receiptId: exactExisting._id,
      created: false as const,
      permitted: exactExisting.phase !== "AUTHORIZATION" || exactExisting.status === "ALLOWED",
      reason: exactExisting.reason,
      lateOrStale: exactExisting.lateOrStale,
    };
    const existingAuthorization = receipt.phase === "COMPLETION"
      ? (await ctx.db.query("mcpToolCallReceipts").withIndex("by_call_phase", (q) => q.eq("callId", receipt.callId).eq("phase", "AUTHORIZATION")).collect())
        .find((item) => item.status === "ALLOWED")
      : null;
    if (receipt.phase === "COMPLETION" && (!existingAuthorization
      || existingAuthorization.requestDigest !== receipt.requestDigest
      || existingAuthorization.workflowRunId !== run._id
      || existingAuthorization.attemptLeaseId !== receipt.attemptLeaseId
      || existingAuthorization.workerId !== receipt.workerId
      || existingAuthorization.workerSessionId !== receipt.workerSessionId
      || existingAuthorization.workerGeneration !== receipt.workerGeneration
      || existingAuthorization.occurredAt > receipt.occurredAt)) {
      throw new Error("MCP completion receipt has no matching allowed authorization.");
    }
    const isReplayDenial = receipt.phase === "AUTHORIZATION" && receipt.status === "DENIED"
      && receipt.reason === "REPLAY_DENIED" && samePhaseReceipts.some((item) => item.status === "ALLOWED");
    if (samePhaseReceipts.length > 0 && !isReplayDenial) {
      throw new Error("MCP receipt phase replay conflicts with immutable history.");
    }
    const eventId = await ctx.db.insert("runEvents", {
      tenantId: run.tenantId, projectId: run.projectId, workOrderId: run.workOrderId, workflowRunId: run._id,
      idempotencyKey: `mcp:${receipt.callId}:${receipt.phase}:${receiptDigest}`, eventType: "TOOL_CALLED",
      workflowStep: "governed-mcp", sequenceNumber: await nextSequence(ctx, run._id), actor: "HOST_BROKER",
      toolName: receipt.operation, commandSummary: `Governed MCP ${String(receipt.phase).toLowerCase()} ${String(receipt.status).toLowerCase()}`,
      status: receipt.status, startedAt: receipt.occurredAt, durationMs: receipt.durationMs,
      errorCategory: ["DENIED", "FAILED", "CANCELED", "TIMED_OUT"].includes(receipt.status) ? receipt.reason : undefined,
      metadata: { receiptDigest, callId: receipt.callId, executionProfileDigest: receipt.executionProfileDigest, toolGrantDigest: receipt.toolGrantDigest, toolVersionDigest: receipt.toolVersionDigest, poisoningDetected: receipt.poisoningDetected, redactionApplied: receipt.redactionApplied, requestBytes: receipt.requestBytes, retryCount: receipt.retryCount, costStatus: receipt.costStatus, expectedServerVersion: receipt.expectedServerVersion, observedServerVersion: receipt.observedServerVersion, expectedInputSchemaDigest: receipt.expectedInputSchemaDigest, observedInputSchemaDigest: receipt.observedInputSchemaDigest, lateOrStale },
    });
    const artifactId = await ctx.db.insert("runArtifacts", {
      tenantId: run.tenantId, projectId: run.projectId, workOrderId: run.workOrderId, workflowRunId: run._id,
      idempotencyKey: `mcp:${receipt.callId}:${receipt.phase}:${receiptDigest}:receipt`, artifactType: "VERIFICATION_EVIDENCE",
      name: `Governed MCP ${receipt.phase} receipt`, description: `${receipt.status}: ${receipt.reason}`,
      contentHash: receiptDigest, producer: "HOST_BROKER", producingEventId: eventId,
      retentionPolicy: "AUDIT", sensitivity: tool.immutableSnapshot.dataClassification, createdAt: receipt.occurredAt,
      metadata: { callId: receipt.callId, phase: receipt.phase, sequence: receipt.sequence, requestDigest: receipt.requestDigest, requestBytes: receipt.requestBytes, retryCount: receipt.retryCount, costStatus: receipt.costStatus, outputDigest: receipt.outputDigest, outputBytes: receipt.outputBytes, expectedServerVersion: receipt.expectedServerVersion, observedServerVersion: receipt.observedServerVersion, expectedInputSchemaDigest: receipt.expectedInputSchemaDigest, observedInputSchemaDigest: receipt.observedInputSchemaDigest, lateOrStale },
    });
    const id = await ctx.db.insert("mcpToolCallReceipts", {
      tenantId: run.tenantId, projectId: run.projectId, workOrderId: run.workOrderId, workflowRunId: run._id,
      attemptLeaseId: receipt.attemptLeaseId, executionProfileId: profile._id, executionProfileDigest: receipt.executionProfileDigest,
      workerId: receipt.workerId, workerSessionId: receipt.workerSessionId, workerGeneration: receipt.workerGeneration,
      toolGrantId: grant._id, toolGrantDigest: receipt.toolGrantDigest, toolVersionId: tool._id, toolVersionDigest: receipt.toolVersionDigest,
      callId: receipt.callId, phase: receipt.phase, sequence: receipt.sequence, operation: receipt.operation,
      status: receipt.status, reason: receipt.reason, requestDigest: receipt.requestDigest, outputDigest: receipt.outputDigest,
      requestBytes: receipt.requestBytes, retryCount: receipt.retryCount, costStatus: receipt.costStatus,
      outputBytes: receipt.outputBytes, poisoningDetected: receipt.poisoningDetected, redactionApplied: receipt.redactionApplied,
      serverImplementationDigest: receipt.serverImplementationDigest, receiptDigest, occurredAt: receipt.occurredAt,
      expectedServerVersion: receipt.expectedServerVersion, observedServerVersion: receipt.observedServerVersion,
      expectedInputSchemaDigest: receipt.expectedInputSchemaDigest, observedInputSchemaDigest: receipt.observedInputSchemaDigest,
      durationMs: receipt.durationMs, lateOrStale, evidenceEventId: eventId, evidenceArtifactId: artifactId,
    });
    return {
      receiptId: id,
      evidenceEventId: eventId,
      evidenceArtifactId: artifactId,
      created: true as const,
      permitted: receipt.phase !== "AUTHORIZATION" || receipt.status === "ALLOWED",
      reason: receipt.reason,
      lateOrStale,
    };
  },
});

export const listReceiptsForAttempt = query({
  args: { workflowRunId: v.id("workflowRuns") },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.workflowRunId);
    if (!run?.projectId) throw new Error("Attempt is unavailable or unauthorized.");
    await requireWorkspacePermission(ctx, run.projectId, FACTORY_PERMISSIONS.VIEW);
    return await ctx.db.query("mcpToolCallReceipts").withIndex("by_attempt", (q) => q.eq("workflowRunId", args.workflowRunId)).collect();
  },
});

export { executionProfileToolGrantBinding };

function authorizationDenialReason(input: {
  receipt: any; run: any; profile: any; grant: any; tool: any; now: number;
}) {
  const { receipt, run, profile, grant, tool, now } = input;
  if (receipt.operation !== tool.immutableSnapshot.operation.name
    || receipt.operation !== grant.immutableSnapshot.operation) return "OPERATION_DENIED";
  if (run.status !== "RUNNING" || run.cancellationRequestedAt) return "ATTEMPT_CANCELLED";
  if (!run.lease || run.lease.leaseId !== receipt.attemptLeaseId
    || run.lease.workerId !== receipt.workerId || run.lease.workerSessionId !== receipt.workerSessionId
    || run.lease.workerGeneration !== receipt.workerGeneration || run.lease.expiresAt <= now) return "LEASE_STALE";
  if (!profile.enabled || profile.qualificationStatus !== "EVIDENCE_QUALIFIED"
    || profile.admissionStatus !== "PRODUCTION_PILOT_ELIGIBLE"
    || (profile.qualificationExpiresAt ?? 0) <= now) return "EXECUTION_PROFILE_STALE";
  if (grant.state === "REVOKED") return "TOOL_GRANT_REVOKED";
  if (grant.expiresAt <= now) return "TOOL_GRANT_EXPIRED";
  if (!tool.enabled || tool.qualificationStatus !== "EVIDENCE_QUALIFIED"
    || (tool.qualificationExpiresAt ?? 0) <= now) return "TOOL_VERSION_STALE";
  return undefined;
}

function validateReceiptEnvelope(receipt: {
  callId: string; phase: "AUTHORIZATION" | "COMPLETION"; sequence: 1 | 2;
  status: "ALLOWED" | "DENIED" | "SUCCEEDED" | "FAILED" | "CANCELED" | "TIMED_OUT";
  reason: string; projectId: string; workOrderId: string; attemptId: string;
  attemptLeaseId: string; workerId: string; workerSessionId: string; workerGeneration: number;
  executionProfileDigest: string; toolGrantDigest: string; toolVersionDigest: string;
  operation: string; requestDigest: string; outputDigest?: string; outputBytes?: number;
  requestBytes: number; retryCount: 0; costStatus: "UNKNOWN";
  serverImplementationDigest: string; occurredAt: number; durationMs?: number;
  expectedServerVersion?: string; observedServerVersion?: string;
  expectedInputSchemaDigest?: string; observedInputSchemaDigest?: string;
}) {
  const authorizationStatus = receipt.status === "ALLOWED" || receipt.status === "DENIED";
  if ((receipt.phase === "AUTHORIZATION") !== authorizationStatus
    || receipt.sequence !== (receipt.phase === "AUTHORIZATION" ? 1 : 2)) {
    throw new Error("MCP receipt phase, sequence, and status are inconsistent.");
  }
  for (const [label, value, max] of [
    ["call ID", receipt.callId, 200], ["project ID", receipt.projectId, 200],
    ["WorkOrder ID", receipt.workOrderId, 200], ["Attempt ID", receipt.attemptId, 200],
    ["lease ID", receipt.attemptLeaseId, 200], ["worker ID", receipt.workerId, 200],
    ["worker session ID", receipt.workerSessionId, 200], ["operation", receipt.operation, 200],
    ["reason", receipt.reason, 500],
  ] as const) bounded(value, max, `MCP receipt ${label}`);
  for (const [label, value] of [
    ["execution profile", receipt.executionProfileDigest], ["Tool Grant", receipt.toolGrantDigest],
    ["Tool Version", receipt.toolVersionDigest], ["server implementation", receipt.serverImplementationDigest],
  ]) {
    if (!/^sha256:[a-f0-9]{64}$/.test(value)) throw new Error(`MCP receipt ${label} digest is invalid.`);
  }
  for (const [label, value] of [["request", receipt.requestDigest], ...(receipt.outputDigest ? [["output", receipt.outputDigest]] : [])]) {
    if (!/^[a-f0-9]{64}$/.test(value)) throw new Error(`MCP receipt ${label} digest is invalid.`);
  }
  for (const [label, value] of [["expected input schema", receipt.expectedInputSchemaDigest], ["observed input schema", receipt.observedInputSchemaDigest]] as const) {
    if (value !== undefined && !/^[a-f0-9]{64}$/.test(value)) throw new Error(`MCP receipt ${label} digest is invalid.`);
  }
  if (!Number.isSafeInteger(receipt.workerGeneration) || receipt.workerGeneration < 1
    || !Number.isFinite(receipt.occurredAt) || receipt.occurredAt <= 0
    || (receipt.durationMs !== undefined && (!Number.isFinite(receipt.durationMs) || receipt.durationMs < 0))
    || !Number.isSafeInteger(receipt.requestBytes) || receipt.requestBytes < 0
    || receipt.retryCount !== 0 || receipt.costStatus !== "UNKNOWN"
    || (receipt.outputBytes !== undefined && (!Number.isSafeInteger(receipt.outputBytes) || receipt.outputBytes < 0))) {
    throw new Error("MCP receipt metrics are invalid.");
  }
}

function validateReceiptSemantics(
  receipt: {
    phase: "AUTHORIZATION" | "COMPLETION";
    operation: string;
    status: "ALLOWED" | "DENIED" | "SUCCEEDED" | "FAILED" | "CANCELED" | "TIMED_OUT";
    reason: string;
    requestBytes: number;
    outputDigest?: string;
    outputBytes?: number;
    poisoningDetected?: boolean;
    redactionApplied?: boolean;
    expectedServerVersion?: string;
    observedServerVersion?: string;
    expectedInputSchemaDigest?: string;
    observedInputSchemaDigest?: string;
    occurredAt: number;
    durationMs?: number;
  },
  operation: { maxRequestBytes: number; maxResponseBytes: number; timeoutMs: number },
  now: number,
) {
  const oversizedRequestDenial = receipt.phase === "AUTHORIZATION"
    && receipt.status === "DENIED" && receipt.reason === "REQUEST_TOO_LARGE";
  if ((receipt.requestBytes > operation.maxRequestBytes && !oversizedRequestDenial)
    || receipt.occurredAt > now + 60_000) {
    throw new Error("MCP receipt exceeds its frozen request or time boundary.");
  }
  const hasCompletionFields = receipt.outputDigest !== undefined || receipt.outputBytes !== undefined
    || receipt.poisoningDetected !== undefined || receipt.redactionApplied !== undefined
    || receipt.durationMs !== undefined;
  if (receipt.phase === "AUTHORIZATION") {
    const deniedReasons = new Set([
      "CALL_ID_INVALID", "REQUEST_TOO_LARGE", "REQUEST_SCHEMA_INVALID", "ATTEMPT_SCOPE_MISMATCH",
      "LEASE_STALE", "ATTEMPT_CANCELLED", "EXECUTION_PROFILE_MISMATCH", "EXECUTION_PROFILE_STALE",
      "TOOL_GRANT_MISSING", "TOOL_GRANT_MISMATCH", "TOOL_GRANT_REVOKED", "TOOL_GRANT_EXPIRED",
      "TOOL_VERSION_MISMATCH", "TOOL_VERSION_STALE", "SERVER_SUBSTITUTION", "OPERATION_DENIED",
      "DESTINATION_DENIED", "CREDENTIAL_CLASS_DENIED", "REPLAY_DENIED", "CALL_BUDGET_EXHAUSTED",
    ]);
    if (hasCompletionFields
      || (receipt.status === "ALLOWED" && receipt.reason !== "EXACT_AUTHORITY_MATCH")
      || (receipt.status === "DENIED" && !deniedReasons.has(receipt.reason))) {
      throw new Error("MCP authorization receipt semantics are invalid.");
    }
    return;
  }
  if (receipt.durationMs === undefined || receipt.durationMs > operation.timeoutMs + 60_000) {
    throw new Error("MCP completion duration is invalid.");
  }
  if (receipt.status === "SUCCEEDED") {
    if (receipt.reason !== "BOUNDED_READ_COMPLETED" || receipt.outputDigest === undefined
      || receipt.outputBytes === undefined || receipt.outputBytes > operation.maxResponseBytes
      || receipt.poisoningDetected === undefined || receipt.redactionApplied !== false
      || (receipt.operation !== MCP_QUALIFICATION_OPERATION
        && (receipt.observedServerVersion !== receipt.expectedServerVersion
          || receipt.observedInputSchemaDigest !== receipt.expectedInputSchemaDigest))) {
      throw new Error("MCP success receipt semantics are invalid.");
    }
    return;
  }
  const expectedReason = receipt.status === "CANCELED"
    ? new Set(["ATTEMPT_CANCELLED"])
    : receipt.status === "TIMED_OUT"
      ? new Set(["TOOL_TIMEOUT"])
      : new Set([
        "RESPONSE_SCHEMA_INVALID", "RESPONSE_TOO_LARGE", "OUTPUT_SECRET_DETECTED",
        "SERVER_UNAVAILABLE", "TOOL_CALL_FAILED", "DESTINATION_DENIED",
        "IMPLEMENTATION_SUBSTITUTION", "SERVER_SUBSTITUTION", "SERVER_SCHEMA_SUBSTITUTION",
        "REDIRECT_DENIED",
      ]);
  if (!expectedReason.has(receipt.reason) || receipt.outputDigest !== undefined
    || receipt.outputBytes !== undefined || receipt.poisoningDetected !== undefined
    || receipt.redactionApplied !== (receipt.reason === "OUTPUT_SECRET_DETECTED")) {
    throw new Error("MCP failure receipt semantics are invalid.");
  }
}

async function nextSequence(ctx: any, runId: any) {
  const rows = await ctx.db.query("runEvents").withIndex("by_run", (q: any) => q.eq("workflowRunId", runId)).collect();
  return rows.reduce((max: number, row: any) => Math.max(max, row.sequenceNumber), 0) + 1;
}
function bounded(value: string, max: number, label: string) {
  const normalized = value.trim();
  if (!normalized || normalized.length > max || /[\0\r\n]/.test(normalized)) throw new Error(`${label} is invalid.`);
  return normalized;
}
