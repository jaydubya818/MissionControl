import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import type { ConvexHttpClient } from "convex/browser";
import { runHarnessExecution, type ExecutorRequest, type HarnessNormalizedResult } from "@mission-control/workflow-engine";
import { ConvexActions } from "./convexCalls.js";
import {
  assertPlanningWorktreeUnchanged,
  ensurePlanningWorktree,
  releasePlanningWorktree,
} from "./factoryGitRuntime.js";
import { HarnessAdapterRegistry } from "./harnessAdapterRegistry.js";
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
import { BUILT_IN_MISSION_PLANNER_IDENTITY } from "@mission-control/shared";

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
      await ensurePlanningWorktree({
        checkoutRoot: host.checkoutRoot,
        worktree,
        planningRepositorySha: run.planningRepositorySha,
      });
      worktreeReady = true;
      const adapter = this.adapters.require(run.executor);
      let researchPacket = run.researchPacket as PlanningResearchPacket | undefined;
      if (!researchPacket) {
        const prompt = researchPrompt(run.inputSnapshot);
        const researchResult = await runHarnessExecution(adapter, this.request({
          run,
          worktree,
          phase: "research",
          prompt,
          schemaId: RESEARCH_PACKET_SCHEMA_ID,
          jsonSchema: RESEARCH_PACKET_OUTPUT_SCHEMA,
        }), { signal: controller.signal, emit: () => undefined });
        const researchExecution = executionProvenance(researchResult.normalizedResult, "RESEARCH", prompt);
        await this.report(run, leaseId, {
          kind: "PHASE_EXECUTION_RECORDED",
          harnessExecution: researchExecution,
        });
        assertReadOnlyHarnessResult(researchResult.normalizedResult, run.planningRepositorySha, RESEARCH_PACKET_SCHEMA_ID);
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
      const generationResult = await runHarnessExecution(adapter, this.request({
        run,
        worktree,
        phase: "generation",
        prompt,
        schemaId: PLAN_CANDIDATE_SCHEMA_ID,
        jsonSchema: PLAN_CANDIDATE_OUTPUT_SCHEMA,
      }), { signal: controller.signal, emit: () => undefined });
      await this.report(run, leaseId, {
        kind: "PHASE_EXECUTION_RECORDED",
        harnessExecution: executionProvenance(generationResult.normalizedResult, "GENERATION", prompt),
      });
      assertReadOnlyHarnessResult(generationResult.normalizedResult, run.planningRepositorySha, PLAN_CANDIDATE_SCHEMA_ID);
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
    return {
      executionId: `${String(input.run._id)}:${input.run.attemptCount}:${input.phase}`,
      repositoryRoot: input.worktree,
      workingDirectory: input.worktree,
      prompt: input.prompt,
      model: input.run.modelId,
      provider: input.run.modelProvider,
      allowedPaths: ["."],
      deniedPaths: [".env", ".env.*"],
      timeoutMs: Math.min(45, Math.max(1, input.run.inputSnapshot?.planner?.maxRuntimeMinutes ?? 45)) * 60_000,
      isolation: "READ_ONLY",
      filesystemReadScope: "WORKSPACE_ONLY",
      structuredOutput: { schemaId: input.schemaId, jsonSchema: input.jsonSchema },
    };
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

function assertReadOnlyHarnessResult(
  result: HarnessNormalizedResult | undefined,
  expectedSha: string,
  expectedSchema: string,
) {
  if (!result || result.status !== "COMPLETED") {
    throw planningError("HARNESS_EXECUTION_FAILED", result?.error ?? "Planning harness execution did not complete.", true);
  }
  if (result.repository.baselineCommit !== expectedSha
    || result.repository.headCommit !== expectedSha
    || result.repository.headChanged
    || result.repository.changedFiles.length > 0
    || result.repository.scopeViolations.length > 0) {
    throw planningError("READ_ONLY_BOUNDARY_VIOLATION", "Planning harness did not preserve the exact clean repository revision.", false);
  }
  if (result.structuredOutput.schema !== expectedSchema || !result.output.trim()) {
    throw planningError("STRUCTURED_OUTPUT_INVALID", `Planning harness did not return ${expectedSchema}.`, false);
  }
}

function executionProvenance(
  result: HarnessNormalizedResult | undefined,
  phase: "RESEARCH" | "GENERATION",
  prompt: string,
) {
  if (!result) return null;
  return {
    phase,
    executionId: result.executionId,
    status: result.status,
    harness: result.harness,
    provenance: result.provenance,
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
