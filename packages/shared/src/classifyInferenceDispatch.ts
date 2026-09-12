import { canonicalDigest } from "./canonicalDigest.js";
import type { ExactInferenceRoute } from "./governedInference.js";

export interface ClassifyInferenceDispatchAllowance {
  schema: "classify-inference-dispatch/v1";
  projectId: string;
  repositoryId: string;
  workOrderId: string;
  taskId: string;
  attemptId: string;
  reservationId: string;
  reservationLogicalId: string;
  reservationDigest: string;
  intentId: string;
  intentLogicalId: string;
  intentDigest: string;
  logicalRequestKey: string;
  leaseId: string;
  claimId: string;
  executionProfileId: string;
  executionProfileDigest: string;
  priceBookDigest: string;
  route: ExactInferenceRoute;
  requestDigest: string;
  payloadBytes: number;
  maximumInputTokens: 128000;
  maximumCacheReadTokens: 128000;
  maximumOutputTokens: number;
  temperature: number | null;
  maxCostMicrousd: number;
  maximumPhysicalCalls: 1;
  issuedAt: number;
  validUntil: number;
  digest: string;
}

export function assertClassifyInferenceRoute(route: ExactInferenceRoute): void {
  if (!route || route.provider !== "openai" || route.providerRoute !== "openai-chat-completions"
    || route.modelId !== "gpt-4o-mini-2024-07-18"
    || route.adapter !== "mission-control-openai-chat-completions" || route.adapterVersion !== "1.0.0"
    || route.endpoint !== "https://api.openai.com/v1/chat/completions"
    || !/^sha256:[a-f0-9]{64}$/.test(route.routeDigest)) {
    throw new Error("CLASSIFY_INFERENCE_ROUTE_INVALID");
  }
}

/** Integrity and bounds only. The trusted ledger issues authority, not a hash. */
export function assertClassifyInferenceDispatchAllowance(value: unknown): asserts value is ClassifyInferenceDispatchAllowance {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("CLASSIFY_DISPATCH_ALLOWANCE_INVALID");
  const proof = value as ClassifyInferenceDispatchAllowance;
  const { digest, ...bytes } = proof;
  if (proof.schema !== "classify-inference-dispatch/v1"
    || digest !== canonicalDigest("classify-inference-dispatch/v1", bytes)) {
    throw new Error("CLASSIFY_DISPATCH_ALLOWANCE_INVALID");
  }
  for (const key of ["projectId", "repositoryId", "workOrderId", "taskId", "attemptId", "reservationId",
    "reservationLogicalId", "intentId", "intentLogicalId", "logicalRequestKey", "leaseId", "claimId", "executionProfileId"] as const) {
    if (typeof proof[key] !== "string" || !proof[key].trim() || proof[key].length > 500) throw new Error("CLASSIFY_DISPATCH_SCOPE_INVALID");
  }
  for (const key of ["reservationDigest", "intentDigest", "executionProfileDigest", "priceBookDigest", "requestDigest"] as const) {
    if (typeof proof[key] !== "string" || !/^sha256:[a-f0-9]{64}$/.test(proof[key])) throw new Error("CLASSIFY_DISPATCH_DIGEST_INVALID");
  }
  for (const key of ["payloadBytes", "maximumOutputTokens", "maxCostMicrousd", "issuedAt", "validUntil"] as const) {
    if (!Number.isSafeInteger(proof[key]) || proof[key] <= 0) throw new Error("CLASSIFY_DISPATCH_BOUND_INVALID");
  }
  if (proof.payloadBytes > 256_000 || proof.maximumOutputTokens > 1024
    || (proof.temperature !== null && (typeof proof.temperature !== "number" || !Number.isFinite(proof.temperature) || proof.temperature < 0 || proof.temperature > 2))
    || proof.maximumInputTokens !== 128_000 || proof.maximumCacheReadTokens !== 128_000
    || proof.maximumPhysicalCalls !== 1 || proof.validUntil <= proof.issuedAt
    || proof.validUntil > proof.issuedAt + 30_000) throw new Error("CLASSIFY_DISPATCH_BOUND_INVALID");
  assertClassifyInferenceRoute(proof.route);
}
