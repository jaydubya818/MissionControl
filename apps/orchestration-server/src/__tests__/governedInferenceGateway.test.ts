import { describe, expect, it, vi } from "vitest";
import {
  GovernedInferenceError,
  GovernedInferenceGateway,
  OpenAIChatCompletionsTransport,
  type GovernedInferenceLedger,
  type GovernedInferenceRequest,
} from "../governedInferenceGateway.js";

const route = (suffix: string) => ({
  provider: "fixture", providerRoute: `fixture-${suffix}`, modelId: `model-${suffix}`,
  routeDigest: `sha256:${suffix.padEnd(64, "0")}`, adapter: "fixture", adapterVersion: "1.0.0",
  endpoint: `https://example.invalid/${suffix}`,
});

describe("OpenAIChatCompletionsTransport", () => {
  const exactRoute = {
    provider: "openai", providerRoute: "openai-chat-completions", modelId: "gpt-4o-mini-2024-07-18",
    routeDigest: `sha256:${"a".repeat(64)}`, adapter: "mission-control-openai-chat-completions",
    adapterVersion: "1.0.0", endpoint: "https://api.openai.com/v1/chat/completions",
  };

  it("makes one raw request and preserves provider/cache/reasoning observations", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      id: "chatcmpl-1", model: "gpt-4o-mini-2024-07-18", choices: [], service_tier: "default",
      usage: { prompt_tokens: 20, completion_tokens: 4, prompt_tokens_details: { cached_tokens: 8 }, completion_tokens_details: { reasoning_tokens: 2 } },
    }), { status: 200, headers: { "x-request-id": "req-1", "x-openai-organization": "org-1" } }));
    const transport = new OpenAIChatCompletionsTransport("fixture-key", fetchImpl as typeof fetch);
    const result = await transport.invoke({ route: exactRoute, body: { messages: [] } });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      resolvedProvider: "openai", resolvedModelId: "gpt-4o-mini-2024-07-18", providerRequestId: "req-1",
      providerBillingId: undefined, serviceTier: "default",
      usage: { inputTokens: 12, outputTokens: 4, cacheReadTokens: 8, reasoningTokens: 2 },
    });
  });

  it("fails closed on endpoint, adapter, and resolved-model drift", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ model: "gpt-4o", choices: [], usage: {} }), { status: 200 }));
    const transport = new OpenAIChatCompletionsTransport("fixture-key", fetchImpl as typeof fetch);
    await expect(transport.invoke({ route: { ...exactRoute, endpoint: "https://proxy.invalid/v1/chat/completions" }, body: { messages: [] } })).rejects.toMatchObject({ code: "ROUTE_OR_ADAPTER_SUBSTITUTION" });
    const result = await transport.invoke({ route: exactRoute, body: { messages: [] } });
    expect(result.resolvedModelId).toBe("gpt-4o");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("does not invent a resolved model observation when the provider omits it", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ choices: [], usage: {} }), { status: 200 }));
    const transport = new OpenAIChatCompletionsTransport("fixture-key", fetchImpl as typeof fetch);
    await expect(transport.invoke({ route: exactRoute, body: { messages: [] } })).resolves.toMatchObject({
      resolvedProvider: "openai",
      resolvedModelId: undefined,
    });
  });

  it("denies redirects and oversized provider responses", async () => {
    const oversized = vi.fn(async () => new Response("x", { status: 200, headers: { "content-length": "1048577" } }));
    const transport = new OpenAIChatCompletionsTransport("fixture-key", oversized as typeof fetch);
    await expect(transport.invoke({ route: exactRoute, body: { messages: [] } })).rejects.toMatchObject({
      code: "PROVIDER_RESPONSE_TOO_LARGE",
      delivery: "DELIVERED",
    });
    expect(oversized).toHaveBeenCalledWith(exactRoute.endpoint, expect.objectContaining({ redirect: "error" }));
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
