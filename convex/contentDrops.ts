/**
 * Content Drops — Agent-submitted deliverables
 */

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const contentTypeValidator = v.union(
  v.literal("BLOG_POST"),
  v.literal("SOCIAL_POST"),
  v.literal("EMAIL_DRAFT"),
  v.literal("SCRIPT"),
  v.literal("REPORT"),
  v.literal("CODE_SNIPPET"),
  v.literal("DESIGN"),
  v.literal("OTHER")
);

const statusValidator = v.union(
  v.literal("DRAFT"),
  v.literal("SUBMITTED"),
  v.literal("APPROVED"),
  v.literal("REJECTED"),
  v.literal("PUBLISHED")
);

// ============================================================================
// QUERIES
// ============================================================================

export const list = query({
  args: {
    projectId: v.optional(v.id("projects")),
    status: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;

    if (args.status) {
      const results = await ctx.db
        .query("contentDrops")
        .withIndex("by_status", (q) => q.eq("status", args.status as any))
        .order("desc")
        .take(limit);

      if (args.projectId) {
        return results.filter((d) => d.projectId === args.projectId);
      }
      return results;
    }

    if (args.projectId) {
      return await ctx.db
        .query("contentDrops")
        .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
        .order("desc")
        .take(limit);
    }

    return await ctx.db.query("contentDrops").order("desc").take(limit);
  },
});

export const get = query({
  args: { id: v.id("contentDrops") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const listByAgent = query({
  args: {
    agentId: v.id("agents"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("contentDrops")
      .withIndex("by_agent", (q) => q.eq("agentId", args.agentId))
      .order("desc")
      .take(args.limit ?? 20);
  },
});

// ============================================================================
// MUTATIONS
// ============================================================================

export const submit = mutation({
  args: {
    projectId: v.optional(v.id("projects")),
    agentId: v.optional(v.id("agents")),
    taskId: v.optional(v.id("tasks")),
    title: v.string(),
    contentType: contentTypeValidator,
    content: v.string(),
    summary: v.optional(v.string()),
    fileUrl: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const agent = args.agentId ? await ctx.db.get(args.agentId) : null;

    const id = await ctx.db.insert("contentDrops", {
      tenantId: agent?.tenantId,
      projectId: args.projectId ?? agent?.projectId,
      agentId: args.agentId,
      taskId: args.taskId,
      title: args.title,
      contentType: args.contentType,
      content: args.content,
      summary: args.summary,
      fileUrl: args.fileUrl,
      status: "SUBMITTED",
      tags: args.tags,
      metadata: args.metadata,
    });

    await ctx.db.insert("activities", {
      projectId: args.projectId ?? agent?.projectId,
      actorType: args.agentId ? "AGENT" : "HUMAN",
      actorId: args.agentId ?? undefined,
      action: "CONTENT_DROP_SUBMITTED",
      description: `Content drop "${args.title}" submitted${agent ? ` by ${agent.name}` : ""}`,
      targetType: "CONTENT_DROP",
      targetId: id,
      agentId: args.agentId,
    });

    return id;
  },
});

export const updateStatus = mutation({
  args: {
    id: v.id("contentDrops"),
    status: statusValidator,
    reviewedBy: v.optional(v.string()),
    reviewNote: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const drop = await ctx.db.get(args.id);
    if (!drop) throw new Error("Content drop not found");

    await ctx.db.patch(args.id, {
      status: args.status,
      reviewedBy: args.reviewedBy,
      reviewedAt: Date.now(),
      reviewNote: args.reviewNote,
    });

    await ctx.db.insert("activities", {
      projectId: drop.projectId,
      actorType: "HUMAN",
      actorId: args.reviewedBy,
      action: `CONTENT_DROP_${args.status}`,
      description: `Content drop "${drop.title}" marked as ${args.status.toLowerCase()}`,
      targetType: "CONTENT_DROP",
      targetId: args.id,
      agentId: drop.agentId,
    });

    return await ctx.db.get(args.id);
  },
});
