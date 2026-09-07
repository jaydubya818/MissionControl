/** Bounded repository-dispatch actuator for Incident Command. */

import { v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { FACTORY_PERMISSIONS, requireWorkspacePermission } from "../lib/companyAccess";
import {
  REPOSITORY_DISPATCH_CONTROL,
  REPOSITORY_DISPATCH_EXECUTOR_ID,
  REPOSITORY_DISPATCH_GATE_ID,
  REPOSITORY_DISPATCH_OBSERVER_ID,
  INCIDENT_COMMAND_AUTHORITY_ID,
  expectedAdmissionForOperation,
  expectedIncidentPhaseForOperation,
  dispatchDenialMeasurementRejectionReason,
  repositoryDispatchOperationValidator,
  repositoryDispatchAdmissionRejectionReason,
  validateObservedControlReceipt,
  validateIncidentControlAuthority,
  type RepositoryDispatchOperation,
} from "../lib/factoryIncidentControl";
import { RUNTIME_CONTRACT_VERSION } from "../lib/runtimeContract";

const requestPattern = /^[A-Za-z0-9._:/-]{12,200}$/;

function cleanRequestId(value: string) {
  const requestId = value.trim();
  if (!requestPattern.test(requestId)) throw new Error("Incident control request ID is invalid.");
  return requestId;
}

async function loadProjection(ctx: QueryCtx | MutationCtx, repositoryId: Id<"workspaceRepositories">) {
  return await ctx.db.query("repositoryDispatchControls")
    .withIndex("by_repository", (query) => query.eq("repositoryId", repositoryId))
    .unique();
}

export async function requireRepositoryDispatchAdmission(
  ctx: QueryCtx | MutationCtx,
  projectId: Id<"projects">,
  repositoryId?: Id<"workspaceRepositories">,
  repositoryName?: string,
) {
  let canonicalRepositoryId = repositoryId;
  if (!canonicalRepositoryId && repositoryName?.trim()) {
    const repository = await ctx.db.query("workspaceRepositories")
      .withIndex("by_project_repository", (query) => query.eq("projectId", projectId).eq("repository", repositoryName.trim()))
      .unique();
    if (!repository) throw new Error("WorkOrder dispatch denied (canonical-repository-required).");
    canonicalRepositoryId = repository._id;
  }
  if (!canonicalRepositoryId) return;
  const projection = await loadProjection(ctx, canonicalRepositoryId);
  const rejection = repositoryDispatchAdmissionRejectionReason({ projectId: String(projectId), projection });
  if (rejection) throw new Error(`WorkOrder dispatch denied (${rejection}).`);
}

export const getRepositoryDispatchControl = query({
  args: {
    incidentId: v.id("factoryIncidents"),
    repositoryId: v.optional(v.id("workspaceRepositories")),
  },
  handler: async (ctx, args) => {
    const incident = await ctx.db.get(args.incidentId);
    if (!incident?.repositoryId) throw new Error("Repository-scoped incident is unavailable.");
    if (args.repositoryId && args.repositoryId !== incident.repositoryId) {
      throw new Error("Repository dispatch control query is outside the incident scope.");
    }
    await requireWorkspacePermission(ctx, incident.projectId, FACTORY_PERMISSIONS.VIEW);
    const [projection, receipts, restorationAuthorizations] = await Promise.all([
      loadProjection(ctx, incident.repositoryId),
      ctx.db.query("factoryIncidentControlReceipts")
        .withIndex("by_incident", (query) => query.eq("incidentId", incident._id))
        .order("desc")
        .take(60),
      ctx.db.query("factoryIncidentControlAuthorizations")
        .withIndex("by_incident_sequence", (query) => query.eq("incidentId", incident._id))
        .order("desc")
        .take(10),
    ]);
    return {
      admission: projection?.admission ?? "ENABLED",
      generation: projection?.generation ?? 0,
      controlledByIncidentId: projection?.controlledByIncidentId,
      activeRequestId: projection?.activeRequestId,
      receipts,
      restorationAuthorizations,
    };
  },
});

/**
 * Exercise the same fail-closed admission gate used by WorkOrder dispatch.
 * This is deliberately an admission attempt only: it never creates an
 * Attempt, workflow run, worker request, or external call.
 */
export const attemptRepositoryDispatchAdmission = mutation({
  args: {
    incidentId: v.id("factoryIncidents"),
    repositoryId: v.id("workspaceRepositories"),
    expectedSequence: v.number(),
    expectedCommanderActorId: v.string(),
    requestId: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const requestId = cleanRequestId(args.requestId);
    const incident = await ctx.db.get(args.incidentId);
    const repository = await ctx.db.get(args.repositoryId);
    if (!incident || incident.repositoryId !== args.repositoryId || !repository
      || repository.projectId !== incident.projectId || incident.status === "RESOLVED") {
      throw new Error("Dispatch admission attempt target is unavailable or outside the incident scope.");
    }
    if (!["CONTAIN", "OBSERVE", "ISOLATE"].includes(incident.phase)) {
      throw new Error("Dispatch admission attempt is valid only while containment remains active.");
    }
    const access = await requireWorkspacePermission(
      ctx, incident.projectId, FACTORY_PERMISSIONS.INCIDENT_CONTROL, { repositoryId: args.repositoryId },
    );
    if (args.expectedSequence !== incident.currentSequence) {
      throw new Error("Dispatch admission attempt denied (incident-control-authority-stale).");
    }
    if (!incident.commanderActorId
      || args.expectedCommanderActorId.trim() !== incident.commanderActorId
      || access.actorId !== incident.commanderActorId) {
      throw new Error("Dispatch admission attempt denied (incident-control-commander-mismatch).");
    }
    const projection = await loadProjection(ctx, repository._id);
    if (!projection || projection.admission !== "DENIED"
      || projection.controlledByIncidentId !== incident._id
      || !projection.activeRequestId) {
      throw new Error("Repository dispatch admission was not denied by the canonical pause gate.");
    }
    if (requestId === projection.activeRequestId) {
      throw new Error("Dispatch admission attempt requires a request ID distinct from the PAUSE command lineage.");
    }
    const [pauseRequest, pauseCommand, pauseAcknowledgment, observedEffect] = await Promise.all([
      ctx.db.query("factoryIncidentControlReceipts")
        .withIndex("by_incident_request_type", (query) => query.eq("incidentId", incident._id).eq("requestId", projection.activeRequestId!).eq("receiptType", "COMMAND_REQUESTED"))
        .unique(),
      ctx.db.query("factoryIncidentControlReceipts")
        .withIndex("by_incident_request_type", (query) => query.eq("incidentId", incident._id).eq("requestId", projection.activeRequestId!).eq("receiptType", "COMMAND_ISSUED"))
        .unique(),
      ctx.db.query("factoryIncidentControlReceipts")
        .withIndex("by_incident_request_type", (query) => query.eq("incidentId", incident._id).eq("requestId", projection.activeRequestId!).eq("receiptType", "ACKNOWLEDGED"))
        .unique(),
      ctx.db.query("factoryIncidentControlReceipts")
        .withIndex("by_incident_request_type", (query) => query.eq("incidentId", incident._id).eq("requestId", projection.activeRequestId!).eq("receiptType", "EFFECT_OBSERVED"))
        .unique(),
    ]);
    const pauseLineageError = validateObservedControlReceipt({
      request: pauseRequest,
      command: pauseCommand,
      acknowledgment: pauseAcknowledgment,
      effect: observedEffect,
      incidentId: String(incident._id),
      projectId: String(incident.projectId),
      repositoryId: String(repository._id),
      operation: "PAUSE_REPOSITORY_DISPATCH",
      controlKey: REPOSITORY_DISPATCH_CONTROL,
      earliestCreatedAt: incident.createdAt,
      observedAt: observedEffect?.createdAt ?? now,
      expectedAuthorityActorId: incident.commanderActorId,
      expectedAuthoritySequence: pauseCommand?.authoritySequence,
      expectedRuntimeContractVersion: observedEffect?.runtimeContractVersion ?? -1,
    });
    if (pauseLineageError || observedEffect?.producerId !== REPOSITORY_DISPATCH_OBSERVER_ID) {
      throw new Error(`Dispatch admission denial requires the exact active independently observed PAUSE lineage (${pauseLineageError ?? "observer-mismatch"}).`);
    }

    let rejection: string | null = null;
    try {
      await requireRepositoryDispatchAdmission(ctx, incident.projectId, repository._id);
    } catch (caught) {
      rejection = caught instanceof Error ? caught.message : String(caught);
    }
    if (rejection !== "WorkOrder dispatch denied (repository-dispatch-paused).") {
      throw new Error("Repository dispatch admission was not denied by the canonical pause gate.");
    }
    const existing = await ctx.db.query("factoryIncidentControlReceipts")
      .withIndex("by_incident_request_type", (query) => query
        .eq("incidentId", incident._id)
        .eq("requestId", requestId)
        .eq("receiptType", "DISPATCH_DENIED"))
      .unique();
    if (existing) {
      const duplicateError = dispatchDenialMeasurementRejectionReason({
        receipt: existing,
        predecessor: observedEffect,
        incidentId: String(incident._id),
        projectId: String(incident.projectId),
        repositoryId: String(repository._id),
        expectedRuntimeContractVersion: RUNTIME_CONTRACT_VERSION,
      });
      if (duplicateError
        || existing.authorityActorId !== access.actorId
        || existing.authoritySequence !== incident.currentSequence) {
        throw new Error("Dispatch admission request ID is already bound to different authority, scope, or runtime.");
      }
      return { denialReceipt: existing, duplicate: true as const };
    }
    const denialReceiptId = await ctx.db.insert("factoryIncidentControlReceipts", {
      tenantId: incident.tenantId,
      projectId: incident.projectId,
      repositoryId: repository._id,
      incidentId: incident._id,
      controlKey: REPOSITORY_DISPATCH_CONTROL,
      operation: "PAUSE_REPOSITORY_DISPATCH",
      receiptType: "DISPATCH_DENIED",
      requestId,
      authorityActorId: access.actorId,
      authoritySequence: incident.currentSequence,
      authorityExpiresAt: observedEffect.authorityExpiresAt,
      producerId: REPOSITORY_DISPATCH_GATE_ID,
      initiatedByActorId: access.actorId,
      expectedAdmission: "DENIED",
      observedAdmission: "DENIED",
      predecessorReceiptId: observedEffect._id,
      result: "PASS",
      runtimeContractVersion: RUNTIME_CONTRACT_VERSION,
      createdAt: now,
    });
    await ctx.db.insert("activities", {
      tenantId: incident.tenantId,
      projectId: incident.projectId,
      actorType: "HUMAN",
      actorId: access.actorId,
      action: "REPOSITORY_DISPATCH_ADMISSION_DENIED",
      description: `Canonical WorkOrder dispatch admission denied for ${repository.repository}`,
      targetType: "FACTORY_INCIDENT",
      targetId: String(incident._id),
      metadata: {
        repositoryId: repository._id,
        requestId,
        denialReceiptId,
        reason: "repository-dispatch-paused",
        attemptCreated: false,
        workflowRunCreated: false,
        workerLaunchRequested: false,
      },
    });
    return {
      denialReceipt: await ctx.db.get(denialReceiptId) as Doc<"factoryIncidentControlReceipts">,
      duplicate: false as const,
    };
  },
});

export const authorizeRepositoryDispatchRestoration = mutation({
  args: {
    incidentId: v.id("factoryIncidents"),
    repositoryId: v.id("workspaceRepositories"),
    expectedSequence: v.number(),
    expectedCommanderActorId: v.string(),
    authorityExpiresAt: v.number(),
    reason: v.string(),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const idempotencyKey = cleanRequestId(args.idempotencyKey);
    const incident = await ctx.db.get(args.incidentId);
    if (!incident || incident.repositoryId !== args.repositoryId || incident.phase !== "ISOLATE") {
      throw new Error("Restoration authority target is unavailable or not isolated.");
    }
    const access = await requireWorkspacePermission(
      ctx, incident.projectId, FACTORY_PERMISSIONS.INCIDENT_CONTROL, { repositoryId: args.repositoryId },
    );
    const authorityError = validateIncidentControlAuthority({
      now,
      authorityExpiresAt: args.authorityExpiresAt,
      expectedSequence: args.expectedSequence,
      actualSequence: incident.currentSequence,
      expectedCommanderActorId: args.expectedCommanderActorId.trim(),
      actualCommanderActorId: incident.commanderActorId,
      actorId: access.actorId,
    });
    if (authorityError) throw new Error(`Restoration authority denied (${authorityError}).`);
    const reason = args.reason.trim();
    if (reason.length < 10 || reason.length > 1_000) {
      throw new Error("Restoration authority requires a reason between 10 and 1,000 characters.");
    }
    const existing = await ctx.db.query("factoryIncidentControlAuthorizations")
      .withIndex("by_incident_idempotency", (query) => query.eq("incidentId", incident._id).eq("idempotencyKey", idempotencyKey))
      .unique();
    if (existing) {
      if (existing.incidentId !== incident._id || existing.repositoryId !== args.repositoryId
        || existing.authoritySequence !== incident.currentSequence) {
        throw new Error("Restoration authority key is already bound to another decision.");
      }
      return { authorization: existing, duplicate: true as const };
    }
    const authorizationId = await ctx.db.insert("factoryIncidentControlAuthorizations", {
      tenantId: incident.tenantId,
      projectId: incident.projectId,
      repositoryId: args.repositoryId,
      incidentId: incident._id,
      operation: "RESUME_REPOSITORY_DISPATCH",
      authorityActorId: access.actorId,
      authoritySequence: incident.currentSequence,
      authorityExpiresAt: args.authorityExpiresAt,
      idempotencyKey,
      reason,
      createdAt: now,
    });
    return { authorization: await ctx.db.get(authorizationId), duplicate: false as const };
  },
});

export const requestRepositoryDispatchControl = mutation({
  args: {
    incidentId: v.id("factoryIncidents"),
    repositoryId: v.id("workspaceRepositories"),
    operation: repositoryDispatchOperationValidator,
    expectedSequence: v.number(),
    expectedCommanderActorId: v.string(),
    authorityExpiresAt: v.number(),
    restorationAuthorizationId: v.optional(v.id("factoryIncidentControlAuthorizations")),
    requestId: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const requestId = cleanRequestId(args.requestId);
    const incident = await ctx.db.get(args.incidentId);
    const repository = await ctx.db.get(args.repositoryId);
    if (!incident || incident.repositoryId !== args.repositoryId || !repository
      || repository.projectId !== incident.projectId || incident.status === "RESOLVED"
      || incident.phase !== expectedIncidentPhaseForOperation(args.operation)) {
      throw new Error("Incident control request target or lifecycle is invalid.");
    }
    const access = await requireWorkspacePermission(
      ctx, incident.projectId, FACTORY_PERMISSIONS.INCIDENT_CONTROL, { repositoryId: args.repositoryId },
    );
    const authorityError = validateIncidentControlAuthority({
      now,
      authorityExpiresAt: args.authorityExpiresAt,
      expectedSequence: args.expectedSequence,
      actualSequence: incident.currentSequence,
      expectedCommanderActorId: args.expectedCommanderActorId.trim(),
      actualCommanderActorId: incident.commanderActorId,
      actorId: access.actorId,
    });
    if (authorityError) throw new Error(`Incident control request denied (${authorityError}).`);
    const restorationAuthorization = args.restorationAuthorizationId
      ? await ctx.db.get(args.restorationAuthorizationId)
      : null;
    if (args.operation === "RESUME_REPOSITORY_DISPATCH") {
      if (!restorationAuthorization || restorationAuthorization.incidentId !== incident._id
        || restorationAuthorization.repositoryId !== repository._id
        || restorationAuthorization.authorityActorId !== access.actorId
        || restorationAuthorization.authoritySequence !== incident.currentSequence
        || restorationAuthorization.authorityExpiresAt !== args.authorityExpiresAt
        || restorationAuthorization.authorityExpiresAt <= now
        || restorationAuthorization.consumedByRequestId) {
        throw new Error("Repository dispatch restoration request requires unused durable current authority.");
      }
    } else if (restorationAuthorization) {
      throw new Error("Restoration authority is valid only for repository dispatch resume.");
    }
    const existing = await ctx.db.query("factoryIncidentControlReceipts")
      .withIndex("by_incident_request_type", (query) => query.eq("incidentId", incident._id).eq("requestId", requestId).eq("receiptType", "COMMAND_REQUESTED"))
      .unique();
    if (existing) return { requestReceipt: existing, duplicate: true as const };
    const requestReceiptId = await ctx.db.insert("factoryIncidentControlReceipts", {
      tenantId: incident.tenantId,
      projectId: incident.projectId,
      repositoryId: repository._id,
      incidentId: incident._id,
      controlKey: REPOSITORY_DISPATCH_CONTROL,
      operation: args.operation,
      receiptType: "COMMAND_REQUESTED",
      requestId,
      authorityActorId: access.actorId,
      authoritySequence: incident.currentSequence,
      authorityExpiresAt: args.authorityExpiresAt,
      producerId: INCIDENT_COMMAND_AUTHORITY_ID,
      initiatedByActorId: access.actorId,
      restorationAuthorizationId: restorationAuthorization?._id,
      expectedAdmission: expectedAdmissionForOperation(args.operation),
      result: "PASS",
      runtimeContractVersion: RUNTIME_CONTRACT_VERSION,
      createdAt: now,
    });
    return { requestReceipt: await ctx.db.get(requestReceiptId), duplicate: false as const };
  },
});

export const executeRepositoryDispatchControl = mutation({
  args: {
    incidentId: v.id("factoryIncidents"),
    repositoryId: v.id("workspaceRepositories"),
    operation: repositoryDispatchOperationValidator,
    expectedSequence: v.number(),
    expectedCommanderActorId: v.string(),
    authorityExpiresAt: v.number(),
    restorationAuthorizationId: v.optional(v.id("factoryIncidentControlAuthorizations")),
    requestReceiptId: v.id("factoryIncidentControlReceipts"),
    requestId: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const requestId = cleanRequestId(args.requestId);
    const incident = await ctx.db.get(args.incidentId);
    if (!incident || incident.repositoryId !== args.repositoryId) {
      throw new Error("Incident control target is unavailable or outside the incident scope.");
    }
    const repository = await ctx.db.get(args.repositoryId);
    if (!repository || repository.projectId !== incident.projectId) {
      throw new Error("Incident control repository is unavailable or outside this workspace.");
    }
    const access = await requireWorkspacePermission(
      ctx, incident.projectId, FACTORY_PERMISSIONS.INCIDENT_CONTROL, { repositoryId: args.repositoryId },
    );
    const authorityError = validateIncidentControlAuthority({
      now,
      authorityExpiresAt: args.authorityExpiresAt,
      expectedSequence: args.expectedSequence,
      actualSequence: incident.currentSequence,
      expectedCommanderActorId: args.expectedCommanderActorId.trim(),
      actualCommanderActorId: incident.commanderActorId,
      actorId: access.actorId,
    });
    if (authorityError) throw new Error(`Incident control denied (${authorityError}).`);
    if (incident.status === "RESOLVED") throw new Error("Resolved incidents cannot execute controls.");
    if (incident.phase !== expectedIncidentPhaseForOperation(args.operation)) {
      throw new Error("Incident control is not current for this lifecycle phase.");
    }
    const restorationAuthorization = args.restorationAuthorizationId
      ? await ctx.db.get(args.restorationAuthorizationId)
      : null;
    if (args.operation === "RESUME_REPOSITORY_DISPATCH") {
      if (!restorationAuthorization
        || restorationAuthorization.incidentId !== incident._id
        || restorationAuthorization.repositoryId !== repository._id
        || restorationAuthorization.projectId !== incident.projectId
        || restorationAuthorization.operation !== args.operation
        || restorationAuthorization.authorityActorId !== access.actorId
        || restorationAuthorization.authoritySequence !== incident.currentSequence
        || restorationAuthorization.authorityExpiresAt !== args.authorityExpiresAt
        || restorationAuthorization.authorityExpiresAt <= now) {
        throw new Error("Repository dispatch restoration requires durable current authority.");
      }
      if (restorationAuthorization.consumedByRequestId
        && restorationAuthorization.consumedByRequestId !== requestId) {
        throw new Error("Restoration authority was already consumed by another request.");
      }
    } else if (restorationAuthorization) {
      throw new Error("Restoration authority is valid only for repository dispatch resume.");
    }
    const requestReceipt = await ctx.db.get(args.requestReceiptId);
    if (!requestReceipt || requestReceipt.receiptType !== "COMMAND_REQUESTED"
      || requestReceipt.incidentId !== incident._id
      || requestReceipt.repositoryId !== repository._id
      || requestReceipt.operation !== args.operation
      || requestReceipt.requestId !== requestId
      || requestReceipt.authorityActorId !== access.actorId
      || requestReceipt.authoritySequence !== incident.currentSequence
      || requestReceipt.authorityExpiresAt !== args.authorityExpiresAt
      || requestReceipt.runtimeContractVersion !== RUNTIME_CONTRACT_VERSION
      || requestReceipt.producerId !== INCIDENT_COMMAND_AUTHORITY_ID) {
      throw new Error("Incident control request receipt is unavailable, stale, or outside authority.");
    }

    const existingCommand = await ctx.db.query("factoryIncidentControlReceipts")
      .withIndex("by_incident_request_type", (query) => query.eq("incidentId", incident._id).eq("requestId", requestId).eq("receiptType", "COMMAND_ISSUED"))
      .unique();
    if (existingCommand) {
      if (existingCommand.incidentId !== incident._id
        || existingCommand.repositoryId !== repository._id
        || existingCommand.operation !== args.operation
        || existingCommand.authoritySequence !== args.expectedSequence) {
        throw new Error("Incident control request ID is already bound to different authority or scope.");
      }
      const acknowledgment = await ctx.db.query("factoryIncidentControlReceipts")
        .withIndex("by_incident_request_type", (query) => query.eq("incidentId", incident._id).eq("requestId", requestId).eq("receiptType", "ACKNOWLEDGED"))
        .unique();
      return { commandReceipt: existingCommand, acknowledgment, duplicate: true as const };
    }

    const projection = await loadProjection(ctx, repository._id);
    const beforeAdmission = projection?.admission ?? "ENABLED";
    const expectedAdmission = expectedAdmissionForOperation(args.operation);
    if (args.operation === "PAUSE_REPOSITORY_DISPATCH"
      && beforeAdmission === "DENIED" && projection?.controlledByIncidentId !== incident._id) {
      throw new Error("Repository dispatch is paused by a different incident.");
    }
    if (args.operation === "RESUME_REPOSITORY_DISPATCH"
      && (!projection || projection.controlledByIncidentId !== incident._id)) {
      throw new Error("Repository dispatch restoration is not owned by this incident.");
    }

    if (restorationAuthorization) {
      await ctx.db.patch(restorationAuthorization._id, { consumedByRequestId: requestId, consumedAt: now });
    }

    const commandReceiptId = await ctx.db.insert("factoryIncidentControlReceipts", {
      tenantId: incident.tenantId,
      projectId: incident.projectId,
      repositoryId: repository._id,
      incidentId: incident._id,
      controlKey: REPOSITORY_DISPATCH_CONTROL,
      operation: args.operation,
      receiptType: "COMMAND_ISSUED",
      requestId,
      authorityActorId: access.actorId,
      authoritySequence: incident.currentSequence,
      authorityExpiresAt: args.authorityExpiresAt,
      producerId: REPOSITORY_DISPATCH_EXECUTOR_ID,
      initiatedByActorId: access.actorId,
      restorationAuthorizationId: restorationAuthorization?._id,
      expectedAdmission,
      predecessorReceiptId: requestReceipt._id,
      result: "PASS",
      runtimeContractVersion: RUNTIME_CONTRACT_VERSION,
      createdAt: now,
    });
    const projectionPatch = {
      admission: expectedAdmission,
      controlledByIncidentId: incident._id,
      activeRequestId: requestId,
      generation: (projection?.generation ?? 0) + 1,
      updatedBy: REPOSITORY_DISPATCH_EXECUTOR_ID,
      updatedAt: now,
    } as const;
    if (projection) await ctx.db.patch(projection._id, projectionPatch);
    else await ctx.db.insert("repositoryDispatchControls", {
      tenantId: incident.tenantId,
      projectId: incident.projectId,
      repositoryId: repository._id,
      ...projectionPatch,
    });
    const acknowledgmentId = await ctx.db.insert("factoryIncidentControlReceipts", {
      tenantId: incident.tenantId,
      projectId: incident.projectId,
      repositoryId: repository._id,
      incidentId: incident._id,
      controlKey: REPOSITORY_DISPATCH_CONTROL,
      operation: args.operation,
      receiptType: "ACKNOWLEDGED",
      requestId,
      authorityActorId: access.actorId,
      authoritySequence: incident.currentSequence,
      authorityExpiresAt: args.authorityExpiresAt,
      producerId: REPOSITORY_DISPATCH_EXECUTOR_ID,
      initiatedByActorId: access.actorId,
      restorationAuthorizationId: restorationAuthorization?._id,
      expectedAdmission,
      predecessorReceiptId: commandReceiptId,
      result: "PASS",
      runtimeContractVersion: RUNTIME_CONTRACT_VERSION,
      createdAt: now,
    });
    await ctx.db.insert("activities", {
      tenantId: incident.tenantId,
      projectId: incident.projectId,
      actorType: "HUMAN",
      actorId: access.actorId,
      action: args.operation,
      description: `${args.operation} applied to ${repository.repository}`,
      targetType: "FACTORY_INCIDENT",
      targetId: String(incident._id),
      beforeState: { admission: beforeAdmission },
      afterState: { admission: expectedAdmission },
      metadata: { repositoryId: repository._id, requestId, commandReceiptId, acknowledgmentId },
    });
    return {
      commandReceipt: await ctx.db.get(commandReceiptId) as Doc<"factoryIncidentControlReceipts">,
      acknowledgment: await ctx.db.get(acknowledgmentId) as Doc<"factoryIncidentControlReceipts">,
      duplicate: false as const,
    };
  },
});
