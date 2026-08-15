import { describe, expect, it, vi } from "vitest";
import {
  WorkflowExecutor,
  compileAuthorizedTaskInput,
  effectiveStepTimeoutMs,
  legacyExecutorOwnsRun,
  validateRunTaskAuthority,
  workflowDefinitionForRun,
  workflowEvidenceDigest,
} from "../executor.js";

function executorWithClient(client: {
  query?: ReturnType<typeof vi.fn>;
  mutation?: ReturnType<typeof vi.fn>;
  action?: ReturnType<typeof vi.fn>;
}) {
  const executor = new WorkflowExecutor({
    convexUrl: "https://example.convex.cloud",
  });
  (executor as any).client = {
    query: client.query ?? vi.fn(),
    mutation: client.mutation ?? vi.fn(),
    action: client.action ?? vi.fn(),
  };
  return executor as any;
}

const gateWorkflow = {
  workflowId: "loop-engineering",
  version: 4,
  name: "Loop Engineering",
  agents: [{ id: "strategist", persona: "Evidence Reviewer" }],
  steps: [
    {
      id: "approval",
      agent: "strategist",
      kind: "GATE",
      isolation: "READ_ONLY",
      input: "Approve this packet: {{packet}}",
      expects: "APPROVED",
      retryLimit: 0,
      timeoutMinutes: 5,
      failurePolicy: "BLOCK",
    },
  ],
};

const gateRun = {
  _id: "workflow-run-id",
  runId: "run-123",
  projectId: "project-1",
  workOrderId: "work-order-1",
  workOrderRevisionNumber: 1,
  context: {
    packet: "verified evidence",
    workOrderDesiredOutcome: "Research retry scheduling.",
    authorityScope: {
      kind: "WORK_ORDER_DESIRED_OUTCOME" as const,
      workOrderId: "work-order-1",
      workOrderRevisionNumber: 1,
      authorityRef: "work-order:work-order-1:revision:1:desired-outcome",
      objective: "Research retry scheduling.",
    },
  },
  steps: [
    {
      stepId: "approval",
      status: "PENDING",
      retryCount: 0,
      dependsOn: [],
    },
  ],
};

describe("WorkflowExecutor reliability", () => {
  it("enforces the lower workflow deadline or operational timeout ceiling", () => {
    expect(effectiveStepTimeoutMs(20, 60_000)).toBe(60_000);
    expect(effectiveStepTimeoutMs(1, 120_000)).toBe(60_000);
  });
  it("does not race the leased Factory attempt worker", () => {
    expect(legacyExecutorOwnsRun({})).toBe(true);
    expect(legacyExecutorOwnsRun({ factoryDefinitionVersionId: "factory-version-1" })).toBe(false);
    expect(legacyExecutorOwnsRun({ executionManifestDigest: "sha256:manifest" })).toBe(false);
  });

  it("validates the frozen Work Order objective before creating a Task", () => {
    expect(validateRunTaskAuthority(gateRun)).toEqual({
      ok: true,
      scope: gateRun.context.authorityScope,
    });
    expect(validateRunTaskAuthority({
      ...gateRun,
      context: { workOrderDesiredOutcome: "Research retry scheduling." },
    })).toEqual({ ok: false, reason: "missing" });
    expect(validateRunTaskAuthority({
      ...gateRun,
      context: {
        ...gateRun.context,
        authorityScope: {
          ...gateRun.context.authorityScope,
          objective: "Audit accessibility.",
        },
      },
    })).toEqual({ ok: false, reason: "mismatched" });
  });

  it("makes the authoritative objective visible in generated Task input", () => {
    expect(compileAuthorizedTaskInput(
      gateRun.context.authorityScope,
      "Inspect the current scheduler.",
    )).toContain("Research retry scheduling.\n\nWorkflow step input:");
  });

  it.each([
    [
      "missing",
      { workOrderDesiredOutcome: "Research retry scheduling." },
    ],
    [
      "mismatched",
      {
        ...gateRun.context,
        authorityScope: {
          ...gateRun.context.authorityScope,
          objective: "Audit accessibility.",
        },
      },
    ],
  ])("fails a step before Task creation when authority is %s", async (reason, context) => {
    const query = vi.fn();
    const mutation = vi.fn().mockResolvedValue({ success: true });
    const executor = executorWithClient({ query, mutation });

    await executor.executeStep({ ...gateRun, context }, gateWorkflow, 0);

    expect(query).not.toHaveBeenCalled();
    expect(mutation).toHaveBeenCalledTimes(1);
    expect(mutation.mock.calls[0][1]).toMatchObject({
      runId: "run-123",
      stepIndex: 0,
      status: "FAILED",
      error: `Workflow Task authority scope is ${reason}.`,
    });
  });

  it("executes a run from its pinned workflow definition", () => {
    const installedWorkflow = { ...gateWorkflow, version: 5 };
    const pinnedWorkflow = { ...gateWorkflow, version: 4 };

    expect(workflowDefinitionForRun(
      { workflowSnapshot: pinnedWorkflow },
      installedWorkflow
    )).toBe(pinnedWorkflow);
  });

  it("uses the installed definition only for legacy runs without a snapshot", () => {
    expect(workflowDefinitionForRun({}, gateWorkflow)).toBe(gateWorkflow);
    expect(workflowDefinitionForRun({ workflowSnapshot: { version: 4 } }, gateWorkflow))
      .toBeNull();
  });

  it("stores the required output fields on workflow-created tasks", async () => {
    const query = vi.fn().mockResolvedValue({
      _id: "agent-1",
      allowedTaskTypes: ["CUSTOMER_RESEARCH"],
    });
    const mutation = vi
      .fn()
      .mockResolvedValueOnce({ task: { _id: "task-1" } })
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: true });
    const executor = executorWithClient({ query, mutation });
    const workflow = {
      ...gateWorkflow,
      steps: [
        {
          ...gateWorkflow.steps[0],
          id: "researchArchitecture",
          kind: "AGENT",
          expects: "architectureFindings",
          outputSchema: {
            type: "object",
            required: ["sourceLedger", "architectureFindings"],
          },
        },
      ],
    };

    await executor.executeStep(gateRun, workflow, 0);

    expect(mutation.mock.calls[0][1].metadata.outputContract).toEqual({
      expects: "architectureFindings",
      requiredFields: ["sourceLedger", "architectureFindings"],
    });
    expect(mutation.mock.calls[0][1].metadata.workflowAttempt).toEqual({
      attemptNumber: 1,
      retryNumber: 0,
    });
    expect(mutation.mock.calls[0][1].metadata.authorityScope).toEqual(
      gateRun.context.authorityScope,
    );
    expect(mutation.mock.calls[0][1].description).toContain(
      "Authorized Work Order objective",
    );
    expect(mutation.mock.calls[0][1].workOrderId).toBe("work-order-1");
  });

  it("does not re-transition a Task that creation already moved to READY", async () => {
    const query = vi.fn().mockResolvedValue({
      _id: "agent-1",
      allowedTaskTypes: ["OPS"],
    });
    const mutation = vi
      .fn()
      .mockResolvedValueOnce({ task: { _id: "task-1", status: "READY" } })
      .mockResolvedValueOnce({ success: true });
    const executor = executorWithClient({ query, mutation });

    await executor.executeStep(gateRun, {
      ...gateWorkflow,
      steps: [{ ...gateWorkflow.steps[0], kind: "AGENT" }],
    }, 0);

    expect(mutation).toHaveBeenCalledTimes(2);
    expect(mutation.mock.calls[1][1]).toMatchObject({
      runId: "run-123",
      stepIndex: 0,
      status: "RUNNING",
      taskId: "task-1",
    });
  });

  it("creates a gate approval bound to the task, run, version, and evidence digest", async () => {
    const query = vi.fn().mockResolvedValue({
      _id: "agent-1",
      allowedTaskTypes: ["OPS"],
    });
    const mutation = vi
      .fn()
      .mockResolvedValueOnce({ task: { _id: "task-1" } })
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ approval: { _id: "approval-1" }, created: true });
    const executor = executorWithClient({ query, mutation });

    await executor.executeStep(gateRun, gateWorkflow, 0);

    const createArgs = mutation.mock.calls[0][1];
    const approvalArgs = mutation.mock.calls[3][1];
    expect(createArgs.metadata.gate.targetVersion).toBe("loop-engineering:v4");
    expect(createArgs.metadata.gate.evidenceDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(approvalArgs).toMatchObject({
      taskId: "task-1",
      actionType: "WORKFLOW_GATE",
      riskLevel: "YELLOW",
      actionPayload: {
        workflowRunId: "workflow-run-id",
        runId: "run-123",
        stepId: "approval",
        stepIndex: 0,
        taskId: "task-1",
        targetVersion: "loop-engineering:v4",
        evidenceDigest: createArgs.metadata.gate.evidenceDigest,
      },
    });
  });

  it("supersedes the failed attempt before scheduling a retry", async () => {
    const mutation = vi
      .fn()
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: true });
    const executor = executorWithClient({ mutation });
    const run = {
      ...gateRun,
      steps: [
        {
          stepId: "research",
          status: "FAILED",
          taskId: "task-old",
          retryCount: 0,
          error: "Timed out",
        },
      ],
    };
    const workflow = {
      ...gateWorkflow,
      steps: [
        {
          ...gateWorkflow.steps[0],
          id: "research",
          kind: "AGENT",
          retryLimit: 1,
        },
      ],
    };

    await expect(executor.handleStepFailure(run, workflow, 0)).resolves.toBe(true);

    expect(mutation.mock.calls[0][1]).toEqual({
      taskId: "task-old",
      runId: "run-123",
      stepId: "research",
      retryCount: 0,
      reason: "Timed out",
      idempotencyKey: "workflow:run-123:research:supersede:0",
    });
    expect(mutation.mock.calls[1][1]).toEqual({
      runId: "run-123",
      stepIndex: 0,
    });
    expect(mutation.mock.calls[2][1]).toMatchObject({
      runId: "run-123",
      stepIndex: 0,
      status: "PENDING",
    });
  });

  it("resolves an approved gate and checkpoints the approval evidence", async () => {
    const evidenceDigest = await workflowEvidenceDigest(
      "Approve this packet: verified evidence"
    );
    const task = {
      _id: "task-1",
      status: "ASSIGNED",
      description: "Approve this packet: verified evidence",
      metadata: {
        workflowStepId: "approval",
        graph: { kind: "GATE" },
        gate: {
          evidenceDigest,
          targetVersion: "loop-engineering:v4",
        },
      },
    };
    const approval = {
      _id: "approval-1",
      taskId: "task-1",
      actionType: "WORKFLOW_GATE",
      status: "APPROVED",
      actionPayload: {
        runId: "run-123",
        stepId: "approval",
        taskId: "task-1",
        evidenceDigest,
        targetVersion: "loop-engineering:v4",
      },
    };
    const query = vi
      .fn()
      .mockResolvedValueOnce(task)
      .mockResolvedValueOnce([approval]);
    const mutation = vi
      .fn()
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: true });
    const executor = executorWithClient({ query, mutation });
    const run = {
      ...gateRun,
      steps: [
        {
          ...gateRun.steps[0],
          status: "RUNNING",
          taskId: "task-1",
          agentId: "agent-1",
        },
      ],
    };

    await executor.checkStepCompletion(run, gateWorkflow, 0);

    expect(mutation.mock.calls[0][1]).toMatchObject({
      taskId: "task-1",
      approvalId: "approval-1",
      runId: "run-123",
      stepId: "approval",
      evidenceDigest,
      targetVersion: "loop-engineering:v4",
    });
    expect(mutation.mock.calls[1][1]).toMatchObject({
      runId: "run-123",
      stepIndex: 0,
      status: "DONE",
      output: "APPROVED",
    });
    expect(mutation.mock.calls[2][1].context).toMatchObject({
      approvalId: "approval-1",
      approvalEvidenceDigest: evidenceDigest,
      approvalOutput: "APPROVED",
    });
  });

  it("does not continue when the matching gate is denied", async () => {
    const evidenceDigest = await workflowEvidenceDigest("gate packet");
    const task = {
      _id: "task-1",
      status: "ASSIGNED",
      description: "gate packet",
      metadata: {
        gate: {
          evidenceDigest,
          targetVersion: "loop-engineering:v4",
        },
      },
    };
    const query = vi
      .fn()
      .mockResolvedValueOnce(task)
      .mockResolvedValueOnce([
        {
          _id: "approval-1",
          taskId: "task-1",
          actionType: "WORKFLOW_GATE",
          status: "DENIED",
          decisionReason: "Evidence is incomplete",
          actionPayload: {
            runId: "run-123",
            stepId: "approval",
            taskId: "task-1",
            evidenceDigest,
            targetVersion: "loop-engineering:v4",
          },
        },
      ]);
    const mutation = vi.fn().mockResolvedValue({ success: true });
    const executor = executorWithClient({ query, mutation });
    const run = {
      ...gateRun,
      steps: [
        {
          ...gateRun.steps[0],
          status: "RUNNING",
          taskId: "task-1",
          agentId: "agent-1",
        },
      ],
    };

    await executor.checkStepCompletion(run, gateWorkflow, 0);

    expect(mutation).toHaveBeenCalledTimes(1);
    expect(mutation.mock.calls[0][1]).toMatchObject({
      runId: "run-123",
      stepIndex: 0,
      status: "FAILED",
      error: "Workflow gate denied: Evidence is incomplete",
    });
  });

  it("does not continue when an approval is bound to different evidence", async () => {
    const evidenceDigest = await workflowEvidenceDigest("current gate packet");
    const task = {
      _id: "task-1",
      status: "ASSIGNED",
      description: "current gate packet",
      metadata: {
        gate: {
          evidenceDigest,
          targetVersion: "loop-engineering:v4",
        },
      },
    };
    const query = vi
      .fn()
      .mockResolvedValueOnce(task)
      .mockResolvedValueOnce([
        {
          _id: "approval-1",
          taskId: "task-1",
          actionType: "WORKFLOW_GATE",
          status: "APPROVED",
          decidedByUserId: "operator",
          actionPayload: {
            runId: "run-123",
            stepId: "approval",
            taskId: "task-1",
            evidenceDigest: await workflowEvidenceDigest("older gate packet"),
            targetVersion: "loop-engineering:v4",
          },
        },
      ]);
    const mutation = vi.fn();
    const executor = executorWithClient({ query, mutation });
    const run = {
      ...gateRun,
      steps: [
        {
          ...gateRun.steps[0],
          status: "RUNNING",
          taskId: "task-1",
          agentId: "agent-1",
        },
      ],
    };

    await executor.checkStepCompletion(run, gateWorkflow, 0);

    expect(mutation).toHaveBeenCalledTimes(1);
    expect(mutation.mock.calls[0][1]).toMatchObject({
      taskId: "task-1",
      actionType: "WORKFLOW_GATE",
      actionPayload: {
        runId: "run-123",
        stepId: "approval",
        taskId: "task-1",
        evidenceDigest,
        targetVersion: "loop-engineering:v4",
      },
    });
  });

  it("produces deterministic, content-sensitive evidence digests", async () => {
    const first = await workflowEvidenceDigest("evidence");
    expect(await workflowEvidenceDigest("evidence")).toBe(first);
    expect(await workflowEvidenceDigest("different evidence")).not.toBe(first);
    expect(first).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("projects completed Loop Engineering output exactly once at the completion handoff", async () => {
    const mutation = vi.fn().mockResolvedValue({ success: true });
    const action = vi.fn().mockResolvedValue({ projected: true });
    const executor = executorWithClient({ mutation, action });

    await executor.completeRun({
      _id: "workflow-run-id",
      runId: "run-123",
      projectId: "project-1",
      workflowId: "loop-engineering",
    });

    expect(action).toHaveBeenCalledTimes(1);
    expect(action.mock.calls[0][1]).toEqual({ workflowRunId: "workflow-run-id" });
    expect(mutation).toHaveBeenCalledTimes(2);
  });

  it("projects a completed continuous-research run through the same governed handoff", async () => {
    const mutation = vi.fn().mockResolvedValue({ success: true });
    const action = vi.fn().mockResolvedValue({ projected: true });
    const executor = executorWithClient({ mutation, action });

    await executor.completeRun({
      _id: "continuous-run-id",
      runId: "continuous-run-123",
      projectId: "project-1",
      workflowId: "continuous-research",
    });

    expect(action).toHaveBeenCalledTimes(1);
    expect(action.mock.calls[0][1]).toEqual({ workflowRunId: "continuous-run-id" });
    expect(mutation).toHaveBeenCalledTimes(2);
  });

  it("records an actionable projection failure without falsifying the completed run", async () => {
    const mutation = vi.fn().mockResolvedValue({ success: true });
    const action = vi
      .fn()
      .mockRejectedValueOnce(new Error("approval digest mismatch"))
      .mockResolvedValueOnce({ recorded: true });
    const executor = executorWithClient({ mutation, action });

    await executor.completeRun({
      _id: "workflow-run-id",
      runId: "run-123",
      projectId: "project-1",
      workflowId: "loop-engineering",
    });

    expect(action).toHaveBeenCalledTimes(2);
    expect(action.mock.calls[1][1]).toEqual({
      workflowRunId: "workflow-run-id",
      error: "approval digest mismatch",
    });
  });
});
