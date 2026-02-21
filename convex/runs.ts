/**
 * Runs — Convex Functions
 * 
 * Agent execution turn tracking and cost accounting.
 */

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { logTaskEvent } from "./lib/taskEvents";
import { evaluateOperatorGate, getEffectiveOperatorControl } from "./lib/operatorControls";
import { ensureInstanceForLegacyAgent } from "./lib/agentResolver";
import { appendChangeRecord, appendOpEvent } from "./lib/armAudit";
import { preferInstanceRefs } from "./lib/armCompat";
import { classifyRisk } from "./lib/riskClassifier";
import { evaluatePolicyEnvelopes } from "./lib/armPolicy";
import { evaluateLegacyToolPolicy } from "./lib/legacyToolPolicy";

function toPreview(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  try {
    const raw = typeof value === "string" ? value : JSON.stringify(value);
    return raw.length > 600 ? `${raw.slice(0, 597)}...` : raw;
  } catch {
    return "[unserializable]";
  }
}

// ============================================================================
// QUERIES
// ============================================================================

export const get = query({
  args: { runId: v.id("runs") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.runId);
  },
});

export const listByAgent = query({
  args: { 
    agentId: v.id("agents"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    if (preferInstanceRefs()) {
      const resolved = await ensureInstanceForLegacyAgent(
        { db: ctx.db as any },
        args.agentId
      );
      return await ctx.db
        .query("runs")
        .withIndex("by_instance", (q) => q.eq("instanceId", resolved.instanceId))
        .order("desc")
        .take(args.limit ?? 50);
    }

    return await ctx.db
      .query("runs")
      .withIndex("by_agent", (q) => q.eq("agentId", args.agentId))
      .order("desc")
      .take(args.limit ?? 50);
  },
});

export const listByTask = query({
  args: { 
    taskId: v.id("tasks"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("runs")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .order("desc")
      .take(args.limit ?? 50);
  },
});

export const listRecent = query({
  args: {
    projectId: v.optional(v.id("projects")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let runs = await ctx.db
      .query("runs")
      .order("desc")
      .take(args.limit ?? 100);
    
    // Filter by project if provided
    if (args.projectId) {
      runs = runs.filter((r) => r.projectId === args.projectId);
    }
    
    return runs;
  },
});

// ============================================================================
// MUTATIONS
// ============================================================================

export const start = mutation({
  args: {
    agentId: v.id("agents"),
    taskId: v.optional(v.id("tasks")),
    sessionKey: v.string(),
    model: v.string(),
    idempotencyKey: v.string(),
    estimatedCost: v.optional(v.number()),
    toolName: v.optional(v.string()),
    toolArgs: v.optional(v.any()),
    metadata: v.optional(v.any()),
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

    const operatorControl = await getEffectiveOperatorControl(ctx.db, agent.projectId);
    const operatorGate = evaluateOperatorGate({
      mode: operatorControl.mode,
      actorType: "AGENT",
      operation: "RUN_START",
    });
    if (operatorGate.decision !== "ALLOW") {
      throw new Error(operatorGate.reason);
    }

    const estimatedCost = args.estimatedCost ?? 0;
    if (estimatedCost > 0 && estimatedCost > agent.budgetPerRun) {
      throw new Error(
        `Estimated run cost ($${estimatedCost.toFixed(2)}) exceeds per-run budget ($${agent.budgetPerRun.toFixed(2)})`
      );
    }
    
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

      if (estimatedCost > 0 && task.actualCost + estimatedCost > task.budgetAllocated) {
        throw new Error(
          `Estimated run cost would exceed task budget ($${task.actualCost.toFixed(2)} + $${estimatedCost.toFixed(2)} > $${task.budgetAllocated.toFixed(2)})`
        );
      }
    }
    
    const resolved = await ensureInstanceForLegacyAgent(
      { db: ctx.db as any },
      args.agentId
    );
    const instance = await ctx.db.get(resolved.instanceId);
    const effectiveTenantId = agent.tenantId ?? instance?.tenantId;
    const riskLevel = args.toolName
      ? classifyRisk(args.toolName, args.toolArgs as Record<string, unknown> | undefined)
      : "GREEN";
    const armDecision = await evaluatePolicyEnvelopes(ctx.db as any, {
      tenantId: effectiveTenantId,
      projectId: agent.projectId,
      versionId: resolved.versionId,
      toolName: args.toolName,
      riskLevel,
    });
    const budgetRemaining = Math.max(agent.budgetDaily - agent.spendToday, 0);
    const activeLegacyPolicy = !armDecision && args.toolName
      ? await ctx.db
          .query("policies")
          .withIndex("by_active", (q) => q.eq("active", true))
          .first()
      : null;
    const legacyDecision =
      !armDecision && args.toolName
        ? evaluateLegacyToolPolicy({
            policy: activeLegacyPolicy,
            agentRole: agent.role as "INTERN" | "SPECIALIST" | "LEAD" | "CEO",
            budgetRemaining,
            estimatedCost,
            toolName: args.toolName,
            toolArgs: args.toolArgs,
          })
        : null;

    if (armDecision?.decision === "DENY") {
      const changeRecordId = await appendChangeRecord(ctx.db as any, {
        tenantId: effectiveTenantId,
        projectId: agent.projectId,
        templateId: resolved.templateId,
        versionId: resolved.versionId,
        instanceId: resolved.instanceId,
        legacyAgentId: args.agentId,
        type: "POLICY_DENIED",
        summary: armDecision.reason,
        payload: {
          toolName: args.toolName,
          riskLevel,
          actionType: args.toolName ? "TOOL_CALL" : "RUN_START",
        },
      });

      await appendOpEvent(ctx.db as any, {
        tenantId: effectiveTenantId,
        projectId: agent.projectId,
        instanceId: resolved.instanceId,
        versionId: resolved.versionId,
        taskId: args.taskId,
        type: "TOOL_CALL_BLOCKED",
        changeRecordId,
        payload: {
          decision: "DENY",
          reason: armDecision.reason,
          toolName: args.toolName,
          riskLevel,
        },
      });

      throw new Error(armDecision.reason);
    }
    if (!armDecision && legacyDecision?.decision === "DENY") {
      const changeRecordId = await appendChangeRecord(ctx.db as any, {
        tenantId: effectiveTenantId,
        projectId: agent.projectId,
        templateId: resolved.templateId,
        versionId: resolved.versionId,
        instanceId: resolved.instanceId,
        legacyAgentId: args.agentId,
        type: "POLICY_DENIED",
        summary: legacyDecision.reason,
        payload: {
          toolName: args.toolName,
          riskLevel,
          actionType: "TOOL_CALL",
          source: "LEGACY_POLICY_FALLBACK",
        },
      });

      await appendOpEvent(ctx.db as any, {
        tenantId: effectiveTenantId,
        projectId: agent.projectId,
        instanceId: resolved.instanceId,
        versionId: resolved.versionId,
        taskId: args.taskId,
        type: "TOOL_CALL_BLOCKED",
        changeRecordId,
        payload: {
          decision: "DENY",
          reason: legacyDecision.reason,
          toolName: args.toolName,
          riskLevel,
          source: "LEGACY_POLICY_FALLBACK",
        },
      });

      throw new Error(legacyDecision.reason);
    }

    if (armDecision?.decision === "NEEDS_APPROVAL") {
      const actionType = args.toolName ? "TOOL_CALL" : "RUN_START";
      const pending = await ctx.db
        .query("approvalRecords")
        .withIndex("by_instance", (q) => q.eq("instanceId", resolved.instanceId))
        .collect();
      const existing = pending.find(
        (row) =>
          row.status === "PENDING" &&
          row.actionType === actionType &&
          (row.metadata as any)?.idempotencyKey === args.idempotencyKey
      );

      if (!existing) {
        await ctx.db.insert("approvalRecords", {
          tenantId: effectiveTenantId,
          projectId: agent.projectId,
          instanceId: resolved.instanceId,
          versionId: resolved.versionId,
          actionType,
          riskLevel,
          justification: armDecision.reason,
          escalationLevel: riskLevel === "RED" ? 2 : riskLevel === "YELLOW" ? 1 : 0,
          status: "PENDING",
          requestedAt: Date.now(),
          metadata: {
            source: "runs.start",
            idempotencyKey: args.idempotencyKey,
            toolName: args.toolName,
          },
        });
      }

      await appendChangeRecord(ctx.db as any, {
        tenantId: effectiveTenantId,
        projectId: agent.projectId,
        templateId: resolved.templateId,
        versionId: resolved.versionId,
        instanceId: resolved.instanceId,
        legacyAgentId: args.agentId,
        type: "APPROVAL_REQUESTED",
        summary: `ARM policy requires approval: ${actionType}`,
        payload: {
          reason: armDecision.reason,
          toolName: args.toolName,
          riskLevel,
        },
      });

      await appendOpEvent(ctx.db as any, {
        tenantId: effectiveTenantId,
        projectId: agent.projectId,
        instanceId: resolved.instanceId,
        versionId: resolved.versionId,
        taskId: args.taskId,
        type: "DECISION_MADE",
        payload: {
          decision: "NEEDS_APPROVAL",
          reason: armDecision.reason,
          toolName: args.toolName,
          riskLevel,
        },
      });

      throw new Error(`ARM policy requires approval: ${armDecision.reason}`);
    }
    if (!armDecision && legacyDecision?.decision === "NEEDS_APPROVAL") {
      const actionType = "TOOL_CALL";
      const pending = await ctx.db
        .query("approvalRecords")
        .withIndex("by_instance", (q) => q.eq("instanceId", resolved.instanceId))
        .collect();
      const existing = pending.find(
        (row) =>
          row.status === "PENDING" &&
          row.actionType === actionType &&
          (row.metadata as any)?.idempotencyKey === args.idempotencyKey
      );

      if (!existing) {
        await ctx.db.insert("approvalRecords", {
          tenantId: effectiveTenantId,
          projectId: agent.projectId,
          instanceId: resolved.instanceId,
          versionId: resolved.versionId,
          actionType,
          riskLevel,
          justification: legacyDecision.reason,
          escalationLevel: riskLevel === "RED" ? 2 : riskLevel === "YELLOW" ? 1 : 0,
          status: "PENDING",
          requestedAt: Date.now(),
          metadata: {
            source: "runs.start.legacyFallback",
            idempotencyKey: args.idempotencyKey,
            toolName: args.toolName,
          },
        });
      }

      await appendChangeRecord(ctx.db as any, {
        tenantId: effectiveTenantId,
        projectId: agent.projectId,
        templateId: resolved.templateId,
        versionId: resolved.versionId,
        instanceId: resolved.instanceId,
        legacyAgentId: args.agentId,
        type: "APPROVAL_REQUESTED",
        summary: `Legacy policy requires approval: ${actionType}`,
        payload: {
          reason: legacyDecision.reason,
          toolName: args.toolName,
          riskLevel,
          source: "LEGACY_POLICY_FALLBACK",
        },
      });

      await appendOpEvent(ctx.db as any, {
        tenantId: effectiveTenantId,
        projectId: agent.projectId,
        instanceId: resolved.instanceId,
        versionId: resolved.versionId,
        taskId: args.taskId,
        type: "DECISION_MADE",
        payload: {
          decision: "NEEDS_APPROVAL",
          reason: legacyDecision.reason,
          toolName: args.toolName,
          riskLevel,
          source: "LEGACY_POLICY_FALLBACK",
        },
      });

      throw new Error(`Legacy policy requires approval: ${legacyDecision.reason}`);
    }

    const policySource = armDecision ? "ARM_POLICY_ENVELOPE" : legacyDecision ? "LEGACY_POLICY_FALLBACK" : "NONE";
    const policyReason = armDecision?.reason ?? legacyDecision?.reason ?? "No policy gate applied";

    // Fetch mission statement to inject into run context
    let missionStatement: string | null = null;
    if (effectiveTenantId) {
      const tenant = await ctx.db.get(effectiveTenantId);
      missionStatement = (tenant as any)?.missionStatement ?? null;
    }

    const runId = await ctx.db.insert("runs", {
      tenantId: effectiveTenantId,
      projectId: agent.projectId,
      idempotencyKey: args.idempotencyKey,
      agentId: args.agentId,
      instanceId: resolved.instanceId,
      versionId: resolved.versionId,
      templateId: resolved.templateId,
      taskId: args.taskId,
      sessionKey: args.sessionKey,
      startedAt: Date.now(),
      model: args.model,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      budgetAllocated: agent.budgetPerRun,
      status: "RUNNING",
      metadata: {
        ...args.metadata,
        missionStatement,
      },
    });
    const run = await ctx.db.get(runId);
    if (!run) {
      throw new Error("Failed to create run");
    }

    await appendOpEvent(ctx.db as any, {
      tenantId: run.tenantId,
      projectId: run.projectId,
      instanceId: run.instanceId,
      versionId: run.versionId,
      taskId: run.taskId,
      runId: run._id,
      type: "RUN_STARTED",
      payload: {
        model: run.model,
        sessionKey: run.sessionKey,
      },
    });

    if (args.toolName) {
      const toolCallId = await ctx.db.insert("toolCalls", {
        tenantId: effectiveTenantId,
        projectId: agent.projectId,
        runId,
        agentId: args.agentId,
        instanceId: resolved.instanceId,
        versionId: resolved.versionId,
        taskId: args.taskId,
        toolName: args.toolName,
        riskLevel,
        policyResult: {
          decision: "ALLOW",
          reason: policyReason,
        },
        inputPreview: toPreview(args.toolArgs),
        startedAt: Date.now(),
        status: "RUNNING",
        retryCount: 0,
      });

      await ctx.db.patch(runId, {
        metadata: {
          ...(run.metadata ?? {}),
          toolCallId,
          toolName: args.toolName,
        },
      });

      await appendOpEvent(ctx.db as any, {
        tenantId: effectiveTenantId,
        projectId: agent.projectId,
        instanceId: resolved.instanceId,
        versionId: resolved.versionId,
        taskId: args.taskId,
        runId,
        toolCallId,
        type: "TOOL_CALL_STARTED",
        payload: {
          toolName: args.toolName,
          riskLevel,
          source: policySource,
        },
      });
    }

    if (args.taskId) {
      await logTaskEvent(ctx, {
        projectId: agent.projectId,
        taskId: args.taskId,
        eventType: "RUN_STARTED",
        actorType: "AGENT",
        actorId: args.agentId.toString(),
        relatedId: runId,
        metadata: {
          model: args.model,
          sessionKey: args.sessionKey,
          operatorMode: operatorControl.mode,
          estimatedCost,
        },
      });
    }
    
    return { run, created: true };
  },
});

export const complete = mutation({
  args: {
    runId: v.id("runs"),
    inputTokens: v.number(),
    outputTokens: v.number(),
    cacheReadTokens: v.optional(v.number()),
    cacheWriteTokens: v.optional(v.number()),
    costUsd: v.number(),
    error: v.optional(v.string()),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) {
      return { success: false, error: "Run not found" };
    }
    
    const now = Date.now();
    const durationMs = now - run.startedAt;
    const metadata = (run.metadata ?? {}) as Record<string, unknown>;
    const toolCallId = metadata.toolCallId as Id<"toolCalls"> | undefined;
    
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
      status: (args.error ? "FAILED" : args.status ?? "COMPLETED") as any,
      error: args.error,
    });
    const updatedRun = await ctx.db.get(args.runId);
    if (updatedRun) {
      await appendOpEvent(ctx.db as any, {
        tenantId: updatedRun.tenantId,
        projectId: updatedRun.projectId,
        instanceId: updatedRun.instanceId,
        versionId: updatedRun.versionId,
        taskId: updatedRun.taskId,
        runId: updatedRun._id,
        type: args.error ? "RUN_FAILED" : "RUN_COMPLETED",
        payload: {
          costUsd: args.costUsd,
          durationMs,
          inputTokens: args.inputTokens,
          outputTokens: args.outputTokens,
          status: args.error ? "FAILED" : args.status ?? "COMPLETED",
        },
      });

      if (toolCallId) {
        const toolCall = await ctx.db.get(toolCallId);
        if (toolCall) {
          await ctx.db.patch(toolCallId, {
            endedAt: now,
            durationMs,
            outputPreview: toPreview(args.error ? { error: args.error } : { status: args.status ?? "COMPLETED" }),
            status: args.error ? "FAILED" : "SUCCESS",
            error: args.error,
          });

          await appendOpEvent(ctx.db as any, {
            tenantId: updatedRun.tenantId,
            projectId: updatedRun.projectId,
            instanceId: updatedRun.instanceId,
            versionId: updatedRun.versionId,
            taskId: updatedRun.taskId,
            runId: updatedRun._id,
            toolCallId,
            type: "TOOL_CALL_COMPLETED",
            payload: {
              toolName: toolCall.toolName,
              status: args.error ? "FAILED" : "SUCCESS",
              error: args.error,
              durationMs,
            },
          });
        }
      }
    }
    
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

    if (run.taskId) {
      await logTaskEvent(ctx, {
        projectId: run.projectId,
        taskId: run.taskId,
        eventType: args.error ? "RUN_FAILED" : "RUN_COMPLETED",
        actorType: "AGENT",
        actorId: run.agentId.toString(),
        relatedId: args.runId,
        metadata: {
          status: args.error ? "FAILED" : args.status ?? "COMPLETED",
          costUsd: args.costUsd,
          durationMs,
          inputTokens: args.inputTokens,
          outputTokens: args.outputTokens,
        },
        afterState: {
          costUsd: args.costUsd,
        },
      });
    }
    
    return { success: true, run: await ctx.db.get(args.runId) };
  },
});

export const getStats = query({
  args: { 
    agentId: v.optional(v.id("agents")),
    taskId: v.optional(v.id("tasks")),
    sinceDaysAgo: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let runs;

    if (args.agentId) {
      const agentId = args.agentId;
      runs = await ctx.db
        .query("runs")
        .withIndex("by_agent", (q) => q.eq("agentId", agentId))
        .collect();
    } else if (args.taskId) {
      const taskId = args.taskId;
      runs = await ctx.db
        .query("runs")
        .withIndex("by_task", (q) => q.eq("taskId", taskId))
        .collect();
    } else {
      // No filter specified — cap at 1000 to prevent unbounded full-table scan
      runs = await ctx.db.query("runs").take(1000);
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
