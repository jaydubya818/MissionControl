/**
 * Change Risk Verifier — org policy for human vs agent-only merge.
 */

import { v } from "convex/values";
import { mutation, query } from "../lib/missionScopedFunctions";
import { FACTORY_PERMISSIONS, requireWorkspacePermission } from "../lib/companyAccess";

const ruleArg = v.object({
  id: v.string(),
  label: v.string(),
  requireHuman: v.boolean(),
  globPatterns: v.optional(v.array(v.string())),
});

export const getActivePolicy = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    if (!args.projectId) return null;
    await requireWorkspacePermission(ctx, args.projectId, FACTORY_PERMISSIONS.VIEW);
    let policies = await ctx.db
      .query("changeRiskPolicies")
      .withIndex("by_active", (q) => q.eq("active", true))
      .collect();
    return policies.find((policy) => policy.projectId === args.projectId) ?? null;
  },
});

export const upsertPolicy = mutation({
  args: {
    projectId: v.id("projects"),
    name: v.string(),
    strictness: v.number(),
    rules: v.array(ruleArg),
    /** @deprecated Browser actor labels are ignored; authority is server-derived. */
    actorId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (!args.projectId) throw new Error("Select a workspace before changing risk policy");
    const access = await requireWorkspacePermission(
      ctx,
      args.projectId,
      FACTORY_PERMISSIONS.APPROVE
    );
    const existing = await ctx.db
      .query("changeRiskPolicies")
      .withIndex("by_active", (q) => q.eq("active", true))
      .collect();
    for (const p of existing) {
      if (p.projectId === args.projectId) {
        await ctx.db.patch(p._id, { active: false, updatedAt: Date.now() });
      }
    }
    const now = Date.now();
    const policyId = await ctx.db.insert("changeRiskPolicies", {
      projectId: args.projectId,
      name: args.name,
      strictness: Math.max(0, Math.min(100, args.strictness)),
      rules: args.rules,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("activities", {
      projectId: args.projectId,
      actorType: "HUMAN",
      actorId: access.actorId,
      action: "CHANGE_RISK_POLICY_UPDATED",
      description: `Updated change risk policy: ${args.name}`,
      targetType: "CHANGE_RISK_POLICY",
      targetId: policyId,
      metadata: { strictness: Math.max(0, Math.min(100, args.strictness)) },
    });
    return policyId;
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
