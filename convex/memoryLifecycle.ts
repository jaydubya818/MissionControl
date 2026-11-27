import { v } from "convex/values";
import { internalMutation, query } from "./lib/missionScopedFunctions";

const status = v.union(v.literal("COMPLETED"), v.literal("FAILED"));

export const recordRunEvidence = internalMutation({
  args: { runId: v.id("runs"), status, summary: v.string(), durationMs: v.number(), costUsd: v.number(), inputTokens: v.number(), outputTokens: v.number(), error: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) return;
    const episode = await ctx.db.query("memoryEpisodes").withIndex("by_run", (q) => q.eq("runId", args.runId)).first();
    if (!episode) await ctx.db.insert("memoryEpisodes", { projectId: run.projectId, runId: run._id, agentId: run.agentId, taskId: run.taskId, status: args.status, summary: args.summary, source: "run-completion", createdAt: Date.now() });
    const trace = await ctx.db.query("executionTraces").withIndex("by_run", (q) => q.eq("runId", args.runId)).first();
    if (!trace) await ctx.db.insert("executionTraces", { projectId: run.projectId, runId: run._id, status: args.status, model: run.model, durationMs: args.durationMs, costUsd: args.costUsd, inputTokens: args.inputTokens, outputTokens: args.outputTokens, error: args.error, createdAt: Date.now() });
  },
});

export const consolidateEpisodes = internalMutation({
  args: {},
  handler: async (ctx) => {
    const pending = (await ctx.db.query("memoryEpisodes").collect()).filter((episode) => episode.status === "COMPLETED" && !episode.consolidatedAt);
    const projectId = pending[0]?.projectId;
    const batch = pending.filter((episode) => episode.projectId === projectId).slice(0, 6);
    if (batch.length < 6) return { consolidated: false, pending: batch.length };
    const now = Date.now();
    const nodeId = await ctx.db.insert("knowledgeGraphNodes", { projectId, source: "mission-control", externalId: `memory-consolidation:${now}`, label: `Run consolidation · ${batch.length} episodes`, fileType: "memory-consolidation", metadata: { episodeIds: batch.map((episode) => episode._id), summaries: batch.map((episode) => episode.summary) }, importedAt: now });
    for (const episode of batch) await ctx.db.patch(episode._id, { consolidatedAt: now });
    await ctx.db.insert("memoryConsolidations", { projectId, episodeIds: batch.map((episode) => episode._id), knowledgeNodeId: nodeId, createdAt: now });
    return { consolidated: true, episodeCount: batch.length, nodeId };
  },
});

export const overview = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const episodes = await ctx.db.query("memoryEpisodes").withIndex("by_project_consolidated", (q) => q.eq("projectId", args.projectId)).collect();
    const traces = await ctx.db.query("executionTraces").withIndex("by_project", (q) => q.eq("projectId", args.projectId)).collect();
    return { episodes: episodes.length, pendingConsolidation: episodes.filter((episode) => !episode.consolidatedAt).length, traces: traces.length };
  },
});
