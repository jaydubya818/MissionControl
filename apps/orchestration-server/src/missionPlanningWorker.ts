import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import type { ConvexHttpClient } from "convex/browser";
import {
  GENERIC_HARNESS_CONTRACT_VERSION,
  harnessCapabilityManifestDigest,
  harnessCapabilityRequirementsSatisfied,
  harnessExecutionRequestDigest,
  harnessManifestIssues,
  harnessNormalizedResultIssues,
  harnessRuntimeArtifactDigest,
  modelRouteReasoningConfigIssues,
  runHarnessExecution,
  type ExecutorRequest,
  type HarnessNormalizedResult,
} from "@mission-control/workflow-engine";
import { ConvexActions } from "./convexCalls.js";
import {
  assertPlanningWorktreeUnchanged,
  ensurePlanningWorktree,
  releasePlanningWorktree,
} from "./factoryGitRuntime.js";
import { HarnessAdapterRegistry, type RegisteredHarnessAdapter } from "./harnessAdapterRegistry.js";
import {
  generationPrompt,
  PLAN_CANDIDATE_OUTPUT_SCHEMA,
  PLAN_CANDIDATE_SCHEMA_ID,
  RESEARCH_PACKET_OUTPUT_SCHEMA,
  RESEARCH_PACKET_SCHEMA_ID,
  researchPrompt,
  validateCandidateOutput,
  validateResearchOutput,
  type PlanningResearchPacket,
} from "./missionPlanningContract.js";
import { createSignedServiceCommand } from "./serviceCommandClient.js";
import { BUILT_IN_MISSION_PLANNER_IDENTITY, canonicalHash } from "@mission-control/shared";

const PLANNING_LEASE_MS = 120_000;
const HEARTBEAT_MS = 20_000;

export interface MissionPlanningWorkerScope {
  projectId: string;
  repositoryId: string;
}

export interface MissionPlanningWorkerIdentity {
  workerId: string;
  sessionId: string;
}

export interface MissionPlanningWorkerStatus {
  enabled: boolean;
  activeRunId: string | null;
  completedCount: number;
  failedCount: number;
  lastPollAt: number | null;
  lastError: string | null;
}

export class MissionPlanningWorker {
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private active: { runId: string; controller: AbortController; task: Promise<void> } | null = null;
  private stopped = false;
  private polling = false;
  private completedCount = 0;
  private failedCount = 0;
  private lastPollAt: number | null = null;
  private lastError: string | null = null;

  constructor(
    private readonly client: ConvexHttpClient,
    private readonly adapters: HarnessAdapterRegistry,
    private readonly enabled: boolean,
    private readonly scope: MissionPlanningWorkerScope | undefined,
    private readonly identity: MissionPlanningWorkerIdentity | undefined,
    private readonly pollIntervalMs = boundedInteger(process.env.MISSION_PLANNING_POLL_MS, 5_000, 300_000, 15_000),
    private readonly tryAcquireSharedSlot?: () => (() => void) | null,
  ) {}

  start() {
    if (!this.enabled || !this.scope || !this.identity || this.pollTimer || this.stopped) return;
    this.pollTimer = setInterval(() => void this.tick(), this.pollIntervalMs);
    void this.tick();
  }

  async stop() {
    this.stopped = true;
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
    this.active?.controller.abort();
    await this.active?.task.catch(() => undefined);
  }

  status(): MissionPlanningWorkerStatus {
    return {
      enabled: this.enabled,
      activeRunId: this.active?.runId ?? null,
      completedCount: this.completedCount,
      failedCount: this.failedCount,
      lastPollAt: this.lastPollAt,
      lastError: this.lastError,
    };
  }

  async tick() {
    if (!this.enabled || !this.scope || !this.identity || this.polling || this.stopped || this.active) return;
    this.polling = true;
    this.lastPollAt = Date.now();
    const releaseSharedSlot = this.tryAcquireSharedSlot?.() ?? null;
    if (this.tryAcquireSharedSlot && !releaseSharedSlot) {
      this.polling = false;
      return;
    }
    let slotTransferred = false;
    try {
      const leaseId = randomUUID();
      const claim = await this.command("claimMissionPlanningRun", "planning.claim", {
        projectId: this.scope.projectId,
        repositoryId: this.scope.repositoryId,
        leaseId,
        workerId: this.identity.workerId,
        workerSessionId: this.identity.sessionId,
        leaseDurationMs: PLANNING_LEASE_MS,
      });
      if (!claim?.claimed || !claim.run) return;
      const controller = new AbortController();
      const task = this.execute(claim.run, claim.host, leaseId, controller)
        .catch((error) => {
          this.failedCount += 1;
          this.lastError = safeError(error);
          console.error(`[planning-worker] Run ${String(claim.run._id)} failed: ${this.lastError}`);
        })
        .finally(() => {
          this.active = null;
          releaseSharedSlot?.();
        });
      this.active = { runId: String(claim.run._id), controller, task };
      slotTransferred = true;
    } catch (error) {
      this.lastError = safeError(error);
      console.error(`[planning-worker] Poll failed: ${this.lastError}`);
    } finally {
      if (!slotTransferred) releaseSharedSlot?.();
      this.polling = false;
    }
  }

  private async execute(run: any, host: any, leaseId: string, controller: AbortController) {
    const worktree = path.join(
      host.checkoutRoot,
      ".mission-control",
      "worktrees",
      `planning-${String(run._id).slice(-20)}`,
    );
    let worktreeReady = false;
    let worktreeReleased = false;
    const heartbeat = setInterval(() => void this.renew(run, leaseId, controller), HEARTBEAT_MS);
    try {
      assertMissionPlanningExecutionProfile(run);
      await ensurePlanningWorktree({
        checkoutRoot: host.checkoutRoot,
        worktree,
        planningRepositorySha: run.planningRepositorySha,
      });
      worktreeReady = true;
      const registration = this.adapters.requireRegistration(run.executor);
      assertMissionPlanningHarnessRegistration(run, registration);
      const adapter = registration.adapter;
      let researchPacket = run.researchPacket as PlanningResearchPacket | undefined;
      if (!researchPacket) {
        const prompt = researchPrompt(run.inputSnapshot);
        const researchRequest = this.request({
          run,
          worktree,
          phase: "research",
          prompt,
          schemaId: RESEARCH_PACKET_SCHEMA_ID,
          jsonSchema: RESEARCH_PACKET_OUTPUT_SCHEMA,
        });
        const researchResult = await runHarnessExecution(adapter, researchRequest, {
          signal: controller.signal,
          emit: () => undefined,
        });
        const researchExecution = executionProvenance(researchResult.normalizedResult, "RESEARCH", prompt, run);
        await this.report(run, leaseId, {
          kind: "PHASE_EXECUTION_RECORDED",
          harnessExecution: researchExecution,
        });
        assertMissionPlanningHarnessResult(
          researchResult.normalizedResult,
          researchRequest,
          run,
          registration,
          RESEARCH_PACKET_SCHEMA_ID,
        );
        researchPacket = await validateResearchOutput({
          output: researchResult.output ?? "",
          worktree,
          repository: run.inputSnapshot.repository.repository,
          sha: run.planningRepositorySha,
        });
        await this.report(run, leaseId, {
          kind: "RESEARCH_COMPLETED",
          researchPacket,
        });
      }

      const prompt = generationPrompt(run.inputSnapshot, researchPacket);
      const generationRequest = this.request({
        run,
        worktree,
        phase: "generation",
        prompt,
        schemaId: PLAN_CANDIDATE_SCHEMA_ID,
        jsonSchema: PLAN_CANDIDATE_OUTPUT_SCHEMA,
      });
      const generationResult = await runHarnessExecution(adapter, generationRequest, {
        signal: controller.signal,
        emit: () => undefined,
      });
      await this.report(run, leaseId, {
        kind: "PHASE_EXECUTION_RECORDED",
        harnessExecution: executionProvenance(generationResult.normalizedResult, "GENERATION", prompt, run),
      });
      assertMissionPlanningHarnessResult(
        generationResult.normalizedResult,
        generationRequest,
        run,
        registration,
        PLAN_CANDIDATE_SCHEMA_ID,
      );
      await this.report(run, leaseId, { kind: "VALIDATION_STARTED" });
      const candidate = validateCandidateOutput({
        output: generationResult.output ?? "",
        inputSnapshot: run.inputSnapshot,
      });
      await assertPlanningWorktreeUnchanged(worktree, run.planningRepositorySha);
      await releasePlanningWorktree({
        checkoutRoot: host.checkoutRoot,
        worktree,
        planningRepositorySha: run.planningRepositorySha,
      });
      worktreeReleased = true;
      await this.report(run, leaseId, {
        kind: "SUCCEEDED",
        ...candidate,
      });
      this.completedCount += 1;
      this.lastError = null;
    } catch (error) {
      let failure = planningFailure(error);
      if (worktreeReady && !worktreeReleased) {
        try {
          await releasePlanningWorktree({
            checkoutRoot: host.checkoutRoot,
            worktree,
            planningRepositorySha: run.planningRepositorySha,
          });
          worktreeReleased = true;
        } catch (cleanupError) {
          failure = {
            code: "READ_ONLY_BOUNDARY_VIOLATION",
            message: `${failure.message} Cleanup verification failed: ${safeError(cleanupError)}`.slice(0, 2_000),
            retryable: false,
          };
        }
      }
      await this.report(run, leaseId, { kind: "FAILED", ...failure }).catch((reportError) => {
        throw new Error(`${failure.message} Planning failure report also failed: ${safeError(reportError)}`);
      });
      throw error;
    } finally {
      clearInterval(heartbeat);
    }
  }

  private request(input: {
    run: any;
    worktree: string;
    phase: "research" | "generation";
    prompt: string;
    schemaId: string;
    jsonSchema: Record<string, unknown>;
  }): ExecutorRequest {
    return buildMissionPlanningExecutorRequest(input);
  }

  private async renew(run: any, leaseId: string, controller: AbortController) {
    if (!this.scope || !this.identity || controller.signal.aborted) return;
    try {
      const result = await this.command("renewMissionPlanningRun", "planning.renew", {
        planningRunId: run._id,
        leaseId,
        workerId: this.identity.workerId,
        workerSessionId: this.identity.sessionId,
        leaseDurationMs: PLANNING_LEASE_MS,
      });
      if (!result?.renewed) controller.abort(new Error("Planning lease renewal was rejected."));
    } catch (error) {
      controller.abort(error);
    }
  }

  private async report(run: any, leaseId: string, report: unknown) {
    if (!this.identity) throw new Error("Planning worker identity is unavailable.");
    return await this.command("reportMissionPlanningRun", "planning.report", {
      planningRunId: run._id,
      leaseId,
      workerId: this.identity.workerId,
      workerSessionId: this.identity.sessionId,
      report,
    });
  }

  private async command(action: keyof typeof ConvexActions.serviceCommands, capability: "planning.claim" | "planning.renew" | "planning.report", payload: unknown) {
    if (!this.scope) throw new Error("Planning worker scope is unavailable.");
    const command = createSignedServiceCommand({
      capability,
      projectId: this.scope.projectId,
      repositoryId: this.scope.repositoryId,
      payload,
    });
    return await this.client.action(ConvexActions.serviceCommands[action] as any, command) as any;
  }
}

export function buildMissionPlanningExecutorRequest(input: {
  run: any;
  worktree: string;
  phase: "research" | "generation";
  prompt: string;
  schemaId: string;
  jsonSchema: Record<string, unknown>;
}): ExecutorRequest {
  assertMissionPlanningExecutionProfile(input.run);
  const exactRoute = missionPlanningRouteRequestFields(input.run);
  return {
    executionId: `${String(input.run._id)}:${input.run.attemptCount}:${input.phase}`,
    repositoryRoot: input.worktree,
    workingDirectory: input.worktree,
    prompt: input.prompt,
    model: input.run.modelId,
    provider: input.run.modelProvider,
    ...exactRoute,
    allowedPaths: ["."],
    deniedPaths: [".env", ".env.*"],
    timeoutMs: Math.min(45, Math.max(1, input.run.inputSnapshot?.planner?.maxRuntimeMinutes ?? 45)) * 60_000,
    isolation: "READ_ONLY",
    filesystemReadScope: "WORKSPACE_ONLY",
    structuredOutput: { schemaId: input.schemaId, jsonSchema: input.jsonSchema },
  };
}

export function assertMissionPlanningHarnessRegistration(
  run: any,
  registration: RegisteredHarnessAdapter,
) {
  const executionProfile = assertMissionPlanningExecutionProfile(run);
  const expectedRuntimeDigest = run.executor?.runtimeArtifactSha256;
  if (!run.executor?.runtimeArtifact
    || typeof expectedRuntimeDigest !== "string"
    || run.executionBackend !== "persistent-worker"
    || registration.capabilities.adapter !== run.executor?.adapter
    || registration.capabilities.version !== run.executor?.version
    || registration.capabilityManifestSha256 !== run.executor?.capabilityManifestSha256
    || registration.effectiveConfigSha256 !== run.executor?.effectiveConfigSha256
    || (executionProfile !== null
      && canonicalHash(registration.manifest) !== canonicalHash(executionProfile.profileSnapshot.harness.capabilityManifest))
    || !runtimeArtifactMatches(
      registration.runtimeArtifact,
      registration.runtimeArtifactSha256,
      run.executor.runtimeArtifact,
      expectedRuntimeDigest,
    )) {
    throw planningError(
      "HARNESS_IDENTITY_MISMATCH",
      "Registered planning harness does not match the frozen Factory execution identity.",
      false,
    );
  }
  missionPlanningRouteRequestFields(run);
}

/** Re-hashes the frozen profile at the worker boundary before registry lookup.
 * Live eligibility is owned by claim; a valid lease may complete after later
 * expiry or revocation, so this intentionally verifies identity rather than
 * re-evaluating wall-clock currentness. */
export function assertMissionPlanningExecutionProfile(run: any) {
  const state = workerExecutionProfileBindingState(run);
  const inputBinding = run.inputSnapshot?.factoryAdmission?.executionProfile;
  if (state === "NONE") {
    if (inputBinding !== undefined || !missionPlanningFrozenCoreIdentityComplete(run)) {
      throw planningError(
        "EXECUTION_PROFILE_MISSING",
        "Profileless planning execution is allowed only for a complete historical frozen identity.",
        false,
      );
    }
    return null;
  }
  if (state !== "COMPLETE") {
    throw planningError(
      "EXECUTION_PROFILE_MISSING",
      "Planning run has a partial Execution Profile binding.",
      false,
    );
  }
  if (!missionPlanningFrozenCoreIdentityComplete(run)) {
    throw planningError(
      "EXECUTION_PROFILE_IDENTITY_MISMATCH",
      "Planning run core execution identity does not match its frozen Execution Profile projection.",
      false,
    );
  }

  const binding = frozenWorkerExecutionProfileBinding(run)!;
  const profile = binding.profileSnapshot as Record<string, any>;
  const qualification = binding.qualificationSnapshot as Record<string, any>;
  const manifest = profile?.harness?.capabilityManifest;
  const qualificationComponents = executionProfileQualificationComponents(profile);
  const isolationModes = profile?.isolationModes;
  const expectedHarnessCapabilities = executionProfileHarnessRequirements(isolationModes);
  const expectedSandboxCapabilities = executionProfileSandboxRequirements(isolationModes);
  const profileFields = [
    "schema", "profileKey", "version", "harness", "runtimeArtifact", "executionBackend",
    "modelRoute", "isolationModes", "requiredHarnessCapabilities", "requiredSandboxCapabilities",
    "lifecycle", "authority",
  ];
  const qualificationFields = [
    "schema", "profile", "components", "scope", "evidence", "approvedBy", "approvedAt",
    "validUntil", "authority",
  ];
  const harnessFields = ["adapter", "version", "capabilityManifest", "capabilityManifestDigest", "effectiveConfigSha256"];
  const runtimeFields = ["snapshot", "digest"];
  const routeFields = ["catalogId", "routeSnapshot", "routeDigest", "qualificationSnapshot", "qualificationDigest"];
  const lifecycleFields = [
    "contractVersion", "cancellationMode", "idempotentCleanup", "retryCreatesNewAttempt",
    "inFlightRevocationPolicy", "componentSubstitution",
  ];
  const componentFields = [
    "harness", "runtimeArtifactDigest", "executionBackend", "modelRoute", "isolationModes",
    "requiredHarnessCapabilities", "requiredSandboxCapabilities",
  ];
  let manifestDigest: string | null = null;
  let runtimeDigest: string | null = null;
  try {
    manifestDigest = harnessCapabilityManifestDigest(manifest);
    runtimeDigest = harnessRuntimeArtifactDigest(profile?.runtimeArtifact?.snapshot);
  } catch {
    // The consolidated mismatch below produces one stable worker failure.
  }
  if (!onlyExecutionProfileKeys(profile, profileFields)
    || !onlyExecutionProfileKeys(qualification, qualificationFields)
    || !onlyExecutionProfileKeys(profile?.harness, harnessFields)
    || !onlyExecutionProfileKeys(profile?.runtimeArtifact, runtimeFields)
    || !onlyExecutionProfileKeys(profile?.modelRoute, routeFields)
    || !onlyExecutionProfileKeys(profile?.lifecycle, lifecycleFields)
    || !onlyExecutionProfileKeys(qualification?.profile, ["id", "key", "version", "digest"])
    || !onlyExecutionProfileKeys(qualification?.components, componentFields)
    || !onlyExecutionProfileKeys(qualification?.components?.harness, ["adapter", "version", "capabilityManifestDigest", "effectiveConfigSha256"])
    || !onlyExecutionProfileKeys(qualification?.components?.modelRoute, ["catalogId", "routeDigest", "qualificationDigest"])
    || !onlyExecutionProfileKeys(qualification?.scope, ["workloadClasses", "riskClasses"])
    || !onlyExecutionProfileKeys(qualification?.evidence, ["reference", "digest"])
    || profile.schema !== "factory-execution-profile/v1"
    || qualification.schema !== "factory-execution-profile-qualification/v1"
    || !boundedLowercaseIdentity(binding.profileKey, 100)
    || !/^[a-z0-9][a-z0-9._-]*$/.test(binding.profileKey)
    || !Number.isSafeInteger(binding.version)
    || binding.version < 1
    || binding.version > 1_000_000
    || !/^sha256:[a-f0-9]{64}$/.test(binding.profileDigest)
    || !/^sha256:[a-f0-9]{64}$/.test(binding.qualificationDigest)
    || binding.profileDigest !== canonicalIdentityDigest(profile.schema, profile)
    || binding.qualificationDigest !== canonicalIdentityDigest(qualification.schema, qualification)
    || profile.profileKey !== binding.profileKey
    || profile.version !== binding.version
    || qualification.profile?.id !== binding.profileId
    || qualification.profile?.key !== binding.profileKey
    || qualification.profile?.version !== binding.version
    || qualification.profile?.digest !== binding.profileDigest
    || !Number.isFinite(qualification.approvedAt)
    || !Number.isFinite(qualification.validUntil)
    || qualification.validUntil <= qualification.approvedAt
    || qualification.validUntil - qualification.approvedAt > 366 * 24 * 60 * 60 * 1_000
    || !boundedWorkerIdentity(qualification.approvedBy, 200)
    || !boundedWorkerIdentity(qualification.evidence?.reference, 1_000)
    || !/^sha256:[a-f0-9]{64}$/.test(qualification.evidence?.digest ?? "")
    || !canonicalSortedStringArray(qualification.scope?.workloadClasses)
    || !qualification.scope.workloadClasses.includes("MISSION_PLANNING")
    || qualification.scope.workloadClasses.some((value: string) => !/^[A-Z][A-Z0-9_]*$/.test(value))
    || !canonicalSortedStringArray(qualification.scope?.riskClasses)
    || !qualification.scope.riskClasses.includes("YELLOW")
    || qualification.scope.riskClasses.some((value: string) => !["GREEN", "YELLOW", "RED"].includes(value))
    || !allDeniedExecutionProfileAuthority(profile.authority)
    || !allDeniedExecutionProfileAuthority(qualification.authority)
    || profile.lifecycle?.contractVersion !== GENERIC_HARNESS_CONTRACT_VERSION
    || profile.lifecycle?.cancellationMode !== manifest?.cancellation?.mode
    || profile.lifecycle?.idempotentCleanup !== manifest?.cancellation?.idempotentCleanup
    || profile.lifecycle?.retryCreatesNewAttempt !== true
    || profile.lifecycle?.inFlightRevocationPolicy !== "LEASED_ATTEMPT_MAY_COMPLETE"
    || profile.lifecycle?.componentSubstitution !== "DENIED"
    || !canonicalSortedStringArray(isolationModes)
    || !isolationModes.includes("READ_ONLY")
    || isolationModes.some((mode: unknown) => mode !== "READ_ONLY" && mode !== "WORKSPACE_WRITE")
    || !sameCanonical(profile.requiredHarnessCapabilities, expectedHarnessCapabilities)
    || !sameStringSet(profile.requiredSandboxCapabilities, expectedSandboxCapabilities)
    || harnessManifestIssues(manifest).length > 0
    || manifestDigest !== profile.harness?.capabilityManifestDigest
    || manifest?.effectiveConfigSha256 !== profile.harness?.effectiveConfigSha256
    || !harnessCapabilityRequirementsSatisfied(manifest, profile.requiredHarnessCapabilities)
    || profile.harness?.adapter !== run.executor?.adapter
    || profile.harness?.version !== run.executor?.version
    || profile.harness?.capabilityManifestDigest !== run.executor?.capabilityManifestSha256
    || profile.harness?.effectiveConfigSha256 !== run.executor?.effectiveConfigSha256
    || runtimeDigest !== profile.runtimeArtifact?.digest
    || profile.runtimeArtifact?.digest !== run.executor?.runtimeArtifactSha256
    || !sameCanonical(profile.runtimeArtifact?.snapshot, run.executor?.runtimeArtifact)
    || profile.executionBackend !== "persistent-worker"
    || profile.executionBackend !== run.executionBackend
    || profile.sandboxProfile !== undefined
    || profile.modelRoute?.catalogId !== String(run.modelCatalogId)
    || profile.modelRoute?.routeDigest !== run.modelRouteDigest
    || profile.modelRoute?.qualificationDigest !== run.modelQualificationDigest
    || !sameCanonical(profile.modelRoute?.routeSnapshot, run.modelRouteSnapshot)
    || !sameCanonical(profile.modelRoute?.qualificationSnapshot, run.modelQualificationSnapshot)
    || !sameCanonical(qualification.components, qualificationComponents)
    || qualification.components?.sandboxProfile !== undefined
    || !sameCanonical(inputBinding, binding)) {
    throw planningError(
      "EXECUTION_PROFILE_IDENTITY_MISMATCH",
      "Planning run Execution Profile does not match its frozen harness, runtime, route, qualification, backend, or read-only isolation identity.",
      false,
    );
  }
  return binding;
}

export function assertMissionPlanningHarnessResult(
  result: HarnessNormalizedResult | undefined,
  request: ExecutorRequest,
  run: any,
  registration: RegisteredHarnessAdapter,
  expectedSchema: string,
) {
  if (!result || result.status !== "COMPLETED") {
    throw planningError("HARNESS_EXECUTION_FAILED", result?.error ?? "Planning harness execution did not complete.", true);
  }
  const resultIssues = harnessNormalizedResultIssues(result);
  const expectedRuntimeDigest = run.executor?.runtimeArtifactSha256;
  const exactRouteMismatch = request.modelRouteDigest !== undefined && (
    result.provenance.modelRouteDigest !== request.modelRouteDigest
    || result.provenance.providerRoute !== request.providerRoute
    || canonicalHash(result.provenance.reasoningConfig ?? null) !== canonicalHash(request.reasoningConfig ?? null)
  );
  const runtimeMismatch = expectedRuntimeDigest !== undefined
    && !runtimeArtifactMatches(
      result.provenance.runtimeArtifact,
      result.provenance.runtimeArtifactDigest,
      run.executor?.runtimeArtifact,
      expectedRuntimeDigest,
    );
  if (resultIssues.length > 0
    || result.executionId !== request.executionId
    || result.harness.adapterId !== run.executor?.adapter
    || result.harness.adapterVersion !== run.executor?.version
    || canonicalHash(result.harness) !== canonicalHash(registration.manifest?.identity)
    || result.provenance.capabilityManifestSha256 !== run.executor?.capabilityManifestSha256
    || result.provenance.effectiveConfigSha256 !== run.executor?.effectiveConfigSha256
    || result.provenance.requestSha256 !== harnessExecutionRequestDigest(request)
    || result.provenance.provider !== (request.provider ?? null)
    || result.provenance.model !== (request.model ?? null)
    || exactRouteMismatch
    || runtimeMismatch) {
    throw planningError(
      "HARNESS_IDENTITY_MISMATCH",
      `Planning harness result does not match the frozen execution identity${resultIssues.length ? ` (${resultIssues.join(", ")})` : ""}.`,
      false,
    );
  }
  if (result.repository.baselineCommit !== run.planningRepositorySha
    || result.repository.headCommit !== run.planningRepositorySha
    || result.repository.headChanged
    || result.repository.changedFiles.length > 0
    || result.repository.scopeViolations.length > 0) {
    throw planningError("READ_ONLY_BOUNDARY_VIOLATION", "Planning harness did not preserve the exact clean repository revision.", false);
  }
  if (result.structuredOutput.schema !== expectedSchema || !result.output.trim()) {
    throw planningError("STRUCTURED_OUTPUT_INVALID", `Planning harness did not return ${expectedSchema}.`, false);
  }
}

function missionPlanningRouteRequestFields(run: any): Pick<
  ExecutorRequest,
  "modelRouteDigest" | "providerRoute" | "reasoningConfig"
> {
  const route = run.modelRouteSnapshot as Record<string, any> | undefined;
  if (!route
    || !["factory-model-route/v1", "factory-model-route/v2"].includes(route.schema)
    || run.modelRouteDigest !== canonicalIdentityDigest(route.schema, route)
    || route.provider !== run.modelProvider
    || route.modelId !== run.modelId) {
    throw planningError("MODEL_ROUTE_IDENTITY_MISMATCH", "Planning run model route is invalid or no longer exact.", false);
  }
  if (route.schema === "factory-model-route/v1") {
    if (route.capabilityIdentity?.adapter !== run.executor?.adapter
      || route.capabilityIdentity?.version !== run.executor?.version
      || route.capabilityIdentity?.capabilityManifestDigest !== run.executor?.capabilityManifestSha256
      || route.capabilityIdentity?.effectiveConfigSha256 !== run.executor?.effectiveConfigSha256) {
      throw planningError("MODEL_ROUTE_IDENTITY_MISMATCH", "Legacy planning route does not match its frozen harness identity.", false);
    }
    return {};
  }
  const qualification = run.modelQualificationSnapshot as Record<string, any> | undefined;
  const compatibility = qualification?.compatibility as Record<string, any> | undefined;
  if (!boundedLowercaseIdentity(route.providerRoute, 100)
    || modelRouteReasoningConfigIssues(route.reasoningConfig).length > 0
    || qualification?.schema !== "factory-model-route-qualification/v2"
    || qualification.routeDigest !== run.modelRouteDigest
    || run.modelQualificationDigest !== canonicalIdentityDigest(qualification.schema, qualification)
    || run.executionBackend !== "persistent-worker"
    || compatibility?.adapter !== run.executor?.adapter
    || compatibility?.version !== run.executor?.version
    || compatibility?.capabilityManifestDigest !== run.executor?.capabilityManifestSha256
    || compatibility?.effectiveConfigSha256 !== run.executor?.effectiveConfigSha256
    || compatibility?.runtimeArtifactDigest !== run.executor?.runtimeArtifactSha256
    || compatibility?.executionBackend !== run.executionBackend) {
    throw planningError("MODEL_ROUTE_IDENTITY_MISMATCH", "Planning run V2 route qualification does not match its frozen execution identity.", false);
  }
  return {
    modelRouteDigest: run.modelRouteDigest,
    providerRoute: route.providerRoute,
    ...(route.reasoningConfig === undefined ? {} : { reasoningConfig: structuredClone(route.reasoningConfig) }),
  };
}

function canonicalIdentityDigest(schema: string, snapshot: unknown) {
  return `sha256:${canonicalHash({ namespace: schema, value: snapshot })}`;
}

function runtimeArtifactMatches(
  candidate: unknown,
  candidateDigest: unknown,
  expected: unknown,
  expectedDigest: string,
) {
  try {
    return candidateDigest === expectedDigest
      && harnessRuntimeArtifactDigest(candidate as any) === expectedDigest
      && canonicalHash(candidate) === canonicalHash(expected);
  } catch {
    return false;
  }
}

const WORKER_EXECUTION_PROFILE_FIELDS = [
  "executionProfileId",
  "executionProfileKey",
  "executionProfileVersion",
  "executionProfileDigest",
  "executionProfileSnapshot",
  "executionProfileQualificationDigest",
  "executionProfileQualificationSnapshot",
] as const;

function workerExecutionProfileBindingState(run: Record<string, any>) {
  const present = WORKER_EXECUTION_PROFILE_FIELDS.filter((field) => run[field] !== undefined).length;
  if (present === 0) return "NONE" as const;
  if (present === WORKER_EXECUTION_PROFILE_FIELDS.length) return "COMPLETE" as const;
  return "PARTIAL" as const;
}

function frozenWorkerExecutionProfileBinding(run: Record<string, any>) {
  if (workerExecutionProfileBindingState(run) !== "COMPLETE") return null;
  return {
    profileId: String(run.executionProfileId),
    profileKey: run.executionProfileKey,
    version: run.executionProfileVersion,
    profileDigest: run.executionProfileDigest,
    profileSnapshot: run.executionProfileSnapshot,
    qualificationDigest: run.executionProfileQualificationDigest,
    qualificationSnapshot: run.executionProfileQualificationSnapshot,
  };
}

function workerExecutionProfileReceiptIdentity(run: Record<string, any>) {
  const binding = frozenWorkerExecutionProfileBinding(run);
  return binding ? {
    profileId: binding.profileId,
    profileKey: binding.profileKey,
    version: binding.version,
    profileDigest: binding.profileDigest,
    qualificationDigest: binding.qualificationDigest,
  } : null;
}

function missionPlanningFrozenCoreIdentityComplete(run: Record<string, any>) {
  const admission = run.inputSnapshot?.factoryAdmission as Record<string, any> | undefined;
  if (!run.inputSnapshot
    || run.inputDigest !== `sha256:${canonicalHash(run.inputSnapshot)}`
    || run.executionBackend !== "persistent-worker"
    || !run.factoryDefinitionVersionId
    || !run.factoryConfigurationDigest
    || !run.modelCatalogId
    || !run.executor?.runtimeArtifact
    || typeof run.executor.runtimeArtifactSha256 !== "string"
    || !admission
    || admission.factoryDefinitionVersionId !== String(run.factoryDefinitionVersionId)
    || admission.factoryConfigurationDigest !== run.factoryConfigurationDigest
    || admission.modelCatalogId !== String(run.modelCatalogId)
    || admission.modelRouteDigest !== run.modelRouteDigest
    || admission.modelQualificationDigest !== run.modelQualificationDigest
    || admission.executionBackend !== run.executionBackend
    || admission.harnessRuntimeArtifactSha256 !== run.executor.runtimeArtifactSha256) {
    return false;
  }
  try {
    missionPlanningRouteRequestFields(run);
    return harnessRuntimeArtifactDigest(run.executor.runtimeArtifact) === run.executor.runtimeArtifactSha256;
  } catch {
    return false;
  }
}

function executionProfileQualificationComponents(profile: Record<string, any> | undefined) {
  if (!profile) return null;
  return {
    harness: {
      adapter: profile.harness?.adapter,
      version: profile.harness?.version,
      capabilityManifestDigest: profile.harness?.capabilityManifestDigest,
      effectiveConfigSha256: profile.harness?.effectiveConfigSha256,
    },
    runtimeArtifactDigest: profile.runtimeArtifact?.digest,
    executionBackend: profile.executionBackend,
    modelRoute: {
      catalogId: profile.modelRoute?.catalogId,
      routeDigest: profile.modelRoute?.routeDigest,
      qualificationDigest: profile.modelRoute?.qualificationDigest,
    },
    isolationModes: structuredClone(profile.isolationModes),
    requiredHarnessCapabilities: structuredClone(profile.requiredHarnessCapabilities),
    requiredSandboxCapabilities: structuredClone(profile.requiredSandboxCapabilities),
  };
}

function executionProfileHarnessRequirements(isolationModes: unknown) {
  if (!Array.isArray(isolationModes)) return [];
  const requirements = new Map<string, "PARTIAL" | "SUPPORTED">();
  for (const mode of isolationModes) {
    const candidates = [
      { capability: "filesystem.read", minimumSupport: "SUPPORTED" as const },
      ...(mode === "WORKSPACE_WRITE"
        ? [{ capability: "filesystem.write", minimumSupport: "SUPPORTED" as const }]
        : []),
      { capability: "filesystem.pathAllowlist", minimumSupport: "PARTIAL" as const },
      { capability: "shell.available", minimumSupport: "PARTIAL" as const },
      { capability: "shell.processTreeCancellation", minimumSupport: "PARTIAL" as const },
      { capability: "git.status", minimumSupport: "SUPPORTED" as const },
      { capability: "git.diff", minimumSupport: "SUPPORTED" as const },
      { capability: "tools.structuredOutput", minimumSupport: "PARTIAL" as const },
      { capability: "headless.support", minimumSupport: "PARTIAL" as const },
      { capability: "cancellation.support", minimumSupport: "PARTIAL" as const },
    ];
    for (const requirement of candidates) {
      const current = requirements.get(requirement.capability);
      if (current !== "SUPPORTED") requirements.set(requirement.capability, requirement.minimumSupport);
    }
  }
  return [...requirements.entries()]
    .map(([capability, minimumSupport]) => ({ capability, minimumSupport }))
    .sort((left, right) => left.capability.localeCompare(right.capability));
}

function executionProfileSandboxRequirements(isolationModes: unknown) {
  if (!Array.isArray(isolationModes)) return [];
  const requirements = new Set(["git-worktree"]);
  if (isolationModes.includes("READ_ONLY")) requirements.add("read-only");
  if (isolationModes.includes("WORKSPACE_WRITE")) requirements.add("workspace-write");
  return [...requirements].sort();
}

function allDeniedExecutionProfileAuthority(authority: unknown) {
  const keys = ["routing", "verification", "publication", "acceptance", "merge", "policyMutation", "workerLeases"];
  if (!authority || typeof authority !== "object" || Array.isArray(authority)) return false;
  return Object.keys(authority).length === keys.length
    && keys.every((key) => (authority as Record<string, unknown>)[key] === false);
}

function onlyExecutionProfileKeys(value: unknown, keys: string[]) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.keys(value).length === keys.length
    && Object.keys(value).every((key) => keys.includes(key));
}

function sameCanonical(left: unknown, right: unknown) {
  return canonicalHash(left) === canonicalHash(right);
}

function sameStringSet(left: unknown, right: unknown) {
  if (!Array.isArray(left) || !Array.isArray(right)
    || left.some((value) => typeof value !== "string")
    || right.some((value) => typeof value !== "string")) return false;
  return left.length === right.length
    && new Set(left).size === left.length
    && new Set(right).size === right.length
    && JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
}

function canonicalSortedStringArray(value: unknown) {
  return Array.isArray(value)
    && value.length > 0
    && value.every((item) => boundedWorkerIdentity(item, 100))
    && new Set(value).size === value.length
    && JSON.stringify(value) === JSON.stringify([...value].sort());
}

function boundedWorkerIdentity(value: unknown, maximum: number): value is string {
  return typeof value === "string"
    && value === value.trim()
    && value.length > 0
    && value.length <= maximum
    && !/[\0\r\n]/.test(value);
}

function boundedLowercaseIdentity(value: unknown, maximum: number): value is string {
  return typeof value === "string"
    && value === value.trim()
    && value === value.toLowerCase()
    && value.length > 0
    && value.length <= maximum;
}

function executionProvenance(
  result: HarnessNormalizedResult | undefined,
  phase: "RESEARCH" | "GENERATION",
  prompt: string,
  run: Record<string, any>,
) {
  if (!result) return null;
  const executionProfile = workerExecutionProfileReceiptIdentity(run);
  return {
    phase,
    executionId: result.executionId,
    status: result.status,
    harness: result.harness,
    provenance: result.provenance,
    ...(executionProfile ? { executionProfile } : {}),
    promptIdentity: {
      version: phase === "RESEARCH"
        ? BUILT_IN_MISSION_PLANNER_IDENTITY.researchPromptVersion
        : BUILT_IN_MISSION_PLANNER_IDENTITY.generationPromptVersion,
      digest: `sha256:${createHash("sha256").update(prompt).digest("hex")}`,
    },
    timing: result.timing,
    usage: result.usage,
    repository: {
      baselineCommit: result.repository.baselineCommit,
      headCommit: result.repository.headCommit,
      headChanged: result.repository.headChanged,
      changedFiles: result.repository.changedFiles,
      scopeViolations: result.repository.scopeViolations,
    },
    events: {
      toolCalls: result.events.toolCalls,
      modelRequests: result.events.modelRequests,
      retries: result.events.retries,
      sessionCount: result.events.sessionCount,
    },
    structuredOutput: result.structuredOutput,
  };
}

interface PlanningError extends Error {
  planningCode?: string;
  retryable?: boolean;
}

function planningError(code: string, message: string, retryable: boolean) {
  return Object.assign(new Error(message), { planningCode: code, retryable }) as PlanningError;
}

function planningFailure(error: unknown) {
  const typed = error as PlanningError;
  const message = safeError(error);
  if (typed?.planningCode) return { code: typed.planningCode, message, retryable: typed.retryable === true };
  if (/timed out|temporar|unavailable|rate.?limit|ECONN|lease renewal/i.test(message)) {
    return { code: "RETRYABLE_PLANNING_RUNTIME", message, retryable: true };
  }
  if (/read-only|repository changes|moved away|escaped|outside the exact checkout/i.test(message)) {
    return { code: "READ_ONLY_BOUNDARY_VIOLATION", message, retryable: false };
  }
  return { code: "PLANNING_VALIDATION_FAILED", message, retryable: false };
}

function safeError(error: unknown) {
  return (error instanceof Error ? error.message : String(error))
    .replace(/(authorization|cookie|token|secret|password|api[-_]?key)\s*[:=]\s*([^\s,;]+)/gi, "$1=[REDACTED]")
    .slice(0, 2_000);
}

function boundedInteger(raw: string | undefined, min: number, max: number, fallback: number) {
  const parsed = Number.parseInt(raw ?? "", 10);
  return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}
