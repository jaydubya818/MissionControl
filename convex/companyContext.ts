import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import {
  COMPANY_PERMISSIONS,
  FACTORY_PERMISSIONS,
  listAccessibleWorkspaces,
  listCompanyMemberships,
  requireCompanyAccess,
  requireCompanyPermission,
  requireWorkspaceAccess,
  requireWorkspacePermission,
} from "./lib/companyAccess";
import {
  DEFAULT_PROVIDER_BUDGET,
  evaluateRateLimit,
  PROVIDER_BUDGET_POLICIES,
  rateLimitMessage,
} from "./lib/rateLimit";

const factoryPermission = v.union(
  v.literal(FACTORY_PERMISSIONS.VIEW),
  v.literal(FACTORY_PERMISSIONS.IMPROVE),
  v.literal(FACTORY_PERMISSIONS.APPROVE),
  v.literal(FACTORY_PERMISSIONS.MANAGE_AUTOMATION)
);

/**
 * Require only that the caller is a signed-in operator of some company.
 *
 * Used by provider-backed actions (LLM completion, embeddings, TTS, external
 * API sync) whose surface is not workspace-scoped, so `authorizeFactoryAction`
 * has no `projectId` to resolve. It does not establish workspace authority — it
 * establishes that an identifiable, rate-limitable operator is spending the
 * deployment's provider budget rather than the open internet.
 *
 * `internalQuery` deliberately: this is an authorization primitive, not a
 * product surface. Exposing "is this caller signed in" publicly would itself be
 * an oracle.
 */
/**
 * Consume one unit from a provider-budget bucket keyed on server-derived identity.
 *
 * A mutation because it must durably record the consumption. Actions reach it
 * through `ctx.runMutation` *after* resolving their operator, so the bucket key
 * can never be influenced by a client argument — which is the property the
 * previous `tasks.create` limiter lacked when it keyed on `args.source`.
 */
export const consumeProviderBudget = internalMutation({
  args: { operation: v.string(), actorId: v.string() },
  handler: async (ctx, args) => {
    const policy = PROVIDER_BUDGET_POLICIES[args.operation] ?? DEFAULT_PROVIDER_BUDGET;
    const actor = args.actorId.trim();
    if (!actor) throw new Error("Provider budgeting requires a server-resolved caller identity.");
    const key = `${args.operation}:actor:${actor}`;
    const now = Date.now();
    const existing = await ctx.db
      .query("rateLimitEntries")
      .withIndex("by_key", (q) => q.eq("key", key))
      .first();
    const decision = evaluateRateLimit(
      policy,
      policy.limit,
      existing ? { windowStart: existing.windowStart, count: existing.count } : null,
      now,
    );
    if (!decision.allowed) {
      return { allowed: false as const, message: rateLimitMessage(policy, decision) };
    }
    if (existing) {
      await ctx.db.patch(existing._id, {
        windowStart: decision.nextWindowStart,
        count: decision.nextCount,
      });
    } else {
      await ctx.db.insert("rateLimitEntries", {
        key,
        windowStart: decision.nextWindowStart,
        count: decision.nextCount,
      });
    }
    return { allowed: true as const, message: "" };
  },
});

export const assertAuthenticated = internalQuery({
  args: {},
  handler: async (ctx) => {
    const memberships = await listCompanyMemberships(ctx);
    const membership = memberships[0];
    if (!membership) {
      throw new Error("Authentication is required.");
    }
    return {
      actorId: membership.operatorId
        ? String(membership.operatorId)
        : "demo:company-administrator",
      tenantId: String(membership.tenant._id),
      mode: membership.mode,
    };
  },
});

/**
 * Actions do not have direct database access. This internal query gives them
 * the same authenticated, project-scoped operator decision used by mutations.
 */
export const authorizeFactoryAction = internalQuery({
  args: {
    projectId: v.id("projects"),
    permission: factoryPermission,
  },
  handler: async (ctx, args) => {
    const access = await requireWorkspacePermission(
      ctx,
      args.projectId,
      args.permission
    );
    return {
      actorId: access.actorId,
      mode: access.membership.mode,
      tenantId: access.project.tenantId,
      projectId: access.project._id,
      permission: args.permission,
    };
  },
});

/**
 * Non-throwing authorization decision for public actions that must retain a
 * denial before returning an error. The response deliberately avoids exposing
 * role or workspace details to an unauthorized caller.
 */
export const evaluateFactoryAction = internalQuery({
  args: {
    projectId: v.id("projects"),
    permission: factoryPermission,
  },
  handler: async (ctx, args) => {
    try {
      const access = await requireWorkspacePermission(
        ctx,
        args.projectId,
        args.permission
      );
      return {
        allowed: true as const,
        actorId: access.actorId,
        mode: access.membership.mode,
        projectExists: true,
      };
    } catch {
      const [identity, project] = await Promise.all([
        ctx.auth.getUserIdentity(),
        ctx.db.get(args.projectId),
      ]);
      let actorId: string | undefined;
      if (identity && project?.tenantId) {
        const operators = await ctx.db
          .query("operators")
          .withIndex("by_auth_id", (q) => q.eq("authId", identity.subject))
          .collect();
        actorId = operators.find(
          (operator) => operator.active && operator.tenantId === project.tenantId
        )?._id;
      }
      return {
        allowed: false as const,
        actorId: actorId ? String(actorId) : undefined,
        projectExists: Boolean(project),
        reasonCode: "UNAUTHORIZED_OR_UNAVAILABLE" as const,
      };
    }
  },
});

/** Append-only evidence for an action authorization denial. */
export const recordFactoryActionDenial = internalMutation({
  args: {
    projectId: v.id("projects"),
    permission: factoryPermission,
    operation: v.string(),
    actorId: v.optional(v.string()),
    attemptId: v.string(),
    reasonCode: v.string(),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) return { recorded: false as const };
    const existing = await ctx.db
      .query("activities")
      .withIndex("by_action", (q) => q.eq("action", "FACTORY_ACTION_DENIED"))
      .filter((q) => q.eq(q.field("projectId"), args.projectId))
      .order("desc")
      .take(100);
    if (existing.some((entry) => entry.metadata?.attemptId === args.attemptId)) {
      return { recorded: false as const };
    }
    const duplicateWindow = existing.some((entry) =>
      entry.actorId === args.actorId
      && entry.metadata?.operation === args.operation
      && entry.metadata?.reasonCode === args.reasonCode
      && Date.now() - entry._creationTime < 60_000
    );
    if (duplicateWindow) return { recorded: false as const };
    await ctx.db.insert("activities", {
      tenantId: project.tenantId,
      projectId: project._id,
      actorType: args.actorId ? "HUMAN" : "SYSTEM",
      actorId: args.actorId,
      action: "FACTORY_ACTION_DENIED",
      description: `Denied factory operation: ${args.operation}`,
      targetType: "FACTORY_OPERATION",
      targetId: args.operation,
      metadata: {
        permission: args.permission,
        operation: args.operation,
        attemptId: args.attemptId,
        reasonCode: args.reasonCode,
      },
    });
    return { recorded: true as const };
  },
});

function exceedsLength(value: string | undefined, maximum: number): boolean {
  return Boolean(value && value.trim().length > maximum);
}

export const getSession = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    const memberships = await listCompanyMemberships(ctx);
    return {
      status:
        memberships.length > 0
          ? "READY" as const
          : identity
            ? "NO_MEMBERSHIP" as const
            : "AUTH_REQUIRED" as const,
      mode: memberships[0]?.mode,
      companies: memberships.map((membership) => ({
        tenantId: membership.tenant._id,
        name: membership.tenant.name,
        slug: membership.tenant.slug,
        description: membership.tenant.description,
        missionStatement: membership.tenant.missionStatement,
        active: membership.tenant.active,
        roleNames: membership.roleNames,
        canManageCompany: membership.canManageCompany,
      })),
    };
  },
});

export const listWorkspaces = query({
  args: { tenantId: v.id("tenants") },
  handler: async (ctx, args) => {
    return await listAccessibleWorkspaces(ctx, args.tenantId);
  },
});

export const getWorkspace = query({
  args: { tenantId: v.id("tenants"), projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const { project } = await requireWorkspaceAccess(
      ctx,
      args.tenantId,
      args.projectId
    );
    return project;
  },
});

export const getCompanySummary = query({
  args: { tenantId: v.id("tenants") },
  handler: async (ctx, args) => {
    const membership = await requireCompanyAccess(ctx, args.tenantId);
    const workspaces = await listAccessibleWorkspaces(ctx, args.tenantId);
    const workspaceIds = new Set(workspaces.map((workspace) => workspace._id));
    const [operators, repositories] = await Promise.all([
      ctx.db
        .query("operators")
        .withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId))
        .collect(),
      ctx.db
        .query("workspaceRepositories")
        .withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId))
        .collect(),
    ]);
    const visibleRepositories = repositories.filter((repository) => workspaceIds.has(repository.projectId));
    return {
      company: membership.tenant,
      roleNames: membership.roleNames,
      canManageCompany: membership.canManageCompany,
      mode: membership.mode,
      counts: {
        activeWorkspaces: workspaces.filter((workspace) => workspace.status !== "ARCHIVED").length,
        activeOperators: operators.filter((operator) => operator.active).length,
        repositories: visibleRepositories.length,
      },
    };
  },
});

export const updateCompany = mutation({
  args: {
    tenantId: v.id("tenants"),
    name: v.string(),
    description: v.optional(v.string()),
    missionStatement: v.optional(v.string()),
    expectedUpdatedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const membership = await requireCompanyPermission(
      ctx,
      args.tenantId,
      COMPANY_PERMISSIONS.MANAGE_COMPANY
    );
    const name = args.name.trim();
    if (!name) return { success: false, error: "Company name is required." };
    if (exceedsLength(name, 120)) {
      return { success: false, error: "Company name must be 120 characters or fewer." };
    }
    if (exceedsLength(args.description, 1_000)) {
      return { success: false, error: "Company description must be 1,000 characters or fewer." };
    }
    if (exceedsLength(args.missionStatement, 1_000)) {
      return { success: false, error: "Mission statement must be 1,000 characters or fewer." };
    }
    if ((membership.tenant.updatedAt ?? 0) !== args.expectedUpdatedAt) {
      return {
        success: false,
        error: "Company profile changed in another session. Refresh and try again.",
      };
    }
    const now = Date.now();
    await ctx.db.patch(args.tenantId, {
      name,
      description: args.description?.trim() || undefined,
      missionStatement: args.missionStatement?.trim() || undefined,
      updatedAt: now,
      updatedBy: membership.operatorId,
    });
    await ctx.db.insert("activities", {
      actorType: "HUMAN",
      actorId: membership.operatorId ?? "demo:company-administrator",
      action: "COMPANY_PROFILE_UPDATED",
      description: `Company account "${name}" updated`,
      targetType: "TENANT",
      targetId: args.tenantId,
      metadata: { tenantId: args.tenantId, mode: membership.mode },
    });
    return { success: true, company: await ctx.db.get(args.tenantId) };
  },
});

export const createWorkspace = mutation({
  args: {
    tenantId: v.id("tenants"),
    name: v.string(),
    slug: v.string(),
    description: v.optional(v.string()),
    purpose: v.string(),
    owner: v.string(),
    defaultPolicy: v.string(),
    status: v.union(v.literal("ACTIVE"), v.literal("PAUSED")),
  },
  handler: async (ctx, args) => {
    const membership = await requireCompanyPermission(
      ctx,
      args.tenantId,
      COMPANY_PERMISSIONS.CREATE_WORKSPACES
    );
    const name = args.name.trim();
    const slug = args.slug.trim();
    if (!name) return { success: false, error: "Workspace name is required." };
    if (exceedsLength(name, 120)) {
      return { success: false, error: "Workspace name must be 120 characters or fewer." };
    }
    if (exceedsLength(slug, 80)) {
      return { success: false, error: "Workspace slug must be 80 characters or fewer." };
    }
    if (exceedsLength(args.description, 1_000)) {
      return { success: false, error: "Workspace description must be 1,000 characters or fewer." };
    }
    if (exceedsLength(args.purpose, 500)) {
      return { success: false, error: "Workspace purpose must be 500 characters or fewer." };
    }
    if (exceedsLength(args.owner, 120)) {
      return { success: false, error: "Workspace owner must be 120 characters or fewer." };
    }
    if (exceedsLength(args.defaultPolicy, 120)) {
      return { success: false, error: "Default policy must be 120 characters or fewer." };
    }
    if (!args.purpose.trim()) return { success: false, error: "Workspace purpose is required." };
    if (!args.owner.trim()) return { success: false, error: "Workspace owner is required." };
    if (!args.defaultPolicy.trim()) {
      return { success: false, error: "Default policy is required." };
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      return { success: false, error: "Workspace slug is invalid." };
    }
    const duplicate = await ctx.db
      .query("projects")
      .withIndex("by_tenant_slug", (q) => q.eq("tenantId", args.tenantId).eq("slug", slug))
      .first();
    if (duplicate) {
      return { success: false, error: "This company already has a workspace with that slug." };
    }
    const projectId = await ctx.db.insert("projects", {
      tenantId: args.tenantId,
      name,
      slug,
      description: args.description?.trim() || undefined,
      purpose: args.purpose.trim(),
      owner: args.owner.trim(),
      defaultPolicy: args.defaultPolicy.trim(),
      status: args.status,
      metadata: {
        companyBoundaryVersion: 1,
        createdAt: Date.now(),
        createdBy: membership.operatorId ?? "demo:company-administrator",
      },
    });
    await ctx.db.insert("activities", {
      projectId,
      actorType: "HUMAN",
      actorId: membership.operatorId ?? "demo:company-administrator",
      action: "WORKSPACE_CREATED",
      description: `Workspace "${name}" created in ${membership.tenant.name}`,
      targetType: "PROJECT",
      targetId: projectId,
      metadata: { tenantId: args.tenantId, slug, mode: membership.mode },
    });
    return { success: true, project: await ctx.db.get(projectId) };
  },
});
