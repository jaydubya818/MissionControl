/**
 * Loop Detection — Convex Functions
 * 
 * Detects and blocks tasks with loops:
 * - Comment storms (too many messages in short time)
 * - Review ping-pong (too many review cycles)
 * - Repeated tool failures (same tool failing repeatedly)
 * - Back-and-forth transitions (state oscillation)
 */

import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";

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
    
    const thresholds = policy.loopThresholds as {
      maxCommentsPerWindow?: number;
      windowMinutes?: number;
      maxReviewCycles?: number;
      maxPingPong?: number;
      backAndForthLimit?: number;
      backAndForthWindowMinutes?: number;
    };
    
    // Get all non-terminal tasks
    const tasks = await ctx.db
      .query("tasks")
      .filter((q) => 
        q.and(
          q.neq(q.field("status"), "DONE"),
          q.neq(q.field("status"), "CANCELED"),
          q.neq(q.field("status"), "FAILED")
        )
      )
      .collect();
    
    let checked = 0;
    let blocked = 0;
    
    for (const task of tasks) {
      checked++;
      
      // Skip if already blocked
      if (task.status === "BLOCKED") continue;
      
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
      
      // 2. Check review ping-pong (reviewCycles counter)
      if (thresholds.maxReviewCycles && task.reviewCycles > thresholds.maxReviewCycles) {
        await blockTaskForLoop(ctx, task, {
          type: "REVIEW_PING_PONG",
          count: task.reviewCycles,
          threshold: thresholds.maxReviewCycles,
        });
        blocked++;
        continue;
      }
      
      // 3. Check back-and-forth transitions (state oscillation detection)
      const backAndForthLimit = thresholds.backAndForthLimit ?? 6;
      const bafWindowMinutes = thresholds.backAndForthWindowMinutes ?? 60;
      const bafCutoff = Date.now() - (bafWindowMinutes * 60 * 1000);
      
      const recentTransitions = await ctx.db
        .query("taskTransitions")
        .withIndex("by_task", (q) => q.eq("taskId", task._id))
        .filter((q) => q.gte(q.field("_creationTime"), bafCutoff))
        .collect();
      
      if (recentTransitions.length >= backAndForthLimit) {
        // Detect oscillation: A->B->A->B pattern
        const statePairs = recentTransitions.map(
          (t) => `${t.fromStatus}->${t.toStatus}`
        );
        const pairCounts: Record<string, number> = {};
        for (const pair of statePairs) {
          pairCounts[pair] = (pairCounts[pair] || 0) + 1;
        }
        
        // Check for any single pair that occurred more than half the transitions
        const maxPairCount = Math.max(...Object.values(pairCounts));
        if (maxPairCount >= Math.ceil(backAndForthLimit / 2)) {
          const offendingPair = Object.entries(pairCounts)
            .find(([, count]) => count === maxPairCount)?.[0] ?? "unknown";
          
          await blockTaskForLoop(ctx, task, {
            type: "BACK_AND_FORTH",
            count: recentTransitions.length,
            threshold: backAndForthLimit,
            window: bafWindowMinutes,
            detail: `Oscillation detected: "${offendingPair}" occurred ${maxPairCount} times`,
          });
          blocked++;
          continue;
        }
      }
      
      // 4. Check repeated tool failures
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

async function blockTaskForLoop(
  ctx: any,
  task: Doc<"tasks">,
  loopData: {
    type: string;
    count: number;
    threshold: number;
    window?: number;
    detail?: string;
  }
) {
  // Move task to BLOCKED
  await ctx.db.patch(task._id, {
    status: "BLOCKED",
    blockedReason: `Loop detected: ${loopData.type} (${loopData.count} > ${loopData.threshold})${loopData.detail ? ` — ${loopData.detail}` : ""}`,
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
    description: `Task "${task.title}" blocked due to ${loopData.type}: ${loopData.count} occurrences (threshold: ${loopData.threshold})${loopData.detail ? ` — ${loopData.detail}` : ""}`,
    taskId: task._id,
    status: "OPEN",
    metadata: { loopData },
  });
  
  // Create loop summary document
  const firstAssignee = task.assigneeIds?.[0];
  if (firstAssignee) {
    await ctx.db.insert("agentDocuments", {
      projectId: task.projectId,
      agentId: firstAssignee,
      type: "SESSION_MEMORY",
      content: `# Loop Detected: ${task.title}\n\n` +
        `**Type:** ${loopData.type}\n` +
        `**Count:** ${loopData.count}\n` +
        `**Threshold:** ${loopData.threshold}\n` +
        (loopData.window ? `**Window:** ${loopData.window} minutes\n` : "") +
        (loopData.detail ? `**Detail:** ${loopData.detail}\n` : "") +
        `\n**Action:** Task blocked. Review and resolve the loop before unblocking.`,
      updatedAt: Date.now(),
      metadata: { loopDetection: loopData },
    });
  }
  
  // Send notification via telegram (stored for polling)
  await ctx.runMutation(internal.telegram.notifyLoopDetected, {
    taskId: task._id,
    loopType: loopData.type,
    count: loopData.count,
    threshold: loopData.threshold,
  });
}
