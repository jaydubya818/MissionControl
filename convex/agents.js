/**
 * Agents — Convex Functions
 */
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
// ============================================================================
// QUERIES
// ============================================================================
export const get = query({
    args: { agentId: v.id("agents") },
    handler: async (ctx, args) => {
        return await ctx.db.get(args.agentId);
    },
});
export const getByName = query({
    args: { name: v.string() },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("agents")
            .withIndex("by_name", (q) => q.eq("name", args.name))
            .first();
    },
});
export const listAll = query({
    args: {
        projectId: v.optional(v.id("projects")),
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
export const listByStatus = query({
    args: {
        projectId: v.optional(v.id("projects")),
        status: v.string(),
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
export const listActive = query({
    args: {
        projectId: v.optional(v.id("projects")),
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
export const register = mutation({
    args: {
        projectId: v.optional(v.id("projects")),
        name: v.string(),
        emoji: v.optional(v.string()),
        role: v.string(),
        workspacePath: v.string(),
        soulVersionHash: v.optional(v.string()),
        allowedTaskTypes: v.optional(v.array(v.string())),
        allowedTools: v.optional(v.array(v.string())),
        budgetDaily: v.optional(v.number()),
        budgetPerRun: v.optional(v.number()),
        canSpawn: v.optional(v.boolean()),
        maxSubAgents: v.optional(v.number()),
        parentAgentId: v.optional(v.id("agents")),
        metadata: v.optional(v.any()),
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
export const heartbeat = mutation({
    args: {
        agentId: v.id("agents"),
        sessionKey: v.optional(v.string()),
        currentTaskId: v.optional(v.id("tasks")),
        spendSinceLastHeartbeat: v.optional(v.number()),
        soulVersionHash: v.optional(v.string()),
        status: v.optional(v.string()),
        errorMessage: v.optional(v.string()),
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
export const updateStatus = mutation({
    args: {
        agentId: v.id("agents"),
        status: v.string(),
        reason: v.optional(v.string()),
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
export const pauseAll = mutation({
    args: {
        projectId: v.optional(v.id("projects")),
        reason: v.optional(v.string()),
        userId: v.optional(v.string()),
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
export const resumeAll = mutation({
    args: {
        projectId: v.optional(v.id("projects")),
        reason: v.optional(v.string()),
        userId: v.optional(v.string()),
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
export const recordSpend = mutation({
    args: {
        agentId: v.id("agents"),
        amount: v.number(),
        runId: v.optional(v.id("runs")),
        description: v.optional(v.string()),
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
