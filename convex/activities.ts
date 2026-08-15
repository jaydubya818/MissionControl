/**
 * Activities — Convex Functions
 * 
 * Audit log queries.
 */

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
  FACTORY_PERMISSIONS,
  listAccessibleWorkspaces,
  listCompanyMemberships,
  requireWorkspacePermission,
} from "./lib/companyAccess";

type ActivityCtx = QueryCtx | MutationCtx;

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function boundedLimit(limit?: number): number {
  if (limit === undefined) return DEFAULT_LIMIT;
  if (!Number.isFinite(limit) || limit < 1) return 1;
  return Math.min(Math.floor(limit), MAX_LIMIT);
}

function validatedText(value: string, field: string, maximum: number): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum) {
    throw new Error(`${field} is required and must be ${maximum} characters or fewer.`);
  }
  return normalized;
}

async function accessibleProjectIds(ctx: ActivityCtx): Promise<Set<Id<"projects">>> {
  const memberships = await listCompanyMemberships(ctx);
  if (memberships.length === 0) {
    throw new Error("Audit records are unavailable or unauthorized.");
  }
  const workspaces = (
    await Promise.all(
      memberships.map((membership) =>
        listAccessibleWorkspaces(ctx, membership.tenant._id)
      )
    )
  ).flat();
  return new Set(workspaces.map((workspace) => workspace._id));
}

async function listAuthorizedActivities(
  ctx: QueryCtx,
  args: { projectId?: Id<"projects">; limit?: number }
): Promise<Doc<"activities">[]> {
  const limit = boundedLimit(args.limit);
  if (args.projectId) {
    await requireWorkspacePermission(
      ctx,
      args.projectId,
      FACTORY_PERMISSIONS.VIEW
    );
    return await ctx.db
      .query("activities")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .take(limit);
  }

  const projectIds = await accessibleProjectIds(ctx);
  const batches = await Promise.all(
    [...projectIds].map((projectId) =>
      ctx.db
        .query("activities")
        .withIndex("by_project", (q) => q.eq("projectId", projectId))
        .order("desc")
        .take(limit)
    )
  );
  return batches
    .flat()
    .sort((left, right) => right._creationTime - left._creationTime)
    .slice(0, limit);
}

export const create = mutation({
  args: {
    projectId: v.optional(v.id("projects")),
    actorType: v.union(v.literal("HUMAN"), v.literal("AGENT"), v.literal("SYSTEM")),
    actorId: v.optional(v.string()),
    action: v.string(),
    description: v.string(),
    targetType: v.optional(v.string()),
    targetId: v.optional(v.string()),
    taskId: v.optional(v.id("tasks")),
    agentId: v.optional(v.id("agents")),
    beforeState: v.optional(v.any()),
    afterState: v.optional(v.any()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    if (!args.projectId) {
      throw new Error("A workspace-scoped audit target is required.");
    }
    if (args.actorType !== "SYSTEM") {
      throw new Error("The public audit writer accepts service events only.");
    }
    const access = await requireWorkspacePermission(
      ctx,
      args.projectId,
      FACTORY_PERMISSIONS.IMPROVE
    );
    const [task, agent] = await Promise.all([
      args.taskId ? ctx.db.get(args.taskId) : null,
      args.agentId ? ctx.db.get(args.agentId) : null,
    ]);
    if (args.taskId && (!task || task.projectId !== args.projectId)) {
      throw new Error("Audit target is unavailable or unauthorized.");
    }
    if (args.agentId && (!agent || agent.projectId !== args.projectId)) {
      throw new Error("Audit target is unavailable or unauthorized.");
    }
    return await ctx.db.insert("activities", {
      ...args,
      tenantId: access.project.tenantId,
      actorId: access.actorId,
      action: validatedText(args.action, "Audit action", 120),
      description: validatedText(args.description, "Audit description", 2_000),
    });
  },
});

export const list = query({
  args: {
    projectId: v.optional(v.id("projects")),
    limit: v.optional(v.number()),
  },
  handler: listAuthorizedActivities,
});

export const listRecent = query({
  args: { 
    projectId: v.optional(v.id("projects")),
    limit: v.optional(v.number()),
  },
  handler: listAuthorizedActivities,
});

export const listByTask = query({
  args: { 
    taskId: v.id("tasks"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task?.projectId) {
      throw new Error("Audit records are unavailable or unauthorized.");
    }
    await requireWorkspacePermission(
      ctx,
      task.projectId,
      FACTORY_PERMISSIONS.VIEW
    );
    return await ctx.db
      .query("activities")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .filter((q) => q.eq(q.field("projectId"), task.projectId))
      .order("desc")
      .take(boundedLimit(args.limit));
  },
});

export const listByAgent = query({
  args: { 
    agentId: v.id("agents"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const agent = await ctx.db.get(args.agentId);
    if (!agent?.projectId) {
      throw new Error("Audit records are unavailable or unauthorized.");
    }
    await requireWorkspacePermission(
      ctx,
      agent.projectId,
      FACTORY_PERMISSIONS.VIEW
    );
    return await ctx.db
      .query("activities")
      .withIndex("by_agent", (q) => q.eq("agentId", args.agentId))
      .filter((q) => q.eq(q.field("projectId"), agent.projectId))
      .order("desc")
      .take(boundedLimit(args.limit));
  },
});

export const listByAction = query({
  args: { 
    action: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const projectIds = await accessibleProjectIds(ctx);
    const limit = boundedLimit(args.limit);
    const batches = await Promise.all(
      [...projectIds].map((projectId) =>
        ctx.db
          .query("activities")
          .withIndex("by_project", (q) => q.eq("projectId", projectId))
          .filter((q) => q.eq(q.field("action"), args.action))
          .order("desc")
          .take(limit)
      )
    );
    return batches
      .flat()
      .sort((left, right) => right._creationTime - left._creationTime)
      .slice(0, boundedLimit(args.limit));
  },
});
