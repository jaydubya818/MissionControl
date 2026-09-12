import { z } from "zod";
import { liabilityDigest, type PreSendInputBound } from "../../../convex/lib/providerLiability.js";
import { bedrockRouteSchema, type BedrockRoute } from "./bedrockRoute.js";
import type { BedrockWire } from "./bedrockAdapter.js";

const exactCount = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

/**
 * Produces the input-token ceiling committed before transport. Unsupported
 * CountTokens routes reserve the complete provider context window: this is
 * deliberately less precise, but no request accepted by that route can incur
 * more input-token liability than the model's context ceiling.
 */
export function bedrockPreSendInputBound(
  routeInput: BedrockRoute,
  wire: BedrockWire,
  maximumPayloadBytes: number,
  providerExactInputTokens?: number,
): PreSendInputBound {
  const route = bedrockRouteSchema.parse(routeInput);
  if (!Number.isSafeInteger(maximumPayloadBytes) || maximumPayloadBytes < 1)
    throw new Error("BEDROCK_PAYLOAD_BOUND_INVALID");
  const exactBytes = Buffer.byteLength(wire.serializedBody, "utf8");
  if (
    exactBytes !== wire.payloadBytes ||
    exactBytes > maximumPayloadBytes ||
    JSON.stringify(JSON.parse(wire.serializedBody)) !== wire.serializedBody ||
    JSON.stringify(wire.body) !== wire.serializedBody
  )
    throw new Error("BEDROCK_SERIALIZED_REQUEST_NOT_BOUNDED");

  const capability = route.capabilities.countTokens.status;
  if (capability === "UNKNOWN")
    throw new Error("BEDROCK_COUNTTOKENS_CAPABILITY_UNKNOWN");
  if (capability === "SUPPORTED") {
    const maximumInputTokens = exactCount.parse(providerExactInputTokens);
    if (maximumInputTokens > route.maximumContextTokens)
      throw new Error("BEDROCK_PROVIDER_COUNT_EXCEEDS_CONTEXT");
    const snapshot = {
      schema: "provider-pre-send-input-bound/v1" as const,
      classification: "PROVIDER_EXACT" as const,
      countTokensCapability: capability,
      maximumInputTokens,
      serializedRequestBytes: exactBytes,
      derivation: "PROVIDER_COUNTTOKENS" as const,
      capabilityEvidenceDigest: route.capabilities.countTokens.evidenceDigest,
    };
    return { ...snapshot, evidenceDigest: liabilityDigest(snapshot) };
  }
  if (providerExactInputTokens !== undefined)
    throw new Error("BEDROCK_FAKE_PROVIDER_TOKEN_EVIDENCE");
  const snapshot = {
    schema: "provider-pre-send-input-bound/v1" as const,
    classification: "CONSERVATIVE_UPPER_BOUND" as const,
    countTokensCapability: capability,
    maximumInputTokens: route.maximumContextTokens,
    serializedRequestBytes: exactBytes,
    derivation: "FULL_MODEL_CONTEXT_WINDOW" as const,
    capabilityEvidenceDigest: route.capabilities.countTokens.evidenceDigest,
  };
  return { ...snapshot, evidenceDigest: liabilityDigest(snapshot) };
}
