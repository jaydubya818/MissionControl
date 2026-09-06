import { createHash } from "node:crypto";
import type { ConvexHttpClient } from "convex/browser";
import type { BedrockBrokerRequest, BedrockBrokerTransport, BedrockRoute as FabBedrockRoute } from "@fdlc/fab";
import type { HarnessExecutionContext } from "@mission-control/workflow-engine";
import { liabilityDigest, type ProviderUsage } from "../../../convex/lib/providerLiability.js";
import type { BedrockBridgeIdentity } from "../../../convex/lib/bedrockBridgeIdentity.js";
import {
  BedrockSettlementError,
  canonicalBedrockBridgeAuthority,
  type BedrockAccountingDelivery,
  type BedrockSettlementPayload,
} from "./bedrockInferenceBridge.js";
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
  accounting?: BedrockAccountingDelivery,
) {
  const config = structuredClone(configuration);
  config.route = bedrockRouteSchema.parse(config.route);
  if (!config.reservationId || !/^sha256:[a-f0-9]{64}$/.test(config.priceDigest)
    || !Number.isSafeInteger(config.maximumOutputTokens) || config.maximumOutputTokens < 1 || config.maximumOutputTokens > 4096
    || !Number.isSafeInteger(config.timeoutMs) || config.timeoutMs < 1 || config.timeoutMs > 60_000)
    throw new Error("FAB_BEDROCK_CONFIGURATION_INVALID");
  if (!transport.countInputTokens || transport.evidenceClass !== "APPROVED_QUALIFICATION")
    throw new Error("FAB_BEDROCK_QUALIFIED_TRANSPORT_REQUIRED");
  if (!accounting) throw new Error("ACCOUNTING_JOURNAL_REQUIRED");

  return async (input: { context: HarnessExecutionContext }): Promise<BedrockBrokerTransport> => {
    const attempt = input.context.attempt;
    if (!attempt) throw new Error("FAB_BEDROCK_ATTEMPT_AUTHORITY_REQUIRED");
    if (!attempt.executionProfileId || !attempt.executionProfileDigest
      || !attempt.harnessDigest || !attempt.runtimeDigest || !attempt.modelRouteDigest)
      throw new Error("FAB_BEDROCK_EXECUTION_PROFILE_AUTHORITY_REQUIRED");
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
    if (accounting.scope && (accounting.scope.projectId !== attempt.projectId
      || accounting.scope.repositoryId !== attempt.repositoryId))
      throw new Error("ACCOUNTING_SCOPE_MISMATCH");
    let active = false;
    const requests = new Set<string>();
    return {
      identity: () => ({ route: structuredClone(route), credentialReference, maximumAttempts: 1 }),
      invoke: async (request: BedrockBrokerRequest, signal: AbortSignal) => {
        if (active || requests.has(request.requestId)) throw new Error("FAB_BEDROCK_REQUEST_REPLAY");
        if (!request.requestId || !/^[a-f0-9]{64}$/.test(request.requestDigest)
          || !Number.isSafeInteger(request.maximumOutputTokens)
          || request.maximumOutputTokens < 1
          || liabilityDigest(request.route) !== liabilityDigest(route)
          || request.credentialReference !== credentialReference
          || request.maximumOutputTokens > config.maximumOutputTokens)
          throw new Error("FAB_BEDROCK_REQUEST_BINDING_INVALID");
        const wire: BedrockWire = {
          api: "INVOKE_MODEL",
          region: config.route.region,
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
        let observedSettlement: BedrockSettlementPayload | undefined;
        try {
          signal.throwIfAborted();
          await attempt.assertActive();
          const counted = await transport.countInputTokens!(wire, signal);
          const ticket = await accounting.prepare({
            subject,
            requestId: request.requestId,
            requestDigest: canonicalRequestDigest,
            evidenceClass: transport.evidenceClass,
          });
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
            || !Number.isSafeInteger(proof.admittedAt) || proof.admittedAt > Date.now()
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
          observedSettlement = { ...subject, usage } as BedrockSettlementPayload;
          let accountingReference;
          try {
            accountingReference = await accounting.capture(ticket, observedSettlement);
          } catch (error) {
            await authority.settle(structuredClone(observedSettlement)).catch(() => undefined);
            throw new BedrockSettlementError(
              { projectId: attempt.projectId, repositoryId: attempt.repositoryId },
              observedSettlement,
              error,
              undefined,
              true,
            );
          }
          const receipt = await accounting.deliver(accountingReference) as { incident?: boolean; duplicate?: boolean };
          if (!receipt || receipt.incident || receipt.duplicate) throw new Error("FAB_BEDROCK_SETTLEMENT_NOT_ACCEPTED");
          settled = true;
          return { requestDigest: request.requestDigest, providerRequestId: parsed.providerRequestId, httpStatus: 200, attempts: 1, body: JSON.stringify(response.body) };
        } catch (error) {
          if (admitted && !settled && !observedSettlement) await authority.settle({
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
