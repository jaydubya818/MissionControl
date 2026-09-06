import { describe, it, expect, vi } from "vitest";
import {
  responsesToBedrock,
  bedrockToResponses,
} from "../bedrockResponsesProtocol.js";
import { CodexBedrockExecutorAdapter } from "../codexBedrockExecutorAdapter.js";
import { bridgeFixture, sha } from "./fixtures/bedrockBridgeFixture.js";
import {
  CODEX_V1_HARNESS_MANIFEST,
  CODEX_BEDROCK_V1_HARNESS_MANIFEST,
  harnessCapabilityManifestDigest,
  harnessSupportsModel,
} from "@mission-control/workflow-engine";
const request = {
  messages: [
    {
      role: "user" as const,
      content: [{ type: "text" as const, text: "fixture" }],
    },
  ],
  maxOutputTokens: 20,
};
describe("governed Bedrock bridge offline", () => {
  it("admits before send and settles exact provider identity", async () => {
    const f = bridgeFixture();
    const r = await f
      .create()
      .infer("request", request, new AbortController().signal);
    expect(f.sends).toBe(1);
    expect(f.reservation.holds[0]).toMatchObject({
      state: "SETTLED",
      providerRequestId: "fixture-provider-1",
    });
    expect(r.evidence).toMatchObject({
      authority: "NONE",
      providerReturnedModel: null,
      automaticRetries: 0,
    });
  });
  it("prevents transmission when canonical admission fails", async () => {
    const f = bridgeFixture();
    f.authority.reserve = async () => {
      throw new Error("Canonical denial");
    };
    await expect(
      f.create().infer("request", request, new AbortController().signal),
    ).rejects.toThrow("Canonical denial");
    expect(f.sends).toBe(0);
  });
  it("does not replay a duplicate request", async () => {
    const f = bridgeFixture(),
      b = f.create();
    await b.infer("request", request, new AbortController().signal);
    await expect(
      b.infer("request", request, new AbortController().signal),
    ).rejects.toThrow("REPLAY");
    expect(f.sends).toBe(1);
  });
  it("fences concurrent requests while admission is pending", async () => {
    const f = bridgeFixture();
    let release!: () => void;
    const before = f.authority.reserve;
    f.authority.reserve = async (p) => {
      await new Promise<void>((r) => {
        release = r;
      });
      return before(p);
    };
    const b = f.create(),
      first = b.infer("one", request, new AbortController().signal);
    await expect(
      b.infer("two", request, new AbortController().signal),
    ).rejects.toThrow("REPLAY");
    release();
    await first;
    expect(f.sends).toBe(1);
  });
  it("rejects excessive output before send", async () => {
    const f = bridgeFixture();
    await expect(
      f
        .create()
        .infer(
          "request",
          { ...request, maxOutputTokens: 4097 },
          new AbortController().signal,
        ),
    ).rejects.toThrow("BOUND");
    expect(f.sends).toBe(0);
  });
  it("cancellation after admission prevents send and retains hold", async () => {
    const f = bridgeFixture(),
      c = new AbortController(),
      before = f.authority.reserve;
    f.authority.reserve = async (p) => {
      const proof = await before(p);
      c.abort();
      return proof;
    };
    await expect(
      f.create().infer("request", request, c.signal),
    ).rejects.toThrow();
    expect(f.sends).toBe(0);
    expect(f.reservation.holds[0].state).toBe("UNKNOWN");
  });
  it("lost reply retains full liability across bridge replacement", async () => {
    const f = bridgeFixture();
    f.transport.send = async () => {
      throw new Error("lost reply");
    };
    await expect(
      f.create().infer("one", request, new AbortController().signal),
    ).rejects.toThrow("lost reply");
    expect(f.reservation.holds[0]).toMatchObject({
      state: "UNKNOWN",
      maximumNanoUsd: 200020,
    });
    await expect(
      f.create().infer("two", request, new AbortController().signal),
    ).rejects.toThrow("unresolved");
  });
  it("preserves ACTUAL usage when settlement fails before persistence", async () => {
    const f = bridgeFixture();
    const cause = new Error("Accounting unavailable");
    const settle = vi.fn().mockRejectedValueOnce(cause).mockImplementation(f.authority.settle);
    f.authority.settle = settle;
    const bridge = f.create();
    const failure = await bridge.infer("one", request, new AbortController().signal).catch(error => error);

    expect(settle).toHaveBeenCalledTimes(1);
    expect(failure).toMatchObject({
      name: "BedrockSettlementError", code: "BEDROCK_SETTLEMENT_NOT_ACCEPTED", cause,
      projectId: "project", repositoryId: "repo",
      settlementPayload: {
        reservationId: "reservation", workflowRunId: "attempt", leaseId: "lease", generation: 1,
        usage: {
          requestId: "one", requestDigest: f.reservation.holds[0].requestDigest,
          provider: "aws-bedrock", model: f.binding.identity.model,
          providerRequestId: "fixture-provider-1", classification: "ACTUAL",
          inputTokens: 10, outputTokens: 5, expectedReceiptRevision: 0,
        },
      },
    });
    expect(f.reservation.holds[0]).toMatchObject({ state: "RESERVED", maximumNanoUsd: 200020 });
    await expect(bridge.infer("one", request, new AbortController().signal)).rejects.toThrow("REPLAY");
    await expect(bridge.infer("two", request, new AbortController().signal)).rejects.toThrow("REPLAY");
    expect(f.sends).toBe(1);
  });
  it("surfaces an exact accounting replay after the settlement commits but its reply is lost", async () => {
    const f = bridgeFixture();
    const persist = f.authority.settle;
    const cause = new Error("Settlement reply lost");
    const settle = vi.fn(async (payload: Record<string, unknown>) => {
      await persist(payload);
      throw cause;
    });
    f.authority.settle = settle;
    const failure = await f.create().infer("one", request, new AbortController().signal).catch(error => error);

    expect(settle).toHaveBeenCalledTimes(1);
    expect(failure).toMatchObject({ code: "BEDROCK_SETTLEMENT_NOT_ACCEPTED", cause });
    expect(f.reservation.holds[0]).toMatchObject({ state: "SETTLED", receiptRevision: 1 });
    expect(failure.settlementPayload).toEqual(settle.mock.calls[0][0]);
    await expect(persist(failure.settlementPayload)).resolves.toMatchObject({ duplicate: true, incident: false });
    expect(f.reservation.holds[0].receiptRevision).toBe(1);
    expect(f.sends).toBe(1);
  });
  it("retains an isolated frozen settlement payload when an accounting client mutates its input", async () => {
    const f = bridgeFixture();
    f.authority.settle = async (payload) => {
      payload.generation = 999;
      (payload.usage as { inputTokens: number }).inputTokens = 999;
      throw new Error("Accounting client failed");
    };
    const failure = await f.create().infer("one", request, new AbortController().signal).catch(error => error);

    expect(failure.settlementPayload).toMatchObject({ generation: 1, usage: { inputTokens: 10, classification: "ACTUAL" } });
    expect(Object.isFrozen(failure.settlementPayload)).toBe(true);
    expect(Object.isFrozen(failure.settlementPayload.usage)).toBe(true);
    expect(() => { failure.settlementPayload.usage.inputTokens = 20; }).toThrow();
    expect(JSON.stringify(failure.settlementPayload)).not.toContain("fixture complete");
    expect(f.sends).toBe(1);
  });
  it.each([undefined, null, {}, "acknowledged", { incident: true, duplicate: false }, { incident: false, duplicate: true }])
    ("preserves known usage for an unaccepted settlement response %j", async (response) => {
      const f = bridgeFixture();
      const settle = vi.fn(async () => response);
      f.authority.settle = settle;
      const bridge = f.create();
      await expect(bridge.infer("one", request, new AbortController().signal)).rejects.toMatchObject({
        name: "BedrockSettlementError", code: "BEDROCK_SETTLEMENT_NOT_ACCEPTED",
        settlementPayload: { usage: { classification: "ACTUAL", providerRequestId: "fixture-provider-1" } },
      });
      expect(settle).toHaveBeenCalledTimes(1);
      await expect(bridge.infer("two", request, new AbortController().signal)).rejects.toThrow("REPLAY");
      expect(f.sends).toBe(1);
    });
  it("timeout retains liability even for uncooperative fixture", async () => {
    const f = bridgeFixture();
    f.binding.timeoutMs = 10;
    f.transport.send = async () => new Promise(() => {});
    await expect(
      f.create().infer("one", request, new AbortController().signal),
    ).rejects.toThrow("TIMEOUT");
    expect(f.reservation.holds[0].state).toBe("UNKNOWN");
  });
  it.each([
    "requestId",
    "requestDigest",
    "priceDigest",
    "bridgeIdentityDigest",
  ])("rejects substituted proof %s", async (key) => {
    const f = bridgeFixture(),
      before = f.authority.reserve;
    f.authority.reserve = async (p) => ({
      ...(await before(p)),
      [key]: sha("f"),
    });
    await expect(
      f.create().infer("one", request, new AbortController().signal),
    ).rejects.toThrow("PROOF");
    expect(f.sends).toBe(0);
  });
  it("does not retrofit V1 manifest", () => {
    const f = bridgeFixture();
    f.binding.identity.harnessDigest = harnessCapabilityManifestDigest(
      CODEX_V1_HARNESS_MANIFEST,
    );
    expect(() => f.create()).toThrow("BINDING");
    expect(
      harnessSupportsModel(
        CODEX_V1_HARNESS_MANIFEST,
        "aws-bedrock",
        f.binding.route.modelId,
      ),
    ).toBe(false);
    expect(
      harnessSupportsModel(
        CODEX_BEDROCK_V1_HARNESS_MANIFEST,
        "aws-bedrock",
        f.binding.route.modelId,
      ),
    ).toBe(true);
  });
  it("prohibits persistent local execution", async () => {
    await expect(new CodexBedrockExecutorAdapter().prepare()).rejects.toThrow(
      "local execution prohibited",
    );
  });
  it("rejects insufficient canonical balance", async () => {
    const f = bridgeFixture();
    f.reservation.maximumNanoUsd = 1;
    await expect(
      f.create().infer("one", request, new AbortController().signal),
    ).rejects.toThrow("LIABILITY");
    expect(f.sends).toBe(0);
  });
});
describe("Codex local protocol translation", () => {
  const base = {
    model: "anthropic.claude-sonnet-4-6",
    input: "fixture",
    stream: true,
    store: false,
  };
  it("propagates output cap", () =>
    expect(
      responsesToBedrock({ ...base, max_output_tokens: 12 }, 20).request
        .maxOutputTokens,
    ).toBe(12));
  it.each([
    { model: "gpt-5" },
    { previous_response_id: "x" },
    { reasoning: { effort: "high" } },
    { tools: [{ type: "web_search" }] },
    {
      input: [
        { role: "user", content: [{ type: "input_image", image_url: "x" }] },
      ],
    },
    { max_output_tokens: 21 },
    { store: true },
    { include: ["unsupported.output"] },
  ])("rejects unsupported protocol %j", (change) =>
    expect(() => responsesToBedrock({ ...base, ...change }, 20)).toThrow(),
  );
  it("translates exact function tool cycle", () => {
    const t = responsesToBedrock(
      {
        ...base,
        tools: [
          {
            type: "function",
            name: "exec_command",
            parameters: { type: "object" },
          },
        ],
        input: [
          { role: "user", content: "fixture" },
          {
            type: "function_call",
            name: "exec_command",
            call_id: "call_1",
            arguments: '{"cmd":"true"}',
          },
          { type: "function_call_output", call_id: "call_1", output: "ok" },
        ],
      },
      20,
    );
    expect(t.request.messages[1].content[0]).toMatchObject({
      type: "tool_use",
      id: "call_1",
    });
    expect(t.request.messages[2].content[0]).toMatchObject({
      type: "tool_result",
      tool_use_id: "call_1",
    });
  });
  it("translates text custom tool explicitly", () => {
    const t = responsesToBedrock(
      { ...base, tools: [{ type: "custom", name: "apply_patch" }] },
      20,
    );
    const o = bedrockToResponses(
      {
        content: [
          {
            type: "tool_use",
            id: "call",
            name: "apply_patch",
            input: { input: "*** patch" },
          },
        ],
        stopReason: "tool_use",
        providerRequestId: "fixture",
        usage: {
          inputTokens: 1,
          outputTokens: 1,
          cacheReadInputTokens: 0,
          cacheWriteInputTokens: 0,
          reasoning: "DISABLED",
        },
      },
      t,
      "one",
    );
    expect(o.response.output[0]).toMatchObject({
      type: "custom_tool_call",
      input: "*** patch",
    });
    expect(o.events).toContain("response.completed");
  });
});
