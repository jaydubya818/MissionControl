#!/usr/bin/env node
import { createHash, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { bedrockRouteSchema, verifyBedrockProfile } from "../apps/orchestration-server/src/bedrockRoute.js";
import { bedrockModelRouteBinding } from "../apps/orchestration-server/src/bedrockModelRouteBinding.js";
import { bedrockQualifiedPrice } from "../apps/orchestration-server/src/bedrockPricing.js";
import { qualifiedBedrockTransport } from "../apps/orchestration-server/src/bedrockQualifiedTransport.js";
import { serializeBedrock, invokeBedrockTransport } from "../apps/orchestration-server/src/bedrockAdapter.js";

const root = process.cwd();
const evidenceDir = resolve(root, "docs/testing/evidence/fdlc-bedrock-live-20260906");
const route = bedrockRouteSchema.parse(JSON.parse(readFileSync(resolve(root, "docs/software-factory/fdlc-bedrock-qualification-inputs.json"), "utf8")));
const profileEvidence = JSON.parse(readFileSync(resolve(evidenceDir, "bedrock-inference-profile.json"), "utf8"));
verifyBedrockProfile(route, profileEvidence);
const priceContract = JSON.parse(readFileSync(resolve(root, "docs/software-factory/fdlc-bedrock-price-qualified.json"), "utf8"));
const now = Date.now();
const price = bedrockQualifiedPrice(priceContract, "CONVERSE", now);
const request = {
  messages: [{ role: "user" as const, content: [{ type: "text" as const, text: "Synthetic qualification. Return exactly: FDLC_BEDROCK_ROUTE_OK" }] }],
  maxOutputTokens: 32,
};
const wire = serializeBedrock(route, "CONVERSE", request);
const payloadBytes = Buffer.byteLength(JSON.stringify(wire.body));
if (payloadBytes > price.maximumPayloadBytes) throw new Error("QUALIFICATION_PAYLOAD_EXCEEDS_PRICE_BOUND");
const maximumNanoUsd = price.maximumInputTokens * price.inputNanoUsdPerToken + request.maxOutputTokens * price.outputNanoUsdPerToken;
const maximumTotalNanoUsd = 5_000_000_000;
if (!Number.isSafeInteger(maximumNanoUsd) || maximumNanoUsd > maximumTotalNanoUsd) throw new Error("QUALIFICATION_LIABILITY_EXCEEDED");
const requestId = `fdlc-route-${randomUUID()}`;
const ledgerPath = resolve(evidenceDir, "live-liability-ledger.json");
const ledger = (() => {
  try { return JSON.parse(readFileSync(ledgerPath, "utf8")); }
  catch { return { schema: "fdlc-live-qualification-liability/v1", maximumTotalNanoUsd, settledNanoUsd: 0, unresolvedNanoUsd: 0, remainingNanoUsd: maximumTotalNanoUsd, requests: [] }; }
})();
if (ledger.schema !== "fdlc-live-qualification-liability/v1" || ledger.maximumTotalNanoUsd !== maximumTotalNanoUsd ||
    !Number.isSafeInteger(ledger.settledNanoUsd) || !Number.isSafeInteger(ledger.unresolvedNanoUsd) || !Array.isArray(ledger.requests))
  throw new Error("QUALIFICATION_LEDGER_INVALID");
if (ledger.settledNanoUsd + ledger.unresolvedNanoUsd + maximumNanoUsd > maximumTotalNanoUsd)
  throw new Error("QUALIFICATION_CUMULATIVE_LIABILITY_EXCEEDED");
ledger.unresolvedNanoUsd += maximumNanoUsd;
ledger.remainingNanoUsd = maximumTotalNanoUsd - ledger.settledNanoUsd - ledger.unresolvedNanoUsd;
ledger.requests.push({ requestId, state: "RESERVED", maximumNanoUsd, payloadBytes, maximumInputTokens: price.maximumInputTokens, maximumOutputTokens: request.maxOutputTokens, automaticRetries: 0 });
writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2) + "\n", { mode: 0o600 });
const digestFile = (path: string) => `sha256:${createHash("sha256").update(readFileSync(path)).digest("hex")}`;
const grant = {
  schema: "fdlc-bounded-bedrock-call-authorization/v1" as const,
  approvalReference: "docs/software-factory/fdlc-bedrock-qualification-approval.json",
  routeDigest: bedrockModelRouteBinding(route).routeDigest,
  expectedStsPrincipalArn: route.roleArn.replace("arn:aws:iam::", "arn:aws:sts::").replace("role/aws-reserved/sso.amazonaws.com/", "assumed-role/") + "/jaydubya818@gmail.com",
  identityEvidenceDigest: digestFile(resolve(evidenceDir, "sts-caller-identity.json")),
  profileEvidenceDigest: digestFile(resolve(evidenceDir, "bedrock-inference-profile.json")),
  awsProfile: "fdlc-qualification",
  validUntil: Math.min(price.expiresAt, now + 15 * 60_000),
  allowModelCalls: true as const,
};
try {
  const started = Date.now();
  const result = await invokeBedrockTransport(qualifiedBedrockTransport(route, grant), wire, { signal: new AbortController().signal, timeoutMs: 120_000 });
  const actualNanoUsd = result.usage.inputTokens * price.inputNanoUsdPerToken + result.usage.outputTokens * price.outputNanoUsdPerToken;
  ledger.unresolvedNanoUsd -= maximumNanoUsd;
  ledger.settledNanoUsd += actualNanoUsd;
  ledger.remainingNanoUsd = maximumTotalNanoUsd - ledger.settledNanoUsd - ledger.unresolvedNanoUsd;
  Object.assign(ledger.requests.at(-1), { state: "SETTLED", actualNanoUsd, providerRequestId: result.providerRequestId, usage: result.usage });
  writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2) + "\n", { mode: 0o600 });
  writeFileSync(resolve(evidenceDir, "live-route-result.json"), JSON.stringify({
    schema: "fdlc-bedrock-live-route-result/v1",
    result: "PASS",
    requestId,
    providerRequestId: result.providerRequestId,
    requestedInferenceProfile: route.inferenceProfileId,
    inferenceProfileArn: route.inferenceProfileArn,
    underlyingModel: route.modelId,
    sourceRegion: route.region,
    destinationRegions: route.allowedDestinationRegions,
    globalInference: false,
    usage: result.usage,
    latencyMs: Date.now() - started,
    automaticRetries: 0,
    cost: { classification: "ACTUAL", nanoUsd: actualNanoUsd },
    output: result.content,
  }, null, 2) + "\n");
  process.stdout.write(JSON.stringify({ result: "PASS", providerRequestId: result.providerRequestId, usage: result.usage, actualNanoUsd }) + "\n");
} catch (error) {
  const failure = error as Error & { $metadata?: { httpStatusCode?: number; requestId?: string; attempts?: number; totalRetryDelay?: number } };
  const rejectedBeforeInference = failure.name === "AccessDeniedException" && failure.$metadata?.httpStatusCode === 403;
  if (rejectedBeforeInference) {
    ledger.unresolvedNanoUsd -= maximumNanoUsd;
    ledger.remainingNanoUsd = maximumTotalNanoUsd - ledger.settledNanoUsd - ledger.unresolvedNanoUsd;
    Object.assign(ledger.requests.at(-1), { state: "REJECTED_PRE_INFERENCE", actualNanoUsd: 0, providerRequestId: failure.$metadata?.requestId, httpStatusCode: 403, attempts: failure.$metadata?.attempts, totalRetryDelay: failure.$metadata?.totalRetryDelay, error: failure.name });
  } else {
    Object.assign(ledger.requests.at(-1), { state: "UNKNOWN", error: failure.name || "UnknownError" });
  }
  writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2) + "\n", { mode: 0o600 });
  writeFileSync(resolve(evidenceDir, "live-route-failure.json"), JSON.stringify({ schema: "fdlc-bedrock-live-route-failure/v1", requestId, classification: rejectedBeforeInference ? "REJECTED_PRE_INFERENCE" : "UNKNOWN", providerRequestId: failure.$metadata?.requestId ?? null, httpStatusCode: failure.$metadata?.httpStatusCode ?? null, attempts: failure.$metadata?.attempts ?? null, totalRetryDelay: failure.$metadata?.totalRetryDelay ?? null, error: failure.name || "UnknownError", automaticRetries: 0 }, null, 2) + "\n");
  throw error;
}
