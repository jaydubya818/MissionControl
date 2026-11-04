import { canonicalHash } from "@mission-control/shared";
import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { missionOwnerOperatorId } from "./missionAccess";

export const serviceAttemptEffects: Record<string, readonly string[]> = {
  "attempts.claim": ["repository.read", "sandbox.write"],
  "attempts.renew": ["attempt.renew"],
  "attempts.report": ["candidate.create", "verification.request"],
  "verification:claim": ["repository.read", "verification.execute"],
  "verification:renew": ["attempt.renew"],
  "verification:report": ["verification.record"],
};
export type ServiceAttemptClaim = { serviceId: string; workflowRunId: Id<"workflowRuns">; capability: string; expiresAt: number };
type Ctx = QueryCtx | MutationCtx;
export async function serviceAttemptBinding(ctx: Ctx, workflowRunId: Id<"workflowRuns">) {
  const run = await ctx.db.get(workflowRunId);
  const workOrder = run?.workOrderId && await ctx.db.get(run.workOrderId);
  const mission = workOrder?.missionId && await ctx.db.get(workOrder.missionId);
  const version = run?.factoryDefinitionVersionId && await ctx.db.get(run.factoryDefinitionVersionId);
  const factory = version && await ctx.db.get(version.factoryDefinitionId);
  const ownerOperatorId = mission && await missionOwnerOperatorId(ctx, mission);
  const project = mission?.projectId && await ctx.db.get(mission.projectId);
  const tenant = mission?.tenantId && await ctx.db.get(mission.tenantId);
  if (!run || !workOrder || !mission || !version || !factory || !ownerOperatorId
    || !mission.tenantId || !mission.projectId || !tenant?.active || project?.tenantId !== mission.tenantId || factory.status !== "ACTIVE"
    || workOrder.tenantId !== mission.tenantId || workOrder.projectId !== mission.projectId
    || run.tenantId !== mission.tenantId || run.projectId !== mission.projectId || run.missionId !== mission._id
    || version.tenantId !== mission.tenantId || version.projectId !== mission.projectId
    || factory.tenantId !== mission.tenantId || factory.projectId !== mission.projectId
    || run.factoryConfigurationDigest !== version.configurationDigest
    || run.workOrderRevisionNumber !== (workOrder.currentRevisionNumber ?? 1)) throw Error("SERVICE_ATTEMPT_UNAVAILABLE");
  const dependencyBindings = [];
  for (const reference of workOrder.dependencies ?? []) {
    const id = ctx.db.normalizeId("workOrders", reference);
    if (!id) continue;
    const dependency = await ctx.db.get(id);
    const handoff = await ctx.db.query("missionHandoffs").withIndex("by_work_order", q => q.eq("workOrderId", id)).order("desc").first();
    if (!dependency || dependency.missionId !== mission._id || dependency.projectId !== mission.projectId || dependency.tenantId !== mission.tenantId
      || dependency.state !== "DONE" || handoff?.outcome !== "COMPLETE" || handoff.missionId !== mission._id
      || handoff.incompleteAssertionIds.length || handoff.unknownAssertionIds.length) throw Error("SERVICE_DEPENDENCY_UNAVAILABLE");
    dependencyBindings.push({ workOrderId: id, revision: dependency.currentRevisionNumber ?? 1, handoffId: handoff._id });
  }
  return { tenantId: mission.tenantId, projectId: mission.projectId, ownerOperatorId, missionId: mission._id,
    workOrderId: workOrder._id, workflowRunId: run._id, factoryId: factory._id, factoryDefinitionVersionId: version._id,
    configurationDigest: version.configurationDigest, executionManifestDigest: run.executionManifestDigest ?? null,
    dependencyDigest: canonicalHash({ references: workOrder.dependencies ?? [], bindings: dependencyBindings }),
    workOrderRevisionNumber: workOrder.currentRevisionNumber ?? 1, repositoryId: run.repositoryId ?? null,
    verificationSourceAttemptId: run.verificationAttemptBinding?.sourceAttemptId ?? null,
    verificationSubjectDigest: run.verificationAttemptBinding?.verificationSubjectDigest ?? null,
    verificationContractDigest: run.verificationContractDigest ?? null,
    attemptPurpose: run.attemptPurpose ?? "IMPLEMENTATION" };
}
export async function requireServiceAttemptAuthority(ctx: Ctx, claim: ServiceAttemptClaim) {
  const effects = serviceAttemptEffects[claim.capability];
  const now = Date.now();
  if (!effects || !claim.serviceId || !Number.isFinite(claim.expiresAt) || claim.expiresAt <= now) throw Error("SERVICE_ATTEMPT_AUTHORITY_REQUIRED");
  const binding = await serviceAttemptBinding(ctx, claim.workflowRunId);
  if ((claim.capability.startsWith("verification:") ? "VERIFICATION" : "IMPLEMENTATION") !== binding.attemptPurpose) throw Error("SERVICE_ATTEMPT_PURPOSE_MISMATCH");
  const approvals = await ctx.db.query("approvalDecisions").withIndex("by_run", q => q.eq("workflowRunId", claim.workflowRunId)).collect();
  const grant = approvals.find(approval => {
    const metadata = approval.metadata;
    return approval.approvalType === "SERVICE_ATTEMPT_ACCESS" && approval.status === "APPROVED" && approval.decision === "APPROVE"
      && approval.approver === binding.ownerOperatorId && approval.tenantId === binding.tenantId && approval.projectId === binding.projectId
      && approval.workOrderId === binding.workOrderId && approval.workOrderRevisionNumber === binding.workOrderRevisionNumber
      && approval.expiresAt !== undefined && approval.expiresAt > now && !approval.revokedAt && !approval.invalidatedByRevisionId && !approval.supersededByApprovalDecisionId
      && metadata?.schema === "mission-service-delegation/v1" && metadata.serviceId === claim.serviceId
      && Array.isArray(metadata.capabilities) && metadata.capabilities.includes(claim.capability)
      && Array.isArray(metadata.allowedEffects) && effects.every(effect => metadata.allowedEffects.includes(effect))
      && Object.entries(binding).every(([key, value]) => metadata[key] === value);
  });
  if (!grant) throw Error("SERVICE_ATTEMPT_AUTHORITY_REQUIRED");
  // Runtime-only augmentation. The grant already binds the recomputed dependency
  // digest; do not add arrays to the strict scalar metadata comparison above.
  const workOrder = await ctx.db.get(binding.workOrderId);
  const dependencyHandoffIds: string[] = [];
  for (const reference of workOrder?.dependencies ?? []) {
    const id = ctx.db.normalizeId("workOrders", reference);
    if (!id) continue;
    const handoff = await ctx.db.query("missionHandoffs").withIndex("by_work_order", q => q.eq("workOrderId", id)).order("desc").first();
    if (!handoff) throw Error("SERVICE_DEPENDENCY_UNAVAILABLE");
    dependencyHandoffIds.push(handoff._id);
  }
  return { ...binding, grantId: grant._id, allowedEffects: effects, dependencyHandoffIds };
}
export type ServiceAttemptAuthority = Awaited<ReturnType<typeof requireServiceAttemptAuthority>>;
