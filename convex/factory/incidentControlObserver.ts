/** Independent observer for the repository-dispatch Incident Command control. */

import { v } from "convex/values";
import { mutation } from "../_generated/server";
import { FACTORY_PERMISSIONS, requireWorkspacePermission } from "../lib/companyAccess";
import {
  REPOSITORY_DISPATCH_OBSERVER_ID,
  REPOSITORY_DISPATCH_EXECUTOR_ID,
  INCIDENT_COMMAND_AUTHORITY_ID,
  expectedAdmissionForOperation,
} from "../lib/factoryIncidentControl";
import { RUNTIME_CONTRACT_VERSION } from "../lib/runtimeContract";

export const observeRepositoryDispatchControl = mutation({
  args: {
    incidentId: v.id("factoryIncidents"),
    repositoryId: v.id("workspaceRepositories"),
    commandReceiptId: v.id("factoryIncidentControlReceipts"),
    acknowledgmentReceiptId: v.id("factoryIncidentControlReceipts"),
    expectedSequence: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const incident = await ctx.db.get(args.incidentId);
    if (!incident || incident.repositoryId !== args.repositoryId) {
      throw new Error("Incident observation target is unavailable or outside the incident scope.");
    }
    const access = await requireWorkspacePermission(
      ctx, incident.projectId, FACTORY_PERMISSIONS.INCIDENT_CONTROL, { repositoryId: args.repositoryId },
    );
    if (incident.currentSequence !== args.expectedSequence) {
      throw new Error("Incident control observation is stale.");
    }
    const [command, acknowledgment, projection] = await Promise.all([
      ctx.db.get(args.commandReceiptId),
      ctx.db.get(args.acknowledgmentReceiptId),
      ctx.db.query("repositoryDispatchControls")
        .withIndex("by_repository", (query) => query.eq("repositoryId", args.repositoryId))
        .unique(),
    ]);
    const request = command?.predecessorReceiptId ? await ctx.db.get(command.predecessorReceiptId) : null;
    if (!request || !command || !acknowledgment
      || request.receiptType !== "COMMAND_REQUESTED"
      || request.producerId !== INCIDENT_COMMAND_AUTHORITY_ID
      || command.predecessorReceiptId !== request._id
      || request.requestId !== command.requestId
      || command.incidentId !== incident._id
      || command.repositoryId !== args.repositoryId
      || command.receiptType !== "COMMAND_ISSUED"
      || acknowledgment.receiptType !== "ACKNOWLEDGED"
      || acknowledgment.predecessorReceiptId !== command._id
      || acknowledgment.requestId !== command.requestId
      || acknowledgment.authorityActorId !== command.authorityActorId
      || acknowledgment.authoritySequence !== command.authoritySequence
      || acknowledgment.authorityExpiresAt !== command.authorityExpiresAt
      || acknowledgment.runtimeContractVersion !== command.runtimeContractVersion
      || request.authorityActorId !== command.authorityActorId
      || request.authoritySequence !== command.authoritySequence
      || request.authorityExpiresAt !== command.authorityExpiresAt
      || request.runtimeContractVersion !== command.runtimeContractVersion
      || request.restorationAuthorizationId !== command.restorationAuthorizationId
      || command.restorationAuthorizationId !== acknowledgment.restorationAuthorizationId
      || command.producerId !== REPOSITORY_DISPATCH_EXECUTOR_ID
      || acknowledgment.producerId !== REPOSITORY_DISPATCH_EXECUTOR_ID
      || command.runtimeContractVersion !== RUNTIME_CONTRACT_VERSION) {
      throw new Error("Incident control observation receipt lineage is invalid.");
    }
    if (command.authoritySequence !== incident.currentSequence || command.authorityExpiresAt < now) {
      throw new Error("Incident control observation authority is stale.");
    }
    const expectedAdmission = expectedAdmissionForOperation(command.operation);
    if (!projection
      || projection.projectId !== incident.projectId
      || projection.controlledByIncidentId !== incident._id
      || projection.activeRequestId !== command.requestId
      || projection.admission !== expectedAdmission) {
      throw new Error("Repository dispatch effect is not observed.");
    }
    const existing = await ctx.db.query("factoryIncidentControlReceipts")
      .withIndex("by_incident_request_type", (query) => query.eq("incidentId", incident._id).eq("requestId", command.requestId).eq("receiptType", "EFFECT_OBSERVED"))
      .unique();
    if (existing) return { effectReceipt: existing, duplicate: true as const };
    const effectReceiptId = await ctx.db.insert("factoryIncidentControlReceipts", {
      tenantId: incident.tenantId,
      projectId: incident.projectId,
      repositoryId: args.repositoryId,
      incidentId: incident._id,
      controlKey: command.controlKey,
      operation: command.operation,
      receiptType: "EFFECT_OBSERVED",
      requestId: command.requestId,
      authorityActorId: command.authorityActorId,
      authoritySequence: command.authoritySequence,
      authorityExpiresAt: command.authorityExpiresAt,
      producerId: REPOSITORY_DISPATCH_OBSERVER_ID,
      initiatedByActorId: access.actorId,
      restorationAuthorizationId: command.restorationAuthorizationId,
      expectedAdmission,
      observedAdmission: projection.admission,
      predecessorReceiptId: acknowledgment._id,
      result: "PASS",
      runtimeContractVersion: RUNTIME_CONTRACT_VERSION,
      createdAt: now,
    });
    return { effectReceipt: await ctx.db.get(effectReceiptId), duplicate: false as const };
  },
});
