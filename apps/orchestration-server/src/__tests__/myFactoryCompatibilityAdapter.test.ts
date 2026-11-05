import { randomBytes } from "node:crypto";
import { expect, it } from "vitest";
import { COMPATIBILITY_PROTOCOL, signFixtureEnvelope, verifyFixtureEnvelope, MyFactoryCompatibilityAdapter,
  type FixtureEnvelope, type FixtureKey } from "../myFactoryCompatibilityAdapter.js";
const key: FixtureKey = { id: "test-key", secret: randomBytes(32), tenantId: "tenant", projectId: "project", factoryId: "factory", validUntil: 100000, revoked: false };
const envelope: FixtureEnvelope = { protocol: COMPATIBILITY_PROTOCOL, keyId: key.id, tenantId: key.tenantId, projectId: key.projectId,
  factoryId: key.factoryId, bindingDigest: "sha256:" + "a".repeat(64), operation: "ADMIT", nonce: "12345678-1234-4234-8234-123456789012",
  expiresAt: 10000, payload: { request: "fixture" }, requestDigest: null };
const expected = { bindingDigest: envelope.bindingDigest, operation: envelope.operation, requestDigest: null };
it("authenticates exact scoped request bytes", () => {
  expect(verifyFixtureEnvelope(signFixtureEnvelope(envelope, key, "REQUEST"), key, "REQUEST", expected, 1)).toEqual(envelope);
});
it.each(["tenantId", "projectId", "factoryId", "keyId", "bindingDigest", "operation", "nonce", "protocol", "requestDigest", "payload"])("denies tampered %s", field => {
  const signed = signFixtureEnvelope(envelope, key, "REQUEST");
  expect(() => verifyFixtureEnvelope({ ...signed, envelope: { ...signed.envelope, [field]: "tampered" } }, key, "REQUEST", expected, 1)).toThrow("DENIED");
});
it.each(["tenantId", "projectId", "factoryId"])("denies correctly signed foreign %s", field => {
  const foreign = { ...envelope, [field]: "foreign" };
  expect(() => verifyFixtureEnvelope(signFixtureEnvelope(foreign, key, "REQUEST"), key, "REQUEST", expected, 1)).toThrow("DENIED");
});
it.each(["revoked", "expired", "wrong-key", "wrong-direction", "future", "response-replay", "extra-field"])("denies %s", fault => {
  const alteredKey = { ...key };
  if (fault === "revoked") alteredKey.revoked = true;
  if (fault === "expired") alteredKey.validUntil = 0;
  if (fault === "wrong-key") alteredKey.secret = randomBytes(32);
  let signed = signFixtureEnvelope(fault === "future" ? { ...envelope, expiresAt: 99999 } : envelope, key, "REQUEST");
  if (fault === "extra-field") signed = { ...signed, extra: true } as typeof signed;
  expect(() => verifyFixtureEnvelope(signed, alteredKey, fault === "wrong-direction" ? "RESPONSE" : "REQUEST",
    fault === "response-replay" ? { ...expected, requestDigest: "different" } : expected, 1)).toThrow("DENIED");
});
it("denies expired request envelopes", () => {
  expect(() => verifyFixtureEnvelope(signFixtureEnvelope(envelope, key, "REQUEST"), key, "REQUEST", expected, 10000)).toThrow();
});
it.each(["https://127.0.0.1:3399/compatibility", "http://localhost:3399/compatibility", "http://example.test:3399/compatibility", "http://127.0.0.1:3399/other"])("cannot address non-fixture endpoint %s", endpoint => {
  expect(() => new MyFactoryCompatibilityAdapter({ endpoint } as ConstructorParameters<typeof MyFactoryCompatibilityAdapter>[0])).toThrow();
});
