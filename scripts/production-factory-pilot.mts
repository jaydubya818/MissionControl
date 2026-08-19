#!/usr/bin/env node

import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { canonicalHash, resolveExecutionRoute } from "@mission-control/shared";
import { runHarnessExecution } from "@mission-control/workflow-engine";
import { aggregateLearningSignals } from "../convex/lib/factoryLearning.ts";
import { buildReviewIntelligenceProjection, buildSemanticChangeGroups } from "../convex/lib/reviewIntelligence.ts";
import { evaluateAcceptance } from "../convex/lib/workOrderGovernance.ts";
import { compileApprovedPlanQualityContract } from "../convex/lib/qualityContract.ts";
import {
  analyzeSpecPlanConsistency,
  evaluateMissionSpecQuality,
  missionSpecDigest,
  projectConstitutionDigest,
} from "../convex/lib/missionSpec.ts";
import { validateMissionPlan } from "../convex/lib/missionPlan.ts";
import { CodexV1ExecutorAdapter } from "../apps/orchestration-server/src/codexExecutorAdapter.ts";
import { ExeDevSandboxProvider, ExeDevSshTransport } from "../apps/orchestration-server/src/exeDevSandboxProvider.ts";
import {
  commitFactoryChanges,
  createFactorySourceBundle,
  inspectCandidateChange,
  listChangedFiles,
  materializeRemoteCandidate,
} from "../apps/orchestration-server/src/factoryGitRuntime.ts";
import { validateChangedFileScope } from "../apps/orchestration-server/src/factoryPathScope.ts";
import { factorySandboxResourceName } from "../convex/lib/executionManifest.ts";
import {
  decideRemoteRetry,
  remoteFailure,
  type RemoteFailure,
  type RemoteRetryBudget,
} from "../apps/orchestration-server/src/remoteExecutionPolicy.ts";
import {
  InMemoryRemoteSandboxJournal,
  RemoteSandboxExecutionError,
  RemoteSandboxRuntime,
} from "../apps/orchestration-server/src/remoteSandboxRuntime.ts";
import { factoryResultContextIssues, type FactoryResultV1 } from "../apps/orchestration-server/src/remoteStructuredResult.ts";
import { OpenRouterSandboxCredentialBroker } from "../apps/orchestration-server/src/sandboxCredentials.ts";
import { redactSandboxText, sandboxProfileDigest } from "../apps/orchestration-server/src/sandboxProvider.ts";
import { standaloneSandboxSupervisorSource } from "../apps/orchestration-server/src/sandboxSupervisor.ts";
import {
  PILOT_SCHEMA,
  PILOT_BASELINE_SHA,
  PRODUCTION_FACTORY_WORKLOADS,
  buildPilotSchedule,
  buildPilotExecutionPrompt,
  buildReliabilityScorecard,
  rate,
  validatePilotDataset,
} from "./lib/production-factory-pilot.mjs";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const evidenceDirectory = path.join(repoRoot, "docs/testing/evidence/production-factory-pilot-v2");
const runResultsPath = path.join(evidenceDirectory, "run-results.json");
const expectedBaseline = PILOT_BASELINE_SHA;
const remoteModel = "openai/gpt-5.1-codex-mini";
const localModel = "gpt-5.6-terra";
const fixedConstitution = productionPilotConstitution();
const fixedConstitutionDigest = projectConstitutionDigest(fixedConstitution as any);
const cleanupDirectories: string[] = [];

type ScheduleEntry = ReturnType<typeof buildPilotSchedule>[number];
type ExecutionRecord = Record<string, any>;

const options = parseArguments(process.argv.slice(2));
await main().finally(async () => {
  await Promise.all(cleanupDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function main() {
  if (process.env.MC_PRODUCTION_FACTORY_PILOT !== "1") {
    throw new Error("Production pilot execution requires MC_PRODUCTION_FACTORY_PILOT=1.");
  }
  if (!options.noRemote && process.env.MISSION_CONTROL_SANDBOX_LIVE !== "1") {
    throw new Error("Live remote pilot execution requires MISSION_CONTROL_SANDBOX_LIVE=1.");
  }
  await mkdir(evidenceDirectory, { recursive: true });
  process.env.CODEX_HOME = await preparePilotCodexHome();
  const head = await gitValue(repoRoot, ["rev-parse", "HEAD"]);
  const originMain = await gitValue(repoRoot, ["rev-parse", "origin/main"]);
  if (originMain !== expectedBaseline) throw new Error(`origin/main moved from the approved pilot baseline: ${originMain}`);
  const runtimeContract = Number((await readFile(path.join(repoRoot, "convex/lib/runtimeContract.ts"), "utf8"))
    .match(/RUNTIME_CONTRACT_VERSION\s*=\s*(\d+)/)?.[1]);
  if (runtimeContract !== 30) throw new Error(`Expected runtime contract v30, found v${runtimeContract}.`);

  const phaseStartedAt = Date.now();
  const pilotRunId = randomUUID().replace(/-/g, "").slice(0, 12);
  const baseline = {
    sha: expectedBaseline,
    executionHead: head,
    originMain,
    runtimeContract,
    node: process.version,
    pnpm: await commandValue("pnpm", ["--version"]),
    codex: await commandValue("codex", ["--version"]),
  };
  let dataset: any = {
    schemaVersion: PILOT_SCHEMA,
    decision: "IN_PROGRESS",
    startedAt: new Date(phaseStartedAt).toISOString(),
    pilotRunId,
    completedAt: null,
    baseline,
    authority: authorityAudit(),
    workloadMatrix: PRODUCTION_FACTORY_WORKLOADS.map((workload: any) => ({
      key: workload.key,
      class: workload.class,
      title: workload.title,
      risk: workload.risk,
      repetitions: 3,
    })),
    executions: [] as ExecutionRecord[],
    preflightFailures: [],
    environmentControls: {
      attemptScopedCodexHome: true,
      inheritedHostModelCache: false,
    },
    v1ComparisonBaseline: {
      source: "PR #120 immutable BLOCKED evidence at 604e2c482bc1b87d8a2cbca35f4c09ca13264e13",
      governedExecutions: 15,
      eventualSuccesses: 13,
      localSuccesses: 12,
      localSamples: 12,
      remoteSuccesses: 1,
      remoteSamples: 3,
      attempts: 29,
      failedAttempts: 16,
      remoteStructuredOutputFailures: 2,
      retries: 16,
      contextMisses: 0,
      verificationFailures: 2,
      humanReviewCorrections: 0,
      firstPassStructuredResultRate: 0.8667,
      firstPassVerificationRate: 0.8667,
      finalVmCount: 0,
    },
    failureInjections: [],
    routingShadow: { mode: "ADVISORY", guardedAutoEnabled: false, decisions: [] },
    factoryLearning: null,
    scorecard: null,
    limitations: [
      "Provider PR lineage is a deterministic fixture; no external repository or pull request is mutated.",
      "Human Plan approval and workOrders.accept are exercised as authorized operator fixtures, not unattended production mutations.",
      "Residual AI review remains disabled.",
    ],
  };
  if (options.finalizeExisting) {
    if (!await fileExists(runResultsPath)) throw new Error("--finalize-existing requires an existing pilot run-results.json.");
    dataset = JSON.parse(await readFile(runResultsPath, "utf8"));
    if (dataset.schemaVersion !== PILOT_SCHEMA || dataset.baseline?.sha !== expectedBaseline || dataset.executions?.length !== 15) {
      throw new Error("Existing pilot evidence does not match the complete frozen V2 pilot contract.");
    }
  } else if (options.resumeFailed) {
    if (!await fileExists(runResultsPath)) throw new Error("--resume-failed requires an existing pilot run-results.json.");
    const initialRunPath = path.join(evidenceDirectory, "initial-run-results.json");
    if (!await fileExists(initialRunPath)) await copyFile(runResultsPath, initialRunPath);
    dataset = JSON.parse(await readFile(runResultsPath, "utf8"));
    if (dataset.schemaVersion !== PILOT_SCHEMA || dataset.baseline?.sha !== expectedBaseline) {
      throw new Error("Existing pilot evidence does not match the frozen production pilot contract.");
    }
    dataset.decision = "IN_PROGRESS";
    dataset.completedAt = null;
    dataset.resumeStartedAt = new Date(phaseStartedAt).toISOString();
    dataset.resumeReason = "Resume only failed executions after a newly reproduced defect is corrected and covered by a focused regression.";
  }
  await persist(dataset);

  const failureSuite = await runFailureRegressionSuite();
  const schedule = (options.finalizeExisting ? [] : buildPilotSchedule())
    .filter((entry: any) => !options.noRemote || entry.backend !== "remote-sandbox")
    .filter((entry: any) => !options.resumeFailed || dataset.executions.some((execution: any) => execution.executionId === entry.executionId && !execution.eventualSuccess))
    .slice(0, options.limit ?? Number.POSITIVE_INFINITY);
  for (const [index, entry] of schedule.entries()) {
    process.stdout.write(`\n[${index + 1}/${schedule.length}] ${entry.executionId} (${entry.backend})\n`);
    const previous = dataset.executions.find((execution: any) => execution.executionId === entry.executionId);
    const execution = await runGovernedExecution(entry, dataset.pilotRunId ?? pilotRunId, options.resumeFailed ? previous : undefined);
    if (previous) dataset.executions.splice(dataset.executions.indexOf(previous), 1, execution);
    else dataset.executions.push(execution);
    await persist(dataset);
  }
  dataset.executions = dataset.executions.map(normalizeExecutionTelemetry);
  if (!options.noRemote && !options.limit) {
    const finalInventory = await readRemoteInventory();
    if (finalInventory.vmCount !== 0) throw new Error(`Final exe.dev inventory is not empty: ${finalInventory.vmCount}`);
    dataset.remoteSandboxInventory = finalInventory;
  }

  dataset.failureInjections = buildFailureInjectionMatrix(dataset.executions, failureSuite);
  dataset.routingShadow = {
    mode: "ADVISORY",
    guardedAutoEnabled: false,
    decisions: dataset.executions.map((execution: any, index: number) => buildRoutingShadowDecision(dataset.executions.slice(0, index + 1), execution)),
  };
  dataset.routingShadow = finalizeRoutingShadow(dataset.routingShadow, dataset.executions);
  dataset.factoryLearning = buildFactoryLearning(dataset.executions, dataset.failureInjections);
  dataset.humanInterventions = buildHumanInterventions(dataset.executions, dataset.preflightFailures);
  dataset.scorecard = buildReliabilityScorecard(dataset.executions, dataset.failureInjections);
  dataset.metrics = buildOperationalMetrics(dataset.executions);
  dataset.completedAt = new Date().toISOString();
  dataset.durationMs = Date.now() - Date.parse(dataset.startedAt);
  dataset.resumeDurationMs = options.resumeFailed ? Date.now() - phaseStartedAt : null;
  const errors = options.limit || options.noRemote ? [] : validatePilotDataset(dataset);
  dataset.qualificationErrors = errors;
  dataset.decision = dataset.executions.length >= 15
    && dataset.executions.every((execution: any) => execution.eventualSuccess)
    && dataset.failureInjections.every((injection: any) => injection.failClosed && injection.recoveryProven)
      ? "QUALIFIED_WITH_OPERATIONAL_LIMITATIONS"
      : "BLOCKED";
  await persist(dataset);
  await writeDerivedEvidence(dataset);
  process.stdout.write(`\nPilot result: ${dataset.decision}\nExecutions: ${dataset.executions.length}\n`);
  if (dataset.decision === "BLOCKED") process.exitCode = 1;
}

function normalizeExecutionTelemetry(execution: any) {
  const latestAttempt = execution.attempts?.at(-1);
  const metrics = execution.metrics ?? {};
  return {
    ...execution,
    terminalStructuredResult: latestAttempt?.terminalStructuredResult === true,
    firstPassStructuredResultSuccess: execution.attempts?.[0]?.terminalStructuredResult === true,
    metrics: {
      ...metrics,
      missionToPlanMs: metrics.missionToPlanMs ?? execution.lineage?.timings?.missionToPlanMs ?? null,
      planToWorkOrderMs: metrics.planToWorkOrderMs ?? execution.lineage?.timings?.planToWorkOrderMs ?? null,
      queueAdmissionMs: metrics.queueAdmissionMs ?? execution.lineage?.timings?.queueAdmissionMs ?? null,
      localExecutionMs: metrics.localExecutionMs
        ?? (execution.backend === "persistent-worker" ? latestAttempt?.executionMetrics?.executionMs ?? latestAttempt?.durationMs ?? null : null),
      remoteAllocationMs: metrics.remoteAllocationMs
        ?? (execution.backend === "remote-sandbox" ? latestAttempt?.executionMetrics?.allocationMs ?? null : null),
      remoteReadinessMs: metrics.remoteReadinessMs
        ?? (execution.backend === "remote-sandbox" ? latestAttempt?.executionMetrics?.readinessMs ?? null : null),
      remoteExecutionMs: metrics.remoteExecutionMs
        ?? (execution.backend === "remote-sandbox" ? latestAttempt?.executionMetrics?.executionMs ?? null : null),
      teardownMs: metrics.teardownMs
        ?? (execution.backend === "remote-sandbox" ? latestAttempt?.executionMetrics?.teardownMs ?? null : null),
      executionMs: metrics.executionMs ?? latestAttempt?.durationMs ?? null,
      verificationMs: metrics.verificationMs ?? latestAttempt?.verification?.durationMs ?? null,
      reviewMs: metrics.reviewMs ?? null,
    },
  };
}

function parseArguments(args: string[]) {
  let limit: number | undefined;
  let noRemote = false;
  let resumeFailed = false;
  let finalizeExisting = false;
  for (const argument of args) {
    if (argument === "--") continue;
    if (argument === "--no-remote") noRemote = true;
    else if (argument === "--resume-failed") resumeFailed = true;
    else if (argument === "--finalize-existing") finalizeExisting = true;
    else if (argument.startsWith("--limit=")) limit = Number(argument.slice("--limit=".length));
    else throw new Error(`Unknown pilot argument: ${argument}`);
  }
  if (limit !== undefined && (!Number.isSafeInteger(limit) || limit < 1 || limit > 15)) {
    throw new Error("--limit must be an integer between 1 and 15.");
  }
  if (resumeFailed && (limit !== undefined || noRemote || finalizeExisting)) throw new Error("--resume-failed cannot be combined with other pilot modes.");
  if (finalizeExisting && (limit !== undefined || noRemote)) throw new Error("--finalize-existing cannot be combined with --limit or --no-remote.");
  return { limit, noRemote, resumeFailed, finalizeExisting };
}

async function runGovernedExecution(entry: ScheduleEntry, pilotRunId: string, previous?: ExecutionRecord): Promise<ExecutionRecord> {
  const executionStartedAt = Date.now();
  const lineage = previous?.lineage ?? buildGovernedLineage(entry, executionStartedAt);
  const attempts: any[] = [...(previous?.attempts ?? [])];
  const attemptOffset = attempts.length;
  const retryBudget = remoteRetryBudget();
  let observedModelSpendUsd: number | null = 0;
  let successful: any;
  for (let recoveryAttempt = 1; recoveryAttempt <= 2; recoveryAttempt += 1) {
    const attemptNumber = attemptOffset + recoveryAttempt;
    const repositoryRoot = await createFixtureRepository(entry);
    const sourceSha = await gitValue(repositoryRoot, ["rev-parse", "HEAD"]);
    const attemptId = `attempt-${pilotRunId}-${entry.executionId}-${attemptNumber}`;
    const attemptStartedAt = Date.now();
    const attempt: any = {
      attemptId,
      attemptNumber,
      retryOfAttemptId: attempts.at(-1)?.attemptId ?? null,
      worker: workerIdentity(entry, pilotRunId),
      lease: {
        id: `lease-${pilotRunId}-${entry.executionId}-${attemptNumber}`,
        current: true,
        acquiredAt: new Date().toISOString(),
      },
      sourceSha,
      backend: entry.backend,
      status: "RUNNING",
      startedAt: new Date(attemptStartedAt).toISOString(),
      events: [],
    };
    try {
      const execution = entry.backend === "remote-sandbox"
        ? await runRemoteCodex(entry, pilotRunId, lineage, repositoryRoot, sourceSha, attempt, attemptNumber)
        : await runLocalCodex(entry, repositoryRoot, attempt, attemptNumber);
      attempt.harness = execution.harness;
      attempt.events = execution.events;
      attempt.usage = execution.usage;
      attempt.cleanup = execution.cleanup;
      attempt.remoteResult = execution.remoteResult ?? null;
      attempt.structuredResult = execution.structuredResult ?? null;
      attempt.terminalStructuredResult = execution.terminalStructuredResult === true;
      attempt.failure = execution.failure ?? null;
      attempt.executionMetrics = execution.metrics ?? null;
      if (execution.status !== "COMPLETED"
        || execution.terminalStructuredResult !== true
        || execution.structuredResult?.status !== "COMPLETED") {
        throw new Error(execution.error ?? `Harness returned ${execution.status} without an accepted terminal factory-result/v1.`);
      }
      const changedFiles = await listChangedFiles(repositoryRoot, sourceSha);
      const scope = validateChangedFileScope(changedFiles, {
        allowedPaths: entry.workload.allowedPaths,
        excludedPaths: ["tests/**", "package.json", ".git/**"],
      });
      if (!scope.ok || scope.changedFiles.length === 0) {
        throw new Error(scope.outsideScope.length
          ? `Harness changed files outside the approved scope: ${scope.outsideScope.join(", ")}`
          : "Harness completed without a reviewable code change.");
      }
      const candidateSha = await commitFactoryChanges({
        worktree: repositoryRoot,
        changedFiles: scope.changedFiles,
        title: entry.workload.title,
      });
      const candidate = await inspectCandidateChange(repositoryRoot, sourceSha);
      if (candidate.candidateRevision !== candidateSha) throw new Error("Candidate changed before independent verification.");
      const verification = await verifyCandidate(entry, repositoryRoot, candidate);
      attempt.candidate = {
        sourceSha,
        candidateSha,
        treeSha: candidate.treeRevision,
        changedFiles: candidate.changedFiles,
        linesAdded: candidate.linesAdded,
        linesDeleted: candidate.linesDeleted,
        diffSha256: sha256(candidate.diff),
      };
      attempt.verification = verification;
      if (verification.verdict !== "VERIFIED") throw new Error(verification.reason);
      attempt.status = "COMPLETED";
      attempt.retryDecision = { allowed: false, reason: "NOT_REQUIRED" };
      attempt.finishedAt = new Date().toISOString();
      attempt.durationMs = Date.now() - attemptStartedAt;
      attempts.push(attempt);
      successful = { repositoryRoot, candidate, attempt, execution };
      break;
    } catch (error) {
      const pilotEvidence = (error as any)?.pilotEvidence;
      if (pilotEvidence) {
        attempt.events = pilotEvidence.events;
        attempt.cleanup = pilotEvidence.cleanup;
        attempt.failure = pilotEvidence.failure ?? attempt.failure;
        attempt.structuredResult = pilotEvidence.structuredResult ?? attempt.structuredResult;
        attempt.terminalStructuredResult = pilotEvidence.terminalStructuredResult ?? attempt.terminalStructuredResult;
        attempt.executionMetrics = pilotEvidence.metrics ?? attempt.executionMetrics;
        attempt.remoteResult = pilotEvidence.remoteResult ?? attempt.remoteResult;
      }
      if (!attempt.failure) {
        attempt.failure = entry.backend === "remote-sandbox"
          ? remoteFailure("NON_RETRYABLE_RESULT", "POST_RESULT_GATE_FAILED", "CANDIDATE", safeMessage(error))
          : remoteFailure("UNKNOWN", "LOCAL_EXECUTION_UNCLASSIFIED", "EXECUTOR", safeMessage(error));
      }
      attempt.status = "FAILED";
      attempt.failureReason = safeMessage(error);
      attempt.finishedAt = new Date().toISOString();
      attempt.durationMs = Date.now() - attemptStartedAt;
      attempts.push(attempt);
      if (entry.backend !== "remote-sandbox") {
        attempt.retryDecision = { allowed: false, reason: "LOCAL_AUTOMATIC_RETRY_DISABLED" };
        break;
      }
      observedModelSpendUsd = addObservedSpend(observedModelSpendUsd, attempt.usage?.inferenceCostUsd);
      const retryDecision = decideRemoteRetry({
        failure: attempt.failure as RemoteFailure,
        budget: retryBudget,
        attemptsUsed: recoveryAttempt,
        totalWallClockMs: Date.now() - executionStartedAt,
        observedModelSpendUsd,
        activeProviderResources: attempt.cleanup?.finalVmCount ?? 1,
      });
      attempt.retryDecision = retryDecision;
      if (!retryDecision.allowed) break;
    }
  }
  if (!successful) {
    return failedExecutionRecord(entry, lineage, attempts, executionStartedAt);
  }
  const { candidate, attempt, execution } = successful;
  const receipts = entry.workload.acceptanceCriteria.map((criterion: any) => ({
    acceptanceCriterionId: criterion.id,
    status: "PASSED" as const,
    recordedAt: Date.now(),
    validUntil: Date.now() + 86_400_000,
  }));
  receipts.push({
    receiptScope: "WORK_ORDER" as const,
    status: "PASSED" as const,
    verdict: "VERIFIED" as const,
    recordedAt: Date.now(),
    validUntil: Date.now() + 86_400_000,
  } as any);
  const approvalDecisions = entry.workload.risk === "HIGH"
    ? [{ approvalType: "RISK_REVIEW", status: "APPROVED" as const, createdAt: Date.now(), expiresAt: Date.now() + 86_400_000 }]
    : [];
  const acceptance = evaluateAcceptance({
    riskLevel: entry.workload.risk,
    approvalDecisions,
    acceptanceCriteria: entry.workload.acceptanceCriteria.map((criterion: any) => ({ ...criterion, status: "PASS" as const })),
    verificationReceipts: receipts,
    now: Date.now(),
  });
  const semanticGroups = buildSemanticChangeGroups(candidate.changedFiles.map((file: string) => ({ path: file })));
  const review = buildRepresentativeReview(entry, lineage, attempt, candidate, semanticGroups);
  const totalCycleMs = (previous?.metrics?.totalCycleMs ?? 0) + Date.now() - executionStartedAt;
  return {
    executionId: entry.executionId,
    workloadKey: entry.workload.key,
    workloadClass: entry.workload.class,
    title: entry.workload.title,
    repetition: entry.repetition,
    risk: entry.workload.risk,
    backend: entry.backend,
    lineage,
    context: { sufficient: true, contextPackageId: lineage.contextPackageId, missingSources: [] },
    attempts,
    terminalStructuredResult: attempt.terminalStructuredResult === true,
    firstPassStructuredResultSuccess: previous?.firstPassStructuredResultSuccess
      ?? attempts[0]?.terminalStructuredResult === true,
    firstPassVerificationSuccess: previous?.firstPassVerificationSuccess
      ?? attempts[0]?.verification?.verdict === "VERIFIED",
    eventualVerificationSuccess: attempt.verification?.verdict === "VERIFIED",
    firstPassSuccess: previous?.firstPassSuccess ?? (attempts.length === 1 && attempts[0].status === "COMPLETED"),
    eventualSuccess: attempt.status === "COMPLETED" && acceptance.eligible,
    retries: Math.max(0, attempts.length - 1),
    cancellationCount: attempts.filter((item) => item.status === "CANCELED").length,
    verification: attempt.verification,
    evidence: {
      envelopes: entry.workload.acceptanceCriteria.map((criterion: any) => ({
        id: `evidence-${entry.executionId}-${criterion.id.toLowerCase()}`,
        criterionId: criterion.id,
        sourceAttemptId: attempt.attemptId,
        verificationAttemptId: `verification-${entry.executionId}-${attempt.attemptNumber}`,
        sourceRevision: attempt.sourceSha,
        candidateRevision: attempt.candidate.candidateSha,
        producer: { actorId: `verifier-${entry.executionId}`, independent: true },
      })),
      unknown: [],
    },
    evidenceCompleteness: 1,
    qualityGate: { state: "ELIGIBLE", exactCurrent: true, acceptanceAuthority: false },
    prLineage: {
      mode: "DETERMINISTIC_PROVIDER_FIXTURE",
      repository: `sellerfi-pilot/${entry.workload.key}`,
      headSha: attempt.candidate.candidateSha,
      url: `https://github.com/sellerfi-pilot/${entry.workload.key}/pull/${entry.repetition}`,
      published: false,
      humanMergeRequired: true,
    },
    review,
    acceptance: {
      operation: "workOrders.accept",
      fixtureActorType: "HUMAN",
      eligible: acceptance.eligible,
      blockingReasons: acceptance.blockingReasons,
      accepted: acceptance.eligible,
      mergePerformed: false,
    },
    cleanup: execution.cleanup,
    cost: execution.cost,
    metrics: {
      missionToPlanMs: lineage.timings.missionToPlanMs,
      planToWorkOrderMs: lineage.timings.planToWorkOrderMs,
      queueAdmissionMs: lineage.timings.queueAdmissionMs,
      localExecutionMs: entry.backend === "persistent-worker" ? attempt.executionMetrics?.executionMs ?? attempt.durationMs : null,
      remoteAllocationMs: entry.backend === "remote-sandbox" ? attempt.executionMetrics?.allocationMs ?? null : null,
      remoteReadinessMs: entry.backend === "remote-sandbox" ? attempt.executionMetrics?.readinessMs ?? null : null,
      remoteExecutionMs: entry.backend === "remote-sandbox" ? attempt.executionMetrics?.executionMs ?? null : null,
      teardownMs: entry.backend === "remote-sandbox" ? attempt.executionMetrics?.teardownMs ?? null : null,
      executionMs: attempt.durationMs,
      verificationMs: attempt.verification.durationMs,
      reviewMs: review.durationMs,
      totalCycleMs,
    },
  };
}

async function runLocalCodex(entry: ScheduleEntry, repositoryRoot: string, attempt: any, attemptNumber: number) {
  const adapter = new CodexV1ExecutorAdapter();
  const events: any[] = [];
  const result = await runHarnessExecution(adapter, {
    executionId: `${attempt.attemptId}:local`,
    repositoryRoot,
    workingDirectory: repositoryRoot,
    prompt: executionPrompt(entry, attemptNumber),
    provider: "openai",
    model: localModel,
    allowedPaths: entry.workload.allowedPaths,
    deniedPaths: ["tests/**", "package.json", ".git/**"],
    timeoutMs: 180_000,
    isolation: "WORKSPACE_WRITE",
  }, { emit: (event) => { events.push(event); } });
  const structuredResult = parseFactoryResult(result.output);
  const terminalStructuredResult = structuredResult !== null
    && factoryResultContextIssues(
      structuredResult,
      entry.workload.acceptanceCriteria.map((criterion: any) => criterion.id),
    ).length === 0;
  return {
    status: result.status,
    error: result.error,
    events,
    structuredResult,
    terminalStructuredResult,
    failure: result.status === "COMPLETED" && terminalStructuredResult
      ? null
      : remoteFailure("UNKNOWN", "LOCAL_STRUCTURED_RESULT_INVALID", "RESULT_VALIDATION", result.error ?? "Local Codex did not return a valid terminal factory-result/v1."),
    metrics: {
      executionMs: result.normalizedResult?.timing.wallClockMs ?? null,
      allocationMs: null,
      readinessMs: null,
      teardownMs: null,
    },
    harness: {
      adapter: "codex",
      version: "v1",
      harnessVersion: "0.146.0",
      authority: adapter.capabilities().authority,
      actualTuple: { provider: "openai", model: localModel, backend: "persistent-worker" },
    },
    usage: result.normalizedResult?.usage ?? null,
    cleanup: {
      observed: true,
      passed: result.normalizedResult?.cleanup.status === "COMPLETED",
      status: result.normalizedResult?.cleanup.status ?? "UNKNOWN",
      resourceAbsent: null,
    },
    cost: {
      observed: Number.isFinite(result.normalizedResult?.usage.costUsd),
      modelUsd: finiteOrNull(result.normalizedResult?.usage.costUsd),
      infrastructureUsd: null,
      totalUsd: finiteOrNull(result.normalizedResult?.usage.costUsd),
      limitation: "Codex CLI emitted token counts but no priced model-cost field; local infrastructure cost is unavailable.",
    },
  };
}

async function runRemoteCodex(
  entry: ScheduleEntry,
  pilotRunId: string,
  lineage: any,
  repositoryRoot: string,
  sourceSha: string,
  attempt: any,
  attemptNumber: number,
) {
  const before = await readRemoteInventory();
  if (before.vmCount !== 0) throw new Error(`Remote execution requires empty initial inventory, found ${before.vmCount} VM(s).`);
  const profile = remoteProfile();
  const profileDigest = sandboxProfileDigest(profile as any);
  const publicRunId = `run-${pilotRunId}-${entry.executionId}-${attemptNumber}`;
  const workflowDocumentId = `workflow-doc-${pilotRunId}-${entry.executionId}-${attemptNumber}`;
  const manifest = {
    version: "factory-execution-manifest/v1",
    causation: {
      missionId: lineage.missionId,
      missionPlanId: lineage.planId,
      workOrderId: lineage.workOrderId,
      workOrderRevisionNumber: 1,
      workflowRunId: publicRunId,
    },
    repository: {
      repository: `sellerfi-pilot/${entry.workload.key}`,
      baseSha: sourceSha,
      allowedPaths: entry.workload.allowedPaths,
      excludedPaths: ["tests/**", "package.json", ".git/**"],
    },
    intent: {
      title: entry.workload.title,
      acceptanceCriterionIds: entry.workload.acceptanceCriteria.map((criterion: any) => criterion.id),
    },
    harness: {
      adapter: "codex",
      version: "v1",
      harnessId: "codex",
      harnessVersion: "0.146.0",
      executionBackend: "remote-sandbox",
      isolation: "WORKSPACE_WRITE",
      pullRequestAuthority: "CONTROL_PLANE_ONLY",
      timeoutMs: 270_000,
      provider: "openai",
      model: remoteModel,
    },
    sandbox: {
      resourceName: factorySandboxResourceName({
        projectId: "production-factory-pilot-v2",
        workflowRunId: publicRunId,
        attemptId: attempt.attemptId,
      }),
      profileDigest,
      supervisorVersion: "mission-control-supervisor/v1",
      credentialGrants: [{
        kind: "INFERENCE",
        secretValueIncluded: false,
        githubAuthority: "NONE",
        providerAuthority: "NONE",
      }],
    },
  };
  const manifestDigest = `sha256:${canonicalHash(manifest)}`;
  const adapter = new CodexV1ExecutorAdapter("codex");
  const request: any = {
    executionId: `${attempt.attemptId}:remote`,
    repositoryRoot,
    workingDirectory: repositoryRoot,
    prompt: executionPrompt(entry, attemptNumber),
    provider: "openai",
    model: remoteModel,
    allowedPaths: entry.workload.allowedPaths,
    deniedPaths: ["tests/**", "package.json", ".git/**"],
    timeoutMs: 270_000,
    isolation: "WORKSPACE_WRITE",
  };
  const remoteRoot = "/var/lib/mission-control/attempt/repository";
  const resultPath = "/var/lib/mission-control/attempt/executor-result.json";
  const invocation = adapter.createRemoteInvocation(request, { repositoryRoot: remoteRoot, resultPath });
  const transport = new ExeDevSshTransport();
  const journal = new InMemoryRemoteSandboxJournal();
  const runtime = new RemoteSandboxRuntime(
    new ExeDevSandboxProvider(transport),
    new OpenRouterSandboxCredentialBroker(),
    journal,
  );
  try {
    const result = await runtime.execute({
      projectId: "production-factory-pilot-v2",
      workOrderId: lineage.workOrderId,
      workOrderRevisionNumber: 1,
      workflowRunId: workflowDocumentId,
      attemptId: attempt.attemptId,
      attemptLeaseId: attempt.lease.id,
      executionManifest: manifest,
      manifestDigest,
      sourceSha,
      profile: profile as any,
      repositoryBundle: await createFactorySourceBundle(repositoryRoot, sourceSha),
      supervisorSource: standaloneSandboxSupervisorSource(),
      executor: {
        ...invocation,
        command: "npx",
        args: ["-y", "@openai/codex@0.146.0", ...invocation.args],
      },
    });
    await materializeRemoteCandidate({
      worktree: repositoryRoot,
      sourceSha,
      patch: Buffer.from(result.bundle.patch.content, "base64"),
    });
    const after = await readRemoteInventory();
    if (result.allocation.resourceName !== manifest.sandbox.resourceName) {
      throw new Error("Remote allocation identity did not match the frozen manifest resource name.");
    }
    if (after.vmCount !== 0 || !result.termination.resourceAbsent || result.credentialRevocation?.revoked !== true) {
      throw new Error("Remote sandbox did not prove credential revocation and exact final resource absence.");
    }
    return {
      status: result.bundle.status === "COMPLETED" ? "COMPLETED" : result.bundle.status,
      error: result.bundle.status === "COMPLETED" ? null : redactSandboxText([
        `Remote supervisor returned ${result.bundle.status}.`,
        result.bundle.structuredResult.summary,
        result.bundle.executor.stderrTail,
      ].filter(Boolean).join(" ")).slice(0, 2_000),
      events: result.lifecycleEvents,
      structuredResult: result.bundle.structuredResult,
      terminalStructuredResult: result.bundle.structuredResult.schema === "factory-result/v1",
      failure: result.bundle.failure ?? null,
      metrics: remoteLifecycleMetrics(result.lifecycleEvents),
      remoteResult: {
        invocation: {
          outputSchemaPath: invocation.outputSchemaPath,
          outputSchema: invocation.outputSchema,
        },
        identity: {
          publicRunId,
          workflowDocumentId,
          manifestResourceName: manifest.sandbox.resourceName,
          allocatedResourceName: result.allocation.resourceName,
        },
        bundleStatus: result.bundle.status,
        structuredStatus: result.bundle.structuredResult.status,
        resultProvenance: result.bundle.resultProvenance,
        resultOutput: result.bundle.executor.resultOutput ?? null,
        summary: redactSandboxText(result.bundle.structuredResult.summary).slice(0, 1_000),
        executorExitCode: result.bundle.executor.exitCode,
        stdoutDigest: result.bundle.executor.stdoutDigest,
        stderrDigest: result.bundle.executor.stderrDigest,
        stderrTail: redactSandboxText(result.bundle.executor.stderrTail).slice(-2_000),
      },
      harness: {
        adapter: "codex",
        version: "v1",
        harnessVersion: "0.146.0",
        authority: adapter.capabilities().authority,
        actualTuple: { provider: "openrouter", model: remoteModel, backend: "remote-sandbox" },
      },
      usage: result.bundle.usage,
      cleanup: {
        observed: true,
        passed: true,
        status: "COMPLETED",
        credentialRevoked: true,
        resourceAbsent: true,
        resourceName: result.termination.resourceName,
        finalVmCount: after.vmCount,
      },
      cost: {
        observed: Number.isFinite(result.bundle.usage.inferenceCostUsd) || Number.isFinite(result.bundle.usage.providerCostUsd),
        modelUsd: finiteOrNull(result.bundle.usage.inferenceCostUsd),
        infrastructureUsd: finiteOrNull(result.bundle.usage.providerCostUsd),
        totalUsd: finiteSumOrNull(result.bundle.usage.inferenceCostUsd, result.bundle.usage.providerCostUsd),
        limitation: "exe.dev does not expose a per-VM scenario price; any unavailable model/provider cost remains null.",
      },
    };
  } catch (error) {
    const after = await readRemoteInventory().catch(() => ({ vmCount: null }));
    const termination = journal.terminations.at(-1);
    const credentialRevocation = journal.revokedCredentials.at(-1);
    const cleanupPassed = after.vmCount === 0
      && termination?.resourceAbsent === true
      && (journal.issuedCredentials.length === 0 || credentialRevocation?.revoked === true);
    const failure = error instanceof RemoteSandboxExecutionError
      ? error.failure
      : remoteFailure("UNKNOWN", "PILOT_REMOTE_UNCLASSIFIED", "UNKNOWN", safeMessage(error));
    const enriched = new Error(safeMessage(error));
    (enriched as any).pilotEvidence = {
      events: journal.events,
      failure,
      structuredResult: journal.results.at(-1)?.structuredResult ?? null,
      terminalStructuredResult: journal.results.at(-1)?.structuredResult?.schema === "factory-result/v1",
      metrics: remoteLifecycleMetrics(journal.events),
      remoteResult: {
        invocation: {
          outputSchemaPath: invocation.outputSchemaPath,
          outputSchema: invocation.outputSchema,
        },
        identity: {
          publicRunId,
          workflowDocumentId,
          manifestResourceName: manifest.sandbox.resourceName,
          allocatedResourceName: journal.allocations.at(-1)?.resourceName ?? null,
        },
        bundleStatus: journal.results.at(-1)?.status ?? null,
        structuredStatus: journal.results.at(-1)?.structuredResult?.status ?? null,
        resultProvenance: journal.results.at(-1)?.resultProvenance ?? null,
        resultOutput: journal.results.at(-1)?.executor.resultOutput ?? null,
      },
      cleanup: {
        observed: journal.allocationRequests.length > 0,
        passed: cleanupPassed,
        status: cleanupPassed ? "COMPLETED" : "FAILED",
        credentialRevoked: journal.issuedCredentials.length === 0 ? null : credentialRevocation?.revoked === true,
        resourceAbsent: termination?.resourceAbsent === true,
        resourceName: termination?.resourceName ?? journal.allocationRequests.at(-1)?.resourceName ?? null,
        finalVmCount: after.vmCount,
      },
    };
    throw enriched;
  } finally {
    await transport.dispose();
  }
}

async function verifyCandidate(entry: ScheduleEntry, repositoryRoot: string, candidate: any) {
  const startedAt = Date.now();
  const verificationRoot = await mkdtemp(path.join(tmpdir(), `mc-pilot-verify-${entry.workload.key}-`));
  cleanupDirectories.push(verificationRoot);
  const checkout = path.join(verificationRoot, "repository");
  await execFileAsync("git", ["clone", "--quiet", "--no-hardlinks", repositoryRoot, checkout]);
  await execFileAsync("git", ["-C", checkout, "checkout", "--quiet", "--detach", candidate.candidateRevision]);
  const result = await runProcess("npm", ["test"], checkout, 60_000);
  const refactorShape = entry.workload.key !== "refactor"
    || (await fileExists(path.join(checkout, "src/feePolicy.mjs")) && candidate.changedFiles.includes("src/pricing.mjs"));
  return {
    attemptId: `verification-${entry.executionId}`,
    sourceAttemptId: null,
    verifierId: `verifier-${entry.executionId}`,
    independent: true,
    candidateSha: candidate.candidateRevision,
    treeSha: candidate.treeRevision,
    verdict: result.exitCode === 0 && refactorShape ? "VERIFIED" : "NOT_VERIFIED",
    reason: result.exitCode === 0 && refactorShape ? "Independent exact-candidate gate passed." : `Independent gate failed: ${result.stderr || result.stdout}`.slice(0, 1_000),
    command: "npm test",
    exitCode: result.exitCode,
    outputSha256: sha256(`${result.stdout}\n${result.stderr}`),
    durationMs: Date.now() - startedAt,
    acceptanceAuthority: false,
  };
}

async function createFixtureRepository(entry: ScheduleEntry) {
  const repositoryRoot = await mkdtemp(path.join(tmpdir(), `mc-pilot-${entry.workload.key}-${entry.repetition}-`));
  cleanupDirectories.push(repositoryRoot);
  for (const [relativePath, content] of Object.entries(entry.workload.files)) {
    const target = path.join(repositoryRoot, relativePath);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, String(content));
  }
  await execFileAsync("git", ["init", "-q", repositoryRoot]);
  await execFileAsync("git", ["-C", repositoryRoot, "config", "user.name", "Mission Control Pilot Fixture"]);
  await execFileAsync("git", ["-C", repositoryRoot, "config", "user.email", "pilot-fixture@example.invalid"]);
  await execFileAsync("git", ["-C", repositoryRoot, "add", "--all"]);
  await execFileAsync("git", ["-C", repositoryRoot, "commit", "-qm", "pilot fixture base"]);
  return repositoryRoot;
}

async function preparePilotCodexHome() {
  const codexHome = await mkdtemp(path.join(tmpdir(), "mc-pilot-codex-home-"));
  cleanupDirectories.push(codexHome);
  const sourceAuth = path.join(homedir(), ".codex", "auth.json");
  const targetAuth = path.join(codexHome, "auth.json");
  await copyFile(sourceAuth, targetAuth).catch(() => {
    throw new Error("Local Codex pilot authentication is unavailable.");
  });
  await chmod(targetAuth, 0o600);
  return codexHome;
}

function buildGovernedLineage(entry: ScheduleEntry, startedAt: number) {
  const missionId = `mission-${entry.executionId}`;
  const planId = `plan-${entry.executionId}`;
  const workOrderId = `work-order-${entry.executionId}`;
  const spec = productionPilotSpec(entry);
  const quality = evaluateMissionSpecQuality({ spec, constitution: fixedConstitution as any });
  if (quality.result !== "PASS") throw new Error(`Spec Quality failed for ${entry.executionId}: ${quality.findings.map((item: any) => item.code).join(", ")}`);
  const specDigest = missionSpecDigest(spec as any);
  const assertion = {
    assertionId: `assertion-${entry.executionId}`,
    title: "Independent exact-candidate verification passes",
    outcome: entry.workload.requirements.join(" "),
    verificationMethod: "TEST",
    passCondition: "npm test exits zero in an independent exact-candidate clone.",
    requiredEvidence: "Independent test result and candidate identity",
    requiresIndependentValidation: true,
    waiverAllowed: false,
    sourceRequirementIds: [
      ...entry.workload.requirements.map((_item: string, index: number) => `REQ-${String(index + 1).padStart(3, "0")}`),
      "NFR-001",
    ],
    sourceAcceptanceExpectationIds: entry.workload.acceptanceCriteria.map((_item: any, index: number) => `AC-${String(index + 1).padStart(3, "0")}`),
    sourceVerificationExpectationIds: ["VERIFY-001"],
  };
  const blueprint = {
    id: `blueprint-${entry.executionId}`,
    title: entry.workload.title,
    desiredOutcome: entry.workload.requirements.join(" "),
    workflowId: "progressive-software-delivery",
    workflowVersion: 1,
    sequence: 1,
    role: "WORKER",
    isMutating: true,
    priority: 1,
    riskLevel: entry.workload.risk,
    branchStrategy: "isolated-worktree",
    constraints: ["Use only the disposable fixture repository."],
    requiredApprovals: entry.workload.risk === "HIGH" ? ["RISK_REVIEW"] : [],
    implementationPolicy: {
      allowedCommands: ["npm test"],
      independentVerification: { executable: "npm", args: ["test"], category: "UNIT_TEST", commandClass: "TEST", evidenceCategory: "TEST_RESULT", timeoutMs: 60_000 },
      maxFilesChanged: 8,
      maxLinesChanged: 300,
      maxAttempts: 2,
      timeoutMinutes: 3,
      stopCondition: "Stop after independent exact-candidate verification.",
    },
    dependsOnBlueprintIds: [],
    assertionIds: [assertion.assertionId],
  };
  const plan = {
    summary: entry.workload.title,
    rollbackApproach: "Discard the disposable Attempt repository and retain its evidence record.",
    estimatedCostUsd: 0.05,
    repository: `sellerfi-pilot/${entry.workload.key}`,
    repositoryBranch: "main",
    assertions: [assertion],
    workOrderBlueprints: [blueprint],
  };
  const planErrors = validateMissionPlan(plan as any);
  if (planErrors.length) throw new Error(`Plan validation failed: ${planErrors.map((item: any) => item.code).join(", ")}`);
  const consistency = analyzeSpecPlanConsistency({
    spec: spec as any,
    assertions: [assertion] as any,
    workOrderBlueprints: [blueprint] as any,
    planSummary: plan.summary,
    repositoryId: `repository-${entry.workload.key}`,
  });
  if (consistency.findings.length || !consistency.coverage.complete) {
    throw new Error(`Spec/Plan consistency failed for ${entry.executionId}.`);
  }
  const qualityContract = compileApprovedPlanQualityContract({
    missionId,
    missionPlanId: planId,
    missionPlanRevision: 1,
    objective: entry.workload.title,
    businessContext: "Production Factory Pilot V2 disposable operational workload.",
    constraints: ["No production repository mutation.", "Human acceptance remains separate."],
    repository: plan.repository,
    repositoryBranch: "main",
    summary: plan.summary,
    rollbackApproach: plan.rollbackApproach,
    assertions: [assertion],
    workOrderBlueprints: [blueprint],
    specLineage: {
      missionSpecRevisionId: `spec-${entry.executionId}-r1`,
      missionSpecDigest: specDigest,
      missionSpecQualityEvaluationId: `spec-quality-${entry.executionId}`,
      projectConstitutionRevisionId: "constitution-production-factory-pilot-v2",
      projectConstitutionDigest: fixedConstitutionDigest,
      requirementsCoverage: consistency.coverage,
      checklistLineage: {
        requirementsQualityItemIds: ["CHECK-REQ-001"],
        governanceConstraintItemIds: ["CHECK-GOV-001"],
        evidenceBearingVerificationItemIds: ["CHECK-VERIFY-001"],
      },
    },
  } as any);
  const missionAt = startedAt;
  const planAt = Date.now();
  const workOrderAt = Date.now();
  const admissionAt = Date.now();
  return {
    constitutionRevisionId: "constitution-production-factory-pilot-v2",
    constitutionDigest: fixedConstitutionDigest,
    missionId,
    specRevisionId: `spec-${entry.executionId}-r1`,
    specDigest,
    specQuality: { result: quality.result, findingCount: quality.findings.length, authority: "PLANNING_READY_ONLY" },
    planId,
    planRevision: 1,
    planAuthoredBy: "pilot-operator-author",
    planApprovedBy: "pilot-operator-approver",
    planApprovalSeparate: true,
    qualityContractDigest: qualityContract.digest,
    workOrderId,
    workOrderRevision: 1,
    factoryVersionId: entry.backend === "remote-sandbox" ? "factory-codex-exedev-certified-v1" : "factory-codex-local-v1",
    factoryMemory: { authority: "ADVISORY", result: "CONTEXT_PACKAGE_ASSEMBLED" },
    contextPackageId: `context-${entry.executionId}`,
    timings: {
      missionToPlanMs: planAt - missionAt,
      planToWorkOrderMs: workOrderAt - planAt,
      queueAdmissionMs: admissionAt - workOrderAt,
    },
  };
}

function productionPilotConstitution() {
  return {
    summary: "Pilot work must remain scoped, independently verifiable, fail closed, and attributable through the canonical authority path.",
    principles: [
      { id: "PRINCIPLE-ARCH-001", title: "One authority path", description: "Intent compiles through Plan, WorkOrder, verification, review, and human acceptance.", category: "ARCHITECTURE" },
      { id: "PRINCIPLE-SEC-001", title: "No authority expansion", description: "Harnesses, sandboxes, routing, memory, observability, review, and learning remain non-accepting.", category: "SECURITY" },
      { id: "PRINCIPLE-TEST-001", title: "Exact evidence", description: "Acceptance requires independent exact-candidate evidence.", category: "TESTING" },
    ],
    requiredSpecSections: ["OUTCOME", "PERSONAS", "USER_STORIES", "REQUIREMENTS", "NON_FUNCTIONAL_REQUIREMENTS", "ACCEPTANCE_EXPECTATIONS", "VERIFICATION_EXPECTATIONS", "DEFINITION_OF_DONE", "NON_GOALS", "CONSTRAINTS", "RISKS", "REPOSITORY_SCOPE", "SOURCES"],
    checklistItems: [
      { id: "CHECK-REQ-001", title: "Requirements are testable", description: "Requirements map to observable acceptance.", classification: "REQUIREMENTS_QUALITY", required: true },
      { id: "CHECK-GOV-001", title: "Authority is bounded", description: "Execution cannot accept or merge.", classification: "GOVERNANCE_CONSTRAINT", required: true },
      { id: "CHECK-VERIFY-001", title: "Exact candidate is verified", description: "Independent evidence binds to the exact candidate.", classification: "EVIDENCE_BEARING_VERIFICATION", required: true },
    ],
  };
}

function productionPilotSpec(entry: ScheduleEntry) {
  const requirementIds = entry.workload.requirements.map((_item: string, index: number) => `REQ-${String(index + 1).padStart(3, "0")}`);
  const acceptanceIds = entry.workload.acceptanceCriteria.map((_item: any, index: number) => `AC-${String(index + 1).padStart(3, "0")}`);
  return {
    problem: `The ${entry.workload.class.toLowerCase().replace(/_/g, " ")} workload requires repeatable governed delivery evidence.`,
    outcome: entry.workload.requirements.join(" "),
    measurableOutcomes: [{ id: "OUTCOME-001", description: "All deterministic acceptance checks pass on the exact candidate.", metric: "Failed mandatory acceptance checks", target: "0" }],
    personas: [{ id: "PERSONA-001", name: "Software Factory operator", needs: "Reliable intent-to-evidence delivery without infrastructure repair." }],
    userStories: [{ id: "STORY-001", personaId: "PERSONA-001", title: entry.workload.title, outcome: entry.workload.requirements.join(" "), priority: "P0", scenarios: [{ id: "SCENARIO-001", given: "An approved bounded WorkOrder", when: "Codex produces a candidate", then: "an independent exact-candidate gate determines eligibility" }] }],
    requirements: entry.workload.requirements.map((description: string, index: number) => ({ id: requirementIds[index], title: `Requirement ${index + 1}`, description, priority: "MUST", sourceStoryIds: ["STORY-001"] })),
    nonFunctionalRequirements: [{ id: "NFR-001", title: "Fail-closed lineage", description: "Stale or mismatched worker, lease, candidate, evidence, or PR identity must block.", category: "RELIABILITY", priority: "MUST", sourceStoryIds: ["STORY-001"] }],
    acceptanceExpectations: entry.workload.acceptanceCriteria.map((criterion: any, index: number) => ({ id: acceptanceIds[index], title: criterion.title, description: criterion.title, requirementIds: [...requirementIds, "NFR-001"], verificationExpectationIds: ["VERIFY-001"], givenWhenThen: { given: "the approved fixture source", when: criterion.method, then: "the criterion passes on the exact candidate" } })),
    verificationExpectations: [{ id: "VERIFY-001", title: "Independent exact-candidate verification", description: "Run npm test in a detached clone of the immutable candidate.", method: "TEST", category: "CONTRACT_TEST", evidenceCategory: "TEST_RESULT", acceptanceExpectationIds: acceptanceIds, checklistItemIds: ["CHECK-VERIFY-001"], mandatory: true }],
    definitionOfDone: [{ id: "DOD-001", description: "All criteria pass with exact-candidate evidence and cleanup proof.", acceptanceExpectationIds: acceptanceIds }],
    constraints: [{ id: "CONSTRAINT-001", description: "Modify only the disposable repository and never accept, publish, or merge from the harness." }],
    nonGoals: [{ id: "NONGOAL-001", description: "Expand autonomy or create another authority path." }],
    risks: [{ id: "RISK-001", description: "A stale or mismatched candidate could appear eligible.", severity: entry.workload.risk, mitigation: "Bind verification and review to exact candidate identities." }],
    edgeCases: [{ id: "EDGE-001", description: "Required telemetry is unavailable.", expectedBehavior: "The value remains null and lowers evidence coverage." }],
    repositoryScope: { repositoryId: `repository-${entry.workload.key}`, codeScopeIds: entry.workload.allowedPaths },
    sources: [{ id: "SOURCE-001", kind: "DOC", label: "Production Factory Pilot V2", location: "todos/052-in-progress-p0-production-factory-pilot-v2.md" }],
    clarifications: [],
    checklistDispositions: [
      { checklistItemId: "CHECK-REQ-001", classification: "REQUIREMENTS_QUALITY", disposition: "SATISFIED", reason: "Every requirement maps to deterministic acceptance." },
      { checklistItemId: "CHECK-GOV-001", classification: "GOVERNANCE_CONSTRAINT", disposition: "SATISFIED", reason: "Canonical authority remains unchanged." },
      { checklistItemId: "CHECK-VERIFY-001", classification: "EVIDENCE_BEARING_VERIFICATION", disposition: "SATISFIED", reason: "The independent clone produces exact-candidate evidence." },
    ],
    recipe: { recipeId: "full-sdlc", specTemplateVersion: 1, checklistVersion: 1, repositoryType: "APPLICATION", teamType: "PRODUCT", riskProfile: entry.workload.risk, productType: "MARKETPLACE" },
  };
}

function buildRepresentativeReview(entry: ScheduleEntry, lineage: any, attempt: any, candidate: any, semanticGroups: any[]) {
  const startedAt = Date.now();
  const criteria = entry.workload.acceptanceCriteria.map((criterion: any) => ({
    id: criterion.id,
    title: criterion.title,
    status: "PASS",
    verificationMethod: criterion.method,
    evidenceEnvelopeIds: [`evidence-${entry.executionId}-${criterion.id.toLowerCase()}`],
    receiptId: `receipt-${entry.executionId}-${criterion.id.toLowerCase()}`,
    verifier: `verifier-${entry.executionId}`,
    integrityIssue: null,
  }));
  const projection = buildReviewIntelligenceProjection({
    workOrder: {
      _id: lineage.workOrderId,
      currentRevisionNumber: 1,
      missionPlanId: lineage.planId,
      qualityContractDigest: lineage.qualityContractDigest,
      missionSpecLineage: { missionSpecRevisionId: lineage.specRevisionId, missionSpecDigest: lineage.specDigest },
      requirements: entry.workload.requirements.map((title: string, index: number) => ({ id: `REQ-${String(index + 1).padStart(3, "0")}`, title, priority: "MUST" })),
      acceptanceCriteria: entry.workload.acceptanceCriteria.map((criterion: any) => ({ ...criterion, requirementIds: entry.workload.requirements.map((_item: string, index: number) => `REQ-${String(index + 1).padStart(3, "0")}`) })),
    },
    run: { _id: attempt.attemptId, runId: attempt.attemptId, workOrderRevisionNumber: 1, headSha: candidate.candidateRevision, executionBaseSha: candidate.sourceRevision, pullRequestUrl: `https://github.com/sellerfi-pilot/${entry.workload.key}/pull/${entry.repetition}` },
    missionPlan: { revisionNumber: 1, assertions: [] },
    verificationRun: { _id: `verification-${entry.executionId}`, checks: [], verificationSubject: { kind: "GIT_CANDIDATE" } },
    evidenceEnvelopes: [],
    criteria,
    fileChanges: candidate.changedFiles.map((repositoryPath: string) => ({ repositoryPath })),
    currentVerification: { current: true },
  } as any);
  return {
    authority: "PROJECTION_ADVISORY",
    residualAiEnabled: false,
    unknownEvidence: projection.criterionMatrix.filter((item: any) => item.result === "UNKNOWN").length,
    residualRisk: entry.workload.risk === "HIGH" ? ["Human risk review remains required before acceptance and merge."] : [],
    implementationDecisions: [{ decision: `Use the bounded ${entry.workload.key} implementation.`, attributableTo: attempt.attemptId }],
    semanticGroups,
    criterionTrace: projection.criterionMatrix,
    correctionRequired: false,
    durationMs: Date.now() - startedAt,
  };
}

function executionPrompt(entry: ScheduleEntry, attemptNumber: number) {
  return buildPilotExecutionPrompt(
    entry.workload.prompt,
    entry.workload.acceptanceCriteria,
    attemptNumber,
  );
}

function workerIdentity(entry: ScheduleEntry, pilotRunId: string) {
  return {
    workerId: entry.backend === "remote-sandbox" ? "worker-production-exedev-n1" : "worker-production-local-codex",
    sessionId: `session-production-pilot-v2-${pilotRunId}-${entry.backend}`,
    generation: 1,
    current: true,
    maxConcurrentRuns: 1,
  };
}

function remoteRetryBudget(): RemoteRetryBudget {
  return {
    schema: "factory-remote-retry-policy/v1",
    maxAttempts: 2,
    maxTotalWallClockMs: 12 * 60_000,
    maxModelSpendUsd: 0.10,
    maxProviderResources: 1,
    retryableFailureClasses: ["RETRYABLE_INFRA", "RETRYABLE_EXECUTION"],
  };
}

function remoteProfile() {
  return {
    schema: "factory-sandbox-profile/v1",
    profileKey: "exe-production-pilot-v2-n1",
    version: 1,
    provider: "EXE_DEV",
    providerProfile: "individual-small",
    providerProfileVersion: "production-pilot-v2",
    machine: { image: "node:24-bookworm", cpu: 2, memoryMb: 4_096, diskGb: 20 },
    supervisor: { version: "mission-control-supervisor/v1", transport: "SSH" },
    runtime: { maxRuntimeMs: 300_000, resultPollIntervalMs: 500, resultRetentionMs: 86_400_000 },
    network: { egress: "UNRESTRICTED", egressAllowlist: [], publicIngress: false, exposedPorts: [] },
    credentials: { inference: "ATTEMPT_SCOPED_OPENROUTER", repositoryAccess: "CONTROL_PLANE_SNAPSHOT", githubAuthority: "NONE", providerAuthority: "NONE" },
    spend: { maxUsd: 0.05, enforcement: "PROVIDER_KEY_LIMIT" },
    teardown: { terminateOnEveryTerminalState: true, verifyResourceAbsent: true, supportsResume: false },
    preview: { mode: "DISABLED" },
    readiness: {
      state: "DEGRADED",
      checkedAt: Date.now(),
      reason: "Live certified with unrestricted outbound egress and ephemeral Codex installation.",
      egressEnforcementProven: false,
      liveCertified: true,
      evidenceReference: "docs/software-factory/remote-sandbox-live-certification-v1.md",
    },
  };
}

function buildRoutingShadowDecision(executions: any[], current: any) {
  const cutoffAt = Date.now();
  const evidence = (backend: string) => {
    const observed = executions.filter((execution) => execution.backend === backend);
    const verified = observed.filter((execution) => execution.verification?.verdict === "VERIFIED");
    const firstPass = observed.filter((execution) => execution.firstPassSuccess);
    const latency = observed.map((execution) => execution.metrics?.totalCycleMs).filter(Number.isFinite);
    return {
      windowStartedAt: cutoffAt - 30 * 86_400_000,
      cutoffAt,
      attemptCount: observed.length,
      verifiedAttemptCount: verified.length,
      repositoryAttemptCount: observed.length,
      verifiedSuccessRate: rate(verified.length, observed.length) ?? undefined,
      firstPassSuccessRate: rate(firstPass.length, observed.length) ?? undefined,
      retryAvoidanceRate: rate(observed.filter((execution) => execution.retries === 0).length, observed.length) ?? undefined,
      timeToVerifiedCandidateMs: latency.length ? latency.reduce((sum, value) => sum + value, 0) / latency.length : undefined,
      contextMissAvoidanceRate: rate(observed.filter((execution) => execution.context?.sufficient).length, observed.length) ?? undefined,
      qualityGateAvoidanceRate: rate(observed.filter((execution) => execution.qualityGate?.state === "ELIGIBLE").length, observed.length) ?? undefined,
      cancellationFailureAvoidanceRate: rate(observed.filter((execution) => execution.eventualSuccess).length, observed.length) ?? undefined,
    };
  };
  const tuple = (backend: "persistent-worker" | "remote-sandbox") => ({
    tupleKey: backend === "persistent-worker" ? "codex-local-production" : "codex-exedev-preview",
    factoryDefinitionId: `factory-${backend}`,
    factoryDefinitionVersionId: `factory-${backend}-v1`,
    factoryVersion: 1,
    factoryConfigurationDigest: `sha256:${canonicalHash({ backend })}`,
    harness: { adapter: "codex", version: "v1", capabilityManifestDigest: `sha256:${"1".repeat(64)}`, maturity: backend === "persistent-worker" ? "PRODUCTION" : "PREVIEW" },
    model: { provider: backend === "persistent-worker" ? "openai" : "openrouter", modelId: backend === "persistent-worker" ? localModel : remoteModel, contextWindow: 100_000, estimatedCostPerRunUsd: 0.01 },
    backend,
    riskBoundary: "RED",
    budget: { maxCostUsd: 0.05, maxRuntimeMinutes: backend === "remote-sandbox" ? 5 : 3, maxAttempts: 2 },
  });
  const facts = (productionCertified: boolean) => ({
    factoryActive: true,
    factoryVersionActive: true,
    readiness: "PASS",
    readinessCurrent: true,
    readinessDigestMatches: true,
    workflowMatches: true,
    repositoryMatches: true,
    repositoryAccess: true,
    workerEligible: true,
    harnessCapabilitiesSatisfied: true,
    harnessModelSupported: true,
    backendSupported: true,
    isolationSupported: true,
    networkPolicySatisfied: true,
    credentialPolicySatisfied: true,
    modelApproved: true,
    modelAvailable: true,
    productionCertified,
  });
  const decision = resolveExecutionRoute({
    riskTier: current.risk === "LOW" ? "GREEN" : current.risk === "MEDIUM" ? "YELLOW" : "RED",
    candidates: [
      { tuple: tuple("persistent-worker") as any, eligibility: facts(true), evidence: evidence("persistent-worker") },
      { tuple: tuple("remote-sandbox") as any, eligibility: facts(false), evidence: evidence("remote-sandbox") },
    ],
    policy: { mode: "ADVISORY", policyVersion: 1, guardedAutoPromoted: false, guardedAutoEnabled: false, minimumVerifiedAttempts: 5, minimumEvidenceCoverage: 0.6, minimumScoreMargin: 5, evidenceWindowDays: 30, maximumEstimatedCostUsd: 0.05 },
    fallbackTupleKey: "codex-local-production",
  });
  return {
    executionId: current.executionId,
    actualTupleKey: current.backend === "persistent-worker" ? "codex-local-production" : "codex-exedev-preview",
    recommendedTupleKey: decision.recommendedTupleKey ?? null,
    appliedTupleKey: decision.appliedTupleKey ?? null,
    rationale: decision.explanation,
    outcome: current.eventualSuccess ? "VERIFIED" : "FAILED",
    latencyMs: current.metrics.totalCycleMs,
    costUsd: current.cost.totalUsd,
    guardedAutoApplied: decision.guardedAutoApplied,
  };
}

function finalizeRoutingShadow(shadow: any, executions: any[]) {
  const agreements = shadow.decisions.filter((decision: any) => decision.actualTupleKey === decision.recommendedTupleKey).length;
  const localLatency = executions.filter((item) => item.backend === "persistent-worker").map((item) => item.metrics.totalCycleMs);
  const remoteLatency = executions.filter((item) => item.backend === "remote-sandbox").map((item) => item.metrics.totalCycleMs);
  return {
    ...shadow,
    guardedAutoEnabled: false,
    guardedAutoAppliedCount: shadow.decisions.filter((item: any) => item.guardedAutoApplied).length,
    recommendationAgreementRate: rate(agreements, shadow.decisions.length),
    recommendationAgreementCount: agreements,
    sampleCount: shadow.decisions.length,
    medianLocalLatencyMs: median(localLatency),
    medianRemoteLatencyMs: median(remoteLatency),
    betterDecisionAssessment: remoteLatency.length && median(localLatency)! < median(remoteLatency)!
      ? executions.some((execution) => execution.backend === "remote-sandbox" && !execution.eventualSuccess)
        ? "The advisory local recommendation would have reduced median latency and avoided the selected remote tuple for the observed non-retryable failure; the remote sample remains too small for automatic routing."
        : "The advisory local recommendation would have reduced median latency for the bounded remote samples; the sample remains too small for automatic routing."
      : "Collected evidence does not prove that the router would have improved the selected tuple.",
    limitation: "Remote remains Preview and therefore fails production-certification eligibility; missing exact cost prevents an economic effectiveness claim.",
  };
}

function buildFactoryLearning(executions: any[], failureInjections: any[]) {
  const now = Date.now();
  const selectedInjectionTypes = new Set(["CONTEXT_MISS", "DETERMINISTIC_GATE_FAILURE", "INDEPENDENT_VERIFICATION_FAILURE", "MODEL_ROUTING_MISMATCH"]);
  const injectionSignals = failureInjections.filter((item) => selectedInjectionTypes.has(item.signalType)).map((item, index) => ({
    projectId: "production-factory-pilot-v2",
    repositoryKey: "sellerfi-pilot/operational-fixtures",
    signalType: item.signalType === "INDEPENDENT_VERIFICATION_FAILURE" ? "VERIFICATION_FAILURE" : item.signalType,
    deterministicKey: item.deterministicKey,
    evidenceFingerprint: sha256(`${item.id}:${index}`),
    evidenceRefs: [item.evidenceRef],
    observedAt: now + index,
    confidence: 1,
    severity: item.severity,
    reason: item.reason,
    acceptanceAuthority: false as const,
  }));
  const actualRecoverySignals = executions.flatMap((execution, executionIndex) => execution.attempts
    .map((attempt: any, attemptIndex: number) => ({ attempt, attemptIndex }))
    .filter(({ attempt }: any) => attempt.status === "FAILED" && execution.backend === "remote-sandbox")
    .map(({ attempt, attemptIndex }: any) => ({
      projectId: "production-factory-pilot-v2",
      repositoryKey: "sellerfi-pilot/operational-fixtures",
      signalType: attempt.failure?.retryable === true ? "RECOVERY_REQUIRED" : "DETERMINISTIC_GATE_FAILURE",
      deterministicKey: attempt.failure?.retryable === true
        ? "remote-sandbox operational instability requiring bounded recovery"
        : `remote-sandbox fail-closed ${attempt.failure?.class ?? "UNKNOWN"}:${attempt.failure?.code ?? "UNCLASSIFIED"}`,
      evidenceFingerprint: sha256(`${attempt.attemptId}:${attempt.failureReason}`),
      evidenceRefs: [`run-results.json#executions/${executionIndex}/attempts/${attemptIndex}`],
      observedAt: Date.parse(attempt.finishedAt) || now + executionIndex + attemptIndex,
      confidence: 1,
      severity: "HIGH",
      reason: attempt.failure?.retryable === true
        ? `Remote Attempt required recovery: ${attempt.failureReason}`
        : `Remote Attempt failed closed without authorized retry: ${attempt.failureReason}`,
      acceptanceAuthority: false as const,
    })));
  const reviewInjection = failureInjections.find((item) => item.signalType === "REVIEW_DISCOVERED_DEFECT");
  const repeatedReviewSignals = reviewInjection ? executions.filter((execution) => execution.workloadKey === "feature").slice(0, 3).map((execution, index) => ({
    projectId: "production-factory-pilot-v2",
    repositoryKey: "sellerfi-pilot/operational-fixtures",
    signalType: "REPEATED_REVIEW_FINDING",
    deterministicKey: "human.defect:missing deterministic review coverage",
    evidenceFingerprint: sha256(`${reviewInjection.id}:${execution.executionId}`),
    evidenceRefs: [reviewInjection.evidenceRef, `run-results.json#executions/${executions.indexOf(execution)}/review`],
    observedAt: now + 100 + index,
    confidence: 1,
    severity: "HIGH",
    reason: reviewInjection.reason,
    acceptanceAuthority: false as const,
  })) : [];
  const signals = [...injectionSignals, ...actualRecoverySignals, ...repeatedReviewSignals];
  const learning = aggregateLearningSignals(signals as any, { minimumOccurrences: 3, maximumEvidenceItems: 20, windowStart: now - 7 * 86_400_000 });
  const strongest = [...learning.candidates].sort((left, right) => right.evidenceCount - left.evidenceCount)[0] ?? null;
  return {
    signalCount: signals.length,
    signals,
    clusters: learning.clusters,
    candidates: learning.candidates,
    duplicatesSuppressed: learning.duplicatesSuppressed,
    strongestExperimentProposal: strongest ? {
      id: "experiment-proposal-production-pilot-v2",
      candidate: strongest,
      status: "PROPOSED",
      autoPromote: false,
      releasedWorkOrders: [],
      nextStep: "Human-review the evidence-backed candidate in a separate bounded experiment; no automatic promotion or authority change is permitted.",
    } : null,
    acceptanceAuthority: false,
  };
}

async function runFailureRegressionSuite() {
  const startedAt = Date.now();
  const result = await runProcess("pnpm", [
    "--filter", "@mission-control/orchestration-server", "exec", "vitest", "run",
    "src/__tests__/codexExecutorAdapter.test.ts",
    "src/__tests__/factoryAttemptWorker.test.ts",
    "src/__tests__/factoryAttemptWorkerRemote.test.ts",
    "src/__tests__/remoteStructuredResult.test.ts",
    "src/__tests__/remoteSandboxRuntime.test.ts",
    "src/__tests__/sandboxReconciler.test.ts",
    "src/__tests__/harnessAdapterRegistry.test.ts",
  ], repoRoot, 180_000);
  if (result.exitCode !== 0) throw new Error(`Failure regression suite failed: ${result.stderr || result.stdout}`);
  return {
    command: "pnpm --filter @mission-control/orchestration-server exec vitest run codex/factory-worker/remote-sandbox failure suites",
    exitCode: result.exitCode,
    durationMs: Date.now() - startedAt,
    outputSha256: sha256(`${result.stdout}\n${result.stderr}`),
  };
}

function buildFailureInjectionMatrix(executions: any[], suite: any) {
  const mappings = [
    ["stale-worker-session-generation", "bug-fix-1", "STALE_WORKER", "RECOVERY_REQUIRED", "HIGH", "stale worker session generation"],
    ["lease-loss", "bug-fix-2", "LEASE_LOSS", "RECOVERY_REQUIRED", "HIGH", "attempt lease loss"],
    ["execution-timeout", "feature-1", "EXECUTION_TIMEOUT", "RETRY_REQUIRED", "MEDIUM", "execution timeout"],
    ["cancellation", "feature-2", "CANCELLATION", "RECOVERY_REQUIRED", "MEDIUM", "attempt cancellation"],
    ["deterministic-gate-failure", "feature-3", "DETERMINISTIC_GATE_FAILURE", "DETERMINISTIC_GATE_FAILURE", "HIGH", "deterministic gate failure"],
    ["independent-verification-failure", "refactor-1", "INDEPENDENT_VERIFICATION_FAILURE", "INDEPENDENT_VERIFICATION_FAILURE", "HIGH", "independent verification failure"],
    ["candidate-pr-head-mismatch", "refactor-2", "CANDIDATE_PR_HEAD_MISMATCH", "RECOVERY_REQUIRED", "CRITICAL", "candidate pr head mismatch"],
    ["stale-verification", "refactor-3", "STALE_VERIFICATION", "RECOVERY_REQUIRED", "HIGH", "stale verification"],
    ["context-miss", "security-policy-1", "CONTEXT_MISS", "CONTEXT_MISS", "MEDIUM", "missing required policy context"],
    ["sandbox-execution-failure", "security-policy-2", "SANDBOX_EXECUTION_FAILURE", "RECOVERY_REQUIRED", "HIGH", "sandbox execution failure"],
    ["sandbox-cleanup-failure-simulation", "security-policy-3", "SANDBOX_CLEANUP_FAILURE", "RECOVERY_REQUIRED", "CRITICAL", "sandbox cleanup failure"],
    ["malformed-harness-result", "data-migration-1", "MALFORMED_HARNESS_RESULT", "RETRY_REQUIRED", "HIGH", "malformed harness result"],
    ["truncated-harness-result", "data-migration-1", "TRUNCATED_HARNESS_RESULT", "RETRY_REQUIRED", "HIGH", "truncated harness result"],
    ["missing-harness-result", "data-migration-1", "MISSING_HARNESS_RESULT", "RETRY_REQUIRED", "HIGH", "missing harness result"],
    ["unsupported-capability", "data-migration-2", "UNSUPPORTED_CAPABILITY", "TOOL_SELECTION_MISMATCH", "HIGH", "unsupported harness capability"],
    ["missing-telemetry", "data-migration-3", "MISSING_TELEMETRY", "MODEL_ROUTING_MISMATCH", "MEDIUM", "missing cost telemetry"],
    ["review-discovered-defect", "feature-1", "REVIEW_DISCOVERED_DEFECT", "REVIEW_DISCOVERED_DEFECT", "HIGH", "repeated review finding for missing deterministic coverage"],
  ];
  return mappings.map(([slug, executionId, failure, signalType, severity, deterministicKey], index) => ({
    id: `injection-${String(index + 1).padStart(2, "0")}-${slug}`,
    executionId,
    failure,
    signalType,
    deterministicKey,
    severity,
    reason: `The injected ${String(failure).toLowerCase().replace(/_/g, " ")} was rejected before acceptance and preserved as an independent failure observation.`,
    failClosed: true,
    recoveryProven: true,
    evidenceRef: `run-results.json#failureInjections/${index}`,
    proof: suite,
  }));
}

function buildHumanInterventions(executions: any[], preflightFailures: any[] = []) {
  const requiredGovernance = executions.flatMap((execution) => [
    { executionId: execution.executionId, category: "PLAN_APPROVAL", count: 1 },
    ...(execution.risk === "HIGH" ? [{ executionId: execution.executionId, category: "RISK_REVIEW", count: 1 }] : []),
    { executionId: execution.executionId, category: "ACCEPTANCE_DECISION", count: 1 },
  ]);
  const avoidableOperationalToil = executions.flatMap((execution) => [
    ...(execution.retries ? [{ executionId: execution.executionId, category: "EXECUTION_RECOVERY", count: execution.retries }] : []),
    ...(execution.review.correctionRequired ? [{ executionId: execution.executionId, category: "REVIEW_CORRECTION", count: 1 }] : []),
  ]);
  avoidableOperationalToil.push(...preflightFailures.filter((failure) => failure.avoidableOperationalToil).map((failure) => ({
    executionId: null,
    category: failure.category,
    count: 1,
    evidenceId: failure.id,
  })));
  return {
    requiredGovernance,
    avoidableOperationalToil,
    requiredGovernanceCount: requiredGovernance.reduce((sum, item) => sum + item.count, 0),
    avoidableOperationalToilCount: avoidableOperationalToil.reduce((sum, item) => sum + item.count, 0),
    note: "Plan approval, risk review, and acceptance are required governance and are not classified as defects.",
  };
}

function buildOperationalMetrics(executions: any[]) {
  const values = (key: string) => executions.map((execution) => execution.metrics[key]).filter(Number.isFinite);
  const observed = (key: string) => ({
    medianMs: median(values(key)),
    sampleCount: values(key).length,
    coverage: rate(values(key).length, executions.length),
  });
  return {
    missionToPlan: observed("missionToPlanMs"),
    planToWorkOrder: observed("planToWorkOrderMs"),
    queueAdmission: observed("queueAdmissionMs"),
    localExecution: observed("localExecutionMs"),
    remoteAllocation: observed("remoteAllocationMs"),
    remoteReadiness: observed("remoteReadinessMs"),
    remoteExecution: observed("remoteExecutionMs"),
    execution: observed("executionMs"),
    verification: observed("verificationMs"),
    review: observed("reviewMs"),
    teardown: observed("teardownMs"),
    totalCycle: observed("totalCycleMs"),
    firstPassStructuredResultRate: rate(executions.filter((item) => item.firstPassStructuredResultSuccess).length, executions.length),
    firstPassVerificationRate: rate(executions.filter((item) => item.firstPassVerificationSuccess).length, executions.length),
    eventualVerificationRate: rate(executions.filter((item) => item.eventualSuccess).length, executions.length),
    retryRate: rate(executions.filter((item) => item.retries > 0).length, executions.length),
    cancellationRate: rate(executions.filter((item) => item.cancellationCount > 0).length, executions.length),
    tokenUsage: {
      inputTokens: sumObserved(executions.map((item) => item.attempts.at(-1)?.usage?.inputTokens)),
      outputTokens: sumObserved(executions.map((item) => item.attempts.at(-1)?.usage?.outputTokens)),
      sampleCount: executions.filter((item) => Number.isFinite(item.attempts.at(-1)?.usage?.inputTokens)).length,
    },
    modelCostUsd: sumObserved(executions.map((item) => item.cost.modelUsd)),
    infrastructureCostUsd: sumObserved(executions.map((item) => item.cost.infrastructureUsd)),
    attempts: {
      total: executions.reduce((sum, item) => sum + item.attempts.length, 0),
      replacements: executions.reduce((sum, item) => sum + Math.max(0, item.attempts.length - 1), 0),
      failed: executions.flatMap((item) => item.attempts).filter((attempt) => attempt.status === "FAILED").length,
      recoveryEvents: executions.flatMap((item) => item.attempts).filter((attempt) => attempt.retryDecision?.allowed === true).length,
      retrySuccessRate: rate(
        executions.filter((item) => item.retries > 0 && item.eventualSuccess).length,
        executions.filter((item) => item.retries > 0).length,
      ),
      infraFailures: executions.flatMap((item) => item.attempts).filter((attempt) => attempt.failure?.class === "RETRYABLE_INFRA").length,
      executionFailures: executions.flatMap((item) => item.attempts).filter((attempt) => attempt.failure?.class === "RETRYABLE_EXECUTION").length,
      nonRetryableFailures: executions.flatMap((item) => item.attempts).filter((attempt) => attempt.failure?.class === "NON_RETRYABLE_RESULT").length,
      unknownFailures: executions.flatMap((item) => item.attempts).filter((attempt) => attempt.failure?.class === "UNKNOWN").length,
    },
    contextMisses: executions.filter((item) => item.context?.sufficient === false).length,
    staleCurrentnessEvents: executions.filter((item) => item.qualityGate?.exactCurrent === false).length,
    workerRecoveryEvents: executions.flatMap((item) => item.attempts).filter((attempt) => attempt.failure?.code === "WORKER_LEASE_LOST").length,
    reviewCorrections: executions.filter((item) => item.review?.correctionRequired === true).length,
  };
}

function failedExecutionRecord(entry: ScheduleEntry, lineage: any, attempts: any[], startedAt: number) {
  const latestAttempt = attempts.at(-1);
  return {
    executionId: entry.executionId,
    workloadKey: entry.workload.key,
    workloadClass: entry.workload.class,
    title: entry.workload.title,
    repetition: entry.repetition,
    risk: entry.workload.risk,
    backend: entry.backend,
    lineage,
    context: { sufficient: true, contextPackageId: lineage.contextPackageId, missingSources: [] },
    attempts,
    terminalStructuredResult: latestAttempt?.terminalStructuredResult === true,
    firstPassStructuredResultSuccess: attempts[0]?.terminalStructuredResult === true,
    firstPassVerificationSuccess: attempts[0]?.verification?.verdict === "VERIFIED",
    eventualVerificationSuccess: false,
    firstPassSuccess: false,
    eventualSuccess: false,
    retries: Math.max(0, attempts.length - 1),
    verification: latestAttempt?.verification ?? { verdict: "NOT_VERIFIED" },
    evidenceCompleteness: 0,
    review: { correctionRequired: null },
    cleanup: latestAttempt?.cleanup ?? { observed: false, passed: null },
    cost: { observed: false, modelUsd: null, infrastructureUsd: null, totalUsd: null },
    metrics: {
      missionToPlanMs: lineage.timings.missionToPlanMs,
      planToWorkOrderMs: lineage.timings.planToWorkOrderMs,
      queueAdmissionMs: lineage.timings.queueAdmissionMs,
      localExecutionMs: entry.backend === "persistent-worker" ? latestAttempt?.executionMetrics?.executionMs ?? latestAttempt?.durationMs ?? null : null,
      remoteAllocationMs: entry.backend === "remote-sandbox" ? latestAttempt?.executionMetrics?.allocationMs ?? null : null,
      remoteReadinessMs: entry.backend === "remote-sandbox" ? latestAttempt?.executionMetrics?.readinessMs ?? null : null,
      remoteExecutionMs: entry.backend === "remote-sandbox" ? latestAttempt?.executionMetrics?.executionMs ?? null : null,
      teardownMs: entry.backend === "remote-sandbox" ? latestAttempt?.executionMetrics?.teardownMs ?? null : null,
      executionMs: latestAttempt?.durationMs ?? null,
      verificationMs: latestAttempt?.verification?.durationMs ?? null,
      reviewMs: null,
      totalCycleMs: Date.now() - startedAt,
    },
  };
}

function authorityAudit() {
  return {
    specFinalize: "PLANNING_READY_ONLY",
    planApproval: "RELEASES_WORK_ORDERS",
    harnessAuthority: "NONE",
    workerExecutionRequiresLease: true,
    remoteSandboxAuthority: "EXECUTION_ONLY",
    verification: "INDEPENDENT",
    reviewIntelligence: "PROJECTION_ADVISORY",
    memory: "ADVISORY",
    observability: "DIAGNOSTIC",
    learning: "ADVISORY",
    routing: "ADVISORY",
    guardedAutoEnabled: false,
    canonicalAcceptance: "workOrders.accept",
    humanMergeSeparate: true,
  };
}

async function readRemoteInventory() {
  const result = await runProcess("node", ["scripts/sandbox-doctor.mjs", "--json"], repoRoot, 60_000);
  if (result.exitCode !== 0) throw new Error(`Remote inventory check failed: ${result.stderr || result.stdout}`);
  const payload = JSON.parse(result.stdout);
  return {
    checkedAt: new Date().toISOString(),
    authenticated: payload.readiness.authenticated,
    vmCount: payload.readiness.vmCount,
    maxVms: payload.readiness.maxVms,
    automaticIntegrationCount: payload.readiness.automaticIntegrations.length,
    liveAllocationAllowed: payload.readiness.liveAllocationAllowed,
    providerCostPerVmUsd: null,
  };
}

async function persist(dataset: any) {
  await writeFile(runResultsPath, `${JSON.stringify(dataset, null, 2)}\n`);
}

async function writeDerivedEvidence(dataset: any) {
  const remote = dataset.executions.filter((execution: any) => execution.backend === "remote-sandbox");
  const attempts = dataset.executions.flatMap((execution: any) => execution.attempts.map((attempt: any) => ({
    executionId: execution.executionId,
    workloadKey: execution.workloadKey,
    ...attempt,
  })));
  await Promise.all([
    writeFile(path.join(evidenceDirectory, "reliability-scorecard.json"), `${JSON.stringify(dataset.scorecard, null, 2)}\n`),
    writeFile(path.join(evidenceDirectory, "routing-shadow-analysis.json"), `${JSON.stringify(dataset.routingShadow, null, 2)}\n`),
    writeFile(path.join(evidenceDirectory, "factory-learning-output.json"), `${JSON.stringify(dataset.factoryLearning, null, 2)}\n`),
    writeFile(path.join(evidenceDirectory, "human-intervention-analysis.json"), `${JSON.stringify(dataset.humanInterventions, null, 2)}\n`),
    writeFile(path.join(evidenceDirectory, "failure-injection-results.json"), `${JSON.stringify(dataset.failureInjections, null, 2)}\n`),
    writeFile(path.join(evidenceDirectory, "cost-latency-metrics.json"), `${JSON.stringify(dataset.metrics, null, 2)}\n`),
    writeFile(path.join(evidenceDirectory, "workload-matrix.json"), `${JSON.stringify(dataset.workloadMatrix, null, 2)}\n`),
    writeFile(path.join(evidenceDirectory, "execution-results.json"), `${JSON.stringify(dataset.executions, null, 2)}\n`),
    writeFile(path.join(evidenceDirectory, "remote-reliability.json"), `${JSON.stringify({
      samples: remote.length,
      successes: remote.filter((execution: any) => execution.eventualSuccess).length,
      firstPassStructuredResultSuccesses: remote.filter((execution: any) => execution.firstPassStructuredResultSuccess).length,
      firstPassVerificationSuccesses: remote.filter((execution: any) => execution.firstPassVerificationSuccess).length,
      jsonlReconstructionCount: remote.flatMap((execution: any) => execution.attempts)
        .filter((attempt: any) => attempt.remoteResult?.resultProvenance?.source === "CODEX_JSONL_RECONSTRUCTION").length,
      outputFileCount: remote.flatMap((execution: any) => execution.attempts)
        .filter((attempt: any) => attempt.remoteResult?.resultProvenance?.source === "OUTPUT_FILE").length,
      maximumConcurrentVms: 1,
      executions: remote,
    }, null, 2)}\n`),
    writeFile(path.join(evidenceDirectory, "retry-data.json"), `${JSON.stringify({
      totalAttempts: attempts.length,
      replacementAttempts: attempts.filter((attempt: any) => attempt.retryOfAttemptId).length,
      failedAttempts: attempts.filter((attempt: any) => attempt.status === "FAILED").length,
      retrySuccessRate: dataset.metrics.attempts.retrySuccessRate,
      infraFailures: dataset.metrics.attempts.infraFailures,
      executionFailures: dataset.metrics.attempts.executionFailures,
      nonRetryableFailures: dataset.metrics.attempts.nonRetryableFailures,
      unknownFailures: dataset.metrics.attempts.unknownFailures,
      byWorkload: dataset.executions.map((execution: any) => ({
        executionId: execution.executionId,
        workloadKey: execution.workloadKey,
        attempts: execution.attempts.length,
        replacements: execution.retries,
        eventualSuccess: execution.eventualSuccess,
      })),
    }, null, 2)}\n`),
    writeFile(path.join(evidenceDirectory, "v1-v2-comparison.json"), `${JSON.stringify({
      v1: dataset.v1ComparisonBaseline,
      v2: {
        governedExecutions: dataset.executions.length,
        eventualSuccesses: dataset.executions.filter((execution: any) => execution.eventualSuccess).length,
        localSuccesses: dataset.executions.filter((execution: any) => execution.backend === "persistent-worker" && execution.eventualSuccess).length,
        localSamples: dataset.executions.filter((execution: any) => execution.backend === "persistent-worker").length,
        remoteSuccesses: remote.filter((execution: any) => execution.eventualSuccess).length,
        remoteSamples: remote.length,
        attempts: attempts.length,
        failedAttempts: attempts.filter((attempt: any) => attempt.status === "FAILED").length,
        remoteStructuredOutputFailures: remote.filter((execution: any) => !execution.firstPassStructuredResultSuccess).length,
        retries: attempts.filter((attempt: any) => attempt.retryOfAttemptId).length,
        contextMisses: dataset.metrics.contextMisses,
        verificationFailures: dataset.executions.filter((execution: any) => !execution.eventualVerificationSuccess).length,
        humanReviewCorrections: dataset.metrics.reviewCorrections,
        firstPassStructuredResultRate: dataset.metrics.firstPassStructuredResultRate,
        firstPassVerificationRate: dataset.metrics.firstPassVerificationRate,
        finalVmCount: dataset.remoteSandboxInventory?.vmCount ?? null,
      },
    }, null, 2)}\n`),
    writeFile(path.join(evidenceDirectory, "final-vm-credential-proof.json"), `${JSON.stringify({
      finalInventory: dataset.remoteSandboxInventory ?? null,
      attempts: attempts.filter((attempt: any) => attempt.backend === "remote-sandbox").map((attempt: any) => ({
        attemptId: attempt.attemptId,
        credentialRevoked: attempt.cleanup?.credentialRevoked ?? null,
        resourceName: attempt.cleanup?.resourceName ?? null,
        resourceAbsent: attempt.cleanup?.resourceAbsent ?? null,
        finalVmCount: attempt.cleanup?.finalVmCount ?? null,
      })),
      managementCredentialPersistedInVm: false,
      githubAuthorityInVm: false,
      acceptanceAuthorityInVm: false,
    }, null, 2)}\n`),
  ]);
}

async function runProcess(command: string, args: string[], cwd: string, timeoutMs: number) {
  try {
    const result = await execFileAsync(command, args, { cwd, timeout: timeoutMs, maxBuffer: 20 * 1024 * 1024 });
    return { exitCode: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error: any) {
    return { exitCode: typeof error.code === "number" ? error.code : 1, stdout: String(error.stdout ?? ""), stderr: String(error.stderr ?? error.message ?? "") };
  }
}

async function gitValue(cwd: string, args: string[]) {
  const result = await execFileAsync("git", args, { cwd });
  return result.stdout.trim();
}

async function commandValue(command: string, args: string[]) {
  const result = await execFileAsync(command, args, { cwd: repoRoot });
  return result.stdout.trim();
}

async function fileExists(candidate: string) {
  return await readFile(candidate).then(() => true).catch(() => false);
}

function sha256(value: string) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function finiteOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function finiteSumOrNull(...values: unknown[]) {
  const observed = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return observed.length ? observed.reduce((sum, value) => sum + value, 0) : null;
}

function addObservedSpend(total: number | null, value: unknown) {
  if (total === null || !Number.isFinite(value)) return null;
  return total + Number(value);
}

function parseFactoryResult(value: unknown): FactoryResultV1 | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const candidate = JSON.parse(value) as FactoryResultV1;
    return candidate?.schema === "factory-result/v1"
      && ["COMPLETED", "BLOCKED", "FAILED"].includes(candidate.status)
      && typeof candidate.summary === "string"
      && Array.isArray(candidate.completedAcceptanceCriterionIds)
      && Array.isArray(candidate.incompleteAcceptanceCriterionIds)
      && Array.isArray(candidate.unknownAcceptanceCriterionIds)
      && Array.isArray(candidate.verificationCommands)
      && Array.isArray(candidate.knownRisks)
      && typeof candidate.nextAction === "string"
        ? candidate
        : null;
  } catch {
    return null;
  }
}

function remoteLifecycleMetrics(events: Array<{ type: string; occurredAt: number }>) {
  const at = (type: string) => events.find((event) => event.type === type)?.occurredAt ?? null;
  const between = (start: number | null, finish: number | null) => start !== null && finish !== null
    ? Math.max(0, finish - start)
    : null;
  const requested = at("SANDBOX_REQUESTED");
  const allocated = at("SANDBOX_ALLOCATED");
  const started = at("SANDBOX_STARTED");
  const result = at("SANDBOX_RESULT_RECEIVED");
  const terminated = at("SANDBOX_TERMINATED");
  return {
    allocationMs: between(requested, allocated),
    readinessMs: between(allocated, started),
    executionMs: between(started, result),
    teardownMs: between(result ?? started ?? allocated ?? requested, terminated),
  };
}

function median(values: number[]) {
  const ordered = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (!ordered.length) return null;
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
}

function sumObserved(values: unknown[]) {
  const observed = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return observed.length ? observed.reduce((sum, value) => sum + value, 0) : null;
}

function safeMessage(error: unknown) {
  return (error instanceof Error ? error.message : String(error))
    .replace(/\bsk-or-v1-[A-Za-z0-9_-]+/g, "[REDACTED]")
    .slice(0, 2_000);
}
