"use strict";
/**
 * Agents — Convex Functions
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordSpend = exports.resumeAll = exports.pauseAll = exports.updateStatus = exports.heartbeat = exports.register = exports.listActive = exports.listByStatus = exports.listAll = exports.getByName = exports.get = void 0;
const values_1 = require("convex/values");
const server_1 = require("./_generated/server");
// ============================================================================
// QUERIES
// ============================================================================
exports.get = (0, server_1.query)({
    args: { agentId: values_1.v.id("agents") },
    handler: async (ctx, args) => {
        return await ctx.db.get(args.agentId);
    },
});
exports.getByName = (0, server_1.query)({
    args: { name: values_1.v.string() },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("agents")
            .withIndex("by_name", (q) => q.eq("name", args.name))
            .first();
    },
});
exports.listAll = (0, server_1.query)({
    args: {
        projectId: values_1.v.optional(values_1.v.id("projects")),
    },
    handler: async (ctx, args) => {
        if (args.projectId) {
            return await ctx.db
                .query("agents")
                .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
                .collect();
        }
        return await ctx.db.query("agents").collect();
    },
});
exports.listByStatus = (0, server_1.query)({
    args: {
        projectId: values_1.v.optional(values_1.v.id("projects")),
        status: values_1.v.string(),
    },
    handler: async (ctx, args) => {
        if (args.projectId) {
            return await ctx.db
                .query("agents")
                .withIndex("by_project_status", (q) => q.eq("projectId", args.projectId).eq("status", args.status))
                .collect();
        }
        return await ctx.db
            .query("agents")
            .withIndex("by_status", (q) => q.eq("status", args.status))
            .collect();
    },
});
exports.listActive = (0, server_1.query)({
    args: {
        projectId: values_1.v.optional(values_1.v.id("projects")),
    },
    handler: async (ctx, args) => {
        if (args.projectId) {
            return await ctx.db
                .query("agents")
                .withIndex("by_project_status", (q) => q.eq("projectId", args.projectId).eq("status", "ACTIVE"))
                .collect();
        }
        return await ctx.db
            .query("agents")
            .withIndex("by_status", (q) => q.eq("status", "ACTIVE"))
            .collect();
    },
});
// ============================================================================
// MUTATIONS
// ============================================================================
exports.register = (0, server_1.mutation)({
    args: {
        projectId: values_1.v.optional(values_1.v.id("projects")),
        name: values_1.v.string(),
        emoji: values_1.v.optional(values_1.v.string()),
        role: values_1.v.string(),
        workspacePath: values_1.v.string(),
        soulVersionHash: values_1.v.optional(values_1.v.string()),
        allowedTaskTypes: values_1.v.optional(values_1.v.array(values_1.v.string())),
        allowedTools: values_1.v.optional(values_1.v.array(values_1.v.string())),
        budgetDaily: values_1.v.optional(values_1.v.number()),
        budgetPerRun: values_1.v.optional(values_1.v.number()),
        canSpawn: values_1.v.optional(values_1.v.boolean()),
        maxSubAgents: values_1.v.optional(values_1.v.number()),
        parentAgentId: values_1.v.optional(values_1.v.id("agents")),
        metadata: values_1.v.optional(values_1.v.any()),
    },
    handler: async (ctx, args) => {
        // Check if agent already exists
        const existing = await ctx.db
            .query("agents")
            .withIndex("by_name", (q) => q.eq("name", args.name))
            .first();
        if (existing) {
            // Update existing agent
            await ctx.db.patch(existing._id, {
                emoji: args.emoji ?? existing.emoji,
                soulVersionHash: args.soulVersionHash,
                allowedTaskTypes: args.allowedTaskTypes ?? existing.allowedTaskTypes,
                allowedTools: args.allowedTools ?? existing.allowedTools,
                status: "ACTIVE",
                lastHeartbeatAt: Date.now(),
            });
            return { agent: await ctx.db.get(existing._id), created: false };
        }
        // Get budget defaults based on role
        const budgetDefaults = {
            INTERN: { daily: 2.00, perRun: 0.25 },
            SPECIALIST: { daily: 5.00, perRun: 0.75 },
            LEAD: { daily: 12.00, perRun: 1.50 },
        };
        const roleDefaults = budgetDefaults[args.role] ?? budgetDefaults.INTERN;
        // Create new agent
        const agentId = await ctx.db.insert("agents", {
            projectId: args.projectId,
            name: args.name,
            emoji: args.emoji,
            role: args.role,
            status: "ACTIVE",
            workspacePath: args.workspacePath,
            soulVersionHash: args.soulVersionHash,
            allowedTaskTypes: args.allowedTaskTypes ?? [],
            allowedTools: args.allowedTools,
            budgetDaily: args.budgetDaily ?? roleDefaults.daily,
            budgetPerRun: args.budgetPerRun ?? roleDefaults.perRun,
            spendToday: 0,
            canSpawn: args.canSpawn ?? false,
            maxSubAgents: args.maxSubAgents ?? 0,
            parentAgentId: args.parentAgentId,
            errorStreak: 0,
            lastHeartbeatAt: Date.now(),
            metadata: args.metadata,
        });
        // Log activity
        await ctx.db.insert("activities", {
            projectId: args.projectId,
            actorType: "SYSTEM",
            action: "AGENT_REGISTERED",
            description: `Agent "${args.name}" registered`,
            targetType: "AGENT",
            targetId: agentId,
            agentId,
        });
        return { agent: await ctx.db.get(agentId), created: true };
    },
});
exports.heartbeat = (0, server_1.mutation)({
    args: {
        agentId: values_1.v.id("agents"),
        sessionKey: values_1.v.optional(values_1.v.string()),
        currentTaskId: values_1.v.optional(values_1.v.id("tasks")),
        spendSinceLastHeartbeat: values_1.v.optional(values_1.v.number()),
        soulVersionHash: values_1.v.optional(values_1.v.string()),
        status: values_1.v.optional(values_1.v.string()),
        errorMessage: values_1.v.optional(values_1.v.string()),
    },
    handler: async (ctx, args) => {
        const agent = await ctx.db.get(args.agentId);
        if (!agent) {
            return { success: false, error: "Agent not found" };
        }
        const now = Date.now();
        // Check if we need to reset daily spend
        const resetHour = 0; // Midnight
        const today = new Date();
        today.setHours(resetHour, 0, 0, 0);
        const todayMs = today.getTime();
        let spendToday = agent.spendToday;
        let spendResetAt = agent.spendResetAt;
        if (!spendResetAt || spendResetAt < todayMs) {
            spendToday = 0;
            spendResetAt = todayMs + 24 * 60 * 60 * 1000;
        }
        // Add new spend
        if (args.spendSinceLastHeartbeat) {
            spendToday += args.spendSinceLastHeartbeat;
        }
        // Handle error streak
        let errorStreak = agent.errorStreak;
        if (args.errorMessage) {
            errorStreak++;
        }
        else {
            errorStreak = 0;
        }
        // Update agent
        await ctx.db.patch(args.agentId, {
            lastHeartbeatAt: now,
            currentTaskId: args.currentTaskId ?? agent.currentTaskId,
            spendToday,
            spendResetAt,
            soulVersionHash: args.soulVersionHash ?? agent.soulVersionHash,
            errorStreak,
            lastError: args.errorMessage ?? undefined,
            status: args.status ?? agent.status,
        });
        // Check budget
        const budgetRemaining = agent.budgetDaily - spendToday;
        const budgetExceeded = budgetRemaining <= 0;
        // Find pending work for this agent
        const pendingTasks = await ctx.db
            .query("tasks")
            .withIndex("by_status", (q) => q.eq("status", "ASSIGNED"))
            .collect();
        const myPendingTasks = pendingTasks.filter(t => t.assigneeIds.includes(args.agentId));
        // Find inbox tasks matching agent's allowed types
        const inboxTasks = await ctx.db
            .query("tasks")
            .withIndex("by_status", (q) => q.eq("status", "INBOX"))
            .collect();
        const claimableTasks = inboxTasks.filter(t => agent.allowedTaskTypes.length === 0 ||
            agent.allowedTaskTypes.includes(t.type));
        // Get pending approvals
        const pendingApprovals = await ctx.db
            .query("approvals")
            .withIndex("by_requestor", (q) => q.eq("requestorAgentId", args.agentId))
            .filter((q) => q.eq(q.field("status"), "PENDING"))
            .collect();
        // Get pending (unread) notifications for this agent
        const allNotifications = await ctx.db
            .query("notifications")
            .withIndex("by_agent", (q) => q.eq("agentId", args.agentId))
            .order("desc")
            .take(60);
        const pendingNotifications = allNotifications
            .filter((n) => n.readAt === undefined)
            .slice(0, 30);
        return {
            success: true,
            agent: await ctx.db.get(args.agentId),
            budgetRemaining,
            budgetExceeded,
            pendingTasks: myPendingTasks,
            claimableTasks,
            pendingApprovals,
            pendingNotifications,
            errorQuarantineWarning: errorStreak >= 3,
        };
    },
});
exports.updateStatus = (0, server_1.mutation)({
    args: {
        agentId: values_1.v.id("agents"),
        status: values_1.v.string(),
        reason: values_1.v.optional(values_1.v.string()),
    },
    handler: async (ctx, args) => {
        const agent = await ctx.db.get(args.agentId);
        if (!agent) {
            return { success: false, error: "Agent not found" };
        }
        const oldStatus = agent.status;
        await ctx.db.patch(args.agentId, {
            status: args.status,
        });
        // Log activity
        await ctx.db.insert("activities", {
            actorType: "SYSTEM",
            actorId: undefined,
            action: "AGENT_STATUS_CHANGED",
            description: `Agent "${agent.name}" status: ${oldStatus} → ${args.status}`,
            targetType: "AGENT",
            targetId: args.agentId,
            agentId: args.agentId,
            beforeState: { status: oldStatus },
            afterState: { status: args.status },
            metadata: { reason: args.reason },
        });
        return { success: true, agent: await ctx.db.get(args.agentId) };
    },
});
/** Pause all ACTIVE agents (emergency "Pause squad") */
exports.pauseAll = (0, server_1.mutation)({
    args: {
        projectId: values_1.v.optional(values_1.v.id("projects")),
        reason: values_1.v.optional(values_1.v.string()),
        userId: values_1.v.optional(values_1.v.string()),
    },
    handler: async (ctx, args) => {
        let active;
        if (args.projectId) {
            active = await ctx.db
                .query("agents")
                .withIndex("by_project_status", (q) => q.eq("projectId", args.projectId).eq("status", "ACTIVE"))
                .collect();
        }
        else {
            active = await ctx.db
                .query("agents")
                .withIndex("by_status", (q) => q.eq("status", "ACTIVE"))
                .collect();
        }
        for (const agent of active) {
            await ctx.db.patch(agent._id, { status: "PAUSED" });
            await ctx.db.insert("activities", {
                projectId: agent.projectId,
                actorType: "HUMAN",
                actorId: args.userId ?? "operator",
                action: "AGENT_PAUSED",
                description: `Agent "${agent.name}" paused (Pause squad)`,
                targetType: "AGENT",
                targetId: agent._id,
                agentId: agent._id,
                metadata: { reason: args.reason },
            });
        }
        return { paused: active.length, agentIds: active.map((a) => a._id) };
    },
});
/** Resume all PAUSED agents */
exports.resumeAll = (0, server_1.mutation)({
    args: {
        projectId: values_1.v.optional(values_1.v.id("projects")),
        reason: values_1.v.optional(values_1.v.string()),
        userId: values_1.v.optional(values_1.v.string()),
    },
    handler: async (ctx, args) => {
        let paused;
        if (args.projectId) {
            paused = await ctx.db
                .query("agents")
                .withIndex("by_project_status", (q) => q.eq("projectId", args.projectId).eq("status", "PAUSED"))
                .collect();
        }
        else {
            paused = await ctx.db
                .query("agents")
                .withIndex("by_status", (q) => q.eq("status", "PAUSED"))
                .collect();
        }
        for (const agent of paused) {
            await ctx.db.patch(agent._id, { status: "ACTIVE" });
            await ctx.db.insert("activities", {
                projectId: agent.projectId,
                actorType: "HUMAN",
                actorId: args.userId ?? "operator",
                action: "AGENT_RESUMED",
                description: `Agent "${agent.name}" resumed`,
                targetType: "AGENT",
                targetId: agent._id,
                agentId: agent._id,
                metadata: { reason: args.reason },
            });
        }
        return { resumed: paused.length, agentIds: paused.map((a) => a._id) };
    },
});
exports.recordSpend = (0, server_1.mutation)({
    args: {
        agentId: values_1.v.id("agents"),
        amount: values_1.v.number(),
        runId: values_1.v.optional(values_1.v.id("runs")),
        description: values_1.v.optional(values_1.v.string()),
    },
    handler: async (ctx, args) => {
        const agent = await ctx.db.get(args.agentId);
        if (!agent) {
            return { success: false, error: "Agent not found" };
        }
        const newSpend = agent.spendToday + args.amount;
        const budgetExceeded = newSpend > agent.budgetDaily;
        await ctx.db.patch(args.agentId, {
            spendToday: newSpend,
        });
        return {
            success: true,
            spendToday: newSpend,
            budgetRemaining: agent.budgetDaily - newSpend,
            budgetExceeded,
        };
    },
});
