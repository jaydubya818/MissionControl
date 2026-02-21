/**
 * Coordinator — Convex Integration
 *
 * Bridges the packages/coordinator logic into Convex mutations/queries.
 * Provides:
 *   - decomposeTask: break an INBOX task into subtasks
 *   - getSubtasks: list subtasks for a parent
 *   - getTaskDependencies: query the dependency graph
 *   - getDependencyGraph: full DAG for a parent task
 */

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id, Doc } from "./_generated/dataModel";

// ============================================================================
// QUERIES
// ============================================================================

/**
 * Get all subtasks for a parent task.
 */
export const getSubtasks = query({
  args: { parentTaskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const tasks = await ctx.db.query("tasks").collect();
    return tasks.filter((t) => t.parentTaskId === args.parentTaskId);
  },
});

/**
 * Get the task dependency graph for a parent task.
 */
export const getTaskDependencies = query({
  args: { parentTaskId: v.id("tasks") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("taskDependencies")
      .withIndex("by_parent", (q) => q.eq("parentTaskId", args.parentTaskId))
      .collect();
  },
});

/**
 * Get the full dependency graph for visualization (DAG view).
 * Returns nodes (tasks) and edges (dependencies).
 */
export const getDependencyGraph = query({
  args: { parentTaskId: v.optional(v.id("tasks")) },
  handler: async (ctx, args) => {
    let tasks: Doc<"tasks">[];
    let deps: Doc<"taskDependencies">[];

    if (args.parentTaskId) {
      // Get subtasks of a specific parent
      const allTasks = await ctx.db.query("tasks").collect();
      tasks = allTasks.filter(
        (t) => t.parentTaskId === args.parentTaskId || t._id === args.parentTaskId
      );
      deps = await ctx.db
        .query("taskDependencies")
        .withIndex("by_parent", (q) => q.eq("parentTaskId", args.parentTaskId!))
        .collect();
    } else {
      // Get all top-level tasks and their subtasks
      tasks = await ctx.db.query("tasks").collect();
      deps = await ctx.db.query("taskDependencies").collect();
    }

    const nodes = tasks.map((t) => ({
      id: t._id,
      title: t.title,
      status: t.status,
      type: t.type,
      priority: t.priority,
      assigneeIds: t.assigneeIds,
      parentTaskId: t.parentTaskId,
    }));

    const edges = deps.map((d) => ({
      id: d._id,
      from: d.taskId,
      to: d.dependsOnTaskId,
      parentTaskId: d.parentTaskId,
    }));

    return { nodes, edges };
  },
});

// ============================================================================
// MUTATIONS
// ============================================================================

/**
 * Decompose an INBOX task into subtasks using strategy-based decomposition.
 *
 * Uses the same decomposition strategies as packages/coordinator/src/decomposer.ts
 * but runs inside Convex for transactional safety.
 */
export const decomposeTask = mutation({
  args: {
    taskId: v.id("tasks"),
    maxSubtasks: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) {
      return { success: false, error: "Task not found" };
    }

    if (task.status !== "INBOX") {
      return { success: false, error: `Task is ${task.status}, must be INBOX to decompose` };
    }

    // Check if already decomposed
    const existingSubtasks = (await ctx.db.query("tasks").collect()).filter(
      (t) => t.parentTaskId === args.taskId
    );
    if (existingSubtasks.length > 0) {
      return {
        success: false,
        error: `Task already has ${existingSubtasks.length} subtasks`,
      };
    }

    // Determine decomposition strategy based on task type
    const strategy = getDecompositionStrategy(task.type);
    const maxSubtasks = args.maxSubtasks ?? 7;
    const phases = strategy.phases.slice(0, maxSubtasks);

    // Create subtasks
    const subtaskIds: Id<"tasks">[] = [];

    for (let i = 0; i < phases.length; i++) {
      const phase = phases[i];
      const subtaskId = await ctx.db.insert("tasks", {
        tenantId: task.tenantId,
        projectId: task.projectId,
        title: `${phase.verb} — ${task.title}`,
        description: `${phase.description} for: ${task.description ?? task.title}`,
        type: (phase.subtaskType ?? task.type) as any,
        status: "INBOX",
        priority: task.priority,
        assigneeIds: [],
        assigneeInstanceIds: [],
        reviewCycles: 0,
        actualCost: 0,
        parentTaskId: args.taskId,
        source: "AGENT",
        createdBy: "SYSTEM",
        idempotencyKey: `decompose-${args.taskId}-phase-${i}`,
        estimatedCost: phase.estimatedMinutes * 0.01, // Rough estimate
        labels: [`phase:${i}`, `strategy:${strategy.name}`],
      });

      subtaskIds.push(subtaskId);
    }

    // Create dependency edges
    for (let i = 0; i < phases.length; i++) {
      const phase = phases[i];
      if (phase.dependsOnPhaseIndex) {
        for (const depIdx of phase.dependsOnPhaseIndex) {
          if (depIdx >= 0 && depIdx < subtaskIds.length) {
            await ctx.db.insert("taskDependencies", {
              parentTaskId: args.taskId,
              taskId: subtaskIds[i],
              dependsOnTaskId: subtaskIds[depIdx],
            });
          }
        }
      }
    }

    // Log activity
    await ctx.db.insert("activities", {
      projectId: task.projectId,
      actorType: "SYSTEM",
      action: "TASK_DECOMPOSED",
      description: `Decomposed "${task.title}" into ${subtaskIds.length} subtasks using ${strategy.name} strategy`,
      targetType: "TASK",
      targetId: args.taskId,
      taskId: args.taskId,
      metadata: {
        strategy: strategy.name,
        subtaskCount: subtaskIds.length,
        subtaskIds,
      },
    });

    return {
      success: true,
      subtaskIds,
      strategy: strategy.name,
      subtaskCount: subtaskIds.length,
    };
  },
});

// ============================================================================
// DECOMPOSITION STRATEGIES (mirrored from packages/coordinator/src/decomposer.ts)
// ============================================================================

interface DecompositionPhase {
  verb: string;
  description: string;
  subtaskType?: string;
  estimatedMinutes: number;
  dependsOnPhaseIndex?: number[];
  requiredCapabilities: string[];
  deliverable: string;
}

interface DecompositionStrategy {
  name: string;
  phases: DecompositionPhase[];
}

function getDecompositionStrategy(taskType: string): DecompositionStrategy {
  const strategies: Record<string, DecompositionStrategy> = {
    ENGINEERING: {
      name: "engineering",
      phases: [
        {
          verb: "Research",
          description: "Investigate requirements and existing code",
          subtaskType: "CUSTOMER_RESEARCH",
          estimatedMinutes: 30,
          requiredCapabilities: ["code_analysis", "research"],
          deliverable: "Research summary with approach recommendation",
        },
        {
          verb: "Implement",
          description: "Write the core implementation",
          estimatedMinutes: 60,
          dependsOnPhaseIndex: [0],
          requiredCapabilities: ["code_generation", "file_operations"],
          deliverable: "Working implementation with inline comments",
        },
        {
          verb: "Test",
          description: "Write and run tests",
          estimatedMinutes: 30,
          dependsOnPhaseIndex: [1],
          requiredCapabilities: ["testing", "code_generation"],
          deliverable: "Test suite with passing results",
        },
        {
          verb: "Document",
          description: "Update documentation",
          subtaskType: "DOCS",
          estimatedMinutes: 15,
          dependsOnPhaseIndex: [1],
          requiredCapabilities: ["documentation"],
          deliverable: "Updated docs reflecting the changes",
        },
      ],
    },
    CONTENT: {
      name: "content",
      phases: [
        {
          verb: "Research",
          description: "Research topic and gather sources",
          subtaskType: "CUSTOMER_RESEARCH",
          estimatedMinutes: 20,
          requiredCapabilities: ["research", "web_search"],
          deliverable: "Research brief with key points and sources",
        },
        {
          verb: "Draft",
          description: "Write the first draft",
          estimatedMinutes: 40,
          dependsOnPhaseIndex: [0],
          requiredCapabilities: ["content_creation"],
          deliverable: "Complete first draft",
        },
        {
          verb: "Review",
          description: "Review and revise for quality",
          estimatedMinutes: 20,
          dependsOnPhaseIndex: [1],
          requiredCapabilities: ["content_review", "editing"],
          deliverable: "Polished final draft",
        },
      ],
    },
    OPS: {
      name: "operations",
      phases: [
        {
          verb: "Audit",
          description: "Audit current state and identify gaps",
          estimatedMinutes: 20,
          requiredCapabilities: ["system_audit", "monitoring"],
          deliverable: "Audit report with findings",
        },
        {
          verb: "Plan",
          description: "Create execution plan",
          estimatedMinutes: 15,
          dependsOnPhaseIndex: [0],
          requiredCapabilities: ["planning"],
          deliverable: "Step-by-step execution plan",
        },
        {
          verb: "Execute",
          description: "Execute the planned changes",
          estimatedMinutes: 30,
          dependsOnPhaseIndex: [1],
          requiredCapabilities: ["system_operations"],
          deliverable: "Completed operation with verification",
        },
      ],
    },
  };

  return strategies[taskType] ?? {
    name: "generic",
    phases: [
      {
        verb: "Research",
        description: "Investigate and plan approach",
        estimatedMinutes: 20,
        requiredCapabilities: ["research"],
        deliverable: "Approach recommendation",
      },
      {
        verb: "Execute",
        description: "Perform the main work",
        estimatedMinutes: 45,
        dependsOnPhaseIndex: [0],
        requiredCapabilities: [],
        deliverable: "Completed deliverable",
      },
      {
        verb: "Review",
        description: "Quality check the output",
        estimatedMinutes: 15,
        dependsOnPhaseIndex: [1],
        requiredCapabilities: ["review"],
        deliverable: "Quality-verified output",
      },
    ],
  };
}
