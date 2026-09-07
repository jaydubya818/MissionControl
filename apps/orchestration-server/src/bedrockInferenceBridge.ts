import { createHash } from "node:crypto";
import { makeFunctionReference } from "convex/server";
import {
  CODEX_BEDROCK_V1_HARNESS_MANIFEST,
  harnessCapabilityManifestDigest,
} from "@mission-control/workflow-engine";
import {
  assertProviderPrice,
  liabilityDigest,
  type ProviderPrice,
  type ProviderUsage,
} from "../../../convex/lib/providerLiability.js";
import type { BedrockBridgeIdentity } from "../../../convex/lib/bedrockBridgeIdentity.js";
import { bedrockModelRouteBinding } from "./bedrockModelRouteBinding.js";
import { bedrockRouteSchema, type BedrockRoute } from "./bedrockRoute.js";
import { bedrockPreSendInputBound } from "./bedrockLiabilityBound.js";
import {
  serializeBedrock,
  invokeBedrockTransport,
  type BedrockRequest,
  type BedrockTransport,
} from "./bedrockAdapter.js";
import { createSignedServiceCommand } from "./serviceCommandClient.js";
import type { AccountingCaptureIntent, AccountingTicket, AccountingReference, AccountingAcknowledgment } from "./accountingDeliveryJournal.js";

export interface BedrockAccountingDelivery {
  scope?: { projectId: string; repositoryId: string };
  prepare(input: AccountingCaptureIntent): Promise<AccountingTicket>;
  capture(ticket: AccountingTicket, payload: BedrockSettlementPayload): Promise<AccountingReference>;
  deliver(reference: AccountingReference): Promise<AccountingAcknowledgment>;
}

export interface BedrockBridgeBinding {
  projectId: string;
  repositoryId: string;
  workflowRunId: string;
  leaseId: string;
  generation: number;
  reservationId: string;
  identity: BedrockBridgeIdentity;
  route: BedrockRoute;
  price: ProviderPrice;
  maximumProgramNanoUsd: number;
  maximumPhysicalRequests: number;
  timeoutMs: number;
}
export interface BedrockBridgeAuthority {
  reserve(payload: Record<string, unknown>): Promise<{
    requestId: string;
    requestDigest: string;
    priceDigest: string;
    bridgeIdentityDigest: string;
    maximumNanoUsd: number;
    reservationMaximumNanoUsd: number;
    reservationMaximumRequests: number;
    holdDigest: string;
    admittedAt: number;
    validUntil: number;
  }>;
  settle(payload: Record<string, unknown>): Promise<unknown>;
}

export type BedrockSettlementPayload = Readonly<{
  reservationId: string;
  workflowRunId: string;
  leaseId: string;
  generation: number;
  usage: Readonly<ProviderUsage & { classification: "ACTUAL" }>;
}>;

/** Known accounting evidence for reconciliation, held in memory only.
 * This contains no prompt/output content and is not a durable outbox. */
export class BedrockSettlementError extends Error {
  readonly code = "BEDROCK_SETTLEMENT_NOT_ACCEPTED";
  readonly projectId: string;
  readonly repositoryId: string;
  readonly settlementPayload: BedrockSettlementPayload;
  readonly accountingReference?: AccountingReference;

  constructor(
    scope: Pick<BedrockBridgeBinding, "projectId" | "repositoryId">,
    payload: BedrockSettlementPayload,
    cause: unknown,
    reference?: AccountingReference,
    captureFailed = false,
  ) {
    super(captureFailed ? "ACCOUNTING_CAPTURE_FAILED" : "BEDROCK_SETTLEMENT_NOT_ACCEPTED", { cause });
    this.name = "BedrockSettlementError";
    this.projectId = scope.projectId;
    this.repositoryId = scope.repositoryId;
    this.settlementPayload = Object.freeze({ ...payload, usage: Object.freeze({ ...payload.usage }) });
    this.accountingReference = reference ? Object.freeze({ ...reference }) : undefined;
  }
}

/** Uses the existing authenticated command path; neither authority nor secrets
 * cross Docker attach. No alternate balance or cached admission exists here. */
export function canonicalBedrockBridgeAuthority(
  client: { action: (reference: any, args: any) => Promise<any> },
  scope: Pick<BedrockBridgeBinding, "projectId" | "repositoryId">,
): BedrockBridgeAuthority {
  const command = async (
    name: "reserveProviderRequest" | "recordProviderUsage",
    payload: Record<string, unknown>,
  ) => {
    const signed = createSignedServiceCommand({
      capability:
        name === "reserveProviderRequest"
          ? "provider-liability.reserve"
          : "provider-liability.settle",
      ...scope,
      payload,
    });
    return await client.action(
      makeFunctionReference<"action">(`serviceCommands:${name}`),
      signed,
    );
  };
  return {
    reserve: (p) => command("reserveProviderRequest", p),
    settle: (p) => command("recordProviderUsage", p),
  };
}

/** One host-selected Attempt binding, one in-flight request. Current qualification
 * uses explicit transport; live qualification additionally requires a bounded
 * authorization grant and an approved temporary credential envelope. */
export class BedrockInferenceBridge {
  private readonly binding: BedrockBridgeBinding;
  private active = false;
  private blocked = false;
  private readonly requests = new Set<string>();
  constructor(
    binding: BedrockBridgeBinding,
    private readonly authority: BedrockBridgeAuthority,
    private readonly transport: BedrockTransport,
    private readonly now = Date.now,
    private readonly accounting?: BedrockAccountingDelivery,
  ) {
    this.binding = structuredClone(binding);
    const b = this.binding;
    b.route = bedrockRouteSchema.parse(b.route);
    try {
      assertProviderPrice(b.price, this.now());
    } catch {
      throw new Error("BEDROCK_BRIDGE_BINDING_INVALID");
    }
    if (transport.evidenceClass === "APPROVED_QUALIFICATION" && !accounting) throw new Error("ACCOUNTING_JOURNAL_REQUIRED");
    if (accounting?.scope && (accounting.scope.projectId !== b.projectId || accounting.scope.repositoryId !== b.repositoryId)) throw new Error("ACCOUNTING_SCOPE_MISMATCH");
    if (
      !["OFFLINE_FIXTURE", "APPROVED_QUALIFICATION"].includes(
        transport.evidenceClass,
      ) ||
      b.identity.schema !== "factory-bedrock-inference/v1" ||
      b.identity.harnessDigest !==
        harnessCapabilityManifestDigest(CODEX_BEDROCK_V1_HARNESS_MANIFEST) ||
      b.identity.modelRouteDigest !==
        bedrockModelRouteBinding(b.route).routeDigest ||
      b.identity.provider !== "aws-bedrock" ||
      b.identity.model !== b.route.modelId ||
      b.identity.backend !== "remote-sandbox" ||
      b.identity.retryGeneration !== 0 ||
      liabilityDigest(b.price) !== b.identity.priceDigest ||
      b.price.provider !== "aws-bedrock" ||
      b.price.model !== b.route.modelId ||
      b.price.api !== "CONVERSE" ||
      b.price.inputBound !== "CONSERVATIVELY_BOUNDED" ||
      b.price.maximumInputTokens !== b.route.maximumContextTokens ||
      b.price.maximumOutputTokens > 4096 ||
      b.price.maximumPayloadBytes > 20 * 1024 * 1024 ||
      !Number.isSafeInteger(b.maximumProgramNanoUsd) ||
      b.maximumProgramNanoUsd < 1 ||
      !Number.isSafeInteger(b.maximumPhysicalRequests) ||
      b.maximumPhysicalRequests < 1 ||
      (transport.evidenceClass === "APPROVED_QUALIFICATION" &&
        (b.maximumProgramNanoUsd !== 5_000_000_000 ||
          b.maximumPhysicalRequests !== 1)) ||
      !b.reservationId ||
      !b.workflowRunId ||
      !b.leaseId ||
      !Number.isSafeInteger(b.generation) ||
      b.generation < 1 ||
      !Number.isSafeInteger(b.timeoutMs) ||
      b.timeoutMs < 1 ||
      b.timeoutMs > 900000
    ) {
      throw new Error("BEDROCK_BRIDGE_BINDING_INVALID");
    }
  }

  assertExecutionBinding(expected: {
    workflowRunId: string;
    leaseId: string;
    workOrderId: string;
    workOrderRevision: number;
    executionProfileId: string;
    executionProfileDigest: string;
    harnessDigest: string;
    runtimeDigest: string;
    modelRouteDigest: string;
  }) {
    const b = this.binding;
    if (
      b.workflowRunId !== expected.workflowRunId ||
      b.leaseId !== expected.leaseId ||
      Object.entries(expected).some(
        ([key, value]) =>
          !["workflowRunId", "leaseId"].includes(key) &&
          b.identity[key as keyof BedrockBridgeIdentity] !== value,
      )
    )
      throw new Error("BEDROCK_ALLOCATION_BINDING_MISMATCH");
  }

  async infer(requestId: string, input: BedrockRequest, signal: AbortSignal) {
    if (
      this.active ||
      this.blocked ||
      this.requests.size >= this.binding.maximumPhysicalRequests ||
      this.requests.has(requestId) ||
      !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(requestId)
    )
      throw new Error("BEDROCK_REQUEST_REPLAY_OR_UNKNOWN");
    signal.throwIfAborted();
    const b = this.binding;
    const request = structuredClone(input);
    if (request.maxOutputTokens > b.price.maximumOutputTokens)
      throw new Error("BEDROCK_OUTPUT_BOUND_EXCEEDED");
    const wire = serializeBedrock(b.route, "CONVERSE", request);
    const preSendInputBound = bedrockPreSendInputBound(
      b.route,
      wire,
      b.price.maximumPayloadBytes,
    );
    const expectedMaximumNanoUsd =
      preSendInputBound.maximumInputTokens * b.price.inputNanoUsdPerToken +
      request.maxOutputTokens * b.price.outputNanoUsdPerToken;
    if (!Number.isSafeInteger(expectedMaximumNanoUsd) || expectedMaximumNanoUsd < 1)
      throw new Error("BEDROCK_MAXIMUM_LIABILITY_INVALID");
    const payloadBytes = wire.payloadBytes;
    const requestDigest = liabilityDigest({
      bridge: b.identity,
      route: b.route,
      wire,
      preSendInputBound,
    });
    const subject = {
      reservationId: b.reservationId,
      workflowRunId: b.workflowRunId,
      leaseId: b.leaseId,
      generation: b.generation,
    };
    this.active = true;
    this.requests.add(requestId);
    let admitted = false;
    let observedSettlement: BedrockSettlementPayload | undefined;
    let accountingReference: AccountingReference | undefined;
    const startedAt = this.now();
    try {
      const ticket = await this.accounting?.prepare({ subject, requestId, requestDigest, evidenceClass: this.transport.evidenceClass });
      // Failure/ambiguous reply here permits no send, but never permits replay.
      const proof = await this.authority.reserve({
        ...subject,
        bridgeIdentity: b.identity,
        requestId,
        requestDigest,
        payloadBytes,
        outputTokens: request.maxOutputTokens,
        preSendInputBound,
      });
      admitted = true;
      const expectedHoldDigest = liabilityDigest({
        requestId,
        requestDigest,
        attemptId: b.workflowRunId,
        leaseId: b.leaseId,
        generation: b.generation,
        maximumNanoUsd: expectedMaximumNanoUsd,
        maximumOutputTokens: request.maxOutputTokens,
        preSendInputBound,
        state: "RESERVED",
        receiptRevision: 0,
        classification: "UNKNOWN",
        costClassification: "UNKNOWN",
      });
      if (
        proof.requestId !== requestId ||
        proof.requestDigest !== requestDigest ||
        proof.priceDigest !== b.identity.priceDigest ||
        proof.bridgeIdentityDigest !== liabilityDigest(b.identity) ||
        proof.maximumNanoUsd !== expectedMaximumNanoUsd ||
        proof.reservationMaximumNanoUsd !== b.maximumProgramNanoUsd ||
        proof.reservationMaximumRequests !== b.maximumPhysicalRequests ||
        proof.holdDigest !== expectedHoldDigest ||
        !Number.isSafeInteger(proof.admittedAt) ||
        proof.admittedAt > this.now() ||
        !Number.isSafeInteger(proof.validUntil) ||
        proof.validUntil <= this.now()
      )
        throw new Error("BEDROCK_ADMISSION_PROOF_INVALID");
      signal.throwIfAborted();
      const result = await invokeBedrockTransport(this.transport, wire, {
        signal,
        timeoutMs: Math.min(b.timeoutMs, proof.validUntil - this.now()),
      });
      const usage = {
        requestId,
        requestDigest,
        provider: b.identity.provider,
        model: b.identity.model,
        providerRequestId: result.providerRequestId,
        usageId: `sha256:${createHash("sha256")
          .update(
            JSON.stringify([
              b.route.awsAccountId,
              b.route.region,
              result.providerRequestId,
            ]),
          )
          .digest("hex")}`,
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        classification: "ACTUAL",
        expectedReceiptRevision: 0,
      } satisfies ProviderUsage;
      observedSettlement = { ...subject, usage };
      if (this.accounting && ticket) {
        try { accountingReference = await this.accounting.capture(ticket, observedSettlement); }
        catch (error) {
          // Known usage must never be replaced with an empty UNKNOWN observation.
          // Production authority uses the same bounded accounting client here.
          await this.authority.settle(structuredClone(observedSettlement)).catch(() => undefined);
          throw new BedrockSettlementError(b, observedSettlement, error, undefined, true);
        }
      }
      try {
        const receipt = (this.accounting && accountingReference
          ? await this.accounting.deliver(accountingReference)
          : await this.authority.settle(structuredClone(observedSettlement))) as {
          incident?: boolean;
          duplicate?: boolean;
        } | null | undefined;
        if (this.accounting && accountingReference && typeof receipt?.incident === "boolean" && typeof receipt.duplicate === "boolean") {
          // Accounting delivery and execution success are separate outcomes.
          accountingReference = { ...accountingReference, state: "ACKNOWLEDGED" };
        }
        if (!receipt || receipt.incident !== false || receipt.duplicate !== false)
          throw new Error("BEDROCK_SETTLEMENT_NOT_ACCEPTED");
      } catch (error) {
        throw new BedrockSettlementError(b, observedSettlement, error, accountingReference);
      }
      return {
        ...result,
        evidence: {
          schema: "factory-bedrock-inference-evidence/v1",
          requestId,
          requestDigest,
          provider: b.identity.provider,
          requestedInferenceProfile: b.route.inferenceProfileId,
          underlyingModel: b.route.modelId,
          providerReturnedModel: null,
          latencyMs: Math.max(0, this.now() - startedAt),
          evidenceClass: this.transport.evidenceClass,
          authority: "NONE",
          automaticRetries: 0,
          preSendInputBound,
          preSendOutputBound: request.maxOutputTokens,
          reservedMaximumNanoUsd: proof.maximumNanoUsd,
          preSendCostClassification: "MAXIMUM_RESERVED" as const,
          providerReportedInputUsage: result.usage.inputTokens,
          providerReportedOutputUsage: result.usage.outputTokens,
          settledEstimatedNanoUsd:
            result.usage.inputTokens * b.price.inputNanoUsdPerToken +
            result.usage.outputTokens * b.price.outputNanoUsdPerToken,
          settledCostClassification: "ESTIMATED" as const,
        },
      };
    } catch (error) {
      this.blocked = true;
      if (admitted && !observedSettlement) {
        // If the lease expired or settlement reply was lost, this may fail. The
        // canonical RESERVED/UNKNOWN maximum still remains held, including crash.
        await this.authority
          .settle({
            ...subject,
            usage: {
              requestId,
              requestDigest,
              provider: b.identity.provider,
              model: b.identity.model,
              providerRequestId: "",
              usageId: "",
              inputTokens: 0,
              outputTokens: 0,
              classification: "UNKNOWN",
              expectedReceiptRevision: 0,
            },
          })
          .catch(() => {});
      }
      throw error;
    } finally {
      this.active = false;
    }
  }
}
