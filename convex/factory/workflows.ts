/**
 * Launch / workflow runs — skill → scheduled cloud execution.
 */

import { v } from "convex/values";
import { mutation, query } from "../_generated/server";

const statusArg = v.union(
  v.literal("PENDING"),
  v.literal("RUNNING"),
  v.literal("COMPLETED"),
  v.literal("FAILED"),
  v.literal("CANCELLED")
);

export const list = query({
  args: {
    projectId: v.optional(v.id("projects")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 30;
    let rows = await ctx.db.query("contextWorkflowRuns").collect();
    rows.sort((a, b) => b.createdAt - a.createdAt);
    if (args.projectId) rows = rows.filter((r) => r.projectId === args.projectId);
    return rows.slice(0, limit);
  },
});

export const schedule = mutation({
  args: {
    projectId: v.optional(v.id("projects")),
    packageId: v.optional(v.id("contextPackages")),
    skillName: v.string(),
    agentModel: v.optional(v.string()),
    intelligenceTier: v.optional(v.string()),
    schedule: v.optional(v.string()),
    idempotencyKey: v.optional(v.string()),
    actorId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.idempotencyKey) {
      const existing = await ctx.db
        .query("contextWorkflowRuns")
        .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", args.idempotencyKey))
        .first();
      if (existing) return existing._id;
    }
    const now = Date.now();
    return ctx.db.insert("contextWorkflowRuns", {
      projectId: args.projectId,
      packageId: args.packageId,
      skillName: args.skillName,
      agentModel: args.agentModel ?? "claude-sonnet",
      intelligenceTier: args.intelligenceTier ?? "standard",
      schedule: args.schedule ?? "manual",
      status: "PENDING",
      createdAt: now,
      idempotencyKey: args.idempotencyKey,
    });
  },
});

export const maintenanceCatalog = query({
  args: {},
  handler: async () => [
    { id: "architecture-sweep", label: "Architecture review", cadence: "weekly", description: "Duplication and weak seams" },
    { id: "test-quality", label: "Test quality check", cadence: "daily", description: "Coverage + mutation testing hints" },
    { id: "mutation-full", label: "Full-repo mutation sweep", cadence: "weekly", description: "Boundary condition gaps" },
    { id: "doc-drift", label: "Documentation drift", cadence: "weekly", description: "Skills vs codebase alignment" },
    { id: "flaky-tests", label: "Flaky test hunt", cadence: "daily", description: "Identify unstable tests" },
    { id: "rule-decay", label: "Rule re-evaluation", cadence: "on-model-release", description: "Retire obsolete verifiers" },
  ],
});
