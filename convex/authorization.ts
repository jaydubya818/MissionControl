/**
 * Authorization checks callable from Convex **actions**.
 *
 * Actions have no database handle, so they cannot call `requireWorkspaceAccess`
 * directly. They authorize by `ctx.runQuery`-ing one of the internal queries
 * below, which run with the caller's identity propagated from the action.
 *
 * These are `internalQuery` deliberately: they are an authorization primitive,
 * not a product surface, and exposing "does this caller have permission X"
 * publicly would itself be an enumeration oracle.
 */

import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import {
  COMPANY_PERMISSIONS,
  listCompanyMemberships,
  requireCompanyAdministrator,
  requireWorkspaceAccess,
  type CompanyPermission,
} from "./lib/companyAccess";
import { evaluateRateLimit, rateLimitKey, rateLimitMessage } from "./lib/rateLimit";

const companyPermission = v.union(
  ...Object.values(COMPANY_PERMISSIONS).map((permission) => v.literal(permission)),
);

/**
 * Resolve and authorize a workspace for an action caller.
 *
 * Throws when the caller is anonymous, is not a member of the workspace's
 * company, or lacks the named permission. Returns only server-derived values —
 * an action must use `actorId` for audit attribution, never an argument.
 */
export const assertWorkspaceAccess = internalQuery({
  args: {
    projectId: v.id("projects"),
    permission: companyPermission,
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project?.tenantId) {
      throw new Error("Workspace is unavailable or unauthorized.");
    }
    const access = await requireWorkspaceAccess(ctx, project.tenantId, project._id, {
      permission: args.permission as CompanyPermission,
    });
    return {
      actorId: access.membership.operatorId
        ? String(access.membership.operatorId)
        : access.membership.mode === "DEMO"
          ? "demo:company-administrator"
          : "operator",
      tenantId: String(project.tenantId),
      projectId: String(project._id),
      mode: access.membership.mode,
    };
  },
});

/**
 * Require only that the caller is a signed-in operator of some company.
 *
 * Used by expensive provider-backed actions (LLM completion, embeddings, TTS)
 * whose surface is not workspace-scoped. It does not establish workspace
 * authority — it establishes that an identifiable, rate-limitable operator is
 * spending the deployment's provider budget rather than the open internet.
 */
export const assertAuthenticated = internalQuery({
  args: {},
  handler: async (ctx) => {
    const memberships = await listCompanyMemberships(ctx);
    const membership = memberships[0];
    if (!membership) throw new Error("Authentication is required.");
    return {
      actorId: membership.operatorId
        ? String(membership.operatorId)
        : "demo:company-administrator",
      tenantId: String(membership.tenant._id),
      mode: membership.mode,
    };
  },
});

/** Company-administrator check for action callers. */
export const assertCompanyAdministrator = internalQuery({
  args: {},
  handler: async (ctx) => {
    const membership = await requireCompanyAdministrator(ctx);
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
 * Consume one unit from a server-keyed rate-limit bucket.
 *
 * A mutation (not a query) because it must durably record the consumption.
 * Actions call it through `ctx.runMutation` after resolving their identity, so
 * the bucket key can never be influenced by a client argument.
 */
export const consumeRateLimit = internalMutation({
  args: {
    operation: v.string(),
    limit: v.number(),
    windowMs: v.number(),
    actorId: v.string(),
  },
  handler: async (ctx, args) => {
    const policy = {
      operation: args.operation,
      limit: args.limit,
      windowMs: args.windowMs,
    };
    const key = rateLimitKey(policy, args.actorId);
    const now = Date.now();
    const existing = await ctx.db
      .query("rateLimits")
      .withIndex("by_key", (q) => q.eq("key", key))
      .first();

    const decision = evaluateRateLimit(
      policy,
      existing ? { windowStartedAt: existing.windowStartedAt, count: existing.count } : null,
      now,
    );

    if (decision.allowed) {
      if (existing) {
        await ctx.db.patch(existing._id, {
          windowStartedAt: decision.nextWindowStartedAt,
          count: decision.nextCount,
          updatedAt: now,
        });
      } else {
        await ctx.db.insert("rateLimits", {
          key,
          windowStartedAt: decision.nextWindowStartedAt,
          count: decision.nextCount,
          updatedAt: now,
        });
      }
      return { allowed: true as const };
    }

    return {
      allowed: false as const,
      message: rateLimitMessage(policy, decision),
    };
  },
});
