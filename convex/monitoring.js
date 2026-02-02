/**
 * Monitoring & Error Tracking
 *
 * Centralized error logging and monitoring utilities.
 */
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
// ============================================================================
// ERROR LOGGING
// ============================================================================
/**
 * Log an error for monitoring and debugging.
 */
export const logError = mutation({
    args: {
        projectId: v.optional(v.id("projects")),
        source: v.string(), // e.g., "agent-runner", "telegram-bot", "ui"
        errorType: v.string(), // e.g., "API_ERROR", "VALIDATION_ERROR", "TIMEOUT"
        message: v.string(),
        stack: v.optional(v.string()),
        context: v.optional(v.any()),
        agentId: v.optional(v.id("agents")),
        taskId: v.optional(v.id("tasks")),
        runId: v.optional(v.id("runs")),
    },
    handler: async (ctx, args) => {
        // Log as activity
        await ctx.db.insert("activities", {
            projectId: args.projectId,
            actorType: "SYSTEM",
            action: "ERROR_LOGGED",
            description: `${args.source}: ${args.errorType} - ${args.message}`,
            targetType: "ERROR",
            agentId: args.agentId,
            taskId: args.taskId,
            metadata: {
                errorType: args.errorType,
                stack: args.stack,
                context: args.context,
                runId: args.runId,
            },
        });
        // Create alert if critical
        if (["API_ERROR", "DATABASE_ERROR", "CRITICAL"].includes(args.errorType)) {
            await ctx.db.insert("alerts", {
                projectId: args.projectId,
                severity: "CRITICAL",
                type: "SYSTEM_ERROR",
                title: `${args.source}: ${args.errorType}`,
                description: args.message,
                agentId: args.agentId,
                taskId: args.taskId,
                status: "OPEN",
                metadata: {
                    errorType: args.errorType,
                    stack: args.stack,
                    context: args.context,
                },
            });
        }
        return { success: true };
    },
});
/**
 * Get recent errors for debugging.
 */
export const listRecentErrors = query({
    args: {
        projectId: v.optional(v.id("projects")),
        limit: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const activities = await ctx.db
            .query("activities")
            .filter((q) => q.eq(q.field("action"), "ERROR_LOGGED"))
            .order("desc")
            .take(args.limit ?? 50);
        // Filter by project if provided
        const filtered = args.projectId
            ? activities.filter((a) => a.projectId === args.projectId)
            : activities;
        return filtered;
    },
});
// ============================================================================
// PERFORMANCE MONITORING
// ============================================================================
/**
 * Log performance metrics.
 */
export const logPerformance = mutation({
    args: {
        projectId: v.optional(v.id("projects")),
        operation: v.string(),
        durationMs: v.number(),
        success: v.boolean(),
        metadata: v.optional(v.any()),
    },
    handler: async (ctx, args) => {
        await ctx.db.insert("activities", {
            projectId: args.projectId,
            actorType: "SYSTEM",
            action: "PERFORMANCE_LOG",
            description: `${args.operation}: ${args.durationMs}ms (${args.success ? "success" : "failed"})`,
            targetType: "PERFORMANCE",
            metadata: {
                operation: args.operation,
                durationMs: args.durationMs,
                success: args.success,
                ...args.metadata,
            },
        });
        // Alert on slow operations (>10 seconds)
        if (args.durationMs > 10000) {
            await ctx.db.insert("alerts", {
                projectId: args.projectId,
                severity: "WARNING",
                type: "PERFORMANCE",
                title: "Slow Operation",
                description: `${args.operation} took ${(args.durationMs / 1000).toFixed(1)}s`,
                status: "OPEN",
                metadata: {
                    operation: args.operation,
                    durationMs: args.durationMs,
                },
            });
        }
        return { success: true };
    },
});
/**
 * Get performance stats.
 */
export const getPerformanceStats = query({
    args: {
        projectId: v.optional(v.id("projects")),
        operation: v.optional(v.string()),
        limit: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const activities = await ctx.db
            .query("activities")
            .filter((q) => q.eq(q.field("action"), "PERFORMANCE_LOG"))
            .order("desc")
            .take(args.limit ?? 100);
        // Filter by project and operation
        let filtered = activities;
        if (args.projectId) {
            filtered = filtered.filter((a) => a.projectId === args.projectId);
        }
        if (args.operation) {
            filtered = filtered.filter((a) => a.metadata?.operation === args.operation);
        }
        // Calculate stats
        const durations = filtered.map((a) => a.metadata?.durationMs || 0);
        const avg = durations.length > 0
            ? durations.reduce((sum, d) => sum + d, 0) / durations.length
            : 0;
        const min = durations.length > 0 ? Math.min(...durations) : 0;
        const max = durations.length > 0 ? Math.max(...durations) : 0;
        return {
            count: filtered.length,
            avgDurationMs: avg,
            minDurationMs: min,
            maxDurationMs: max,
            recentLogs: filtered.slice(0, 10),
        };
    },
});
// ============================================================================
// AUDIT LOG
// ============================================================================
/**
 * Get comprehensive audit log for compliance.
 */
export const getAuditLog = query({
    args: {
        projectId: v.optional(v.id("projects")),
        startTime: v.optional(v.number()),
        endTime: v.optional(v.number()),
        actorType: v.optional(v.string()),
        action: v.optional(v.string()),
        limit: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        let activities = await ctx.db
            .query("activities")
            .order("desc")
            .take(args.limit ?? 1000);
        // Apply filters
        if (args.projectId) {
            activities = activities.filter((a) => a.projectId === args.projectId);
        }
        if (args.startTime) {
            activities = activities.filter((a) => a._creationTime >= args.startTime);
        }
        if (args.endTime) {
            activities = activities.filter((a) => a._creationTime <= args.endTime);
        }
        if (args.actorType) {
            activities = activities.filter((a) => a.actorType === args.actorType);
        }
        if (args.action) {
            activities = activities.filter((a) => a.action === args.action);
        }
        return activities;
    },
});
/**
 * Export audit log as markdown.
 */
export const exportAuditLog = query({
    args: {
        projectId: v.optional(v.id("projects")),
        startTime: v.optional(v.number()),
        endTime: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        // Get audit log directly instead of using runQuery
        let activities = await ctx.db
            .query("activities")
            .order("desc")
            .take(10000);
        // Apply filters
        if (args.projectId) {
            activities = activities.filter((a) => a.projectId === args.projectId);
        }
        if (args.startTime) {
            activities = activities.filter((a) => a._creationTime >= args.startTime);
        }
        if (args.endTime) {
            activities = activities.filter((a) => a._creationTime <= args.endTime);
        }
        // Continue with original logic but use filtered activities
        const activitiesToExport = activities;
        activities = activitiesToExport;
        let report = `# Mission Control Audit Log\n\n`;
        report += `**Generated:** ${new Date().toISOString()}\n`;
        if (args.startTime) {
            report += `**Start:** ${new Date(args.startTime).toISOString()}\n`;
        }
        if (args.endTime) {
            report += `**End:** ${new Date(args.endTime).toISOString()}\n`;
        }
        report += `**Total Events:** ${activities.length}\n\n`;
        report += `---\n\n`;
        // Skip the duplicate query and use activities directly
        /*
        const activities = await ctx.runQuery(api.monitoring.getAuditLog, {
          projectId: args.projectId,
          startTime: args.startTime,
          endTime: args.endTime,
          limit: 10000,
        });
        */
        // Already have report started above
        /*
        let report = `# Mission Control Audit Log\n\n`;
        report += `**Generated:** ${new Date().toISOString()}\n`;
        if (args.startTime) {
          report += `**Start:** ${new Date(args.startTime).toISOString()}\n`;
        }
        if (args.endTime) {
          report += `**End:** ${new Date(args.endTime).toISOString()}\n`;
        }
        report += `**Total Events:** ${activities.length}\n\n`;
        report += `---\n\n`;
        */
        // Group by date
        const byDate = {};
        for (const activity of activities) {
            const date = new Date(activity._creationTime).toISOString().split("T")[0];
            if (!byDate[date])
                byDate[date] = [];
            byDate[date].push(activity);
        }
        // Output by date
        for (const [date, dateActivities] of Object.entries(byDate).sort((a, b) => b[0].localeCompare(a[0]))) {
            report += `## ${date}\n\n`;
            report += `**Events:** ${dateActivities.length}\n\n`;
            for (const activity of dateActivities) {
                const time = new Date(activity._creationTime).toLocaleTimeString();
                report += `- **${time}** — ${activity.actorType} — ${activity.action}\n`;
                report += `  ${activity.description}\n`;
                if (activity.metadata) {
                    report += `  _Metadata: ${JSON.stringify(activity.metadata).slice(0, 100)}_\n`;
                }
                report += `\n`;
            }
        }
        return report;
    },
});
