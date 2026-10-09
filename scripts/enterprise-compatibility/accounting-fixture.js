import { internalMutationGeneric as mutation } from "convex/server";
import { reserveOfflineAttemptBudget } from "./lib/offlineAttemptBudget";
import { scopeExposure, settleUndispatchedEnterpriseAttempt, denyEnterprisePaidAuthority, assertEnterpriseAttemptExecution } from "./lib/enterpriseAttemptAccounting";
import { requireWorkspacePermission, FACTORY_PERMISSIONS } from "./lib/companyAccess";

async function owner(ctx, projectId, missionId) {
  const access = await requireWorkspacePermission(ctx, projectId, FACTORY_PERMISSIONS.MANAGE_AUTOMATION);
  const mission = await ctx.db.get(missionId);
  if (!mission || mission.projectId !== projectId || access.actorId !== mission.owner) throw Error("ACCOUNTING_OWNER_REQUIRED");
  return mission;
}
export const configure = mutation({ handler: async (ctx, { seed: s, daily = 100, mission = 100 }) => {
  await owner(ctx, s.projectId, s.missionId);
  await ctx.db.patch(s.projectId, { enterpriseAccountingMode: "ISOLATED_DETERMINISTIC" });
  await ctx.db.patch(s.missionId, { budgetUsd: mission / 1_000_000 });
  const policyEnvelopeId = await ctx.db.insert("policyEnvelopes", { tenantId: s.tenantId, projectId: s.projectId,
    name: "Isolated accounting", active: true, priority: 1, rules: { maxResourceCostUsd: 0.001 }, createdAt: Date.now(), updatedAt: Date.now() });
  await ctx.db.insert("operatorControls", { tenantId: s.tenantId, projectId: s.projectId, mode: "NORMAL",
    dailyBudgetUsd: daily / 1_000_000, perRunBudgetUsd: 0.00008, updatedBy: s.operatorId, updatedAt: Date.now() });
  for (const id of [s.definitionVersionId, s.nativeVersionId]) await ctx.db.patch(id, {
    configurationDigest: "factory-v1-12345678", executionProfileDigest: "sha256:" + "b".repeat(64), policyEnvelopeId,
    budget: { maxCostUsd: 0.00008, maxAttempts: 3, maxRuntimeMinutes: 1 } });
  await ctx.db.patch(s.workOrderId, { approvalStatus: "APPROVED", metadata: { implementationPolicy: { maxCostUsd: 0.0001, maxAttempts: 3, timeoutMinutes: 1 } } });
  await ctx.db.patch(s.workflowRunId, { runId: "seed-" + s.workflowRunId, spentUsd: 0, reservedCostUsd: 0, status: "PENDING", startedAt: Date.now() });
  return policyEnvelopeId;
} });
export const cloneWork = mutation({ handler: async (ctx, { seed: s }) => {
  await owner(ctx, s.projectId, s.missionId);
  const copy = async (table, id, patch) => { const { _id, _creationTime, ...row } = await ctx.db.get(id); return ctx.db.insert(table, { ...row, ...patch }); };
  const workOrderId = await copy("workOrders", s.workOrderId, {});
  const workOrderRevisionId = await copy("workOrderRevisions", s.workOrderRevisionId, { workOrderId });
  await ctx.db.patch(workOrderId, { currentRevisionId: workOrderRevisionId });
  const taskId = await copy("tasks", s.taskId, { workOrderId });
  const workflowRunId = await copy("workflowRuns", s.workflowRunId, { workOrderId, workOrderRevisionId, parentTaskId: taskId, runId: "run-" + workOrderId });
  return { ...s, workOrderId, workOrderRevisionId, taskId, workflowRunId };
} });
export const reserveNative = mutation({ handler: async (ctx, { seed: s }) => {
  const mission = await owner(ctx, s.projectId, s.missionId);
  const run = await ctx.db.get(s.workflowRunId), workOrder = await ctx.db.get(s.workOrderId), version = await ctx.db.get(s.nativeVersionId);
  if (run?.workOrderId !== workOrder?._id || run.projectId !== s.projectId) throw Error("SCOPE");
  if (run.executionCostAuthorization) return run.executionCostAuthorization;
  const authorization = await reserveOfflineAttemptBudget(ctx, { runId: run.runId, workOrder, mission, version,
    policy: await ctx.db.get(version.policyEnvelopeId), now: Date.now() });
  await ctx.db.patch(run._id, { executionCostAuthorization: authorization, spentUsd: 0, reservedCostUsd: authorization.reservedCostUsd,
    policyEnvelopeId: version.policyEnvelopeId });
  return authorization;
} });
export const exposure = mutation({ handler: async (ctx, { seed: s, dailyAt }) => {
  await owner(ctx, s.projectId, s.missionId);
  const runs = await ctx.db.query("workflowRuns").withIndex("by_project", q => q.eq("projectId", s.projectId)).collect();
  return scopeExposure(runs, dailyAt);
} });
export const settleUnused = mutation({ handler: async (ctx, { seed: s }) => {
  await owner(ctx, s.projectId, s.missionId);
  return settleUndispatchedEnterpriseAttempt(ctx, await ctx.db.get(s.workflowRunId), Date.now());
} });
export const claim = mutation({ handler: async (ctx, { seed: s }) => {
  await owner(ctx, s.projectId, s.missionId);
  const run = await ctx.db.get(s.workflowRunId);
  await assertEnterpriseAttemptExecution(ctx, run, "isolated-container");
  if (run.status !== "PENDING") return false;
  await ctx.db.patch(run._id, { status: "RUNNING", executionClaimedAt: Date.now(), lease: { leaseId: "native", ownerId: s.operatorId,
    claimedAt: Date.now(), heartbeatAt: Date.now(), expiresAt: Date.now() + 60000 } });
  return true;
} });
export const paid = mutation({ handler: async (ctx, { seed: s }) => { await owner(ctx, s.projectId, s.missionId); await denyEnterprisePaidAuthority(ctx, s.projectId); } });
