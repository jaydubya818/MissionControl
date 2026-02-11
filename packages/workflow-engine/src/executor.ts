/**
 * Workflow Executor
 * 
 * Executes workflow steps with retry logic, context passing, and escalation.
 * Implements the Ralph loop pattern: fresh context per step, no bloat.
 */

import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { render, validateContext } from "./renderer";
import { parse, meetsExpectations } from "./parser";

export interface WorkflowExecutorConfig {
  convexUrl: string;
  pollIntervalMs?: number;
  stepTimeoutMs?: number;
}

export interface StepExecutionResult {
  success: boolean;
  output?: string;
  error?: string;
  shouldRetry: boolean;
  shouldEscalate: boolean;
}

/**
 * Workflow Executor
 * 
 * Orchestrates multi-agent workflow execution:
 * 1. Polls for workflow runs in PENDING/RUNNING status
 * 2. Executes current step by creating a task
 * 3. Waits for task completion
 * 4. Extracts output, updates context, advances to next step
 * 5. Retries on failure, escalates when retries exhausted
 */
export class WorkflowExecutor {
  private client: ConvexHttpClient;
  private pollIntervalMs: number;
  private stepTimeoutMs: number;
  private running: boolean = false;
  
  constructor(config: WorkflowExecutorConfig) {
    this.client = new ConvexHttpClient(config.convexUrl);
    this.pollIntervalMs = config.pollIntervalMs ?? 5000; // 5 seconds
    this.stepTimeoutMs = config.stepTimeoutMs ?? 60000; // 60 seconds default
  }
  
  /**
   * Start the executor loop
   */
  async start(): Promise<void> {
    this.running = true;
    console.log("[WorkflowExecutor] Started");
    
    while (this.running) {
      try {
        await this.tick();
      } catch (error) {
        console.error("[WorkflowExecutor] Tick error:", error);
      }
      
      await this.sleep(this.pollIntervalMs);
    }
  }
  
  /**
   * Stop the executor loop
   */
  stop(): void {
    this.running = false;
    console.log("[WorkflowExecutor] Stopped");
  }
  
  /**
   * Execute one tick: check for work and process one step
   */
  private async tick(): Promise<void> {
    // Find workflow runs that need processing
    const runs = await this.client.query(api.workflowRuns.list, {
      status: "RUNNING",
      limit: 10,
    });
    
    if (runs.length === 0) {
      // Also check for PENDING runs that need to be started
      const pendingRuns = await this.client.query(api.workflowRuns.list, {
        status: "PENDING",
        limit: 10,
      });
      
      for (const run of pendingRuns) {
        await this.startRun(run);
      }
      
      return;
    }
    
    // Process the first run
    const run = runs[0];
    await this.processRun(run);
  }
  
  /**
   * Start a workflow run (transition from PENDING to RUNNING)
   */
  private async startRun(run: any): Promise<void> {
    console.log(`[WorkflowExecutor] Starting run ${run.runId}`);
    
    await this.client.mutation(api.workflowRuns.updateStatus, {
      runId: run.runId,
      status: "RUNNING",
    });
    
    // Execute first step
    await this.executeStep(run, 0);
  }
  
  /**
   * Process a running workflow run
   */
  private async processRun(run: any): Promise<void> {
    const currentStep = run.steps[run.currentStepIndex];
    
    if (!currentStep) {
      console.error(`[WorkflowExecutor] No current step for run ${run.runId}`);
      return;
    }
    
    // Check step status
    if (currentStep.status === "PENDING") {
      // Start this step
      await this.executeStep(run, run.currentStepIndex);
    } else if (currentStep.status === "RUNNING") {
      // Check if task is complete
      await this.checkStepCompletion(run, run.currentStepIndex);
    } else if (currentStep.status === "DONE") {
      // Advance to next step
      await this.advanceWorkflow(run);
    } else if (currentStep.status === "FAILED") {
      // Handle failure (retry or escalate)
      await this.handleStepFailure(run, run.currentStepIndex);
    }
  }
  
  /**
   * Execute a workflow step
   */
  private async executeStep(run: any, stepIndex: number): Promise<void> {
    const step = run.steps[stepIndex];
    
    console.log(`[WorkflowExecutor] Executing step ${step.stepId} for run ${run.runId}`);
    
    // Get workflow definition
    const workflow = await this.client.query(api.workflows.get, {
      workflowId: run.workflowId,
    });
    
    if (!workflow) {
      throw new Error(`Workflow not found: ${run.workflowId}`);
    }
    
    const stepDef = workflow.steps[stepIndex];
    
    // Render input template with context
    const missingVars = validateContext(stepDef.input, run.context);
    if (missingVars.length > 0) {
      throw new Error(`Missing context variables: ${missingVars.join(", ")}`);
    }
    
    const renderedInput = render(stepDef.input, run.context);
    
    // Find agent persona
    const agentDef = workflow.agents.find((a) => a.id === stepDef.agent);
    if (!agentDef) {
      throw new Error(`Agent not found in workflow: ${stepDef.agent}`);
    }
    
    // Find matching agent in database
    const agent = await this.client.query(api.agents.getByName, {
      name: agentDef.persona,
    });
    
    if (!agent) {
      throw new Error(`Agent persona not found: ${agentDef.persona}`);
    }
    
    // Create task for this step
    const taskId = await this.client.mutation(api.tasks.create, {
      projectId: run.projectId,
      title: `[${workflow.name}] ${stepDef.id}`,
      description: renderedInput,
      type: agent.allowedTaskTypes[0] ?? "OPS",
      priority: 2,
      assigneeIds: [agent._id],
      metadata: {
        workflowRunId: run._id,
        workflowStepId: stepDef.id,
        workflowStepIndex: stepIndex,
      },
    });
    
    // Update step status to RUNNING
    await this.client.mutation(api.workflowRuns.updateStep, {
      runId: run.runId,
      stepIndex,
      status: "RUNNING",
      taskId,
      agentId: agent._id,
    });
    
    console.log(`[WorkflowExecutor] Created task ${taskId} for step ${step.stepId}`);
  }
  
  /**
   * Check if a running step has completed
   */
  private async checkStepCompletion(run: any, stepIndex: number): Promise<void> {
    const step = run.steps[stepIndex];
    
    if (!step.taskId) {
      console.error(`[WorkflowExecutor] Step ${step.stepId} has no taskId`);
      return;
    }
    
    // Get task status
    const task = await this.client.query(api.tasks.get, {
      taskId: step.taskId,
    });
    
    if (!task) {
      console.error(`[WorkflowExecutor] Task not found: ${step.taskId}`);
      return;
    }
    
    if (task.status === "DONE") {
      // Extract output from task deliverable
      const output = task.deliverable?.content ?? task.deliverable?.summary ?? "";
      
      // Get workflow definition to check expectations
      const workflow = await this.client.query(api.workflows.get, {
        workflowId: run.workflowId,
      });
      
      if (!workflow) {
        throw new Error(`Workflow not found: ${run.workflowId}`);
      }
      
      const stepDef = workflow.steps[stepIndex];
      
      // Parse output
      const parsed = parse(output);
      
      // Check if output meets expectations
      if (meetsExpectations(output, stepDef.expects)) {
        console.log(`[WorkflowExecutor] Step ${step.stepId} completed successfully`);
        
        // Update step status to DONE
        await this.client.mutation(api.workflowRuns.updateStep, {
          runId: run.runId,
          stepIndex,
          status: "DONE",
          output,
        });
        
        // Update context with step output
        const contextKey = `${step.stepId}Output`;
        await this.client.mutation(api.workflowRuns.updateContext, {
          runId: run.runId,
          context: {
            [contextKey]: output,
            ...parsed.data, // Also add structured data
          },
        });
      } else {
        console.warn(`[WorkflowExecutor] Step ${step.stepId} output doesn't meet expectations`);
        
        // Mark as failed
        await this.client.mutation(api.workflowRuns.updateStep, {
          runId: run.runId,
          stepIndex,
          status: "FAILED",
          error: `Output doesn't meet expectations: "${stepDef.expects}"`,
          output,
        });
      }
    } else if (task.status === "FAILED" || task.status === "CANCELED") {
      console.warn(`[WorkflowExecutor] Step ${step.stepId} task failed`);
      
      // Mark step as failed
      await this.client.mutation(api.workflowRuns.updateStep, {
        runId: run.runId,
        stepIndex,
        status: "FAILED",
        error: task.blockedReason ?? "Task failed",
      });
    }
    
    // Check for timeout
    if (step.startedAt) {
      const workflow = await this.client.query(api.workflows.get, {
        workflowId: run.workflowId,
      });
      
      if (workflow) {
        const stepDef = workflow.steps[stepIndex];
        const elapsed = Date.now() - step.startedAt;
        const timeout = stepDef.timeoutMinutes * 60 * 1000;
        
        if (elapsed > timeout) {
          console.warn(`[WorkflowExecutor] Step ${step.stepId} timed out`);
          
          await this.client.mutation(api.workflowRuns.updateStep, {
            runId: run.runId,
            stepIndex,
            status: "FAILED",
            error: `Timeout after ${stepDef.timeoutMinutes} minutes`,
          });
        }
      }
    }
  }
  
  /**
   * Advance workflow to next step
   */
  private async advanceWorkflow(run: any): Promise<void> {
    console.log(`[WorkflowExecutor] Advancing workflow ${run.runId}`);
    
    const result = await this.client.mutation(api.workflowRuns.advance, {
      runId: run.runId,
    });
    
    if (result.complete) {
      console.log(`[WorkflowExecutor] Workflow ${run.runId} completed`);
      
      // Log completion activity
      await this.client.mutation(api.activities.create, {
        projectId: run.projectId,
        actorType: "SYSTEM",
        action: "WORKFLOW_COMPLETED",
        description: `Workflow run ${run.runId} completed successfully`,
        targetType: "WORKFLOW_RUN",
        targetId: run._id,
      });
    } else {
      console.log(`[WorkflowExecutor] Workflow ${run.runId} advanced to step ${result.nextIndex}`);
      
      // Execute next step
      const refreshedRun = await this.client.query(api.workflowRuns.get, {
        runId: run.runId,
      });
      
      if (refreshedRun) {
        await this.executeStep(refreshedRun, result.nextIndex);
      }
    }
  }
  
  /**
   * Handle step failure (retry or escalate)
   */
  private async handleStepFailure(run: any, stepIndex: number): Promise<void> {
    const step = run.steps[stepIndex];
    
    // Get workflow definition to check retry limit
    const workflow = await this.client.query(api.workflows.get, {
      workflowId: run.workflowId,
    });
    
    if (!workflow) {
      throw new Error(`Workflow not found: ${run.workflowId}`);
    }
    
    const stepDef = workflow.steps[stepIndex];
    
    if (step.retryCount < stepDef.retryLimit) {
      // Retry the step
      console.log(
        `[WorkflowExecutor] Retrying step ${step.stepId} (attempt ${step.retryCount + 1}/${stepDef.retryLimit})`
      );
      
      await this.client.mutation(api.workflowRuns.incrementRetry, {
        runId: run.runId,
        stepIndex,
      });
      
      // Reset step to PENDING
      await this.client.mutation(api.workflowRuns.updateStep, {
        runId: run.runId,
        stepIndex,
        status: "PENDING",
      });
      
      // Wait a bit before retrying (exponential backoff)
      const backoffMs = Math.min(1000 * Math.pow(2, step.retryCount), 30000);
      await this.sleep(backoffMs);
      
      // Re-execute
      const refreshedRun = await this.client.query(api.workflowRuns.get, {
        runId: run.runId,
      });
      
      if (refreshedRun) {
        await this.executeStep(refreshedRun, stepIndex);
      }
    } else {
      // Retries exhausted — escalate to human
      console.error(
        `[WorkflowExecutor] Step ${step.stepId} failed after ${step.retryCount} retries — escalating`
      );
      
      await this.escalateToHuman(run, stepIndex, step.error ?? "Unknown error");
    }
  }
  
  /**
   * Escalate failed step to human approval
   */
  private async escalateToHuman(run: any, stepIndex: number, error: string): Promise<void> {
    const step = run.steps[stepIndex];
    
    // Pause the workflow
    await this.client.mutation(api.workflowRuns.updateStatus, {
      runId: run.runId,
      status: "PAUSED",
    });
    
    // Create approval request
    const agent = step.agentId ? await this.client.query(api.agents.get, {
      agentId: step.agentId,
    }) : null;
    
    if (agent) {
      await this.client.mutation(api.approvals.create, {
        projectId: run.projectId,
        taskId: run.parentTaskId,
        requestorAgentId: agent._id,
        actionType: "WORKFLOW_STEP_RETRY",
        actionSummary: `Workflow step "${step.stepId}" failed after retries`,
        riskLevel: "YELLOW",
        justification: `Step failed with error: ${error}. Manual intervention required.`,
        actionPayload: {
          workflowRunId: run._id,
          runId: run.runId,
          stepIndex,
          error,
        },
      });
    }
    
    // Log escalation activity
    await this.client.mutation(api.activities.create, {
      projectId: run.projectId,
      actorType: "SYSTEM",
      action: "WORKFLOW_ESCALATED",
      description: `Workflow run ${run.runId} escalated: step ${step.stepId} failed after retries`,
      targetType: "WORKFLOW_RUN",
      targetId: run._id,
      metadata: {
        stepId: step.stepId,
        stepIndex,
        error,
        retryCount: step.retryCount,
      },
    });
  }
  
  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Create and start a workflow executor
 */
export function createExecutor(config: WorkflowExecutorConfig): WorkflowExecutor {
  return new WorkflowExecutor(config);
}
