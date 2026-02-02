/**
 * Health Check Endpoints
 * 
 * Provides health and readiness checks for monitoring.
 */

import { query } from "./_generated/server";
import { v } from "convex/values";

// ============================================================================
// HEALTH CHECK
// ============================================================================

/**
 * Basic health check - returns OK if database is accessible.
 */
export const check = query({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    
    // Try to query database
    try {
      const projects = await ctx.db.query("projects").take(1);
      
      return {
        status: "healthy",
        timestamp: now,
        database: "connected",
        message: "Mission Control is operational",
      };
    } catch (error) {
      return {
        status: "unhealthy",
        timestamp: now,
        database: "error",
        message: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});

// ============================================================================
// READINESS CHECK
// ============================================================================

/**
 * Readiness check - returns OK if system is ready to serve traffic.
 * Checks:
 * - Database accessible
 * - At least one project exists
 * - At least one agent registered
 */
export const ready = query({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const checks: Record<string, boolean> = {};
    
    try {
      // Check database
      checks.database = true;
      
      // Check projects exist
      const projects = await ctx.db.query("projects").take(1);
      checks.projects = projects.length > 0;
      
      // Check agents exist
      const agents = await ctx.db.query("agents").take(1);
      checks.agents = agents.length > 0;
      
      // Check policy exists
      const policies = await ctx.db.query("policy").take(1);
      checks.policy = policies.length > 0;
      
      const allReady = Object.values(checks).every((v) => v);
      
      return {
        status: allReady ? "ready" : "not_ready",
        timestamp: now,
        checks,
        message: allReady
          ? "System is ready to serve traffic"
          : "System is not fully initialized",
      };
    } catch (error) {
      return {
        status: "error",
        timestamp: now,
        checks,
        message: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});

// ============================================================================
// METRICS
// ============================================================================

/**
 * System metrics for monitoring.
 */
export const metrics = query({
  args: {
    projectId: v.optional(v.id("projects")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    
    // Get counts
    const projectsQuery = ctx.db.query("projects");
    const projects = await projectsQuery.collect();
    
    const agentsQuery = args.projectId
      ? ctx.db.query("agents").filter((q) => q.eq(q.field("projectId"), args.projectId))
      : ctx.db.query("agents");
    const agents = await agentsQuery.collect();
    
    const tasksQuery = args.projectId
      ? ctx.db.query("tasks").withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      : ctx.db.query("tasks");
    const tasks = await tasksQuery.collect();
    
    const runsQuery = args.projectId
      ? ctx.db.query("runs").filter((q) => q.eq(q.field("projectId"), args.projectId))
      : ctx.db.query("runs");
    const runs = await runsQuery.take(1000); // Last 1000 runs
    
    const approvalsQuery = args.projectId
      ? ctx.db.query("approvals").filter((q) => q.eq(q.field("projectId"), args.projectId))
      : ctx.db.query("approvals");
    const approvals = await approvalsQuery.collect();
    
    const alertsQuery = args.projectId
      ? ctx.db.query("alerts").withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      : ctx.db.query("alerts");
    const alerts = await alertsQuery.collect();
    
    // Calculate metrics
    const activeAgents = agents.filter((a) => a.status === "ACTIVE").length;
    const pausedAgents = agents.filter((a) => a.status === "PAUSED").length;
    const quarantinedAgents = agents.filter((a) => a.status === "QUARANTINED").length;
    
    const tasksByStatus = {
      inbox: tasks.filter((t) => t.status === "INBOX").length,
      assigned: tasks.filter((t) => t.status === "ASSIGNED").length,
      inProgress: tasks.filter((t) => t.status === "IN_PROGRESS").length,
      review: tasks.filter((t) => t.status === "REVIEW").length,
      needsApproval: tasks.filter((t) => t.status === "NEEDS_APPROVAL").length,
      blocked: tasks.filter((t) => t.status === "BLOCKED").length,
      done: tasks.filter((t) => t.status === "DONE").length,
      canceled: tasks.filter((t) => t.status === "CANCELED").length,
    };
    
    const totalCost = runs.reduce((sum, r) => sum + r.costUsd, 0);
    const avgCostPerRun = runs.length > 0 ? totalCost / runs.length : 0;
    
    const pendingApprovals = approvals.filter((a) => a.status === "PENDING").length;
    const openAlerts = alerts.filter((a) => a.status === "OPEN").length;
    
    return {
      timestamp: now,
      projects: {
        total: projects.length,
      },
      agents: {
        total: agents.length,
        active: activeAgents,
        paused: pausedAgents,
        quarantined: quarantinedAgents,
        offline: agents.length - activeAgents - pausedAgents - quarantinedAgents,
      },
      tasks: {
        total: tasks.length,
        byStatus: tasksByStatus,
      },
      runs: {
        total: runs.length,
        totalCost,
        avgCostPerRun,
      },
      approvals: {
        total: approvals.length,
        pending: pendingApprovals,
      },
      alerts: {
        total: alerts.length,
        open: openAlerts,
      },
    };
  },
});

// ============================================================================
// STATUS
// ============================================================================

/**
 * Detailed system status.
 */
export const status = query({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    
    // Get recent activity
    const recentActivities = await ctx.db
      .query("activities")
      .order("desc")
      .take(10);
    
    // Get recent alerts
    const recentAlerts = await ctx.db
      .query("alerts")
      .withIndex("by_status", (q) => q.eq("status", "OPEN"))
      .order("desc")
      .take(10);
    
    // Get agent statuses
    const agents = await ctx.db.query("agents").collect();
    const agentStatuses = agents.map((a) => ({
      id: a._id,
      name: a.name,
      status: a.status,
      spendToday: a.spendToday,
      budgetDaily: a.budgetDaily,
      lastHeartbeat: a.lastHeartbeat,
    }));
    
    return {
      timestamp: now,
      uptime: "healthy",
      recentActivities: recentActivities.map((a) => ({
        action: a.action,
        actorType: a.actorType,
        timestamp: a._creationTime,
      })),
      recentAlerts: recentAlerts.map((a) => ({
        severity: a.severity,
        message: a.message,
        timestamp: a._creationTime,
      })),
      agents: agentStatuses,
    };
  },
});
