import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query, type MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  harnessCapabilityRequirementsSatisfied,
} from "@mission-control/workflow-engine/harness-contract";
import { COMPANY_PERMISSIONS } from "./lib/companyAccess";
import {
  assertAuthorizedDeliveryRecord,
  requireAuthorizedDeliveryScope,
} from "./lib/deliveryAuthorization";
import { resolveFlag, type FlagRow } from "./lib/flags";
import { computeCanonicalHash } from "./lib/genomeHash";
import {
  factoryHarnessCapabilityRequirements,
  resolveFrozenHarnessBinding,
} from "./lib/harnessCapabilities";
import { selectFrozenFactoryPlanningModelRoute } from "./lib/factoryModelRoute";
import { factoryWorkerVersionBindingMatches } from "./lib/factoryWorkerRuntime";
import {
  fallbackRoutingPolicy,
  resolveModelRoute,
  type CatalogModel,
  type RoutingPolicyInput,
} from "./lib/modelRouting";
import { MISSION_PLAN_RELEASE_FLAG, validateMissionPlan } from "./lib/missionPlan";
import {
  MISSION_SPEC_INTAKE_FLAG,
  missionSpecDigest,
  projectConstitutionDigest,
} from "./lib/missionSpec";
import { canonicalRepositoryKey } from "./lib/workspaceRepositories";
import {
  appendMissionPlanningExecutionReceipt,
  NONTERMINAL_MISSION_PLANNING_STATUSES,
  requireCompletedMissionPlanningReceipts,
  selectActiveMissionPlanningRun,
} from "./lib/missionPlanningRunState";
import {
  BUILT_IN_MISSION_PLANNER_CONFIG_DIGEST,
  BUILT_IN_MISSION_PLANNER_IDENTITY,
  missionPlannerActorId,
} from "@mission-control/shared";

const LEASED_STATUSES = ["RESEARCHING", "GENERATING", "VALIDATING"] as const;
const MAX_PLANNING_ATTEMPTS = 3;
const HOST_FRESHNESS_MS = 24 * 60 * 60 * 1_000;

export const request = mutation({
  args: {
    projectId: v.id("projects"),
    missionId: v.id("missions"),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    const access = await requireAuthorizedDeliveryScope(
      ctx,
      args.projectId,
      COMPANY_PERMISSIONS.UPDATE_DELIVERY,
    );
    await assertPlanningEnabled(ctx, args.projectId);
    const [mission, project] = await Promise.all([
      ctx.db.get(args.missionId),
      ctx.db.get(args.projectId),
    ]);
    if (!mission || mission.projectId !== args.projectId || !project) {
      throw new Error("Mission is unavailable in the selected workspace.");
    }
    assertAuthorizedDeliveryRecord(access, mission);
    if (!["DRAFT", "PLANNING"].includes(mission.state)) {
      throw new Error(`Planning intelligence cannot run while the Mission is ${mission.state}.`);
    }
    if (!mission.repositoryId) {
      throw new Error("Assign a ready repository to the Mission before generating a Plan candidate.");
    }
    const duplicate = await ctx.db
      .query("missionPlanningRuns")
      .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", args.idempotencyKey))
      .first();
    if (duplicate) {
      if (duplicate.projectId !== args.projectId || duplicate.missionId !== mission._id) {
        throw new Error("Planning idempotency key is already bound to another Mission.");
      }
      return { run: duplicate, created: false };
    }
    const activeRun = selectActiveMissionPlanningRun((await Promise.all(
      NONTERMINAL_MISSION_PLANNING_STATUSES.map((status) => ctx.db
        .query("missionPlanningRuns")
        .withIndex("by_mission_status", (q) => q.eq("missionId", mission._id).eq("status", status))
        .collect()),
    )).flat());
    if (activeRun) return { run: activeRun, created: false, duplicateReason: "ACTIVE_RUN_EXISTS" as const };

    const repository = await ctx.db.get(mission.repositoryId);
    if (!repository || repository.projectId !== args.projectId || repository.status !== "READY") {
      throw new Error("Mission repository is unavailable or not ready.");
    }
    const definition = await ctx.db
      .query("factoryDefinitions")
      .withIndex("by_repository_purpose_status", (q) => q
        .eq("repositoryId", repository._id)
        .eq("purpose", "SOFTWARE")
        .eq("status", "ACTIVE"))
      .first();
    if (!definition?.activeVersionId) {
      throw new Error("Activate a SOFTWARE Factory for this repository before generating a Plan candidate.");
    }
    const version = await ctx.db.get(definition.activeVersionId);
    if (!version || version.projectId !== args.projectId
      || version.factoryDefinitionId !== definition._id || version.repositoryId !== repository._id) {
      throw new Error("The active Factory version is unavailable or repository-scoped incorrectly.");
    }
    const executionBackend = version.executionBackend ?? "persistent-worker";
    if (executionBackend !== "persistent-worker") {
      throw new Error("Mission planning currently requires a persistent-worker Factory backend.");
    }
    const [workflow, assessments, agentVersions, activeWorkflows, hostBindings, modelRoute] = await Promise.all([
      ctx.db.get(version.workflowId),
      ctx.db.query("factoryReadinessAssessments")
        .withIndex("by_version", (q) => q.eq("factoryDefinitionVersionId", version._id))
        .collect(),
      Promise.all((version.agentBindings ?? []).map((binding) => ctx.db.get(binding.agentVersionId))),
      ctx.db.query("workflows").withIndex("by_active", (q) => q.eq("active", true)).collect(),
      ctx.db.query("workspaceHostBindings").withIndex("by_project", (q) => q.eq("projectId", args.projectId)).collect(),
      version.modelCatalogId ? ctx.db.get(version.modelCatalogId) : null,
    ]);
    if (!workflow?.active || workflow.version < 1 || !workflow.steps[0]) {
      throw new Error("The active Factory version does not bind an active planning-capable workflow.");
    }
    const latestAssessment = assessments.sort((left, right) => right.assessedAt - left.assessedAt)[0];
    if (latestAssessment?.status !== "PASS"
      || latestAssessment.configurationDigest !== version.configurationDigest
      || latestAssessment.expiresAt <= Date.now()) {
      throw new Error("Reassess the active Factory version before planning; its readiness evidence is missing or stale.");
    }
    const primaryAgentIndex = (version.agentBindings ?? []).findIndex(
      (binding) => binding.workflowAgentId === workflow.steps[0].agent,
    );
    const primaryBinding = (version.agentBindings ?? [])[primaryAgentIndex >= 0 ? primaryAgentIndex : 0];
    const plannerAgent = agentVersions[primaryAgentIndex >= 0 ? primaryAgentIndex : 0];
    const plannerTemplate = plannerAgent ? await ctx.db.get(plannerAgent.templateId) : null;
    if (!primaryBinding || !plannerAgent || plannerAgent.status !== "APPROVED" || !plannerTemplate?.active) {
      throw new Error("The active Factory must bind an approved, active planner agent version.");
    }
    const harness = resolveFrozenHarnessBinding(version);
    if (!harness.capabilityManifest.admission.executionBackends.includes("persistent-worker")
      || !harness.capabilityManifest.sandbox.isolationModes.includes("READ_ONLY")
      || harness.capabilityManifest.tools.structuredOutput !== "SUPPORTED"
      || !harnessCapabilityRequirementsSatisfied(
        harness.capabilityManifest,
        factoryHarnessCapabilityRequirements("READ_ONLY"),
      )) {
      throw new Error("The active Factory harness does not support the enforced read-only planning contract.");
    }

    const route = await resolvePlanningModelRoute(ctx, {
      project,
      projectId: args.projectId,
      mission,
      harness,
      version,
      modelRoute,
      executionBackend,
    });
    const host = selectPlanningHost(hostBindings, {
      repositoryId: repository._id,
      repository: repository.repository,
      defaultBranch: repository.defaultBranch,
      executor: harness,
      factoryDefinitionVersionId: version._id,
      factoryConfigurationDigest: version.configurationDigest,
      executionBackend,
      requireRuntimeArtifactBinding: Boolean(version.harnessRuntimeArtifactDigest),
      provider: route.model.provider,
      modelId: route.model.modelId,
      modelRouteDigest: route.model.routeDigest!,
      now: Date.now(),
    });
    if (!host?.baseCommit || !/^[a-f0-9]{40,64}$/i.test(host.baseCommit)) {
      throw new Error("No current clean worker can prove an exact immutable repository revision for read-only planning.");
    }

    const specSnapshot = await loadPlanningSpecSnapshot(ctx, project, mission);
    const inputSnapshot = {
      schema: "mission-planning-input/v1",
      mission: {
        missionId: String(mission._id),
        title: mission.title,
        objective: mission.objective,
        context: mission.context,
        constraints: mission.constraints ?? [],
        sourceOfTruthRefs: mission.sourceOfTruthRefs ?? [],
        stopCondition: mission.stopCondition,
        budgetUsd: mission.budgetUsd,
      },
      repository: {
        repositoryId: String(repository._id),
        repository: repository.repository,
        defaultBranch: repository.defaultBranch,
        planningRepositorySha: host.baseCommit,
      },
      workflows: activeWorkflows
        .filter((candidate) => !candidate.projectId || candidate.projectId === args.projectId)
        .sort((left, right) => left.workflowId.localeCompare(right.workflowId) || right.version - left.version)
        .slice(0, 50)
        .map((candidate) => ({
          workflowId: candidate.workflowId,
          version: candidate.version,
          name: candidate.name,
          description: candidate.description,
          steps: candidate.steps.map((step) => ({
            id: step.id,
            kind: step.kind ?? "AGENT",
            isolation: step.isolation,
            timeoutMinutes: step.timeoutMinutes,
          })),
        })),
      specification: specSnapshot,
      planner: {
        ...BUILT_IN_MISSION_PLANNER_IDENTITY,
        configDigest: BUILT_IN_MISSION_PLANNER_CONFIG_DIGEST,
        maxRuntimeMinutes: version.budget.maxRuntimeMinutes,
      },
      factoryAdmission: {
        factoryDefinitionVersionId: String(version._id),
        factoryConfigurationDigest: version.configurationDigest,
        workflowId: workflow.workflowId,
        workflowVersion: workflow.version,
        workflowAgentId: primaryBinding.workflowAgentId,
        agentVersionId: String(plannerAgent._id),
        agentVersion: plannerAgent.version,
        genomeHash: plannerAgent.genomeHash,
        promptBundleHash: plannerAgent.genome.promptBundleHash,
        toolManifestHash: plannerAgent.genome.toolManifestHash,
        modelCatalogId: String(route.model._id),
        modelRouteDigest: route.model.routeDigest,
        modelQualificationDigest: route.model.qualificationDigest,
        executionBackend,
        harnessRuntimeArtifactSha256: harness.runtimeArtifactSha256,
      },
    };
    const inputDigest = digest(inputSnapshot);
    const operator = await resolveOperator(ctx);
    const now = Date.now();
    const runId = await ctx.db.insert("missionPlanningRuns", {
      tenantId: mission.tenantId,
      projectId: args.projectId,
      missionId: mission._id,
      repositoryId: repository._id,
      idempotencyKey: args.idempotencyKey,
      status: "QUEUED",
      attemptCount: 0,
      maxAttempts: MAX_PLANNING_ATTEMPTS,
      planningRepositorySha: host.baseCommit,
      hostBindingId: host._id,
      hostId: host.hostId,
      factoryDefinitionId: definition._id,
      factoryDefinitionVersionId: version._id,
      factoryConfigurationDigest: version.configurationDigest,
      workflowId: workflow._id,
      workflowVersion: workflow.version,
      plannerIdentity: {
        ...BUILT_IN_MISSION_PLANNER_IDENTITY,
        configDigest: BUILT_IN_MISSION_PLANNER_CONFIG_DIGEST,
      },
      factoryAdmissionAgentVersionId: plannerAgent._id,
      factoryAdmissionAgentSnapshot: {
        templateId: plannerTemplate._id,
        templateName: plannerTemplate.name,
        templateSlug: plannerTemplate.slug,
        workflowAgentId: primaryBinding.workflowAgentId,
        version: plannerAgent.version,
        genomeHash: plannerAgent.genomeHash,
        promptBundleHash: plannerAgent.genome.promptBundleHash,
        toolManifestHash: plannerAgent.genome.toolManifestHash,
      },
      executor: {
        adapter: harness.adapter,
        version: harness.version,
        capabilityManifestSha256: harness.capabilityManifestSha256,
        effectiveConfigSha256: harness.effectiveConfigSha256,
        runtimeArtifact: harness.runtimeArtifact,
        runtimeArtifactSha256: harness.runtimeArtifactSha256,
        requireFactoryVersionRuntimeArtifactBinding: Boolean(version.harnessRuntimeArtifactDigest),
      },
      executionBackend,
      modelRoutingDecisionId: route.decisionId,
      modelCatalogId: route.model._id,
      modelProvider: route.model.provider,
      modelId: route.model.modelId,
      modelRouteDigest: route.model.routeDigest!,
      modelRouteSnapshot: route.model.routeSnapshot,
      modelQualificationDigest: route.model.qualificationDigest,
      modelQualificationSnapshot: route.model.qualificationSnapshot,
      inputSnapshot,
      inputDigest,
      requestedBy: operator.actorId,
      requestedActorSource: operator.actorSource,
      createdAt: now,
      updatedAt: now,
    });
    const run = await ctx.db.get(runId);
    if (!run) throw new Error("Planning run creation failed.");
    await recordEvent(ctx, run, {
      eventType: "PLANNING_RUN_QUEUED",
      status: "QUEUED",
      actorType: "HUMAN",
      actorId: operator.actorId,
      summary: `Queued repository-researched planning at ${host.baseCommit.slice(0, 12)}.`,
      metadata: { inputDigest, modelRoutingDecisionId: route.decisionId },
    });
    return { run, created: true };
  },
});

export const getForMission = query({
  args: { projectId: v.id("projects"), missionId: v.id("missions") },
  handler: async (ctx, args) => {
    const access = await requireAuthorizedDeliveryScope(ctx, args.projectId);
    const mission = await ctx.db.get(args.missionId);
    if (!mission || mission.projectId !== args.projectId) return null;
    assertAuthorizedDeliveryRecord(access, mission);
    const latestPlan = await ctx.db.query("missionPlans")
      .withIndex("by_mission_revision", (q) => q.eq("missionId", mission._id))
      .order("desc")
      .first();
    const [runs, boundCandidate, unadoptedRuns] = await Promise.all([
      ctx.db.query("missionPlanningRuns")
        .withIndex("by_mission_created", (q) => q.eq("missionId", mission._id))
        .order("desc")
        .take(10),
      latestPlan?.planningRunId ? ctx.db.get(latestPlan.planningRunId) : null,
      ctx.db.query("missionPlanningRuns")
        .withIndex("by_mission_created", (q) => q.eq("missionId", mission._id))
        .filter((q) => q.eq(q.field("adoptedPlanId"), undefined))
        .order("desc")
        .take(2),
    ]);
    const bound = boundCandidate
      && boundCandidate.missionId === mission._id
      && boundCandidate.projectId === args.projectId
      ? boundCandidate
      : null;
    const latest = runs[0] ?? null;
    const latestUnadopted = unadoptedRuns.find((run) => run._id !== latestPlan?.planningRunId) ?? null;
    const events = latest
      ? await ctx.db.query("missionPlanningRunEvents")
          .withIndex("by_run_timestamp", (q) => q.eq("planningRunId", latest._id))
          .order("desc")
          .take(50)
      : [];
    return {
      latest,
      bound,
      latestUnadopted,
      runs: runs.map((run) => ({
        _id: run._id,
        status: run.status,
        planningRepositorySha: run.planningRepositorySha,
        attemptCount: run.attemptCount,
        maxAttempts: run.maxAttempts,
        failure: run.failure,
        adoptedPlanId: run.adoptedPlanId,
        createdAt: run.createdAt,
        completedAt: run.completedAt,
      })),
      events,
    };
  },
});

export const resolveScope = internalQuery({
  args: { planningRunId: v.id("missionPlanningRuns") },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.planningRunId);
    if (!run) throw new Error("Planning run is unavailable.");
    return { projectId: String(run.projectId), repositoryId: String(run.repositoryId) };
  },
});

export const claimInternal = internalMutation({
  args: {
    projectId: v.id("projects"),
    repositoryId: v.id("workspaceRepositories"),
    leaseId: v.string(),
    ownerId: v.string(),
    workerId: v.string(),
    workerSessionId: v.string(),
    leaseDurationMs: v.number(),
  },
  handler: async (ctx, args) => {
    if (!Number.isSafeInteger(args.leaseDurationMs)
      || args.leaseDurationMs < 10_000
      || args.leaseDurationMs > 10 * 60_000) {
      throw new Error("Planning lease duration is invalid.");
    }
    const now = Date.now();
    const queued = await ctx.db.query("missionPlanningRuns")
      .withIndex("by_repository_status", (q) => q.eq("repositoryId", args.repositoryId).eq("status", "QUEUED"))
      .take(20);
    const active = (await Promise.all(LEASED_STATUSES.map((status) => ctx.db.query("missionPlanningRuns")
      .withIndex("by_repository_status", (q) => q.eq("repositoryId", args.repositoryId).eq("status", status))
      .take(20)))).flat();
    const candidates = [...queued, ...active]
      .filter((run) => run.projectId === args.projectId
        && run.hostId === args.workerId
        && (run.nextAttemptAt ?? 0) <= now
        && (!run.lease || run.lease.expiresAt <= now))
      .sort((left, right) => left.createdAt - right.createdAt);
    const run = candidates[0];
    if (!run) return { claimed: false as const, reason: "NO_CLAIMABLE_PLANNING_RUN" };
    const [host, repository] = await Promise.all([
      ctx.db.get(run.hostBindingId),
      ctx.db.get(run.repositoryId),
    ]);
    const frozenIdentityComplete = run.executionBackend === "persistent-worker"
      && Boolean(run.executor.runtimeArtifact)
      && Boolean(run.executor.runtimeArtifactSha256)
      && Boolean(run.modelRouteSnapshot)
      && Boolean(run.modelQualificationSnapshot)
      && Boolean(run.modelQualificationDigest);
    const exactHost = host && repository && frozenIdentityComplete
      ? selectPlanningHost([host], {
        repositoryId: run.repositoryId,
        repository: repository.repository,
        defaultBranch: repository.defaultBranch,
        executor: {
          ...run.executor,
          runtimeArtifactSha256: run.executor.runtimeArtifactSha256!,
        },
        factoryDefinitionVersionId: run.factoryDefinitionVersionId,
        factoryConfigurationDigest: run.factoryConfigurationDigest,
        executionBackend: "persistent-worker",
        requireRuntimeArtifactBinding: run.executor.requireFactoryVersionRuntimeArtifactBinding === true,
        provider: run.modelProvider,
        modelId: run.modelId,
        modelRouteDigest: run.modelRouteDigest,
        now,
      })
      : null;
    if (!host
      || host.projectId !== args.projectId
      || host.repositoryId !== args.repositoryId
      || host.hostId !== args.workerId
      || host.workerRuntime?.sessionId !== args.workerSessionId
      || exactHost?._id !== host._id) {
      return { claimed: false as const, reason: "PLANNING_HOST_BINDING_STALE" };
    }
    const lease = {
      leaseId: args.leaseId,
      ownerId: args.ownerId,
      workerId: args.workerId,
      workerSessionId: args.workerSessionId,
      claimedAt: now,
      heartbeatAt: now,
      expiresAt: now + args.leaseDurationMs,
    };
    const nextStatus = run.researchPacket ? "GENERATING" as const : "RESEARCHING" as const;
    await ctx.db.patch(run._id, {
      status: nextStatus,
      attemptCount: run.attemptCount + 1,
      nextAttemptAt: undefined,
      lease,
      failure: undefined,
      startedAt: run.startedAt ?? now,
      updatedAt: now,
    });
    const updated = await ctx.db.get(run._id);
    if (!updated) throw new Error("Claimed planning run disappeared.");
    await recordEvent(ctx, updated, {
      eventType: "PLANNING_RUN_CLAIMED",
      status: nextStatus,
      actorType: "SYSTEM",
      actorId: `service:${args.ownerId}`,
      summary: run.researchPacket ? "Resumed candidate generation from a validated research packet." : "Started exact-revision repository research.",
      metadata: { attempt: run.attemptCount + 1, leaseId: args.leaseId },
    });
    return { claimed: true as const, run: updated, host };
  },
});

export const renewInternal = internalMutation({
  args: {
    planningRunId: v.id("missionPlanningRuns"),
    leaseId: v.string(),
    ownerId: v.string(),
    workerId: v.string(),
    workerSessionId: v.string(),
    leaseDurationMs: v.number(),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.planningRunId);
    if (!run || !leaseMatches(run, args) || !LEASED_STATUSES.includes(run.status as any)) {
      return { renewed: false as const, reason: "PLANNING_LEASE_MISMATCH" };
    }
    const now = Date.now();
    await ctx.db.patch(run._id, {
      lease: { ...run.lease!, heartbeatAt: now, expiresAt: now + args.leaseDurationMs },
      updatedAt: now,
    });
    return { renewed: true as const, expiresAt: now + args.leaseDurationMs };
  },
});

export const reportInternal = internalMutation({
  args: {
    planningRunId: v.id("missionPlanningRuns"),
    leaseId: v.string(),
    ownerId: v.string(),
    workerId: v.string(),
    workerSessionId: v.string(),
    report: v.any(),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.planningRunId);
    if (!run || !leaseMatches(run, args) || !LEASED_STATUSES.includes(run.status as any)) {
      throw new Error("Planning report does not own the active lease.");
    }
    const report = args.report as Record<string, any>;
    if (report.kind === "PHASE_EXECUTION_RECORDED") {
      const harnessExecutions = appendMissionPlanningExecutionReceipt(
        run.harnessExecutions,
        report.harnessExecution,
        run.planningRepositorySha,
      );
      await ctx.db.patch(run._id, { harnessExecutions, updatedAt: Date.now() });
      const updated = await ctx.db.get(run._id);
      if (updated) await recordEvent(ctx, updated, {
        eventType: "PLANNING_PHASE_EXECUTION_RECORDED",
        status: run.status,
        actorType: "AGENT",
        actorId: missionPlannerActorId(),
        summary: `${report.harnessExecution.phase === "RESEARCH" ? "Research" : "Generation"} execution ${String(report.harnessExecution.status).toLowerCase()} receipt persisted.`,
        metadata: {
          executionId: report.harnessExecution.executionId,
          phase: report.harnessExecution.phase,
          promptDigest: report.harnessExecution.promptIdentity?.digest,
        },
      });
      return { accepted: true, status: run.status };
    }
    if (report.kind === "RESEARCH_COMPLETED") {
      if (!run.harnessExecutions?.some((receipt: any) => receipt.phase === "RESEARCH" && receipt.status === "COMPLETED")) {
        throw new Error("Repository research is missing exact-SHA harness execution provenance.");
      }
      const issues = researchPacketIssues(report.researchPacket, run);
      if (issues.length > 0) throw new Error(`Research packet validation failed (${issues.join(", ")}).`);
      const packetDigest = researchPacketDigest(report.researchPacket);
      if (packetDigest !== report.researchPacket.digest) {
        throw new Error("Research packet digest does not match its validated content.");
      }
      const now = Date.now();
      await ctx.db.patch(run._id, {
        status: "GENERATING",
        researchPacket: report.researchPacket,
        researchPacketDigest: packetDigest,
        updatedAt: now,
      });
      const updated = await ctx.db.get(run._id);
      if (updated) await recordEvent(ctx, updated, {
        eventType: "REPOSITORY_RESEARCH_VALIDATED",
        status: "GENERATING",
        actorType: "AGENT",
        actorId: missionPlannerActorId(),
        summary: `Validated ${report.researchPacket.citations.length} exact file citations; generating the candidate Plan.`,
        metadata: { researchPacketDigest: packetDigest },
      });
      return { accepted: true, status: "GENERATING" as const };
    }
    if (report.kind === "VALIDATION_STARTED") {
      if (!run.researchPacket || !run.researchPacketDigest) {
        throw new Error("Candidate validation requires a persisted research packet.");
      }
      await ctx.db.patch(run._id, { status: "VALIDATING", updatedAt: Date.now() });
      return { accepted: true, status: "VALIDATING" as const };
    }
    if (report.kind === "SUCCEEDED") {
      if (!run.researchPacket || !run.researchPacketDigest) {
        throw new Error("A planning candidate cannot succeed without validated repository research.");
      }
      const candidate = report.candidatePlan;
      const planIssues = validateMissionPlan(candidate).map((issue) => `${issue.code}:${issue.path}`);
      const bindingIssues = candidateBindingIssues(candidate, run);
      const issues = [...planIssues, ...bindingIssues];
      if (issues.length > 0) {
        throw new Error(`Candidate Plan validation failed (${issues.slice(0, 20).join(", ")}).`);
      }
      const candidateDigest = digest(candidate);
      if (candidateDigest !== report.candidateDigest) {
        throw new Error("Candidate Plan digest does not match the validated Plan content.");
      }
      if (!/^sha256:[a-f0-9]{64}$/i.test(report.outputDigest ?? "")) {
        throw new Error("Planning output digest is missing or invalid.");
      }
      const now = Date.now();
      const harnessExecutions = requireCompletedMissionPlanningReceipts(run.harnessExecutions);
      const provenance = {
        schema: "mission-planning-provenance/v1",
        planningRunId: String(run._id),
        missionId: String(run.missionId),
        repositoryId: String(run.repositoryId),
        planningRepositorySha: run.planningRepositorySha,
        inputDigest: run.inputDigest,
        researchPacketDigest: run.researchPacketDigest,
        candidateDigest,
        outputDigest: report.outputDigest,
        factoryDefinitionVersionId: String(run.factoryDefinitionVersionId),
        factoryConfigurationDigest: run.factoryConfigurationDigest,
        planner: run.plannerIdentity ?? {
          kind: "LEGACY_FACTORY_AGENT",
          agentVersionId: run.plannerAgentVersionId ? String(run.plannerAgentVersionId) : null,
          snapshot: run.plannerAgentSnapshot,
        },
        factoryAdmissionAgent: run.factoryAdmissionAgentSnapshot ?? run.plannerAgentSnapshot,
        harness: run.executor,
        executionBackend: run.executionBackend,
        modelRoutingDecisionId: String(run.modelRoutingDecisionId),
        model: {
          catalogId: String(run.modelCatalogId),
          provider: run.modelProvider,
          modelId: run.modelId,
          routeDigest: run.modelRouteDigest,
          routeSnapshot: run.modelRouteSnapshot,
          qualificationDigest: run.modelQualificationDigest,
          qualificationSnapshot: run.modelQualificationSnapshot,
        },
        executions: harnessExecutions,
        authority: {
          submission: false,
          approval: false,
          execution: false,
          verification: false,
          acceptance: false,
        },
      };
      await ctx.db.patch(run._id, {
        status: "SUCCEEDED",
        candidatePlan: candidate,
        candidateDigest,
        provenance,
        harnessExecutions,
        outputDigest: report.outputDigest,
        validationErrors: [],
        failure: undefined,
        lease: undefined,
        completedAt: now,
        updatedAt: now,
      });
      const updated = await ctx.db.get(run._id);
      if (updated) await recordEvent(ctx, updated, {
        eventType: "PLAN_CANDIDATE_VALIDATED",
        status: "SUCCEEDED",
        actorType: "AGENT",
        actorId: missionPlannerActorId(),
        summary: "Validated Plan candidate is ready for human review; no approval or execution authority was granted.",
        metadata: { candidateDigest, planningRepositorySha: run.planningRepositorySha },
      });
      await ctx.db.insert("missionEvents", {
        tenantId: run.tenantId,
        projectId: run.projectId,
        missionId: run.missionId,
        eventType: "PLAN_CANDIDATE_GENERATED",
        actorType: "AGENT",
        actorId: missionPlannerActorId(),
        summary: "Planning Agent generated a validated, editable Plan candidate for human review.",
        idempotencyKey: `planning-run:${String(run._id)}:candidate-validated`,
        timestamp: now,
        metadata: {
          planningRunId: run._id,
          planningRepositorySha: run.planningRepositorySha,
          researchPacketDigest: run.researchPacketDigest,
          candidateDigest,
          acceptanceAuthority: false,
        },
      });
      return { accepted: true, status: "SUCCEEDED" as const, candidateDigest };
    }
    if (report.kind === "FAILED") {
      const now = Date.now();
      const retryable = report.retryable === true && run.attemptCount < run.maxAttempts;
      const nextStatus = retryable ? "QUEUED" as const : "FAILED" as const;
      const failure = {
        code: boundedText(report.code, 100, "PLANNING_FAILED"),
        message: boundedText(report.message, 2_000, "Planning run failed."),
        retryable,
        failedAt: now,
      };
      await ctx.db.patch(run._id, {
        status: nextStatus,
        nextAttemptAt: retryable ? now + Math.min(60_000, run.attemptCount * 5_000) : undefined,
        lease: undefined,
        failure,
        validationErrors: Array.isArray(report.validationErrors)
          ? report.validationErrors.slice(0, 50).map((item: unknown) => boundedText(item, 500, "validation-failed"))
          : undefined,
        completedAt: retryable ? undefined : now,
        updatedAt: now,
      });
      const updated = await ctx.db.get(run._id);
      if (updated) await recordEvent(ctx, updated, {
        eventType: retryable ? "PLANNING_RUN_RETRY_QUEUED" : "PLANNING_RUN_FAILED",
        status: nextStatus,
        actorType: "SYSTEM",
        actorId: `service:${args.ownerId}`,
        summary: retryable
          ? `${failure.message} A bounded retry was queued.`
          : `${failure.message} Generate a new candidate after resolving the reported configuration or evidence issue.`,
        metadata: { code: failure.code, attempt: run.attemptCount, retryable },
      });
      return { accepted: true, status: nextStatus };
    }
    throw new Error("Planning report kind is unsupported.");
  },
});

async function resolvePlanningModelRoute(
  ctx: MutationCtx,
  input: {
    project: Doc<"projects">;
    projectId: Id<"projects">;
    mission: Doc<"missions">;
    harness: ReturnType<typeof resolveFrozenHarnessBinding>;
    version: Doc<"factoryDefinitionVersions">;
    modelRoute: Doc<"modelCatalog"> | null;
    executionBackend: "persistent-worker";
  },
) {
  const activePolicy = await ctx.db.query("modelRoutingPolicies")
    .withIndex("by_project_status", (q) => q.eq("projectId", input.projectId).eq("status", "ACTIVE"))
    .order("desc")
    .first();
  const model = input.version.modelCatalogId
    ? selectFrozenFactoryPlanningModelRoute({
      routes: input.modelRoute ? [input.modelRoute] : [],
      selectedCatalogId: String(input.version.modelCatalogId),
      projectId: String(input.projectId),
      version: input.version,
      harness: input.harness,
      executionBackend: input.executionBackend,
      repositoryId: String(input.mission.repositoryId),
    })
    : null;
  if (!model) {
    throw new Error("The active Factory version does not have an exact qualified model route for Mission planning.");
  }
  const catalog = [model] as Array<Doc<"modelCatalog"> & CatalogModel>;
  const policy: RoutingPolicyInput = activePolicy ? {
    id: String(activePolicy._id),
    version: activePolicy.version,
    defaultModelId: activePolicy.defaultModelId,
    safeFallbackModelId: activePolicy.safeFallbackModelId,
    fallbackChain: activePolicy.fallbackChain,
    rules: activePolicy.rules,
    lanePools: activePolicy.lanePools ?? [],
    budgetLimitUsd: activePolicy.budgetLimitUsd,
    killSwitch: activePolicy.killSwitch,
  } : fallbackRoutingPolicy(input.project.swarmConfig?.defaultModel);
  const lanePool = policy.lanePools?.find((pool) => pool.lane === "PLAN");
  const nowDate = new Date();
  const monthStart = new Date(nowDate.getFullYear(), nowDate.getMonth(), 1).getTime();
  const dayStart = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate()).getTime();
  const decisions = lanePool ? await ctx.db.query("modelRoutingDecisions")
    .withIndex("by_project_created", (q) => q.eq("projectId", input.projectId).gte("createdAt", monthStart))
    .collect() : [];
  const costByModel = new Map(catalog.map((model) => [model.modelId, model.estimatedCostPerRunUsd ?? 0]));
  const planDecisions = decisions.filter((decision) => decision.operatingLane === "PLAN");
  const monthlySpendUsd = planDecisions.reduce((sum, decision) => sum + (costByModel.get(decision.selectedModelId ?? "") ?? 0), 0);
  const dailySpendUsd = planDecisions.filter((decision) => decision.createdAt >= dayStart)
    .reduce((sum, decision) => sum + (costByModel.get(decision.selectedModelId ?? "") ?? 0), 0);
  const laneBudgetRemainingUsd = lanePool ? Math.min(
    lanePool.dailyBudgetUsd == null ? Infinity : Math.max(0, lanePool.dailyBudgetUsd - dailySpendUsd),
    lanePool.monthlyBudgetUsd == null ? Infinity : Math.max(0, lanePool.monthlyBudgetUsd - monthlySpendUsd),
  ) : undefined;
  const result = resolveModelRoute(catalog, policy, {
    taskType: "MISSION_PLANNING",
    operatingLane: "PLAN",
    riskLevel: "MEDIUM",
    complexity: "LARGE",
    requestedTier: "POWERFUL",
    requiredCapabilities: ["tools"],
    budgetRemainingUsd: input.mission.budgetUsd,
    laneBudgetRemainingUsd,
    allowCanary: false,
    systemDefaultModelId: "operator-powerful",
  });
  if (result.status !== "SELECTED" || !result.selectedModelId) {
    throw new Error(`PLAN model routing failed closed: ${result.explanation}`);
  }
  if (result.selectedModelId !== model.modelId || !model.routeDigest) {
    throw new Error("PLAN model routing did not select the active Factory version's exact qualified route.");
  }
  const decisionId = await ctx.db.insert("modelRoutingDecisions", {
    projectId: input.projectId,
    policyId: activePolicy?._id,
    policyVersion: policy.version,
    taskType: "MISSION_PLANNING",
    operatingLane: "PLAN",
    riskLevel: "MEDIUM",
    complexity: "LARGE",
    requestedTier: "POWERFUL",
    requiredCapabilities: ["tools"],
    selectedProvider: result.selectedProvider,
    selectedModelId: result.selectedModelId,
    source: result.source,
    ruleId: result.ruleId,
    explanation: result.explanation,
    alternativesConsidered: result.alternativesConsidered,
    mode: "ENFORCED",
    algorithmVersion: "mission-planning-route/v2",
    decisionDigest: digest({
      lane: "PLAN",
      policyVersion: policy.version,
      missionId: String(input.mission._id),
      modelCatalogId: String(model._id),
      modelId: result.selectedModelId,
      routeDigest: model.routeDigest,
      qualificationDigest: model.qualificationDigest,
      alternatives: result.alternativesConsidered,
    }),
    createdAt: Date.now(),
  });
  return { result, model, decisionId };
}

function selectPlanningHost(
  hosts: Doc<"workspaceHostBindings">[],
  input: {
    repositoryId: Id<"workspaceRepositories">;
    repository: string;
    defaultBranch: string;
    executor: {
      adapter: string;
      version: string;
      capabilityManifestSha256: string;
      effectiveConfigSha256: string;
      runtimeArtifactSha256: string;
    };
    factoryDefinitionVersionId: Id<"factoryDefinitionVersions">;
    factoryConfigurationDigest: string;
    executionBackend: "persistent-worker";
    requireRuntimeArtifactBinding: boolean;
    provider: string;
    modelId: string;
    modelRouteDigest: string;
    now: number;
  },
) {
  return hosts.filter((host) => {
    const runtime = host.workerRuntime;
    const executor = runtime?.supportedExecutors.find((candidate) =>
      candidate.adapter === input.executor.adapter
      && candidate.version === input.executor.version
      && candidate.capabilityManifestSha256 === input.executor.capabilityManifestSha256
      && candidate.effectiveConfigSha256 === input.executor.effectiveConfigSha256
      && candidate.runtimeArtifactSha256 === input.executor.runtimeArtifactSha256
      && candidate.isolationModes.includes("READ_ONLY"));
    const exactVersionBinding = runtime?.factoryVersionBindings?.some((binding) =>
      factoryWorkerVersionBindingMatches({
        binding: {
          ...binding,
          factoryDefinitionVersionId: String(binding.factoryDefinitionVersionId),
          repositoryId: String(binding.repositoryId),
        },
        requirements: {
          factoryDefinitionVersionId: String(input.factoryDefinitionVersionId),
          factoryConfigurationDigest: input.factoryConfigurationDigest,
          adapter: input.executor.adapter,
          version: input.executor.version,
          provider: input.provider,
          model: input.modelId,
          capabilityManifestSha256: input.executor.capabilityManifestSha256,
          effectiveConfigSha256: input.executor.effectiveConfigSha256,
          runtimeArtifactSha256: input.executor.runtimeArtifactSha256,
          requireRuntimeArtifactBinding: input.requireRuntimeArtifactBinding,
          executionBackend: input.executionBackend,
          modelRouteDigest: input.modelRouteDigest,
          repositoryId: String(input.repositoryId),
        },
      })
    );
    return host.repositoryId === input.repositoryId
      && canonicalRepositoryKey(host.repository) === canonicalRepositoryKey(input.repository)
      && host.status === "READY"
      && !host.dirty
      && host.baseBranch === input.defaultBranch
      && typeof host.baseCommit === "string"
      && /^[a-f0-9]{40,64}$/i.test(host.baseCommit)
      && input.now - host.checkedAt <= HOST_FRESHNESS_MS
      && runtime?.readiness === "READY"
      && !runtime.draining
      && runtime.executionBackends.includes("persistent-worker")
      && Boolean(executor)
      && exactVersionBinding === true
      && runtime.repositoryAccess.some((entry) => entry.repositoryId === input.repositoryId && ["READ", "READ_WRITE"].includes(entry.access))
      && (!host.approvedModelIds?.length || host.approvedModelIds.includes(input.modelId));
  }).sort((left, right) => right.checkedAt - left.checkedAt || left.hostId.localeCompare(right.hostId))[0] ?? null;
}

async function loadPlanningSpecSnapshot(
  ctx: MutationCtx,
  project: Doc<"projects">,
  mission: Doc<"missions">,
) {
  const rows = await ctx.db.query("featureFlags")
    .withIndex("by_key", (q) => q.eq("key", MISSION_SPEC_INTAKE_FLAG))
    .collect() as FlagRow[];
  if (!resolveFlag(rows, MISSION_SPEC_INTAKE_FLAG, project._id).enabled) return null;
  if (!mission.currentSpecRevisionId || !project.currentConstitutionRevisionId) {
    throw new Error("Finalize a Mission Spec and activate a Project Constitution before generating a governed Plan.");
  }
  const [spec, constitution] = await Promise.all([
    ctx.db.get(mission.currentSpecRevisionId),
    ctx.db.get(project.currentConstitutionRevisionId),
  ]);
  if (!spec || spec.missionId !== mission._id || spec.projectId !== project._id
    || !constitution || constitution.projectId !== project._id
    || spec.projectConstitutionRevisionId !== constitution._id
    || spec.projectConstitutionDigest !== constitution.digest
    || spec.digest !== missionSpecDigest(spec.content)
    || constitution.digest !== projectConstitutionDigest(constitution.content)) {
    throw new Error("Mission Spec or Constitution lineage is invalid for planning.");
  }
  const decision = await ctx.db.query("missionSpecDecisions")
    .withIndex("by_spec", (q) => q.eq("missionSpecRevisionId", spec._id))
    .first();
  const evaluation = decision ? await ctx.db.get(decision.missionSpecQualityEvaluationId) : null;
  if (!decision || !evaluation || evaluation.result !== "PASS"
    || evaluation.missionSpecDigest !== spec.digest
    || evaluation.findings.some((finding) => finding.blocking)) {
    throw new Error("Mission Spec does not have a passing exact finalization for planning.");
  }
  return {
    missionSpecRevisionId: String(spec._id),
    missionSpecDigest: spec.digest,
    content: spec.content,
    projectConstitutionRevisionId: String(constitution._id),
    projectConstitutionDigest: constitution.digest,
    constitution: constitution.content,
    qualityEvaluationId: String(evaluation._id),
  };
}

async function assertPlanningEnabled(ctx: MutationCtx, projectId: Id<"projects">) {
  const rows = await ctx.db.query("featureFlags")
    .withIndex("by_key", (q) => q.eq("key", MISSION_PLAN_RELEASE_FLAG))
    .collect() as FlagRow[];
  if (!resolveFlag(rows, MISSION_PLAN_RELEASE_FLAG, projectId).enabled) {
    throw new Error(`Mission planning is disabled (${MISSION_PLAN_RELEASE_FLAG}).`);
  }
}

async function resolveOperator(ctx: MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  return identity
    ? { actorId: identity.subject, actorSource: "AUTHENTICATED" as const }
    : { actorId: "development:local-operator", actorSource: "DEVELOPMENT_FALLBACK" as const };
}

async function recordEvent(
  ctx: MutationCtx,
  run: Doc<"missionPlanningRuns">,
  event: {
    eventType: string;
    status: Doc<"missionPlanningRuns">["status"];
    actorType: "HUMAN" | "AGENT" | "SYSTEM";
    actorId?: string;
    summary: string;
    metadata?: unknown;
  },
) {
  return await ctx.db.insert("missionPlanningRunEvents", {
    tenantId: run.tenantId,
    projectId: run.projectId,
    missionId: run.missionId,
    planningRunId: run._id,
    ...event,
    timestamp: Date.now(),
  });
}

function leaseMatches(
  run: Doc<"missionPlanningRuns">,
  args: { leaseId: string; ownerId: string; workerId: string; workerSessionId: string },
) {
  return run.lease?.leaseId === args.leaseId
    && run.lease.ownerId === args.ownerId
    && run.lease.workerId === args.workerId
    && run.lease.workerSessionId === args.workerSessionId
    && run.lease.expiresAt > Date.now();
}

function candidateBindingIssues(candidate: any, run: Doc<"missionPlanningRuns">) {
  const issues: string[] = [];
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return ["candidate-shape-invalid"];
  if (candidate.repository !== run.inputSnapshot?.repository?.repository) issues.push("candidate-repository-mismatch");
  if (candidate.repositoryBranch !== run.inputSnapshot?.repository?.defaultBranch) issues.push("candidate-branch-mismatch");
  const workflows = new Map((run.inputSnapshot?.workflows ?? []).map((workflow: any) => [workflow.workflowId, workflow.version]));
  for (const blueprint of candidate.workOrderBlueprints ?? []) {
    if (workflows.get(blueprint.workflowId) !== blueprint.workflowVersion) {
      issues.push(`candidate-workflow-mismatch:${blueprint.id ?? "unknown"}`);
    }
  }
  return issues;
}

function researchPacketIssues(packet: any, run: Doc<"missionPlanningRuns">) {
  if (!packet || typeof packet !== "object" || Array.isArray(packet)) return ["packet-shape-invalid"];
  const issues: string[] = [];
  if (packet.schema !== "repository-research-packet/v1") issues.push("packet-schema-invalid");
  if (packet.repository !== run.inputSnapshot?.repository?.repository) issues.push("packet-repository-mismatch");
  if (packet.sha !== run.planningRepositorySha) issues.push("packet-sha-mismatch");
  if (!Array.isArray(packet.files) || packet.files.length < 1 || packet.files.length > 200) issues.push("packet-files-invalid");
  if (!Array.isArray(packet.citations) || packet.citations.length < 1 || packet.citations.length > 300) issues.push("packet-citations-invalid");
  if (!Array.isArray(packet.findings) || packet.findings.length < 1 || packet.findings.length > 100) issues.push("packet-findings-invalid");
  if (!Array.isArray(packet.unknowns) || packet.unknowns.length > 100) issues.push("packet-unknowns-invalid");
  const citationIds = new Set<string>();
  for (const citation of packet.citations ?? []) {
    if (!boundedString(citation?.id, 100)
      || !boundedRelativePath(citation?.path)
      || !Number.isSafeInteger(citation?.startLine)
      || !Number.isSafeInteger(citation?.endLine)
      || citation.startLine < 1
      || citation.endLine < citation.startLine
      || !boundedString(citation?.excerpt, 4_000)) issues.push("packet-citation-invalid");
    if (citationIds.has(citation?.id)) issues.push("packet-citation-duplicate");
    citationIds.add(citation?.id);
  }
  for (const finding of packet.findings ?? []) {
    if (!boundedString(finding?.id, 100)
      || !boundedString(finding?.title, 500)
      || !boundedString(finding?.detail, 4_000)
      || !Array.isArray(finding?.citationIds)
      || finding.citationIds.length < 1
      || finding.citationIds.some((id: unknown) => !citationIds.has(String(id)))) issues.push("packet-finding-invalid");
  }
  return [...new Set(issues)];
}

function researchPacketDigest(packet: any) {
  const { digest: _digest, ...content } = packet;
  return digest(content);
}

function digest(value: unknown) {
  return `sha256:${computeCanonicalHash(value)}`;
}

function boundedRelativePath(value: unknown) {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 1_000
    && !value.startsWith("/")
    && !value.split(/[\\/]/).includes("..")
    && !/[\0\r\n]/.test(value);
}

function boundedString(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maximum && !value.includes("\0");
}

function boundedText(value: unknown, maximum: number, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, maximum) : fallback;
}
