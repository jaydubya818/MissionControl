import { it, expect, vi } from "vitest";
import { qualifiedBedrockTransport } from "../bedrockQualifiedTransport.js";
import { bedrockModelRouteBinding } from "../bedrockModelRouteBinding.js";
import { serializeBedrock } from "../bedrockAdapter.js";
import { fixtureRoute, sha } from "./fixtures/bedrockBridgeFixture.js";
const grant = () => ({
  schema: "fdlc-bounded-bedrock-call-authorization/v1" as const,
  approvalReference: "OFFLINE_FIXTURE_ONLY",
  routeDigest: bedrockModelRouteBinding(fixtureRoute).routeDigest,
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
    roleArn: fixtureRoute.roleArn,
    principalArn: grant().expectedStsPrincipalArn,
    accessKeyId: "SYNTHETIC00000000000",
    secretAccessKey: "SYNTHETIC00000000000",
    sessionToken: "SYNTHETIC",
    expiresAt: Date.now() + 60000,
  });
it("SDK fixture uses exact endpoint, static supplied credentials, one attempt and metadata identity", async () => {
  const read = vi.fn(async () => envelope()),
    send = vi.fn(async () => ({
      $metadata: { requestId: "provider-exact-id" },
      output: {},
    })),
    destroy = vi.fn(),
    create = vi.fn((_options: any) => ({ send, destroy }));
  const t = qualifiedBedrockTransport(fixtureRoute, grant(), {
    readCredentials: read,
    createClient: create,
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
it("uses only the explicitly approved named SSO profile without materializing credentials", async () => {
  const profileCredentials = vi.fn(() => async () => ({
    accessKeyId: "SYNTHETIC00000000000",
    secretAccessKey: "SYNTHETIC00000000000",
    sessionToken: "SYNTHETIC",
  }));
  const send = vi.fn(async () => ({ $metadata: { requestId: "provider-profile-id" }, output: {} }));
  const create = vi.fn((_options: any) => ({ send, destroy: vi.fn() }));
  const profileGrant = { ...grant(), credentialsFile: undefined, awsProfile: "fdlc-qualification" };
  const transport = qualifiedBedrockTransport(fixtureRoute, profileGrant, {
    createProfileCredentials: profileCredentials,
    createClient: create,
  });
  await expect(transport.send(wire(), new AbortController().signal)).resolves.toMatchObject({ requestId: "provider-profile-id" });
  expect(profileCredentials).toHaveBeenCalledWith("fdlc-qualification");
  expect(create.mock.calls[0][0].credentials).toBeTypeOf("function");
});
it("rejects default or ambiguous credential sources", () => {
  expect(() => qualifiedBedrockTransport(fixtureRoute, { ...grant(), credentialsFile: undefined, awsProfile: "default" })).toThrow();
  expect(() => qualifiedBedrockTransport(fixtureRoute, { ...grant(), awsProfile: "fdlc-qualification" })).toThrow();
});
it("missing live-call authority fails before any credential read", () => {
  const read = vi.fn();
  expect(() =>
    qualifiedBedrockTransport(
      fixtureRoute,
      { ...grant(), allowModelCalls: false } as any,
      { readCredentials: read },
    ),
  ).toThrow();
  expect(read).not.toHaveBeenCalled();
});
it("wrong account envelope cannot create a client or send", async () => {
  const create = vi.fn();
  const t = qualifiedBedrockTransport(fixtureRoute, grant(), {
    readCredentials: async () =>
      JSON.stringify({
        ...JSON.parse(envelope()),
        awsAccountId: "111111111111",
      }),
    createClient: create,
  });
  await expect(t.send(wire(), new AbortController().signal)).rejects.toThrow(
    "CREDENTIAL_IDENTITY",
  );
  expect(create).not.toHaveBeenCalled();
});
it("provider error is not retried and client is destroyed", async () => {
  const send = vi.fn(async () => {
      throw new Error("fixture timeout");
    }),
    destroy = vi.fn();
  const t = qualifiedBedrockTransport(fixtureRoute, grant(), {
    readCredentials: async () => envelope(),
    createClient: () => ({ send, destroy }),
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
    const t = qualifiedBedrockTransport(fixtureRoute, grant(), {
      readCredentials: read,
      createClient: create,
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
