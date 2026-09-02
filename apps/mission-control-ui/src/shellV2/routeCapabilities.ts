import type { MainView } from "../TopNav";
import {
  ACCESS_PERMISSIONS,
  ACCESS_VIEW_REQUIREMENTS,
  isAccessViewKey,
  type AccessPermission,
} from "@mission-control/shared";

export type RouteScope = "workspace" | "global";
export type RouteMaturity = "live" | "preview" | "demo" | "hidden";

export interface RouteCapability {
  scope: RouteScope;
  maturity: RouteMaturity;
  requiredPermission: AccessPermission;
}

type RoutePresentation = Omit<RouteCapability, "requiredPermission">;

/**
 * Product contract for the EOS operator shell.
 *
 * Routes omitted from this registry are hidden when capability enforcement is
 * enabled. This makes adding a component insufficient to promote it into the
 * production navigation.
 */
const ROUTE_PRESENTATION: Partial<Record<MainView, RoutePresentation>> = {
  "command-center": { scope: "workspace", maturity: "live" },
  "control-work-orders": { scope: "workspace", maturity: "live" },
  "control-approvals": { scope: "workspace", maturity: "live" },
  tasks: { scope: "workspace", maturity: "live" },
  "trace-inspector": { scope: "workspace", maturity: "live" },
  agents: { scope: "workspace", maturity: "live" },
  atc: { scope: "workspace", maturity: "live" },
  audit: { scope: "workspace", maturity: "live" },
  telemetry: { scope: "workspace", maturity: "live" },
  automations: { scope: "workspace", maturity: "live" },
  "automation-runs": { scope: "workspace", maturity: "live" },
  skills: { scope: "global", maturity: "live" },
  memory: { scope: "workspace", maturity: "live" },
  docs: { scope: "global", maturity: "live" },
  policies: { scope: "workspace", maturity: "preview" },
  identity: { scope: "workspace", maturity: "live" },
  deployments: { scope: "workspace", maturity: "live" },
  projects: { scope: "workspace", maturity: "live" },
  "model-routing": { scope: "workspace", maturity: "live" },
  "access-profiles": { scope: "global", maturity: "live" },
  "operator-evals": { scope: "workspace", maturity: "live" },

  goals: { scope: "workspace", maturity: "preview" },
  factory: { scope: "workspace", maturity: "live" },
  code: { scope: "workspace", maturity: "preview" },
  dag: { scope: "workspace", maturity: "preview" },
  analytics: { scope: "workspace", maturity: "preview" },
  "harness-loops": { scope: "workspace", maturity: "live" },
  "harness-code-review-wizard": { scope: "workspace", maturity: "preview" },
  "harness-change-review": { scope: "workspace", maturity: "preview" },
  "harness-automations": { scope: "workspace", maturity: "preview" },
  "harness-meta-loop": { scope: "workspace", maturity: "preview" },
  "registry-lifecycle": { scope: "workspace", maturity: "preview" },
  "registry-evaluate": { scope: "workspace", maturity: "preview" },
  "registry-inventory": { scope: "workspace", maturity: "preview" },
  "registry-installations": { scope: "workspace", maturity: "preview" },
  "registry-runs": { scope: "workspace", maturity: "preview" },
  "qc-rulesets": { scope: "workspace", maturity: "preview" },
  gateway: { scope: "workspace", maturity: "preview" },
  system: { scope: "workspace", maturity: "preview" },
  "design-system": { scope: "global", maturity: "preview" },
  recorder: { scope: "workspace", maturity: "preview" },
  "test-generation": { scope: "workspace", maturity: "preview" },
  "api-import": { scope: "workspace", maturity: "preview" },
  "flaky-steps": { scope: "workspace", maturity: "preview" },
  gherkin: { scope: "workspace", maturity: "preview" },
  "hybrid-workflows": { scope: "workspace", maturity: "preview" },
  codegen: { scope: "workspace", maturity: "preview" },
  pipeline: { scope: "workspace", maturity: "preview" },

  missions: { scope: "workspace", maturity: "live" },
  "mission-detail": { scope: "workspace", maturity: "live" },
  effectiveness: { scope: "workspace", maturity: "demo" },
  "factory-health": { scope: "workspace", maturity: "demo" },
  readiness: { scope: "workspace", maturity: "demo" },
  friction: { scope: "workspace", maturity: "demo" },
  recommendations: { scope: "workspace", maturity: "demo" },
  "agent-catalog": { scope: "global", maturity: "demo" },
  dossier: { scope: "workspace", maturity: "demo" },
};

export const ROUTE_CAPABILITIES = Object.fromEntries(
  Object.entries(ROUTE_PRESENTATION).map(([view, presentation]) => {
    if (!isAccessViewKey(view)) {
      throw new Error(`EOS route ${view} is missing from the access-control registry.`);
    }
    return [view, {
      ...presentation,
      requiredPermission: ACCESS_VIEW_REQUIREMENTS[view],
    }];
  }),
) as Partial<Record<MainView, RouteCapability>>;

const HIDDEN_CAPABILITY: RouteCapability = {
  scope: "workspace",
  maturity: "hidden",
  requiredPermission: ACCESS_PERMISSIONS.SYSTEM_READ,
};

export function routeCapability(view: MainView): RouteCapability {
  return ROUTE_CAPABILITIES[view] ?? HIDDEN_CAPABILITY;
}

export function hasDeclaredRouteCapability(view: MainView): boolean {
  return ROUTE_CAPABILITIES[view] != null;
}

export interface RouteVisibilityOptions {
  showPreviewRoutes?: boolean;
  showDemoRoutes?: boolean;
}

export interface RouteAccessContext {
  status: "READY" | "NO_PROFILE" | "CONFLICT";
  enforced: boolean;
  effectivePermissions: readonly string[];
  profile?: { visibleViews: readonly string[] };
  canManageAccessProfiles?: boolean;
  persona?: string;
  identityMode?: "AUTHENTICATED" | "DEMO";
  demoPreview?: boolean;
}

/**
 * Shared predicate for sidebar, deep links, commands, and cross-navigation.
 * Legacy and shadow modes observe the decision without changing behavior.
 */
export function isRouteAuthorized(
  view: MainView,
  access?: RouteAccessContext,
): boolean {
  if (view === "access-profiles" && access && !access.canManageAccessProfiles) return false;
  if (!access?.enforced) return true;
  if (access.status !== "READY" || !access.profile) return false;
  if (!hasDeclaredRouteCapability(view)) return false;
  const capability = routeCapability(view);
  return (
    access.profile.visibleViews.includes(view) &&
    access.effectivePermissions.includes(capability.requiredPermission)
  );
}

export function isRouteVisible(
  view: MainView,
  options: RouteVisibilityOptions = {}
): boolean {
  const capability = routeCapability(view);
  if (capability.maturity === "live") return true;
  if (capability.maturity === "preview") return options.showPreviewRoutes === true;
  if (capability.maturity === "demo") return options.showDemoRoutes === true;
  return false;
}

export function routeBadge(
  view: MainView
): "Global" | "Preview" | "Demo" | undefined {
  const capability = routeCapability(view);
  if (capability.maturity === "preview") return "Preview";
  if (capability.maturity === "demo") return "Demo";
  if (capability.scope === "global") return "Global";
  return undefined;
}
