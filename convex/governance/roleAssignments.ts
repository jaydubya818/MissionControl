import { mutation, query } from "../_generated/server";
import { v } from "convex/values";

export const assignRole = mutation({
  args: {
    operatorId: v.id("operators"),
    roleId: v.id("roles"),
    scope: v.optional(
      v.object({
        type: v.union(v.literal("tenant"), v.literal("project"), v.literal("environment")),
        id: v.string(),
      })
    ),
    assignedBy: v.optional(v.id("operators")),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("roleAssignments")
      .withIndex("by_operator_role", (q) => q.eq("operatorId", args.operatorId).eq("roleId", args.roleId))
      .first();
    if (existing) return existing;

    const id = await ctx.db.insert("roleAssignments", {
      ...args,
      assignedAt: Date.now(),
    });

    return await ctx.db.get(id);
  },
});

export const listAssignments = query({
  args: {
    operatorId: v.optional(v.id("operators")),
    roleId: v.optional(v.id("roles")),
  },
  handler: async (ctx, args) => {
    const operatorId = args.operatorId;
    const roleId = args.roleId;
    if (operatorId) {
      return await ctx.db
        .query("roleAssignments")
        .withIndex("by_operator", (q) => q.eq("operatorId", operatorId))
        .collect();
    }
    if (roleId) {
      return await ctx.db
        .query("roleAssignments")
        .withIndex("by_role", (q) => q.eq("roleId", roleId))
        .collect();
    }

    return await ctx.db.query("roleAssignments").collect();
  },
});
