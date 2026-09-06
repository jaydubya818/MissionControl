import { canonicalDigest } from "@mission-control/shared";
import { SANDBOX_RESULT_SCHEMA } from "./sandboxProvider.js";
import type { RemoteFailure } from "./remoteExecutionPolicy.js";
import {
  factoryResultContextIssues,
  type FactoryResultV1,
  type RemoteResultProvenance,
} from "./remoteStructuredResult.js";

export const MAX_SANDBOX_RESULT_BYTES = 10 * 1024 * 1024;
export const MAX_SANDBOX_PATCH_BYTES = 8 * 1024 * 1024;

export interface SandboxResultBundle {
  schema: typeof SANDBOX_RESULT_SCHEMA;
  attemptId: string;
  workOrderId: string;
  workOrderRevisionNumber: number;
  workflowRunId: string;
  manifestDigest: string;
  profileDigest: string;
  sourceSha: string;
  candidateSha?: string;
  supervisorVersion: string;
  harness: {
    adapter: string;
    version: string;
    harnessId: string;
    harnessVersion: string;
    provider: string;
    model: string;
    /** Additive exact-route provenance. Legacy V1 bundles omit these fields. */
    modelRouteDigest?: string;
    providerRoute?: string;
    reasoningConfig?: {
      effort?: string;
      temperature?: number;
      maxTokens?: number;
    };
  };
  environment: {
    provider: "EXE_DEV" | "FAKE" | "DOCKER";
    image: string;
  };
  startedAt: number;
  finishedAt: number;
  status: "COMPLETED" | "FAILED" | "CANCELED" | "TIMED_OUT";
  resultProvenance: RemoteResultProvenance & {
    context: {
      attemptId: string;
      manifestDigest: string;
      sourceSha: string;
    };
  };
  failure?: RemoteFailure;
  structuredResult: FactoryResultV1;
  changedFiles: string[];
  diff: {
    filesChanged: number;
    linesAdded?: number;
    linesDeleted?: number;
  };
  commandResults: Array<{
    commandClass: "EXECUTOR" | "TEST" | "BUILD" | "LINT" | "OTHER";
    exitCode: number | null;
    durationMs: number;
    timedOut: boolean;
  }>;
  verificationInputs: { reportedCommands: string[] };
  artifacts: Array<{ name: string; digest: string; mediaType?: string }>;
  events: Array<{ type: string; occurredAt: number }>;
  patch: {
    format: "GIT_BINARY_DIFF";
    encoding: "BASE64";
    byteLength: number;
    digest: string;
    content: string;
  };
  executor: {
    exitCode: number | null;
    stdoutDigest: string;
    stderrDigest: string;
    stdoutTail: string;
    stderrTail: string;
    resultOutput?: {
      state: RemoteResultProvenance["outputFile"]["state"];
      byteLength: number | null;
      digest: string | null;
      tail: string;
      validationIssues: string[];
    };
  };
  usage: {
    providerCostUsd: number | null;
    inferenceCostUsd: number | null;
    inputTokens: number | null;
    outputTokens: number | null;
    providerRuntimeMs: number;
    observedAt: number;
    enforcement: "PROVIDER_REPORTED" | "OBSERVATION_ONLY";
  };
  digest: string;
}

type BundleWithoutDigest = Omit<SandboxResultBundle, "digest">;

export function createSandboxResultBundle(input: BundleWithoutDigest): SandboxResultBundle {
  const normalized = normalizeBundle(input);
  return { ...normalized, digest: sandboxResultDigest(normalized) };
}

export function sandboxResultDigest(input: BundleWithoutDigest) {
  return canonicalDigest("factory-sandbox-result/v1", input);
}

export function encodeSandboxResultBundle(bundle: SandboxResultBundle) {
  return Buffer.from(JSON.stringify(bundle), "utf8");
}

export function parseAndValidateSandboxResultBundle(
  payload: Buffer,
  expected: {
    attemptId: string;
    workOrderId: string;
    workOrderRevisionNumber: number;
    workflowRunId: string;
    manifestDigest: string;
    profileDigest: string;
    sourceSha: string;
    supervisorVersion: string;
    harness: SandboxResultBundle["harness"];
    acceptanceCriterionIds: string[];
    environment: SandboxResultBundle["environment"];
    maxRuntimeMs: number;
  },
): SandboxResultBundle {
  if (payload.byteLength > MAX_SANDBOX_RESULT_BYTES) throw new Error("Sandbox result bundle exceeds the 10 MB control-plane limit.");
  let candidate: unknown;
  try {
    candidate = JSON.parse(payload.toString("utf8"));
  } catch {
    throw new Error("Sandbox result bundle is not valid JSON.");
  }
  const bundle = assertBundleShape(candidate);
  if (bundle.attemptId !== expected.attemptId || bundle.workflowRunId !== expected.workflowRunId) throw new Error("Sandbox result Attempt identity does not match the lease owner.");
  if (bundle.workOrderId !== expected.workOrderId || bundle.workOrderRevisionNumber !== expected.workOrderRevisionNumber) throw new Error("Sandbox result WorkOrder revision does not match the frozen Attempt.");
  if (bundle.manifestDigest !== expected.manifestDigest || bundle.profileDigest !== expected.profileDigest) throw new Error("Sandbox result is not bound to the frozen manifest and profile.");
  if (bundle.sourceSha !== expected.sourceSha) throw new Error("Sandbox result source SHA does not match the frozen source revision.");
  if (bundle.supervisorVersion !== expected.supervisorVersion
    || bundle.harness.adapter !== expected.harness.adapter
    || bundle.harness.version !== expected.harness.version
    || bundle.harness.harnessId !== expected.harness.harnessId
    || bundle.harness.harnessVersion !== expected.harness.harnessVersion
    || bundle.harness.provider !== expected.harness.provider
    || bundle.harness.model !== expected.harness.model
    || bundle.harness.modelRouteDigest !== expected.harness.modelRouteDigest
    || bundle.harness.providerRoute !== expected.harness.providerRoute
    || canonicalDigest("factory-model-route-reasoning/v1", bundle.harness.reasoningConfig ?? null)
      !== canonicalDigest("factory-model-route-reasoning/v1", expected.harness.reasoningConfig ?? null)
    || bundle.environment.provider !== expected.environment.provider
    || bundle.environment.image !== expected.environment.image) {
    throw new Error("Sandbox result environment does not match the frozen supervisor and profile.");
  }
  if (bundle.resultProvenance.context.attemptId !== expected.attemptId
    || bundle.resultProvenance.context.manifestDigest !== expected.manifestDigest
    || bundle.resultProvenance.context.sourceSha !== expected.sourceSha) {
    throw new Error("Sandbox result reconstruction context does not match the frozen Attempt.");
  }
  if (bundle.status === "COMPLETED"
    && factoryResultContextIssues(bundle.structuredResult, expected.acceptanceCriterionIds).length > 0) {
    throw new Error("Sandbox result acceptance-criterion accounting does not match the frozen WorkOrder.");
  }
  if (bundle.finishedAt - bundle.startedAt > expected.maxRuntimeMs || bundle.usage.providerRuntimeMs > expected.maxRuntimeMs) {
    throw new Error("Sandbox result exceeds the frozen runtime boundary.");
  }
  const { digest, ...withoutDigest } = bundle;
  if (digest !== sandboxResultDigest(withoutDigest)) throw new Error("Sandbox result bundle digest is invalid.");
  const patch = Buffer.from(bundle.patch.content, "base64");
  if (patch.byteLength !== bundle.patch.byteLength || patch.byteLength > MAX_SANDBOX_PATCH_BYTES) throw new Error("Sandbox result patch length is invalid.");
  if (canonicalDigest("factory-sandbox-patch/v1", patch.toString("base64")) !== bundle.patch.digest) throw new Error("Sandbox result patch digest is invalid.");
  return bundle;
}

export function createPatchDescriptor(patch: Buffer): SandboxResultBundle["patch"] {
  if (patch.byteLength > MAX_SANDBOX_PATCH_BYTES) throw new Error("Sandbox patch exceeds the 8 MB limit.");
  const content = patch.toString("base64");
  return {
    format: "GIT_BINARY_DIFF",
    encoding: "BASE64",
    byteLength: patch.byteLength,
    digest: canonicalDigest("factory-sandbox-patch/v1", content),
    content,
  };
}

function normalizeBundle(input: BundleWithoutDigest): BundleWithoutDigest {
  return {
    ...input,
    executor: {
      ...input.executor,
      stdoutTail: input.executor.stdoutTail.slice(-16_000),
      stderrTail: input.executor.stderrTail.slice(-16_000),
    },
  };
}

function assertBundleShape(candidate: any): SandboxResultBundle {
  const structured = candidate?.structuredResult;
  const stringArrays = [
    "completedAcceptanceCriterionIds", "incompleteAcceptanceCriterionIds", "unknownAcceptanceCriterionIds",
    "verificationCommands", "knownRisks",
  ];
  const exactRoutePresent = candidate?.harness?.modelRouteDigest !== undefined
    || candidate?.harness?.providerRoute !== undefined
    || candidate?.harness?.reasoningConfig !== undefined;
  if (!candidate || typeof candidate !== "object"
    || candidate.schema !== SANDBOX_RESULT_SCHEMA
    || typeof candidate.digest !== "string" || !candidate.digest.startsWith("sha256:")
    || ["attemptId", "workOrderId", "workflowRunId", "manifestDigest", "profileDigest", "sourceSha", "supervisorVersion"].some((field) => typeof candidate[field] !== "string" || !candidate[field])
    || !Number.isSafeInteger(candidate.workOrderRevisionNumber) || candidate.workOrderRevisionNumber < 1
    || (candidate.candidateSha !== undefined && (typeof candidate.candidateSha !== "string" || !/^[a-f0-9]{40,64}$/i.test(candidate.candidateSha)))
    || ["adapter", "version", "harnessId", "harnessVersion", "provider", "model"].some((field) => typeof candidate.harness?.[field] !== "string" || !candidate.harness[field])
    || (exactRoutePresent && (!/^sha256:[a-f0-9]{64}$/i.test(candidate.harness?.modelRouteDigest ?? "")
      || typeof candidate.harness?.providerRoute !== "string"
      || !boundedLowercaseIdentity(candidate.harness.providerRoute, 100)
      || !validReasoningConfig(candidate.harness?.reasoningConfig)))
    || !["EXE_DEV", "FAKE", "DOCKER"].includes(candidate.environment?.provider) || typeof candidate.environment?.image !== "string" || !candidate.environment.image
    || !Number.isFinite(candidate.startedAt) || !Number.isFinite(candidate.finishedAt) || candidate.finishedAt < candidate.startedAt
    || !["COMPLETED", "FAILED", "CANCELED", "TIMED_OUT"].includes(candidate.status)
    || !["OUTPUT_FILE", "EXECUTOR_STDOUT", "CODEX_JSONL_RECONSTRUCTION", "NONE"].includes(candidate.resultProvenance?.source)
    || !["NOT_REQUESTED", "ABSENT", "EMPTY", "TRUNCATED", "INVALID_JSON", "SCHEMA_INVALID", "TOO_LARGE", "READ_ERROR", "VALID"].includes(candidate.resultProvenance?.outputFile?.state)
    || (candidate.resultProvenance?.outputFile?.byteLength !== null
      && (!Number.isSafeInteger(candidate.resultProvenance?.outputFile?.byteLength) || candidate.resultProvenance.outputFile.byteLength < 0))
    || ["byteLength", "lineCount", "malformedLineCount", "terminalCompletedCount", "terminalFailureCount", "validCandidateCount"]
      .some((field) => !Number.isSafeInteger(candidate.resultProvenance?.jsonl?.[field]) || candidate.resultProvenance.jsonl[field] < 0)
    || typeof candidate.resultProvenance?.context?.attemptId !== "string"
    || typeof candidate.resultProvenance?.context?.manifestDigest !== "string"
    || typeof candidate.resultProvenance?.context?.sourceSha !== "string"
    || (candidate.failure !== undefined && (!candidate.failure
      || !["RETRYABLE_INFRA", "RETRYABLE_EXECUTION", "NON_RETRYABLE_RESULT", "UNKNOWN"].includes(candidate.failure.class)
      || typeof candidate.failure.code !== "string" || !candidate.failure.code
      || typeof candidate.failure.stage !== "string" || !candidate.failure.stage
      || typeof candidate.failure.retryable !== "boolean"
      || typeof candidate.failure.summary !== "string" || candidate.failure.summary.length > 1_000
      || candidate.failure.retryable !== ["RETRYABLE_INFRA", "RETRYABLE_EXECUTION"].includes(candidate.failure.class)))
    || structured?.schema !== "factory-result/v1"
    || !["COMPLETED", "BLOCKED", "FAILED"].includes(structured?.status)
    || typeof structured?.summary !== "string" || !structured.summary.trim()
    || typeof structured?.nextAction !== "string"
    || stringArrays.some((field) => !Array.isArray(structured?.[field]) || structured[field].some((item: unknown) => typeof item !== "string"))
    || !Array.isArray(candidate.changedFiles) || candidate.changedFiles.some((item: unknown) => typeof item !== "string" || !item)
    || !Number.isSafeInteger(candidate.diff?.filesChanged) || candidate.diff.filesChanged !== candidate.changedFiles.length
    || [candidate.diff?.linesAdded, candidate.diff?.linesDeleted].some((value) => value !== undefined && (!Number.isSafeInteger(value) || value < 0))
    || !Array.isArray(candidate.commandResults) || candidate.commandResults.some((result: any) => !["EXECUTOR", "TEST", "BUILD", "LINT", "OTHER"].includes(result?.commandClass) || !Number.isFinite(result?.durationMs) || typeof result?.timedOut !== "boolean")
    || !Array.isArray(candidate.verificationInputs?.reportedCommands) || candidate.verificationInputs.reportedCommands.some((item: unknown) => typeof item !== "string")
    || !Array.isArray(candidate.artifacts) || candidate.artifacts.some((artifact: any) => typeof artifact?.name !== "string" || typeof artifact?.digest !== "string")
    || !Array.isArray(candidate.events) || candidate.events.some((event: any) => typeof event?.type !== "string" || !Number.isFinite(event?.occurredAt))
    || candidate.patch?.format !== "GIT_BINARY_DIFF" || candidate.patch?.encoding !== "BASE64"
    || typeof candidate.patch?.content !== "string" || typeof candidate.patch?.digest !== "string" || !Number.isSafeInteger(candidate.patch?.byteLength)
    || typeof candidate.executor?.stdoutDigest !== "string" || typeof candidate.executor?.stderrDigest !== "string"
    || typeof candidate.executor?.stdoutTail !== "string" || typeof candidate.executor?.stderrTail !== "string"
    || (candidate.executor?.resultOutput !== undefined && (
      !candidate.executor.resultOutput
      || !["NOT_REQUESTED", "ABSENT", "EMPTY", "TRUNCATED", "INVALID_JSON", "SCHEMA_INVALID", "TOO_LARGE", "READ_ERROR", "VALID"].includes(candidate.executor.resultOutput.state)
      || (candidate.executor.resultOutput.byteLength !== null && (!Number.isSafeInteger(candidate.executor.resultOutput.byteLength) || candidate.executor.resultOutput.byteLength < 0))
      || (candidate.executor.resultOutput.digest !== null && (typeof candidate.executor.resultOutput.digest !== "string" || !candidate.executor.resultOutput.digest.startsWith("sha256:")))
      || typeof candidate.executor.resultOutput.tail !== "string" || candidate.executor.resultOutput.tail.length > 4_000
      || !Array.isArray(candidate.executor.resultOutput.validationIssues)
      || candidate.executor.resultOutput.validationIssues.some((issue: unknown) => typeof issue !== "string" || issue.length > 500)
    ))
    || !Number.isFinite(candidate.usage?.observedAt) || !Number.isFinite(candidate.usage?.providerRuntimeMs) || candidate.usage.providerRuntimeMs < 0
    || [candidate.usage?.providerCostUsd, candidate.usage?.inferenceCostUsd].some((value) => value !== null && (!Number.isFinite(value) || value < 0))
    || [candidate.usage?.inputTokens, candidate.usage?.outputTokens].some((value) => value !== null && (!Number.isSafeInteger(value) || value < 0))
    || !["PROVIDER_REPORTED", "OBSERVATION_ONLY"].includes(candidate.usage?.enforcement)) {
    throw new Error("Sandbox result bundle failed schema validation.");
  }
  if (candidate.status === "COMPLETED") {
    if (candidate.failure !== undefined
      || candidate.resultProvenance.source === "NONE"
      || structured.status !== "COMPLETED"
      || candidate.executor?.exitCode !== 0
      || candidate.commandResults.some((result: any) => result.timedOut)) {
      throw new Error("Completed sandbox result does not have one accepted terminal factory-result/v1.");
    }
  } else if (!candidate.failure) {
    throw new Error("Failed sandbox result is missing its typed failure decision.");
  }
  return candidate as SandboxResultBundle;
}

function validReasoningConfig(reasoning: unknown) {
  if (reasoning === undefined) return true;
  if (!reasoning || typeof reasoning !== "object" || Array.isArray(reasoning)) return false;
  const value = reasoning as Record<string, unknown>;
  const keys = Object.keys(value);
  return keys.length > 0
    && keys.every((key) => ["effort", "temperature", "maxTokens"].includes(key))
    && (value.effort === undefined || boundedLowercaseIdentity(value.effort, 64))
    && (value.temperature === undefined || (typeof value.temperature === "number" && Number.isFinite(value.temperature) && value.temperature >= 0 && value.temperature <= 2))
    && (value.maxTokens === undefined || (Number.isSafeInteger(value.maxTokens) && (value.maxTokens as number) >= 1 && (value.maxTokens as number) <= 10_000_000));
}

function boundedLowercaseIdentity(value: unknown, maximum: number): value is string {
  return typeof value === "string"
    && value === value.trim()
    && value === value.toLowerCase()
    && value.length > 0
    && value.length <= maximum
    && !/[\0\r\n]/.test(value);
}
