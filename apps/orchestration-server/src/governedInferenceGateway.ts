import { createHash, randomUUID } from "node:crypto";
import type { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import {
  assertClassifyInferenceDispatchAllowance,
  type ClassifyInferenceDispatchAllowance,
  type ExactInferenceRoute,
  type ProviderUsageObservation,
} from "@mission-control/shared";
import { ConvexActions } from "./convexCalls.js";
import { createSignedServiceCommand } from "./serviceCommandClient.js";
import { prepareClassifyInferenceRequest, type PreparedClassifyInferenceRequest } from "./governedInferenceWire.js";

const MAX_PROVIDER_RESPONSE_BYTES = 1_048_576;

export interface GovernedInferenceRequest {
  projectId: string;
  repositoryId: string;
  workflowRunId: string;
  reservationId: string;
  leaseId: string;
  logicalRequestKey: string;
  routes: ExactInferenceRoute[];
  body: unknown;
}

export interface GovernedInferenceTransportResult {
  value: unknown;
  resolvedProvider: string;
  resolvedModelId?: string;
  providerRequestId?: string;
  providerBillingId?: string;
  usage: ProviderUsageObservation;
  responseDigest: string;
  batch?: boolean;
  serviceTier?: string;
}

export interface GovernedInferenceTransportInput {
  route: ExactInferenceRoute;
  body: unknown;
  signal?: AbortSignal;
  preparedRequest?: PreparedClassifyInferenceRequest;
  dispatchAllowance?: ClassifyInferenceDispatchAllowance;
}

export interface GovernedInferenceTransport {
  invoke(input: GovernedInferenceTransportInput): Promise<GovernedInferenceTransportResult>;
}

export interface GovernedInferenceLedger {
  persistIntent(input: {
    workflowRunId: string;
    reservationId: string;
    logicalRequestKey: string;
    physicalOrdinal: number;
    retryOfIntentId?: string;
    route: ExactInferenceRoute;
    requestDigest: string;
    intentKey: string;
  }): Promise<{ intentId: string; state: string; created: boolean }>;
  claimIntent(input: {
    workflowRunId: string; intentId: string; leaseId: string; claimId: string; cancelRequested?: boolean;
    dispatch?: { contract: "classify-text/v1"; payloadBytes: number; maximumOutputTokens: number; temperature?: number };
  }): Promise<{ claimed: boolean; cancelled?: boolean; reason?: string; dispatchAllowance?: ClassifyInferenceDispatchAllowance }>;
  appendReceipt(input: {
    workflowRunId: string;
    intentId: string;
    resolvedProvider?: string;
    resolvedModelId?: string;
    providerRequestId?: string;
    providerBillingId?: string;
    delivery: "DELIVERED" | "NOT_DELIVERED" | "UNKNOWN";
    status: "SUCCEEDED" | "FAILED" | "CANCELLED" | "TIMED_OUT" | "UNKNOWN";
    usage: ProviderUsageObservation;
    responseDigest?: string;
    failureCode?: string;
    startedAt: number;
    completedAt: number;
    batch?: boolean;
    serviceTier?: string;
  }): Promise<{ receiptId: string; created: boolean }>;
}

export class GovernedInferenceError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly delivery: "DELIVERED" | "NOT_DELIVERED" | "UNKNOWN" = "NOT_DELIVERED",
  ) {
    super(message);
    this.name = "GovernedInferenceError";
  }
}

export class GovernedInferenceGateway {
  constructor(
    private readonly ledger: GovernedInferenceLedger,
    private readonly transport: GovernedInferenceTransport,
    private readonly now: () => number = Date.now,
    private readonly uuid: () => string = randomUUID,
  ) {}

  async execute<T>(request: GovernedInferenceRequest, signal?: AbortSignal): Promise<T> {
    request = structuredClone(request);
    if (request.routes.length === 0) throw new GovernedInferenceError("ROUTE_MISSING", "No exact inference route was authorized.");
    const selectedClassify = this.transport instanceof OpenAIChatCompletionsTransport;
    if (selectedClassify && request.routes.length !== 1) {
      throw new GovernedInferenceError("CLASSIFY_ROUTE_COUNT_INVALID", "Classification permits exactly one selected route.");
    }
    const preparedRequest = selectedClassify ? prepareClassifyInferenceRequest(request.routes[0], request.body) : undefined;
    const requestDigest = preparedRequest?.requestDigest ?? `sha256:${createHash("sha256").update(stableJson(request.body)).digest("hex")}`;
    let retryOfIntentId: string | undefined;
    let lastError: GovernedInferenceError | undefined;

    for (let index = 0; index < request.routes.length; index += 1) {
      const route = request.routes[index];
      const physicalOrdinal = index + 1;
      const intentKey = `inference-${createHash("sha256").update(`${request.logicalRequestKey}:${physicalOrdinal}:${requestDigest}`).digest("hex")}`;
      const persisted = await this.ledger.persistIntent({
        workflowRunId: request.workflowRunId,
        reservationId: request.reservationId,
        logicalRequestKey: request.logicalRequestKey,
        physicalOrdinal,
        retryOfIntentId,
        route,
        requestDigest,
        intentKey,
      });
      if (!persisted.created) {
        throw new GovernedInferenceError(
          persisted.state === "CLAIMED" ? "LOGICAL_REQUEST_IN_PROGRESS" : "LOGICAL_REQUEST_REPLAY",
          "The logical inference request already has a durable physical attempt.",
        );
      }
      if (signal?.aborted) {
        await this.ledger.claimIntent({
          workflowRunId: request.workflowRunId, intentId: persisted.intentId,
          leaseId: request.leaseId, claimId: this.uuid(), cancelRequested: true,
        });
        throw new GovernedInferenceError("ATTEMPT_CANCELLED", "Inference was cancelled before transport claim.");
      }
      const claimId = this.uuid();
      const claim = await this.ledger.claimIntent({
        workflowRunId: request.workflowRunId, intentId: persisted.intentId,
        leaseId: request.leaseId, claimId,
        ...(preparedRequest ? { dispatch: {
          contract: "classify-text/v1" as const,
          payloadBytes: preparedRequest.payloadBytes, maximumOutputTokens: preparedRequest.maximumOutputTokens,
          ...(preparedRequest.temperature === undefined ? {} : { temperature: preparedRequest.temperature }),
        } } : {}),
      });
      if (!claim.claimed) throw new GovernedInferenceError(claim.reason ?? "CLAIM_DENIED", "Inference transport claim was denied.");

      const dispatchAllowance = selectedClassify ? validateClassifyDispatch({
        route, body: request.body, preparedRequest, dispatchAllowance: claim.dispatchAllowance,
      }) : undefined;
      if (dispatchAllowance && (
        dispatchAllowance.projectId !== request.projectId
        || dispatchAllowance.repositoryId !== request.repositoryId
        || dispatchAllowance.attemptId !== request.workflowRunId
        || dispatchAllowance.reservationId !== request.reservationId
        || dispatchAllowance.intentId !== persisted.intentId
        || dispatchAllowance.intentLogicalId !== intentKey
        || dispatchAllowance.logicalRequestKey !== request.logicalRequestKey
        || dispatchAllowance.leaseId !== request.leaseId
        || dispatchAllowance.claimId !== claimId
      )) throw invalidClassifyDispatch();

      const startedAt = this.now();
      let result: GovernedInferenceTransportResult;
      try {
        result = await this.transport.invoke({ route, body: request.body, signal, preparedRequest, dispatchAllowance });
      } catch (error) {
        const failure = error instanceof GovernedInferenceError
          ? error
          : new GovernedInferenceError("TRANSPORT_RESULT_UNKNOWN", error instanceof Error ? error.message : String(error), "UNKNOWN");
        await this.ledger.appendReceipt({
          workflowRunId: request.workflowRunId, intentId: persisted.intentId,
          delivery: failure.delivery, status: failure.delivery === "UNKNOWN" ? "UNKNOWN" : "FAILED",
          usage: {}, failureCode: failure.code, startedAt, completedAt: this.now(),
        });
        if (failure.delivery === "UNKNOWN") throw failure;
        if (failure.delivery === "DELIVERED") throw failure;
        lastError = failure;
        retryOfIntentId = persisted.intentId;
        continue;
      }
      // Do not replace a failed receipt append with an empty receipt or replay transport.
      // The unresolved reservation hold remains for reconciliation; this path has no durable outbox.
      await this.ledger.appendReceipt({
        workflowRunId: request.workflowRunId, intentId: persisted.intentId,
        resolvedProvider: result.resolvedProvider, resolvedModelId: result.resolvedModelId,
        providerRequestId: result.providerRequestId, providerBillingId: result.providerBillingId,
        delivery: "DELIVERED", status: "SUCCEEDED", usage: result.usage,
        responseDigest: result.responseDigest, startedAt, completedAt: this.now(),
        batch: result.batch, serviceTier: result.serviceTier,
      });
      return result.value as T;
    }
    throw lastError ?? new GovernedInferenceError("ROUTES_EXHAUSTED", "All authorized inference routes were exhausted.");
  }
}

export class ConvexGovernedInferenceLedger implements GovernedInferenceLedger {
  constructor(
    private readonly client: ConvexHttpClient,
    private readonly projectId: string,
    private readonly repositoryId: string,
  ) {}

  persistIntent(input: Parameters<GovernedInferenceLedger["persistIntent"]>[0]): ReturnType<GovernedInferenceLedger["persistIntent"]> {
    return this.call<{ intentId: string; state: string; created: boolean }>("inference.intents.persist", ConvexActions.serviceCommands.persistInferenceIntent, input.workflowRunId, { intent: withoutWorkflowRun(input) });
  }

  claimIntent(input: Parameters<GovernedInferenceLedger["claimIntent"]>[0]): ReturnType<GovernedInferenceLedger["claimIntent"]> {
    return this.call<Awaited<ReturnType<GovernedInferenceLedger["claimIntent"]>>>("inference.intents.claim", ConvexActions.serviceCommands.claimInferenceIntent, input.workflowRunId, { claim: withoutWorkflowRun(input) });
  }

  appendReceipt(input: Parameters<GovernedInferenceLedger["appendReceipt"]>[0]): ReturnType<GovernedInferenceLedger["appendReceipt"]> {
    return this.call<{ receiptId: string; created: boolean }>("inference.receipts.append", ConvexActions.serviceCommands.appendInferenceReceipt, input.workflowRunId, { receipt: withoutWorkflowRun(input) });
  }

  private async call<Result>(capability: Parameters<typeof createSignedServiceCommand>[0]["capability"], action: string, workflowRunId: string, body: Record<string, unknown>): Promise<Result> {
    const command = createSignedServiceCommand({
      capability, projectId: this.projectId, repositoryId: this.repositoryId,
      payload: { workflowRunId, ...body },
    });
    const reference = makeFunctionReference<"action", typeof command, Result>(action);
    return await this.client.action(reference, command);
  }
}

export class OpenAIChatCompletionsTransport implements GovernedInferenceTransport {
  private readonly consumedClaims = new Map<string, number>();

  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {
    if (!apiKey.trim()) throw new Error("An isolated OpenAI API credential is required.");
  }

  async invoke(input: GovernedInferenceTransportInput): Promise<GovernedInferenceTransportResult> {
    const allowance = validateClassifyDispatch(input);
    const requestBody = input.preparedRequest!.serializedRequest;
    const signal = input.signal;
    const now = this.now();
    assertClassifyDispatchOpen(allowance, signal, now);
    for (const [key, expiresAt] of this.consumedClaims) {
      if (expiresAt <= now) this.consumedClaims.delete(key);
    }
    const claimKey = JSON.stringify([allowance.intentId, allowance.claimId]);
    if (this.consumedClaims.has(claimKey)) {
      throw new GovernedInferenceError("CLASSIFY_DISPATCH_ALREADY_CONSUMED", "This transport has already consumed the committed claim.");
    }
    // The backend owns durable claim authority. This guard also denies direct repeats on this transport.
    this.consumedClaims.set(claimKey, allowance.issuedAt + 30_000);
    const controller = new AbortController();
    const onCancel = () => controller.abort(new GovernedInferenceError("ATTEMPT_CANCELLED_AFTER_DISPATCH", "Inference was cancelled after dispatch.", "UNKNOWN"));
    signal?.addEventListener("abort", onCancel, { once: true });
    const timeout = setTimeout(() => controller.abort(new GovernedInferenceError(
      "CLASSIFY_DISPATCH_DEADLINE_EXCEEDED", "Inference exceeded its committed dispatch deadline.", "UNKNOWN",
    )), Math.max(0, allowance.validUntil - this.now()));
    try {
      assertClassifyDispatchOpen(allowance, signal, this.now());
      let response: Response;
      try {
        const pendingResponse = this.fetchImpl(allowance.route.endpoint, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` },
          body: requestBody,
          signal: controller.signal,
          redirect: "error",
        });
        void pendingResponse.then((lateResponse) => {
          if (controller.signal.aborted) void lateResponse.body?.cancel().catch(() => {});
        }, () => {});
        response = await untilAborted(pendingResponse, controller.signal);
      } catch (error) {
        if (controller.signal.aborted) throw controller.signal.reason;
        throw new GovernedInferenceError("TRANSPORT_RESULT_UNKNOWN", error instanceof Error ? error.message : String(error), "UNKNOWN");
      }
      const providerRequestId = response.headers.get("x-request-id") ?? undefined;
      const text = await boundedResponseText(response, MAX_PROVIDER_RESPONSE_BYTES, controller.signal);
      let data: unknown;
      try {
        data = JSON.parse(text);
      } catch {
        throw new GovernedInferenceError("PROVIDER_RESPONSE_INVALID", "OpenAI returned a non-JSON response.", "DELIVERED");
      }
      const responseObject = asRecord(data);
      const providerError = asRecord(responseObject.error);
      if (!response.ok) {
        throw new GovernedInferenceError(
          `PROVIDER_HTTP_${response.status}`,
          typeof providerError.message === "string" ? providerError.message : "OpenAI request failed.",
          "DELIVERED",
        );
      }
      const resolvedModelId = typeof responseObject.model === "string" ? responseObject.model : undefined;
      const usage = asRecord(responseObject.usage);
      const promptDetails = asRecord(usage.prompt_tokens_details);
      const completionDetails = asRecord(usage.completion_tokens_details);
      const promptTokens = safeTokenCount(usage.prompt_tokens);
      const cachedTokens = safeTokenCount(promptDetails.cached_tokens);
      const normalizedUsage: ProviderUsageObservation = {
        inputTokens: promptTokens !== undefined && cachedTokens !== undefined ? Math.max(0, promptTokens - cachedTokens) : promptTokens,
        outputTokens: safeTokenCount(usage.completion_tokens),
        cacheReadTokens: cachedTokens,
        reasoningTokens: safeTokenCount(completionDetails.reasoning_tokens),
      };
      return {
        value: data,
        resolvedProvider: "openai",
        resolvedModelId,
        providerRequestId,
        providerBillingId: undefined,
        usage: Object.fromEntries(Object.entries(normalizedUsage).filter(([, value]) => value !== undefined)),
        responseDigest: `sha256:${createHash("sha256").update(text).digest("hex")}`,
        serviceTier: typeof responseObject.service_tier === "string" ? responseObject.service_tier : undefined,
      };
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onCancel);
    }
  }
}

function invalidClassifyDispatch() {
  return new GovernedInferenceError("CLASSIFY_DISPATCH_ALLOWANCE_INVALID", "Classification requires an exact committed dispatch allowance and wire request.");
}

function validateClassifyDispatch(input: GovernedInferenceTransportInput): ClassifyInferenceDispatchAllowance {
  try {
    const allowance: unknown = structuredClone(input.dispatchAllowance);
    assertClassifyInferenceDispatchAllowance(allowance);
    const expected = prepareClassifyInferenceRequest(input.route, input.body);
    if (!input.preparedRequest
      || input.preparedRequest.serializedRequest !== expected.serializedRequest
      || input.preparedRequest.requestDigest !== expected.requestDigest
      || input.preparedRequest.payloadBytes !== expected.payloadBytes
      || input.preparedRequest.maximumOutputTokens !== expected.maximumOutputTokens
      || input.preparedRequest.temperature !== expected.temperature
      || allowance.requestDigest !== expected.requestDigest
      || allowance.payloadBytes !== expected.payloadBytes
      || allowance.maximumOutputTokens !== expected.maximumOutputTokens
      || allowance.temperature !== (expected.temperature ?? null)
      || stableJson(allowance.route) !== stableJson(input.route)) throw invalidClassifyDispatch();
    return allowance;
  } catch {
    throw invalidClassifyDispatch();
  }
}

function assertClassifyDispatchOpen(allowance: ClassifyInferenceDispatchAllowance, signal: AbortSignal | undefined, now: number) {
  if (signal?.aborted) throw new GovernedInferenceError("ATTEMPT_CANCELLED", "Inference was cancelled before dispatch.");
  if (now < allowance.issuedAt || now >= allowance.validUntil) {
    throw new GovernedInferenceError("CLASSIFY_DISPATCH_ALLOWANCE_EXPIRED", "The committed dispatch allowance is outside its valid time window.");
  }
}

function untilAborted<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    operation.then(
      (value) => { signal.removeEventListener("abort", onAbort); resolve(value); },
      (error) => { signal.removeEventListener("abort", onAbort); reject(error); },
    );
    if (signal.aborted) { signal.removeEventListener("abort", onAbort); reject(signal.reason); }
  });
}

function withoutWorkflowRun<T extends { workflowRunId: string }>(input: T) {
  const { workflowRunId: _workflowRunId, ...value } = input;
  return value;
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "undefined";
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
}

function safeTokenCount(value: unknown) {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

async function boundedResponseText(response: Response, maximumBytes: number, signal: AbortSignal): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    void response.body?.cancel().catch(() => {});
    throw new GovernedInferenceError("PROVIDER_RESPONSE_TOO_LARGE", "OpenAI response exceeds the governed byte limit.", "DELIVERED");
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const chunk = await untilAborted(reader.read(), signal);
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > maximumBytes) {
        throw new GovernedInferenceError("PROVIDER_RESPONSE_TOO_LARGE", "OpenAI response exceeds the governed byte limit.", "DELIVERED");
      }
      chunks.push(chunk.value);
    }
  } catch (error) {
    void reader.cancel().catch(() => {});
    if (error instanceof GovernedInferenceError) throw error;
    throw new GovernedInferenceError("PROVIDER_RESPONSE_STREAM_UNKNOWN", "OpenAI response stream ended ambiguously.", "UNKNOWN");
  } finally {
    reader.releaseLock();
  }
  const combined = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(combined);
}
