/**
 * Context verifiers — targeted LLM lint rules (outer loop).
 */

import { v } from "convex/values";
import { mutation, query } from "../_generated/server";

export const list = query({
  args: {
    projectId: v.optional(v.id("projects")),
    packageId: v.optional(v.id("contextPackages")),
    activeOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    let rows = await ctx.db.query("contextVerifiers").collect();
    if (args.projectId) rows = rows.filter((r) => r.projectId === args.projectId);
    if (args.packageId) rows = rows.filter((r) => r.packageId === args.packageId);
    if (args.activeOnly) rows = rows.filter((r) => r.active);
    return rows.sort((a, b) => b.updatedAt - a.updatedAt);
  },
});

export const create = mutation({
  args: {
    projectId: v.optional(v.id("projects")),
    packageId: v.optional(v.id("contextPackages")),
    label: v.string(),
    invariant: v.string(),
    globPatterns: v.array(v.string()),
    sourceSkillId: v.optional(v.id("contextPackages")),
    idempotencyKey: v.optional(v.string()),
    actorId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.idempotencyKey) {
      const existing = await ctx.db
        .query("contextVerifiers")
        .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", args.idempotencyKey))
        .first();
      if (existing) return existing._id;
    }
    const now = Date.now();
    const id = await ctx.db.insert("contextVerifiers", {
      projectId: args.projectId,
      packageId: args.packageId,
      label: args.label,
      invariant: args.invariant,
      globPatterns: args.globPatterns,
      active: true,
      sourceSkillId: args.sourceSkillId,
      idempotencyKey: args.idempotencyKey,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("activities", {
      projectId: args.projectId,
      actorType: "HUMAN",
      actorId: args.actorId ?? "operator",
      action: "VERIFIER_CREATED",
      description: `Created verifier: ${args.label}`,
      targetType: "contextVerifier",
      targetId: id,
    });
    return id;
  },
});

export const generateFromSkill = mutation({
  args: {
    packageId: v.id("contextPackages"),
    actorId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const pkg = await ctx.db.get(args.packageId);
    if (!pkg) throw new Error("Package not found");
    const now = Date.now();
    const label = `${pkg.displayName ?? pkg.slug} adherence`;
    const id = await ctx.db.insert("contextVerifiers", {
      projectId: pkg.projectId,
      packageId: args.packageId,
      label,
      invariant: `Changes must adhere to skill ${pkg.slug} conventions and constraints.`,
      globPatterns: ["**/*"],
      active: true,
      sourceSkillId: args.packageId,
      createdAt: now,
      updatedAt: now,
    });
    return id;
  },
});

export const ruleDecayCandidates = query({
  args: { projectId: v.optional(v.id("projects")) },
  handler: async (ctx, args) => {
    let rows = await ctx.db.query("contextVerifiers").collect();
    if (args.projectId) rows = rows.filter((r) => r.projectId === args.projectId);
    const staleDays = 30 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    return rows
      .filter((r) => r.active && (!r.lastRunAt || now - r.lastRunAt > staleDays))
      .map((r) => ({
        id: r._id,
        label: r.label,
        validatedModel: r.validatedModel ?? "unknown",
        lastRunAt: r.lastRunAt,
        passRate: r.passRate,
      }));
  },
});
