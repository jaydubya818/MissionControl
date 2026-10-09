import { verificationContractDigest } from "@mission-control/workflow-engine/verification-identity";
import { internalMutationGeneric as internalMutation, mutationGeneric as mutation } from "convex/server";
import schema from "./schema";

export const seed = mutation({ args: {}, handler: async ctx => {
  const known = {};
  function value(v) {
    if (v.type === "literal") return v.value;
    if (v.type === "string") return "fixture";
    if (v.type === "number") return 1;
    if (v.type === "boolean") return false;
    if (v.type === "null" || v.type === "any") return null;
    if (v.type === "array") return [];
    if (v.type === "union") return value(v.value[0]);
    if (v.type === "id") {
      if (!known[v.tableName]) throw Error(`Missing fixture reference ${v.tableName}`);
      return known[v.tableName];
    }
    if (v.type === "object") return Object.fromEntries(Object.entries(v.value).filter(([, f]) => !f.optional).map(([k, f]) => [k, value(f.fieldType)]));
    throw Error(`Unsupported fixture field ${v.type}`);
  }
  async function insert(table, overrides) {
    const fields = schema.tables[table].validator.json.value;
    const row = {};
    for (const [name, field] of Object.entries(fields)) {
      if (Object.hasOwn(overrides, name)) row[name] = overrides[name];
      else if (!field.optional) row[name] = value(field.fieldType);
    }
    const id = await ctx.db.insert(table, row); known[table] = id; return id;
  }
  const tenantId = await insert("tenants", { name: "Fixture owner", slug: "fixture-owner", active: true });
  const projectId = await insert("projects", { tenantId, name: "Compatibility fixture", slug: "compatibility-fixture" });
  const operatorId = await insert("operators", { tenantId, authId: "fixture-owner", email: "owner@example.test", active: true });
  const roleId = await insert("roles", { tenantId, name: "Owner", permissions: ["company.manage"] });
  await insert("roleAssignments", { operatorId, roleId });
  const peerOperatorId = await insert("operators", { tenantId, authId: "fixture-peer", email: "peer@example.test", active: true });
  await insert("roleAssignments", { operatorId: peerOperatorId, roleId });
  const repositoryId = await insert("workspaceRepositories", { tenantId, projectId });
  const workflowId = await insert("workflows", {});
  const factoryDefinitionId = await insert("factoryDefinitions", { tenantId, projectId, repositoryId, status: "DRAFT", name: "MyFactory compatibility" });
  const definitionVersionId = await insert("factoryDefinitionVersions", { tenantId, projectId, factoryDefinitionId, repositoryId, workflowId,
    configurationDigest: "factory-v1-fixture" });
  const nativeFactoryId = await insert("factoryDefinitions", { tenantId, projectId, repositoryId, status: "DRAFT", name: "Native compatibility" });
  const nativeVersionId = await insert("factoryDefinitionVersions", { tenantId, projectId, factoryDefinitionId: nativeFactoryId, repositoryId, workflowId, configurationDigest: "factory-v1-native-fixture" });
  const missionId = await insert("missions", { tenantId, projectId, owner: operatorId, spentUsd: 0, budgetUsd: 0.0001, metadata: { enterpriseCompatibilityFixture: true } });
  await insert("projectConstitutionRevisions", { projectId });
  const missionSpecRevisionId = await insert("missionSpecRevisions", { tenantId, projectId, missionId });
  const missionPlanId = await insert("missionPlans", { tenantId, projectId, missionId, summary: "Fixture plan", workOrderBlueprints: [] });
  await ctx.db.patch(missionId, { currentPlanId: missionPlanId, currentSpecRevisionId: missionSpecRevisionId });
  const quality = "sha256:" + "a".repeat(64);
  const workOrderId = await insert("workOrders", { tenantId, projectId, missionId, repositoryId, repository: "fixture/source",
    missionPlanId, missionPlanRevision: 1, currentRevisionNumber: 1, qualityContractDigest: quality });
  const workOrderRevisionId = await insert("workOrderRevisions", { tenantId, projectId, workOrderId });
  await ctx.db.patch(workOrderId, { currentRevisionId: workOrderRevisionId });
  const taskId = await insert("tasks", { tenantId, projectId, workOrderId });
  const workflowRunId = await insert("workflowRuns", { tenantId, projectId, missionId, workOrderId, workOrderRevisionId,
    workOrderRevisionNumber: 1, parentTaskId: taskId, executionManifestDigest: quality });
  const otherTenantId = await insert("tenants", { name: "Other", slug: "other", active: true });
  const otherProjectId = await insert("projects", { tenantId: otherTenantId, name: "Other", slug: "other" });
  const otherOperatorId = await insert("operators", { tenantId: otherTenantId, authId: "fixture-other", email: "other@example.test", active: true });
  const otherRoleId = await insert("roles", { tenantId: otherTenantId, name: "Owner", permissions: ["company.manage"] });
  await insert("roleAssignments", { operatorId: otherOperatorId, roleId: otherRoleId });
  return { tenantId, projectId, repositoryId, factoryDefinitionId, definitionVersionId, nativeFactoryId, nativeVersionId,
    missionId, missionSpecRevisionId, missionPlanId, workOrderId, workOrderRevisionId, taskId, workflowRunId, otherProjectId, operatorId };
} });


export const approveExecution = internalMutation({ handler: async (ctx, args) => {
  const { binding: b, bindingDigest, checkIdsDigest, quality, verificationSpec, deferClaim, tariff } = args;
  const identity = await ctx.auth.getUserIdentity();
  if (identity?.subject !== "fixture-owner") throw Error("FIXTURE_OWNER_REQUIRED");
  const mission = await ctx.db.get(b.missionId), plan = await ctx.db.get(b.missionPlanId), run = await ctx.db.get(b.workflowRunId);
  if (plan.metadata?.enterpriseDelegationApproval) throw Error("APPROVAL_IMMUTABLE");
  await ctx.db.patch(mission._id, { owner: b.ownerScope, activeWorkOrderId: b.workOrderId, state: "IN_PROGRESS" });
  await ctx.db.patch(plan._id, { status: "APPROVED", approvedBy: b.ownerScope, approvedAt: Date.now(), decidedActorSource: "AUTHENTICATED",
    qualityContractDigest: quality.digest, qualityContractProjection: quality.projection,
    metadata: { enterpriseDelegationApproval: { bindingDigest, checkIdsDigest, verificationSpec, ...(tariff ? { tariff } : {}), ownerActorId: b.ownerScope, leaseId: "fixture-lease", criterionTitle: "Project slug protected behavior" } } });
  await ctx.db.patch(b.workOrderId, { approvalStatus: "APPROVED", repository: b.repository, currentExecutionRunId: run._id, qualityContractDigest: b.qualityContractDigest,
    requiredApprovals: verificationSpec.requiredApprovals, riskReasons: verificationSpec.riskReasons, requirements: verificationSpec.requirements ?? [], verificationContractDigest: verificationContractDigest(verificationSpec.verificationContract, b.qualityContractDigest),
    acceptanceCriteria: verificationSpec.acceptanceCriteria.map(c => ({ ...c, status: "PENDING" })), negativeConstraints: verificationSpec.negativeConstraints, changeBudget: verificationSpec.changeBudget, verificationContract: verificationSpec.verificationContract });
  await ctx.db.patch(b.workOrderRevisionId, { status: "APPLIED" });
  await ctx.db.patch(run._id, { status: deferClaim ? "PENDING" : "RUNNING", executionManifestDigest: b.executionManifestDigest,
    metadata: { enterpriseDelegationId: b.delegationId },
    ...(deferClaim ? {} : { lease: { leaseId: "fixture-lease", ownerId: b.ownerScope, workerGeneration: b.authorityGeneration,
      claimedAt: Date.now(), heartbeatAt: Date.now(), expiresAt: b.deadline + 60000 } }) });
} });
export const fault = internalMutation({ handler: async (ctx, args) => {
  if ((await ctx.auth.getUserIdentity())?.subject !== "fixture-owner") throw Error("FIXTURE_OWNER_REQUIRED");
  await ctx.db.patch(args.id, { ...args.patch, ...Object.fromEntries((args.unset ?? []).map(key => [key, undefined])) });
} });
export const inspect = internalMutation({ handler: async (ctx, args) => ctx.db.get(args.id) });
