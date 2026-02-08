import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getEffectiveOperatorControl } from "./lib/operatorControls";

const operatorModeValidator = v.union(
  v.literal("NORMAL"),
  v.literal("PAUSED"),
  v.literal("DRAINING"),
  v.literal("QUARANTINED")
);

export const getCurrent = query({
  args: {
    projectId: v.optional(v.id("projects")),
  },
  handler: async (ctx, args) => {
    return await getEffectiveOperatorControl(ctx.db, args.projectId);
  },
});

export const listHistory = query({
  args: {
    projectId: v.optional(v.id("projects")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;

    if (args.projectId) {
      return await ctx.db
        .query("operatorControls")
        .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
        .order("desc")
        .take(limit);
    }

    return await ctx.db.query("operatorControls").order("desc").take(limit);
  },
});

export const setMode = mutation({
  args: {
    projectId: v.optional(v.id("projects")),
    mode: operatorModeValidator,
    reason: v.optional(v.string()),
    userId: v.string(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const id = await ctx.db.insert("operatorControls", {
      projectId: args.projectId,
      mode: args.mode,
      reason: args.reason,
      updatedBy: args.userId,
      updatedAt: now,
      metadata: args.metadata,
    });

    await ctx.db.insert("activities", {
      projectId: args.projectId,
      actorType: "HUMAN",
      actorId: args.userId,
      action: "OPERATOR_MODE_UPDATED",
      description: `Operator mode set to ${args.mode}${args.reason ? ` (${args.reason})` : ""}`,
      targetType: "OPERATOR_CONTROL",
      targetId: id,
      metadata: {
        mode: args.mode,
        reason: args.reason,
      },
    });

    if (args.mode !== "NORMAL") {
      await ctx.db.insert("alerts", {
        projectId: args.projectId,
        severity: args.mode === "QUARANTINED" ? "CRITICAL" : "WARNING",
        type: "OPERATOR_CONTROL_MODE",
        title: `Operator mode ${args.mode}`,
        description: args.reason || `System switched to ${args.mode}`,
        status: "OPEN",
        metadata: {
          mode: args.mode,
          changedBy: args.userId,
        },
      });
    }

    return {
      success: true,
      control: await ctx.db.get(id),
    };
  },
});
