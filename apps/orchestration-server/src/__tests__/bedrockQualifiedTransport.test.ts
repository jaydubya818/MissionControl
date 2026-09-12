import { it, expect, vi } from "vitest";
import { qualifiedBedrockTransport } from "../bedrockQualifiedTransport.js";
import { bedrockModelRouteBinding } from "../bedrockModelRouteBinding.js";
import { serializeBedrock } from "../bedrockAdapter.js";
import { fixtureRoute, sha } from "./fixtures/bedrockBridgeFixture.js";
import { bridgeFixture } from "./fixtures/bedrockBridgeFixture.js";
import { liabilityDigest } from "../../../../convex/lib/providerLiability.js";
const price = bridgeFixture().price;
const grant = () => ({
  schema: "fdlc-bounded-bedrock-call-authorization/v1" as const,
  approvalReference: "OFFLINE_FIXTURE_ONLY",
  routeDigest: bedrockModelRouteBinding(fixtureRoute).routeDigest,
  approvedPriceDigest: liabilityDigest(price),
  expectedStsPrincipalArn:
    "arn:aws:sts::000000000000:assumed-role/fixture/test",
  identityEvidenceDigest: sha("a"),
  profileEvidenceDigest: sha("b"),
  credentialsFile: "/never-read/offline-fixture.json",
  validUntil: Date.now() + 60000,
  allowModelCalls: true as const,
});
const wire = () =>
  serializeBedrock(fixtureRoute, "CONVERSE", {
    messages: [{ role: "user", content: [{ type: "text", text: "fixture" }] }],
    maxOutputTokens: 20,
  });
const envelope = () =>
  JSON.stringify({
    awsAccountId: "000000000000",
    principalArn: grant().expectedStsPrincipalArn,
    accessKeyId: "SYNTHETIC00000000000",
    secretAccessKey: "SYNTHETIC00000000000",
    sessionToken: "SYNTHETIC",
    expiresAt: Date.now() + 60000,
  });
const authenticatedSts = () => ({
  send: vi.fn(async () => ({
    Account: fixtureRoute.awsAccountId,
    Arn: fixtureRoute.expectedStsPrincipalArn,
  })),
  destroy: vi.fn(),
});
it("SDK fixture uses exact endpoint, static supplied credentials, one attempt and metadata identity", async () => {
  const read = vi.fn(async () => envelope()),
    send = vi.fn(async () => ({
      $metadata: { requestId: "provider-exact-id" },
      output: {},
    })),
    destroy = vi.fn(),
    create = vi.fn((_options: any) => ({ send, destroy }));
  const t = qualifiedBedrockTransport(fixtureRoute, price, grant(), {
    readCredentials: read,
    createClient: create,
    createStsClient: authenticatedSts,
  });
  expect(read).not.toHaveBeenCalled();
  const result = await t.send(wire(), new AbortController().signal);
  expect(result.requestId).toBe("provider-exact-id");
  expect(create.mock.calls[0][0]).toMatchObject({
    maxAttempts: 1,
    region: "us-east-1",
    endpoint: "https://bedrock-runtime.us-east-1.amazonaws.com",
  });
  expect(send).toHaveBeenCalledTimes(1);
  expect(destroy).toHaveBeenCalledOnce();
});
it("counts the exact request input through the same explicit one-attempt route", async () => {
  const send = vi.fn(async () => ({ inputTokens: 37, $metadata: { requestId: "count-id" } }));
  const destroy = vi.fn();
  const t = qualifiedBedrockTransport(fixtureRoute, price, grant(), {
    readCredentials: async () => envelope(),
    createClient: () => ({ send, destroy }),
    createStsClient: authenticatedSts,
  });
  const result = await t.countInputTokens!(wire(), new AbortController().signal);
  expect(result).toEqual({ inputTokens: 37, requestId: "count-id", classification: "PROVIDER_ACTUAL" });
  expect(send).toHaveBeenCalledOnce();
  expect((send.mock.calls as any[][])[0]![0].input.modelId).toBe(fixtureRoute.foundationModelArn);
  expect(destroy).toHaveBeenCalledOnce();
});
it("uses and caches a conservative UTF-8 byte ceiling only when the exact model rejects CountTokens", async () => {
  const unsupported = Object.assign(new Error("The provided model doesn't support counting tokens"), {
    name: "ValidationException",
    $metadata: { httpStatusCode: 400, requestId: "unsupported-count-id" },
  });
  const send = vi.fn(async () => { throw unsupported; });
  const destroy = vi.fn();
  const t = qualifiedBedrockTransport(fixtureRoute, price, grant(), {
    readCredentials: async () => envelope(),
    createClient: () => ({ send, destroy }),
    createStsClient: authenticatedSts,
  });
  const request = wire();
  const expectedCeiling = Buffer.byteLength(JSON.stringify(request.body));
  await expect(t.countInputTokens!(request, new AbortController().signal)).resolves.toEqual({
    inputTokens: expectedCeiling,
    requestId: "unsupported-count-id",
    classification: "UTF8_BYTE_UPPER_BOUND",
  });
  await expect(t.countInputTokens!(request, new AbortController().signal)).resolves.toEqual({
    inputTokens: expectedCeiling,
    requestId: null,
    classification: "UTF8_BYTE_UPPER_BOUND",
  });
  expect(send).toHaveBeenCalledOnce();
  expect(destroy).toHaveBeenCalledOnce();
});
it("missing live-call authority fails before any credential read", () => {
  const read = vi.fn();
  expect(() =>
    qualifiedBedrockTransport(
      fixtureRoute,
      price,
      { ...grant(), allowModelCalls: false } as any,
      { readCredentials: read, createStsClient: authenticatedSts },
    ),
  ).toThrow();
  expect(read).not.toHaveBeenCalled();
});
it("rejects self-consistent lower rates not bound by the approved price digest", () => {
  const read = vi.fn();
  const lowerPrice = {
    ...price,
    maximumInputTokens: price.maximumInputTokens - 1,
  };
  expect(() =>
    qualifiedBedrockTransport(fixtureRoute, lowerPrice, grant(), {
      readCredentials: read,
      createStsClient: authenticatedSts,
    }),
  ).toThrow("BEDROCK_CALL_AUTHORIZATION_INVALID");
  expect(read).not.toHaveBeenCalled();
});
it("wrong account envelope cannot create a client or send", async () => {
  const create = vi.fn();
  const t = qualifiedBedrockTransport(fixtureRoute, price, grant(), {
    readCredentials: async () =>
      JSON.stringify({
        ...JSON.parse(envelope()),
        awsAccountId: "111111111111",
      }),
    createClient: create,
    createStsClient: authenticatedSts,
  });
  await expect(t.send(wire(), new AbortController().signal)).rejects.toThrow(
    "CREDENTIAL_IDENTITY",
  );
  expect(create).not.toHaveBeenCalled();
});
it("rejects mislabeled credentials using authenticated STS identity before inference", async () => {
  const create = vi.fn();
  const t = qualifiedBedrockTransport(fixtureRoute, price, grant(), {
    readCredentials: async () => envelope(),
    createClient: create,
    createStsClient: () => ({
      send: vi.fn(async () => ({
        Account: fixtureRoute.awsAccountId,
        Arn: "arn:aws:sts::000000000000:assumed-role/broader-role/test",
      })),
      destroy: vi.fn(),
    }),
  });
  await expect(t.send(wire(), new AbortController().signal)).rejects.toThrow(
    "BEDROCK_AUTHENTICATED_PRINCIPAL_MISMATCH",
  );
  expect(create).not.toHaveBeenCalled();
});
it("provider error is not retried and client is destroyed", async () => {
  const send = vi.fn(async () => {
      throw new Error("fixture timeout");
    }),
    destroy = vi.fn();
  const t = qualifiedBedrockTransport(fixtureRoute, price, grant(), {
    readCredentials: async () => envelope(),
    createClient: () => ({ send, destroy }),
    createStsClient: authenticatedSts,
  });
  await expect(t.send(wire(), new AbortController().signal)).rejects.toThrow();
  expect(send).toHaveBeenCalledTimes(1);
  expect(destroy).toHaveBeenCalledOnce();
});
it.each(["modelId", "additionalModelRequestFields", "guardrailConfig"])(
  "denies %s passthrough before reading credentials",
  async (key) => {
    const read = vi.fn(),
      create = vi.fn();
    const t = qualifiedBedrockTransport(fixtureRoute, price, grant(), {
      readCredentials: read,
      createClient: create,
      createStsClient: authenticatedSts,
    });
    const w = wire();
    w.body[key] = "unapproved";
    await expect(t.send(w, new AbortController().signal)).rejects.toThrow(
      "BEDROCK_BODY_FIELD_UNSUPPORTED",
    );
    expect(read).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  },
);
