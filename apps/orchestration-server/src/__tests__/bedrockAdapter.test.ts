import { bedrockModelRouteBinding } from "../bedrockModelRouteBinding.js";
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  bedrockRouteSchema,
  verifyBedrockProfile,
  BEDROCK_DESTINATIONS,
  BEDROCK_MODEL,
  BEDROCK_PROFILE,
} from "../bedrockRoute.js";
import {
  serializeBedrock,
  parseBedrock,
  invokeBedrockFixture,
  classifyBedrockError,
  type BedrockApi,
  type BedrockRequest,
} from "../bedrockAdapter.js";
import {
  bedrockFixturePrice,
  type BedrockPriceContract,
} from "../bedrockPricing.js";
import { bedrockIamSpecification } from "../bedrockIam.js";
import {
  invokeReservedBedrockFixture,
  type BedrockReservationStore,
} from "../bedrockBudgetAdapter.js";
import {
  liabilityDigest,
  type ProviderReservation,
  type ProviderRequestAuthority,
} from "../../../../convex/lib/providerLiability.js";

// Every identity, rate, request and response below is OFFLINE / FIXTURE only.
const frozen = JSON.parse(
  readFileSync(
    new URL(
      "../../../../docs/software-factory/fdlc-bedrock-qualification-inputs.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const route = bedrockRouteSchema.parse({
  ...frozen,
  awsAccountId: "000000000000",
  projectEnvironmentId: "OFFLINE-FIXTURE",
  roleArn: "arn:aws:iam::000000000000:role/fixture",
  inferenceProfileArn: `arn:aws:bedrock:us-east-1:000000000000:inference-profile/${BEDROCK_PROFILE}`,
});
const request: BedrockRequest = {
  messages: [
    { role: "user", content: [{ type: "text", text: "Fixture only" }] },
  ],
  maxOutputTokens: 20,
};
const response = {
  output: { message: { role: "assistant", content: [{ text: "Fixture" }] } },
  stopReason: "end_turn",
  usage: { inputTokens: 3, outputTokens: 2, totalTokens: 5 },
};
const invokeResponse = {
  model: BEDROCK_MODEL,
  role: "assistant",
  content: [{ type: "text", text: "Fixture" }],
  stop_reason: "end_turn",
  usage: { input_tokens: 3, output_tokens: 2 },
};
const priceContract: BedrockPriceContract = {
  schema: "fdlc-bedrock-price/v1",
  qualification: "OFFLINE_FIXTURE",
  version: "fixture",
  effectiveAt: 1,
  expiresAt: 10000,
  currency: "USD",
  billingUnit: "MILLION_TOKENS",
  provenance: {
    url: "https://example.test/fixture",
    evidenceDigest: `sha256:${"a".repeat(64)}`,
  },
  ratesNanoUsdPerMillion: {
    input: 1000001,
    output: 2000000,
    cacheRead: 1,
    cacheWrite5m: 1,
    cacheWrite1h: 1,
    reasoning: 2000000,
  },
  cacheMode: "DISABLED",
  reasoningMode: "DISABLED",
  reasoningBilling: "INCLUDED_IN_OUTPUT",
  otherBillableDimensions: "NONE",
  maximumInputTokens: 100,
  maximumOutputTokens: 20,
  maximumPayloadBytes: 8192,
  inputBoundEvidence: "fixture only",
  outputBoundEvidence: "fixture only",
};
function budgetFixture(api: BedrockApi = "CONVERSE") {
  const price = bedrockFixturePrice(priceContract, api, 100);
  const scope = {
    projectId: "fixture",
    repositoryId: "fixture",
    workOrderId: "fixture",
    workOrderRevision: 1,
    executionProfileId: "fixture",
    executionProfileDigest: `sha256:${"b".repeat(64)}`,
    modelRouteDigest: bedrockModelRouteBinding(route).routeDigest,
    priceDigest: liabilityDigest(price),
  };
  let state: ProviderReservation = {
    schema: "factory-provider-reservation/v1",
    scope,
    maximumNanoUsd: 240,
    expiresAt: 10000,
    maximumRequests: 1,
    frozen: false,
    holds: [],
  };
  let queue = Promise.resolve();
  const store: BedrockReservationStore = {
    transaction<T>(
      change: (r: ProviderReservation) => {
        reservation: ProviderReservation;
        value: T;
      },
    ): Promise<T> {
      const operation = queue.then(() => {
        const result = change(structuredClone(state));
        state = result.reservation;
        return result.value;
      });
      queue = operation.then(
        () => {},
        () => {},
      );
      return operation;
    },
  };
  const authority: ProviderRequestAuthority = {
    attemptId: "fixture",
    leaseId: "fixture",
    generation: 1,
    leaseExpiresAt: 10000,
    current: true,
    canceled: false,
    scope,
  };
  const send = vi.fn(async () => ({
    body: api === "CONVERSE" ? response : invokeResponse,
    requestId: "provider-fixture-1",
  }));
  const args = {
    route,
    api,
    request,
    requestId: "request-fixture-1",
    price,
    authority,
    store,
    transport: { evidenceClass: "OFFLINE_FIXTURE" as const, send },
    signal: new AbortController().signal,
    timeoutMs: 100,
    now: () => 100,
  };
  return { args, send, state: () => state };
}
describe("canonical price/provider join", () => {
  it("matches the canonical exact route provider", () => {
    expect(bedrockFixturePrice(priceContract, "CONVERSE", 100).provider).toBe(bedrockModelRouteBinding(route).snapshot.provider);
  });
});

describe("OFFLINE / FIXTURE exact Bedrock route", () => {
  it("accepts only an exact active profile relationship", () =>
    expect(
      verifyBedrockProfile(route, {
        inferenceProfileArn: route.inferenceProfileArn,
        inferenceProfileId: BEDROCK_PROFILE,
        status: "ACTIVE",
        type: "SYSTEM_DEFINED",
        models: BEDROCK_DESTINATIONS.map((region) => ({
          modelArn: `arn:aws:bedrock:${region}::foundation-model/${BEDROCK_MODEL}`,
        })),
      }),
    ).toEqual({ validated: true, authority: "NONE" }));
  it.each(
    Object.entries({
      provider: "other",
      region: "us-west-2",
      modelId: "other",
      foundationModelArn: "other",
      inferenceProfileId: "global." + BEDROCK_MODEL,
      inferenceProfileArn: "other",
      globalInference: true,
      topology: "EU",
      awsAccountId: "111111111111",
      roleArn: "arn:aws:iam::111111111111:role/other",
      allowedDestinationRegions: ["us-east-1", "us-east-2", "eu-west-1"],
    }),
  )("rejects %s", (key, value) =>
    expect(() =>
      bedrockRouteSchema.parse({ ...route, [key]: value }),
    ).toThrow(),
  );
  it("rejects missing or duplicate destinations from profile inspection", () =>
    expect(() =>
      verifyBedrockProfile(route, {
        inferenceProfileArn: route.inferenceProfileArn,
        inferenceProfileId: BEDROCK_PROFILE,
        status: "ACTIVE",
        type: "SYSTEM_DEFINED",
        models: [],
      }),
    ).toThrow());
});
describe("OFFLINE / FIXTURE Bedrock serialization and parsing", () => {
  it.each(["CONVERSE", "INVOKE_MODEL"] as const)(
    "serializes %s with exact ARN and output bound",
    (api) => {
      const wire = serializeBedrock(route, api, request);
      expect(wire.modelId).toBe(route.inferenceProfileArn);
      expect(wire.maxAttempts).toBe(1);
      expect(
        api === "CONVERSE"
          ? (wire.body.inferenceConfig as any).maxTokens
          : wire.body.max_tokens,
      ).toBe(20);
      const result = parseBedrock(
        api,
        api === "CONVERSE" ? response : invokeResponse,
        "aws-request-fixture",
      );
      expect(result.usage.inputTokens).toBe(3);
      expect(result.providerRequestId).toBe("aws-request-fixture");
    },
  );
  it.each(["CONVERSE", "INVOKE_MODEL"] as const)(
    "round trips tool continuation %s",
    (api) => {
      const b =
        api === "CONVERSE"
          ? {
              ...response,
              stopReason: "tool_use",
              output: {
                message: {
                  role: "assistant",
                  content: [
                    {
                      toolUse: {
                        toolUseId: "call1",
                        name: "read_file",
                        input: { path: "fixture" },
                      },
                    },
                  ],
                },
              },
            }
          : {
              ...invokeResponse,
              stop_reason: "tool_use",
              content: [
                {
                  type: "tool_use",
                  id: "call1",
                  name: "read_file",
                  input: { path: "fixture" },
                },
              ],
            };
      const result = parseBedrock(api, b, "aws-fixture");
      const wire = serializeBedrock(route, api, {
        ...request,
        tools: [
          {
            name: "read_file",
            description: "fixture tool",
            input_schema: { type: "object" },
          },
        ],
        messages: [
          ...request.messages,
          { role: "assistant", content: result.content },
          {
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: "call1",
                content: "fixture result",
              },
            ],
          },
        ],
      });
      expect(JSON.stringify(wire.body)).toContain("fixture result");
    },
  );
  it.each([
    { ...request, maxOutputTokens: 0 },
    { ...request, maxOutputTokens: 64001 },
    { ...request, thinking: { type: "enabled" } },
    {
      ...request,
      messages: [
        {
          role: "user",
          content: [
            { type: "tool_result", tool_use_id: "unknown", content: "x" },
          ],
        },
      ],
    },
  ])("rejects unsupported or unbounded request", (q) =>
    expect(() => serializeBedrock(route, "CONVERSE", q as any)).toThrow(),
  );
  it.each([
    null,
    {},
    {
      ...response,
      usage: { inputTokens: 3, outputTokens: -1, totalTokens: 2 },
    },
    { ...response, usage: { inputTokens: 3, outputTokens: 2, totalTokens: 9 } },
    {
      ...response,
      usage: {
        inputTokens: 3,
        outputTokens: 2,
        totalTokens: 5,
        cacheWriteInputTokens: 1,
      },
    },
  ])("fails closed for invalid or unexpected usage", (r) =>
    expect(() => parseBedrock("CONVERSE", r, "aws-fixture")).toThrow(),
  );
  it("does not accept a body ID as request attribution", () =>
    expect(() => parseBedrock("CONVERSE", response, undefined)).toThrow());
  it("rejects a changed reported model", () =>
    expect(() =>
      parseBedrock(
        "INVOKE_MODEL",
        { ...invokeResponse, model: "other" },
        "fixture",
      ),
    ).toThrow());
  it.each([
    "ThrottlingException",
    "ServiceUnavailableException",
    "AccessDeniedException",
    "ModelTimeoutException",
  ])("classifies %s without retry", (name) =>
    expect(
      classifyBedrockError(Object.assign(new Error("fixture"), { name })),
    ).toMatchObject({ name, automaticRetry: false, outcome: "UNKNOWN" }),
  );
  it("aborts a hanging transport and ignores late results", async () => {
    let signal: AbortSignal | undefined;
    await expect(
      invokeBedrockFixture(
        {
          evidenceClass: "OFFLINE_FIXTURE",
          send: async (_w, s) => {
            signal = s;
            return new Promise(() => {});
          },
        },
        serializeBedrock(route, "CONVERSE", request),
        { signal: new AbortController().signal, timeoutMs: 5 },
      ),
    ).rejects.toThrow("TIMEOUT_UNKNOWN");
    expect(signal?.aborted).toBe(true);
  });
});
describe("OFFLINE / FIXTURE price and hard liability", () => {
  it("rounds fractional nano-USD rates upward", () =>
    expect(
      bedrockFixturePrice(priceContract, "CONVERSE", 100).inputNanoUsdPerToken,
    ).toBe(2));
  it.each([
    { ...priceContract, qualification: "UNQUALIFIED" },
    { ...priceContract, expiresAt: 50 },
    { ...priceContract, currency: "EUR" },
    { ...priceContract, billingUnit: "TOKENS" },
    { ...priceContract, inputBoundEvidence: "" },
  ])("rejects unqualified or incomplete price contracts", (p) =>
    expect(() => bedrockFixturePrice(p as any, "CONVERSE", 100)).toThrow(),
  );
  it.each(["CONVERSE", "INVOKE_MODEL"] as const)(
    "reserves before %s send and settles retained maximum",
    async (api) => {
      const f = budgetFixture(api);
      f.send.mockImplementation(async () => {
        expect(f.state().holds[0].state).toBe("RESERVED");
        return {
          body: api === "CONVERSE" ? response : invokeResponse,
          requestId: "provider-fixture-1",
        };
      });
      await invokeReservedBedrockFixture(f.args);
      expect(f.state().holds[0]).toMatchObject({
        state: "SETTLED",
        maximumNanoUsd: 240,
        accountedNanoUsd: 10,
      });
    },
  );
  it("serializes competing reservations and admits only one send", async () => {
    const f = budgetFixture();
    const r = await Promise.allSettled([
      invokeReservedBedrockFixture(f.args),
      invokeReservedBedrockFixture({ ...f.args, requestId: "request2" }),
    ]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(f.send).toHaveBeenCalledTimes(1);
  });
  it("denies replay without another send", async () => {
    const f = budgetFixture();
    await invokeReservedBedrockFixture(f.args);
    await expect(invokeReservedBedrockFixture(f.args)).rejects.toThrow(
      "REQUEST_REPLAY",
    );
    expect(f.send).toHaveBeenCalledTimes(1);
  });
  it("retains unknown holds on throttling without retry", async () => {
    const f = budgetFixture();
    f.send.mockRejectedValue(
      Object.assign(new Error("fixture"), { name: "ThrottlingException" }),
    );
    await expect(invokeReservedBedrockFixture(f.args)).rejects.toThrow(
      "fixture",
    );
    expect(f.state().holds[0].state).toBe("UNKNOWN");
    expect(f.send).toHaveBeenCalledTimes(1);
  });
  it("retains unknown usage and freezes an observed overrun", async () => {
    const f = budgetFixture();
    f.send.mockResolvedValue({
      body: {
        ...response,
        usage: { inputTokens: 3, outputTokens: 21, totalTokens: 24 },
      },
      requestId: "provider-fixture-1",
    });
    await expect(invokeReservedBedrockFixture(f.args)).rejects.toThrow(
      "OVERRUN",
    );
    expect(f.state()).toMatchObject({
      frozen: true,
      holds: [expect.objectContaining({ state: "OVERRUN" })],
    });
  });
  it("does not send when already canceled", async () => {
    const f = budgetFixture();
    const c = new AbortController();
    c.abort();
    await expect(
      invokeReservedBedrockFixture({ ...f.args, signal: c.signal }),
    ).rejects.toThrow();
    expect(f.send).not.toHaveBeenCalled();
    expect(f.state().holds).toHaveLength(0);
  });
  it("denies payload excess before sending", async () => {
    const f = budgetFixture();
    await expect(
      invokeReservedBedrockFixture({
        ...f.args,
        request: { ...request, system: "x".repeat(9000) },
      }),
    ).rejects.toThrow("REQUEST_NOT_BOUNDED");
    expect(f.send).not.toHaveBeenCalled();
  });
  it("denies changed route digest before reserving", async () => {
    const f = budgetFixture();
    await expect(
      invokeReservedBedrockFixture({
        ...f.args,
        route: { ...route, projectEnvironmentId: "other" },
      }),
    ).rejects.toThrow("ROUTE_MISMATCH");
    expect(f.send).not.toHaveBeenCalled();
  });
});
describe("OFFLINE IAM specification", () => {
  it("does not allow broad actions, wildcard models, or immediate invocation", () => {
    const p = bedrockIamSpecification(route);
    expect(p.authority).toBe("NONE");
    expect(
      p.inspectionPolicy.Statement.find((s) => s.Sid === "HoldAllInference")
        ?.Effect,
    ).toBe("Deny");
    for (const s of [
      ...p.inspectionPolicy.Statement,
      ...p.laterInvocationPolicy.Statement,
    ])
      if (s.Effect === "Allow") {
        expect(s.Action).not.toContain("bedrock:*");
        expect(JSON.stringify(s.Resource)).not.toContain("*");
      }
    expect(JSON.stringify(p)).not.toContain("global.anthropic");
  });
});

describe("OFFLINE additional failure boundaries", () => {
  it("keeps full hold after timeout and ignores a late response", async () => {
    const f = budgetFixture();
    let finish: (v: any) => void = () => {};
    f.send.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await expect(
      invokeReservedBedrockFixture({ ...f.args, timeoutMs: 5 }),
    ).rejects.toThrow("TIMEOUT_UNKNOWN");
    expect(f.state().holds[0]).toMatchObject({
      state: "UNKNOWN",
      maximumNanoUsd: 240,
    });
    finish({ body: response, requestId: "late-fixture" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(f.state().holds[0].state).toBe("UNKNOWN");
    expect(f.send).toHaveBeenCalledTimes(1);
  });
  it("propagates in-flight cancellation and keeps the hold", async () => {
    const f = budgetFixture();
    const c = new AbortController();
    let abortSignal: AbortSignal | undefined;
    f.args.transport.send = vi.fn(
      async (_wire: unknown, signal: AbortSignal) => {
        abortSignal = signal;
        queueMicrotask(() => c.abort());
        return new Promise(() => {});
      },
    );
    await expect(
      invokeReservedBedrockFixture({ ...f.args, signal: c.signal }),
    ).rejects.toThrow("CANCELED_UNKNOWN");
    expect(abortSignal?.aborted).toBe(true);
    expect(f.state().holds[0].state).toBe("UNKNOWN");
  });
  it("cannot send if the durable reservation store fails", async () => {
    const f = budgetFixture();
    await expect(
      invokeReservedBedrockFixture({
        ...f.args,
        store: {
          transaction: async () => {
            throw new Error("store unavailable");
          },
        },
      }),
    ).rejects.toThrow("store unavailable");
    expect(f.send).not.toHaveBeenCalled();
  });
  it("retains the reservation if settlement storage fails", async () => {
    const f = budgetFixture();
    const transaction = f.args.store.transaction.bind(f.args.store);
    let calls = 0;
    f.args.store.transaction = async (change) => {
      if (++calls === 2) throw new Error("settlement unavailable");
      return transaction(change);
    };
    await expect(invokeReservedBedrockFixture(f.args)).rejects.toThrow(
      "settlement unavailable",
    );
    expect(f.state().holds[0].state).toBe("UNKNOWN");
  });
  it("rejects a live transport marker before creating liability", async () => {
    const f = budgetFixture();
    await expect(
      invokeReservedBedrockFixture({
        ...f.args,
        transport: { ...f.args.transport, evidenceClass: "LIVE" as any },
      }),
    ).rejects.toThrow();
    expect(f.send).not.toHaveBeenCalled();
    expect(f.state().holds).toHaveLength(0);
  });
  it("rejects unmodeled reasoning usage", () =>
    expect(() =>
      parseBedrock(
        "INVOKE_MODEL",
        {
          ...invokeResponse,
          usage: { ...invokeResponse.usage, reasoning_tokens: 3 },
        },
        "fixture",
      ),
    ).toThrow());
  it("rejects unsupported reasoning content", () =>
    expect(() =>
      parseBedrock(
        "CONVERSE",
        {
          ...response,
          output: {
            message: {
              role: "assistant",
              content: [{ reasoningContent: { reasoningText: { text: "x" } } }],
            },
          },
        },
        "fixture",
      ),
    ).toThrow());
  it("rejects a changed profile model with unchanged destinations", () =>
    expect(() =>
      verifyBedrockProfile(route, {
        inferenceProfileArn: route.inferenceProfileArn,
        inferenceProfileId: BEDROCK_PROFILE,
        status: "ACTIVE",
        type: "SYSTEM_DEFINED",
        models: BEDROCK_DESTINATIONS.map((region) => ({
          modelArn: `arn:aws:bedrock:${region}::foundation-model/other`,
        })),
      }),
    ).toThrow());
  it("rejects usage arithmetic overflow", () => {
    const f = budgetFixture();
    f.args.price.inputNanoUsdPerToken = Number.MAX_SAFE_INTEGER;
    f.args.authority.scope.priceDigest = liabilityDigest(f.args.price);
    return expect(invokeReservedBedrockFixture(f.args)).rejects.toThrow();
  });
});

it("OFFLINE: fences authority expiring between reservation and send", async () => {
  const f = budgetFixture();
  let reads = 0;
  await expect(
    invokeReservedBedrockFixture({
      ...f.args,
      now: () => (++reads === 1 ? 100 : 10001),
    }),
  ).rejects.toThrow("TRANSPORT_NOT_BOUNDED");
  expect(f.send).not.toHaveBeenCalled();
  expect(f.state().holds[0].state).toBe("UNKNOWN");
});

it("OFFLINE: freezes the priced output bound across async reservation", async () => {
  const f = budgetFixture();
  const args = { ...f.args, request: structuredClone(request) };
  const transaction = args.store.transaction.bind(args.store);
  args.store.transaction = async (change) => {
    args.request.maxOutputTokens = 1;
    return transaction(change);
  };
  await invokeReservedBedrockFixture(args);
  expect(f.state().holds[0].maximumOutputTokens).toBe(20);
  expect(f.state().holds[0].maximumNanoUsd).toBe(240);
});
