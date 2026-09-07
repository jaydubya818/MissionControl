import { z } from "zod";
import {
  assertProviderPrice,
  liabilityDigest,
  type ProviderPrice,
} from "../../../convex/lib/providerLiability.js";
import { BEDROCK_MODEL } from "./bedrockRoute.js";
import type { BedrockApi } from "./bedrockAdapter.js";
const positive = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const bedrockPriceSchema = z
  .object({
    schema: z.literal("fdlc-bedrock-price/v1"),
    qualification: z.enum([
      "UNQUALIFIED",
      "OFFLINE_FIXTURE",
      "APPROVED_QUALIFICATION",
    ]),
    version: z.string().min(1),
    effectiveAt: positive,
    expiresAt: positive,
    currency: z.literal("USD"),
    billingUnit: z.literal("MILLION_TOKENS"),
    provenance: z.object({
      url: z.url().startsWith("https://"),
      evidenceDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    }),
    ratesNanoUsdPerMillion: z.object({
      input: positive,
      output: positive,
      cacheRead: positive,
      cacheWrite5m: positive,
      cacheWrite1h: positive,
      reasoning: positive,
    }),
    cacheMode: z.literal("DISABLED"),
    reasoningMode: z.literal("DISABLED"),
    reasoningBilling: z.literal("INCLUDED_IN_OUTPUT"),
    otherBillableDimensions: z.literal("NONE"),
    maximumInputTokens: positive,
    maximumOutputTokens: positive,
    maximumPayloadBytes: positive,
    inputBoundEvidence: z.string().min(1),
    outputBoundEvidence: z.string().min(1),
    qualifiedProviderPriceDigest: z
      .string()
      .regex(/^sha256:[a-f0-9]{64}$/)
      .optional(),
  })
  .strict()
  .superRefine((price, ctx) => {
    if (
      price.qualification === "APPROVED_QUALIFICATION" &&
      !price.qualifiedProviderPriceDigest
    )
      ctx.addIssue({
        code: "custom",
        message: "QUALIFIED_PRICE_DIGEST_REQUIRED",
      });
  });
export type BedrockPriceContract = z.infer<typeof bedrockPriceSchema>;
function convertPrice(
  input: BedrockPriceContract,
  api: BedrockApi,
  now: number,
): ProviderPrice {
  const p = bedrockPriceSchema.parse(input);
  const ceiling = (n: number) => Number((BigInt(n) + 999999n) / 1000000n);
  const result: ProviderPrice = {
    schema: "factory-provider-price/v1",
    provider: "aws-bedrock",
    model: BEDROCK_MODEL,
    api,
    currency: "USD",
    effectiveAt: p.effectiveAt,
    expiresAt: p.expiresAt,
    source: p.provenance.url,
    evidenceDigest: p.provenance.evidenceDigest,
    // The strict request serializer cannot emit cache controls. Retain every
    // published cache rate in the versioned source contract, while pricing the
    // only admitted billing path: uncached standard input.
    inputNanoUsdPerToken: ceiling(p.ratesNanoUsdPerMillion.input),
    outputNanoUsdPerToken: ceiling(
      Math.max(
        p.ratesNanoUsdPerMillion.output,
        p.ratesNanoUsdPerMillion.reasoning,
      ),
    ),
    maximumInputTokens: p.maximumInputTokens,
    maximumOutputTokens: p.maximumOutputTokens,
    maximumPayloadBytes: p.maximumPayloadBytes,
    inputBound: "CONSERVATIVELY_BOUNDED",
    outputIncludesReasoning: true,
    inclusiveCacheWorstCase: true,
    otherBillableDimensions: "NONE",
  };
  assertProviderPrice(result, now);
  if (
    p.qualification === "APPROVED_QUALIFICATION" &&
    liabilityDigest(result) !== p.qualifiedProviderPriceDigest
  )
    throw new Error("QUALIFIED_PRICE_DIGEST_MISMATCH");
  return result;
}

/** Fixture conversion only: no live price registration or evidence certification. */
export function bedrockFixturePrice(
  input: BedrockPriceContract,
  api: BedrockApi,
  now: number,
): ProviderPrice {
  if (input.qualification !== "OFFLINE_FIXTURE")
    throw new Error("REAL_PRICE_UNQUALIFIED");
  return convertPrice(input, api, now);
}

/** Converts only the reviewed, expiring qualification price for Converse. */
export function bedrockQualifiedPrice(
  input: BedrockPriceContract,
  api: BedrockApi,
  now: number,
): ProviderPrice {
  if (input.qualification !== "APPROVED_QUALIFICATION" || api !== "CONVERSE")
    throw new Error("QUALIFIED_PRICE_ROUTE_MISMATCH");
  return convertPrice(input, api, now);
}
