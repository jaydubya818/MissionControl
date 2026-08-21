/**
 * Authorization boundary wrappers for public Convex functions.
 *
 * ## Why this exists
 *
 * A Convex `query`/`mutation`/`action` export is callable by anyone who knows
 * the deployment URL, and that URL ships to every browser as `VITE_CONVEX_URL`.
 * "Public" therefore means *internet-facing*, not "internal to the app". The
 * governed core (`workOrders`, `missions`, `factory/*`, `serviceCommands`)
 * resolves company/workspace scope server-side, but a large legacy surface does
 * not, and nothing structurally prevents the next function from repeating that.
 *
 * These wrappers make the secure shape the easy one:
 *
 * | Wrapper | Requires | Actor identity |
 * | --- | --- | --- |
 * | `authedQuery` / `authedMutation` | a signed-in identity | resolved operator memberships |
 * | `workspaceQuery` / `workspaceMutation` | `projectId` + a company permission on that workspace | `access.actorId` |
 * | `companyQuery` / `companyMutation` | `tenantId` + a company permission | `access.actorId` |
 * | `adminQuery` / `adminMutation` | company administrator | `access.actorId` |
 * | `publicQuery` / `publicMutation` | nothing — but the reason is recorded | none |
 *
 * ## Rules
 *
 * 1. **Actor identity is never an argument.** Every wrapper puts the resolved
 *    `actorId` on the context. Audit attribution that a caller can choose is
 *    not attribution. If a handler needs to record who did something, it reads
 *    `ctx.access.actorId` — never `args.actorId`/`requestedBy`/`decidedBy`.
 * 2. **Scope is a required argument, not an optional one.** An optional
 *    `projectId` that falls back to "all workspaces" is a cross-tenant read.
 * 3. **`publicQuery`/`publicMutation` must state why.** The `reason` string is
 *    the record of a deliberate decision, and the authorization ratchet
 *    (`scripts/check-convex-authorization.mjs`) treats these as reviewed.
 * 4. Anything with no legitimate external caller is `internal*`, not wrapped.
 *
 * Actions cannot read the database directly, so there is no `workspaceAction`:
 * an action authorizes by `ctx.runQuery`-ing an authorized query first (see
 * `openclawDiscovery.discoverAgents` for the pattern).
 */

import { mutation, query } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { v } from "convex/values";
import {
  COMPANY_PERMISSIONS,
  requireCompanyAdministrator,
  requireCompanyPermission,
  requireWorkspaceAccess,
  listCompanyMemberships,
  type CompanyMembership,
  type CompanyPermission,
} from "./companyAccess";

/** What a wrapped handler is given in place of a client-supplied identity. */
export interface ResolvedAccess {
  /** Server-derived actor id. Safe to persist as audit attribution. */
  actorId: string;
  membership: CompanyMembership;
  tenantId: Id<"tenants">;
  /** Present for workspace-scoped functions. */
  project?: any;
}

function actorIdFor(membership: CompanyMembership): string {
  if (membership.operatorId) return String(membership.operatorId);
  if (membership.mode === "DEMO") return "demo:company-administrator";
  throw new Error("Authenticated operator membership is required.");
}

/** Resolve an authenticated identity with at least one company membership. */
export async function resolveAuthenticated(ctx: any): Promise<ResolvedAccess> {
  const memberships = await listCompanyMemberships(ctx);
  const membership = memberships[0];
  if (!membership) {
    throw new Error("Authentication is required.");
  }
  return {
    actorId: actorIdFor(membership),
    membership,
    tenantId: membership.tenant._id,
  };
}

async function resolveWorkspace(
  ctx: any,
  projectId: Id<"projects">,
  // Optional on purpose: a read-only query often needs "is a member of this
  // workspace's company", not a specific write permission. Omitting it still
  // requires an authenticated operator with a membership on this workspace —
  // it does not make the function public.
  permission?: CompanyPermission,
): Promise<ResolvedAccess> {
  const project = await ctx.db.get(projectId);
  if (!project?.tenantId) {
    throw new Error("Workspace is unavailable or unauthorized.");
  }
  const access = await requireWorkspaceAccess(ctx, project.tenantId, project._id, {
    permission,
  });
  return {
    actorId: actorIdFor(access.membership),
    membership: access.membership,
    tenantId: project.tenantId,
    project: access.project,
  };
}

async function resolveCompany(
  ctx: any,
  tenantId: Id<"tenants">,
  permission: CompanyPermission,
): Promise<ResolvedAccess> {
  const membership = await requireCompanyPermission(ctx, tenantId, permission);
  return { actorId: actorIdFor(membership), membership, tenantId };
}

async function resolveAdministrator(ctx: any): Promise<ResolvedAccess> {
  const membership = await requireCompanyAdministrator(ctx);
  return {
    actorId: actorIdFor(membership),
    membership,
    tenantId: membership.tenant._id,
  };
}

type Handler<Args, Output> = (
  ctx: any & { access: ResolvedAccess },
  args: Args,
) => Output | Promise<Output>;

/** Requires a signed-in identity with at least one company membership. */
export function authedQuery<Args extends Record<string, any>, Output>(config: {
  args: any;
  handler: Handler<Args, Output>;
}) {
  return query({
    args: config.args,
    handler: async (ctx: any, args: any) =>
      config.handler({ ...ctx, access: await resolveAuthenticated(ctx) }, args),
  });
}

/** Requires a signed-in identity with at least one company membership. */
export function authedMutation<Args extends Record<string, any>, Output>(config: {
  args: any;
  handler: Handler<Args, Output>;
}) {
  return mutation({
    args: config.args,
    handler: async (ctx: any, args: any) =>
      config.handler({ ...ctx, access: await resolveAuthenticated(ctx) }, args),
  });
}

/**
 * Requires `projectId` and a company permission on that exact workspace.
 * `projectId` is injected into the validator so it can never be optional.
 */
export function workspaceQuery<Args extends Record<string, any>, Output>(config: {
  args: any;
  /** Omit to require workspace membership only (see `resolveWorkspace`). */
  permission?: CompanyPermission;
  handler: Handler<Args & { projectId: Id<"projects"> }, Output>;
}) {
  return query({
    args: { ...config.args, projectId: v.id("projects") },
    handler: async (ctx: any, args: any) =>
      config.handler(
        { ...ctx, access: await resolveWorkspace(ctx, args.projectId, config.permission) },
        args,
      ),
  });
}

/** Mutation counterpart of `workspaceQuery`. */
export function workspaceMutation<Args extends Record<string, any>, Output>(config: {
  args: any;
  /** Omit to require workspace membership only (see `resolveWorkspace`). */
  permission?: CompanyPermission;
  handler: Handler<Args & { projectId: Id<"projects"> }, Output>;
}) {
  return mutation({
    args: { ...config.args, projectId: v.id("projects") },
    handler: async (ctx: any, args: any) =>
      config.handler(
        { ...ctx, access: await resolveWorkspace(ctx, args.projectId, config.permission) },
        args,
      ),
  });
}

/** Requires `tenantId` and a company permission on that company account. */
export function companyQuery<Args extends Record<string, any>, Output>(config: {
  args: any;
  permission: CompanyPermission;
  handler: Handler<Args & { tenantId: Id<"tenants"> }, Output>;
}) {
  return query({
    args: { ...config.args, tenantId: v.id("tenants") },
    handler: async (ctx: any, args: any) =>
      config.handler(
        { ...ctx, access: await resolveCompany(ctx, args.tenantId, config.permission) },
        args,
      ),
  });
}

/** Mutation counterpart of `companyQuery`. */
export function companyMutation<Args extends Record<string, any>, Output>(config: {
  args: any;
  permission: CompanyPermission;
  handler: Handler<Args & { tenantId: Id<"tenants"> }, Output>;
}) {
  return mutation({
    args: { ...config.args, tenantId: v.id("tenants") },
    handler: async (ctx: any, args: any) =>
      config.handler(
        { ...ctx, access: await resolveCompany(ctx, args.tenantId, config.permission) },
        args,
      ),
  });
}

/** Deployment-wide configuration: company administrator only. */
export function adminQuery<Args extends Record<string, any>, Output>(config: {
  args: any;
  handler: Handler<Args, Output>;
}) {
  return query({
    args: config.args,
    handler: async (ctx: any, args: any) =>
      config.handler({ ...ctx, access: await resolveAdministrator(ctx) }, args),
  });
}

/** Deployment-wide configuration: company administrator only. */
export function adminMutation<Args extends Record<string, any>, Output>(config: {
  args: any;
  handler: Handler<Args, Output>;
}) {
  return mutation({
    args: config.args,
    handler: async (ctx: any, args: any) =>
      config.handler({ ...ctx, access: await resolveAdministrator(ctx) }, args),
  });
}

/**
 * Deliberately unauthenticated. `reason` is not decoration — it is the record
 * that someone decided this endpoint is safe to expose to the internet, and it
 * is what a reviewer reads when the authorization ratchet flags the file.
 */
export function publicQuery<Args extends Record<string, any>, Output>(config: {
  args: any;
  reason: string;
  handler: (ctx: any, args: Args) => Output | Promise<Output>;
}) {
  if (!config.reason?.trim()) {
    throw new Error("publicQuery requires an explicit exposure reason.");
  }
  return query({ args: config.args, handler: config.handler as any });
}

/** See `publicQuery`. An unauthenticated WRITE needs a very good reason. */
export function publicMutation<Args extends Record<string, any>, Output>(config: {
  args: any;
  reason: string;
  handler: (ctx: any, args: Args) => Output | Promise<Output>;
}) {
  if (!config.reason?.trim()) {
    throw new Error("publicMutation requires an explicit exposure reason.");
  }
  return mutation({ args: config.args, handler: config.handler as any });
}

export { COMPANY_PERMISSIONS };
