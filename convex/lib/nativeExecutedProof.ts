import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import type { EnterpriseReservation } from "./enterpriseAttemptAccounting";
import { validateNativeEngineeringTariff } from "./nativeEngineeringTariff";
import { canonicalIsolatedInvocation } from "@mission-control/workflow-engine/harness-contract";
import { validateStoredOfflineResponse } from "./offlineStoredResponse";

/** Revalidates retained native execution, shared by settlement and isolated
 * enterprise currentness. This helper never dispatches or grants authority. */
export async function validateNativeExecutedProof(ctx: QueryCtx | MutationCtx, run: any,
  reservation: EnterpriseReservation, responseArtifactId: Id<"runArtifacts">) {
  const tariff = validateNativeEngineeringTariff(reservation, run.executionManifest);
  const artifact = await ctx.db.get(responseArtifactId);
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
  return { tariff, artifact: artifact!, parsed, proof };
}
