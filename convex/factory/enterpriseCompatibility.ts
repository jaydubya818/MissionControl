import { ingestEnterpriseQualityGate } from "../lib/enterpriseQualityGate";
import { getCurrentVerificationRoutingOutcome } from "../lib/currentVerification";
import { v } from "convex/values";
import { mutation, query, internalMutation, internalQuery } from "../_generated/server";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Id, Doc } from "../_generated/dataModel";
import { FACTORY_PERMISSIONS, requireWorkspacePermission } from "../lib/companyAccess";
import { fixtureRegistrationConfig, trialState } from "../lib/enterpriseCompatibilityValidators";
import {
  canonicalDigest, canonicalHash, parseFactoryDelegationBinding, factoryDelegationBindingDigest,
  assertFactoryDelegationBindingMatches, reserveFixtureAllowance, transitionFixtureAllowance,
  assertMicrousd, type FactoryDelegationBinding,
  verifyEngineeringTariff,
} from "@mission-control/shared";

import { VerificationEngine, ChangeBudgetVerifier, NegativeConstraintVerifier } from "@mission-control/workflow-engine/verification";
import { legacyQualityGateStateForVerdict } from "../lib/qualityGateDecision";
import { enterpriseProject, scopeExposure, settleUndispatchedEnterpriseAttempt, settleExecutedEnterpriseAttempt, assertEnterpriseAttemptExecution } from "../lib/enterpriseAttemptAccounting";
import { reserveOfflineAttemptBudget } from "../lib/offlineAttemptBudget";

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
    if ((c.executionProvider === "LOCAL_DOCKER_QUALIFICATION") !== !!c.localProviderSourceSha
      || (c.localProviderSourceSha && !/^[a-f0-9]{40}$/.test(c.localProviderSourceSha))) throw denied();
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
    const auth = await access(ctx, args.projectId, true);
    const m = await scopedMission(ctx, args.projectId, args.missionId);
    if (await enterpriseProject(ctx, args.projectId)) throw Error("CANONICAL_ATTEMPT_AUTHORITY_REQUIRED");
    if (m.owner !== auth.actorId) throw denied();
    const ceilingMicrousd = (m.budgetUsd ?? -1) * 1_000_000;
    assertMicrousd(ceilingMicrousd);
    if (m.spentUsd !== 0) throw denied();
    if (m.enterpriseFixtureBudget) {
      if (m.enterpriseFixtureBudget.ownerActorId !== auth.actorId || m.enterpriseFixtureBudget.ceilingMicrousd !== ceilingMicrousd) throw denied();
      return;
    }
    await ctx.db.patch(m._id, { enterpriseFixtureBudget: { mode: "FIXTURE_ONLY", ownerActorId: auth.actorId, ceilingMicrousd, holds: [] } });
  },
});
async function budgetFor(ctx: QueryCtx | MutationCtx, projectId: Id<"projects">, id: Id<"missions">) {
  const m = await scopedMission(ctx, projectId, id);
  if (await enterpriseProject(ctx, projectId)) {
    if (m.owner !== (await access(ctx, projectId)).actorId) throw denied();
    return { mission: m, budget: null, canonical: true as const };
  }
  if (m.enterpriseFixtureBudget?.ownerActorId !== (await access(ctx, projectId)).actorId) throw denied();
  if (!m.enterpriseFixtureBudget || m.enterpriseFixtureBudget.ceilingMicrousd !== (m.budgetUsd ?? -1) * 1_000_000 || m.spentUsd !== 0) throw denied();
  return { mission: m, budget: m.enterpriseFixtureBudget, canonical: false as const };
}
export const reserveNativeFixture = mutation({
  args: { projectId: v.id("projects"), missionId: v.id("missions"), id: v.string(), digest: v.string(), maximumMicrousd: v.number(), expiresAt: v.number() },
  handler: async (ctx, args) => {
    await access(ctx, args.projectId, true);
    if (!sha(args.digest) || !/^[A-Za-z0-9_-]{1,100}$/.test(args.id)) throw denied();
    const { budget } = await budgetFor(ctx, args.projectId, args.missionId);
    if (!budget) throw Error("CANONICAL_ATTEMPT_AUTHORITY_REQUIRED");
    const updated = reserveFixtureAllowance(budget, { id: `native:${args.id}`, digest: args.digest, maximumMicrousd: args.maximumMicrousd, expiresAt: args.expiresAt, kind: "NATIVE" }, Date.now());
    await ctx.db.patch(args.missionId, { enterpriseFixtureBudget: updated });
  },
});
async function validateLineage(ctx: MutationCtx | QueryCtx, b: FactoryDelegationBinding, mission: Doc<"missions">) {
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
    const auth = await access(ctx, args.projectId, true);
    const b = parseFactoryDelegationBinding(args.binding), now = Date.now();
    const factory = await scopedFactory(ctx, args.projectId, args.factoryDefinitionId), registration = eligible(factory, now);
    const { mission, budget } = await budgetFor(ctx, args.projectId, args.missionId);
    if (b.tenantId !== String(mission.tenantId) || b.projectId !== String(args.projectId) || b.missionId !== String(mission._id)
      || b.factoryId !== registration.config.factoryId || b.factoryVersion !== registration.config.factoryVersion
      || b.repositoryId !== String(factory.repositoryId) || registration.config.kind !== "MYFACTORY"
      || b.budgetReservationId !== b.delegationId || b.maxSpendMicrousd <= 0) throw denied();
    assertFactoryDelegationBindingMatches(b, b, now);
    await validateLineage(ctx, b, mission);
    if (registration.config.executionProvider) {
      const plan = await ctx.db.get(b.missionPlanId as Id<"missionPlans">);
      const approval = plan?.metadata?.enterpriseDelegationApprovals?.[b.delegationId] ?? plan?.metadata?.enterpriseDelegationApproval;
      if (mission.owner !== auth.actorId || b.ownerScope !== auth.actorId || approval?.bindingDigest !== factoryDelegationBindingDigest(b)) throw denied();
    }
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
    if (budget) {
      const updated = reserveFixtureAllowance(budget, { id: b.delegationId, digest, kind: "DELEGATED", maximumMicrousd: b.maxSpendMicrousd, expiresAt: b.expiresAt }, now);
      await ctx.db.patch(mission._id, { enterpriseFixtureBudget: updated });
    } else {
      const run = await ctx.db.get(b.workflowRunId as Id<"workflowRuns">);
      const workOrder = await ctx.db.get(b.workOrderId as Id<"workOrders">);
      const version = await ctx.db.get(registration.config.definitionVersionId);
      const policy = version?.policyEnvelopeId ? await ctx.db.get(version.policyEnvelopeId) : null;
      const plan = await ctx.db.get(b.missionPlanId as Id<"missionPlans">);
      const approval = plan?.metadata?.enterpriseDelegationApprovals?.[b.delegationId] ?? plan?.metadata?.enterpriseDelegationApproval;
      if (plan?.status !== "APPROVED" || plan.decidedActorSource !== "AUTHENTICATED" || plan.approvedBy !== auth.actorId
        || !plan.approvedAt || approval?.ownerActorId !== auth.actorId || approval.revokedAt !== undefined) throw denied();
      const tariff = approval.tariff ? verifyEngineeringTariff(b, approval.tariff, now) : undefined;
      if (!run || !version || registration.config.executionProvider !== "LOCAL_DOCKER_QUALIFICATION"
        || run.executionCostAuthorization || run.enterpriseSettlement
        || version.budget.maxCostUsd * 1_000_000 !== b.maxSpendMicrousd) throw denied();
      const authorization = await reserveOfflineAttemptBudget(ctx, { runId: run.runId, version, workOrder, mission, policy, now, tariff,
        delegation: { id: b.delegationId, factoryId: b.factoryId, factoryVersion: b.factoryVersion, provider: "local-docker",
          modelPolicyDigest: b.modelPolicyDigest, executionProfileDigest: b.executionProfileDigest,
          bindingDigest: digest, expiresAt: b.expiresAt, maximumMicrousd: b.maxSpendMicrousd } });
      await ctx.db.patch(run._id, { executionCostAuthorization: authorization, reservedCostUsd: b.maxSpendMicrousd / 1_000_000,
        spentUsd: 0, policyEnvelopeId: version.policyEnvelopeId, factoryDefinitionVersionId: version._id });
    }
    return await ctx.db.insert("factoryDelegationTrials", { tenantId: mission.tenantId!, projectId: args.projectId,
      missionId: mission._id, factoryDefinitionId: factory._id, delegationId: b.delegationId, partnerRequestId: b.partnerRequestId, partnerWorkId: b.partnerWorkId, binding: b,
      bindingDigest: digest, registrationDigest: registration.digest, state: "RESERVED", observationRevision: 0,
      cancelRequested: false, closed: false, createdAt: now, updatedAt: now });
  },
});
async function trialFor(ctx: QueryCtx | MutationCtx, projectId: Id<"projects">, id: Id<"factoryDelegationTrials">) {
  const row = await ctx.db.get(id), project = await ctx.db.get(projectId);
  if (!row || row.projectId !== projectId || row.tenantId !== project?.tenantId) throw denied();
  const factory = await scopedFactory(ctx, projectId, row.factoryDefinitionId);
  if (factory.enterpriseRegistration?.config.executionProvider) {
    const mission = await scopedMission(ctx, projectId, row.missionId);
    if ((await access(ctx, projectId)).actorId !== mission.owner) throw denied();
  }
  return row;
}
export const readTrial = query({
  args: { projectId: v.id("projects"), trialId: v.id("factoryDelegationTrials") },
  handler: async (ctx, args) => { await access(ctx, args.projectId); return await trialFor(ctx, args.projectId, args.trialId); },
});
export const getBudget = query({
  args: { projectId: v.id("projects"), missionId: v.id("missions") },
  handler: async (ctx, args) => {
    await access(ctx, args.projectId);
    const { budget, mission } = await budgetFor(ctx, args.projectId, args.missionId);
    if (budget) return budget;
    const runs = await ctx.db.query("workflowRuns").withIndex("by_mission", q => q.eq("missionId", mission._id)).collect();
    return { mode: "CANONICAL_ATTEMPTS", exposureMicrousd: scopeExposure(runs), ceilingMicrousd: mission.budgetUsd! * 1_000_000 };
  },
});
export const claimTrial = mutation({
  args: { projectId: v.id("projects"), trialId: v.id("factoryDelegationTrials") },
  handler: async (ctx, args) => {
    await access(ctx, args.projectId, true);
    const t = await trialFor(ctx, args.projectId, args.trialId);
    if (t.state !== "RESERVED" || t.cancelRequested || t.closed) return false;
    if ((await scopedFactory(ctx, args.projectId, t.factoryDefinitionId)).enterpriseRegistration?.config.executionProvider)
      await executionAuthority(ctx, args.projectId, t._id);
    const now = Date.now(), r = eligible(await scopedFactory(ctx, args.projectId, t.factoryDefinitionId), now);
    if (r.digest !== t.registrationDigest) throw denied();
    const { budget, mission } = await budgetFor(ctx, args.projectId, t.missionId);
    const b = parseFactoryDelegationBinding(t.binding);
    assertFactoryDelegationBindingMatches(b, b, now);
    await validateLineage(ctx, b, mission);
    if (budget) await ctx.db.patch(t.missionId, { enterpriseFixtureBudget: transitionFixtureAllowance(budget, t.delegationId, { type: "SEND", now }) });
    else await assertEnterpriseAttemptExecution(ctx, await ctx.db.get(b.workflowRunId as Id<"workflowRuns">), "local-docker");
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
    if (budget) await ctx.db.patch(t.missionId, { enterpriseFixtureBudget: transitionFixtureAllowance(budget, t.delegationId, { type: "CANCEL", now: Date.now() }) });
    else if (unsent) await settleUndispatchedEnterpriseAttempt(ctx, await ctx.db.get(t.binding.workflowRunId), Date.now());
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
      const factory = await scopedFactory(ctx, args.projectId, t.factoryDefinitionId);
      if (factory.enterpriseRegistration?.config.executionProvider) throw denied();
      const { budget } = await budgetFor(ctx, args.projectId, t.missionId);
      if (!budget) throw Error("CANONICAL_SETTLEMENT_PROOF_REQUIRED");
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
    if (budget) await ctx.db.patch(t.missionId, { enterpriseFixtureBudget: transitionFixtureAllowance(budget, t.delegationId, { type: "EXPIRE", now }) });
    else if (t.state === "RESERVED") await settleUndispatchedEnterpriseAttempt(ctx, await ctx.db.get(b.workflowRunId as Id<"workflowRuns">), now);
    if (t.state === "RESERVED") await ctx.db.patch(t._id, { state: "CANCELLED", closed: true, updatedAt: now });
  },
});

async function executionAuthority(ctx: QueryCtx | MutationCtx, projectId: Id<"projects">, trialId: Id<"factoryDelegationTrials">) {
  const auth = await access(ctx, projectId, true);
  const trial = await trialFor(ctx, projectId, trialId);
  const mission = await scopedMission(ctx, projectId, trial.missionId);
  const binding = parseFactoryDelegationBinding(trial.binding);
  await validateLineage(ctx, binding, mission);
  const run = await ctx.db.get(binding.workflowRunId as Id<"workflowRuns">);
  const plan = await ctx.db.get(binding.missionPlanId as Id<"missionPlans">);
  const workOrder = await ctx.db.get(binding.workOrderId as Id<"workOrders">);
  const revision = await ctx.db.get(binding.workOrderRevisionId as Id<"workOrderRevisions">);
  const approval = plan?.metadata?.enterpriseDelegationApprovals?.[binding.delegationId] ?? plan?.metadata?.enterpriseDelegationApproval;
  const registration = eligible(await scopedFactory(ctx, projectId, trial.factoryDefinitionId), Date.now());
  if (!approval || plan?.status !== "APPROVED" || plan.decidedActorSource !== "AUTHENTICATED"
    || plan.approvedBy !== auth.actorId || !plan.approvedAt || mission.owner !== auth.actorId
    || binding.ownerScope !== auth.actorId || registration.digest !== trial.registrationDigest
    || registration.config.executionProvider !== "LOCAL_DOCKER_QUALIFICATION"
    || approval.bindingDigest !== trial.bindingDigest || approval.ownerActorId !== auth.actorId
    || plan.qualityContractDigest !== binding.qualityContractDigest
    || `sha256:${canonicalHash(plan.qualityContractProjection)}` !== binding.qualityContractDigest
    || canonicalDigest("enterprise-verification-fields/v1", { requirements: workOrder?.requirements ?? [], acceptanceCriteria: workOrder?.acceptanceCriteria.map(({ status, ...criterion }) => criterion), negativeConstraints: workOrder?.negativeConstraints, changeBudget: workOrder?.changeBudget, verificationContract: workOrder?.verificationContract })
      !== canonicalDigest("enterprise-verification-fields/v1", { requirements: approval.verificationSpec?.requirements ?? [], acceptanceCriteria: approval.verificationSpec?.acceptanceCriteria, negativeConstraints: approval.verificationSpec?.negativeConstraints, changeBudget: approval.verificationSpec?.changeBudget, verificationContract: approval.verificationSpec?.verificationContract })
    || approval.revokedAt !== undefined || trial.cancelRequested || trial.closed
    || workOrder?.approvalStatus !== "APPROVED" || revision?.status !== "APPLIED"
    || workOrder.currentExecutionRunId !== run?._id
    || run?.status !== "RUNNING" || run.cancellationRequestedAt !== undefined
    || run.lease?.leaseId !== approval.leaseId || run.lease?.ownerId !== auth.actorId
    || run.lease?.workerGeneration !== binding.authorityGeneration || run.lease.expiresAt < binding.deadline
    || run.metadata?.enterpriseDelegationId !== binding.delegationId
    || mission.activeWorkOrderId !== workOrder._id) throw denied();
  assertFactoryDelegationBindingMatches(binding, binding, Date.now());
  return { trial, binding, mission, run, workOrder, approval };
}
export const assertExecutionAuthority = internalQuery({
  args: { projectId: v.id("projects"), trialId: v.id("factoryDelegationTrials") },
  handler: async (ctx, args) => {
    const { binding, trial } = await executionAuthority(ctx, args.projectId, args.trialId);
    if (trial.state === "RESERVED") throw denied();
    return { bindingDigest: trial.bindingDigest, ownerScope: binding.ownerScope, generation: binding.authorityGeneration };
  },
});
export const ingestExecutionResult = internalMutation({
  args: { projectId: v.id("projects"), trialId: v.id("factoryDelegationTrials"), bindingDigest: v.string(),
    resultDigest: v.string(), partnerRunId: v.string(), partnerWorkOrderId: v.string(),
    candidateChange: v.object({ sourceRevision: v.string(), candidateRevision: v.string(), changedFiles: v.array(v.string()), deletedFiles: v.array(v.string()), linesAdded: v.number(), linesDeleted: v.number(), diff: v.string() }),
    candidateCommit: v.string(), candidateTree: v.string(), evidenceDigest: v.string(), artifactDigest: v.string(),
    checks: v.array(v.object({ id: v.string(), result: v.union(v.literal("PASS"), v.literal("FAIL")) })),
    producerSessionId: v.string(), verifierSessionId: v.string(), cleanupConfirmed: v.literal(true),
    actualMicrousd: v.literal(0), tariffDigest: v.optional(v.string()),
    factoryResultState: v.optional(v.union(v.literal("COMPLETED"), v.literal("FAILED"))),
    executionStartedAt: v.optional(v.number()), authenticatedResponse: v.optional(v.any()), custodyObservation: v.optional(v.object({ bindingDigest: v.string(), resultDigest: v.string(),
      candidateCommit: v.string(), candidateTree: v.string(), observedAt: v.number(), expiresAt: v.number() })) },
  handler: async (ctx, args) => {
    await access(ctx, args.projectId, true);
    const prior = await trialFor(ctx, args.projectId, args.trialId);
    const { authenticatedResponse: _delivery, custodyObservation, ...resultIdentity } = args;
    const inputDigest = canonicalDigest("enterprise-delegation-result/v1", { ...resultIdentity,
      ...(custodyObservation ? { custodyIdentity: { bindingDigest: custodyObservation.bindingDigest,
        resultDigest: custodyObservation.resultDigest, candidateCommit: custodyObservation.candidateCommit,
        candidateTree: custodyObservation.candidateTree } } : {}) });
    if (prior.resultInputDigest) {
      if (prior.resultInputDigest !== inputDigest) throw denied();
      return prior.qualityGateDecisionId;
    }
    const { trial, binding, mission, run, workOrder, approval } = await executionAuthority(ctx, args.projectId, args.trialId);
    if (args.candidateChange.sourceRevision !== binding.baseCommit || args.candidateChange.candidateRevision !== args.candidateCommit
      || trial.state !== (args.factoryResultState ?? "COMPLETED") || trial.bindingDigest !== args.bindingDigest
      || trial.partnerRunId !== args.partnerRunId || trial.partnerWorkOrderId !== args.partnerWorkOrderId
      || !sha(args.resultDigest) || !sha(args.evidenceDigest) || !sha(args.artifactDigest)
      || !/^[a-f0-9]{40}$/.test(args.candidateCommit) || !/^[a-f0-9]{40}$/.test(args.candidateTree)
      || !/^sbx_[A-Za-z0-9_-]+$/.test(args.producerSessionId) || !/^sbx_[A-Za-z0-9_-]+$/.test(args.verifierSessionId)
      || args.producerSessionId === args.verifierSessionId
      || canonicalDigest("enterprise-check-ids/v1", args.checks.map(c => c.id)) !== approval.checkIdsDigest
      || args.checks.length === 0) throw denied();
    const now = Date.now();
    const engine = new VerificationEngine([new ChangeBudgetVerifier(), new NegativeConstraintVerifier(), {
      id: "delegated-local", name: "Authenticated independent Factory verifier",
      supports: check => check.verifierId === "delegated-local",
      execute: async (_context, check) => {
        const result = args.checks.find(c => c.id === check.id)?.result ?? "ERROR";
        return { checkId: check.id, name: check.name, category: check.category, verifierId: args.verifierSessionId,
          mandatory: check.mandatory, status: result, summary: result, acceptanceCriterionIds: check.acceptanceCriterionIds,
          startedAt: now, completedAt: now, durationMs: 0, violations: [], evidence: [{
            evidenceKey: `${args.resultDigest}:${check.id}`, category: "TEST_RESULT", result, summary: result,
            acceptanceCriterionIds: check.acceptanceCriterionIds, contentHash: args.evidenceDigest,
            producer: { id: args.verifierSessionId, role: "INDEPENDENT_FACTORY_VERIFIER", independent: true, definitionAuthority: "INDEPENDENT" },
          }] };
      },
    }]);
    const outcome = await engine.execute({ workflowRunId: run._id, workOrder: approval.verificationSpec, candidate: args.candidateChange });
    const artifactId = await ctx.db.insert("runArtifacts", { tenantId: mission.tenantId, projectId: args.projectId,
      missionId: mission._id, workOrderId: workOrder._id, workflowRunId: run._id,
      idempotencyKey: binding.delegationId, artifactType: "VERIFICATION_EVIDENCE", name: "Authenticated delegated Factory Result",
      contentHash: args.resultDigest, producer: binding.factoryId, createdAt: now,
      metadata: { ...args, protocol: "MYFACTORY_RESULT_V1", factoryVersion: binding.factoryVersion, humanAcceptance: "PENDING", publication: "NOT_AUTHORIZED" } });
    const gateId = await enterpriseProject(ctx, args.projectId)
      ? await ingestEnterpriseQualityGate(ctx, { workOrder, run, binding, trial, args, outcome, artifactId, now })
      : await ctx.db.insert("qualityGateDecisions", { tenantId: mission.tenantId, projectId: args.projectId,
      missionId: mission._id, workOrderId: workOrder._id, workflowRunId: run._id, idempotencyKey: binding.delegationId,
      workOrderRevisionNumber: binding.workOrderRevisionNumber, candidateRevision: args.candidateCommit,
      qualityContractDigest: binding.qualityContractDigest, executionManifestDigest: binding.executionManifestDigest,
      evidenceSetDigest: args.evidenceDigest, decisionInputDigest: inputDigest, state: legacyQualityGateStateForVerdict(outcome.verdict),
      mode: "SHADOW", reasons: outcome.verdictReasons, blockingFindingIds: [], requiredApprovalIds: [], evaluatedAt: now,
      metadata: { qualificationOnly: true, artifactId, verdict: outcome.verdict, checks: outcome.checks, coverage: outcome.coverage, authoritativeAcceptance: false } });
    const { budget } = await budgetFor(ctx, args.projectId, mission._id);
    if (budget) await ctx.db.patch(mission._id, { enterpriseFixtureBudget: transitionFixtureAllowance(budget, binding.delegationId,
      { type: "RECONCILE", actualMicrousd: args.actualMicrousd, cleanupConfirmed: true, settlementDigest: args.resultDigest }) });
    else await settleExecutedEnterpriseAttempt(ctx, run, binding, args, now);
    await ctx.db.patch(trial._id, { resultInputDigest: inputDigest, qualityGateDecisionId: gateId, closed: true, updatedAt: now });
    return gateId;
  },
});

export const reconcileTerminalExecution = internalMutation({
  args: { projectId: v.id("projects"), trialId: v.id("factoryDelegationTrials"), bindingDigest: v.string(),
    resultDigest: v.string(), partnerRunId: v.string(), partnerWorkOrderId: v.string(),
    state: v.union(v.literal("COMPLETED"), v.literal("FAILED"), v.literal("CANCELLED")), cleanupConfirmed: v.literal(true), actualMicrousd: v.literal(0), tariffDigest: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await access(ctx, args.projectId, true);
    const trial = await trialFor(ctx, args.projectId, args.trialId);
    const binding = parseFactoryDelegationBinding(trial.binding);
    const factory = await scopedFactory(ctx, args.projectId, trial.factoryDefinitionId);
    if (factory.enterpriseRegistration?.config.executionProvider !== "LOCAL_DOCKER_QUALIFICATION"
      || factory.enterpriseRegistration.digest !== trial.registrationDigest
      || factoryDelegationBindingDigest(binding) !== args.bindingDigest || trial.bindingDigest !== args.bindingDigest
      || trial.state !== args.state || trial.partnerRunId !== args.partnerRunId
      || trial.partnerWorkOrderId !== args.partnerWorkOrderId || !sha(args.resultDigest)) throw denied();
    const inputDigest = canonicalDigest("enterprise-terminal-result/v1", args);
    if (trial.resultInputDigest) {
      if (trial.resultInputDigest !== inputDigest) throw denied();
      return;
    }
    const { budget } = await budgetFor(ctx, args.projectId, trial.missionId);
    if (budget) await ctx.db.patch(trial.missionId, { enterpriseFixtureBudget: transitionFixtureAllowance(budget, binding.delegationId,
      { type: "RECONCILE", actualMicrousd: 0, cleanupConfirmed: true, settlementDigest: args.resultDigest }) });
    else await settleExecutedEnterpriseAttempt(ctx, await ctx.db.get(binding.workflowRunId as Id<"workflowRuns">), binding, args, Date.now());
    await ctx.db.patch(trial._id, { resultInputDigest: inputDigest, closed: true, updatedAt: Date.now() });
  },
});

export const currentIsolatedQualityGate = query({
  args: { projectId: v.id("projects"), trialId: v.id("factoryDelegationTrials") },
  handler: async (ctx, args) => {
    await access(ctx, args.projectId);
    const trial = await trialFor(ctx, args.projectId, args.trialId);
    await budgetFor(ctx, args.projectId, trial.missionId);
    const workOrder = await ctx.db.get(trial.binding.workOrderId as Id<"workOrders">);
    return { isolated: await getCurrentVerificationRoutingOutcome(ctx, workOrder, Date.now(), "ACCEPTANCE", true),
      production: await getCurrentVerificationRoutingOutcome(ctx, workOrder), publication: "DISABLED", humanAcceptance: "PENDING" };
  },
});
