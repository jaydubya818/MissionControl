/**
 * Squad Deployment — One-click agent provisioning from predefined personas
 */

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

interface PersonaDef {
  name: string;
  emoji: string;
  role: "INTERN" | "SPECIALIST" | "LEAD" | "CEO";
  allowedTaskTypes: string[];
  budgetDaily: number;
  budgetPerRun: number;
}

const SQUAD_PERSONAS: PersonaDef[] = [
  { name: "Coordinator", emoji: "🧠", role: "CEO", allowedTaskTypes: ["OPS", "ENGINEERING", "CONTENT", "SOCIAL", "CUSTOMER_RESEARCH"], budgetDaily: 15.0, budgetPerRun: 2.0 },
  { name: "Coder", emoji: "💻", role: "SPECIALIST", allowedTaskTypes: ["ENGINEERING"], budgetDaily: 5.0, budgetPerRun: 0.75 },
  { name: "Research", emoji: "🔬", role: "SPECIALIST", allowedTaskTypes: ["CUSTOMER_RESEARCH", "SEO_RESEARCH"], budgetDaily: 5.0, budgetPerRun: 0.75 },
  { name: "Designer", emoji: "🎨", role: "SPECIALIST", allowedTaskTypes: ["CONTENT", "DOCS"], budgetDaily: 5.0, budgetPerRun: 0.75 },
  { name: "Storyteller", emoji: "📝", role: "SPECIALIST", allowedTaskTypes: ["CONTENT", "SOCIAL"], budgetDaily: 5.0, budgetPerRun: 0.75 },
  { name: "QA", emoji: "🧪", role: "SPECIALIST", allowedTaskTypes: ["ENGINEERING"], budgetDaily: 5.0, budgetPerRun: 0.75 },
  { name: "Operations", emoji: "⚙️", role: "LEAD", allowedTaskTypes: ["OPS", "ENGINEERING"], budgetDaily: 12.0, budgetPerRun: 1.5 },
  { name: "Strategist", emoji: "📊", role: "LEAD", allowedTaskTypes: ["CUSTOMER_RESEARCH", "SEO_RESEARCH", "OPS"], budgetDaily: 12.0, budgetPerRun: 1.5 },
  { name: "Finance", emoji: "💰", role: "SPECIALIST", allowedTaskTypes: ["OPS"], budgetDaily: 5.0, budgetPerRun: 0.75 },
  { name: "Compliance", emoji: "🛡️", role: "SPECIALIST", allowedTaskTypes: ["OPS", "DOCS"], budgetDaily: 5.0, budgetPerRun: 0.75 },
  { name: "Learner", emoji: "📚", role: "INTERN", allowedTaskTypes: ["CUSTOMER_RESEARCH", "SEO_RESEARCH", "DOCS"], budgetDaily: 2.0, budgetPerRun: 0.25 },
  { name: "BJ", emoji: "🤖", role: "SPECIALIST", allowedTaskTypes: ["ENGINEERING", "CONTENT", "OPS"], budgetDaily: 5.0, budgetPerRun: 0.75 },
  { name: "Sofie", emoji: "✨", role: "SPECIALIST", allowedTaskTypes: ["CONTENT", "SOCIAL", "EMAIL_MARKETING"], budgetDaily: 5.0, budgetPerRun: 0.75 },
];

export const getPersonas = query({
  args: {},
  handler: async () => {
    return SQUAD_PERSONAS;
  },
});

export const deploySquad = mutation({
  args: {
    projectId: v.optional(v.id("projects")),
  },
  handler: async (ctx, args) => {
    const project = args.projectId ? await ctx.db.get(args.projectId) : null;
    const deployed: string[] = [];
    const skipped: string[] = [];

    for (const persona of SQUAD_PERSONAS) {
      const existing = await ctx.db
        .query("agents")
        .withIndex("by_name", (q) => q.eq("name", persona.name))
        .first();

      if (existing) {
        // Reactivate if offline/quarantined
        if (existing.status === "QUARANTINED" || existing.status === "OFFLINE") {
          await ctx.db.patch(existing._id, {
            status: "ACTIVE",
            lastHeartbeatAt: Date.now(),
            errorStreak: 0,
          });
          deployed.push(persona.name);
        } else {
          skipped.push(persona.name);
        }
        continue;
      }

      const agentId = await ctx.db.insert("agents", {
        tenantId: project?.tenantId,
        projectId: args.projectId,
        name: persona.name,
        emoji: persona.emoji,
        role: persona.role,
        status: "ACTIVE",
        workspacePath: `/agents/${persona.name.toLowerCase()}`,
        allowedTaskTypes: persona.allowedTaskTypes,
        budgetDaily: persona.budgetDaily,
        budgetPerRun: persona.budgetPerRun,
        spendToday: 0,
        canSpawn: persona.role === "CEO" || persona.role === "LEAD",
        maxSubAgents: persona.role === "CEO" ? 5 : persona.role === "LEAD" ? 2 : 0,
        errorStreak: 0,
        lastHeartbeatAt: Date.now(),
      });

      await ctx.db.insert("activities", {
        projectId: args.projectId,
        actorType: "SYSTEM",
        action: "AGENT_DEPLOYED",
        description: `Agent "${persona.name}" ${persona.emoji} deployed via Squad Deploy`,
        targetType: "AGENT",
        targetId: agentId,
        agentId,
      });

      deployed.push(persona.name);
    }

    await ctx.db.insert("activities", {
      projectId: args.projectId,
      actorType: "HUMAN",
      actorId: "operator",
      action: "SQUAD_DEPLOYED",
      description: `Squad deployed: ${deployed.length} agents activated, ${skipped.length} already running`,
    });

    return { deployed, skipped, total: SQUAD_PERSONAS.length };
  },
});
