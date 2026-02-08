/**
 * Convex functions for captures (visual artifacts gallery)
 */

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

/**
 * List all captures for a project
 */
export const list = query({
  args: {
    projectId: v.optional(v.id("projects")),
    taskId: v.optional(v.id("tasks")),
    agentId: v.optional(v.id("agents")),
    type: v.optional(
      v.union(
        v.literal("SCREENSHOT"),
        v.literal("DIAGRAM"),
        v.literal("MOCKUP"),
        v.literal("CHART"),
        v.literal("VIDEO"),
        v.literal("OTHER")
      )
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 100;

    // Select index based on priority: projectId > taskId > agentId
    let query;
    if (args.projectId) {
      query = ctx.db
        .query("captures")
        .withIndex("by_project", (q) => q.eq("projectId", args.projectId!));
    } else if (args.taskId) {
      query = ctx.db
        .query("captures")
        .withIndex("by_task", (q) => q.eq("taskId", args.taskId!));
    } else if (args.agentId) {
      query = ctx.db
        .query("captures")
        .withIndex("by_agent", (q) => q.eq("agentId", args.agentId!));
    } else {
      query = ctx.db.query("captures");
    }

    // Apply type filter separately if provided
    if (args.type) {
      query = query.filter((q) => q.eq(q.field("type"), args.type!));
    }

    // Fetch results
    let results = await query.order("desc").take(limit * 2); // Fetch more to account for additional filtering

    // Apply additional filters in memory for secondary constraints
    if (args.taskId && args.projectId) {
      results = results.filter((c) => c.taskId === args.taskId);
    }
    if (args.agentId && (args.projectId || args.taskId)) {
      results = results.filter((c) => c.agentId === args.agentId);
    }

    return results.slice(0, limit);
  },
});

/**
 * Get a single capture by ID
 */
export const get = query({
  args: {
    id: v.id("captures"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

/**
 * Create a new capture
 */
export const create = mutation({
  args: {
    projectId: v.optional(v.id("projects")),
    taskId: v.optional(v.id("tasks")),
    agentId: v.optional(v.id("agents")),
    title: v.string(),
    description: v.optional(v.string()),
    type: v.union(
      v.literal("SCREENSHOT"),
      v.literal("DIAGRAM"),
      v.literal("MOCKUP"),
      v.literal("CHART"),
      v.literal("VIDEO"),
      v.literal("OTHER")
    ),
    url: v.optional(v.string()),
    fileStorageId: v.optional(v.string()),
    thumbnailUrl: v.optional(v.string()),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    fileSize: v.optional(v.number()),
    mimeType: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("captures", {
      ...args,
      capturedAt: Date.now(),
    });
  },
});

/**
 * Update a capture
 */
export const update = mutation({
  args: {
    id: v.id("captures"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    const filtered = Object.fromEntries(
      Object.entries(updates).filter(([_, v]) => v !== undefined)
    );
    await ctx.db.patch(id, filtered);
    return id;
  },
});

/**
 * Delete a capture
 */
export const remove = mutation({
  args: {
    id: v.id("captures"),
  },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
    return args.id;
  },
});

/**
 * Get captures grouped by type
 */
export const getByType = query({
  args: {
    projectId: v.optional(v.id("projects")),
  },
  handler: async (ctx, args) => {
    const captures = await ctx.db
      .query("captures")
      .withIndex("by_project", (q) =>
        args.projectId ? q.eq("projectId", args.projectId) : q
      )
      .collect();

    const grouped: Record<string, any[]> = {
      SCREENSHOT: [],
      DIAGRAM: [],
      MOCKUP: [],
      CHART: [],
      VIDEO: [],
      OTHER: [],
    };

    for (const capture of captures) {
      grouped[capture.type].push(capture);
    }

    return grouped;
  },
});
