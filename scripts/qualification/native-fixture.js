// Copied only into a freshly generated disposable database. This is NOT a
// deployed control-plane endpoint and never creates Attempts or execution proof.
import { internalMutationGeneric as internalMutation, mutationGeneric as mutation, queryGeneric as query } from "convex/server";
import { v } from "convex/values";

async function owner(ctx) {
  if (process.env.MC_NATIVE_SUCCESSOR_QUALIFICATION !== "1"
    || (await ctx.auth.getUserIdentity())?.subject !== "user_SyntheticHandoffQualification") throw Error("NATIVE_FIXTURE_OWNER_REQUIRED");
}
export const seed = mutation({ args: {}, handler: async ctx => {
  await owner(ctx);
  if (await ctx.db.query("tenants").first()) throw Error("FRESH_DATABASE_REQUIRED");
  const now = Date.now(), metadata = { schema: "unpublished-handoff-fixture/v1", synthetic: true, productionAuthority: false };
  const tenantId = await ctx.db.insert("tenants", { name: "Native successor qualification", slug: "synthetic-handoff-qualification", active: true, metadata });
  const projectId = await ctx.db.insert("projects", { tenantId, name: "Native successor qualification", slug: "synthetic-unpublished-handoff",
    status: "ACTIVE", enterpriseAccountingMode: "ISOLATED_DETERMINISTIC", metadata });
  const roleId = await ctx.db.insert("roles", { tenantId, name: "Owner", permissions: ["company.manage", "factory.automation.manage"] });
  const createOperator = async (authId, name) => {
    const id = await ctx.db.insert("operators", { tenantId, authId, name, email: authId + "@example.test", active: true, createdAt: now, metadata });
    await ctx.db.insert("roleAssignments", { operatorId: id, roleId, assignedAt: now }); return id;
  };
  const operatorId = await createOperator("user_SyntheticHandoffQualification", "Qualification owner");
  const authorId = await createOperator("user_SyntheticPlanAuthorQualification", "Independent plan author");
  const peerId = await createOperator("fixture-peer", "Other owner");
  const memberId = await ctx.db.insert("orgMembers", { tenantId, projectId, operatorId, name: "Qualification owner", role: "Owner", level: 0, active: true, systemRole: "OWNER", metadata });
  const teamId = await ctx.db.insert("scrumTeams", { tenantId, projectId, name: "Qualification", slug: "qualification", status: "ACTIVE", leadMemberId: memberId, createdAt: now, updatedAt: now });
  await ctx.db.insert("teamMemberships", { tenantId, projectId, teamId, memberId, operatorId, role: "LEAD", active: true, activeFrom: now, createdAt: now, updatedAt: now });
  const environmentId = await ctx.db.insert("environments", { tenantId, name: "Isolated deterministic fixture", type: "dev",
    metadata: { schema: "factory-qualification-environment/v1", synthetic: true, projectId } });
  for (const key of ["missions.plan-release-v1", "delivery.workorders", "company.context", "control-plane.repository-projection", "control-plane.dispatch-scope"]) {
    await ctx.db.insert("featureFlags", { projectId, key, enabled: true, createdAt: now, updatedAt: now });
  }
  await ctx.db.insert("operatorControls", { tenantId, projectId, mode: "NORMAL", dailyBudgetUsd: 1, perRunBudgetUsd: 0.01, updatedBy: operatorId, updatedAt: now });
  const otherTenantId = await ctx.db.insert("tenants", { name: "Other tenant", slug: "other-tenant", active: true });
  const otherProjectId = await ctx.db.insert("projects", { tenantId: otherTenantId, name: "Other project", slug: "other-project" });
  const otherOperatorId = await ctx.db.insert("operators", { tenantId: otherTenantId, authId: "fixture-other", name: "Other tenant owner", email: "other@example.test", active: true, createdAt: now });
  const otherRoleId = await ctx.db.insert("roles", { tenantId: otherTenantId, name: "Owner", permissions: ["company.manage"] });
  await ctx.db.insert("roleAssignments", { operatorId: otherOperatorId, roleId: otherRoleId, assignedAt: now });
  return { tenantId, projectId, operatorId, authorId, peerId, memberId, teamId, environmentId, otherProjectId };
} });
export const inspect = query({ args: { table: v.string() }, handler: async (ctx, { table }) => {
  await owner(ctx);
  if (!["workflowRuns", "workOrders", "runArtifacts", "runEvents", "factoryWorkers", "verificationReceipts", "verificationRuns", "qualityGateDecisions", "evidenceEnvelopes", "serviceCommandReceipts", "missionHandoffs", "validationAssertions", "roleAssignments", "teamMemberships", "inferenceReservations", "factoryProviderReservations", "factoryDelegationTrials"].includes(table)) throw Error("FIXTURE_TABLE_DENIED");
  return ctx.db.query(table).collect();
} });
export const inspectRecord = query({ args: { id: v.string() }, handler: async (ctx, { id }) => {
  await owner(ctx); return ctx.db.get(id);
} });
export const fault = internalMutation({ handler: async (ctx, { id, patch, unset = [] }) => {
  await owner(ctx);
  await ctx.db.patch(id, { ...patch, ...Object.fromEntries(unset.map(key => [key, undefined])) });
} });
export const extraClaim = internalMutation({ handler: async (ctx, { id }) => {
  await owner(ctx);
  const event = await ctx.db.get(id);
  if (!event?.idempotencyKey?.endsWith(":claimed")) throw Error("CLAIM_REQUIRED");
  const { _id, _creationTime, ...body } = event;
  return ctx.db.insert("runEvents", { ...body, idempotencyKey: body.idempotencyKey.replace(":claimed", ":qualification-extra:claimed") });
} });
export const removeExtraClaim = internalMutation({ handler: async (ctx, { id }) => {
  await owner(ctx);
  if (!(await ctx.db.get(id))?.idempotencyKey?.endsWith(":qualification-extra:claimed")) throw Error("EXTRA_CLAIM_REQUIRED");
  await ctx.db.delete(id);
} });
