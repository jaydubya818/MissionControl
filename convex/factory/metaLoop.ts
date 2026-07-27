/**
 * Meta loop inbox — suggestions from observed failures.
 */

import { v } from "convex/values";
import { mutation, query } from "../_generated/server";

const kindArg = v.union(
  v.literal("VERIFIER"),
  v.literal("SKILL_UPDATE"),
  v.literal("EVAL_SCENARIO"),
  v.literal("MAINTENANCE"),
  v.literal("RULE_RETIRE"),
  v.literal("DELEGATION")
);

export const listInbox = query({
  args: {
    projectId: v.optional(v.id("projects")),
    status: v.optional(v.union(v.literal("OPEN"), v.literal("ACCEPTED"), v.literal("DISMISSED"))),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const status = args.status ?? "OPEN";
    let rows = await ctx.db
      .query("metaLoopSuggestions")
      .withIndex("by_status", (q) => q.eq("status", status))
      .collect();
    if (args.projectId) rows = rows.filter((r) => r.projectId === args.projectId);
    rows.sort((a, b) => b.createdAt - a.createdAt);
    return rows.slice(0, args.limit ?? 40);
  },
});

export const seedDemoSuggestions = mutation({
  args: { projectId: v.optional(v.id("projects")) },
  handler: async (ctx, args) => {
    const now = Date.now();
    const demos = [
      {
        kind: "VERIFIER" as const,
        title: "Logger misuse ×3",
        summary: "Add verifier: structured logging required in convex/",
        sourceRef: "PR-1842",
      },
      {
        kind: "EVAL_SCENARIO" as const,
        title: "Empty list boundary",
        summary: "Extract eval from mutation testing miss on cart service",
        sourceRef: "PR-1901",
      },
      {
        kind: "DELEGATION" as const,
        title: "Weekly version bump",
        summary: "High success rate — automate semver bump workflow",
        sourceRef: "tasks",
      },
      {
        kind: "RULE_RETIRE" as const,
        title: "Stale import rule",
        summary: "Model 4.5 handles imports — re-eval verifier vr-12",
        sourceRef: "model-release",
      },
    ];
    const ids = [];
    for (const d of demos) {
      const id = await ctx.db.insert("metaLoopSuggestions", {
        projectId: args.projectId,
        kind: d.kind,
        title: d.title,
        summary: d.summary,
        status: "OPEN",
        sourceRef: d.sourceRef,
        createdAt: now,
      });
      ids.push(id);
    }
    return ids;
  },
});

export const resolve = mutation({
  args: {
    suggestionId: v.id("metaLoopSuggestions"),
    action: v.union(v.literal("ACCEPT"), v.literal("DISMISS")),
    actorId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.suggestionId);
    if (!row) throw new Error("Suggestion not found");
    const status = args.action === "ACCEPT" ? "ACCEPTED" : "DISMISSED";
    await ctx.db.patch(args.suggestionId, {
      status,
      resolvedAt: Date.now(),
    });
    if (args.action === "ACCEPT" && row.kind === "VERIFIER") {
      const now = Date.now();
      await ctx.db.insert("contextVerifiers", {
        projectId: row.projectId,
        packageId: row.packageId,
        label: row.title,
        invariant: row.summary,
        globPatterns: ["**/*"],
        active: true,
        createdAt: now,
        updatedAt: now,
      });
    }
    if (args.action === "ACCEPT" && row.kind === "EVAL_SCENARIO" && row.packageId) {
      const now = Date.now();
      const lineage = row.sourceRef ? `Auto-created from ${row.sourceRef}` : "Auto-created from meta loop";
      await ctx.db.insert("contextEvalScenarios", {
        packageId: row.packageId,
        name: row.title.slice(0, 80),
        description: `${lineage}. ${row.summary}`,
        taskPrompt: row.summary,
        criteria: [
          { id: "correctness", label: "Correct behavior", weight: 0.5 },
          { id: "regression", label: "No regression vs baseline", weight: 0.5 },
        ],
        active: true,
        projectId: row.projectId,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("activities", {
        projectId: row.projectId,
        actorType: "HUMAN",
        actorId: args.actorId ?? "meta-loop",
        action: "META_LOOP_EVAL_SCENARIO_ACCEPTED",
        description: `${lineage}: ${row.title}`,
        targetType: "metaLoopSuggestion",
        targetId: args.suggestionId,
      });
    }
    return args.suggestionId;
  },
});

export const create = mutation({
  args: {
    projectId: v.optional(v.id("projects")),
    kind: kindArg,
    title: v.string(),
    summary: v.string(),
    sourceRef: v.optional(v.string()),
    packageId: v.optional(v.id("contextPackages")),
  },
  handler: async (ctx, args) => {
    return ctx.db.insert("metaLoopSuggestions", {
      projectId: args.projectId,
      kind: args.kind,
      title: args.title,
      summary: args.summary,
      status: "OPEN",
      sourceRef: args.sourceRef,
      packageId: args.packageId,
      createdAt: Date.now(),
    });
  },
});
