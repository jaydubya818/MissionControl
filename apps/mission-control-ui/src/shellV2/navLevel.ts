import type { FactoryExperienceLevel } from "../factoryExperience/recipeCatalog";
import type { NavGroup } from "./navConfig";

/**
 * Progressive navigation (docs/plans: Phase 3, P3.2).
 *
 * The same experience level that already gates Factory tabs now gates the
 * operator shell. Basic shows only the governed-delivery path so a first-time
 * operator sees Mission -> Work Order -> Approval -> Audit without ~40
 * destinations competing for attention. Anything not listed here is Advanced.
 */
export const BASIC_VIEWS: ReadonlySet<string> = new Set([
  "command-center",
  "missions",
  "control-work-orders",
  "factory",
  "control-approvals",
  "audit",
  "telemetry",
  "docs",
]);

export const INTERMEDIATE_VIEWS: ReadonlySet<string> = new Set([
  "goals",
  "tasks",
  "atc",
  "automations",
  "deployments",
  "analytics",
  "trace-inspector",
  "skills",
  "memory",
  "projects",
]);

const RANK: Record<FactoryExperienceLevel, number> = {
  basic: 0,
  intermediate: 1,
  advanced: 2,
};

export const NAV_LEVEL_LABELS: Record<FactoryExperienceLevel, string> = {
  basic: "Basic",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

/** The lowest level at which a destination appears. */
export function minimumLevelForView(view: string): FactoryExperienceLevel {
  if (BASIC_VIEWS.has(view)) return "basic";
  if (INTERMEDIATE_VIEWS.has(view)) return "intermediate";
  return "advanced";
}

export function isViewVisibleAtLevel(
  view: string,
  level: FactoryExperienceLevel,
): boolean {
  return RANK[level] >= RANK[minimumLevelForView(view)];
}

export interface NavLevelOptions {
  /** Views that must stay visible regardless of level (the active view). */
  keepVisible?: readonly string[];
}

/** Hide destinations above the operator's experience level. Pure; never mutates. */
export function filterNavGroupsByLevel(
  groups: NavGroup[],
  level: FactoryExperienceLevel,
  options: NavLevelOptions = {},
): NavGroup[] {
  const keep = new Set(options.keepVisible ?? []);
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) =>
          keep.has(item.view as string) ||
          isViewVisibleAtLevel(item.view as string, level),
      ),
    }))
    .filter((group) => group.items.length > 0);
}

/** How many destinations a higher level would reveal. */
export function countHiddenByLevel(
  groups: NavGroup[],
  level: FactoryExperienceLevel,
): number {
  return groups.reduce(
    (total, group) =>
      total +
      group.items.filter(
        (item) => !isViewVisibleAtLevel(item.view as string, level),
      ).length,
    0,
  );
}

/** True when the active view is only shown because a deep link kept it visible. */
export function isViewAboveLevel(
  view: string,
  level: FactoryExperienceLevel,
): boolean {
  return !isViewVisibleAtLevel(view, level);
}
