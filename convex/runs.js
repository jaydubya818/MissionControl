"use strict";
/**
 * Runs — Convex Functions
 *
 * Agent execution turn tracking and cost accounting.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStats = exports.complete = exports.start = exports.listRecent = exports.listByTask = exports.listByAgent = exports.get = void 0;
const values_1 = require("convex/values");
const server_1 = require("./_generated/server");
// ============================================================================
// QUERIES
// ============================================================================
exports.get = (0, server_1.query)({
    args: { runId: values_1.v.id("runs") },
    handler: async (ctx, args) => {
        return await ctx.db.get(args.runId);
    },
});
exports.listByAgent = (0, server_1.query)({
    args: {
        agentId: values_1.v.id("agents"),
        limit: values_1.v.optional(values_1.v.number()),
    },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("runs")
            .withIndex("by_agent", (q) => q.eq("agentId", args.agentId))
            .order("desc")
            .take(args.limit ?? 50);
    },
});
exports.listByTask = (0, server_1.query)({
    args: {
        taskId: values_1.v.id("tasks"),
        limit: values_1.v.optional(values_1.v.number()),
    },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("runs")
            .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
            .order("desc")
            .take(args.limit ?? 50);
    },
});
exports.listRecent = (0, server_1.query)({
    args: { limit: values_1.v.optional(values_1.v.number()) },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("runs")
            .order("desc")
            .take(args.limit ?? 100);
    },
});
// ============================================================================
// MUTATIONS
// ============================================================================
exports.start = (0, server_1.mutation)({
    args: {
        agentId: values_1.v.id("agents"),
        taskId: values_1.v.optional(values_1.v.id("tasks")),
        sessionKey: values_1.v.string(),
        model: values_1.v.string(),
        idempotencyKey: values_1.v.string(),
        metadata: values_1.v.optional(values_1.v.any()),
    },
    handler: async (ctx, args) => {
        // Check idempotency
        const existing = await ctx.db
            .query("runs")
            .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", args.idempotencyKey))
            .first();
        if (existing) {
            return { run: existing, created: false };
        }
        // Get agent and task
        const agent = await ctx.db.get(args.agentId);
        if (!agent) {
            throw new Error("Agent not found");
        }
        const task = args.taskId ? await ctx.db.get(args.taskId) : null;
        // Check agent daily budget
        if (agent.spendToday >= agent.budgetDaily) {
            await ctx.db.patch(args.agentId, { status: "PAUSED" });
            // Create alert
            await ctx.db.insert("alerts", {
                projectId: agent.projectId,
                severity: "WARNING",
                type: "BUDGET_EXCEEDED",
                title: "Agent daily budget exceeded",
                description: `Agent ${agent.name} exceeded daily budget: $${agent.spendToday.toFixed(2)} / $${agent.budgetDaily.toFixed(2)}`,
                agentId: args.agentId,
                taskId: args.taskId,
                status: "OPEN",
            });
            throw new Error("Agent daily budget exceeded");
        }
        // Check task budget if allocated
        if (task && task.budgetAllocated) {
            if (task.actualCost >= task.budgetAllocated) {
                // Move task to NEEDS_APPROVAL
                await ctx.db.patch(task._id, { status: "NEEDS_APPROVAL" });
                // Create alert
                await ctx.db.insert("alerts", {
                    projectId: task.projectId,
                    severity: "WARNING",
                    type: "BUDGET_EXCEEDED",
                    title: "Task budget exceeded",
                    description: `Task "${task.title}" exceeded budget: $${task.actualCost.toFixed(2)} / $${task.budgetAllocated.toFixed(2)}`,
                    taskId: task._id,
                    status: "OPEN",
                });
                throw new Error("Task budget exceeded");
            }
        }
        const runId = await ctx.db.insert("runs", {
            projectId: agent.projectId,
            idempotencyKey: args.idempotencyKey,
            agentId: args.agentId,
            taskId: args.taskId,
            sessionKey: args.sessionKey,
            startedAt: Date.now(),
            model: args.model,
            inputTokens: 0,
            outputTokens: 0,
            costUsd: 0,
            budgetAllocated: agent.budgetPerRun,
            status: "RUNNING",
            metadata: args.metadata,
        });
        const run = await ctx.db.get(runId);
        return { run, created: true };
    },
});
exports.complete = (0, server_1.mutation)({
    args: {
        runId: values_1.v.id("runs"),
        inputTokens: values_1.v.number(),
        outputTokens: values_1.v.number(),
        cacheReadTokens: values_1.v.optional(values_1.v.number()),
        cacheWriteTokens: values_1.v.optional(values_1.v.number()),
        costUsd: values_1.v.number(),
        error: values_1.v.optional(values_1.v.string()),
        status: values_1.v.optional(values_1.v.string()),
    },
    handler: async (ctx, args) => {
        const run = await ctx.db.get(args.runId);
        if (!run) {
            return { success: false, error: "Run not found" };
        }
        const now = Date.now();
        const durationMs = now - run.startedAt;
        // Check if run budget exceeded
        if (run.budgetAllocated && args.costUsd > run.budgetAllocated) {
            // Create alert but allow completion
            await ctx.db.insert("alerts", {
                projectId: run.projectId,
                severity: "WARNING",
                type: "BUDGET_EXCEEDED",
                title: "Run budget exceeded",
                description: `Run exceeded budget: $${args.costUsd.toFixed(2)} / $${run.budgetAllocated.toFixed(2)}`,
                agentId: run.agentId,
                taskId: run.taskId,
                runId: run._id,
                status: "OPEN",
            });
        }
        await ctx.db.patch(args.runId, {
            endedAt: now,
            durationMs,
            inputTokens: args.inputTokens,
            outputTokens: args.outputTokens,
            cacheReadTokens: args.cacheReadTokens,
            cacheWriteTokens: args.cacheWriteTokens,
            costUsd: args.costUsd,
            status: (args.error ? "FAILED" : args.status ?? "COMPLETED"),
            error: args.error,
        });
        // Update agent's spend
        if (args.costUsd > 0) {
            const agent = await ctx.db.get(run.agentId);
            if (agent) {
                const newSpend = agent.spendToday + args.costUsd;
                await ctx.db.patch(run.agentId, {
                    spendToday: newSpend,
                });
                // Check if agent budget exceeded after this run
                if (newSpend >= agent.budgetDaily) {
                    await ctx.db.patch(run.agentId, { status: "PAUSED" });
                    await ctx.db.insert("alerts", {
                        projectId: agent.projectId,
                        severity: "WARNING",
                        type: "BUDGET_EXCEEDED",
                        title: "Agent daily budget exceeded",
                        description: `Agent ${agent.name} exceeded daily budget: $${newSpend.toFixed(2)} / $${agent.budgetDaily.toFixed(2)}`,
                        agentId: run.agentId,
                        status: "OPEN",
                    });
                }
            }
        }
        // Update task's actual cost and check budget
        if (run.taskId && args.costUsd > 0) {
            const task = await ctx.db.get(run.taskId);
            if (task) {
                const newCost = task.actualCost + args.costUsd;
                await ctx.db.patch(run.taskId, {
                    actualCost: newCost,
                    budgetRemaining: task.budgetAllocated
                        ? task.budgetAllocated - newCost
                        : undefined,
                });
                // Check if task budget exceeded
                if (task.budgetAllocated && newCost >= task.budgetAllocated) {
                    await ctx.db.patch(run.taskId, { status: "NEEDS_APPROVAL" });
                    await ctx.db.insert("alerts", {
                        projectId: task.projectId,
                        severity: "WARNING",
                        type: "BUDGET_EXCEEDED",
                        title: "Task budget exceeded",
                        description: `Task "${task.title}" exceeded budget: $${newCost.toFixed(2)} / $${task.budgetAllocated.toFixed(2)}`,
                        taskId: run.taskId,
                        status: "OPEN",
                    });
                }
            }
        }
        return { success: true, run: await ctx.db.get(args.runId) };
    },
});
exports.getStats = (0, server_1.query)({
    args: {
        agentId: values_1.v.optional(values_1.v.id("agents")),
        taskId: values_1.v.optional(values_1.v.id("tasks")),
        sinceDaysAgo: values_1.v.optional(values_1.v.number()),
    },
    handler: async (ctx, args) => {
        let runs;
        if (args.agentId) {
            const agentId = args.agentId;
            runs = await ctx.db
                .query("runs")
                .withIndex("by_agent", (q) => q.eq("agentId", agentId))
                .collect();
        }
        else if (args.taskId) {
            const taskId = args.taskId;
            runs = await ctx.db
                .query("runs")
                .withIndex("by_task", (q) => q.eq("taskId", taskId))
                .collect();
        }
        else {
            runs = await ctx.db.query("runs").collect();
        }
        // Filter by time if specified
        if (args.sinceDaysAgo) {
            const cutoff = Date.now() - args.sinceDaysAgo * 24 * 60 * 60 * 1000;
            runs = runs.filter(r => r.startedAt >= cutoff);
        }
        const totalRuns = runs.length;
        const totalCost = runs.reduce((sum, r) => sum + r.costUsd, 0);
        const totalInputTokens = runs.reduce((sum, r) => sum + r.inputTokens, 0);
        const totalOutputTokens = runs.reduce((sum, r) => sum + r.outputTokens, 0);
        const avgDuration = runs.length > 0
            ? runs.reduce((sum, r) => sum + (r.durationMs ?? 0), 0) / runs.length
            : 0;
        const failedRuns = runs.filter(r => r.status === "FAILED").length;
        return {
            totalRuns,
            totalCost,
            totalInputTokens,
            totalOutputTokens,
            avgDurationMs: Math.round(avgDuration),
            failedRuns,
            successRate: totalRuns > 0 ? ((totalRuns - failedRuns) / totalRuns * 100).toFixed(1) + "%" : "N/A",
        };
    },
});
