import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { requireWorkspacePermission, FACTORY_PERMISSIONS } from "../lib/companyAccess";
import { enterpriseProject, validateReservation, attemptExposure, scopeExposure, settleUndispatchedEnterpriseAttempt,
  type EnterpriseSettlement } from "../lib/enterpriseAttemptAccounting";
import { validateNativeEngineeringTariff } from "../lib/nativeEngineeringTariff";
import { enterpriseMissionOwner } from "../lib/enterpriseMissionOwner";
import { computeCanonicalHash } from "../lib/genomeHash";
import { canonicalIsolatedInvocation } from "@mission-control/workflow-engine/harness-contract";
import { validateStoredOfflineResponse } from "./attempts";

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
    const tariff = validateNativeEngineeringTariff(reservation, run.executionManifest);
    const artifact = await ctx.db.get(args.responseArtifactId);
    const metadata = artifact?.metadata as any;
    const events = await ctx.db.query("runEvents").withIndex("by_run", q => q.eq("workflowRunId", run._id)).collect();
    const claims = events.filter(event => event.idempotencyKey?.startsWith(`factory-lease:${run.runId}:`) && event.idempotencyKey.endsWith(":claimed"));
    const claim = claims.find(event => event.idempotencyKey === `factory-lease:${run.runId}:${metadata?.leaseId}:claimed`);
    const claimed = claim?.metadata as any;
    // A second lease may represent additional unresolved exposure. This first
    // qualification cannot release it using the first lease's result.
    if (!claim || claims.length !== 1 || claim.projectId !== run.projectId || claim.tenantId !== run.tenantId
      || !["CHECKPOINT_CREATED", "RUN_RESUMED"].includes(claim.eventType)
      || !claim.actor?.startsWith("service:") || claimed?.leaseId !== metadata?.leaseId
      || claimed.workerId !== metadata.workerId || claimed.workerSessionId !== metadata.workerSessionId
      || claimed.workerGeneration !== metadata.workerGeneration || claimed.executionManifestDigest !== run.executionManifestDigest
      || (run.lease && (run.lease.leaseId !== claimed.leaseId || run.lease.workerGeneration !== claimed.workerGeneration))
      || (!["COMPLETED", "FAILED", "CANCELED"].includes(run.status)
        && !(run.status === "PAUSED" && run.checkpointLease?.leaseId === claimed.leaseId && run.candidateReadyAt))) {
      throw Error("ENTERPRISE_NATIVE_EXPOSURE_UNKNOWN");
    }
    const lease = { leaseId: claimed.leaseId, ownerId: claim.actor.slice(8), workerId: claimed.workerId,
      workerSessionId: claimed.workerSessionId, workerGeneration: claimed.workerGeneration };
    const request = canonicalIsolatedInvocation({ ...run, _id: String(run._id), workOrderId: String(run.workOrderId),
      parentTaskId: String(run.parentTaskId), executionProfileId: String(run.executionProfileId), executionProfileDigest: run.executionProfileDigest!,
      executionManifestDigest: run.executionManifestDigest!, executionManifest: run.executionManifest, lease });
    const parsed = validateStoredOfflineResponse(artifact, request, run, lease);
    const proof = parsed.evidence;
    if (proof.schema !== "factory-isolated-execution-evidence/v3" || !proof.cleanupVerified || proof.truncated || proof.exitCode !== 0
      || !proof.runtimeImage || !proof.container.id || !proof.containerImageId || !parsed.runtimeResult
      || !["SUCCESS", "WORKLOAD_FAILURE"].includes(parsed.runtimeResult.status) || parsed.runtimeResult.providerCalls !== 0) {
      throw Error("ENTERPRISE_NATIVE_EXPOSURE_UNKNOWN");
    }
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
