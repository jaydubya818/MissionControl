import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { requireWorkspacePermission, FACTORY_PERMISSIONS } from "../lib/companyAccess";
import { enterpriseProject, validateReservation, attemptExposure, scopeExposure, settleUndispatchedEnterpriseAttempt,
  type EnterpriseSettlement } from "../lib/enterpriseAttemptAccounting";
import { validateNativeExecutedProof } from "../lib/nativeExecutedProof";
import { enterpriseMissionOwner } from "../lib/enterpriseMissionOwner";
import { computeCanonicalHash } from "../lib/genomeHash";

async function ownedAttempt(ctx: QueryCtx | MutationCtx, id: Id<"workflowRuns">) {
  const run = await ctx.db.get(id);
  if (!run?.projectId || !run.missionId) throw Error("ENTERPRISE_NATIVE_SCOPE_DENIED");
  const access = await requireWorkspacePermission(ctx, run.projectId, FACTORY_PERMISSIONS.MANAGE_AUTOMATION);
  if (!await enterpriseProject(ctx, run.projectId)) throw Error("ENTERPRISE_NATIVE_SCOPE_DENIED");
  const reservation = validateReservation((run.executionCostAuthorization as any)?.enterprise);
  const mission = await ctx.db.get(run.missionId);
  if (reservation.provider !== "isolated-container" || reservation.ownerId !== access.actorId
    || !mission || await enterpriseMissionOwner(ctx, mission) !== access.actorId || mission.projectId !== run.projectId || mission.tenantId !== run.tenantId
    || reservation.tenantId !== run.tenantId || reservation.projectId !== run.projectId || reservation.missionId !== run.missionId) {
    throw Error("ENTERPRISE_NATIVE_SCOPE_DENIED");
  }
  attemptExposure(run);
  return { run, reservation };
}

/** Reconciliation only: consumes retained authenticated bytes, never dispatches,
 * renews a lease, creates a replacement Attempt or changes Quality Gate state. */
export const settle = mutation({ args: { workflowRunId: v.id("workflowRuns"), responseArtifactId: v.id("runArtifacts"), expectedReservationDigest: v.string() },
  handler: async (ctx, args) => {
    const { run, reservation } = await ownedAttempt(ctx, args.workflowRunId);
    if (reservation.digest !== args.expectedReservationDigest) throw Error("ENTERPRISE_STALE_RESERVATION_WRITER");
    const { tariff, parsed, proof } = await validateNativeExecutedProof(ctx, run, reservation, args.responseArtifactId);
    if (run.enterpriseSettlement) {
      if (run.enterpriseSettlement.proofDigest !== parsed.packetDigest || run.enterpriseSettlement.nativeUsage?.responseArtifactId !== args.responseArtifactId) {
        throw Error("ENTERPRISE_SETTLEMENT_CONFLICT");
      }
      return { duplicate: true, settlement: run.enterpriseSettlement };
    }
    const body: Omit<EnterpriseSettlement, "digest"> = { reservationDigest: reservation.digest, proofDigest: parsed.packetDigest, settledAt: Date.now(), chargedMicrousd: 0,
      basis: "DETERMINISTIC_ENGINEERING_ZERO_CHARGE", tariffDigest: tariff.digest, resourceCost: "UNMEASURED",
      nativeUsage: { schema: "enterprise-native-usage/v1", attemptId: String(run._id), executionManifestDigest: run.executionManifestDigest!,
        responseArtifactId: String(args.responseArtifactId), responseDigest: parsed.packetDigest, runtimeImage: tariff.runtimeImage,
        containerId: proof.container.id, providerCalls: 0, resourceCost: "UNMEASURED" } };
    const settlement = { ...body, digest: computeCanonicalHash(body) };
    await ctx.db.patch(run._id, { enterpriseSettlement: settlement, reservedCostUsd: 0, spentUsd: 0 });
    return { duplicate: false, settlement };
  } });

export const releaseUndispatched = mutation({ args: { workflowRunId: v.id("workflowRuns"), expectedReservationDigest: v.string() }, handler: async (ctx, args) => {
  const { run, reservation } = await ownedAttempt(ctx, args.workflowRunId);
  if (reservation.digest !== args.expectedReservationDigest) throw Error("ENTERPRISE_STALE_RESERVATION_WRITER");
  return settleUndispatchedEnterpriseAttempt(ctx, run, Date.now());
} });

export const readback = query({ args: { workflowRunId: v.id("workflowRuns") }, handler: async (ctx, args) => {
  const { run, reservation } = await ownedAttempt(ctx, args.workflowRunId);
  const runs = await ctx.db.query("workflowRuns").withIndex("by_project", q => q.eq("projectId", run.projectId!)).collect();
  return { workflowRunId: run._id, status: run.status, reservation, settlement: run.enterpriseSettlement ?? null,
    attemptExposureMicrousd: attemptExposure(run), projectExposureMicrousd: scopeExposure(runs) };
} });
