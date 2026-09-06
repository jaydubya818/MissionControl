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
  { key: "context.registry", description: "Context package registry backend + UI (PR 2, 18)", defaultEnabled: false },
  { key: "context.cbom", description: "Context Bill of Materials snapshot at run start (PR 6)", defaultEnabled: false },
  { key: "context.gates", description: "Context quality gates blocking publication (PR 10)", defaultEnabled: false },
  { key: "eval.framework", description: "Baseline/candidate evaluation execution (PR 7–9)", defaultEnabled: false },
  { key: "security.scanning", description: "Context/skill security scan pipeline (PR 11)", defaultEnabled: false },
  { key: "dispatch.v2", description: "Context-aware dispatch scoring (PR 14)", defaultEnabled: false },
  { key: "trust.scoring", description: "Agent trust scores and constraints (PR 15)", defaultEnabled: false },
  { key: "rollout.rings", description: "Context rollout rings 0–4 (PR 17)", defaultEnabled: false },
  { key: "delivery.workorders", description: "Work order delivery control plane (PR 2a, 21)", defaultEnabled: false },
  { key: "missions.plan-release-v1", description: "Versioned Mission plans, decisions, and atomic WorkOrder release", defaultEnabled: false },
  { key: "missions.spec-intake-v1", description: "Immutable Constitution and Mission Spec intake before Plan release", defaultEnabled: false },
  { key: "missions.shared-builder-intent-v1", description: "Attributable role-aware proposals in the exact Mission Spec lineage", defaultEnabled: false },
  { key: "executor.pi-bridge", description: "Pi runtime receipt packet ingestion and dispatch envelope", defaultEnabled: false },
  { key: "eos.command-center-preview", description: "Engineering OS demo experience — Command Center, missions, lineage, intelligence views", defaultEnabled: false },
  { key: "ui.control.stubs", description: "Show preview-only Control plane stubs (Portfolio, Fleet) in navigation", defaultEnabled: false },
  { key: "ui.navigation.previews", description: "Show preview routes in the v2 operator navigation", defaultEnabled: false },
  { key: "ui.navigation.demo-routes", description: "Show explicitly demo-only routes and EOS demo tour controls", defaultEnabled: false },
  { key: "model-routing.enabled", description: "Enforce workspace model routing decisions at Work Order dispatch", defaultEnabled: false },
  { key: "company.context", description: "Company account selection and company-scoped workspace administration", defaultEnabled: false },
  { key: "control-plane.repository-projection", description: "Use repository connections and code scopes as the authoritative source projection", defaultEnabled: false },
  { key: "control-plane.team-authorization", description: "Enforce team membership and stable delivery ownership", defaultEnabled: false },
  { key: "control-plane.role-lenses", description: "Enable My, Team, Workspace, and Company Command Center lenses", defaultEnabled: false },
  { key: "control-plane.dispatch-scope", description: "Enforce repository and code-scope policy at dispatch", defaultEnabled: false },
  { key: "control-plane.company-rollups", description: "Enable authorized cross-workspace Company Command Center projections", defaultEnabled: false },
  { key: "factory-memory.hybrid", description: "Factory Memory ingestion and hybrid lexical, semantic, and code-aware retrieval", defaultEnabled: false },
  { key: "factory-memory.relationships", description: "Typed Factory entity and relationship index", defaultEnabled: false },
  { key: "factory-memory.agentic-retrieval", description: "Bounded Context Planner and sufficiency loop", defaultEnabled: false },
  { key: "factory-memory.knowledge-graph", description: "Bounded Factory Knowledge Graph traversal and path inspection", defaultEnabled: false },
  { key: "factory-memory.context-engine", description: "Frozen Attempt Context Packages, verification influence, and context evals", defaultEnabled: false },
  { key: "review-intelligence.residual-ai", description: "Optional post-verification advisory residual analysis", defaultEnabled: false },
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
