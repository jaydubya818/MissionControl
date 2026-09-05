import { v } from "convex/values";
import { internalMutation, internalQuery, mutation } from "../_generated/server";
import { internal } from "../_generated/api";
import {
  activeLeaseMatches,
  deriveFactoryPublicationLineage,
  evaluateAttemptClaim,
  expiredFactoryLeaseIdIsReplay,
  factoryAttemptMutationIsAuthorized,
  factoryAttemptRequiresReplacementOnClaim,
  factoryAttemptSourceBindingMatches,
  factoryExecutorIdentity,
  factoryLeaseMatchesCurrentRegistration,
  frozenFactorySourceRevision,
  lostFactoryAttemptFailure,
  renewAttemptLease,
  validateFactoryPullRequestLineage,
} from "../lib/factoryAttempt";
import { countActiveFactoryWorkerLeases, factoryWorkerEligibility } from "../lib/factoryWorkerRuntime";
import { validFactoryExecutorBinding } from "../lib/factoryConfiguration";
import {
  PUBLICATION_SAFETY_WINDOW_MS,
  validatePublicationPermit,
  validatePublishContinuation,
} from "../lib/factoryHumanReview";
import { isApprovalUsable, latestApprovalByType, requiredApprovalTypes } from "../lib/workOrderGovernance";
import { approvalExpiresAt, DEFAULT_GOVERNANCE_POLICY, verificationValidUntil } from "../lib/workOrderRevision";
import { reconcileTerminalWorkflowSteps } from "../lib/workflowRunState";
import { recomputeVerificationPacket } from "../lib/verificationPersistence";
import {
  ensureAttemptTrace,
  finishAttemptTrace,
  recordRunEventObservation,
  recordTraceObservation,
} from "../lib/observabilityPersistence";
import {
  qualityGateEvidenceSetDigest,
  legacyQualityGateStateForVerdict,
  legacyQualityGateSubjectDigest,
} from "../lib/qualityGateDecision";
import { createGitVerificationSubject } from "@mission-control/workflow-engine/verification-subject";
import {
  harnessRuntimeArtifactDigest,
  harnessRuntimeArtifactIssues,
} from "@mission-control/workflow-engine/harness-contract";
import { deriveVerificationIndependence } from "@mission-control/workflow-engine/verification-independence";
import { evaluateVerificationDecision } from "@mission-control/workflow-engine/verification-decision";
import {
  compilePolicyV2VerificationPlan,
  effectivePolicyV2VerificationChecks,
  normalizePolicyV2VerificationResults,
} from "../lib/policyV2Verification";
import { buildFactoryExecutionManifest, factorySandboxResourceName } from "../lib/executionManifest";
import { snapshotWorkflowDefinition } from "../lib/workflowSnapshot";
import { selectCurrentFactoryHost } from "../lib/factoryDispatch";
import {
  appendCurrentVerificationQualityGateDecision,
  getCurrentVerificationResult,
} from "../lib/currentVerification";
import { computeCanonicalHash } from "../lib/genomeHash";
import {
  factoryHarnessCapabilityRequirements,
  resolveFrozenHarnessBinding,
  resolveHarnessAdapterRuntimeArtifact,
} from "../lib/harnessCapabilities";
import {
  factoryWorkflowModelRouteMatches,
  frozenFactoryModelRouteEligible,
  resolveFactoryWorkflowModelRoute,
} from "../lib/factoryModelRoute";
import { exactModelRouteDigest, modelRouteQualificationDigest } from "../lib/modelRouteAdmission";
import { sandboxProfileProductionEligible } from "../lib/sandboxProfileAdmission";
import {
  evaluateRepositoryRemoteExecutionPolicy,
  normalizeRepositoryDataClassification,
} from "../lib/repositoryExecutionPolicy";
import {
  loadExecutionProfileAdmission,
  executionProfileScopeBlockers,
} from "../lib/executionProfileAdmission";
import { executionProfileProjectionBlockers } from "../lib/executionProfile";
import { COMPANY_PERMISSIONS, requireWorkspaceAccess } from "../lib/companyAccess";
import { assertAuthorizedDeliveryRecord } from "../lib/deliveryAuthorization";

const EVENT_TYPES = new Set([
  "RUN_STARTED", "STEP_STARTED", "STEP_COMPLETED", "TOOL_CALLED",
  "COMMAND_EXECUTED", "FILE_CHANGED", "ARTIFACT_CREATED", "CHECKPOINT_CREATED",
  "RETRY_STARTED", "RETRY_COMPLETED", "HUMAN_INTERVENTION_REQUESTED",
  "SPEC_VALIDATED", "RISK_CLASSIFIED", "CHANGE_BUDGET_ASSIGNED",
  "COMMAND_REQUESTED", "COMMAND_APPROVED", "COMMAND_DENIED", "CHANGE_BUDGET_EXCEEDED",
  "VERIFICATION_STARTED", "VERIFICATION_CHECK_STARTED", "VERIFICATION_CHECK_PASSED",
  "VERIFICATION_CHECK_FAILED", "VERIFICATION_ATTEMPT_DISPATCHED", "VERIFICATION_PLAN_CREATED",
  "VERIFICATION_SUBJECT_ATTESTED", "VERIFICATION_REQUIREMENT_PASSED", "VERIFICATION_REQUIREMENT_FAILED",
  "VERIFICATION_COMPLETED", "VERIFICATION_EXECUTION_FAILED", "VERIFICATION_BLOCKED",
  "VERIFICATION_REQUIRES_HUMAN_REVIEW", "EVIDENCE_CREATED", "INDEPENDENT_REVIEW_STARTED",
  "VERIFICATION_RECEIPT_CREATED", "CANDIDATE_READY", "PULL_REQUEST_CREATED",
  "SANDBOX_REQUESTED", "SANDBOX_ALLOCATED", "SANDBOX_STARTED", "SANDBOX_RESULT_RECEIVED",
  "SANDBOX_CANCELLATION_REQUESTED", "SANDBOX_CREDENTIAL_REVOKED", "SANDBOX_TERMINATION_REQUESTED",
  "SANDBOX_TERMINATED", "SANDBOX_ORPHANED", "ORPHAN_RECONCILED", "SANDBOX_FAILED",
  "RUN_PAUSED", "RUN_RESUMED", "RUN_FAILED", "RUN_COMPLETED",
]);

const ARTIFACT_TYPES = new Set([
  "CODE_DIFF", "TEST_OUTPUT", "BUILD_OUTPUT", "LOG_BUNDLE", "SCREENSHOT",
  "GENERATED_DOCUMENT", "VERIFICATION_EVIDENCE", "PULL_REQUEST", "CHECKPOINT",
  "STRUCTURED_OUTPUT", "AUTOMATION_DESIGN", "AUTOMATION_OUTPUT_SNAPSHOT", "OTHER",
]);

function factoryExecutionManifestBackend(manifest: any): string | undefined {
  return isDecomposedExecutionManifest(manifest)
    ? manifest.executionBackend
    : manifest?.harness?.executionBackend;
}

function factoryExecutionManifestModelRoute(manifest: any) {
  return isDecomposedExecutionManifest(manifest)
    ? manifest.modelRoute
    : manifest?.version === "factory-execution-manifest/v1"
      ? {
          catalogId: manifest.harness?.modelCatalogId,
          routeDigest: manifest.harness?.modelRouteDigest,
          routeSnapshot: manifest.harness?.modelRouteSnapshot,
          qualificationDigest: manifest.harness?.modelQualificationDigest,
        }
      : undefined;
}

function isDecomposedExecutionManifest(manifest: any) {
  return manifest?.version === "factory-execution-manifest/v2"
    || manifest?.version === "factory-execution-manifest/v3";
}

const EXECUTION_PROFILE_BINDING_FIELDS = [
  "executionProfileId",
  "executionProfileKey",
  "executionProfileVersion",
  "executionProfileDigest",
  "executionProfileSnapshot",
  "executionProfileQualificationDigest",
  "executionProfileQualificationSnapshot",
] as const;

function hasAnyExecutionProfileBinding(record: Record<string, any> | null | undefined) {
  return Boolean(record)
    && EXECUTION_PROFILE_BINDING_FIELDS.some((field) => record![field] !== undefined);
}

async function resolveCurrentAttemptExecutionProfile(
  ctx: any,
  version: any,
  run: any,
  manifest: any,
  now: number,
) {
  const profileFieldsPresent = [version, run].some(hasAnyExecutionProfileBinding)
    || manifest?.version === "factory-execution-manifest/v3"
    || manifest?.executionProfile !== undefined;
  if (!profileFieldsPresent) return null;
  if (!version.executionProfileId
    || !run.executionProfileId
    || manifest?.version !== "factory-execution-manifest/v3"
    || !manifest.executionProfile) {
    throw new Error("Factory Attempt is missing its exact Execution Profile binding.");
  }
  const admission = await loadExecutionProfileAdmission(ctx, version.executionProfileId, now);
  const profile = admission.profile;
  if (!profile || !admission.eligible || profile.projectId !== run.projectId
    || !profile.qualificationSnapshot || !profile.qualificationDigest) {
    throw new Error(`Factory Attempt Execution Profile is not current (${admission.blockers.join(",") || "missing"}).`);
  }
  const snapshot = profile.immutableSnapshot as Record<string, any>;
  const versionBlockers = executionProfileProjectionBlockers({
    profileId: String(profile._id),
    profileSnapshot: profile.immutableSnapshot,
    profileDigest: profile.profileDigest,
    qualificationSnapshot: profile.qualificationSnapshot,
    qualificationDigest: profile.qualificationDigest,
    projection: executionProfileProjectionFromFactoryVersion(version),
  });
  const runBlockers = executionProfileProjectionBlockers({
    profileId: String(profile._id),
    profileSnapshot: profile.immutableSnapshot,
    profileDigest: profile.profileDigest,
    qualificationSnapshot: profile.qualificationSnapshot,
    qualificationDigest: profile.qualificationDigest,
    projection: executionProfileProjectionFromAttempt(run, manifest),
  });
  const workloadClass = (version.purpose ?? "SOFTWARE") === "VERIFICATION"
    ? "VERIFICATION"
    : (version.purpose ?? "SOFTWARE") === "INTELLIGENT_AUTOMATION"
      ? "AUTOMATION"
      : "SOFTWARE_CHANGE";
  const scopeBlockers = executionProfileScopeBlockers(profile, {
    workloadClass,
    riskClass: version.riskBoundary,
    isolation: manifest.harness?.isolation,
  });
  const frozen = manifest.executionProfile;
  const manifestIdentityMatches = frozen.profileId === String(profile._id)
    && frozen.profileKey === profile.profileKey
    && frozen.version === profile.version
    && frozen.profileDigest === profile.profileDigest
    && frozen.qualificationDigest === profile.qualificationDigest;
  const blockers = [...new Set([...versionBlockers, ...runBlockers, ...scopeBlockers])];
  if (!manifestIdentityMatches || blockers.length > 0
    || snapshot.profileKey !== profile.profileKey || snapshot.version !== profile.version) {
    throw new Error(`Factory Attempt substituted its frozen Execution Profile (${blockers.join(",") || "identity-mismatch"}).`);
  }
  return profile;
}

function executionProfileProjectionFromFactoryVersion(version: any) {
  const snapshot = version.executionProfileSnapshot as Record<string, any> | undefined;
  return {
    profileId: String(version.executionProfileId ?? ""),
    profileKey: version.executionProfileKey ?? "",
    profileVersion: version.executionProfileVersion ?? 0,
    profileDigest: version.executionProfileDigest ?? "",
    profileSnapshot: version.executionProfileSnapshot,
    qualificationDigest: version.executionProfileQualificationDigest ?? "",
    qualificationSnapshot: version.executionProfileQualificationSnapshot,
    executor: version.executor,
    harnessCapabilityManifest: version.harnessCapabilityManifest,
    harnessCapabilityManifestDigest: version.harnessCapabilityManifestDigest ?? "",
    harnessEffectiveConfigSha256: version.harnessEffectiveConfigSha256 ?? "",
    harnessRuntimeArtifact: version.harnessRuntimeArtifact,
    harnessRuntimeArtifactDigest: version.harnessRuntimeArtifactDigest ?? "",
    executionBackend: version.executionBackend ?? "persistent-worker",
    modelCatalogId: String(version.modelCatalogId ?? ""),
    modelRouteSnapshot: version.modelRouteSnapshot,
    modelRouteDigest: version.modelRouteDigest ?? "",
    modelQualificationSnapshot: version.modelQualificationSnapshot,
    modelQualificationDigest: version.modelQualificationDigest ?? "",
    sandboxProfileId: version.sandboxProfileId ? String(version.sandboxProfileId) : undefined,
    sandboxProfileSnapshot: version.sandboxProfileSnapshot,
    sandboxProfileDigest: version.sandboxProfileDigest,
    isolationModes: snapshot?.isolationModes ?? [],
    requiredHarnessCapabilities: snapshot?.requiredHarnessCapabilities ?? [],
    requiredSandboxCapabilities: snapshot?.requiredSandboxCapabilities ?? [],
  };
}

function executionProfileProjectionFromAttempt(run: any, manifest: any) {
  const snapshot = run.executionProfileSnapshot as Record<string, any> | undefined;
  return {
    profileId: String(run.executionProfileId ?? ""),
    profileKey: run.executionProfileKey ?? "",
    profileVersion: run.executionProfileVersion ?? 0,
    profileDigest: run.executionProfileDigest ?? "",
    profileSnapshot: run.executionProfileSnapshot,
    qualificationDigest: run.executionProfileQualificationDigest ?? "",
    qualificationSnapshot: run.executionProfileQualificationSnapshot,
    executor: { adapter: run.executorAdapter ?? "", version: run.executorVersion ?? "" },
    harnessCapabilityManifest: manifest.harness?.capabilityManifest,
    harnessCapabilityManifestDigest: manifest.harness?.capabilityManifestSha256 ?? "",
    harnessEffectiveConfigSha256: manifest.harness?.effectiveConfigSha256 ?? "",
    harnessRuntimeArtifact: manifest.harness?.runtimeArtifact,
    harnessRuntimeArtifactDigest: manifest.harness?.runtimeArtifactDigest ?? "",
    executionBackend: manifest.executionBackend ?? manifest.harness?.executionBackend ?? "",
    modelCatalogId: manifest.modelRoute?.catalogId ?? manifest.harness?.modelCatalogId ?? "",
    modelRouteSnapshot: manifest.modelRoute?.routeSnapshot ?? manifest.harness?.modelRouteSnapshot,
    modelRouteDigest: manifest.modelRoute?.routeDigest ?? manifest.harness?.modelRouteDigest ?? "",
    modelQualificationSnapshot: manifest.modelRoute?.qualificationSnapshot,
    modelQualificationDigest: manifest.modelRoute?.qualificationDigest ?? manifest.harness?.modelQualificationDigest ?? "",
    sandboxProfileId: manifest.sandbox?.profileId,
    sandboxProfileSnapshot: manifest.sandbox?.profileSnapshot,
    sandboxProfileDigest: manifest.sandbox?.profileDigest,
    isolationModes: snapshot?.isolationModes ?? [],
    requiredHarnessCapabilities: snapshot?.requiredHarnessCapabilities ?? [],
    requiredSandboxCapabilities: snapshot?.requiredSandboxCapabilities ?? [],
  };
}

function executionProfileEvidence(run: any) {
  if (!run?.executionProfileId) return undefined;
  const profile = run.executionProfileSnapshot as Record<string, any> | undefined;
  const qualification = run.executionProfileQualificationSnapshot as Record<string, any> | undefined;
  const selectedIsolation = (run.executionManifest as Record<string, any> | undefined)?.harness?.isolation;
  return {
    profileId: String(run.executionProfileId),
    profileKey: run.executionProfileKey,
    version: run.executionProfileVersion,
    profileDigest: run.executionProfileDigest,
    qualificationDigest: run.executionProfileQualificationDigest,
    qualificationEvidence: qualification?.evidence,
    qualificationValidUntil: qualification?.validUntil,
    ...(profile?.harness ? {
      harness: {
        adapter: profile.harness.adapter,
        version: profile.harness.version,
        capabilityManifestDigest: profile.harness.capabilityManifestDigest,
        effectiveConfigSha256: profile.harness.effectiveConfigSha256,
      },
    } : {}),
    ...(profile?.runtimeArtifact?.digest ? { runtimeArtifactDigest: profile.runtimeArtifact.digest } : {}),
    ...(profile?.executionBackend ? { executionBackend: profile.executionBackend } : {}),
    ...(profile?.modelRoute ? {
      modelRoute: {
        catalogId: profile.modelRoute.catalogId,
        routeDigest: profile.modelRoute.routeDigest,
        qualificationDigest: profile.modelRoute.qualificationDigest,
      },
    } : {}),
    ...(profile?.sandboxProfile ? {
      sandboxProfile: {
        profileId: profile.sandboxProfile.profileId,
        profileDigest: profile.sandboxProfile.profileDigest,
      },
    } : {}),
    ...(profile?.toolGrant ? {
      toolGrant: {
        grantId: profile.toolGrant.grantId,
        grantDigest: profile.toolGrant.grantDigest,
        operation: profile.toolGrant.grantSnapshot?.operation,
        expiresAt: profile.toolGrant.grantSnapshot?.expiresAt,
        admission: "QUALIFICATION_FIXTURE",
      },
    } : { toolCapability: "NO_TOOL_CAPABILITY" }),
    ...(typeof selectedIsolation === "string" ? { selectedIsolation } : {}),
  };
}

function assertReportedExecutionProfileEvidence(metadata: any, expected: ReturnType<typeof executionProfileEvidence>) {
  if (metadata?.executionProfile === undefined) return;
  if (!expected
    || computeCanonicalHash(metadata.executionProfile) !== computeCanonicalHash(expected)) {
    throw new Error("Factory evidence Execution Profile identity does not match the frozen Attempt.");
  }
}

function factoryExecutionStepMatchesModelRoute(step: any, routeSnapshot: Record<string, any> | undefined) {
  if (!routeSnapshot
    || step?.modelConfiguration?.provider !== routeSnapshot.provider
    || step?.modelRoute !== routeSnapshot.modelId) {
    return false;
  }
  if (routeSnapshot.schema !== "factory-model-route/v2") return true;
  return step.modelConfiguration?.temperature === routeSnapshot.reasoningConfig?.temperature
    && step.modelConfiguration?.maxTokens === routeSnapshot.reasoningConfig?.maxTokens;
}
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

export const listSandboxReconcileCandidatesInternal = internalQuery({
  args: {
    projectId: v.id("projects"),
    repositoryId: v.id("workspaceRepositories"),
  },
  handler: async (ctx, args) => {
    const liveStates = [
      "REQUESTED", "ALLOCATING", "READY", "RUNNING", "RESULT_READY", "CANCELING",
      "TERMINATING", "FAILED", "ORPHANED",
    ] as const;
    const scoped = (await Promise.all(liveStates.map((state) => ctx.db.query("sandboxAllocations")
      .withIndex("by_project_state", (q) => q.eq("projectId", args.projectId).eq("state", state))
      .collect()))).flat();
    const now = Date.now();
    const candidates = [];
    for (const allocation of scoped) {
      const run = await ctx.db.get(allocation.workflowRunId);
      if (!run || run.repositoryId !== args.repositoryId) continue;
      const host = run.hostBindingId ? await ctx.db.get(run.hostBindingId) : null;
      const attemptLeaseCurrent = run.status === "RUNNING"
        && Boolean(run.lease && run.lease.expiresAt > now)
        && factoryLeaseMatchesCurrentRegistration(run.lease, host ?? undefined);
      if (attemptLeaseCurrent) continue;
      const credential = await ctx.db.query("sandboxCredentialGrants")
        .withIndex("by_allocation", (q) => q.eq("sandboxAllocationId", allocation._id))
        .filter((q) => q.neq(q.field("state"), "REVOKED"))
        .first();
      candidates.push({
        allocation,
        attemptLeaseCurrent,
        credential: credential ? {
          grantKey: credential.grantKey,
          provider: credential.provider,
          externalCredentialId: credential.externalCredentialId,
          environmentVariable: credential.environmentVariable,
          issuedAt: credential.issuedAt,
          expiresAt: credential.expiresAt,
          maxCostUsd: credential.maxCostUsd,
          secretFingerprint: credential.secretFingerprint,
        } : undefined,
      });
    }
    return candidates.slice(0, 100);
  },
});

export const markSandboxOrphansInternal = internalMutation({
  args: {
    projectId: v.id("projects"),
    repositoryId: v.id("workspaceRepositories"),
    allocationIds: v.array(v.id("sandboxAllocations")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    let marked = 0;
    for (const allocationId of args.allocationIds.slice(0, 100)) {
      const allocation = await ctx.db.get(allocationId);
      if (!allocation || allocation.projectId !== args.projectId || allocation.state === "TERMINATED") continue;
      const run = await ctx.db.get(allocation.workflowRunId);
      if (!run || run.repositoryId !== args.repositoryId) continue;
      const host = run.hostBindingId ? await ctx.db.get(run.hostBindingId) : null;
      const attemptLeaseCurrent = run.status === "RUNNING"
        && Boolean(run.lease && run.lease.expiresAt > now)
        && factoryLeaseMatchesCurrentRegistration(run.lease, host ?? undefined);
      if (attemptLeaseCurrent) continue;
      if (allocation.state !== "ORPHANED") {
        await ctx.db.patch(allocation._id, {
          state: "ORPHANED",
          failureReason: "The canonical Attempt lease or worker registration no longer owns this live sandbox.",
          updatedAt: now,
        });
        await insertEvent(ctx, run, {
          idempotencyKey: `factory:${run.runId}:sandbox:orphaned:${allocation.resourceName}`,
          eventType: "SANDBOX_ORPHANED",
          workflowStep: "remote-sandbox-execution",
          actor: "service:factory-control-plane",
          status: "FAILED",
          startedAt: now,
          endedAt: now,
          commandSummary: "Live sandbox marked orphaned after canonical ownership loss",
          metadata: { resourceName: allocation.resourceName, providerResourceId: allocation.providerResourceId, secretValuesIncluded: false },
        });
      }
      marked += 1;
    }
    return { marked };
  },
});

export const reportSandboxReconcileInternal = internalMutation({
  args: {
    workflowRunId: v.id("workflowRuns"),
    resourceName: v.string(),
    ownerId: v.string(),
    termination: v.any(),
    credentialRevocation: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.workflowRunId);
    if (!run || factoryExecutionManifestBackend(run.executionManifest) !== "remote-sandbox") {
      throw new Error("Remote Factory Attempt is unavailable for reconciliation.");
    }
    const host = run.hostBindingId ? await ctx.db.get(run.hostBindingId) : null;
    const attemptLeaseCurrent = run.status === "RUNNING"
      && Boolean(run.lease && run.lease.expiresAt > Date.now())
      && factoryLeaseMatchesCurrentRegistration(run.lease, host ?? undefined);
    if (attemptLeaseCurrent) throw new Error("A current canonical Attempt lease cannot be reconciled as an orphan.");
    const allocation = await ctx.db.query("sandboxAllocations")
      .withIndex("by_run", (q) => q.eq("workflowRunId", run._id))
      .filter((q) => q.eq(q.field("resourceName"), args.resourceName))
      .first();
    if (!allocation || allocation.state === "TERMINATED") return { reconciled: false as const, reason: "already-absent" };
    if (args.termination?.resourceName !== allocation.resourceName
      || args.termination?.providerResourceId !== allocation.providerResourceId
      || args.termination?.resourceAbsent !== true
      || !Number.isFinite(args.termination?.confirmedAbsentAt)) throw new Error("Orphan reconciliation lacks exact provider resource-absence evidence.");
    if (args.credentialRevocation) {
      const credential = await ctx.db.query("sandboxCredentialGrants")
        .withIndex("by_grant_key", (q) => q.eq("grantKey", args.credentialRevocation.grantKey))
        .first();
      if (!credential || credential.workflowRunId !== run._id
        || credential.externalCredentialId !== args.credentialRevocation.externalCredentialId
        || args.credentialRevocation.revoked !== true) throw new Error("Orphan credential revocation receipt is invalid.");
      await ctx.db.patch(credential._id, {
        state: "REVOKED",
        revocationRequestedAt: finiteNumber(args.credentialRevocation.requestedAt),
        revokedAt: finiteNumber(args.credentialRevocation.revokedAt) ?? Date.now(),
        updatedAt: Date.now(),
      });
    }
    const activeCredentials = await ctx.db.query("sandboxCredentialGrants")
      .withIndex("by_allocation", (q) => q.eq("sandboxAllocationId", allocation._id))
      .filter((q) => q.neq(q.field("state"), "REVOKED"))
      .collect();
    if (activeCredentials.length > 0) throw new Error("Orphan sandbox cannot close while a credential remains active.");
    await ctx.db.patch(allocation._id, {
      state: "TERMINATED",
      terminationRequestedAt: finiteNumber(args.termination.requestedAt),
      terminatedAt: args.termination.confirmedAbsentAt,
      resourceAbsentAt: args.termination.confirmedAbsentAt,
      teardownReceipt: args.termination,
      updatedAt: Date.now(),
    });
    await ctx.db.patch(run._id, { sandboxTeardownVerifiedAt: args.termination.confirmedAbsentAt });
    await insertEvent(ctx, run, {
      idempotencyKey: `factory:${run.runId}:sandbox:orphan-reconciled:${allocation.resourceName}`,
      eventType: "ORPHAN_RECONCILED",
      workflowStep: "remote-sandbox-execution",
      actor: `service:${args.ownerId}`,
      status: "COMPLETED",
      startedAt: Date.now(),
      endedAt: Date.now(),
      commandSummary: "Orphaned sandbox credentials and resource reconciled",
      metadata: { resourceName: allocation.resourceName, providerResourceId: allocation.providerResourceId, secretValuesIncluded: false },
    });
    return { reconciled: true as const, allocationId: allocation._id };
  },
});

export const claimInternal = internalMutation({
  args: {
    workflowRunId: v.id("workflowRuns"),
    leaseId: v.string(),
    ownerId: v.string(),
    leaseDurationMs: v.number(),
    requiredAttemptPurpose: v.optional(v.union(v.literal("IMPLEMENTATION"), v.literal("VERIFICATION"))),
    workerId: v.optional(v.string()),
    workerSessionId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const run = await ctx.db.get(args.workflowRunId);
    if (!run) throw new Error("Factory attempt not found.");
    if (args.requiredAttemptPurpose && (run.attemptPurpose ?? "IMPLEMENTATION") !== args.requiredAttemptPurpose) {
      throw new Error(`Attempt capability is not valid for ${run.attemptPurpose ?? "IMPLEMENTATION"}.`);
    }
    if (run.cancellationRequestedAt) {
      return { claimed: false as const, reason: "cancellation-requested", disposition: "CANCELLED" as const };
    }
    if (
      !run.projectId || !run.repositoryId || !run.workOrderId
      || !run.factoryDefinitionVersionId || !run.factoryConfigurationDigest
      || !run.hostBindingId || !run.branch || !run.worktree
      || !validFactoryExecutorBinding({ adapter: run.executorAdapter ?? "", version: run.executorVersion ?? "" })
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
    const frozenManifest = run.executionManifest as any;
    const executionBackend = version.executionBackend ?? "persistent-worker";
    const verificationSourceAttempt = run.attemptPurpose === "VERIFICATION"
      && run.verificationAttemptBinding?.sourceAttemptId
      ? await ctx.db.get(run.verificationAttemptBinding.sourceAttemptId)
      : null;
    const frozenHarness = resolveFrozenHarnessBinding(version);
    const adapterRuntimeArtifact = resolveHarnessAdapterRuntimeArtifact(version.executor);
    const manifestModelRoute = factoryExecutionManifestModelRoute(frozenManifest);
    const modelRoute = version.modelCatalogId ? await ctx.db.get(version.modelCatalogId) : null;
    const routeSnapshot = manifestModelRoute?.routeSnapshot as Record<string, any> | undefined;
    const executableSteps = (frozenManifest?.workflow?.steps ?? []).filter((step: any) => step?.kind !== "GATE");
    const decomposedManifest = isDecomposedExecutionManifest(frozenManifest);
    let manifestRouteDigestValid = false;
    let manifestQualificationDigestValid = !decomposedManifest;
    try {
      manifestRouteDigestValid = Boolean(
        routeSnapshot
        && exactModelRouteDigest(routeSnapshot) === manifestModelRoute?.routeDigest,
      );
      manifestQualificationDigestValid = !decomposedManifest || Boolean(
        manifestModelRoute?.qualificationSnapshot
        && modelRouteQualificationDigest(manifestModelRoute.qualificationSnapshot)
          === manifestModelRoute.qualificationDigest,
      );
    } catch {
      manifestRouteDigestValid = false;
      manifestQualificationDigestValid = false;
    }
    if ((!decomposedManifest && frozenManifest?.version !== "factory-execution-manifest/v1")
      || frozenManifest?.harness?.adapter !== run.executorAdapter
      || frozenManifest?.harness?.version !== run.executorVersion
      || frozenManifest?.harness?.capabilityManifestSha256 !== frozenHarness.capabilityManifestSha256
      || frozenManifest?.harness?.effectiveConfigSha256 !== frozenHarness.effectiveConfigSha256
      || (decomposedManifest && (
        frozenManifest?.harness?.runtimeArtifactDigest !== frozenHarness.runtimeArtifactSha256
        || harnessRuntimeArtifactIssues(frozenManifest?.harness?.runtimeArtifact).length > 0
        || harnessRuntimeArtifactDigest(frozenManifest.harness.runtimeArtifact)
          !== frozenManifest.harness.runtimeArtifactDigest
      ))
      || version.executor.adapter !== run.executorAdapter
      || version.executor.version !== run.executorVersion
      || !version.modelCatalogId
      || !modelRoute
      || manifestModelRoute?.catalogId !== String(version.modelCatalogId)
      || manifestModelRoute?.routeDigest !== version.modelRouteDigest
      || manifestModelRoute?.qualificationDigest !== version.modelQualificationDigest
      || !manifestRouteDigestValid
      || !manifestQualificationDigestValid
      || routeSnapshot?.provider !== (version.modelRouteSnapshot as any)?.provider
      || routeSnapshot?.modelId !== (version.modelRouteSnapshot as any)?.modelId
      || executableSteps.length < 1
      || executableSteps.some((step: any) => !factoryExecutionStepMatchesModelRoute(step, routeSnapshot))
      || !frozenFactoryModelRouteEligible({
        route: modelRoute,
        version,
        harness: frozenHarness,
        executionBackend,
      })
      || factoryExecutionManifestBackend(frozenManifest) !== executionBackend
      || !factoryAttemptSourceBindingMatches({
        attemptPurpose: run.attemptPurpose,
        manifestBaseSha: frozenManifest?.repository?.baseSha,
        hostBaseCommit: host?.baseCommit,
        repositoryId: run.repositoryId,
        workOrderId: run.workOrderId,
        workOrderRevisionNumber: run.workOrderRevisionNumber,
        verificationContractDigest: run.verificationContractDigest,
        branch: run.branch,
        verificationAttemptBinding: run.verificationAttemptBinding,
        verificationSourceAttempt,
      })) {
      throw new Error("Factory Attempt does not match its frozen backend and source binding.");
    }
    const executionProfile = await resolveCurrentAttemptExecutionProfile(
      ctx,
      version,
      run,
      frozenManifest,
      now,
    );
    if (executionBackend === "remote-sandbox") {
      if (!version.sandboxProfileId
        || !version.sandboxProfileDigest
        || frozenManifest.sandbox?.profileId !== String(version.sandboxProfileId)
        || frozenManifest.sandbox?.profileDigest !== version.sandboxProfileDigest
        || frozenManifest.sandbox?.supervisorVersion !== "mission-control-supervisor/v1"
        || !/^mc-attempt-[a-f0-9]{16}$/.test(frozenManifest.sandbox?.resourceName ?? "")
        || frozenManifest.sandbox?.resultContract?.schema !== "factory-sandbox-result/v1"
        || frozenManifest.sandbox?.resultContract?.independentHostValidationRequired !== true
        || frozenManifest.sandbox?.teardown?.credentialsRevokedBeforePublication !== true
        || frozenManifest.sandbox?.teardown?.resourceAbsenceRequiredBeforePublication !== true
        || frozenManifest.sandbox?.credentialGrants?.some((grant: any) => grant?.secretValueIncluded !== false
          || grant?.githubAuthority !== "NONE" || grant?.providerAuthority !== "NONE")) {
        throw new Error("Remote Factory Attempt exceeds sandbox authority or lacks its exact frozen Sandbox Profile.");
      }
    } else if (frozenManifest.sandbox) {
      throw new Error("Persistent-worker Attempt cannot contain a remote Sandbox Profile binding.");
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
    const repositoryDataClassification = normalizeRepositoryDataClassification(repository.dataClassification);
    if (repositoryDataClassification === "UNCLASSIFIED"
      || repositoryDataClassification !== (version.repositoryDataClassification ?? "UNCLASSIFIED")
      || frozenManifest.repository?.dataClassification !== repositoryDataClassification) {
      throw new Error("Factory attempt repository classification no longer matches its immutable Factory version.");
    }
    const remoteExecutionPolicy = evaluateRepositoryRemoteExecutionPolicy({
      executionBackend,
      repositoryDataClassification,
      sandboxProfileSnapshot: frozenManifest.sandbox?.profileSnapshot,
      dataBoundaryCount: workOrder.dataBoundaries?.length ?? 0,
    });
    if (!remoteExecutionPolicy.allowed) {
      throw new Error("Sensitive repository remote execution requires provider-enforced egress evidence.");
    }
    const frozenWorktree = (run.executionManifest as any).repository?.worktree;
    const checkoutPrefix = `${host?.checkoutRoot?.replace(/\/+$/, "")}/`;
    if (!host || host.status !== "READY" || host.dirty || frozenWorktree !== run.worktree || !run.worktree.startsWith(checkoutPrefix)) {
      throw new Error("Factory attempt host binding is no longer ready or does not own the frozen worktree.");
    }
    if (!installation || installation.status !== "CONNECTED" || installation.projectId !== run.projectId) {
      throw new Error("Factory attempt GitHub App installation is not connected.");
    }

    if (factoryAttemptRequiresReplacementOnClaim({
      status: run.status,
      lease: run.lease,
      continuationStatus: run.factoryContinuation?.status,
      now,
    })) {
      return await failLostAttempt(ctx, run, "The prior execution lease is missing or expired without a recoverable publication checkpoint.");
    }
    if (run.factoryContinuation?.status === "AWAITING_HUMAN_REVIEW") {
      return { claimed: false as const, reason: "human-review-pending" };
    }
    if (expiredFactoryLeaseIdIsReplay({ lease: run.lease, leaseId: args.leaseId, now })) {
      return { claimed: false as const, reason: "lease-id-replay" };
    }
    let worker: { workerId: string; sessionId: string; generation: number } | undefined;
    if (host.workerRuntime && !args.workerId && !args.workerSessionId) {
      return { claimed: false as const, reason: "worker-session-identity-required" };
    }
    if (args.workerId || args.workerSessionId) {
      if (!args.workerId || !args.workerSessionId || host.hostId !== args.workerId) {
        return { claimed: false as const, reason: "worker-identity-mismatch" };
      }
      // Every claim for every repository reads the same RUNNING index range.
      // Convex serializable transactions therefore retry concurrent phantoms,
      // while the stable worker ID makes capacity global across sessions.
      const runningAttempts = await ctx.db.query("workflowRuns")
        .withIndex("by_status", (q) => q.eq("status", "RUNNING"))
        .collect();
      const activeWorkerLeaseCount = countActiveFactoryWorkerLeases({
        runs: runningAttempts,
        workerId: args.workerId,
        now,
      });
      const manifest = run.executionManifest as any;
      const eligibility = factoryWorkerEligibility({
        worker: {
          workerId: host.hostId,
          status: host.status,
          dirty: host.dirty,
          capacity: host.capacity,
          workerRuntime: host.workerRuntime ? {
            ...host.workerRuntime,
            repositoryAccess: host.workerRuntime.repositoryAccess.map((item) => ({
              ...item,
              repositoryId: String(item.repositoryId),
            })),
            factoryVersionBindings: host.workerRuntime.factoryVersionBindings?.map((item) => ({
              ...item,
              factoryDefinitionVersionId: String(item.factoryDefinitionVersionId),
              repositoryId: String(item.repositoryId),
            })),
          } : undefined,
        },
        requirements: {
          repositoryId: String(repository._id),
          executor: {
            adapter: run.executorAdapter,
            version: run.executorVersion,
            capabilityManifestSha256: frozenHarness.capabilityManifestSha256,
            effectiveConfigSha256: frozenHarness.effectiveConfigSha256,
            runtimeArtifactSha256: adapterRuntimeArtifact.runtimeArtifactSha256,
            requireFactoryVersionRuntimeArtifactBinding: Boolean(version.harnessRuntimeArtifactDigest),
          },
          executionRuntimeArtifactSha256: frozenHarness.runtimeArtifactSha256,
          provider: routeSnapshot?.provider ?? null,
          model: routeSnapshot?.modelId ?? null,
          harnessCapabilities: manifest.harness?.requiredHarnessCapabilities ?? [],
          isolation: manifest.harness?.isolation,
          sandboxCapabilities: manifest.harness?.requiredCapabilities ?? [],
          executionBackend,
          factoryDefinitionVersionId: manifest.causation?.factoryDefinitionVersionId,
          factoryConfigurationDigest: manifest.causation?.factoryConfigurationDigest,
          modelRouteDigest: manifestModelRoute?.routeDigest,
          sandboxProfileDigest: manifest.sandbox?.profileDigest,
        },
        activeWorkerLeaseCount,
        now,
      });
      if (!eligibility.eligible || eligibility.sessionId !== args.workerSessionId) {
        return { claimed: false as const, reason: eligibility.eligible ? "worker-session-mismatch" : eligibility.reason };
      }
      worker = { workerId: eligibility.workerId, sessionId: eligibility.sessionId, generation: eligibility.generation };
    }
    const decision = evaluateAttemptClaim({
      status: run.status,
      lease: run.lease,
      leaseId: args.leaseId,
      ownerId: args.ownerId,
      worker,
      leaseDurationMs: args.leaseDurationMs,
      now,
    });
    if (!decision.ok) return { claimed: false as const, reason: decision.reason };

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
          isMutating: workOrder.isMutating,
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
    const claimedAt = now;
    await ctx.db.patch(run._id, {
      status: "RUNNING",
      lease: decision.lease,
      runtimeDisposition: decision.reclaimed ? "RECOVERABLE" : undefined,
      runtimeDispositionReason: decision.reclaimed ? "Immutable publication checkpoint reclaimed after lease expiry." : undefined,
      runtimeReconciledAt: decision.reclaimed ? now : undefined,
      executionPhase: publicationCheckpoint ? "PUBLISHING" : run.executionPhase,
      factoryContinuation: continuationPatch,
      executionClaimId: args.leaseId,
      executionClaimedBy: factoryExecutorIdentity({
        ownerId: args.ownerId,
        executorAdapter: run.executorAdapter,
        executorVersion: run.executorVersion,
        executorHostId: run.executorHostId!,
      }),
      executionClaimedAt: run.executionClaimedAt ?? claimedAt,
      executionHeartbeatAt: claimedAt,
      executionLeaseExpiresAt: decision.lease.expiresAt,
      executionAttemptNumber: Math.max(1, (run.executionAttemptNumber ?? 0) + (decision.reclaimed ? 0 : 1)),
      executionBindingDigest: run.executionManifestDigest,
      executorInvocationId: run.executorInvocationId ?? `${run.runId}:${args.leaseId}`,
    });
    if (run.attemptPurpose === "VERIFICATION") {
      const verificationRun = await ctx.db.query("verificationRuns")
        .withIndex("by_run", (q: any) => q.eq("workflowRunId", run._id))
        .first();
      if (!verificationRun?.verificationPlan || verificationRun.status !== "PLANNED") {
        throw new Error("Verification Attempt cannot start without its frozen PLANNED Verification Plan.");
      }
      await ctx.db.patch(verificationRun._id, { status: "RUNNING", startedAt: claimedAt });
    }
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
        workerId: decision.lease.workerId,
        workerSessionId: decision.lease.workerSessionId,
        workerGeneration: decision.lease.workerGeneration,
        executionManifestDigest: run.executionManifestDigest,
        executionProfile: executionProfileEvidence(run),
      },
    });
    const trace = await ensureAttemptTrace(ctx, run);
    await recordTraceObservation(ctx, trace, {
      idempotencyKey: `executor-selection:${run.runId}:${args.leaseId}`,
      type: "EVENT",
      name: "Executor selected",
      startedAt: Date.now(),
      endedAt: Date.now(),
      status: "SUCCESS",
      input: {
        adapter: run.executorAdapter,
        version: run.executorVersion,
        provider: routeSnapshot?.provider,
        model: routeSnapshot?.modelId,
        environment: run.executionEnvironment,
        allowedTools: run.allowedTools,
        executionManifestDigest: run.executionManifestDigest,
        executionProfile: executionProfileEvidence(run),
      },
      output: {
        ownerId: args.ownerId,
        leaseId: args.leaseId,
        workerId: decision.lease.workerId,
        workerSessionId: decision.lease.workerSessionId,
        workerGeneration: decision.lease.workerGeneration,
      },
      metadata: { configurationSnapshot: true, secretValuesIncluded: false },
    });
    return {
      claimed: true as const,
      reclaimed: decision.reclaimed,
      previousLease: decision.reclaimed ? run.lease : undefined,
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
      model: routeSnapshot?.modelId,
      executorAdapter: run.executorAdapter,
      executorVersion: run.executorVersion,
      executionManifest: run.executionManifest,
      executionManifestDigest: run.executionManifestDigest,
      executionProfile: executionProfile ? executionProfileEvidence(run) : undefined,
      publicationCheckpoint,
      attemptPurpose: run.attemptPurpose ?? "IMPLEMENTATION",
      verificationSubject: run.verificationAttemptBinding?.verificationSubject,
      verificationPlan: run.attemptPurpose === "VERIFICATION"
        ? (await ctx.db.query("verificationRuns").withIndex("by_run", (q: any) => q.eq("workflowRunId", run._id)).first())?.verificationPlan
        : undefined,
      sourceWorktree: run.attemptPurpose === "VERIFICATION" && run.verificationAttemptBinding?.sourceAttemptId
        ? verificationSourceAttempt?.worktree
        : undefined,
      sourceRevision: verificationSourceAttempt?.executionBaseSha,
    };
  },
});

export const authorizePublicationInternal = internalMutation({
  args: {
    workflowRunId: v.id("workflowRuns"),
    leaseId: v.string(),
    ownerId: v.string(),
    candidateRevision: v.string(),
    workerId: v.optional(v.string()),
    workerSessionId: v.optional(v.string()),
    workerGeneration: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const run = await ctx.db.get(args.workflowRunId);
    if (!run || !factoryAttemptMutationIsAuthorized(run)
      || !activeLeaseMatches({
        lease: run.lease,
        leaseId: args.leaseId,
        ownerId: args.ownerId,
        worker: mutationWorkerIdentity(args),
        now,
      })
      || !await factoryLeaseRegistrationIsCurrent(ctx, run)) {
      throw new Error("Factory publication authorization requires the active matching lease.");
    }
    if (!run.workOrderId) throw new Error("Factory publication requires a WorkOrder-bound Attempt.");
    const workOrder = await ctx.db.get(run.workOrderId);
    if (!workOrder || workOrder.currentExecutionRunId !== run._id
      || workOrder.currentRevisionNumber !== run.workOrderRevisionNumber) {
      throw new Error("Factory publication WorkOrder authority changed before publication.");
    }
    if (workOrder.verificationContract?.schemaVersion === 2
      && workOrder.verificationContract.enforcementMode === "ENFORCED") {
      if ((run.attemptPurpose ?? "IMPLEMENTATION") !== "IMPLEMENTATION" || run.factoryContinuation) {
        throw new Error("Policy-v2 candidate publication requires a source Implementation Attempt without legacy verification continuation state.");
      }
      if (!/^[0-9a-f]{40,64}$/.test(args.candidateRevision)) {
        throw new Error("Policy-v2 candidate publication requires an exact lowercase candidate SHA.");
      }
      const publicationValidUntil = Math.min(run.lease?.expiresAt ?? now, now + 5 * 60_000);
      if (publicationValidUntil <= now + PUBLICATION_SAFETY_WINDOW_MS) {
        throw new Error("Candidate publication lease expires too soon for a safe draft pull-request write.");
      }
      const publicationPermitId = `factory-candidate-publication:${run.runId}:${args.leaseId}:${now}`;
      await insertEvent(ctx, run, {
        idempotencyKey: `${publicationPermitId}:event`,
        eventType: "COMMAND_APPROVED",
        workflowStep: "candidate-publication",
        actor: `service:${args.ownerId}`,
        status: "APPROVED",
        startedAt: now,
        commandSummary: `Draft candidate publication authorized for ${args.candidateRevision.slice(0, 12)}`,
        metadata: { publicationPermitId, candidateRevision: args.candidateRevision, validUntil: publicationValidUntil, policyVersion: 2 },
      });
      return { authorized: true as const, publicationPermitId, candidateRevision: args.candidateRevision, validUntil: publicationValidUntil };
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
      isMutating: workOrder.isMutating,
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
    requiredAttemptPurpose: v.optional(v.union(v.literal("IMPLEMENTATION"), v.literal("VERIFICATION"))),
    workerId: v.optional(v.string()),
    workerSessionId: v.optional(v.string()),
    workerGeneration: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.workflowRunId);
    if (run && args.requiredAttemptPurpose && (run.attemptPurpose ?? "IMPLEMENTATION") !== args.requiredAttemptPurpose) {
      return { renewed: false as const, reason: "attempt-purpose-mismatch" };
    }
    if (!run || !factoryAttemptMutationIsAuthorized(run)) {
      return { renewed: false as const, reason: run?.cancellationRequestedAt ? "cancellation-requested" : "attempt-not-running" };
    }
    if (!await factoryLeaseRegistrationIsCurrent(ctx, run)) {
      return { renewed: false as const, reason: "worker-registration-stale" };
    }
    const result = renewAttemptLease({
      lease: run.lease,
      leaseId: args.leaseId,
      ownerId: args.ownerId,
      worker: mutationWorkerIdentity(args),
      leaseDurationMs: args.leaseDurationMs,
      now: Date.now(),
    });
    if (!result.ok) return { renewed: false as const, reason: result.reason };
    await ctx.db.patch(run._id, {
      lease: result.lease,
      executionHeartbeatAt: result.lease.heartbeatAt,
      executionLeaseExpiresAt: result.lease.expiresAt,
    });
    return { renewed: true as const, lease: result.lease };
  },
});

export const reportInternal = internalMutation({
  args: {
    workflowRunId: v.id("workflowRuns"),
    leaseId: v.string(),
    ownerId: v.string(),
    workerId: v.optional(v.string()),
    workerSessionId: v.optional(v.string()),
    workerGeneration: v.optional(v.number()),
    packet: v.any(),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.workflowRunId);
    if (!run || (run.attemptPurpose ?? "IMPLEMENTATION") !== "IMPLEMENTATION" || !factoryAttemptMutationIsAuthorized(run)
      || !activeLeaseMatches({
        lease: run.lease,
        leaseId: args.leaseId,
        ownerId: args.ownerId,
        worker: mutationWorkerIdentity(args),
        now: Date.now(),
      })
      || !await factoryLeaseRegistrationIsCurrent(ctx, run)) {
      throw new Error("Factory attempt report requires the active matching lease.");
    }
    const packet = args.packet && typeof args.packet === "object" ? args.packet : {};
    const events = Array.isArray(packet.events) ? packet.events : [];
    const artifacts = Array.isArray(packet.artifacts) ? packet.artifacts : [];
    const observations = Array.isArray(packet.observations) ? packet.observations : [];
    if (events.length > 100 || artifacts.length > 20 || observations.length > 200) {
      throw new Error("Factory attempt report exceeds packet limits.");
    }
    const profileEvidence = executionProfileEvidence(run);
    for (const item of [...events, ...artifacts, ...observations]) {
      assertReportedExecutionProfileEvidence(item?.metadata, profileEvidence);
    }
    if (containsCredentialSecret(packet.sandbox) || containsCredentialSecret(packet.credential)) {
      throw new Error("Factory attempt reports must never contain plaintext sandbox credentials.");
    }
    const sandboxPersistence = await persistSandboxPacket(ctx, run, packet, args.leaseId);
    if (artifacts.filter((artifact: any) => artifact?.artifactType === "PULL_REQUEST").length > 1) {
      throw new Error("Factory attempt report may contain only one pull-request artifact.");
    }
    for (const artifact of artifacts) {
      if (artifact?.artifactType === "PULL_REQUEST") {
        await assertFactoryPullRequestArtifact(ctx, run, artifact, {
          headSha: run.factoryContinuation?.candidateRevision ?? artifact?.metadata?.headSha,
          sourceRevision: run.factoryContinuation?.sourceRevision,
        });
      }
    }

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

    const trace = await ensureAttemptTrace(ctx, run);
    const observationResults = [];
    for (const observation of observations) {
      if (!observation?.idempotencyKey || !observation?.type || !observation?.name) {
        throw new Error("Factory trace observation is invalid.");
      }
      observationResults.push(await recordTraceObservation(ctx, trace, {
        ...observation,
        metadata: {
          ...(observation.metadata ?? {}),
          ...(profileEvidence ? { executionProfile: profileEvidence } : {}),
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
        if (existing.workflowRunId !== run._id) {
          throw new Error("Factory artifact idempotency key is already bound to another Attempt.");
        }
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
        automationDesign: artifact.automationDesign,
        automationOutputSnapshot: artifact.automationOutputSnapshot,
        createdAt: Date.now(),
        metadata: {
          ...(artifact.metadata ?? {}),
          leaseId: args.leaseId,
          executionManifestDigest: run.executionManifestDigest,
          ...(profileEvidence ? { executionProfile: profileEvidence } : {}),
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

    const candidateReady = packet.candidateReady
      ? await persistPolicyV2CandidateReady(ctx, run, packet.candidateReady, artifactResults, args.ownerId, args.leaseId)
      : undefined;

    const verification = packet.verification
      ? await persistVerificationPacket(ctx, run, packet.verification, args.ownerId, args.leaseId)
      : undefined;

    const terminal = packet.terminal;
    if (terminal) {
      if (!["COMPLETED", "FAILED", "CANCELED"].includes(terminal.status)) {
        throw new Error("Factory attempt terminal status is invalid.");
      }
      if (factoryExecutionManifestBackend(run.executionManifest) === "remote-sandbox") {
        const remoteFailure = terminal.status === "COMPLETED"
          ? undefined
          : normalizeRemoteFailure(terminal.remoteFailure);
        if (terminal.status === "COMPLETED" && terminal.remoteFailure !== undefined) {
          throw new Error("A completed remote Attempt cannot carry a failure classification.");
        }
        if (terminal.status !== "COMPLETED" && !remoteFailure) {
          throw new Error("A failed remote Attempt requires a typed fail-closed classification.");
        }
        const allocation = await ctx.db.query("sandboxAllocations")
          .withIndex("by_run", (q) => q.eq("workflowRunId", run._id))
          .order("desc")
          .first();
        const credentials = await ctx.db.query("sandboxCredentialGrants")
          .withIndex("by_run", (q) => q.eq("workflowRunId", run._id))
          .collect();
        const currentRun = await ctx.db.get(run._id);
        if (credentials.some((credential) => credential.state !== "REVOKED")) {
          throw new Error("Remote Factory Attempt cannot become terminal while an Attempt credential remains active.");
        }
        if (!allocation || allocation.state !== "TERMINATED" || !allocation.resourceAbsentAt || !currentRun?.sandboxTeardownVerifiedAt) {
          throw new Error("Remote Factory Attempt cannot become terminal without exact sandbox resource-absence proof.");
        }
        if (terminal.status === "COMPLETED" && (!allocation.resultDigest || !currentRun.sandboxResultDigest)) {
          throw new Error("Remote Factory Attempt cannot complete without a validated sandbox result digest.");
        }
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
      if (pullRequestArtifact) {
        await assertFactoryPullRequestArtifact(ctx, run, pullRequestArtifact, {
          headSha: exactGateReceipt?.candidateRevision
            ?? run.factoryContinuation?.candidateRevision
            ?? pullRequestArtifact.metadata?.headSha,
          sourceRevision: exactGateReceipt?.sourceRevision ?? run.factoryContinuation?.sourceRevision,
        });
      }
      if (terminal.status === "COMPLETED" && run.isMutating !== false) {
        if (!pullRequestArtifact) throw new Error("A mutating Factory attempt cannot complete without a pull-request artifact.");
      }
      if (terminal.status === "COMPLETED" && run.workOrderId) {
        const workOrder = await ctx.db.get(run.workOrderId);
        if (workOrder?.verificationContract?.enforcementMode === "ENFORCED") {
          if (workOrder.verificationContract.schemaVersion === 2) {
            const source = candidateReady?.run ?? await ctx.db.get(run._id);
            if ((source?.attemptPurpose ?? "IMPLEMENTATION") !== "IMPLEMENTATION"
              || !source?.candidateReadyAt || !source.verificationSubject) {
              throw new Error("An enforced policy-v2 source Attempt cannot complete before exact candidate publication and CANDIDATE_READY.");
            }
          } else {
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
      }
      const completedAt = Date.now();
      const publicationLineage = deriveFactoryPublicationLineage({
        pullRequestArtifact,
        codeDiffArtifact,
        verifiedSourceRevision: exactGateReceipt?.sourceRevision,
        completedAt: terminal.status === "COMPLETED" ? completedAt : undefined,
        expectedRepositoryIdentity: terminal.status === "COMPLETED" && run.repositoryId
          ? (await ctx.db.get(run.repositoryId))?.repository
          : undefined,
      });
      if (publicationLineage.patch.executionBaseSha !== undefined) {
        publicationLineage.patch.executionBaseSha = frozenFactorySourceRevision(run, publicationLineage.patch.executionBaseSha);
      }
      if (terminal.status === "COMPLETED" && run.isMutating !== false
        && (!publicationLineage.patch.headSha || !publicationLineage.patch.pullRequestUrl)) {
        throw new Error("A completed mutating Factory attempt requires durable pull-request head and URL lineage.");
      }
      const failureReason = optionalText(terminal.failureReason, 2_000);
      const remoteFailure = terminal.status === "COMPLETED"
        ? undefined
        : normalizeRemoteFailure(terminal.remoteFailure);
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
        failureClass: remoteFailure?.class,
        failureCode: remoteFailure?.code,
        failureStage: remoteFailure?.stage,
        retryable: remoteFailure?.retryable,
        steps,
        lease: undefined,
        executionPhase: "TERMINAL",
        runtimeDisposition: terminal.status === "CANCELED"
          ? "CANCELLED"
          : terminal.status === "FAILED"
            ? "FAILED"
            : undefined,
        runtimeDispositionReason: terminal.status === "COMPLETED" ? undefined : failureReason,
        runtimeReconciledAt: terminal.status === "COMPLETED" ? undefined : completedAt,
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
        metadata: {
          leaseId: args.leaseId,
          executionManifestDigest: run.executionManifestDigest,
          remoteFailureClass: remoteFailure?.class,
          remoteFailureCode: remoteFailure?.code,
          remoteFailureStage: remoteFailure?.stage,
          remoteRetryable: remoteFailure?.retryable,
        },
      });
      await finishAttemptTrace(ctx, run, {
        status: terminal.status,
        completedAt,
        failureReason,
        output: terminal.output,
      });
      if (run.workOrderId) {
        await ctx.runMutation(internal.workOrders.syncExecutionOutcome, {
          workflowRunId: run._id,
          eventType: terminal.status === "COMPLETED" ? "RUN_COMPLETED" : terminal.status === "CANCELED" ? "RUN_CANCELED" : "RUN_FAILED",
          summary: `Factory attempt ${run.runId} ${String(terminal.status).toLowerCase()}`,
        });
        if (terminal.status === "COMPLETED") {
          const completedRun = await ctx.db.get(run._id);
          const workOrder = await ctx.db.get(run.workOrderId);
          if (completedRun && workOrder?.verificationContract?.schemaVersion === 2
            && workOrder.verificationContract.enforcementMode === "ENFORCED"
            && completedRun.attemptPurpose === "IMPLEMENTATION") {
            try {
              await schedulePolicyV2VerificationAttempt(ctx, workOrder, completedRun);
            } catch (error) {
              const reason = `Independent verification dispatch is blocked: ${error instanceof Error ? error.message : String(error)}`;
              await ctx.db.patch(workOrder._id, {
                state: "AWAITING_VERIFICATION",
                currentExecutionRunId: undefined,
                verificationStatus: "PENDING",
                blockingIssue: reason,
                requiredHumanAction: "Configure and activate a current purpose-bound Verification Factory, then retry with a new bounded Attempt.",
                updatedAt: Date.now(),
              });
              await insertEvent(ctx, completedRun, {
                idempotencyKey: `verification-dispatch-blocked:${completedRun.runId}:${completedRun.verificationSubject?.digest}`,
                eventType: "VERIFICATION_BLOCKED",
                workflowStep: "independent-verification",
                actor: "service:factory-control-plane",
                status: "BLOCKED",
                startedAt: Date.now(),
                endedAt: Date.now(),
                errorSummary: reason,
                commandSummary: reason,
              });
            }
          }
        }
      }
    }
    return {
      accepted: true,
      eventCount: eventResults.length,
      observationCount: observationResults.length,
      artifactCount: artifactResults.length,
      verification,
      candidateReady,
      terminalStatus: terminal?.status,
      sandbox: sandboxPersistence,
    };
  },
});

export const reportVerificationInternal = internalMutation({
  args: {
    workflowRunId: v.id("workflowRuns"),
    leaseId: v.string(),
    ownerId: v.string(),
    workerId: v.optional(v.string()),
    workerSessionId: v.optional(v.string()),
    workerGeneration: v.optional(v.number()),
    packet: v.any(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const run = await ctx.db.get(args.workflowRunId);
    if (!run || run.attemptPurpose !== "VERIFICATION" || run.factoryPurpose !== "VERIFICATION"
      || !factoryAttemptMutationIsAuthorized(run)
      || !activeLeaseMatches({
        lease: run.lease,
        leaseId: args.leaseId,
        ownerId: args.ownerId,
        worker: mutationWorkerIdentity(args),
        now,
      })
      || !await factoryLeaseRegistrationIsCurrent(ctx, run)) {
      throw new Error("Verification report requires the active matching Verification Attempt lease.");
    }
    if (!run.workOrderId || !run.verificationAttemptBinding || !run.factoryDefinitionVersionId) {
      throw new Error("Verification Attempt is missing its exact subject binding.");
    }
    const [workOrder, sourceAttempt, verificationRun, factoryVersion] = await Promise.all([
      ctx.db.get(run.workOrderId),
      ctx.db.get(run.verificationAttemptBinding.sourceAttemptId),
      ctx.db.query("verificationRuns").withIndex("by_run", (q: any) => q.eq("workflowRunId", run._id)).first(),
      ctx.db.get(run.factoryDefinitionVersionId),
    ]);
    if (!workOrder || workOrder.verificationContract?.schemaVersion !== 2
      || workOrder.verificationContract.enforcementMode !== "ENFORCED"
      || !sourceAttempt || !verificationRun?.verificationPlan || !factoryVersion) {
      throw new Error("Verification report is not bound to a complete enforced policy-v2 contract.");
    }
    const profileEvidence = executionProfileEvidence(run);
    const terminal = args.packet?.terminal;
    if (!terminal || !["COMPLETED", "FAILED", "CANCELED"].includes(terminal.status)) {
      throw new Error("Verification report requires a terminal lifecycle status.");
    }
    if (terminal.status !== "COMPLETED") {
      const failureReason = optionalText(terminal.failureReason, 2_000) ?? `Verification execution ${String(terminal.status).toLowerCase()}.`;
      const subject = run.verificationAttemptBinding.verificationSubject;
      const candidateRevision = subject.kind === "GIT_CANDIDATE"
        ? subject.candidateSha
        : subject.outputSnapshotContentHash;
      const failureEvidenceId = await ctx.db.insert("evidenceEnvelopes", {
        tenantId: run.tenantId,
        projectId: run.projectId,
        missionId: run.missionId,
        workOrderId: workOrder._id,
        workflowRunId: run._id,
        verificationRunId: verificationRun._id,
        sourceAttemptId: sourceAttempt._id,
        verificationAttemptId: run._id,
        verificationSubjectId: verificationRun.verificationSubjectId,
        verificationSubjectDigest: verificationRun.verificationSubjectDigest,
        verificationContractDigest: verificationRun.verificationContractDigest,
        verificationPlanId: verificationRun.verificationPlanId,
        verificationPlanDigest: verificationRun.verificationPlanDigest,
        workOrderRevisionNumber: workOrder.currentRevisionNumber ?? 1,
        idempotencyKey: `policy-v2-verification-failure:${String(run._id)}:${terminal.status}`,
        evidenceKey: `verification-execution:${String(run._id)}:${terminal.status}`,
        checkId: "verification-execution",
        category: "POLICY_RESULT",
        result: "ERROR",
        summary: failureReason,
        acceptanceCriterionIds: [],
        requirementIds: [],
        requiredRiskIds: [],
        discoveredRiskIds: [],
        requiredEvidenceIds: [],
        producer: {
          actorType: "SERVICE",
          actorId: args.ownerId,
          role: "VERIFICATION_FACTORY",
          independent: false,
          factoryPurpose: "VERIFICATION",
          factoryDefinitionId: factoryVersion.factoryDefinitionId,
          factoryDefinitionVersionId: factoryVersion._id,
          attemptId: run._id,
          executorInvocationId: run.executorInvocationId,
          executorAdapter: run.executorAdapter,
        },
        artifactIds: [],
        artifactReferences: [],
        sourceRevision: sourceAttempt.executionBaseSha ?? "unknown",
        candidateRevision,
        provenance: "LIVE",
        recordedAt: now,
        metadata: {
          serverPersistedFailure: true,
          terminalStatus: terminal.status,
          ...(profileEvidence ? { executionProfile: profileEvidence } : {}),
        },
      });
      await ctx.db.patch(verificationRun._id, {
        status: terminal.status,
        failedAt: terminal.status === "FAILED" ? now : undefined,
        canceledAt: terminal.status === "CANCELED" ? now : undefined,
        completedAt: now,
        durationMs: Math.max(0, now - verificationRun.startedAt),
        verdict: undefined,
        verdictReasons: [failureReason],
      });
      await ctx.db.patch(run._id, {
        status: terminal.status,
        completedAt: now,
        failureReason,
        lease: undefined,
        executionPhase: "TERMINAL",
        steps: reconcileTerminalWorkflowSteps(run.steps, terminal.status, failureReason, now),
        metadata: { ...(run.metadata ?? {}), verificationSupersededAt: now },
      });
      await insertEvent(ctx, run, {
        idempotencyKey: `verification-terminal:${run.runId}:${terminal.status}`,
        eventType: "VERIFICATION_EXECUTION_FAILED",
        workflowStep: "independent-verification",
        actor: `service:${args.ownerId}`,
        status: terminal.status,
        startedAt: run.startedAt,
        endedAt: now,
        errorSummary: failureReason,
        commandSummary: failureReason,
        evidenceEnvelopeIds: [failureEvidenceId],
      });
      await finishAttemptTrace(ctx, run, { status: terminal.status, completedAt: now, failureReason });
      await ctx.runMutation(internal.workOrders.syncExecutionOutcome, {
        workflowRunId: run._id,
        eventType: terminal.status === "CANCELED" ? "RUN_CANCELED" : "RUN_FAILED",
        summary: failureReason,
      });
      return { accepted: true, terminalStatus: terminal.status, verdict: null };
    }
    const packet = args.packet.verification;
    const isolation = args.packet.isolation;
    if (!packet || !Array.isArray(packet.checks) || !isolation) {
      throw new Error("Completed Verification Attempt requires exact check evidence and an isolation attestation.");
    }
    const definition = await ctx.db.get(factoryVersion.factoryDefinitionId);
    if (!definition || definition.purpose !== "VERIFICATION") {
      throw new Error("Verification Attempt Factory definition is not purpose-bound to VERIFICATION.");
    }
    const expected = {
      workOrderId: String(workOrder._id),
      workOrderRevisionNumber: workOrder.currentRevisionNumber ?? 1,
      verificationContractDigest: workOrder.verificationContractDigest,
      sourceAttemptId: String(sourceAttempt._id),
      verificationSubjectDigest: run.verificationAttemptBinding.verificationSubjectDigest,
      verificationAttemptId: String(run._id),
      verificationRunId: String(verificationRun._id),
      verificationSubjectId: verificationRun.verificationSubjectId,
      verificationPlanId: verificationRun.verificationPlanId,
      verificationPlanDigest: verificationRun.verificationPlanDigest,
    };
    if (!expected.verificationContractDigest || !expected.verificationSubjectId
      || !expected.verificationPlanId || !expected.verificationPlanDigest) {
      throw new Error("Verification identity tuple is incomplete.");
    }
    const subjectCandidateRevision = run.verificationAttemptBinding.verificationSubject.kind === "GIT_CANDIDATE"
      ? run.verificationAttemptBinding.verificationSubject.candidateSha
      : run.verificationAttemptBinding.verificationSubject.outputSnapshotContentHash;
    if (packet.sourceRevision !== sourceAttempt.executionBaseSha
      || packet.candidateRevision !== subjectCandidateRevision) {
      throw new Error("Verification report candidate identity does not match the immutable Verification Subject.");
    }
    const independence = deriveVerificationIndependence({
      expected: expected as any,
      subject: run.verificationAttemptBinding.verificationSubject as any,
      sourceAttempt: {
        id: String(sourceAttempt._id),
        attemptPurpose: sourceAttempt.attemptPurpose,
        executorInvocationId: sourceAttempt.executorInvocationId,
        leaseId: sourceAttempt.executionClaimId,
        worktree: sourceAttempt.worktree,
      },
      verificationAttempt: {
        id: String(run._id),
        attemptPurpose: run.attemptPurpose,
        factoryPurpose: run.factoryPurpose,
        factoryDefinitionVersionId: String(run.factoryDefinitionVersionId),
        executorInvocationId: run.executorInvocationId,
        leaseId: run.executionClaimId,
        worktree: run.worktree,
        binding: {
          workOrderId: String(run.verificationAttemptBinding.workOrderId),
          workOrderRevisionNumber: run.verificationAttemptBinding.workOrderRevisionNumber,
          verificationContractDigest: run.verificationAttemptBinding.verificationContractDigest,
          sourceAttemptId: String(run.verificationAttemptBinding.sourceAttemptId),
          verificationSubjectDigest: run.verificationAttemptBinding.verificationSubjectDigest,
        },
      },
      factoryVersion: { id: String(factoryVersion._id), purpose: factoryVersion.purpose },
      verificationRun: {
        id: String(verificationRun._id),
        workflowRunId: String(verificationRun.workflowRunId),
        workOrderId: String(verificationRun.workOrderId),
        workOrderRevisionNumber: verificationRun.workOrderRevisionNumber,
        verificationContractDigest: verificationRun.verificationContractDigest,
        sourceAttemptId: String(verificationRun.sourceAttemptId),
        verificationSubjectDigest: verificationRun.verificationSubjectDigest,
        verificationSubjectId: verificationRun.verificationSubjectId,
        verificationPlanId: verificationRun.verificationPlanId,
        verificationPlanDigest: verificationRun.verificationPlanDigest,
      } as any,
      isolation,
      reportCapability: "verification:report",
      authorityStatus: verificationAuthorityStatusFromPacket(packet),
    });
    const plan = verificationRun.verificationPlan;
    const requiredEvidenceById = new Map(plan.requiredEvidence.map((item: any) => [item.id, item]));
    const evidenceInputs: any[] = [];
    const evidenceEnvelopeIds: any[] = [];
    const evidenceIdsByCheck = new Map<string, any[]>();
    const reportedCheckIds = new Set<string>();
    const reportedEvidenceKeys = new Set<string>();
    const checkSpecsById = new Map(effectivePolicyV2VerificationChecks(workOrder).map((check: any) => [check.id, check]));
    for (const check of packet.checks) {
      if (reportedCheckIds.has(check.checkId)) throw new Error(`Verifier reported duplicate check identity: ${check.checkId}`);
      if (!["PASS", "FAIL", "SKIPPED", "NOT_CONFIGURED", "ERROR"].includes(check.status)) {
        throw new Error(`Verifier reported an invalid status for ${check.checkId}.`);
      }
      reportedCheckIds.add(check.checkId);
      const required = requiredEvidenceById.get(check.checkId) as any;
      if (!required) throw new Error(`Verifier reported evidence outside the frozen Verification Plan: ${check.checkId}`);
      const checkSpec = checkSpecsById.get(check.checkId) as any;
      if (!checkSpec) throw new Error(`Verifier reported an unknown policy-v2 check: ${check.checkId}`);
      const evidenceCategory = checkSpec.evidenceCategory;
      const drafts = Array.isArray(check.evidence) && check.evidence.length > 0
        ? check.evidence
        : [{ evidenceKey: `${check.checkId}:missing`, category: evidenceCategory, result: check.status, summary: check.summary }];
      for (const draft of drafts) {
        assertReportedExecutionProfileEvidence(draft.metadata, profileEvidence);
        if (typeof draft.evidenceKey !== "string" || !draft.evidenceKey
          || reportedEvidenceKeys.has(draft.evidenceKey)) {
          throw new Error(`Verifier reported a missing or duplicate evidence identity for ${check.checkId}.`);
        }
        reportedEvidenceKeys.add(draft.evidenceKey);
        const idempotencyKey = `policy-v2-evidence:${String(run._id)}:${plan.planDigest}:${draft.evidenceKey}`;
        const existing = await ctx.db.query("evidenceEnvelopes").withIndex("by_idempotency", (q: any) => q.eq("idempotencyKey", idempotencyKey)).first();
        const evidenceId = existing?._id ?? await ctx.db.insert("evidenceEnvelopes", {
          tenantId: run.tenantId,
          projectId: run.projectId,
          missionId: run.missionId,
          workOrderId: workOrder._id,
          workflowRunId: run._id,
          verificationRunId: verificationRun._id,
          sourceAttemptId: sourceAttempt._id,
          verificationAttemptId: run._id,
          verificationSubjectId: verificationRun.verificationSubjectId,
          verificationSubjectDigest: verificationRun.verificationSubjectDigest,
          verificationContractDigest: verificationRun.verificationContractDigest,
          verificationPlanId: plan.planId,
          verificationPlanDigest: plan.planDigest,
          workOrderRevisionNumber: workOrder.currentRevisionNumber ?? 1,
          idempotencyKey,
          evidenceKey: draft.evidenceKey,
          checkId: check.checkId,
          category: evidenceCategory,
          result: check.status,
          summary: String(draft.summary ?? check.summary ?? "Verification evidence").slice(0, 2_000),
          acceptanceCriterionIds: checkSpec.acceptanceCriterionIds,
          primaryCriterionId: checkSpec.acceptanceCriterionIds[0],
          requirementIds: required.requirementIds,
          requiredRiskIds: required.requiredRiskIds,
          discoveredRiskIds: [],
          requiredEvidenceIds: [required.id],
          producer: {
            actorType: "SERVICE",
            actorId: args.ownerId,
            role: "VERIFICATION_FACTORY",
            independent: independence.passed,
            factoryPurpose: "VERIFICATION",
            factoryDefinitionId: definition._id,
            factoryDefinitionVersionId: factoryVersion._id,
            attemptId: run._id,
            executorInvocationId: run.executorInvocationId,
            executorAdapter: run.executorAdapter,
          },
          tool: checkSpec.command ? {
            name: String(checkSpec.verifierId),
            version: "v1",
            command: [checkSpec.command.executable, ...checkSpec.command.args],
            exitCode: check.status === "PASS" ? 0 : 1,
            durationMs: check.durationMs,
          } : undefined,
          independence: independence as any,
          artifactIds: [],
          artifactReferences: Array.isArray(draft.artifactReferences)
            ? draft.artifactReferences.filter((item: unknown) => typeof item === "string").slice(0, 100)
            : [],
          sourceRevision: sourceAttempt.executionBaseSha ?? packet.sourceRevision,
          candidateRevision: run.verificationAttemptBinding.verificationSubject.kind === "GIT_CANDIDATE"
            ? run.verificationAttemptBinding.verificationSubject.candidateSha
            : run.verificationAttemptBinding.verificationSubject.outputSnapshotContentHash,
          contentHash: draft.contentHash,
          provenance: "LIVE",
          recordedAt: now,
          metadata: {
            serverDerivedIndependence: true,
            verifierMetadata: draft.metadata,
            ...(profileEvidence ? { executionProfile: profileEvidence } : {}),
          },
        });
        evidenceEnvelopeIds.push(evidenceId);
        evidenceIdsByCheck.set(check.checkId, [...(evidenceIdsByCheck.get(check.checkId) ?? []), evidenceId]);
        evidenceInputs.push({
          id: String(evidenceId),
          requiredEvidenceIds: [required.id],
          requirementIds: required.requirementIds,
          requiredRiskIds: required.requiredRiskIds,
          discoveredRiskIds: [],
          conclusion: check.status === "PASS" ? "PASSED" : check.status === "FAIL" ? "FAILED" : check.status === "ERROR" ? "UNAVAILABLE" : "INCONCLUSIVE",
          usable: ["PASS", "FAIL"].includes(check.status),
          materializedRiskIds: [],
        });
      }
    }
    const normalizedResults = normalizePolicyV2VerificationResults({
      workOrder,
      plan,
      packetChecks: packet.checks,
      evidenceIdsByCheck,
    });
    const decision = evaluateVerificationDecision({
      plan,
      evidence: evidenceInputs,
      runStatus: "COMPLETED",
      independence: independence as any,
      requireHumanReview: workOrder.verificationContract.requireHumanReview,
      evaluatedAt: now,
    });
    await ctx.db.patch(verificationRun._id, {
      status: "COMPLETED",
      checks: normalizedResults.checks,
      criterionCoverage: normalizedResults.criterionCoverage,
      coverage: decision.coverage,
      requirementsPassed: decision.passedRequirementIds.length,
      requirementsFailed: decision.failedRequirementIds.length + decision.uncoveredRequirementIds.length,
      violations: [...decision.failedRequirementIds, ...decision.uncoveredRequirementIds, ...decision.uncoveredRiskIds],
      verdict: decision.verdict ?? undefined,
      verdictReasons: decision.reasons,
      independence: independence as any,
      independenceValid: independence.passed,
      decisionInputDigest: decision.decisionInputDigest,
      isolationAttestation: isolation,
      completedAt: now,
      durationMs: Math.max(0, now - verificationRun.startedAt),
      evaluatedAt: now,
    });
    const validUntil = verificationValidUntil(DEFAULT_GOVERNANCE_POLICY, now);
    const receiptId = await ctx.db.insert("verificationReceipts", {
      tenantId: run.tenantId,
      projectId: run.projectId,
      missionId: run.missionId,
      workOrderId: workOrder._id,
      receiptScope: "WORK_ORDER",
      workflowRunId: run._id,
      verificationRunId: verificationRun._id,
      sourceAttemptId: sourceAttempt._id,
      verificationAttemptId: run._id,
      verificationSubjectId: verificationRun.verificationSubjectId,
      verificationSubjectDigest: verificationRun.verificationSubjectDigest,
      verificationContractDigest: verificationRun.verificationContractDigest,
      verificationPlanId: plan.planId,
      verificationPlanDigest: plan.planDigest,
      workOrderRevisionNumber: workOrder.currentRevisionNumber ?? 1,
      idempotencyKey: `policy-v2-receipt:${String(verificationRun._id)}`,
      verificationMethod: "COMMAND",
      commandOrCheck: "Frozen policy-v2 Verification Plan",
      result: decision.reasons.join(" "),
      verifier: `service:${args.ownerId}`,
      status: decision.verdict === "VERIFIED" ? "PASSED" : "FAILED",
      evidenceEnvelopeIds,
      verdict: decision.verdict ?? undefined,
      independenceValid: independence.passed,
      decisionInputDigest: decision.decisionInputDigest,
      verdictReasons: decision.reasons,
      checks: normalizedResults.checks,
      criterionCoverage: normalizedResults.criterionCoverage,
      requirementsPassed: decision.passedRequirementIds.length,
      requirementsFailed: decision.failedRequirementIds.length + decision.uncoveredRequirementIds.length,
      violations: [...decision.failedRequirementIds, ...decision.uncoveredRequirementIds, ...decision.uncoveredRiskIds],
      approvalRequirements: workOrder.requiredApprovals,
      riskLevel: workOrder.riskLevel,
      riskReasons: workOrder.riskReasons,
      sourceRevision: sourceAttempt.executionBaseSha ?? packet.sourceRevision,
      candidateRevision: packet.candidateRevision,
      validUntil,
      recordedAt: now,
      metadata: {
        policyVersion: 2,
        serverDerivedIndependence: true,
        ...(profileEvidence ? { executionProfile: profileEvidence } : {}),
      },
    });
    for (const criterion of workOrder.acceptanceCriteria) {
      const criterionEvidence = normalizedResults.checks.filter((check: any) => check.acceptanceCriterionIds.includes(criterion.id));
      const coverage = normalizedResults.criterionCoverage.find((item: any) => item.criterionId === criterion.id);
      await ctx.db.insert("verificationReceipts", {
        tenantId: run.tenantId,
        projectId: run.projectId,
        missionId: run.missionId,
        workOrderId: workOrder._id,
        receiptScope: "ACCEPTANCE_CRITERION",
        acceptanceCriterionId: criterion.id,
        workflowRunId: run._id,
        verificationRunId: verificationRun._id,
        sourceAttemptId: sourceAttempt._id,
        verificationAttemptId: run._id,
        verificationSubjectId: verificationRun.verificationSubjectId,
        verificationSubjectDigest: verificationRun.verificationSubjectDigest,
        verificationContractDigest: verificationRun.verificationContractDigest,
        verificationPlanId: plan.planId,
        verificationPlanDigest: plan.planDigest,
        workOrderRevisionNumber: workOrder.currentRevisionNumber ?? 1,
        idempotencyKey: `policy-v2-criterion:${String(verificationRun._id)}:${criterion.id}`,
        verificationMethod: criterion.verificationMethod,
        commandOrCheck: criterionEvidence.map((check: any) => check.checkId).join(", "),
        result: decision.reasons.join(" "),
        verifier: `service:${args.ownerId}`,
        status: decision.verdict === "VERIFIED" && coverage?.status === "EVIDENCED" ? "PASSED" : "FAILED",
        evidenceEnvelopeIds: coverage?.evidenceIds ?? [],
        verdict: decision.verdict ?? undefined,
        independenceValid: independence.passed,
        decisionInputDigest: decision.decisionInputDigest,
        verdictReasons: decision.reasons,
        sourceRevision: sourceAttempt.executionBaseSha ?? packet.sourceRevision,
        candidateRevision: packet.candidateRevision,
        validUntil,
        recordedAt: now,
        metadata: {
          policyVersion: 2,
          workOrderReceiptId: receiptId,
          ...(profileEvidence ? { executionProfile: profileEvidence } : {}),
        },
      });
    }
    await ctx.db.patch(run._id, {
      status: "COMPLETED",
      completedAt: now,
      lease: undefined,
      executionPhase: "TERMINAL",
      verificationIsolationAttestation: isolation,
      steps: run.steps.map((step: any) => ({ ...step, status: step.status === "SKIPPED" ? "SKIPPED" : "DONE", completedAt: step.completedAt ?? now })),
      checkpointSummary: `${decision.verdict ?? "NO_VERDICT"}: ${decision.reasons.join(" ")}`,
      checkpointAt: now,
    });
    await insertEvent(ctx, run, {
      idempotencyKey: `verification-terminal:${run.runId}:COMPLETED`,
      eventType: decision.verdict === "VERIFIED" ? "VERIFICATION_COMPLETED" : decision.verdict === "REQUIRES_HUMAN_REVIEW" ? "VERIFICATION_REQUIRES_HUMAN_REVIEW" : "VERIFICATION_BLOCKED",
      workflowStep: "independent-verification",
      actor: `service:${args.ownerId}`,
      status: decision.verdict,
      startedAt: run.startedAt,
      endedAt: now,
      verificationRunId: verificationRun._id,
      verificationReceiptId: receiptId,
      evidenceEnvelopeIds,
      commandSummary: decision.reasons.join(" ").slice(0, 500),
      metadata: { verificationPlanId: plan.planId, verificationPlanDigest: plan.planDigest, independenceValid: independence.passed },
    });
    await finishAttemptTrace(ctx, run, { status: "COMPLETED", completedAt: now, output: { verdict: decision.verdict } });
    await ctx.runMutation(internal.workOrders.syncExecutionOutcome, {
      workflowRunId: run._id,
      eventType: "RUN_COMPLETED",
      summary: `Independent Verification Attempt ${run.runId} completed with ${decision.verdict}`,
    });
    const refreshedWorkOrder = await ctx.db.get(workOrder._id);
    if (refreshedWorkOrder) {
      const current = await getCurrentVerificationResult(ctx, refreshedWorkOrder, now);
      await appendCurrentVerificationQualityGateDecision(ctx, refreshedWorkOrder, current, `verification-result:${String(verificationRun._id)}`, now);
    }
    return {
      accepted: true,
      terminalStatus: "COMPLETED",
      verificationRunId: verificationRun._id,
      verificationReceiptId: receiptId,
      evidenceEnvelopeIds,
      verdict: decision.verdict,
      independenceValid: independence.passed,
    };
  },
});

async function persistPolicyV2CandidateReady(
  ctx: any,
  run: any,
  candidate: any,
  artifactResults: any[],
  ownerId: string,
  leaseId: string,
) {
  if (!run.workOrderId || (run.attemptPurpose ?? "IMPLEMENTATION") !== "IMPLEMENTATION") {
    throw new Error("CANDIDATE_READY requires a WorkOrder-bound Implementation Attempt.");
  }
  const [workOrder, repository] = await Promise.all([
    ctx.db.get(run.workOrderId),
    run.repositoryId ? ctx.db.get(run.repositoryId) : null,
  ]);
  if (!workOrder || workOrder.verificationContract?.schemaVersion !== 2
    || workOrder.verificationContract.enforcementMode !== "ENFORCED"
    || !workOrder.verificationContractDigest || !workOrder.qualityContractDigest) {
    throw new Error("CANDIDATE_READY requires an enforced policy-v2 WorkOrder with frozen contract digests.");
  }
  if (!repository?.providerRepositoryId || workOrder.currentRevisionNumber !== run.workOrderRevisionNumber
    || run.qualityContractDigest !== workOrder.qualityContractDigest
    || run.verificationContractDigest !== workOrder.verificationContractDigest) {
    throw new Error("Candidate publication lineage is stale for the WorkOrder or repository.");
  }
  const pullRequestArtifact = artifactResults.map((result: any) => result.artifact)
    .find((artifact: any) => artifact?.artifactType === "PULL_REQUEST")
    ?? await ctx.db.query("runArtifacts")
      .withIndex("by_run_type", (q: any) => q.eq("workflowRunId", run._id).eq("artifactType", "PULL_REQUEST"))
      .first();
  const metadata = pullRequestArtifact?.metadata ?? {};
  const sourceRevision = frozenFactorySourceRevision(run, metadata.sourceRevision);
  const exact = candidate
    && /^[0-9a-f]{40,64}$/.test(candidate.candidateSha)
    && /^[0-9a-f]{40,64}$/.test(candidate.treeSha)
    && typeof candidate.providerPullRequestId === "string" && candidate.providerPullRequestId
    && Number.isSafeInteger(candidate.pullRequestNumber) && candidate.pullRequestNumber > 0
    && typeof candidate.pullRequestUrl === "string" && candidate.pullRequestUrl
    && candidate.baseRef === repository.defaultBranch
    && candidate.headRef === run.branch
    && candidate.draftAtPublication === true
    && metadata.headSha === candidate.candidateSha
    && metadata.treeSha === candidate.treeSha
    && metadata.pullRequestNumber === candidate.pullRequestNumber
    && metadata.pullRequestUrl === candidate.pullRequestUrl
    && metadata.providerPullRequestId === candidate.providerPullRequestId
    && metadata.draftAtPublication === true;
  if (!exact) {
    throw new Error("CANDIDATE_READY requires one exact draft GitHub App pull-request artifact with matching commit and tree identity.");
  }
  const subject = createGitVerificationSubject({
    version: 1,
    kind: "GIT_CANDIDATE",
    workOrderId: workOrder._id,
    workOrderRevisionNumber: workOrder.currentRevisionNumber ?? 1,
    verificationContractDigest: workOrder.verificationContractDigest,
    sourceAttemptId: run._id,
    repositoryId: repository._id,
    provider: "GITHUB",
    providerRepositoryId: repository.providerRepositoryId,
    candidateSha: candidate.candidateSha,
    treeSha: candidate.treeSha,
    pullRequest: {
      providerPullRequestId: candidate.providerPullRequestId,
      number: candidate.pullRequestNumber,
      url: candidate.pullRequestUrl,
      baseRef: candidate.baseRef,
      headRef: candidate.headRef,
      headSha: candidate.candidateSha,
      draftAtPublication: true,
    },
  } as any);
  if (run.verificationSubject && run.verificationSubject.digest !== subject.digest) {
    throw new Error("CANDIDATE_READY cannot replace an immutable Verification Subject; create a new Attempt.");
  }
  const candidateReadyAt = run.candidateReadyAt ?? Date.now();
  await ctx.db.patch(run._id, {
    verificationSubject: subject,
    candidateReadyAt,
    executionBaseSha: sourceRevision,
    headSha: candidate.candidateSha,
    treeSha: candidate.treeSha,
    pullRequestNumber: candidate.pullRequestNumber,
    pullRequestId: candidate.providerPullRequestId,
    pullRequestProviderId: candidate.providerPullRequestId,
    pullRequestUrl: candidate.pullRequestUrl,
    pullRequestDraftAtPublication: true,
    publishedAt: candidateReadyAt,
  });
  await insertEvent(ctx, run, {
    idempotencyKey: `candidate-ready:${run.runId}:${subject.digest}`,
    eventType: "CANDIDATE_READY",
    workflowStep: "candidate-publication",
    actor: `service:${ownerId}`,
    status: "COMPLETED",
    startedAt: candidateReadyAt,
    endedAt: candidateReadyAt,
    commandSummary: `Immutable draft pull-request candidate ${candidate.candidateSha.slice(0, 12)} is ready for independent verification`,
    metadata: {
      leaseId,
      verificationSubjectId: subject.subjectId,
      verificationSubjectDigest: subject.digest,
      candidateSha: candidate.candidateSha,
      treeSha: candidate.treeSha,
      pullRequestNumber: candidate.pullRequestNumber,
    },
  });
  return { run: await ctx.db.get(run._id), subject };
}

export const retryVerification = mutation({
  args: {
    workOrderId: v.id("workOrders"),
    failedVerificationAttemptId: v.id("workflowRuns"),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const reason = args.reason.trim();
    if (reason.length < 10 || reason.length > 1_000) {
      throw new Error("Verification recovery requires a reason between 10 and 1,000 characters.");
    }
    const [workOrder, failedAttempt] = await Promise.all([
      ctx.db.get(args.workOrderId),
      ctx.db.get(args.failedVerificationAttemptId),
    ]);
    if (!workOrder || !workOrder.projectId || !workOrder.tenantId) {
      throw new Error("WorkOrder is unavailable or unauthorized.");
    }
    const access = await requireWorkspaceAccess(ctx, workOrder.tenantId, workOrder.projectId, {
      permission: COMPANY_PERMISSIONS.DISPATCH_WORK,
    });
    assertAuthorizedDeliveryRecord(access, workOrder);
    if (!failedAttempt
      || failedAttempt.workOrderId !== workOrder._id
      || failedAttempt.attemptPurpose !== "VERIFICATION"
      || !["FAILED", "CANCELED"].includes(failedAttempt.status)
      || !failedAttempt.metadata?.verificationSupersededAt
      || !failedAttempt.verificationAttemptBinding?.sourceAttemptId) {
      throw new Error("Only a terminal superseded Verification Attempt can be retried.");
    }
    const attempts = await ctx.db.query("workflowRuns")
      .withIndex("by_work_order_attempt_purpose", (q) => q.eq("workOrderId", workOrder._id).eq("attemptPurpose", "VERIFICATION"))
      .collect();
    const subjectDigest = failedAttempt.verificationAttemptBinding.verificationSubjectDigest;
    const existing = attempts.find((attempt) => attempt._id !== failedAttempt._id
      && attempt.verificationAttemptBinding?.verificationSubjectDigest === subjectDigest
      && !attempt.metadata?.verificationSupersededAt);
    if (existing) return { created: false as const, workflowRun: existing };
    const latest = [...attempts].sort((left, right) => right.startedAt - left.startedAt
      || String(right._id).localeCompare(String(left._id)))[0];
    if (latest?._id !== failedAttempt._id) {
      throw new Error("Verification recovery must reference the latest Attempt for this WorkOrder.");
    }
    const sourceAttempt = await ctx.db.get(failedAttempt.verificationAttemptBinding.sourceAttemptId);
    if (!sourceAttempt
      || sourceAttempt.workOrderId !== workOrder._id
      || sourceAttempt.status !== "COMPLETED"
      || sourceAttempt.attemptPurpose !== "IMPLEMENTATION"
      || sourceAttempt.workOrderRevisionNumber !== (workOrder.currentRevisionNumber ?? 1)
      || sourceAttempt.verificationSubject?.digest !== subjectDigest) {
      throw new Error("Verification recovery source is no longer the exact current candidate.");
    }
    const result = await schedulePolicyV2VerificationAttempt(ctx, workOrder, sourceAttempt);
    if (result.created) {
      const actorId = access.membership.operatorId
        ? String(access.membership.operatorId)
        : "demo:company-administrator";
      await ctx.db.patch(result.workflowRun._id, {
        metadata: {
          ...(result.workflowRun.metadata ?? {}),
          retryOfWorkflowRunId: failedAttempt._id,
          retryOfRunId: failedAttempt.runId,
          retryReason: reason,
          recoveryActorId: actorId,
        },
      });
      await insertEvent(ctx, result.workflowRun, {
        idempotencyKey: `verification-retry:${String(failedAttempt._id)}:${String(result.workflowRun._id)}`,
        eventType: "RETRY_STARTED",
        workflowStep: "independent-verification",
        actor: `human:${actorId}`,
        status: "PENDING",
        startedAt: Date.now(),
        commandSummary: reason,
        metadata: {
          retryOfWorkflowRunId: failedAttempt._id,
          retryOfRunId: failedAttempt.runId,
          verificationSubjectDigest: subjectDigest,
        },
      });
    }
    return result;
  },
});

async function schedulePolicyV2VerificationAttempt(ctx: any, workOrder: any, sourceAttempt: any) {
  const subject = sourceAttempt.verificationSubject;
  if (!subject || !sourceAttempt.candidateReadyAt || sourceAttempt.status !== "COMPLETED") {
    throw new Error("Verification scheduling requires a completed candidate-ready source Attempt.");
  }
  const existing = (await ctx.db.query("workflowRuns")
    .withIndex("by_work_order_attempt_purpose", (q: any) => q.eq("workOrderId", workOrder._id).eq("attemptPurpose", "VERIFICATION"))
    .collect())
    .find((attempt: any) => attempt.verificationAttemptBinding?.verificationSubjectDigest === subject.digest
      && !attempt.metadata?.verificationSupersededAt);
  if (existing) return { workflowRun: existing, created: false };
  const definitions = await ctx.db.query("factoryDefinitions")
    .withIndex("by_repository", (q: any) => q.eq("repositoryId", sourceAttempt.repositoryId))
    .collect();
  const definition = definitions.find((candidate: any) => candidate.status === "ACTIVE"
    && candidate.purpose === "VERIFICATION" && candidate.activeVersionId);
  if (!definition) throw new Error("Candidate is ready, but no active Verification Factory is configured for this repository.");
  const version = await ctx.db.get(definition.activeVersionId);
  if (!version || version.factoryDefinitionId !== definition._id || version.purpose !== "VERIFICATION") {
    throw new Error("Active Verification Factory version is unavailable or has the wrong purpose.");
  }
  const [repository, workflow, assessments, bindings, codeScopes, agentVersions, modelRoute, sandboxProfile] = await Promise.all([
    ctx.db.get(version.repositoryId),
    ctx.db.get(version.workflowId),
    ctx.db.query("factoryReadinessAssessments").withIndex("by_version", (q: any) => q.eq("factoryDefinitionVersionId", version._id)).collect(),
    ctx.db.query("workspaceHostBindings").withIndex("by_project", (q: any) => q.eq("projectId", version.projectId)).collect(),
    Promise.all((version.codeScopeIds ?? []).map((id: any) => ctx.db.get(id))),
    Promise.all((version.agentBindings ?? []).map((binding: any) => ctx.db.get(binding.agentVersionId))),
    version.modelCatalogId ? ctx.db.get(version.modelCatalogId) : null,
    version.sandboxProfileId ? ctx.db.get(version.sandboxProfileId) : null,
  ]);
  const now = Date.now();
  const verificationProfileFieldsPresent = hasAnyExecutionProfileBinding(version);
  const profileAdmission = version.executionProfileId
    ? await loadExecutionProfileAdmission(ctx, version.executionProfileId, now)
    : null;
  const executionProfile = profileAdmission?.profile ?? null;
  const executionProfileReady = !verificationProfileFieldsPresent || Boolean(
    executionProfile
    && profileAdmission?.eligible
    && executionProfile.projectId === version.projectId
    && executionProfileProjectionBlockers({
      profileId: String(executionProfile._id),
      profileSnapshot: executionProfile.immutableSnapshot,
      profileDigest: executionProfile.profileDigest,
      qualificationSnapshot: executionProfile.qualificationSnapshot,
      qualificationDigest: executionProfile.qualificationDigest!,
      projection: executionProfileProjectionFromFactoryVersion(version),
    }).length === 0
    && executionProfileScopeBlockers(executionProfile, {
      workloadClass: "VERIFICATION",
      riskClass: version.riskBoundary,
      isolation: "READ_ONLY",
    }).length === 0
  );
  const assessment = assessments.sort((left: any, right: any) => right.assessedAt - left.assessedAt)[0];
  const frozenHarness = resolveFrozenHarnessBinding(version);
  const adapterRuntimeArtifact = resolveHarnessAdapterRuntimeArtifact(version.executor);
  const executionBackend = version.executionBackend ?? "persistent-worker";
  const workflowModelRoute = (() => {
    try {
      return resolveFactoryWorkflowModelRoute({
        workflow,
        agentBindings: version.agentBindings ?? [],
        agentVersions,
      });
    } catch {
      return null;
    }
  })();
  const repositoryDataClassification = normalizeRepositoryDataClassification(repository?.dataClassification);
  const remoteExecutionPolicy = evaluateRepositoryRemoteExecutionPolicy({
    executionBackend,
    repositoryDataClassification,
    sandboxProfileSnapshot: sandboxProfile?.immutableSnapshot,
    dataBoundaryCount: workOrder.dataBoundaries?.length ?? 0,
  });
  const requiredSandboxCapabilities = executionBackend === "remote-sandbox"
    ? ["git-worktree", "read-only", "remote-sandbox", "sandbox-provider:exe-dev"]
    : ["git-worktree", "read-only"];
  const eligibleBindings = repository ? bindings.filter((binding: any) => factoryWorkerEligibility({
    worker: {
      workerId: binding.hostId,
      status: binding.status,
      dirty: binding.dirty,
      capacity: binding.capacity,
      workerRuntime: binding.workerRuntime ? {
        ...binding.workerRuntime,
        repositoryAccess: binding.workerRuntime.repositoryAccess.map((item: any) => ({ ...item, repositoryId: String(item.repositoryId) })),
        factoryVersionBindings: binding.workerRuntime.factoryVersionBindings?.map((item: any) => ({
          ...item,
          factoryDefinitionVersionId: String(item.factoryDefinitionVersionId),
          repositoryId: String(item.repositoryId),
        })),
      } : undefined,
    },
    requirements: {
      repositoryId: String(repository._id),
      executor: {
        adapter: frozenHarness.adapter,
        version: frozenHarness.version,
        capabilityManifestSha256: frozenHarness.capabilityManifestSha256,
        effectiveConfigSha256: frozenHarness.effectiveConfigSha256,
        runtimeArtifactSha256: adapterRuntimeArtifact.runtimeArtifactSha256,
        requireFactoryVersionRuntimeArtifactBinding: Boolean(version.harnessRuntimeArtifactDigest),
      },
      executionRuntimeArtifactSha256: frozenHarness.runtimeArtifactSha256,
      provider: workflowModelRoute?.provider ?? null,
      model: workflowModelRoute?.modelId ?? null,
      harnessCapabilities: factoryHarnessCapabilityRequirements("READ_ONLY"),
      isolation: "READ_ONLY",
      sandboxCapabilities: requiredSandboxCapabilities,
      executionBackend,
      factoryDefinitionVersionId: String(version._id),
      factoryConfigurationDigest: version.configurationDigest,
      modelRouteDigest: version.modelRouteDigest,
      sandboxProfileDigest: version.sandboxProfileDigest,
    },
    activeWorkerLeaseCount: 0,
    now,
  }).eligible) : [];
  const host: any = repository ? selectCurrentFactoryHost(eligibleBindings as any[], repository.repository, now) : null;
  if (!repository || repository._id !== sourceAttempt.repositoryId || repository.status !== "READY"
    || repositoryDataClassification === "UNCLASSIFIED"
    || repositoryDataClassification !== (version.repositoryDataClassification ?? "UNCLASSIFIED")
    || !remoteExecutionPolicy.allowed
    || !workflow?.active || !assessment || assessment.status !== "PASS" || assessment.expiresAt <= now
    || assessment.configurationDigest !== version.configurationDigest || !host || host.dirty
    || agentVersions.some((agentVersion: any) => !agentVersion)
    || !workflowModelRoute
    || !modelRoute
    || !executionProfileReady
    || !factoryWorkflowModelRouteMatches({
      workflow,
      agentBindings: version.agentBindings ?? [],
      agentVersions,
    }, version.modelRouteSnapshot as any)
    || !frozenFactoryModelRouteEligible({
      route: modelRoute,
      version,
      harness: frozenHarness,
      executionBackend,
    })
    || (executionBackend === "remote-sandbox" && (
      !sandboxProfile
      || sandboxProfile.profileDigest !== version.sandboxProfileDigest
      || !sandboxProfileProductionEligible(sandboxProfile)
    ))) {
    throw new Error("Candidate is ready, but the active Verification Factory no longer has current readiness for the exact repository and host.");
  }
  const runId = Math.random().toString(36).slice(2, 10);
  const executorInvocationId = `verification:${runId}`;
  const worktree = `${host.checkoutRoot.replace(/\/+$/, "")}/.mission-control/worktrees/verify-${runId}`;
  const workflowSnapshot = snapshotWorkflowDefinition(workflow);
  const executionManifest = buildFactoryExecutionManifest({
    runId,
    missionId: workOrder.missionId ? String(workOrder.missionId) : undefined,
    missionPlanId: workOrder.missionPlanId ? String(workOrder.missionPlanId) : undefined,
    missionPlanVersion: workOrder.missionPlanRevision,
    planningRepositorySha: workOrder.planningRepositorySha,
    qualityContractDigest: workOrder.qualityContractDigest,
    workOrderId: String(workOrder._id),
    workOrderRevisionNumber: workOrder.currentRevisionNumber ?? 1,
    workOrderRevisionId: workOrder.currentRevisionId ? String(workOrder.currentRevisionId) : undefined,
    factoryDefinitionVersionId: String(version._id),
    factoryConfigurationDigest: version.configurationDigest,
    factoryPurpose: "VERIFICATION",
    repositoryId: String(repository._id),
    repository: repository.repository,
    repositoryDataClassification,
    defaultBranch: repository.defaultBranch,
    baseSha: subject.kind === "GIT_CANDIDATE" ? subject.candidateSha : sourceAttempt.headSha,
    branch: sourceAttempt.branch,
    worktree,
    executor: frozenHarness,
    executionBackend,
    modelRoute: {
      catalogId: String(modelRoute._id),
      routeDigest: modelRoute.routeDigest,
      routeSnapshot: modelRoute.routeSnapshot,
      qualificationDigest: modelRoute.qualificationDigest,
      qualificationSnapshot: modelRoute.qualificationSnapshot,
    },
    executionProfile: executionProfile ? {
      profileId: String(version.executionProfileId),
      profileKey: version.executionProfileKey!,
      version: version.executionProfileVersion!,
      profileDigest: version.executionProfileDigest!,
      profileSnapshot: version.executionProfileSnapshot!,
      qualificationDigest: version.executionProfileQualificationDigest!,
      qualificationSnapshot: version.executionProfileQualificationSnapshot!,
    } : undefined,
    sandboxProfile: {
      isolation: "READ_ONLY",
      requiredCapabilities: requiredSandboxCapabilities,
    },
    sandbox: executionBackend === "remote-sandbox" ? {
      resourceName: factorySandboxResourceName({
        projectId: String(version.projectId),
        workflowRunId: runId,
        attemptId: runId,
      }),
      profileId: String(sandboxProfile!._id),
      profileDigest: sandboxProfile!.profileDigest,
      profileSnapshot: sandboxProfile!.immutableSnapshot,
      supervisorVersion: "mission-control-supervisor/v1",
      resultContract: { schema: "factory-sandbox-result/v1", independentHostValidationRequired: true },
      credentialGrants: [{ kind: "INFERENCE", secretValueIncluded: false, githubAuthority: "NONE", providerAuthority: "NONE" }],
      teardown: { credentialsRevokedBeforePublication: true, resourceAbsenceRequiredBeforePublication: true },
    } : undefined,
    workflow: workflowSnapshot as any,
    workOrder: {
      title: workOrder.title,
      desiredOutcome: workOrder.desiredOutcome,
      context: workOrder.context,
      requirements: workOrder.requirements,
      acceptanceCriteria: workOrder.acceptanceCriteria,
      constraints: workOrder.constraints,
      positiveConstraints: workOrder.positiveConstraints,
      negativeConstraints: workOrder.negativeConstraints,
      dataBoundaries: workOrder.dataBoundaries,
      changeBudget: workOrder.changeBudget,
      verificationContract: workOrder.verificationContract,
      autonomyLevel: workOrder.autonomyLevel,
      riskLevel: workOrder.riskLevel,
      riskReasons: workOrder.riskReasons,
      requiredApprovals: workOrder.requiredApprovals,
      sourceOfTruthRefs: workOrder.sourceOfTruthRefs,
    },
    agentBindings: (version.agentBindings ?? []).map((binding: any, index: number) => ({
      workflowAgentId: binding.workflowAgentId,
      agentVersionId: String(binding.agentVersionId),
      agentVersion: agentVersions[index].version,
      genomeHash: agentVersions[index].genomeHash,
      promptBundleHash: agentVersions[index].genome.promptBundleHash,
      toolManifestHash: agentVersions[index].genome.toolManifestHash,
      model: agentVersions[index].genome.modelConfig,
    })),
    codeScopes: codeScopes.map((scope: any) => ({
      id: String(scope._id), slug: scope.slug, includePaths: scope.includePaths, excludePaths: scope.excludePaths,
    })),
    allowedTools: Array.isArray(workflow.metadata?.allowedTools) ? workflow.metadata.allowedTools : [],
    maxAttempts: version.budget.maxAttempts,
    maxCostUsd: version.budget.maxCostUsd,
    maxRuntimeMinutes: version.budget.maxRuntimeMinutes,
    initialContext: { verificationSubjectDigest: subject.digest, sourceAttemptId: String(sourceAttempt._id) },
  });
  const steps = workflow.steps.map((step: any, index: number) => ({
    stepId: step.id,
    status: "PENDING" as const,
    dependsOn: step.dependsOn ?? (index > 0 ? [workflow.steps[index - 1].id] : []),
    kind: step.kind ?? "VERIFY",
    modelTier: step.modelTier,
    isolation: "READ_ONLY" as const,
    failurePolicy: step.failurePolicy ?? "BLOCK",
    retryCount: 0,
  }));
  const binding = {
    sourceAttemptId: sourceAttempt._id,
    workOrderId: workOrder._id,
    workOrderRevisionNumber: workOrder.currentRevisionNumber ?? 1,
    verificationContractDigest: workOrder.verificationContractDigest,
    verificationSubject: subject,
    verificationSubjectDigest: subject.digest,
  };
  // Validate the frozen plan before the first write. Convex mutations do not
  // roll back writes when a caught error occurs, so compiling after insertion
  // alone can strand an orphan Verification Attempt.
  compilePolicyV2VerificationPlan({
    now,
    workOrder,
    sourceAttempt,
    verificationAttemptId: "verification-attempt-precheck",
    verificationSubject: subject,
    factoryDefinitionId: String(definition._id),
    factoryDefinitionVersionId: String(version._id),
    executorInvocationId,
  });
  const workflowRunId = await ctx.db.insert("workflowRuns", {
    tenantId: workOrder.tenantId,
    runId,
    workflowId: workflow.workflowId,
    workflowVersion: workflow.version,
    workflowSnapshot,
    projectId: workOrder.projectId,
    missionId: workOrder.missionId,
    missionRole: workOrder.missionRole,
    workOrderId: workOrder._id,
    workOrderRevisionNumber: workOrder.currentRevisionNumber ?? 1,
    workOrderRevisionId: workOrder.currentRevisionId,
    verificationContractDigest: workOrder.verificationContractDigest,
    factoryDefinitionVersionId: version._id,
    factoryConfigurationDigest: version.configurationDigest,
    executionProfileId: version.executionProfileId,
    executionProfileKey: version.executionProfileKey,
    executionProfileVersion: version.executionProfileVersion,
    executionProfileDigest: version.executionProfileDigest,
    executionProfileSnapshot: version.executionProfileSnapshot,
    executionProfileQualificationDigest: version.executionProfileQualificationDigest,
    executionProfileQualificationSnapshot: version.executionProfileQualificationSnapshot,
    factoryPurpose: "VERIFICATION",
    attemptPurpose: "VERIFICATION",
    executorInvocationId,
    qualityContractDigest: workOrder.qualityContractDigest,
    planningRepositorySha: workOrder.planningRepositorySha,
    repositoryId: repository._id,
    hostBindingId: host._id,
    policyEnvelopeId: version.policyEnvelopeId,
    environmentId: version.environmentId,
    executorAdapter: version.executor.adapter,
    executorVersion: version.executor.version,
    branch: sourceAttempt.branch,
    worktree,
    allowedTools: Array.isArray(workflow.metadata?.allowedTools) ? workflow.metadata.allowedTools : [],
    approvedCodeScopeIds: version.codeScopeIds,
    isMutating: false,
    executionManifest: executionManifest.manifest,
    executionManifestDigest: executionManifest.digest,
    verificationAttemptBinding: binding,
    status: "PENDING",
    currentStepIndex: 0,
    totalSteps: steps.length,
    steps,
    context: { source: "policy-v2-verification-scheduler", sourceAttemptId: sourceAttempt._id, verificationSubjectDigest: subject.digest },
    topology: workflow.topology ?? "LINEAR",
    maxConcurrency: 1,
    initialInput: `Verify immutable subject ${subject.digest}`,
    executionEnvironment: workOrder.executionEnvironment ?? "LOCAL",
    executorHostId: host.hostId,
    checkpointSummary: "Exact candidate ready; awaiting independent Verification Factory claim.",
    checkpointAt: now,
    stopCondition: "Stop on subject mismatch, isolation failure, policy failure, or incomplete required evidence.",
    escalationOwner: workOrder.ownerMemberId ? String(workOrder.ownerMemberId) : workOrder.requestedBy,
    startedAt: now,
    metadata: { sourceAttemptId: sourceAttempt._id, verificationSubjectDigest: subject.digest },
  });
  const plan = compilePolicyV2VerificationPlan({
    now,
    workOrder,
    sourceAttempt,
    verificationAttemptId: String(workflowRunId),
    verificationSubject: subject,
    factoryDefinitionId: String(definition._id),
    factoryDefinitionVersionId: String(version._id),
    executorInvocationId,
  });
  const verificationRunId = await ctx.db.insert("verificationRuns", {
    tenantId: workOrder.tenantId,
    projectId: workOrder.projectId,
    missionId: workOrder.missionId,
    workOrderId: workOrder._id,
    workflowRunId,
    sourceAttemptId: sourceAttempt._id,
    idempotencyKey: `policy-v2:${String(workOrder._id)}:${subject.digest}:${String(workflowRunId)}`,
    engineVersion: "verification-engine/v2",
    workOrderRevisionNumber: workOrder.currentRevisionNumber ?? 1,
    verificationContractDigest: workOrder.verificationContractDigest,
    verificationSubject: subject,
    verificationSubjectId: subject.subjectId,
    verificationSubjectDigest: subject.digest,
    verificationPlan: plan,
    verificationPlanId: plan.planId,
    verificationPlanDigest: plan.planDigest,
    sourceRevision: sourceAttempt.executionBaseSha,
    candidateRevision: subject.kind === "GIT_CANDIDATE" ? subject.candidateSha : subject.outputSnapshotContentHash,
    status: "PLANNED",
    checks: [],
    criterionCoverage: [],
    requiredRisks: plan.requiredRisks,
    discoveredRisks: [],
    requirementsPassed: 0,
    requirementsFailed: 0,
    violations: [],
    approvalRequirements: workOrder.requiredApprovals,
    riskLevel: workOrder.riskLevel,
    riskReasons: workOrder.riskReasons,
    verdictReasons: ["Verification Attempt is planned for the exact immutable subject."],
    startedAt: now,
    createdAt: now,
  });
  await insertEvent(ctx, { ...sourceAttempt, _id: workflowRunId, runId, steps, currentStepIndex: 0 }, {
    idempotencyKey: `verification-attempt-dispatched:${runId}`,
    eventType: "VERIFICATION_ATTEMPT_DISPATCHED",
    workflowStep: "independent-verification",
    actor: "service:factory-control-plane",
    status: "PENDING",
    startedAt: now,
    commandSummary: `Verification Attempt ${runId} bound to source Attempt ${sourceAttempt.runId}`,
    metadata: { sourceAttemptId: sourceAttempt._id, verificationRunId, verificationPlanId: plan.planId, verificationPlanDigest: plan.planDigest },
  });
  await ctx.db.patch(workOrder._id, {
    currentExecutionRunId: workflowRunId,
    state: "AWAITING_VERIFICATION",
    verificationStatus: "PENDING",
    blockingIssue: undefined,
    requiredHumanAction: "Independent Verification Factory is evaluating the exact immutable candidate.",
    updatedAt: now,
  });
  return { workflowRun: await ctx.db.get(workflowRunId), verificationRunId, created: true };
}

async function persistSandboxPacket(ctx: any, run: any, packet: any, leaseId: string) {
  const sandbox = packet.sandbox;
  const credential = packet.credential;
  if (!sandbox && !credential) return undefined;
  const manifest = run.executionManifest as any;
  if (factoryExecutionManifestBackend(manifest) !== "remote-sandbox"
    || !manifest.sandbox?.profileId
    || !manifest.sandbox?.profileDigest) {
    throw new Error("Sandbox lifecycle reports require a remote Factory Attempt binding.");
  }
  let allocation = await ctx.db.query("sandboxAllocations")
    .withIndex("by_run", (q: any) => q.eq("workflowRunId", run._id))
    .order("desc")
    .first();
  if (sandbox?.operation === "REQUESTED") {
    const request = sandbox.request;
    if (!request || request.workflowRunId !== String(run._id) || request.attemptId !== run.runId
      || request.attemptLeaseId !== leaseId || request.manifestDigest !== run.executionManifestDigest
      || request.sourceSha !== manifest.repository?.baseSha
      || request.profile?.schema !== "factory-sandbox-profile/v1"
      || request.resourceName !== manifest.sandbox.resourceName
      || `sha256:${computeCanonicalHash({ namespace: "factory-sandbox-profile/v1", value: request.profile })}` !== manifest.sandbox.profileDigest
      || request.profile?.profileKey !== manifest.sandbox.profileSnapshot?.profileKey) {
      throw new Error("Sandbox allocation request does not match the active Attempt lease and frozen manifest.");
    }
    if (!allocation) {
      const allocationId = await ctx.db.insert("sandboxAllocations", {
        tenantId: run.tenantId,
        projectId: run.projectId,
        workOrderId: run.workOrderId,
        workflowRunId: run._id,
        factoryDefinitionVersionId: run.factoryDefinitionVersionId,
        attemptId: run.runId,
        attemptLeaseId: leaseId,
        manifestDigest: run.executionManifestDigest,
        profileId: manifest.sandbox.profileId,
        profileDigest: manifest.sandbox.profileDigest,
        profileSnapshot: request.profile,
        sourceSha: request.sourceSha,
        provider: request.profile.provider,
        resourceName: request.resourceName,
        state: "REQUESTED",
        requestedAt: request.requestedAt,
        updatedAt: Date.now(),
      });
      await ctx.db.patch(run._id, { sandboxAllocationId: allocationId });
      allocation = await ctx.db.get(allocationId);
    } else if (allocation.resourceName !== request.resourceName || allocation.attemptLeaseId !== leaseId) {
      throw new Error("Attempt already has a different sandbox allocation journal.");
    }
  } else if (sandbox) {
    if (!allocation) throw new Error("Sandbox provider mutation cannot be recorded before the allocation request journal.");
    if (sandbox.resourceName && sandbox.resourceName !== allocation.resourceName) throw new Error("Sandbox lifecycle resource name does not match the Attempt journal.");
    if (sandbox.operation === "UPDATED") {
      const update = sandbox.allocation ?? {};
      const states = ["ALLOCATING", "READY", "RUNNING", "RESULT_READY", "CANCELING", "TERMINATING", "TERMINATED", "FAILED", "ORPHANED"];
      if (!states.includes(update.state) || update.provider !== allocation.provider || update.resourceName !== allocation.resourceName) throw new Error("Sandbox allocation update is invalid.");
      await ctx.db.patch(allocation._id, definedPatch({
        providerResourceId: optionalText(update.providerResourceId, 500),
        state: update.state,
        createdAt: finiteNumber(update.createdAt),
        readyAt: finiteNumber(update.readyAt),
        startedAt: finiteNumber(update.startedAt),
        lastHeartbeatAt: finiteNumber(update.lastHeartbeatAt),
        resultDigest: optionalText(update.resultDigest, 200),
        privatePreviewUrl: safePrivatePreview(update.privatePreviewUrl),
        providerMetadata: update.providerMetadata,
        updatedAt: Date.now(),
      }));
      if (update.resultDigest) await ctx.db.patch(run._id, { sandboxResultDigest: update.resultDigest });
    } else if (sandbox.operation === "RESULT") {
      const result = sandbox.result ?? {};
      if (!String(result.digest ?? "").startsWith("sha256:") || !["COMPLETED", "FAILED", "CANCELED", "TIMED_OUT"].includes(result.status)) throw new Error("Sandbox result journal is invalid.");
      await ctx.db.patch(allocation._id, {
        state: "RESULT_READY",
        resultDigest: result.digest,
        resultStatus: result.status,
        providerCostUsd: finiteNumber(result.providerCostUsd),
        inferenceCostUsd: finiteNumber(result.inferenceCostUsd),
        updatedAt: Date.now(),
      });
      await ctx.db.patch(run._id, { sandboxResultDigest: result.digest });
    } else if (sandbox.operation === "TERMINATED" || sandbox.operation === "ORPHAN_RECONCILED") {
      const receipt = sandbox.receipt ?? {};
      if (receipt.resourceName !== allocation.resourceName
        || receipt.providerResourceId !== allocation.providerResourceId
        || receipt.resourceAbsent !== true
        || !Number.isFinite(receipt.confirmedAbsentAt)) throw new Error("Sandbox teardown receipt does not prove exact resource absence.");
      await ctx.db.patch(allocation._id, {
        state: "TERMINATED",
        terminationRequestedAt: finiteNumber(receipt.requestedAt),
        terminatedAt: receipt.confirmedAbsentAt,
        resourceAbsentAt: receipt.confirmedAbsentAt,
        teardownReceipt: receipt,
        updatedAt: Date.now(),
      });
      await ctx.db.patch(run._id, { sandboxTeardownVerifiedAt: receipt.confirmedAbsentAt });
    } else if (sandbox.operation === "FAILED") {
      const failureClass = ["RETRYABLE_INFRA", "RETRYABLE_EXECUTION", "NON_RETRYABLE_RESULT", "UNKNOWN"].includes(sandbox.failureClass)
        ? sandbox.failureClass
        : "UNKNOWN";
      const retryable = failureClass === "RETRYABLE_INFRA" || failureClass === "RETRYABLE_EXECUTION";
      if (sandbox.retryable !== undefined && sandbox.retryable !== retryable) {
        throw new Error("Sandbox failure retry decision conflicts with its failure class.");
      }
      await ctx.db.patch(allocation._id, {
        state: "FAILED",
        failureReason: optionalText(sandbox.reason, 2_000),
        failureClass,
        failureCode: optionalText(sandbox.failureCode, 200) ?? "REMOTE_UNCLASSIFIED",
        retryable,
        updatedAt: Date.now(),
      });
    } else {
      throw new Error("Sandbox lifecycle operation is unsupported.");
    }
    allocation = await ctx.db.get(allocation._id);
  }

  if (credential) {
    if (!allocation) throw new Error("Attempt credential cannot be recorded without a sandbox allocation journal.");
    if (credential.operation === "ISSUED") {
      const grant = credential.grant ?? {};
      const profile = manifest.sandbox.profileSnapshot;
      if (!/^mc-attempt-[a-f0-9]{20}$/.test(grant.grantKey ?? "")
        || !grant.externalCredentialId
        || !/^sha256:[a-f0-9]{64}$/i.test(grant.secretFingerprint ?? "")
        || grant.environmentVariable !== "OPENAI_API_KEY"
        || grant.provider !== "OPENROUTER"
        || !Number.isFinite(grant.maxCostUsd)
        || grant.maxCostUsd !== profile?.spend?.maxUsd
        || !Number.isFinite(grant.issuedAt)
        || grant.issuedAt > Date.now() + 60_000
        || !Number.isFinite(grant.expiresAt)
        || grant.expiresAt <= Date.now()
        || grant.expiresAt > grant.issuedAt + profile.runtime.maxRuntimeMs + 30_000) {
        throw new Error("Attempt credential grant is invalid.");
      }
      const existing = await ctx.db.query("sandboxCredentialGrants")
        .withIndex("by_grant_key", (q: any) => q.eq("grantKey", grant.grantKey))
        .first();
      if (!existing) {
        await ctx.db.insert("sandboxCredentialGrants", {
          tenantId: run.tenantId,
          projectId: run.projectId,
          workflowRunId: run._id,
          sandboxAllocationId: allocation._id,
          attemptId: run.runId,
          attemptLeaseId: leaseId,
          grantKey: grant.grantKey,
          provider: grant.provider,
          externalCredentialId: grant.externalCredentialId,
          environmentVariable: "OPENAI_API_KEY",
          secretFingerprint: grant.secretFingerprint,
          maxCostUsd: grant.maxCostUsd,
          issuedAt: grant.issuedAt,
          expiresAt: grant.expiresAt,
          state: "ISSUED",
          updatedAt: Date.now(),
        });
      }
    } else if (credential.operation === "REVOKED") {
      const receipt = credential.receipt ?? {};
      const existing = await ctx.db.query("sandboxCredentialGrants")
        .withIndex("by_grant_key", (q: any) => q.eq("grantKey", receipt.grantKey))
        .first();
      if (!existing || existing.workflowRunId !== run._id
        || receipt.externalCredentialId !== existing.externalCredentialId
        || receipt.revoked !== true
        || !Number.isFinite(receipt.requestedAt)
        || !Number.isFinite(receipt.revokedAt)
        || receipt.revokedAt < receipt.requestedAt) throw new Error("Attempt credential revocation receipt is invalid.");
      await ctx.db.patch(existing._id, {
        state: "REVOKED",
        revocationRequestedAt: finiteNumber(receipt.requestedAt),
        revokedAt: finiteNumber(receipt.revokedAt) ?? Date.now(),
        updatedAt: Date.now(),
      });
    } else {
      throw new Error("Attempt credential lifecycle operation is unsupported.");
    }
  }
  return { allocationId: allocation?._id };
}

function containsCredentialSecret(value: unknown): boolean {
  if (typeof value === "string") return /\bsk-or-v1-[A-Za-z0-9_-]+|\bgh[pousr]_[A-Za-z0-9_]+/.test(value);
  if (Array.isArray(value)) return value.some(containsCredentialSecret);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value as Record<string, unknown>).some(([key, item]) =>
    ["secret", "token", "privatekey", "managementkey", "apikey"].includes(key.toLowerCase())
    || containsCredentialSecret(item)
  );
}

function definedPatch(input: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

function safePrivatePreview(value: unknown) {
  if (typeof value !== "string" || !value) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !url.hostname.endsWith(".exe.xyz")) throw new Error();
    return url.toString();
  } catch {
    throw new Error("Sandbox preview URL is not an authenticated private exe.dev endpoint.");
  }
}

async function factoryLeaseRegistrationIsCurrent(ctx: any, run: any) {
  if (!run.lease) return false;
  if (!run.lease.workerId && !run.lease.workerSessionId && run.lease.workerGeneration === undefined) {
    return true;
  }
  const host = run.hostBindingId ? await ctx.db.get(run.hostBindingId) : null;
  return factoryLeaseMatchesCurrentRegistration(run.lease, host ?? undefined);
}

async function assertFactoryPullRequestArtifact(
  ctx: any,
  run: any,
  artifact: any,
  revisions: { headSha?: string; sourceRevision?: string },
) {
  if (!run.repositoryId || !run.branch || !run.executionManifestDigest || !revisions.headSha) {
    throw new Error("Factory pull-request artifact is missing its frozen Attempt lineage.");
  }
  const sourceRevision = frozenFactorySourceRevision(run, artifact?.metadata?.sourceRevision);
  if (revisions.sourceRevision !== undefined && revisions.sourceRevision !== sourceRevision) {
    throw new Error("Publication receipt source differs from the frozen execution manifest.");
  }
  const subject = run.verificationSubject;
  if (subject?.kind === "GIT_CANDIDATE"
    && (artifact?.metadata?.headSha !== subject.candidateSha
      || artifact?.metadata?.treeSha !== subject.treeSha
      || artifact?.metadata?.providerPullRequestId !== subject.pullRequest.providerPullRequestId
      || artifact?.metadata?.pullRequestNumber !== subject.pullRequest.number
      || artifact?.metadata?.pullRequestUrl !== subject.pullRequest.url)) {
    throw new Error("Publication artifact differs from the immutable candidate subject.");
  }
  const [repository, installation] = await Promise.all([
    ctx.db.get(run.repositoryId),
    ctx.db.query("githubAppInstallations")
      .withIndex("by_repository", (q: any) => q.eq("repositoryId", run.repositoryId))
      .first(),
  ]);
  if (!repository || repository.projectId !== run.projectId || repository.status !== "READY"
    || !installation || installation.projectId !== run.projectId || installation.status !== "CONNECTED") {
    throw new Error("Factory pull-request artifact requires the current connected GitHub App repository binding.");
  }
  const validation = validateFactoryPullRequestLineage({
    artifact,
    expected: {
      repositoryId: String(repository._id),
      repositoryIdentity: repository.repository,
      installationId: installation.installationId,
      branch: run.branch,
      headSha: revisions.headSha,
      sourceRevision,
      executionManifestDigest: run.executionManifestDigest,
      publicationPermitId: run.factoryContinuation?.status === "PUBLICATION_AUTHORIZED"
        ? run.factoryContinuation.publicationPermitId
        : undefined,
    },
  });
  if (validation.ok === false) {
    throw new Error(`Factory pull-request artifact failed GitHub App lineage validation (${validation.reason}).`);
  }
}

function mutationWorkerIdentity(args: {
  workerId?: string;
  workerSessionId?: string;
  workerGeneration?: number;
}) {
  if (args.workerId === undefined && args.workerSessionId === undefined && args.workerGeneration === undefined) return undefined;
  if (!args.workerId || !args.workerSessionId || !Number.isSafeInteger(args.workerGeneration) || args.workerGeneration! < 1) {
    throw new Error("Factory attempt mutation requires the complete worker lease identity.");
  }
  return {
    workerId: args.workerId,
    sessionId: args.workerSessionId,
    generation: args.workerGeneration!,
  };
}

async function failLostAttempt(ctx: any, run: any, reason: string) {
  const now = Date.now();
  const remoteFailure = lostFactoryAttemptFailure({
    executionBackend: factoryExecutionManifestBackend(run.executionManifest),
  });
  await ctx.db.patch(run._id, {
    status: "FAILED",
    completedAt: now,
    failureReason: reason,
    lease: undefined,
    executionPhase: "TERMINAL",
    runtimeDisposition: "LOST",
    runtimeDispositionReason: reason,
    runtimeReconciledAt: now,
    ...remoteFailure,
    steps: reconcileTerminalWorkflowSteps(run.steps, "FAILED", reason, now),
  });
  await insertEvent(ctx, run, {
    idempotencyKey: `factory-worker-lost:${run.runId}:${run.lease?.leaseId ?? "unowned"}`,
    eventType: "RUN_FAILED",
    workflowStep: run.steps[run.currentStepIndex]?.stepId,
    actor: "service:factory-control-plane",
    status: "FAILED",
    startedAt: now,
    endedAt: now,
    errorCategory: "FACTORY_WORKER_LOST",
    errorSummary: reason,
    commandSummary: "Worker ownership lost; replacement Attempt lineage required",
    metadata: {
      disposition: "LOST",
      priorLeaseId: run.lease?.leaseId,
      priorWorkerId: run.lease?.workerId,
      priorWorkerSessionId: run.lease?.workerSessionId,
      workspaceCleanup: "PRESERVE_FOR_OPERATOR_INSPECTION",
      ...remoteFailure,
    },
  });
  await finishAttemptTrace(ctx, run, { status: "FAILED", completedAt: now, failureReason: reason });
  if (run.workOrderId) {
    await ctx.scheduler.runAfter(0, internal.workOrders.syncExecutionOutcome, {
      workflowRunId: run._id,
      eventType: "RUN_FAILED",
      summary: reason,
    });
  }
  return {
    claimed: false as const,
    reason: "worker-lease-lost-new-attempt-required",
    disposition: "LOST" as const,
    retryRequired: true as const,
    terminal: true as const,
  };
}

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
  await finishAttemptTrace(ctx, run, {
    status: "FAILED",
    completedAt: now,
    failureReason: reason,
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
    traceContext: event.traceContext,
    metadata: {
      ...(event.metadata ?? {}),
      ...(executionProfileEvidence(run) ? { executionProfile: executionProfileEvidence(run) } : {}),
    },
  });
  const inserted = await ctx.db.get(eventId);
  if (inserted && run.projectId) await recordRunEventObservation(ctx, run, inserted);
  return { event: inserted, created: true };
}

async function persistVerificationPacket(ctx: any, run: any, packet: any, ownerId: string, leaseId: string) {
  if (!run.workOrderId) throw new Error("Verification requires a WorkOrder-bound Factory attempt.");
  const workOrder = await ctx.db.get(run.workOrderId);
  if (!workOrder) throw new Error("Verification WorkOrder not found.");
  if (workOrder.verificationContract?.schemaVersion === 2) {
    throw new Error("Policy-v2 verification requires a separate subject-bound Verification Attempt; legacy inline factoryContinuation and producer independence flags cannot satisfy it.");
  }
  if ((workOrder.currentRevisionNumber ?? 1) !== (run.workOrderRevisionNumber ?? 1)) {
    throw new Error("Verification packet is stale because the WorkOrder revision changed.");
  }
  const receiptRecordedAt = Date.now();
  const profileEvidence = executionProfileEvidence(run);
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
      metadata: {
        ...(evidence.metadata ?? {}),
        leaseId,
        reportedBy: ownerId,
        ...(profileEvidence ? { executionProfile: profileEvidence } : {}),
      },
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
    metadata: {
      engineVersion: result.engineVersion,
      serverRecomputed: true,
      leaseId,
      ...(profileEvidence ? { executionProfile: profileEvidence } : {}),
    },
  });

  const qualityGateDecisionId = await ctx.db.insert("qualityGateDecisions", {
    tenantId: run.tenantId,
    projectId: run.projectId,
    missionId: run.missionId,
    workOrderId: workOrder._id,
    workflowRunId: run._id,
    verificationRunId,
    verificationReceiptId,
    idempotencyKey: `${idempotencyKey}:quality-gate`,
    workOrderRevisionNumber: workOrder.currentRevisionNumber ?? 1,
    candidateRevision: result.candidateRevision,
    subjectDigest: legacyQualityGateSubjectDigest({
      workOrderId: String(workOrder._id),
      workOrderRevisionNumber: workOrder.currentRevisionNumber ?? 1,
      executionManifestDigest: run.executionManifestDigest,
      qualityContractDigest: workOrder.qualityContractDigest,
      candidateRevision: result.candidateRevision,
    }),
    verificationContractDigest: workOrder.verificationContractDigest,
    verificationSubjectDigest: run.verificationSubject?.digest,
    sourceAttemptId: run.verificationSubject?.sourceAttemptId,
    verificationAttemptId: run.attemptPurpose === "VERIFICATION" ? run._id : undefined,
    qualityContractDigest: workOrder.qualityContractDigest,
    executionManifestDigest: run.executionManifestDigest,
    evidenceSetDigest: qualityGateEvidenceSetDigest({
      verificationRunId: String(verificationRunId),
      verificationReceiptId: String(verificationReceiptId),
      evidenceEnvelopeIds: allEvidenceIds.map(String),
    }),
    governancePolicyId: workOrder.governancePolicyId,
    state: legacyQualityGateStateForVerdict(result.verdict),
    mode: "ENFORCED",
    reasons: result.verdictReasons,
    blockingFindingIds: result.violations,
    requiredApprovalIds: [],
    evaluatedAt: receiptRecordedAt,
    metadata: {
      engineVersion: result.engineVersion,
      serverRecomputed: true,
      verificationVerdict: result.verdict,
      subjectIdentityMode: run.verificationSubject?.digest ? "POLICY_V2" : "LEGACY_V1",
      ...(profileEvidence ? { executionProfile: profileEvidence } : {}),
    },
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
      metadata: {
        engineVersion: result.engineVersion,
        serverRecomputed: true,
        leaseId,
        ...(profileEvidence ? { executionProfile: profileEvidence } : {}),
      },
    });
  }

  const trace = await ensureAttemptTrace(ctx, run);
  const verificationObservationKey = `verification:${verificationRunId}`;
  await recordTraceObservation(ctx, trace, {
    idempotencyKey: verificationObservationKey,
    type: "EVALUATOR",
    name: "Independent verification",
    startedAt: result.startedAt,
    endedAt: result.completedAt,
    durationMs: result.durationMs,
    status: result.verdict === "VERIFIED" ? "SUCCESS" : "FAILED",
    input: {
      sourceRevision: result.sourceRevision,
      candidateRevision: result.candidateRevision,
      workOrderRevisionNumber: workOrder.currentRevisionNumber ?? 1,
    },
    output: {
      verdict: result.verdict,
      verdictReasons: result.verdictReasons,
      requirementsPassed: result.requirementsPassed,
      requirementsFailed: result.requirementsFailed,
    },
    verificationRunId,
    evidenceEnvelopeIds: allEvidenceIds,
    metadata: {
      engineVersion: result.engineVersion,
      acceptanceAuthority: false,
      ...(profileEvidence ? { executionProfile: profileEvidence } : {}),
    },
  });
  for (const check of checks) {
    await recordTraceObservation(ctx, trace, {
      idempotencyKey: `${verificationObservationKey}:check:${check.checkId}`,
      parentIdempotencyKey: verificationObservationKey,
      type: check.metadata?.commandClass ? "TOOL" : "EVALUATOR",
      name: check.name,
      startedAt: check.startedAt,
      endedAt: check.completedAt,
      durationMs: check.durationMs,
      status: check.status === "PASS" ? "SUCCESS" : "FAILED",
      toolName: check.metadata?.commandClass ? String(check.metadata.commandClass) : undefined,
      output: { status: check.status, summary: check.summary },
      error: check.status === "PASS" ? undefined : { message: check.summary },
      verificationRunId,
      evidenceEnvelopeIds: check.evidenceIds,
      metadata: {
        category: check.category,
        mandatory: check.mandatory,
        acceptanceAuthority: false,
        ...(profileEvidence ? { executionProfile: profileEvidence } : {}),
      },
    });
  }

  await insertEvent(ctx, run, {
    idempotencyKey: `${idempotencyKey}:started`, eventType: "VERIFICATION_STARTED",
    workflowStep: "independent-verification", actor: `service:${ownerId}`, status: "RUNNING",
    startedAt: result.startedAt, verificationRunId,
    commandSummary: `Independent verification started for ${result.candidateRevision.slice(0, 12)}`,
    metadata: { traceParentObservationKey: verificationObservationKey },
  });
  for (const check of checks) {
    await insertEvent(ctx, run, {
      idempotencyKey: `${idempotencyKey}:check:${check.checkId}:started`,
      eventType: "VERIFICATION_CHECK_STARTED", workflowStep: "independent-verification",
      actor: `service:${ownerId}`, status: "RUNNING", startedAt: check.startedAt,
      verificationRunId, commandSummary: `Started ${check.name}`,
      metadata: { checkId: check.checkId, category: check.category, mandatory: check.mandatory, traceParentObservationKey: verificationObservationKey },
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
      metadata: { checkId: check.checkId, category: check.category, mandatory: check.mandatory, traceParentObservationKey: verificationObservationKey },
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
    metadata: { qualityGateDecisionId, verdictReasons: result.verdictReasons, requirementsPassed: result.requirementsPassed, requirementsFailed: result.requirementsFailed },
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
    qualityGateDecisionId,
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

function normalizeRemoteFailure(value: any) {
  if (!value || typeof value !== "object") return undefined;
  const failureClass = ["RETRYABLE_INFRA", "RETRYABLE_EXECUTION", "NON_RETRYABLE_RESULT", "UNKNOWN"].includes(value.class)
    ? value.class as "RETRYABLE_INFRA" | "RETRYABLE_EXECUTION" | "NON_RETRYABLE_RESULT" | "UNKNOWN"
    : undefined;
  const code = optionalText(value.code, 200);
  const stage = optionalText(value.stage, 200);
  const summary = optionalText(value.summary, 1_000);
  if (!failureClass || !code || !stage || !summary || typeof value.retryable !== "boolean") return undefined;
  const retryable = failureClass === "RETRYABLE_INFRA" || failureClass === "RETRYABLE_EXECUTION";
  if (value.retryable !== retryable) throw new Error("Remote failure retryability conflicts with its class.");
  return { class: failureClass, code, stage, retryable, summary };
}

function optionalText(value: unknown, max: number): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : undefined;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function verificationAuthorityStatusFromPacket(packet: any): "PASS" | "FAIL" | undefined {
  const check = (packet?.checks ?? []).find(
    (item: any) => item?.verifierId === "factory-verification-authority",
  );
  if (!check) return undefined;
  return check.status === "PASS" ? "PASS" : "FAIL";
}
