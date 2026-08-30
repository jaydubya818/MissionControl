import { createHash, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  ShadowProtocolError,
  canonicalDigest,
  createShadowIntakeEvent,
  loadExecutionIntentShadowConfig,
  signTransport,
  verifyExecutionIntentRequest,
} from "../executionIntentShadow.js";
import { validIntent } from "./executionIntentFixture.js";

const NOW = Date.parse("2026-08-30T18:00:00.000Z");
const KEY_ID = "avf-shadow-current";
const SECRET = "test-only-shadow-secret-that-is-at-least-32-characters";
const BEARER = "test-only-shadow-bearer-that-is-at-least-32-characters";
const ORGANIZATION_ID = "org_phase1demo";

describe("ExecutionIntent shadow protocol", () => {
  it("loads disabled mode safely and fails closed on unsafe shadow configuration", () => {
    expect(loadExecutionIntentShadowConfig({} as NodeJS.ProcessEnv)).toEqual({
      mode: "disabled",
    });
    expect(() =>
      loadExecutionIntentShadowConfig({
        AVF_EXECUTION_INTENT_MODE: "execute",
      } as NodeJS.ProcessEnv),
    ).toThrow(/disabled or shadow/);
    expect(() =>
      loadExecutionIntentShadowConfig({
        AVF_EXECUTION_INTENT_MODE: "shadow",
        AVF_EXECUTION_INTENT_ORGANIZATION_ID: ORGANIZATION_ID,
        AVF_EXECUTION_INTENT_BEARER_TOKEN: "weak",
        AVF_EXECUTION_INTENT_KEY_ID: KEY_ID,
        AVF_EXECUTION_INTENT_HMAC_SECRET: SECRET,
        AVF_EXECUTION_INTENT_CONVEX_SUBJECT: "service:venture-factory",
        CONVEX_SERVICE_AUTH_TOKEN: "test-only-convex-service-auth-token",
      } as NodeJS.ProcessEnv),
    ).toThrow(/bearer/i);
    expect(() =>
      loadExecutionIntentShadowConfig({
        ...shadowEnvironment(),
        AVF_EXECUTION_INTENT_PREVIOUS_KEY_ID: "old-key",
      } as NodeJS.ProcessEnv),
    ).toThrow(/previous/i);
  });

  it("verifies a canonical, bounded, organization-scoped request", () => {
    const intent = validIntent();
    const body = JSON.stringify(intent);
    const nonce = randomUUID();
    const headers = signedHeaders(body, intent.idempotency_key, nonce);

    expect(
      verifyExecutionIntentRequest({
        body,
        headers,
        method: "POST",
        path: "/v1/execution-intents",
        config: enabledConfig(),
        now: NOW,
      }),
    ).toMatchObject({
      intent,
      requestDigest: canonicalDigest(intent),
      nonce,
      idempotencyKey: intent.idempotency_key,
    });
  });

  it("rejects stale, tampered, cross-organization, unsupported, and authority-bearing requests", () => {
    const assertCode = (
      intent: Record<string, unknown>,
      mutateHeaders?: (headers: Headers) => void,
      now = NOW,
    ) => {
      const body = JSON.stringify(intent);
      const headers = signedHeaders(
        body,
        String(intent.idempotency_key),
        randomUUID(),
      );
      mutateHeaders?.(headers);
      expect(() =>
        verifyExecutionIntentRequest({
          body,
          headers,
          method: "POST",
          path: "/v1/execution-intents",
          config: enabledConfig(),
          now,
        }),
      ).toThrow(ShadowProtocolError);
    };

    assertCode({ ...validIntent(), organization_id: "org_other1" });
    assertCode({ ...validIntent(), schema_version: "execution-intent/v2" });
    assertCode({ ...validIntent(), command: "rm -rf /" });
    assertCode(validIntent(), (headers) =>
      headers.set("x-avf-content-digest", `sha256:${"0".repeat(64)}`),
    );
    assertCode(validIntent(), (headers) =>
      headers.set("x-avf-signature", `sha256=${"0".repeat(64)}`),
    );
    assertCode(validIntent(), (headers) =>
      headers.set("x-avf-timestamp", String(NOW - 5 * 60_000 - 1)),
    );
  });

  it("rejects malformed JSON, unknown keys, future signatures, and non-JSON media", () => {
    const config = enabledConfig();
    const intent = validIntent();
    const body = JSON.stringify(intent);
    const base = signedHeaders(body, intent.idempotency_key, randomUUID());
    const verify = (candidateBody: string, headers: Headers) =>
      verifyExecutionIntentRequest({
        body: candidateBody,
        headers,
        method: "POST",
        path: "/v1/execution-intents",
        config,
        now: NOW,
      });

    expect(() => verify("{", base)).toThrow(ShadowProtocolError);
    const unknownKey = new Headers(base);
    unknownKey.set("x-avf-key-id", "unknown-key");
    expect(() => verify(body, unknownKey)).toThrow(ShadowProtocolError);
    const future = new Headers(base);
    future.set("x-avf-timestamp", String(NOW + 30_001));
    expect(() => verify(body, future)).toThrow(ShadowProtocolError);
    const wrongMedia = new Headers(base);
    wrongMedia.set("content-type", "text/plain");
    expect(() => verify(body, wrongMedia)).toThrow(ShadowProtocolError);
  });

  it("accepts the previous key only when an exact rotation pair is configured", () => {
    const previousSecret =
      "test-only-previous-secret-that-is-at-least-32-characters";
    const intent = validIntent();
    const body = JSON.stringify(intent);
    const nonce = randomUUID();
    const timestamp = String(NOW);
    const digest = canonicalDigest(intent);
    const headers = new Headers({
      authorization: `Bearer ${BEARER}`,
      "content-type": "application/json",
      "idempotency-key": intent.idempotency_key,
      "x-avf-key-id": "avf-shadow-previous",
      "x-avf-timestamp": timestamp,
      "x-avf-nonce": nonce,
      "x-avf-content-digest": digest,
      "x-avf-signature": signTransport(previousSecret, {
        method: "POST",
        path: "/v1/execution-intents",
        keyId: "avf-shadow-previous",
        timestamp,
        nonce,
        idempotencyKey: intent.idempotency_key,
        contentDigest: digest,
      }),
    });
    const config = loadExecutionIntentShadowConfig({
      ...shadowEnvironment(),
      AVF_EXECUTION_INTENT_PREVIOUS_KEY_ID: "avf-shadow-previous",
      AVF_EXECUTION_INTENT_PREVIOUS_HMAC_SECRET: previousSecret,
    });
    if (config.mode !== "shadow")
      throw new Error("Expected shadow configuration");
    expect(
      verifyExecutionIntentRequest({
        body,
        headers,
        method: "POST",
        path: "/v1/execution-intents",
        config,
        now: NOW,
      }).keyId,
    ).toBe("avf-shadow-previous");
  });

  it("creates only the sequence-one no-authority intake event", () => {
    const intent = validIntent();
    const event = createShadowIntakeEvent(
      intent,
      "mcint_shadow123456",
      "mcevt_shadow123456",
      NOW,
    );
    expect(event).toMatchObject({
      type: "mission_control.intent.accepted",
      sequence: 1,
      data: {
        status: "INTAKE_ACCEPTED",
        external_references: {},
        software_acceptance: { accepted: false },
      },
    });
    expect(JSON.stringify(event)).not.toMatch(
      /work_order|attempt_id|pull_request|release/i,
    );
  });
});

function shadowEnvironment(): NodeJS.ProcessEnv {
  return {
    AVF_EXECUTION_INTENT_MODE: "shadow",
    AVF_EXECUTION_INTENT_ORGANIZATION_ID: ORGANIZATION_ID,
    AVF_EXECUTION_INTENT_BEARER_TOKEN: BEARER,
    AVF_EXECUTION_INTENT_KEY_ID: KEY_ID,
    AVF_EXECUTION_INTENT_HMAC_SECRET: SECRET,
    AVF_EXECUTION_INTENT_CONVEX_SUBJECT: "service:venture-factory",
    CONVEX_SERVICE_AUTH_TOKEN: "test-only-convex-service-auth-token",
  };
}

function enabledConfig() {
  const config = loadExecutionIntentShadowConfig(shadowEnvironment());
  if (config.mode !== "shadow")
    throw new Error("Expected shadow configuration");
  return config;
}

function signedHeaders(
  body: string,
  idempotencyKey: string,
  nonce: string,
): Headers {
  const parsed = JSON.parse(body);
  const contentDigest = canonicalDigest(parsed);
  const timestamp = String(NOW);
  return new Headers({
    authorization: `Bearer ${BEARER}`,
    "content-type": "application/json",
    "idempotency-key": idempotencyKey,
    "x-avf-key-id": KEY_ID,
    "x-avf-timestamp": timestamp,
    "x-avf-nonce": nonce,
    "x-avf-content-digest": contentDigest,
    "x-avf-signature": signTransport(SECRET, {
      method: "POST",
      path: "/v1/execution-intents",
      keyId: KEY_ID,
      timestamp,
      nonce,
      idempotencyKey,
      contentDigest,
    }),
  });
}
