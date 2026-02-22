/**
 * E2E Testing — Convex Functions
 * 
 * Deterministic seed data for end-to-end validation.
 * All objects created with E2E_<timestamp>_<shortid> prefix.
 */

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

/**
 * Seed E2E test data
 * Creates agents, tasks, content drops, and budget entries for validation.
 */
export const seed = mutation({
  args: {
    runId: v.string(),
  },
  handler: async (ctx, args) => {
    const { runId } = args;
    const results = {
      agents: [] as Array<{ id: string; name: string }>,
      tasks: [] as Array<{ id: string; title: string; status: string; type: string }>,
      contentDrops: [] as Array<{ id: string; title: string }>,
      budgetEntries: [] as Array<{ id: string; amount: number }>,
      budgetTotal: 0,
    };

    // ============================================================================
    // A) Create E2E Agents (2)
    // ============================================================================
    
    // Agent 1: e2e_scout
    const scoutAgentId = await ctx.db.insert("agents", {
      name: `e2e_scout_${runId}`,
      emoji: "🔍",
      role: "SPECIALIST",
      status: "ACTIVE",
      workspacePath: "/work/mc-e2e",
      allowedTaskTypes: ["ENGINEERING", "DOCS", "OPS"],
      allowedTools: ["convex", "git", "github"],
      budgetDaily: 10.00,
      budgetPerRun: 2.00,
      spendToday: 0,
      canSpawn: false,
      maxSubAgents: 0,
      errorStreak: 0,
      lastHeartbeatAt: Date.now(),
      metadata: {
        e2eRunId: runId,
        capabilities: ["repo_scan", "workflow_boot", "reporting"],
      },
    });
    
    results.agents.push({ id: scoutAgentId.toString(), name: `e2e_scout_${runId}` });
    
    // Agent 2: e2e_executor
    const executorAgentId = await ctx.db.insert("agents", {
      name: `e2e_executor_${runId}`,
      emoji: "⚙️",
      role: "SPECIALIST",
      status: "ACTIVE",
      workspacePath: "/work/mc-e2e",
      allowedTaskTypes: ["ENGINEERING", "DOCS", "OPS"],
      allowedTools: ["convex", "tasks", "content"],
      budgetDaily: 10.00,
      budgetPerRun: 2.00,
      spendToday: 0,
      canSpawn: false,
      maxSubAgents: 0,
      errorStreak: 0,
      lastHeartbeatAt: Date.now(),
      metadata: {
        e2eRunId: runId,
        capabilities: ["task_claim", "state_advance", "content_drop", "budget_write"],
      },
    });
    
    results.agents.push({ id: executorAgentId.toString(), name: `e2e_executor_${runId}` });

    // Log activity
    await ctx.db.insert("activities", {
      actorType: "SYSTEM",
      action: "E2E_SEED_AGENTS",
      description: `Created 2 E2E agents for run ${runId}`,
      targetType: "SYSTEM",
      metadata: { runId, agentCount: 2 },
    });

    // ============================================================================
    // B) Create E2E Inbox Tasks (3)
    // ============================================================================
    
    // Task 1: Inbox roundtrip
    const inboxTaskId = await ctx.db.insert("tasks", {
      title: "E2E: Verify inbox claim/complete",
      type: "ENGINEERING",
      status: "INBOX",
      priority: 2,
      description: `Test task for E2E inbox roundtrip validation. Run: ${runId}`,
      assigneeIds: [],
      createdBy: "SYSTEM",
      source: "SEED",
      reviewCycles: 0,
      actualCost: 0,
      metadata: {
        e2eRunId: runId,
        testType: "inbox_roundtrip",
        expectedStates: ["INBOX", "ASSIGNED", "IN_PROGRESS", "DONE"],
      },
    });
    
    results.tasks.push({ 
      id: inboxTaskId.toString(), 
      title: "E2E: Verify inbox claim/complete",
      status: "INBOX",
      type: "e2e_inbox_roundtrip"
    });
    
    // Task 2: Content drop test
    const contentTaskId = await ctx.db.insert("tasks", {
      title: "E2E: Submit content drop",
      type: "ENGINEERING",
      status: "INBOX",
      priority: 2,
      description: `Test task for E2E content drop validation. Run: ${runId}`,
      assigneeIds: [],
      createdBy: "SYSTEM",
      source: "SEED",
      reviewCycles: 0,
      actualCost: 0,
      metadata: {
        e2eRunId: runId,
        testType: "content_drop",
        expected: "drop exists + retrievable",
      },
    });
    
    results.tasks.push({ 
      id: contentTaskId.toString(), 
      title: "E2E: Submit content drop",
      status: "INBOX",
      type: "e2e_content_drop"
    });
    
    // Task 3: Budget ledger test
    const budgetTaskId = await ctx.db.insert("tasks", {
      title: "E2E: Budget ledger write/read",
      type: "ENGINEERING",
      status: "INBOX",
      priority: 2,
      description: `Test task for E2E budget validation. Run: ${runId}`,
      assigneeIds: [],
      createdBy: "SYSTEM",
      source: "SEED",
      reviewCycles: 0,
      actualCost: 0,
      metadata: {
        e2eRunId: runId,
        testType: "budget_roundtrip",
        expected: "ledger entry exists + totals match",
      },
    });
    
    results.tasks.push({ 
      id: budgetTaskId.toString(), 
      title: "E2E: Budget ledger write/read",
      status: "INBOX",
      type: "e2e_budget_roundtrip"
    });

    // ============================================================================
    // C) Create E2E Content Drops (2)
    // ============================================================================
    
    // Drop 1: Simple note
    const drop1Id = await ctx.db.insert("contentDrops", {
      agentId: executorAgentId,
      title: "e2e-drop: hello",
      contentType: "OTHER",
      status: "DRAFT",
      content: "Hello from E2E test",
      metadata: {
        e2eRunId: runId,
        source: "doctor",
        kind: "note",
      },
    });
    
    results.contentDrops.push({ id: drop1Id.toString(), title: "e2e-drop: hello" });
    
    // Drop 2: Structured JSON
    const drop2Id = await ctx.db.insert("contentDrops", {
      agentId: executorAgentId,
      title: "e2e-drop: structured",
      contentType: "OTHER",
      status: "DRAFT",
      content: JSON.stringify({ a: 1, b: 2 }),
      metadata: {
        e2eRunId: runId,
        source: "doctor",
        kind: "json",
        payload: { a: 1, b: 2 },
      },
    });
    
    results.contentDrops.push({ id: drop2Id.toString(), title: "e2e-drop: structured" });

    // ============================================================================
    // D) Create E2E Budget Ledger Entries (2)
    // ============================================================================
    
    // Entry 1: +1.00 units
    await ctx.db.insert("activities", {
      actorType: "SYSTEM",
      action: "E2E_BUDGET_CREDIT",
      description: `E2E budget credit for run ${runId}`,
      targetType: "AGENT",
      targetId: executorAgentId,
      agentId: executorAgentId,
      metadata: {
        e2eRunId: runId,
        category: "e2e",
        amount: 1.00,
        reason: "doctor seed",
        type: "credit",
      },
    });
    
    results.budgetEntries.push({ id: "credit_1", amount: 1.00 });
    
    // Entry 2: -0.25 units
    await ctx.db.insert("activities", {
      actorType: "SYSTEM",
      action: "E2E_BUDGET_DEBIT",
      description: `E2E budget debit for run ${runId}`,
      targetType: "AGENT",
      targetId: executorAgentId,
      agentId: executorAgentId,
      metadata: {
        e2eRunId: runId,
        category: "e2e",
        amount: -0.25,
        reason: "doctor seed",
        type: "debit",
      },
    });
    
    results.budgetEntries.push({ id: "debit_1", amount: -0.25 });
    results.budgetTotal = 0.75; // +1.00 - 0.25

    // Update agent spend to reflect budget entries
    await ctx.db.patch(executorAgentId, {
      spendToday: 0.25, // Only the debit counts as spend
    });

    // ============================================================================
    // E) Create Workflow Seed (1 minimal run)
    // ============================================================================
    
    const workflowRunId = await ctx.db.insert("workflowRuns", {
      runId: `e2e-${runId}`,
      workflowId: "feature-dev",
      status: "PENDING",
      initialInput: `E2E test workflow run. Goal: Add a README line in toy repo. Run: ${runId}`,
      startedAt: Date.now(),
      totalSteps: 3,
      currentStepIndex: 0,
      steps: [],
      context: {
        e2eRunId: runId,
        testType: "minimal_workflow",
        goal: "Add a README line in /work/mc-e2e/toy-repo",
      },
      metadata: {
        e2eRunId: runId,
        isE2E: true,
      },
    });

    // Log seed completion
    await ctx.db.insert("activities", {
      actorType: "SYSTEM",
      action: "E2E_SEED_COMPLETE",
      description: `E2E seed completed for run ${runId}`,
      targetType: "SYSTEM",
      metadata: {
        runId,
        agentsCreated: results.agents.length,
        tasksCreated: results.tasks.length,
        dropsCreated: results.contentDrops.length,
        budgetEntries: results.budgetEntries.length,
        workflowRunId: workflowRunId.toString(),
      },
    });

    return {
      success: true,
      runId,
      ...results,
      workflowRunId: workflowRunId.toString(),
    };
  },
});

/**
 * Cleanup E2E test data
 * Deletes or archives all objects with matching runId.
 */
export const cleanup = mutation({
  args: {
    runId: v.string(),
  },
  handler: async (ctx, args) => {
    const { runId } = args;
    const results = {
      agentsDeleted: 0,
      tasksDeleted: 0,
      dropsDeleted: 0,
      activitiesDeleted: 0,
      workflowRunsDeleted: 0,
    };

    // Delete agents by name prefix
    const allAgents = await ctx.db
      .query("agents")
      .collect();
    
    for (const agent of allAgents) {
      if (agent.name?.startsWith(`e2e_scout_${runId}`) || agent.name?.startsWith(`e2e_executor_${runId}`)) {
        await ctx.db.delete(agent._id);
        results.agentsDeleted++;
      }
    }

    // Delete tasks
    const tasks = await ctx.db
      .query("tasks")
      .filter((q) => q.eq("metadata.e2eRunId", runId))
      .collect();
    
    for (const task of tasks) {
      await ctx.db.delete(task._id);
      results.tasksDeleted++;
    }

    // Delete content drops
    const drops = await ctx.db
      .query("contentDrops")
      .filter((q) => q.eq("metadata.e2eRunId", runId))
      .collect();
    
    for (const drop of drops) {
      await ctx.db.delete(drop._id);
      results.dropsDeleted++;
    }

    // Delete workflow runs
    const workflowRuns = await ctx.db
      .query("workflowRuns")
      .filter((q) => q.eq("metadata.e2eRunId", runId))
      .collect();
    
    for (const wr of workflowRuns) {
      await ctx.db.delete(wr._id);
      results.workflowRunsDeleted++;
    }

    // Delete activities
    const activities = await ctx.db
      .query("activities")
      .filter((q) => q.eq("metadata.e2eRunId", runId))
      .collect();
    
    for (const activity of activities) {
      await ctx.db.delete(activity._id);
      results.activitiesDeleted++;
    }

    // Log cleanup
    await ctx.db.insert("activities", {
      actorType: "SYSTEM",
      action: "E2E_CLEANUP_COMPLETE",
      description: `E2E cleanup completed for run ${runId}`,
      targetType: "SYSTEM",
      metadata: {
        runId,
        ...results,
      },
    });

    return {
      success: true,
      runId,
      ...results,
    };
  },
});

/**
 * Validate E2E seed data
 * Checks that all expected objects exist and are valid.
 */
export const validate = query({
  args: {
    runId: v.string(),
  },
  handler: async (ctx, args) => {
    const { runId } = args;
    const results = {
      agents: { found: 0, expected: 2, valid: true },
      tasks: { found: 0, expected: 3, valid: true },
      contentDrops: { found: 0, expected: 2, valid: true },
      budget: { total: 0, expected: 0.75, valid: true },
      workflowRuns: { found: 0, expected: 1, valid: true },
      allValid: true,
    };

    // Check agents
    const agents = await ctx.db
      .query("agents")
      .filter((q) => q.eq("metadata.e2eRunId", runId))
      .collect();
    results.agents.found = agents.length;
    results.agents.valid = agents.length >= 2;

    // Check tasks
    const tasks = await ctx.db
      .query("tasks")
      .filter((q) => q.eq("metadata.e2eRunId", runId))
      .collect();
    results.tasks.found = tasks.length;
    results.tasks.valid = tasks.length >= 3;

    // Check content drops
    const drops = await ctx.db
      .query("contentDrops")
      .filter((q) => q.eq("metadata.e2eRunId", runId))
      .collect();
    results.contentDrops.found = drops.length;
    results.contentDrops.valid = drops.length >= 2;

    // Check budget
    const budgetActivities = await ctx.db
      .query("activities")
      .filter((q) => 
        q.and(
          q.eq("metadata.e2eRunId", runId),
          q.or(
            q.eq("action", "E2E_BUDGET_CREDIT"),
            q.eq("action", "E2E_BUDGET_DEBIT")
          )
        )
      )
      .collect();
    
    let total = 0;
    for (const act of budgetActivities) {
      total += act.metadata?.amount || 0;
    }
    results.budget.total = total;
    results.budget.valid = Math.abs(total - 0.75) < 0.001;

    // Check workflow runs
    const workflowRuns = await ctx.db
      .query("workflowRuns")
      .filter((q) => q.eq("metadata.e2eRunId", runId))
      .collect();
    results.workflowRuns.found = workflowRuns.length;
    results.workflowRuns.valid = workflowRuns.length >= 1;

    // Overall validity
    results.allValid = 
      results.agents.valid &&
      results.tasks.valid &&
      results.contentDrops.valid &&
      results.budget.valid &&
      results.workflowRuns.valid;

    return results;
  },
});
