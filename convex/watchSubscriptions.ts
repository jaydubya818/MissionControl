import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const entityTypeValidator = v.union(
  v.literal("TASK"),
  v.literal("APPROVAL"),
  v.literal("AGENT"),
  v.literal("PROJECT")
);

export const listByUser = query({
  args: {
    userId: v.string(),
    projectId: v.optional(v.id("projects")),
    entityType: v.optional(entityTypeValidator),
  },
  handler: async (ctx, args) => {
    let subs = await ctx.db
      .query("watchSubscriptions")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    if (args.projectId) {
      subs = subs.filter((sub) => sub.projectId === args.projectId);
    }

    if (args.entityType) {
      subs = subs.filter((sub) => sub.entityType === args.entityType);
    }

    return subs.sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const listWatchers = query({
  args: {
    entityType: entityTypeValidator,
    entityId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("watchSubscriptions")
      .withIndex("by_entity", (q) => q.eq("entityType", args.entityType).eq("entityId", args.entityId))
      .collect();
  },
});

export const toggle = mutation({
  args: {
    userId: v.string(),
    projectId: v.optional(v.id("projects")),
    entityType: entityTypeValidator,
    entityId: v.string(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("watchSubscriptions")
      .withIndex("by_user_entity", (q) =>
        q.eq("userId", args.userId).eq("entityType", args.entityType).eq("entityId", args.entityId)
      )
      .first();

    if (existing) {
      await ctx.db.delete(existing._id);
      return { watching: false, subscriptionId: existing._id };
    }

    const id = await ctx.db.insert("watchSubscriptions", {
      userId: args.userId,
      projectId: args.projectId,
      entityType: args.entityType,
      entityId: args.entityId,
      createdAt: Date.now(),
      metadata: args.metadata,
    });

    return { watching: true, subscriptionId: id };
  },
});
