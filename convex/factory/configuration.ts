import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import type { QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { FACTORY_PERMISSIONS, requireWorkspacePermission } from "../lib/companyAccess";
import {
  factoryConfigurationDigest,
  validFactoryBudget,
  validFactoryExecutorBinding,
  validFactoryExecutionBinding,
  type FactoryConfigurationInput,
} from "../lib/factoryConfiguration";
import { evaluateGithubAppCapabilities, githubInstallationIsStale } from "../lib/githubAppReadiness";
import { canonicalRepositoryKey } from "../lib/workspaceRepositories";
import { genericHarnessV1RecoveryReady, selectCurrentFactoryHost } from "../lib/factoryDispatch";
import { factoryWorkflowContractIssues } from "../lib/factoryWorkflowContract";
import { computeCanonicalHash } from "../lib/genomeHash";
import { factoryWorkerEligibility } from "../lib/factoryWorkerRuntime";
import { factoryHarnessCapabilityRequirements, resolveFrozenHarnessBinding } from "../lib/harnessCapabilities";
import { KNOWN_HARNESS_MANIFESTS, harnessCapabilityManifestDigest, harnessSupportsModel } from "@mission-control/workflow-engine/harness-contract";
import {
  SANDBOX_PROFILE_ADMISSION_SCHEMA,
  qualifiedSandboxSnapshotIssues,
  sandboxProfileProductionEligible,
} from "../lib/sandboxProfileAdmission";
import { loadModelCatalogForProject } from "../lib/modelCatalogScope";
import { exactModelRouteDigest, modelRouteProductionEligible } from "../lib/modelRouteAdmission";
import { assessFactoryCostEnforcement } from "@mission-control/workflow-engine/cost-enforcement";

const budget = v.object({
  maxCostUsd: v.number(),
  maxRuntimeMinutes: v.number(),
  maxAttempts: v.number(),
});
const recovery = v.object({
  pause: v.boolean(),
  cancel: v.boolean(),
  retry: v.boolean(),
  resume: v.boolean(),
});
const riskBoundary = v.union(v.literal("GREEN"), v.literal("YELLOW"), v.literal("RED"));
const factoryPurpose = v.union(v.literal("SOFTWARE"), v.literal("VERIFICATION"), v.literal("INTELLIGENT_AUTOMATION"));
const executionBackend = v.union(v.literal("persistent-worker"), v.literal("remote-sandbox"));
const sandboxRiskClass = v.union(v.literal("GREEN"), v.literal("YELLOW"));

export const list = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    await requireWorkspacePermission(ctx, args.projectId, FACTORY_PERMISSIONS.VIEW);
    return await ctx.db.query("factoryDefinitions")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
  },
});

export const getDetail = query({
  args: { factoryDefinitionId: v.id("factoryDefinitions") },
  handler: async (ctx, args) => {
    const definition = await ctx.db.get(args.factoryDefinitionId);
    if (!definition) throw new Error("Factory is unavailable or unauthorized.");
    await requireWorkspacePermission(ctx, definition.projectId, FACTORY_PERMISSIONS.VIEW);
    const versions = await ctx.db.query("factoryDefinitionVersions")
      .withIndex("by_factory", (q) => q.eq("factoryDefinitionId", definition._id))
      .collect();
    const assessments = await ctx.db.query("factoryReadinessAssessments")
      .withIndex("by_factory", (q) => q.eq("factoryDefinitionId", definition._id))
      .collect();
    return {
      definition,
      versions: versions.sort((left, right) => right.version - left.version),
      assessments: assessments.sort((left, right) => right.assessedAt - left.assessedAt),
    };
  },
});

export const getVersionOptions = query({
  args: {
    projectId: v.id("projects"),
    repositoryId: v.id("workspaceRepositories"),
  },
  handler: async (ctx, args) => {
    await requireWorkspacePermission(ctx, args.projectId, FACTORY_PERMISSIONS.VIEW);
    const repository = await ctx.db.get(args.repositoryId);
    if (!repository || repository.projectId !== args.projectId) {
      throw new Error("Factory repository is outside the workspace.");
    }
    const [codeScopes, approvedVersions, sandboxProfiles, hostBindings] = await Promise.all([
      ctx.db.query("repositoryCodeScopes")
        .withIndex("by_repository", (q) => q.eq("repositoryId", repository._id))
        .collect(),
      ctx.db.query("agentVersions")
        .withIndex("by_status", (q) => q.eq("status", "APPROVED"))
        .collect(),
      ctx.db.query("factorySandboxProfiles")
        .withIndex("by_project_status", (q) => q.eq("projectId", args.projectId).eq("status", "ACTIVE"))
        .collect(),
      ctx.db.query("workspaceHostBindings")
        .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
        .collect(),
    ]);
    const agentVersions = (await Promise.all(approvedVersions
      .filter((version) => !version.projectId || version.projectId === args.projectId)
      .map(async (version) => {
        const template = await ctx.db.get(version.templateId);
        if (!template?.active || (template.projectId && template.projectId !== args.projectId)) return null;
        return {
          _id: version._id,
          version: version.version,
          genomeHash: version.genomeHash,
          modelConfig: version.genome.modelConfig,
          promptBundleHash: version.genome.promptBundleHash,
          toolManifestHash: version.genome.toolManifestHash,
          template: { _id: template._id, name: template.name, slug: template.slug },
        };
      })))
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
    return {
      codeScopes: codeScopes.filter((scope) => scope.active),
      agentVersions,
      sandboxProfiles: sandboxProfiles.sort((left, right) => left.profileKey.localeCompare(right.profileKey) || right.version - left.version),
      harnesses: KNOWN_HARNESS_MANIFESTS.map((manifest) => {
        const capabilityManifestSha256 = harnessCapabilityManifestDigest(manifest);
        const advertised = hostBindings.some((binding) => binding.status === "READY" && !binding.dirty
          && binding.workerRuntime?.supportedExecutors.some((executor) =>
            executor.adapter === manifest.identity.adapterId
            && executor.version === manifest.identity.adapterVersion
            && executor.capabilityManifestSha256 === capabilityManifestSha256
            && executor.effectiveConfigSha256 === manifest.effectiveConfigSha256
          ));
        return {
          manifest,
          capabilityManifestSha256,
          available: manifest.admission.maturity === "PRODUCTION" || advertised,
          advertised,
        };
      }),
    };
  },
});

async function loadActiveFactoryContext(
  ctx: QueryCtx,
  projectId: Id<"projects">,
  repositoryId: Id<"workspaceRepositories">,
  purpose: "SOFTWARE" | "VERIFICATION" | "INTELLIGENT_AUTOMATION" = "SOFTWARE",
) {
  const repository = await ctx.db.get(repositoryId);
  if (!repository || repository.projectId !== projectId) return null;
  const definitions = await ctx.db.query("factoryDefinitions")
    .withIndex("by_repository", (q) => q.eq("repositoryId", repository._id))
    .collect();
  const definition = definitions.find((candidate) => candidate.status === "ACTIVE"
    && (candidate.purpose ?? "SOFTWARE") === purpose);
  if (!definition?.activeVersionId) return null;
  const version = await ctx.db.get(definition.activeVersionId);
  if (!version || version.factoryDefinitionId !== definition._id) return null;
  const [workflow, codeScopes, assessments, bindings] = await Promise.all([
    ctx.db.get(version.workflowId),
    Promise.all((version.codeScopeIds ?? []).map((scopeId) => ctx.db.get(scopeId))),
    ctx.db.query("factoryReadinessAssessments")
      .withIndex("by_version", (q) => q.eq("factoryDefinitionVersionId", version._id))
      .collect(),
    ctx.db.query("workspaceHostBindings")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .collect(),
  ]);
  const now = Date.now();
  const latestAssessment = assessments.sort((left, right) => right.assessedAt - left.assessedAt)[0] ?? null;
  const host = selectCurrentFactoryHost(bindings, repository.repository, now);
  return {
    definition,
    version,
    repository,
    workflow,
    codeScopes: codeScopes.filter((scope): scope is NonNullable<typeof scope> => Boolean(scope?.active)),
    assessment: latestAssessment,
    host: host ? {
      _id: host._id,
      hostId: host.hostId,
      status: host.status,
      runtime: host.runtime,
      observedBranch: host.observedBranch,
      checkedAt: host.checkedAt,
    } : null,
    readyForBrowserDispatch: Boolean(
      repository.status === "READY"
      && workflow?.active
      && latestAssessment?.status === "PASS"
      && latestAssessment.expiresAt > now
      && latestAssessment.configurationDigest === version.configurationDigest
      && host
    ),
  };
}

export const getActiveForRepository = query({
  args: {
    projectId: v.id("projects"),
    repositoryId: v.id("workspaceRepositories"),
  },
  handler: async (ctx, args) => {
    await requireWorkspacePermission(ctx, args.projectId, FACTORY_PERMISSIONS.VIEW);
    return await loadActiveFactoryContext(ctx, args.projectId, args.repositoryId);
  },
});

export const getActiveForWorkOrder = query({
  args: { workOrderId: v.id("workOrders") },
  handler: async (ctx, args) => {
    const workOrder = await ctx.db.get(args.workOrderId);
    if (!workOrder?.projectId || (!workOrder.repositoryId && !workOrder.repository)) return null;
    await requireWorkspacePermission(ctx, workOrder.projectId, FACTORY_PERMISSIONS.VIEW);
    let repositoryId = workOrder.repositoryId;
    if (!repositoryId) {
      const repositories = await ctx.db.query("workspaceRepositories")
        .withIndex("by_project", (q) => q.eq("projectId", workOrder.projectId!))
        .collect();
      repositoryId = repositories.find((candidate) =>
        workOrder.repository
        && canonicalRepositoryKey(candidate.repository) === canonicalRepositoryKey(workOrder.repository)
      )?._id;
    }
    return repositoryId
      ? await loadActiveFactoryContext(ctx, workOrder.projectId, repositoryId)
      : null;
  },
});

export const create = mutation({
  args: { repositoryId: v.id("workspaceRepositories"), name: v.string(), purpose: v.optional(factoryPurpose) },
  handler: async (ctx, args) => {
    const repository = await ctx.db.get(args.repositoryId);
    if (!repository) throw new Error("Repository connection is unavailable or unauthorized.");
    const access = await requireWorkspacePermission(
      ctx,
      repository.projectId,
      FACTORY_PERMISSIONS.MANAGE_AUTOMATION
    );
    const purpose = args.purpose ?? "SOFTWARE";
    const existingDefinitions = await ctx.db.query("factoryDefinitions")
      .withIndex("by_repository", (q) => q.eq("repositoryId", repository._id))
      .collect();
    const existing = existingDefinitions.find((definition) => definition.status !== "ARCHIVED" && (definition.purpose ?? "SOFTWARE") === purpose);
    if (existing) return existing._id;
    const now = Date.now();
    return await ctx.db.insert("factoryDefinitions", {
      tenantId: repository.tenantId,
      projectId: repository.projectId,
      repositoryId: repository._id,
      purpose,
      name: args.name.trim() || `${repository.displayName} Factory`,
      status: "DRAFT",
      latestVersion: 0,
      createdBy: access.actorId,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const createSandboxProfile = mutation({
  args: {
    projectId: v.id("projects"),
    profileKey: v.string(),
    providerProfile: v.string(),
    providerProfileVersion: v.string(),
    machineImage: v.string(),
    cpu: v.number(),
    memoryMb: v.number(),
    diskGb: v.number(),
    maxRuntimeMs: v.number(),
    resultPollIntervalMs: v.number(),
    resultRetentionMs: v.number(),
    networkEgress: v.union(v.literal("UNRESTRICTED"), v.literal("RESTRICTED_ALLOWLIST")),
    egressAllowlist: v.array(v.string()),
    spendLimitUsd: v.number(),
    spendEnforcement: v.union(v.literal("PROVIDER_KEY_LIMIT"), v.literal("OBSERVATION_ONLY")),
    previewMode: v.union(v.literal("DISABLED"), v.literal("PRIVATE_PROXY")),
    previewPort: v.optional(v.number()),
    readinessEvidence: v.object({
      providerReachable: v.boolean(),
      capacityAvailable: v.boolean(),
      automaticCredentialCount: v.number(),
      egressEnforcementProven: v.boolean(),
      evidenceReference: v.string(),
    }),
    certification: v.optional(v.object({
      liveCertified: v.literal(true),
      evidencePacketReference: v.string(),
      evidencePacketDigest: v.string(),
      egressPolicyDigest: v.string(),
      credentialRevocationBoundMs: v.number(),
      supportedWorkloadClasses: v.array(v.string()),
      supportedRiskClasses: v.array(sandboxRiskClass),
      workloadTimeouts: v.array(v.object({ workloadClass: v.string(), maxRuntimeMs: v.number() })),
      security: v.any(),
    })),
  },
  handler: async (ctx, args) => {
    const access = await requireWorkspacePermission(ctx, args.projectId, FACTORY_PERMISSIONS.MANAGE_AUTOMATION);
    const project = await ctx.db.get(args.projectId);
    if (!project) throw new Error("Sandbox Profile workspace is unavailable.");
    const profileKey = args.profileKey.trim();
    if (!/^[a-z0-9][a-z0-9-]{2,63}$/.test(profileKey)) throw new Error("Sandbox Profile key must be a stable lowercase identifier.");
    if (!args.providerProfile.trim() || !args.providerProfileVersion.trim() || !args.machineImage.trim()) throw new Error("Sandbox provider and image identity are required.");
    if (!Number.isInteger(args.cpu) || args.cpu < 1 || args.cpu > 64
      || !Number.isInteger(args.memoryMb) || args.memoryMb < 512 || args.memoryMb > 262_144
      || !Number.isInteger(args.diskGb) || args.diskGb < 5 || args.diskGb > 2_048) throw new Error("Sandbox machine resources are outside allowed bounds.");
    if (!Number.isInteger(args.maxRuntimeMs) || args.maxRuntimeMs < 60_000 || args.maxRuntimeMs > 8 * 60 * 60 * 1_000) throw new Error("Sandbox runtime is outside the one-minute to eight-hour bound.");
    if (!Number.isInteger(args.resultPollIntervalMs) || args.resultPollIntervalMs < 250 || args.resultPollIntervalMs > 60_000) throw new Error("Sandbox result polling interval is invalid.");
    if (!Number.isInteger(args.resultRetentionMs) || args.resultRetentionMs < args.maxRuntimeMs || args.resultRetentionMs > 7 * 24 * 60 * 60 * 1_000) throw new Error("Sandbox result retention must cover the runtime and remain within seven days.");
    if (!Number.isFinite(args.spendLimitUsd) || args.spendLimitUsd <= 0 || args.spendLimitUsd > 100) throw new Error("Sandbox spend limit must be between $0 and $100.");
    if (args.previewMode === "PRIVATE_PROXY" && (!Number.isInteger(args.previewPort) || args.previewPort! < 1 || args.previewPort! > 65_535)) throw new Error("Private preview requires a valid port.");
    if (args.networkEgress === "RESTRICTED_ALLOWLIST" && !args.readinessEvidence.egressEnforcementProven) throw new Error("Restricted egress requires enforcement evidence.");
    if (!args.readinessEvidence.evidenceReference.trim()) throw new Error("Provider readiness evidence reference is required.");
    const existing = await ctx.db.query("factorySandboxProfiles")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .filter((q) => q.eq(q.field("profileKey"), profileKey))
      .collect();
    const version = existing.reduce((latest, profile) => Math.max(latest, profile.version), 0) + 1;
    const now = Date.now();
    const blockedReasons = [
      !args.readinessEvidence.providerReachable ? "Provider API is unreachable." : null,
      !args.readinessEvidence.capacityAvailable ? "Provider account has no allocation capacity." : null,
      args.readinessEvidence.automaticCredentialCount > 0 ? "Automatic provider credentials are attached." : null,
      !args.certification ? "Live exe.dev lifecycle certification is not recorded." : null,
    ].filter((reason): reason is string => Boolean(reason));
    const readinessState = blockedReasons.length > 0
      ? "BLOCKED" as const
      : args.networkEgress === "UNRESTRICTED" || Boolean(args.certification)
        ? "DEGRADED" as const
        : "READY" as const;
    const readinessReason = blockedReasons.join(" ") || (readinessState === "DEGRADED"
      ? args.certification
        ? "Guest-kernel nftables enforcement is proven; provider-enforced egress is unavailable."
        : "Provider egress is unrestricted and represented honestly."
      : "Provider reachability, capacity, credential isolation, and restricted egress are evidenced.");
    const snapshot = {
      schema: "factory-sandbox-profile/v1",
      profileKey,
      version,
      provider: "EXE_DEV",
      providerProfile: args.providerProfile.trim(),
      providerProfileVersion: args.providerProfileVersion.trim(),
      machine: { image: args.machineImage.trim(), cpu: args.cpu, memoryMb: args.memoryMb, diskGb: args.diskGb },
      supervisor: { version: "mission-control-supervisor/v1", transport: "SSH" },
      runtime: { maxRuntimeMs: args.maxRuntimeMs, resultPollIntervalMs: args.resultPollIntervalMs, resultRetentionMs: args.resultRetentionMs },
      network: { egress: args.networkEgress, egressAllowlist: [...new Set(args.egressAllowlist)].sort(), publicIngress: false, exposedPorts: [] },
      credentials: { inference: "ATTEMPT_SCOPED_OPENROUTER", repositoryAccess: "CONTROL_PLANE_SNAPSHOT", githubAuthority: "NONE", providerAuthority: "NONE" },
      spend: { maxUsd: args.spendLimitUsd, enforcement: args.spendEnforcement },
      teardown: { terminateOnEveryTerminalState: true, verifyResourceAbsent: true, supportsResume: false },
      preview: { mode: args.previewMode, ...(args.previewPort ? { port: args.previewPort } : {}) },
      readiness: {
        state: readinessState,
        checkedAt: now,
        reason: readinessReason,
        egressEnforcementProven: args.readinessEvidence.egressEnforcementProven,
        liveCertified: args.certification?.liveCertified ?? false,
        providerEgressEnforcementProven: false,
        guestEgressEnforcementProven: Boolean(args.certification && args.readinessEvidence.egressEnforcementProven),
        evidenceReference: args.readinessEvidence.evidenceReference.trim(),
      },
      ...(args.certification ? {
        qualification: {
          evidencePacketReference: args.certification.evidencePacketReference.trim(),
          evidencePacketDigest: args.certification.evidencePacketDigest.toLowerCase(),
          egressPolicyDigest: args.certification.egressPolicyDigest.toLowerCase(),
          credentialRevocationBoundMs: args.certification.credentialRevocationBoundMs,
          supportedWorkloadClasses: [...new Set(args.certification.supportedWorkloadClasses)].sort(),
          supportedRiskClasses: [...new Set(args.certification.supportedRiskClasses)].sort(),
          workloadTimeouts: [...args.certification.workloadTimeouts]
            .map((item) => ({ workloadClass: item.workloadClass.trim(), maxRuntimeMs: item.maxRuntimeMs }))
            .sort((left, right) => left.workloadClass.localeCompare(right.workloadClass)),
          providerEgress: {
            providerEnforced: false,
            guestEnforced: true,
            enforcement: "GUEST_NFTABLES",
            limitation: "PROVIDER_ENFORCEMENT_UNAVAILABLE",
          },
        },
        security: args.certification.security,
      } : {}),
    };
    if (args.certification) {
      const issues = qualifiedSandboxSnapshotIssues(snapshot);
      if (issues.length) throw new Error(`Certified hardened Sandbox Profile is invalid (${issues.join(", ")}).`);
    }
    const profileDigest = `sha256:${computeCanonicalHash({ namespace: "factory-sandbox-profile/v1", value: snapshot })}`;
    return await ctx.db.insert("factorySandboxProfiles", {
      tenantId: project.tenantId,
      projectId: args.projectId,
      profileKey,
      version,
      profileDigest,
      provider: "EXE_DEV",
      providerProfile: snapshot.providerProfile,
      providerProfileVersion: snapshot.providerProfileVersion,
      machineImage: snapshot.machine.image,
      cpu: args.cpu,
      memoryMb: args.memoryMb,
      diskGb: args.diskGb,
      supervisorVersion: "mission-control-supervisor/v1",
      executorTransport: "SSH",
      maxRuntimeMs: args.maxRuntimeMs,
      resultPollIntervalMs: args.resultPollIntervalMs,
      resultRetentionMs: args.resultRetentionMs,
      networkEgress: args.networkEgress,
      egressAllowlist: snapshot.network.egressAllowlist,
      publicIngress: false,
      exposedPorts: [],
      inferenceCredentialMode: "ATTEMPT_SCOPED_OPENROUTER",
      repositoryAccessMode: "CONTROL_PLANE_SNAPSHOT",
      spendLimitUsd: args.spendLimitUsd,
      spendEnforcement: args.spendEnforcement,
      previewMode: args.previewMode,
      previewPort: args.previewPort,
      readinessState,
      readinessReason,
      readinessCheckedAt: now,
      readinessExpiresAt: now + 24 * 60 * 60 * 1_000,
      egressEnforcementProven: args.readinessEvidence.egressEnforcementProven,
      providerEgressEnforcementProven: false,
      guestEgressEnforcementProven: Boolean(args.certification && args.readinessEvidence.egressEnforcementProven),
      immutableSnapshot: snapshot,
      admissionState: "QUALIFICATION_ONLY",
      status: "ACTIVE",
      createdBy: access.actorId,
      createdAt: now,
    });
  },
});

export const promoteSandboxProfile = mutation({
  args: {
    sandboxProfileId: v.id("factorySandboxProfiles"),
    expectedProfileDigest: v.string(),
  },
  handler: async (ctx, args) => {
    const profile = await ctx.db.get(args.sandboxProfileId);
    if (!profile) throw new Error("Sandbox Profile is unavailable.");
    const access = await requireWorkspacePermission(ctx, profile.projectId, FACTORY_PERMISSIONS.APPROVE);
    if (profile.admissionState === "PRODUCTION_PILOT_ELIGIBLE" || profile.admissionDigest) {
      throw new Error("Sandbox Profile promotion is immutable once recorded.");
    }
    if (profile.status !== "ACTIVE" || profile.profileDigest !== args.expectedProfileDigest) {
      throw new Error("Sandbox Profile identity does not match the reviewed immutable profile.");
    }
    const issues = qualifiedSandboxSnapshotIssues(profile.immutableSnapshot);
    if (issues.length) throw new Error(`Sandbox Profile does not contain qualified hardened evidence (${issues.join(", ")}).`);
    const snapshot = profile.immutableSnapshot as any;
    const promotedAt = Date.now();
    const admissionSnapshot = {
      schema: SANDBOX_PROFILE_ADMISSION_SCHEMA,
      state: "PRODUCTION_PILOT_ELIGIBLE",
      profileDigest: profile.profileDigest,
      imageDigest: snapshot.security.image.digest,
      toolchainDigest: snapshot.security.toolchain.toolchainInputsSha256,
      securityProfileDigest: `sha256:${computeCanonicalHash(snapshot.security)}`,
      scope: {
        workloadClasses: snapshot.qualification.supportedWorkloadClasses,
        riskClasses: snapshot.qualification.supportedRiskClasses,
        workloadTimeouts: snapshot.qualification.workloadTimeouts,
      },
      providerEgress: snapshot.qualification.providerEgress,
      credentialRevocationBoundMs: snapshot.qualification.credentialRevocationBoundMs,
      evidence: {
        reference: snapshot.qualification.evidencePacketReference,
        digest: snapshot.qualification.evidencePacketDigest,
      },
      promotedBy: access.actorId,
      promotedAt,
      authority: {
        executionOnly: true,
        routing: false,
        verification: false,
        acceptance: false,
        publication: false,
        merge: false,
      },
    };
    const admissionDigest = `sha256:${computeCanonicalHash({
      namespace: SANDBOX_PROFILE_ADMISSION_SCHEMA,
      value: admissionSnapshot,
    })}`;
    await ctx.db.patch(profile._id, {
      admissionState: "PRODUCTION_PILOT_ELIGIBLE",
      admissionSnapshot,
      admissionDigest,
      promotedBy: access.actorId,
      promotedAt,
    });
    await ctx.db.insert("activities", {
      tenantId: profile.tenantId,
      projectId: profile.projectId,
      actorType: "HUMAN",
      actorId: access.actorId,
      action: "SANDBOX_PROFILE_PROMOTED",
      description: `Promoted ${profile.profileKey} v${profile.version} for production-pilot execution`,
      targetType: "FACTORY_SANDBOX_PROFILE",
      targetId: profile._id,
      metadata: { profileDigest: profile.profileDigest, admissionDigest },
    });
    return { sandboxProfileId: profile._id, profileDigest: profile.profileDigest, admissionDigest };
  },
});

export const createVersion = mutation({
  args: {
    factoryDefinitionId: v.id("factoryDefinitions"),
    workflowId: v.id("workflows"),
    modelCatalogId: v.optional(v.id("modelCatalog")),
    executor: v.object({ adapter: v.string(), version: v.string() }),
    executionBackend: v.optional(executionBackend),
    sandboxProfileId: v.optional(v.id("factorySandboxProfiles")),
    codeScopeIds: v.array(v.id("repositoryCodeScopes")),
    agentBindings: v.array(v.object({
      workflowAgentId: v.string(),
      agentVersionId: v.id("agentVersions"),
    })),
    policyEnvelopeId: v.optional(v.id("policyEnvelopes")),
    environmentId: v.optional(v.id("environments")),
    budget,
    verifierIds: v.array(v.id("contextVerifiers")),
    riskBoundary,
    recovery,
  },
  handler: async (ctx, args) => {
    const definition = await ctx.db.get(args.factoryDefinitionId);
    if (!definition || definition.status === "ARCHIVED") throw new Error("Factory is unavailable or archived.");
    const access = await requireWorkspacePermission(ctx, definition.projectId, FACTORY_PERMISSIONS.MANAGE_AUTOMATION);
    const repository = await ctx.db.get(definition.repositoryId);
    const workflow = await ctx.db.get(args.workflowId);
    const policy = args.policyEnvelopeId ? await ctx.db.get(args.policyEnvelopeId) : null;
    const environment = args.environmentId ? await ctx.db.get(args.environmentId) : null;
    const [verifiers, codeScopes, agentVersions, sandboxProfile, modelCatalog] = await Promise.all([
      Promise.all(args.verifierIds.map((id) => ctx.db.get(id))),
      Promise.all(args.codeScopeIds.map((id) => ctx.db.get(id))),
      Promise.all(args.agentBindings.map((binding) => ctx.db.get(binding.agentVersionId))),
      args.sandboxProfileId ? ctx.db.get(args.sandboxProfileId) : null,
      loadModelCatalogForProject(ctx, definition.projectId),
    ]);
    if (!repository || repository.projectId !== definition.projectId) throw new Error("Factory repository scope is invalid.");
    if (!workflow) throw new Error("Workflow not found.");
    if (workflow.projectId !== definition.projectId || workflow.contractVersion !== "factory-workflow-contract/v1") {
      throw new Error("Factory versions require a current workspace-owned production workflow.");
    }
    const workflowContractIssues = factoryWorkflowContractIssues(workflow);
    if (workflowContractIssues.length > 0) {
      throw new Error(`Workflow execution contract is unsafe (${workflowContractIssues.join(", ")}).`);
    }
    if (policy && policy.projectId && policy.projectId !== definition.projectId) throw new Error("Policy is outside the Factory workspace.");
    if (environment && definition.tenantId && environment.tenantId !== definition.tenantId) throw new Error("Environment is outside the Factory company.");
    if (verifiers.some((item) => !item || item.projectId !== definition.projectId)) throw new Error("Verifier is outside the Factory workspace.");
    if (args.codeScopeIds.length === 0 || codeScopes.some((scope) =>
      !scope || !scope.active || scope.repositoryId !== repository._id || scope.projectId !== definition.projectId
    )) {
      throw new Error("Select at least one active code scope from the Factory repository.");
    }
    const workflowAgentIds = new Set(workflow.agents.map((agent) => agent.id));
    const boundAgentIds = new Set(args.agentBindings.map((binding) => binding.workflowAgentId));
    if (
      args.agentBindings.length !== workflowAgentIds.size
      || boundAgentIds.size !== workflowAgentIds.size
      || [...workflowAgentIds].some((id) => !boundAgentIds.has(id))
      || args.agentBindings.some((binding) => !workflowAgentIds.has(binding.workflowAgentId))
    ) {
      throw new Error("Every workflow agent must bind to exactly one approved agent version.");
    }
    for (let index = 0; index < agentVersions.length; index += 1) {
      const version = agentVersions[index];
      if (!version || version.status !== "APPROVED" || (version.projectId && version.projectId !== definition.projectId)) {
        throw new Error("Every workflow agent binding must reference an approved workspace agent version.");
      }
      const template = await ctx.db.get(version.templateId);
      if (!template?.active || (template.projectId && template.projectId !== definition.projectId)) {
        throw new Error("Every workflow agent binding must reference an active workspace agent template.");
      }
      if (!version.genome.promptBundleHash.trim() || !version.genome.toolManifestHash.trim() || !version.genome.modelConfig.modelId.trim()) {
        throw new Error("Approved agent versions require prompt, tool, and model manifests.");
      }
    }
    const harness = resolveFrozenHarnessBinding({ executor: args.executor });
    const firstStepAgent = workflow.steps[0]?.agent;
    const primaryAgentIndex = args.agentBindings.findIndex((binding) => binding.workflowAgentId === firstStepAgent);
    const primaryModel = agentVersions[primaryAgentIndex >= 0 ? primaryAgentIndex : 0]?.genome.modelConfig;
    if (!primaryModel || !harnessSupportsModel(harness.capabilityManifest, primaryModel.provider, primaryModel.modelId)) {
      throw new Error(`${args.executor.adapter}/${args.executor.version} does not admit the selected workflow model route.`);
    }
    const matchingModelRoutes = modelCatalog.filter((route) =>
      (!args.modelCatalogId || route._id === args.modelCatalogId)
      && route.provider === primaryModel.provider.trim().toLowerCase()
      && route.modelId === primaryModel.modelId
    );
    if (matchingModelRoutes.length !== 1) {
      throw new Error("Factory versions require exactly one explicitly qualified model-catalog route.");
    }
    const modelRoute = matchingModelRoutes[0];
    const routeSnapshot = modelRoute.routeSnapshot as Record<string, any> | undefined;
    if (!modelRouteProductionEligible(modelRoute)
      || !routeSnapshot
      || exactModelRouteDigest(routeSnapshot) !== modelRoute.routeDigest
      || routeSnapshot.capabilityIdentity?.adapter !== harness.adapter
      || routeSnapshot.capabilityIdentity?.version !== harness.version
      || routeSnapshot.capabilityIdentity?.capabilityManifestDigest !== harness.capabilityManifestSha256
      || routeSnapshot.capabilityIdentity?.effectiveConfigSha256 !== harness.effectiveConfigSha256) {
      throw new Error("Factory versions require the exact promoted model route for the frozen harness identity.");
    }
    if (!validFactoryExecutorBinding(args.executor)) {
      throw new Error("Factory executor requires a bounded exact harness adapter/version binding.");
    }
    if (!genericHarnessV1RecoveryReady(args.recovery)) {
      throw new Error("Generic Harness Contract V1 supports cancel and bounded retry, but does not support pause or in-process resume.");
    }
    if (!validFactoryBudget(args.budget)) {
      throw new Error("Factory budget must use positive V1 limits: cost <= $1,000, runtime <= 480 minutes, attempts <= 3.");
    }
    const selectedExecutionBackend = args.executionBackend ?? "persistent-worker";
    if (!harness.capabilityManifest.admission.executionBackends.includes(selectedExecutionBackend)) {
      throw new Error(`${args.executor.adapter}/${args.executor.version} does not support ${selectedExecutionBackend}.`);
    }
    if (harness.capabilityManifest.admission.maturity === "EXPERIMENTAL") {
      const bindings = await ctx.db.query("workspaceHostBindings")
        .withIndex("by_project", (q) => q.eq("projectId", definition.projectId))
        .collect();
      const requiredSandboxCapabilities = selectedExecutionBackend === "remote-sandbox"
        ? ["git-worktree", "workspace-write", "remote-sandbox", "sandbox-provider:exe-dev"]
        : ["git-worktree", "workspace-write"];
      const eligible = bindings.some((binding) => factoryWorkerEligibility({
        worker: {
          workerId: binding.hostId,
          status: binding.status,
          dirty: binding.dirty,
          networkPolicyStatus: binding.networkPolicyStatus,
          secretPolicyStatus: binding.secretPolicyStatus,
          attestedAt: binding.attestedAt,
          capacity: binding.capacity,
          workerRuntime: binding.workerRuntime ? {
            ...binding.workerRuntime,
            repositoryAccess: binding.workerRuntime.repositoryAccess.map((item) => ({ ...item, repositoryId: String(item.repositoryId) })),
          } : undefined,
        },
        requirements: {
          repositoryId: String(repository._id),
          executor: {
            adapter: harness.adapter,
            version: harness.version,
            capabilityManifestSha256: harness.capabilityManifestSha256,
            effectiveConfigSha256: harness.effectiveConfigSha256,
          },
          provider: primaryModel.provider,
          model: primaryModel.modelId,
          harnessCapabilities: factoryHarnessCapabilityRequirements("WORKSPACE_WRITE"),
          isolation: "WORKSPACE_WRITE",
          sandboxCapabilities: requiredSandboxCapabilities,
          executionBackend: selectedExecutionBackend,
        },
        activeWorkerLeaseCount: 0,
        now: Date.now(),
      }).eligible);
      if (!eligible) {
        throw new Error("Experimental harness selection requires a current eligible canonical worker advertising the exact manifest and configuration.");
      }
    }
    if (selectedExecutionBackend === "remote-sandbox") {
      if (!sandboxProfile
        || sandboxProfile.projectId !== definition.projectId
        || sandboxProfile.status !== "ACTIVE"
        || sandboxProfile.readinessState === "BLOCKED"
        || sandboxProfile.readinessExpiresAt <= Date.now()
        || !sandboxProfileProductionEligible(sandboxProfile)) {
        throw new Error("Remote sandbox execution requires a current dispatchable Sandbox Profile in this workspace.");
      }
      if (routeSnapshot.runtimeIdentity?.imageDigest !== (sandboxProfile!.immutableSnapshot as any)?.security?.image?.digest) {
        throw new Error("Remote model route image identity does not match the promoted Sandbox Profile.");
      }
      if (!(sandboxProfile!.admissionSnapshot as any)?.scope?.riskClasses?.includes(args.riskBoundary)) {
        throw new Error("The promoted Sandbox Profile is not eligible for this Factory risk boundary.");
      }
    } else if (args.sandboxProfileId) {
      throw new Error("A Sandbox Profile can only be attached to the remote-sandbox execution backend.");
    } else if (!routeSnapshot.runtimeIdentity?.executableSha256) {
      throw new Error("Local model routes require an exact executable digest.");
    }
    const modelQualification = modelRoute.qualificationSnapshot as Record<string, any>;
    if (!modelQualification.scope?.riskClasses?.includes(args.riskBoundary)) {
      throw new Error("The exact model route is not qualified for this Factory risk boundary.");
    }

    const sandboxProfileDigest = selectedExecutionBackend === "remote-sandbox" ? sandboxProfile!.profileDigest : undefined;
    if (!validFactoryExecutionBinding({
      executionBackend: selectedExecutionBackend,
      sandboxProfileId: args.sandboxProfileId ? String(args.sandboxProfileId) : undefined,
      sandboxProfileDigest,
      riskBoundary: args.riskBoundary,
      recovery: args.recovery,
    })) {
      throw new Error("Factory execution backend, risk, Sandbox Profile, and recovery settings are incompatible.");
    }

    const configuration: FactoryConfigurationInput = {
      purpose: definition.purpose ?? "SOFTWARE",
      repositoryId: String(repository._id),
      workflowId: String(workflow._id),
      executor: args.executor,
      harnessCapabilityManifest: harness.capabilityManifest,
      harnessCapabilityManifestDigest: harness.capabilityManifestSha256,
      harnessEffectiveConfigSha256: harness.effectiveConfigSha256,
      modelCatalogId: String(modelRoute._id),
      modelRouteDigest: modelRoute.routeDigest!,
      executionBackend: selectedExecutionBackend,
      sandboxProfileId: args.sandboxProfileId ? String(args.sandboxProfileId) : undefined,
      sandboxProfileDigest,
      codeScopeIds: args.codeScopeIds.map(String),
      agentBindings: args.agentBindings.map((binding) => ({
        workflowAgentId: binding.workflowAgentId,
        agentVersionId: String(binding.agentVersionId),
      })),
      policyEnvelopeId: args.policyEnvelopeId ? String(args.policyEnvelopeId) : undefined,
      environmentId: args.environmentId ? String(args.environmentId) : undefined,
      budget: args.budget,
      verifierIds: args.verifierIds.map(String),
      riskBoundary: args.riskBoundary,
      recovery: args.recovery,
    };
    const configurationDigest = factoryConfigurationDigest(configuration);
    const duplicate = await ctx.db.query("factoryDefinitionVersions")
      .withIndex("by_digest", (q) => q.eq("configurationDigest", configurationDigest))
      .filter((q) => q.eq(q.field("factoryDefinitionId"), definition._id))
      .first();
    if (duplicate) return duplicate._id;
    const version = definition.latestVersion + 1;
    const versionId = await ctx.db.insert("factoryDefinitionVersions", {
      tenantId: definition.tenantId,
      projectId: definition.projectId,
      factoryDefinitionId: definition._id,
      version,
      configurationDigest,
      repositoryId: repository._id,
      purpose: definition.purpose ?? "SOFTWARE",
      workflowId: workflow._id,
      executor: args.executor,
      harnessCapabilityManifest: harness.capabilityManifest,
      harnessCapabilityManifestDigest: harness.capabilityManifestSha256,
      harnessEffectiveConfigSha256: harness.effectiveConfigSha256,
      modelCatalogId: modelRoute._id,
      modelRouteDigest: modelRoute.routeDigest,
      modelRouteSnapshot: modelRoute.routeSnapshot,
      modelQualificationDigest: modelRoute.qualificationDigest,
      modelQualificationSnapshot: modelRoute.qualificationSnapshot,
      executionBackend: selectedExecutionBackend,
      sandboxProfileId: args.sandboxProfileId,
      sandboxProfileDigest,
      sandboxProfileSnapshot: selectedExecutionBackend === "remote-sandbox" ? sandboxProfile!.immutableSnapshot : undefined,
      codeScopeIds: args.codeScopeIds,
      agentBindings: args.agentBindings,
      policyEnvelopeId: args.policyEnvelopeId,
      environmentId: args.environmentId,
      budget: args.budget,
      verifierIds: args.verifierIds,
      riskBoundary: args.riskBoundary,
      recovery: args.recovery,
      createdBy: access.actorId,
      createdAt: Date.now(),
    });
    await ctx.db.patch(definition._id, { latestVersion: version, updatedAt: Date.now() });
    return versionId;
  },
});

export const assessReadiness = mutation({
  args: { factoryDefinitionVersionId: v.id("factoryDefinitionVersions") },
  handler: async (ctx, args) => {
    const version = await ctx.db.get(args.factoryDefinitionVersionId);
    if (!version) throw new Error("Factory version not found.");
    const access = await requireWorkspacePermission(ctx, version.projectId, FACTORY_PERMISSIONS.MANAGE_AUTOMATION);
    const now = Date.now();
    const expiry = now + 24 * 60 * 60 * 1_000;
    const [repository, workflow, policy, installation, bindings, verifiers, codeScopes, agentVersions, sandboxProfile, modelRoute] = await Promise.all([
      ctx.db.get(version.repositoryId),
      ctx.db.get(version.workflowId),
      version.policyEnvelopeId ? ctx.db.get(version.policyEnvelopeId) : null,
      ctx.db.query("githubAppInstallations").withIndex("by_repository", (q) => q.eq("repositoryId", version.repositoryId)).first(),
      ctx.db.query("workspaceHostBindings").withIndex("by_project", (q) => q.eq("projectId", version.projectId)).collect(),
      Promise.all(version.verifierIds.map((id) => ctx.db.get(id))),
      Promise.all((version.codeScopeIds ?? []).map((id) => ctx.db.get(id))),
      Promise.all((version.agentBindings ?? []).map((binding) => ctx.db.get(binding.agentVersionId))),
      version.sandboxProfileId ? ctx.db.get(version.sandboxProfileId) : null,
      version.modelCatalogId ? ctx.db.get(version.modelCatalogId) : null,
    ]);
    const github = installation ? evaluateGithubAppCapabilities(installation) : null;
    const agentTemplates = await Promise.all(agentVersions.map((agentVersion) =>
      agentVersion ? ctx.db.get(agentVersion.templateId) : null
    ));
    const githubReady = Boolean(
      repository && installation?.status === "CONNECTED" && github?.ready &&
      !githubInstallationIsStale(installation.verifiedAt, now)
    );
    const selectedExecutionBackend = version.executionBackend ?? "persistent-worker";
    const frozenHarness = resolveFrozenHarnessBinding(version);
    const primaryAgentIndex = (version.agentBindings ?? []).findIndex((binding) => binding.workflowAgentId === workflow?.steps?.[0]?.agent);
    const primaryModel = agentVersions[primaryAgentIndex >= 0 ? primaryAgentIndex : 0]?.genome.modelConfig;
    const requiredSandboxCapabilities = selectedExecutionBackend === "remote-sandbox"
      ? ["git-worktree", "workspace-write", "remote-sandbox", "sandbox-provider:exe-dev"]
      : ["git-worktree", "workspace-write"];
    const host = repository
      ? bindings.find((binding) => factoryWorkerEligibility({
          worker: {
            workerId: binding.hostId,
            status: binding.status,
            dirty: binding.dirty,
            networkPolicyStatus: binding.networkPolicyStatus,
            secretPolicyStatus: binding.secretPolicyStatus,
            attestedAt: binding.attestedAt,
            capacity: binding.capacity,
            workerRuntime: binding.workerRuntime ? {
              ...binding.workerRuntime,
              repositoryAccess: binding.workerRuntime.repositoryAccess.map((item) => ({ ...item, repositoryId: String(item.repositoryId) })),
              factoryVersionBindings: binding.workerRuntime.factoryVersionBindings?.map((item) => ({
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
            },
            provider: primaryModel?.provider ?? null,
            model: primaryModel?.modelId ?? null,
            harnessCapabilities: factoryHarnessCapabilityRequirements("WORKSPACE_WRITE"),
            isolation: "WORKSPACE_WRITE",
            sandboxCapabilities: requiredSandboxCapabilities,
            executionBackend: selectedExecutionBackend,
            factoryDefinitionVersionId: String(version._id),
            factoryConfigurationDigest: version.configurationDigest,
            modelRouteDigest: version.modelRouteDigest,
            sandboxProfileDigest: version.sandboxProfileDigest,
          },
          activeWorkerLeaseCount: 0,
          now,
        }).eligible) ?? null
      : null;
    const sandboxProfileReady = selectedExecutionBackend !== "remote-sandbox" || Boolean(
      sandboxProfile
      && sandboxProfile._id === version.sandboxProfileId
      && sandboxProfile.profileDigest === version.sandboxProfileDigest
      && sandboxProfile.status === "ACTIVE"
      && sandboxProfile.readinessState !== "BLOCKED"
      && sandboxProfile.readinessExpiresAt > now
      && sandboxProfileProductionEligible(sandboxProfile)
    );
    const modelRouteReady = Boolean(
      modelRoute
      && modelRoute._id === version.modelCatalogId
      && modelRoute.routeSnapshot
      && modelRoute.routeDigest === version.modelRouteDigest
      && exactModelRouteDigest(modelRoute.routeSnapshot) === version.modelRouteDigest
      && JSON.stringify(modelRoute.routeSnapshot) === JSON.stringify(version.modelRouteSnapshot)
      && modelRoute.qualificationDigest === version.modelQualificationDigest
      && JSON.stringify(modelRoute.qualificationSnapshot) === JSON.stringify(version.modelQualificationSnapshot)
      && modelRouteProductionEligible(modelRoute)
    );
    const costEnforcement = assessFactoryCostEnforcement({
      deploymentClass: process.env.MC_BACKEND_DEPLOYMENT_CLASS as "local" | "shared" | "production" | undefined,
      executionBackend: selectedExecutionBackend,
      maxCostUsd: version.budget.maxCostUsd,
      maxAttempts: version.budget.maxAttempts,
      sandboxSpend: (sandboxProfile?.immutableSnapshot as any)?.spend,
    });
    const checks = [
      check("github", "GitHub App connection", githubReady, now, expiry, "Install or repair the exact least-privilege GitHub App connection."),
      check("repository", "Repository access", repository?.status === "READY", now, expiry, "Validate repository access before activation."),
      check("workflow", "Workflow version", workflow?.active === true, now, undefined, "Select an active versioned workflow."),
      check("workflow-contract", "Structured workflow contract", factoryWorkflowContractIssues(workflow).length === 0, now, undefined, "Replace heuristic completion and provider authority with schema-validated handoffs."),
      check("executor", "Generic harness adapter", validFactoryExecutorBinding(version.executor), now, undefined, "Select an exact adapter/version advertised by the canonical worker."),
      check("model-route", "Exact qualified model route", modelRouteReady, now, undefined, "Create a new Factory version bound to an enabled, evidence-qualified exact model route."),
      check("code-scopes", "Frozen code scopes", Boolean(
        version.codeScopeIds?.length
        && repository
        && codeScopes.every((scope) => scope?.active && scope.repositoryId === repository._id)
      ), now, undefined, "Create a new Factory version with at least one active repository code scope."),
      check("agent-manifests", "Approved agent manifests", Boolean(
        workflow
        && version.agentBindings?.length === workflow.agents.length
        && new Set(version.agentBindings?.map((binding) => binding.workflowAgentId)).size === workflow.agents.length
        && agentVersions.every((agentVersion) =>
          agentVersion?.status === "APPROVED"
          && Boolean(agentVersion.genome.promptBundleHash.trim())
          && Boolean(agentVersion.genome.toolManifestHash.trim())
          && Boolean(agentVersion.genome.modelConfig.modelId.trim())
        )
        && agentTemplates.every((template) => template?.active)
      ), now, undefined, "Bind every workflow agent to an approved agent version."),
      check("policy", "Governance policy", Boolean(policy?.active), now, undefined, "Select an active workspace policy envelope."),
      check("budget", "Enforceable bounded budget", validFactoryBudget(version.budget) && costEnforcement.allowed, now, undefined,
        costEnforcement.allowed === true
          ? "Set positive V1 limits: cost <= $1,000, runtime <= 480 minutes, attempts <= 3."
          : `Use an Attempt-scoped provider key cap whose aggregate maximum fits the Factory budget (${costEnforcement.reason}). Persistent workers are local-only until their provider exposes a hard spend cap.`),
      check("verifiers", "Independent verifiers", verifiers.length > 0 && verifiers.every((item) => item?.active && item.projectId === version.projectId), now, expiry, "Select at least one active workspace verifier."),
      check("sandbox-profile", "Sandbox Profile", sandboxProfileReady, now, expiry, "Select a current dispatchable Sandbox Profile or use Local execution."),
      check("host", "Canonical worker admission", Boolean(host), now, expiry, `Report a clean current worker offering ${selectedExecutionBackend} and its required capabilities.`),
      check("recovery", "Executor-compatible recovery", genericHarnessV1RecoveryReady(version.recovery), now, undefined, "Enable cancel and bounded retry; Generic Harness Contract V1 does not add pause or in-process resume authority."),
    ];
    const status = checks.every((item) => item.status === "VERIFIED") ? "PASS" as const : "BLOCKED" as const;
    return await ctx.db.insert("factoryReadinessAssessments", {
      tenantId: version.tenantId,
      projectId: version.projectId,
      factoryDefinitionId: version.factoryDefinitionId,
      factoryDefinitionVersionId: version._id,
      configurationDigest: version.configurationDigest,
      status,
      checks,
      assessedBy: access.actorId,
      assessedAt: now,
      expiresAt: expiry,
    });
  },
});

export const activate = mutation({
  args: { factoryDefinitionVersionId: v.id("factoryDefinitionVersions") },
  handler: async (ctx, args) => {
    const version = await ctx.db.get(args.factoryDefinitionVersionId);
    if (!version) throw new Error("Factory version not found.");
    const access = await requireWorkspacePermission(ctx, version.projectId, FACTORY_PERMISSIONS.APPROVE);
    const assessments = await ctx.db.query("factoryReadinessAssessments")
      .withIndex("by_version", (q) => q.eq("factoryDefinitionVersionId", version._id))
      .collect();
    const latest = assessments.sort((left, right) => right.assessedAt - left.assessedAt)[0];
    if (!latest || latest.status !== "PASS" || latest.expiresAt <= Date.now() || latest.configurationDigest !== version.configurationDigest) {
      throw new Error("A current passing readiness assessment for this exact Factory version is required.");
    }
    const definition = await ctx.db.get(version.factoryDefinitionId);
    if (!definition) throw new Error("Factory not found.");
    const now = Date.now();
    await ctx.db.patch(definition._id, { status: "ACTIVE", activeVersionId: version._id, updatedAt: now });
    await ctx.db.insert("activities", {
      tenantId: definition.tenantId,
      projectId: definition.projectId,
      actorType: "HUMAN",
      actorId: access.actorId,
      action: "FACTORY_VERSION_ACTIVATED",
      description: `Activated ${definition.name} version ${version.version}`,
      targetType: "FACTORY_DEFINITION_VERSION",
      targetId: version._id,
      metadata: { configurationDigest: version.configurationDigest, assessmentId: latest._id },
    });
    return { factoryDefinitionId: definition._id, activeVersionId: version._id };
  },
});

function check(
  id: string,
  label: string,
  passing: boolean,
  checkedAt: number,
  expiresAt: number | undefined,
  remediation: string
) {
  return {
    id,
    label,
    status: passing ? "VERIFIED" as const : "MISSING" as const,
    checkedAt,
    expiresAt,
    remediation: passing ? undefined : remediation,
    rootBlocker: passing ? undefined : id,
  };
}
