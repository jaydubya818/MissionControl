/**
 * Workflow Executor
 *
 * Durable scheduler for legacy linear workflows and dependency-aware DAGs.
 * Agent execution remains delegated to the canonical Task lifecycle: this
 * process creates and assigns a Task, then advances only after that Task is
 * explicitly completed with a deliverable.
 */

import { ConvexHttpClient } from "convex/browser";
import { anyApi as api } from "convex/server";
import {
  compileWorkflowGraph,
  evaluateWorkflowCondition,
  getRunnableNodeIndexes,
  validateStructuredOutput,
  type WorkflowNodeStatus,
} from "./graph";
import { parse, meetsExpectations } from "./parser";
import { render, validateContext } from "./renderer";

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

export async function workflowEvidenceDigest(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
  return `sha256:${hex}`;
}

export class WorkflowExecutor {
  private client: ConvexHttpClient;
  private pollIntervalMs: number;
  private stepTimeoutMs: number;
  private running = false;

  constructor(config: WorkflowExecutorConfig) {
    this.client = new ConvexHttpClient(config.convexUrl);
    this.pollIntervalMs = config.pollIntervalMs ?? 5000;
    this.stepTimeoutMs = config.stepTimeoutMs ?? 60000;
  }

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

  stop(): void {
    this.running = false;
    console.log("[WorkflowExecutor] Stopped");
  }

  /** Exposed for deterministic integration tests and one-shot runtime ticks. */
  async tick(): Promise<void> {
    const pendingRuns = await this.client.query(api.workflowRuns.list, {
      status: "PENDING",
      limit: 10,
    });
    for (const run of pendingRuns) {
      await this.client.mutation(api.workflowRuns.updateStatus, {
        runId: run.runId,
        status: "RUNNING",
      });
    }

    const runningRuns = await this.client.query(api.workflowRuns.list, {
      status: "RUNNING",
      limit: 10,
    });
    for (const run of runningRuns) {
      await this.processRun(run);
    }
  }

  private async processRun(runSnapshot: any): Promise<void> {
    const workflow = await this.client.query(api.workflows.get, {
      workflowId: runSnapshot.workflowId,
    });
    if (!workflow) {
      await this.failRun(runSnapshot, `Workflow not found: ${runSnapshot.workflowId}`);
      return;
    }

    const graph = compileWorkflowGraph(workflow.steps, {
      topology: workflow.topology ?? "LINEAR",
      maxConcurrency: workflow.maxConcurrency ?? 1,
    });

    for (const [index, step] of runSnapshot.steps.entries()) {
      if (step.status === "RUNNING") {
        await this.checkStepCompletion(runSnapshot, workflow, index);
      }
    }

    let run = await this.client.query(api.workflowRuns.get, {
      runId: runSnapshot.runId,
    });
    if (!run || run.status !== "RUNNING") return;

    for (const [index, step] of run.steps.entries()) {
      if (step.status === "FAILED") {
        const continued = await this.handleStepFailure(run, workflow, index);
        if (!continued) return;
      }
    }

    run = await this.client.query(api.workflowRuns.get, { runId: runSnapshot.runId });
    if (!run || run.status !== "RUNNING") return;

    const terminal = run.steps.every((step: any, index: number) => {
      if (step.status === "DONE" || step.status === "SKIPPED") return true;
      return (
        step.status === "FAILED" &&
        workflow.steps[index]?.failurePolicy === "CONTINUE"
      );
    });
    if (terminal) {
      await this.completeRun(run);
      return;
    }

    const runnable = getRunnableNodeIndexes(
      graph,
      run.steps.map((step: any) => ({
        stepId: step.stepId,
        status: step.status as WorkflowNodeStatus,
      }))
    );
    for (const stepIndex of runnable) {
      const stepDefinition = workflow.steps[stepIndex];
      if (!evaluateWorkflowCondition(stepDefinition.condition, run.context)) {
        await this.client.mutation(api.workflowRuns.updateStep, {
          runId: run.runId,
          stepIndex,
          status: "SKIPPED",
          conditionResult: false,
          output: "Skipped by deterministic routing condition.",
        });
        continue;
      }
      await this.executeStep(run, workflow, stepIndex);
    }
  }

  private async executeStep(run: any, workflow: any, stepIndex: number): Promise<void> {
    const stepDefinition = workflow.steps[stepIndex];
    const missingVariables = validateContext(stepDefinition.input, run.context);
    if (missingVariables.length > 0) {
      await this.client.mutation(api.workflowRuns.updateStep, {
        runId: run.runId,
        stepIndex,
        status: "FAILED",
        error: `Missing context variables: ${missingVariables.join(", ")}`,
      });
      return;
    }

    const agentDefinition = workflow.agents.find(
      (agent: any) => agent.id === stepDefinition.agent
    );
    if (!agentDefinition) {
      await this.client.mutation(api.workflowRuns.updateStep, {
        runId: run.runId,
        stepIndex,
        status: "FAILED",
        error: `Agent not defined: ${stepDefinition.agent}`,
      });
      return;
    }

    const agent = await this.client.query(api.agents.getByName, {
      name: agentDefinition.persona,
      projectId: run.projectId,
    });
    if (!agent) {
      await this.client.mutation(api.workflowRuns.updateStep, {
        runId: run.runId,
        stepIndex,
        status: "FAILED",
        error: `Agent persona not available: ${agentDefinition.persona}`,
      });
      return;
    }

    const renderedInput = render(stepDefinition.input, run.context);
    const targetVersion = `${workflow.workflowId}:v${workflow.version}`;
    const evidenceDigest =
      stepDefinition.kind === "GATE"
        ? await workflowEvidenceDigest(renderedInput)
        : undefined;
    const taskResult = await this.client.mutation(api.tasks.create, {
      projectId: run.projectId,
      title: `[${workflow.name}] ${stepDefinition.id}`,
      description: renderedInput,
      type: agent.allowedTaskTypes[0] ?? "OPS",
      priority: stepDefinition.kind === "VERIFY" || stepDefinition.kind === "GATE" ? 2 : 3,
      assigneeIds: [agent._id],
      idempotencyKey: `workflow:${run.runId}:${stepDefinition.id}:attempt:${run.steps[stepIndex].retryCount}`,
      source: "MISSION_PROMPT",
      sourceRef: `workflow-run:${run.runId}`,
      createdBy: "SYSTEM",
      createdByRef: "workflow-executor",
      metadata: {
        workflowRunId: run._id,
        workflowStepId: stepDefinition.id,
        workflowStepIndex: stepIndex,
        workflowAttempt: {
          attemptNumber: run.steps[stepIndex].retryCount + 1,
          retryNumber: run.steps[stepIndex].retryCount,
        },
        outputContract: {
          expects: stepDefinition.expects,
          requiredFields: Array.isArray(stepDefinition.outputSchema?.required)
            ? stepDefinition.outputSchema.required
            : [],
        },
        graph: {
          dependsOn: run.steps[stepIndex].dependsOn ?? [],
          kind: stepDefinition.kind ?? "AGENT",
          modelTier: stepDefinition.modelTier,
          isolation: stepDefinition.isolation,
        },
        ...(evidenceDigest
          ? {
              gate: {
                evidenceDigest,
                targetVersion,
              },
            }
          : {}),
      },
    });
    const taskId = taskResult?.task?._id;
    if (!taskId) {
      await this.client.mutation(api.workflowRuns.updateStep, {
        runId: run.runId,
        stepIndex,
        status: "FAILED",
        error: "Task creation did not return a task id.",
      });
      return;
    }

    const assignment = await this.client.mutation(api.tasks.transition, {
      taskId,
      toStatus: "READY",
      actorType: "SYSTEM",
      actorUserId: "workflow-executor",
      idempotencyKey: `workflow:${run.runId}:${stepDefinition.id}:assign:${run.steps[stepIndex].retryCount}`,
      reason: `Assigned by workflow ${workflow.workflowId}`,
    });
    if (!assignment?.success) {
      await this.client.mutation(api.workflowRuns.updateStep, {
        runId: run.runId,
        stepIndex,
        status: "FAILED",
        taskId,
        agentId: agent._id,
        error:
          assignment?.errors?.map((error: any) => error.message).join(", ") ??
          "Unable to assign workflow task.",
      });
      return;
    }

    await this.client.mutation(api.workflowRuns.updateStep, {
      runId: run.runId,
      stepIndex,
      status: "RUNNING",
      taskId,
      agentId: agent._id,
      conditionResult: true,
    });
    if (stepDefinition.kind === "GATE" && evidenceDigest) {
      await this.requestGateApproval({
        run,
        workflow,
        stepIndex,
        taskId,
        requestorAgentId: agent._id,
        evidenceDigest,
        targetVersion,
      });
    }
    console.log(
      `[WorkflowExecutor] Started ${run.runId}/${stepDefinition.id} as task ${taskId}`
    );
  }

  private async checkStepCompletion(
    run: any,
    workflow: any,
    stepIndex: number
  ): Promise<void> {
    const step = run.steps[stepIndex];
    if (!step.taskId) {
      await this.client.mutation(api.workflowRuns.updateStep, {
        runId: run.runId,
        stepIndex,
        status: "FAILED",
        error: "Running node has no linked task.",
      });
      return;
    }

    const task = await this.client.query(api.tasks.get, { taskId: step.taskId });
    if (!task) {
      await this.client.mutation(api.workflowRuns.updateStep, {
        runId: run.runId,
        stepIndex,
        status: "FAILED",
        error: `Linked task not found: ${step.taskId}`,
      });
      return;
    }

    const stepDefinition = workflow.steps[stepIndex];
    if (stepDefinition.kind === "GATE") {
      await this.checkGateDecision({
        run,
        workflow,
        stepIndex,
        task,
      });
      return;
    }

    const verifiedSubmission =
      task.status === "REVIEW" &&
      stepDefinition.isolation === "READ_ONLY" &&
      stepDefinition.kind !== "GATE";

    if (task.status === "DONE" || verifiedSubmission) {
      const output = task.deliverable?.content ?? task.deliverable?.summary ?? "";
      const contractResult = validateStructuredOutput(output, stepDefinition.outputSchema);
      const expectationMet = stepDefinition.outputSchema
        ? contractResult.ok
        : meetsExpectations(output, stepDefinition.expects);

      if (!expectationMet) {
        const contractErrors =
          "errors" in contractResult ? contractResult.errors.join("; ") : stepDefinition.expects;
        await this.client.mutation(api.workflowRuns.updateStep, {
          runId: run.runId,
          stepIndex,
          status: "FAILED",
          output,
          error: `Output contract failed: ${contractErrors}`,
        });
        return;
      }

      const parsed = parse(output);
      const structuredOutput = contractResult.ok ? contractResult.value : undefined;
      await this.client.mutation(api.workflowRuns.updateStep, {
        runId: run.runId,
        stepIndex,
        status: "DONE",
        output,
        structuredOutput,
      });
      await this.client.mutation(api.workflowRuns.updateContext, {
        runId: run.runId,
        context: {
          [`${step.stepId}Output`]: structuredOutput ?? output,
          ...parsed.data,
        },
      });
      return;
    }

    if (task.status === "FAILED" || task.status === "CANCELED") {
      await this.client.mutation(api.workflowRuns.updateStep, {
        runId: run.runId,
        stepIndex,
        status: "FAILED",
        error: task.blockedReason ?? `Task ended as ${task.status}`,
      });
      return;
    }

    const timeoutMs = Math.min(
      stepDefinition.timeoutMinutes * 60 * 1000,
      Math.max(this.stepTimeoutMs, stepDefinition.timeoutMinutes * 60 * 1000)
    );
    if (step.startedAt && Date.now() - step.startedAt > timeoutMs) {
      await this.client.mutation(api.workflowRuns.updateStep, {
        runId: run.runId,
        stepIndex,
        status: "FAILED",
        error: `Timeout after ${stepDefinition.timeoutMinutes} minutes`,
      });
    }
  }

  /**
   * Returns true when the graph can continue. A retry is checkpointed as
   * PENDING; exhausted BLOCK/RETRY policies fail and pause the run.
   */
  private async handleStepFailure(
    run: any,
    workflow: any,
    stepIndex: number
  ): Promise<boolean> {
    const step = run.steps[stepIndex];
    const definition = workflow.steps[stepIndex];
    if (definition.failurePolicy === "CONTINUE") return true;

    if (step.taskId) {
      const supersession = await this.client.mutation(
        api.tasks.supersedeWorkflowAttempt,
        {
          taskId: step.taskId,
          runId: run.runId,
          stepId: step.stepId,
          retryCount: step.retryCount,
          reason: step.error ?? "Workflow attempt failed",
          idempotencyKey: `workflow:${run.runId}:${step.stepId}:supersede:${step.retryCount}`,
        }
      );
      if (!supersession?.success) {
        const reason =
          supersession?.error ?? "Unable to supersede the failed workflow attempt";
        await this.failRun(run, reason);
        await this.escalateToHuman(run, stepIndex, reason);
        return false;
      }
    }

    if (step.retryCount < definition.retryLimit) {
      await this.client.mutation(api.workflowRuns.incrementRetry, {
        runId: run.runId,
        stepIndex,
      });
      await this.client.mutation(api.workflowRuns.updateStep, {
        runId: run.runId,
        stepIndex,
        status: "PENDING",
      });
      return true;
    }

    await this.failRun(
      run,
      `Node "${step.stepId}" failed after ${step.retryCount + 1} attempt(s): ${
        step.error ?? "Unknown error"
      }`
    );
    await this.escalateToHuman(run, stepIndex, step.error ?? "Unknown error");
    return false;
  }

  private async requestGateApproval(args: {
    run: any;
    workflow: any;
    stepIndex: number;
    taskId: any;
    requestorAgentId: any;
    evidenceDigest: string;
    targetVersion: string;
  }): Promise<void> {
    const stepDefinition = args.workflow.steps[args.stepIndex];
    await this.client.mutation(api.approvals.request, {
      projectId: args.run.projectId,
      taskId: args.taskId,
      requestorAgentId: args.requestorAgentId,
      actionType: "WORKFLOW_GATE",
      actionSummary: `Approve ${args.workflow.name} gate "${stepDefinition.id}"`,
      riskLevel: "YELLOW",
      justification:
        "Explicit operator approval is required before this workflow can apply its evidence-linked recommendation.",
      actionPayload: {
        workflowRunId: args.run._id,
        runId: args.run.runId,
        stepId: stepDefinition.id,
        stepIndex: args.stepIndex,
        taskId: args.taskId,
        evidenceDigest: args.evidenceDigest,
        targetVersion: args.targetVersion,
      },
      expiresInMinutes: stepDefinition.timeoutMinutes,
      idempotencyKey: `workflow:${args.run.runId}:${stepDefinition.id}:gate:${args.evidenceDigest}`,
    });
  }

  private async checkGateDecision(args: {
    run: any;
    workflow: any;
    stepIndex: number;
    task: any;
  }): Promise<void> {
    const step = args.run.steps[args.stepIndex];
    const stepDefinition = args.workflow.steps[args.stepIndex];
    const gateMetadata = args.task.metadata?.gate;
    const targetVersion = `${args.workflow.workflowId}:v${args.workflow.version}`;
    const evidenceDigest =
      gateMetadata?.evidenceDigest ??
      (await workflowEvidenceDigest(args.task.description ?? ""));
    const approvals = await this.client.query(api.approvals.listByTask, {
      taskId: args.task._id,
      limit: 50,
    });
    const approval = approvals.find((candidate: any) => {
      const payload = candidate.actionPayload ?? {};
      return (
        candidate.actionType === "WORKFLOW_GATE" &&
        payload.runId === args.run.runId &&
        payload.stepId === stepDefinition.id &&
        payload.taskId === args.task._id &&
        payload.evidenceDigest === evidenceDigest &&
        payload.targetVersion === targetVersion
      );
    });

    if (!approval) {
      if (!step.agentId) {
        await this.client.mutation(api.workflowRuns.updateStep, {
          runId: args.run.runId,
          stepIndex: args.stepIndex,
          status: "FAILED",
          error: "Gate task has no requestor agent.",
        });
        return;
      }
      await this.requestGateApproval({
        run: args.run,
        workflow: args.workflow,
        stepIndex: args.stepIndex,
        taskId: args.task._id,
        requestorAgentId: step.agentId,
        evidenceDigest,
        targetVersion,
      });
      return;
    }

    if (["DENIED", "EXPIRED", "CANCELED"].includes(approval.status)) {
      await this.client.mutation(api.workflowRuns.updateStep, {
        runId: args.run.runId,
        stepIndex: args.stepIndex,
        status: "FAILED",
        error: `Workflow gate ${approval.status.toLowerCase()}: ${
          approval.decisionReason ?? "No decision reason provided"
        }`,
      });
      return;
    }
    if (approval.status !== "APPROVED") return;

    const resolution = await this.client.mutation(
      api.tasks.resolveApprovedWorkflowGate,
      {
        taskId: args.task._id,
        approvalId: approval._id,
        runId: args.run.runId,
        stepId: stepDefinition.id,
        evidenceDigest,
        targetVersion,
        idempotencyKey: `workflow:${args.run.runId}:${stepDefinition.id}:resolve:${approval._id}`,
      }
    );
    if (!resolution?.success) {
      await this.client.mutation(api.workflowRuns.updateStep, {
        runId: args.run.runId,
        stepIndex: args.stepIndex,
        status: "FAILED",
        error: resolution?.error ?? "Approved gate could not be resolved.",
      });
      return;
    }

    await this.client.mutation(api.workflowRuns.updateStep, {
      runId: args.run.runId,
      stepIndex: args.stepIndex,
      status: "DONE",
      output: "APPROVED",
    });
    await this.client.mutation(api.workflowRuns.updateContext, {
      runId: args.run.runId,
      context: {
        [`${step.stepId}Output`]: "APPROVED",
        approvalId: approval._id,
        approvalEvidenceDigest: evidenceDigest,
      },
    });
  }

  private async completeRun(run: any): Promise<void> {
    await this.client.mutation(api.workflowRuns.updateStatus, {
      runId: run.runId,
      status: "COMPLETED",
    });
    await this.client.mutation(api.activities.create, {
      projectId: run.projectId,
      actorType: "SYSTEM",
      action: "WORKFLOW_COMPLETED",
      description: `Workflow run ${run.runId} completed successfully`,
      targetType: "WORKFLOW_RUN",
      targetId: run._id,
    });
  }

  private async failRun(run: any, reason: string): Promise<void> {
    await this.client.mutation(api.workflowRuns.updateStatus, {
      runId: run.runId,
      status: "FAILED",
      failureReason: reason,
    });
  }

  private async escalateToHuman(
    run: any,
    stepIndex: number,
    error: string
  ): Promise<void> {
    const step = run.steps[stepIndex];
    const agent = step.agentId
      ? await this.client.query(api.agents.get, { agentId: step.agentId })
      : null;
    if (agent) {
      await this.client.mutation(api.approvals.request, {
        projectId: run.projectId,
        taskId: run.parentTaskId,
        requestorAgentId: agent._id,
        actionType: "WORKFLOW_STEP_RETRY",
        actionSummary: `Workflow node "${step.stepId}" requires intervention`,
        riskLevel: "YELLOW",
        justification: `${error}. Automated retries are exhausted.`,
        actionPayload: {
          workflowRunId: run._id,
          runId: run.runId,
          stepIndex,
          error,
        },
        idempotencyKey: `workflow:${run.runId}:${step.stepId}:escalation:${step.retryCount}`,
      });
    }
    await this.client.mutation(api.activities.create, {
      projectId: run.projectId,
      actorType: "SYSTEM",
      action: "WORKFLOW_ESCALATED",
      description: `Workflow run ${run.runId} escalated at ${step.stepId}`,
      targetType: "WORKFLOW_RUN",
      targetId: run._id,
      metadata: { stepId: step.stepId, stepIndex, error, retryCount: step.retryCount },
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export function createExecutor(config: WorkflowExecutorConfig): WorkflowExecutor {
  return new WorkflowExecutor(config);
}
