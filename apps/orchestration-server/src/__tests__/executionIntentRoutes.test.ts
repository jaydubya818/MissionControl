import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  canonicalDigest,
  createExecutionIntentShadowApp,
  loadExecutionIntentShadowConfig,
  signTransport,
  verifySignedProviderResponse,
  type ExecutionIntentShadowStore,
  type ShadowIntentRecord,
} from "../executionIntentShadow.js";
import { validIntent } from "./executionIntentFixture.js";

const NOW = Date.parse("2026-08-30T18:00:00.000Z");
const KEY_ID = "avf-shadow-current";
const SECRET = "test-only-shadow-secret-that-is-at-least-32-characters";
const BEARER = "test-only-shadow-bearer-that-is-at-least-32-characters";

describe("ExecutionIntent shadow routes", () => {
  it("accepts once, deduplicates exactly, conflicts on drift, and signs every response", async () => {
    const store = memoryStore();
    const app = createExecutionIntentShadowApp(config(), store, {
      now: () => NOW,
      nonce: randomUUID,
    });
    const intent = validIntent();

    const accepted = await request(app, intent);
    expect(accepted.status).toBe(202);
    const acceptedBody = await verifiedBody(
      accepted,
      "/",
      intent.idempotency_key,
    );
    expect(acceptedBody).toMatchObject({
      status: "ACCEPTED_FOR_PLANNING",
      intent_id: intent.intent_id,
      reasons: [{ code: "SHADOW_ONLY_NO_DISPATCH" }],
    });

    const duplicate = await request(app, intent);
    expect(duplicate.status).toBe(200);
    expect(
      await verifiedBody(duplicate, "/", intent.idempotency_key),
    ).toMatchObject({
      status: "DUPLICATE",
      existing_result_reference: `execution-intents/${intent.intent_id}`,
    });

    const conflict = await request(app, {
      ...intent,
      desired_business_outcome: {
        ...intent.desired_business_outcome,
        statement:
          "This changed outcome must conflict with the immutable request.",
      },
    });
    expect(conflict.status).toBe(409);
    expect(
      await verifiedBody(conflict, "/", intent.idempotency_key),
    ).toMatchObject({ status: "CONFLICT" });
    expect(store.counts()).toEqual({ intents: 1, events: 1 });
  });

  it("reconciles one shadow record and one sequence-one event without execution authority", async () => {
    const store = memoryStore();
    const app = createExecutionIntentShadowApp(config(), store, {
      now: () => NOW,
      nonce: randomUUID,
    });
    const intent = validIntent();
    await request(app, intent);

    const reconcilePath = `/${intent.intent_id}`;
    const reconcile = await app.request(reconcilePath, {
      headers: { authorization: `Bearer ${BEARER}` },
    });
    expect(reconcile.status).toBe(200);
    expect(await verifiedBody(reconcile, reconcilePath, "")).toMatchObject({
      mode: "SHADOW",
      latestSequence: 1,
      executionObjectsCreated: false,
      softwareAcceptance: false,
    });

    const eventsPath = `/${intent.intent_id}/events`;
    const events = await app.request(eventsPath, {
      headers: { authorization: `Bearer ${BEARER}` },
    });
    const eventBody = (await verifiedBody(events, eventsPath, "")) as any;
    expect(eventBody.events).toHaveLength(1);
    expect(eventBody.events[0].event.data).toMatchObject({
      external_references: {},
      software_acceptance: { accepted: false },
    });
  });

  it("recovers the exact durable correlation after a provider-process restart", async () => {
    const store = memoryStore();
    const firstProcess = createExecutionIntentShadowApp(config(), store, {
      now: () => NOW,
      nonce: randomUUID,
    });
    const intent = validIntent();
    const accepted = (await verifiedBody(
      await request(firstProcess, intent),
      "/",
      intent.idempotency_key,
    )) as any;

    const restartedProcess = createExecutionIntentShadowApp(config(), store, {
      now: () => NOW,
      nonce: randomUUID,
    });
    const duplicate = (await verifiedBody(
      await request(restartedProcess, intent),
      "/",
      intent.idempotency_key,
    )) as any;
    expect(duplicate.status).toBe("DUPLICATE");
    expect(duplicate.mission_control_correlation_id).toBe(
      accepted.mission_control_correlation_id,
    );
    expect(store.counts()).toEqual({ intents: 1, events: 1 });
  });

  it("rejects browser origin, wrong bearer, replay, oversize, cross-org, and disabled mode", async () => {
    const store = memoryStore();
    const app = createExecutionIntentShadowApp(config(), store, {
      now: () => NOW,
      nonce: randomUUID,
    });
    const intent = validIntent();
    const nonce = randomUUID();
    const first = await request(app, intent, nonce);
    expect(first.status).toBe(202);
    expect((await request(app, intent, nonce)).status).toBe(409);
    expect(
      (
        await request(app, intent, randomUUID(), {
          origin: "https://browser.test",
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app, intent, randomUUID(), {
          authorization: "Bearer wrong",
        })
      ).status,
    ).toBe(401);
    expect(
      (await request(app, { ...intent, organization_id: "org_other1" })).status,
    ).toBe(403);
    expect(
      (
        await app.request("/", {
          method: "POST",
          headers: {
            authorization: `Bearer ${BEARER}`,
            "content-type": "application/json",
            "content-length": String(256 * 1024 + 1),
          },
          body: "{}",
        })
      ).status,
    ).toBe(413);

    const disabled = createExecutionIntentShadowApp(
      { mode: "disabled" },
      store,
    );
    expect((await disabled.request("/", { method: "POST" })).status).toBe(503);
  });
});

function config() {
  return loadExecutionIntentShadowConfig({
    AVF_EXECUTION_INTENT_MODE: "shadow",
    AVF_EXECUTION_INTENT_ORGANIZATION_ID: "org_phase1demo",
    AVF_EXECUTION_INTENT_BEARER_TOKEN: BEARER,
    AVF_EXECUTION_INTENT_KEY_ID: KEY_ID,
    AVF_EXECUTION_INTENT_HMAC_SECRET: SECRET,
    AVF_EXECUTION_INTENT_CONVEX_SUBJECT: "service:venture-factory",
    CONVEX_SERVICE_AUTH_TOKEN: "test-only-convex-service-auth-token",
  });
}

async function request(
  app: ReturnType<typeof createExecutionIntentShadowApp>,
  intent: any,
  nonce = randomUUID(),
  overrides: Record<string, string> = {},
) {
  const body = JSON.stringify(intent);
  const digest = canonicalDigest(intent);
  const timestamp = String(NOW);
  const idempotencyKey = intent.idempotency_key;
  return app.request("/", {
    method: "POST",
    headers: {
      authorization: `Bearer ${BEARER}`,
      "content-type": "application/json",
      "idempotency-key": idempotencyKey,
      "x-avf-key-id": KEY_ID,
      "x-avf-timestamp": timestamp,
      "x-avf-nonce": nonce,
      "x-avf-content-digest": digest,
      "x-avf-signature": signTransport(SECRET, {
        method: "POST",
        path: "/v1/execution-intents",
        keyId: KEY_ID,
        timestamp,
        nonce,
        idempotencyKey,
        contentDigest: digest,
      }),
      ...overrides,
    },
    body,
  });
}

async function verifiedBody(
  response: Response,
  routePath: string,
  idempotencyKey: string,
): Promise<unknown> {
  const body = await response.json();
  verifySignedProviderResponse({
    body,
    path:
      routePath === "/"
        ? "/v1/execution-intents"
        : `/v1/execution-intents${routePath}`,
    idempotencyKey,
    headers: response.headers,
    keys: new Map([[KEY_ID, SECRET]]),
    now: NOW,
  });
  return body;
}

function memoryStore(): ExecutionIntentShadowStore & {
  counts(): { intents: number; events: number };
} {
  const records = new Map<string, ShadowIntentRecord>();
  const keys = new Map<string, string>();
  const nonces = new Set<string>();
  return {
    async intake(input) {
      if (nonces.has(input.transportNonce))
        return { outcome: "REPLAY" as const };
      nonces.add(input.transportNonce);
      const keyedIntent = keys.get(input.idempotencyKey);
      const existing = keyedIntent
        ? records.get(keyedIntent)
        : records.get(input.intentId);
      if (existing) {
        return existing.intentId === input.intentId &&
          existing.requestDigest === input.requestDigest
          ? { outcome: "DUPLICATE" as const, record: existing }
          : { outcome: "CONFLICT" as const, record: existing };
      }
      const record: ShadowIntentRecord = {
        intentId: input.intentId,
        organizationId: input.organizationId,
        serviceSubject: input.serviceSubject,
        idempotencyKey: input.idempotencyKey,
        requestDigest: input.requestDigest,
        requestJson: input.requestJson,
        mode: "SHADOW",
        status: "INTAKE_ACCEPTED",
        missionControlCorrelationId: input.missionControlCorrelationId,
        latestSequence: 1,
        createdAt: input.receivedAt,
        updatedAt: input.receivedAt,
        executionObjectsCreated: false,
        softwareAcceptance: false,
        events: [
          {
            sequence: 1,
            eventDigest: input.eventDigest,
            event: JSON.parse(input.eventJson),
          },
        ],
      };
      records.set(input.intentId, record);
      keys.set(input.idempotencyKey, input.intentId);
      return { outcome: "CREATED" as const, record };
    },
    async get(input) {
      const record = records.get(input.intentId);
      return record?.organizationId === input.organizationId ? record : null;
    },
    async events(input) {
      const record = records.get(input.intentId);
      return record?.organizationId === input.organizationId
        ? record.events
        : null;
    },
    counts: () => ({
      intents: records.size,
      events: [...records.values()].reduce(
        (sum, record) => sum + record.events.length,
        0,
      ),
    }),
  };
}
