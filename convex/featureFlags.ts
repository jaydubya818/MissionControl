/**
 * Feature Flags — runtime toggles for Software Factory subsystems.
 *
 * Resolution precedence and the flag registry live in lib/flags.ts (pure,
 * unit tested). This module is the thin Convex surface: read queries used
 * by the UI/orchestration, and an audited upsert mutation.
 *
 * Flag changes are recorded in the `activities` audit log
 * (action: FEATURE_FLAG_SET).
 */

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  flagRequiresWorkspaceScope,
  isFactoryControlFlag,
  isValidFlagKey,
  requiredFlagWriteAuthority,
  resolveAllFlags,
  resolveFlag,
  type FlagRow,
} from "./lib/flags";
import {
  COMPANY_PERMISSIONS,
  FACTORY_PERMISSIONS,
  listCompanyMemberships,
  requireWorkspaceAccess,
  requireWorkspacePermission,
} from "./lib/companyAccess";

async function loadRowsForKey(
  ctx: { db: any },
  key: string,
): Promise<Array<FlagRow & { _id: string }>> {
  return await ctx.db
    .query("featureFlags")
    .withIndex("by_key", (q: any) => q.eq("key", key))
    .collect();
}


/** All flags (known registry + any ad-hoc rows), resolved for optional project scope. */
export const list = query({
  args: {
    projectId: v.optional(v.id("projects")),
  },
  handler: async (ctx, args) => {
    const rows = (await ctx.db.query("featureFlags").collect()) as FlagRow[];
    return resolveAllFlags(rows, args.projectId ?? null);
  },
});

/** Single-flag check. Returns false for unknown keys — never throws. */
export const isEnabled = query({
  args: {
    key: v.string(),
    projectId: v.optional(v.id("projects")),
  },
  handler: async (ctx, args) => {
    if (isFactoryControlFlag(args.key)) {
      if (!args.projectId) return false;
      await requireWorkspacePermission(
        ctx,
        args.projectId,
        FACTORY_PERMISSIONS.VIEW,
      );
    }
    const rows = (await loadRowsForKey(ctx, args.key)) as FlagRow[];
    return resolveFlag(rows, args.key, args.projectId ?? null).enabled;
  },
});

/** Upsert a flag row (global or project-scoped) with an audit trail entry. */
export const setFlag = mutation({
  args: {
    key: v.string(),
    enabled: v.boolean(),
    projectId: v.optional(v.id("projects")),
    actorId: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (!isValidFlagKey(args.key)) {
      throw new Error(
        `Invalid flag key "${args.key}" — expected dot-separated lowercase segments, e.g. "ui.shell.v2"`,
      );
    }
    if (args.description !== undefined && args.description.trim().length > 1_000) {
      throw new Error("Feature flag descriptions must be at most 1,000 characters.");
    }
    // Authority is resolved server-side for EVERY key. Flags gate the
    // authorization checks themselves (`company.context`,
    // `control-plane.team-authorization`), so an unauthenticated writer here
    // would be able to disable the control plane's own access control.
    if (flagRequiresWorkspaceScope(args.key) && !args.projectId) {
      throw new Error(
        isFactoryControlFlag(args.key)
          ? "Factory control flags must be scoped to a workspace."
          : "Control-plane flags must be scoped to a workspace.",
      );
    }

    const authority = requiredFlagWriteAuthority(args.key, Boolean(args.projectId));
    let actorId: string;
    let tenantId;
    if (authority === "WORKSPACE_FACTORY_AUTOMATION") {
      const access = await requireWorkspacePermission(
        ctx,
        args.projectId!,
        FACTORY_PERMISSIONS.MANAGE_AUTOMATION,
      );
      actorId = access.actorId;
      tenantId = access.project.tenantId;
    } else if (authority === "WORKSPACE_MANAGE") {
      const project = await ctx.db.get(args.projectId!);
      if (!project?.tenantId)
        throw new Error("Workspace company assignment is incomplete.");
      const access = await requireWorkspaceAccess(ctx, project.tenantId, project._id, {
        permission: COMPANY_PERMISSIONS.MANAGE_WORKSPACES,
      });
      actorId = String(access.membership.operatorId ?? "demo:company-administrator");
      tenantId = project.tenantId;
    } else {
      // Global row: only a company administrator may change deployment-wide
      // behaviour. Attribution comes from the membership, never the client.
      const memberships = await listCompanyMemberships(ctx);
      const admin = memberships.find((membership) => membership.canManageCompany);
      if (!admin) {
        throw new Error(
          "Company administrator access is required to change a global feature flag.",
        );
      }
      actorId = String(admin.operatorId ?? "demo:company-administrator");
      tenantId = admin.tenant._id;
    }

    const now = Date.now();
    const existing = (await loadRowsForKey(ctx, args.key)).find((row: any) =>
      args.projectId ? row.projectId === args.projectId : !row.projectId,
    ) as any;

    let flagId;
    if (existing) {
      await ctx.db.patch(existing._id, {
        enabled: args.enabled,
        ...(args.description !== undefined
          ? { description: args.description }
          : {}),
        updatedBy: actorId,
        updatedAt: now,
      });
      flagId = existing._id;
    } else {
      flagId = await ctx.db.insert("featureFlags", {
        key: args.key,
        enabled: args.enabled,
        description: args.description,
        projectId: args.projectId,
        updatedBy: actorId,
        createdAt: now,
        updatedAt: now,
      });
    }

    await ctx.db.insert("activities", {
      tenantId,
      projectId: args.projectId,
      actorType: "HUMAN",
      actorId,
      action: "FEATURE_FLAG_SET",
      description: `Feature flag "${args.key}" set to ${args.enabled}${
        args.projectId ? " (project scope)" : " (global)"
      }`,
      targetType: "featureFlag",
      targetId: args.key,
      beforeState: existing ? { enabled: existing.enabled } : undefined,
      afterState: { enabled: args.enabled },
    });

    return flagId;
  },
});
