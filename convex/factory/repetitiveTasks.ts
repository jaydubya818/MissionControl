/** Governed repetitive-work detection from Work Orders and verification receipts. */

import { v } from "convex/values";
import { internalMutation, mutation, query } from "../lib/missionScopedFunctions";
import type { Id } from "../_generated/dataModel";
import { loadRepetitiveTaskCandidates } from "../lib/repetitiveTaskCandidates";

async function createProposals(ctx: { db: any }, projectId?: Id<"projects">) {
  const candidates = await loadRepetitiveTaskCandidates(ctx, projectId);
  const existing = await ctx.db.query("metaLoopSuggestions").collect();
  const existingRefs = new Set(existing.map((suggestion: any) => suggestion.sourceRef).filter(Boolean));
  const createdIds = [];

  for (const candidate of candidates) {
    if (candidate.receiptCount === 0) continue;
    const sourceRef = `repetitive-task:${projectId ?? "global"}:${candidate.id}`;
    if (existingRefs.has(sourceRef)) continue;
    const id = await ctx.db.insert("metaLoopSuggestions", {
      projectId: projectId as any,
      kind: "DELEGATION",
      title: `Automation proposal: ${candidate.pattern}`,
      summary: `${candidate.occurrences} governed Work Orders; ${candidate.completedCount} completed; ${candidate.receiptCount} have verification receipts. Review and approve a bounded automation scope.`,
      status: "OPEN",
      sourceRef,
      payload: {
        type: "REPETITIVE_TASK_AUTOMATION",
        candidateId: candidate.id,
        pattern: candidate.pattern,
        workflowId: candidate.workflowId,
        repository: candidate.repository,
        supportingWorkOrderIds: candidate.supportingWorkOrderIds,
        occurrences: candidate.occurrences,
        receiptCount: candidate.receiptCount,
        suggestedCadence: candidate.suggestedCadence,
        recommendedSchedule: candidate.suggestedCadence,
        confidence: candidate.confidence,
        riskLevel: candidate.riskLevel,
        estimatedHumanMinutesSaved: candidate.estimatedHumanMinutesSaved,
        recommendedAutonomyLevel: candidate.recommendedAutonomyLevel,
      },
      createdAt: Date.now(),
    });
    createdIds.push(id);
  }

  return { created: createdIds.length, candidates: candidates.length, proposalIds: createdIds };
}

export const listCandidates = query({
  args: {
    projectId: v.optional(v.id("projects")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return (await loadRepetitiveTaskCandidates(ctx, args.projectId)).slice(0, args.limit ?? 8);
  },
});

/** Explicit operator action: collect evidence and create reviewable proposals. */
export const createProposalsNow = mutation({
  args: { projectId: v.optional(v.id("projects")) },
  handler: async (ctx, args) => createProposals(ctx, args.projectId),
});

/** Hourly cron target. Only workspaces with a non-manual detector schedule are scanned. */
export const scanScheduled = internalMutation({
  args: {},
  handler: async (ctx) => {
    const schedules = await ctx.db.query("contextWorkflowRuns").collect();
    const projectIds = new Set(
      schedules
        .filter((run: any) => run.skillName === "repetitive-task-scan" && run.schedule && run.schedule !== "manual")
        .map((run: any) => run.projectId)
        .filter(Boolean)
    );
    const results = [];
    for (const projectId of projectIds) results.push(await createProposals(ctx, projectId));
    return { scannedProjects: projectIds.size, proposalsCreated: results.reduce((sum, result) => sum + result.created, 0) };
  },
});
