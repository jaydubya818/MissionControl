/**
 * Context manifests, locks, and installation state (Software Factory Epic 3).
 *
 * Persists per-repository mc-context.json / mc-context.lock contents and the
 * reconciled installation rows the `mc context` CLI pushes after resolution.
 * Pure mapping/reconciliation logic lives in lib/contextManifests.ts (unit
 * tested — no Convex runtime).
 *
 * All mutations are gated behind the `context.registry` feature flag and
 * audited via the `activities` log (CONTEXT_MANIFEST_SAVED /
 * CONTEXT_LOCK_SAVED / CONTEXT_INSTALLATIONS_SYNCED). Queries are open —
 * reads are harmless before the registry launches.
 *
 * repoSlug is a plain "owner/repo" string for now; the repositories table
 * (and v.id references) arrive in a later PR.
 */

import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { requireContextRegistryEnabled } from "../lib/contextRegistryGate";
import { compareSemver } from "../lib/contextPackages";
import {
  diffInstallations,
  enrichInstallation,
  indexLatestVersions,
  isValidManifestHash,
  summarizeRepoInstallations,
  toAvailablePackage,
  type AvailablePackageShape,
  type EnrichedInstallation,
  type InstallationEntry,
  type RepoInstallationSummary,
} from "../lib/contextManifests";

const installationStateArg = v.union(
  v.literal("INSTALLED"),
  v.literal("STALE"),
  v.literal("MISSING"),
  v.literal("INCOMPATIBLE")
);

async function insertAudit(
  ctx: { db: any },
  entry: {
    actorId?: string;
    action: string;
    description: string;
    targetType: string;
    targetId: string;
    beforeState?: unknown;
    afterState?: unknown;
  }
): Promise<void> {
  await ctx.db.insert("activities", {
    actorType: "HUMAN",
    actorId: entry.actorId,
    action: entry.action,
    description: entry.description,
    targetType: entry.targetType,
    targetId: entry.targetId,
    beforeState: entry.beforeState,
    afterState: entry.afterState,
  });
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export const getManifest = query({
  args: { repoSlug: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("contextManifests")
      .withIndex("by_repo", (q) => q.eq("repoSlug", args.repoSlug))
      .unique();
  },
});

export const getLock = query({
  args: { repoSlug: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("contextLocks")
      .withIndex("by_repo", (q) => q.eq("repoSlug", args.repoSlug))
      .unique();
  },
});

export const listInstallations = query({
  args: { repoSlug: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("contextInstallations")
      .withIndex("by_repo", (q) => q.eq("repoSlug", args.repoSlug))
      .collect();
    return rows.sort((a, b) => a.packageSlug.localeCompare(b.packageSlug));
  },
});

export const listInstallationsByPackage = query({
  args: { packageSlug: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("contextInstallations")
      .withIndex("by_package", (q) => q.eq("packageSlug", args.packageSlug))
      .collect();
    return rows.sort((a, b) => a.repoSlug.localeCompare(b.repoSlug));
  },
});

async function latestPublishedBySlug(
  ctx: { db: any }
): Promise<Record<string, string>> {
  const packages = await ctx.db.query("contextPackages").collect();
  const versioned: { slug: string; version: string }[] = [];
  for (const pkg of packages) {
    const versions = await ctx.db
      .query("contextPackageVersions")
      .withIndex("by_package", (q: any) => q.eq("packageId", pkg._id))
      .collect();
    for (const row of versions) {
      if (row.status === "PUBLISHED" && row.contentHash) {
        versioned.push({ slug: pkg.slug, version: row.version });
      }
    }
  }
  return indexLatestVersions(versioned, compareSemver);
}

async function buildInstallationOverview(
  ctx: { db: any },
  filter?: { repoSlug?: string; outdatedOnly?: boolean }
): Promise<EnrichedInstallation[]> {
  const latestBySlug = await latestPublishedBySlug(ctx);
  let rows = await ctx.db.query("contextInstallations").collect();
  if (filter?.repoSlug !== undefined) {
    rows = rows.filter((r: { repoSlug: string }) => r.repoSlug === filter.repoSlug);
  }

  const enriched = rows
    .map((row: {
      repoSlug: string;
      packageSlug: string;
      version: string;
      contentHash: string;
      state: InstallationEntry["state"];
    }) =>
      enrichInstallation(
        {
          repoSlug: row.repoSlug,
          packageSlug: row.packageSlug,
          version: row.version,
          contentHash: row.contentHash,
          state: row.state,
        },
        latestBySlug,
        compareSemver
      )
    )
    .sort(
      (a: EnrichedInstallation, b: EnrichedInstallation) =>
        a.repoSlug.localeCompare(b.repoSlug) ||
        a.packageSlug.localeCompare(b.packageSlug)
    );

  if (filter?.outdatedOnly) {
    return enriched.filter(
      (row: EnrichedInstallation) => row.isOutdated || row.state !== "INSTALLED"
    );
  }
  return enriched;
}

/**
 * All installation rows enriched with latest registry version and an
 * outdated flag. Powers the Installations tab in the Registry UI.
 */
export const listInstallationOverview = query({
  args: {
    repoSlug: v.optional(v.string()),
    outdatedOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<EnrichedInstallation[]> => {
    return await buildInstallationOverview(ctx, {
      repoSlug: args.repoSlug,
      outdatedOnly: args.outdatedOnly,
    });
  },
});

/** Per-repository rollups for the Installations dashboard. */
export const listRepoSummaries = query({
  args: {},
  handler: async (ctx): Promise<RepoInstallationSummary[]> => {
    const overview = await buildInstallationOverview(ctx);
    const byRepo = new Map<string, EnrichedInstallation[]>();
    for (const row of overview) {
      const list = byRepo.get(row.repoSlug);
      if (list === undefined) {
        byRepo.set(row.repoSlug, [row]);
      } else {
        list.push(row);
      }
    }
    return [...byRepo.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, rows]) => summarizeRepoInstallations(rows));
  },
});

/**
 * Registry snapshot for CLI-side resolution: every PUBLISHED version of
 * every ACTIVE or DRAFT package, in context-tools' AvailablePackage shape.
 * Versions without a contentHash are excluded (they cannot be locked).
 */
export const registrySnapshot = query({
  args: {},
  handler: async (ctx): Promise<AvailablePackageShape[]> => {
    const packages = await ctx.db.query("contextPackages").collect();
    const snapshot: AvailablePackageShape[] = [];
    for (const pkg of packages) {
      if (pkg.status !== "ACTIVE" && pkg.status !== "DRAFT") continue;
      const versions = await ctx.db
        .query("contextPackageVersions")
        .withIndex("by_package", (q) => q.eq("packageId", pkg._id))
        .collect();
      for (const row of versions) {
        if (row.status !== "PUBLISHED") continue;
        const available = toAvailablePackage(pkg.slug, row);
        if (available !== null) snapshot.push(available);
      }
    }
    return snapshot.sort(
      (a, b) =>
        a.slug.localeCompare(b.slug) || a.version.localeCompare(b.version)
    );
  },
});

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export const saveManifest = mutation({
  args: {
    repoSlug: v.string(),
    manifestJson: v.string(),
    actorId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireContextRegistryEnabled(ctx);

    // Full structural validation happens client-side in context-tools;
    // reject non-JSON and extract schemaVersion here.
    let parsed: unknown;
    try {
      parsed = JSON.parse(args.manifestJson);
    } catch {
      throw new Error("manifestJson is not valid JSON");
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error("manifestJson must be a JSON object");
    }
    const schemaVersion = (parsed as Record<string, unknown>).schemaVersion;
    if (typeof schemaVersion !== "string" || schemaVersion.length === 0) {
      throw new Error('manifestJson must declare a string "schemaVersion"');
    }

    const now = Date.now();
    const existing = await ctx.db
      .query("contextManifests")
      .withIndex("by_repo", (q) => q.eq("repoSlug", args.repoSlug))
      .unique();

    let manifestId;
    if (existing) {
      await ctx.db.patch(existing._id, {
        manifestJson: args.manifestJson,
        schemaVersion,
        updatedBy: args.actorId,
        updatedAt: now,
      });
      manifestId = existing._id;
    } else {
      manifestId = await ctx.db.insert("contextManifests", {
        repoSlug: args.repoSlug,
        manifestJson: args.manifestJson,
        schemaVersion,
        updatedBy: args.actorId,
        createdAt: now,
        updatedAt: now,
      });
    }

    await insertAudit(ctx, {
      actorId: args.actorId,
      action: "CONTEXT_MANIFEST_SAVED",
      description: `Context manifest for "${args.repoSlug}" saved`,
      targetType: "contextManifest",
      targetId: manifestId,
      afterState: { repoSlug: args.repoSlug, schemaVersion },
    });

    return manifestId;
  },
});

export const saveLock = mutation({
  args: {
    repoSlug: v.string(),
    lockJson: v.string(),
    manifestHash: v.string(),
    resolvedCount: v.number(),
    actorId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireContextRegistryEnabled(ctx);

    if (!isValidManifestHash(args.manifestHash)) {
      throw new Error(
        `Invalid manifestHash "${args.manifestHash}" — expected "sha256:" + 64 lowercase hex chars`
      );
    }
    if (!Number.isInteger(args.resolvedCount) || args.resolvedCount < 0) {
      throw new Error("resolvedCount must be a non-negative integer");
    }
    try {
      JSON.parse(args.lockJson);
    } catch {
      throw new Error("lockJson is not valid JSON");
    }

    const now = Date.now();
    const existing = await ctx.db
      .query("contextLocks")
      .withIndex("by_repo", (q) => q.eq("repoSlug", args.repoSlug))
      .unique();

    let lockId;
    if (existing) {
      await ctx.db.patch(existing._id, {
        lockJson: args.lockJson,
        manifestHash: args.manifestHash,
        resolvedCount: args.resolvedCount,
        createdAt: now,
      });
      lockId = existing._id;
    } else {
      lockId = await ctx.db.insert("contextLocks", {
        repoSlug: args.repoSlug,
        lockJson: args.lockJson,
        manifestHash: args.manifestHash,
        resolvedCount: args.resolvedCount,
        createdAt: now,
      });
    }

    await insertAudit(ctx, {
      actorId: args.actorId,
      action: "CONTEXT_LOCK_SAVED",
      description: `Context lock for "${args.repoSlug}" saved (${args.resolvedCount} package(s))`,
      targetType: "contextLock",
      targetId: lockId,
      afterState: {
        repoSlug: args.repoSlug,
        manifestHash: args.manifestHash,
        resolvedCount: args.resolvedCount,
      },
    });

    return lockId;
  },
});

export const syncInstallations = mutation({
  args: {
    repoSlug: v.string(),
    entries: v.array(
      v.object({
        packageSlug: v.string(),
        version: v.string(),
        contentHash: v.string(),
        state: installationStateArg,
      })
    ),
    actorId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireContextRegistryEnabled(ctx);

    const existing = await ctx.db
      .query("contextInstallations")
      .withIndex("by_repo", (q) => q.eq("repoSlug", args.repoSlug))
      .collect();

    const diff = diffInstallations(existing, args.entries as InstallationEntry[]);
    const now = Date.now();

    for (const entry of diff.creates) {
      await ctx.db.insert("contextInstallations", {
        repoSlug: args.repoSlug,
        packageSlug: entry.packageSlug,
        versionId: await findVersionId(ctx, entry.packageSlug, entry.version),
        version: entry.version,
        contentHash: entry.contentHash,
        state: entry.state,
        createdAt: now,
        updatedAt: now,
      });
    }
    for (const { id, entry } of diff.updates) {
      await ctx.db.patch(id, {
        versionId: await findVersionId(ctx, entry.packageSlug, entry.version),
        version: entry.version,
        contentHash: entry.contentHash,
        state: entry.state,
        updatedAt: now,
      });
    }
    for (const id of diff.deletes) {
      await ctx.db.delete(id);
    }

    const counts = {
      created: diff.creates.length,
      updated: diff.updates.length,
      deleted: diff.deletes.length,
      unchanged: diff.unchanged.length,
    };

    await insertAudit(ctx, {
      actorId: args.actorId,
      action: "CONTEXT_INSTALLATIONS_SYNCED",
      description:
        `Context installations for "${args.repoSlug}" synced — ` +
        `${counts.created} created, ${counts.updated} updated, ${counts.deleted} deleted`,
      targetType: "contextInstallationSync",
      targetId: args.repoSlug,
      afterState: counts,
    });

    return counts;
  },
});

/** Registry version row id for (slug, version), when one exists. */
async function findVersionId(
  ctx: { db: any },
  packageSlug: string,
  version: string
): Promise<any | undefined> {
  const pkg = await ctx.db
    .query("contextPackages")
    .withIndex("by_slug", (q: any) => q.eq("slug", packageSlug))
    .unique();
  if (!pkg) return undefined;
  const row = await ctx.db
    .query("contextPackageVersions")
    .withIndex("by_package_version", (q: any) =>
      q.eq("packageId", pkg._id).eq("version", version)
    )
    .unique();
  return row?._id;
}
