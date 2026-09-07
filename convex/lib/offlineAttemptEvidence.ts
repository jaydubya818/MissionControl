import { sha256Hex } from "@mission-control/shared";
import { invocationDigest, invocationResultMatches, isolatedInvocationIssues, type IsolatedInvocation,
  type IsolatedInvocationResult } from "@mission-control/workflow-engine/harness-contract";

/** Validates evidence consistency, not worker trust or current execution authority.
 * The accepting mutation must independently authenticate the exact claimed lease. */
export function validateOfflineAttemptEvidence(packet: unknown, request: IsolatedInvocation): {
  request: IsolatedInvocation;
  result: IsolatedInvocationResult;
  runtimeResult: IsolatedInvocationResult | null;
  evidence: Record<string, any>;
  packetDigest: string;
} {
  const value = packet as any;
  const exact = (object: any, fields: string[]) => object && typeof object === "object" && !Array.isArray(object)
    && Object.keys(object).sort().join(",") === [...fields].sort().join(",");
  if (isolatedInvocationIssues(request).length || !exact(value, ["request", "result", "evidence"])
    || invocationDigest(value.request) !== invocationDigest(request)
    || !invocationResultMatches(value.result, request)
    || new TextEncoder().encode(JSON.stringify(value)).length > 128_000) throw new Error("Offline evidence request/result binding is invalid.");
  const evidence = value.evidence;
  const resourceBound = evidence?.schema === "factory-isolated-execution-evidence/v2";
  if (!exact(evidence, ["schema", "evidenceOrigin", "authority", "stdoutBase64", "capturedStdoutSha256", "truncated", "exitCode", "cleanupVerified", "validatedRuntimeResult", ...(resourceBound ? ["container"] : [])])
    || (!resourceBound && evidence.schema !== "factory-isolated-execution-evidence/v1") || evidence.evidenceOrigin !== "CONTROL_FIXTURE"
    || evidence.authority !== "NONE" || typeof evidence.truncated !== "boolean" || typeof evidence.cleanupVerified !== "boolean"
    || !(evidence.exitCode === null || Number.isSafeInteger(evidence.exitCode))
    || typeof evidence.stdoutBase64 !== "string" || evidence.stdoutBase64.length > 43_692
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(evidence.stdoutBase64)) {
    throw new Error("Offline runtime evidence envelope is invalid.");
  }
  if (resourceBound && (!exact(evidence.container, ["name", "id"])
    || !/^mc-invoke-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(evidence.container.name)
    || !(evidence.container.id === null || /^[a-f0-9]{64}$/.test(evidence.container.id)))) {
    throw new Error("Offline container identity is invalid.");
  }
  if (value.result.status === "SUCCESS" && ((resourceBound && !evidence.container.id)
    || (request.workload.reference === "verify-document-bytes/v1" && !resourceBound))) {
    throw new Error("Offline success requires captured container identity.");
  }
  const binary = atob(evidence.stdoutBase64);
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  if (bytes.length > 32_768 || btoa(binary) !== evidence.stdoutBase64
    || evidence.capturedStdoutSha256 !== `sha256:${sha256Hex(bytes)}`) throw new Error("Offline runtime response bytes do not match their digest.");
  let runtimeResult: IsolatedInvocationResult | null = null;
  if (!evidence.truncated && evidence.exitCode === 0) {
    try {
      const observed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
      if (invocationResultMatches(observed, request)) runtimeResult = observed;
    } catch { /* Invalid actual bytes remain non-authoritative diagnostic evidence. */ }
  }
  if (invocationDigest(runtimeResult) !== invocationDigest(evidence.validatedRuntimeResult)) {
    throw new Error("Offline validated result is not the captured runtime response.");
  }
  if (value.result.status === "SUCCESS" && (!evidence.cleanupVerified || !runtimeResult
    || invocationDigest(value.result) !== invocationDigest(runtimeResult))) {
    throw new Error("Offline success requires the exact actual runtime response and verified cleanup.");
  }
  return { request, result: value.result, runtimeResult, evidence, packetDigest: invocationDigest(value) };
}
