import { createHash, randomUUID } from "node:crypto";
import type { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import type { ExactInferenceRoute, ProviderUsageObservation } from "@mission-control/shared";
import { ConvexActions } from "./convexCalls.js";
import { createSignedServiceCommand } from "./serviceCommandClient.js";

const MAX_PROVIDER_REQUEST_BYTES = 256_000;
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

export interface GovernedInferenceTransport {
  invoke(input: { route: ExactInferenceRoute; body: unknown; signal?: AbortSignal }): Promise<GovernedInferenceTransportResult>;
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
  claimIntent(input: { workflowRunId: string; intentId: string; leaseId: string; claimId: string; cancelRequested?: boolean }): Promise<{ claimed: boolean; cancelled?: boolean; reason?: string }>;
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
    if (request.routes.length === 0) throw new GovernedInferenceError("ROUTE_MISSING", "No exact inference route was authorized.");
    const requestDigest = `sha256:${createHash("sha256").update(stableJson(request.body)).digest("hex")}`;
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
      const claim = await this.ledger.claimIntent({
        workflowRunId: request.workflowRunId, intentId: persisted.intentId,
        leaseId: request.leaseId, claimId: this.uuid(),
      });
      if (!claim.claimed) throw new GovernedInferenceError(claim.reason ?? "CLAIM_DENIED", "Inference transport claim was denied.");

      const startedAt = this.now();
      try {
        const result = await this.transport.invoke({ route, body: request.body, signal });
        await this.ledger.appendReceipt({
          workflowRunId: request.workflowRunId, intentId: persisted.intentId,
          resolvedProvider: result.resolvedProvider, resolvedModelId: result.resolvedModelId,
          providerRequestId: result.providerRequestId, providerBillingId: result.providerBillingId,
          delivery: "DELIVERED", status: "SUCCEEDED", usage: result.usage,
          responseDigest: result.responseDigest, startedAt, completedAt: this.now(),
          batch: result.batch, serviceTier: result.serviceTier,
        });
        return result.value as T;
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
      }
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
    return this.call<{ claimed: boolean; cancelled?: boolean; reason?: string }>("inference.intents.claim", ConvexActions.serviceCommands.claimInferenceIntent, input.workflowRunId, { claim: withoutWorkflowRun(input) });
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
  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    if (!apiKey.trim()) throw new Error("An isolated OpenAI API credential is required.");
  }

  async invoke(input: { route: ExactInferenceRoute; body: unknown; signal?: AbortSignal }): Promise<GovernedInferenceTransportResult> {
    if (input.route.provider !== "openai"
      || input.route.providerRoute !== "openai-chat-completions"
      || input.route.endpoint !== "https://api.openai.com/v1/chat/completions"
      || input.route.adapter !== "mission-control-openai-chat-completions"
      || input.route.adapterVersion !== "1.0.0") {
      throw new GovernedInferenceError("ROUTE_OR_ADAPTER_SUBSTITUTION", "The OpenAI transport route does not match the selected exact adapter.");
    }
    const body: Record<string, unknown> | null = input.body && typeof input.body === "object"
      ? { ...(input.body as Record<string, unknown>), model: input.route.modelId }
      : null;
    if (!body || !Array.isArray(body.messages)) {
      throw new GovernedInferenceError("REQUEST_SCHEMA_INVALID", "OpenAI chat-completions requires a messages array.");
    }
    const requestBody = JSON.stringify(body);
    if (new TextEncoder().encode(requestBody).byteLength > MAX_PROVIDER_REQUEST_BYTES) {
      throw new GovernedInferenceError("PROVIDER_REQUEST_TOO_LARGE", "OpenAI request exceeds the governed byte limit.");
    }
    let response: Response;
    try {
      response = await this.fetchImpl(input.route.endpoint, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` },
        body: requestBody,
        signal: input.signal,
        redirect: "error",
      });
    } catch (error) {
      throw new GovernedInferenceError(
        input.signal?.aborted ? "ATTEMPT_CANCELLED_AFTER_DISPATCH" : "TRANSPORT_RESULT_UNKNOWN",
        error instanceof Error ? error.message : String(error),
        "UNKNOWN",
      );
    }
    const providerRequestId = response.headers.get("x-request-id") ?? undefined;
    const text = await boundedResponseText(response, MAX_PROVIDER_RESPONSE_BYTES);
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
  }
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

async function boundedResponseText(response: Response, maximumBytes: number): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    throw new GovernedInferenceError("PROVIDER_RESPONSE_TOO_LARGE", "OpenAI response exceeds the governed byte limit.", "DELIVERED");
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > maximumBytes) {
        await reader.cancel();
        throw new GovernedInferenceError("PROVIDER_RESPONSE_TOO_LARGE", "OpenAI response exceeds the governed byte limit.", "DELIVERED");
      }
      chunks.push(chunk.value);
    }
  } catch (error) {
    if (error instanceof GovernedInferenceError) throw error;
    throw new GovernedInferenceError("PROVIDER_RESPONSE_STREAM_UNKNOWN", "OpenAI response stream ended ambiguously.", "UNKNOWN");
  }
  const combined = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(combined);
}
