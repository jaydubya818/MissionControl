/**
 * Agent CRUD. Used by seed and UI.
 */

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const createAgent = mutation({
  args: {
    name: v.string(),
    sessionKey: v.string(),
    autonomyLevel: v.union(
      v.literal("intern"),
      v.literal("specialist"),
      v.literal("lead")
    ),
    modelConfig: v.object({
      primary: v.string(),
      fallback: v.optional(v.string()),
    }),
    toolPermissions: v.optional(v.array(v.string())),
    budgets: v.optional(
      v.object({
        dailyCap: v.number(),
        perRunCap: v.number(),
      })
    ),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("agents", {
      name: args.name,
      sessionKey: args.sessionKey,
      autonomyLevel: args.autonomyLevel,
      status: "active",
      modelConfig: args.modelConfig,
      toolPermissions: args.toolPermissions ?? [],
      budgets: args.budgets ?? { dailyCap: 5, perRunCap: 0.75 },
      currentTaskId: undefined,
      lastHeartbeat: undefined,
      errorStreak: 0,
      totalSpend: 0,
      todaySpend: 0,
      soulHash: undefined,
      metadata: args.metadata ?? {},
    });
  },
});

export const listAgents = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("agents").collect();
  },
});
