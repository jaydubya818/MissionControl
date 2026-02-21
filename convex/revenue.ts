/**
 * Revenue Events — Stripe / external revenue tracking
 */

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// ============================================================================
// QUERIES
// ============================================================================

export const list = query({
  args: {
    projectId: v.optional(v.id("projects")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    if (args.projectId) {
      return await ctx.db
        .query("revenueEvents")
        .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
        .order("desc")
        .take(limit);
    }
    return await ctx.db.query("revenueEvents").order("desc").take(limit);
  },
});

export const summary = query({
  args: {
    projectId: v.optional(v.id("projects")),
  },
  handler: async (ctx, args) => {
    let events;
    if (args.projectId) {
      events = await ctx.db
        .query("revenueEvents")
        .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
        .collect();
    } else {
      events = await ctx.db.query("revenueEvents").collect();
    }

    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

    const totalRevenue = events
      .filter((e) => e.eventType !== "REFUND")
      .reduce((sum, e) => sum + e.amount, 0);

    const totalRefunds = events
      .filter((e) => e.eventType === "REFUND")
      .reduce((sum, e) => sum + e.amount, 0);

    const last30Days = events
      .filter((e) => e.timestamp >= thirtyDaysAgo && e.eventType !== "REFUND")
      .reduce((sum, e) => sum + e.amount, 0);

    const recentEvents = events
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 5);

    return {
      totalRevenue,
      totalRefunds,
      netRevenue: totalRevenue - totalRefunds,
      last30Days,
      eventCount: events.length,
      recentEvents,
    };
  },
});

// ============================================================================
// MUTATIONS
// ============================================================================

export const record = mutation({
  args: {
    projectId: v.optional(v.id("projects")),
    source: v.union(
      v.literal("STRIPE"),
      v.literal("MANUAL"),
      v.literal("OTHER")
    ),
    eventType: v.union(
      v.literal("CHARGE"),
      v.literal("SUBSCRIPTION"),
      v.literal("REFUND"),
      v.literal("PAYOUT"),
      v.literal("OTHER")
    ),
    amount: v.number(),
    currency: v.string(),
    description: v.optional(v.string()),
    customerId: v.optional(v.string()),
    customerEmail: v.optional(v.string()),
    externalId: v.optional(v.string()),
    externalRef: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    if (args.externalId) {
      const existing = await ctx.db
        .query("revenueEvents")
        .withIndex("by_external_id", (q) => q.eq("externalId", args.externalId))
        .first();
      if (existing) return existing._id;
    }

    const id = await ctx.db.insert("revenueEvents", {
      projectId: args.projectId,
      source: args.source,
      eventType: args.eventType,
      amount: args.amount,
      currency: args.currency,
      description: args.description,
      customerId: args.customerId,
      customerEmail: args.customerEmail,
      externalId: args.externalId,
      externalRef: args.externalRef,
      timestamp: Date.now(),
      metadata: args.metadata,
    });

    return id;
  },
});
