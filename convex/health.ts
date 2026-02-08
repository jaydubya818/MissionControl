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
      await ctx.db.query("projects").take(1);
      
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
      const policies = await ctx.db.query("policies").take(1);
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
    
    const pendingApprovals = approvals.filter((a) => a.status === "PENDING" || a.status === "ESCALATED").length;
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
    
    // Perform health checks
    const checks: Record<string, any> = {};
    
    try {
      // Database check
      const startDb = Date.now();
      await ctx.db.query("projects").take(1);
      checks.database = {
        status: "healthy",
        message: "Database connection OK",
        responseTime: Date.now() - startDb,
      };
    } catch (error) {
      checks.database = {
        status: "unhealthy",
        message: error instanceof Error ? error.message : "Database error",
      };
    }
    
    // Projects check
    try {
      const projects = await ctx.db.query("projects").collect();
      checks.projects = {
        status: projects.length > 0 ? "healthy" : "degraded",
        message: `${projects.length} project${projects.length !== 1 ? 's' : ''} configured`,
      };
    } catch (error) {
      checks.projects = {
        status: "unhealthy",
        message: "Failed to query projects",
      };
    }
    
    // Agents check
    try {
      const agents = await ctx.db.query("agents").collect();
      const activeAgents = agents.filter((a) => a.status === "ACTIVE").length;
      const quarantinedAgents = agents.filter((a) => a.status === "QUARANTINED").length;
      
      checks.agents = {
        status: quarantinedAgents > 0 ? "degraded" : agents.length > 0 ? "healthy" : "degraded",
        message: `${activeAgents} active, ${agents.length} total${quarantinedAgents > 0 ? `, ${quarantinedAgents} quarantined` : ''}`,
      };
    } catch (error) {
      checks.agents = {
        status: "unhealthy",
        message: "Failed to query agents",
      };
    }
    
    // Tasks check
    try {
      const tasks = await ctx.db.query("tasks").collect();
      const blockedTasks = tasks.filter((t) => t.status === "BLOCKED").length;
      const inProgressTasks = tasks.filter((t) => t.status === "IN_PROGRESS").length;
      
      checks.tasks = {
        status: blockedTasks > 5 ? "degraded" : "healthy",
        message: `${inProgressTasks} in progress, ${blockedTasks} blocked`,
      };
    } catch (error) {
      checks.tasks = {
        status: "unhealthy",
        message: "Failed to query tasks",
      };
    }
    
    // Approvals check
    try {
      const approvals = await ctx.db.query("approvals").collect();
      const pendingApprovals = approvals.filter((a) => a.status === "PENDING" || a.status === "ESCALATED").length;
      
      checks.approvals = {
        status: pendingApprovals > 10 ? "degraded" : "healthy",
        message: `${pendingApprovals} pending approval${pendingApprovals !== 1 ? 's' : ''}`,
      };
    } catch (error) {
      checks.approvals = {
        status: "unhealthy",
        message: "Failed to query approvals",
      };
    }
    
    // Alerts check
    try {
      const alerts = await ctx.db.query("alerts").collect();
      const openAlerts = alerts.filter((a) => a.status === "OPEN").length;
      const criticalAlerts = alerts.filter((a) => a.severity === "CRITICAL" && a.status === "OPEN").length;
      
      checks.alerts = {
        status: criticalAlerts > 0 ? "unhealthy" : openAlerts > 5 ? "degraded" : "healthy",
        message: `${openAlerts} open alert${openAlerts !== 1 ? 's' : ''}${criticalAlerts > 0 ? ` (${criticalAlerts} critical)` : ''}`,
      };
    } catch (error) {
      checks.alerts = {
        status: "unhealthy",
        message: "Failed to query alerts",
      };
    }
    
    // Determine overall status
    const statuses = Object.values(checks).map((c: any) => c.status);
    let overallStatus = "healthy";
    if (statuses.includes("unhealthy")) {
      overallStatus = "unhealthy";
    } else if (statuses.includes("degraded")) {
      overallStatus = "degraded";
    }
    
    // Approximate uptime from earliest persisted project creation time.
    // This is not process uptime, but gives operators a meaningful service age signal.
    const earliestProject = await ctx.db.query("projects").order("asc").take(1);
    const startedAt = earliestProject[0]?._creationTime ?? now;
    const uptimeSeconds = Math.max(0, Math.floor((now - startedAt) / 1000));
    const uptimeHours = Math.floor(uptimeSeconds / 3600);
    const uptimeMinutes = Math.floor((uptimeSeconds % 3600) / 60);
    const uptimeDisplay = uptimeHours > 0 
      ? `${uptimeHours}h ${uptimeMinutes}m`
      : `${uptimeMinutes}m`;
    
    return {
      timestamp: now,
      status: overallStatus,
      message: overallStatus === "healthy" 
        ? "All systems operational"
        : overallStatus === "degraded"
        ? "Some systems degraded"
        : "System issues detected",
      checks,
      uptime: uptimeDisplay,
    };
  },
});
