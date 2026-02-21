import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { appendChangeRecord } from "../lib/armAudit";
import { resolveActiveTenantId } from "../lib/getActiveTenant";

export const createTemplate = mutation({
  args: {
    tenantId: v.optional(v.id("tenants")),
    projectId: v.optional(v.id("projects")),
    name: v.string(),
    slug: v.string(),
    description: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const tenantId = await resolveActiveTenantId(
      { db: ctx.db as any },
      {
        tenantId: args.tenantId,
        projectId: args.projectId,
        createDefaultIfMissing: true,
      }
    );

    const existing = await ctx.db
      .query("agentTemplates")
      .withIndex("by_tenant_slug", (q) => q.eq("tenantId", tenantId).eq("slug", args.slug))
      .first();
    if (existing) {
      throw new Error(`Template slug already exists: ${args.slug}`);
    }

    const now = Date.now();
    const templateId = await ctx.db.insert("agentTemplates", {
      tenantId,
      projectId: args.projectId,
      name: args.name,
      slug: args.slug,
      description: args.description,
      active: true,
      createdAt: now,
      updatedAt: now,
      metadata: args.metadata,
    });

    await appendChangeRecord(ctx.db as any, {
      tenantId,
      projectId: args.projectId,
      templateId,
      type: "TEMPLATE_CREATED",
      summary: `Template created: ${args.name}`,
      relatedTable: "agentTemplates",
      relatedId: templateId,
    });

    return await ctx.db.get(templateId);
  },
});

export const getTemplate = query({
  args: { templateId: v.id("agentTemplates") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.templateId);
  },
});

export const listTemplates = query({
  args: {
    tenantId: v.optional(v.id("tenants")),
    projectId: v.optional(v.id("projects")),
    activeOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    let rows = args.tenantId
      ? await ctx.db
          .query("agentTemplates")
          .withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId))
          .collect()
      : args.projectId
      ? await ctx.db
          .query("agentTemplates")
          .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
          .collect()
      : await ctx.db.query("agentTemplates").collect();

    if (args.activeOnly ?? true) {
      rows = rows.filter((row) => row.active);
    }

    return rows.sort((a, b) => b.updatedAt - a.updatedAt);
  },
});

export const updateTemplate = mutation({
  args: {
    templateId: v.id("agentTemplates"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    active: v.optional(v.boolean()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.templateId);
    if (!existing) {
      throw new Error("Template not found");
    }

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.name !== undefined) patch.name = args.name;
    if (args.description !== undefined) patch.description = args.description;
    if (args.active !== undefined) patch.active = args.active;
    if (args.metadata !== undefined) patch.metadata = args.metadata;

    await ctx.db.patch(args.templateId, patch);
    return await ctx.db.get(args.templateId);
  },
});
