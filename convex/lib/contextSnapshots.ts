/**
 * Context Bill of Materials snapshot logic (Software Factory Epic 4).
 *
 * Pure functions only — no Convex imports — so snapshot diffing, export
 * normalization, and the hashable envelope are unit testable and reusable
 * from queries, mutations, and the CLI.
 *
 * A snapshot answers "what exactly shaped this run": model, agent version,
 * context packages (with content hashes), tools, feature flags, repo state,
 * and workflow/policy versions. Snapshots are immutable once written, so
 * two of them can be diffed to correlate a behavior regression with a
 * context change (see diffSnapshots) or exported for reproduction (see
 * normalizeSnapshotForExport / hashableEnvelope).
 */

// ---------------------------------------------------------------------------
// Snapshot shape (structural subset of a contextSnapshots row)
// ---------------------------------------------------------------------------

export interface SnapshotPackageEntry {
  readonly packageId?: string;
  readonly slug: string;
  readonly version: string;
  readonly contentHash: string;
  readonly sourceCommitSha?: string;
}

export interface SnapshotToolEntry {
  readonly name: string;
  readonly version?: string;
  readonly server?: string;
  readonly permissions?: readonly string[];
}

export interface SnapshotFlagEntry {
  readonly key: string;
  readonly enabled: boolean;
}

/**
 * The fields diff/export logic reads. Convex documents satisfy this shape
 * structurally; extra fields (_id, _creationTime) are ignored by the diff
 * and stripped by export normalization.
 */
export interface SnapshotLike {
  readonly runId?: string;
  readonly taskId?: string;
  readonly workOrderId?: string;
  readonly repoSlug?: string;
  readonly repositorySha?: string;
  readonly branch?: string;
  readonly worktreePath?: string;
  readonly model: string;
  readonly modelVersion?: string;
  readonly agentId?: string;
  readonly agentVersion?: string;
  readonly soulVersionHash?: string;
  readonly workflowVersion?: string;
  readonly policyVersion?: string;
  readonly packages: readonly SnapshotPackageEntry[];
  readonly tools?: readonly SnapshotToolEntry[];
  readonly environmentHash?: string;
  readonly runtimeConfigHash?: string;
  readonly featureFlags?: readonly SnapshotFlagEntry[];
  readonly approvalPolicy?: string;
  readonly riskClassification?: string;
  readonly createdAt: number;
}

// ---------------------------------------------------------------------------
// Diff
// ---------------------------------------------------------------------------

export interface ValueChange<T> {
  readonly from: T;
  readonly to: T;
}

/** A package present in both snapshots whose version or hash differs. */
export interface PackageChange {
  readonly slug: string;
  readonly from: { readonly version: string; readonly contentHash: string };
  readonly to: { readonly version: string; readonly contentHash: string };
}

/**
 * A flag whose resolved value differs. `from`/`to` is null when the flag
 * is absent from that snapshot's captured list.
 */
export interface FlagChange {
  readonly key: string;
  readonly from: boolean | null;
  readonly to: boolean | null;
}

export interface SnapshotDiff {
  /** Packages (by slug) present only in `b`. Sorted by slug. */
  readonly packagesAdded: SnapshotPackageEntry[];
  /** Packages (by slug) present only in `a`. Sorted by slug. */
  readonly packagesRemoved: SnapshotPackageEntry[];
  /** Packages in both whose version or contentHash differ. Sorted by slug. */
  readonly packagesChanged: PackageChange[];
  /** Model identity change ("model" or "model@modelVersion"), or null. */
  readonly modelChanged: ValueChange<string> | null;
  /** repositorySha change (null side = not recorded), or null when equal. */
  readonly repositoryShaChanged: ValueChange<string | null> | null;
  /** Feature flags added, removed, or flipped between snapshots. By key. */
  readonly flagsChanged: FlagChange[];
  /** Tools (by name) present only in `b`. Sorted by name. */
  readonly toolsAdded: SnapshotToolEntry[];
  /** Tools (by name) present only in `a`. Sorted by name. */
  readonly toolsRemoved: SnapshotToolEntry[];
  /** True when no differences were found across all dimensions. */
  readonly identical: boolean;
}

/** Model identity string: "model" or "model@modelVersion". */
export function formatModelIdentity(s: {
  readonly model: string;
  readonly modelVersion?: string;
}): string {
  return s.modelVersion !== undefined && s.modelVersion.length > 0
    ? `${s.model}@${s.modelVersion}`
    : s.model;
}

function byKey<T>(
  items: readonly T[] | undefined,
  key: (item: T) => string
): Map<string, T> {
  const map = new Map<string, T>();
  for (const item of items ?? []) {
    map.set(key(item), item);
  }
  return map;
}

function sortedKeys(...maps: readonly Map<string, unknown>[]): string[] {
  const keys = new Set<string>();
  for (const map of maps) {
    for (const key of map.keys()) keys.add(key);
  }
  return [...keys].sort();
}

/**
 * Structured diff between two snapshots, `a` (baseline) → `b` (candidate).
 * Deterministic: all lists sorted by slug/key/name. Packages are identified
 * by slug; a version or contentHash difference under the same slug is a
 * change (a hash change with an unchanged version indicates content edited
 * in place — still reported). Tools are identified by name only.
 */
export function diffSnapshots(a: SnapshotLike, b: SnapshotLike): SnapshotDiff {
  // Packages
  const aPackages = byKey(a.packages, (p) => p.slug);
  const bPackages = byKey(b.packages, (p) => p.slug);
  const packagesAdded: SnapshotPackageEntry[] = [];
  const packagesRemoved: SnapshotPackageEntry[] = [];
  const packagesChanged: PackageChange[] = [];
  for (const slug of sortedKeys(aPackages, bPackages)) {
    const inA = aPackages.get(slug);
    const inB = bPackages.get(slug);
    if (inA === undefined && inB !== undefined) {
      packagesAdded.push(inB);
    } else if (inA !== undefined && inB === undefined) {
      packagesRemoved.push(inA);
    } else if (inA !== undefined && inB !== undefined) {
      const changed =
        inA.version !== inB.version || inA.contentHash !== inB.contentHash;
      if (changed) {
        packagesChanged.push({
          slug,
          from: { version: inA.version, contentHash: inA.contentHash },
          to: { version: inB.version, contentHash: inB.contentHash },
        });
      }
    }
  }

  // Model
  const aModel = formatModelIdentity(a);
  const bModel = formatModelIdentity(b);
  const modelChanged: ValueChange<string> | null =
    aModel === bModel ? null : { from: aModel, to: bModel };

  // Repository SHA
  const aSha = a.repositorySha ?? null;
  const bSha = b.repositorySha ?? null;
  const repositoryShaChanged: ValueChange<string | null> | null =
    aSha === bSha ? null : { from: aSha, to: bSha };

  // Feature flags
  const aFlags = byKey(a.featureFlags, (f) => f.key);
  const bFlags = byKey(b.featureFlags, (f) => f.key);
  const flagsChanged: FlagChange[] = [];
  for (const key of sortedKeys(aFlags, bFlags)) {
    const from = aFlags.get(key)?.enabled ?? null;
    const to = bFlags.get(key)?.enabled ?? null;
    if (from !== to) {
      flagsChanged.push({ key, from, to });
    }
  }

  // Tools
  const aTools = byKey(a.tools, (t) => t.name);
  const bTools = byKey(b.tools, (t) => t.name);
  const toolsAdded: SnapshotToolEntry[] = [];
  const toolsRemoved: SnapshotToolEntry[] = [];
  for (const name of sortedKeys(aTools, bTools)) {
    const inA = aTools.has(name);
    const inB = bTools.has(name);
    if (!inA && inB) toolsAdded.push(bTools.get(name) as SnapshotToolEntry);
    if (inA && !inB) toolsRemoved.push(aTools.get(name) as SnapshotToolEntry);
  }

  const identical =
    packagesAdded.length === 0 &&
    packagesRemoved.length === 0 &&
    packagesChanged.length === 0 &&
    modelChanged === null &&
    repositoryShaChanged === null &&
    flagsChanged.length === 0 &&
    toolsAdded.length === 0 &&
    toolsRemoved.length === 0;

  return {
    packagesAdded,
    packagesRemoved,
    packagesChanged,
    modelChanged,
    repositoryShaChanged,
    flagsChanged,
    toolsAdded,
    toolsRemoved,
    identical,
  };
}

// ---------------------------------------------------------------------------
// Export normalization + hashable envelope
// ---------------------------------------------------------------------------

/**
 * Deep-copy a JSON-compatible value with every object's keys sorted
 * alphabetically and undefined-valued keys dropped. Because JS objects
 * preserve string-key insertion order, JSON.stringify over the result is
 * deterministic regardless of the property insertion order of the input.
 */
function deepSortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(deepSortKeys);
  }
  if (typeof value === "object" && value !== null) {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      const entry = (value as Record<string, unknown>)[key];
      if (entry !== undefined) {
        sorted[key] = deepSortKeys(entry);
      }
    }
    return sorted;
  }
  return value;
}

/** Fields stripped from exports: Convex system fields and any "_"-prefix. */
function isSystemField(key: string): boolean {
  return key.startsWith("_");
}

/**
 * Normalize a snapshot for export/reproduction:
 * - Convex system fields (_id, _creationTime, any "_" prefix) stripped
 * - undefined-valued fields dropped
 * - all object keys sorted alphabetically (deeply)
 * - packages sorted by slug then version, tools by name, flags by key
 *
 * The result is a stable, JSON-serializable object: serializing it twice —
 * or serializing two normalizations of the same logical snapshot built in
 * different property orders — yields byte-identical JSON.
 */
export function normalizeSnapshotForExport(
  snapshot: SnapshotLike
): Record<string, unknown> {
  const source = snapshot as unknown as Record<string, unknown>;
  const surface: Record<string, unknown> = {};
  for (const key of Object.keys(source)) {
    if (!isSystemField(key) && source[key] !== undefined) {
      surface[key] = source[key];
    }
  }

  surface.packages = [...snapshot.packages].sort(
    (a, b) =>
      a.slug.localeCompare(b.slug) || a.version.localeCompare(b.version)
  );
  if (snapshot.tools !== undefined) {
    surface.tools = [...snapshot.tools].sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  }
  if (snapshot.featureFlags !== undefined) {
    surface.featureFlags = [...snapshot.featureFlags].sort((a, b) =>
      a.key.localeCompare(b.key)
    );
  }

  return deepSortKeys(surface) as Record<string, unknown>;
}

/** Envelope schema marker; bump when the envelope layout changes. */
export const CBOM_ENVELOPE_SCHEMA = "cbom/v1";

/**
 * Deterministic JSON string of the normalized snapshot wrapped in a
 * versioned envelope — the stable byte sequence a future signing step
 * hashes. Same logical snapshot in, same string out, always.
 */
export function hashableEnvelope(snapshot: SnapshotLike): string {
  return JSON.stringify({
    schema: CBOM_ENVELOPE_SCHEMA,
    snapshot: normalizeSnapshotForExport(snapshot),
  });
}
