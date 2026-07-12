/**
 * Context manifest / lock / installation pure logic (Software Factory Epic 3).
 *
 * Pure functions only — no Convex imports — so registry-snapshot mapping,
 * installation reconciliation, and hash validation are unit testable and
 * reusable from queries, mutations, and the CLI.
 *
 * The registry snapshot maps contextPackageVersions rows into the
 * `AvailablePackage` shape @mission-control/context-tools' resolver expects:
 * { slug, version, contentHash, sourceCommitSha, dependencies: Record }.
 * Version rows store dependencies as an array of { slug, range } objects
 * (Convex validators cannot express Record with dynamic keys); the resolver
 * wants a record, so dependenciesToRecord converts between the two.
 */

export interface VersionDependency {
  readonly slug: string;
  readonly range: string;
}

/** Subset of a contextPackageVersions row the snapshot mapping needs. */
export interface SnapshotVersionRow {
  readonly version: string;
  readonly contentHash?: string;
  readonly sourceCommitSha?: string;
  readonly dependencies?: readonly VersionDependency[];
}

/** AvailablePackage shape consumed by context-tools' resolver. */
export interface AvailablePackageShape {
  readonly slug: string;
  readonly version: string;
  readonly contentHash: string;
  readonly sourceCommitSha: string;
  readonly dependencies: Record<string, string>;
}

/** Placeholder when a published version has no recorded provenance commit. */
export const UNKNOWN_COMMIT_SHA = "unknown";

/**
 * Convert a version row's dependencies array to the record shape the
 * resolver expects. Duplicate slugs keep the last entry (arrays are
 * caller-authored; duplicates indicate a bad write, not a merge intent).
 */
export function dependenciesToRecord(
  dependencies: readonly VersionDependency[] | undefined
): Record<string, string> {
  const record: Record<string, string> = {};
  for (const dep of dependencies ?? []) {
    record[dep.slug] = dep.range;
  }
  return record;
}

/**
 * Map one published version row to the resolver's AvailablePackage shape.
 * Returns null when the row has no contentHash — a lock entry cannot be
 * produced without one, so such rows are excluded from the snapshot.
 */
export function toAvailablePackage(
  slug: string,
  row: SnapshotVersionRow
): AvailablePackageShape | null {
  if (row.contentHash === undefined || row.contentHash.length === 0) {
    return null;
  }
  return {
    slug,
    version: row.version,
    contentHash: row.contentHash,
    sourceCommitSha:
      row.sourceCommitSha !== undefined && row.sourceCommitSha.length > 0
        ? row.sourceCommitSha
        : UNKNOWN_COMMIT_SHA,
    dependencies: dependenciesToRecord(row.dependencies),
  };
}

// ---------------------------------------------------------------------------
// Manifest hash
// ---------------------------------------------------------------------------

/** Manifest hash: "sha256:" followed by 64 lowercase hex chars. */
const MANIFEST_HASH_PATTERN = /^sha256:[0-9a-f]{64}$/;

export function isValidManifestHash(hash: string): boolean {
  return MANIFEST_HASH_PATTERN.test(hash);
}

// ---------------------------------------------------------------------------
// Installation reconciliation
// ---------------------------------------------------------------------------

export type InstallationState =
  | "INSTALLED"
  | "STALE"
  | "MISSING"
  | "INCOMPATIBLE";

export interface InstallationEntry {
  readonly packageSlug: string;
  readonly version: string;
  readonly contentHash: string;
  readonly state: InstallationState;
}

/** Subset of an existing contextInstallations row reconciliation needs. */
export interface ExistingInstallation<Id = string> {
  readonly _id: Id;
  readonly packageSlug: string;
  readonly version: string;
  readonly contentHash: string;
  readonly state: InstallationState;
}

export interface InstallationUpdate<Id = string> {
  readonly id: Id;
  readonly entry: InstallationEntry;
}

export interface InstallationDiff<Id = string> {
  /** Desired entries with no existing row — insert. */
  readonly creates: InstallationEntry[];
  /** Existing rows whose version/contentHash/state changed — patch. */
  readonly updates: InstallationUpdate<Id>[];
  /** Existing row ids absent from the desired set — delete. */
  readonly deletes: Id[];
  /** Rows already matching the desired entry — no write needed. */
  readonly unchanged: Id[];
}

/**
 * Compute the reconciliation between existing installation rows and the
 * desired entry set for one repository. Deterministic: outputs are sorted
 * by packageSlug. Duplicate packageSlugs in `desired` keep the last entry;
 * duplicate existing rows for one slug (should not happen — by_repo_package
 * is treated as unique) keep the first row and delete the rest.
 */
export function diffInstallations<Id>(
  existing: readonly ExistingInstallation<Id>[],
  desired: readonly InstallationEntry[]
): InstallationDiff<Id> {
  const desiredBySlug = new Map<string, InstallationEntry>();
  for (const entry of desired) {
    desiredBySlug.set(entry.packageSlug, entry);
  }

  const existingBySlug = new Map<string, ExistingInstallation<Id>>();
  const duplicateIds: Id[] = [];
  for (const row of existing) {
    if (existingBySlug.has(row.packageSlug)) {
      duplicateIds.push(row._id);
    } else {
      existingBySlug.set(row.packageSlug, row);
    }
  }

  const creates: InstallationEntry[] = [];
  const updates: InstallationUpdate<Id>[] = [];
  const deletes: Id[] = [...duplicateIds];
  const unchanged: Id[] = [];

  for (const slug of [...desiredBySlug.keys()].sort()) {
    const entry = desiredBySlug.get(slug) as InstallationEntry;
    const row = existingBySlug.get(slug);
    if (row === undefined) {
      creates.push(entry);
      continue;
    }
    const changed =
      row.version !== entry.version ||
      row.contentHash !== entry.contentHash ||
      row.state !== entry.state;
    if (changed) {
      updates.push({ id: row._id, entry });
    } else {
      unchanged.push(row._id);
    }
  }

  for (const slug of [...existingBySlug.keys()].sort()) {
    if (!desiredBySlug.has(slug)) {
      deletes.push((existingBySlug.get(slug) as ExistingInstallation<Id>)._id);
    }
  }

  return { creates, updates, deletes, unchanged };
}

// ---------------------------------------------------------------------------
// Outdated detection (registry snapshot vs locked installations)
// ---------------------------------------------------------------------------

/** Highest published semver per package slug. */
export type LatestVersionIndex = Readonly<Record<string, string>>;

export interface VersionedSlug {
  readonly slug: string;
  readonly version: string;
}

/**
 * Build a slug → highest-version index from a registry snapshot.
 * `compare` must return -1 | 0 | 1 (see contextPackages.compareSemver).
 */
export function indexLatestVersions(
  packages: readonly VersionedSlug[],
  compare: (a: string, b: string) => -1 | 0 | 1
): LatestVersionIndex {
  const index: Record<string, string> = {};
  for (const pkg of packages) {
    const current = index[pkg.slug];
    if (current === undefined || compare(pkg.version, current) > 0) {
      index[pkg.slug] = pkg.version;
    }
  }
  return index;
}

export interface EnrichedInstallation {
  readonly repoSlug: string;
  readonly packageSlug: string;
  readonly version: string;
  readonly contentHash: string;
  readonly state: InstallationState;
  readonly latestVersion: string | null;
  readonly isOutdated: boolean;
}

/** Compare one installation row against the latest published registry version. */
export function enrichInstallation(
  row: InstallationEntry & { repoSlug: string },
  latestBySlug: LatestVersionIndex,
  compare: (a: string, b: string) => -1 | 0 | 1
): EnrichedInstallation {
  const latestVersion = latestBySlug[row.packageSlug] ?? null;
  const isOutdated =
    latestVersion !== null && compare(latestVersion, row.version) > 0;
  return {
    repoSlug: row.repoSlug,
    packageSlug: row.packageSlug,
    version: row.version,
    contentHash: row.contentHash,
    state: row.state,
    latestVersion,
    isOutdated,
  };
}

export interface RepoInstallationSummary {
  readonly repoSlug: string;
  readonly total: number;
  readonly installed: number;
  readonly stale: number;
  readonly missing: number;
  readonly incompatible: number;
  readonly outdated: number;
}

/** Aggregate installation rows for one repository. */
export function summarizeRepoInstallations(
  rows: readonly EnrichedInstallation[]
): RepoInstallationSummary {
  const repoSlug = rows[0]?.repoSlug ?? "";
  let installed = 0;
  let stale = 0;
  let missing = 0;
  let incompatible = 0;
  let outdated = 0;
  for (const row of rows) {
    switch (row.state) {
      case "INSTALLED":
        installed++;
        break;
      case "STALE":
        stale++;
        break;
      case "MISSING":
        missing++;
        break;
      case "INCOMPATIBLE":
        incompatible++;
        break;
      default: {
        const _exhaustive: never = row.state;
        void _exhaustive;
      }
    }
    if (row.isOutdated) outdated++;
  }
  return {
    repoSlug,
    total: rows.length,
    installed,
    stale,
    missing,
    incompatible,
    outdated,
  };
}
