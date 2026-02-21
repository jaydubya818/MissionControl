import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { appendChangeRecord } from "../lib/armAudit";
import { resolveActiveTenantId } from "../lib/getActiveTenant";

const instanceStatus = v.union(
  v.literal("PROVISIONING"),
  v.literal("ACTIVE"),
  v.literal("PAUSED"),
  v.literal("READONLY"),
  v.literal("DRAINING"),
  v.literal("QUARANTINED"),
  v.literal("RETIRED")
);

export const createInstance = mutation({
  args: {
    tenantId: v.optional(v.id("tenants")),
    projectId: v.optional(v.id("projects")),
    templateId: v.id("agentTemplates"),
    versionId: v.id("agentVersions"),
    environmentId: v.optional(v.id("environments")),
    name: v.string(),
    legacyAgentId: v.optional(v.id("agents")),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const tenantId = await resolveActiveTenantId(
      { db: ctx.db as any },
      {
        tenantId: args.tenantId,
        projectId: args.projectId,
        templateId: args.templateId,
        versionId: args.versionId,
        environmentId: args.environmentId,
        createDefaultIfMissing: true,
      }
    );

    const existing = args.legacyAgentId
      ? await ctx.db
          .query("agentInstances")
          .withIndex("by_legacy_agent", (q) => q.eq("legacyAgentId", args.legacyAgentId))
          .first()
      : null;

    if (existing) {
      return existing;
    }

    const now = Date.now();
    const instanceId = await ctx.db.insert("agentInstances", {
      tenantId,
      projectId: args.projectId,
      templateId: args.templateId,
      versionId: args.versionId,
      environmentId: args.environmentId,
      name: args.name,
      status: "PROVISIONING",
      legacyAgentId: args.legacyAgentId,
      activatedAt: now,
      metadata: args.metadata,
    });

    await appendChangeRecord(ctx.db as any, {
      tenantId,
      projectId: args.projectId,
      templateId: args.templateId,
      versionId: args.versionId,
      instanceId,
      legacyAgentId: args.legacyAgentId,
      type: "INSTANCE_CREATED",
      summary: `Instance created: ${args.name}`,
      relatedTable: "agentInstances",
      relatedId: instanceId,
    });

    return await ctx.db.get(instanceId);
  },
});

export const getInstance = query({
  args: { instanceId: v.id("agentInstances") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.instanceId);
  },
});

export const listInstances = query({
  args: {
    projectId: v.optional(v.id("projects")),
    templateId: v.optional(v.id("agentTemplates")),
    status: v.optional(instanceStatus),
  },
  handler: async (ctx, args) => {
    let rows;
    if (args.projectId) {
      rows = await ctx.db
        .query("agentInstances")
        .withIndex("by_project", (q) => q.eq("projectId", args.projectId!))
        .collect();
    } else if (args.templateId) {
      rows = await ctx.db
        .query("agentInstances")
        .withIndex("by_template", (q) => q.eq("templateId", args.templateId!))
        .collect();
    } else {
      rows = await ctx.db.query("agentInstances").collect();
    }

    if (args.status) {
      rows = rows.filter((row) => row.status === args.status);
    }

    return rows.sort((a, b) => b._creationTime - a._creationTime);
  },
});

export const transitionInstance = mutation({
  args: {
    instanceId: v.id("agentInstances"),
    status: instanceStatus,
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const instance = await ctx.db.get(args.instanceId);
    if (!instance) {
      throw new Error("Instance not found");
    }

    await ctx.db.patch(args.instanceId, {
      status: args.status,
      retiredAt: args.status === "RETIRED" ? Date.now() : instance.retiredAt,
      metadata: args.metadata ?? instance.metadata,
    });

    await appendChangeRecord(ctx.db as any, {
      tenantId: instance.tenantId,
      projectId: instance.projectId,
      templateId: instance.templateId,
      versionId: instance.versionId,
      instanceId: args.instanceId,
      legacyAgentId: instance.legacyAgentId,
      type: "INSTANCE_TRANSITIONED",
      summary: `Instance transitioned ${instance.status} -> ${args.status}`,
      relatedTable: "agentInstances",
      relatedId: args.instanceId,
    });

    return await ctx.db.get(args.instanceId);
  },
});
