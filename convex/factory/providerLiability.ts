import { admitBedrockAccounting, settleBedrockAccounting } from "../lib/governedInferenceAdmission";
import { assertInferenceSpendingAllowed, fenceWorkOrderInferenceSpending } from "../inferenceGateway";
 import {
  bedrockBridgeIdentityValidator,
  assertBedrockBridgeIdentity,
} from "../lib/bedrockBridgeIdentity"; import { v } from "convex/values";
import { mutation, query, internalMutation } from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import {
  FACTORY_PERMISSIONS,
  requireWorkspacePermission,
} from "../lib/companyAccess";
import { factoryLeaseMatchesCurrentRegistration } from "../lib/factoryAttempt";
import { loadExecutionProfileAdmission } from "../lib/executionProfileAdmission";
import {
  assertProviderPrice,
  assertProviderReservation,
  liabilityDigest,
  reserveProviderRequest as reserve,
  settleProviderUsage,
  type ProviderUsage,
} from "../lib/providerLiability";
import {
  providerPriceValidator,
  providerUsageValidator,
} from "../lib/providerLiabilityValidators";

const key = (s: string) => {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/.test(s))
    throw new Error("Invalid idempotency key");
  return s;
};
export const registerPriceVersion = mutation({
  args: {
    projectId: v.id("projects"),
    price: providerPriceValidator,
    registrationKey: v.string(),
  },
  handler: async (ctx, args) => {
    const access = await requireWorkspacePermission(
      ctx,
      args.projectId,
      FACTORY_PERMISSIONS.MANAGE_AUTOMATION,
    );
    assertProviderPrice(args.price, Date.now());
    key(args.registrationKey);
    const digest = liabilityDigest(args.price);
    const existing = await ctx.db
      .query("factoryProviderPrices")
      .withIndex("by_project_key", (q) =>
        q
          .eq("projectId", args.projectId)
          .eq("registrationKey", args.registrationKey),
      )
      .unique();
    if (existing) {
      if (existing.digest !== digest)
        throw new Error("Price idempotency conflict");
      return existing._id;
    }
    return await ctx.db.insert("factoryProviderPrices", {
      projectId: args.projectId,
      snapshot: args.price,
      digest,
      registrationKey: args.registrationKey,
      createdBy: access.actorId,
      createdAt: Date.now(),
    });
  },
});
export const createReservation = mutation({
  args: {
    projectId: v.id("projects"),
    workOrderId: v.id("workOrders"),
    executionProfileId: v.id("factoryExecutionProfiles"),
    priceId: v.id("factoryProviderPrices"),
    maximumNanoUsd: v.number(),
    expiresAt: v.number(),
    maximumRequests: v.number(),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    const access = await requireWorkspacePermission(
      ctx,
      args.projectId,
      FACTORY_PERMISSIONS.MANAGE_AUTOMATION,
    );
    key(args.idempotencyKey);
    const [wo, profile, price] = await Promise.all([
      ctx.db.get(args.workOrderId),
      ctx.db.get(args.executionProfileId),
      ctx.db.get(args.priceId),
    ]);
    if (
      !wo ||
      wo.projectId !== args.projectId ||
      !profile ||
      profile.projectId !== args.projectId ||
      !price ||
      price.projectId !== args.projectId
    )
      throw new Error("Reservation scope unavailable");
    assertInferenceSpendingAllowed(wo);
    const admission = await loadExecutionProfileAdmission(
      ctx,
      profile._id,
      Date.now(),
    );
    if (!admission.eligible) throw new Error("Execution Profile not current");
    if (!profile.modelCatalogId || !profile.modelRouteDigest) {
      throw new Error("Provider reservation requires an inference-enabled Execution Profile");
    }
    const route = await ctx.db.get(profile.modelCatalogId);
    const routeSnapshot = route?.routeSnapshot as
      | { provider?: string; modelId?: string }
      | undefined;
    if (
      routeSnapshot?.provider !== price.snapshot.provider ||
      routeSnapshot.modelId !== price.snapshot.model ||
      liabilityDigest(price.snapshot) !== price.digest
    )
      throw new Error("Price/route mismatch");
    assertProviderPrice(price.snapshot, Date.now());
    if (
      args.expiresAt > price.snapshot.expiresAt ||
      (admission.validUntil != null && args.expiresAt > admission.validUntil)
    )
      throw new Error("Reservation outlives dependency");
    if (price.snapshot.provider === "aws-bedrock") {
      const policy = (wo.metadata as { implementationPolicy?: { maxCostUsd?: number } } | undefined)?.implementationPolicy;
      const approvedNano = Math.floor((policy?.maxCostUsd ?? 0) * 1_000_000_000);
      if (!Number.isSafeInteger(approvedNano) || approvedNano <= 0 || !Number.isSafeInteger(args.maximumNanoUsd)
        || args.maximumNanoUsd > approvedNano) throw new Error("Reservation exceeds approved WorkOrder budget");
    }
    const repositoryId = wo.repositoryId;
    if (!repositoryId)
      throw new Error("Canonical WorkOrder repository required");
    const snapshot = {
      schema: "factory-provider-reservation/v1" as const,
      scope: {
        projectId: String(args.projectId),
        repositoryId: String(repositoryId),
        workOrderId: String(wo._id),
        workOrderRevision: wo.currentRevisionNumber ?? 1,
        executionProfileId: String(profile._id),
        executionProfileDigest: profile.profileDigest,
        modelRouteDigest: profile.modelRouteDigest,
        priceDigest: price.digest,
      },
      maximumNanoUsd: args.maximumNanoUsd,
      expiresAt: args.expiresAt,
      maximumRequests: args.maximumRequests,
      frozen: false,
      holds: [],
    };
    assertProviderReservation(snapshot, Date.now());
    const creationDigest = liabilityDigest(snapshot);
    const existing = await ctx.db
      .query("factoryProviderReservations")
      .withIndex("by_project_key", (q) =>
        q
          .eq("projectId", args.projectId)
          .eq("idempotencyKey", args.idempotencyKey),
      )
      .unique();
    if (existing) {
      if (existing.creationDigest !== creationDigest)
        throw new Error("Reservation idempotency conflict");
      return existing._id;
    }
    const existingInference = await ctx.db.query("inferenceReservations").withIndex("by_work_order", q => q.eq("workOrderId", wo._id)).first();
    if (existingInference) throw new Error("WorkOrder already has independent inference budget authority");
    // A WorkOrder has one monetary authority, including expired or uncertain holds.
    // Do not create a second balance through a new key, profile, or revision.
    const priorBudget = await ctx.db
      .query("factoryProviderReservations")
      .withIndex("by_work_order", (q) => q.eq("workOrderId", wo._id))
      .first();
    if (priorBudget)
      throw new Error("WorkOrder budget authority already exists");
    return await ctx.db.insert("factoryProviderReservations", {
      projectId: args.projectId,
      workOrderId: wo._id,
      executionProfileId: profile._id,
      priceId: price._id,
      snapshot,
      creationDigest,
      idempotencyKey: args.idempotencyKey,
      createdBy: access.actorId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});
export const getReservation = query({
  args: { reservationId: v.id("factoryProviderReservations") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.reservationId);
    if (!row) throw new Error("Reservation unavailable");
    await requireWorkspacePermission(
      ctx,
      row.projectId,
      FACTORY_PERMISSIONS.VIEW,
    );
    return row;
  },
});
const requestAuthorityArgs = {
  reservationId: v.id("factoryProviderReservations"),
  workflowRunId: v.id("workflowRuns"),
  leaseId: v.string(),
  generation: v.number(),
};
async function currentAuthority(
  ctx: MutationCtx,
  args: {
    reservationId: Id<"factoryProviderReservations">;
    workflowRunId: Id<"workflowRuns">;
    leaseId: string;
    generation: number;
  },
) {
  const [row, run] = await Promise.all([
    ctx.db.get(args.reservationId),
    ctx.db.get(args.workflowRunId),
  ]);
  if (
    !row ||
    !run ||
    !run.workOrderId ||
    row.workOrderId !== run.workOrderId ||
    row.projectId !== run.projectId
  )
    throw new Error("Attempt/reservation scope mismatch");
  const wo = await ctx.db.get(run.workOrderId);
  assertInferenceSpendingAllowed(wo);
  const profile = await loadExecutionProfileAdmission(
    ctx,
    row.executionProfileId,
    Date.now(),
  );
  if (
    !wo ||
    wo.currentExecutionRunId !== run._id ||
    wo.currentRevisionNumber !== run.workOrderRevisionNumber ||
    !profile.eligible ||
    run.status !== "RUNNING" ||
    run.cancellationRequestedAt ||
    run.lease?.leaseId !== args.leaseId ||
    run.lease.workerGeneration !== args.generation ||
    run.lease.expiresAt <= Date.now() ||
    run.executionProfileId !== row.executionProfileId ||
    run.executionProfileDigest !== row.snapshot.scope.executionProfileDigest ||
    run.workOrderRevisionNumber !== row.snapshot.scope.workOrderRevision ||
    String(run.repositoryId) !== row.snapshot.scope.repositoryId
  )
    throw new Error("Attempt fenced or dependency changed");
  const host = run.hostBindingId ? await ctx.db.get(run.hostBindingId) : null;
  if (!factoryLeaseMatchesCurrentRegistration(run.lease, host ?? undefined))
    throw new Error("Worker registration fenced");
  const version = run.factoryDefinitionVersionId
    ? await ctx.db.get(run.factoryDefinitionVersionId)
    : null;
  const factoryMaximum = Math.floor((version?.budget.maxCostUsd ?? 0) * 1_000_000_000);
  if (!Number.isSafeInteger(factoryMaximum) || factoryMaximum <= 0 || row.snapshot.maximumNanoUsd > factoryMaximum)
    throw new Error("Reservation exceeds Factory budget");
  const price = await ctx.db.get(row.priceId);
  if (
    !price ||
    price.projectId !== row.projectId ||
    price.digest !== row.snapshot.scope.priceDigest
  )
    throw new Error("Price identity changed");
  return { row, run, price  , profile };
}
export const reserveRequestInternal = internalMutation({
  args: {
    ...requestAuthorityArgs,
    requestId: v.string(),
    requestDigest: v.string(),
    payloadBytes: v.number(),
    outputTokens: v.number(),
    bridgeIdentity: v.optional(bedrockBridgeIdentityValidator) },
  handler: async (ctx, args) => {
    const { row, run, price  , profile } = await currentAuthority(ctx, args);
     if (price.snapshot.provider === "aws-bedrock" || args.bridgeIdentity) {
      if (price.snapshot.api !== "CONVERSE")
        throw new Error("BEDROCK_PRICE_API_MISMATCH");
      const snapshot = profile.profile?.immutableSnapshot as any;
      assertBedrockBridgeIdentity(
        args.bridgeIdentity,
        {
          schema: "factory-bedrock-inference/v1",
          workOrderId: String(row.workOrderId),
          workOrderRevision: row.snapshot.scope.workOrderRevision,
          executionProfileId: String(row.executionProfileId),
          executionProfileDigest: row.snapshot.scope.executionProfileDigest,
          harnessDigest: snapshot?.harness?.capabilityManifestDigest,
          runtimeDigest: snapshot?.runtimeArtifact?.digest,
          backend: snapshot?.executionBackend,
          modelRouteDigest: row.snapshot.scope.modelRouteDigest,
          priceDigest: price.digest,
          provider: "aws-bedrock",
          model: "anthropic.claude-sonnet-4-6",
          retryGeneration: 0,
        },
        snapshot,
      );
      // Ambiguous effects fence the Attempt even if nominal budget remains.
      if (
        row.snapshot.holds.some(
          (hold) => hold.state === "RESERVED" || hold.state === "UNKNOWN",
        )
      )
        throw new Error("BEDROCK_PRIOR_REQUEST_UNRESOLVED");
    } const decision = reserve({
      reservation: row.snapshot,
      price: price.snapshot,
      authority: {
        attemptId: String(run._id),
        leaseId: args.leaseId,
        generation: args.generation,
        leaseExpiresAt: run.lease!.expiresAt,
        current: true,
        canceled: false,
        scope: row.snapshot.scope,
      },
      requestId: args.requestId,
      requestDigest: args.requestDigest,
      payloadBytes: args.payloadBytes,
      outputTokens: args.outputTokens,
      now: Date.now(),
    });
    const governedAdmission = price.snapshot.provider === "aws-bedrock"
      ? await admitBedrockAccounting(ctx, row, run, price.snapshot, args) : undefined;
    // One Convex transaction reads+writes the shared row. Concurrent reservations
    // conflict and retry against the newly held capacity, never an old balance.
    await ctx.db.patch(row._id, {
      snapshot: decision.reservation,
      updatedAt: Date.now(),
    });
    return {
      requestId: args.requestId,
      maximumNanoUsd: decision.hold.maximumNanoUsd,
      priceDigest: price.digest,
      ...(args.bridgeIdentity
        ? {
            bridgeIdentityDigest: liabilityDigest(args.bridgeIdentity),
            requestDigest: args.requestDigest,
            admittedAt: Date.now(),
            validUntil: Math.min(
              governedAdmission?.validUntil ?? Number.MAX_SAFE_INTEGER,
              row.snapshot.expiresAt,
              run.lease!.expiresAt,
              price.snapshot.expiresAt,
              profile.validUntil ?? Number.MAX_SAFE_INTEGER,
            ),
          }
        : {}) };
  },
});
async function applyUsage(
  ctx: MutationCtx,
  reservationId: Id<"factoryProviderReservations">,
  usage: ProviderUsage,
  actorId: string,
  correction: boolean,
  evidenceReference?: string,
) {
  const row = await ctx.db.get(reservationId);
  if (!row) throw new Error("Reservation unavailable");
  if (row.creationDigest !== liabilityDigest({ ...row.snapshot, frozen: false, holds: [] })) {
    throw new Error("Historical usage reservation scope mismatch");
  }
  const price = await ctx.db.get(row.priceId);
  if (!price) throw new Error("Price unavailable");
   if (usage.classification === "ACTUAL") {
    // Provider receipt IDs are conservatively unique across reservations. A
    // collision blocks reconciliation instead of silently double-attributing it.
    const owners = await Promise.all([
      ctx.db
        .query("factoryProviderUsageEvents")
        .withIndex("by_provider_usage", (q) =>
          q
            .eq("usage.provider", usage.provider)
            .eq("usage.usageId", usage.usageId),
        )
        .first(),
      ctx.db
        .query("factoryProviderUsageEvents")
        .withIndex("by_provider_request", (q) =>
          q
            .eq("usage.provider", usage.provider)
            .eq("usage.providerRequestId", usage.providerRequestId),
        )
        .first(),
    ]);
    if (
      owners.some(
        (owner) =>
          owner &&
          (owner.reservationId !== reservationId ||
            owner.usage.requestId !== usage.requestId ||
            owner.usage.requestDigest !== usage.requestDigest),
      )
    )
      throw new Error("PROVIDER_RECEIPT_ALREADY_OWNED");
  } const decision = settleProviderUsage(
    row.snapshot,
    price.snapshot,
    usage,
    correction,
  );
  if (decision.duplicate)
    return { duplicate: true, incident: decision.incident };
  if (price.snapshot.provider === "aws-bedrock") {
    await settleBedrockAccounting(ctx, row, usage, actorId, correction, evidenceReference, decision.incident);
  }
  if (decision.incident) await fenceWorkOrderInferenceSpending(ctx, row.workOrderId,
    liabilityDigest(usage), ["PROVIDER_USAGE_ADMISSION_VIOLATION"]);
  await ctx.db.patch(row._id, {
    snapshot: decision.reservation,
    updatedAt: Date.now(),
  });
  await ctx.db.insert("factoryProviderUsageEvents", {
    projectId: row.projectId,
    reservationId,
    usage,
    digest: liabilityDigest(usage),
    actorId,
    corrected: correction,
    ...(evidenceReference ? { evidenceReference } : {}),
    createdAt: Date.now(),
    incident: decision.incident,
  });
  return { duplicate: false, incident: decision.incident };
}
export const recordUsageInternal = internalMutation({
  args: { ...requestAuthorityArgs, usage: providerUsageValidator },
  handler: async (ctx, args) => {
    // Accounting binds the admitted historical subject. Current execution
    // authority is required only by reserveRequestInternal, never settlement.
    const [row, run] = await Promise.all([ctx.db.get(args.reservationId), ctx.db.get(args.workflowRunId)]);
    if (!row || !run || !run.workOrderId || row.workOrderId !== run.workOrderId || row.projectId !== run.projectId
      || String(row.projectId) !== row.snapshot.scope.projectId || String(row.workOrderId) !== row.snapshot.scope.workOrderId
      || String(row.executionProfileId) !== row.snapshot.scope.executionProfileId
      || run.executionProfileId !== row.executionProfileId || run.executionProfileDigest !== row.snapshot.scope.executionProfileDigest
      || String(run.repositoryId) !== row.snapshot.scope.repositoryId || run.workOrderRevisionNumber !== row.snapshot.scope.workOrderRevision
      || row.creationDigest !== liabilityDigest({ ...row.snapshot, frozen: false, holds: [] })) {
      throw new Error("Historical usage reservation scope mismatch");
    }
    const price = await ctx.db.get(row.priceId);
    if (!price || price.projectId !== row.projectId || price.digest !== row.snapshot.scope.priceDigest
      || liabilityDigest(price.snapshot) !== price.digest) throw new Error("Historical usage price identity mismatch");
    const hold = row.snapshot.holds.find(
      (h) => h.requestId === args.usage.requestId,
    );
    if (
      !hold ||
      hold.attemptId !== String(run._id) ||
      hold.leaseId !== args.leaseId ||
      hold.generation !== args.generation
      || hold.requestDigest !== args.usage.requestDigest
    )
      throw new Error("Usage Attempt mismatch");
    return await applyUsage(
      ctx,
      args.reservationId,
      args.usage,
      `attempt:${run._id}`,
      false,
    );
  },
});
export const reconcileUsage = mutation({
  args: {
    reservationId: v.id("factoryProviderReservations"),
    usage: providerUsageValidator,
    evidenceReference: v.string(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.reservationId);
    if (!row) throw new Error("Reservation unavailable");
    const access = await requireWorkspacePermission(
      ctx,
      row.projectId,
      FACTORY_PERMISSIONS.MANAGE_AUTOMATION,
    );
    if (!args.evidenceReference.trim() || args.evidenceReference.length > 1000)
      throw new Error("Correction requires evidence");
    return await applyUsage(
      ctx,
      args.reservationId,
      args.usage,
      access.actorId,
      true,
      args.evidenceReference,
    );
  },
});
