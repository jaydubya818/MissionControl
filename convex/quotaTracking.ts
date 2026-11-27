import { v } from "convex/values";
import { mutation, query } from "./lib/missionScopedFunctions";

export const upsertQuotaSnapshot = mutation({
  args: {
    provider: v.union(v.literal("anthropic"), v.literal("openai"), v.literal("google")),
    planTier: v.string(),
    usagePct: v.number(),
    resetAt: v.number(),
    tokensUsed: v.number(),
    tokensLimit: v.number(),
  },
  handler: async (ctx, args) => {
    const recordedAt = Date.now();
    await ctx.db.insert("quotaSnapshots", {
      provider: args.provider,
      planTier: args.planTier,
      usagePct: args.usagePct,
      resetAt: args.resetAt,
      tokensUsed: args.tokensUsed,
      tokensLimit: args.tokensLimit,
      recordedAt,
    });
    return { recordedAt };
  },
});

export const getLatestSnapshot = query({
  args: {
    provider: v.optional(v.union(v.literal("anthropic"), v.literal("openai"), v.literal("google"))),
  },
  handler: async (ctx, args) => {
    const all = await ctx.db
      .query("quotaSnapshots")
      .withIndex("by_recorded_at", (q) => q.gte("recordedAt", 0))
      .order("desc")
      .take(100);
    const filtered = args.provider ? all.filter((r) => r.provider === args.provider) : all;
    if (filtered.length === 0) return null;
    return filtered[0];
  },
});

/** Projected burn rate: linear regression over last 24h of snapshots, returns % per day and projected % at reset. */
export const getProjectedBurnRate = query({
  args: {
    provider: v.optional(v.union(v.literal("anthropic"), v.literal("openai"), v.literal("google"))),
    windowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const windowMs = args.windowMs ?? 24 * 60 * 60 * 1000;
    const cutoff = Date.now() - windowMs;
    let rows = await ctx.db
      .query("quotaSnapshots")
      .withIndex("by_recorded_at", (q) => q.gte("recordedAt", cutoff))
      .order("desc")
      .take(100);
    if (args.provider) rows = rows.filter((r) => r.provider === args.provider);
    if (rows.length < 2) return null;
    const points = rows.map((r) => ({ t: r.recordedAt, y: r.usagePct }));
    const n = points.length;
    const sumT = points.reduce((a, p) => a + p.t, 0);
    const sumY = points.reduce((a, p) => a + p.y, 0);
    const sumTT = points.reduce((a, p) => a + p.t * p.t, 0);
    const sumTY = points.reduce((a, p) => a + p.t * p.y, 0);
    const slope = (n * sumTY - sumT * sumY) / (n * sumTT - sumT * sumT);
    if (!Number.isFinite(slope)) return null;
    const msPerDay = 86400 * 1000;
    const pctPerDay = slope * msPerDay;
    const latest = points[0];
    const resetAt = rows[0]?.resetAt ?? Date.now() + msPerDay;
    const msToReset = resetAt - Date.now();
    const projectedAtReset = latest.y + slope * msToReset;
    return {
      pctPerDay,
      projectedAtReset: Math.max(0, Math.min(100, projectedAtReset)),
      sampleCount: n,
      latestUsagePct: latest.y,
      resetAt,
    };
  },
});
