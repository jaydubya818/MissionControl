/**
 * Coordinator Loop
 * 
 * The main orchestration loop that runs continuously:
 *   1. Poll for INBOX tasks
 *   2. Decompose complex tasks
 *   3. Delegate subtasks to agents
 *   4. Monitor active tasks for stuck agents
 *   5. Handle escalations
 */

import { decompose, TaskInput } from "./decomposer";
import { delegate, delegateAll, AgentCandidate } from "./delegator";
import { buildDependencyGraph, findReadyTasks } from "./dependency-graph";

export interface CoordinatorConfig {
  pollIntervalMs: number;
  maxSubtasksPerDecomposition: number;
  stuckThresholdMs: number;
  maxConcurrentTasks: number;
}

export const DEFAULT_COORDINATOR_CONFIG: CoordinatorConfig = {
  pollIntervalMs: 30_000,         // 30 seconds
  maxSubtasksPerDecomposition: 7, // Per persona rules
  stuckThresholdMs: 30 * 60_000,  // 30 minutes without progress
  maxConcurrentTasks: 10,
};

/**
 * The Coordinator Loop orchestrates the full lifecycle of tasks.
 * 
 * In production, this runs inside the Hono orchestration server
 * and communicates with Convex via HTTP client. Here we define
 * the pure logic that the server calls on each tick.
 */
export class CoordinatorLoop {
  private config: CoordinatorConfig;
  private running = false;
  
  constructor(config?: Partial<CoordinatorConfig>) {
    this.config = { ...DEFAULT_COORDINATOR_CONFIG, ...config };
  }
  
  /**
   * Process a single coordination cycle.
   * 
   * This is the "tick" function called by the orchestration server.
   * It takes the current system state and returns actions to take.
   */
  tick(state: CoordinatorState): CoordinatorActions {
    const actions: CoordinatorActions = {
      tasksToDecompose: [],
      delegations: [],
      escalations: [],
      stuckAlerts: [],
    };
    
    // 1. Find INBOX tasks that need decomposition
    for (const task of state.inboxTasks) {
      // Ensure priority is a valid value (1-4)
      const validPriority = Math.max(1, Math.min(4, task.priority)) as 1 | 2 | 3 | 4;
      
      const result = decompose({
        id: task.id,
        title: task.title,
        description: task.description,
        type: task.type,
        priority: validPriority,
      });
      
      // Enforce max subtasks
      if (result.subtasks.length > this.config.maxSubtasksPerDecomposition) {
        result.subtasks = result.subtasks.slice(0, this.config.maxSubtasksPerDecomposition);
      }
      
      actions.tasksToDecompose.push(result);
    }
    
    // 2. Delegate ready tasks to available agents
    const graph = buildDependencyGraph(
      state.allTasks.map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        dependsOn: t.dependsOn,
      }))
    );
    
    const readyTaskIds = findReadyTasks(graph);
    const readyTasks = state.allTasks.filter(
      (t) => readyTaskIds.includes(t.id) && t.status === "INBOX"
    );
    
    for (const task of readyTasks) {
      // Ensure priority is a valid value (1-4)
      const validPriority = Math.max(1, Math.min(4, task.priority)) as 1 | 2 | 3 | 4;
      
      const result = delegate(
        {
          title: task.title,
          description: task.description,
          type: task.type,
          priority: validPriority,
          estimatedMinutes: 30,
          dependsOn: [],
          requiredCapabilities: [],
          deliverable: task.title,
        },
        0,
        state.availableAgents
      );
      
      if (result) {
        actions.delegations.push({
          taskId: task.id,
          agentId: result.assignedAgentId,
          agentName: result.assignedAgentName,
          reasoning: result.reasoning,
        });
      }
    }
    
    // 3. Detect stuck tasks
    const now = Date.now();
    for (const task of state.allTasks) {
      if (task.status === "IN_PROGRESS" && task.lastActivityAt) {
        const stuckDuration = now - task.lastActivityAt;
        if (stuckDuration > this.config.stuckThresholdMs) {
          actions.stuckAlerts.push({
            taskId: task.id,
            taskTitle: task.title,
            agentId: task.assigneeIds[0] ?? null,
            stuckDurationMs: stuckDuration,
          });
        }
      }
    }
    
    // 4. Check for tasks requiring escalation (no available agents)
    for (const task of readyTasks) {
      const hasDelegate = actions.delegations.some(
        (d) => d.taskId === task.id
      );
      if (!hasDelegate) {
        actions.escalations.push({
          taskId: task.id,
          taskTitle: task.title,
          reason: "No available agent with matching capabilities",
        });
      }
    }
    
    return actions;
  }
  
  getConfig(): CoordinatorConfig {
    return this.config;
  }
}

// ============================================================================
// Types for coordinator state and actions
// ============================================================================

export interface CoordinatorState {
  inboxTasks: Array<{
    id: string;
    title: string;
    description: string;
    type: string;
    priority: number;
  }>;
  allTasks: Array<{
    id: string;
    title: string;
    description: string;
    type: string;
    status: string;
    priority: number;
    dependsOn: string[];
    assigneeIds: string[];
    lastActivityAt?: number;
  }>;
  availableAgents: AgentCandidate[];
}

export interface CoordinatorActions {
  tasksToDecompose: Array<{
    parentTaskId: string;
    subtasks: Array<{
      title: string;
      description: string;
      type: string;
      priority: 1 | 2 | 3 | 4;
      estimatedMinutes: number;
      dependsOn: number[];
      requiredCapabilities: string[];
      deliverable: string;
    }>;
    reasoning: string;
    estimatedTotalMinutes: number;
  }>;
  delegations: Array<{
    taskId: string;
    agentId: string;
    agentName: string;
    reasoning: string;
  }>;
  escalations: Array<{
    taskId: string;
    taskTitle: string;
    reason: string;
  }>;
  stuckAlerts: Array<{
    taskId: string;
    taskTitle: string;
    agentId: string | null;
    stuckDurationMs: number;
  }>;
}
