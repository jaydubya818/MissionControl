/**
 * One-time seed: 10 agents + 5 sample tasks with different statuses.
 * Run: npx convex run seed:run
 */

import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const run = mutation({
  args: {},
  handler: async (ctx) => {
    const existingAgents = await ctx.db.query("agents").collect();
    if (existingAgents.length > 0) {
      return { message: "Seed already run (agents exist)", agents: existingAgents.length };
    }

    const agentIds: string[] = [];
    const names = [
      "ResearchBot-01",
      "ResearchBot-02",
      "ContentBot-01",
      "ContentBot-02",
      "EngBot-01",
      "EngBot-02",
      "OpsBot-01",
      "DocsBot-01",
      "Specialist-01",
      "Lead-01",
    ];
    const levels = ["intern", "intern", "specialist", "specialist", "specialist", "specialist", "specialist", "specialist", "specialist", "lead"] as const;

    for (let i = 0; i < 10; i++) {
      const id = await ctx.db.insert("agents", {
        name: names[i],
        sessionKey: `session-${i + 1}`,
        autonomyLevel: levels[i],
        status: "active",
        modelConfig: { primary: "gpt-4" },
        toolPermissions: ["read_db", "post_comment", "read_file"],
        budgets: { dailyCap: 5, perRunCap: 0.75 },
        errorStreak: 0,
        totalSpend: 0,
        todaySpend: 0,
        metadata: {},
      });
      agentIds.push(id);
    }

    const a0 = agentIds[0];
    const a1 = agentIds[1];
    const a2 = agentIds[2];

    await ctx.db.insert("tasks", {
      title: "Draft blog post on TypeScript",
      description: "Write a 800-word post about TypeScript best practices.",
      type: "content",
      status: "inbox",
      priority: "high",
      assigneeIds: [],
      reviewerIds: [],
      subscriberIds: [],
      dependsOn: [],
      budget: 6,
      spend: 0,
      metadata: {},
    });

    await ctx.db.insert("tasks", {
      title: "SEO research for product page",
      description: "Keyword and competitor research for /product.",
      type: "seo_research",
      status: "assigned",
      priority: "medium",
      assigneeIds: [a0],
      reviewerIds: [a2],
      subscriberIds: [],
      dependsOn: [],
      budget: 4,
      spend: 0,
      workPlan: "1. Run keyword tool 2. Compile report",
      metadata: {},
    });

    await ctx.db.insert("tasks", {
      title: "Fix login timeout bug",
      description: "Users see timeout after 30s on login.",
      type: "engineering",
      status: "in_progress",
      priority: "high",
      assigneeIds: [a1],
      reviewerIds: [a2],
      subscriberIds: [],
      dependsOn: [],
      budget: 8,
      spend: 1.2,
      workPlan: "Check auth service timeout config.",
      metadata: {},
    });

    await ctx.db.insert("tasks", {
      title: "Social post approval needed",
      description: "Tweet draft for product launch.",
      type: "social",
      status: "needs_approval",
      priority: "high",
      assigneeIds: [a2],
      reviewerIds: [],
      subscriberIds: [],
      dependsOn: [],
      budget: 2,
      spend: 0.5,
      metadata: {},
    });

    await ctx.db.insert("tasks", {
      title: "Blocked: API rate limit",
      description: "Integration hit rate limit; waiting on vendor.",
      type: "ops",
      status: "blocked",
      priority: "medium",
      assigneeIds: [a1],
      reviewerIds: [],
      subscriberIds: [],
      dependsOn: [],
      budget: 3,
      spend: 0,
      blockedReason: "Vendor API rate limit",
      metadata: {},
    });

    return { message: "Seed complete", agents: 10, tasks: 5 };
  },
});
