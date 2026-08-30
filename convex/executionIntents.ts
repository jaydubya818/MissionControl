import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  assertExecutionIntentServiceScope,
  decideExecutionIntentIntake,
} from "./lib/executionIntentShadow";

const SAFE_ID = /^[A-Za-z][A-Za-z0-9_-]{5,127}$/;
const SHA256 = /^sha256:[a-f0-9]{64}$/;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const scopeArgs = {
  intentId: v.string(),
  organizationId: v.string(),
  serviceSubject: v.string(),
};

export const intake = mutation({
  args: {
    ...scopeArgs,
    idempotencyKey: v.string(),
    requestDigest: v.string(),
    requestJson: v.string(),
    transportNonce: v.string(),
    transportKeyId: v.string(),
    transportTimestamp: v.number(),
    receiptExpiresAt: v.number(),
    missionControlCorrelationId: v.string(),
    eventId: v.string(),
    eventJson: v.string(),
    eventDigest: v.string(),
    receivedAt: v.number(),
  },
  handler: async (ctx, args) => {
    await authorize(ctx, args.organizationId, args.serviceSubject);
    assertInput(args);

    const expiredReceipts = await ctx.db
      .query("executionIntentTransportReceipts")
      .withIndex("by_expires_at", (q) => q.lt("expiresAt", args.receivedAt - 1))
      .take(100);
    await Promise.all(
      expiredReceipts.map((receipt) => ctx.db.delete(receipt._id)),
    );

    const replay = await ctx.db
      .query("executionIntentTransportReceipts")
      .withIndex("by_service_nonce", (q) =>
        q
          .eq("serviceSubject", args.serviceSubject)
          .eq("nonce", args.transportNonce),
      )
      .first();
    if (replay) return { outcome: "REPLAY" as const };

    const [existingByIdempotency, existingByIntent] = await Promise.all([
      ctx.db
        .query("executionIntents")
        .withIndex("by_idempotency", (q) =>
          q
            .eq("organizationId", args.organizationId)
            .eq("idempotencyKey", args.idempotencyKey),
        )
        .first(),
      ctx.db
        .query("executionIntents")
        .withIndex("by_intent", (q) =>
          q
            .eq("organizationId", args.organizationId)
            .eq("intentId", args.intentId),
        )
        .first(),
    ]);
    const decision = decideExecutionIntentIntake(
      existingByIdempotency,
      existingByIntent,
      args,
    );

    if (decision !== "CREATE") {
      const existing = existingByIdempotency ?? existingByIntent;
      if (!existing)
        throw new Error(
          "ExecutionIntent policy returned an impossible decision.",
        );
      await ctx.db.insert("executionIntentTransportReceipts", {
        organizationId: args.organizationId,
        serviceSubject: args.serviceSubject,
        nonce: args.transportNonce,
        keyId: args.transportKeyId,
        transportTimestamp: args.transportTimestamp,
        expiresAt: args.receiptExpiresAt,
        requestDigest: args.requestDigest,
        idempotencyKey: args.idempotencyKey,
        intentId: args.intentId,
        outcome: decision,
        receivedAt: args.receivedAt,
      });
      const events = await loadEvents(
        ctx,
        existing.organizationId,
        existing.intentId,
      );
      return { outcome: decision, record: toRecord(existing, events) };
    }

    const intentDocumentId = await ctx.db.insert("executionIntents", {
      intentId: args.intentId,
      organizationId: args.organizationId,
      serviceSubject: args.serviceSubject,
      idempotencyKey: args.idempotencyKey,
      requestDigest: args.requestDigest,
      requestJson: args.requestJson,
      mode: "SHADOW",
      status: "INTAKE_ACCEPTED",
      missionControlCorrelationId: args.missionControlCorrelationId,
      latestSequence: 1,
      executionObjectsCreated: false,
      softwareAcceptance: false,
      createdAt: args.receivedAt,
      updatedAt: args.receivedAt,
    });
    await ctx.db.insert("executionIntentEvents", {
      intentId: args.intentId,
      organizationId: args.organizationId,
      sequence: 1,
      eventId: args.eventId,
      eventDigest: args.eventDigest,
      eventJson: args.eventJson,
      createdAt: args.receivedAt,
    });
    await ctx.db.insert("executionIntentTransportReceipts", {
      organizationId: args.organizationId,
      serviceSubject: args.serviceSubject,
      nonce: args.transportNonce,
      keyId: args.transportKeyId,
      transportTimestamp: args.transportTimestamp,
      expiresAt: args.receiptExpiresAt,
      requestDigest: args.requestDigest,
      idempotencyKey: args.idempotencyKey,
      intentId: args.intentId,
      outcome: "CREATED",
      receivedAt: args.receivedAt,
    });
    const record = await ctx.db.get(intentDocumentId);
    if (!record)
      throw new Error("ExecutionIntent shadow record was not persisted.");
    return {
      outcome: "CREATED" as const,
      record: toRecord(record, [
        {
          sequence: 1,
          eventDigest: args.eventDigest,
          event: JSON.parse(args.eventJson),
        },
      ]),
    };
  },
});

export const get = query({
  args: scopeArgs,
  handler: async (ctx, args) => {
    await authorize(ctx, args.organizationId, args.serviceSubject);
    if (!SAFE_ID.test(args.intentId))
      throw new Error("ExecutionIntent identifier is invalid.");
    const record = await ctx.db
      .query("executionIntents")
      .withIndex("by_intent", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .eq("intentId", args.intentId),
      )
      .first();
    if (!record) return null;
    return toRecord(
      record,
      await loadEvents(ctx, args.organizationId, args.intentId),
    );
  },
});

export const listEvents = query({
  args: scopeArgs,
  handler: async (ctx, args) => {
    await authorize(ctx, args.organizationId, args.serviceSubject);
    if (!SAFE_ID.test(args.intentId))
      throw new Error("ExecutionIntent identifier is invalid.");
    const record = await ctx.db
      .query("executionIntents")
      .withIndex("by_intent", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .eq("intentId", args.intentId),
      )
      .first();
    if (!record) return null;
    return await loadEvents(ctx, args.organizationId, args.intentId);
  },
});

async function authorize(
  ctx: { auth: { getUserIdentity(): Promise<{ subject: string } | null> } },
  organizationId: string,
  serviceSubject: string,
): Promise<void> {
  if (
    process.env.AVF_EXECUTION_INTENT_MODE?.trim().toLowerCase() !== "shadow"
  ) {
    throw new Error("ExecutionIntent shadow persistence is disabled.");
  }
  const identity = await ctx.auth.getUserIdentity();
  assertExecutionIntentServiceScope({
    authenticatedSubject: identity?.subject ?? null,
    configuredSubject: process.env.AVF_EXECUTION_INTENT_CONVEX_SUBJECT?.trim(),
    requestedSubject: serviceSubject,
    configuredOrganizationId:
      process.env.AVF_EXECUTION_INTENT_ORGANIZATION_ID?.trim(),
    requestedOrganizationId: organizationId,
  });
}

function assertInput(args: {
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
}): void {
  if (!SAFE_ID.test(args.intentId) || !SAFE_ID.test(args.organizationId))
    throw new Error("ExecutionIntent identity is invalid.");
  if (
    !SAFE_ID.test(args.missionControlCorrelationId) ||
    !SAFE_ID.test(args.eventId)
  )
    throw new Error("ExecutionIntent provider identity is invalid.");
  if (args.idempotencyKey.length < 8 || args.idempotencyKey.length > 200)
    throw new Error("ExecutionIntent idempotency key is invalid.");
  if (!SHA256.test(args.requestDigest) || !SHA256.test(args.eventDigest))
    throw new Error("ExecutionIntent digest is invalid.");
  if (!UUID.test(args.transportNonce))
    throw new Error("ExecutionIntent transport nonce is invalid.");
  if (args.requestJson.length > 256 * 1024 || args.eventJson.length > 64 * 1024)
    throw new Error("ExecutionIntent durable payload is too large.");
  if (
    !Number.isSafeInteger(args.transportTimestamp) ||
    !Number.isSafeInteger(args.receivedAt) ||
    !Number.isSafeInteger(args.receiptExpiresAt)
  ) {
    throw new Error("ExecutionIntent timestamps are invalid.");
  }
  const event = JSON.parse(args.eventJson) as Record<string, any>;
  if (
    event.type !== "mission_control.intent.accepted" ||
    event.sequence !== 1 ||
    event.subject !== `execution-intents/${args.intentId}` ||
    event.correlation?.mission_control_correlation_id !==
      args.missionControlCorrelationId ||
    Object.keys(event.data?.external_references ?? {}).length !== 0 ||
    event.data?.software_acceptance?.accepted !== false
  ) {
    throw new Error("ExecutionIntent event exceeds shadow authority.");
  }
}

async function loadEvents(ctx: any, organizationId: string, intentId: string) {
  const rows = await ctx.db
    .query("executionIntentEvents")
    .withIndex("by_intent_sequence", (q: any) =>
      q.eq("organizationId", organizationId).eq("intentId", intentId),
    )
    .collect();
  return rows.map((row: any) => ({
    sequence: row.sequence,
    eventDigest: row.eventDigest,
    event: JSON.parse(row.eventJson),
  }));
}

function toRecord(
  record: any,
  events: Array<{
    sequence: number;
    eventDigest: string;
    event: Record<string, unknown>;
  }>,
) {
  return {
    intentId: record.intentId,
    organizationId: record.organizationId,
    serviceSubject: record.serviceSubject,
    idempotencyKey: record.idempotencyKey,
    requestDigest: record.requestDigest,
    requestJson: record.requestJson,
    mode: "SHADOW" as const,
    status: "INTAKE_ACCEPTED" as const,
    missionControlCorrelationId: record.missionControlCorrelationId,
    latestSequence: 1 as const,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    executionObjectsCreated: false as const,
    softwareAcceptance: false as const,
    events,
  };
}
