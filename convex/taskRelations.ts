import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const relationType = v.union(
  v.literal("BLOCKS"),
  v.literal("BLOCKED_BY"),
  v.literal("RELATED"),
  v.literal("DUPLICATE")
);

// ============================================================================
// QUERIES
// ============================================================================

export const listForTask = query({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const asSource = await ctx.db
      .query("taskRelations")
      .withIndex("by_source", (idx) => idx.eq("sourceTaskId", args.taskId))
      .collect();

    const asTarget = await ctx.db
      .query("taskRelations")
      .withIndex("by_target", (idx) => idx.eq("targetTaskId", args.taskId))
      .collect();

    return { outgoing: asSource, incoming: asTarget };
  },
});

export const listBlockers = query({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const blockedBy = await ctx.db
      .query("taskRelations")
      .withIndex("by_source_type", (idx) =>
        idx.eq("sourceTaskId", args.taskId).eq("relationType", "BLOCKED_BY")
      )
      .collect();

    const blocksMe = await ctx.db
      .query("taskRelations")
      .withIndex("by_target", (idx) => idx.eq("targetTaskId", args.taskId))
      .collect();
    const blocksFiltered = blocksMe.filter((r) => r.relationType === "BLOCKS");

    const blockerTaskIds = [
      ...blockedBy.map((r) => r.targetTaskId),
      ...blocksFiltered.map((r) => r.sourceTaskId),
    ];

    const uniqueIds = [...new Set(blockerTaskIds)];
    const tasks = await Promise.all(uniqueIds.map((id) => ctx.db.get(id)));
    return tasks.filter(Boolean);
  },
});

export const listByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("taskRelations")
      .withIndex("by_project", (idx) => idx.eq("projectId", args.projectId))
      .collect();
  },
});

// ============================================================================
// MUTATIONS
// ============================================================================

export const create = mutation({
  args: {
    sourceTaskId: v.id("tasks"),
    targetTaskId: v.id("tasks"),
    relationType,
    createdBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.sourceTaskId === args.targetTaskId) {
      throw new Error("A task cannot have a relation to itself");
    }

    const sourceTask = await ctx.db.get(args.sourceTaskId);
    const targetTask = await ctx.db.get(args.targetTaskId);
    if (!sourceTask) throw new Error("Source task not found");
    if (!targetTask) throw new Error("Target task not found");

    const existing = await ctx.db
      .query("taskRelations")
      .withIndex("by_source_type", (idx) =>
        idx
          .eq("sourceTaskId", args.sourceTaskId)
          .eq("relationType", args.relationType)
      )
      .collect();

    const duplicate = existing.find(
      (r) => r.targetTaskId === args.targetTaskId
    );
    if (duplicate) {
      return duplicate._id;
    }

    const relationId = await ctx.db.insert("taskRelations", {
      tenantId: sourceTask.tenantId,
      projectId: sourceTask.projectId,
      sourceTaskId: args.sourceTaskId,
      targetTaskId: args.targetTaskId,
      relationType: args.relationType,
      createdBy: args.createdBy,
      createdAt: Date.now(),
    });

    if (args.relationType === "BLOCKS") {
      await ctx.db.insert("taskRelations", {
        tenantId: targetTask.tenantId,
        projectId: targetTask.projectId,
        sourceTaskId: args.targetTaskId,
        targetTaskId: args.sourceTaskId,
        relationType: "BLOCKED_BY",
        createdBy: args.createdBy,
        createdAt: Date.now(),
      });
    } else if (args.relationType === "BLOCKED_BY") {
      await ctx.db.insert("taskRelations", {
        tenantId: targetTask.tenantId,
        projectId: targetTask.projectId,
        sourceTaskId: args.targetTaskId,
        targetTaskId: args.sourceTaskId,
        relationType: "BLOCKS",
        createdBy: args.createdBy,
        createdAt: Date.now(),
      });
    }

    if (args.relationType === "DUPLICATE") {
      const isDone =
        targetTask.status === "DONE" || targetTask.status === "CANCELED";
      if (!isDone) {
        const now = Date.now();
        const reason = `Duplicate of task "${sourceTask.title}"`;
        await ctx.db.patch(args.targetTaskId, { status: "CANCELED", stateEnteredAt: now });
        await ctx.db.insert("taskTransitions", {
          projectId: targetTask.projectId,
          idempotencyKey: `duplicate:${relationId}:${args.targetTaskId}`,
          taskId: args.targetTaskId,
          fromStatus: targetTask.status,
          toStatus: "CANCELED",
          actorType: "SYSTEM",
          reason,
          validationResult: { valid: true },
        });
        await ctx.db.insert("activities", {
          projectId: targetTask.projectId,
          actorType: "SYSTEM",
          action: "TASK_AUTO_CANCELLED",
          description: `Task "${targetTask.title}" auto-cancelled as duplicate of "${sourceTask.title}"`,
          targetType: "TASK",
          targetId: args.targetTaskId,
          taskId: args.targetTaskId,
        });
      }
    }

    await ctx.db.insert("activities", {
      projectId: sourceTask.projectId,
      actorType: "HUMAN",
      action: "TASK_RELATION_CREATED",
      description: `Relation ${args.relationType}: "${sourceTask.title}" → "${targetTask.title}"`,
      targetType: "TASK",
      targetId: args.sourceTaskId,
      taskId: args.sourceTaskId,
    });

    return relationId;
  },
});

export const remove = mutation({
  args: { relationId: v.id("taskRelations") },
  handler: async (ctx, args) => {
    const relation = await ctx.db.get(args.relationId);
    if (!relation) throw new Error("Relation not found");

    if (
      relation.relationType === "BLOCKS" ||
      relation.relationType === "BLOCKED_BY"
    ) {
      const inverseType =
        relation.relationType === "BLOCKS" ? "BLOCKED_BY" : "BLOCKS";
      const inverseRelations = await ctx.db
        .query("taskRelations")
        .withIndex("by_source_type", (idx) =>
          idx
            .eq("sourceTaskId", relation.targetTaskId)
            .eq("relationType", inverseType)
        )
        .collect();
      const inverse = inverseRelations.find(
        (r) => r.targetTaskId === relation.sourceTaskId
      );
      if (inverse) {
        await ctx.db.delete(inverse._id);
      }
    }

    await ctx.db.delete(args.relationId);
  },
});
