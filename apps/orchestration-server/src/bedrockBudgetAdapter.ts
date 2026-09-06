import { bedrockModelRouteBinding } from "./bedrockModelRouteBinding.js";
import {
  reserveProviderRequest,
  settleProviderUsage,
  liabilityDigest,
  type ProviderReservation,
  type ProviderPrice,
  type ProviderRequestAuthority,
} from "../../../convex/lib/providerLiability.js";
import {
  serializeBedrock,
  invokeBedrockFixture,
  type BedrockApi,
  type BedrockRequest,
  type BedrockTransport,
} from "./bedrockAdapter.js";
import {
  bedrockRouteSchema,
  type BedrockRoute,
  BEDROCK_MODEL,
} from "./bedrockRoute.js";
/** Must durably commit a serialized transaction before resolving. The production
 * authority remains Convex; an in-memory implementation is fixture evidence only. */
export interface BedrockReservationStore {
  transaction<T>(
    change: (reservation: ProviderReservation) => {
      reservation: ProviderReservation;
      value: T;
    },
  ): Promise<T>;
}
export async function invokeReservedBedrockFixture(input: {
  route: BedrockRoute;
  api: BedrockApi;
  request: BedrockRequest;
  requestId: string;
  price: ProviderPrice;
  authority: ProviderRequestAuthority;
  store: BedrockReservationStore;
  transport: BedrockTransport;
  signal: AbortSignal;
  timeoutMs: number;
  now: () => number;
}) {
  // Freeze monetary/request identity before crossing any asynchronous boundary.
  const price = structuredClone(input.price);
  const authority = structuredClone(input.authority);
  const { store, api, requestId, transport, signal, timeoutMs, now } = input;
  const outputTokens = input.request.maxOutputTokens;
  const route = bedrockRouteSchema.parse(input.route);
  const wire = serializeBedrock(route, api, input.request);
  if (
    transport.evidenceClass !== "OFFLINE_FIXTURE" ||
    price.provider !== "aws-bedrock" ||
    price.model !== BEDROCK_MODEL ||
    price.api !== api ||
    authority.scope.modelRouteDigest !== bedrockModelRouteBinding(route).routeDigest
  )
    throw new Error("BEDROCK_PRICE_OR_ROUTE_MISMATCH");
  signal.throwIfAborted();
  const requestDigest = liabilityDigest({ route, wire });
  const validUntil = await store.transaction((reservation) => {
    const result = reserveProviderRequest({
      reservation,
      price,
      authority,
      requestId: requestId,
      requestDigest,
      payloadBytes: Buffer.byteLength(JSON.stringify(wire.body)),
      inputTokens: price.maximumInputTokens,
      outputTokens,
      now: now(),
    });
    return {
      reservation: result.reservation,
      value: Math.min(
        reservation.expiresAt,
        authority.leaseExpiresAt,
        price.expiresAt,
      ),
    };
  });
  try {
    // Recheck the signal after reservation and before transport. Never retry here.
    signal.throwIfAborted();
    const result = await invokeBedrockFixture(transport, wire, {
      signal: signal,
      timeoutMs: Math.min(timeoutMs, validUntil - now()),
    });
    const settlement = await store.transaction((reservation) => {
      const settled = settleProviderUsage(reservation, price, {
        requestId: requestId,
        requestDigest,
        provider: price.provider,
        model: price.model,
        providerRequestId: result.providerRequestId,
        usageId: liabilityDigest({
          account: route.awsAccountId,
          region: route.region,
          requestId: result.providerRequestId,
        }),
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        classification: "ACTUAL",
        expectedReceiptRevision: 0,
      });
      return { reservation: settled.reservation, value: settled };
    });
    if (settlement.incident) throw new Error("BEDROCK_USAGE_OVERRUN");
    return result;
  } catch (error) {
    await store.transaction((reservation) => {
      const hold = reservation.holds.find((h) => h.requestId === requestId);
      if (!hold) throw new Error("RESERVATION_HOLD_MISSING");
      // Never overwrite a settled receipt, overrun or frozen incident after an error.
      if (hold.state !== "RESERVED") return { reservation, value: undefined };
      const unknown = settleProviderUsage(reservation, price, {
        requestId: requestId,
        requestDigest,
        provider: price.provider,
        model: price.model,
        providerRequestId: "",
        usageId: "",
        inputTokens: 0,
        outputTokens: 0,
        classification: "UNKNOWN",
        expectedReceiptRevision: hold.receiptRevision,
      });
      return { reservation: unknown.reservation, value: undefined };
    });
    throw error;
  }
}
