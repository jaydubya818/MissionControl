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
  handler: async (ctx, args): Promise<{ suggestions: TaskSuggestion[] }> => {
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
      t.status === "IN_PROGRESS" || t.status === "ASSIGNED" || t.status === "REVIEW"
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
      // For now, return mock suggestions. In production, call OpenAI/Anthropic API here
      // Example: const response = await fetch("https://api.openai.com/v1/chat/completions", {...})
      
      const mockSuggestions: TaskSuggestion[] = [
        {
          title: "Analyze mission progress metrics and identify bottlenecks",
          description: "Review the current task completion rate, agent utilization, and mission alignment scores. Identify 3-5 specific bottlenecks preventing faster progress toward the mission. Create a report with actionable recommendations for optimization.",
          type: "OPS",
          priority: 2,
          suggestedAssignee: activeAgents[0]?.name,
          reasoning: "Understanding current performance is critical to accelerating mission progress. This meta-analysis will reveal systemic improvements.",
        },
        {
          title: "Develop automated mission alignment scoring system",
          description: "Create a system that automatically scores each completed task on how well it advances the mission statement. Use this to guide future task prioritization and agent assignments. Include a dashboard visualization.",
          type: "ENGINEERING",
          priority: 2,
          suggestedAssignee: activeAgents.find((a: any) => a.role === "SPECIALIST")?.name,
          reasoning: "Automated scoring ensures every task contributes meaningfully to the mission, preventing drift and busywork.",
        },
        {
          title: "Research and document best practices for autonomous organizations",
          description: "Survey existing autonomous AI organizations, multi-agent systems, and DAO governance models. Document 10-15 best practices that could be applied to improve our mission execution. Focus on coordination, decision-making, and value creation patterns.",
          type: "DOCS",
          priority: 3,
          suggestedAssignee: activeAgents.find((a: any) => a.role === "INTERN")?.name,
          reasoning: "Learning from other autonomous systems will accelerate our evolution and help us avoid common pitfalls.",
        },
      ];

      // If autoCreate is true, create the tasks
      if (args.autoCreate) {
        for (const suggestion of mockSuggestions) {
          // Find the suggested agent
          const agent = suggestion.suggestedAssignee 
            ? agents.find((a: any) => a.name === suggestion.suggestedAssignee)
            : null;

          await ctx.runMutation(api.tasks.create, {
            projectId: args.projectId,
            title: suggestion.title,
            description: `${suggestion.description}\n\n**Mission Alignment:** ${suggestion.reasoning}`,
            type: suggestion.type,
            priority: suggestion.priority,
            source: "MISSION_PROMPT",
            assigneeIds: agent ? [agent._id] : undefined,
          });
        }

        // Note: Activity logging would go here, but activities.ts has no create mutation
      }

      return { suggestions: mockSuggestions };
    } catch (error) {
      console.error("Error in reversePrompt:", error);
      throw new Error(`Failed to generate mission-aligned task suggestions: ${error}`);
    }
  },
});
