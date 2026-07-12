/**
 * Feature flag registry and resolution logic.
 *
 * Pure functions only — no Convex imports — so resolution rules are unit
 * testable and reusable from queries, mutations, and the CLI.
 *
 * Resolution precedence (highest wins):
 *   1. Project-scoped row (projectId matches)
 *   2. Global row (no projectId)
 *   3. Registered default (KNOWN_FLAGS)
 *   4. false (unknown keys are always off)
 */

export interface FlagDefinition {
  key: string;
  description: string;
  /** Default when no database row exists. New subsystems ship default-off. */
  defaultEnabled: boolean;
}

export type FlagSource = "project" | "global" | "default";

export interface FlagRow {
  key: string;
  enabled: boolean;
  projectId?: string | null;
}

export interface ResolvedFlag {
  key: string;
  enabled: boolean;
  source: FlagSource;
  description?: string;
}

/**
 * Software Factory program flags. One per gated subsystem; each flips on
 * after its epic's E2E flow passes and is removed at most two PRs later.
 */
export const KNOWN_FLAGS: FlagDefinition[] = [
  { key: "ui.shell.v2", description: "Left-sidebar AppShell + router navigation (PR 1)", defaultEnabled: false },
  { key: "context.registry", description: "Context package registry backend + UI (PR 2, 18)", defaultEnabled: true },
  { key: "context.cbom", description: "Context Bill of Materials snapshot at run start (PR 6)", defaultEnabled: false },
  { key: "context.gates", description: "Context quality gates blocking publication (PR 10)", defaultEnabled: false },
  { key: "eval.framework", description: "Baseline/candidate evaluation execution (PR 7–9)", defaultEnabled: false },
  { key: "security.scanning", description: "Context/skill security scan pipeline (PR 11)", defaultEnabled: false },
  { key: "dispatch.v2", description: "Context-aware dispatch scoring (PR 14)", defaultEnabled: false },
  { key: "trust.scoring", description: "Agent trust scores and constraints (PR 15)", defaultEnabled: false },
  { key: "rollout.rings", description: "Context rollout rings 0–4 (PR 17)", defaultEnabled: false },
  { key: "delivery.workorders", description: "Work order delivery control plane (PR 2a, 21)", defaultEnabled: false },
  { key: "eos.command-center-preview", description: "Engineering OS demo experience — Command Center, missions, lineage, intelligence views", defaultEnabled: false },
];

const KNOWN_FLAG_MAP: Map<string, FlagDefinition> = new Map(
  KNOWN_FLAGS.map((f) => [f.key, f])
);

export function isKnownFlag(key: string): boolean {
  return KNOWN_FLAG_MAP.has(key);
}

export function getFlagDefinition(key: string): FlagDefinition | undefined {
  return KNOWN_FLAG_MAP.get(key);
}

/** A flag key: dot-separated lowercase segments, e.g. "ui.shell.v2". */
export function isValidFlagKey(key: string): boolean {
  return /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(key);
}

/**
 * Resolve one flag from the set of database rows for that key.
 * `rows` may contain both the global row and any project-scoped rows.
 */
export function resolveFlag(
  rows: FlagRow[],
  key: string,
  projectId?: string | null
): ResolvedFlag {
  const definition = KNOWN_FLAG_MAP.get(key);

  if (projectId) {
    const projectRow = rows.find(
      (r) => r.key === key && r.projectId === projectId
    );
    if (projectRow) {
      return {
        key,
        enabled: projectRow.enabled,
        source: "project",
        description: definition?.description,
      };
    }
  }

  const globalRow = rows.find((r) => r.key === key && !r.projectId);
  if (globalRow) {
    return {
      key,
      enabled: globalRow.enabled,
      source: "global",
      description: definition?.description,
    };
  }

  return {
    key,
    enabled: definition?.defaultEnabled ?? false,
    source: "default",
    description: definition?.description,
  };
}

/**
 * Resolve the full flag list: every known flag plus any unregistered keys
 * that have database rows (so ad-hoc flags remain visible and deletable).
 */
export function resolveAllFlags(
  rows: FlagRow[],
  projectId?: string | null
): ResolvedFlag[] {
  const keys = new Set<string>(KNOWN_FLAGS.map((f) => f.key));
  for (const row of rows) keys.add(row.key);
  return [...keys].sort().map((key) => resolveFlag(rows, key, projectId));
}
