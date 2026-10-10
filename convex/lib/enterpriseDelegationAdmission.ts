import { snapshotWorkflowDefinition } from "./workflowSnapshot";
import { factoryVersionConfigurationDigest } from "./factoryConfiguration";
import { canonicalDigest, canonicalHash, factoryDelegationBindingDigest, verifyEngineeringTariff } from "@mission-control/shared";
import { enterpriseProject } from './enterpriseAttemptAccounting';
import { enterpriseMissionOwner } from "./enterpriseMissionOwner";
import { requireEnterpriseQualificationOwner } from "./enterpriseQualificationAccess";
import { loadLocalRepositoryAdmission } from "./localRepositoryAdmission";

export const LOCAL_DELEGATION_SOURCE = "e498c31db8b749fa91b0544ecd1d1a661b971c2c";
export const LOCAL_DELEGATION_VERSION = "4c6c3a7d752df18a865fc815bc52daa8b638f6344a607f86a692f24eab3f4f95";
export const LOCAL_DELEGATION_REPOSITORY = "jaydubya818/MyFactory";
export const LOCAL_DELEGATION_COMMIT = "5cd13fa1f307a0c0f42f6317d966bb3179ad77c9";
export const LOCAL_DELEGATION_TREE = "1084844b1454165358e51248afe8676f96daf17c";
export const DELEGATION_PREPARATION = "enterprise-local-delegation-preparation/v1";

export async function enterprisePlanApprovedByOwner(ctx: any, plan: any, ownerId: string) {
  const operator = await ctx.db.get(ownerId);
  return !!operator?.active && operator.tenantId === plan?.tenantId
    && [ownerId, operator.authId].includes(plan.approvedBy)
    && plan.status === "APPROVED" && plan.decidedActorSource === "AUTHENTICATED" && !!plan.approvedAt;
}

/** Explicit preparation only. The ordinary native worker cannot claim this
 * executor. Existing admitTrial creates the one delegated reservation later. */
export async function prepareCanonicalDelegation(ctx: any, workOrder: any, versionId: any) {
  await requireEnterpriseQualificationOwner(ctx, workOrder);
  return inspectCanonicalDelegation(ctx, workOrder, versionId);
}

async function inspectCanonicalDelegation(ctx: any, workOrder: any, versionId: any) {
  const version = versionId && await ctx.db.get(versionId);
  const definition = version && await ctx.db.get(version.factoryDefinitionId);
  const repository = await ctx.db.get(workOrder.repositoryId);
  const { admission, digest } = await loadLocalRepositoryAdmission(ctx, repository, Date.now());
  const registration = definition?.enterpriseRegistration;
  const policy = version?.policyEnvelopeId && await ctx.db.get(version.policyEnvelopeId);
  const mission = await ctx.db.get(workOrder.missionId), plan = await ctx.db.get(workOrder.missionPlanId);
  const ownerId = await enterpriseMissionOwner(ctx, mission);
  if (admission.baselineCommit !== LOCAL_DELEGATION_COMMIT || admission.baselineTree !== LOCAL_DELEGATION_TREE
    || !policy?.active || policy.projectId !== workOrder.projectId || policy.tenantId !== workOrder.tenantId
    || !version || version.projectId !== workOrder.projectId || version.tenantId !== workOrder.tenantId
    || version.repositoryId !== repository._id || definition.repositoryId !== repository._id
    || definition.projectId !== workOrder.projectId || definition.tenantId !== workOrder.tenantId
    || definition.status === "ARCHIVED" || version.executor.adapter !== "myfactory-local-delegation" || version.executor.version !== "1"
    || registration?.config.kind !== "MYFACTORY" || registration.config.definitionVersionId !== version._id
    || registration.config.executionProvider !== "LOCAL_DOCKER_QUALIFICATION"
    || registration.config.localProviderSourceSha !== LOCAL_DELEGATION_SOURCE
    || registration.config.factoryVersion !== LOCAL_DELEGATION_VERSION
    || registration.health !== "HEALTHY" || registration.qualification !== "FIXTURE_QUALIFIED"
    || registration.revokedAt !== undefined || registration.validUntil <= Date.now()
    || mission.currentPlanId !== plan?._id || plan.revisionNumber !== workOrder.missionPlanRevision
    || !await enterprisePlanApprovedByOwner(ctx, plan, ownerId)
    || version.repositoryAdmissionDigest !== digest || version.environmentId !== admission.environmentId
    || !workOrder.planningRepositorySha || workOrder.planningRepositorySha !== admission.baselineCommit
    || workOrder.repository !== repository.repository || workOrder.executionEnvironment !== "LOCAL") {
    throw Error("CANONICAL_LOCAL_DELEGATION_UNAVAILABLE");
  }
  return { version, definition, repository, registration, plan, ownerId, admission, policy };
}

export type EnterpriseResultReadScope = { ownerId:string; missionId:string; planId:string; planDigest:string };

export async function enterpriseDelegationApproval(ctx: any, plan: any, binding: any, run?: any, resultReadScope?: EnterpriseResultReadScope) {
  run ??= await ctx.db.get(binding.workflowRunId);
  if (resultReadScope && run?.executionManifest?.schema !== DELEGATION_PREPARATION) throw Error("ENTERPRISE_RESULT_SCOPE_REQUIRED");
  if (run?.executionManifest?.schema !== DELEGATION_PREPARATION) {
    return plan?.metadata?.enterpriseDelegationApprovals?.[binding.delegationId] ?? plan?.metadata?.enterpriseDelegationApproval;
  }
  const wo = await ctx.db.get(binding.workOrderId);
  // Only the authenticated Result projection supplies this read-only owner scope.
  // Execution callers retain the normal authenticated owner admission by default.
  if (resultReadScope !== undefined) {
    const mission = wo && await ctx.db.get(wo.missionId);
    if (process.env.MC_NATIVE_SUCCESSOR_QUALIFICATION !== '1' || !wo || !mission
      || mission.projectId !== wo.projectId || mission.tenantId !== wo.tenantId
      || wo.verificationContract?.schemaVersion !== 2 || wo.verificationContract.enforcementMode !== 'ENFORCED'
      || !await enterpriseProject(ctx, wo.projectId) || await enterpriseMissionOwner(ctx, mission) !== resultReadScope.ownerId
      || binding.ownerScope !== resultReadScope.ownerId || mission._id !== resultReadScope.missionId
      || binding.missionId !== resultReadScope.missionId || plan?._id !== resultReadScope.planId || binding.missionPlanId !== resultReadScope.planId
      || `sha256:${canonicalHash(plan)}` !== resultReadScope.planDigest) throw Error('ENTERPRISE_RESULT_OWNER_REQUIRED');
  }
  const current = resultReadScope === undefined
    ? await prepareCanonicalDelegation(ctx, wo, run.factoryDefinitionVersionId)
    : await inspectCanonicalDelegation(ctx, wo, run.factoryDefinitionVersionId);
  const workflow = await ctx.db.get(current.version.workflowId);
  const preparation = run.executionManifest;
  const composition = current.version.executionProfileSnapshot?.configuration;
  if (binding.sourceSnapshotDigest !== canonicalDigest("factory-fixture-source/v1", { repository: LOCAL_DELEGATION_REPOSITORY,
      commit: LOCAL_DELEGATION_COMMIT, tree: LOCAL_DELEGATION_TREE })
    || binding.modelPolicyDigest !== canonicalDigest("factory-fixture-model/v1", { model: composition?.model, evidenceClass: "DETERMINISTIC" })
    || binding.verificationPolicyDigest !== `sha256:${composition?.local?.verificationPolicySha256}`
    || canonicalHash([...binding.allowedEffects].sort()) !== canonicalHash(["repository.read", "sandbox.write", "candidate.create", "verification.request"].sort())
    || binding.maxSpendMicrousd > Math.round(current.version.budget.maxCostUsd * 1_000_000)) throw Error("DELEGATION_CAPABILITY_CHANGED");
  if (run.executionCostAuthorization && (run.executionCostAuthorization.policyEnvelopeDigest !== canonicalHash(current.policy)
    || run.executionCostAuthorization.workOrderPolicyDigest !== canonicalHash(wo.metadata?.implementationPolicy))) throw Error("DELEGATION_POLICY_CHANGED");
  if (preparation.runId !== run.runId || preparation.taskId !== binding.taskId
    || preparation.tenantId !== binding.tenantId || preparation.projectId !== binding.projectId
    || preparation.missionId !== binding.missionId || preparation.missionPlanId !== binding.missionPlanId
    || preparation.workOrderId !== binding.workOrderId || preparation.repositoryId !== binding.repositoryId
    || preparation.repository !== wo.repository || preparation.delegatedSourceRepository !== LOCAL_DELEGATION_REPOSITORY
    || binding.repository !== preparation.delegatedSourceRepository || preparation.qualityContractDigest !== binding.qualityContractDigest
    || preparation.verificationContractDigest !== wo.verificationContractDigest
    || run.factoryDefinitionVersionId !== current.version._id
    || run.workflowId !== workflow?.workflowId
    || current.version.executionProfileSnapshot?.factoryVersion !== binding.factoryVersion
    || current.version.executionProfileSnapshot?.sourceSha !== LOCAL_DELEGATION_SOURCE
    || `sha256:${canonicalHash(current.version.executionProfileSnapshot?.configuration)}` !== binding.executionProfileDigest
    || canonicalHash({ sourceDigest: current.version.executionProfileSnapshot?.sourceDigest,
      configurationDigest: binding.executionProfileDigest.slice(7) }) !== binding.factoryVersion
    || preparation.definitionVersionId !== current.version._id
    || preparation.configurationDigest !== current.version.configurationDigest
    || preparation.configurationDigest !== factoryVersionConfigurationDigest(current.version)
    || preparation.configurationDigest !== run.factoryConfigurationDigest
    || preparation.executionProfileDigest !== binding.executionProfileDigest
    || preparation.executionProfileDigest !== current.version.executionProfileDigest
    || preparation.executionProfileDigest !== run.executionProfileDigest
    || !workflow?.active || preparation.workflowDigest !== `sha256:${canonicalHash(snapshotWorkflowDefinition(workflow))}`
    || preparation.planDigest !== `sha256:${canonicalHash(plan)}`
    || preparation.ownerId !== binding.ownerScope || preparation.workOrderRevisionId !== binding.workOrderRevisionId
    || preparation.workOrderRevisionNumber !== binding.workOrderRevisionNumber
    || preparation.baseCommit !== binding.baseCommit || preparation.baseTree !== binding.baseTree
    || preparation.factoryVersion !== binding.factoryVersion || preparation.factoryId !== binding.factoryId) throw Error("DELEGATION_PREPARATION_CHANGED");
  const rows = await ctx.db.query("approvalDecisions").withIndex("by_run", (q: any) => q.eq("workflowRunId", run._id)).collect();
  const approvals = rows.filter((a: any) => a.approvalType === "DELEGATION_EXECUTION" && a.status === "APPROVED"
    && a.decision === "APPROVE" && a.approver === binding.ownerScope && a.expiresAt >= binding.expiresAt && a.expiresAt > Date.now()
    && a.revokedAt === undefined && a.invalidatedByRevisionId === undefined && !a.supersededByApprovalDecisionId
    && a.projectId === wo.projectId && a.tenantId === wo.tenantId && a.workOrderId === wo._id
    && a.workOrderRevisionNumber === binding.workOrderRevisionNumber
    && a.metadata?.schema === "enterprise-delegation-approval/v1"
    && a.metadata?.bindingDigest === factoryDelegationBindingDigest(binding));
  if (approvals.length !== 1) throw Error("EXACT_DELEGATION_APPROVAL_REQUIRED");
  const approval = approvals[0];
  if (approval.metadata.ownerActorId !== binding.ownerScope || !approval.metadata.leaseId
    || approval.metadata.planDigest !== preparation.planDigest) throw Error("EXACT_DELEGATION_APPROVAL_REQUIRED");
  const tariff = verifyEngineeringTariff(binding, approval.metadata.tariff, Date.now());
  if (tariff.baseManifestDigest !== canonicalDigest(DELEGATION_PREPARATION, preparation)
    || ![tariff.baseManifestDigest, binding.executionManifestDigest].includes(run.executionManifestDigest)) throw Error("DELEGATION_PREPARATION_CHANGED");
  return { ...approval.metadata, approvalDecisionId: approval._id };
}
