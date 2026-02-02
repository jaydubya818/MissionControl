/**
 * Mission Control OpenClaw SDK - Main Client
 */

import { ConvexHttpClient } from "convex/browser";
import type {
  SDKConfig,
  Agent,
  Task,
  Run,
  Approval,
  WorkPlan,
  Deliverable,
  HeartbeatResult,
  TaskHandler,
  Id,
} from "./types";

export class MissionControlClient {
  private client: ConvexHttpClient;
  private config: Required<SDKConfig>;
  private agent?: Agent;
  private projectId?: Id<"projects">;
  private heartbeatTimer?: NodeJS.Timeout;
  private taskHandlers: Map<string, TaskHandler> = new Map();
  private currentRun?: Run;

  constructor(config: SDKConfig) {
    this.config = {
      heartbeatIntervalMs: 15 * 60 * 1000, // 15 minutes
      autoRetry: true,
      maxRetries: 3,
      retryDelayMs: 1000,
      onError: (error) => console.error("[SDK]", error),
      onHeartbeat: () => {},
      onTaskClaimed: () => {},
      onTaskCompleted: () => {},
      onApprovalNeeded: () => {},
      ...config,
    };

    this.client = new ConvexHttpClient(this.config.convexUrl);
  }

  /**
   * Initialize the agent and start heartbeat loop
   */
  async start(): Promise<Agent> {
    try {
      // Get project
      const project = await this.retry(() =>
        this.client.query("projects:getBySlug" as any, { slug: this.config.projectSlug })
      );

      if (!project) {
        throw new Error(`Project "${this.config.projectSlug}" not found`);
      }

      this.projectId = project._id;

      // Register or get existing agent
      const existing = await this.client.query("agents:getByName" as any, {
        name: this.config.agent.name,
      });

      if (existing) {
        this.agent = existing;
        console.log(`[SDK] Agent "${this.agent.name}" already registered (${this.agent._id})`);
      } else {
        const result = await this.client.mutation("agents:register" as any, {
          projectId: this.projectId,
          name: this.config.agent.name,
          role: this.config.agent.role || "INTERN",
          emoji: this.config.agent.emoji,
          allowedTaskTypes: this.config.agent.allowedTaskTypes || [],
          workspacePath: this.config.agent.workspacePath,
          budgetDaily: this.config.agent.budgetDaily,
          budgetPerRun: this.config.agent.budgetPerRun,
        });
        this.agent = result.agent;
        console.log(`[SDK] Agent "${this.agent.name}" registered (${this.agent._id})`);
      }

      // Start heartbeat loop
      this.startHeartbeatLoop();

      return this.agent;
    } catch (error) {
      this.config.onError(error as Error);
      throw error;
    }
  }

  /**
   * Stop the agent and cleanup
   */
  async stop(): Promise<void> {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }

    if (this.agent) {
      await this.client.mutation("agents:updateStatus" as any, {
        agentId: this.agent._id,
        status: "OFFLINE",
      });
      console.log(`[SDK] Agent "${this.agent.name}" stopped`);
    }
  }

  /**
   * Register a task handler for a specific task type
   */
  onTask(taskType: string, handler: TaskHandler): void {
    this.taskHandlers.set(taskType, handler);
  }

  /**
   * Register a handler for all task types
   */
  onAnyTask(handler: TaskHandler): void {
    this.taskHandlers.set("*", handler);
  }

  /**
   * Manual heartbeat (called automatically in loop)
   */
  async heartbeat(): Promise<HeartbeatResult> {
    if (!this.agent) {
      throw new Error("Agent not initialized. Call start() first.");
    }

    const result = await this.client.mutation("agents:heartbeat" as any, {
      agentId: this.agent._id,
      status: "ACTIVE",
    });

    this.config.onHeartbeat(result);

    // Process pending tasks
    await this.processPendingTasks(result);

    // Process claimable tasks
    await this.processClaimableTasks(result);

    // Mark notifications as read
    if (result.pendingNotifications?.length > 0) {
      await this.client.mutation("notifications:markAllReadForAgent" as any, {
        agentId: this.agent._id,
      });
    }

    return result;
  }

  /**
   * Claim a specific task
   */
  async claimTask(taskId: Id<"tasks">): Promise<Task> {
    if (!this.agent) {
      throw new Error("Agent not initialized");
    }

    await this.client.mutation("tasks:assign" as any, {
      taskId,
      agentIds: [this.agent._id],
      actorType: "AGENT",
      idempotencyKey: `claim-${taskId}-${Date.now()}`,
    });

    const task = await this.client.query("tasks:get" as any, { taskId });
    this.config.onTaskClaimed(task);

    return task;
  }

  /**
   * Start working on a task
   */
  async startTask(taskId: Id<"tasks">, workPlan: WorkPlan): Promise<Run> {
    if (!this.agent) {
      throw new Error("Agent not initialized");
    }

    // Post work plan
    await this.client.mutation("messages:postWorkPlan" as any, {
      taskId,
      agentId: this.agent._id,
      bullets: workPlan.bullets,
      estimatedCost: workPlan.estimatedCost,
      idempotencyKey: `workplan-${taskId}-${Date.now()}`,
    });

    // Transition to IN_PROGRESS
    await this.client.mutation("tasks:transition" as any, {
      taskId,
      toStatus: "IN_PROGRESS",
      actorType: "AGENT",
      actorAgentId: this.agent._id,
      idempotencyKey: `start-${taskId}-${Date.now()}`,
      workPlan,
    });

    // Start a run
    const runResult = await this.client.mutation("runs:start" as any, {
      agentId: this.agent._id,
      taskId,
      sessionKey: `session-${Date.now()}`,
      model: "gpt-4",
      idempotencyKey: `run-${taskId}-${Date.now()}`,
    });

    this.currentRun = runResult.run;
    return this.currentRun;
  }

  /**
   * Complete a task
   */
  async completeTask(taskId: Id<"tasks">, deliverable: Deliverable, costUsd: number): Promise<void> {
    if (!this.agent) {
      throw new Error("Agent not initialized");
    }

    // Post deliverable
    await this.client.mutation("messages:postDeliverable" as any, {
      taskId,
      agentId: this.agent._id,
      summary: deliverable.summary,
      artifactIds: deliverable.artifactIds || [],
      evidence: deliverable.evidence,
      idempotencyKey: `deliverable-${taskId}-${Date.now()}`,
    });

    // Complete the run
    if (this.currentRun) {
      await this.client.mutation("runs:complete" as any, {
        runId: this.currentRun._id,
        inputTokens: 1000, // TODO: Track actual tokens
        outputTokens: 500,
        costUsd,
      });
    }

    // Transition to REVIEW
    await this.client.mutation("tasks:transition" as any, {
      taskId,
      toStatus: "REVIEW",
      actorType: "AGENT",
      actorAgentId: this.agent._id,
      idempotencyKey: `complete-${taskId}-${Date.now()}`,
      deliverable: {
        summary: deliverable.summary,
        artifactIds: deliverable.artifactIds || [],
      },
    });

    const task = await this.client.query("tasks:get" as any, { taskId });
    this.config.onTaskCompleted(task);

    this.currentRun = undefined;
  }

  /**
   * Request approval for an action
   */
  async requestApproval(
    taskId: Id<"tasks">,
    actionType: string,
    actionSummary: string,
    justification: string,
    estimatedCost?: number
  ): Promise<Approval> {
    if (!this.agent) {
      throw new Error("Agent not initialized");
    }

    const approval = await this.client.mutation("approvals:request" as any, {
      projectId: this.projectId,
      taskId,
      requestorAgentId: this.agent._id,
      actionType,
      actionSummary,
      riskLevel: "YELLOW",
      estimatedCost,
      justification,
    });

    this.config.onApprovalNeeded(approval);

    return approval;
  }

  /**
   * Post a comment/message on a task
   */
  async postComment(taskId: Id<"tasks">, content: string): Promise<void> {
    if (!this.agent) {
      throw new Error("Agent not initialized");
    }

    await this.client.mutation("messages:postComment" as any, {
      taskId,
      authorType: "AGENT",
      authorAgentId: this.agent._id,
      content,
      idempotencyKey: `comment-${taskId}-${Date.now()}`,
    });
  }

  // Private methods

  private startHeartbeatLoop(): void {
    const tick = async () => {
      try {
        await this.heartbeat();
      } catch (error) {
        this.config.onError(error as Error);
      }
    };

    // Initial heartbeat
    tick();

    // Start interval
    this.heartbeatTimer = setInterval(tick, this.config.heartbeatIntervalMs);
  }

  private async processPendingTasks(result: HeartbeatResult): Promise<void> {
    const pending = result.pendingTasks || [];

    for (const task of pending) {
      if (task.status === "ASSIGNED") {
        await this.executeTask(task);
      } else if (task.status === "IN_PROGRESS") {
        // Resume task if handler exists
        await this.executeTask(task);
      }
    }
  }

  private async processClaimableTasks(result: HeartbeatResult): Promise<void> {
    const claimable = result.claimableTasks || [];

    if (claimable.length > 0) {
      const task = claimable[0];
      await this.claimTask(task._id);
      await this.executeTask(task);
    }
  }

  private async executeTask(task: Task): Promise<void> {
    if (!this.agent) return;

    // Find handler
    const handler = this.taskHandlers.get(task.type) || this.taskHandlers.get("*");

    if (!handler) {
      console.log(`[SDK] No handler for task type "${task.type}"`);
      return;
    }

    try {
      // Start task if not already started
      if (task.status === "ASSIGNED") {
        const workPlan = {
          bullets: ["1. Analyze requirements", "2. Execute task", "3. Deliver results"],
          estimatedCost: 0.5,
        };
        const run = await this.startTask(task._id, workPlan);
        this.currentRun = run;
      }

      // Execute handler
      const context = {
        task,
        agent: this.agent,
        run: this.currentRun!,
        requestApproval: async (action: string, justification: string, estimatedCost?: number) => {
          return this.requestApproval(task._id, action, action, justification, estimatedCost);
        },
        postComment: async (content: string) => {
          return this.postComment(task._id, content);
        },
        updateProgress: async (status: string) => {
          return this.postComment(task._id, `Progress: ${status}`);
        },
      };

      const deliverable = await handler(context);

      // Complete task
      await this.completeTask(task._id, deliverable, 0.25);
    } catch (error) {
      this.config.onError(error as Error);

      // Post error as comment
      await this.postComment(task._id, `Error: ${(error as Error).message}`);
    }
  }

  private async retry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error | undefined;

    for (let i = 0; i < this.config.maxRetries; i++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;

        if (i < this.config.maxRetries - 1) {
          await new Promise((resolve) => setTimeout(resolve, this.config.retryDelayMs * Math.pow(2, i)));
        }
      }
    }

    throw lastError;
  }
}
