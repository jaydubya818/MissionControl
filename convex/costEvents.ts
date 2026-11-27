import { v } from "convex/values";
import { mutation, query } from "./lib/missionScopedFunctions";

// ============================================================================
// QUERIES
// ============================================================================

export const listByProject = query({
  args: {
    projectId: v.id("projects"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("costEvents")
      .withIndex("by_project", (idx) => idx.eq("projectId", args.projectId))
      .order("desc")
      .take(args.limit ?? 100);
  },
});

export const listByAgent = query({
  args: {
    agentId: v.id("agents"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("costEvents")
      .withIndex("by_agent", (idx) => idx.eq("agentId", args.agentId))
      .order("desc")
      .take(args.limit ?? 100);
  },
});

export const listByTask = query({
  args: {
    taskId: v.id("tasks"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("costEvents")
      .withIndex("by_task", (idx) => idx.eq("taskId", args.taskId))
      .order("desc")
      .take(args.limit ?? 50);
  },
});

export const summaryByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const events = await ctx.db
      .query("costEvents")
      .withIndex("by_project", (idx) => idx.eq("projectId", args.projectId))
      .collect();

    const byAgent = new Map<
      string,
      { agentId: string; totalCents: number; totalInput: number; totalOutput: number; count: number }
    >();
    const byModel = new Map<
      string,
      { model: string; provider: string; totalCents: number; count: number }
    >();
    const byGoal = new Map<
      string,
      { goalId: string; totalCents: number; count: number }
    >();

    let totalCents = 0;
    let totalInput = 0;
    let totalOutput = 0;

    for (const e of events) {
      totalCents += e.costCents;
      totalInput += e.inputTokens;
      totalOutput += e.outputTokens;

      const agentKey = e.agentId;
      const agentEntry = byAgent.get(agentKey) ?? {
        agentId: agentKey,
        totalCents: 0,
        totalInput: 0,
        totalOutput: 0,
        count: 0,
      };
      agentEntry.totalCents += e.costCents;
      agentEntry.totalInput += e.inputTokens;
      agentEntry.totalOutput += e.outputTokens;
      agentEntry.count++;
      byAgent.set(agentKey, agentEntry);

      const modelKey = `${e.provider}:${e.model}`;
      const modelEntry = byModel.get(modelKey) ?? {
        model: e.model,
        provider: e.provider,
        totalCents: 0,
        count: 0,
      };
      modelEntry.totalCents += e.costCents;
      modelEntry.count++;
      byModel.set(modelKey, modelEntry);

      if (e.goalId) {
        const goalEntry = byGoal.get(e.goalId) ?? {
          goalId: e.goalId,
          totalCents: 0,
          count: 0,
        };
        goalEntry.totalCents += e.costCents;
        goalEntry.count++;
        byGoal.set(e.goalId, goalEntry);
      }
    }

    return {
      totalCents,
      totalDollars: totalCents / 100,
      totalInput,
      totalOutput,
      eventCount: events.length,
      byAgent: [...byAgent.values()].sort((a, b) => b.totalCents - a.totalCents),
      byModel: [...byModel.values()].sort((a, b) => b.totalCents - a.totalCents),
      byGoal: [...byGoal.values()].sort((a, b) => b.totalCents - a.totalCents),
    };
  },
});

// ============================================================================
// MUTATIONS
// ============================================================================

export const record = mutation({
  args: {
    projectId: v.optional(v.id("projects")),
    agentId: v.id("agents"),
    taskId: v.optional(v.id("tasks")),
    goalId: v.optional(v.id("goals")),
    runId: v.optional(v.id("runs")),
    provider: v.string(),
    model: v.string(),
    inputTokens: v.number(),
    outputTokens: v.number(),
    cacheReadTokens: v.optional(v.number()),
    cacheWriteTokens: v.optional(v.number()),
    costCents: v.number(),
    billingCode: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    if (args.inputTokens < 0 || args.outputTokens < 0) {
      throw new Error("Token counts must be non-negative");
    }
    if (args.costCents < 0) {
      throw new Error("Cost must be non-negative");
    }

    const agent = await ctx.db.get(args.agentId);
    if (!agent) throw new Error("Agent not found");

    const eventId = await ctx.db.insert("costEvents", {
      tenantId: agent.tenantId,
      projectId: args.projectId ?? agent.projectId,
      agentId: args.agentId,
      taskId: args.taskId,
      goalId: args.goalId,
      runId: args.runId,
      provider: args.provider,
      model: args.model,
      inputTokens: args.inputTokens,
      outputTokens: args.outputTokens,
      cacheReadTokens: args.cacheReadTokens,
      cacheWriteTokens: args.cacheWriteTokens,
      costCents: args.costCents,
      occurredAt: Date.now(),
      billingCode: args.billingCode,
      metadata: args.metadata,
    });

    return eventId;
  },
});
