import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const scopeValidator = v.union(
  v.literal("KANBAN"),
  v.literal("APPROVALS"),
  v.literal("AGENTS"),
  v.literal("SEARCH")
);

export const list = query({
  args: {
    projectId: v.id("projects"),
    ownerUserId: v.string(),
    scope: v.optional(scopeValidator),
  },
  handler: async (ctx, args) => {
    let views = await ctx.db
      .query("savedViews")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    if (args.scope) {
      views = views.filter((view) => view.scope === args.scope);
    }

    // Owner sees all own views + shared views from others.
    views = views.filter((view) => view.ownerUserId === args.ownerUserId || view.isShared);

    return views.sort((a, b) => b.updatedAt - a.updatedAt);
  },
});

export const create = mutation({
  args: {
    projectId: v.id("projects"),
    ownerUserId: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    scope: scopeValidator,
    filters: v.any(),
    isShared: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const id = await ctx.db.insert("savedViews", {
      projectId: args.projectId,
      ownerUserId: args.ownerUserId,
      name: args.name,
      description: args.description,
      scope: args.scope,
      filters: args.filters,
      isShared: args.isShared ?? false,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("activities", {
      projectId: args.projectId,
      actorType: "HUMAN",
      actorId: args.ownerUserId,
      action: "SAVED_VIEW_CREATED",
      description: `Saved view \"${args.name}\" created`,
      targetType: "SAVED_VIEW",
      targetId: id,
      metadata: {
        scope: args.scope,
        isShared: args.isShared ?? false,
      },
    });

    return await ctx.db.get(id);
  },
});

export const update = mutation({
  args: {
    viewId: v.id("savedViews"),
    ownerUserId: v.string(),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    filters: v.optional(v.any()),
    isShared: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const view = await ctx.db.get(args.viewId);
    if (!view) throw new Error("Saved view not found");

    if (view.ownerUserId !== args.ownerUserId) {
      throw new Error("Only the owner can update this saved view");
    }

    const patch: Record<string, unknown> = {
      updatedAt: Date.now(),
    };

    if (args.name !== undefined) patch.name = args.name;
    if (args.description !== undefined) patch.description = args.description;
    if (args.filters !== undefined) patch.filters = args.filters;
    if (args.isShared !== undefined) patch.isShared = args.isShared;

    await ctx.db.patch(args.viewId, patch);

    await ctx.db.insert("activities", {
      projectId: view.projectId,
      actorType: "HUMAN",
      actorId: args.ownerUserId,
      action: "SAVED_VIEW_UPDATED",
      description: `Saved view \"${view.name}\" updated`,
      targetType: "SAVED_VIEW",
      targetId: args.viewId,
      metadata: {
        updatedFields: Object.keys(patch),
      },
    });

    return await ctx.db.get(args.viewId);
  },
});

export const remove = mutation({
  args: {
    viewId: v.id("savedViews"),
    ownerUserId: v.string(),
  },
  handler: async (ctx, args) => {
    const view = await ctx.db.get(args.viewId);
    if (!view) throw new Error("Saved view not found");

    if (view.ownerUserId !== args.ownerUserId) {
      throw new Error("Only the owner can delete this saved view");
    }

    await ctx.db.delete(args.viewId);

    await ctx.db.insert("activities", {
      projectId: view.projectId,
      actorType: "HUMAN",
      actorId: args.ownerUserId,
      action: "SAVED_VIEW_DELETED",
      description: `Saved view \"${view.name}\" deleted`,
      targetType: "SAVED_VIEW",
      targetId: args.viewId,
      metadata: {
        scope: view.scope,
      },
    });

    return { success: true };
  },
});
