/**
 * Context verifiers — targeted LLM lint rules (outer loop).
 */

import { v } from "convex/values";
import { mutation, query } from "../lib/missionScopedFunctions";
import { FACTORY_PERMISSIONS, requireWorkspacePermission } from "../lib/companyAccess";

export const list = query({
  args: {
    projectId: v.id("projects"),
    packageId: v.optional(v.id("contextPackages")),
    activeOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    if (args.projectId) {
      await requireWorkspacePermission(ctx, args.projectId, FACTORY_PERMISSIONS.VIEW);
    } else if (args.packageId) {
      const pkg = await ctx.db.get(args.packageId);
      if (!pkg) return [];
      if (pkg.projectId) {
        await requireWorkspacePermission(ctx, pkg.projectId, FACTORY_PERMISSIONS.VIEW);
      }
    } else {
      return [];
    }
    let rows = await ctx.db.query("contextVerifiers").collect();
    rows = rows.filter((r) => r.projectId === args.projectId);
    if (args.packageId) rows = rows.filter((r) => r.packageId === args.packageId);
    if (args.activeOnly) rows = rows.filter((r) => r.active);
    return rows.sort((a, b) => b.updatedAt - a.updatedAt);
  },
});

export const create = mutation({
  args: {
    projectId: v.id("projects"),
    packageId: v.optional(v.id("contextPackages")),
    label: v.string(),
    invariant: v.string(),
    globPatterns: v.array(v.string()),
    sourceSkillId: v.optional(v.id("contextPackages")),
    idempotencyKey: v.optional(v.string()),
    /** @deprecated Browser actor labels are ignored; authority is server-derived. */
    actorId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (!args.projectId) throw new Error("Select a workspace before creating a verifier");
    const access = await requireWorkspacePermission(
      ctx,
      args.projectId,
      FACTORY_PERMISSIONS.IMPROVE
    );
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
      actorId: access.actorId,
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
    projectId: v.id("projects"),
    actorId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const access = await requireWorkspacePermission(
      ctx,
      args.projectId,
      FACTORY_PERMISSIONS.IMPROVE
    );
    const pkg = await ctx.db.get(args.packageId);
    if (!pkg) throw new Error("Package not found");
    if (pkg.projectId && pkg.projectId !== args.projectId) {
      throw new Error("Package is outside the selected workspace");
    }
    const now = Date.now();
    const label = `${pkg.displayName ?? pkg.slug} adherence`;
    const id = await ctx.db.insert("contextVerifiers", {
      projectId: args.projectId,
      packageId: args.packageId,
      label,
      invariant: `Changes must adhere to skill ${pkg.slug} conventions and constraints.`,
      globPatterns: ["**/*"],
      active: true,
      sourceSkillId: args.packageId,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("activities", {
      projectId: args.projectId,
      actorType: "HUMAN",
      actorId: access.actorId,
      action: "VERIFIER_CREATED",
      description: `Created verifier from skill: ${label}`,
      targetType: "contextVerifier",
      targetId: id,
    });
    return id;
  },
});

export const ruleDecayCandidates = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    if (!args.projectId) return [];
    await requireWorkspacePermission(ctx, args.projectId, FACTORY_PERMISSIONS.VIEW);
    let rows = await ctx.db.query("contextVerifiers").collect();
    rows = rows.filter((r) => r.projectId === args.projectId);
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
