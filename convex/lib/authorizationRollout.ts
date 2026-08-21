/**
 * Safe migration from fail-open legacy authorization to fail-closed.
 *
 * ## The problem
 *
 * `control-plane.team-authorization` and `company.context` both ship
 * `defaultEnabled: false`, and the gates they guard return `null` / `false`
 * when off — i.e. an unconfigured deployment authorizes everything. That is the
 * wrong default for a governed control plane, but flipping the flags outright
 * would lock out every existing deployment that has not yet provisioned
 * operators, roles, and memberships.
 *
 * ## The resolution: provisioning is the migration signal
 *
 * Authorization enforces as soon as the deployment has anything to enforce
 * *with*. Concretely, a deployment is **provisioned** once at least one active
 * `operators` row exists. Until then it is a fresh or unmigrated install where
 * no one could pass a check, so legacy behaviour is retained and surfaced.
 *
 * That gives a migration with no manual step and no indefinite fail-open:
 *
 * | Deployment state | Flag off | Flag on |
 * | --- | --- | --- |
 * | No active operators (fresh / unmigrated) | legacy, reported as `UNPROVISIONED` | enforced |
 * | ≥1 active operator | **enforced** | enforced |
 *
 * An explicit flag still forces enforcement early, so an operator can opt in
 * before provisioning finishes. The only way to be unenforced is to have no
 * operator who could be authorized — which is also the only state where
 * enforcing would lock everyone out.
 *
 * `MC_ALLOW_ANONYMOUS_COMPANY_CONTEXT=1` remains a separate, louder override
 * handled in `companyAccess.listCompanyMemberships`; see
 * `authorizationModeSummary` for how it is reported.
 */

import type { MutationCtx, QueryCtx } from "../_generated/server";

type RolloutCtx = QueryCtx | MutationCtx;

export type AuthorizationMode =
  /** Enforcing: an operator exists, or the flag was explicitly enabled. */
  | "ENFORCED"
  /** Legacy: no operator has been provisioned, so nothing could pass a check. */
  | "UNPROVISIONED"
  /** `MC_ALLOW_ANONYMOUS_COMPANY_CONTEXT=1`: every check is bypassed. */
  | "ANONYMOUS_DEMO";

/**
 * Pure decision, unit tested independently of Convex.
 *
 * @param flagEnabled  the feature flag's resolved value
 * @param hasActiveOperator  whether any active `operators` row exists
 * @param anonymousDemo  whether the anonymous-demo env override is set
 */
export function resolveAuthorizationMode(input: {
  flagEnabled: boolean;
  hasActiveOperator: boolean;
  anonymousDemo: boolean;
}): AuthorizationMode {
  if (input.anonymousDemo) return "ANONYMOUS_DEMO";
  if (input.flagEnabled) return "ENFORCED";
  return input.hasActiveOperator ? "ENFORCED" : "UNPROVISIONED";
}

/** True when the caller must pass a real authorization check. */
export function authorizationIsEnforced(mode: AuthorizationMode): boolean {
  return mode === "ENFORCED";
}

/** Operator-facing explanation of an unenforced deployment. */
export function authorizationModeSummary(mode: AuthorizationMode): {
  mode: AuthorizationMode;
  enforced: boolean;
  headline: string;
  detail: string;
} {
  switch (mode) {
    case "ENFORCED":
      return {
        mode,
        enforced: true,
        headline: "Authorization enforced",
        detail:
          "Company, workspace, and permission scope are resolved server-side for governed delivery functions.",
      };
    case "UNPROVISIONED":
      return {
        mode,
        enforced: false,
        headline: "Authorization not yet enforced — no operators provisioned",
        detail:
          "This deployment has no active operator, so authorization checks would refuse everyone. " +
          "Legacy unscoped access is retained until the first operator is created; it switches to " +
          "enforced automatically at that point. Provision an owner to complete the migration.",
      };
    case "ANONYMOUS_DEMO":
      return {
        mode,
        enforced: false,
        headline: "UNSAFE: anonymous company context is enabled",
        detail:
          "MC_ALLOW_ANONYMOUS_COMPANY_CONTEXT=1 grants every company permission over every tenant to " +
          "unauthenticated callers. This is a local demo mode only and must never be set on a shared " +
          "or production deployment.",
      };
  }
}

/** Does this deployment have anyone who could pass an authorization check? */
export async function hasProvisionedOperator(ctx: RolloutCtx): Promise<boolean> {
  const operator = await ctx.db
    .query("operators")
    .withIndex("by_active", (q) => q.eq("active", true))
    .first();
  return operator !== null;
}

export function anonymousDemoEnabled(): boolean {
  return process.env.MC_ALLOW_ANONYMOUS_COMPANY_CONTEXT === "1";
}

/** Resolve the deployment's effective authorization mode. */
export async function resolveDeploymentAuthorizationMode(
  ctx: RolloutCtx,
  flagEnabled: boolean,
): Promise<AuthorizationMode> {
  return resolveAuthorizationMode({
    flagEnabled,
    hasActiveOperator: await hasProvisionedOperator(ctx),
    anonymousDemo: anonymousDemoEnabled(),
  });
}
