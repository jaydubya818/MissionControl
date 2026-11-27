import { v } from "convex/values";
import { mutation, query } from "./lib/missionScopedFunctions";

// ============================================================================
// QUERIES
// ============================================================================

export const list = query({
  args: {
    projectId: v.id("projects"),
    level: v.optional(
      v.union(
        v.literal("COMPANY"),
        v.literal("TEAM"),
        v.literal("AGENT"),
        v.literal("TASK")
      )
    ),
    status: v.optional(
      v.union(
        v.literal("PLANNED"),
        v.literal("ACTIVE"),
        v.literal("ACHIEVED"),
        v.literal("CANCELLED")
      )
    ),
  },
  handler: async (ctx, args) => {
    let goals;

    if (args.level) {
      goals = await ctx.db
        .query("goals")
        .withIndex("by_project_level", (idx) =>
          idx.eq("projectId", args.projectId).eq("level", args.level!)
        )
        .collect();
    } else {
      goals = await ctx.db
        .query("goals")
        .withIndex("by_project", (idx) =>
          idx.eq("projectId", args.projectId)
        )
        .collect();
    }

    if (args.status) {
      return goals.filter((g) => g.status === args.status);
    }
    return goals;
  },
});

export const get = query({
  args: { goalId: v.id("goals") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.goalId);
  },
});

export const getHierarchy = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const allGoals = await ctx.db
      .query("goals")
      .withIndex("by_project", (idx) => idx.eq("projectId", args.projectId))
      .collect();

    const roots = allGoals.filter((g) => !g.parentGoalId);
    const byParent = new Map<string, typeof allGoals>();
    for (const g of allGoals) {
      if (g.parentGoalId) {
        const children = byParent.get(g.parentGoalId) ?? [];
        children.push(g);
        byParent.set(g.parentGoalId, children);
      }
    }

    type GoalNode = (typeof allGoals)[0] & { children: GoalNode[] };

    function buildTree(goal: (typeof allGoals)[0]): GoalNode {
      const children = (byParent.get(goal._id) ?? []).map(buildTree);
      return { ...goal, children };
    }

    return roots.map(buildTree);
  },
});

export const getLinkedTasks = query({
  args: { goalId: v.id("goals") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("tasks")
      .withIndex("by_goal", (idx) => idx.eq("goalId", args.goalId))
      .collect();
  },
});

export const getAncestorChain = query({
  args: { goalId: v.id("goals") },
  handler: async (ctx, args) => {
    const chain = [];
    let current = await ctx.db.get(args.goalId);
    while (current) {
      chain.unshift(current);
      if (!current.parentGoalId) break;
      current = await ctx.db.get(current.parentGoalId);
    }
    return chain;
  },
});

// ============================================================================
// MUTATIONS
// ============================================================================

export const create = mutation({
  args: {
    projectId: v.id("projects"),
    title: v.string(),
    description: v.optional(v.string()),
    level: v.union(
      v.literal("COMPANY"),
      v.literal("TEAM"),
      v.literal("AGENT"),
      v.literal("TASK")
    ),
    parentGoalId: v.optional(v.id("goals")),
    ownerAgentId: v.optional(v.id("agents")),
    ownerUserId: v.optional(v.string()),
    targetDate: v.optional(v.number()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) throw new Error("Project not found");

    if (args.parentGoalId) {
      const parent = await ctx.db.get(args.parentGoalId);
      if (!parent) throw new Error("Parent goal not found");
      if (parent.projectId !== args.projectId) {
        throw new Error("Parent goal must belong to the same project");
      }
    }

    const goalId = await ctx.db.insert("goals", {
      tenantId: project.tenantId,
      projectId: args.projectId,
      title: args.title,
      description: args.description,
      level: args.level,
      parentGoalId: args.parentGoalId,
      ownerAgentId: args.ownerAgentId,
      ownerUserId: args.ownerUserId,
      status: "PLANNED",
      targetDate: args.targetDate,
      metadata: args.metadata,
    });

    await ctx.db.insert("activities", {
      projectId: args.projectId,
      actorType: "HUMAN",
      action: "GOAL_CREATED",
      description: `Goal "${args.title}" created (${args.level})`,
      targetType: "GOAL",
      targetId: goalId,
    });

    return goalId;
  },
});

export const update = mutation({
  args: {
    goalId: v.id("goals"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    status: v.optional(
      v.union(
        v.literal("PLANNED"),
        v.literal("ACTIVE"),
        v.literal("ACHIEVED"),
        v.literal("CANCELLED")
      )
    ),
    progressPct: v.optional(v.number()),
    ownerAgentId: v.optional(v.id("agents")),
    ownerUserId: v.optional(v.string()),
    targetDate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const goal = await ctx.db.get(args.goalId);
    if (!goal) throw new Error("Goal not found");

    const patch: Record<string, unknown> = {};
    if (args.title !== undefined) patch.title = args.title;
    if (args.description !== undefined) patch.description = args.description;
    if (args.status !== undefined) {
      patch.status = args.status;
      if (args.status === "ACHIEVED") patch.achievedAt = Date.now();
    }
    if (args.progressPct !== undefined) patch.progressPct = args.progressPct;
    if (args.ownerAgentId !== undefined) patch.ownerAgentId = args.ownerAgentId;
    if (args.ownerUserId !== undefined) patch.ownerUserId = args.ownerUserId;
    if (args.targetDate !== undefined) patch.targetDate = args.targetDate;

    await ctx.db.patch(args.goalId, patch);

    await ctx.db.insert("activities", {
      projectId: goal.projectId,
      actorType: "HUMAN",
      action: "GOAL_UPDATED",
      description: `Goal "${goal.title}" updated`,
      targetType: "GOAL",
      targetId: args.goalId,
      metadata: { changes: Object.keys(patch) },
    });
  },
});

export const remove = mutation({
  args: { goalId: v.id("goals") },
  handler: async (ctx, args) => {
    const goal = await ctx.db.get(args.goalId);
    if (!goal) throw new Error("Goal not found");

    const children = await ctx.db
      .query("goals")
      .withIndex("by_parent", (idx) => idx.eq("parentGoalId", args.goalId))
      .collect();

    if (children.length > 0) {
      throw new Error(
        `Cannot delete goal with ${children.length} child goal(s). Remove children first.`
      );
    }

    const linkedTasks = await ctx.db
      .query("tasks")
      .withIndex("by_goal", (idx) => idx.eq("goalId", args.goalId))
      .collect();
    for (const task of linkedTasks) {
      await ctx.db.patch(task._id, { goalId: undefined });
    }

    await ctx.db.delete(args.goalId);

    await ctx.db.insert("activities", {
      projectId: goal.projectId,
      actorType: "HUMAN",
      action: "GOAL_DELETED",
      description: `Goal "${goal.title}" deleted`,
      targetType: "GOAL",
      targetId: args.goalId,
    });
  },
});
