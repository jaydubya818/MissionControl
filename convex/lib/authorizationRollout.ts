import type { MutationCtx, QueryCtx } from "../_generated/server";

type RolloutCtx = QueryCtx | MutationCtx;

export type AuthorizationMode = "ENFORCED" | "UNPROVISIONED" | "ANONYMOUS_DEMO";
export type BackendDeploymentClass = "local" | "shared" | "production";

const BACKEND_DEPLOYMENT_CLASSES = new Set<BackendDeploymentClass>([
  "local",
  "shared",
  "production",
]);

export function parseBackendDeploymentClass(
  value: string | undefined,
): BackendDeploymentClass | null {
  const normalized = value?.trim().toLowerCase();
  return normalized && BACKEND_DEPLOYMENT_CLASSES.has(normalized as BackendDeploymentClass)
    ? normalized as BackendDeploymentClass
    : null;
}

export function anonymousDemoEnabledFor(input: {
  requested: boolean;
  deploymentClass: string | undefined;
}): boolean {
  if (!input.requested) return false;
  const deploymentClass = parseBackendDeploymentClass(input.deploymentClass);
  if (deploymentClass !== "local") {
    throw new Error(
      "MC_ALLOW_ANONYMOUS_COMPANY_CONTEXT requires MC_BACKEND_DEPLOYMENT_CLASS=local.",
    );
  }
  return true;
}

export function resolveAuthorizationMode(input: {
  flagEnabled: boolean;
  hasActiveOperator: boolean;
  anonymousDemo: boolean;
}): AuthorizationMode {
  if (input.anonymousDemo) return "ANONYMOUS_DEMO";
  if (input.flagEnabled) return "ENFORCED";
  return input.hasActiveOperator ? "ENFORCED" : "UNPROVISIONED";
}

export function authorizationIsEnforced(mode: AuthorizationMode): boolean {
  return mode === "ENFORCED";
}

export function authorizationRequiredFor(
  mode: AuthorizationMode,
  access: "READ" | "WRITE",
): boolean {
  if (mode === "ANONYMOUS_DEMO") return false;
  if (mode === "ENFORCED") return true;
  // Historical records remain readable before the first operator is
  // provisioned, but an anonymous caller may not create more legacy state.
  return access === "WRITE";
}

export function authorizationModeSummary(mode: AuthorizationMode) {
  switch (mode) {
    case "ENFORCED":
      return {
        mode,
        enforced: true,
        headline: "Authorization enforced",
        detail: "Company, workspace, and permission scope are resolved server-side for governed delivery functions.",
      };
    case "UNPROVISIONED":
      return {
        mode,
        enforced: false,
        headline: "Authorization not yet enforced — no operators provisioned",
        detail: "Legacy reads remain available until the first active operator is provisioned. All writes and governed acceptance remain unavailable.",
      };
    case "ANONYMOUS_DEMO":
      return {
        mode,
        enforced: false,
        headline: "UNSAFE: anonymous company context is enabled",
        detail: "MC_ALLOW_ANONYMOUS_COMPANY_CONTEXT=1 is local-demo compatibility only and must not be set on shared or production deployments.",
      };
  }
}

export async function hasProvisionedOperator(ctx: RolloutCtx): Promise<boolean> {
  const operator = await ctx.db
    .query("operators")
    .filter((q) => q.eq(q.field("active"), true))
    .first();
  return operator !== null;
}

export function anonymousDemoEnabled(): boolean {
  return anonymousDemoEnabledFor({
    requested: process.env.MC_ALLOW_ANONYMOUS_COMPANY_CONTEXT === "1",
    deploymentClass: process.env.MC_BACKEND_DEPLOYMENT_CLASS,
  });
}

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
