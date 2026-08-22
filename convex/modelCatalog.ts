import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { FACTORY_PERMISSIONS, requireWorkspacePermission } from "./lib/companyAccess";
import { loadModelCatalogForProject } from "./lib/modelCatalogScope";
import { computeCanonicalHash } from "./lib/genomeHash";
import {
  MODEL_ROUTE_QUALIFICATION_SCHEMA,
  exactModelRouteDigest,
  exactModelRouteSnapshot,
} from "./lib/modelRouteAdmission";

const tier = v.union(v.literal("FAST"), v.literal("BALANCED"), v.literal("POWERFUL"));
const exactCapabilityIdentity = v.object({
  adapter: v.string(),
  version: v.string(),
  capabilityManifestDigest: v.string(),
  effectiveConfigSha256: v.string(),
});
const exactRuntimeIdentity = v.object({
  kind: v.literal("CODEX_CLI"),
  cliVersion: v.string(),
  executableSha256: v.optional(v.string()),
  imageDigest: v.optional(v.string()),
});

const DEFAULT_MODELS = [
  {
    provider: "runtime",
    modelId: "operator-fast",
    displayName: "Operator Fast",
    tier: "FAST" as const,
    capabilities: ["text", "code"],
    supportsTools: true,
    riskApproved: false,
    contextWindow: 128_000,
    availability: "HEALTHY" as const,
    estimatedCostPerRunUsd: 0.03,
    deprecated: false,
  },
  {
    provider: "runtime",
    modelId: "operator-default",
    displayName: "Operator Default",
    tier: "BALANCED" as const,
    capabilities: ["text", "code", "vision"],
    supportsTools: true,
    riskApproved: true,
    contextWindow: 200_000,
    availability: "HEALTHY" as const,
    estimatedCostPerRunUsd: 0.15,
    deprecated: false,
  },
  {
    provider: "runtime",
    modelId: "operator-powerful",
    displayName: "Operator Powerful",
    tier: "POWERFUL" as const,
    capabilities: ["text", "code", "vision", "deep-reasoning"],
    supportsTools: true,
    riskApproved: true,
    contextWindow: 200_000,
    availability: "HEALTHY" as const,
    estimatedCostPerRunUsd: 0.45,
    deprecated: false,
  },
];

function validateDiscoveredModels(models: Array<{
  modelId: string;
  displayName: string;
  capabilities: string[];
  contextWindow: number;
}>) {
  if (models.length > 200 || new Set(models.map((model) => model.modelId)).size !== models.length) {
    throw new Error("Local model discovery must contain at most 200 unique models.");
  }
  if (models.some((model) =>
    model.modelId !== model.modelId.trim()
    || model.modelId.length < 1
    || model.modelId.length > 200
    || model.displayName !== model.displayName.trim()
    || model.displayName.length < 1
    || model.displayName.length > 200
    || !Number.isSafeInteger(model.contextWindow)
    || model.contextWindow < 1
    || model.contextWindow > 10_000_000
    || model.capabilities.length > 50
    || new Set(model.capabilities).size !== model.capabilities.length
    || model.capabilities.some((capability) => capability !== capability.trim() || capability.length < 1 || capability.length > 100)
  )) {
    throw new Error("Local model discovery contains invalid or unbounded metadata.");
  }
}

export const list = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    await requireWorkspacePermission(ctx, args.projectId, FACTORY_PERMISSIONS.VIEW);
    return loadModelCatalogForProject(ctx, args.projectId);
  },
});

/** Register an immutable exact route. This records identity only; it does not
 * qualify or admit the route for production execution. */
export const registerExactRoute = mutation({
  args: {
    projectId: v.id("projects"),
    provider: v.string(),
    providerRoute: v.string(),
    modelId: v.string(),
    displayName: v.string(),
    tier,
    capabilities: v.array(v.string()),
    supportsTools: v.boolean(),
    contextWindow: v.number(),
    capabilityIdentity: exactCapabilityIdentity,
    runtimeIdentity: exactRuntimeIdentity,
  },
  handler: async (ctx, args) => {
    const access = await requireWorkspacePermission(
      ctx,
      args.projectId,
      FACTORY_PERMISSIONS.MANAGE_AUTOMATION,
    );
    validateDiscoveredModels([{
      modelId: args.modelId,
      displayName: args.displayName,
      capabilities: args.capabilities,
      contextWindow: args.contextWindow,
    }]);
    const routeSnapshot = exactModelRouteSnapshot(args);
    const routeDigest = exactModelRouteDigest(routeSnapshot);
    const matches = await ctx.db.query("modelCatalog")
      .withIndex("by_project_model", (q) => q.eq("projectId", args.projectId).eq("modelId", routeSnapshot.modelId))
      .collect();
    const existing = matches.find((candidate) => candidate.provider === routeSnapshot.provider);
    if (existing) {
      if (existing.routeDigest !== routeDigest) {
        throw new Error("The exact model route is already registered with a different immutable identity.");
      }
      return existing._id;
    }
    const now = Date.now();
    const id = await ctx.db.insert("modelCatalog", {
      tenantId: access.project.tenantId,
      projectId: args.projectId,
      provider: routeSnapshot.provider,
      providerRoute: routeSnapshot.providerRoute,
      modelId: routeSnapshot.modelId,
      displayName: args.displayName.trim(),
      tier: args.tier,
      capabilities: [...new Set(args.capabilities)].sort(),
      supportsTools: args.supportsTools,
      riskApproved: false,
      contextWindow: args.contextWindow,
      availability: "UNAVAILABLE",
      deprecated: false,
      routeSnapshot,
      routeDigest,
      capabilityManifestDigest: routeSnapshot.capabilityIdentity.capabilityManifestDigest,
      effectiveConfigSha256: routeSnapshot.capabilityIdentity.effectiveConfigSha256,
      runtimeIdentity: routeSnapshot.runtimeIdentity,
      enabled: false,
      qualificationStatus: "UNQUALIFIED",
      admissionStatus: "DISABLED",
      registeredBy: access.actorId,
      registeredAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("activities", {
      tenantId: access.project.tenantId,
      projectId: args.projectId,
      actorType: "HUMAN",
      actorId: access.actorId,
      action: "EXACT_MODEL_ROUTE_REGISTERED",
      description: `Registered disabled exact model route ${routeSnapshot.provider}/${routeSnapshot.modelId}`,
      targetType: "MODEL_CATALOG",
      targetId: id,
      metadata: { routeDigest, providerRoute: routeSnapshot.providerRoute },
    });
    return id;
  },
});

/** Bind reviewed qualification evidence to an already frozen route. */
export const promoteExactRoute = mutation({
  args: {
    modelCatalogId: v.id("modelCatalog"),
    expectedRouteDigest: v.string(),
    evidenceReference: v.string(),
    evidenceDigest: v.string(),
    workloadClasses: v.array(v.string()),
    riskClasses: v.array(v.union(v.literal("GREEN"), v.literal("YELLOW"), v.literal("RED"))),
  },
  handler: async (ctx, args) => {
    const route = await ctx.db.get(args.modelCatalogId);
    if (!route?.projectId || !route.routeSnapshot || !route.routeDigest) {
      throw new Error("Exact model route is unavailable or is a legacy catalog alias.");
    }
    const access = await requireWorkspacePermission(ctx, route.projectId, FACTORY_PERMISSIONS.APPROVE);
    if (route.admissionStatus === "PRODUCTION_PILOT_ELIGIBLE" || route.qualificationDigest) {
      throw new Error("Exact model route qualification is immutable after promotion.");
    }
    if (route.routeDigest !== args.expectedRouteDigest
      || exactModelRouteDigest(route.routeSnapshot) !== args.expectedRouteDigest) {
      throw new Error("Exact model route digest does not match the reviewed identity.");
    }
    if (!/^sha256:[a-f0-9]{64}$/i.test(args.evidenceDigest)
      || !args.evidenceReference.trim()
      || args.evidenceReference.length > 1_000
      || args.workloadClasses.length < 1
      || args.workloadClasses.length > 20
      || new Set(args.workloadClasses).size !== args.workloadClasses.length
      || args.workloadClasses.some((item) => item !== item.trim() || !/^[A-Z][A-Z0-9_]{1,63}$/.test(item))) {
      throw new Error("Exact model route qualification evidence or scope is invalid.");
    }
    if (args.riskClasses.length < 1
      || new Set(args.riskClasses).size !== args.riskClasses.length) {
      throw new Error("Exact model route qualification requires a non-empty unique risk scope.");
    }
    const promotedAt = Date.now();
    const qualificationSnapshot = {
      schema: MODEL_ROUTE_QUALIFICATION_SCHEMA,
      routeDigest: route.routeDigest,
      evidence: { reference: args.evidenceReference.trim(), digest: args.evidenceDigest.toLowerCase() },
      scope: {
        workloadClasses: [...args.workloadClasses].sort(),
        riskClasses: [...new Set(args.riskClasses)].sort(),
      },
      promotedBy: access.actorId,
      promotedAt,
      authority: {
        executionOnly: true,
        routing: false,
        verification: false,
        acceptance: false,
        publication: false,
        merge: false,
      },
    };
    const qualificationDigest = `sha256:${computeCanonicalHash({
      namespace: MODEL_ROUTE_QUALIFICATION_SCHEMA,
      value: qualificationSnapshot,
    })}`;
    await ctx.db.patch(route._id, {
      enabled: true,
      qualificationStatus: "EVIDENCE_QUALIFIED",
      admissionStatus: "PRODUCTION_PILOT_ELIGIBLE",
      qualificationSnapshot,
      qualificationDigest,
      promotedBy: access.actorId,
      promotedAt,
      updatedAt: promotedAt,
    });
    await ctx.db.insert("activities", {
      tenantId: route.tenantId,
      projectId: route.projectId,
      actorType: "HUMAN",
      actorId: access.actorId,
      action: "EXACT_MODEL_ROUTE_PROMOTED",
      description: `Promoted exact model route ${route.provider}/${route.modelId} for production-pilot execution`,
      targetType: "MODEL_CATALOG",
      targetId: route._id,
      metadata: { routeDigest: route.routeDigest, qualificationDigest },
    });
    return { modelCatalogId: route._id, routeDigest: route.routeDigest, qualificationDigest };
  },
});

export const initializeDefaults = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const access = await requireWorkspacePermission(
      ctx,
      args.projectId,
      FACTORY_PERMISSIONS.MANAGE_AUTOMATION,
    );
    const now = Date.now();
    let created = 0;
    for (const model of DEFAULT_MODELS) {
      const existing = await ctx.db
        .query("modelCatalog")
        .withIndex("by_model_id", (q) => q.eq("modelId", model.modelId))
        .first();
      if (existing) continue;
      await ctx.db.insert("modelCatalog", { ...model, updatedAt: now });
      created += 1;
    }
    await ctx.db.insert("activities", {
      tenantId: access.project.tenantId,
      projectId: access.project._id,
      actorType: "HUMAN",
      actorId: access.actorId,
      action: "MODEL_CATALOG_INITIALIZED",
      description: `Initialized ${created} safe runtime model route(s)`,
      targetType: "MODEL_CATALOG",
      targetId: "system",
    });
    return { created };
  },
});

export const reportHealth = internalMutation({
  args: {
    modelId: v.string(),
    projectId: v.optional(v.id("projects")),
    availability: v.union(
      v.literal("HEALTHY"),
      v.literal("DEGRADED"),
      v.literal("RATE_LIMITED"),
      v.literal("UNAVAILABLE")
    ),
  },
  handler: async (ctx, args) => {
    const models = await ctx.db
      .query("modelCatalog")
      .withIndex("by_model_id", (q) => q.eq("modelId", args.modelId))
      .collect();
    const model = models.find((candidate) => candidate.projectId === args.projectId);
    if (!model) throw new Error("Catalog model not found");
    await ctx.db.patch(model._id, {
      availability: args.availability,
      updatedAt: Date.now(),
    });
    return model._id;
  },
});

/** Registers models discovered by the trusted orchestration server. */
export const syncLocalModels = mutation({
  args: {
    projectId: v.id("projects"),
    provider: v.union(v.literal("OLLAMA"), v.literal("LM_STUDIO"), v.literal("MLX"), v.literal("VLLM")),
    models: v.array(v.object({
      modelId: v.string(),
      displayName: v.string(),
      capabilities: v.array(v.string()),
      supportsTools: v.boolean(),
      contextWindow: v.number(),
    })),
  },
  handler: async (ctx, args) => {
    const access = await requireWorkspacePermission(
      ctx,
      args.projectId,
      FACTORY_PERMISSIONS.MANAGE_AUTOMATION,
    );
    validateDiscoveredModels(args.models);
    const now = Date.now();
    const provider = `local:${args.provider.toLowerCase()}`;
    let created = 0;
    let updated = 0;
    for (const discovered of args.models) {
      const modelId = `${provider}:${discovered.modelId}`;
      const existing = await ctx.db
        .query("modelCatalog")
        .withIndex("by_project_model", (q) => q.eq("projectId", args.projectId).eq("modelId", modelId))
        .first();
      const record = {
        tenantId: access.project.tenantId,
        projectId: args.projectId,
        provider,
        modelId,
        displayName: discovered.displayName,
        tier: "FAST" as const,
        capabilities: [...new Set(["local", ...discovered.capabilities])],
        supportsTools: discovered.supportsTools,
        riskApproved: false,
        contextWindow: discovered.contextWindow,
        availability: "HEALTHY" as const,
        estimatedCostPerRunUsd: 0,
        deprecated: false,
        updatedAt: now,
      };
      if (existing) {
        await ctx.db.patch(existing._id, record);
        updated += 1;
      } else {
        await ctx.db.insert("modelCatalog", record);
        created += 1;
      }
    }
    await ctx.db.insert("activities", {
      tenantId: access.project.tenantId,
      projectId: args.projectId,
      actorType: "HUMAN",
      actorId: access.actorId,
      action: "LOCAL_MODEL_CATALOG_SYNCED",
      description: `Synced ${args.models.length} local ${args.provider} model route(s)`,
      targetType: "MODEL_CATALOG",
      targetId: provider,
      metadata: { created, updated },
    });
    return { created, updated, provider };
  },
});
