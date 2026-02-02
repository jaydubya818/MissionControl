/**
 * Executor Router — Automated Multi-Executor Routing
 *
 * Automatically routes execution requests to appropriate executors
 * and handles callbacks.
 */
import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
// ============================================================================
// ROUTING RULES
// ============================================================================
const ROUTING_RULES = {
    CODE_CHANGE: "CURSOR",
    RESEARCH: "OPENCLAW_AGENT",
    CONTENT: "OPENCLAW_AGENT",
    EMAIL: "OPENCLAW_AGENT",
    SOCIAL: "OPENCLAW_AGENT",
    OPS: "OPENCLAW_AGENT",
};
// ============================================================================
// AUTO-ROUTE EXECUTION REQUESTS
// ============================================================================
/**
 * Automatically route pending execution requests.
 * Called by cron every 5 minutes.
 */
export const autoRoute = internalMutation({
    args: {},
    handler: async (ctx) => {
        // Get all pending requests
        const requests = await ctx.db
            .query("executionRequests")
            .withIndex("by_status", (q) => q.eq("status", "PENDING"))
            .collect();
        let routed = 0;
        for (const request of requests) {
            // Determine executor
            const executor = ROUTING_RULES[request.type] || "OPENCLAW_AGENT";
            // Update status to ASSIGNED
            await ctx.db.patch(request._id, {
                status: "ASSIGNED",
                assignedTo: executor,
                assignedAt: Date.now(),
            });
            // Log activity
            await ctx.db.insert("activities", {
                projectId: request.projectId,
                actorType: "SYSTEM",
                action: "EXECUTION_ROUTED",
                description: `Routed ${request.type} to ${executor}`,
                targetType: "EXECUTION_REQUEST",
                targetId: request._id,
                taskId: request.taskId,
            });
            // Create notification for executor
            if (executor === "OPENCLAW_AGENT") {
                // Notify agent via Mission Control
                await ctx.db.insert("notifications", {
                    agentId: request.requestedBy,
                    type: "SYSTEM",
                    title: "Execution request assigned",
                    body: `Your ${request.type} request has been assigned. Check execution queue.`,
                    metadata: { requestId: request._id, notificationType: "EXECUTION_ASSIGNED" },
                });
            }
            routed++;
        }
        return { routed };
    },
});
// ============================================================================
// EXECUTOR CALLBACKS
// ============================================================================
/**
 * Callback from executor when execution starts.
 */
export const onExecutionStart = mutation({
    args: {
        requestId: v.id("executionRequests"),
        executorId: v.string(),
    },
    handler: async (ctx, args) => {
        const request = await ctx.db.get(args.requestId);
        if (!request) {
            return { success: false, error: "Request not found" };
        }
        await ctx.db.patch(args.requestId, {
            status: "IN_PROGRESS",
            metadata: {
                ...request.metadata,
                startedAt: Date.now(),
                executorId: args.executorId,
            },
        });
        return { success: true };
    },
});
/**
 * Callback from executor when execution completes.
 */
export const onExecutionComplete = mutation({
    args: {
        requestId: v.id("executionRequests"),
        executorId: v.string(),
        result: v.any(),
        success: v.boolean(),
        error: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const request = await ctx.db.get(args.requestId);
        if (!request) {
            return { success: false, error: "Request not found" };
        }
        await ctx.db.patch(args.requestId, {
            status: args.success ? "COMPLETED" : "FAILED",
            result: args.result,
            completedAt: Date.now(),
            metadata: {
                ...request.metadata,
                error: args.error,
                completedBy: args.executorId,
            },
        });
        // Log activity
        await ctx.db.insert("activities", {
            projectId: request.projectId,
            actorType: "SYSTEM",
            action: args.success ? "EXECUTION_COMPLETED" : "EXECUTION_FAILED",
            description: `${request.type} execution ${args.success ? "completed" : "failed"}`,
            targetType: "EXECUTION_REQUEST",
            targetId: args.requestId,
            taskId: request.taskId,
            metadata: { result: args.result, error: args.error },
        });
        // Notify requestor
        await ctx.db.insert("notifications", {
            agentId: request.requestedBy,
            type: "SYSTEM",
            title: `Execution ${args.success ? "completed" : "failed"}`,
            body: args.success
                ? `Your ${request.type} request completed successfully`
                : `Your ${request.type} request failed: ${args.error}`,
            metadata: {
                requestId: request._id,
                result: args.result,
                notificationType: args.success ? "EXECUTION_COMPLETED" : "EXECUTION_FAILED",
            },
        });
        return { success: true };
    },
});
// ============================================================================
// EXECUTOR QUEUE QUERIES
// ============================================================================
/**
 * Get pending execution requests for a specific executor.
 */
export const getQueueForExecutor = query({
    args: {
        executor: v.union(v.literal("CURSOR"), v.literal("CLAUDE_CODE"), v.literal("OPENCLAW_AGENT")),
        limit: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const requests = await ctx.db
            .query("executionRequests")
            .withIndex("by_executor", (q) => q.eq("executor", args.executor))
            .filter((q) => q.or(q.eq(q.field("status"), "ASSIGNED"), q.eq(q.field("status"), "IN_PROGRESS")))
            .order("desc")
            .take(args.limit ?? 50);
        return requests;
    },
});
/**
 * Claim an execution request (for executor polling).
 */
export const claimExecution = mutation({
    args: {
        requestId: v.id("executionRequests"),
        executorId: v.string(),
    },
    handler: async (ctx, args) => {
        const request = await ctx.db.get(args.requestId);
        if (!request) {
            return { success: false, error: "Request not found" };
        }
        if (request.status !== "ASSIGNED") {
            return { success: false, error: `Request is ${request.status}, cannot claim` };
        }
        await ctx.db.patch(args.requestId, {
            status: "IN_PROGRESS",
            assignedTo: args.executorId,
            metadata: {
                ...request.metadata,
                claimedAt: Date.now(),
                claimedBy: args.executorId,
            },
        });
        return { success: true, request: await ctx.db.get(args.requestId) };
    },
});
