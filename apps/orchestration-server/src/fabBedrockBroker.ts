import { createHash } from "node:crypto";
import type { ConvexHttpClient } from "convex/browser";
import type { BedrockBrokerRequest, BedrockBrokerTransport, BedrockRoute as FabBedrockRoute } from "@fdlc/fab";
import type { HarnessExecutionContext } from "@mission-control/workflow-engine";
import { liabilityDigest, type ProviderUsage } from "../../../convex/lib/providerLiability.js";
import type { BedrockBridgeIdentity } from "../../../convex/lib/bedrockBridgeIdentity.js";
import { canonicalBedrockBridgeAuthority } from "./bedrockInferenceBridge.js";
import { parseBedrock, type BedrockTransport, type BedrockWire } from "./bedrockAdapter.js";
import { bedrockRouteSchema, type BedrockRoute } from "./bedrockRoute.js";

export interface FabBedrockBrokerConfiguration {
  route: BedrockRoute;
  reservationId: string;
  priceDigest: string;
  maximumOutputTokens: number;
  timeoutMs: number;
}

const fabRoute = (route: BedrockRoute): FabBedrockRoute => ({
  accountId: route.awsAccountId,
  region: route.region,
  modelId: route.modelId,
  inferenceProfileId: route.inferenceProfileId,
  inferenceProfileArn: route.inferenceProfileArn,
});

/** Credential-free Fab boundary owned by the host. Each request is counted,
 * durably reserved, sent once, and durably settled before Fab sees the reply. */
export function createFabBedrockBrokerFactory(
  client: ConvexHttpClient,
  configuration: FabBedrockBrokerConfiguration,
  transport: BedrockTransport,
) {
  const config = structuredClone(configuration);
  config.route = bedrockRouteSchema.parse(config.route);
  if (!config.reservationId || !/^sha256:[a-f0-9]{64}$/.test(config.priceDigest)
    || !Number.isSafeInteger(config.maximumOutputTokens) || config.maximumOutputTokens < 1 || config.maximumOutputTokens > 4096
    || !Number.isSafeInteger(config.timeoutMs) || config.timeoutMs < 1 || config.timeoutMs > 60_000)
    throw new Error("FAB_BEDROCK_CONFIGURATION_INVALID");
  if (!transport.countInputTokens || transport.evidenceClass !== "APPROVED_QUALIFICATION")
    throw new Error("FAB_BEDROCK_QUALIFIED_TRANSPORT_REQUIRED");

  return async (input: { context: HarnessExecutionContext }): Promise<BedrockBrokerTransport> => {
    const attempt = input.context.attempt;
    if (!attempt) throw new Error("FAB_BEDROCK_ATTEMPT_AUTHORITY_REQUIRED");
    const route = fabRoute(config.route);
    const credentialReference = "aws:fdlc-qualification:bedrock-sonnet-4-6";
    const identity: BedrockBridgeIdentity = {
      schema: "factory-bedrock-inference/v1",
      workOrderId: attempt.workOrderId,
      workOrderRevision: attempt.workOrderRevision,
      executionProfileId: attempt.executionProfileId,
      executionProfileDigest: attempt.executionProfileDigest,
      harnessDigest: attempt.harnessDigest,
      runtimeDigest: attempt.runtimeDigest,
      backend: "persistent-worker",
      modelRouteDigest: attempt.modelRouteDigest,
      priceDigest: config.priceDigest,
      provider: "aws-bedrock",
      model: "anthropic.claude-sonnet-4-6",
      retryGeneration: 0,
    };
    const authority = canonicalBedrockBridgeAuthority(client, {
      projectId: attempt.projectId,
      repositoryId: attempt.repositoryId,
    });
    let active = false;
    const requests = new Set<string>();
    return {
      identity: () => ({ route: structuredClone(route), credentialReference, maximumAttempts: 1 }),
      invoke: async (request: BedrockBrokerRequest, signal: AbortSignal) => {
        if (active || requests.has(request.requestId)) throw new Error("FAB_BEDROCK_REQUEST_REPLAY");
        if (liabilityDigest(request.route) !== liabilityDigest(route)
          || request.credentialReference !== credentialReference
          || request.maximumOutputTokens > config.maximumOutputTokens
          || !/^[a-f0-9]{64}$/.test(request.requestDigest))
          throw new Error("FAB_BEDROCK_REQUEST_BINDING_INVALID");
        const wire: BedrockWire = {
          api: "INVOKE_MODEL",
          region: "us-east-1",
          modelId: config.route.inferenceProfileArn,
          body: JSON.parse(request.body),
          maxAttempts: 1,
        };
        const canonicalRequestDigest = `sha256:${request.requestDigest}`;
        const subject = {
          reservationId: config.reservationId,
          workflowRunId: attempt.workflowRunId,
          leaseId: attempt.leaseId,
          generation: attempt.generation,
        };
        active = true;
        requests.add(request.requestId);
        let admitted = false;
        let settled = false;
        try {
          signal.throwIfAborted();
          await attempt.assertActive();
          const counted = await transport.countInputTokens!(wire, signal);
          const proof = await authority.reserve({
            ...subject,
            bridgeIdentity: identity,
            requestId: request.requestId,
            requestDigest: canonicalRequestDigest,
            payloadBytes: Buffer.byteLength(request.body),
            inputTokens: counted.inputTokens,
            outputTokens: request.maximumOutputTokens,
          });
          admitted = true;
          if (proof.requestId !== request.requestId || proof.requestDigest !== canonicalRequestDigest
            || proof.priceDigest !== config.priceDigest || proof.bridgeIdentityDigest !== liabilityDigest(identity)
            || !Number.isSafeInteger(proof.validUntil) || proof.validUntil <= Date.now())
            throw new Error("FAB_BEDROCK_ADMISSION_PROOF_INVALID");
          const remaining = proof.validUntil - Date.now();
          if (remaining < 1) throw new Error("FAB_BEDROCK_ADMISSION_EXPIRED");
          const deadline = AbortSignal.any([signal, AbortSignal.timeout(Math.min(config.timeoutMs, remaining))]);
          const response = await transport.send(wire, deadline);
          const parsed = parseBedrock("INVOKE_MODEL", response.body, response.requestId);
          const usage: ProviderUsage = {
            requestId: request.requestId,
            requestDigest: canonicalRequestDigest,
            provider: "aws-bedrock",
            model: "anthropic.claude-sonnet-4-6",
            providerRequestId: parsed.providerRequestId,
            usageId: `sha256:${createHash("sha256").update(JSON.stringify([config.route.awsAccountId, config.route.region, parsed.providerRequestId])).digest("hex")}`,
            inputTokens: parsed.usage.inputTokens,
            outputTokens: parsed.usage.outputTokens,
            classification: "ACTUAL",
            expectedReceiptRevision: 0,
          };
          const receipt = await authority.settle({ ...subject, usage }) as { incident?: boolean; duplicate?: boolean };
          if (!receipt || receipt.incident || receipt.duplicate) throw new Error("FAB_BEDROCK_SETTLEMENT_NOT_ACCEPTED");
          settled = true;
          return { requestDigest: request.requestDigest, providerRequestId: parsed.providerRequestId, httpStatus: 200, attempts: 1, body: JSON.stringify(response.body) };
        } catch (error) {
          if (admitted && !settled) await authority.settle({
            ...subject,
            usage: { requestId: request.requestId, requestDigest: canonicalRequestDigest, provider: "aws-bedrock", model: "anthropic.claude-sonnet-4-6", providerRequestId: "", usageId: "", inputTokens: 0, outputTokens: 0, classification: "UNKNOWN", expectedReceiptRevision: 0 },
          }).catch(() => undefined);
          throw error;
        } finally {
          active = false;
        }
      },
    };
  };
}
