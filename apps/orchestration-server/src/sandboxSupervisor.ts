import { createHash } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { canonicalDigest, canonicalHash } from "@mission-control/shared";
import {
  harnessCapabilityManifestDigest,
  harnessRuntimeArtifactDigest,
  harnessRuntimeArtifactIssues,
} from "@mission-control/workflow-engine";
import { createPatchDescriptor, createSandboxResultBundle, encodeSandboxResultBundle, type SandboxResultBundle } from "./sandboxResultBundle.js";
import { SANDBOX_SUPERVISOR_VERSION, redactSandboxTail, redactSandboxText } from "./sandboxProvider.js";
import { factoryResultContextIssues, resolveRemoteStructuredResult, type RemoteOutputFileObservation } from "./remoteStructuredResult.js";
import { remoteFailure } from "./remoteExecutionPolicy.js";
import { standaloneRemoteSupervisorSource } from "./standaloneRemoteSupervisorSource.js";
import {
  executionProfileDigest,
  executionProfileIssues,
  executionProfileProjectionBlockers,
  executionProfileQualificationDigest,
  executionProfileQualificationIssues,
  executionProfileQualificationMatches,
  type ExecutionProfileProjection,
} from "../../../convex/lib/executionProfile.js";

const execFileAsync = promisify(execFile);

export interface SandboxSupervisorInput {
  executionManifest: Record<string, unknown>;
  attemptId: string;
  workOrderId: string;
  workOrderRevisionNumber: number;
  workflowRunId: string;
  manifestDigest: string;
  /** Server-issued lease heartbeat time at claim/reclaim admission. */
  profileAdmittedAt?: number;
  profileDigest: string;
  sourceSha: string;
  environmentDescriptor: {
    provider: "EXE_DEV" | "FAKE" | "DOCKER";
    image: string;
  };
  repositoryRoot: string;
  outputPath: string;
  diagnosticsPath?: string;
  executor: {
    command: string;
    args: string[];
    timeoutMs: number;
    resultPath?: string;
    model?: string;
    provider?: string;
    modelRouteDigest?: string;
    providerRoute?: string;
    reasoningConfig?: {
      effort?: string;
      temperature?: number;
      maxTokens?: number;
    };
  };
  environment: Record<string, string>;
  faultInjection?: { crashAfterDiagnostics?: boolean };
}

export async function runSandboxSupervisor(input: SandboxSupervisorInput, signal?: AbortSignal): Promise<SandboxResultBundle> {
  validateSupervisorInput(input);
  const startedAt = Date.now();
  const observedSource = (await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: input.repositoryRoot })).stdout.trim();
  if (observedSource !== input.sourceSha) throw new Error("Sandbox repository does not match the frozen source SHA.");
  const execution = await runExecutor(input, signal);
  const outputFile = await observeOutputFile(input.executor.resultPath);
  let resolution = resolveRemoteStructuredResult({
    outputFile,
    stdout: execution.stdout,
    stderr: execution.stderr,
    exitCode: execution.exitCode,
    timedOut: execution.timedOut,
    canceled: execution.canceled,
  });
  if (resolution.accepted) {
    const contextIssues = factoryResultContextIssues(
      resolution.result,
      (input.executionManifest as any).intent.acceptanceCriterionIds,
    );
    if (contextIssues.length > 0) {
      resolution = {
        ...resolution,
        accepted: false,
        failure: remoteFailure(
          "NON_RETRYABLE_RESULT",
          "RESULT_ACCEPTANCE_CONTEXT_INVALID",
          "RESULT_VALIDATION",
          `factory-result/v1 acceptance-criterion accounting failed: ${contextIssues.join(", ")}.`,
        ),
      };
    }
  }
  const diagnosticsPath = input.diagnosticsPath ?? `${input.outputPath}.diagnostics.json`;
  await atomicWriteFile(diagnosticsPath, Buffer.from(JSON.stringify({
    attemptId: input.attemptId,
    manifestDigest: input.manifestDigest,
    sourceSha: input.sourceSha,
    phase: "EXECUTOR_FINISHED",
    executor: {
      exitCode: execution.exitCode,
      timedOut: execution.timedOut,
      canceled: execution.canceled,
      stdoutDigest: canonicalDigest("factory-sandbox-stdout/v1", execution.stdout),
      stderrDigest: canonicalDigest("factory-sandbox-stderr/v1", execution.stderr),
      stdoutTail: redactSandboxTail(execution.stdout),
      stderrTail: redactSandboxTail(execution.stderr),
    },
    resultProvenance: resolution.provenance,
    resultOutput: resolution.diagnostics.outputFile,
    failure: resolution.failure ?? null,
  }), "utf8"));
  if (input.faultInjection?.crashAfterDiagnostics) {
    throw new Error("Injected supervisor crash after executor diagnostics persistence.");
  }
  // Stage the harness's changes (respecting .gitignore) before computing the
  // candidate, bounded by the frozen code scope.
  //
  // A harness creates new files without staging them, and `git diff <sha>`
  // cannot see untracked paths — the bundle would carry a half-change that the
  // host's `sameStringSet(materializedFiles, bundle.changedFiles)` cross-check
  // cannot detect, because the host list is derived from the same patch. The
  // local persistent-worker backend already includes untracked files
  // (factoryGitRuntime.listChangedFiles); this keeps the backends equivalent.
  await execFileAsync("git", ["add", "-A", "--", ...stagingPathspec(input.executionManifest)], {
    cwd: input.repositoryRoot,
  });
  const patch = await execFileAsync("git", ["diff", "--cached", "--binary", "--full-index", input.sourceSha, "--"], {
    cwd: input.repositoryRoot,
    maxBuffer: 8 * 1024 * 1024,
    encoding: "buffer",
  });
  const structuredResult = resolution.result;
  const status = execution.timedOut ? "TIMED_OUT" : execution.canceled ? "CANCELED" : resolution.accepted ? "COMPLETED" : "FAILED";
  const changedFiles = (await execFileAsync("git", ["diff", "--cached", "--name-only", input.sourceSha, "--"], { cwd: input.repositoryRoot })).stdout
    .split("\n").map((value) => value.trim()).filter(Boolean).sort();
  const numstat = (await execFileAsync("git", ["diff", "--cached", "--numstat", input.sourceSha, "--"], { cwd: input.repositoryRoot })).stdout;
  const { linesAdded, linesDeleted } = summarizeNumstat(numstat);
  const finishedAt = Date.now();
  const harness = harnessIdentity(input.executionManifest as any);
  const usage = codexUsage(execution.stdout);
  const bundle = createSandboxResultBundle({
    schema: "factory-sandbox-result/v1",
    attemptId: input.attemptId,
    workOrderId: input.workOrderId,
    workOrderRevisionNumber: input.workOrderRevisionNumber,
    workflowRunId: input.workflowRunId,
    manifestDigest: input.manifestDigest,
    profileDigest: input.profileDigest,
    sourceSha: input.sourceSha,
    supervisorVersion: SANDBOX_SUPERVISOR_VERSION,
    harness,
    environment: input.environmentDescriptor,
    startedAt,
    finishedAt,
    status,
    resultProvenance: {
      ...resolution.provenance,
      context: { attemptId: input.attemptId, manifestDigest: input.manifestDigest, sourceSha: input.sourceSha },
    },
    failure: resolution.failure,
    structuredResult,
    changedFiles,
    diff: { filesChanged: changedFiles.length, linesAdded, linesDeleted },
    commandResults: [{ commandClass: "EXECUTOR", exitCode: execution.exitCode, durationMs: finishedAt - startedAt, timedOut: execution.timedOut }],
    verificationInputs: { reportedCommands: structuredResult.verificationCommands },
    artifacts: [],
    events: [
      { type: "SUPERVISOR_STARTED", occurredAt: startedAt },
      { type: "EXECUTOR_FINISHED", occurredAt: finishedAt },
      { type: "DIAGNOSTICS_WRITTEN", occurredAt: finishedAt },
      { type: "RESULT_WRITTEN", occurredAt: finishedAt },
    ],
    patch: createPatchDescriptor(Buffer.from(patch.stdout)),
    executor: {
      exitCode: execution.exitCode,
      stdoutDigest: canonicalDigest("factory-sandbox-stdout/v1", execution.stdout),
      stderrDigest: canonicalDigest("factory-sandbox-stderr/v1", execution.stderr),
      stdoutTail: redactSandboxTail(execution.stdout),
      stderrTail: redactSandboxTail(execution.stderr),
      resultOutput: resolution.diagnostics.outputFile,
    },
    usage: {
      providerCostUsd: null,
      inferenceCostUsd: null,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      observedAt: finishedAt,
      providerRuntimeMs: finishedAt - startedAt,
      enforcement: "OBSERVATION_ONLY",
    },
  });
  await atomicWriteFile(input.outputPath, encodeSandboxResultBundle(bundle));
  return bundle;
}

export async function runSandboxSupervisorFromConfig(configPath: string) {
  const raw = await readFile(configPath, "utf8");
  const input = JSON.parse(raw) as SandboxSupervisorInput;
  return await runSandboxSupervisor(input);
}

export function standaloneSandboxSupervisorSource() {
  return standaloneRemoteSupervisorSource();
}

/**
 * Pathspec for staging the candidate.
 *
 * `git add -A` with no pathspec would sweep in every non-ignored artifact the
 * executor happened to write — agent session state, a generated `.env.local`,
 * caches — and those would enter the patch, the changed-file set, and the
 * published pull request. Bound staging to the manifest's frozen
 * `repository.allowedPaths` so the bundle can only ever contain paths the
 * WorkOrder already authorized. Falls back to the whole tree only when the
 * manifest declares no scope, in which case the host-side
 * `validateChangedFileScope` remains the control.
 */
export function stagingPathspec(executionManifest: Record<string, unknown> | undefined): string[] {
  const repository = (executionManifest as any)?.repository;
  const allowed = Array.isArray(repository?.allowedPaths) ? repository.allowedPaths : [];
  const pathspec = allowed
    .map((entry: unknown) => String(entry ?? "").trim())
    .filter((entry: string) => entry.length > 0 && !entry.startsWith("/") && !entry.includes(".."));
  return pathspec.length > 0 ? pathspec : ["."];
}

function validateSupervisorInput(input: SandboxSupervisorInput) {
  if (!input.attemptId || !input.workOrderId || !Number.isSafeInteger(input.workOrderRevisionNumber) || input.workOrderRevisionNumber < 1 || !input.workflowRunId || !input.manifestDigest || !input.profileDigest || !/^[a-f0-9]{40,64}$/i.test(input.sourceSha)) throw new Error("Supervisor identity is invalid.");
  const manifest: any = input.executionManifest;
  const credentialGrants = manifest?.sandbox?.credentialGrants;
  const route = supervisorModelRoute(manifest);
  if (!["factory-execution-manifest/v1", "factory-execution-manifest/v2", "factory-execution-manifest/v3"].includes(manifest?.version)
    || input.manifestDigest !== `sha256:${canonicalHash(manifest)}`
    || manifest?.causation?.workOrderId !== input.workOrderId
    || manifest?.causation?.workOrderRevisionNumber !== input.workOrderRevisionNumber
    || manifest?.causation?.workflowRunId !== input.workflowRunId
    || manifest?.repository?.baseSha !== input.sourceSha
    || manifest?.sandbox?.profileDigest !== input.profileDigest
    || manifest?.sandbox?.supervisorVersion !== SANDBOX_SUPERVISOR_VERSION
    || manifest?.harness?.pullRequestAuthority !== "CONTROL_PLANE_ONLY"
    || supervisorExecutionBackend(manifest) !== "remote-sandbox"
    || !Array.isArray(manifest?.intent?.acceptanceCriterionIds)
    || manifest.intent.acceptanceCriterionIds.some((id: unknown) => typeof id !== "string" || !id)
    || new Set(manifest.intent.acceptanceCriterionIds).size !== manifest.intent.acceptanceCriterionIds.length
    || ["adapter", "version", "harnessId", "harnessVersion"]
      .some((field) => typeof manifest?.harness?.[field] !== "string" || !manifest.harness[field])
    || !route
    || !Array.isArray(credentialGrants)
    || credentialGrants.some((grant: any) => grant?.secretValueIncluded !== false || grant?.githubAuthority !== "NONE" || grant?.providerAuthority !== "NONE")) {
    throw new Error("Frozen execution manifest is invalid or exceeds sandbox authority.");
  }
  if (decomposedManifest(manifest) && !validV2SupervisorBindings(manifest, input.executor, input.environment)) {
    throw new Error("Frozen decomposed execution manifest has invalid model, harness, or runtime bindings.");
  }
  if (manifest.version === "factory-execution-manifest/v3"
    && !validV3ExecutionProfileBinding(manifest, input.profileAdmittedAt)) {
    throw new Error("Frozen V3 execution manifest has an invalid, expired, or substituted Execution Profile binding.");
  }
  if (!["EXE_DEV", "FAKE", "DOCKER"].includes(input.environmentDescriptor?.provider) || !input.environmentDescriptor?.image) throw new Error("Supervisor environment identity is invalid.");
  if (!path.isAbsolute(input.repositoryRoot) || !path.isAbsolute(input.outputPath)
    || (input.diagnosticsPath !== undefined && !path.isAbsolute(input.diagnosticsPath))) throw new Error("Supervisor paths must be absolute.");
  if (!input.executor.command || !Array.isArray(input.executor.args) || !Number.isSafeInteger(input.executor.timeoutMs) || input.executor.timeoutMs < 1_000 || input.executor.timeoutMs > 8 * 60 * 60 * 1_000) throw new Error("Supervisor executor contract is invalid.");
  const allowedEnvironment = new Set(["OPENROUTER_API_KEY", "OPENAI_BASE_URL", "OPENAI_API_KEY"]);
  for (const key of Object.keys(input.environment)) if (!allowedEnvironment.has(key)) throw new Error(`Supervisor environment grant ${key} is not allowed.`);
}

function summarizeNumstat(value: string) {
  let linesAdded = 0;
  let linesDeleted = 0;
  for (const line of value.split("\n")) {
    const [added, deleted] = line.split("\t");
    if (/^\d+$/.test(added ?? "")) linesAdded += Number(added);
    if (/^\d+$/.test(deleted ?? "")) linesDeleted += Number(deleted);
  }
  return { linesAdded, linesDeleted };
}

async function runExecutor(input: SandboxSupervisorInput, signal?: AbortSignal) {
  return await new Promise<{ exitCode: number | null; stdout: string; stderr: string; timedOut: boolean; canceled: boolean  ; }>((resolve, reject) => {
    const child = spawn(input.executor.command, input.executor.args, {
      cwd: input.repositoryRoot,
      env: { PATH: process.env.PATH, HOME: process.env.HOME, ...input.environment },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let canceled = false;
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    const timeout = setTimeout(() => { timedOut = true; child.kill("SIGTERM"); }, input.executor.timeoutMs);
    const abort = () => { canceled = true; child.kill("SIGTERM"); };
    signal?.addEventListener("abort", abort, { once: true });
    child.once("error", reject);
    child.once("close", (exitCode) => {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
      resolve({ exitCode, stdout, stderr, timedOut, canceled });
    });
  });
}

async function observeOutputFile(resultPath?: string): Promise<RemoteOutputFileObservation> {
  if (!resultPath) return { state: "NOT_REQUESTED" };
  try {
    return { state: "READ", content: await readFile(resultPath, "utf8") };
  } catch (error: any) {
    return error?.code === "ENOENT"
      ? { state: "ABSENT" }
      : { state: "READ_ERROR", error: redactSandboxText(error instanceof Error ? error.message : String(error)) };
  }
}

export async function atomicWriteFile(outputPath: string, content: Buffer) {
  const directory = path.dirname(outputPath);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const temporaryPath = `${outputPath}.tmp-${process.pid}-${Date.now()}`;
  let handle;
  try {
    handle = await open(temporaryPath, "wx", 0o600);
    await handle.writeFile(content);
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporaryPath, outputPath);
    const directoryHandle = await open(directory, "r");
    try { await directoryHandle.sync(); } finally { await directoryHandle.close(); }
  } finally {
    if (handle) await handle.close().catch(() => undefined);
    await unlink(temporaryPath).catch(() => undefined);
  }
}

function harnessIdentity(manifest: any): SandboxResultBundle["harness"] {
  const route = supervisorModelRoute(manifest);
  return {
    adapter: manifest.harness.adapter,
    version: manifest.harness.version,
    harnessId: manifest.harness.harnessId,
    harnessVersion: manifest.harness.harnessVersion,
    provider: route?.provider ?? "",
    model: route?.model ?? "",
    ...(route?.modelRouteDigest === undefined ? {} : {
      modelRouteDigest: route.modelRouteDigest,
      providerRoute: route.providerRoute,
      ...(route.reasoningConfig === undefined ? {} : { reasoningConfig: structuredClone(route.reasoningConfig) }),
    }),
  };
}

function supervisorExecutionBackend(manifest: any) {
  return decomposedManifest(manifest)
    ? manifest?.executionBackend
    : manifest?.harness?.executionBackend;
}

function supervisorModelRoute(manifest: any):  | {
  provider: string;
  model: string;
  modelRouteDigest?: string;
  providerRoute?: string;
  reasoningConfig?: SandboxResultBundle["harness"]["reasoningConfig"];
} | undefined {
  const provider = decomposedManifest(manifest)
    ? manifest?.modelRoute?.routeSnapshot?.provider
    : manifest?.harness?.provider;
  const model = decomposedManifest(manifest)
    ? manifest?.modelRoute?.routeSnapshot?.modelId
    : manifest?.harness?.model;
  if (!boundedIdentity(provider, 100) || !boundedIdentity(model, 200)) return undefined;
  if (!decomposedManifest(manifest)) return { provider, model };
  const modelRouteDigest = manifest?.modelRoute?.routeDigest;
  const providerRoute = manifest?.modelRoute?.routeSnapshot?.providerRoute;
  if (!/^sha256:[a-f0-9]{64}$/i.test(modelRouteDigest ?? "") || !boundedIdentity(providerRoute, 100)) return undefined;
  const reasoningConfig = manifest?.modelRoute?.routeSnapshot?.reasoningConfig;
  return {
    provider,
    model,
    modelRouteDigest,
    providerRoute,
    ...(reasoningConfig === undefined ? {} : { reasoningConfig: structuredClone(reasoningConfig) }),
  };
}

function validV2SupervisorBindings(
  manifest: any,
  executor: SandboxSupervisorInput["executor"],
  environment: Record<string, string>,
) {
  const harness = manifest?.harness;
  const route = manifest?.modelRoute?.routeSnapshot;
  const capabilityManifest = harness?.capabilityManifest;
  if (!harness || !validV2SupervisorRoute(route)
    || harness.provider !== undefined
    || harness.model !== undefined
    || harness.executionBackend !== undefined
    || manifest.modelRoute.routeDigest !== `sha256:${canonicalHash({ namespace: "factory-model-route/v2", value: route })}`
    || !/^[a-f0-9]{40}$/i.test(harness.harnessCommit ?? "")
    || !capabilityManifest
    || capabilityManifest?.identity?.adapterId !== harness.adapter
    || capabilityManifest?.identity?.adapterVersion !== harness.version
    || capabilityManifest?.identity?.harnessId !== harness.harnessId
    || capabilityManifest?.identity?.harnessVersion !== harness.harnessVersion
    || capabilityManifest?.identity?.harnessCommit !== harness.harnessCommit
    || harnessCapabilityManifestDigest(capabilityManifest) !== harness.capabilityManifestSha256
    || capabilityManifest?.effectiveConfigSha256 !== harness.effectiveConfigSha256
    || harnessRuntimeArtifactIssues(harness.runtimeArtifact).length > 0
    || harnessRuntimeArtifactDigest(harness.runtimeArtifact) !== harness.runtimeArtifactDigest) return false;
  const qualification = manifest.modelRoute.qualificationSnapshot;
  const compatibility = qualification?.compatibility;
  const exactRouteMatches = executor.provider === route.provider
    && executor.model === route.modelId
    && executor.modelRouteDigest === manifest.modelRoute.routeDigest
    && executor.providerRoute === route.providerRoute
    &&  (harness.adapter === "codex" && harness.version === "bedrock-v1"
      ? manifest.version === "factory-execution-manifest/v3" &&
        route.provider === "aws-bedrock" &&
        route.modelId === "anthropic.claude-sonnet-4-6" &&
        /^bedrock-us:[a-f0-9]{64}$/.test(route.providerRoute) &&
        Object.keys(environment).length === 0 &&
        manifest.sandbox?.profileSnapshot?.provider === "DOCKER" &&
        manifest.retryPolicy?.maxAttempts === 1
      : route.providerRoute === "openrouter"
    && environment.OPENAI_BASE_URL === "https://openrouter.ai/api/v1"
     ) && canonicalHash(executor.reasoningConfig ?? null) === canonicalHash(route.reasoningConfig ?? null);
  return  ( exactRouteMatches
    && qualification?.schema === "factory-model-route-qualification/v2"
    && qualification.routeDigest === manifest.modelRoute.routeDigest
    && manifest.modelRoute.qualificationDigest === `sha256:${canonicalHash({ namespace: "factory-model-route-qualification/v2", value: qualification })}`
    && compatibility?.adapter === harness.adapter
    && compatibility?.version === harness.version
    && compatibility?.capabilityManifestDigest === harness.capabilityManifestSha256
    && compatibility?.effectiveConfigSha256 === harness.effectiveConfigSha256
    && compatibility?.runtimeArtifactDigest === harness.runtimeArtifactDigest
    && compatibility?.executionBackend === manifest.executionBackend
    && qualification.authority?.executionOnly === true
    && qualification.authority?.routing === false
    && qualification.authority?.verification === false
    && qualification.authority?.acceptance === false
    && qualification.authority?.publication === false
    && qualification.authority?.merge === false ) ;
}

/** V3 is the V2 decomposed execution tuple plus one exact, qualified profile
 * receipt. This is pure so the host runtime can apply the same pre-allocation
 * guard before uploading the standalone supervisor. */
export function validV3ExecutionProfileBinding(manifest: any, profileAdmittedAt: unknown) {
  if (manifest?.version !== "factory-execution-manifest/v3") return false;
  if (!Number.isSafeInteger(profileAdmittedAt) || (profileAdmittedAt as number) < 0) return false;
  const binding = manifest.executionProfile;
  if (!binding || typeof binding !== "object" || Array.isArray(binding)
    || Object.keys(binding).some((key) => ![
      "profileId",
      "profileKey",
      "version",
      "profileDigest",
      "profileSnapshot",
      "qualificationDigest",
      "qualificationSnapshot",
    ].includes(key))
    || !boundedIdentity(binding.profileId, 200)
    || !boundedIdentity(binding.profileKey, 100)
    || !Number.isSafeInteger(binding.version)
    || binding.version < 1
    || !/^sha256:[a-f0-9]{64}$/.test(binding.profileDigest ?? "")
    || !/^sha256:[a-f0-9]{64}$/.test(binding.qualificationDigest ?? "")
    || executionProfileIssues(binding.profileSnapshot).length > 0
    || executionProfileQualificationIssues(binding.qualificationSnapshot).length > 0) return false;

  let profileDigest: string;
  let qualificationDigest: string;
  try {
    profileDigest = executionProfileDigest(binding.profileSnapshot);
    qualificationDigest = executionProfileQualificationDigest(binding.qualificationSnapshot);
  } catch {
    return false;
  }
  const profile = binding.profileSnapshot as Record<string, any>;
  const qualification = binding.qualificationSnapshot as Record<string, any>;
  if (profileDigest !== binding.profileDigest
    || qualificationDigest !== binding.qualificationDigest
    || binding.profileKey !== profile.profileKey
    || binding.version !== profile.version
    || !Number.isFinite(qualification.approvedAt)
    || qualification.approvedAt > (profileAdmittedAt as number)
    || !Number.isFinite(qualification.validUntil)
    || qualification.validUntil <= (profileAdmittedAt as number)
    || !executionProfileQualificationMatches({
      profileId: binding.profileId,
      profileSnapshot: profile,
      profileDigest: binding.profileDigest,
      qualificationSnapshot: qualification,
    })) return false;

  const harness = manifest.harness;
  const sandbox = manifest.sandbox;
  const selectedIsolation = harness?.isolation;
  const expectedHarnessRequirements = selectedExecutionHarnessRequirements(selectedIsolation);
  const expectedSandboxCapabilities = selectedExecutionSandboxCapabilities(
    manifest.executionBackend,
    selectedIsolation,
    profile.sandboxProfile?.profileSnapshot,
  );
  const projection: ExecutionProfileProjection = {
    profileId: binding.profileId,
    profileKey: binding.profileKey,
    profileVersion: binding.version,
    profileDigest: binding.profileDigest,
    profileSnapshot: profile,
    qualificationDigest: binding.qualificationDigest,
    qualificationSnapshot: qualification,
    executor: { adapter: harness?.adapter, version: harness?.version },
    harnessCapabilityManifest: harness?.capabilityManifest,
    harnessCapabilityManifestDigest: harness?.capabilityManifestSha256,
    harnessEffectiveConfigSha256: harness?.effectiveConfigSha256,
    harnessRuntimeArtifact: harness?.runtimeArtifact,
    harnessRuntimeArtifactDigest: harness?.runtimeArtifactDigest,
    executionBackend: manifest.executionBackend,
    modelCatalogId: manifest.modelRoute?.catalogId,
    modelRouteSnapshot: manifest.modelRoute?.routeSnapshot,
    modelRouteDigest: manifest.modelRoute?.routeDigest,
    modelQualificationSnapshot: manifest.modelRoute?.qualificationSnapshot,
    modelQualificationDigest: manifest.modelRoute?.qualificationDigest,
    ...(sandbox?.profileId ? { sandboxProfileId: sandbox.profileId } : {}),
    ...(sandbox?.profileSnapshot !== undefined ? { sandboxProfileSnapshot: sandbox.profileSnapshot } : {}),
    ...(sandbox?.profileDigest ? { sandboxProfileDigest: sandbox.profileDigest } : {}),
    isolationModes: profile.isolationModes,
    requiredHarnessCapabilities: profile.requiredHarnessCapabilities,
    requiredSandboxCapabilities: profile.requiredSandboxCapabilities,
  };
  return  ( executionProfileProjectionBlockers({
    profileId: binding.profileId,
    profileSnapshot: profile,
    profileDigest: binding.profileDigest,
    qualificationSnapshot: qualification,
    qualificationDigest: binding.qualificationDigest,
    projection,
  }).length === 0
    && profile.executionBackend === "remote-sandbox"
    && profile.sandboxProfile !== undefined
    && profile.isolationModes.includes(selectedIsolation)
    && sameHarnessRequirements(harness?.requiredHarnessCapabilities, expectedHarnessRequirements)
    && selectedHarnessRequirementsAllowed(
      profile.requiredHarnessCapabilities,
      expectedHarnessRequirements,
    )
    && sameStringSet(harness?.requiredCapabilities, expectedSandboxCapabilities)
    && selectedSandboxCapabilitiesAllowed(
      profile.requiredSandboxCapabilities,
      expectedSandboxCapabilities,
    ) ) ;
}

function decomposedManifest(manifest: any) {
  return  ( manifest?.version === "factory-execution-manifest/v2"
    || manifest?.version === "factory-execution-manifest/v3" ) ;
}

function selectedHarnessRequirementsAllowed(allowed: unknown, selected: unknown) {
  return  ( Array.isArray(allowed)
    && Array.isArray(selected)
    && selected.length > 0
    && selected.every((requirement) => allowed.some((candidate) =>
      candidate?.capability === requirement?.capability
      && candidate?.minimumSupport === requirement?.minimumSupport
     ) ));
}

function selectedExecutionHarnessRequirements(isolation: unknown) {
  if (isolation !== "READ_ONLY" && isolation !== "WORKSPACE_WRITE") return [];
  return [
    { capability: "filesystem.read", minimumSupport: "SUPPORTED" },
    ...(isolation === "WORKSPACE_WRITE"
      ? [{ capability: "filesystem.write", minimumSupport: "SUPPORTED" }]
      : []),
    { capability: "filesystem.pathAllowlist", minimumSupport: "PARTIAL" },
    { capability: "shell.available", minimumSupport: "PARTIAL" },
    { capability: "shell.processTreeCancellation", minimumSupport: "PARTIAL" },
    { capability: "git.status", minimumSupport: "SUPPORTED" },
    { capability: "git.diff", minimumSupport: "SUPPORTED" },
    { capability: "tools.structuredOutput", minimumSupport: "PARTIAL" },
    { capability: "headless.support", minimumSupport: "PARTIAL" },
    { capability: "cancellation.support", minimumSupport: "PARTIAL" },
  ];
}

function selectedExecutionSandboxCapabilities(
  executionBackend: unknown,
  isolation: unknown,
  sandboxProfileSnapshot: unknown,
) {
  if (isolation !== "READ_ONLY" && isolation !== "WORKSPACE_WRITE") return [];
  const capabilities = ["git-worktree", isolation === "READ_ONLY" ? "read-only" : "workspace-write"];
  if (executionBackend === "remote-sandbox") {
    const provider = (sandboxProfileSnapshot as Record<string, any> | undefined)?.provider;
    capabilities.push("remote-sandbox", `sandbox-provider:${String(provider ?? "").toLowerCase().replace(/_/g, "-")}`);
  }
  return capabilities.sort();
}

function sameHarnessRequirements(left: unknown, right: unknown) {
  if (!Array.isArray(left) || !Array.isArray(right)) return false;
  const normalize = (requirements: any[]) => requirements
    .map((requirement) => `${requirement?.capability}:${requirement?.minimumSupport}`)
    .sort();
  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));
}

function sameStringSet(left: unknown, right: unknown) {
  return  ( Array.isArray(left)
    && Array.isArray(right)
    && left.every((item) => typeof item === "string")
    && right.every((item) => typeof item === "string")
    && JSON.stringify([...left].sort()) === JSON.stringify([...right].sort()) ) ;
}

function selectedSandboxCapabilitiesAllowed(allowed: unknown, selected: unknown) {
  return  ( Array.isArray(allowed)
    && Array.isArray(selected)
    && selected.length > 0
    && selected.every((capability) => typeof capability === "string" && allowed.includes(capability ) ));
}

function validV2SupervisorRoute(route: any) {
  if (!route || route.schema !== "factory-model-route/v2"
    || Object.keys(route).some((key) => !["schema", "provider", "providerRoute", "modelId", "reasoningConfig"].includes(key))
    || Object.hasOwn(route, "capabilityIdentity")
    || Object.hasOwn(route, "runtimeIdentity")
    || !boundedIdentity(route.provider, 100)
    || route.provider !== route.provider.toLowerCase()
    || !boundedIdentity(route.providerRoute, 100)
    || route.providerRoute !== route.providerRoute.toLowerCase()
    || !boundedIdentity(route.modelId, 200)) return false;
  if (route.reasoningConfig === undefined) return true;
  const reasoning = route.reasoningConfig;
  return  ( reasoning && typeof reasoning === "object" && !Array.isArray(reasoning)
    && Object.keys(reasoning).length > 0
    && Object.keys(reasoning).every((key) => ["effort", "temperature", "maxTokens"].includes(key))
    && (reasoning.effort === undefined || (boundedIdentity(reasoning.effort, 64) && reasoning.effort === reasoning.effort.toLowerCase()))
    && (reasoning.temperature === undefined || (typeof reasoning.temperature === "number" && Number.isFinite(reasoning.temperature) && reasoning.temperature >= 0 && reasoning.temperature <= 2))
    && (reasoning.maxTokens === undefined || (Number.isSafeInteger(reasoning.maxTokens) && reasoning.maxTokens >= 1 && reasoning.maxTokens <= 10_000_000)) ) ;
}

function boundedIdentity(value: unknown, maximum: number): value is string {
  return  ( typeof value === "string" && value === value.trim() && value.length > 0
    && value.length <= maximum && !/[\0\r\n]/.test(value ) );
}

function codexUsage(stdout: string) {
  let inputTokens: number | null = null;
  let outputTokens: number | null = null;
  for (const line of stdout.split("\n")) {
    try {
      const event = JSON.parse(line);
      if (event?.type !== "turn.completed" || !event.usage) continue;
      const observedInput = event.usage.input_tokens ?? event.usage.inputTokens;
      const observedOutput = event.usage.output_tokens ?? event.usage.outputTokens;
      inputTokens = Number.isSafeInteger(observedInput) && observedInput >= 0 ? observedInput : null;
      outputTokens = Number.isSafeInteger(observedOutput) && observedOutput >= 0 ? observedOutput : null;
    } catch {
      // Malformed JSONL is classified by result reconstruction; usage stays null.
    }
  }
  return { inputTokens, outputTokens };
}
