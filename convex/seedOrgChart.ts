/**
 * Seed org chart with sample humans and agents
 * Run: npx convex run seedOrgChart:run
 */

import { mutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

export const run = mutation({
  args: {},
  handler: async (ctx) => {
    // Get or create default project
    let projectId: Id<"projects"> | undefined;
    const existingProject = await ctx.db
      .query("projects")
      .withIndex("by_slug", (q) => q.eq("slug", "mission-control"))
      .first();

    if (existingProject) {
      console.log("Using existing Mission Control project:", existingProject._id);
      projectId = existingProject._id;
    } else {
      projectId = await ctx.db.insert("projects", {
        name: "Mission Control",
        slug: "mission-control",
        description: "Self-hosted orchestration platform for AI agent squads",
      });
      console.log("Created Mission Control project:", projectId);
    }

    // 1. Create CEO (top-level human)
    const ceoId = await ctx.db.insert("orgMembers", {
      projectId,
      name: "Alex Finn",
      role: "Chief Executive Officer",
      avatar: "👤",
      level: 0,
      active: true,
      responsibilities: [
        "Vision & Strategy",
        "Content Creation",
        "Business Development",
        "Final Decisions",
      ],
    });
    console.log("Created CEO:", ceoId);

    // 2. Create CSO (reports to CEO) - This will be an AI agent
    const csoAgentId = await ctx.db.insert("agents", {
      projectId,
      name: "Henry",
      emoji: "🤖",
      role: "LEAD",
      status: "ACTIVE",
      workspacePath: "/agents/henry",
      allowedTaskTypes: ["ENGINEERING", "DOCS", "OPS"],
      budgetDaily: 100,
      budgetPerRun: 5,
      spendToday: 25,
      canSpawn: true,
      maxSubAgents: 5,
      errorStreak: 0,
      lastHeartbeatAt: Date.now(),
      metadata: {
        model: "Claude Opus 4.5",
        description: "Chief Strategy Officer",
        capabilities: [
          "Strategic Planning",
          "Task Orchestration",
          "Complex Reasoning",
          "Writing & Analysis",
        ],
      },
    });
    console.log("Created CSO Agent (Henry):", csoAgentId);

    // 3. Create sub-agents under Henry
    const codexAgentId = await ctx.db.insert("agents", {
      projectId,
      name: "Codex",
      emoji: "💻",
      role: "SPECIALIST",
      status: "ACTIVE",
      workspacePath: "/agents/codex",
      allowedTaskTypes: ["ENGINEERING"],
      budgetDaily: 50,
      budgetPerRun: 2,
      spendToday: 10,
      canSpawn: false,
      maxSubAgents: 0,
      parentAgentId: csoAgentId,
      errorStreak: 0,
      lastHeartbeatAt: Date.now(),
      metadata: {
        model: "GPT-5.2 Codex",
        description: "Lead Software Engineer",
        capabilities: [
          "Full Stack Development",
          "Code Review",
          "Architecture",
          "API (OpenAI)",
        ],
      },
    });
    console.log("Created Codex Agent:", codexAgentId);

    const glmAgentId = await ctx.db.insert("agents", {
      projectId,
      name: "GLM-4.7",
      emoji: "🔬",
      role: "SPECIALIST",
      status: "ACTIVE",
      workspacePath: "/agents/glm",
      allowedTaskTypes: ["CUSTOMER_RESEARCH", "SEO_RESEARCH"],
      budgetDaily: 0, // Local model
      budgetPerRun: 0,
      spendToday: 0,
      canSpawn: false,
      maxSubAgents: 0,
      parentAgentId: csoAgentId,
      errorStreak: 0,
      lastHeartbeatAt: Date.now(),
      metadata: {
        model: "GLM-4.7",
        description: "Senior Research Analyst",
        capabilities: [
          "Deep Research",
          "Code Generation",
          "Document Analysis",
          "Parallel Processing",
        ],
        parameters: "35M Parameters • Local",
        inference: "$0 (local inference)",
      },
    });
    console.log("Created GLM Agent:", glmAgentId);

    const glmFlashAgentId = await ctx.db.insert("agents", {
      projectId,
      name: "GLM-4.7 Flash",
      emoji: "⚡",
      role: "INTERN",
      status: "ACTIVE",
      workspacePath: "/agents/glm-flash",
      allowedTaskTypes: ["CONTENT", "SOCIAL"],
      budgetDaily: 0, // Local model
      budgetPerRun: 0,
      spendToday: 0,
      canSpawn: false,
      maxSubAgents: 0,
      parentAgentId: csoAgentId,
      errorStreak: 0,
      lastHeartbeatAt: Date.now(),
      metadata: {
        model: "GLM-4.7 Flash",
        description: "Research Associate",
        capabilities: [
          "Quick Lookups",
          "Drafting",
          "Brainstorming",
          "High-Volume Tasks",
        ],
        parameters: "3M MoE • Local",
        inference: "$0 (local inference)",
      },
    });
    console.log("Created GLM Flash Agent:", glmFlashAgentId);

    console.log("\n✅ Org chart seeded successfully!");
    console.log("Structure:");
    console.log("  👤 Alex Finn (CEO)");
    console.log("    └─ 🤖 Henry (CSO Agent)");
    console.log("        ├─ 💻 Codex (Lead Engineer)");
    console.log("        ├─ 🔬 GLM-4.7 (Senior Researcher)");
    console.log("        └─ ⚡ GLM-4.7 Flash (Research Associate)");

    return {
      projectId,
      ceoId,
      csoAgentId,
      subAgents: [codexAgentId, glmAgentId, glmFlashAgentId],
    };
  },
});

/**
 * Clear all org members and agents (for testing)
 */
export const clear = mutation({
  args: {},
  handler: async (ctx) => {
    const members = await ctx.db.query("orgMembers").collect();
    for (const member of members) {
      await ctx.db.delete(member._id);
    }

    const agents = await ctx.db.query("agents").collect();
    for (const agent of agents) {
      await ctx.db.delete(agent._id);
    }

    console.log(`Deleted ${members.length} org members and ${agents.length} agents`);
    return { deleted: members.length + agents.length };
  },
});
