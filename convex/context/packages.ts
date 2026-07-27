/**
 * Context Package Registry — CRUD surface (Software Factory Epic 1).
 *
 * Identity lives in `contextPackages`; immutable releases live in
 * `contextPackageVersions`. Validation and lifecycle rules are pure
 * functions in lib/contextPackages.ts (unit tested — no Convex runtime).
 *
 * All mutations are gated behind the `context.registry` feature flag and
 * audited via the `activities` log (CONTEXT_PACKAGE_* / CONTEXT_VERSION_*).
 *
 * Immutability contract: once a version row is PUBLISHED it is never
 * patched again, with one exception — deprecateVersion, which touches only
 * `status` and `deprecatedAt`. publishVersion rejects rows that are not
 * DRAFT, so a version can never be published twice, and no other mutation
 * in this module patches published rows.
 */

import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { requireContextRegistryEnabled } from "../lib/contextRegistryGate";
import {
  canTransitionPackageStatus,
  canTransitionVersionStatus,
  compareSemver,
  isValidContentHash,
  isValidPackageSlug,
  isValidSemver,
  type ContextPackageStatus,
} from "../lib/contextPackages";

const contextPackageTypeArg = v.union(
  v.literal("SKILL"),
  v.literal("RULES"),
  v.literal("DOCUMENTATION"),
  v.literal("SOUL"),
  v.literal("WORKFLOW"),
  v.literal("TOOL_GUIDE"),
  v.literal("PROMPT_TEMPLATE"),
  v.literal("POLICY"),
  v.literal("ARCHITECTURE_GUIDE"),
  v.literal("EVALUATION_GUIDE")
);

const contextPackageStatusArg = v.union(
  v.literal("DRAFT"),
  v.literal("ACTIVE"),
  v.literal("DEPRECATED")
);

const riskLevelArg = v.union(
  v.literal("GREEN"),
  v.literal("YELLOW"),
  v.literal("RED")
);

/** Minimum structural review score required to publish SKILL packages. */
export const MIN_PUBLISH_QUALITY_SCORE = 50;

const reviewAxesArg = v.object({
  validation: v.number(),
  implementation: v.number(),
  activation: v.number(),
});

async function insertAudit(
  ctx: { db: any },
  entry: {
    projectId?: string;
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
    projectId: entry.projectId,
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

export const get = query({
  args: { packageId: v.id("contextPackages") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.packageId);
  },
});

export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("contextPackages")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
  },
});

export const list = query({
  args: {
    type: v.optional(contextPackageTypeArg),
    status: v.optional(contextPackageStatusArg),
    owner: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Use the most selective available index, then filter the rest in memory.
    let rows;
    if (args.type !== undefined) {
      rows = await ctx.db
        .query("contextPackages")
        .withIndex("by_type", (q) => q.eq("type", args.type!))
        .collect();
    } else if (args.status !== undefined) {
      rows = await ctx.db
        .query("contextPackages")
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .collect();
    } else if (args.owner !== undefined) {
      rows = await ctx.db
        .query("contextPackages")
        .withIndex("by_owner", (q) => q.eq("owner", args.owner!))
        .collect();
    } else {
      rows = await ctx.db.query("contextPackages").collect();
    }

    return rows.filter(
      (row) =>
        (args.type === undefined || row.type === args.type) &&
        (args.status === undefined || row.status === args.status) &&
        (args.owner === undefined || row.owner === args.owner)
    );
  },
});

export const listVersions = query({
  args: { packageId: v.id("contextPackages") },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("contextPackageVersions")
      .withIndex("by_package", (q) => q.eq("packageId", args.packageId))
      .collect();
    // Newest release first
    return rows.sort((a, b) => compareSemver(b.version, a.version));
  },
});

export const getVersion = query({
  args: { versionId: v.id("contextPackageVersions") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.versionId);
  },
});

/** Package + current version detail for the Registry detail view. */
export const getDetail = query({
  args: { packageId: v.id("contextPackages") },
  handler: async (ctx, args) => {
    const pkg = await ctx.db.get(args.packageId);
    if (!pkg) return null;

    let version = pkg.currentVersionId
      ? await ctx.db.get(pkg.currentVersionId)
      : null;
    if (!version) {
      const versions = await ctx.db
        .query("contextPackageVersions")
        .withIndex("by_package", (q) => q.eq("packageId", pkg._id))
        .collect();
      version =
        versions.sort((a, b) => compareSemver(b.version, a.version))[0] ?? null;
    }

    const runs = await ctx.db
      .query("contextEvalRuns")
      .withIndex("by_package", (q) => q.eq("packageId", pkg._id))
      .collect();
    runs.sort((a, b) => b.createdAt - a.createdAt);
    const latestRun = runs.find((r) => r.status === "COMPLETED") ?? runs[0] ?? null;

    const scenarios = await ctx.db
      .query("contextEvalScenarios")
      .withIndex("by_package", (q) => q.eq("packageId", pkg._id))
      .collect();

    return {
      package: pkg,
      version,
      latestRun,
      scenarioCount: scenarios.filter((s) => s.active).length,
    };
  },
});

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/**
 * Registry listing: packages joined with their current (or latest) version's
 * score/security fields. Powers the Registry UI.
 */
export const listWithCurrentVersions = query({
  args: {
    type: v.optional(contextPackageTypeArg),
    status: v.optional(contextPackageStatusArg),
  },
  handler: async (ctx, args) => {
    let rows = await ctx.db.query("contextPackages").collect();
    if (args.type) rows = rows.filter((r: any) => r.type === args.type);
    if (args.status) rows = rows.filter((r: any) => r.status === args.status);

    const result = [];
    for (const pkg of rows as any[]) {
      let version: any = pkg.currentVersionId
        ? await ctx.db.get(pkg.currentVersionId)
        : null;
      if (!version) {
        const versions = await ctx.db
          .query("contextPackageVersions")
          .withIndex("by_package", (q: any) => q.eq("packageId", pkg._id))
          .collect();
        version = versions.sort((a: any, b: any) => b.createdAt - a.createdAt)[0] ?? null;
      }

      const runs = await ctx.db
        .query("contextEvalRuns")
        .withIndex("by_package", (q: any) => q.eq("packageId", pkg._id))
        .collect();
      const latestRun =
        runs
          .filter((r: any) => r.status === "COMPLETED")
          .sort((a: any, b: any) => b.createdAt - a.createdAt)[0] ?? null;

      const scenarios = await ctx.db
        .query("contextEvalScenarios")
        .withIndex("by_package", (q: any) => q.eq("packageId", pkg._id))
        .collect();
      const activeScenarioCount = scenarios.filter((s: any) => s.active).length;

      result.push({
        _id: pkg._id,
        slug: pkg.slug,
        name: pkg.name,
        displayName: pkg.displayName,
        description: pkg.description,
        type: pkg.type,
        status: pkg.status,
        owner: pkg.owner,
        tags: pkg.tags ?? [],
        riskLevel: pkg.riskLevel,
        version: version?.version ?? null,
        versionStatus: version?.status ?? null,
        qualityScore: version?.qualityScore ?? null,
        reviewAxes: version?.reviewAxes ?? null,
        impactScore: latestRun?.impactScore ?? version?.impactScore ?? null,
        securityStatus: version?.securityStatus ?? null,
        sourceRepo: version?.sourceRepo ?? null,
        updatedAt: pkg.updatedAt,
        scenarioCount: activeScenarioCount,
        evalRunStatus: latestRun?.status ?? null,
        baselineScore: latestRun?.baselineScore ?? null,
        candidateScore: latestRun?.candidateScore ?? null,
        impactDelta: latestRun?.impactDelta ?? null,
        evalCompletedAt: latestRun?.completedAt ?? null,
        hasEvalData: latestRun?.status === "COMPLETED",
      });
    }
    return result.sort(
      (a: any, b: any) => (b.qualityScore ?? -1) - (a.qualityScore ?? -1)
    );
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    slug: v.string(),
    displayName: v.optional(v.string()),
    description: v.string(),
    type: contextPackageTypeArg,
    owner: v.string(),
    tags: v.optional(v.array(v.string())),
    riskLevel: riskLevelArg,
    projectId: v.optional(v.id("projects")),
    tenantId: v.optional(v.id("tenants")),
    actorId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireContextRegistryEnabled(ctx, args.projectId);

    if (!isValidPackageSlug(args.slug)) {
      throw new Error(
        `Invalid package slug "${args.slug}" — expected "scope/name" with lowercase alphanumeric segments, e.g. "anthropic/skill-creator"`
      );
    }

    const existing = await ctx.db
      .query("contextPackages")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    if (existing) {
      throw new Error(`Package slug "${args.slug}" already exists`);
    }

    const now = Date.now();
    const packageId = await ctx.db.insert("contextPackages", {
      name: args.name,
      slug: args.slug,
      displayName: args.displayName,
      description: args.description,
      type: args.type,
      status: "DRAFT",
      owner: args.owner,
      tags: args.tags,
      riskLevel: args.riskLevel,
      projectId: args.projectId,
      tenantId: args.tenantId,
      createdAt: now,
      updatedAt: now,
    });

    await insertAudit(ctx, {
      projectId: args.projectId,
      actorId: args.actorId,
      action: "CONTEXT_PACKAGE_CREATED",
      description: `Context package "${args.slug}" (${args.type}) created`,
      targetType: "contextPackage",
      targetId: packageId,
      afterState: { slug: args.slug, type: args.type, status: "DRAFT" },
    });

    return packageId;
  },
});

export const update = mutation({
  args: {
    packageId: v.id("contextPackages"),
    description: v.optional(v.string()),
    displayName: v.optional(v.string()),
    owner: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    status: v.optional(contextPackageStatusArg),
    replacementPackageId: v.optional(v.id("contextPackages")),
    actorId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.packageId);
    if (!existing) {
      throw new Error("Package not found");
    }
    await requireContextRegistryEnabled(ctx, existing.projectId);

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.description !== undefined) patch.description = args.description;
    if (args.displayName !== undefined) patch.displayName = args.displayName;
    if (args.owner !== undefined) patch.owner = args.owner;
    if (args.tags !== undefined) patch.tags = args.tags;

    let deprecated = false;
    if (args.status !== undefined && args.status !== existing.status) {
      if (
        !canTransitionPackageStatus(
          existing.status as ContextPackageStatus,
          args.status
        )
      ) {
        throw new Error(
          `Illegal package status transition ${existing.status} -> ${args.status}`
        );
      }
      patch.status = args.status;
      deprecated = args.status === "DEPRECATED";
      if (deprecated && args.replacementPackageId !== undefined) {
        if (args.replacementPackageId === args.packageId) {
          throw new Error("A package cannot replace itself");
        }
        patch.replacementPackageId = args.replacementPackageId;
      }
    } else if (args.replacementPackageId !== undefined) {
      throw new Error(
        "replacementPackageId may only be set when deprecating the package"
      );
    }

    await ctx.db.patch(args.packageId, patch);

    await insertAudit(ctx, {
      projectId: existing.projectId,
      actorId: args.actorId,
      action: deprecated
        ? "CONTEXT_PACKAGE_DEPRECATED"
        : "CONTEXT_PACKAGE_UPDATED",
      description: deprecated
        ? `Context package "${existing.slug}" deprecated`
        : `Context package "${existing.slug}" updated`,
      targetType: "contextPackage",
      targetId: args.packageId,
      beforeState: { status: existing.status },
      afterState: { status: args.status ?? existing.status },
    });

    return await ctx.db.get(args.packageId);
  },
});

export const createVersion = mutation({
  args: {
    packageId: v.id("contextPackages"),
    version: v.string(),
    contentHash: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
    inlineContent: v.optional(v.string()),
    manifestVersion: v.optional(v.string()),
    sourceRepo: v.optional(v.string()),
    sourcePath: v.optional(v.string()),
    sourceCommitSha: v.optional(v.string()),
    compatibility: v.optional(v.any()),
    capabilities: v.optional(v.array(v.string())),
    dependencies: v.optional(
      v.array(v.object({ slug: v.string(), range: v.string() }))
    ),
    actorId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const pkg = await ctx.db.get(args.packageId);
    if (!pkg) {
      throw new Error("Package not found");
    }
    await requireContextRegistryEnabled(ctx, pkg.projectId);

    if (!isValidSemver(args.version)) {
      throw new Error(
        `Invalid version "${args.version}" — expected numeric semver "x.y.z"`
      );
    }
    if (args.contentHash !== undefined && !isValidContentHash(args.contentHash)) {
      throw new Error(
        `Invalid contentHash "${args.contentHash}" — expected "sha256:" + 64 lowercase hex chars`
      );
    }

    const existingVersions = await ctx.db
      .query("contextPackageVersions")
      .withIndex("by_package", (q) => q.eq("packageId", args.packageId))
      .collect();
    for (const row of existingVersions) {
      if (compareSemver(args.version, row.version) <= 0) {
        throw new Error(
          `Version ${args.version} must be greater than existing version ${row.version} for "${pkg.slug}"`
        );
      }
    }

    const versionId = await ctx.db.insert("contextPackageVersions", {
      packageId: args.packageId,
      version: args.version,
      status: "DRAFT",
      contentHash: args.contentHash,
      storageId: args.storageId,
      inlineContent: args.inlineContent,
      manifestVersion: args.manifestVersion ?? "1.0",
      sourceRepo: args.sourceRepo,
      sourcePath: args.sourcePath,
      sourceCommitSha: args.sourceCommitSha,
      compatibility: args.compatibility,
      capabilities: args.capabilities,
      dependencies: args.dependencies,
      createdAt: Date.now(),
    });

    await insertAudit(ctx, {
      projectId: pkg.projectId,
      actorId: args.actorId,
      action: "CONTEXT_VERSION_CREATED",
      description: `Version ${args.version} of "${pkg.slug}" created (DRAFT)`,
      targetType: "contextPackageVersion",
      targetId: versionId,
      afterState: { version: args.version, status: "DRAFT" },
    });

    return versionId;
  },
});

export const setVersionReview = mutation({
  args: {
    versionId: v.id("contextPackageVersions"),
    qualityScore: v.number(),
    reviewAxes: reviewAxesArg,
    actorId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const version = await ctx.db.get(args.versionId);
    if (!version) {
      throw new Error("Version not found");
    }
    const pkg = await ctx.db.get(version.packageId);
    if (!pkg) {
      throw new Error("Package not found for version");
    }
    await requireContextRegistryEnabled(ctx, pkg.projectId);

    if (version.status !== "DRAFT") {
      throw new Error(
        `Cannot update review on version in status ${version.status} — only DRAFT versions are reviewable`
      );
    }
    if (
      args.qualityScore < 0 ||
      args.qualityScore > 100 ||
      args.reviewAxes.validation < 0 ||
      args.reviewAxes.validation > 100 ||
      args.reviewAxes.implementation < 0 ||
      args.reviewAxes.implementation > 100 ||
      args.reviewAxes.activation < 0 ||
      args.reviewAxes.activation > 100
    ) {
      throw new Error("qualityScore and reviewAxes must be integers in 0–100");
    }

    await ctx.db.patch(args.versionId, {
      qualityScore: Math.round(args.qualityScore),
      reviewAxes: {
        validation: Math.round(args.reviewAxes.validation),
        implementation: Math.round(args.reviewAxes.implementation),
        activation: Math.round(args.reviewAxes.activation),
      },
    });

    await insertAudit(ctx, {
      projectId: pkg.projectId,
      actorId: args.actorId,
      action: "CONTEXT_VERSION_REVIEWED",
      description: `Version ${version.version} of "${pkg.slug}" reviewed (score ${Math.round(args.qualityScore)})`,
      targetType: "contextPackageVersion",
      targetId: args.versionId,
      afterState: {
        qualityScore: Math.round(args.qualityScore),
        reviewAxes: args.reviewAxes,
      },
    });

    return await ctx.db.get(args.versionId);
  },
});

export const publishVersion = mutation({
  args: {
    versionId: v.id("contextPackageVersions"),
    // Caller-computed sha256 for rows created without one (see lib docstring)
    contentHash: v.optional(v.string()),
    approvedBy: v.optional(v.string()),
    // Structural review from the skill linter — required for SKILL packages
    // unless already stored on the DRAFT version row.
    qualityScore: v.optional(v.number()),
    reviewAxes: v.optional(reviewAxesArg),
    /** Override the default minimum score (50) for this publish. */
    minQualityScore: v.optional(v.number()),
    actorId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const version = await ctx.db.get(args.versionId);
    if (!version) {
      throw new Error("Version not found");
    }
    const pkg = await ctx.db.get(version.packageId);
    if (!pkg) {
      throw new Error("Package not found for version");
    }
    await requireContextRegistryEnabled(ctx, pkg.projectId);

    // Published rows are immutable — publishing twice is always rejected.
    if (!canTransitionVersionStatus(version.status, "PUBLISHED")) {
      throw new Error(
        `Cannot publish version in status ${version.status} — only DRAFT versions are publishable`
      );
    }

    const contentHash = args.contentHash ?? version.contentHash;
    if (!contentHash) {
      throw new Error(
        "contentHash is required to publish — compute sha256 client-side and pass it in"
      );
    }
    if (!isValidContentHash(contentHash)) {
      throw new Error(
        `Invalid contentHash "${contentHash}" — expected "sha256:" + 64 lowercase hex chars`
      );
    }

    const qualityScore = args.qualityScore ?? version.qualityScore;
    const reviewAxes = args.reviewAxes ?? version.reviewAxes;
    const minScore = args.minQualityScore ?? MIN_PUBLISH_QUALITY_SCORE;

    if (pkg.type === "SKILL") {
      if (qualityScore === undefined || qualityScore === null) {
        throw new Error(
          `SKILL packages require a structural review score before publish — run the skill linter and pass qualityScore/reviewAxes, or call setVersionReview first`
        );
      }
      if (qualityScore < minScore) {
        throw new Error(
          `Cannot publish SKILL "${pkg.slug}" — quality score ${qualityScore} is below minimum ${minScore}`
        );
      }
      if (reviewAxes === undefined || reviewAxes.validation < 40) {
        throw new Error(
          `Cannot publish SKILL "${pkg.slug}" — validation axis must be at least 40 (well-formed frontmatter and required fields)`
        );
      }
    }

    const now = Date.now();
    await ctx.db.patch(args.versionId, {
      status: "PUBLISHED",
      contentHash,
      approvedBy: args.approvedBy,
      approvedAt: args.approvedBy ? now : undefined,
      publishedAt: now,
      ...(qualityScore !== undefined && qualityScore !== null
        ? { qualityScore: Math.round(qualityScore) }
        : {}),
      ...(reviewAxes !== undefined ? { reviewAxes } : {}),
    });
    await ctx.db.patch(version.packageId, {
      currentVersionId: args.versionId,
      updatedAt: now,
    });

    await insertAudit(ctx, {
      projectId: pkg.projectId,
      actorId: args.actorId,
      action: "CONTEXT_VERSION_PUBLISHED",
      description: `Version ${version.version} of "${pkg.slug}" published`,
      targetType: "contextPackageVersion",
      targetId: args.versionId,
      beforeState: { status: version.status },
      afterState: { status: "PUBLISHED", contentHash },
    });

    return await ctx.db.get(args.versionId);
  },
});

export const deprecateVersion = mutation({
  args: {
    versionId: v.id("contextPackageVersions"),
    actorId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const version = await ctx.db.get(args.versionId);
    if (!version) {
      throw new Error("Version not found");
    }
    const pkg = await ctx.db.get(version.packageId);
    if (!pkg) {
      throw new Error("Package not found for version");
    }
    await requireContextRegistryEnabled(ctx, pkg.projectId);

    if (!canTransitionVersionStatus(version.status, "DEPRECATED")) {
      throw new Error(
        `Illegal version status transition ${version.status} -> DEPRECATED`
      );
    }

    // Lifecycle-only patch: the single permitted write to a published row.
    await ctx.db.patch(args.versionId, {
      status: "DEPRECATED",
      deprecatedAt: Date.now(),
    });

    await insertAudit(ctx, {
      projectId: pkg.projectId,
      actorId: args.actorId,
      action: "CONTEXT_VERSION_DEPRECATED",
      description: `Version ${version.version} of "${pkg.slug}" deprecated`,
      targetType: "contextPackageVersion",
      targetId: args.versionId,
      beforeState: { status: version.status },
      afterState: { status: "DEPRECATED" },
    });

    return await ctx.db.get(args.versionId);
  },
});
