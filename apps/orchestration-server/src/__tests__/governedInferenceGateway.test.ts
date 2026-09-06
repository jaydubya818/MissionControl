import { readFileSync } from "node:fs";
import { canonicalDigest, type ClassifyInferenceDispatchAllowance } from "@mission-control/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GovernedInferenceError,
  GovernedInferenceGateway,
  OpenAIChatCompletionsTransport,
  type GovernedInferenceLedger,
  type GovernedInferenceRequest,
} from "../governedInferenceGateway.js";
import { prepareClassifyInferenceRequest } from "../governedInferenceWire.js";

const exactRoute = {
  provider: "openai", providerRoute: "openai-chat-completions", modelId: "gpt-4o-mini-2024-07-18",
  routeDigest: `sha256:${"a".repeat(64)}`, adapter: "mission-control-openai-chat-completions",
  adapterVersion: "1.0.0", endpoint: "https://api.openai.com/v1/chat/completions",
};
const classifyBody = () => ({ messages: [{ role: "user", content: "synthetic" }], max_completion_tokens: 1024 });
const digest = `sha256:${"b".repeat(64)}`;

function allowance(overrides: Record<string, unknown> = {}) {
  const prepared = prepareClassifyInferenceRequest(exactRoute, classifyBody());
  const value: Omit<ClassifyInferenceDispatchAllowance, "digest"> = {
    schema: "classify-inference-dispatch/v1", projectId: "p", repositoryId: "repo",
    workOrderId: "work-order", taskId: "task", attemptId: "attempt", reservationId: "reservation",
    reservationLogicalId: "reservation-logical", reservationDigest: digest,
    intentId: "intent-1", intentLogicalId: "intent-logical", intentDigest: digest,
    logicalRequestKey: "p:attempt:step:1", leaseId: "lease", claimId: "claim",
    executionProfileId: "profile", executionProfileDigest: digest, priceBookDigest: digest,
    route: exactRoute, requestDigest: prepared.requestDigest, payloadBytes: prepared.payloadBytes,
    maximumInputTokens: 128000, maximumCacheReadTokens: 128000, maximumOutputTokens: 1024, temperature: null,
    maxCostMicrousd: 100000, maximumPhysicalCalls: 1, issuedAt: 100, validUntil: 30100,
    ...overrides,
  };
  return { ...value, digest: canonicalDigest("classify-inference-dispatch/v1", value) };
}

function transportInput(overrides: Record<string, unknown> = {}) {
  return {
    route: exactRoute, body: classifyBody(),
    preparedRequest: prepareClassifyInferenceRequest(exactRoute, classifyBody()),
    dispatchAllowance: allowance(), ...overrides,
  };
}

afterEach(() => vi.useRealTimers());

const route = (suffix: string) => ({
  provider: "fixture", providerRoute: `fixture-${suffix}`, modelId: `model-${suffix}`,
  routeDigest: `sha256:${suffix.padEnd(64, "0")}`, adapter: "fixture", adapterVersion: "1.0.0",
  endpoint: `https://example.invalid/${suffix}`,
});

describe("OpenAIChatCompletionsTransport", () => {
  it("makes one raw request and preserves provider/cache/reasoning observations", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      id: "chatcmpl-1", model: "gpt-4o-mini-2024-07-18", choices: [], service_tier: "default",
      usage: { prompt_tokens: 20, completion_tokens: 4, prompt_tokens_details: { cached_tokens: 8 }, completion_tokens_details: { reasoning_tokens: 2 } },
    }), { status: 200, headers: { "x-request-id": "req-1", "x-openai-organization": "org-1" } }));
    const transport = new OpenAIChatCompletionsTransport("fixture-key", fetchImpl as typeof fetch, () => 100);
    const result = await transport.invoke(transportInput());
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(exactRoute.endpoint, expect.objectContaining({ body: transportInput().preparedRequest.serializedRequest }));
    expect(result).toMatchObject({
      resolvedProvider: "openai", resolvedModelId: "gpt-4o-mini-2024-07-18", providerRequestId: "req-1",
      providerBillingId: undefined, serviceTier: "default",
      usage: { inputTokens: 12, outputTokens: 4, cacheReadTokens: 8, reasoningTokens: 2 },
    });
  });

  it("denies route substitution and retains observed resolved-model drift", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ model: "gpt-4o", choices: [], usage: {} }), { status: 200 }));
    const transport = new OpenAIChatCompletionsTransport("fixture-key", fetchImpl as typeof fetch, () => 100);
    await expect(transport.invoke(transportInput({ route: { ...exactRoute, endpoint: "https://proxy.invalid/v1/chat/completions" } }))).rejects.toMatchObject({ code: "CLASSIFY_DISPATCH_ALLOWANCE_INVALID" });
    const result = await transport.invoke(transportInput());
    expect(result.resolvedModelId).toBe("gpt-4o");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("does not invent a resolved model observation when the provider omits it", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ choices: [], usage: {} }), { status: 200 }));
    const transport = new OpenAIChatCompletionsTransport("fixture-key", fetchImpl as typeof fetch, () => 100);
    await expect(transport.invoke(transportInput())).resolves.toMatchObject({
      resolvedProvider: "openai",
      resolvedModelId: undefined,
    });
  });

  it("denies redirects and oversized provider responses", async () => {
    const oversized = vi.fn(async () => new Response("x", { status: 200, headers: { "content-length": "1048577" } }));
    const transport = new OpenAIChatCompletionsTransport("fixture-key", oversized as typeof fetch, () => 100);
    await expect(transport.invoke(transportInput())).rejects.toMatchObject({
      code: "PROVIDER_RESPONSE_TOO_LARGE",
      delivery: "DELIVERED",
    });
    expect(oversized).toHaveBeenCalledWith(exactRoute.endpoint, expect.objectContaining({ redirect: "error" }));
  });

  it.each([
    ["missing proof", { dispatchAllowance: undefined }],
    ["mutated proof", { dispatchAllowance: { ...allowance(), maximumOutputTokens: 1 } }],
    ["other request", { dispatchAllowance: allowance({ requestDigest: digest }) }],
    ["other bytes", { dispatchAllowance: allowance({ payloadBytes: 1 }) }],
    ["other output cap", { dispatchAllowance: allowance({ maximumOutputTokens: 1 }) }],
    ["other temperature", { dispatchAllowance: allowance({ temperature: 0 }) }],
    ["other route", { dispatchAllowance: allowance({ route: { ...exactRoute, routeDigest: digest } }) }],
    ["missing wire", { preparedRequest: undefined }],
    ["mutated wire", { preparedRequest: { ...transportInput().preparedRequest, serializedRequest: "{}" } }],
    ["unbounded output", { preparedRequest: { ...transportInput().preparedRequest, maximumOutputTokens: 2048 } }],
  ])("sends zero bytes for %s", async (_name, overrides) => {
    const fetchImpl = vi.fn(async () => new Response("{}"));
    const transport = new OpenAIChatCompletionsTransport("fixture-key", fetchImpl as typeof fetch, () => 100);
    await expect(transport.invoke(transportInput(overrides))).rejects.toMatchObject({ code: "CLASSIFY_DISPATCH_ALLOWANCE_INVALID", delivery: "NOT_DELIVERED" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rechecks cancellation immediately before dispatch", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchImpl = vi.fn(async () => new Response("{}"));
    const transport = new OpenAIChatCompletionsTransport("fixture-key", fetchImpl as typeof fetch, () => 100);
    await expect(transport.invoke(transportInput({ signal: controller.signal }))).rejects.toMatchObject({ code: "ATTEMPT_CANCELLED", delivery: "NOT_DELIVERED" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([99, 30100])("sends zero bytes outside the allowance time window at %i", async (now) => {
    const fetchImpl = vi.fn(async () => new Response("{}"));
    const transport = new OpenAIChatCompletionsTransport("fixture-key", fetchImpl as typeof fetch, () => now);
    await expect(transport.invoke(transportInput())).rejects.toMatchObject({ code: "CLASSIFY_DISPATCH_ALLOWANCE_EXPIRED", delivery: "NOT_DELIVERED" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("consumes a committed claim once even when concurrent callers send it directly", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}"));
    const transport = new OpenAIChatCompletionsTransport("fixture-key", fetchImpl as typeof fetch, () => 100);
    const outcomes = await Promise.allSettled([transport.invoke(transportInput()), transport.invoke(transportInput())]);
    expect(outcomes.map((result) => result.status).sort()).toEqual(["fulfilled", "rejected"]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await expect(transport.invoke(transportInput({ dispatchAllowance: allowance({ validUntil: 30099 }) }))).rejects.toMatchObject({ code: "CLASSIFY_DISPATCH_ALREADY_CONSUMED" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("bounds a stalled response stream by the allowance deadline", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(100);
    const cancel = vi.fn();
    const fetchImpl = vi.fn(async () => new Response(new ReadableStream({ start() {}, cancel })));
    const transport = new OpenAIChatCompletionsTransport("fixture-key", fetchImpl as typeof fetch);
    const pending = transport.invoke(transportInput({ dispatchAllowance: allowance({ validUntil: 110 }) }));
    const result = expect(pending).rejects.toMatchObject({ code: "CLASSIFY_DISPATCH_DEADLINE_EXCEEDED", delivery: "UNKNOWN" });
    await vi.advanceTimersByTimeAsync(11);
    await result;
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("bounds a stalled fetch even when the fetch implementation ignores abort", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(100);
    const fetchImpl = vi.fn(() => new Promise<Response>(() => {}));
    const transport = new OpenAIChatCompletionsTransport("fixture-key", fetchImpl as typeof fetch);
    const pending = transport.invoke(transportInput({ dispatchAllowance: allowance({ validUntil: 110 }) }));
    const result = expect(pending).rejects.toMatchObject({ code: "CLASSIFY_DISPATCH_DEADLINE_EXCEEDED", delivery: "UNKNOWN" });
    await vi.advanceTimersByTimeAsync(11);
    await result;
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels a response that arrives after a fetch deadline", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(100);
    let finishFetch!: (response: Response) => void;
    const fetchImpl = vi.fn(() => new Promise<Response>((resolve) => { finishFetch = resolve; }));
    const transport = new OpenAIChatCompletionsTransport("fixture-key", fetchImpl as typeof fetch);
    const pending = transport.invoke(transportInput({ dispatchAllowance: allowance({ validUntil: 110 }) }));
    const result = expect(pending).rejects.toMatchObject({ code: "CLASSIFY_DISPATCH_DEADLINE_EXCEEDED", delivery: "UNKNOWN" });
    await vi.advanceTimersByTimeAsync(11);
    await result;
    const cancel = vi.fn();
    finishFetch(new Response(new ReadableStream({ start() {}, cancel })));
    await vi.advanceTimersByTimeAsync(0);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels a stalled response on caller abort and removes deadline resources", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(100);
    const controller = new AbortController();
    const removeListener = vi.spyOn(controller.signal, "removeEventListener");
    const cancel = vi.fn();
    const fetchImpl = vi.fn(async () => new Response(new ReadableStream({ start() {}, cancel })));
    const transport = new OpenAIChatCompletionsTransport("fixture-key", fetchImpl as typeof fetch);
    const pending = transport.invoke(transportInput({ signal: controller.signal }));
    const result = expect(pending).rejects.toMatchObject({ code: "ATTEMPT_CANCELLED_AFTER_DISPATCH", delivery: "UNKNOWN" });
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    await result;
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(removeListener).toHaveBeenCalledWith("abort", expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
    await expect(transport.invoke(transportInput())).rejects.toMatchObject({ code: "CLASSIFY_DISPATCH_ALREADY_CONSUMED" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

function request(): GovernedInferenceRequest {
  return {
    projectId: "p", repositoryId: "repo", workflowRunId: "attempt", reservationId: "reservation",
    leaseId: "lease", logicalRequestKey: "p:attempt:step:1", routes: [route("a"), route("b")],
    body: { messages: [{ role: "user", content: "synthetic" }] },
  };
}

function ledger(): GovernedInferenceLedger & { intents: any[]; receipts: any[] } {
  const intents: any[] = [];
  const receipts: any[] = [];
  return {
    intents, receipts,
    async persistIntent(input) {
      if (intents.some((item) => item.logicalRequestKey === input.logicalRequestKey && item.physicalOrdinal === input.physicalOrdinal)) {
        return { intentId: "existing", state: "CLAIMED", created: false };
      }
      const value = { ...input, intentId: `intent-${intents.length + 1}` };
      intents.push(value);
      return { intentId: value.intentId, state: "PERSISTED", created: true };
    },
    async claimIntent() { return { claimed: true }; },
    async appendReceipt(input) { receipts.push(input); return { receiptId: `receipt-${receipts.length}`, created: true }; },
  };
}

describe("GovernedInferenceGateway", () => {
  it("does not replace an observed success when receipt persistence fails", async () => {
    const store = ledger();
    const append = vi.spyOn(store, "appendReceipt").mockRejectedValue(new Error("receipt unavailable"));
    const invoke = vi.fn().mockResolvedValue({ value: "delivered", resolvedProvider: "fixture", usage: { inputTokens: 4 }, responseDigest: digest });
    const gateway = new GovernedInferenceGateway(store, { invoke });
    await expect(gateway.execute(request())).rejects.toThrow("receipt unavailable");
    expect(append).toHaveBeenCalledTimes(1);
    expect(append).toHaveBeenCalledWith(expect.objectContaining({ delivery: "DELIVERED", status: "SUCCEEDED", usage: { inputTokens: 4 } }));
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("persists and claims before exactly one transport call", async () => {
    const store = ledger();
    const invoke = vi.fn(async ({ route: exactRoute }) => ({
      value: "ok", resolvedProvider: exactRoute.provider, resolvedModelId: exactRoute.modelId,
      providerRequestId: "req-1", providerBillingId: "bill-1", usage: { inputTokens: 10, outputTokens: 2 },
      responseDigest: `sha256:${"c".repeat(64)}`,
    }));
    const gateway = new GovernedInferenceGateway(store, { invoke }, () => 100, () => "claim");
    await expect(gateway.execute<string>(request())).resolves.toBe("ok");
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(store.intents).toHaveLength(1);
    expect(store.receipts[0]).toMatchObject({ delivery: "DELIVERED", status: "SUCCEEDED", providerRequestId: "req-1" });
  });

  it("uses only an approved fallback after a definitive non-delivery", async () => {
    const store = ledger();
    const invoke = vi.fn()
      .mockRejectedValueOnce(new GovernedInferenceError("CONNECTION_REFUSED", "not sent", "NOT_DELIVERED"))
      .mockResolvedValueOnce({ value: "fallback", resolvedProvider: "fixture", resolvedModelId: "model-b", usage: { inputTokens: 1, outputTokens: 1 }, responseDigest: `sha256:${"d".repeat(64)}` });
    const gateway = new GovernedInferenceGateway(store, { invoke }, () => 100, () => "claim");
    await expect(gateway.execute<string>(request())).resolves.toBe("fallback");
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(store.intents[1]).toMatchObject({ physicalOrdinal: 2, retryOfIntentId: "intent-1", route: route("b") });
    expect(store.receipts.map((item) => item.status)).toEqual(["FAILED", "SUCCEEDED"]);
  });

  it("never retries after ambiguous delivery", async () => {
    const store = ledger();
    const invoke = vi.fn().mockRejectedValue(new GovernedInferenceError("TIMEOUT_AFTER_DISPATCH", "unknown", "UNKNOWN"));
    const gateway = new GovernedInferenceGateway(store, { invoke }, () => 100, () => "claim");
    await expect(gateway.execute(request())).rejects.toMatchObject({ code: "TIMEOUT_AFTER_DISPATCH" });
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(store.receipts[0]).toMatchObject({ delivery: "UNKNOWN", status: "UNKNOWN", usage: {} });
  });

  it("never retries a definitively delivered provider failure", async () => {
    const store = ledger();
    const invoke = vi.fn().mockRejectedValue(new GovernedInferenceError("PROVIDER_HTTP_400", "rejected", "DELIVERED"));
    const gateway = new GovernedInferenceGateway(store, { invoke }, () => 100, () => "claim");
    await expect(gateway.execute(request())).rejects.toMatchObject({ code: "PROVIDER_HTTP_400" });
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(store.receipts[0]).toMatchObject({ delivery: "DELIVERED", status: "FAILED" });
  });

  it("denies concurrent duplicate logical dispatch before transport", async () => {
    const store = ledger();
    store.intents.push({ logicalRequestKey: request().logicalRequestKey, physicalOrdinal: 1 });
    const invoke = vi.fn();
    const gateway = new GovernedInferenceGateway(store, { invoke });
    await expect(gateway.execute(request())).rejects.toMatchObject({ code: "LOGICAL_REQUEST_IN_PROGRESS" });
    expect(invoke).not.toHaveBeenCalled();
  });

  it("durably cancels a persisted intent before claim without creating a transport receipt", async () => {
    const store = ledger();
    const invoke = vi.fn();
    const claim = vi.spyOn(store, "claimIntent").mockResolvedValue({ claimed: false, cancelled: true, reason: "ATTEMPT_CANCELLED" });
    const gateway = new GovernedInferenceGateway(store, { invoke });
    const controller = new AbortController();
    controller.abort();

    await expect(gateway.execute(request(), controller.signal)).rejects.toMatchObject({ code: "ATTEMPT_CANCELLED" });
    expect(claim).toHaveBeenCalledWith(expect.objectContaining({ cancelRequested: true }));
    expect(invoke).not.toHaveBeenCalled();
    expect(store.receipts).toHaveLength(0);
  });
});

function selectedRequest(): GovernedInferenceRequest {
  return { ...request(), routes: [{ ...exactRoute }], body: classifyBody() };
}

function selectedLedger() {
  const store = ledger();
  vi.spyOn(store, "claimIntent").mockImplementation(async (input) => {
    const intent = store.intents.find((item) => item.intentId === input.intentId);
    return {
      claimed: true,
      dispatchAllowance: allowance({
        intentId: intent.intentId, intentLogicalId: intent.intentKey,
        requestDigest: intent.requestDigest, claimId: input.claimId,
      }),
    };
  });
  return store;
}

describe("selected classify gateway", () => {
  it("denies a legacy boolean claim before OpenAI dispatch", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}"));
    const store = ledger();
    const gateway = new GovernedInferenceGateway(store, new OpenAIChatCompletionsTransport("fixture-key", fetchImpl as typeof fetch, () => 100), () => 100, () => "claim");
    await expect(gateway.execute(selectedRequest())).rejects.toMatchObject({ code: "CLASSIFY_DISPATCH_ALLOWANCE_INVALID" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("freezes exact bytes and scope before persistence and binds their digest into the claim", async () => {
    const input = selectedRequest();
    const prepared = prepareClassifyInferenceRequest(exactRoute, input.body);
    const store = selectedLedger();
    const persist = store.persistIntent.bind(store);
    vi.spyOn(store, "persistIntent").mockImplementation(async (intent) => {
      (input.body as ReturnType<typeof classifyBody>).messages[0].content = "changed after await";
      input.projectId = "other-project";
      input.routes[0].routeDigest = digest;
      return persist(intent);
    });
    const fetchImpl = vi.fn(async () => new Response('{"choices":[]}'));
    const gateway = new GovernedInferenceGateway(store, new OpenAIChatCompletionsTransport("fixture-key", fetchImpl as typeof fetch, () => 100), () => 100, () => "claim");
    await expect(gateway.execute(input)).resolves.toEqual({ choices: [] });
    expect(store.intents[0]).toMatchObject({ requestDigest: prepared.requestDigest, route: exactRoute });
    expect(store.claimIntent).toHaveBeenCalledWith(expect.objectContaining({ dispatch: { contract: "classify-text/v1", payloadBytes: prepared.payloadBytes, maximumOutputTokens: 1024 } }));
    expect(fetchImpl).toHaveBeenCalledWith(exactRoute.endpoint, expect.objectContaining({ body: prepared.serializedRequest }));
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it.each(["projectId", "repositoryId", "attemptId", "reservationId", "intentId", "intentLogicalId", "logicalRequestKey", "leaseId", "claimId"])
    ("denies a well-formed claim for another %s", async (field) => {
      const store = selectedLedger();
      const claim = vi.mocked(store.claimIntent).getMockImplementation()!;
      vi.mocked(store.claimIntent).mockImplementation(async (input) => {
        const result = await claim(input) as { claimed: boolean; dispatchAllowance: ReturnType<typeof allowance> };
        const { digest: _digest, ...body } = result.dispatchAllowance;
        return { claimed: true, dispatchAllowance: allowance({ ...body, [field]: "other" }) };
      });
      const fetchImpl = vi.fn(async () => new Response("{}"));
      const gateway = new GovernedInferenceGateway(store, new OpenAIChatCompletionsTransport("fixture-key", fetchImpl as typeof fetch, () => 100), () => 100, () => "claim");
      await expect(gateway.execute(selectedRequest())).rejects.toMatchObject({ code: "CLASSIFY_DISPATCH_ALLOWANCE_INVALID" });
      expect(fetchImpl).not.toHaveBeenCalled();
    });

  it("denies multiple selected routes before persisting an intent", async () => {
    const store = selectedLedger();
    const fetchImpl = vi.fn(async () => new Response("{}"));
    const gateway = new GovernedInferenceGateway(store, new OpenAIChatCompletionsTransport("fixture-key", fetchImpl as typeof fetch, () => 100));
    await expect(gateway.execute({ ...selectedRequest(), routes: [exactRoute, exactRoute] })).rejects.toMatchObject({ code: "CLASSIFY_ROUTE_COUNT_INVALID" });
    expect(store.intents).toHaveLength(0);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("propagates cancellation that occurs during the durable claim before sending", async () => {
    const controller = new AbortController();
    const store = selectedLedger();
    const claim = vi.mocked(store.claimIntent).getMockImplementation()!;
    vi.mocked(store.claimIntent).mockImplementation(async (input) => {
      const result = await claim(input);
      controller.abort();
      return result;
    });
    const fetchImpl = vi.fn(async () => new Response("{}"));
    const gateway = new GovernedInferenceGateway(store, new OpenAIChatCompletionsTransport("fixture-key", fetchImpl as typeof fetch, () => 100), () => 100, () => "claim");
    await expect(gateway.execute(selectedRequest(), controller.signal)).rejects.toMatchObject({ code: "ATTEMPT_CANCELLED" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("keeps /classify on the strict signal-aware path with no SDK bypass", () => {
    const source = readFileSync(new URL("../index.ts", import.meta.url), "utf8");
    const classify = source.slice(source.indexOf('app.post("/classify"'), source.indexOf("function governedInferenceScope"));
    expect(classify).toContain("max_completion_tokens: 1024");
    expect(classify).toContain("c.req.raw.signal");
    expect(classify).not.toContain('import("openai")');
  });
});
