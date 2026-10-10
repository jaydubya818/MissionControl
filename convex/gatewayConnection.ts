/**
 * Gateway connection settings (OpenClaw Studio parity).
 * Stores only the Gateway URL; token is supplied via server env (GATEWAY_TOKEN).
 */

import { v } from "convex/values";
import { mutation, query } from "./lib/missionScopedFunctions";

const GATEWAY_CONNECTION_ID = "default" as const;

export const get = query({
  args: {},
  handler: async (ctx) => {
    const row = await ctx.db
      .query("gatewayConnection")
      .withIndex("by_updatedAt")
      .order("desc")
      .first();
    if (!row) return null;
    return { url: row.url, updatedAt: row.updatedAt };
  },
});

export const setUrl = mutation({
  args: { url: v.string(), updatedBy: v.optional(v.string()) },
  handler: async (ctx, { url, updatedBy }) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("gatewayConnection")
      .withIndex("by_updatedAt")
      .order("desc")
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        url: url.trim(),
        updatedAt: now,
        ...(updatedBy !== undefined && { updatedBy }),
      });
      return existing._id;
    }
    return await ctx.db.insert("gatewayConnection", {
      url: url.trim(),
      updatedAt: now,
      ...(updatedBy !== undefined && { updatedBy }),
    });
  },
});
