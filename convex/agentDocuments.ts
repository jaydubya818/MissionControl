/**
 * Agent Documents — WORKING.md, daily notes, session memory.
 * Per-agent memory system for OpenClaw agents.
 */

import { v } from "convex/values";
import { action, internalMutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { appendChangeRecord } from "./lib/armAudit";
import { COMPANY_PERMISSIONS } from "./lib/companyAccess";
import {
  authorizedDeliveryActor,
  requireAuthorizedDeliveryScope,
} from "./lib/deliveryAuthorization";
import { runAuditedHumanMutation } from "./lib/humanActionAudit";

const documentType = v.union(
  v.literal("WORKING_MD"),
  v.literal("DAILY_NOTE"),
  v.literal("SESSION_MEMORY")
);

/** List all agent documents, optionally filtered by project */
export const list = query({
  args: {
    projectId: v.optional(v.id("projects")),
  },
  handler: async (ctx, args) => {
    await requireAuthorizedDeliveryScope(ctx, args.projectId);
    if (args.projectId) {
      return await ctx.db
        .query("agentDocuments")
        .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
        .order("desc")
        .collect();
    }
    return await ctx.db.query("agentDocuments").order("desc").collect();
  },
});

export const listByAgent = query({
  args: { agentId: v.id("agents") },
  handler: async (ctx, args) => {
    const agent = await ctx.db.get(args.agentId);
    if (!agent) return [];
    await requireAuthorizedDeliveryScope(ctx, agent.projectId);
    return await ctx.db
      .query("agentDocuments")
      .withIndex("by_agent", (q) => q.eq("agentId", args.agentId))
      .order("desc")
      .collect();
  },
});

// ============================================================================
// CRUD MUTATIONS
// ============================================================================

/** Create a new agent document (upserts if agent+type already exists) */
const createArgs = {
  agentId: v.id("agents"),
  projectId: v.optional(v.id("projects")),
  type: documentType,
  content: v.string(),
  metadata: v.optional(v.any()),
};

export const createInternal = internalMutation({
  args: createArgs,
  handler: async (ctx, args) => {
    const agent = await ctx.db.get(args.agentId);
    if (!agent) throw new Error("Agent not found");

    const projectId = args.projectId ?? agent.projectId;
    if (!projectId) throw new Error("Agent document writes require a workspace.");
    if (agent.projectId && agent.projectId !== projectId) {
      throw new Error("Agent does not belong to the selected workspace.");
    }
    const access = await requireAuthorizedDeliveryScope(
      ctx,
      projectId,
      COMPANY_PERMISSIONS.UPDATE_DELIVERY,
    );
    const actor = authorizedDeliveryActor(access);

    // Check for existing document for this agent+type to prevent duplicates
    const existing = await ctx.db
      .query("agentDocuments")
      .withIndex("by_agent_type", (q) =>
        q.eq("agentId", args.agentId).eq("type", args.type)
      )
      .first();

    if (existing) {
      // Upsert: update the existing document instead of creating a duplicate
      await ctx.db.patch(existing._id, {
        content: args.content,
        updatedAt: Date.now(),
        metadata: args.metadata,
        projectId,
      });

      await ctx.db.insert("activities", {
        projectId,
        actorType: "HUMAN",
        actorId: actor.actorId,
        action: "MEMORY_UPDATED",
        description: `Updated existing ${args.type} document for agent "${agent.name}"`,
        agentId: args.agentId,
      });
      await appendChangeRecord(ctx.db as any, {
        tenantId: access?.project.tenantId ?? agent.tenantId,
        projectId,
        operatorId: actor.operatorId,
        legacyAgentId: args.agentId,
        type: "AGENT_DOCUMENT_UPDATED",
        summary: `Updated ${args.type} document for ${agent.name}`,
        payload: { documentId: existing._id, documentType: args.type },
        relatedTable: "agentDocuments",
        relatedId: String(existing._id),
      });

      return { documentId: existing._id, created: false };
    }

    const id = await ctx.db.insert("agentDocuments", {
      agentId: args.agentId,
      projectId,
      type: args.type,
      content: args.content,
      updatedAt: Date.now(),
      metadata: args.metadata,
    });

    await ctx.db.insert("activities", {
      projectId,
      actorType: "HUMAN",
      actorId: actor.actorId,
      action: "MEMORY_CREATED",
      description: `Created ${args.type} document for agent "${agent.name}"`,
      agentId: args.agentId,
    });
    await appendChangeRecord(ctx.db as any, {
      tenantId: access?.project.tenantId ?? agent.tenantId,
      projectId,
      operatorId: actor.operatorId,
      legacyAgentId: args.agentId,
      type: "AGENT_DOCUMENT_CREATED",
      summary: `Created ${args.type} document for ${agent.name}`,
      payload: { documentId: id, documentType: args.type },
      relatedTable: "agentDocuments",
      relatedId: String(id),
    });

    return { documentId: id, created: true };
  },
});

export const create = action({
  args: createArgs,
  handler: async (ctx, args): Promise<any> =>
    await runAuditedHumanMutation(
      ctx,
      internal.agentDocuments.createInternal,
      args,
      "agentDocuments.create",
      { projectId: args.projectId, agentId: args.agentId },
    ),
});

/** Update an existing agent document */
const updateArgs = {
  documentId: v.id("agentDocuments"),
  content: v.string(),
  metadata: v.optional(v.any()),
};

export const updateInternal = internalMutation({
  args: updateArgs,
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.documentId);
    if (!doc) throw new Error("Document not found");
    const agent = await ctx.db.get(doc.agentId);
    const projectId = doc.projectId ?? agent?.projectId;
    if (!projectId) throw new Error("Agent document is not assigned to a workspace.");
    const access = await requireAuthorizedDeliveryScope(
      ctx,
      projectId,
      COMPANY_PERMISSIONS.UPDATE_DELIVERY,
    );
    const actor = authorizedDeliveryActor(access);

    await ctx.db.patch(args.documentId, {
      content: args.content,
      updatedAt: Date.now(),
      metadata: args.metadata,
    });
    await ctx.db.insert("activities", {
      projectId,
      actorType: "HUMAN",
      actorId: actor.actorId,
      action: "MEMORY_UPDATED",
      description: `Updated ${doc.type} document`,
      agentId: doc.agentId,
    });
    await appendChangeRecord(ctx.db as any, {
      tenantId: access?.project.tenantId ?? doc.tenantId ?? agent?.tenantId,
      projectId,
      operatorId: actor.operatorId,
      legacyAgentId: doc.agentId,
      type: "AGENT_DOCUMENT_UPDATED",
      summary: `Updated ${doc.type} document`,
      payload: { documentId: doc._id, documentType: doc.type },
      relatedTable: "agentDocuments",
      relatedId: String(doc._id),
    });

    return { success: true };
  },
});

export const update = action({
  args: updateArgs,
  handler: async (ctx, args): Promise<any> =>
    await runAuditedHumanMutation(
      ctx,
      internal.agentDocuments.updateInternal,
      args,
      "agentDocuments.update",
      { documentId: args.documentId },
    ),
});

/** Remove an agent document */
const removeArgs = {
  documentId: v.id("agentDocuments"),
};

export const removeInternal = internalMutation({
  args: removeArgs,
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.documentId);
    if (!doc) throw new Error("Document not found");
    const agent = await ctx.db.get(doc.agentId);
    const projectId = doc.projectId ?? agent?.projectId;
    if (!projectId) throw new Error("Agent document is not assigned to a workspace.");
    const access = await requireAuthorizedDeliveryScope(
      ctx,
      projectId,
      COMPANY_PERMISSIONS.UPDATE_DELIVERY,
    );
    const actor = authorizedDeliveryActor(access);

    await ctx.db.delete(args.documentId);

    await ctx.db.insert("activities", {
      projectId,
      actorType: "HUMAN",
      actorId: actor.actorId,
      action: "MEMORY_DELETED",
      description: `Deleted ${doc.type} document`,
      agentId: doc.agentId,
    });
    await appendChangeRecord(ctx.db as any, {
      tenantId: access?.project.tenantId ?? doc.tenantId ?? agent?.tenantId,
      projectId,
      operatorId: actor.operatorId,
      legacyAgentId: doc.agentId,
      type: "AGENT_DOCUMENT_DELETED",
      summary: `Deleted ${doc.type} document`,
      payload: { documentId: doc._id, documentType: doc.type },
      relatedTable: "agentDocuments",
      relatedId: String(doc._id),
    });

    return { success: true };
  },
});

export const remove = action({
  args: removeArgs,
  handler: async (ctx, args): Promise<any> =>
    await runAuditedHumanMutation(
      ctx,
      internal.agentDocuments.removeInternal,
      args,
      "agentDocuments.remove",
      { documentId: args.documentId },
    ),
});
