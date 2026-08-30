import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import canonicalize from "canonicalize";
import { Hono } from "hono";

const TRANSPORT_VERSION = "avf-execution-intent-transport-v1";
const POST_PATH = "/v1/execution-intents";
const REPLAY_WINDOW_MS = 5 * 60_000;
const FUTURE_SKEW_MS = 30_000;
const MAX_BODY_BYTES = 256 * 1024;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^sha256:[a-f0-9]{64}$/;
const SIGNATURE = /^sha256=[a-f0-9]{64}$/;
const SAFE_ID = /^[A-Za-z][A-Za-z0-9_-]{5,127}$/;
const SAFE_KEY_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{2,99}$/;
const SAFE_SUBJECT = /^[A-Za-z0-9][A-Za-z0-9:._/-]{2,199}$/;
const EXECUTION_INSTRUCTION_FIELDS = new Set([
  "command",
  "commands",
  "dispatch",
  "executor",
  "instructions",
  "script",
  "shell",
  "work_order",
  "workOrder",
  "attempt",
]);

const contractRelativePath =
  "contracts/venture-factory/v1/execution-intent.schema.json";
const contractCandidates = [
  resolve(process.cwd(), contractRelativePath),
  resolve(process.cwd(), "../..", contractRelativePath),
  fileURLToPath(new URL(`../../../${contractRelativePath}`, import.meta.url)),
  fileURLToPath(
    new URL(`../../../../${contractRelativePath}`, import.meta.url),
  ),
];
const contractPath = contractCandidates.find(existsSync);
if (!contractPath)
  throw new Error("ExecutionIntent/v1 contract is unavailable");
const intentSchema = JSON.parse(readFileSync(contractPath, "utf8"));
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const validateIntentSchema = ajv.compile(intentSchema);

export type DisabledExecutionIntentShadowConfig = { mode: "disabled" };
export type EnabledExecutionIntentShadowConfig = {
  mode: "shadow";
  organizationId: string;
  bearerToken: string;
  serviceSubject: string;
  currentKey: { keyId: string; secret: string };
  previousKey?: { keyId: string; secret: string };
};
export type ExecutionIntentShadowConfig =
  | DisabledExecutionIntentShadowConfig
  | EnabledExecutionIntentShadowConfig;

export interface ShadowEventRecord {
  sequence: number;
  eventDigest: string;
  event: Record<string, unknown>;
}

export interface ShadowIntentRecord {
  intentId: string;
  organizationId: string;
  serviceSubject: string;
  idempotencyKey: string;
  requestDigest: string;
  requestJson: string;
  mode: "SHADOW";
  status: "INTAKE_ACCEPTED";
  missionControlCorrelationId: string;
  latestSequence: 1;
  createdAt: number;
  updatedAt: number;
  executionObjectsCreated: false;
  softwareAcceptance: false;
  events: ShadowEventRecord[];
}

export interface ExecutionIntentShadowStore {
  intake(input: {
    intentId: string;
    organizationId: string;
    serviceSubject: string;
    idempotencyKey: string;
    requestDigest: string;
    requestJson: string;
    transportNonce: string;
    transportKeyId: string;
    transportTimestamp: number;
    receiptExpiresAt: number;
    missionControlCorrelationId: string;
    eventId: string;
    eventJson: string;
    eventDigest: string;
    receivedAt: number;
  }): Promise<
    | {
        outcome: "CREATED" | "DUPLICATE" | "CONFLICT";
        record: ShadowIntentRecord;
      }
    | { outcome: "REPLAY" }
  >;
  get(input: {
    intentId: string;
    organizationId: string;
    serviceSubject: string;
  }): Promise<ShadowIntentRecord | null>;
  events(input: {
    intentId: string;
    organizationId: string;
    serviceSubject: string;
  }): Promise<ShadowEventRecord[] | null>;
}

export class ShadowProtocolError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ShadowProtocolError";
  }
}

export function loadExecutionIntentShadowConfig(
  env: NodeJS.ProcessEnv,
): ExecutionIntentShadowConfig {
  const rawMode =
    env.AVF_EXECUTION_INTENT_MODE?.trim().toLowerCase() || "disabled";
  if (rawMode !== "disabled" && rawMode !== "shadow") {
    throw new Error("AVF_EXECUTION_INTENT_MODE must be disabled or shadow");
  }
  if (rawMode === "disabled") return { mode: "disabled" };

  const organizationId = required(env, "AVF_EXECUTION_INTENT_ORGANIZATION_ID");
  const bearerToken = required(env, "AVF_EXECUTION_INTENT_BEARER_TOKEN");
  const keyId = required(env, "AVF_EXECUTION_INTENT_KEY_ID");
  const secret = required(env, "AVF_EXECUTION_INTENT_HMAC_SECRET");
  const serviceSubject = required(env, "AVF_EXECUTION_INTENT_CONVEX_SUBJECT");
  const convexServiceToken = required(env, "CONVEX_SERVICE_AUTH_TOKEN");
  if (!SAFE_ID.test(organizationId))
    throw new Error("AVF ExecutionIntent organization identifier is unsafe");
  if (bearerToken.length < 32 || bearerToken.length > 512)
    throw new Error(
      "AVF ExecutionIntent bearer token must contain 32-512 characters",
    );
  if (convexServiceToken.length < 16 || convexServiceToken.length > 4096)
    throw new Error("Convex service authentication token is invalid");
  if (
    bearerToken === convexServiceToken ||
    bearerToken === env.ORCHESTRATION_API_TOKEN?.trim()
  ) {
    throw new Error(
      "AVF ExecutionIntent bearer token must be dedicated to the provider boundary",
    );
  }
  validateSigningKey("current", keyId, secret);
  if (!SAFE_SUBJECT.test(serviceSubject))
    throw new Error("AVF ExecutionIntent Convex subject is unsafe");

  const previousKeyId = env.AVF_EXECUTION_INTENT_PREVIOUS_KEY_ID?.trim();
  const previousSecret = env.AVF_EXECUTION_INTENT_PREVIOUS_HMAC_SECRET?.trim();
  if (Boolean(previousKeyId) !== Boolean(previousSecret)) {
    throw new Error(
      "AVF ExecutionIntent previous key ID and secret must be configured together",
    );
  }
  const previousKey =
    previousKeyId && previousSecret
      ? { keyId: previousKeyId, secret: previousSecret }
      : undefined;
  if (previousKey) {
    validateSigningKey("previous", previousKey.keyId, previousKey.secret);
    if (previousKey.keyId === keyId)
      throw new Error(
        "AVF ExecutionIntent current and previous key IDs must differ",
      );
  }
  return {
    mode: "shadow",
    organizationId,
    bearerToken,
    serviceSubject,
    currentKey: { keyId, secret },
    ...(previousKey ? { previousKey } : {}),
  };
}

export function createExecutionIntentShadowApp(
  config: ExecutionIntentShadowConfig,
  store: ExecutionIntentShadowStore,
  dependencies: { now?: () => number; nonce?: () => string } = {},
): Hono {
  const app = new Hono();
  const replayCache = new NonceReplayCache();
  const now = () => dependencies.now?.() ?? Date.now();
  const nonce = () => dependencies.nonce?.() ?? randomUUID();

  app.use("*", async (context, next) => {
    if (config.mode === "disabled") {
      return context.json(
        {
          error: {
            code: "SHADOW_DISABLED",
            message: "ExecutionIntent shadow intake is disabled",
          },
        },
        503,
      );
    }
    if (context.req.header("origin")) {
      return signedJson(
        config,
        {
          error: {
            code: "BROWSER_ORIGIN_DENIED",
            message: "Browser-origin requests are not accepted",
          },
        },
        403,
        fullPath(context.req.path),
        "",
        now(),
        nonce(),
      );
    }
    if (
      !bearerMatches(context.req.header("authorization"), config.bearerToken)
    ) {
      return signedJson(
        config,
        { error: { code: "UNAUTHORIZED", message: "Unauthorized" } },
        401,
        fullPath(context.req.path),
        "",
        now(),
        nonce(),
      );
    }
    await next();
  });

  app.post("/", async (context) => {
    if (config.mode === "disabled")
      return context.json({ error: { code: "SHADOW_DISABLED" } }, 503);
    const contentLength = context.req.header("content-length");
    if (
      contentLength &&
      (!/^\d+$/.test(contentLength) || Number(contentLength) > MAX_BODY_BYTES)
    ) {
      return signedJson(
        config,
        {
          error: {
            code: "PAYLOAD_TOO_LARGE",
            message: "Request exceeds 256 KiB",
          },
        },
        413,
        POST_PATH,
        "",
        now(),
        nonce(),
      );
    }
    const body = await context.req.text();
    try {
      const verified = verifyExecutionIntentRequest({
        body,
        headers: context.req.raw.headers,
        method: "POST",
        path: POST_PATH,
        config,
        now: now(),
      });
      if (!replayCache.consume(verified.nonce, now())) {
        throw new ShadowProtocolError(
          "REPLAYED_NONCE",
          "Transport nonce has already been consumed",
          409,
        );
      }
      const correlationId = providerId("mcint", nonce());
      const eventId = providerId("mcevt", nonce());
      const event = createShadowIntakeEvent(
        verified.intent,
        correlationId,
        eventId,
        now(),
      );
      const eventJson = canonicalJson(event);
      const result = await store.intake({
        intentId: verified.intent.intent_id,
        organizationId: verified.intent.organization_id,
        serviceSubject: config.serviceSubject,
        idempotencyKey: verified.idempotencyKey,
        requestDigest: verified.requestDigest,
        requestJson: verified.canonicalBody,
        transportNonce: verified.nonce,
        transportKeyId: verified.keyId,
        transportTimestamp: verified.timestamp,
        receiptExpiresAt: verified.timestamp + REPLAY_WINDOW_MS,
        missionControlCorrelationId: correlationId,
        eventId,
        eventJson,
        eventDigest: canonicalDigest(event),
        receivedAt: now(),
      });
      if (result.outcome === "REPLAY") {
        throw new ShadowProtocolError(
          "REPLAYED_NONCE",
          "Transport nonce has already been consumed",
          409,
        );
      }
      const status =
        result.outcome === "CREATED" ? "ACCEPTED_FOR_PLANNING" : result.outcome;
      const responseBody: Record<string, unknown> = {
        schema_version: "execution-intent-response/v1",
        intent_id: verified.intent.intent_id,
        idempotency_key: verified.idempotencyKey,
        request_digest: verified.requestDigest,
        status,
        mission_control_correlation_id:
          result.record.missionControlCorrelationId,
        received_at: new Date(now()).toISOString(),
        reasons: [
          {
            code:
              status === "ACCEPTED_FOR_PLANNING"
                ? "SHADOW_ONLY_NO_DISPATCH"
                : status === "DUPLICATE"
                  ? "EXACT_REQUEST_ALREADY_RECORDED"
                  : "IDEMPOTENCY_CONFLICT",
            message:
              status === "ACCEPTED_FOR_PLANNING"
                ? "Shadow intake recorded; no planning or execution object was created"
                : status === "DUPLICATE"
                  ? "The exact immutable intent was already recorded"
                  : "The idempotency key or intent ID is bound to different immutable content",
          },
        ],
        ...(status === "DUPLICATE"
          ? {
              existing_result_reference: `execution-intents/${verified.intent.intent_id}`,
            }
          : {}),
      };
      const httpStatus =
        status === "ACCEPTED_FOR_PLANNING"
          ? 202
          : status === "DUPLICATE"
            ? 200
            : 409;
      return signedJson(
        config,
        responseBody,
        httpStatus,
        POST_PATH,
        verified.idempotencyKey,
        now(),
        nonce(),
      );
    } catch (error) {
      const failure =
        error instanceof ShadowProtocolError
          ? error
          : new ShadowProtocolError(
              "INTAKE_FAILED",
              "ExecutionIntent shadow intake failed",
              500,
            );
      return signedJson(
        config,
        { error: { code: failure.code, message: failure.message } },
        failure.status,
        POST_PATH,
        context.req.header("idempotency-key") ?? "",
        now(),
        nonce(),
      );
    }
  });

  app.get("/:intentId", async (context) => {
    if (config.mode === "disabled")
      return context.json({ error: { code: "SHADOW_DISABLED" } }, 503);
    const intentId = safeIntentId(context.req.param("intentId"));
    const path = `${POST_PATH}/${intentId}`;
    const record = await store.get({
      intentId,
      organizationId: config.organizationId,
      serviceSubject: config.serviceSubject,
    });
    if (!record)
      return signedJson(
        config,
        {
          error: {
            code: "NOT_FOUND",
            message: "ExecutionIntent was not found",
          },
        },
        404,
        path,
        "",
        now(),
        nonce(),
      );
    return signedJson(
      config,
      reconcileProjection(record),
      200,
      path,
      "",
      now(),
      nonce(),
    );
  });

  app.get("/:intentId/events", async (context) => {
    if (config.mode === "disabled")
      return context.json({ error: { code: "SHADOW_DISABLED" } }, 503);
    const intentId = safeIntentId(context.req.param("intentId"));
    const path = `${POST_PATH}/${intentId}/events`;
    const events = await store.events({
      intentId,
      organizationId: config.organizationId,
      serviceSubject: config.serviceSubject,
    });
    if (!events)
      return signedJson(
        config,
        {
          error: {
            code: "NOT_FOUND",
            message: "ExecutionIntent was not found",
          },
        },
        404,
        path,
        "",
        now(),
        nonce(),
      );
    return signedJson(
      config,
      {
        schema_version: "execution-intent-events/v1",
        intent_id: intentId,
        mode: "SHADOW",
        events,
        software_acceptance: false,
      },
      200,
      path,
      "",
      now(),
      nonce(),
    );
  });

  return app;
}

export function verifyExecutionIntentRequest(input: {
  body: string;
  headers: Headers;
  method: string;
  path: string;
  config: EnabledExecutionIntentShadowConfig;
  now: number;
}): {
  intent: Record<string, any>;
  canonicalBody: string;
  requestDigest: string;
  idempotencyKey: string;
  keyId: string;
  nonce: string;
  timestamp: number;
} {
  if (Buffer.byteLength(input.body, "utf8") > MAX_BODY_BYTES) {
    throw new ShadowProtocolError(
      "PAYLOAD_TOO_LARGE",
      "Request exceeds 256 KiB",
      413,
    );
  }
  if (
    input.headers
      .get("content-type")
      ?.split(";", 1)[0]
      ?.trim()
      .toLowerCase() !== "application/json"
  ) {
    throw new ShadowProtocolError(
      "UNSUPPORTED_MEDIA_TYPE",
      "Content-Type must be application/json",
      415,
    );
  }
  if (
    !bearerMatches(
      input.headers.get("authorization") ?? undefined,
      input.config.bearerToken,
    )
  ) {
    throw new ShadowProtocolError("UNAUTHORIZED", "Unauthorized", 401);
  }
  let intent: unknown;
  try {
    intent = JSON.parse(input.body);
  } catch {
    throw new ShadowProtocolError(
      "INVALID_JSON",
      "Request body is not valid JSON",
      400,
    );
  }
  if (!isRecord(intent) || !validateIntentSchema(intent)) {
    throw new ShadowProtocolError(
      "INVALID_EXECUTION_INTENT",
      "Request does not match ExecutionIntent/v1",
      400,
    );
  }
  if (containsExecutionInstructionField(intent)) {
    throw new ShadowProtocolError(
      "AUTHORITY_FIELD_DENIED",
      "Execution-owned instruction fields are prohibited",
      400,
    );
  }
  if (intent.organization_id !== input.config.organizationId) {
    throw new ShadowProtocolError(
      "ORGANIZATION_SCOPE_DENIED",
      "ExecutionIntent organization is outside the configured scope",
      403,
    );
  }
  const idempotencyKey = input.headers.get("idempotency-key") ?? "";
  if (idempotencyKey !== intent.idempotency_key) {
    throw new ShadowProtocolError(
      "IDEMPOTENCY_MISMATCH",
      "Idempotency-Key does not match the immutable intent",
      409,
    );
  }
  const keyId = input.headers.get("x-avf-key-id") ?? "";
  const timestampText = input.headers.get("x-avf-timestamp") ?? "";
  const nonce = input.headers.get("x-avf-nonce") ?? "";
  const claimedDigest = input.headers.get("x-avf-content-digest") ?? "";
  const signature = input.headers.get("x-avf-signature") ?? "";
  if (
    !SAFE_KEY_ID.test(keyId) ||
    !UUID.test(nonce) ||
    !SHA256.test(claimedDigest) ||
    !SIGNATURE.test(signature)
  ) {
    throw new ShadowProtocolError(
      "INVALID_SIGNATURE_FORMAT",
      "ExecutionIntent transport signature is invalid",
      401,
    );
  }
  const timestamp = Number(timestampText);
  if (
    !Number.isSafeInteger(timestamp) ||
    timestamp < input.now - REPLAY_WINDOW_MS ||
    timestamp > input.now + FUTURE_SKEW_MS
  ) {
    throw new ShadowProtocolError(
      "STALE_SIGNATURE",
      "ExecutionIntent signature is outside the replay window",
      401,
    );
  }
  const canonicalBody = canonicalJson(intent);
  const requestDigest = digestCanonical(canonicalBody);
  if (!safeEqual(claimedDigest, requestDigest)) {
    throw new ShadowProtocolError(
      "CONTENT_DIGEST_MISMATCH",
      "ExecutionIntent content digest does not match",
      401,
    );
  }
  const secret =
    keyId === input.config.currentKey.keyId
      ? input.config.currentKey.secret
      : keyId === input.config.previousKey?.keyId
        ? input.config.previousKey.secret
        : undefined;
  if (!secret)
    throw new ShadowProtocolError(
      "UNKNOWN_SIGNING_KEY",
      "ExecutionIntent signing key is not trusted",
      401,
    );
  const expectedSignature = signTransport(secret, {
    method: input.method,
    path: input.path,
    keyId,
    timestamp: timestampText,
    nonce,
    idempotencyKey,
    contentDigest: requestDigest,
  });
  if (!safeEqual(signature, expectedSignature)) {
    throw new ShadowProtocolError(
      "INVALID_SIGNATURE",
      "ExecutionIntent signature is invalid",
      401,
    );
  }
  return {
    intent,
    canonicalBody,
    requestDigest,
    idempotencyKey,
    keyId,
    nonce,
    timestamp,
  };
}

export function createShadowIntakeEvent(
  intent: Record<string, any>,
  missionControlCorrelationId: string,
  eventId: string,
  at: number,
): Record<string, unknown> {
  return {
    specversion: "1.0",
    schema_version: "execution-event/v1",
    event_id: eventId,
    source: "urn:mission-control:execution-intent-shadow",
    type: "mission_control.intent.accepted",
    subject: `execution-intents/${intent.intent_id}`,
    time: new Date(at).toISOString(),
    sequence: 1,
    datacontenttype: "application/json",
    correlation: {
      intent_id: intent.intent_id,
      mission_control_correlation_id: missionControlCorrelationId,
      correlation_id: intent.correlation.correlation_id,
      causation_id: intent.correlation.causation_id,
    },
    data: {
      status: "INTAKE_ACCEPTED",
      summary: "ExecutionIntent passed shadow intake; no execution occurred",
      reason_codes: ["SHADOW_ONLY_NO_DISPATCH"],
      external_references: {},
      software_acceptance: { accepted: false },
    },
  };
}

export function canonicalTransport(input: {
  method: string;
  path: string;
  keyId: string;
  timestamp: string;
  nonce: string;
  idempotencyKey: string;
  contentDigest: string;
}): string {
  return [
    TRANSPORT_VERSION,
    input.method.toUpperCase(),
    input.path,
    input.keyId,
    input.timestamp,
    input.nonce,
    input.idempotencyKey,
    input.contentDigest,
  ].join("\n");
}

export function signTransport(
  secret: string,
  input: Parameters<typeof canonicalTransport>[0],
): string {
  return `sha256=${createHmac("sha256", secret).update(canonicalTransport(input)).digest("hex")}`;
}

export function canonicalJson(value: unknown): string {
  const result = canonicalize(value);
  if (result === undefined)
    throw new ShadowProtocolError(
      "INVALID_JSON",
      "Value cannot be canonicalized",
      400,
    );
  return result;
}

export function canonicalDigest(value: unknown): string {
  return digestCanonical(canonicalJson(value));
}

export function verifySignedProviderResponse(input: {
  body: unknown;
  path: string;
  idempotencyKey: string;
  headers: Headers;
  keys: ReadonlyMap<string, string>;
  now: number;
}): void {
  const keyId = input.headers.get("x-mc-key-id") ?? "";
  const timestamp = input.headers.get("x-mc-timestamp") ?? "";
  const nonce = input.headers.get("x-mc-nonce") ?? "";
  const digest = input.headers.get("x-mc-content-digest") ?? "";
  const signature = input.headers.get("x-mc-signature") ?? "";
  const signedAt = Number(timestamp);
  if (
    !UUID.test(nonce) ||
    !SHA256.test(digest) ||
    !SIGNATURE.test(signature) ||
    !Number.isSafeInteger(signedAt)
  ) {
    throw new Error("Invalid signed provider response");
  }
  if (
    signedAt < input.now - REPLAY_WINDOW_MS ||
    signedAt > input.now + FUTURE_SKEW_MS
  )
    throw new Error("Stale provider response");
  const secret = input.keys.get(keyId);
  if (!secret || canonicalDigest(input.body) !== digest)
    throw new Error("Untrusted provider response");
  const expected = signTransport(secret, {
    method: "RESPONSE",
    path: input.path,
    keyId,
    timestamp,
    nonce,
    idempotencyKey: input.idempotencyKey,
    contentDigest: digest,
  });
  if (!safeEqual(signature, expected))
    throw new Error("Invalid provider response signature");
}

function reconcileProjection(
  record: ShadowIntentRecord,
): Record<string, unknown> {
  return {
    schema_version: "execution-intent-reconcile/v1",
    intentId: record.intentId,
    organizationId: record.organizationId,
    idempotencyKey: record.idempotencyKey,
    requestDigest: record.requestDigest,
    mode: "SHADOW",
    status: "INTAKE_ACCEPTED",
    missionControlCorrelationId: record.missionControlCorrelationId,
    latestSequence: 1,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    executionObjectsCreated: false,
    softwareAcceptance: false,
  };
}

function signedJson(
  config: EnabledExecutionIntentShadowConfig,
  body: unknown,
  status: number,
  path: string,
  idempotencyKey: string,
  timestamp: number,
  nonce: string,
): Response {
  if (!UUID.test(nonce))
    throw new Error("Provider response nonce must be a UUID");
  const contentDigest = canonicalDigest(body);
  const timestampText = String(timestamp);
  const signature = signTransport(config.currentKey.secret, {
    method: "RESPONSE",
    path,
    keyId: config.currentKey.keyId,
    timestamp: timestampText,
    nonce,
    idempotencyKey,
    contentDigest,
  });
  return Response.json(body, {
    status,
    headers: {
      "x-mc-key-id": config.currentKey.keyId,
      "x-mc-timestamp": timestampText,
      "x-mc-nonce": nonce,
      "x-mc-content-digest": contentDigest,
      "x-mc-signature": signature,
      "cache-control": "no-store",
    },
  });
}

class NonceReplayCache {
  private readonly seen = new Map<string, number>();

  consume(nonce: string, now: number): boolean {
    for (const [seenNonce, consumedAt] of this.seen) {
      if (consumedAt < now - REPLAY_WINDOW_MS) this.seen.delete(seenNonce);
    }
    if (this.seen.has(nonce)) return false;
    this.seen.set(nonce, now);
    return true;
  }
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required in shadow mode`);
  return value;
}

function validateSigningKey(
  label: string,
  keyId: string,
  secret: string,
): void {
  if (!SAFE_KEY_ID.test(keyId))
    throw new Error(`AVF ExecutionIntent ${label} key ID is unsafe`);
  if (secret.length < 32 || secret.length > 512)
    throw new Error(
      `AVF ExecutionIntent ${label} HMAC secret must contain 32-512 characters`,
    );
}

function bearerMatches(header: string | undefined, expected: string): boolean {
  const candidate = header?.startsWith("Bearer ") ? header.slice(7).trim() : "";
  return safeEqual(candidate, expected);
}

function safeEqual(candidate: string, expected: string): boolean {
  const candidateBytes = Buffer.from(candidate, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");
  return (
    candidateBytes.length === expectedBytes.length &&
    timingSafeEqual(candidateBytes, expectedBytes)
  );
}

function digestCanonical(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function safeIntentId(value: string): string {
  if (!SAFE_ID.test(value))
    throw new ShadowProtocolError(
      "INVALID_INTENT_ID",
      "ExecutionIntent identifier is invalid",
      400,
    );
  return value;
}

function providerId(prefix: "mcint" | "mcevt", uuid: string): string {
  if (!UUID.test(uuid))
    throw new Error("Provider identifier entropy must be a UUID");
  return `${prefix}_${uuid.replaceAll("-", "")}`;
}

function fullPath(path: string): string {
  if (path.startsWith(POST_PATH)) return path;
  return path === "/" ? POST_PATH : `${POST_PATH}${path}`;
}

function containsExecutionInstructionField(value: unknown): boolean {
  if (Array.isArray(value))
    return value.some(containsExecutionInstructionField);
  if (!isRecord(value)) return false;
  return Object.entries(value).some(
    ([key, child]) =>
      EXECUTION_INSTRUCTION_FIELDS.has(key) ||
      containsExecutionInstructionField(child),
  );
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
