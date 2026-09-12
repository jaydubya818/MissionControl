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
  evaluateFactoryProductionEligibility,
  factoryReleaseAllowedOrigins,
  factoryReleaseBoundLineageIssue,
  factoryReleaseEvidenceReplayMatches,
  factoryReleaseMergeIdentityIssue,
  factoryProductionReleaseTransitionAllowed,
  factoryReleaseRedeploymentIssue,
  factoryReleaseTransitionAllowed,
  normalizeCommitSha,
  validateFactoryReleaseVerificationUrls,
  factoryReleaseVerificationHeaders,
  type FactoryReleaseCheckResult,
} from "../lib/factoryRelease";
import { isVerifiedPrLineage } from "../lib/harnessPrChecks";
import { canonicalRepositoryKey } from "../lib/workspaceRepositories";
import {
  FACTORY_PERMISSIONS,
  requireWorkspacePermission,
} from "../lib/companyAccess";
import { requireFactoryActionWithAudit } from "../lib/factoryActionAuthorization";
import { assertRepositoryPublicationAllowed } from "../lib/localRepositoryAdmission";

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

const productionVerificationResultValidator = v.object({
  kind: v.union(
    v.literal("PRODUCTION_PROVENANCE"),
    v.literal("PRODUCTION_SMOKE_TEST"),
    v.literal("PRODUCTION_HEALTH_CHECK"),
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

export const getProductionEligibility = query({
  args: {
    projectId: v.id("projects"),
    repositoryId: v.id("workspaceRepositories"),
    candidateMergeCommitSha: v.string(),
  },
  handler: async (ctx, args) => {
    await requireWorkspacePermission(ctx, args.projectId, FACTORY_PERMISSIONS.VIEW);
    const repository = await ctx.db.get(args.repositoryId);
    if (!repository || repository.projectId !== args.projectId || repository.status !== "READY") {
      throw new Error("Production eligibility requires a ready repository in this workspace.");
    }
    const releases = await ctx.db
      .query("factoryReleases")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    return evaluateFactoryProductionEligibility({
      candidateMergeCommitSha: args.candidateMergeCommitSha,
      releases: releases
        .filter((release) => release.repositoryId === repository._id)
        .map((release) => ({
          releaseId: String(release._id),
          mergeCommitSha: release.mergeCommitSha,
          state: release.state,
          verifiedAt: release.verifiedAt,
          blockingIssue: release.blockingIssue,
        })),
    });
  },
});

export const configureProductionVerification = mutation({
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
    if (!environment || environment.type !== "prod" || environment.tenantId !== access.project.tenantId) {
      throw new Error("Select a production environment in this workspace company.");
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
      allowLocalhost: false,
    });
    if ("reason" in validation) {
      throw new Error(`Production verification origin is unsafe (${validation.reason}).`);
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
      action: "FACTORY_PRODUCTION_ORIGIN_CONFIGURED",
      description: `Configured ${validation.origin} as the production verification origin`,
      targetType: "ENVIRONMENT",
      targetId: String(environment._id),
      metadata: { allowedOrigin: validation.origin },
    });
    return { environmentId: environment._id, allowedOrigin: validation.origin };
  },
});

export const approveProductionDeployment = mutation({
  args: {
    releaseId: v.id("factoryReleases"),
    productionEnvironmentId: v.id("environments"),
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
      throw new Error("Production approval must bind the exact staging-verified merge commit.");
    }
    if (release.state !== "VERIFIED") {
      throw new Error("Production approval requires exact verified staging evidence.");
    }
    const environment = await ctx.db.get(args.productionEnvironmentId);
    if (!environment || environment.type !== "prod" || environment.tenantId !== access.project.tenantId) {
      throw new Error("Production approval requires this workspace's production environment.");
    }
    const releases = await ctx.db.query("factoryReleases")
      .withIndex("by_project", (q) => q.eq("projectId", release.projectId))
      .collect();
    const eligibility = evaluateFactoryProductionEligibility({
      candidateMergeCommitSha: release.mergeCommitSha,
      releases: releases
        .filter((candidate) => candidate.repositoryId === release.repositoryId)
        .map((candidate) => ({
          releaseId: String(candidate._id),
          mergeCommitSha: candidate.mergeCommitSha,
          state: candidate.state,
          verifiedAt: candidate.verifiedAt,
          blockingIssue: candidate.blockingIssue,
        })),
    });
    if (!eligibility.eligible) {
      throw new Error(`Production approval blocked (${eligibility.blocker ?? "not-eligible"}).`);
    }
    const rationale = args.rationale.trim();
    if (rationale.length < 12) throw new Error("A production approval rationale is required.");
    if (release.productionApprovalStatus === "APPROVED") {
      if (release.productionApprovedBy !== access.actorId
        || release.productionApprovalRationale !== rationale
        || release.productionEnvironmentId !== environment._id) {
        throw new Error("Production approval is already recorded and immutable.");
      }
      return { approved: false as const, eligibility, release };
    }
    const now = Date.now();
    await ctx.db.patch(release._id, {
      productionEnvironmentId: environment._id,
      productionState: "ELIGIBLE",
      productionApprovalStatus: "APPROVED",
      productionApprovedBy: access.actorId,
      productionApprovedAt: now,
      productionApprovalRationale: rationale,
      productionVerificationAttemptCount: 0,
      productionBlockingIssue: undefined,
      productionRequiredHumanAction: "Create a staged production deployment without assigning live domains.",
      updatedAt: now,
    });
    await appendEvidence(ctx, release, {
      kind: "PRODUCTION_APPROVAL",
      status: "PASS",
      subjectSha: release.mergeCommitSha,
      summary: rationale,
      actorType: "HUMAN",
      actorId: access.actorId,
      idempotencyKey: `factory-release:${release._id}:production-approval:${release.mergeCommitSha}`,
      metadata: {
        productionEnvironmentId: environment._id,
        qualifyingReleaseIds: eligibility.qualifyingReleaseIds,
        verifiedReleaseCount: eligibility.verifiedReleaseCount,
      },
    });
    return { approved: true as const, eligibility, release: await ctx.db.get(release._id) };
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

/**
 * Bind a human-operated Codex attempt to its immutable staging source. This is
 * a bootstrap/manual execution lane: later GitHub ingestion must independently
 * report the same PR head before a release can be created.
 */
export const bindManualStagingAttempt = mutation({
  args: {
    workflowRunId: v.id("workflowRuns"),
    repositoryId: v.id("workspaceRepositories"),
    environmentId: v.id("environments"),
    headSha: v.string(),
    branch: v.string(),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.workflowRunId);
    if (!run?.projectId || !run.workOrderId) {
      throw new Error("Manual staging attempt must belong to a workspace WorkOrder.");
    }
    const access = await requireWorkspacePermission(
      ctx,
      run.projectId,
      FACTORY_PERMISSIONS.IMPROVE,
    );
    const [workOrder, repository, environment] = await Promise.all([
      ctx.db.get(run.workOrderId),
      ctx.db.get(args.repositoryId),
      ctx.db.get(args.environmentId),
    ]);
    if (!workOrder || workOrder.projectId !== run.projectId) {
      throw new Error("Manual staging attempt WorkOrder scope is invalid.");
    }
    if (!repository || repository.projectId !== run.projectId || repository.status !== "READY") {
      throw new Error("Manual staging attempt repository must be ready in this workspace.");
    }
    if (!workOrder.repository
      || canonicalRepositoryKey(repository.repository) !== canonicalRepositoryKey(workOrder.repository)) {
      throw new Error("Manual staging attempt repository does not match the WorkOrder.");
    }
    if (!environment || environment.type !== "staging"
      || (workOrder.tenantId && environment.tenantId !== workOrder.tenantId)) {
      throw new Error("Manual staging attempt requires this workspace's staging environment.");
    }
    const headSha = normalizeCommitSha(args.headSha);
    if (!headSha) throw new Error("Manual staging attempt requires a full Git commit SHA.");
    const branch = args.branch.trim();
    if (!branch || branch.length > 255) throw new Error("Manual staging attempt branch is invalid.");
    const existing = {
      repositoryId: run.repositoryId,
      environmentId: run.environmentId,
      headSha: normalizeCommitSha(run.headSha ?? ""),
      branch: run.branch,
    };
    if ((existing.repositoryId && existing.repositoryId !== repository._id)
      || (existing.environmentId && existing.environmentId !== environment._id)
      || (existing.headSha && existing.headSha !== headSha)
      || (existing.branch && existing.branch !== branch)) {
      throw new Error("Manual staging attempt source binding is already recorded and immutable.");
    }

    await ctx.db.patch(run._id, {
      repositoryId: repository._id,
      environmentId: environment._id,
      headSha,
      branch,
      metadata: {
        ...(run.metadata && typeof run.metadata === "object" ? run.metadata : {}),
        releaseQualification: {
          lane: "manual-codex",
          boundBy: access.actorId,
          boundAt: Date.now(),
        },
      },
    });
    await recordActivity(ctx, {
      projectId: run.projectId,
      actorType: "HUMAN",
      actorId: access.actorId,
      action: "FACTORY_MANUAL_STAGING_ATTEMPT_BOUND",
      description: `Bound manual Codex attempt ${run.runId} to ${headSha.slice(0, 12)}`,
      targetType: "WORKFLOW_RUN",
      targetId: String(run._id),
      metadata: {
        repositoryId: repository._id,
        environmentId: environment._id,
        headSha,
        branch,
      },
    });
    return { workflowRunId: run._id, repositoryId: repository._id, environmentId: environment._id, headSha, branch };
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
      deploymentAttemptCount: 1,
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

/**
 * Replace only the active provider receipt after an independently recorded
 * verification failure. Prior deployment and verification evidence stays
 * immutable; the new receipt must name a different provider deployment for
 * the same approved merge commit.
 */
export const recordStagingRedeployment = mutation({
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
      throw new Error("Redeployment receipt must name the same exact approved merge commit.");
    }
    const provider = args.provider.trim();
    const providerDeploymentId = args.providerDeploymentId.trim();
    if (!provider || provider.length > 80 || !providerDeploymentId || providerDeploymentId.length > 200) {
      throw new Error("Redeployment provider and provider deployment ID are required.");
    }
    const recoveryIssue = factoryReleaseRedeploymentIssue({
      state: release.state,
      verificationAttemptCount: release.verificationAttemptCount,
      blockingIssue: release.blockingIssue,
      currentProviderDeploymentId: release.providerDeploymentId,
      nextProviderDeploymentId: providerDeploymentId,
    });
    if (recoveryIssue) throw new Error(`Staging redeployment is blocked (${recoveryIssue}).`);
    const environment = await ctx.db.get(release.environmentId);
    if (!environment || environment.type !== "staging") {
      throw new Error("Factory release redeployment is staging-only.");
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
    if ("reason" in urls) throw new Error(`Redeployment verification URLs are unsafe (${urls.reason}).`);
    const priorProviderDeploymentId = release.providerDeploymentId!;
    const deploymentAttempt = (release.deploymentAttemptCount ?? 1) + 1;
    const summary = `${provider} reported recovery staging deployment ${providerDeploymentId}`;
    const evidenceMetadata = {
      origin: urls.origin,
      provider,
      provenanceUrl: urls.urls.provenanceUrl,
      smokeUrl: urls.urls.smokeUrl,
      healthUrl: urls.urls.healthUrl,
      replacesProviderDeploymentId: priorProviderDeploymentId,
      deploymentAttempt: String(deploymentAttempt),
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
        throw new Error("Redeployment idempotency key is bound to different evidence.");
      }
      return { recorded: false as const, release };
    }
    const now = Date.now();
    await ctx.db.patch(release._id, {
      deploymentProvider: provider,
      providerDeploymentId,
      deploymentAttemptCount: deploymentAttempt,
      ...urls.urls,
      redeployedAt: now,
      blockingIssue: undefined,
      requiredHumanAction: "Run independent provenance, smoke, and health verification for the recovery deployment.",
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
      blockingIssue: undefined,
      requiredHumanAction: "Run independent staging verification for the recovery deployment.",
      summary: `Recovery deployment ${providerDeploymentId} recorded for ${release.mergeCommitSha.slice(0, 12)}`,
      actorType: "HUMAN",
      actorId: access.actorId,
      idempotencyKey: `factory-release:${release._id}:work-order:redeployed:${deploymentAttempt}`,
    });
    return { recorded: true as const, release: await ctx.db.get(release._id) };
  },
});

export const recordProductionDeployment = mutation({
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
      throw new Error("Production deployment receipt must name the exact approved merge commit.");
    }
    if (release.productionState !== "ELIGIBLE"
      || !factoryProductionReleaseTransitionAllowed(release.productionState, "DEPLOYED")
      || release.productionApprovalStatus !== "APPROVED") {
      throw new Error("Fresh production approval and eligibility are required before deployment.");
    }
    const environment = release.productionEnvironmentId
      ? await ctx.db.get(release.productionEnvironmentId)
      : null;
    if (!environment || environment.type !== "prod") {
      throw new Error("Production deployment environment is unavailable.");
    }
    const urls = validateFactoryReleaseVerificationUrls({
      urls: {
        deploymentUrl: args.deploymentUrl,
        provenanceUrl: args.provenanceUrl,
        smokeUrl: args.smokeUrl,
        healthUrl: args.healthUrl,
      },
      allowedOrigins: factoryReleaseAllowedOrigins(environment.metadata),
      allowLocalhost: false,
    });
    if ("reason" in urls) throw new Error(`Production verification URLs are unsafe (${urls.reason}).`);
    const provider = args.provider.trim();
    const providerDeploymentId = args.providerDeploymentId.trim();
    if (!provider || !providerDeploymentId) {
      throw new Error("Production provider and deployment ID are required.");
    }
    const summary = `${provider} reported staged production deployment ${providerDeploymentId}`;
    const metadata = {
      origin: urls.origin,
      provider,
      provenanceUrl: urls.urls.provenanceUrl,
      smokeUrl: urls.urls.smokeUrl,
      healthUrl: urls.urls.healthUrl,
      domainAssignment: "disabled",
    };
    const duplicate = await ctx.db.query("factoryReleaseEvidence")
      .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", args.idempotencyKey))
      .first();
    if (duplicate) {
      if (duplicate.releaseId !== release._id || !factoryReleaseEvidenceReplayMatches(duplicate, {
        kind: "PRODUCTION_DEPLOYMENT",
        subjectSha: release.mergeCommitSha,
        providerRef: providerDeploymentId,
        evidenceUrl: urls.urls.deploymentUrl,
        summary,
        metadata,
      })) {
        throw new Error("Production deployment idempotency key is bound to different evidence.");
      }
      return { recorded: false as const, release };
    }
    const now = Date.now();
    await ctx.db.patch(release._id, {
      productionState: "DEPLOYED",
      productionDeploymentProvider: provider,
      productionProviderDeploymentId: providerDeploymentId,
      productionDeploymentUrl: urls.urls.deploymentUrl,
      productionProvenanceUrl: urls.urls.provenanceUrl,
      productionSmokeUrl: urls.urls.smokeUrl,
      productionHealthUrl: urls.urls.healthUrl,
      productionDeployedAt: now,
      productionBlockingIssue: undefined,
      productionRequiredHumanAction: "Run independent production provenance, smoke, and health verification before promotion.",
      updatedAt: now,
    });
    await appendEvidence(ctx, release, {
      kind: "PRODUCTION_DEPLOYMENT",
      status: "INFO",
      subjectSha: release.mergeCommitSha,
      providerRef: providerDeploymentId,
      evidenceUrl: urls.urls.deploymentUrl,
      summary,
      actorType: "HUMAN",
      actorId: access.actorId,
      idempotencyKey: args.idempotencyKey,
      metadata,
    });
    return { recorded: true as const, release: await ctx.db.get(release._id) };
  },
});

export const getProductionVerificationManifest = internalQuery({
  args: { releaseId: v.id("factoryReleases") },
  handler: async (ctx, args) => {
    const release = await ctx.db.get(args.releaseId);
    if (!release || release.productionState !== "DEPLOYED") {
      throw new Error("Only a staged production deployment can be verified.");
    }
    const environment = release.productionEnvironmentId
      ? await ctx.db.get(release.productionEnvironmentId)
      : null;
    if (!environment || environment.type !== "prod") {
      throw new Error("Production verification environment is unavailable.");
    }
    if (!release.productionProviderDeploymentId
      || !release.productionDeploymentUrl
      || !release.productionProvenanceUrl
      || !release.productionSmokeUrl
      || !release.productionHealthUrl) {
      throw new Error("Production deployment receipt is incomplete.");
    }
    const urls = validateFactoryReleaseVerificationUrls({
      urls: {
        deploymentUrl: release.productionDeploymentUrl,
        provenanceUrl: release.productionProvenanceUrl,
        smokeUrl: release.productionSmokeUrl,
        healthUrl: release.productionHealthUrl,
      },
      allowedOrigins: factoryReleaseAllowedOrigins(environment.metadata),
      allowLocalhost: false,
    });
    if ("reason" in urls) throw new Error(`Production verification URLs are unsafe (${urls.reason}).`);
    return {
      projectId: release.projectId,
      releaseId: release._id,
      mergeCommitSha: release.mergeCommitSha,
      providerDeploymentId: release.productionProviderDeploymentId,
      verificationAttemptCount: release.productionVerificationAttemptCount ?? 0,
      urls: urls.urls,
    };
  },
});

export const verifyProductionDeployment = action({
  args: { releaseId: v.id("factoryReleases") },
  handler: async (ctx, args): Promise<any> => {
    const manifest = await ctx.runQuery(internal.factory.releases.getProductionVerificationManifest, {
      releaseId: args.releaseId,
    });
    await requireFactoryActionWithAudit(ctx, {
      projectId: manifest.projectId,
      permission: FACTORY_PERMISSIONS.IMPROVE,
      operation: "FACTORY_PRODUCTION_VERIFY",
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
      expectedEnvironment: "production",
    });
    const checks = [
      {
        kind: "PRODUCTION_PROVENANCE" as const,
        passed: provenanceResponse.ok && !('reason' in provenanceResult),
        url: manifest.urls.provenanceUrl,
        httpStatus: provenanceResponse.httpStatus,
        latencyMs: provenanceResponse.latencyMs,
        contentDigest: provenanceResponse.contentDigest,
        summary: !provenanceResponse.ok
          ? provenanceResponse.error ?? "Production provenance request failed."
          : !('reason' in provenanceResult)
            ? "Production provenance matches the exact merge and staged deployment."
            : provenanceResult.reason,
      },
      {
        kind: "PRODUCTION_SMOKE_TEST" as const,
        passed: smokeResponse.ok,
        url: manifest.urls.smokeUrl,
        httpStatus: smokeResponse.httpStatus,
        latencyMs: smokeResponse.latencyMs,
        contentDigest: smokeResponse.contentDigest,
        summary: smokeResponse.ok ? "Production smoke endpoint passed." : smokeResponse.error ?? "Production smoke request failed.",
      },
      {
        kind: "PRODUCTION_HEALTH_CHECK" as const,
        passed: healthResponse.ok,
        url: manifest.urls.healthUrl,
        httpStatus: healthResponse.httpStatus,
        latencyMs: healthResponse.latencyMs,
        contentDigest: healthResponse.contentDigest,
        summary: healthResponse.ok ? "Production health endpoint passed." : healthResponse.error ?? "Production health request failed.",
      },
    ];
    const verified = checks.every((check) => check.passed);
    const reason = verified
      ? undefined
      : "reason" in provenanceResult
        ? provenanceResult.reason
        : `required-production-checks-failed:${checks.filter((check) => !check.passed).map((check) => check.kind).sort().join(",")}`;
    return await ctx.runMutation(internal.factory.releases.recordProductionVerificationInternal, {
      releaseId: args.releaseId,
      expectedVerificationAttemptCount: manifest.verificationAttemptCount,
      verified,
      reason,
      checks,
    });
  },
});

export const recordProductionVerificationInternal = internalMutation({
  args: {
    releaseId: v.id("factoryReleases"),
    expectedVerificationAttemptCount: v.number(),
    verified: v.boolean(),
    reason: v.optional(v.string()),
    checks: v.array(productionVerificationResultValidator),
  },
  handler: async (ctx, args) => {
    const release = await requireRelease(ctx, args.releaseId);
    if (release.productionState !== "DEPLOYED") {
      throw new Error("Only a staged production deployment can receive verification evidence.");
    }
    if ((release.productionVerificationAttemptCount ?? 0) !== args.expectedVerificationAttemptCount) {
      return { recorded: false as const, reason: "production-verification-attempt-superseded", release };
    }
    const attempt = args.expectedVerificationAttemptCount + 1;
    for (const check of args.checks) {
      await appendEvidence(ctx, release, {
        kind: check.kind,
        status: check.passed ? "PASS" : "FAIL",
        subjectSha: release.mergeCommitSha,
        providerRef: release.productionProviderDeploymentId,
        evidenceUrl: check.url,
        httpStatus: check.httpStatus,
        latencyMs: check.latencyMs,
        contentDigest: check.contentDigest,
        summary: check.summary,
        actorType: "SYSTEM",
        actorId: "system:production-verifier",
        idempotencyKey: `factory-release:${release._id}:production-verification:${attempt}:${check.kind}`,
      });
    }
    const now = Date.now();
    if (args.verified) {
      if (!factoryProductionReleaseTransitionAllowed(release.productionState, "VERIFIED")) {
        throw new Error("Production release cannot transition to verified.");
      }
      await ctx.db.patch(release._id, {
        productionState: "VERIFIED",
        productionVerifiedAt: now,
        productionVerificationAttemptCount: attempt,
        productionBlockingIssue: undefined,
        productionRequiredHumanAction: "Promote this exact staged deployment to the production domains and attach the provider receipt.",
        updatedAt: now,
      });
    } else {
      const reason = args.reason ?? "required production verification failed";
      await ctx.db.patch(release._id, {
        productionVerificationAttemptCount: attempt,
        productionBlockingIssue: reason,
        productionRequiredHumanAction: "Review failed production evidence or roll back without promotion.",
        updatedAt: now,
      });
    }
    return { recorded: true as const, verified: args.verified, release: await ctx.db.get(release._id) };
  },
});

export const recordProductionPromotion = mutation({
  args: {
    releaseId: v.id("factoryReleases"),
    providerDeploymentId: v.string(),
    providerPromotionId: v.string(),
    evidenceUrl: v.string(),
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
    if (!args.humanConfirmed) throw new Error("Explicit production promotion confirmation is required.");
    if (!release.productionProviderDeploymentId
      || args.providerDeploymentId.trim() !== release.productionProviderDeploymentId) {
      throw new Error("Promotion receipt must name the exact verified provider deployment.");
    }
    const providerPromotionId = args.providerPromotionId.trim();
    if (!providerPromotionId) throw new Error("Provider promotion ID is required.");
    const evidenceUrl = validateProviderEvidenceUrl(args.evidenceUrl);
    const summary = `Promoted verified production deployment ${release.productionProviderDeploymentId}`;
    const duplicate = await ctx.db.query("factoryReleaseEvidence")
      .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", args.idempotencyKey))
      .first();
    if (duplicate) {
      if (duplicate.releaseId !== release._id || !factoryReleaseEvidenceReplayMatches(duplicate, {
        kind: "PRODUCTION_PROMOTION",
        subjectSha: release.mergeCommitSha,
        providerRef: providerPromotionId,
        evidenceUrl,
        summary,
        metadata: { providerDeploymentId: release.productionProviderDeploymentId },
      })) {
        throw new Error("Production promotion idempotency key is bound to different evidence.");
      }
      return { recorded: false as const, release };
    }
    if (release.productionState !== "VERIFIED"
      || !factoryProductionReleaseTransitionAllowed(release.productionState, "PROMOTED")) {
      throw new Error("Only an independently verified production deployment can be promoted.");
    }
    const now = Date.now();
    await ctx.db.patch(release._id, {
      productionState: "PROMOTED",
      productionPromotedAt: now,
      productionPromotionProviderRef: providerPromotionId,
      productionPromotionUrl: evidenceUrl,
      productionBlockingIssue: undefined,
      productionRequiredHumanAction: undefined,
      updatedAt: now,
    });
    await appendEvidence(ctx, release, {
      kind: "PRODUCTION_PROMOTION",
      status: "PASS",
      subjectSha: release.mergeCommitSha,
      providerRef: providerPromotionId,
      evidenceUrl,
      summary,
      actorType: "HUMAN",
      actorId: access.actorId,
      idempotencyKey: args.idempotencyKey,
      metadata: { providerDeploymentId: release.productionProviderDeploymentId },
    });
    return { recorded: true as const, release: await ctx.db.get(release._id) };
  },
});

export const recordProductionRollback = mutation({
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
    if (!args.humanConfirmed) throw new Error("Explicit production rollback confirmation is required.");
    const restoredCommitSha = normalizeCommitSha(args.restoredCommitSha);
    if (!restoredCommitSha || restoredCommitSha === release.mergeCommitSha) {
      throw new Error("Production rollback must restore a different full commit SHA.");
    }
    const providerRollbackId = args.providerRollbackId.trim();
    const rationale = args.rationale.trim();
    if (!providerRollbackId || rationale.length < 8) {
      throw new Error("Production rollback provider receipt and rationale are required.");
    }
    const evidenceUrl = validateProviderEvidenceUrl(args.evidenceUrl);
    const duplicate = await ctx.db.query("factoryReleaseEvidence")
      .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", args.idempotencyKey))
      .first();
    if (duplicate) {
      if (duplicate.releaseId !== release._id || !factoryReleaseEvidenceReplayMatches(duplicate, {
        kind: "PRODUCTION_ROLLBACK",
        subjectSha: restoredCommitSha,
        providerRef: providerRollbackId,
        evidenceUrl,
        summary: rationale,
        metadata: { rolledBackProductionCommitSha: release.mergeCommitSha },
      })) {
        throw new Error("Production rollback idempotency key is bound to different evidence.");
      }
      return { recorded: false as const, release };
    }
    if (!release.productionState
      || !factoryProductionReleaseTransitionAllowed(release.productionState, "ROLLED_BACK")) {
      throw new Error("This production release cannot be rolled back from its current state.");
    }
    const now = Date.now();
    await ctx.db.patch(release._id, {
      productionState: "ROLLED_BACK",
      productionRolledBackAt: now,
      productionRestoredCommitSha: restoredCommitSha,
      productionRollbackProviderRef: providerRollbackId,
      productionBlockingIssue: `Production rolled back from ${release.mergeCommitSha.slice(0, 12)} to ${restoredCommitSha.slice(0, 12)}.`,
      productionRequiredHumanAction: "Open a corrective WorkOrder before another production release.",
      updatedAt: now,
    });
    await appendEvidence(ctx, release, {
      kind: "PRODUCTION_ROLLBACK",
      status: "INFO",
      subjectSha: restoredCommitSha,
      providerRef: providerRollbackId,
      evidenceUrl,
      summary: rationale,
      actorType: "HUMAN",
      actorId: access.actorId,
      idempotencyKey: args.idempotencyKey,
      metadata: { rolledBackProductionCommitSha: release.mergeCommitSha },
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
  if (existing) {
    assertRepositoryPublicationAllowed(await ctx.db.get(existing.repositoryId));
    return { created: false as const, release: existing };
  }
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
  assertRepositoryPublicationAllowed(repository);
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
  assertRepositoryPublicationAllowed(await ctx.db.get(release.repositoryId));
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
      headers: {
        Accept: "application/json, text/plain;q=0.9, */*;q=0.1",
        ...factoryReleaseVerificationHeaders(
          url,
          process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
        ),
      },
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

function validateProviderEvidenceUrl(candidate: string): string {
  let url: URL;
  try {
    url = new URL(candidate.trim());
  } catch {
    throw new Error("Provider evidence URL is invalid.");
  }
  const hostname = url.hostname.toLowerCase();
  if (url.protocol !== "https:"
    || url.username
    || url.password
    || url.hash
    || (hostname !== "vercel.com" && !hostname.endsWith(".vercel.com") && !hostname.endsWith(".vercel.app"))) {
    throw new Error("Provider evidence must use an approved Vercel HTTPS origin.");
  }
  return url.toString();
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
