import { v } from "convex/values";
import { mutation, query, internalMutation } from "../_generated/server";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Id, Doc } from "../_generated/dataModel";
import { FACTORY_PERMISSIONS, requireWorkspacePermission } from "../lib/companyAccess";
import { fixtureRegistrationConfig, trialState } from "../lib/enterpriseCompatibilityValidators";
import {
  canonicalDigest, parseFactoryDelegationBinding, factoryDelegationBindingDigest,
  assertFactoryDelegationBindingMatches, reserveFixtureAllowance, transitionFixtureAllowance,
  assertMicrousd, type FactoryDelegationBinding,
} from "@mission-control/shared";

const denied = () => new Error("COMPATIBILITY_UNAVAILABLE");
const sha = (value: string) => /^sha256:[a-f0-9]{64}$/.test(value);
async function access(ctx: QueryCtx | MutationCtx, projectId: Id<"projects">, write = false) {
  try {
    if (process.env.MC_ENTERPRISE_COMPATIBILITY_FIXTURES !== "1" || !await ctx.auth.getUserIdentity()) throw denied();
    const result = await requireWorkspacePermission(ctx, projectId,
      write ? FACTORY_PERMISSIONS.MANAGE_AUTOMATION : FACTORY_PERMISSIONS.VIEW);
    if (result.membership.mode !== "AUTHENTICATED") throw denied();
    return result;
  } catch { throw denied(); }
}
async function audit(ctx: MutationCtx, projectId: Id<"projects">, tenantId: Id<"tenants">,
  actorId: string, targetId: string, action: string) {
  await ctx.db.insert("activities", { tenantId, projectId, actorId, actorType: "HUMAN", targetId,
    targetType: "FACTORY_COMPATIBILITY", action, description: "Fixture-only compatibility state changed" });
}
async function scopedFactory(ctx: QueryCtx | MutationCtx, projectId: Id<"projects">, id: Id<"factoryDefinitions">) {
  const row = await ctx.db.get(id), project = await ctx.db.get(projectId);
  if (!row || row.projectId !== projectId || !row.tenantId || row.tenantId !== project?.tenantId) throw denied();
  return row;
}
async function scopedMission(ctx: QueryCtx | MutationCtx, projectId: Id<"projects">, id: Id<"missions">) {
  const row = await ctx.db.get(id), project = await ctx.db.get(projectId);
  if (!row || row.projectId !== projectId || !row.tenantId || row.tenantId !== project?.tenantId
    || row.metadata?.enterpriseCompatibilityFixture !== true) throw denied();
  return row;
}
function eligible(row: Doc<"factoryDefinitions">, now: number) {
  const r = row.enterpriseRegistration;
  if (!r || row.status === "ARCHIVED" || r.revokedAt !== undefined || r.health !== "HEALTHY"
    || r.qualification !== "FIXTURE_QUALIFIED" || r.validUntil <= now) throw denied();
  return r;
}
export const register = mutation({
  args: { projectId: v.id("projects"), factoryDefinitionId: v.id("factoryDefinitions"), config: fixtureRegistrationConfig },
  handler: async (ctx, args) => {
    const auth = await access(ctx, args.projectId, true);
    const row = await scopedFactory(ctx, args.projectId, args.factoryDefinitionId);
    const version = await ctx.db.get(args.config.definitionVersionId);
    const c = args.config;
    if (!version || version.factoryDefinitionId !== row._id || version.tenantId !== row.tenantId
      || version.projectId !== row.projectId || version.repositoryId !== row.repositoryId
      || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/.test(c.factoryId)
      || !Number.isSafeInteger(c.capacity) || c.capacity < 1 || c.capacity > 100
      || c.capabilities.length === 0 || new Set(c.capabilities).size !== c.capabilities.length
      || (c.kind === "MYFACTORY" ? !/^[a-f0-9]{64}$/.test(c.factoryVersion)
        || !c.capabilities.includes("BOUNDED_DELEGATION") || c.capabilities.includes("NATIVE_EXECUTION")
        : c.factoryVersion !== version.configurationDigest || !c.capabilities.includes("NATIVE_EXECUTION")
          || c.capabilities.includes("BOUNDED_DELEGATION"))) throw denied();
    const digest = canonicalDigest("factory-fixture-registration/v1", c);
    if (row.enterpriseRegistration) {
      if (row.enterpriseRegistration.digest !== digest) throw new Error("REGISTRATION_CONFLICT");
      return row._id;
    }
    const peers = await ctx.db.query("factoryDefinitions").withIndex("by_project", q => q.eq("projectId", args.projectId)).take(101);
    if (peers.length > 100 || peers.some(p => p.enterpriseRegistration?.config.factoryId === c.factoryId)) throw denied();
    await ctx.db.patch(row._id, { enterpriseRegistration: { config: c, digest, revision: 1,
      health: "UNKNOWN", qualification: "UNQUALIFIED", validUntil: 0 } });
    await audit(ctx, args.projectId, row.tenantId!, auth.actorId, row._id, "COMPATIBILITY_REGISTERED");
    return row._id;
  },
});
export const assess = mutation({
  args: { projectId: v.id("projects"), factoryDefinitionId: v.id("factoryDefinitions"), expectedRevision: v.number(),
    health: v.union(v.literal("HEALTHY"), v.literal("UNHEALTHY"), v.literal("UNKNOWN")),
    evidenceDigest: v.string(), validUntil: v.number(), revoke: v.boolean() },
  handler: async (ctx, args) => {
    const auth = await access(ctx, args.projectId, true);
    const row = await scopedFactory(ctx, args.projectId, args.factoryDefinitionId), r = row.enterpriseRegistration;
    if (!r || r.revision !== args.expectedRevision || !sha(args.evidenceDigest) || !Number.isSafeInteger(args.validUntil)
      || (!args.revoke && (r.revokedAt !== undefined || args.validUntil <= Date.now() || args.validUntil > Date.now() + 86400000))) throw denied();
    await ctx.db.patch(row._id, { enterpriseRegistration: { ...r, revision: r.revision + 1,
      health: args.health, qualification: "FIXTURE_QUALIFIED", evidenceDigest: args.evidenceDigest,
      validUntil: args.validUntil, ...(args.revoke ? { revokedAt: r.revokedAt ?? Date.now() } : {}) } });
    await audit(ctx, args.projectId, row.tenantId!, auth.actorId, row._id, args.revoke ? "COMPATIBILITY_REVOKED" : "COMPATIBILITY_ASSESSED");
  },
});
export const getRegistry = query({
  args: { projectId: v.id("projects"), factoryDefinitionId: v.id("factoryDefinitions") },
  handler: async (ctx, args) => { await access(ctx, args.projectId); return (await scopedFactory(ctx, args.projectId, args.factoryDefinitionId)).enterpriseRegistration ?? null; },
});
export const initializeBudget = mutation({
  args: { projectId: v.id("projects"), missionId: v.id("missions") },
  handler: async (ctx, args) => {
    await access(ctx, args.projectId, true);
    const m = await scopedMission(ctx, args.projectId, args.missionId);
    const ceilingMicrousd = (m.budgetUsd ?? -1) * 1_000_000;
    assertMicrousd(ceilingMicrousd);
    if (m.spentUsd !== 0) throw denied();
    if (m.enterpriseFixtureBudget) {
      if (m.enterpriseFixtureBudget.ceilingMicrousd !== ceilingMicrousd) throw denied();
      return;
    }
    await ctx.db.patch(m._id, { enterpriseFixtureBudget: { mode: "FIXTURE_ONLY", ceilingMicrousd, holds: [] } });
  },
});
async function budgetFor(ctx: QueryCtx | MutationCtx, projectId: Id<"projects">, id: Id<"missions">) {
  const m = await scopedMission(ctx, projectId, id);
  if (!m.enterpriseFixtureBudget || m.enterpriseFixtureBudget.ceilingMicrousd !== (m.budgetUsd ?? -1) * 1_000_000 || m.spentUsd !== 0) throw denied();
  return { mission: m, budget: m.enterpriseFixtureBudget };
}
export const reserveNativeFixture = mutation({
  args: { projectId: v.id("projects"), missionId: v.id("missions"), id: v.string(), digest: v.string(), maximumMicrousd: v.number(), expiresAt: v.number() },
  handler: async (ctx, args) => {
    await access(ctx, args.projectId, true);
    if (!sha(args.digest) || !/^[A-Za-z0-9_-]{1,100}$/.test(args.id)) throw denied();
    const { budget } = await budgetFor(ctx, args.projectId, args.missionId);
    const updated = reserveFixtureAllowance(budget, { id: `native:${args.id}`, digest: args.digest, maximumMicrousd: args.maximumMicrousd, expiresAt: args.expiresAt, kind: "NATIVE" }, Date.now());
    await ctx.db.patch(args.missionId, { enterpriseFixtureBudget: updated });
  },
});
async function validateLineage(ctx: MutationCtx, b: FactoryDelegationBinding, mission: Doc<"missions">) {
  const id = ctx.db.normalizeId("workOrders", b.workOrderId);
  const wo = id ? await ctx.db.get(id) : null;
  const runId = ctx.db.normalizeId("workflowRuns", b.workflowRunId);
  const run = runId ? await ctx.db.get(runId) : null;
  if (!wo || !run || wo.tenantId !== mission.tenantId || wo.projectId !== mission.projectId || wo.missionId !== mission._id
    || String(wo.repositoryId) !== b.repositoryId || wo.repository !== b.repository || wo.currentRevisionNumber !== b.workOrderRevisionNumber
    || String(wo.currentRevisionId) !== b.workOrderRevisionId || String(wo.missionPlanId) !== b.missionPlanId
    || wo.missionPlanRevision !== b.missionPlanRevision || wo.qualityContractDigest !== b.qualityContractDigest
    || String(mission.currentPlanId) !== b.missionPlanId || String(mission.currentSpecRevisionId) !== b.missionSpecRevisionId
    || run.tenantId !== mission.tenantId || run.projectId !== mission.projectId || run.workOrderId !== wo._id
    || String(run.parentTaskId) !== b.taskId || run.executionManifestDigest !== b.executionManifestDigest
    || run.workOrderRevisionId !== wo.currentRevisionId || run.workOrderRevisionNumber !== wo.currentRevisionNumber) throw denied();
  const taskId = ctx.db.normalizeId("tasks", b.taskId);
  const task = taskId ? await ctx.db.get(taskId) : null;
  if (!task || task.tenantId !== mission.tenantId || task.projectId !== mission.projectId || task.workOrderId !== wo._id) throw denied();
  const planId = ctx.db.normalizeId("missionPlans", b.missionPlanId);
  const plan = planId ? await ctx.db.get(planId) : null;
  if (!plan || plan.missionId !== mission._id || plan.projectId !== mission.projectId || plan.tenantId !== mission.tenantId || plan.revisionNumber !== b.missionPlanRevision || canonicalDigest("mission-plan-fixture/v1", { revision: plan.revisionNumber, summary: plan.summary, blueprints: plan.workOrderBlueprints, assertions: plan.assertions ?? [] }) !== b.missionPlanDigest) throw denied();
}
export const admitTrial = mutation({
  args: { projectId: v.id("projects"), missionId: v.id("missions"), factoryDefinitionId: v.id("factoryDefinitions"), binding: v.any() },
  handler: async (ctx, args) => {
    await access(ctx, args.projectId, true);
    const b = parseFactoryDelegationBinding(args.binding), now = Date.now();
    const factory = await scopedFactory(ctx, args.projectId, args.factoryDefinitionId), registration = eligible(factory, now);
    const { mission, budget } = await budgetFor(ctx, args.projectId, args.missionId);
    if (b.tenantId !== String(mission.tenantId) || b.projectId !== String(args.projectId) || b.missionId !== String(mission._id)
      || b.factoryId !== registration.config.factoryId || b.factoryVersion !== registration.config.factoryVersion
      || b.repositoryId !== String(factory.repositoryId) || registration.config.kind !== "MYFACTORY"
      || b.budgetReservationId !== b.delegationId || b.maxSpendMicrousd <= 0) throw denied();
    assertFactoryDelegationBindingMatches(b, b, now);
    await validateLineage(ctx, b, mission);
    const digest = factoryDelegationBindingDigest(b);
    const existing = await ctx.db.query("factoryDelegationTrials").withIndex("by_project_delegation", q => q.eq("projectId", args.projectId).eq("delegationId", b.delegationId)).unique();
    if (existing) {
      if (existing.bindingDigest !== digest || existing.factoryDefinitionId !== factory._id) throw new Error("DELEGATION_CONFLICT");
      return existing._id;
    }
    for (const duplicate of [
      await ctx.db.query("factoryDelegationTrials").withIndex("by_project_request", q => q.eq("projectId", args.projectId).eq("partnerRequestId", b.partnerRequestId)).first(),
      await ctx.db.query("factoryDelegationTrials").withIndex("by_project_work", q => q.eq("projectId", args.projectId).eq("partnerWorkId", b.partnerWorkId)).first(),
    ]) if (duplicate) throw new Error("PARTNER_IDENTITY_ALREADY_BOUND");
    const trials = await ctx.db.query("factoryDelegationTrials").withIndex("by_factory", q => q.eq("factoryDefinitionId", factory._id)).take(101);
    if (trials.length > 100 || trials.filter(t => !t.closed).length >= registration.config.capacity) throw new Error("CAPACITY_UNAVAILABLE");
    const updated = reserveFixtureAllowance(budget, { id: b.delegationId, digest, kind: "DELEGATED", maximumMicrousd: b.maxSpendMicrousd, expiresAt: b.expiresAt }, now);
    await ctx.db.patch(mission._id, { enterpriseFixtureBudget: updated });
    return await ctx.db.insert("factoryDelegationTrials", { tenantId: mission.tenantId!, projectId: args.projectId,
      missionId: mission._id, factoryDefinitionId: factory._id, delegationId: b.delegationId, partnerRequestId: b.partnerRequestId, partnerWorkId: b.partnerWorkId, binding: b,
      bindingDigest: digest, registrationDigest: registration.digest, state: "RESERVED", observationRevision: 0,
      cancelRequested: false, closed: false, createdAt: now, updatedAt: now });
  },
});
async function trialFor(ctx: QueryCtx | MutationCtx, projectId: Id<"projects">, id: Id<"factoryDelegationTrials">) {
  const row = await ctx.db.get(id), project = await ctx.db.get(projectId);
  if (!row || row.projectId !== projectId || row.tenantId !== project?.tenantId) throw denied();
  return row;
}
export const readTrial = query({
  args: { projectId: v.id("projects"), trialId: v.id("factoryDelegationTrials") },
  handler: async (ctx, args) => { await access(ctx, args.projectId); return await trialFor(ctx, args.projectId, args.trialId); },
});
export const getBudget = query({
  args: { projectId: v.id("projects"), missionId: v.id("missions") },
  handler: async (ctx, args) => { await access(ctx, args.projectId); return (await budgetFor(ctx, args.projectId, args.missionId)).budget; },
});
export const claimTrial = mutation({
  args: { projectId: v.id("projects"), trialId: v.id("factoryDelegationTrials") },
  handler: async (ctx, args) => {
    await access(ctx, args.projectId, true);
    const t = await trialFor(ctx, args.projectId, args.trialId);
    if (t.state !== "RESERVED" || t.cancelRequested || t.closed) return false;
    const now = Date.now(), r = eligible(await scopedFactory(ctx, args.projectId, t.factoryDefinitionId), now);
    if (r.digest !== t.registrationDigest) throw denied();
    const { budget, mission } = await budgetFor(ctx, args.projectId, t.missionId);
    const b = parseFactoryDelegationBinding(t.binding);
    assertFactoryDelegationBindingMatches(b, b, now);
    await validateLineage(ctx, b, mission);
    await ctx.db.patch(t.missionId, { enterpriseFixtureBudget: transitionFixtureAllowance(budget, t.delegationId, { type: "SEND", now }) });
    await ctx.db.patch(t._id, { state: "UNKNOWN", updatedAt: now });
    return true;
  },
});
export const cancelTrial = mutation({
  args: { projectId: v.id("projects"), trialId: v.id("factoryDelegationTrials") },
  handler: async (ctx, args) => {
    await access(ctx, args.projectId, true);
    const t = await trialFor(ctx, args.projectId, args.trialId), { budget } = await budgetFor(ctx, args.projectId, t.missionId);
    if (t.closed) return;
    const unsent = t.state === "RESERVED";
    const terminal = ["COMPLETED", "FAILED", "CANCELLED"].includes(t.state);
    await ctx.db.patch(t.missionId, { enterpriseFixtureBudget: transitionFixtureAllowance(budget, t.delegationId, { type: "CANCEL", now: Date.now() }) });
    await ctx.db.patch(t._id, { cancelRequested: true, closed: unsent, state: unsent ? "CANCELLED" : terminal ? t.state : "STOPPING", updatedAt: Date.now() });
  },
});
export const observeTrial = internalMutation({
  args: { projectId: v.id("projects"), trialId: v.id("factoryDelegationTrials"), revision: v.number(),
    state: trialState, partnerWorkOrderId: v.string(), partnerRunId: v.string(), receiptDigest: v.string(),
    settlement: v.optional(v.object({ actualMicrousd: v.number(), cleanupConfirmed: v.literal(true) })) },
  handler: async (ctx, args) => {
    await access(ctx, args.projectId, true);
    const t = await trialFor(ctx, args.projectId, args.trialId);
    if (!sha(args.receiptDigest) || !Number.isSafeInteger(args.revision) || args.revision < 1
      || args.state === "RESERVED" || !/^[A-Za-z0-9_-]{1,200}$/.test(args.partnerRunId)
      || !/^[A-Za-z0-9_-]{1,200}$/.test(args.partnerWorkOrderId)) throw denied();
    const observationDigest = canonicalDigest("factory-fixture-observation/v1", args);
    if (args.revision === t.observationRevision && observationDigest === t.observationDigest) return;
    if (t.closed || t.state === "RESERVED" || args.revision <= t.observationRevision
      || (t.partnerRunId && (t.partnerRunId !== args.partnerRunId || t.partnerWorkOrderId !== args.partnerWorkOrderId))) throw denied();
    if (["COMPLETED", "FAILED", "CANCELLED"].includes(t.state) && args.state !== t.state) throw denied();
    const terminal = ["COMPLETED", "FAILED", "CANCELLED"].includes(args.state);
    if (args.settlement && !terminal) throw denied();
    if (args.settlement) {
      const { budget } = await budgetFor(ctx, args.projectId, t.missionId);
      await ctx.db.patch(t.missionId, { enterpriseFixtureBudget: transitionFixtureAllowance(budget, t.delegationId,
        { type: "RECONCILE", ...args.settlement, settlementDigest: args.receiptDigest }) });
    }
    await ctx.db.patch(t._id, { state: t.cancelRequested && !terminal ? "STOPPING" : args.state,
      partnerRunId: args.partnerRunId, partnerWorkOrderId: args.partnerWorkOrderId,
      observationRevision: args.revision, observationDigest, closed: !!args.settlement, updatedAt: Date.now() });
  },
});
export const expireTrial = mutation({
  args: { projectId: v.id("projects"), trialId: v.id("factoryDelegationTrials") },
  handler: async (ctx, args) => {
    await access(ctx, args.projectId, true);
    const t = await trialFor(ctx, args.projectId, args.trialId);
    if (t.closed) return;
    const b = parseFactoryDelegationBinding(t.binding), now = Date.now();
    if (b.expiresAt > now) throw denied();
    const { budget } = await budgetFor(ctx, args.projectId, t.missionId);
    await ctx.db.patch(t.missionId, { enterpriseFixtureBudget: transitionFixtureAllowance(budget, t.delegationId, { type: "EXPIRE", now }) });
    if (t.state === "RESERVED") await ctx.db.patch(t._id, { state: "CANCELLED", closed: true, updatedAt: now });
  },
});
