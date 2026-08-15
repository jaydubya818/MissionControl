import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

const CANARY_CONFIRMATION = "research-lab-workflow-recovery-v1";
const FIXTURE_KEYS = ["lifecycle", "concurrency", "budget", "quarantine"] as const;

function assertCanaryEnabled(confirmation?: string) {
  if (
    process.env.WORKFLOW_RECOVERY_CANARY_ENABLED !== "true"
    || (confirmation !== undefined && confirmation !== CANARY_CONFIRMATION)
  ) {
    throw new Error("Workflow recovery canary functions are disabled on this deployment.");
  }
}

async function seedFixture(ctx: MutationCtx, input: {
  projectId: Id<"projects">;
  tenantId?: Id<"tenants">;
  key: typeof FIXTURE_KEYS[number];
}) {
  const runId = `recovery-canary-${input.key}`;
  const existingRun = await ctx.db
    .query("workflowRuns")
    .withIndex("by_run_id", (q) => q.eq("runId", runId))
    .first();
  if (existingRun) {
    return { key: input.key, created: false, runId, workflowRunId: existingRun._id, workOrderId: existingRun.workOrderId };
  }

  const now = Date.now();
  const workOrderId = await ctx.db.insert("workOrders", {
    tenantId: input.tenantId,
    projectId: input.projectId,
    idempotencyKey: `workflow-recovery-canary:${input.key}`,
    title: `[Recovery canary] ${input.key}`,
    desiredOutcome: `Prove ${input.key} execution controls without scheduling or repository writes.`,
    context: "Manual Research Lab control-plane canary for todo 040.",
    workflowId: "continuous-research",
    isMutating: false,
    priority: 1,
    riskLevel: "LOW",
    requestedBy: "codex-workflow-recovery-canary",
    assignedAgent: "Deterministic control verifier",
    acceptanceCriteria: [{
      id: `${input.key}-control-proof`,
      title: `Prove ${input.key} control behavior`,
      description: "Retain lease, heartbeat, checkpoint, and decision evidence in the canonical run ledger.",
      verificationMethod: "TEST",
      status: "PENDING",
    }],
    constraints: [
      "Manual dispatch only",
      "No repository writes",
      "No agent Task creation",
      "Continuous scheduling remains disabled",
    ],
    requiredApprovals: [],
    state: "DISPATCHED",
    verificationStatus: "PENDING",
    approvalStatus: "NOT_REQUIRED",
    currentRevisionNumber: 1,
    createdAt: now,
    updatedAt: now,
    metadata: {
      recoveryCanary: true,
      fixtureKey: input.key,
      continuousSchedulingEnabled: false,
    },
  });
  const workflowRunId = await ctx.db.insert("workflowRuns", {
    tenantId: input.tenantId,
    runId,
    workflowId: "continuous-research",
    workflowVersion: 1,
    workflowSnapshot: {
      workflowId: "continuous-research",
      version: 1,
      name: "Workflow Recovery Canary",
      topology: "LINEAR",
      maxConcurrency: 1,
      agents: [],
      steps: [{
        id: "controlProof",
        kind: "VERIFY",
        isolation: "READ_ONLY",
        retryLimit: 1,
        timeoutMinutes: 1,
        failurePolicy: "BLOCK",
      }],
    },
    projectId: input.projectId,
    workOrderId,
    workOrderRevisionNumber: 1,
    isMutating: false,
    status: "PENDING",
    currentStepIndex: 0,
    totalSteps: 1,
    steps: [{
      stepId: "controlProof",
      status: "PENDING",
      kind: "VERIFY",
      isolation: "READ_ONLY",
      failurePolicy: "BLOCK",
      retryCount: 0,
    }],
    context: {
      recoveryCanary: true,
      fixtureKey: input.key,
      continuousSchedulingEnabled: false,
    },
    topology: "LINEAR",
    maxConcurrency: 1,
    initialInput: `Manual ${input.key} recovery proof`,
    executionEnvironment: "LOCAL",
    budgetUsd: 5,
    spentUsd: 0,
    stopCondition: "Stop after the named deterministic control is proven.",
    startedAt: now,
    metadata: {
      recoveryCanary: true,
      fixtureKey: input.key,
      automaticDispatch: false,
      repositoryWrites: false,
    },
  });
  await ctx.db.patch(workOrderId, { currentExecutionRunId: workflowRunId });
  return { key: input.key, created: true, runId, workflowRunId, workOrderId };
}

export const seed = mutation({
  args: {
    projectId: v.id("projects"),
    confirmation: v.literal(CANARY_CONFIRMATION),
  },
  handler: async (ctx, args) => {
    assertCanaryEnabled(args.confirmation);
    const project = await ctx.db.get(args.projectId);
    if (!project) throw new Error("Research Lab workspace not found.");
    if (!/research lab/i.test(project.name)) {
      throw new Error("The recovery canary may run only in the Software Factory Research Lab.");
    }
    const fixtures = [];
    for (const key of FIXTURE_KEYS) {
      fixtures.push(await seedFixture(ctx, {
        projectId: project._id,
        tenantId: project.tenantId,
        key,
      }));
    }
    return {
      projectId: project._id,
      projectName: project.name,
      continuousSchedulingEnabled: false,
      fixtures,
    };
  },
});

export const status = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    assertCanaryEnabled();
    const [runs, controls] = await Promise.all([
      ctx.db.query("workflowRuns").withIndex("by_project", (q) => q.eq("projectId", args.projectId)).collect(),
      ctx.db.query("operatorControls").withIndex("by_project", (q) => q.eq("projectId", args.projectId)).order("desc").take(1),
    ]);
    const fixtures = [];
    for (const run of runs.filter((candidate) => candidate.metadata?.recoveryCanary)) {
      const [events, artifacts] = await Promise.all([
        ctx.db.query("runEvents").withIndex("by_run", (q) => q.eq("workflowRunId", run._id)).collect(),
        ctx.db.query("runArtifacts").withIndex("by_run", (q) => q.eq("workflowRunId", run._id)).collect(),
      ]);
      fixtures.push({
        key: run.metadata?.fixtureKey,
        runId: run.runId,
        workflowRunId: run._id,
        workOrderId: run.workOrderId,
        status: run.status,
        lease: run.lease,
        spentUsd: run.spentUsd ?? 0,
        reservedCostUsd: run.reservedCostUsd ?? 0,
        staleRecoveryCount: run.executionStaleRecoveryCount ?? 0,
        checkpoint: run.executionCheckpoint,
        quarantine: run.executionQuarantine,
        eventTypes: events.map((event) => event.eventType),
        checkpointArtifactIds: artifacts
          .filter((artifact) => artifact.artifactType === "CHECKPOINT")
          .map((artifact) => artifact._id),
      });
    }
    return {
      control: controls[0] ?? null,
      continuousSchedulingEnabled: controls[0]?.continuousSchedulingEnabled ?? false,
      fixtures: fixtures.sort((a, b) => String(a.key).localeCompare(String(b.key))),
    };
  },
});

export const verify = mutation({
  args: {
    projectId: v.id("projects"),
    confirmation: v.literal(CANARY_CONFIRMATION),
  },
  handler: async (ctx, args) => {
    assertCanaryEnabled(args.confirmation);
    const controls = await ctx.db
      .query("operatorControls")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .take(1);
    const latestControl = controls[0];
    const workspaceSafe = latestControl?.mode === "NORMAL"
      && latestControl.continuousSchedulingEnabled === false;
    const runs = await ctx.db
      .query("workflowRuns")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    const results = [];

    for (const run of runs.filter((candidate) => candidate.metadata?.recoveryCanary)) {
      if (!run.workOrderId) continue;
      const [events, artifacts, workOrder] = await Promise.all([
        ctx.db.query("runEvents").withIndex("by_run", (q) => q.eq("workflowRunId", run._id)).collect(),
        ctx.db.query("runArtifacts").withIndex("by_run", (q) => q.eq("workflowRunId", run._id)).collect(),
        ctx.db.get(run.workOrderId),
      ]);
      if (!workOrder) continue;
      const eventTypes = new Set(events.map((event) => event.eventType));
      const checkpointArtifacts = artifacts.filter((artifact) => artifact.artifactType === "CHECKPOINT");
      const key = String(run.metadata?.fixtureKey ?? "unknown");
      const checks = [
        { id: "workspace-restored", passed: workspaceSafe },
        { id: "checkpoint-retained", passed: checkpointArtifacts.length > 0 && Boolean(run.executionCheckpoint) },
        { id: "lease-released", passed: !run.lease && (run.reservedCostUsd ?? 0) === 0 },
        ...(key === "lifecycle"
          ? [
              { id: "stale-recovered", passed: eventTypes.has("STALE_RUN_RECOVERED") },
              { id: "heartbeat-recorded", passed: eventTypes.has("EXECUTION_HEARTBEAT") },
            ]
          : []),
        ...(key === "concurrency"
          ? [
              { id: "retry-checkpointed", passed: eventTypes.has("RETRY_STARTED") && checkpointArtifacts.length >= 3 },
              { id: "kill-acknowledged", passed: eventTypes.has("RUN_CANCELED") && run.status === "CANCELED" },
            ]
          : []),
        ...(key === "budget"
          ? [{ id: "budget-stopped", passed: run.spentUsd === 5 && eventTypes.has("EXECUTION_HEARTBEAT") }]
          : []),
        ...(key === "quarantine"
          ? [{
              id: "stale-quarantined",
              passed: run.executionQuarantine?.code === "stale-recovery-limit-exceeded"
                && run.executionQuarantine.staleRecoveryCount === 2
                && eventTypes.has("RUN_QUARANTINED"),
            }]
          : []),
      ];
      const passed = checks.every((check) => check.passed);
      const receiptKey = `workflow-recovery-canary-verification:${run.runId}:v1`;
      let receipt = await ctx.db
        .query("verificationReceipts")
        .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", receiptKey))
        .first();
      if (!receipt) {
        const receiptId = await ctx.db.insert("verificationReceipts", {
          tenantId: run.tenantId,
          projectId: run.projectId,
          workOrderId: workOrder._id,
          receiptScope: "ACCEPTANCE_CRITERION",
          acceptanceCriterionId: `${key}-control-proof`,
          workflowRunId: run._id,
          idempotencyKey: receiptKey,
          verificationMethod: "TEST",
          commandOrCheck: "workflowRecoveryCanary:verify",
          result: JSON.stringify(checks),
          evidenceLocation: `workflow-run:${run.runId}`,
          verifier: "workflow-recovery-independent-verifier-v1",
          status: passed ? "PASSED" : "FAILED",
          linkedRunArtifactIds: checkpointArtifacts.map((artifact) => artifact._id),
          verdict: passed ? "VERIFIED" : "NOT_VERIFIED",
          verdictReasons: checks
            .filter((check) => !check.passed)
            .map((check) => `${check.id} failed`),
          workOrderRevisionNumber: workOrder.currentRevisionNumber ?? 1,
          recordedAt: Date.now(),
          metadata: {
            independentOfExecutorOwner: true,
            continuousSchedulingEnabled: false,
            fixtureKey: key,
          },
        });
        receipt = await ctx.db.get(receiptId);
      }
      await ctx.db.patch(workOrder._id, {
        state: passed ? "DONE" : "BLOCKED",
        verificationStatus: passed ? "PASS" : "FAIL",
        blockingIssue: passed ? undefined : "Independent recovery canary verification failed.",
        acceptanceCriteria: workOrder.acceptanceCriteria.map((criterion) => ({
          ...criterion,
          status: passed ? "PASS" as const : "FAIL" as const,
        })),
        updatedAt: Date.now(),
      });
      results.push({ key, passed, checks, receiptId: receipt?._id });
    }
    return {
      verified: results.length === FIXTURE_KEYS.length && results.every((result) => result.passed),
      continuousSchedulingEnabled: false,
      workspaceMode: latestControl?.mode,
      results: results.sort((a, b) => a.key.localeCompare(b.key)),
    };
  },
});
