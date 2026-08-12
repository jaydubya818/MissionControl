import { v } from "convex/values";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "../_generated/server";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import {
  evaluateFactoryReleaseVerification,
  evaluateFactoryReleaseProvenance,
  factoryReleaseAllowedOrigins,
  factoryReleaseBoundLineageIssue,
  factoryReleaseEvidenceReplayMatches,
  factoryReleaseMergeIdentityIssue,
  factoryReleaseTransitionAllowed,
  normalizeCommitSha,
  validateFactoryReleaseVerificationUrls,
  type FactoryReleaseCheckResult,
} from "../lib/factoryRelease";
import { isVerifiedPrLineage } from "../lib/harnessPrChecks";
import { canonicalRepositoryKey } from "../lib/workspaceRepositories";
import {
  FACTORY_PERMISSIONS,
  requireWorkspacePermission,
} from "../lib/companyAccess";
import { requireFactoryActionWithAudit } from "../lib/factoryActionAuthorization";

const MAX_EVIDENCE_BYTES = 64 * 1024;
const FETCH_TIMEOUT_MS = 10_000;

const verificationResultValidator = v.object({
  kind: v.union(
    v.literal("PROVENANCE"),
    v.literal("SMOKE_TEST"),
    v.literal("HEALTH_CHECK"),
  ),
  passed: v.boolean(),
  url: v.string(),
  httpStatus: v.optional(v.number()),
  latencyMs: v.optional(v.number()),
  contentDigest: v.optional(v.string()),
  summary: v.string(),
});

export const listForProject = query({
  args: { projectId: v.id("projects"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireWorkspacePermission(ctx, args.projectId, FACTORY_PERMISSIONS.VIEW);
    const rows = await ctx.db
      .query("factoryReleases")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    rows.sort((left, right) => right.updatedAt - left.updatedAt);
    const limit = Math.max(1, Math.min(args.limit ?? 30, 100));
    return await Promise.all(rows.slice(0, limit).map(async (release) => {
      const [workOrder, environment, evidence] = await Promise.all([
        ctx.db.get(release.workOrderId),
        ctx.db.get(release.environmentId),
        ctx.db.query("factoryReleaseEvidence")
          .withIndex("by_release", (q) => q.eq("releaseId", release._id))
          .order("desc")
          .take(6),
      ]);
      return { release, workOrder, environment, evidence };
    }));
  },
});

export const getDetail = query({
  args: { releaseId: v.id("factoryReleases") },
  handler: async (ctx, args) => {
    const release = await ctx.db.get(args.releaseId);
    if (!release) throw new Error("Factory release is unavailable or unauthorized.");
    await requireWorkspacePermission(ctx, release.projectId, FACTORY_PERMISSIONS.VIEW);
    const [workOrder, workflowRun, environment, evaluation, evidence] = await Promise.all([
      ctx.db.get(release.workOrderId),
      ctx.db.get(release.workflowRunId),
      ctx.db.get(release.environmentId),
      ctx.db.get(release.prEvaluationId),
      ctx.db.query("factoryReleaseEvidence")
        .withIndex("by_release", (q) => q.eq("releaseId", release._id))
        .order("asc")
        .collect(),
    ]);
    return { release, workOrder, workflowRun, environment, evaluation, evidence };
  },
});

export const reconcileMergedPullRequest = mutation({
  args: { evaluationId: v.id("harnessPrChecks") },
  handler: async (ctx, args) => {
    const evaluation = await ctx.db.get(args.evaluationId);
    if (!evaluation?.projectId) throw new Error("Merged pull request is not workspace-scoped.");
    const access = await requireWorkspacePermission(
      ctx,
      evaluation.projectId,
      FACTORY_PERMISSIONS.IMPROVE,
    );
    return await ensureReleaseFromMergedPr(ctx, evaluation, `human:${access.actorId}`);
  },
});

export const ensureFromMergedPrInternal = internalMutation({
  args: { evaluationId: v.id("harnessPrChecks") },
  handler: async (ctx, args) => {
    const evaluation = await ctx.db.get(args.evaluationId);
    if (!evaluation) return { created: false as const, reason: "pr-evaluation-missing" };
    return await ensureReleaseFromMergedPr(ctx, evaluation, "system:github-app");
  },
});

export const configureStagingVerification = mutation({
  args: {
    projectId: v.id("projects"),
    environmentId: v.id("environments"),
    allowedOrigin: v.string(),
  },
  handler: async (ctx, args) => {
    const access = await requireWorkspacePermission(
      ctx,
      args.projectId,
      FACTORY_PERMISSIONS.MANAGE_AUTOMATION,
    );
    const environment = await ctx.db.get(args.environmentId);
    if (!environment || environment.type !== "staging" || environment.tenantId !== access.project.tenantId) {
      throw new Error("Select a staging environment in this workspace company.");
    }
    const candidate = args.allowedOrigin.trim();
    const validation = validateFactoryReleaseVerificationUrls({
      urls: {
        deploymentUrl: candidate,
        provenanceUrl: candidate,
        smokeUrl: candidate,
        healthUrl: candidate,
      },
      allowedOrigins: [candidate],
      allowLocalhost: localVerificationAllowed(),
    });
    if ("reason" in validation) {
      throw new Error(`Staging verification origin is unsafe (${validation.reason}).`);
    }
    await ctx.db.patch(environment._id, {
      metadata: {
        ...(environment.metadata && typeof environment.metadata === "object" ? environment.metadata : {}),
        releaseVerification: { allowedOrigins: [validation.origin] },
      },
    });
    await recordActivity(ctx, {
      projectId: args.projectId,
      actorType: "HUMAN",
      actorId: access.actorId,
      action: "FACTORY_STAGING_ORIGIN_CONFIGURED",
      description: `Configured ${validation.origin} as the staging verification origin`,
      targetType: "ENVIRONMENT",
      targetId: String(environment._id),
      metadata: { allowedOrigin: validation.origin },
    });
    return { environmentId: environment._id, allowedOrigin: validation.origin };
  },
});

export const approveStagingDeployment = mutation({
  args: {
    releaseId: v.id("factoryReleases"),
    expectedMergeCommitSha: v.string(),
    rationale: v.string(),
  },
  handler: async (ctx, args) => {
    const release = await requireRelease(ctx, args.releaseId);
    const access = await requireWorkspacePermission(
      ctx,
      release.projectId,
      FACTORY_PERMISSIONS.APPROVE,
    );
    const expectedSha = normalizeCommitSha(args.expectedMergeCommitSha);
    if (!expectedSha || expectedSha !== release.mergeCommitSha) {
      throw new Error("Deployment approval must bind the exact merged commit.");
    }
    if (release.state !== "MERGED") throw new Error("Only a merged release can receive staging approval.");
    const environment = await ctx.db.get(release.environmentId);
    if (!environment || environment.type !== "staging") {
      throw new Error("Factory release deployment approval is staging-only.");
    }
    const rationale = args.rationale.trim();
    if (rationale.length < 8) throw new Error("Deployment approval rationale is required.");
    if (release.deploymentApprovalStatus === "APPROVED") {
      if (release.deploymentApprovedBy !== access.actorId || release.deploymentApprovalRationale !== rationale) {
        throw new Error("Deployment approval is already recorded and immutable.");
      }
      return { approved: false as const, release };
    }
    const now = Date.now();
    await ctx.db.patch(release._id, {
      deploymentApprovalStatus: "APPROVED",
      deploymentApprovedBy: access.actorId,
      deploymentApprovedAt: now,
      deploymentApprovalRationale: rationale,
      blockingIssue: undefined,
      requiredHumanAction: "Deploy this exact merge commit to staging and attach the provider receipt.",
      updatedAt: now,
    });
    await appendEvidence(ctx, release, {
      kind: "DEPLOYMENT_APPROVAL",
      status: "PASS",
      subjectSha: release.mergeCommitSha,
      summary: rationale,
      actorType: "HUMAN",
      actorId: access.actorId,
      idempotencyKey: `factory-release:${release._id}:deployment-approval:${release.mergeCommitSha}`,
      metadata: { environmentId: release.environmentId },
    });
    await syncWorkOrder(ctx, release, {
      state: "AWAITING_VERIFICATION",
      verificationStatus: "PENDING",
      requiredHumanAction: "Deploy the approved merge commit to staging and attach the provider receipt.",
      summary: `Staging deployment approved for ${release.mergeCommitSha.slice(0, 12)}`,
      actorType: "HUMAN",
      actorId: access.actorId,
      idempotencyKey: `factory-release:${release._id}:work-order:deployment-approved`,
    });
    return { approved: true as const, release: await ctx.db.get(release._id) };
  },
});

export const recordStagingDeployment = mutation({
  args: {
    releaseId: v.id("factoryReleases"),
    commitSha: v.string(),
    provider: v.string(),
    providerDeploymentId: v.string(),
    deploymentUrl: v.string(),
    provenanceUrl: v.string(),
    smokeUrl: v.string(),
    healthUrl: v.string(),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    const release = await requireRelease(ctx, args.releaseId);
    const access = await requireWorkspacePermission(
      ctx,
      release.projectId,
      FACTORY_PERMISSIONS.IMPROVE,
    );
    const commitSha = normalizeCommitSha(args.commitSha);
    if (!commitSha || commitSha !== release.mergeCommitSha) {
      throw new Error("Deployment receipt must name the exact approved merge commit.");
    }
    const provider = args.provider.trim();
    const providerDeploymentId = args.providerDeploymentId.trim();
    if (!provider || provider.length > 80 || !providerDeploymentId || providerDeploymentId.length > 200) {
      throw new Error("Deployment provider and provider deployment ID are required.");
    }
    const environment = await ctx.db.get(release.environmentId);
    if (!environment || environment.type !== "staging") {
      throw new Error("Factory release deployment is staging-only.");
    }
    const urls = validateFactoryReleaseVerificationUrls({
      urls: {
        deploymentUrl: args.deploymentUrl,
        provenanceUrl: args.provenanceUrl,
        smokeUrl: args.smokeUrl,
        healthUrl: args.healthUrl,
      },
      allowedOrigins: factoryReleaseAllowedOrigins(environment.metadata),
      allowLocalhost: localVerificationAllowed(),
    });
    if ("reason" in urls) throw new Error(`Deployment verification URLs are unsafe (${urls.reason}).`);
    const summary = `${provider} reported staging deployment ${providerDeploymentId}`;
    const evidenceMetadata = {
      origin: urls.origin,
      provider,
      provenanceUrl: urls.urls.provenanceUrl,
      smokeUrl: urls.urls.smokeUrl,
      healthUrl: urls.urls.healthUrl,
    };
    const duplicate = await ctx.db.query("factoryReleaseEvidence")
      .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", args.idempotencyKey))
      .first();
    if (duplicate) {
      if (duplicate.releaseId !== release._id || !factoryReleaseEvidenceReplayMatches(duplicate, {
        kind: "DEPLOYMENT",
        subjectSha: release.mergeCommitSha,
        providerRef: providerDeploymentId,
        evidenceUrl: urls.urls.deploymentUrl,
        summary,
        metadata: evidenceMetadata,
      })) {
        throw new Error("Deployment idempotency key is bound to different evidence.");
      }
      return { recorded: false as const, release };
    }
    if (release.state !== "MERGED" || !factoryReleaseTransitionAllowed(release.state, "DEPLOYED")) {
      throw new Error("Only an approved merged release can be recorded as deployed.");
    }
    if (release.deploymentApprovalStatus !== "APPROVED") {
      throw new Error("Human staging deployment approval is required first.");
    }
    const now = Date.now();
    await ctx.db.patch(release._id, {
      state: "DEPLOYED",
      deploymentProvider: provider,
      providerDeploymentId,
      ...urls.urls,
      deployedAt: now,
      blockingIssue: undefined,
      requiredHumanAction: "Run independent provenance, smoke, and health verification.",
      updatedAt: now,
    });
    await appendEvidence(ctx, release, {
      kind: "DEPLOYMENT",
      status: "INFO",
      subjectSha: release.mergeCommitSha,
      providerRef: providerDeploymentId,
      evidenceUrl: urls.urls.deploymentUrl,
      summary,
      actorType: "HUMAN",
      actorId: access.actorId,
      idempotencyKey: args.idempotencyKey,
      metadata: evidenceMetadata,
    });
    await syncWorkOrder(ctx, release, {
      state: "AWAITING_VERIFICATION",
      verificationStatus: "PENDING",
      requiredHumanAction: "Run independent staging provenance, smoke, and health verification.",
      summary: `Exact merge ${release.mergeCommitSha.slice(0, 12)} recorded as deployed to staging`,
      actorType: "HUMAN",
      actorId: access.actorId,
      idempotencyKey: `factory-release:${release._id}:work-order:deployed`,
    });
    return { recorded: true as const, release: await ctx.db.get(release._id) };
  },
});

export const getVerificationManifest = internalQuery({
  args: { releaseId: v.id("factoryReleases") },
  handler: async (ctx, args) => {
    const release = await ctx.db.get(args.releaseId);
    if (!release || release.state !== "DEPLOYED") {
      throw new Error("Only a deployed release can be verified.");
    }
    const environment = await ctx.db.get(release.environmentId);
    if (!environment || environment.type !== "staging") {
      throw new Error("Factory release verification is staging-only.");
    }
    if (!release.providerDeploymentId || !release.deploymentUrl || !release.provenanceUrl || !release.smokeUrl || !release.healthUrl) {
      throw new Error("Deployment receipt is incomplete.");
    }
    const urls = validateFactoryReleaseVerificationUrls({
      urls: {
        deploymentUrl: release.deploymentUrl,
        provenanceUrl: release.provenanceUrl,
        smokeUrl: release.smokeUrl,
        healthUrl: release.healthUrl,
      },
      allowedOrigins: factoryReleaseAllowedOrigins(environment.metadata),
      allowLocalhost: localVerificationAllowed(),
    });
    if ("reason" in urls) throw new Error(`Deployment verification URLs are unsafe (${urls.reason}).`);
    return {
      projectId: release.projectId,
      releaseId: release._id,
      mergeCommitSha: release.mergeCommitSha,
      providerDeploymentId: release.providerDeploymentId,
      verificationAttemptCount: release.verificationAttemptCount,
      urls: urls.urls,
    };
  },
});

export const verifyStagingDeployment = action({
  args: { releaseId: v.id("factoryReleases") },
  handler: async (ctx, args): Promise<any> => {
    const manifest = await ctx.runQuery(internal.factory.releases.getVerificationManifest, {
      releaseId: args.releaseId,
    });
    await requireFactoryActionWithAudit(ctx, {
      projectId: manifest.projectId,
      permission: FACTORY_PERMISSIONS.IMPROVE,
      operation: "FACTORY_STAGING_VERIFY",
    });

    const [provenanceResponse, smokeResponse, healthResponse] = await Promise.all([
      fetchEvidence(manifest.urls.provenanceUrl),
      fetchEvidence(manifest.urls.smokeUrl),
      fetchEvidence(manifest.urls.healthUrl),
    ]);
    let provenance: unknown;
    try {
      provenance = provenanceResponse.bodyText ? JSON.parse(provenanceResponse.bodyText) : undefined;
    } catch {
      provenance = undefined;
    }
    const provenanceResult = evaluateFactoryReleaseProvenance({
      mergeCommitSha: manifest.mergeCommitSha,
      providerDeploymentId: manifest.providerDeploymentId,
      provenance,
    });

    const checks: FactoryReleaseCheckResult[] = [
      {
        kind: "PROVENANCE",
        passed: provenanceResponse.ok && !("reason" in provenanceResult),
        url: manifest.urls.provenanceUrl,
        httpStatus: provenanceResponse.httpStatus,
        latencyMs: provenanceResponse.latencyMs,
        contentDigest: provenanceResponse.contentDigest,
        summary: !provenanceResponse.ok
          ? provenanceResponse.error ?? "Provenance request failed."
          : !("reason" in provenanceResult)
            ? "Provenance matches the exact merge commit and deployment receipt."
            : provenanceResult.reason,
      },
      {
        kind: "SMOKE_TEST",
        passed: smokeResponse.ok,
        url: manifest.urls.smokeUrl,
        httpStatus: smokeResponse.httpStatus,
        latencyMs: smokeResponse.latencyMs,
        contentDigest: smokeResponse.contentDigest,
        summary: smokeResponse.ok ? "Staging smoke endpoint passed." : smokeResponse.error ?? "Smoke request failed.",
      },
      {
        kind: "HEALTH_CHECK",
        passed: healthResponse.ok,
        url: manifest.urls.healthUrl,
        httpStatus: healthResponse.httpStatus,
        latencyMs: healthResponse.latencyMs,
        contentDigest: healthResponse.contentDigest,
        summary: healthResponse.ok ? "Staging health endpoint passed." : healthResponse.error ?? "Health request failed.",
      },
    ];
    const outcome = evaluateFactoryReleaseVerification({
      mergeCommitSha: manifest.mergeCommitSha,
      providerDeploymentId: manifest.providerDeploymentId,
      provenance,
      checks,
    });
    return await ctx.runMutation(internal.factory.releases.recordVerificationInternal, {
      releaseId: args.releaseId,
      expectedVerificationAttemptCount: manifest.verificationAttemptCount,
      verified: outcome.verified,
      reason: outcome.reason,
      checks,
    });
  },
});

export const recordVerificationInternal = internalMutation({
  args: {
    releaseId: v.id("factoryReleases"),
    expectedVerificationAttemptCount: v.number(),
    verified: v.boolean(),
    reason: v.optional(v.string()),
    checks: v.array(verificationResultValidator),
  },
  handler: async (ctx, args) => {
    const release = await requireRelease(ctx, args.releaseId);
    if (release.state !== "DEPLOYED") throw new Error("Only a deployed release can receive verification evidence.");
    if (release.verificationAttemptCount !== args.expectedVerificationAttemptCount) {
      return { recorded: false as const, reason: "verification-attempt-superseded", release };
    }
    const attempt = args.expectedVerificationAttemptCount + 1;
    const now = Date.now();
    for (const check of args.checks) {
      await appendEvidence(ctx, release, {
        kind: check.kind,
        status: check.passed ? "PASS" : "FAIL",
        subjectSha: release.mergeCommitSha,
        providerRef: release.providerDeploymentId,
        evidenceUrl: check.url,
        httpStatus: check.httpStatus,
        latencyMs: check.latencyMs,
        contentDigest: check.contentDigest,
        summary: check.summary,
        actorType: "SYSTEM",
        actorId: "system:staging-verifier",
        idempotencyKey: `factory-release:${release._id}:verification:${attempt}:${check.kind}`,
      });
    }
    if (args.verified) {
      if (!factoryReleaseTransitionAllowed(release.state, "VERIFIED")) {
        throw new Error("Factory release cannot transition to verified.");
      }
      await ctx.db.patch(release._id, {
        state: "VERIFIED",
        verifiedAt: now,
        blockingIssue: undefined,
        requiredHumanAction: undefined,
        verificationAttemptCount: attempt,
        updatedAt: now,
      });
      await syncWorkOrder(ctx, release, {
        state: "DONE",
        verificationStatus: "PASS",
        requiredHumanAction: undefined,
        summary: `Staging verified exact merge ${release.mergeCommitSha.slice(0, 12)}`,
        actorType: "SYSTEM",
        actorId: "system:staging-verifier",
        idempotencyKey: `factory-release:${release._id}:work-order:verified`,
      });
    } else {
      const reason = args.reason ?? "required staging verification failed";
      await ctx.db.patch(release._id, {
        blockingIssue: reason,
        requiredHumanAction: "Review failed staging evidence, correct the deployment, or roll back.",
        verificationAttemptCount: attempt,
        updatedAt: now,
      });
      await syncWorkOrder(ctx, release, {
        state: "AWAITING_VERIFICATION",
        verificationStatus: "FAIL",
        blockingIssue: `Staging verification failed: ${reason}`,
        requiredHumanAction: "Review failed staging evidence, correct the deployment, or roll back.",
        summary: `Staging verification failed for ${release.mergeCommitSha.slice(0, 12)} (${reason})`,
        actorType: "SYSTEM",
        actorId: "system:staging-verifier",
        idempotencyKey: `factory-release:${release._id}:work-order:verification-failed:${attempt}`,
      });
    }
    return { recorded: true as const, verified: args.verified, release: await ctx.db.get(release._id) };
  },
});

export const recordRollback = mutation({
  args: {
    releaseId: v.id("factoryReleases"),
    restoredCommitSha: v.string(),
    providerRollbackId: v.string(),
    evidenceUrl: v.string(),
    rationale: v.string(),
    humanConfirmed: v.boolean(),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    const release = await requireRelease(ctx, args.releaseId);
    const access = await requireWorkspacePermission(
      ctx,
      release.projectId,
      FACTORY_PERMISSIONS.APPROVE,
    );
    if (!args.humanConfirmed) throw new Error("Explicit rollback confirmation is required.");
    const restoredCommitSha = normalizeCommitSha(args.restoredCommitSha);
    if (!restoredCommitSha || restoredCommitSha === release.mergeCommitSha) {
      throw new Error("Rollback must name a different full restored commit SHA.");
    }
    const providerRollbackId = args.providerRollbackId.trim();
    const rationale = args.rationale.trim();
    if (!providerRollbackId || !rationale) throw new Error("Rollback provider receipt and rationale are required.");
    const evidenceUrl = validateRollbackEvidenceUrl(args.evidenceUrl, release.deploymentUrl);
    const duplicate = await ctx.db.query("factoryReleaseEvidence")
      .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", args.idempotencyKey))
      .first();
    if (duplicate) {
      if (duplicate.releaseId !== release._id || !factoryReleaseEvidenceReplayMatches(duplicate, {
        kind: "ROLLBACK",
        subjectSha: restoredCommitSha,
        providerRef: providerRollbackId,
        evidenceUrl,
        summary: rationale,
        metadata: { rolledBackMergeCommitSha: release.mergeCommitSha },
      })) {
        throw new Error("Rollback idempotency key is bound to different evidence.");
      }
      return { recorded: false as const, release };
    }
    if (!factoryReleaseTransitionAllowed(release.state, "ROLLED_BACK")) {
      throw new Error("Only a deployed or verified release can be rolled back.");
    }
    const now = Date.now();
    await ctx.db.patch(release._id, {
      state: "ROLLED_BACK",
      restoredCommitSha,
      rolledBackAt: now,
      blockingIssue: `Release rolled back from ${release.mergeCommitSha.slice(0, 12)} to ${restoredCommitSha.slice(0, 12)}.`,
      requiredHumanAction: "Open a corrective WorkOrder before attempting another release.",
      updatedAt: now,
    });
    await appendEvidence(ctx, release, {
      kind: "ROLLBACK",
      status: "INFO",
      subjectSha: restoredCommitSha,
      providerRef: providerRollbackId,
      evidenceUrl,
      summary: rationale,
      actorType: "HUMAN",
      actorId: access.actorId,
      idempotencyKey: args.idempotencyKey,
      metadata: { rolledBackMergeCommitSha: release.mergeCommitSha },
    });
    await syncWorkOrder(ctx, release, {
      state: "BLOCKED",
      verificationStatus: "FAIL",
      blockingIssue: `Staging release rolled back to ${restoredCommitSha}.`,
      requiredHumanAction: "Open a corrective WorkOrder before attempting another release.",
      summary: `Staging release rolled back to ${restoredCommitSha.slice(0, 12)}`,
      actorType: "HUMAN",
      actorId: access.actorId,
      idempotencyKey: `factory-release:${release._id}:work-order:rolled-back`,
    });
    return { recorded: true as const, release: await ctx.db.get(release._id) };
  },
});

async function ensureReleaseFromMergedPr(ctx: any, evaluation: Doc<"harnessPrChecks">, actorId: string) {
  const existing = await ctx.db.query("factoryReleases")
    .withIndex("by_pr_evaluation", (q: any) => q.eq("prEvaluationId", evaluation._id))
    .first();
  if (existing) return { created: false as const, release: existing };
  const mergeIdentityIssue = factoryReleaseMergeIdentityIssue({
    prState: evaluation.prState,
    verifiedLineage: isVerifiedPrLineage(evaluation),
    projectId: evaluation.projectId,
    workOrderId: evaluation.workOrderId,
    workflowRunId: evaluation.workflowRunId,
    sourceHeadSha: evaluation.headSha,
    mergeCommitSha: evaluation.mergeCommitSha,
    mergedAt: evaluation.mergedAt,
  });
  if (mergeIdentityIssue) return { created: false as const, reason: mergeIdentityIssue };
  const sourceHeadSha = normalizeCommitSha(evaluation.headSha ?? "");
  const mergeCommitSha = normalizeCommitSha(evaluation.mergeCommitSha ?? "");
  if (!sourceHeadSha || !mergeCommitSha || !evaluation.mergedAt || !evaluation.projectId || !evaluation.workOrderId || !evaluation.workflowRunId) {
    return { created: false as const, reason: "trusted-merge-evidence-missing" };
  }
  const [workOrder, workflowRun] = await Promise.all([
    ctx.db.get(evaluation.workOrderId),
    ctx.db.get(evaluation.workflowRunId),
  ]);
  if (!workOrder || !workflowRun) {
    return { created: false as const, reason: "lineage-scope-mismatch" };
  }
  const repositoryId = workflowRun.repositoryId ?? workOrder.repositoryId;
  if (!repositoryId) return { created: false as const, reason: "repository-binding-missing" };
  const repository = await ctx.db.get(repositoryId);
  if (!repository) return { created: false as const, reason: "repository-binding-mismatch" };
  const factoryVersion = workflowRun.factoryDefinitionVersionId
    ? await ctx.db.get(workflowRun.factoryDefinitionVersionId)
    : null;
  const environmentId = workflowRun.environmentId ?? factoryVersion?.environmentId;
  if (!environmentId) return { created: false as const, reason: "staging-environment-missing" };
  const environment = await ctx.db.get(environmentId);
  if (!environment) return { created: false as const, reason: "staging-environment-invalid" };
  const boundLineageIssue = factoryReleaseBoundLineageIssue({
    evaluationProjectId: String(evaluation.projectId),
    workOrderId: String(workOrder._id),
    workOrderProjectId: workOrder.projectId ? String(workOrder.projectId) : undefined,
    workflowWorkOrderId: workflowRun.workOrderId ? String(workflowRun.workOrderId) : undefined,
    workflowProjectId: workflowRun.projectId ? String(workflowRun.projectId) : undefined,
    sourceHeadSha,
    workflowHeadSha: workflowRun.headSha,
    repositoryProjectId: repository.projectId ? String(repository.projectId) : undefined,
    repositoryName: canonicalRepositoryKey(repository.repository),
    evaluationRepositoryName: canonicalRepositoryKey(evaluation.repoFullName),
    environmentType: environment.type,
    workOrderTenantId: workOrder.tenantId ? String(workOrder.tenantId) : undefined,
    environmentTenantId: environment.tenantId ? String(environment.tenantId) : undefined,
  });
  if (boundLineageIssue) return { created: false as const, reason: boundLineageIssue };
  const duplicateSha = await ctx.db.query("factoryReleases")
    .withIndex("by_merge_sha", (q: any) => q.eq("repositoryId", repositoryId).eq("mergeCommitSha", mergeCommitSha))
    .first();
  if (duplicateSha) {
    if (duplicateSha.workOrderId !== workOrder._id) {
      throw new Error("Merged commit is already bound to another Factory release.");
    }
    return { created: false as const, release: duplicateSha };
  }
  const now = Date.now();
  const releaseId = await ctx.db.insert("factoryReleases", {
    tenantId: workOrder.tenantId,
    projectId: evaluation.projectId,
    workOrderId: workOrder._id,
    workflowRunId: workflowRun._id,
    taskId: evaluation.taskId ?? workflowRun.parentTaskId,
    repositoryId,
    factoryDefinitionVersionId: workflowRun.factoryDefinitionVersionId,
    environmentId,
    prEvaluationId: evaluation._id,
    prUrl: evaluation.prUrl,
    prNumber: evaluation.prNumber,
    sourceHeadSha,
    mergeCommitSha,
    mergeActor: evaluation.mergeActor,
    mergedAt: evaluation.mergedAt,
    state: "MERGED",
    deploymentApprovalStatus: "PENDING",
    requiredHumanAction: `Approve exact merge ${mergeCommitSha.slice(0, 12)} for staging deployment.`,
    verificationAttemptCount: 0,
    createdAt: now,
    updatedAt: now,
  });
  const release = (await ctx.db.get(releaseId))!;
  await appendEvidence(ctx, release, {
    kind: "MERGE",
    status: "INFO",
    subjectSha: mergeCommitSha,
    providerRef: String(evaluation.prNumber ?? evaluation.prUrl),
    evidenceUrl: evaluation.prUrl,
    summary: `GitHub reported PR merged at ${mergeCommitSha}`,
    actorType: "SYSTEM",
    actorId,
    idempotencyKey: `factory-release:${releaseId}:merge:${mergeCommitSha}`,
    metadata: { sourceHeadSha, mergeActor: evaluation.mergeActor, mergedAt: evaluation.mergedAt },
  });
  await syncWorkOrder(ctx, release, {
    state: "AWAITING_APPROVAL",
    verificationStatus: "PENDING",
    requiredHumanAction: `Approve exact merge ${mergeCommitSha.slice(0, 12)} for staging deployment.`,
    summary: `GitHub merge ${mergeCommitSha.slice(0, 12)} entered the staging release gate`,
    actorType: "SYSTEM",
    actorId,
    idempotencyKey: `factory-release:${releaseId}:work-order:merged`,
  });
  return { created: true as const, release: await ctx.db.get(releaseId) };
}

async function requireRelease(ctx: any, releaseId: Id<"factoryReleases">): Promise<Doc<"factoryReleases">> {
  const release = await ctx.db.get(releaseId);
  if (!release) throw new Error("Factory release is unavailable or unauthorized.");
  return release;
}

async function appendEvidence(ctx: any, release: Doc<"factoryReleases">, input: {
  kind: Doc<"factoryReleaseEvidence">["kind"];
  status: Doc<"factoryReleaseEvidence">["status"];
  subjectSha: string;
  providerRef?: string;
  evidenceUrl?: string;
  httpStatus?: number;
  latencyMs?: number;
  contentDigest?: string;
  summary: string;
  actorType: "AGENT" | "HUMAN" | "SYSTEM";
  actorId?: string;
  idempotencyKey: string;
  metadata?: unknown;
}) {
  const existing = await ctx.db.query("factoryReleaseEvidence")
    .withIndex("by_idempotency", (q: any) => q.eq("idempotencyKey", input.idempotencyKey))
    .first();
  if (existing) {
    if (existing.releaseId !== release._id || existing.kind !== input.kind || existing.subjectSha !== input.subjectSha) {
      throw new Error("Factory release evidence idempotency conflict.");
    }
    return existing;
  }
  const id = await ctx.db.insert("factoryReleaseEvidence", {
    tenantId: release.tenantId,
    projectId: release.projectId,
    releaseId: release._id,
    ...input,
    createdAt: Date.now(),
  });
  return await ctx.db.get(id);
}

async function syncWorkOrder(ctx: any, release: Doc<"factoryReleases">, input: {
  state: Doc<"workOrders">["state"];
  verificationStatus: Doc<"workOrders">["verificationStatus"];
  blockingIssue?: string;
  requiredHumanAction?: string;
  summary: string;
  actorType: "HUMAN" | "SYSTEM";
  actorId: string;
  idempotencyKey: string;
}) {
  const existingEvent = await ctx.db.query("workOrderEvents")
    .withIndex("by_idempotency", (q: any) => q.eq("idempotencyKey", input.idempotencyKey))
    .first();
  if (existingEvent) return existingEvent;
  const workOrder = await ctx.db.get(release.workOrderId);
  if (!workOrder) throw new Error("Factory release WorkOrder no longer exists.");
  const now = Date.now();
  await ctx.db.patch(workOrder._id, {
    state: input.state,
    verificationStatus: input.verificationStatus,
    blockingIssue: input.blockingIssue,
    requiredHumanAction: input.requiredHumanAction,
    metadata: {
      ...(workOrder.metadata ?? {}),
      release: {
        releaseId: release._id,
        environmentId: release.environmentId,
        mergeCommitSha: release.mergeCommitSha,
      },
    },
    updatedAt: now,
  });
  return await ctx.db.insert("workOrderEvents", {
    tenantId: workOrder.tenantId,
    projectId: workOrder.projectId,
    workOrderId: workOrder._id,
    workflowRunId: release.workflowRunId,
    idempotencyKey: input.idempotencyKey,
    eventType: input.verificationStatus === "FAIL" ? "VERIFICATION_FAILED" : "STATE_SYNCED",
    fromState: workOrder.state,
    toState: input.state,
    actorType: input.actorType,
    actorId: input.actorId,
    summary: input.summary,
    timestamp: now,
    metadata: { releaseId: release._id, mergeCommitSha: release.mergeCommitSha },
  });
}

async function recordActivity(ctx: any, input: {
  projectId: Id<"projects">;
  actorType: "HUMAN" | "SYSTEM";
  actorId?: string;
  action: string;
  description: string;
  targetType: string;
  targetId: string;
  metadata?: unknown;
}) {
  return await ctx.db.insert("activities", input);
}

async function fetchEvidence(url: string): Promise<{
  ok: boolean;
  httpStatus?: number;
  latencyMs: number;
  contentDigest?: string;
  bodyText?: string;
  error?: string;
}> {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json, text/plain;q=0.9, */*;q=0.1" },
      redirect: "error",
      signal: controller.signal,
    });
    const body = await readBoundedResponse(response, MAX_EVIDENCE_BYTES);
    return {
      ok: response.ok,
      httpStatus: response.status,
      latencyMs: Date.now() - startedAt,
      contentDigest: await sha256(body),
      bodyText: new TextDecoder().decode(body),
      error: response.ok ? undefined : `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      ok: false,
      latencyMs: Date.now() - startedAt,
      error: controller.signal.aborted
        ? `Verification request timed out after ${FETCH_TIMEOUT_MS / 1_000} seconds.`
        : error instanceof Error
          ? error.message.slice(0, 300)
          : "Verification request failed.",
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function readBoundedResponse(response: Response, limit: number): Promise<Uint8Array> {
  const advertisedLength = Number(response.headers.get("content-length") ?? "0");
  if (advertisedLength > limit) throw new Error("Verification response exceeded the evidence size limit.");
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > limit) {
      await reader.cancel();
      throw new Error("Verification response exceeded the evidence size limit.");
    }
    chunks.push(value);
  }
  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.length;
  }
  return body;
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes).buffer);
  return `sha256=${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function validateRollbackEvidenceUrl(candidate: string, deploymentUrl?: string): string {
  if (!deploymentUrl) throw new Error("Rollback requires a recorded deployment URL.");
  let evidence: URL;
  let deployment: URL;
  try {
    evidence = new URL(candidate.trim());
    deployment = new URL(deploymentUrl);
  } catch {
    throw new Error("Rollback evidence URL is invalid.");
  }
  if (
    evidence.protocol !== deployment.protocol
    || evidence.origin !== deployment.origin
    || evidence.username
    || evidence.password
    || evidence.hash
  ) {
    throw new Error("Rollback evidence must use the approved staging origin without credentials.");
  }
  return evidence.toString();
}

function localVerificationAllowed(): boolean {
  return process.env.MC_ALLOW_LOCAL_RELEASE_VERIFICATION === "1";
}
