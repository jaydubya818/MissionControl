/**
 * Loop Detection — Convex Functions
 *
 * Detects and blocks tasks with loops:
 * - Comment storms (too many messages in short time)
 * - Review ping-pong (too many review cycles)
 * - Repeated tool failures (same tool failing repeatedly)
 */
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
// ============================================================================
// LOOP DETECTION
// ============================================================================
export const detectLoops = internalMutation({
    args: {},
    handler: async (ctx) => {
        // Get active policy for thresholds
        const policy = await ctx.db
            .query("policies")
            .withIndex("by_active", (q) => q.eq("active", true))
            .first();
        if (!policy || !policy.loopThresholds) {
            return { checked: 0, blocked: 0 };
        }
        const thresholds = policy.loopThresholds;
        // Get all non-terminal tasks
        const tasks = await ctx.db
            .query("tasks")
            .filter((q) => q.and(q.neq(q.field("status"), "DONE"), q.neq(q.field("status"), "CANCELED")))
            .collect();
        let checked = 0;
        let blocked = 0;
        for (const task of tasks) {
            checked++;
            // Skip if already blocked
            if (task.status === "BLOCKED")
                continue;
            // 1. Check comment storm
            if (thresholds.maxCommentsPerWindow && thresholds.windowMinutes) {
                const windowMs = thresholds.windowMinutes * 60 * 1000;
                const cutoff = Date.now() - windowMs;
                const recentMessages = await ctx.db
                    .query("messages")
                    .withIndex("by_task", (q) => q.eq("taskId", task._id))
                    .filter((q) => q.gte(q.field("_creationTime"), cutoff))
                    .collect();
                if (recentMessages.length > thresholds.maxCommentsPerWindow) {
                    await blockTaskForLoop(ctx, task, {
                        type: "COMMENT_STORM",
                        count: recentMessages.length,
                        threshold: thresholds.maxCommentsPerWindow,
                        window: thresholds.windowMinutes,
                    });
                    blocked++;
                    continue;
                }
            }
            // 2. Check review ping-pong
            if (thresholds.maxReviewCycles && task.reviewCycles > thresholds.maxReviewCycles) {
                await blockTaskForLoop(ctx, task, {
                    type: "REVIEW_PING_PONG",
                    count: task.reviewCycles,
                    threshold: thresholds.maxReviewCycles,
                });
                blocked++;
                continue;
            }
            // 3. Check repeated tool failures
            const runs = await ctx.db
                .query("runs")
                .withIndex("by_task", (q) => q.eq("taskId", task._id))
                .collect();
            const recentRuns = runs.slice(-10); // Last 10 runs
            const failedRuns = recentRuns.filter(r => r.status === "FAILED");
            if (failedRuns.length >= 5) {
                await blockTaskForLoop(ctx, task, {
                    type: "REPEATED_FAILURES",
                    count: failedRuns.length,
                    threshold: 5,
                });
                blocked++;
                continue;
            }
        }
        return { checked, blocked };
    },
});
// ============================================================================
// HELPERS
// ============================================================================
async function blockTaskForLoop(ctx, task, loopData) {
    // Move task to BLOCKED
    await ctx.db.patch(task._id, {
        status: "BLOCKED",
        blockedReason: `Loop detected: ${loopData.type} (${loopData.count} > ${loopData.threshold})`,
    });
    // Create transition record
    await ctx.db.insert("taskTransitions", {
        projectId: task.projectId,
        idempotencyKey: `loop:${task._id}:${Date.now()}`,
        taskId: task._id,
        fromStatus: task.status,
        toStatus: "BLOCKED",
        actorType: "SYSTEM",
        reason: `Loop detected: ${loopData.type}`,
    });
    // Create alert
    await ctx.db.insert("alerts", {
        projectId: task.projectId,
        severity: "WARNING",
        type: "LOOP_DETECTED",
        title: `Loop detected: ${loopData.type}`,
        description: `Task "${task.title}" blocked due to ${loopData.type}: ${loopData.count} occurrences (threshold: ${loopData.threshold})`,
        taskId: task._id,
        status: "OPEN",
        metadata: { loopData },
    });
    // Create loop summary document
    await ctx.db.insert("agentDocuments", {
        projectId: task.projectId,
        agentId: task.assigneeIds[0], // First assignee or null
        type: "SESSION_MEMORY",
        content: `# Loop Detected: ${task.title}\n\n` +
            `**Type:** ${loopData.type}\n` +
            `**Count:** ${loopData.count}\n` +
            `**Threshold:** ${loopData.threshold}\n` +
            (loopData.window ? `**Window:** ${loopData.window} minutes\n` : "") +
            `\n**Action:** Task blocked. Review and resolve the loop before unblocking.`,
        updatedAt: Date.now(),
        metadata: { loopDetection: loopData },
    });
    // Send notification via telegram (stored for polling)
    await ctx.runMutation(internal.telegram.notifyLoopDetected, {
        taskId: task._id,
        loopType: loopData.type,
        count: loopData.count,
        threshold: loopData.threshold,
    });
}
