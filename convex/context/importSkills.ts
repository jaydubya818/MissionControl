/**
 * Skill import pipeline — registers existing SKILL.md-style markdown files
 * as context packages (Software Factory Epic 1, CLI wiring lands in PR 5).
 *
 * A single mutation handles the whole import atomically: it creates the
 * package if the slug is unknown, then adds a DRAFT version (0.1.0 for a
 * new package, next patch otherwise) carrying the markdown inline.
 *
 * DESIGN NOTE: no companion Node action is needed. The original plan paired
 * this mutation with a `"use node"` hashing action, but content hashing was
 * moved to the caller (validate-only in Convex — see
 * lib/contextPackages.ts), so callers optionally pass a precomputed
 * `contentHash` and the mutation just validates its format.
 *
 * Gated behind the `context.registry` feature flag; audited via
 * CONTEXT_PACKAGE_IMPORTED.
 */

import { v } from "convex/values";
import { mutation } from "../_generated/server";
import { requireContextRegistryEnabled } from "../lib/contextRegistryGate";
import {
  compareSemver,
  isValidContentHash,
  isValidPackageSlug,
  nextPatchVersion,
} from "../lib/contextPackages";

/** Convex document limit is 1MB — leave headroom for the other fields. */
export const MAX_INLINE_CONTENT_BYTES = 900 * 1024;

const importableTypeArg = v.union(
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

export const importSkillMarkdown = mutation({
  args: {
    slug: v.string(),
    name: v.string(),
    description: v.string(),
    content: v.string(),
    sourceRepo: v.optional(v.string()),
    sourcePath: v.optional(v.string()),
    sourceCommitSha: v.optional(v.string()),
    owner: v.string(),
    type: v.optional(importableTypeArg),
    contentHash: v.optional(v.string()),
    // Structural review score from the skill linter (0-100) and tags for
    // registry categorization — both optional, set at import time
    qualityScore: v.optional(v.number()),
    // Per-axis review breakdown from the skill linter (validation /
    // implementation / activation, 0-100 each)
    reviewAxes: v.optional(
      v.object({
        validation: v.number(),
        implementation: v.number(),
        activation: v.number(),
      })
    ),
    tags: v.optional(v.array(v.string())),
    projectId: v.optional(v.id("projects")),
    tenantId: v.optional(v.id("tenants")),
    actorId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireContextRegistryEnabled(ctx, args.projectId);

    if (!isValidPackageSlug(args.slug)) {
      throw new Error(
        `Invalid package slug "${args.slug}" — expected "scope/name" with lowercase alphanumeric segments`
      );
    }

    const contentBytes = new TextEncoder().encode(args.content).length;
    if (contentBytes >= MAX_INLINE_CONTENT_BYTES) {
      throw new Error(
        `Content is ${contentBytes} bytes — inline import supports < ${MAX_INLINE_CONTENT_BYTES} bytes; upload to storage instead`
      );
    }

    if (args.contentHash !== undefined && !isValidContentHash(args.contentHash)) {
      throw new Error(
        `Invalid contentHash "${args.contentHash}" — expected "sha256:" + 64 lowercase hex chars`
      );
    }

    const now = Date.now();
    const type = args.type ?? "SKILL";

    // Find-or-create the package identity.
    const existingPkg = await ctx.db
      .query("contextPackages")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();

    const createdPackage = existingPkg === null;
    const packageId =
      existingPkg?._id ??
      (await ctx.db.insert("contextPackages", {
        name: args.name,
        slug: args.slug,
        description: args.description,
        type,
        status: "DRAFT",
        owner: args.owner,
        // Imported markdown is read-only context — lowest risk tier by default
        riskLevel: "GREEN",
        projectId: args.projectId,
        tenantId: args.tenantId,
        createdAt: now,
        updatedAt: now,
      tags: args.tags,
      }));

    // First import gets 0.1.0; re-imports bump the patch of the latest version.
    const existingVersions = await ctx.db
      .query("contextPackageVersions")
      .withIndex("by_package", (q) => q.eq("packageId", packageId))
      .collect();
    let version = "0.1.0";
    if (existingVersions.length > 0) {
      const latest = existingVersions.reduce((max, row) =>
        compareSemver(row.version, max.version) > 0 ? row : max
      );
      version = nextPatchVersion(latest.version);
    }

    const versionId = await ctx.db.insert("contextPackageVersions", {
      packageId,
      version,
      status: "DRAFT",
      contentHash: args.contentHash,
      inlineContent: args.content,
      manifestVersion: "1.0",
      sourceRepo: args.sourceRepo,
      sourcePath: args.sourcePath,
      sourceCommitSha: args.sourceCommitSha,
      createdAt: now,
      qualityScore: args.qualityScore,
      reviewAxes: args.reviewAxes,
    });

    await ctx.db.insert("activities", {
      projectId: args.projectId,
      actorType: "HUMAN",
      actorId: args.actorId,
      action: "CONTEXT_PACKAGE_IMPORTED",
      description: `Imported "${args.slug}" v${version} (${type}, ${contentBytes} bytes)${
        createdPackage ? " — new package" : ""
      }`,
      targetType: "contextPackageVersion",
      targetId: versionId,
      afterState: { slug: args.slug, version, status: "DRAFT" },
    });

    return { packageId, versionId, version, createdPackage };
  },
});
