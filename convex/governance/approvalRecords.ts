import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { appendChangeRecord } from "../lib/armAudit";
import { resolveActiveTenantId } from "../lib/getActiveTenant";
import {
  COMPANY_PERMISSIONS,
  requireCompanyPermission,
} from "../lib/companyAccess";

const statusValidator = v.union(
  v.literal("PENDING"),
  v.literal("APPROVED"),
  v.literal("DENIED"),
  v.literal("EXPIRED"),
  v.literal("CANCELED")
);

export const createApprovalRecord = mutation({
  args: {
    tenantId: v.optional(v.id("tenants")),
    projectId: v.optional(v.id("projects")),
    instanceId: v.optional(v.id("agentInstances")),
    versionId: v.optional(v.id("agentVersions")),
    actionType: v.string(),
    riskLevel: v.union(v.literal("GREEN"), v.literal("YELLOW"), v.literal("RED")),
    rollbackPlan: v.optional(v.string()),
    justification: v.string(),
    escalationLevel: v.optional(v.number()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const tenantId = await resolveActiveTenantId(
      { db: ctx.db as any },
      {
        tenantId: args.tenantId,
        projectId: args.projectId,
        instanceId: args.instanceId,
        versionId: args.versionId,
        createDefaultIfMissing: true,
      }
    );

    const id = await ctx.db.insert("approvalRecords", {
      ...args,
      tenantId,
      status: "PENDING",
      requestedAt: Date.now(),
    });

    await appendChangeRecord(ctx.db as any, {
      tenantId,
      projectId: args.projectId,
      instanceId: args.instanceId,
      versionId: args.versionId,
      type: "APPROVAL_REQUESTED",
      summary: `Approval record requested for ${args.actionType}`,
      relatedTable: "approvalRecords",
      relatedId: id,
    });

    return await ctx.db.get(id);
  },
});

export const decideApproval = mutation({
  args: {
    approvalRecordId: v.id("approvalRecords"),
    status: v.union(v.literal("APPROVED"), v.literal("DENIED"), v.literal("CANCELED"), v.literal("EXPIRED")),
    decisionReason: v.optional(v.string()),
    decidedBy: v.optional(v.id("operators")),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.approvalRecordId);
    if (!existing) throw new Error("Approval record not found");
    // Approval records are the ARM audit trail for consequential decisions.
    // Authority is resolved server-side and the decision is append-once: a
    // decided record may not be re-decided or reversed in place.
    if (!existing.tenantId) {
      throw new Error("Approval record is not bound to a company account.");
    }
    if (existing.status !== "PENDING") {
      throw new Error(`Approval record is already ${existing.status}.`);
    }
    const actor = await requireCompanyPermission(
      ctx,
      existing.tenantId,
      COMPANY_PERMISSIONS.APPROVE_DELIVERY,
    );

    await ctx.db.patch(args.approvalRecordId, {
      status: args.status,
      decisionReason: args.decisionReason,
      // Attribution is server-derived; a client-named decider is ignored.
      decidedBy: actor.operatorId,
      decidedAt: Date.now(),
    });

    await appendChangeRecord(ctx.db as any, {
      tenantId: existing.tenantId,
      projectId: existing.projectId,
      instanceId: existing.instanceId,
      versionId: existing.versionId,
      type: "APPROVAL_DECIDED",
      summary: `Approval record ${args.status.toLowerCase()}`,
      relatedTable: "approvalRecords",
      relatedId: args.approvalRecordId,
    });

    return await ctx.db.get(args.approvalRecordId);
  },
});

export const listApprovals = query({
  args: {
    tenantId: v.optional(v.id("tenants")),
    projectId: v.optional(v.id("projects")),
    status: v.optional(statusValidator),
  },
  handler: async (ctx, args) => {
    let rows = args.projectId
      ? await ctx.db
          .query("approvalRecords")
          .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
          .collect()
      : args.tenantId
      ? await ctx.db
          .query("approvalRecords")
          .withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId))
          .collect()
      : await ctx.db.query("approvalRecords").collect();

    if (args.status) {
      rows = rows.filter((row) => row.status === args.status);
    }

    return rows.sort((a, b) => b.requestedAt - a.requestedAt);
  },
});
