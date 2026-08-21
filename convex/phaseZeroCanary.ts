/**
 * INTERNAL ONLY.
 *
 * Every function in this module is destructive, deployment-wide, or fixture
 * tooling with no legitimate browser caller. Convex `query`/`mutation`/`action`
 * exports are internet-callable by anyone holding the deployment URL — which
 * ships in the client bundle as `VITE_CONVEX_URL` — so these are declared
 * `internal*`. Operators still invoke them through `npx convex run`, which
 * authenticates with deployment admin credentials and can call internal
 * functions.
 */
import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { sha256Hex } from "./lib/harnessPrChecks";

const CANARY_CONFIRMATION = "phase-zero-read-only-canary-v1";
const CANARY_PROJECT_SLUG = "software-factory-phase-zero-canary";

function assertCanaryEnabled(confirmation?: string) {
  if (
    process.env.PHASE_ZERO_CANARY_ENABLED !== "true"
    || (confirmation !== undefined && confirmation !== CANARY_CONFIRMATION)
  ) {
    throw new Error("Phase 0 canary functions are disabled on this deployment");
  }
}

async function insertAutomationFixture(ctx: MutationCtx, input: {
  projectId: Id<"projects">;
  sourceSkillId: Id<"contextPackages">;
  sourceSkillVersionId: Id<"contextPackageVersions">;
  key: string;
  name: string;
  maxRetries: number;
}) {
  const now = Date.now();
  const content = [
    `// ${input.name}`,
    "// Deterministic LEVEL_1 read-only Phase 0 canary artifact.",
    'console.log(JSON.stringify({ status: "passed", writes: 0 }));',
  ].join("\n");
  const contentHash = `sha256:${await sha256Hex(content)}`;
  const suggestionId = await ctx.db.insert("metaLoopSuggestions", {
    projectId: input.projectId,
    kind: "VERIFIER",
    title: input.name,
    summary: "Prove bounded read-only execution controls before continuous scheduling.",
    status: "ACCEPTED",
    sourceRef: `phase-zero-canary:${input.key}`,
    dedupeKey: `phase-zero-canary:${input.key}`,
    confidence: 1,
    impact: "LOW",
    affectedSurface: "read-only Automation execution",
    payload: { canary: true, key: input.key },
    createdAt: now,
    resolvedAt: now,
  });
  const artifactId = await ctx.db.insert("automationArtifacts", {
    projectId: input.projectId,
    sourceSkillId: input.sourceSkillId,
    sourceSkillVersionId: input.sourceSkillVersionId,
    adapterType: "TYPESCRIPT",
    mode: "GENERATED",
    repository: "jaydubya818/MissionControl",
    branch: "codex/sandbox",
    workingDirectory: ".",
    path: `canaries/${input.key}.ts`,
    content,
    contentHash,
    manifest: {
      adapterType: "TYPESCRIPT",
      command: "phase-zero-read-only-canary",
      readOnly: true,
      evidenceCollection: ["result", "claim-ledger", "verification-receipt"],
    },
    validationStatus: "PASSED",
    validationFindings: [],
    createdBy: "phase-zero-canary-seed",
    createdAt: now,
    updatedAt: now,
  });
  const definitionId = await ctx.db.insert("automationDefinitions", {
    projectId: input.projectId,
    sourceCandidateId: suggestionId,
    definitionVersion: 1,
    name: input.name,
    description: "Manual-only read-only canary; continuous scheduling is intentionally disabled.",
    ownerId: "phase-zero-operator",
    sourceSkillId: input.sourceSkillId,
    sourceSkillVersionId: input.sourceSkillVersionId,
    sourceSkillVersion: "1.0.0",
    adapterType: "TYPESCRIPT",
    artifactId,
    artifactPath: `canaries/${input.key}.ts`,
    branch: "codex/sandbox",
    workingDirectory: ".",
    runtime: "typescript",
    inputBindings: {},
    outputContract: { status: "passed|failed", writes: 0 },
    requiredPermissions: ["repository:read"],
    secretReferences: [],
    validationStatus: "PASSED",
    reviewStatus: "APPROVED",
    approvedBy: "phase-zero-product-owner",
    approvedAt: now,
    correlationId: `phase-zero-canary:${input.key}`,
    workflowId: "phase-zero-read-only-canary",
    workflowVersion: "v1",
    triggerType: "MANUAL",
    triggerConfig: { automaticDispatch: false },
    scope: String(input.projectId),
    repositoryIds: ["jaydubya818/MissionControl"],
    environmentIds: ["isolated-local-canary"],
    autonomyLevel: "LEVEL_1",
    isMutating: false,
    riskLevel: "LOW",
    requiredApprovalTypes: ["OPERATOR"],
    verificationContract: {
      independent: true,
      receiptRequired: true,
      executorMayVerify: false,
    },
    evidenceRequirements: [
      "Atomic claim ledger",
      "Bounded retry provenance",
      "Independent verification receipt",
    ],
    maxDurationSeconds: 1,
    maxRetries: input.maxRetries,
    maxCostUsd: 1,
    concurrencyLimit: 1,
    idempotencyStrategy: "phase-zero-canary:fixture-key",
    overlapPolicy: "SKIP",
    catchUpPolicy: "SKIP_MISSED",
    status: "ACTIVE",
    reliabilityState: "PROBATION",
    health: "UNKNOWN",
    activatedBy: "phase-zero-product-owner",
    activatedAt: now,
    activationReason: "Explicit isolated Phase 0 canary approval",
    activationPolicyVersion: "read-only-execution-v1",
    createdAt: now,
    updatedAt: now,
  });
  await ctx.db.insert("automationDecisions", {
    projectId: input.projectId,
    automationDefinitionId: definitionId,
    decisionType: "ACTIVATED",
    actorId: "phase-zero-product-owner",
    reason: "Activated only inside the isolated manual canary deployment",
    policyVersion: "read-only-execution-v1",
    definitionVersion: 1,
    decidedAt: now,
    entityType: "AUTOMATION_DEFINITION",
    entityId: String(definitionId),
    newState: "ACTIVE",
    correlationId: `phase-zero-canary:${input.key}`,
    metadata: { automaticDispatch: false, canary: true },
  });
  return { definitionId, artifactId };
}

async function insertWorkOrderFixture(ctx: MutationCtx, input: {
  projectId: Id<"projects">;
  definitionId: Id<"automationDefinitions">;
  definitionName: string;
  key: string;
  title: string;
  desiredOutcome: string;
}) {
  const now = Date.now();
  const workOrderId = await ctx.db.insert("workOrders", {
    projectId: input.projectId,
    idempotencyKey: `phase-zero-canary:${input.key}`,
    title: input.title,
    desiredOutcome: input.desiredOutcome,
    context: "Isolated mutation-level proof for the approved Phase 0 operational-control plan.",
    workflowId: "phase-zero-read-only-canary",
    repository: "jaydubya818/MissionControl",
    isMutating: false,
    priority: 1,
    riskLevel: "LOW",
    requestedBy: "phase-zero-product-owner",
    assignedAgent: "Codex V1 read-only adapter",
    acceptanceCriteria: [{
      id: "independent-verification",
      title: "Independent verifier confirms the immutable canary evidence",
      description: "The executor cannot create or approve its own verification receipt.",
      verificationMethod: "TEST",
      status: "PENDING",
    }],
    constraints: [
      "No repository writes",
      "No automatic scheduling",
      "No access to the preserved Research Lab database",
    ],
    dependencies: [],
    sourceOfTruthRefs: [{
      kind: "DOC",
      label: "Governed Continuous Learning Phase 0",
      location: "docs/plans/2026-08-08-feat-governed-continuous-learning-plan.md#phase-0--restore-truth-and-authority",
    }],
    requiredApprovals: [],
    state: "DISPATCHED",
    verificationStatus: "PENDING",
    approvalStatus: "NOT_REQUIRED",
    currentRevisionNumber: 1,
    createdAt: now,
    updatedAt: now,
    metadata: {
      automationDefinitionId: input.definitionId,
      automationDefinitionName: input.definitionName,
      automationWorkflowVersion: "v1",
      automationTrigger: "MANUAL",
      automationScope: String(input.projectId),
      automationPolicy: {
        autonomyLevel: "LEVEL_1",
        isMutating: false,
        approvalRequired: true,
        independentReceiptRequired: true,
      },
      fixtureKey: input.key,
      canary: true,
      automaticDispatch: false,
      semanticScopeRef: "Governed Continuous Learning Phase 0",
    },
  });
  const workflowRunId = await ctx.db.insert("workflowRuns", {
    runId: `p0-${input.key}`,
    workflowId: "phase-zero-read-only-canary",
    workflowVersion: 1,
    workflowSnapshot: {
      id: "phase-zero-read-only-canary",
      version: 1,
      steps: [{ id: "read-only-proof", kind: "VERIFY", isolation: "READ_ONLY" }],
    },
    projectId: input.projectId,
    workOrderId,
    workOrderRevisionNumber: 1,
    isMutating: false,
    allowedTools: ["repository:read"],
    status: "PENDING",
    currentStepIndex: 0,
    totalSteps: 1,
    steps: [{
      stepId: "read-only-proof",
      status: "PENDING",
      kind: "VERIFY",
      isolation: "READ_ONLY",
      failurePolicy: "BLOCK",
      retryCount: 0,
    }],
    context: {
      fixtureKey: input.key,
      authority: input.desiredOutcome,
      sourceOfTruthRef: "Governed Continuous Learning Phase 0",
    },
    topology: "LINEAR",
    maxConcurrency: 1,
    initialInput: input.desiredOutcome,
    runtime: "typescript",
    executionEnvironment: "LOCAL",
    budgetUsd: 1,
    spentUsd: 0,
    stopCondition: "Stop after one verified bounded lifecycle.",
    startedAt: now,
    metadata: { fixtureKey: input.key, canary: true, automaticDispatch: false },
  });
  await ctx.db.patch(workOrderId, { currentExecutionRunId: workflowRunId });
  const evaluationId = await ctx.db.insert("automationEvaluations", {
    projectId: input.projectId,
    automationDefinitionId: input.definitionId,
    workOrderId,
    evaluationKey: `phase-zero-canary:${input.key}`,
    triggerType: "MANUAL",
    status: "DISPATCHED",
    reason: "Explicitly seeded in the isolated Phase 0 canary deployment",
    checks: {
      semanticScope: "PASSED",
      automaticDispatch: false,
      readOnly: true,
      independentVerificationRequired: true,
    },
    correlationId: `phase-zero-canary:${input.key}`,
    createdBy: "phase-zero-canary-seed",
    createdAt: now,
    updatedAt: now,
  });
  return { workOrderId, workflowRunId, evaluationId };
}

export const seed = internalMutation({
  args: { confirmation: v.literal(CANARY_CONFIRMATION) },
  handler: async (ctx, args) => {
    assertCanaryEnabled(args.confirmation);
    const existing = await ctx.db
      .query("projects")
      .withIndex("by_slug", (q) => q.eq("slug", CANARY_PROJECT_SLUG))
      .first();
    if (existing) {
      return { created: false, projectId: existing._id, projectSlug: existing.slug };
    }

    const now = Date.now();
    const tenantId = await ctx.db.insert("tenants", {
      name: "Phase 0 Canary",
      slug: "phase-zero-canary",
      description: "Isolated local-only operational-control proof.",
      active: true,
      metadata: { canary: true, automaticDispatch: false },
      createdAt: now,
      updatedAt: now,
    });
    const projectId = await ctx.db.insert("projects", {
      tenantId,
      name: "Software Factory Phase 0 Canary",
      slug: CANARY_PROJECT_SLUG,
      description: "Fresh isolated proof; not the preserved Software Factory Research Lab.",
      purpose: "Prove governed read-only lifecycle controls before any continuous scheduling.",
      owner: "phase-zero-product-owner",
      status: "ACTIVE",
      githubRepo: "jaydubya818/MissionControl",
      githubBranch: "codex/sandbox",
      repositoryStatus: "CONFIGURED",
      taskPrefix: "P0",
      nextTaskNumber: 1,
      metadata: { canary: true, automaticDispatch: false, continuousScheduling: false },
      createdAt: now,
      updatedAt: now,
    });
    const sourceSkillId = await ctx.db.insert("contextPackages", {
      name: "phase-zero-read-only-canary",
      slug: "mission-control/phase-zero-read-only-canary",
      displayName: "Phase 0 Read-only Canary",
      description: "Deterministic operational-control verification fixture.",
      type: "SKILL",
      status: "ACTIVE",
      owner: "phase-zero-product-owner",
      tags: ["canary", "read-only", "phase-zero"],
      riskLevel: "GREEN",
      projectId,
      tenantId,
      createdAt: now,
      updatedAt: now,
    });
    const sourceSkillVersionId = await ctx.db.insert("contextPackageVersions", {
      packageId: sourceSkillId,
      version: "1.0.0",
      status: "PUBLISHED",
      contentHash: `sha256:${await sha256Hex(CANARY_CONFIRMATION)}`,
      inlineContent: "Deterministic manual-only read-only Phase 0 canary.",
      manifestVersion: "1",
      sourceRepo: "jaydubya818/MissionControl",
      sourcePath: "convex/phaseZeroCanary.ts",
      capabilities: ["repository:read"],
      automationProfile: { readOnly: true, deterministic: true },
      qualityScore: 100,
      securityStatus: "PASSED",
      approvedBy: "phase-zero-product-owner",
      approvedAt: now,
      publishedAt: now,
      createdAt: now,
    });
    await ctx.db.patch(sourceSkillId, { currentVersionId: sourceSkillVersionId });

    const lifecycleDefinition = await insertAutomationFixture(ctx, {
      projectId,
      sourceSkillId,
      sourceSkillVersionId,
      key: "lifecycle",
      name: "Phase 0 Lifecycle Canary",
      maxRetries: 1,
    });
    const quarantineDefinition = await insertAutomationFixture(ctx, {
      projectId,
      sourceSkillId,
      sourceSkillVersionId,
      key: "quarantine",
      name: "Phase 0 Stale-run Quarantine Canary",
      maxRetries: 1,
    });
    const lifecycle = await insertWorkOrderFixture(ctx, {
      projectId,
      definitionId: lifecycleDefinition.definitionId,
      definitionName: "Phase 0 Lifecycle Canary",
      key: "lifecycle",
      title: "Phase 0: complete governed read-only lifecycle",
      desiredOutcome: "Prove pause, claim, heartbeat, drain, stale recovery, timeout, reasoned retry, completion, and independent verification without repository writes.",
    });
    const cancellation = await insertWorkOrderFixture(ctx, {
      projectId,
      definitionId: lifecycleDefinition.definitionId,
      definitionName: "Phase 0 Lifecycle Canary",
      key: "cancellation",
      title: "Phase 0: prove concurrency and governed cancellation",
      desiredOutcome: "Prove a second run cannot exceed the frozen concurrency limit and a governed cancellation reaches a matching active claim.",
    });
    const quarantine = await insertWorkOrderFixture(ctx, {
      projectId,
      definitionId: quarantineDefinition.definitionId,
      definitionName: "Phase 0 Stale-run Quarantine Canary",
      key: "quarantine",
      title: "Phase 0: prove repeated stale-run quarantine",
      desiredOutcome: "Prove one stale claim can recover and a second stale loss automatically quarantines the Definition and blocks the WorkOrder.",
    });
    return {
      created: true,
      projectId,
      projectSlug: CANARY_PROJECT_SLUG,
      lifecycle,
      cancellation,
      quarantine,
      definitionIds: {
        lifecycle: lifecycleDefinition.definitionId,
        quarantine: quarantineDefinition.definitionId,
      },
    };
  },
});

export const status = internalQuery({
  args: {},
  handler: async (ctx) => {
    assertCanaryEnabled();
    const project = await ctx.db
      .query("projects")
      .withIndex("by_slug", (q) => q.eq("slug", CANARY_PROJECT_SLUG))
      .first();
    if (!project) return { seeded: false, continuousScheduling: false };
    const [workOrders, definitions, evaluations, controls, receipts] = await Promise.all([
      ctx.db.query("workOrders").withIndex("by_project", (q) => q.eq("projectId", project._id)).collect(),
      ctx.db.query("automationDefinitions").withIndex("by_project", (q) => q.eq("projectId", project._id)).collect(),
      ctx.db.query("automationEvaluations").withIndex("by_project", (q) => q.eq("projectId", project._id)).collect(),
      ctx.db.query("operatorControls").withIndex("by_project", (q) => q.eq("projectId", project._id)).collect(),
      ctx.db.query("verificationReceipts").withIndex("by_project", (q) => q.eq("projectId", project._id)).collect(),
    ]);
    const runs = await ctx.db.query("workflowRuns").withIndex("by_project", (q) => q.eq("projectId", project._id)).collect();
    const runByWorkOrder = new Map(runs.map((run) => [String(run.workOrderId), run]));
    const definitionById = new Map(definitions.map((definition) => [String(definition._id), definition]));
    const evaluationByWorkOrder = new Map(evaluations.map((evaluation) => [String(evaluation.workOrderId), evaluation]));
    const fixtures = workOrders
      .map((workOrder) => {
        const run = runByWorkOrder.get(String(workOrder._id));
        const definition = definitionById.get(String(workOrder.metadata?.automationDefinitionId));
        const evaluation = evaluationByWorkOrder.get(String(workOrder._id));
        return {
          key: workOrder.metadata?.fixtureKey,
          workOrderId: workOrder._id,
          workOrderState: workOrder.state,
          verificationStatus: workOrder.verificationStatus,
          runId: run?._id,
          runStatus: run?.status,
          attemptNumber: run?.executionAttemptNumber ?? 0,
          staleRecoveryCount: run?.executionStaleRecoveryCount ?? 0,
          checkpointSummary: run?.checkpointSummary,
          definitionStatus: definition?.status,
          definitionHealth: definition?.health,
          evaluationStatus: evaluation?.status,
          receiptStatuses: receipts
            .filter((receipt) => receipt.workOrderId === workOrder._id)
            .map((receipt) => receipt.status),
        };
      })
      .sort((a, b) => String(a.key).localeCompare(String(b.key)));
    const latestControl = controls.sort((a, b) => b.updatedAt - a.updatedAt)[0];
    return {
      seeded: true,
      projectId: project._id,
      projectName: project.name,
      operatorMode: latestControl?.mode ?? "NORMAL",
      continuousScheduling: definitions.some(
        (definition) => definition.triggerType === "SCHEDULE" || definition.nextRunAt !== undefined,
      ),
      fixtures,
    };
  },
});
