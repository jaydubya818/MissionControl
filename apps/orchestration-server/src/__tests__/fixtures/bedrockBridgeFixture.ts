// Synthetic OFFLINE_FIXTURE identities and rates only; not a live authority.
import {
  CODEX_BEDROCK_V1_HARNESS_MANIFEST,
  harnessCapabilityManifestDigest,
} from "@mission-control/workflow-engine";
import {
  liabilityDigest,
  reserveProviderRequest,
  settleProviderUsage,
  type ProviderPrice,
  type ProviderReservation,
} from "../../../../../convex/lib/providerLiability.js";
import { bedrockModelRouteBinding } from "../../bedrockModelRouteBinding.js";
import { bedrockRouteSchema } from "../../bedrockRoute.js";
import {
  BedrockInferenceBridge,
  type BedrockBridgeBinding,
  type BedrockBridgeAuthority,
} from "../../bedrockInferenceBridge.js";
import type { BedrockTransport } from "../../bedrockAdapter.js";
export const fixtureRoute = bedrockRouteSchema.parse({
  provider: "AWS Bedrock",
  region: "us-east-1",
  modelId: "anthropic.claude-sonnet-4-6",
  foundationModelArn:
    "arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-sonnet-4-6",
  inferenceProfileId: "us.anthropic.claude-sonnet-4-6",
  inferenceProfileArn:
    "arn:aws:bedrock:us-east-1:000000000000:inference-profile/us.anthropic.claude-sonnet-4-6",
  maximumContextTokens: 1_000_000,
  capabilities: { countTokens: { status: "UNSUPPORTED", evidenceReference: "fixture://counttokens-unsupported", evidenceDigest: `sha256:${"d".repeat(64)}` } },
  topology: "US_GEOGRAPHIC_CROSS_REGION",
  globalInference: false,
  allowedDestinationRegions: ["us-east-1", "us-east-2", "us-west-2"],
  awsAccountId: "000000000000",
  projectEnvironmentId: "OFFLINE-FIXTURE",
  roleArn: "arn:aws:iam::000000000000:role/fixture",
  expectedStsPrincipalArn:
    "arn:aws:sts::000000000000:assumed-role/fixture/test",
});
export const sha = (c: string) => `sha256:${c.repeat(64)}`;
export function bridgeFixture() {
  const now = Date.now();
  const price: ProviderPrice = {
    schema: "factory-provider-price/v1",
    provider: "aws-bedrock",
    model: fixtureRoute.modelId,
    api: "CONVERSE",
    currency: "USD",
    effectiveAt: now - 1000,
    expiresAt: now + 900000,
    source: "https://fixture.invalid/price",
    evidenceDigest: sha("a"),
    inputNanoUsdPerToken: 1,
    outputNanoUsdPerToken: 1,
    maximumInputTokens: 1_000_000,
    maximumOutputTokens: 4096,
    maximumPayloadBytes: 1048576,
    inputBound: "CONSERVATIVELY_BOUNDED",
    outputIncludesReasoning: true,
    inclusiveCacheWorstCase: true,
    otherBillableDimensions: "NONE",
  };
  const binding: BedrockBridgeBinding = {
    projectId: "project",
    repositoryId: "repo",
    workflowRunId: "attempt",
    leaseId: "lease",
    generation: 1,
    reservationId: "reservation",
    route: fixtureRoute,
    price,
    maximumProgramNanoUsd: 2_000_000,
    maximumPhysicalRequests: 4,
    timeoutMs: 10000,
    identity: {
      schema: "factory-bedrock-inference/v1",
      workOrderId: "wo",
      workOrderRevision: 1,
      executionProfileId: "profile",
      executionProfileDigest: sha("b"),
      harnessDigest: harnessCapabilityManifestDigest(
        CODEX_BEDROCK_V1_HARNESS_MANIFEST,
      ),
      runtimeDigest: sha("c"),
      backend: "remote-sandbox",
      modelRouteDigest: bedrockModelRouteBinding(fixtureRoute).routeDigest,
      priceDigest: liabilityDigest(price),
      provider: "aws-bedrock",
      model: "anthropic.claude-sonnet-4-6",
      retryGeneration: 0,
    },
  };
  let reservation: ProviderReservation = {
    schema: "factory-provider-reservation/v1",
    scope: {
      projectId: "project",
      repositoryId: "repo",
      workOrderId: "wo",
      workOrderRevision: 1,
      executionProfileId: "profile",
      executionProfileDigest: binding.identity.executionProfileDigest,
      modelRouteDigest: binding.identity.modelRouteDigest,
      priceDigest: binding.identity.priceDigest,
    },
    maximumNanoUsd: 2_000_000,
    expiresAt: now + 60000,
    maximumRequests: 4,
    frozen: false,
    holds: [],
  };
  let sends = 0;
  const authority: BedrockBridgeAuthority = {
    reserve: async (p) => {
      if (
        reservation.holds.some(
          (h) => h.state === "RESERVED" || h.state === "UNKNOWN",
        )
      )
        throw new Error("Prior request unresolved");
      const r = reserveProviderRequest({
        reservation,
        price,
        authority: {
          attemptId: "attempt",
          leaseId: "lease",
          generation: 1,
          leaseExpiresAt: now + 60000,
          current: true,
          canceled: false,
          scope: reservation.scope,
        },
        requestId: p.requestId as string,
        requestDigest: p.requestDigest as string,
        payloadBytes: p.payloadBytes as number,
        outputTokens: p.outputTokens as number,
        preSendInputBound: p.preSendInputBound as any,
        now: Date.now(),
      });
      reservation = r.reservation;
      return {
        requestId: p.requestId as string,
        requestDigest: p.requestDigest as string,
        priceDigest: liabilityDigest(price),
        bridgeIdentityDigest: liabilityDigest(p.bridgeIdentity),
        maximumNanoUsd: r.hold.maximumNanoUsd,
        reservationMaximumNanoUsd: reservation.maximumNanoUsd,
        reservationMaximumRequests: reservation.maximumRequests,
        holdDigest: liabilityDigest(r.hold),
        admittedAt: Date.now(),
        validUntil: reservation.expiresAt,
      };
    },
    settle: async (p) => {
      const r = settleProviderUsage(reservation, price, p.usage as any);
      reservation = r.reservation;
      return { duplicate: r.duplicate, incident: r.incident };
    },
  };
  const transport: BedrockTransport = {
    evidenceClass: "OFFLINE_FIXTURE",
    send: async () => ({
      requestId: `fixture-provider-${++sends}`,
      body: {
        output: {
          message: {
            role: "assistant",
            content: [{ text: "fixture complete" }],
          },
        },
        stopReason: "end_turn",
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      },
    }),
  };
  return {
    binding,
    price,
    authority,
    transport,
    get reservation() {
      return reservation;
    },
    set reservation(r) {
      reservation = r;
    },
    get sends() {
      return sends;
    },
    create: () => new BedrockInferenceBridge(binding, authority, transport),
  };
}
