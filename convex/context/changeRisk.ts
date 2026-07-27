/**
 * Change Risk Verifier — org policy for human vs agent-only merge.
 */

import { v } from "convex/values";
import { mutation, query } from "../_generated/server";

const ruleArg = v.object({
  id: v.string(),
  label: v.string(),
  requireHuman: v.boolean(),
  globPatterns: v.optional(v.array(v.string())),
});

export const getActivePolicy = query({
  args: { projectId: v.optional(v.id("projects")) },
  handler: async (ctx, args) => {
    let policies = await ctx.db
      .query("changeRiskPolicies")
      .withIndex("by_active", (q) => q.eq("active", true))
      .collect();
    if (args.projectId) {
      const scoped = policies.filter((p) => p.projectId === args.projectId);
      if (scoped.length > 0) policies = scoped;
    }
    return policies[0] ?? null;
  },
});

export const upsertPolicy = mutation({
  args: {
    projectId: v.optional(v.id("projects")),
    name: v.string(),
    strictness: v.number(),
    rules: v.array(ruleArg),
    actorId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("changeRiskPolicies")
      .withIndex("by_active", (q) => q.eq("active", true))
      .collect();
    for (const p of existing) {
      if (p.projectId === args.projectId || (!p.projectId && !args.projectId)) {
        await ctx.db.patch(p._id, { active: false, updatedAt: Date.now() });
      }
    }
    const now = Date.now();
    return ctx.db.insert("changeRiskPolicies", {
      projectId: args.projectId,
      name: args.name,
      strictness: Math.max(0, Math.min(100, args.strictness)),
      rules: args.rules,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const defaultRules = query({
  args: {},
  handler: async () => [
    { id: "security", label: "Security-sensitive paths", requireHuman: true, globPatterns: ["**/auth/**", "**/convex/**"] },
    { id: "schema", label: "Schema migrations", requireHuman: true, globPatterns: ["**/schema.ts", "**/migrations/**"] },
    { id: "docs", label: "Documentation only", requireHuman: false, globPatterns: ["**/*.md", "**/docs/**"] },
    { id: "tests", label: "Test-only changes", requireHuman: false, globPatterns: ["**/*.test.*", "**/__tests__/**"] },
  ],
});
