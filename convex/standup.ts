/**
 * Daily Standup Report — aggregates tasks, agents, approvals for human review.
 */

import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

/** Generate standup report (query — no side effects). */
export const generate = query({
  args: { 
    projectId: v.optional(v.id("projects")),
    at: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = args.at ?? Date.now();
    
    // Get data scoped by project if provided
    let agents;
    let tasks;
    let pendingApprovals;
    
    if (args.projectId) {
      agents = await ctx.db
        .query("agents")
        .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
        .collect();
      tasks = await ctx.db
        .query("tasks")
        .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
        .collect();
      const [pending, escalated] = await Promise.all([
        ctx.db
          .query("approvals")
          .withIndex("by_project_status", (q) =>
            q.eq("projectId", args.projectId).eq("status", "PENDING")
          )
          .collect(),
        ctx.db
          .query("approvals")
          .withIndex("by_project_status", (q) =>
            q.eq("projectId", args.projectId).eq("status", "ESCALATED")
          )
          .collect(),
      ]);
      pendingApprovals = [...pending, ...escalated];
    } else {
      agents = await ctx.db.query("agents").collect();
      tasks = await ctx.db.query("tasks").collect();
      const [pending, escalated] = await Promise.all([
        ctx.db
          .query("approvals")
          .withIndex("by_status", (q) => q.eq("status", "PENDING"))
          .collect(),
        ctx.db
          .query("approvals")
          .withIndex("by_status", (q) => q.eq("status", "ESCALATED"))
          .collect(),
      ]);
      pendingApprovals = [...pending, ...escalated];
    }

    const byStatus = (status: string) => tasks.filter((t) => t.status === status);
    const activeAgents = agents.filter((a) => a.status === "ACTIVE");
    const pausedAgents = agents.filter((a) => a.status === "PAUSED");
    
    // Calculate burn rate (sum of today's spend across agents)
    const burnRateToday = agents.reduce((sum, a) => sum + a.spendToday, 0);

    const report = {
      projectId: args.projectId,
      generatedAt: now,
      date: new Date(now).toISOString().slice(0, 10),
      agents: {
        total: agents.length,
        active: activeAgents.length,
        paused: pausedAgents.length,
        list: agents.map((a) => ({
          id: a._id,
          name: a.name,
          role: a.role,
          status: a.status,
          spendToday: a.spendToday,
          budgetDaily: a.budgetDaily,
        })),
      },
      tasks: {
        inbox: byStatus("INBOX").length,
        assigned: byStatus("ASSIGNED").length,
        inProgress: byStatus("IN_PROGRESS").length,
        review: byStatus("REVIEW").length,
        needsApproval: byStatus("NEEDS_APPROVAL").length,
        blocked: byStatus("BLOCKED").length,
        done: byStatus("DONE").length,
        canceled: byStatus("CANCELED").length,
        total: tasks.length,
      },
      approvals: {
        pending: pendingApprovals.length,
        items: pendingApprovals.slice(0, 20).map((a) => ({
          id: a._id,
          actionSummary: a.actionSummary,
          riskLevel: a.riskLevel,
          requestorAgentId: a.requestorAgentId,
          expiresAt: a.expiresAt,
        })),
      },
      burnRate: {
        today: burnRateToday,
      },
    };
    return report;
  },
});

/** Store standup report (mutation — for cron to save daily). */
export const save = mutation({
  args: {
    report: v.any(),
    savedAt: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("activities", {
      actorType: "SYSTEM",
      action: "STANDUP_REPORT",
      description: `Daily standup: ${args.report.agents.active} active agents, ${args.report.tasks.total} tasks, ${args.report.approvals.pending} pending approvals`,
      targetType: "REPORT",
      metadata: { report: args.report, savedAt: args.savedAt },
    });
    return { success: true };
  },
});

/** Run daily standup (mutation — for cron). Builds report and saves to activities. */
export const runDaily = mutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const agents = await ctx.db.query("agents").collect();
    const tasks = await ctx.db.query("tasks").collect();
    const [pendingApprovals, escalatedApprovals] = await Promise.all([
      ctx.db
        .query("approvals")
        .withIndex("by_status", (q) => q.eq("status", "PENDING"))
        .collect(),
      ctx.db
        .query("approvals")
        .withIndex("by_status", (q) => q.eq("status", "ESCALATED"))
        .collect(),
    ]);
    const pendingLikeApprovals = [...pendingApprovals, ...escalatedApprovals];
    const byStatus = (status: string) => tasks.filter((t) => t.status === status);
    const activeAgents = agents.filter((a) => a.status === "ACTIVE");
    const report = {
      generatedAt: now,
      date: new Date(now).toISOString().slice(0, 10),
      agents: { total: agents.length, active: activeAgents.length },
      tasks: {
        inbox: byStatus("INBOX").length,
        assigned: byStatus("ASSIGNED").length,
        inProgress: byStatus("IN_PROGRESS").length,
        review: byStatus("REVIEW").length,
        needsApproval: byStatus("NEEDS_APPROVAL").length,
        blocked: byStatus("BLOCKED").length,
        done: byStatus("DONE").length,
        total: tasks.length,
      },
      approvals: { pending: pendingLikeApprovals.length },
    };
    await ctx.db.insert("activities", {
      actorType: "SYSTEM",
      action: "STANDUP_REPORT",
      description: `Daily standup: ${report.agents.active} active agents, ${report.tasks.total} tasks, ${report.approvals.pending} pending approvals`,
      targetType: "REPORT",
      metadata: { report, savedAt: now },
    });
    return { success: true, report };
  },
});
