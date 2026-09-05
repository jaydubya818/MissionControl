import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { validateHostBinding } from "./lib/workspaceBindings";
import { COMPANY_PERMISSIONS, requireWorkspaceAccess } from "./lib/companyAccess";
import {
  factoryWorkerRegistrationIssues,
  nextFactoryWorkerGeneration,
} from "./lib/factoryWorkerRuntime";

const bindingStatus = v.union(
  v.literal("READY"),
  v.literal("MISSING"),
  v.literal("STALE"),
  v.literal("DIRTY"),
  v.literal("ERROR")
);

export const listByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project?.tenantId) throw new Error("Workspace company assignment is incomplete");
    await requireWorkspaceAccess(ctx, project.tenantId, project._id);
    const rows = await ctx.db
      .query("workspaceHostBindings")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    return rows.sort((left, right) => right.checkedAt - left.checkedAt);
  },
});

export const report = mutation({
  args: {
    projectId: v.id("projects"),
    hostId: v.string(),
    repositoryId: v.optional(v.id("workspaceRepositories")),
    repository: v.string(),
    checkoutRoot: v.string(),
    observedBranch: v.optional(v.string()),
    observedCommit: v.optional(v.string()),
    baseBranch: v.optional(v.string()),
    baseCommit: v.optional(v.string()),
    dirty: v.boolean(),
    runtime: v.optional(v.string()),
    approvedModelIds: v.optional(v.array(v.string())),
    networkPolicyStatus: v.optional(v.union(v.literal("READY"), v.literal("BLOCKED"), v.literal("UNKNOWN"))),
    secretPolicyStatus: v.optional(v.union(v.literal("READY"), v.literal("BLOCKED"), v.literal("UNKNOWN"))),
    maxConcurrentRuns: v.optional(v.number()),
    currentRuns: v.optional(v.number()),
    workerRuntime: v.optional(v.object({
      sessionId: v.string(),
      hostRuntimeType: v.string(),
      executionBackends: v.array(v.string()),
      supportedExecutors: v.array(v.object({
        adapter: v.string(),
        version: v.string(),
        capabilityManifestSha256: v.string(),
        effectiveConfigSha256: v.string(),
        runtimeArtifact: v.any(),
        runtimeArtifactSha256: v.string(),
        capabilityManifest: v.any(),
        supportsCancel: v.boolean(),
        supportsResume: v.boolean(),
        isolationModes: v.array(v.union(v.literal("READ_ONLY"), v.literal("WORKSPACE_WRITE"))),
      })),
      sandboxCapabilities: v.array(v.string()),
      repositoryAccess: v.array(v.object({
        repositoryId: v.id("workspaceRepositories"),
        access: v.union(v.literal("READ"), v.literal("READ_WRITE")),
      })),
      factoryVersionBindings: v.optional(v.array(v.object({
        factoryDefinitionVersionId: v.id("factoryDefinitionVersions"),
        factoryConfigurationDigest: v.string(),
        adapter: v.string(),
        version: v.string(),
        provider: v.string(),
        model: v.string(),
        capabilityManifestSha256: v.string(),
        effectiveConfigSha256: v.string(),
        runtimeArtifactSha256: v.optional(v.string()),
        executionBackend: v.string(),
        modelRouteDigest: v.string(),
        sandboxProfileDigest: v.optional(v.string()),
        repositoryId: v.id("workspaceRepositories"),
      }))),
      readiness: v.union(
        v.literal("STARTING"),
        v.literal("READY"),
        v.literal("DRAINING"),
        v.literal("BLOCKED")
      ),
      draining: v.boolean(),
    })),
    attestedAt: v.optional(v.number()),
    status: bindingStatus,
    error: v.optional(v.string()),
    checkedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) throw new Error("Workspace not found");
    if (!project.tenantId) throw new Error("Workspace company assignment is incomplete");
    await requireWorkspaceAccess(ctx, project.tenantId, project._id, { permission: COMPANY_PERMISSIONS.DISPATCH_WORK });
    if (!project.githubRepo) throw new Error("Workspace repository is not configured");
    const repository = args.repositoryId ? await ctx.db.get(args.repositoryId) : null;
    if (args.repositoryId && (!repository || repository.projectId !== args.projectId || repository.repository !== args.repository)) {
      throw new Error("Worker repository access does not match the workspace repository binding");
    }
    const hostId = args.hostId.trim();
    const checkoutRoot = args.checkoutRoot.trim();
    const validationError = validateHostBinding({
      expectedRepository: repository?.repository ?? project.githubRepo,
      repository: args.repository,
      hostId,
      checkoutRoot,
    });
    if (validationError) throw new Error(validationError);
    if (args.workerRuntime && hostId.length > 200) throw new Error("Worker ID must be 200 characters or fewer");

    const checkedAt = args.workerRuntime ? Date.now() : (args.checkedAt ?? Date.now());
    if ((args.maxConcurrentRuns === undefined) !== (args.currentRuns === undefined)) throw new Error("Host capacity requires both maxConcurrentRuns and currentRuns");
    if (args.maxConcurrentRuns !== undefined && (!Number.isInteger(args.maxConcurrentRuns) || args.maxConcurrentRuns < 1)) throw new Error("Host maxConcurrentRuns must be a positive integer");
    if (args.currentRuns !== undefined && (!Number.isInteger(args.currentRuns) || args.currentRuns < 0)) throw new Error("Host currentRuns must be a non-negative integer");
    if (args.maxConcurrentRuns !== undefined && args.currentRuns! > args.maxConcurrentRuns) throw new Error("Host currentRuns cannot exceed maxConcurrentRuns");
    if (args.baseCommit && !/^[a-f0-9]{40,64}$/i.test(args.baseCommit)) throw new Error("Host base commit must be a full Git revision");
    if (args.workerRuntime) {
      const issues = factoryWorkerRegistrationIssues({
        ...args.workerRuntime,
        repositoryAccess: args.workerRuntime.repositoryAccess.map((item) => ({
          ...item,
          repositoryId: String(item.repositoryId),
        })),
        factoryVersionBindings: args.workerRuntime.factoryVersionBindings?.map((item) => ({
          ...item,
          factoryDefinitionVersionId: String(item.factoryDefinitionVersionId),
          repositoryId: String(item.repositoryId),
        })),
      });
      if (issues.length) throw new Error(`Worker runtime registration is invalid (${issues.join(", ")})`);
      if (!args.repositoryId || !args.workerRuntime.repositoryAccess.some((item) => item.repositoryId === args.repositoryId)) {
        throw new Error("Worker runtime must advertise the bound repository");
      }
      const advertisedRepositories = await Promise.all(
        args.workerRuntime.repositoryAccess.map((item) => ctx.db.get(item.repositoryId))
      );
      if (advertisedRepositories.some((item) => !item || item.projectId !== args.projectId)) {
        throw new Error("Worker runtime repository access cannot exceed its workspace scope");
      }
      if (args.workerRuntime.factoryVersionBindings?.some((item) => item.repositoryId !== args.repositoryId)) {
        throw new Error("Worker Factory Version bindings cannot exceed the bound repository scope");
      }
      const advertisedVersions = await Promise.all(
        (args.workerRuntime.factoryVersionBindings ?? []).map((item) => ctx.db.get(item.factoryDefinitionVersionId))
      );
      if (advertisedVersions.some((version, index) => {
        const binding = args.workerRuntime!.factoryVersionBindings![index];
        return !version
          || version.projectId !== args.projectId
          || version.repositoryId !== binding.repositoryId
          || version.configurationDigest !== binding.factoryConfigurationDigest
          || version.executor.adapter !== binding.adapter
          || version.executor.version !== binding.version
          || version.harnessCapabilityManifestDigest !== binding.capabilityManifestSha256
          || version.harnessEffectiveConfigSha256 !== binding.effectiveConfigSha256
          || version.harnessRuntimeArtifactDigest !== binding.runtimeArtifactSha256
          || (version.executionBackend ?? "persistent-worker") !== binding.executionBackend
          || version.modelRouteDigest !== binding.modelRouteDigest
          || (version.modelRouteSnapshot as any)?.provider !== binding.provider
          || (version.modelRouteSnapshot as any)?.modelId !== binding.model
          || version.sandboxProfileDigest !== binding.sandboxProfileDigest;
      })) {
        throw new Error("Worker Factory Version attestation does not match canonical configuration");
      }
      if (!args.baseBranch || !args.baseCommit || args.baseBranch !== repository?.defaultBranch) {
        throw new Error("Worker runtime requires the exact bound repository default-branch revision");
      }
    }
    const existing = await ctx.db
      .query("workspaceHostBindings")
      .withIndex("by_project_host", (q) =>
        q.eq("projectId", args.projectId).eq("hostId", hostId)
      )
      .first();

    const value = {
      projectId: args.projectId,
      hostId,
      repositoryId: args.repositoryId,
      repository: args.repository,
      checkoutRoot,
      observedBranch: args.observedBranch,
      observedCommit: args.observedCommit,
      baseBranch: args.baseBranch,
      baseCommit: args.baseCommit,
      dirty: args.dirty,
      runtime: args.runtime?.trim() || undefined,
      approvedModelIds: args.approvedModelIds?.map((modelId) => modelId.trim()).filter(Boolean),
      networkPolicyStatus: args.networkPolicyStatus,
      secretPolicyStatus: args.secretPolicyStatus,
      capacity: args.maxConcurrentRuns === undefined ? undefined : { maxConcurrentRuns: args.maxConcurrentRuns, currentRuns: args.currentRuns! },
      workerRuntime: args.workerRuntime ? {
        ...args.workerRuntime,
        generation: nextFactoryWorkerGeneration(existing?.workerRuntime, args.workerRuntime.sessionId),
        lastHeartbeatAt: checkedAt,
      } : existing?.workerRuntime,
      attestedAt: args.attestedAt,
      status: args.status,
      error: args.error,
      checkedAt,
    };

    const bindingId = existing
      ? (await ctx.db.patch(existing._id, value), existing._id)
      : await ctx.db.insert("workspaceHostBindings", value);

    if (!existing || existing.status !== args.status || existing.dirty !== args.dirty) {
      await ctx.db.insert("activities", {
        projectId: args.projectId,
        actorType: "SYSTEM",
        actorId: hostId,
        action: "WORKSPACE_CHECKOUT_REPORTED",
        description: `${hostId} reported ${args.status.toLowerCase()} checkout for ${args.repository}`,
        targetType: "PROJECT",
        targetId: args.projectId,
        metadata: {
          bindingId,
          checkoutRoot,
          observedBranch: args.observedBranch,
          observedCommit: args.observedCommit,
          dirty: args.dirty,
          runtime: args.runtime?.trim() || undefined,
          approvedModelCount: args.approvedModelIds?.length,
          networkPolicyStatus: args.networkPolicyStatus,
          secretPolicyStatus: args.secretPolicyStatus,
          capacity: args.maxConcurrentRuns === undefined ? undefined : { maxConcurrentRuns: args.maxConcurrentRuns, currentRuns: args.currentRuns },
          attestedAt: args.attestedAt,
          error: args.error,
          checkedAt,
        },
      });
    }

    if (args.workerRuntime && existing?.workerRuntime?.sessionId !== args.workerRuntime.sessionId) {
      await ctx.db.insert("activities", {
        projectId: args.projectId,
        actorType: "SYSTEM",
        actorId: hostId,
        action: "FACTORY_WORKER_REGISTERED",
        description: `${hostId} registered worker session ${args.workerRuntime.sessionId}`,
        targetType: "PROJECT",
        targetId: args.projectId,
        metadata: {
          bindingId,
          workerId: hostId,
          sessionId: args.workerRuntime.sessionId,
          generation: value.workerRuntime?.generation,
          readiness: args.workerRuntime.readiness,
          executionBackends: args.workerRuntime.executionBackends,
          supportedExecutors: args.workerRuntime.supportedExecutors.map((executor) => `${executor.adapter}/${executor.version}`),
          sandboxCapabilities: args.workerRuntime.sandboxCapabilities,
        },
      });
    }

    return await ctx.db.get(bindingId);
  },
});
