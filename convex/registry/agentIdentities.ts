import { query, mutation } from "../_generated/server";
import { v } from "convex/values";
import { resolveAgentRef } from "../lib/agentResolver";
import { appendChangeRecord } from "../lib/armAudit";

export const getIdentity = query({
  args: {
    instanceId: v.optional(v.id("agentInstances")),
    agentId: v.optional(v.id("agents")),
  },
  handler: async (ctx, args) => {
    if (args.instanceId) {
      return await ctx.db
        .query("agentIdentities")
        .withIndex("by_instance", (q) => q.eq("instanceId", args.instanceId))
        .first();
    }
    const agentId = args.agentId;
    if (agentId) {
      return await ctx.db
        .query("agentIdentities")
        .withIndex("by_agent", (q) => q.eq("agentId", agentId))
        .first();
    }
    return null;
  },
});

export const listIdentities = query({
  args: {
    tenantId: v.optional(v.id("tenants")),
    templateId: v.optional(v.id("agentTemplates")),
  },
  handler: async (ctx, args) => {
    if (args.templateId) {
      return await ctx.db
        .query("agentIdentities")
        .withIndex("by_template", (q) => q.eq("templateId", args.templateId))
        .collect();
    }
    if (args.tenantId) {
      return await ctx.db
        .query("agentIdentities")
        .withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId))
        .collect();
    }
    return await ctx.db.query("agentIdentities").collect();
  },
});

export const upsertAgentIdentity = mutation({
  args: {
    agentId: v.id("agents"),
    name: v.string(),
    creature: v.optional(v.string()),
    vibe: v.optional(v.string()),
    emoji: v.optional(v.string()),
    avatarPath: v.optional(v.string()),
    soulContent: v.optional(v.string()),
    toolsNotes: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const agent = await ctx.db.get(args.agentId);
    if (!agent) throw new Error("Agent not found");

    const resolved = await resolveAgentRef({ db: ctx.db as any }, { agentId: args.agentId, createIfMissing: true });

    const existing = await ctx.db
      .query("agentIdentities")
      .withIndex("by_agent", (q) => q.eq("agentId", args.agentId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        tenantId: agent.tenantId,
        templateId: resolved?.templateId,
        versionId: resolved?.versionId,
        instanceId: resolved?.instanceId,
        legacyAgentId: args.agentId,
        name: args.name,
        creature: args.creature,
        vibe: args.vibe,
        emoji: args.emoji,
        avatarPath: args.avatarPath,
        soulContent: args.soulContent,
        toolsNotes: args.toolsNotes,
        metadata: args.metadata,
      });

      await appendChangeRecord(ctx.db as any, {
        tenantId: agent.tenantId,
        projectId: agent.projectId,
        templateId: resolved?.templateId,
        versionId: resolved?.versionId,
        instanceId: resolved?.instanceId,
        legacyAgentId: args.agentId,
        type: "IDENTITY_UPDATED",
        summary: `Identity updated for ${args.name}`,
        relatedTable: "agentIdentities",
        relatedId: existing._id,
      });

      return await ctx.db.get(existing._id);
    }

    const id = await ctx.db.insert("agentIdentities", {
      tenantId: agent.tenantId,
      agentId: args.agentId,
      templateId: resolved?.templateId,
      versionId: resolved?.versionId,
      instanceId: resolved?.instanceId,
      legacyAgentId: args.agentId,
      name: args.name,
      creature: args.creature,
      vibe: args.vibe,
      emoji: args.emoji,
      avatarPath: args.avatarPath,
      soulContent: args.soulContent,
      toolsNotes: args.toolsNotes,
      validationStatus: "VALID",
      metadata: args.metadata,
    });

    await appendChangeRecord(ctx.db as any, {
      tenantId: agent.tenantId,
      projectId: agent.projectId,
      templateId: resolved?.templateId,
      versionId: resolved?.versionId,
      instanceId: resolved?.instanceId,
      legacyAgentId: args.agentId,
      type: "IDENTITY_UPDATED",
      summary: `Identity created for ${args.name}`,
      relatedTable: "agentIdentities",
      relatedId: id,
    });

    return await ctx.db.get(id);
  },
});
