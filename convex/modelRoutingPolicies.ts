import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  fallbackRoutingPolicy,
  resolveModelRoute,
  type CatalogModel,
  type RoutingPolicyInput,
} from "./lib/modelRouting";
import {
  FACTORY_PERMISSIONS,
  requireWorkspacePermission,
} from "./lib/companyAccess";

const tier = v.union(
  v.literal("FAST"),
  v.literal("BALANCED"),
  v.literal("POWERFUL")
);
const risk = v.union(
  v.literal("LOW"),
  v.literal("MEDIUM"),
  v.literal("HIGH"),
  v.literal("CRITICAL")
);
const complexity = v.union(
  v.literal("SMALL"),
  v.literal("STANDARD"),
  v.literal("LARGE")
);
const operatingLane = v.union(
  v.literal("PLAN"),
  v.literal("EXECUTE"),
  v.literal("REVIEW"),
  v.literal("LOCAL"),
  v.literal("LONG_RUNNING")
);
const lanePool = v.object({
  lane: operatingLane,
  modelIds: v.array(v.string()),
  canaryModelIds: v.optional(v.array(v.string())),
  dailyBudgetUsd: v.optional(v.number()),
  monthlyBudgetUsd: v.optional(v.number()),
  minProviderCount: v.optional(v.number()),
  canaryPercent: v.optional(v.number()),
});
const rule = v.object({
  id: v.string(),
  order: v.number(),
  taskType: v.optional(v.string()),
  operatingLane: v.optional(operatingLane),
  riskLevel: v.optional(risk),
  complexity: v.optional(complexity),
  requiredCapabilities: v.optional(v.array(v.string())),
  modelId: v.string(),
});

async function loadActive(ctx: { db: any }, projectId: any) {
  return await ctx.db
    .query("modelRoutingPolicies")
    .withIndex("by_project_status", (q: any) =>
      q.eq("projectId", projectId).eq("status", "ACTIVE")
    )
    .order("desc")
    .first();
}

export const getActive = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    await requireWorkspacePermission(ctx, args.projectId, FACTORY_PERMISSIONS.VIEW);
    return loadActive(ctx, args.projectId);
  },
});

export const getAgentOverride = query({
  args: {
    projectId: v.id("projects"),
    agentId: v.id("agents"),
  },
  handler: async (ctx, args) => {
    await requireWorkspacePermission(ctx, args.projectId, FACTORY_PERMISSIONS.VIEW);
    const agent = await ctx.db.get(args.agentId);
    if (!agent || agent.projectId !== args.projectId) {
      throw new Error("Agent is unavailable or unauthorized.");
    }
    const override = await ctx.db
      .query("agentModelOverrides")
      .withIndex("by_project_agent", (q) =>
        q.eq("projectId", args.projectId).eq("agentId", args.agentId)
      )
      .first();
    if (override?.expiresAt && override.expiresAt <= Date.now()) return null;
    return override;
  },
});

export const setAgentOverride = mutation({
  args: {
    projectId: v.id("projects"),
    agentId: v.id("agents"),
    modelId: v.string(),
    reason: v.string(),
    expiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const access = await requireWorkspacePermission(
      ctx,
      args.projectId,
      FACTORY_PERMISSIONS.IMPROVE
    );
    const [agent, model] = await Promise.all([
      ctx.db.get(args.agentId),
      ctx.db
        .query("modelCatalog")
        .withIndex("by_model_id", (q) => q.eq("modelId", args.modelId))
        .first(),
    ]);
    if (!agent || agent.projectId !== args.projectId) {
      throw new Error("Agent is unavailable or unauthorized.");
    }
    if (
      !model ||
      model.deprecated ||
      model.availability === "UNAVAILABLE"
    ) {
      throw new Error("Override model route is unavailable");
    }
    if (!args.reason.trim()) throw new Error("Override reason is required");
    const existing = await ctx.db
      .query("agentModelOverrides")
      .withIndex("by_project_agent", (q) =>
        q.eq("projectId", args.projectId).eq("agentId", args.agentId)
      )
      .first();
    const now = Date.now();
    const overrideId = existing
      ? existing._id
      : await ctx.db.insert("agentModelOverrides", {
          projectId: args.projectId,
          agentId: args.agentId,
          modelId: args.modelId,
          reason: args.reason.trim(),
          expiresAt: args.expiresAt,
          createdBy: access.actorId,
          createdAt: now,
          updatedAt: now,
        });
    if (existing) {
      await ctx.db.patch(existing._id, {
        modelId: args.modelId,
        reason: args.reason.trim(),
        expiresAt: args.expiresAt,
        updatedAt: now,
      });
    }
    await ctx.db.insert("activities", {
      tenantId: access.project.tenantId,
      projectId: args.projectId,
      actorType: "HUMAN",
      actorId: access.actorId,
      action: "AGENT_MODEL_OVERRIDE_SET",
      description: `Agent "${agent.name}" model override set to ${args.modelId}`,
      targetType: "AGENT",
      targetId: args.agentId,
      beforeState: existing ? { modelId: existing.modelId } : undefined,
      afterState: { modelId: args.modelId, reason: args.reason.trim() },
    });
    return overrideId;
  },
});

export const clearAgentOverride = mutation({
  args: {
    projectId: v.id("projects"),
    agentId: v.id("agents"),
  },
  handler: async (ctx, args) => {
    const access = await requireWorkspacePermission(
      ctx,
      args.projectId,
      FACTORY_PERMISSIONS.IMPROVE
    );
    const agent = await ctx.db.get(args.agentId);
    if (!agent || agent.projectId !== args.projectId) {
      throw new Error("Agent is unavailable or unauthorized.");
    }
    const existing = await ctx.db
      .query("agentModelOverrides")
      .withIndex("by_project_agent", (q) =>
        q.eq("projectId", args.projectId).eq("agentId", args.agentId)
      )
      .first();
    if (!existing) return { removed: false };
    await ctx.db.delete(existing._id);
    await ctx.db.insert("activities", {
      tenantId: access.project.tenantId,
      projectId: args.projectId,
      actorType: "HUMAN",
      actorId: access.actorId,
      action: "AGENT_MODEL_OVERRIDE_CLEARED",
      description: `Agent "${agent.name}" returned to workspace model routing`,
      targetType: "AGENT",
      targetId: args.agentId,
      beforeState: { modelId: existing.modelId },
      afterState: { modelId: null },
    });
    return { removed: true };
  },
});

export const save = mutation({
  args: {
    projectId: v.id("projects"),
    name: v.string(),
    defaultModelId: v.optional(v.string()),
    safeFallbackModelId: v.optional(v.string()),
    rules: v.array(rule),
    lanePools: v.optional(v.array(lanePool)),
    fallbackChain: v.array(v.string()),
    budgetLimitUsd: v.optional(v.number()),
    latencyTargetMs: v.optional(v.number()),
    canaryPercent: v.number(),
    killSwitch: v.boolean(),
  },
  handler: async (ctx, args) => {
    const access = await requireWorkspacePermission(
      ctx,
      args.projectId,
      FACTORY_PERMISSIONS.MANAGE_AUTOMATION
    );
    const project = access.project;
    if (!args.name.trim()) throw new Error("Policy name is required");
    if (args.canaryPercent < 0 || args.canaryPercent > 100) {
      throw new Error("Canary percentage must be between 0 and 100");
    }
    if (args.budgetLimitUsd !== undefined && args.budgetLimitUsd < 0) {
      throw new Error("Budget limit cannot be negative");
    }
    for (const pool of args.lanePools ?? []) {
      if ((pool.dailyBudgetUsd ?? 0) < 0 || (pool.monthlyBudgetUsd ?? 0) < 0) {
        throw new Error(`${pool.lane} lane budgets cannot be negative`);
      }
      if ((pool.minProviderCount ?? 1) < 1) {
        throw new Error(`${pool.lane} provider requirement must be at least 1`);
      }
      if ((pool.canaryPercent ?? 10) < 0 || (pool.canaryPercent ?? 10) > 100) {
        throw new Error(`${pool.lane} canary percentage must be between 0 and 100`);
      }
      const approved = new Set(pool.modelIds);
      if ((pool.canaryModelIds ?? []).some((modelId) => !approved.has(modelId))) {
        throw new Error(`${pool.lane} canary models must also be approved`);
      }
    }
    const ids = [
      args.defaultModelId,
      args.safeFallbackModelId,
      ...args.fallbackChain,
      ...args.rules.map((item) => item.modelId),
      ...(args.lanePools ?? []).flatMap((pool) => pool.modelIds),
    ].filter((value): value is string => Boolean(value));
    const uniqueIds = [...new Set(ids)];
    for (const modelId of uniqueIds) {
      const model = await ctx.db
        .query("modelCatalog")
        .withIndex("by_model_id", (q) => q.eq("modelId", modelId))
        .first();
      if (
        !model ||
        model.deprecated ||
        model.availability === "UNAVAILABLE"
      ) {
        throw new Error(`Model route "${modelId}" is unavailable`);
      }
    }
    const current = await loadActive(ctx, args.projectId);
    const now = Date.now();
    if (current) {
      await ctx.db.patch(current._id, { status: "ARCHIVED", updatedAt: now });
    }
    const policyId = await ctx.db.insert("modelRoutingPolicies", {
      projectId: args.projectId,
      name: args.name.trim(),
      status: "ACTIVE",
      defaultModelId: args.defaultModelId,
      safeFallbackModelId: args.safeFallbackModelId,
      rules: args.rules,
      lanePools: args.lanePools ?? [],
      fallbackChain: [...new Set(args.fallbackChain)],
      budgetLimitUsd: args.budgetLimitUsd,
      latencyTargetMs: args.latencyTargetMs,
      canaryPercent: args.canaryPercent,
      killSwitch: args.killSwitch,
      version: (current?.version ?? 0) + 1,
      createdBy: access.actorId,
      updatedBy: access.actorId,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("activities", {
      tenantId: access.project.tenantId,
      projectId: args.projectId,
      actorType: "HUMAN",
      actorId: access.actorId,
      action: "MODEL_ROUTING_POLICY_ACTIVATED",
      description: `Activated model routing policy v${(current?.version ?? 0) + 1}`,
      targetType: "MODEL_ROUTING_POLICY",
      targetId: policyId,
      beforeState: current ? { policyId: current._id, version: current.version } : undefined,
      afterState: { policyId, version: (current?.version ?? 0) + 1 },
    });
    return await ctx.db.get(policyId);
  },
});

export const simulate = query({
  args: {
    projectId: v.id("projects"),
    taskType: v.optional(v.string()),
    operatingLane: v.optional(operatingLane),
    riskLevel: risk,
    complexity: v.optional(complexity),
    requestedTier: v.optional(tier),
    requiredCapabilities: v.array(v.string()),
    budgetRemainingUsd: v.optional(v.number()),
    agentId: v.optional(v.id("agents")),
    authorizedRunOverride: v.optional(v.string()),
    allowCanary: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const access = await requireWorkspacePermission(
      ctx,
      args.projectId,
      FACTORY_PERMISSIONS.VIEW
    );
    const project = access.project;
    if (args.agentId) {
      const agent = await ctx.db.get(args.agentId);
      if (!agent || agent.projectId !== args.projectId) {
        throw new Error("Agent is unavailable or unauthorized.");
      }
    }
    const active = await loadActive(ctx, args.projectId);
    const catalog = (await ctx.db.query("modelCatalog").collect()) as CatalogModel[];
    const override = args.agentId
      ? await ctx.db
          .query("agentModelOverrides")
          .withIndex("by_project_agent", (q) =>
            q.eq("projectId", args.projectId).eq("agentId", args.agentId!)
          )
          .first()
      : null;
    const policy: RoutingPolicyInput = active
      ? {
          id: active._id,
          version: active.version,
          defaultModelId: active.defaultModelId,
          safeFallbackModelId: active.safeFallbackModelId,
          fallbackChain: active.fallbackChain,
          rules: active.rules,
          lanePools: active.lanePools ?? [],
          budgetLimitUsd: active.budgetLimitUsd,
          killSwitch: active.killSwitch,
        }
      : fallbackRoutingPolicy(project.swarmConfig?.defaultModel);
    const lanePoolConfig = policy.lanePools?.find((pool) => pool.lane === args.operatingLane);
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const recentDecisions = lanePoolConfig
      ? await ctx.db
          .query("modelRoutingDecisions")
          .withIndex("by_project_created", (q) => q.eq("projectId", args.projectId).gte("createdAt", monthStart))
          .collect()
      : [];
    const costByModel = new Map(catalog.map((model) => [model.modelId, model.estimatedCostPerRunUsd ?? 0]));
    const laneDecisions = recentDecisions.filter((decision) => decision.operatingLane === args.operatingLane);
    const monthlySpendUsd = laneDecisions.reduce((sum, decision) => sum + (costByModel.get(decision.selectedModelId ?? "") ?? 0), 0);
    const dailySpendUsd = laneDecisions
      .filter((decision) => decision.createdAt >= dayStart)
      .reduce((sum, decision) => sum + (costByModel.get(decision.selectedModelId ?? "") ?? 0), 0);
    const laneBudgetRemainingUsd = lanePoolConfig
      ? Math.min(
          lanePoolConfig.dailyBudgetUsd == null ? Infinity : Math.max(0, lanePoolConfig.dailyBudgetUsd - dailySpendUsd),
          lanePoolConfig.monthlyBudgetUsd == null ? Infinity : Math.max(0, lanePoolConfig.monthlyBudgetUsd - monthlySpendUsd),
        )
      : undefined;
    return {
      policyId: active?._id,
      policyVersion: policy.version,
      result: resolveModelRoute(catalog, policy, {
        taskType: args.taskType,
        operatingLane: args.operatingLane,
        riskLevel: args.riskLevel,
        complexity: args.complexity,
        requestedTier: args.requestedTier,
        requiredCapabilities: args.requiredCapabilities,
        budgetRemainingUsd: args.budgetRemainingUsd,
        laneBudgetRemainingUsd,
        allowCanary: args.allowCanary,
        authorizedRunOverride: args.authorizedRunOverride,
        agentOverrideModelId:
          override && (!override.expiresAt || override.expiresAt > Date.now())
            ? override.modelId
            : undefined,
        systemDefaultModelId: "operator-default",
      }),
      laneTelemetry: lanePoolConfig ? {
        dailySpendUsd,
        monthlySpendUsd,
        laneBudgetRemainingUsd: Number.isFinite(laneBudgetRemainingUsd) ? laneBudgetRemainingUsd : undefined,
      } : undefined,
    };
  },
});
