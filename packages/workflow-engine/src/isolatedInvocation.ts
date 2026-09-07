import { renderMarkdownWorkloadIssues, renderMarkdownCandidate, type RenderMarkdownWorkload, type DeterministicCandidateFile } from "./deterministicWorkload.js";
import { canonicalHash } from "@mission-control/shared";
import { VERIFY_DOCUMENT_OPERATION, verifyDocumentWorkloadIssues, verifyDocumentBytes, type VerifyDocumentWorkload } from "./deterministicVerification.js";

export const INVOCATION_SCHEMA = "factory-isolated-invocation/v2" as const;
export const INVOCATION_RESULT_SCHEMA = "factory-isolated-result/v2" as const;
export const COMPOSITION_SCHEMA = "factory-invocation-composition/v1" as const;

/** Exact subordinate binding; this is not an admission or qualification receipt. */
export interface InvocationComposition {
  schema: typeof COMPOSITION_SCHEMA;
  profileClass: "isolated-offline-control/v1";
  bridge: { id: string; version: string; digest: string };
  backend: { id: string; version: string; digest: string };
  runtimeImage: string;
  isolationDigest: string;
  invocationSchema: typeof INVOCATION_SCHEMA;
  resultSchema: typeof INVOCATION_RESULT_SCHEMA;
}

export interface IsolatedInvocation {
  schema: typeof INVOCATION_SCHEMA;
  resultSchema: typeof INVOCATION_RESULT_SCHEMA;
  executionId: string;
  attemptId: string;
  workOrderId: string;
  taskId: string;
  plan: { id: string; version: number; digest: string };
  factoryVersion: { id: string; configurationDigest: string };
  budgetReservationId: string;
  correlationId: string;
  profileId: string;
  profileDigest: string;
  executionManifestDigest: string;
  composition: InvocationComposition;
  compositionDigest: string;
  lease: { leaseId: string; ownerId: string; workerId: string; sessionId: string; generation: number };
  workload: { reference: "synthetic-receipt/v1"; digest: string } | RenderMarkdownWorkload | VerifyDocumentWorkload;
  capabilities: ["synthetic-receipt"] | ["render-markdown"] | ["verify-document-bytes"];
  limits: { timeoutMs: number; budgetReference: "offline-zero-provider-calls/v1" };
  transmission: "NONE";
  modelRoute: "NONE";
}

export type InvocationStatus = "SUCCESS" | "WORKLOAD_FAILURE" | "INFRASTRUCTURE_FAILURE"
  | "POLICY_DENIED" | "BUDGET_DENIED" | "CANCELED" | "TIMED_OUT" | "STALE" | "INVALID_REQUEST" | "UNSUPPORTED_CAPABILITY";

export interface IsolatedInvocationResult {
  schema: typeof INVOCATION_RESULT_SCHEMA;
  executionId: string;
  attemptId: string;
  correlationId: string;
  requestDigest: string;
  compositionDigest: string;
  status: InvocationStatus;
  startedAt: number;
  completedAt: number;
  summary: string;
  evidenceOrigin: "CONTROL_FIXTURE";
  behavioralPass: false;
  providerCalls: 0;
  resultDigest: string | null;
  candidateFiles: DeterministicCandidateFile[];
}

export function invocationDigest(value: unknown): string {
  return `sha256:${canonicalHash(value)}`;
}

/** Derive transport data exclusively from a frozen canonical Attempt and its
 * claimed lease. This does not qualify, claim, renew or execute an Attempt. */
export function canonicalIsolatedInvocation(attempt: {
  _id: string; runId: string; workOrderId: string; parentTaskId: string;
  executionProfileId: string; executionProfileDigest: string; executionManifestDigest: string;
  executionManifest: any;
  lease: { leaseId: string; ownerId: string; workerId: string; workerSessionId: string; workerGeneration: number };
}): IsolatedInvocation {
  const manifest = attempt.executionManifest;
  const profile = manifest?.executionProfile?.profileSnapshot;
  const policy = profile?.offlinePolicy;
  if (manifest?.version !== "factory-execution-manifest/v4" || manifest.executionBackend !== "isolated-container"
    || invocationDigest(manifest) !== attempt.executionManifestDigest
    || manifest.causation?.workflowRunId !== attempt.runId || manifest.causation?.workOrderId !== attempt.workOrderId
    || manifest.causation?.taskId !== attempt.parentTaskId || manifest.executionProfile?.profileId !== attempt.executionProfileId
    || manifest.executionProfile?.profileDigest !== attempt.executionProfileDigest
    || profile?.schema !== "factory-execution-profile/v2" || !policy
    || !exact(profile.modelRoute, ["schema", "mode"]) || profile.modelRoute.schema !== "factory-inference-constraint/v1" || profile.modelRoute.mode !== "DENIED"
    || invocationDigest(policy.transmission) !== invocationDigest({ schema: "factory-transmission-policy/v1", mode: "DENY_ALL", destinations: [], credentialClasses: [], maxOutboundBytes: 0 })
    || invocationDigest(policy.budget) !== invocationDigest({ schema: "factory-provider-budget/v1", mode: "NO_PROVIDER_EXECUTION", maxProviderCalls: 0, maxProviderLiabilityUsd: 0 })
    || manifest.modelRoute !== undefined
    || manifest.workflow?.steps?.length !== 1 || manifest.workflow.steps[0].kind !== "DETERMINISTIC"
    || manifest.budgetReservationId !== attempt.runId) throw new Error("Canonical isolated invocation binding is incomplete.");
  const composition: InvocationComposition = {
    schema: COMPOSITION_SCHEMA, profileClass: "isolated-offline-control/v1",
    bridge: { id: policy.bridge.id, version: policy.bridge.version, digest: policy.bridge.implementationDigest },
    backend: { id: policy.backend.id, version: policy.backend.version, digest: policy.backend.implementationDigest },
    runtimeImage: profile.runtimeArtifact?.snapshot?.imageDigest,
    isolationDigest: invocationDigest(profile.sandboxProfile?.profileSnapshot?.isolationPolicy),
    invocationSchema: policy.bridge.invocationSchema, resultSchema: policy.bridge.resultSchema,
  };
  const request: IsolatedInvocation = {
    schema: INVOCATION_SCHEMA, resultSchema: INVOCATION_RESULT_SCHEMA,
    executionId: `${attempt.runId}:${attempt.lease.leaseId}`, attemptId: attempt._id,
    workOrderId: attempt.workOrderId, taskId: attempt.parentTaskId, correlationId: attempt.runId,
    plan: { id: manifest.causation.missionPlanId, version: manifest.causation.missionPlanVersion, digest: manifest.causation.missionPlanDigest },
    factoryVersion: { id: manifest.causation.factoryDefinitionVersionId, configurationDigest: manifest.causation.factoryConfigurationDigest },
    budgetReservationId: manifest.budgetReservationId, profileId: attempt.executionProfileId, profileDigest: attempt.executionProfileDigest,
    executionManifestDigest: attempt.executionManifestDigest, composition, compositionDigest: invocationDigest(composition),
    lease: { leaseId: attempt.lease.leaseId, ownerId: attempt.lease.ownerId, workerId: attempt.lease.workerId,
      sessionId: attempt.lease.workerSessionId, generation: attempt.lease.workerGeneration },
    workload: manifest.workflow.steps[0].operation,
    capabilities: manifest.causation.factoryPurpose === "VERIFICATION" ? ["verify-document-bytes"] : ["render-markdown"],
    limits: { timeoutMs: manifest.workflow.steps[0].timeoutMs, budgetReference: "offline-zero-provider-calls/v1" },
    transmission: "NONE", modelRoute: "NONE",
  };
  if (isolatedInvocationIssues(request).length > 0 || new TextEncoder().encode(JSON.stringify(request)).byteLength > 16384) {
    throw new Error("Canonical isolated invocation violates the bounded transport contract.");
  }
  return request;
}
export const SYNTHETIC_WORKLOAD_DIGEST = invocationDigest({ reference: "synthetic-receipt/v1", output: "SYNTHETIC_RECEIPT" });
const digest = (x: unknown): x is string => typeof x === "string" && /^sha256:[a-f0-9]{64}$/.test(x);
const identity = (x: unknown): x is string => typeof x === "string" && /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,159}$/.test(x);
function exact(value: unknown, keys: string[]): value is Record<string, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).sort().join(",") === [...keys].sort().join(",");
}

export function invocationCompositionIssues(value: unknown): string[] {
  if (!exact(value, ["schema", "profileClass", "bridge", "backend", "runtimeImage", "isolationDigest", "invocationSchema", "resultSchema"])) return ["composition-fields-invalid"];
  const issues: string[] = [];
  if (value.schema !== COMPOSITION_SCHEMA || value.profileClass !== "isolated-offline-control/v1") issues.push("composition-class-unsupported");
  for (const key of ["bridge", "backend"]) {
    const binding = value[key];
    if (!exact(binding, ["id", "version", "digest"]) || !identity(binding.id) || !identity(binding.version) || !digest(binding.digest)) issues.push(`${key}-identity-invalid`);
  }
  if (!digest(value.runtimeImage) || !digest(value.isolationDigest)) issues.push("runtime-isolation-identity-invalid");
  if (value.invocationSchema !== INVOCATION_SCHEMA || value.resultSchema !== INVOCATION_RESULT_SCHEMA) issues.push("composition-schema-unsupported");
  return issues;
}

export function isolatedInvocationIssues(value: unknown): string[] {
  if (!exact(value, ["schema", "resultSchema", "executionId", "attemptId", "workOrderId", "taskId", "plan", "factoryVersion", "budgetReservationId", "correlationId", "profileId", "profileDigest", "executionManifestDigest", "composition", "compositionDigest", "lease", "workload", "capabilities", "limits", "transmission", "modelRoute"])) return ["request-fields-invalid"];
  const issues = invocationCompositionIssues(value.composition);
  if (value.schema !== INVOCATION_SCHEMA || value.resultSchema !== INVOCATION_RESULT_SCHEMA) issues.push("request-schema-unsupported");
  for (const key of ["executionId", "attemptId", "workOrderId", "taskId", "budgetReservationId", "correlationId", "profileId"]) if (!identity(value[key])) issues.push(`${key}-invalid`);
  for (const key of ["profileDigest", "executionManifestDigest", "compositionDigest"]) if (!digest(value[key])) issues.push(`${key}-invalid`);
  if (value.compositionDigest !== invocationDigest(value.composition)) issues.push("composition-digest-mismatch");
  if (!exact(value.plan, ["id", "version", "digest"]) || !identity(value.plan.id)
    || !Number.isSafeInteger(value.plan.version) || Number(value.plan.version) < 1 || !digest(value.plan.digest)) issues.push("plan-identity-invalid");
  if (!exact(value.factoryVersion, ["id", "configurationDigest"]) || !identity(value.factoryVersion.id)
    || typeof value.factoryVersion.configurationDigest !== "string" || !/^factory-v1-[a-f0-9]{8}$/.test(value.factoryVersion.configurationDigest)) issues.push("factory-version-invalid");
  const lease = value.lease;
  if (!exact(lease, ["leaseId", "ownerId", "workerId", "sessionId", "generation"])
    || ![lease.leaseId, lease.ownerId, lease.workerId, lease.sessionId].every(identity)
    || !Number.isSafeInteger(lease.generation) || lease.generation < 1) issues.push("lease-invalid");
  const render = value.workload && typeof value.workload === "object" && value.workload.reference === "render-markdown/v1";
  const verify = value.workload && typeof value.workload === "object" && value.workload.reference === VERIFY_DOCUMENT_OPERATION;
  if (render) issues.push(...renderMarkdownWorkloadIssues(value.workload));
  else if (verify) {
    issues.push(...verifyDocumentWorkloadIssues(value.workload));
    if (value.workload.input?.workOrderId !== value.workOrderId
      || value.workload.input?.producerAttemptId === value.attemptId) issues.push("verification-lineage-invalid");
  }
  else if (!exact(value.workload, ["reference", "digest"]) || value.workload.reference !== "synthetic-receipt/v1" || value.workload.digest !== SYNTHETIC_WORKLOAD_DIGEST) issues.push("workload-unsupported");
  if (!Array.isArray(value.capabilities) || value.capabilities.length !== 1 || value.capabilities[0] !== (render ? "render-markdown" : verify ? "verify-document-bytes" : "synthetic-receipt")) issues.push("capability-unsupported");
  if (!exact(value.limits, ["timeoutMs", "budgetReference"]) || !Number.isSafeInteger(value.limits.timeoutMs) || value.limits.timeoutMs < 1 || value.limits.timeoutMs > 60_000 || value.limits.budgetReference !== "offline-zero-provider-calls/v1") issues.push("limits-invalid");
  if (value.transmission !== "NONE" || value.modelRoute !== "NONE") issues.push("external-authority-unavailable");
  return issues;
}

export function invocationResult(request: IsolatedInvocation, status: InvocationStatus, startedAt: number, completedAt = Date.now()): IsolatedInvocationResult {
  const verification = request.workload.reference === VERIFY_DOCUMENT_OPERATION ? verifyDocumentBytes(request.workload) : undefined;
  if (status === "SUCCESS" && verification && !verification.matches) status = "WORKLOAD_FAILURE";
  const candidateFiles = status === "SUCCESS" && request.workload.reference === "render-markdown/v1"
    ? [renderMarkdownCandidate(request.workload)] : [];
  return { schema: INVOCATION_RESULT_SCHEMA, executionId: request.executionId, attemptId: request.attemptId,
    correlationId: request.correlationId, requestDigest: invocationDigest(request), compositionDigest: request.compositionDigest,
    status, startedAt, completedAt, summary: status === "SUCCESS" ? (candidateFiles.length ? "Deterministic document produced; independent verification required." : verification ? "Exact document byte comparison completed; no acceptance authority." : "Synthetic receipt control executed.") : status,
    evidenceOrigin: "CONTROL_FIXTURE", behavioralPass: false, providerCalls: 0,
    candidateFiles, resultDigest: status === "SUCCESS" ? invocationDigest(verification ?? (candidateFiles.length ? candidateFiles : "SYNTHETIC_RECEIPT")) : null };
}

export function invocationResultMatches(value: unknown, request: IsolatedInvocation): value is IsolatedInvocationResult {
  if (!exact(value, ["schema", "executionId", "attemptId", "correlationId", "requestDigest", "compositionDigest", "status", "startedAt", "completedAt", "summary", "evidenceOrigin", "behavioralPass", "providerCalls", "resultDigest", "candidateFiles"])) return false;
  if (!["SUCCESS", "WORKLOAD_FAILURE", "INFRASTRUCTURE_FAILURE", "POLICY_DENIED", "BUDGET_DENIED", "CANCELED", "TIMED_OUT", "STALE", "INVALID_REQUEST", "UNSUPPORTED_CAPABILITY"].includes(value.status)) return false;
  if (!Number.isSafeInteger(value.startedAt) || !Number.isSafeInteger(value.completedAt) || value.startedAt < 0 || value.completedAt < value.startedAt) return false;
  return invocationDigest(value) === invocationDigest(invocationResult(request, value.status, value.startedAt, value.completedAt));
}

export const ISOLATED_CONTAINER_POLICY = Object.freeze({
  schema: "factory-isolated-container-policy/v1", network: "none", hostMounts: false,
  readOnlyRoot: true, uid: 65534, gid: 65534, pids: 64, memoryBytes: 268435456,
  cpus: 1, tmpfsBytes: 16777216, noNewPrivileges: true, entrypoint: "/runtime/invoke.mjs",
});
export const ISOLATED_CONTAINER_POLICY_DIGEST = invocationDigest(ISOLATED_CONTAINER_POLICY);
