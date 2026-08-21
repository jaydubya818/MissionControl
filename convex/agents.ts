/**
 * Agents — Convex Functions
 */

import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { ensureInstanceForLegacyAgent, resolveAgentRef } from "./lib/agentResolver";
import { appendChangeRecord } from "./lib/armAudit";
import type { Id } from "./_generated/dataModel";
import {
  COMPANY_PERMISSIONS,
  requireCompanyAdministrator,
  requireWorkspaceAccess,
} from "./lib/companyAccess";

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
  args: {
    name: v.string(),
    projectId: v.optional(v.id("projects")),
  },
  handler: async (ctx, args) =>
    args.projectId
      ? await ctx.db
          .query("agents")
          .withIndex("by_project_name", (q) =>
            q.eq("projectId", args.projectId).eq("name", args.name)
          )
          .first()
      : await ctx.db
          .query("agents")
          .withIndex("by_name", (q) => q.eq("name", args.name))
          .first(),
});

export const list = query({
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
    return await ctx.db.query("agents").take(1000);
  },
});

/** Alias for backwards compatibility -- enriched with org position info */
export const listAll = query({
  args: {
    projectId: v.optional(v.id("projects")),
    includeOrgPositions: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    let agents;
    if (args.projectId) {
      agents = await ctx.db
        .query("agents")
        .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
        .collect();
    } else {
      agents = await ctx.db.query("agents").take(1000);
    }

    if (!args.includeOrgPositions) return agents;

    // Enrich with org positions
    return await Promise.all(
      agents.map(async (agent) => {
        const positions = await ctx.db
          .query("orgAssignments")
          .withIndex("by_agent", (q) => q.eq("agentId", agent._id))
          .collect();
        return { ...agent, orgPositions: positions };
      })
    );
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
        .withIndex("by_project_status", (q) => 
          q.eq("projectId", args.projectId).eq("status", args.status as any)
        )
        .collect();
    }
    return await ctx.db
      .query("agents")
      .withIndex("by_status", (q) => q.eq("status", args.status as any))
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
        .withIndex("by_project_status", (q) => 
          q.eq("projectId", args.projectId).eq("status", "ACTIVE")
        )
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
    const existing = args.projectId
      ? await ctx.db
          .query("agents")
          .withIndex("by_project_name", (q) =>
            q.eq("projectId", args.projectId).eq("name", args.name)
          )
          .first()
      : await ctx.db
          .query("agents")
          .withIndex("by_name", (q) => q.eq("name", args.name))
          .first();
    
    if (existing) {
      const existingRef = await resolveAgentRef(
        { db: ctx.db as any },
        { agentId: existing._id, createIfMissing: false }
      );
      if (!existingRef) {
        const resolved = await ensureInstanceForLegacyAgent(
          { db: ctx.db as any },
          existing._id
        );
        await appendChangeRecord(ctx.db as any, {
          tenantId: existing.tenantId,
          projectId: existing.projectId,
          templateId: resolved.templateId,
          versionId: resolved.versionId,
          instanceId: resolved.instanceId,
          legacyAgentId: existing._id,
          type: "INSTANCE_CREATED",
          summary: `Created ARM instance for legacy agent ${existing.name}`,
          relatedTable: "agents",
          relatedId: existing._id,
        });
      }

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
    const roleDefaults = budgetDefaults[args.role as keyof typeof budgetDefaults] ?? budgetDefaults.INTERN;
    const project = args.projectId ? await ctx.db.get(args.projectId) : null;
    
    // Create new agent
    const agentId = await ctx.db.insert("agents", {
      tenantId: project?.tenantId,
      projectId: args.projectId,
      name: args.name,
      emoji: args.emoji,
      role: args.role as any,
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
      configVersion: 1,
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

    const resolved = await ensureInstanceForLegacyAgent(
      { db: ctx.db as any },
      agentId
    );
    await appendChangeRecord(ctx.db as any, {
      tenantId: (await ctx.db.get(agentId))?.tenantId,
      projectId: args.projectId,
      templateId: resolved.templateId,
      versionId: resolved.versionId,
      instanceId: resolved.instanceId,
      legacyAgentId: agentId,
      type: "INSTANCE_CREATED",
      summary: `Created ARM instance for agent ${args.name}`,
      relatedTable: "agents",
      relatedId: agentId,
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
    } else {
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
      status: args.status as any ?? agent.status,
    });
    
    // Check budget
    const budgetRemaining = agent.budgetDaily - spendToday;
    const budgetExceeded = budgetRemaining <= 0;
    
    // Find pending work for this agent
    const [readyTasks, legacyAssignedTasks] = await Promise.all([
      ctx.db
        .query("tasks")
        .withIndex("by_status", (q) => q.eq("status", "READY"))
        .take(200),
      ctx.db
        .query("tasks")
        .withIndex("by_status", (q) => q.eq("status", "ASSIGNED"))
        .take(200),
    ]);
    const pendingTasks = [...readyTasks, ...legacyAssignedTasks];
    
    const myPendingTasks = pendingTasks.filter(t => 
      t.projectId === agent.projectId && t.assigneeIds.includes(args.agentId)
    );
    
    // Find inbox tasks matching agent's allowed types
    const inboxTasks = await ctx.db
      .query("tasks")
      .withIndex("by_status", (q) => q.eq("status", "INBOX"))
      .take(200);
    
    const claimableTasks = inboxTasks.filter(t =>
      t.projectId === agent.projectId &&
      !t.labels?.includes("graph-root") &&
      !(t.metadata as { missionChatThreadId?: string } | undefined)?.missionChatThreadId &&
      (agent.allowedTaskTypes.length === 0 || agent.allowedTaskTypes.includes(t.type))
    );
    
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
    projectId: v.optional(v.id("projects")),
    status: v.string(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const agent = await ctx.db.get(args.agentId);
    if (!agent) {
      return { success: false, error: "Agent not found" };
    }
    if (args.projectId && agent.projectId !== args.projectId) {
      return { success: false, error: "Agent does not belong to the selected workspace" };
    }
    
    const oldStatus = agent.status;
    await ctx.db.patch(args.agentId, {
      status: args.status as any,
    });
    
    // Log activity
    await ctx.db.insert("activities", {
      projectId: agent.projectId,
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
/**
 * Authorize a fleet control action and return the server-derived actor.
 *
 * `resetAll` also clears quarantine, which is a safety state set by the control
 * plane — reversing it is a governance decision, never an anonymous one.
 */
async function requireAgentFleetAuthority(
  ctx: any,
  projectId?: Id<"projects">,
): Promise<string> {
  if (!projectId) {
    const admin = await requireCompanyAdministrator(ctx);
    return String(admin.operatorId ?? "demo:company-administrator");
  }
  const project = await ctx.db.get(projectId);
  if (!project?.tenantId) throw new Error("Workspace is unavailable or unauthorized.");
  const access = await requireWorkspaceAccess(ctx, project.tenantId, project._id, {
    permission: COMPANY_PERMISSIONS.MANAGE_WORKSPACES,
  });
  return String(access.membership.operatorId ?? "demo:company-administrator");
}

export const pauseAll = mutation({
  args: {
    projectId: v.optional(v.id("projects")),
    reason: v.optional(v.string()),
    userId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Fleet-wide kill switches. `projectId` is optional and omitting it targets
    // EVERY agent in the deployment, so an unscoped call requires company
    // administration; a scoped call requires workspace management.
    const actorId = await requireAgentFleetAuthority(ctx, args.projectId);
    let active;
    if (args.projectId) {
      active = await ctx.db
        .query("agents")
        .withIndex("by_project_status", (q) => 
          q.eq("projectId", args.projectId).eq("status", "ACTIVE")
        )
        .collect();
    } else {
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
        actorId,
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
    // Fleet-wide kill switches. `projectId` is optional and omitting it targets
    // EVERY agent in the deployment, so an unscoped call requires company
    // administration; a scoped call requires workspace management.
    const actorId = await requireAgentFleetAuthority(ctx, args.projectId);
    let paused;
    if (args.projectId) {
      paused = await ctx.db
        .query("agents")
        .withIndex("by_project_status", (q) => 
          q.eq("projectId", args.projectId).eq("status", "PAUSED")
        )
        .collect();
    } else {
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
        actorId,
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

/** Update agent fields (name, emoji, budget, metadata, etc.) */
export const update = mutation({
  args: {
    agentId: v.id("agents"),
    projectId: v.optional(v.id("projects")),
    expectedConfigVersion: v.optional(v.number()),
    name: v.optional(v.string()),
    emoji: v.optional(v.string()),
    role: v.optional(
      v.union(
        v.literal("INTERN"),
        v.literal("SPECIALIST"),
        v.literal("LEAD"),
        v.literal("CEO")
      )
    ),
    workspacePath: v.optional(v.string()),
    allowedTaskTypes: v.optional(v.array(v.string())),
    allowedTools: v.optional(v.array(v.string())),
    budgetDaily: v.optional(v.number()),
    budgetPerRun: v.optional(v.number()),
    canSpawn: v.optional(v.boolean()),
    maxSubAgents: v.optional(v.number()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const { agentId, projectId, expectedConfigVersion, ...updates } = args;
    const agent = await ctx.db.get(agentId);
    if (!agent) throw new Error("Agent not found");
    if (projectId && agent.projectId !== projectId) {
      throw new Error("Agent does not belong to the selected workspace");
    }
    if (
      expectedConfigVersion !== undefined &&
      expectedConfigVersion !== (agent.configVersion ?? 0)
    ) {
      throw new Error("This agent changed after you opened it. Review the latest values and try again.");
    }

    const name = args.name?.trim();
    const workspacePath = args.workspacePath?.trim();
    if (args.name !== undefined && !name) throw new Error("Agent name is required");
    if (args.workspacePath !== undefined && !workspacePath) {
      throw new Error("Workspace path is required");
    }
    if (args.budgetDaily !== undefined && args.budgetDaily < 0) {
      throw new Error("Daily budget cannot be negative");
    }
    if (args.budgetPerRun !== undefined && args.budgetPerRun < 0) {
      throw new Error("Per-run budget cannot be negative");
    }
    if (
      args.maxSubAgents !== undefined &&
      (!Number.isInteger(args.maxSubAgents) || args.maxSubAgents < 0)
    ) {
      throw new Error("Maximum sub-agents must be a non-negative whole number");
    }

    // Check name uniqueness when renaming
    if (name !== undefined && name !== agent.name) {
      const nameConflict = agent.projectId
        ? await ctx.db
            .query("agents")
            .withIndex("by_project_name", (q) =>
              q.eq("projectId", agent.projectId).eq("name", name)
            )
            .first()
        : await ctx.db
            .query("agents")
            .withIndex("by_name", (q) => q.eq("name", name))
            .first();
      if (nameConflict && nameConflict._id !== agentId) {
        throw new Error(`An agent with the name "${name}" already exists in this workspace`);
      }
    }

    const filtered: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        filtered[key] = value;
      }
    }
    if (name !== undefined) filtered.name = name;
    if (workspacePath !== undefined) filtered.workspacePath = workspacePath;

    if (Object.keys(filtered).length === 0) {
      return agent;
    }

    filtered.configVersion = (agent.configVersion ?? 0) + 1;
    await ctx.db.patch(agentId, filtered);

    await ctx.db.insert("activities", {
      projectId: agent.projectId,
      actorType: "HUMAN",
      actorId: "operator",
      action: "AGENT_UPDATED",
      description: `Agent "${agent.name}" updated`,
      targetType: "AGENT",
      targetId: agentId,
      agentId: agentId,
      metadata: { updatedFields: Object.keys(filtered) },
    });

    return await ctx.db.get(agentId);
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

// ============================================================================
// HEARTBEAT RECOVERY (Internal — called by cron)
// ============================================================================

/**
 * Detect stale agents that haven't sent a heartbeat within the threshold.
 * Recovery flow:
 *   1. Detect: Check lastHeartbeatAt against staleThresholdMs (env: HEARTBEAT_STALE_MINUTES, default 5)
 *   2. Alert: Create a CRITICAL alert in the alerts table
 *   3. Quarantine: Set agent status to QUARANTINED
 *   4. Reassign: Move agent's in-progress tasks to BLOCKED
 *
 * Enable via Convex env: HEARTBEAT_RECOVERY_ENABLED=true.
 * Optionally set HEARTBEAT_IGNORE_NEVER=true to skip agents that have never sent a heartbeat (e.g. seeded only).
 */
export const detectStaleAgents = internalMutation({
  args: {},
  handler: async (ctx) => {
    if (process.env.HEARTBEAT_RECOVERY_ENABLED !== "true") {
      return { checked: 0, staleCount: 0, staleAgents: [], skipped: "HEARTBEAT_RECOVERY_ENABLED not set" };
    }

    const now = Date.now();
    const staleMinutes = parseInt(process.env.HEARTBEAT_STALE_MINUTES ?? "5", 10) || 5;
    const STALE_THRESHOLD_MS = Math.min(Math.max(staleMinutes * 60 * 1000, 60_000), 60 * 60 * 1000); // 1 min to 1 hour
    const ignoreNeverHeartbeat = process.env.HEARTBEAT_IGNORE_NEVER === "true";

    // Get all agents that should be heartbeating (ACTIVE or DRAINED)
    const activeAgents = await ctx.db
      .query("agents")
      .withIndex("by_status", (q) => q.eq("status", "ACTIVE"))
      .collect();
    
    const drainedAgents = await ctx.db
      .query("agents")
      .withIndex("by_status", (q) => q.eq("status", "DRAINED"))
      .collect();
    
    const monitoredAgents = [...activeAgents, ...drainedAgents];
    const staleAgents: Array<{ id: string; name: string; staleDurationMs: number }> = [];
    
    for (const agent of monitoredAgents) {
      const lastHB = agent.lastHeartbeatAt;
      if (ignoreNeverHeartbeat && (lastHB == null || lastHB === 0)) continue;

      // No heartbeat ever, or heartbeat too old
      if (!lastHB || now - lastHB > STALE_THRESHOLD_MS) {
        const staleDuration = lastHB ? now - lastHB : Infinity;
        
        // 1. QUARANTINE the agent
        await ctx.db.patch(agent._id, {
          status: "QUARANTINED",
        });
        
        // 2. CREATE ALERT
        await ctx.db.insert("alerts", {
          projectId: agent.projectId,
          severity: "CRITICAL",
          type: "AGENT_STALE_HEARTBEAT",
          title: `Agent "${agent.name}" is unresponsive`,
          description: lastHB
            ? `Agent "${agent.name}" last heartbeat was ${Math.round((now - lastHB) / 1000)}s ago (threshold: ${STALE_THRESHOLD_MS / 1000}s). Agent has been quarantined.`
            : `Agent "${agent.name}" has never sent a heartbeat. Agent has been quarantined.`,
          agentId: agent._id,
          status: "OPEN",
        });
        
        // 3. LOG ACTIVITY
        await ctx.db.insert("activities", {
          projectId: agent.projectId,
          actorType: "SYSTEM",
          action: "AGENT_QUARANTINED",
          description: `Agent "${agent.name}" quarantined: stale heartbeat`,
          targetType: "AGENT",
          targetId: agent._id,
          agentId: agent._id,
          metadata: {
            reason: "stale_heartbeat",
            lastHeartbeatAt: lastHB,
            staleDurationMs: staleDuration === Infinity ? null : staleDuration,
          },
        });
        
        // 4. BLOCK IN-PROGRESS TASKS assigned to this agent
        if (agent.currentTaskId) {
          const task = await ctx.db.get(agent.currentTaskId);
          if (task && task.status === "IN_PROGRESS") {
            const reason = `Agent "${agent.name}" is unresponsive (stale heartbeat). Task needs reassignment.`;
            const blocker = {
              type: "CAPACITY" as const,
              reason,
              ownerRef: "operator",
              requiredAction: "Reassign the task to a healthy agent or restore the current agent.",
              blockedSince: now,
            };
            await ctx.db.patch(task._id, {
              status: "BLOCKED",
              stateEnteredAt: now,
              blockedReason: reason,
              blocker,
            });

            await ctx.db.insert("taskTransitions", {
              projectId: task.projectId,
              idempotencyKey: `stale-agent:${agent._id}:${task._id}:${now}`,
              taskId: task._id,
              fromStatus: task.status,
              toStatus: "BLOCKED",
              actorType: "SYSTEM",
              actorAgentId: agent._id,
              reason,
              validationResult: { valid: true },
              artifactsSnapshot: { blocker },
            });
            
            // Alert for the blocked task
            await ctx.db.insert("alerts", {
              projectId: task.projectId,
              severity: "WARNING",
              type: "TASK_BLOCKED_STALE_AGENT",
              title: `Task "${task.title}" blocked — agent unresponsive`,
              description: `Task was being worked on by "${agent.name}" who became unresponsive. Task has been moved to BLOCKED for reassignment.`,
              agentId: agent._id,
              taskId: task._id,
              status: "OPEN",
            });
            
            await ctx.db.insert("activities", {
              projectId: task.projectId,
              actorType: "SYSTEM",
              action: "TASK_BLOCKED",
              description: `Task "${task.title}" blocked: agent "${agent.name}" unresponsive`,
              targetType: "TASK",
              targetId: task._id,
              agentId: agent._id,
              metadata: { reason: "agent_stale_heartbeat" },
            });
          }
        }
        
        // Also find any READY or legacy ASSIGNED tasks for this agent and block them.
        const [readyTasks, assignedTasks] = await Promise.all([
          ctx.db
            .query("tasks")
            .withIndex("by_status", (q) => q.eq("status", "READY"))
            .collect(),
          ctx.db
            .query("tasks")
            .withIndex("by_status", (q) => q.eq("status", "ASSIGNED"))
            .collect(),
        ]);
        
        const agentAssignedTasks = [...readyTasks, ...assignedTasks].filter((t) =>
          t.assigneeIds.includes(agent._id)
        );
        
        for (const task of agentAssignedTasks) {
          // Only block if this is the sole assignee
          if (task.assigneeIds.length === 1) {
            const reason = `Sole assignee "${agent.name}" is unresponsive. Task needs reassignment.`;
            const blocker = {
              type: "CAPACITY" as const,
              reason,
              ownerRef: "operator",
              requiredAction: "Reassign the task to a healthy agent or restore the current agent.",
              blockedSince: now,
            };
            await ctx.db.patch(task._id, {
              status: "BLOCKED",
              stateEnteredAt: now,
              blockedReason: reason,
              blocker,
            });

            await ctx.db.insert("taskTransitions", {
              projectId: task.projectId,
              idempotencyKey: `stale-agent:${agent._id}:${task._id}:${now}`,
              taskId: task._id,
              fromStatus: task.status,
              toStatus: "BLOCKED",
              actorType: "SYSTEM",
              actorAgentId: agent._id,
              reason,
              validationResult: { valid: true },
              artifactsSnapshot: { blocker },
            });
          }
        }
        
        staleAgents.push({
          id: agent._id,
          name: agent.name,
          staleDurationMs: staleDuration === Infinity ? -1 : staleDuration,
        });
      }
    }
    
    return {
      checked: monitoredAgents.length,
      staleCount: staleAgents.length,
      staleAgents,
    };
  },
});

// ============================================================================
// RESET ALL AGENTS (Dev convenience — reactivate quarantined/offline agents)
// ============================================================================

/**
 * Reset all quarantined/offline agents back to ACTIVE with a fresh heartbeat.
 * Useful during development when no agent runtime is sending heartbeats.
 */
export const resetAll = mutation({
  args: {
    projectId: v.optional(v.id("projects")),
  },
  handler: async (ctx, args) => {
    // Fleet-wide kill switches. `projectId` is optional and omitting it targets
    // EVERY agent in the deployment, so an unscoped call requires company
    // administration; a scoped call requires workspace management.
    const actorId = await requireAgentFleetAuthority(ctx, args.projectId);
    const now = Date.now();
    const agents = args.projectId
      ? await ctx.db
          .query("agents")
          .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
          .collect()
      : await ctx.db.query("agents").collect();

    let resetCount = 0;
    for (const agent of agents) {
      if (agent.status === "QUARANTINED" || agent.status === "OFFLINE") {
        const oldStatus = agent.status;
        await ctx.db.patch(agent._id, {
          status: "ACTIVE",
          lastHeartbeatAt: now,
          errorStreak: 0,
          lastError: undefined,
        });

        // Log activity for each reset agent (consistent with updateStatus/pauseAll/resumeAll)
        await ctx.db.insert("activities", {
          projectId: agent.projectId,
          actorType: "HUMAN",
          actorId: "operator",
          action: "AGENT_RESET",
          description: `Agent "${agent.name}" reset: ${oldStatus} → ACTIVE`,
          targetType: "AGENT",
          targetId: agent._id,
          agentId: agent._id,
          beforeState: { status: oldStatus },
          afterState: { status: "ACTIVE" },
          metadata: { reason: "manual_reset" },
        });

        resetCount++;
      }
    }

    return { resetCount, totalAgents: agents.length };
  },
});
