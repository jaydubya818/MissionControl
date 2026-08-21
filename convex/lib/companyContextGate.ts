import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { resolveFlag, type FlagRow } from "./flags";
import {
  authorizationIsEnforced,
  resolveDeploymentAuthorizationMode,
} from "./authorizationRollout";

type GateCtx = QueryCtx | MutationCtx;

/**
 * Company-scope gate for project APIs.
 *
 * Enforced when the `company.context` flag is on, and — regardless of the flag
 * — as soon as the deployment has provisioned an active operator. Only a
 * deployment with no operator at all retains legacy unscoped access, because
 * that is the only state in which enforcing would refuse everyone. See
 * `lib/authorizationRollout.ts`.
 */
export async function isCompanyContextEnforced(
  ctx: GateCtx,
  projectId?: Id<"projects">
): Promise<boolean> {
  const rows = (await ctx.db
    .query("featureFlags")
    .withIndex("by_key", (q) => q.eq("key", "company.context"))
    .collect()) as FlagRow[];
  const flagEnabled = resolveFlag(rows, "company.context", projectId ?? null).enabled;
  return authorizationIsEnforced(
    await resolveDeploymentAuthorizationMode(ctx, flagEnabled),
  );
}

