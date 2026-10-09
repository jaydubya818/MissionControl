import { v } from "convex/values";

const engineeringTariff = v.object({ schema: v.literal("enterprise-engineering-tariff/v1"),
  basis: v.literal("DETERMINISTIC_ENGINEERING_ZERO_CHARGE"), approvedBy: v.string(), approvedAt: v.number(), expiresAt: v.number(),
  baseBindingDigest: v.string(), baseManifestDigest: v.string(), digest: v.string() });

export const enterpriseReservationValidator = v.object({
  schema: v.literal("enterprise-attempt-reservation/v1"), tenantId: v.string(), projectId: v.string(),
  ownerId: v.string(), missionId: v.string(), workOrderId: v.string(), workOrderRevisionId: v.string(),
  workOrderRevisionNumber: v.number(), attemptId: v.string(), delegationId: v.string(), factoryId: v.string(),
  factoryVersion: v.string(), provider: v.union(v.literal("isolated-container"), v.literal("local-docker")),
  modelPolicyDigest: v.string(), executionProfileDigest: v.string(), bindingDigest: v.string(), idempotencyKey: v.string(),
  ceilingMicrousd: v.number(), authorizedAt: v.number(), expiresAt: v.number(), missionCeilingMicrousd: v.number(),
  workOrderCeilingMicrousd: v.number(), dailyCeilingMicrousd: v.number(), policyCeilingMicrousd: v.number(), digest: v.string(),
  tariff: v.optional(engineeringTariff),
});
export const enterpriseSettlementValidator = v.object({
  reservationDigest: v.string(), proofDigest: v.string(), settledAt: v.number(), chargedMicrousd: v.number(),
  basis: v.union(v.literal("PROVEN_NOT_DISPATCHED"), v.literal("DETERMINISTIC_ENGINEERING_ZERO_CHARGE")),
  tariffDigest: v.optional(v.string()), resourceCost: v.optional(v.literal("UNMEASURED")), digest: v.string(),
});
