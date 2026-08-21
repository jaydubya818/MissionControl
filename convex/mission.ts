/**
 * Mission — Convex Functions
 * 
 * Mission statement management and reverse prompting for autonomous task generation.
 */

import { v } from "convex/values";
import { mutation, query, action } from "./_generated/server";
import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { resolveActiveTenantId } from "./lib/getActiveTenant";
import { buildMissionSuggestionIntake } from "./lib/missionPromptScheduling";

// ============================================================================
// QUERIES
// ============================================================================

/**
 * Get the mission statement for the active tenant
 */
export const getMission = query({
  args: {
    tenantId: v.optional(v.id("tenants")),
    projectId: v.optional(v.id("projects")),
  },
  handler: async (ctx, args) => {
    const tenantId = await resolveActiveTenantId(ctx as any, {
      tenantId: args.tenantId,
      projectId: args.projectId,
      createDefaultIfMissing: true,
    });

    if (!tenantId) {
      return { missionStatement: null, tenantId: null };
    }

    const tenant = await ctx.db.get(tenantId);
    if (!tenant) {
      return { missionStatement: null, tenantId };
    }

    return {
      missionStatement: (tenant as any).missionStatement ?? null,
      tenantId,
    };
  },
});

// ============================================================================
// MUTATIONS
// ============================================================================

/**
 * Set the mission statement for the active tenant
 */
export const setMission = mutation({
  args: {
    missionStatement: v.string(),
    tenantId: v.optional(v.id("tenants")),
    projectId: v.optional(v.id("projects")),
  },
  handler: async (ctx, args) => {
    const tenantId = await resolveActiveTenantId(ctx as any, {
      tenantId: args.tenantId,
      projectId: args.projectId,
      createDefaultIfMissing: true,
    });

    if (!tenantId) {
      throw new Error("No active tenant found");
    }

    await ctx.db.patch(tenantId, {
      missionStatement: args.missionStatement,
    });

    // Log activity
    await ctx.db.insert("activities", {
      tenantId,
      projectId: args.projectId,
      actorType: "HUMAN",
      action: "MISSION_STATEMENT_UPDATED",
      description: `Mission statement updated: "${args.missionStatement.substring(0, 100)}${args.missionStatement.length > 100 ? "..." : ""}"`,
      targetType: "TENANT",
      targetId: tenantId,
      metadata: {
        missionStatement: args.missionStatement,
      },
    });

    return { success: true, tenantId };
  },
});

// ============================================================================
// ACTIONS
// ============================================================================

type TaskSuggestion = {
  title: string;
  description: string;
  type: "CONTENT" | "SOCIAL" | "EMAIL_MARKETING" | "CUSTOMER_RESEARCH" | "SEO_RESEARCH" | "ENGINEERING" | "DOCS" | "OPS";
  priority: 1 | 2 | 3 | 4;
  suggestedAssignee?: string;
  reasoning: string;
};

/**
 * Reverse prompt: AI suggests tasks to advance the mission
 */
export const reversePrompt = action({
  args: {
    tenantId: v.optional(v.id("tenants")),
    projectId: v.optional(v.id("projects")),
    autoCreate: v.optional(v.boolean()),
    maxSuggestions: v.optional(v.number()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ suggestions: TaskSuggestion[]; available: boolean; reason?: string }> => {
    // Get mission statement
    const missionData = await ctx.runQuery(api.mission.getMission, {
      tenantId: args.tenantId,
      projectId: args.projectId,
    });

    if (!missionData.missionStatement) {
      throw new Error("No mission statement set. Please set a mission statement first.");
    }

    // Get current context
    const tasks = await ctx.runQuery(api.tasks.listAll, {
      projectId: args.projectId,
    });

    const agents = await ctx.runQuery(api.agents.listAll, {
      projectId: args.projectId,
    });

    const recentActivities = await ctx.runQuery(api.activities.listRecent, {
      projectId: args.projectId,
      limit: 20,
    });

    // Build context for AI
    const activeTasks = tasks.filter((t: any) => 
      t.status === "IN_PROGRESS" || t.status === "READY" || t.status === "ASSIGNED" || t.status === "REVIEW"
    );
    const completedTasks = tasks.filter((t: any) => t.status === "DONE");
    const activeAgents = agents.filter((a: any) => a.status === "ACTIVE");

    const contextSummary = {
      mission: missionData.missionStatement,
      stats: {
        totalTasks: tasks.length,
        activeTasks: activeTasks.length,
        completedTasks: completedTasks.length,
        activeAgents: activeAgents.length,
        totalAgents: agents.length,
      },
      recentTaskTitles: activeTasks.slice(0, 10).map((t: any) => t.title),
      completedTaskTitles: completedTasks.slice(-5).map((t: any) => t.title),
      agentRoles: activeAgents.map((a: any) => ({ name: a.name, role: a.role })),
      recentActivityDescriptions: recentActivities.slice(0, 10).map((a: any) => a.description),
    };

    // Call AI (using OpenAI API as fallback - in production, use your preferred LLM)
    const prompt = `You are a strategic AI assistant helping an autonomous organization achieve its mission.

MISSION STATEMENT:
"${missionData.missionStatement}"

CURRENT STATE:
- Total tasks: ${contextSummary.stats.totalTasks} (${contextSummary.stats.activeTasks} active, ${contextSummary.stats.completedTasks} completed)
- Active agents: ${contextSummary.stats.activeAgents} of ${contextSummary.stats.totalAgents}

ACTIVE TASKS:
${contextSummary.recentTaskTitles.map((t: string, i: number) => `${i + 1}. ${t}`).join('\n')}

RECENTLY COMPLETED:
${contextSummary.completedTaskTitles.map((t: string, i: number) => `${i + 1}. ${t}`).join('\n')}

AVAILABLE AGENTS:
${contextSummary.agentRoles.map((a: any) => `- ${a.name} (${a.role})`).join('\n')}

RECENT ACTIVITY:
${contextSummary.recentActivityDescriptions.slice(0, 5).map((d: string, i: number) => `${i + 1}. ${d}`).join('\n')}

Based on the mission statement and current state, suggest ${args.maxSuggestions ?? 3} concrete, actionable tasks that would move the organization closer to achieving its mission. Focus on:
1. Tasks that aren't already being worked on
2. High-impact activities that align with the mission
3. Tasks that leverage available agents effectively
4. Strategic initiatives, not just maintenance work

For each task, provide:
- title: Clear, actionable title (max 80 chars)
- description: Detailed description with context and expected outcomes (2-3 sentences)
- type: One of: CONTENT, SOCIAL, EMAIL_MARKETING, CUSTOMER_RESEARCH, SEO_RESEARCH, ENGINEERING, DOCS, OPS
- priority: 1 (critical), 2 (high), 3 (normal), or 4 (low)
- suggestedAssignee: Name of an agent from the list above (optional)
- reasoning: Brief explanation of why this task advances the mission (1-2 sentences)

Respond with valid JSON only, no markdown:
{
  "suggestions": [
    {
      "title": "...",
      "description": "...",
      "type": "...",
      "priority": 1,
      "suggestedAssignee": "...",
      "reasoning": "..."
    }
  ]
}`;

    try {
      // No model provider is wired into this path. It previously returned three
      // hardcoded suggestions — identical for every mission, task set, and
      // workspace — after building the prompt above and discarding it, and with
      // `autoCreate: true` (which the `mission_prompt` cron uses) inserted them
      // into `tasks` as real, scheduled, unreviewed work.
      //
      // Fabricated work items in a governed queue are worse than none: an
      // operator cannot tell them from mission-aligned proposals. Return an
      // explicit empty result with a reason instead.
      void prompt;
      return {
        suggestions: [] as TaskSuggestion[],
        available: false as const,
        reason:
          "Mission-aligned task suggestion needs a configured model provider. " +
          "None is wired into this path, so no suggestions were generated.",
      };
    } catch (error) {
      console.error("Error in reversePrompt:", error);
      throw new Error(`Failed to generate mission-aligned task suggestions: ${error}`);
    }
  },
});
