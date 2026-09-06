import { v } from "convex/values";
import { action, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { makeFunctionReference } from "convex/server";
import type { Id } from "./_generated/dataModel";
import { canonicalRepositoryKey } from "./lib/workspaceRepositories";
import {
  canonicalServiceCommand,
  validateServiceCommandEnvelope,
  type ServiceCommandEnvelope,
} from "./lib/serviceCommandAuth";

const envelope = v.object({
  serviceId: v.string(),
  capability: v.string(),
  projectId: v.string(),
  repositoryId: v.string(),
  commandId: v.string(),
  issuedAt: v.number(),
  expiresAt: v.number(),
  payloadDigest: v.string(),
  signature: v.string(),
});

type SignatureStatus = "VALID" | "INVALID" | "MISSING";

export const resolveWorkOrderScope = internalQuery({
  args: {
    workOrderId: v.id("workOrders"),
    factoryDefinitionVersionId: v.id("factoryDefinitionVersions"),
  },
  handler: async (ctx, args) => {
    const [workOrder, version] = await Promise.all([
      ctx.db.get(args.workOrderId),
      ctx.db.get(args.factoryDefinitionVersionId),
    ]);
    if (!workOrder || !workOrder.projectId) throw new Error("WorkOrder is unavailable or unscoped.");
    if (!version || version.projectId !== workOrder.projectId) throw new Error("Factory version is outside the WorkOrder workspace.");
    const [definition, repository] = await Promise.all([
      ctx.db.get(version.factoryDefinitionId),
      ctx.db.get(version.repositoryId),
    ]);
    if (!definition || definition.status !== "ACTIVE" || definition.activeVersionId !== version._id) {
      throw new Error("Service execution requires the active Factory version.");
    }
    if (!repository || repository.projectId !== workOrder.projectId || repository.status !== "READY") {
      throw new Error("Service execution repository is not ready.");
    }
    if (workOrder.repository && canonicalRepositoryKey(workOrder.repository) !== canonicalRepositoryKey(repository.repository)) {
      throw new Error("WorkOrder repository does not match the active Factory version.");
    }
    return { projectId: String(workOrder.projectId), repositoryId: String(repository._id) };
  },
});

export const resolveExecutionScope = internalQuery({
  args: { workflowRunId: v.id("workflowRuns") },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.workflowRunId);
    if (!run?.projectId || !run.repositoryId) {
      throw new Error("Execution run is unavailable or unscoped.");
    }
    return {
      projectId: String(run.projectId),
      repositoryId: String(run.repositoryId),
    };
  },
});

export const resolveRepositoryScope = internalQuery({
  args: {
    projectId: v.id("projects"),
    repositoryId: v.id("workspaceRepositories"),
  },
  handler: async (ctx, args) => {
    const repository = await ctx.db.get(args.repositoryId);
    if (
      !repository ||
      repository.projectId !== args.projectId ||
      repository.status !== "READY"
    ) {
      throw new Error("Execution repository is unavailable or not ready.");
    }
    return {
      projectId: String(args.projectId),
      repositoryId: String(args.repositoryId),
    };
  },
});

export const resolveMissionIntentScope = internalQuery({
  args: {
    projectId: v.id("projects"),
    missionId: v.id("missions"),
  },
  handler: async (ctx, args) => {
    const mission = await ctx.db.get(args.missionId);
    if (!mission || mission.projectId !== args.projectId || !mission.repositoryId) {
      throw new Error("Mission contribution scope is unavailable or has no repository.");
    }
    const repository = await ctx.db.get(mission.repositoryId);
    if (!repository || repository.projectId !== args.projectId || repository.status !== "READY") {
      throw new Error("Mission contribution repository is unavailable or not ready.");
    }
    return { projectId: String(args.projectId), repositoryId: String(repository._id) };
  },
});

export const resolveRepositoryBindingScope = internalQuery({
  args: {
    projectId: v.id("projects"),
    repositoryId: v.id("workspaceRepositories"),
  },
  handler: async (ctx, args) => {
    const repository = await ctx.db.get(args.repositoryId);
    if (!repository || repository.projectId !== args.projectId) {
      throw new Error("GitHub installation repository scope is unavailable.");
    }
    return {
      projectId: String(args.projectId),
      repositoryId: String(args.repositoryId),
    };
  },
});

export const resolveExactModelRouteHealthScope = internalQuery({
  args: {
    factoryDefinitionVersionId: v.id("factoryDefinitionVersions"),
    expectedRouteDigest: v.string(),
  },
  handler: async (ctx, args) => {
    const version = await ctx.db.get(args.factoryDefinitionVersionId);
    if (!version?.modelCatalogId
      || !version.modelRouteDigest
      || version.modelRouteDigest !== args.expectedRouteDigest) {
      throw new Error("Factory version does not match the exact model route health claim.");
    }
    const [definition, repository, modelRoute] = await Promise.all([
      ctx.db.get(version.factoryDefinitionId),
      ctx.db.get(version.repositoryId),
      ctx.db.get(version.modelCatalogId),
    ]);
    if (!definition || definition.projectId !== version.projectId
      || !repository || repository.projectId !== version.projectId || repository.status !== "READY"
      || !modelRoute || modelRoute.projectId !== version.projectId
      || modelRoute.routeDigest !== version.modelRouteDigest) {
      throw new Error("Exact model route health claim exceeds the Factory repository scope.");
    }
    return {
      projectId: String(version.projectId),
      repositoryId: String(repository._id),
      modelCatalogId: modelRoute._id,
      expectedRouteDigest: version.modelRouteDigest,
    };
  },
});

export const resolvePrEvidenceScope = internalQuery({
  args: {
    projectId: v.id("projects"),
    repositoryId: v.id("workspaceRepositories"),
    workOrderId: v.id("workOrders"),
    workflowRunId: v.id("workflowRuns"),
    taskId: v.optional(v.id("tasks")),
  },
  handler: async (ctx, args) => {
    const [repository, workOrder, workflowRun, task] = await Promise.all([
      ctx.db.get(args.repositoryId),
      ctx.db.get(args.workOrderId),
      ctx.db.get(args.workflowRunId),
      args.taskId ? ctx.db.get(args.taskId) : null,
    ]);
    if (!repository || repository.projectId !== args.projectId || repository.status !== "READY") {
      throw new Error("GitHub PR evidence repository scope is unavailable.");
    }
    if (!workOrder || workOrder.projectId !== args.projectId || workOrder.repositoryId !== args.repositoryId) {
      throw new Error("GitHub PR evidence WorkOrder scope does not match the repository.");
    }
    if (!workflowRun || workflowRun.workOrderId !== workOrder._id || workflowRun.repositoryId !== repository._id) {
      throw new Error("GitHub PR evidence Attempt scope does not match the WorkOrder.");
    }
    if (task && (task.projectId !== args.projectId || task.workOrderId !== workOrder._id)) {
      throw new Error("GitHub PR evidence Task scope does not match the WorkOrder.");
    }
    return { projectId: String(args.projectId), repositoryId: String(args.repositoryId) };
  },
});

export const claim = internalMutation({
  args: { envelope },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("serviceCommandReceipts")
      .withIndex("by_command", (q) => q.eq("commandId", args.envelope.commandId))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        attemptCount: existing.attemptCount + 1,
        replayDetectedAt: Date.now(),
      });
      return { accepted: false as const, receiptId: existing._id };
    }
    const receiptId = await ctx.db.insert("serviceCommandReceipts", {
      serviceId: args.envelope.serviceId,
      capability: args.envelope.capability,
      commandId: args.envelope.commandId,
      claimedProjectId: args.envelope.projectId,
      claimedRepositoryId: args.envelope.repositoryId,
      payloadDigest: args.envelope.payloadDigest,
      signatureStatus: "VALID",
      status: "RECEIVED",
      issuedAt: args.envelope.issuedAt,
      expiresAt: args.envelope.expiresAt,
      receivedAt: Date.now(),
      attemptCount: 1,
    });
    return { accepted: true as const, receiptId };
  },
});

export const deny = internalMutation({
  args: {
    envelope,
    signatureStatus: v.union(v.literal("VALID"), v.literal("INVALID"), v.literal("MISSING")),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("serviceCommandReceipts")
      .withIndex("by_command", (q) => q.eq("commandId", args.envelope.commandId))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { attemptCount: existing.attemptCount + 1, replayDetectedAt: Date.now() });
      return existing._id;
    }
    return await ctx.db.insert("serviceCommandReceipts", {
      serviceId: args.envelope.serviceId,
      capability: args.envelope.capability,
      commandId: args.envelope.commandId,
      claimedProjectId: args.envelope.projectId,
      claimedRepositoryId: args.envelope.repositoryId,
      payloadDigest: args.envelope.payloadDigest,
      signatureStatus: args.signatureStatus,
      status: "DENIED",
      issuedAt: args.envelope.issuedAt,
      expiresAt: args.envelope.expiresAt,
      receivedAt: Date.now(),
      completedAt: Date.now(),
      attemptCount: 1,
      reason: args.reason,
    });
  },
});

export const complete = internalMutation({
  args: {
    receiptId: v.id("serviceCommandReceipts"),
    status: v.union(v.literal("SUCCEEDED"), v.literal("FAILED")),
    reason: v.optional(v.string()),
    resultReference: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.receiptId, {
      status: args.status,
      completedAt: Date.now(),
      reason: args.reason,
      resultReference: args.resultReference,
    });
  },
});

export const bindGithubInstallation = action({
  args: { envelope, payloadJson: v.string() },
  handler: async (ctx, args): Promise<any> => {
    const payload = await authorize(ctx, args.envelope, args.payloadJson, "github.installation.bind");
    const scope = await ctx.runQuery(internal.serviceCommands.resolveRepositoryBindingScope, {
      projectId: payload.projectId,
      repositoryId: payload.repositoryId,
    });
    const receipt = await claimScoped(ctx, args.envelope, scope);
    try {
      const result = await ctx.runMutation(internal.githubAppConnections.upsertInstallation, {
        repositoryId: payload.repositoryId,
        providerRepositoryId: payload.providerRepositoryId,
        installationId: payload.installationId,
        appId: payload.appId,
        accountLogin: payload.accountLogin,
        accountType: payload.accountType,
        repositorySelection: payload.repositorySelection,
        permissions: payload.permissions,
        subscribedEvents: payload.subscribedEvents,
        status: "CONNECTED",
        installedAt: payload.installedAt,
        verifiedAt: payload.verifiedAt,
        lastTokenIssuedAt: payload.lastTokenIssuedAt,
      });
      await ctx.runMutation(internal.serviceCommands.complete, {
        receiptId: receipt.receiptId,
        status: result.ready ? "SUCCEEDED" : "FAILED",
        reason: result.ready ? undefined : "github-installation-capability-not-ready",
        resultReference: String(result.installationRecordId),
      });
      return result;
    } catch (error) {
      await fail(ctx, receipt.receiptId, error);
      throw error;
    }
  },
});

export const ingestGithubPrEvidence = action({
  args: { envelope, payloadJson: v.string() },
  handler: async (ctx, args): Promise<any> => {
    const payload = await authorize(ctx, args.envelope, args.payloadJson, "github.pr-evidence.ingest");
    const scope = await ctx.runQuery(internal.serviceCommands.resolvePrEvidenceScope, {
      projectId: payload.projectId,
      repositoryId: payload.repositoryId,
      workOrderId: payload.workOrderId,
      workflowRunId: payload.workflowRunId,
      taskId: payload.taskId,
    });
    const receipt = await claimScoped(ctx, args.envelope, scope);
    try {
      const evaluationId = await ctx.runMutation(internal.factory.githubCi.applyCiIngest, payload.evidence);
      await ctx.runMutation(internal.serviceCommands.complete, {
        receiptId: receipt.receiptId,
        status: "SUCCEEDED",
        resultReference: String(evaluationId),
      });
      return { evaluationId, accepted: true };
    } catch (error) {
      await fail(ctx, receipt.receiptId, error);
      throw error;
    }
  },
});

export const dispatchWorkOrder = action({
  args: { envelope, payloadJson: v.string() },
  handler: async (ctx, args): Promise<any> => {
    const payload = await authorize(ctx, args.envelope, args.payloadJson, "workorders.dispatch");
    const scope = await ctx.runQuery(internal.serviceCommands.resolveWorkOrderScope, {
      workOrderId: payload.workOrderId,
      factoryDefinitionVersionId: payload.factoryDefinitionVersionId,
    });
    const receipt = await claimScoped(ctx, args.envelope, scope);
    try {
      const result = await ctx.runMutation(internal.workOrders.dispatchServiceInternal, {
        workOrderId: payload.workOrderId,
        taskId: payload.taskId,
        workflowId: payload.workflowId,
        actorType: "SYSTEM",
        actorId: `service:${args.envelope.serviceId}`,
        idempotencyKey: payload.idempotencyKey,
        runtime: payload.runtime,
        repositoryId: scope.repositoryId as Id<"workspaceRepositories">,
        codeScopeIds: payload.codeScopeIds,
        owningTeamId: payload.owningTeamId,
        ownerMemberId: payload.ownerMemberId,
        executionEnvironment: payload.executionEnvironment,
        executorHostId: payload.executorHostId,
        authorizedModelOverride: payload.authorizedModelOverride,
        model: payload.model,
        worktree: payload.worktree,
        retryOfWorkflowRunId: payload.retryOfWorkflowRunId,
        retryReason: payload.retryReason,
        factoryDefinitionVersionId: payload.factoryDefinitionVersionId,
        branch: payload.branch,
      });
      await ctx.runMutation(internal.serviceCommands.complete, {
        receiptId: receipt.receiptId,
        status: "SUCCEEDED",
        resultReference: result?.run?._id ? String(result.run._id) : undefined,
      });
      return result;
    } catch (error) {
      await fail(ctx, receipt.receiptId, error);
      throw error;
    }
  },
});

export const ingestReceiptPacket = action({
  args: { envelope, payloadJson: v.string() },
  handler: async (ctx, args): Promise<any> => {
    const payload = await authorize(ctx, args.envelope, args.payloadJson, "receipts.ingest");
    const scope = await ctx.runQuery(internal.serviceCommands.resolveWorkOrderScope, {
      workOrderId: payload.workOrderId,
      factoryDefinitionVersionId: payload.factoryDefinitionVersionId,
    });
    const receipt = await claimScoped(ctx, args.envelope, scope);
    try {
      const result = await ctx.runMutation((internal as any)["factory/piBridge"].ingestReceiptPacketInternal, {
        workOrderId: payload.workOrderId,
        workflowRunId: payload.workflowRunId,
        piSessionId: payload.piSessionId,
        piExecutionId: payload.piExecutionId,
        markRunCompleted: payload.markRunCompleted,
        receipts: payload.receipts ?? [],
        handoff: payload.handoff,
        idempotencyKey: payload.idempotencyKey,
        contextActivationReceiptId: payload.contextActivationReceiptId,
        serviceId: args.envelope.serviceId,
      });
      await ctx.runMutation(internal.serviceCommands.complete, {
        receiptId: receipt.receiptId,
        status: "SUCCEEDED",
        resultReference: String(payload.workflowRunId),
      });
      return result;
    } catch (error) {
      await fail(ctx, receipt.receiptId, error);
      throw error;
    }
  },
});

export const claimFactoryAttempt = action({
  args: { envelope, payloadJson: v.string() },
  handler: async (ctx, args): Promise<any> => {
    const payload = await authorize(ctx, args.envelope, args.payloadJson, "attempts.claim");
    const scope = await ctx.runQuery(internal.factory.attempts.resolveScope, {
      workflowRunId: payload.workflowRunId,
    });
    const receipt = await claimScoped(ctx, args.envelope, scope);
    try {
      const result = await ctx.runMutation(internal.factory.attempts.claimInternal, {
        workflowRunId: payload.workflowRunId,
        leaseId: payload.leaseId,
        ownerId: args.envelope.serviceId,
        leaseDurationMs: payload.leaseDurationMs,
        requiredAttemptPurpose: "IMPLEMENTATION",
        workerId: payload.workerId,
        workerSessionId: payload.workerSessionId,
      });
      await ctx.runMutation(internal.serviceCommands.complete, {
        receiptId: receipt.receiptId,
        status: "SUCCEEDED",
        resultReference: result?.claimed ? String(payload.workflowRunId) : result?.reason,
      });
      return result;
    } catch (error) {
      await fail(ctx, receipt.receiptId, error);
      throw error;
    }
  },
});

export const renewFactoryAttempt = action({
  args: { envelope, payloadJson: v.string() },
  handler: async (ctx, args): Promise<any> => {
    const payload = await authorize(ctx, args.envelope, args.payloadJson, "attempts.renew");
    const scope = await ctx.runQuery(internal.factory.attempts.resolveScope, {
      workflowRunId: payload.workflowRunId,
    });
    const receipt = await claimScoped(ctx, args.envelope, scope);
    try {
      const result = await ctx.runMutation(internal.factory.attempts.renewInternal, {
        workflowRunId: payload.workflowRunId,
        leaseId: payload.leaseId,
        ownerId: args.envelope.serviceId,
        leaseDurationMs: payload.leaseDurationMs,
        requiredAttemptPurpose: "IMPLEMENTATION",
        workerId: payload.workerId,
        workerSessionId: payload.workerSessionId,
        workerGeneration: payload.workerGeneration,
      });
      await ctx.runMutation(internal.serviceCommands.complete, {
        receiptId: receipt.receiptId,
        status: result?.renewed ? "SUCCEEDED" : "FAILED",
        reason: result?.renewed ? undefined : result?.reason,
        resultReference: String(payload.workflowRunId),
      });
      return result;
    } catch (error) {
      await fail(ctx, receipt.receiptId, error);
      throw error;
    }
  },
});

export const reportFactoryAttempt = action({
  args: { envelope, payloadJson: v.string() },
  handler: async (ctx, args): Promise<any> => {
    const payload = await authorize(ctx, args.envelope, args.payloadJson, "attempts.report");
    const scope = await ctx.runQuery(internal.factory.attempts.resolveScope, {
      workflowRunId: payload.workflowRunId,
    });
    const receipt = await claimScoped(ctx, args.envelope, scope);
    try {
      const result = await ctx.runMutation(internal.factory.attempts.reportInternal, {
        workflowRunId: payload.workflowRunId,
        leaseId: payload.leaseId,
        ownerId: args.envelope.serviceId,
        workerId: payload.workerId,
        workerSessionId: payload.workerSessionId,
        workerGeneration: payload.workerGeneration,
        packet: payload.packet,
      });
      await ctx.runMutation(internal.serviceCommands.complete, {
        receiptId: receipt.receiptId,
        status: "SUCCEEDED",
        resultReference: String(payload.workflowRunId),
      });
      return result;
    } catch (error) {
      await fail(ctx, receipt.receiptId, error);
      throw error;
    }
  },
});

export const recordGovernedMcpReceipt = action({
  args: { envelope, payloadJson: v.string() },
  handler: async (ctx, args): Promise<any> => {
    const payload = await authorize(ctx, args.envelope, args.payloadJson, "mcp.receipts.append");
    const scope = await ctx.runQuery(internal.serviceCommands.resolveExecutionScope, {
      workflowRunId: payload.receipt.workflowRunId,
    });
    const commandReceipt = await claimScoped(ctx, args.envelope, scope);
    try {
      const result = await ctx.runMutation(
        makeFunctionReference<"mutation">("factory/governedMcp:recordReceiptInternal"),
        {
        receipt: payload.receipt,
        },
      );
      await ctx.runMutation(internal.serviceCommands.complete, {
        receiptId: commandReceipt.receiptId,
        status: "SUCCEEDED",
        resultReference: String(result.receiptId),
      });
      return result;
    } catch (error) {
      await fail(ctx, commandReceipt.receiptId, error);
      throw error;
    }
  },
});

export const persistInferenceIntent = action({
  args: { envelope, payloadJson: v.string() },
  handler: async (ctx, args): Promise<any> => {
    const payload = await authorize(ctx, args.envelope, args.payloadJson, "inference.intents.persist");
    const scope = await ctx.runQuery(internal.serviceCommands.resolveExecutionScope, { workflowRunId: payload.workflowRunId });
    const receipt = await claimScoped(ctx, args.envelope, scope);
    try {
      const result = await ctx.runMutation(makeFunctionReference<"mutation">("inferenceGateway:persistIntentInternal"), {
        ...payload.intent,
        workflowRunId: payload.workflowRunId,
      });
      await ctx.runMutation(internal.serviceCommands.complete, { receiptId: receipt.receiptId, status: "SUCCEEDED", resultReference: String(result.intentId) });
      return result;
    } catch (error) {
      await fail(ctx, receipt.receiptId, error);
      throw error;
    }
  },
});

export const claimInferenceIntent = action({
  args: { envelope, payloadJson: v.string() },
  handler: async (ctx, args): Promise<any> => {
    const payload = await authorize(ctx, args.envelope, args.payloadJson, "inference.intents.claim");
    const scope = await ctx.runQuery(internal.serviceCommands.resolveExecutionScope, { workflowRunId: payload.workflowRunId });
    const receipt = await claimScoped(ctx, args.envelope, scope);
    try {
      const result = await ctx.runMutation(makeFunctionReference<"mutation">("inferenceGateway:claimIntentInternal"), {
        ...payload.claim,
        workflowRunId: payload.workflowRunId,
      });
      await ctx.runMutation(internal.serviceCommands.complete, {
        receiptId: receipt.receiptId, status: result.claimed || result.cancelled ? "SUCCEEDED" : "FAILED",
        reason: result.claimed || result.cancelled ? undefined : result.reason, resultReference: String(payload.claim.intentId),
      });
      return result;
    } catch (error) {
      await fail(ctx, receipt.receiptId, error);
      throw error;
    }
  },
});

export const appendInferenceReceipt = action({
  args: { envelope, payloadJson: v.string() },
  handler: async (ctx, args): Promise<any> => {
    const payload = await authorize(ctx, args.envelope, args.payloadJson, "inference.receipts.append");
    const scope = await ctx.runQuery(internal.serviceCommands.resolveExecutionScope, { workflowRunId: payload.workflowRunId });
    const receipt = await claimScoped(ctx, args.envelope, scope);
    try {
      const result = await ctx.runMutation(makeFunctionReference<"mutation">("inferenceGateway:appendReceiptInternal"), {
        ...payload.receipt,
        workflowRunId: payload.workflowRunId,
      });
      await ctx.runMutation(internal.serviceCommands.complete, { receiptId: receipt.receiptId, status: "SUCCEEDED", resultReference: String(result.receiptId) });
      return result;
    } catch (error) {
      await fail(ctx, receipt.receiptId, error);
      throw error;
    }
  },
});

export const appendInferenceReconciliation = action({
  args: { envelope, payloadJson: v.string() },
  handler: async (ctx, args): Promise<any> => {
    const payload = await authorize(ctx, args.envelope, args.payloadJson, "inference.reconciliations.append");
    const scope = await ctx.runQuery(internal.serviceCommands.resolveExecutionScope, { workflowRunId: payload.workflowRunId });
    const receipt = await claimScoped(ctx, args.envelope, scope);
    try {
      const result = await ctx.runMutation(makeFunctionReference<"mutation">("inferenceGateway:appendReconciliationInternal"), {
        ...payload.reconciliation,
        workflowRunId: payload.workflowRunId,
      });
      await ctx.runMutation(internal.serviceCommands.complete, { receiptId: receipt.receiptId, status: "SUCCEEDED", resultReference: String(result.reconciliationId) });
      return result;
    } catch (error) {
      await fail(ctx, receipt.receiptId, error);
      throw error;
    }
  },
});

export const claimVerificationAttempt = action({
  args: { envelope, payloadJson: v.string() },
  handler: async (ctx, args): Promise<any> => {
    const payload = await authorize(ctx, args.envelope, args.payloadJson, "verification:claim");
    const scope = await ctx.runQuery(internal.factory.attempts.resolveScope, { workflowRunId: payload.workflowRunId });
    const receipt = await claimScoped(ctx, args.envelope, scope);
    try {
      const result = await ctx.runMutation(internal.factory.attempts.claimInternal, {
        workflowRunId: payload.workflowRunId,
        leaseId: payload.leaseId,
        ownerId: args.envelope.serviceId,
        leaseDurationMs: payload.leaseDurationMs,
        requiredAttemptPurpose: "VERIFICATION",
        workerId: payload.workerId,
        workerSessionId: payload.workerSessionId,
      });
      await ctx.runMutation(internal.serviceCommands.complete, {
        receiptId: receipt.receiptId,
        status: "SUCCEEDED",
        resultReference: result?.claimed ? String(payload.workflowRunId) : result?.reason,
      });
      return result;
    } catch (error) {
      await fail(ctx, receipt.receiptId, error);
      throw error;
    }
  },
});

export const renewVerificationAttempt = action({
  args: { envelope, payloadJson: v.string() },
  handler: async (ctx, args): Promise<any> => {
    const payload = await authorize(ctx, args.envelope, args.payloadJson, "verification:renew");
    const scope = await ctx.runQuery(internal.factory.attempts.resolveScope, { workflowRunId: payload.workflowRunId });
    const receipt = await claimScoped(ctx, args.envelope, scope);
    try {
      const result = await ctx.runMutation(internal.factory.attempts.renewInternal, {
        workflowRunId: payload.workflowRunId,
        leaseId: payload.leaseId,
        ownerId: args.envelope.serviceId,
        leaseDurationMs: payload.leaseDurationMs,
        requiredAttemptPurpose: "VERIFICATION",
        workerId: payload.workerId,
        workerSessionId: payload.workerSessionId,
        workerGeneration: payload.workerGeneration,
      });
      await ctx.runMutation(internal.serviceCommands.complete, {
        receiptId: receipt.receiptId,
        status: result?.renewed ? "SUCCEEDED" : "FAILED",
        reason: result?.renewed ? undefined : result?.reason,
        resultReference: String(payload.workflowRunId),
      });
      return result;
    } catch (error) {
      await fail(ctx, receipt.receiptId, error);
      throw error;
    }
  },
});

export const reportVerificationAttempt = action({
  args: { envelope, payloadJson: v.string() },
  handler: async (ctx, args): Promise<any> => {
    const payload = await authorize(ctx, args.envelope, args.payloadJson, "verification:report");
    const scope = await ctx.runQuery(internal.factory.attempts.resolveScope, { workflowRunId: payload.workflowRunId });
    const receipt = await claimScoped(ctx, args.envelope, scope);
    try {
      const result = await ctx.runMutation(internal.factory.attempts.reportVerificationInternal, {
        workflowRunId: payload.workflowRunId,
        leaseId: payload.leaseId,
        ownerId: args.envelope.serviceId,
        workerId: payload.workerId,
        workerSessionId: payload.workerSessionId,
        workerGeneration: payload.workerGeneration,
        packet: payload.packet,
      });
      await ctx.runMutation(internal.serviceCommands.complete, {
        receiptId: receipt.receiptId,
        status: "SUCCEEDED",
        resultReference: String(payload.workflowRunId),
      });
      return result;
    } catch (error) {
      await fail(ctx, receipt.receiptId, error);
      throw error;
    }
  },
});

export const recordReviewDecisionCandidate = action({
  args: { envelope, payloadJson: v.string() },
  handler: async (ctx, args): Promise<any> => {
    const payload = await authorize(ctx, args.envelope, args.payloadJson, "review.decision-candidate.record");
    const scope = await ctx.runQuery(internal.serviceCommands.resolveExecutionScope, {
      workflowRunId: payload.workflowRunId,
    });
    const receipt = await claimScoped(ctx, args.envelope, scope);
    try {
      const result = await ctx.runMutation(internal.reviewIntelligence.recordAgentDecisionCandidate, {
        workOrderId: payload.workOrderId,
        workflowRunId: payload.workflowRunId,
        serviceActorId: `service:${args.envelope.serviceId}`,
        category: payload.category,
        proposedTarget: payload.proposedTarget,
        summary: payload.summary,
        rationale: payload.rationale,
        sourceReference: payload.sourceReference,
        idempotencyKey: payload.idempotencyKey,
      });
      await ctx.runMutation(internal.serviceCommands.complete, {
        receiptId: receipt.receiptId,
        status: "SUCCEEDED",
        resultReference: result?._id ? String(result._id) : undefined,
      });
      return result;
    } catch (error) {
      await fail(ctx, receipt.receiptId, error);
      throw error;
    }
  },
});

export const recordResidualReviewAnalysis = action({
  args: { envelope, payloadJson: v.string() },
  handler: async (ctx, args): Promise<any> => {
    const payload = await authorize(ctx, args.envelope, args.payloadJson, "review.residual-analysis.record");
    const scope = await ctx.runQuery(internal.serviceCommands.resolveExecutionScope, {
      workflowRunId: payload.workflowRunId,
    });
    const receipt = await claimScoped(ctx, args.envelope, scope);
    try {
      const result = await ctx.runMutation(internal.reviewIntelligence.recordResidualAnalysis, {
        workOrderId: payload.workOrderId,
        workflowRunId: payload.workflowRunId,
        verificationRunId: payload.verificationRunId,
        reviewerId: `service:${args.envelope.serviceId}:${payload.reviewerId}`,
        provider: payload.provider,
        model: payload.model,
        promptVersion: payload.promptVersion,
        contextDigest: payload.contextDigest,
        findings: payload.findings,
        tokenUsage: payload.tokenUsage,
        estimatedCostUsd: payload.estimatedCostUsd,
        idempotencyKey: payload.idempotencyKey,
      });
      await ctx.runMutation(internal.serviceCommands.complete, {
        receiptId: receipt.receiptId,
        status: "SUCCEEDED",
        resultReference: result?._id ? String(result._id) : undefined,
      });
      return result;
    } catch (error) {
      await fail(ctx, receipt.receiptId, error);
      throw error;
    }
  },
});

export const authorizeFactoryPublication = action({
  args: { envelope, payloadJson: v.string() },
  handler: async (ctx, args): Promise<any> => {
    const payload = await authorize(ctx, args.envelope, args.payloadJson, "attempts.authorize-publication");
    const scope = await ctx.runQuery(internal.factory.attempts.resolveScope, {
      workflowRunId: payload.workflowRunId,
    });
    const receipt = await claimScoped(ctx, args.envelope, scope);
    try {
      const result = await ctx.runMutation(internal.factory.attempts.authorizePublicationInternal, {
        workflowRunId: payload.workflowRunId,
        leaseId: payload.leaseId,
        ownerId: args.envelope.serviceId,
        candidateRevision: payload.candidateRevision,
        workerId: payload.workerId,
        workerSessionId: payload.workerSessionId,
        workerGeneration: payload.workerGeneration,
      });
      await ctx.runMutation(internal.serviceCommands.complete, {
        receiptId: receipt.receiptId,
        status: "SUCCEEDED",
        resultReference: result.publicationPermitId,
      });
      return result;
    } catch (error) {
      await fail(ctx, receipt.receiptId, error);
      throw error;
    }
  },
});

export const listFactorySandboxReconcileCandidates = action({
  args: { envelope, payloadJson: v.string() },
  handler: async (ctx, args): Promise<any> => {
    const payload = await authorize(ctx, args.envelope, args.payloadJson, "sandboxes.list-reconcile");
    const scope = await ctx.runQuery(internal.serviceCommands.resolveRepositoryScope, {
      projectId: payload.projectId,
      repositoryId: payload.repositoryId,
    });
    const receipt = await claimScoped(ctx, args.envelope, scope);
    try {
      const result = await ctx.runQuery(internal.factory.attempts.listSandboxReconcileCandidatesInternal, {
        projectId: payload.projectId,
        repositoryId: payload.repositoryId,
      });
      await ctx.runMutation(internal.factory.attempts.markSandboxOrphansInternal, {
        projectId: payload.projectId,
        repositoryId: payload.repositoryId,
        allocationIds: result.map((candidate: any) => candidate.allocation._id),
      });
      await ctx.runMutation(internal.serviceCommands.complete, {
        receiptId: receipt.receiptId,
        status: "SUCCEEDED",
        resultReference: `${result.length} candidates`,
      });
      return result;
    } catch (error) {
      await fail(ctx, receipt.receiptId, error);
      throw error;
    }
  },
});

export const reportFactorySandboxReconcile = action({
  args: { envelope, payloadJson: v.string() },
  handler: async (ctx, args): Promise<any> => {
    const payload = await authorize(ctx, args.envelope, args.payloadJson, "sandboxes.report-reconcile");
    const scope = await ctx.runQuery(internal.serviceCommands.resolveExecutionScope, { workflowRunId: payload.workflowRunId });
    const receipt = await claimScoped(ctx, args.envelope, scope);
    try {
      const result = await ctx.runMutation(internal.factory.attempts.reportSandboxReconcileInternal, {
        workflowRunId: payload.workflowRunId,
        resourceName: payload.resourceName,
        ownerId: args.envelope.serviceId,
        termination: payload.termination,
        credentialRevocation: payload.credentialRevocation,
      });
      await ctx.runMutation(internal.serviceCommands.complete, {
        receiptId: receipt.receiptId,
        status: "SUCCEEDED",
        resultReference: payload.resourceName,
      });
      return result;
    } catch (error) {
      await fail(ctx, receipt.receiptId, error);
      throw error;
    }
  },
});

export const reportExactModelRouteHealth = action({
  args: { envelope, payloadJson: v.string() },
  handler: async (ctx, args): Promise<any> => {
    const payload = await authorize(
      ctx,
      args.envelope,
      args.payloadJson,
      "models.report-exact-route-health",
    );
    if (![
      "HEALTHY",
      "DEGRADED",
      "RATE_LIMITED",
      "UNAVAILABLE",
    ].includes(payload.availability)) {
      throw new Error("Exact model route health claim has an invalid availability state.");
    }
    const scope = await ctx.runQuery(
      internal.serviceCommands.resolveExactModelRouteHealthScope,
      {
        factoryDefinitionVersionId: payload.factoryDefinitionVersionId,
        expectedRouteDigest: payload.expectedRouteDigest,
      },
    );
    const receipt = await claimScoped(ctx, args.envelope, scope);
    try {
      const result = await ctx.runMutation(
        internal.modelCatalog.reportExactRouteHealth,
        {
          modelCatalogId: scope.modelCatalogId,
          expectedRouteDigest: scope.expectedRouteDigest,
          availability: payload.availability,
        },
      );
      await ctx.runMutation(internal.serviceCommands.complete, {
        receiptId: receipt.receiptId,
        status: "SUCCEEDED",
        resultReference: String(result),
      });
      return { modelCatalogId: result, availability: payload.availability };
    } catch (error) {
      await fail(ctx, receipt.receiptId, error);
      throw error;
    }
  },
});

export const claimExecution = action({
  args: { envelope, payloadJson: v.string() },
  handler: async (ctx, args): Promise<any> => {
    const payload = await authorize(ctx, args.envelope, args.payloadJson, "executions.claim");
    const scope = await ctx.runQuery(internal.serviceCommands.resolveRepositoryScope, {
      projectId: payload.projectId,
      repositoryId: payload.repositoryId,
    });
    const receipt = await claimScoped(ctx, args.envelope, scope);
    try {
      const result = await ctx.runMutation(internal.executionWorker.claimInternal, {
        projectId: payload.projectId,
        repositoryId: payload.repositoryId,
        workerId: payload.workerId,
        claimId: payload.claimId,
        leaseDurationMs: payload.leaseDurationMs,
      });
      await ctx.runMutation(internal.serviceCommands.complete, {
        receiptId: receipt.receiptId,
        status: "SUCCEEDED",
        resultReference: result?.workflowRunId ? String(result.workflowRunId) : "no-claimable-execution",
      });
      return result;
    } catch (error) {
      await fail(ctx, receipt.receiptId, error);
      throw error;
    }
  },
});

export const heartbeatExecution = action({
  args: { envelope, payloadJson: v.string() },
  handler: async (ctx, args): Promise<any> => {
    const payload = await authorize(ctx, args.envelope, args.payloadJson, "executions.heartbeat");
    const scope = await ctx.runQuery(internal.serviceCommands.resolveExecutionScope, { workflowRunId: payload.workflowRunId });
    const receipt = await claimScoped(ctx, args.envelope, scope);
    try {
      const result = await ctx.runMutation(internal.executionWorker.heartbeatInternal, payload);
      await ctx.runMutation(internal.serviceCommands.complete, {
        receiptId: receipt.receiptId, status: "SUCCEEDED", resultReference: String(payload.workflowRunId),
      });
      return result;
    } catch (error) {
      await fail(ctx, receipt.receiptId, error);
      throw error;
    }
  },
});

export const reportExecution = action({
  args: { envelope, payloadJson: v.string() },
  handler: async (ctx, args): Promise<any> => {
    const payload = await authorize(ctx, args.envelope, args.payloadJson, "executions.report");
    const scope = await ctx.runQuery(internal.serviceCommands.resolveExecutionScope, { workflowRunId: payload.workflowRunId });
    const receipt = await claimScoped(ctx, args.envelope, scope);
    try {
      const result = await ctx.runMutation(internal.executionWorker.reportInternal, payload);
      await ctx.runMutation(internal.serviceCommands.complete, {
        receiptId: receipt.receiptId, status: "SUCCEEDED", resultReference: String(payload.workflowRunId),
      });
      return result;
    } catch (error) {
      await fail(ctx, receipt.receiptId, error);
      throw error;
    }
  },
});

export const finalizeExecution = action({
  args: { envelope, payloadJson: v.string() },
  handler: async (ctx, args): Promise<any> => {
    const payload = await authorize(ctx, args.envelope, args.payloadJson, "executions.finalize");
    const scope = await ctx.runQuery(internal.serviceCommands.resolveExecutionScope, { workflowRunId: payload.workflowRunId });
    const receipt = await claimScoped(ctx, args.envelope, scope);
    try {
      const result = await ctx.runMutation(internal.executionWorker.finalizeInternal, payload);
      await ctx.runMutation(internal.serviceCommands.complete, {
        receiptId: receipt.receiptId, status: "SUCCEEDED", resultReference: result?.pullRequestUrl ?? String(payload.workflowRunId),
      });
      return result;
    } catch (error) {
      await fail(ctx, receipt.receiptId, error);
      throw error;
    }
  },
});

export const claimMissionPlanningRun = action({
  args: { envelope, payloadJson: v.string() },
  handler: async (ctx, args): Promise<any> => {
    const payload = await authorize(ctx, args.envelope, args.payloadJson, "planning.claim");
    const scope = await ctx.runQuery(internal.serviceCommands.resolveRepositoryScope, {
      projectId: payload.projectId,
      repositoryId: payload.repositoryId,
    });
    const receipt = await claimScoped(ctx, args.envelope, scope);
    try {
      const result = await ctx.runMutation(internal.missionPlanning.claimInternal, {
        projectId: payload.projectId,
        repositoryId: payload.repositoryId,
        leaseId: payload.leaseId,
        ownerId: args.envelope.serviceId,
        workerId: payload.workerId,
        workerSessionId: payload.workerSessionId,
        leaseDurationMs: payload.leaseDurationMs,
      });
      await ctx.runMutation(internal.serviceCommands.complete, {
        receiptId: receipt.receiptId,
        status: "SUCCEEDED",
        resultReference: result?.run?._id ? String(result.run._id) : result?.reason,
      });
      return result;
    } catch (error) {
      await fail(ctx, receipt.receiptId, error);
      throw error;
    }
  },
});

export const renewMissionPlanningRun = action({
  args: { envelope, payloadJson: v.string() },
  handler: async (ctx, args): Promise<any> => {
    const payload = await authorize(ctx, args.envelope, args.payloadJson, "planning.renew");
    const scope = await ctx.runQuery(internal.missionPlanning.resolveScope, {
      planningRunId: payload.planningRunId,
    });
    const receipt = await claimScoped(ctx, args.envelope, scope);
    try {
      const result = await ctx.runMutation(internal.missionPlanning.renewInternal, {
        planningRunId: payload.planningRunId,
        leaseId: payload.leaseId,
        ownerId: args.envelope.serviceId,
        workerId: payload.workerId,
        workerSessionId: payload.workerSessionId,
        leaseDurationMs: payload.leaseDurationMs,
      });
      await ctx.runMutation(internal.serviceCommands.complete, {
        receiptId: receipt.receiptId,
        status: result.renewed ? "SUCCEEDED" : "FAILED",
        reason: result.renewed ? undefined : result.reason,
        resultReference: String(payload.planningRunId),
      });
      return result;
    } catch (error) {
      await fail(ctx, receipt.receiptId, error);
      throw error;
    }
  },
});

export const reportMissionPlanningRun = action({
  args: { envelope, payloadJson: v.string() },
  handler: async (ctx, args): Promise<any> => {
    const payload = await authorize(ctx, args.envelope, args.payloadJson, "planning.report");
    const scope = await ctx.runQuery(internal.missionPlanning.resolveScope, {
      planningRunId: payload.planningRunId,
    });
    const receipt = await claimScoped(ctx, args.envelope, scope);
    try {
      const result = await ctx.runMutation(internal.missionPlanning.reportInternal, {
        planningRunId: payload.planningRunId,
        leaseId: payload.leaseId,
        ownerId: args.envelope.serviceId,
        workerId: payload.workerId,
        workerSessionId: payload.workerSessionId,
        report: payload.report,
      });
      await ctx.runMutation(internal.serviceCommands.complete, {
        receiptId: receipt.receiptId,
        status: "SUCCEEDED",
        resultReference: String(payload.planningRunId),
      });
      return result;
    } catch (error) {
      await fail(ctx, receipt.receiptId, error);
      throw error;
    }
  },
});

export const inspectMissionIntentContributions = action({
  args: { envelope, payloadJson: v.string() },
  handler: async (ctx, args): Promise<any> => {
    const payload = await authorize(ctx, args.envelope, args.payloadJson, "intent.contributions.inspect");
    const scope = await ctx.runQuery(internal.serviceCommands.resolveMissionIntentScope, {
      projectId: payload.projectId,
      missionId: payload.missionId,
    });
    const receipt = await claimScoped(ctx, args.envelope, scope);
    try {
      const result = await ctx.runQuery(internal.missionIntentContributions.inspectInternal, {
        projectId: payload.projectId,
        missionId: payload.missionId,
      });
      await ctx.runMutation(internal.serviceCommands.complete, {
        receiptId: receipt.receiptId,
        status: "SUCCEEDED",
        resultReference: String(payload.missionId),
      });
      return result;
    } catch (error) {
      await fail(ctx, receipt.receiptId, error);
      throw error;
    }
  },
});

export const draftMissionIntentContribution = action({
  args: { envelope, payloadJson: v.string() },
  handler: async (ctx, args): Promise<any> => {
    const payload = await authorize(ctx, args.envelope, args.payloadJson, "intent.contributions.draft");
    const scope = await ctx.runQuery(internal.serviceCommands.resolveMissionIntentScope, {
      projectId: payload.projectId,
      missionId: payload.missionId,
    });
    const receipt = await claimScoped(ctx, args.envelope, scope);
    try {
      const result = await ctx.runMutation(internal.missionIntentContributions.draftAgentInternal, payload);
      await ctx.runMutation(internal.serviceCommands.complete, {
        receiptId: receipt.receiptId,
        status: "SUCCEEDED",
        resultReference: String(result.contribution?._id ?? payload.missionId),
      });
      return result;
    } catch (error) {
      await fail(ctx, receipt.receiptId, error);
      throw error;
    }
  },
});

async function authorize(ctx: any, candidate: ServiceCommandEnvelope, payloadJson: string, capability: string): Promise<any> {
  const expectedServiceId = process.env.MISSION_CONTROL_SERVICE_ID?.trim() || "orchestration-server";
  const secret = process.env.MISSION_CONTROL_SERVICE_COMMAND_SECRET?.trim();
  const now = Date.now();
  const syntaxError = validateServiceCommandEnvelope(candidate, now, { serviceId: expectedServiceId, capability });
  if (payloadJson.length > 256_000) {
    await ctx.runMutation(internal.serviceCommands.deny, { envelope: candidate, signatureStatus: "INVALID", reason: "payload-too-large" });
    throw new Error("Service command denied (payload-too-large).");
  }
  const payloadDigest = await sha256(payloadJson);
  const signatureStatus: SignatureStatus = !candidate.signature ? "MISSING" : "INVALID";
  if (!secret || syntaxError || payloadDigest !== candidate.payloadDigest || !await verifyHmac(secret, candidate)) {
    const reason = !secret ? "service-command-secret-not-configured" : syntaxError ?? (payloadDigest !== candidate.payloadDigest ? "payload-digest-mismatch" : "signature-invalid");
    await ctx.runMutation(internal.serviceCommands.deny, { envelope: candidate, signatureStatus, reason });
    throw new Error(`Service command denied (${reason}).`);
  }
  try {
    return JSON.parse(payloadJson);
  } catch {
    await ctx.runMutation(internal.serviceCommands.deny, { envelope: candidate, signatureStatus: "VALID", reason: "payload-json-invalid" });
    throw new Error("Service command denied (payload-json-invalid).");
  }
}

async function claimScoped(ctx: any, candidate: ServiceCommandEnvelope, scope: { projectId: string; repositoryId: string }) {
  if (candidate.projectId !== scope.projectId || candidate.repositoryId !== scope.repositoryId) {
    await ctx.runMutation(internal.serviceCommands.deny, {
      envelope: candidate,
      signatureStatus: "VALID",
      reason: "command-scope-mismatch",
    });
    throw new Error("Service command denied (command-scope-mismatch).");
  }
  const receipt = await ctx.runMutation(internal.serviceCommands.claim, { envelope: candidate });
  if (!receipt.accepted) throw new Error("Service command denied (command-replay-detected).");
  return receipt;
}

async function fail(ctx: any, receiptId: any, error: unknown) {
  await ctx.runMutation(internal.serviceCommands.complete, {
    receiptId,
    status: "FAILED",
    reason: error instanceof Error ? error.message.slice(0, 500) : "service-command-failed",
  });
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return `sha256=${bytesToHex(new Uint8Array(digest))}`;
}

async function verifyHmac(secret: string, candidate: ServiceCommandEnvelope): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );
  const signature = hexToBytes(candidate.signature.slice("sha256=".length));
  return await crypto.subtle.verify(
    "HMAC",
    key,
    signature.buffer as ArrayBuffer,
    new TextEncoder().encode(canonicalServiceCommand(candidate))
  );
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(value: string): Uint8Array {
  return new Uint8Array(value.match(/.{2}/g)?.map((byte) => Number.parseInt(byte, 16)) ?? []);
}
