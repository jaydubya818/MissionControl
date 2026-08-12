import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import { activeLeaseMatches, deriveFactoryPublicationLineage, evaluateAttemptClaim, factoryAttemptMutationIsAuthorized, renewAttemptLease } from "../lib/factoryAttempt";
import {
  PUBLICATION_SAFETY_WINDOW_MS,
  validatePublicationPermit,
  validatePublishContinuation,
} from "../lib/factoryHumanReview";
import { isApprovalUsable, latestApprovalByType, requiredApprovalTypes } from "../lib/workOrderGovernance";
import { approvalExpiresAt, DEFAULT_GOVERNANCE_POLICY, verificationValidUntil } from "../lib/workOrderRevision";
import { reconcileTerminalWorkflowSteps } from "../lib/workflowRunState";
import { recomputeVerificationPacket } from "../lib/verificationPersistence";

const EVENT_TYPES = new Set([
  "RUN_STARTED", "STEP_STARTED", "STEP_COMPLETED", "TOOL_CALLED",
  "COMMAND_EXECUTED", "FILE_CHANGED", "ARTIFACT_CREATED", "CHECKPOINT_CREATED",
  "RETRY_STARTED", "RETRY_COMPLETED", "HUMAN_INTERVENTION_REQUESTED",
  "SPEC_VALIDATED", "RISK_CLASSIFIED", "CHANGE_BUDGET_ASSIGNED",
  "COMMAND_REQUESTED", "COMMAND_APPROVED", "COMMAND_DENIED", "CHANGE_BUDGET_EXCEEDED",
  "VERIFICATION_STARTED", "VERIFICATION_CHECK_STARTED", "VERIFICATION_CHECK_PASSED",
  "VERIFICATION_CHECK_FAILED", "EVIDENCE_CREATED", "INDEPENDENT_REVIEW_STARTED",
  "VERIFICATION_RECEIPT_CREATED", "PULL_REQUEST_CREATED",
  "RUN_PAUSED", "RUN_RESUMED", "RUN_FAILED", "RUN_COMPLETED",
]);

const ARTIFACT_TYPES = new Set([
  "CODE_DIFF", "TEST_OUTPUT", "BUILD_OUTPUT", "LOG_BUNDLE", "SCREENSHOT",
  "GENERATED_DOCUMENT", "VERIFICATION_EVIDENCE", "PULL_REQUEST", "CHECKPOINT",
  "STRUCTURED_OUTPUT", "OTHER",
]);
export const resolveScope = internalQuery({
  args: { workflowRunId: v.id("workflowRuns") },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.workflowRunId);
    if (!run?.projectId || !run.repositoryId || !run.workOrderId || !run.factoryDefinitionVersionId) {
      throw new Error("Factory attempt is unavailable or unbound.");
    }
    return {
      projectId: String(run.projectId),
      repositoryId: String(run.repositoryId),
      workOrderId: run.workOrderId,
      factoryDefinitionVersionId: run.factoryDefinitionVersionId,
    };
  },
});

export const claimInternal = internalMutation({
  args: {
    workflowRunId: v.id("workflowRuns"),
    leaseId: v.string(),
    ownerId: v.string(),
    leaseDurationMs: v.number(),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.workflowRunId);
    if (!run) throw new Error("Factory attempt not found.");
    const decision = evaluateAttemptClaim({
      status: run.status,
      lease: run.lease,
      leaseId: args.leaseId,
      ownerId: args.ownerId,
      leaseDurationMs: args.leaseDurationMs,
      now: Date.now(),
    });
    if (!decision.ok) return { claimed: false as const, reason: decision.reason };
    if (
      !run.projectId || !run.repositoryId || !run.workOrderId
      || !run.factoryDefinitionVersionId || !run.factoryConfigurationDigest
      || !run.hostBindingId || !run.branch || !run.worktree
      || run.executorAdapter !== "codex" || run.executorVersion !== "v1"
      || !run.executionManifest || !run.executionManifestDigest
    ) {
      throw new Error("Factory attempt is missing its immutable execution binding.");
    }
    const [version, repository, workOrder, host, installation] = await Promise.all([
      ctx.db.get(run.factoryDefinitionVersionId),
      ctx.db.get(run.repositoryId),
      ctx.db.get(run.workOrderId),
      ctx.db.get(run.hostBindingId),
      ctx.db.query("githubAppInstallations")
        .withIndex("by_repository", (q) => q.eq("repositoryId", run.repositoryId!))
        .first(),
    ]);
    if (!version || version.configurationDigest !== run.factoryConfigurationDigest) {
      throw new Error("Factory attempt configuration digest no longer matches its version.");
    }
    const definition = await ctx.db.get(version.factoryDefinitionId);
    if (!definition || definition.status !== "ACTIVE" || definition.activeVersionId !== version._id) {
      throw new Error("Factory attempt requires the exact active Factory version.");
    }
    if (!repository || repository.status !== "READY" || repository.projectId !== run.projectId) {
      throw new Error("Factory attempt repository is not ready.");
    }
    if (!workOrder || workOrder.currentExecutionRunId !== run._id || workOrder.currentRevisionNumber !== run.workOrderRevisionNumber) {
      throw new Error("Factory attempt is no longer the current Work Order revision.");
    }
    const frozenWorktree = (run.executionManifest as any).repository?.worktree;
    const checkoutPrefix = `${host?.checkoutRoot?.replace(/\/+$/, "")}/`;
    if (!host || host.status !== "READY" || host.dirty || frozenWorktree !== run.worktree || !run.worktree.startsWith(checkoutPrefix)) {
      throw new Error("Factory attempt host binding is no longer ready or does not own the frozen worktree.");
    }
    if (!installation || installation.status !== "CONNECTED" || installation.projectId !== run.projectId) {
      throw new Error("Factory attempt GitHub App installation is not connected.");
    }

    let publicationCheckpoint: any;
    if (["READY_TO_PUBLISH", "PUBLICATION_AUTHORIZED"].includes(run.factoryContinuation?.status ?? "")) {
      const continuation = run.factoryContinuation!;
      const [approval, sourceReceipt, resolvedReceipt, structuredArtifact, codeDiffArtifact, approvals] = await Promise.all([
        continuation.approvalDecisionId ? ctx.db.get(continuation.approvalDecisionId) : null,
        ctx.db.get(continuation.verificationReceiptId),
        continuation.resolvedVerificationReceiptId ? ctx.db.get(continuation.resolvedVerificationReceiptId) : null,
        ctx.db.query("runArtifacts")
          .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", `factory:${run.runId}:structured-result`))
          .first(),
        ctx.db.query("runArtifacts")
          .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", `factory:${run.runId}:code-diff:${continuation.candidateRevision}`))
          .first(),
        ctx.db.query("approvalDecisions")
          .withIndex("by_work_order_revision", (q) => q
            .eq("workOrderId", workOrder._id)
            .eq("workOrderRevisionNumber", workOrder.currentRevisionNumber ?? 1))
          .collect(),
      ]);
      if (continuation.status === "READY_TO_PUBLISH") {
        const validation = validatePublishContinuation({
          run: run as any,
          workOrderRevisionNumber: workOrder.currentRevisionNumber ?? 1,
          approval: approval as any,
          sourceReceipt: sourceReceipt as any,
          resolvedReceipt: resolvedReceipt as any,
        });
        if (!validation.ok) {
          return await failInvalidPublicationContinuation(ctx, run, `Factory publication checkpoint is invalid (${validation.reason}).`);
        }

        const approvalsByType = latestApprovalByType(approvals as any[]);
        const missingApproval = requiredApprovalTypes({
          riskLevel: workOrder.riskLevel as any,
          requiredApprovals: workOrder.requiredApprovals,
        }).find((approvalType) => {
          const candidate = approvalsByType.get(approvalType) as any;
          return !candidate
            || candidate.workOrderRevisionNumber !== (workOrder.currentRevisionNumber ?? 1)
            || !isApprovalUsable(candidate);
        });
        if (missingApproval) {
          return await failInvalidPublicationContinuation(ctx, run, `Required approval ${missingApproval} is not current for publication.`);
        }
      } else if (!continuation.publicationPermitId
        || !continuation.publicationValidUntil
        || continuation.publicationValidUntil <= Date.now()) {
        return await failInvalidPublicationContinuation(ctx, run, "Factory publication permit expired before recovery completed.");
      }

      const structuredResult = structuredArtifact?.metadata?.result;
      const changedFiles = codeDiffArtifact?.metadata?.changedFiles;
      if (structuredArtifact?.workflowRunId !== run._id
        || codeDiffArtifact?.workflowRunId !== run._id
        || codeDiffArtifact?.metadata?.headSha !== continuation.candidateRevision
        || !structuredResult || typeof structuredResult.summary !== "string"
        || !Array.isArray(changedFiles) || changedFiles.some((file: unknown) => typeof file !== "string")) {
        return await failInvalidPublicationContinuation(ctx, run, "Factory publication checkpoint is missing its immutable result artifacts.");
      }
      const authorizationExpiries: number[] = continuation.status === "PUBLICATION_AUTHORIZED"
        ? typeof continuation.publicationValidUntil === "number" ? [continuation.publicationValidUntil] : []
        : [approval?.expiresAt, resolvedReceipt?.validUntil]
          .filter((value): value is number => typeof value === "number");
      if (authorizationExpiries.length === 0) {
        return await failInvalidPublicationContinuation(ctx, run, "Factory publication checkpoint is missing its authorization expiry.");
      }
      publicationCheckpoint = {
        candidateRevision: continuation.candidateRevision,
        sourceRevision: continuation.sourceRevision,
        authorizationValidUntil: Math.min(...authorizationExpiries),
        verification: {
          verdict: resolvedReceipt?.verdict,
          verificationRunId: resolvedReceipt?.verificationRunId,
          verificationReceiptId: resolvedReceipt?._id,
          verdictReasons: resolvedReceipt?.verdictReasons,
        },
        structuredResult,
        changedFiles,
        publicationPermit: continuation.status === "PUBLICATION_AUTHORIZED"
          ? {
              id: continuation.publicationPermitId,
              leaseId: decision.lease.leaseId,
              validUntil: continuation.publicationValidUntil,
            }
          : undefined,
      };
    }

    const continuationPatch = run.factoryContinuation?.status === "PUBLICATION_AUTHORIZED"
      ? { ...run.factoryContinuation, publicationPermitLeaseId: decision.lease.leaseId }
      : run.factoryContinuation;
    await ctx.db.patch(run._id, {
      status: "RUNNING",
      lease: decision.lease,
      executionPhase: publicationCheckpoint ? "PUBLISHING" : run.executionPhase,
      factoryContinuation: continuationPatch,
    });
    await insertEvent(ctx, run, {
      idempotencyKey: `factory-lease:${run.runId}:${args.leaseId}:claimed`,
      eventType: decision.reclaimed ? "RUN_RESUMED" : "CHECKPOINT_CREATED",
      workflowStep: run.steps[run.currentStepIndex]?.stepId,
      actor: `service:${args.ownerId}`,
      status: "RUNNING",
      startedAt: Date.now(),
      commandSummary: publicationCheckpoint
        ? "Approved human-review checkpoint claimed for publication"
        : decision.reclaimed
          ? "Expired attempt lease reconciled and reclaimed"
          : "Factory attempt lease claimed",
      metadata: {
        leaseId: args.leaseId,
        expiresAt: decision.lease.expiresAt,
        executionManifestDigest: run.executionManifestDigest,
      },
    });
    return {
      claimed: true as const,
      reclaimed: decision.reclaimed,
      workflowRunId: run._id,
      runId: run.runId,
      lease: decision.lease,
      projectId: run.projectId,
      repositoryId: repository._id,
      repository: repository.repository,
      providerRepositoryId: repository.providerRepositoryId,
      defaultBranch: repository.defaultBranch,
      workOrderId: run.workOrderId,
      branch: run.branch,
      worktree: run.worktree,
      checkoutRoot: host.checkoutRoot,
      installation: {
        installationId: installation.installationId,
        appId: installation.appId,
      },
      model: run.model,
      executionManifest: run.executionManifest,
      executionManifestDigest: run.executionManifestDigest,
      publicationCheckpoint,
    };
  },
});

export const authorizePublicationInternal = internalMutation({
  args: {
    workflowRunId: v.id("workflowRuns"),
    leaseId: v.string(),
    ownerId: v.string(),
    candidateRevision: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const run = await ctx.db.get(args.workflowRunId);
    if (!run || !factoryAttemptMutationIsAuthorized(run)
      || !activeLeaseMatches({ lease: run.lease, leaseId: args.leaseId, ownerId: args.ownerId, now })) {
      throw new Error("Factory publication authorization requires the active matching lease.");
    }
    if (!run.workOrderId) throw new Error("Factory publication requires a WorkOrder-bound Attempt.");
    const workOrder = await ctx.db.get(run.workOrderId);
    if (!workOrder || workOrder.currentExecutionRunId !== run._id
      || workOrder.currentRevisionNumber !== run.workOrderRevisionNumber) {
      throw new Error("Factory publication WorkOrder authority changed before publication.");
    }
    const revisionNumber = workOrder.currentRevisionNumber ?? 1;
    let continuation = run.factoryContinuation;
    let approval: any = null;
    let sourceReceipt: any = null;
    let resolvedReceipt: any = null;
    const [approvals, latestReceipt] = await Promise.all([
      ctx.db.query("approvalDecisions")
        .withIndex("by_work_order_revision", (q) => q
          .eq("workOrderId", workOrder._id)
          .eq("workOrderRevisionNumber", revisionNumber))
        .collect(),
      ctx.db.query("verificationReceipts")
        .withIndex("by_work_order_scope", (q) => q.eq("workOrderId", workOrder._id).eq("receiptScope", "WORK_ORDER"))
        .order("desc")
        .first(),
    ]);
    if (continuation) {
      if (continuation.status !== "READY_TO_PUBLISH" || continuation.candidateRevision !== args.candidateRevision) {
        throw new Error("Factory publication checkpoint is not ready for authorization.");
      }
      [approval, sourceReceipt, resolvedReceipt] = await Promise.all([
        continuation.approvalDecisionId ? ctx.db.get(continuation.approvalDecisionId) : null,
        ctx.db.get(continuation.verificationReceiptId),
        continuation.resolvedVerificationReceiptId ? ctx.db.get(continuation.resolvedVerificationReceiptId) : null,
      ]);
      const validation = validatePublishContinuation({
        run: run as any,
        workOrderRevisionNumber: revisionNumber,
        approval,
        sourceReceipt,
        resolvedReceipt,
        now,
      });
      if (!validation.ok) throw new Error(`Factory publication authority is invalid (${validation.reason}).`);
    } else {
      resolvedReceipt = latestReceipt;
      sourceReceipt = latestReceipt;
      if (!resolvedReceipt
        || resolvedReceipt.workflowRunId !== run._id
        || resolvedReceipt.workOrderRevisionNumber !== revisionNumber
        || resolvedReceipt.status !== "PASSED"
        || resolvedReceipt.verdict !== "VERIFIED"
        || resolvedReceipt.candidateRevision !== args.candidateRevision
        || typeof resolvedReceipt.validUntil !== "number") {
        throw new Error("Factory publication requires a current VERIFIED receipt for the exact candidate.");
      }
      continuation = {
        status: "READY_TO_PUBLISH" as const,
        verificationRunId: resolvedReceipt.verificationRunId,
        verificationReceiptId: resolvedReceipt._id,
        resolvedVerificationReceiptId: resolvedReceipt._id,
        workOrderRevisionNumber: revisionNumber,
        sourceRevision: resolvedReceipt.sourceRevision,
        candidateRevision: resolvedReceipt.candidateRevision,
        pausedAt: now,
      };
    }
    const approvalsByType = latestApprovalByType(approvals as any[]);
    const missingApproval = requiredApprovalTypes({
      riskLevel: workOrder.riskLevel as any,
      requiredApprovals: workOrder.requiredApprovals,
    }).find((approvalType) => {
      const candidate = approvalsByType.get(approvalType) as any;
      return !candidate
        || candidate.workOrderRevisionNumber !== revisionNumber
        || !isApprovalUsable(candidate, now);
    });
    if (missingApproval) throw new Error(`Required approval ${missingApproval} changed before publication.`);
    const expiries = [approval?.expiresAt, resolvedReceipt?.validUntil]
      .filter((value): value is number => typeof value === "number");
    if (expiries.length === 0) throw new Error("Factory publication authority has no bounded validity window.");
    const publicationValidUntil = Math.min(...expiries);
    if (publicationValidUntil <= now + PUBLICATION_SAFETY_WINDOW_MS) {
      throw new Error("Factory publication authority expires too soon for a safe provider write.");
    }
    const publicationPermitId = `factory-publication:${run.runId}:${args.leaseId}:${now}`;
    await ctx.db.patch(run._id, {
      factoryContinuation: {
        ...continuation,
        status: "PUBLICATION_AUTHORIZED",
        publicationPermitId,
        publicationPermitLeaseId: args.leaseId,
        publicationAuthorizedAt: now,
        publicationValidUntil,
      },
    });
    await insertEvent(ctx, run, {
      idempotencyKey: `${publicationPermitId}:event`,
      eventType: "COMMAND_APPROVED",
      workflowStep: "pull-request-publication",
      actor: `service:${args.ownerId}`,
      status: "APPROVED",
      startedAt: now,
      commandSummary: `Publication permit consumed for ${args.candidateRevision.slice(0, 12)}`,
      metadata: { publicationPermitId, candidateRevision: args.candidateRevision, validUntil: publicationValidUntil },
    });
    return { authorized: true as const, publicationPermitId, candidateRevision: args.candidateRevision, validUntil: publicationValidUntil };
  },
});

export const renewInternal = internalMutation({
  args: {
    workflowRunId: v.id("workflowRuns"),
    leaseId: v.string(),
    ownerId: v.string(),
    leaseDurationMs: v.number(),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.workflowRunId);
    if (!run || !factoryAttemptMutationIsAuthorized(run)) {
      return { renewed: false as const, reason: run?.cancellationRequestedAt ? "cancellation-requested" : "attempt-not-running" };
    }
    const result = renewAttemptLease({
      lease: run.lease,
      leaseId: args.leaseId,
      ownerId: args.ownerId,
      leaseDurationMs: args.leaseDurationMs,
      now: Date.now(),
    });
    if (!result.ok) return { renewed: false as const, reason: result.reason };
    await ctx.db.patch(run._id, { lease: result.lease });
    return { renewed: true as const, lease: result.lease };
  },
});

export const reportInternal = internalMutation({
  args: {
    workflowRunId: v.id("workflowRuns"),
    leaseId: v.string(),
    ownerId: v.string(),
    packet: v.any(),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.workflowRunId);
    if (!run || !factoryAttemptMutationIsAuthorized(run)
      || !activeLeaseMatches({ lease: run.lease, leaseId: args.leaseId, ownerId: args.ownerId, now: Date.now() })) {
      throw new Error("Factory attempt report requires the active matching lease.");
    }
    const packet = args.packet && typeof args.packet === "object" ? args.packet : {};
    const events = Array.isArray(packet.events) ? packet.events : [];
    const artifacts = Array.isArray(packet.artifacts) ? packet.artifacts : [];
    if (events.length > 100 || artifacts.length > 20) throw new Error("Factory attempt report exceeds packet limits.");

    const eventResults = [];
    for (const event of events) {
      if (!event?.idempotencyKey || !EVENT_TYPES.has(event.eventType)) throw new Error("Factory attempt event is invalid.");
      eventResults.push(await insertEvent(ctx, run, {
        ...event,
        actor: `service:${args.ownerId}`,
        metadata: {
          ...(event.metadata ?? {}),
          leaseId: args.leaseId,
          executionManifestDigest: run.executionManifestDigest,
        },
      }));
    }

    const artifactResults = [];
    for (const artifact of artifacts) {
      if (!artifact?.idempotencyKey || !artifact?.name || !ARTIFACT_TYPES.has(artifact.artifactType)) {
        throw new Error("Factory attempt artifact is invalid.");
      }
      const existing = await ctx.db.query("runArtifacts")
        .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", artifact.idempotencyKey))
        .first();
      if (existing) {
        artifactResults.push({ artifact: existing, created: false });
        continue;
      }
      const artifactId = await ctx.db.insert("runArtifacts", {
        tenantId: run.tenantId,
        projectId: run.projectId,
        missionId: run.missionId,
        workOrderId: run.workOrderId,
        workflowRunId: run._id,
        idempotencyKey: artifact.idempotencyKey,
        artifactType: artifact.artifactType,
        name: String(artifact.name).slice(0, 200),
        description: optionalText(artifact.description, 2_000),
        repositoryPath: optionalText(artifact.repositoryPath, 1_000),
        externalLocation: optionalText(artifact.externalLocation, 2_000),
        contentHash: optionalText(artifact.contentHash, 200),
        producer: `service:${args.ownerId}`,
        retentionPolicy: optionalText(artifact.retentionPolicy, 200),
        sensitivity: optionalText(artifact.sensitivity, 100),
        createdAt: Date.now(),
        metadata: {
          ...(artifact.metadata ?? {}),
          leaseId: args.leaseId,
          executionManifestDigest: run.executionManifestDigest,
        },
      });
      const artifactRow = await ctx.db.get(artifactId);
      artifactResults.push({ artifact: artifactRow, created: true });
      await insertEvent(ctx, run, {
        idempotencyKey: `${artifact.idempotencyKey}:event`,
        eventType: artifact.artifactType === "CHECKPOINT"
          ? "CHECKPOINT_CREATED"
          : artifact.artifactType === "PULL_REQUEST"
            ? "PULL_REQUEST_CREATED"
            : "ARTIFACT_CREATED",
        workflowStep: run.steps[run.currentStepIndex]?.stepId,
        actor: `service:${args.ownerId}`,
        status: "COMPLETED",
        commandSummary: String(artifact.name).slice(0, 500),
        evidenceArtifactIds: [artifactId],
        metadata: { artifactType: artifact.artifactType, leaseId: args.leaseId },
      });
    }

    const verification = packet.verification
      ? await persistVerificationPacket(ctx, run, packet.verification, args.ownerId, args.leaseId)
      : undefined;

    const terminal = packet.terminal;
    if (terminal) {
      if (!["COMPLETED", "FAILED", "CANCELED"].includes(terminal.status)) {
        throw new Error("Factory attempt terminal status is invalid.");
      }
      const reportedArtifacts = artifactResults.map((result: any) => result.artifact);
      const pullRequestArtifact = reportedArtifacts.find((artifact: any) => artifact?.artifactType === "PULL_REQUEST")
        ?? await ctx.db.query("runArtifacts")
          .withIndex("by_run_type", (q) => q.eq("workflowRunId", run._id).eq("artifactType", "PULL_REQUEST"))
          .first();
      const codeDiffArtifact = reportedArtifacts.find((artifact: any) => artifact?.artifactType === "CODE_DIFF")
        ?? await ctx.db.query("runArtifacts")
          .withIndex("by_run_type", (q) => q.eq("workflowRunId", run._id).eq("artifactType", "CODE_DIFF"))
          .first();
      const exactGateReceipt = run.workOrderId
        ? await ctx.db.query("verificationReceipts")
          .withIndex("by_run", (q) => q.eq("workflowRunId", run._id))
          .filter((q) => q.eq(q.field("receiptScope"), "WORK_ORDER"))
          .order("desc")
          .first()
        : null;
      if (terminal.status === "COMPLETED" && run.isMutating !== false) {
        if (!pullRequestArtifact) throw new Error("A mutating Factory attempt cannot complete without a pull-request artifact.");
      }
      if (terminal.status === "COMPLETED" && run.workOrderId) {
        const workOrder = await ctx.db.get(run.workOrderId);
        if (workOrder?.verificationContract?.enforcementMode === "ENFORCED") {
          const latestReceipt = await ctx.db
            .query("verificationReceipts")
            .withIndex("by_work_order_scope", (q) => q.eq("workOrderId", workOrder._id).eq("receiptScope", "WORK_ORDER"))
            .order("desc")
            .first();
          if (!latestReceipt || latestReceipt.workflowRunId !== run._id || latestReceipt.verdict !== "VERIFIED") {
            throw new Error("An enforced Factory attempt cannot complete without a VERIFIED Work Order receipt from the current run.");
          }
          if (run.factoryContinuation?.status === "PUBLICATION_AUTHORIZED") {
            const continuation = run.factoryContinuation;
            const pullRequestArtifact = artifactResults
              .map((result: any) => result.artifact)
              .find((artifact: any) => artifact?.artifactType === "PULL_REQUEST")
              ?? await ctx.db.query("runArtifacts")
                .withIndex("by_run_type", (q) => q.eq("workflowRunId", run._id).eq("artifactType", "PULL_REQUEST"))
                .first();
            const validation = validatePublicationPermit({
              run: run as any,
              leaseId: args.leaseId,
              candidateRevision: pullRequestArtifact?.metadata?.headSha,
              publicationPermitId: pullRequestArtifact?.metadata?.publicationPermitId,
              // Provider writes are allowed only while the permit is current. Once
              // the PR exists, terminal lineage validates the consumed immutable
              // grant even if the wall-clock validity elapsed during the request.
              requireUnexpired: false,
            });
            if (!validation.ok) throw new Error(`Human-review publication permit is invalid (${validation.reason}).`);
          } else if (run.factoryContinuation) {
            throw new Error("Human-review publication did not consume a control-plane permit.");
          }
          const pullRequestArtifact = artifactResults
            .map((result: any) => result.artifact)
            .find((artifact: any) => artifact?.artifactType === "PULL_REQUEST")
            ?? await ctx.db.query("runArtifacts")
              .withIndex("by_run_type", (q) => q.eq("workflowRunId", run._id).eq("artifactType", "PULL_REQUEST"))
              .first();
          if (pullRequestArtifact?.metadata?.headSha !== latestReceipt.candidateRevision) {
            throw new Error("Pull-request head does not match the independently verified candidate revision.");
          }
        }
      }
      const completedAt = Date.now();
      const publicationLineage = deriveFactoryPublicationLineage({
        pullRequestArtifact,
        codeDiffArtifact,
        verifiedSourceRevision: exactGateReceipt?.sourceRevision,
        completedAt: terminal.status === "COMPLETED" ? completedAt : undefined,
      });
      if (terminal.status === "COMPLETED" && run.isMutating !== false
        && (!publicationLineage.patch.headSha || !publicationLineage.patch.pullRequestUrl)) {
        throw new Error("A completed mutating Factory attempt requires durable pull-request head and URL lineage.");
      }
      const failureReason = optionalText(terminal.failureReason, 2_000);
      const steps = terminal.status === "COMPLETED"
        ? run.steps.map((step) => ({
            ...step,
            status: step.status === "SKIPPED" ? "SKIPPED" as const : "DONE" as const,
            completedAt: step.completedAt ?? completedAt,
          }))
        : reconcileTerminalWorkflowSteps(run.steps, terminal.status, failureReason, completedAt);
      await ctx.db.patch(run._id, {
        status: terminal.status,
        completedAt,
        failureReason,
        steps,
        lease: undefined,
        executionPhase: "TERMINAL",
        ...publicationLineage.patch,
        factoryContinuation: run.factoryContinuation
          ? {
              ...run.factoryContinuation,
              status: terminal.status === "COMPLETED" ? "PUBLISHED" : "CLOSED",
              publishedAt: terminal.status === "COMPLETED" ? completedAt : run.factoryContinuation.publishedAt,
              closedAt: terminal.status === "COMPLETED" ? run.factoryContinuation.closedAt : completedAt,
              closureReason: terminal.status === "COMPLETED" ? run.factoryContinuation.closureReason : failureReason,
            }
          : undefined,
      });
      await insertEvent(ctx, run, {
        idempotencyKey: `factory-terminal:${run.runId}:${terminal.status}`,
        eventType: terminal.status === "COMPLETED" ? "RUN_COMPLETED" : "RUN_FAILED",
        workflowStep: run.steps[run.currentStepIndex]?.stepId,
        actor: `service:${args.ownerId}`,
        status: terminal.status,
        startedAt: run.startedAt,
        endedAt: completedAt,
        errorCategory: terminal.status === "COMPLETED" ? undefined : "FACTORY_ATTEMPT_FAILURE",
        errorSummary: failureReason,
        commandSummary: terminal.status === "COMPLETED" ? "Factory attempt completed with review-ready pull request" : undefined,
        metadata: { leaseId: args.leaseId, executionManifestDigest: run.executionManifestDigest },
      });
      if (run.workOrderId) {
        await ctx.runMutation(internal.workOrders.syncExecutionOutcome, {
          workflowRunId: run._id,
          eventType: terminal.status === "COMPLETED" ? "RUN_COMPLETED" : terminal.status === "CANCELED" ? "RUN_CANCELED" : "RUN_FAILED",
          summary: `Factory attempt ${run.runId} ${String(terminal.status).toLowerCase()}`,
        });
      }
    }
    return {
      accepted: true,
      eventCount: eventResults.length,
      artifactCount: artifactResults.length,
      verification,
      terminalStatus: terminal?.status,
    };
  },
});

async function failInvalidPublicationContinuation(ctx: any, run: any, reason: string) {
  const now = Date.now();
  const continuation = run.factoryContinuation;
  for (const receiptId of [continuation?.verificationReceiptId, continuation?.resolvedVerificationReceiptId]) {
    if (!receiptId) continue;
    const receipt = await ctx.db.get(receiptId);
    if (receipt && receipt.status !== "STALE") {
      await ctx.db.patch(receipt._id, {
        status: "STALE",
        invalidatedAt: now,
        invalidationReason: "invalid-human-review-publication-authority",
      });
    }
  }
  await ctx.db.patch(run._id, {
    status: "FAILED",
    completedAt: now,
    failureReason: reason,
    lease: undefined,
    executionPhase: "TERMINAL",
    steps: reconcileTerminalWorkflowSteps(run.steps, "FAILED", reason, now),
    factoryContinuation: continuation
      ? { ...continuation, status: "CLOSED", closedAt: now, closureReason: reason }
      : undefined,
  });
  await insertEvent(ctx, run, {
    idempotencyKey: `factory-publication-invalid:${run.runId}:${continuation?.candidateRevision ?? "unknown"}`,
    eventType: "RUN_FAILED",
    workflowStep: "pull-request-publication",
    actor: "service:factory-control-plane",
    status: "FAILED",
    startedAt: now,
    endedAt: now,
    errorCategory: "PUBLICATION_AUTHORITY_INVALID",
    errorSummary: reason,
    commandSummary: "Invalid human-review publication checkpoint closed",
  });
  if (run.workOrderId) {
    await ctx.scheduler.runAfter(0, internal.workOrders.syncExecutionOutcome, {
      workflowRunId: run._id,
      eventType: "RUN_FAILED",
      summary: reason,
    });
  }
  return { claimed: false as const, reason: "publication-authority-invalid", terminal: true as const };
}

async function nextSequenceNumber(ctx: any, workflowRunId: any) {
  const events = await ctx.db.query("runEvents")
    .withIndex("by_run", (q: any) => q.eq("workflowRunId", workflowRunId))
    .collect();
  return events.reduce((max: number, event: any) => Math.max(max, event.sequenceNumber), 0) + 1;
}

async function insertEvent(ctx: any, run: any, event: any) {
  const existing = await ctx.db.query("runEvents")
    .withIndex("by_idempotency", (q: any) => q.eq("idempotencyKey", event.idempotencyKey))
    .first();
  if (existing) return { event: existing, created: false };
  const eventId = await ctx.db.insert("runEvents", {
    tenantId: run.tenantId,
    projectId: run.projectId,
    workOrderId: run.workOrderId,
    workflowRunId: run._id,
    idempotencyKey: event.idempotencyKey,
    eventType: event.eventType,
    workflowStep: optionalText(event.workflowStep, 200),
    sequenceNumber: await nextSequenceNumber(ctx, run._id),
    actor: optionalText(event.actor, 200),
    toolName: optionalText(event.toolName, 200),
    commandSummary: optionalText(event.commandSummary, 500),
    status: optionalText(event.status, 100),
    startedAt: finiteNumber(event.startedAt),
    endedAt: finiteNumber(event.endedAt),
    durationMs: finiteNumber(event.durationMs),
    retryNumber: finiteNumber(event.retryNumber),
    verificationReceiptId: event.verificationReceiptId,
    verificationRunId: event.verificationRunId,
    evidenceEnvelopeIds: event.evidenceEnvelopeIds,
    evidenceArtifactIds: event.evidenceArtifactIds,
    errorCategory: optionalText(event.errorCategory, 200),
    errorSummary: optionalText(event.errorSummary, 2_000),
    metadata: event.metadata,
  });
  return { event: await ctx.db.get(eventId), created: true };
}

async function persistVerificationPacket(ctx: any, run: any, packet: any, ownerId: string, leaseId: string) {
  if (!run.workOrderId) throw new Error("Verification requires a WorkOrder-bound Factory attempt.");
  const workOrder = await ctx.db.get(run.workOrderId);
  if (!workOrder) throw new Error("Verification WorkOrder not found.");
  if ((workOrder.currentRevisionNumber ?? 1) !== (run.workOrderRevisionNumber ?? 1)) {
    throw new Error("Verification packet is stale because the WorkOrder revision changed.");
  }
  const receiptRecordedAt = Date.now();
  const governancePolicy = await resolveGovernancePolicy(ctx, workOrder);
  const result = recomputeVerificationPacket(workOrder, packet);
  const idempotencyKey = `factory-verification:${run.runId}:${result.candidateRevision}`;
  const existing = await ctx.db
    .query("verificationRuns")
    .withIndex("by_idempotency", (q: any) => q.eq("idempotencyKey", idempotencyKey))
    .first();
  if (existing) {
    const receipt = await ctx.db
      .query("verificationReceipts")
      .withIndex("by_verification_run", (q: any) => q.eq("verificationRunId", existing._id))
      .filter((q: any) => q.eq(q.field("receiptScope"), "WORK_ORDER"))
      .first();
    return { verificationRunId: existing._id, verificationReceiptId: receipt?._id, verdict: existing.verdict, verdictReasons: existing.verdictReasons, created: false };
  }

  const verificationRunId = await ctx.db.insert("verificationRuns", {
    tenantId: run.tenantId,
    projectId: run.projectId,
    missionId: run.missionId,
    workOrderId: workOrder._id,
    workflowRunId: run._id,
    idempotencyKey,
    engineVersion: result.engineVersion,
    workOrderRevisionNumber: workOrder.currentRevisionNumber ?? 1,
    sourceRevision: result.sourceRevision,
    candidateRevision: result.candidateRevision,
    status: "COMPLETED",
    checks: result.checks.map((check: any) => ({ ...check, evidenceIds: [], evidenceKeys: undefined })),
    criterionCoverage: result.coverage.map((coverage: any) => ({ ...coverage, evidenceIds: [], evidenceKeys: undefined })),
    requirementsPassed: result.requirementsPassed,
    requirementsFailed: result.requirementsFailed,
    violations: result.violations,
    approvalRequirements: result.approvalRequirements,
    riskLevel: result.riskLevel,
    riskReasons: result.riskReasons,
    verdict: result.verdict,
    verdictReasons: result.verdictReasons,
    startedAt: result.startedAt,
    completedAt: result.completedAt,
    durationMs: result.durationMs,
    createdAt: Date.now(),
  });

  const evidenceIdByKey = new Map<string, any>();
  for (const evidence of result.evidence) {
    const artifactIds = [];
    for (const reference of evidence.artifactReferences) {
      const artifact = await ctx.db
        .query("runArtifacts")
        .withIndex("by_idempotency", (q: any) => q.eq("idempotencyKey", reference))
        .first();
      if (artifact?.workflowRunId === run._id) artifactIds.push(artifact._id);
    }
    const evidenceEnvelopeId = await ctx.db.insert("evidenceEnvelopes", {
      tenantId: run.tenantId,
      projectId: run.projectId,
      missionId: run.missionId,
      workOrderId: workOrder._id,
      workflowRunId: run._id,
      verificationRunId,
      idempotencyKey: `${idempotencyKey}:${evidence.evidenceKey}`,
      evidenceKey: evidence.evidenceKey,
      checkId: evidence.checkId,
      category: evidence.category,
      result: evidence.result,
      summary: evidence.summary,
      acceptanceCriterionIds: evidence.acceptanceCriterionIds,
      primaryCriterionId: evidence.acceptanceCriterionIds[0],
      producer: {
        actorType: "SERVICE",
        actorId: evidence.producer.id,
        role: evidence.producer.role,
        independent: evidence.producer.independent,
      },
      artifactIds,
      artifactReferences: evidence.artifactReferences,
      sourceRevision: result.sourceRevision,
      candidateRevision: result.candidateRevision,
      contentHash: evidence.contentHash,
      provenance: "LIVE",
      recordedAt: Date.now(),
      metadata: { ...(evidence.metadata ?? {}), leaseId, reportedBy: ownerId },
    });
    evidenceIdByKey.set(evidence.evidenceKey, evidenceEnvelopeId);
  }

  const checks = result.checks.map((check: any) => ({
    ...check,
    evidenceIds: check.evidenceKeys.map((key: string) => evidenceIdByKey.get(key)).filter(Boolean),
    evidenceKeys: undefined,
  }));
  const criterionCoverage = result.coverage.map((coverage: any) => ({
    ...coverage,
    evidenceIds: coverage.evidenceKeys.map((key: string) => evidenceIdByKey.get(key)).filter(Boolean),
    evidenceKeys: undefined,
  }));
  await ctx.db.patch(verificationRunId, { checks, criterionCoverage });

  const priorReceipts = await ctx.db
    .query("verificationReceipts")
    .withIndex("by_work_order", (q: any) => q.eq("workOrderId", workOrder._id))
    .collect();
  for (const receipt of priorReceipts) {
    if (receipt.status === "STALE") continue;
    await ctx.db.patch(receipt._id, {
      status: "STALE",
      invalidatedAt: Date.now(),
      invalidationReason: `superseded-by-verification:${verificationRunId}`,
    });
  }

  const allEvidenceIds = [...evidenceIdByKey.values()];
  const receiptStatus = result.verdict === "VERIFIED"
    ? "PASSED"
    : result.verdict === "REQUIRES_HUMAN_REVIEW"
      ? "PENDING"
      : "FAILED";
  const receiptValidUntil = verificationValidUntil(governancePolicy, receiptRecordedAt);
  const verificationReceiptId = await ctx.db.insert("verificationReceipts", {
    tenantId: run.tenantId,
    projectId: run.projectId,
    missionId: run.missionId,
    workOrderId: workOrder._id,
    receiptScope: "WORK_ORDER",
    workflowRunId: run._id,
    verificationRunId,
    idempotencyKey: `${idempotencyKey}:receipt`,
    verifier: `service:${ownerId}`,
    status: receiptStatus,
    result: result.verdictReasons.join(" "),
    evidenceEnvelopeIds: allEvidenceIds,
    verdict: result.verdict,
    verdictReasons: result.verdictReasons,
    checks,
    criterionCoverage,
    requirementsPassed: result.requirementsPassed,
    requirementsFailed: result.requirementsFailed,
    violations: result.violations,
    approvalRequirements: result.approvalRequirements,
    riskLevel: result.riskLevel,
    riskReasons: result.riskReasons,
    sourceRevision: result.sourceRevision,
    candidateRevision: result.candidateRevision,
    workOrderRevisionNumber: workOrder.currentRevisionNumber ?? 1,
    validUntil: receiptValidUntil,
    recordedAt: receiptRecordedAt,
    metadata: { engineVersion: result.engineVersion, serverRecomputed: true, leaseId },
  });

  for (const coverage of criterionCoverage) {
    await ctx.db.insert("verificationReceipts", {
      tenantId: run.tenantId,
      projectId: run.projectId,
      missionId: run.missionId,
      workOrderId: workOrder._id,
      receiptScope: "ACCEPTANCE_CRITERION",
      acceptanceCriterionId: coverage.criterionId,
      workflowRunId: run._id,
      verificationRunId,
      idempotencyKey: `${idempotencyKey}:criterion:${coverage.criterionId}`,
      verifier: `service:${ownerId}`,
      status: coverage.status === "EVIDENCED" ? "PASSED" : "FAILED",
      result: coverage.status === "EVIDENCED" ? "Required evidence is present." : coverage.missingEvidence.join("; "),
      evidenceEnvelopeIds: coverage.evidenceIds,
      sourceRevision: result.sourceRevision,
      candidateRevision: result.candidateRevision,
      workOrderRevisionNumber: workOrder.currentRevisionNumber ?? 1,
      validUntil: receiptValidUntil,
      recordedAt: Date.now(),
      metadata: { engineVersion: result.engineVersion, serverRecomputed: true, leaseId },
    });
  }

  await insertEvent(ctx, run, {
    idempotencyKey: `${idempotencyKey}:started`, eventType: "VERIFICATION_STARTED",
    workflowStep: "independent-verification", actor: `service:${ownerId}`, status: "RUNNING",
    startedAt: result.startedAt, verificationRunId,
    commandSummary: `Independent verification started for ${result.candidateRevision.slice(0, 12)}`,
  });
  for (const check of checks) {
    await insertEvent(ctx, run, {
      idempotencyKey: `${idempotencyKey}:check:${check.checkId}:started`,
      eventType: "VERIFICATION_CHECK_STARTED", workflowStep: "independent-verification",
      actor: `service:${ownerId}`, status: "RUNNING", startedAt: check.startedAt,
      verificationRunId, commandSummary: `Started ${check.name}`,
      metadata: { checkId: check.checkId, category: check.category, mandatory: check.mandatory },
    });
    if (check.metadata?.commandClass) {
      await insertEvent(ctx, run, {
        idempotencyKey: `${idempotencyKey}:command:${check.checkId}:requested`, eventType: "COMMAND_REQUESTED",
        workflowStep: "independent-verification", actor: `service:${ownerId}`, status: "REQUESTED",
        startedAt: check.startedAt, verificationRunId, commandSummary: `Verification command requested for ${check.name}`,
        metadata: { checkId: check.checkId, commandClass: check.metadata.commandClass },
      });
      await insertEvent(ctx, run, {
        idempotencyKey: `${idempotencyKey}:command:${check.checkId}:decision`,
        eventType: check.metadata.commandDenied ? "COMMAND_DENIED" : "COMMAND_APPROVED",
        workflowStep: "independent-verification", actor: `service:${ownerId}`,
        status: check.metadata.commandDenied ? "DENIED" : "APPROVED", startedAt: check.startedAt,
        verificationRunId, commandSummary: `${check.metadata.commandDenied ? "Denied" : "Approved"} ${check.name}`,
        metadata: { checkId: check.checkId, commandClass: check.metadata.commandClass },
      });
    }
    await insertEvent(ctx, run, {
      idempotencyKey: `${idempotencyKey}:check:${check.checkId}`,
      eventType: check.status === "PASS" ? "VERIFICATION_CHECK_PASSED" : "VERIFICATION_CHECK_FAILED",
      workflowStep: "independent-verification", actor: `service:${ownerId}`, status: check.status,
      startedAt: check.startedAt, endedAt: check.completedAt, durationMs: check.durationMs,
      verificationRunId, evidenceEnvelopeIds: check.evidenceIds,
      commandSummary: `${check.name}: ${check.summary}`,
      metadata: { checkId: check.checkId, category: check.category, mandatory: check.mandatory },
    });
  }
  for (const [evidenceKey, evidenceEnvelopeId] of evidenceIdByKey) {
    await insertEvent(ctx, run, {
      idempotencyKey: `${idempotencyKey}:evidence:${evidenceKey}`,
      eventType: "EVIDENCE_CREATED", workflowStep: "independent-verification", actor: `service:${ownerId}`,
      status: "RECORDED", verificationRunId, evidenceEnvelopeIds: [evidenceEnvelopeId],
      commandSummary: `Evidence recorded for ${evidenceKey}`,
    });
  }
  await insertEvent(ctx, run, {
    idempotencyKey: `${idempotencyKey}:receipt-created`, eventType: "VERIFICATION_RECEIPT_CREATED",
    workflowStep: "independent-verification", actor: `service:${ownerId}`, status: result.verdict,
    startedAt: result.startedAt, endedAt: result.completedAt, verificationRunId,
    verificationReceiptId, evidenceEnvelopeIds: allEvidenceIds,
    commandSummary: `Verification verdict: ${result.verdict}`,
    metadata: { verdictReasons: result.verdictReasons, requirementsPassed: result.requirementsPassed, requirementsFailed: result.requirementsFailed },
  });

  let humanReview: any;
  if (result.verdict === "REQUIRES_HUMAN_REVIEW") {
    humanReview = await pauseForHumanReview(ctx, {
      run,
      workOrder,
      verificationRunId,
      verificationReceiptId,
      sourceRevision: result.sourceRevision,
      candidateRevision: result.candidateRevision,
    });
  }

  return {
    verificationRunId,
    verificationReceiptId,
    verdict: result.verdict,
    verdictReasons: result.verdictReasons,
    paused: Boolean(humanReview),
    approvalDecisionId: humanReview?.approvalDecisionId,
    created: true,
  };
}

async function pauseForHumanReview(ctx: any, input: {
  run: any;
  workOrder: any;
  verificationRunId: any;
  verificationReceiptId: any;
  sourceRevision: string;
  candidateRevision: string;
}) {
  const now = Date.now();
  const policy = await resolveGovernancePolicy(ctx, input.workOrder);
  const idempotencyKey = `factory-human-review:${input.run.runId}:${input.candidateRevision}`;
  let approval = await ctx.db.query("approvalDecisions")
    .withIndex("by_idempotency", (q: any) => q.eq("idempotencyKey", idempotencyKey))
    .first();
  if (!approval) {
    const approvalDecisionId = await ctx.db.insert("approvalDecisions", {
      tenantId: input.workOrder.tenantId,
      projectId: input.workOrder.projectId,
      workOrderId: input.workOrder._id,
      workflowRunId: input.run._id,
      idempotencyKey,
      approvalType: "HUMAN_REVIEW",
      requestedAction: `Approve verified candidate ${input.candidateRevision.slice(0, 12)} for pull-request publication`,
      riskLevel: input.workOrder.riskLevel,
      requestedBy: "factory-verification/v1",
      status: "PENDING",
      workOrderRevisionNumber: input.workOrder.currentRevisionNumber ?? 1,
      expiresAt: approvalExpiresAt(input.workOrder.riskLevel, policy, now),
      createdAt: now,
      metadata: {
        authorityBoundary: "Approval authorizes publication of this exact independently verified commit only.",
        dispatchPreview: "Unconditional approval resumes the same Attempt at pull-request publication. Agent execution and independent verification do not run again.",
        verificationRunId: input.verificationRunId,
        verificationReceiptId: input.verificationReceiptId,
        candidateRevision: input.candidateRevision,
        sourceRevision: input.sourceRevision,
      },
    });
    approval = await ctx.db.get(approvalDecisionId);
  }
  if (!approval) throw new Error("Human-review approval request could not be persisted.");
  if (approval.expiresAt) {
    await ctx.scheduler.runAt(approval.expiresAt, internal.workOrders.expireFactoryHumanReviewCheckpointInternal, {
      approvalDecisionId: approval._id,
    });
  }

  await ctx.db.patch(input.verificationReceiptId, {
    validUntil: verificationValidUntil(policy, now),
  });
  await ctx.db.patch(input.run._id, {
    status: "PAUSED",
    lease: undefined,
    checkpointAt: now,
    checkpointSummary: `Awaiting human review of verified candidate ${input.candidateRevision.slice(0, 12)}`,
    executionPhase: "AWAITING_HUMAN_REVIEW",
    humanInterventions: (input.run.humanInterventions ?? 0) + 1,
    factoryContinuation: {
      status: "AWAITING_HUMAN_REVIEW",
      verificationRunId: input.verificationRunId,
      verificationReceiptId: input.verificationReceiptId,
      approvalDecisionId: approval._id,
      workOrderRevisionNumber: input.workOrder.currentRevisionNumber ?? 1,
      sourceRevision: input.sourceRevision,
      candidateRevision: input.candidateRevision,
      pausedAt: now,
    },
  });
  await insertEvent(ctx, input.run, {
    idempotencyKey: `${idempotencyKey}:intervention`,
    eventType: "HUMAN_INTERVENTION_REQUESTED",
    workflowStep: "independent-verification",
    actor: "service:factory-verification/v1",
    status: "PENDING",
    startedAt: now,
    verificationRunId: input.verificationRunId,
    verificationReceiptId: input.verificationReceiptId,
    commandSummary: `Human review required for ${input.candidateRevision.slice(0, 12)}`,
    metadata: { approvalDecisionId: approval._id, candidateRevision: input.candidateRevision },
  });
  await insertEvent(ctx, input.run, {
    idempotencyKey: `${idempotencyKey}:paused`,
    eventType: "RUN_PAUSED",
    workflowStep: "independent-verification",
    actor: "service:factory-verification/v1",
    status: "PAUSED",
    startedAt: now,
    verificationRunId: input.verificationRunId,
    verificationReceiptId: input.verificationReceiptId,
    commandSummary: "Factory attempt paused before pull-request publication",
    metadata: { approvalDecisionId: approval._id, candidateRevision: input.candidateRevision },
  });
  await ctx.db.insert("workOrderEvents", {
    tenantId: input.workOrder.tenantId,
    projectId: input.workOrder.projectId,
    workOrderId: input.workOrder._id,
    workflowRunId: input.run._id,
    idempotencyKey: `${idempotencyKey}:work-order-event`,
    eventType: "APPROVAL_REQUESTED",
    actorType: "SYSTEM",
    summary: `Human review requested for verified candidate ${input.candidateRevision.slice(0, 12)}`,
    timestamp: now,
    metadata: { approvalDecisionId: approval._id, verificationReceiptId: input.verificationReceiptId },
  });
  await ctx.db.patch(input.workOrder._id, {
    state: "AWAITING_APPROVAL",
    approvalStatus: "PENDING",
    currentExecutionRunId: input.run._id,
    blockingIssue: undefined,
    requiredHumanAction: `Review evidence for candidate ${input.candidateRevision.slice(0, 12)}. Unconditional approval resumes this same Attempt at publication.`,
    updatedAt: now,
  });
  return { approvalDecisionId: approval._id };
}

async function resolveGovernancePolicy(ctx: any, workOrder: any) {
  if (workOrder.governancePolicyId) {
    const direct = await ctx.db.get(workOrder.governancePolicyId);
    if (direct) return direct;
  }
  if (workOrder.projectId) {
    const projectPolicy = await ctx.db.query("governancePolicies")
      .withIndex("by_project_active", (q: any) => q.eq("projectId", workOrder.projectId).eq("active", true))
      .first();
    if (projectPolicy) return projectPolicy;
  }
  return DEFAULT_GOVERNANCE_POLICY;
}

function optionalText(value: unknown, max: number): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : undefined;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
