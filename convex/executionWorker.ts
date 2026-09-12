import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { reconcileTerminalWorkflowSteps } from "./lib/workflowRunState";
import { evaluateGithubAppCapabilities, githubInstallationIsStale } from "./lib/githubAppReadiness";
import { resolveApprovedVerificationCommands } from "./lib/executionPolicy";
import { staleExecutionRecovery } from "./lib/executionRecovery";

const TERMINAL_STATUSES = new Set(["COMPLETED", "FAILED", "CANCELED"]);
const MIN_EXECUTION_LEASE_MS = 10_000;
const MAX_EXECUTION_LEASE_MS = 5 * 60_000;

function assertLeaseDuration(leaseDurationMs: number) {
  if (!Number.isSafeInteger(leaseDurationMs)
    || leaseDurationMs < MIN_EXECUTION_LEASE_MS
    || leaseDurationMs > MAX_EXECUTION_LEASE_MS) {
    throw new Error("Execution lease duration must be between 10 seconds and 5 minutes.");
  }
}

async function nextSequenceNumber(ctx: any, workflowRunId: any) {
  const events = await ctx.db
    .query("runEvents")
    .withIndex("by_run", (query: any) => query.eq("workflowRunId", workflowRunId))
    .collect();
  return events.reduce((maximum: number, event: any) => Math.max(maximum, event.sequenceNumber), 0) + 1;
}

async function recordEvent(ctx: any, run: any, input: {
  eventType: string;
  idempotencyKey: string;
  status?: string;
  commandSummary?: string;
  toolName?: string;
  startedAt?: number;
  endedAt?: number;
  retryNumber?: number;
  evidenceArtifactIds?: any[];
  errorCategory?: string;
  errorSummary?: string;
  metadata?: any;
}) {
  const existing = await ctx.db
    .query("runEvents")
    .withIndex("by_idempotency", (query: any) => query.eq("idempotencyKey", input.idempotencyKey))
    .first();
  if (existing) return existing;
  const eventId = await ctx.db.insert("runEvents", {
    tenantId: run.tenantId,
    projectId: run.projectId,
    workOrderId: run.workOrderId,
    workflowRunId: run._id,
    idempotencyKey: input.idempotencyKey,
    eventType: input.eventType,
    workflowStep: run.steps[run.currentStepIndex]?.stepId,
    sequenceNumber: await nextSequenceNumber(ctx, run._id),
    actor: "service:codex-factory-worker",
    toolName: input.toolName,
    commandSummary: input.commandSummary,
    status: input.status,
    startedAt: input.startedAt,
    endedAt: input.endedAt,
    durationMs: input.startedAt && input.endedAt ? Math.max(0, input.endedAt - input.startedAt) : undefined,
    retryNumber: input.retryNumber,
    evidenceArtifactIds: input.evidenceArtifactIds,
    errorCategory: input.errorCategory,
    errorSummary: input.errorSummary,
    metadata: input.metadata,
  });
  return await ctx.db.get(eventId);
}

async function createArtifact(ctx: any, run: any, input: {
  artifactType: string;
  idempotencyKey: string;
  name: string;
  description?: string;
  repositoryPath?: string;
  externalLocation?: string;
  contentHash?: string;
  metadata?: any;
}) {
  const existing = await ctx.db
    .query("runArtifacts")
    .withIndex("by_idempotency", (query: any) => query.eq("idempotencyKey", input.idempotencyKey))
    .first();
  if (existing) return existing;
  const artifactId = await ctx.db.insert("runArtifacts", {
    tenantId: run.tenantId,
    projectId: run.projectId,
    workOrderId: run.workOrderId,
    workflowRunId: run._id,
    idempotencyKey: input.idempotencyKey,
    artifactType: input.artifactType,
    name: input.name,
    description: input.description,
    repositoryPath: input.repositoryPath,
    externalLocation: input.externalLocation,
    contentHash: input.contentHash,
    producer: "service:codex-factory-worker",
    createdAt: Date.now(),
    metadata: input.metadata,
  });
  const artifact = await ctx.db.get(artifactId);
  await recordEvent(ctx, run, {
    eventType: "ARTIFACT_CREATED",
    idempotencyKey: `${input.idempotencyKey}:event`,
    status: "COMPLETED",
    commandSummary: input.name,
    metadata: { artifactId, artifactType: input.artifactType, externalLocation: input.externalLocation },
  });
  return artifact;
}

function assertClaim(run: any, claimId: string) {
  if (run.executionManifest || run.executionManifestDigest || run.lease) {
    throw new Error("Canonical Factory Attempts require canonical lease, report, and publication authority.");
  }
  if (run.executionClaimId !== claimId) throw new Error("Execution lease is no longer owned by this worker.");
  if (TERMINAL_STATUSES.has(run.status)) throw new Error("Execution run is already terminal.");
  if ((run.executionLeaseExpiresAt ?? 0) <= Date.now()) throw new Error("Execution lease expired before the operation completed.");
}

export const claimInternal = internalMutation({
  args: {
    projectId: v.id("projects"),
    repositoryId: v.id("workspaceRepositories"),
    workerId: v.string(),
    claimId: v.string(),
    leaseDurationMs: v.number(),
  },
  handler: async (ctx, args) => {
    assertLeaseDuration(args.leaseDurationMs);
    const now = Date.now();
    const candidates = (await Promise.all(
      (["PENDING", "RUNNING"] as const).map((status) =>
        ctx.db.query("workflowRuns")
          .withIndex("by_repository_status", (query) => query.eq("repositoryId", args.repositoryId).eq("status", status))
          .collect()
      )
    )).flat().filter((run) =>
      run.projectId === args.projectId
      && run.executorAdapter === "codex"
      && run.executorVersion === "v1"
      && !run.executionManifest && !run.executionManifestDigest && !run.lease
      && run.isMutating !== false
      && Boolean(run.workOrderId && run.parentTaskId && run.factoryDefinitionVersionId && run.worktree && run.branch)
      && (!run.executionClaimId || (run.executionLeaseExpiresAt ?? 0) <= now)
    ).sort((left, right) => left.startedAt - right.startedAt);
    const run = candidates[0];
    if (!run) return null;

    const [workOrder, task, repository, factoryVersion, installation] = await Promise.all([
      ctx.db.get(run.workOrderId!),
      ctx.db.get(run.parentTaskId!),
      ctx.db.get(args.repositoryId),
      ctx.db.get(run.factoryDefinitionVersionId!),
      ctx.db.query("githubAppInstallations").withIndex("by_repository", (query) => query.eq("repositoryId", args.repositoryId)).first(),
    ]);
    if (!workOrder || !task || !repository || !factoryVersion) throw new Error("Execution lineage is incomplete.");
    if (repository.status !== "READY" || installation?.status !== "CONNECTED") {
      throw new Error("Repository or GitHub App installation is not ready.");
    }
    const [scopes, policyEnvelope, mission, missionPlan, factoryDefinition, assessments, hostBinding] = await Promise.all([
      Promise.all((workOrder.codeScopeIds ?? []).map((scopeId) => ctx.db.get(scopeId))),
      run.policyEnvelopeId ? ctx.db.get(run.policyEnvelopeId) : null,
      run.missionId ? ctx.db.get(run.missionId) : null,
      workOrder.missionPlanId ? ctx.db.get(workOrder.missionPlanId) : null,
      ctx.db.get(factoryVersion.factoryDefinitionId),
      ctx.db.query("factoryReadinessAssessments").withIndex("by_version", (query) => query.eq("factoryDefinitionVersionId", factoryVersion._id)).collect(),
      run.hostBindingId ? ctx.db.get(run.hostBindingId) : null,
    ]);
    const latestAssessment = assessments.sort((left, right) => right.assessedAt - left.assessedAt)[0];
    const githubCapability = evaluateGithubAppCapabilities(installation);
    const governanceReady =
      ["DISPATCHED", "IN_PROGRESS"].includes(workOrder.state)
      && ["APPROVED", "CONDITIONAL", "NOT_REQUIRED"].includes(workOrder.approvalStatus)
      && workOrder.currentRevisionNumber === run.workOrderRevisionNumber
      && task.workOrderId === workOrder._id
      && task.projectId === args.projectId;
    const factoryReady =
      factoryDefinition?.status === "ACTIVE"
      && factoryDefinition.activeVersionId === factoryVersion._id
      && factoryVersion.configurationDigest === run.factoryConfigurationDigest
      && policyEnvelope?.active
      && latestAssessment?.status === "PASS"
      && latestAssessment.configurationDigest === factoryVersion.configurationDigest
      && latestAssessment.expiresAt > now
      && hostBinding?.status === "READY"
      && !hostBinding.dirty
      && now - hostBinding.checkedAt <= 24 * 60 * 60 * 1_000;
    const githubReady = installation.status === "CONNECTED"
      && githubCapability.ready
      && !githubInstallationIsStale(installation.verifiedAt, now);
    const missionReady = !mission || Boolean(
      missionPlan
      && mission.currentPlanId === missionPlan._id
      && missionPlan.status === "APPROVED"
      && ["READY", "IN_PROGRESS"].includes(mission.state)
    );
    const readinessFailures = [
      !governanceReady ? "governance" : null,
      !factoryReady ? "factory" : null,
      !githubReady ? "github" : null,
      !missionReady ? "mission" : null,
    ].filter((failure): failure is string => Boolean(failure));
    if (readinessFailures.length > 0) {
      throw new Error(`Execution claim failed readiness checks: ${readinessFailures.join(", ")}.`);
    }
    const approvedScopes = scopes.filter((scope): scope is NonNullable<typeof scope> =>
      Boolean(scope && scope.active && scope.repositoryId === repository._id && scope.projectId === args.projectId)
    );
    if (approvedScopes.length === 0 || approvedScopes.length !== (workOrder.codeScopeIds ?? []).length) {
      throw new Error("Execution requires complete active repository code scope bindings.");
    }

    const implementationPolicy = workOrder.metadata?.implementationPolicy ?? {};
    const policyRules = policyEnvelope?.rules && typeof policyEnvelope.rules === "object" ? policyEnvelope.rules : {};
    const maximumAttempts = implementationPolicy.maxAttempts ?? factoryVersion.budget.maxAttempts;
    if ((run.executionAttemptNumber ?? 0) >= maximumAttempts) {
      const failureReason = `Execution recovery limit reached (${maximumAttempts} worker claims).`;
      await ctx.db.patch(run._id, {
        status: "FAILED",
        completedAt: now,
        failureReason,
        executionPhase: "TERMINAL",
        executionLeaseExpiresAt: now,
        steps: reconcileTerminalWorkflowSteps(run.steps, "FAILED", failureReason, now),
      });
      await recordEvent(ctx, run, {
        eventType: "RUN_FAILED",
        idempotencyKey: `execution-attempt-limit:${run._id}`,
        status: "FAILED",
        commandSummary: failureReason,
        errorCategory: "EXECUTION_ATTEMPT_LIMIT",
        errorSummary: failureReason,
      });
      if (run.workOrderId) {
        await ctx.runMutation(internal.workOrders.syncExecutionOutcome, {
          workflowRunId: run._id,
          eventType: "RUN_FAILED",
          summary: failureReason,
        });
      }
      return null;
    }

    const leaseExpiresAt = now + args.leaseDurationMs;
    const executionAttemptNumber = (run.executionAttemptNumber ?? 0) + 1;
    const recovery = staleExecutionRecovery({
      run,
      newClaimId: args.claimId,
      now,
    });
    const steps = run.steps.map((step, index) => index === run.currentStepIndex && step.status === "PENDING"
      ? { ...step, status: "RUNNING" as const, startedAt: now }
      : step);
    await ctx.db.patch(run._id, {
      status: "RUNNING",
      steps,
      executionClaimId: args.claimId,
      executionClaimedBy: args.workerId,
      executionClaimedAt: now,
      executionLeaseExpiresAt: leaseExpiresAt,
      executionHeartbeatAt: now,
      executionAttemptNumber,
      executionStaleRecoveryCount: recovery.staleRecoveryCount,
      executionRetryOfClaimId: recovery.recovered ? recovery.previousClaimId : run.executionRetryOfClaimId,
      executionRetryReason: recovery.retryReason ?? run.executionRetryReason,
      executionPhase: "CLAIMED",
      checkpointSummary: recovery.recovered
        ? `Expired execution lease reclaimed; ${run.checkpointSummary ?? "resuming from the durable worktree."}`
        : "Execution lease claimed; preparing the approved worktree.",
      checkpointAt: now,
    });
    if (["READY", "ASSIGNED"].includes(task.status)) {
      await ctx.db.patch(task._id, { status: "IN_PROGRESS", startedAt: task.startedAt ?? now });
    }
    await recordEvent(ctx, run, {
      eventType: "EXECUTION_CLAIMED",
      idempotencyKey: `execution-claim:${run._id}:${executionAttemptNumber}`,
      status: "RUNNING",
      startedAt: now,
      commandSummary: run.status === "RUNNING" ? "Expired lease reclaimed." : "Pending execution claimed.",
      metadata: {
        workerId: args.workerId,
        executionAttemptNumber,
        leaseExpiresAt,
        recovered: recovery.recovered,
        staleRecoveryCount: recovery.staleRecoveryCount,
        retryOfClaimId: recovery.previousClaimId,
      },
    });
    if (recovery.recovered) {
      const checkpointArtifact = await createArtifact(ctx, run, {
        artifactType: "CHECKPOINT",
        idempotencyKey: `execution-recovery:${run._id}:${executionAttemptNumber}:checkpoint`,
        name: `Recovered execution checkpoint ${executionAttemptNumber}`,
        description: recovery.retryReason,
        metadata: {
          previousClaimId: recovery.previousClaimId,
          replacementClaimId: args.claimId,
          previousPhase: run.executionPhase,
          previousCheckpointAt: run.checkpointAt,
          previousCheckpointSummary: run.checkpointSummary,
          staleRecoveryCount: recovery.staleRecoveryCount,
          executionAttemptNumber,
        },
      });
      await recordEvent(ctx, run, {
        eventType: "RETRY_STARTED",
        idempotencyKey: `execution-recovery:${run._id}:${executionAttemptNumber}:event`,
        status: "RUNNING",
        retryNumber: executionAttemptNumber,
        commandSummary: "Recovered an expired execution lease from the durable checkpoint.",
        errorCategory: "STALE_EXECUTION_LEASE",
        errorSummary: recovery.retryReason,
        evidenceArtifactIds: checkpointArtifact?._id ? [checkpointArtifact._id] : undefined,
        metadata: {
          previousClaimId: recovery.previousClaimId,
          replacementClaimId: args.claimId,
          staleRecoveryCount: recovery.staleRecoveryCount,
          leaseExpiresAt,
        },
      });
    }

    return {
      workflowRunId: run._id,
      runId: run.runId,
      claimId: args.claimId,
      leaseExpiresAt,
      executionAttemptNumber,
      projectId: args.projectId,
      missionId: mission?._id,
      missionPlanId: missionPlan?._id,
      workOrderId: workOrder._id,
      taskId: task._id,
      factoryDefinitionVersionId: factoryVersion._id,
      factoryConfigurationDigest: factoryVersion.configurationDigest,
      repositoryId: repository._id,
      repository: repository.repository,
      providerRepositoryId: repository.providerRepositoryId,
      defaultBranch: repository.defaultBranch,
      worktree: run.worktree,
      branch: run.branch,
      prompt: [task.title, task.description, workOrder.desiredOutcome].filter(Boolean).join("\n\n"),
      model: run.model,
      allowedTools: run.allowedTools ?? [],
      scopes: approvedScopes.map((scope) => ({
        id: scope._id,
        name: scope.name,
        includePaths: scope.includePaths,
        excludePaths: scope.excludePaths,
      })),
      policy: {
        allowedCommands: resolveApprovedVerificationCommands({
          implementationPolicy,
          policyRules,
          constraints: workOrder.constraints,
        }),
        maxCostUsd: implementationPolicy.maxCostUsd ?? factoryVersion.budget.maxCostUsd,
        maxAttempts: implementationPolicy.maxAttempts ?? factoryVersion.budget.maxAttempts,
        timeoutMinutes: implementationPolicy.timeoutMinutes ?? factoryVersion.budget.maxRuntimeMinutes,
        stopCondition: implementationPolicy.stopCondition ?? run.stopCondition ?? "Stop on policy, budget, environment, or verification failure.",
      },
      github: {
        installationId: installation.installationId,
        appId: installation.appId,
        accountLogin: installation.accountLogin,
      },
      lineage: {
        missionId: mission?._id,
        missionPlanId: missionPlan?._id,
        workOrderId: workOrder._id,
        workOrderRevisionId: run.workOrderRevisionId,
        workOrderRevisionNumber: String(run.workOrderRevisionNumber ?? workOrder.currentRevisionNumber ?? 1),
        taskId: task._id,
        taskAttemptNumber: String(run.metadata?.taskAttemptNumber ?? 1),
        workflowRunId: run._id,
        runId: run.runId,
        factoryDefinitionVersionId: factoryVersion._id,
        factoryConfigurationDigest: factoryVersion.configurationDigest,
        repositoryId: repository._id,
        githubInstallationId: installation.installationId,
        branch: run.branch,
      },
      checkpoint: {
        phase: run.executionPhase,
        summary: run.checkpointSummary,
        baseSha: run.executionBaseSha,
        headSha: run.headSha,
        pullRequestUrl: run.pullRequestUrl,
      },
      cancellationRequested: Boolean(run.cancellationRequestedAt),
    };
  },
});

export const heartbeatInternal = internalMutation({
  args: {
    workflowRunId: v.id("workflowRuns"),
    claimId: v.string(),
    leaseDurationMs: v.number(),
    phase: v.optional(v.union(
      v.literal("CLAIMED"), v.literal("PREPARING"), v.literal("EXECUTING"),
      v.literal("VALIDATING"), v.literal("PUBLISHING"), v.literal("TERMINAL")
    )),
    checkpointSummary: v.optional(v.string()),
    baseSha: v.optional(v.string()),
    headSha: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    assertLeaseDuration(args.leaseDurationMs);
    const run = await ctx.db.get(args.workflowRunId);
    if (!run) throw new Error("Workflow run not found.");
    assertClaim(run, args.claimId);
    const now = Date.now();
    await ctx.db.patch(run._id, {
      executionHeartbeatAt: now,
      executionLeaseExpiresAt: now + args.leaseDurationMs,
      executionPhase: args.phase ?? run.executionPhase,
      checkpointSummary: args.checkpointSummary ?? run.checkpointSummary,
      checkpointAt: args.checkpointSummary ? now : run.checkpointAt,
      executionBaseSha: args.baseSha ?? run.executionBaseSha,
      headSha: args.headSha ?? run.headSha,
    });
    return { cancellationRequested: Boolean(run.cancellationRequestedAt), leaseExpiresAt: now + args.leaseDurationMs };
  },
});

export const reportInternal = internalMutation({
  args: {
    workflowRunId: v.id("workflowRuns"),
    claimId: v.string(),
    packetId: v.string(),
    events: v.array(v.object({
      eventType: v.string(),
      status: v.optional(v.string()),
      commandSummary: v.optional(v.string()),
      toolName: v.optional(v.string()),
      startedAt: v.optional(v.number()),
      endedAt: v.optional(v.number()),
      errorCategory: v.optional(v.string()),
      errorSummary: v.optional(v.string()),
      metadata: v.optional(v.any()),
    })),
    artifacts: v.optional(v.array(v.object({
      artifactType: v.string(),
      name: v.string(),
      description: v.optional(v.string()),
      repositoryPath: v.optional(v.string()),
      externalLocation: v.optional(v.string()),
      contentHash: v.optional(v.string()),
      metadata: v.optional(v.any()),
    }))),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.workflowRunId);
    if (!run) throw new Error("Workflow run not found.");
    assertClaim(run, args.claimId);
    for (const [index, event] of args.events.entries()) {
      await recordEvent(ctx, run, { ...event, idempotencyKey: `${args.packetId}:event:${index}` });
    }
    const artifacts = [];
    for (const [index, artifact] of (args.artifacts ?? []).entries()) {
      artifacts.push(await createArtifact(ctx, run, { ...artifact, idempotencyKey: `${args.packetId}:artifact:${index}` }));
    }
    return { recordedEvents: args.events.length, artifacts, cancellationRequested: Boolean(run.cancellationRequestedAt) };
  },
});

export const finalizeInternal = internalMutation({
  args: {
    workflowRunId: v.id("workflowRuns"),
    claimId: v.string(),
    status: v.union(v.literal("COMPLETED"), v.literal("FAILED"), v.literal("CANCELED")),
    summary: v.string(),
    failureReason: v.optional(v.string()),
    baseSha: v.optional(v.string()),
    headSha: v.optional(v.string()),
    pullRequest: v.optional(v.object({
      id: v.string(),
      number: v.number(),
      url: v.string(),
      state: v.string(),
      branch: v.string(),
      baseBranch: v.string(),
      commitSha: v.string(),
      created: v.boolean(),
      metadata: v.optional(v.any()),
    })),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.workflowRunId);
    if (!run) throw new Error("Workflow run not found.");
    if (TERMINAL_STATUSES.has(run.status)) {
      return { finalized: false, status: run.status, pullRequestUrl: run.pullRequestUrl };
    }
    assertClaim(run, args.claimId);
    const now = Date.now();
    const steps = args.status === "COMPLETED"
      ? run.steps.map((step) => ["PENDING", "RUNNING"].includes(step.status) ? { ...step, status: "DONE" as const, completedAt: now } : step)
      : reconcileTerminalWorkflowSteps(run.steps, args.status, args.failureReason, now);
    await ctx.db.patch(run._id, {
      status: args.status,
      steps,
      completedAt: now,
      failureReason: args.failureReason,
      executionPhase: "TERMINAL",
      executionHeartbeatAt: now,
      executionLeaseExpiresAt: now,
      executionBaseSha: args.baseSha ?? run.executionBaseSha,
      headSha: args.headSha ?? args.pullRequest?.commitSha ?? run.headSha,
      pullRequestNumber: args.pullRequest?.number ?? run.pullRequestNumber,
      pullRequestId: args.pullRequest?.id ?? run.pullRequestId,
      pullRequestUrl: args.pullRequest?.url ?? run.pullRequestUrl,
      publishedAt: args.pullRequest ? now : run.publishedAt,
      checkpointSummary: args.summary,
      checkpointAt: now,
    });
    if (args.pullRequest) {
      await createArtifact(ctx, run, {
        artifactType: "PULL_REQUEST",
        idempotencyKey: `pull-request:${run._id}:${args.pullRequest.number}`,
        name: `Pull request #${args.pullRequest.number}`,
        description: args.summary,
        externalLocation: args.pullRequest.url,
        contentHash: `git:${args.pullRequest.commitSha}`,
        metadata: {
          ...args.pullRequest.metadata,
          provider: "github-app",
          pullRequestId: args.pullRequest.id,
          number: args.pullRequest.number,
          state: args.pullRequest.state,
          branch: args.pullRequest.branch,
          baseBranch: args.pullRequest.baseBranch,
          commitSha: args.pullRequest.commitSha,
          created: args.pullRequest.created,
          missionId: run.missionId,
          workOrderId: run.workOrderId,
          taskId: run.parentTaskId,
          workflowRunId: run._id,
          factoryDefinitionVersionId: run.factoryDefinitionVersionId,
          factoryConfigurationDigest: run.factoryConfigurationDigest,
        },
      });
      await recordEvent(ctx, run, {
        eventType: "PULL_REQUEST_CREATED",
        idempotencyKey: `pull-request:${run._id}:${args.pullRequest.number}:lineage`,
        status: "COMPLETED",
        commandSummary: `Review-ready pull request #${args.pullRequest.number}`,
        metadata: { pullRequestUrl: args.pullRequest.url, headSha: args.pullRequest.commitSha, branch: args.pullRequest.branch },
      });
    }
    await recordEvent(ctx, run, {
      eventType: args.status === "COMPLETED" ? "RUN_COMPLETED" : args.status === "CANCELED" ? "RUN_CANCELED" : "RUN_FAILED",
      idempotencyKey: `execution-terminal:${run._id}`,
      status: args.status,
      startedAt: run.startedAt,
      endedAt: now,
      commandSummary: args.summary,
      errorCategory: args.status === "FAILED" ? "EXECUTION_FAILURE" : undefined,
      errorSummary: args.failureReason,
    });
    if (run.parentTaskId) {
      const task = await ctx.db.get(run.parentTaskId);
      if (task) {
        await ctx.db.patch(task._id, args.status === "COMPLETED"
          ? { status: "REVIEW", deliverable: { summary: "Review-ready GitHub pull request", content: args.pullRequest?.url ?? args.summary, artifactIds: [] } }
          : { status: args.status === "CANCELED" ? "CANCELED" : "FAILED", blockedReason: args.failureReason ?? args.summary });
      }
    }
    if (run.workOrderId) {
      await ctx.runMutation(internal.workOrders.syncExecutionOutcome, {
        workflowRunId: run._id,
        eventType: args.status === "COMPLETED" ? "RUN_COMPLETED" : args.status === "CANCELED" ? "RUN_CANCELED" : "RUN_FAILED",
        summary: args.summary,
      });
    }
    return { finalized: true, status: args.status, pullRequestUrl: args.pullRequest?.url };
  },
});
