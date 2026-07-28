/** Executor-facing activation of a repository's immutable context lock. */

import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { requireContextRegistryEnabled } from "../lib/contextRegistryGate";
import { parseResolvedContextLock } from "../lib/contextActivation";

async function insertAudit(
  ctx: { db: any },
  entry: { actorId?: string; description: string; targetId: string; afterState: unknown }
): Promise<void> {
  await ctx.db.insert("activities", {
    actorType: "SYSTEM",
    actorId: entry.actorId,
    action: "CONTEXT_RUN_ACTIVATED",
    description: entry.description,
    targetType: "contextActivationReceipt",
    targetId: entry.targetId,
    afterState: entry.afterState,
  });
}

export const getReceiptForRun = query({
  args: { workflowRunId: v.id("contextWorkflowRuns") },
  handler: async (ctx, args) =>
    await ctx.db
      .query("contextActivationReceipts")
      .withIndex("by_workflow_run", (q) => q.eq("workflowRunId", args.workflowRunId))
      .first(),
});

export const activateLockedContext = mutation({
  args: {
    repoSlug: v.string(),
    workflowRunId: v.id("contextWorkflowRuns"),
    idempotencyKey: v.string(),
    actorId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireContextRegistryEnabled(ctx);

    const run = await ctx.db.get(args.workflowRunId);
    if (!run) throw new Error("Context workflow run not found");

    const prior = await ctx.db
      .query("contextActivationReceipts")
      .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", args.idempotencyKey))
      .first();
    if (prior) {
      if (prior.workflowRunId !== args.workflowRunId || prior.repoSlug !== args.repoSlug) {
        throw new Error("Context activation idempotency key is already bound to another run or repository");
      }
      return { receiptId: prior._id, packages: prior.packages, reused: true };
    }

    const lock = await ctx.db
      .query("contextLocks")
      .withIndex("by_repo", (q) => q.eq("repoSlug", args.repoSlug))
      .unique();
    if (!lock) throw new Error(`No stored context lock for repository "${args.repoSlug}"`);

    const resolved = parseResolvedContextLock(lock.lockJson);
    const packages: Array<{
      packageSlug: string;
      packageId: any;
      versionId: any;
      version: string;
      contentHash: string;
      content: string;
    }> = [];

    for (const [packageSlug, entry] of Object.entries(resolved).sort(([a], [b]) => a.localeCompare(b))) {
      const pkg = await ctx.db
        .query("contextPackages")
        .withIndex("by_slug", (q) => q.eq("slug", packageSlug))
        .unique();
      if (!pkg) throw new Error(`Locked package "${packageSlug}" no longer exists in the Registry`);

      const version = await ctx.db
        .query("contextPackageVersions")
        .withIndex("by_package_version", (q) => q.eq("packageId", pkg._id).eq("version", entry.version))
        .unique();
      if (!version || version.status !== "PUBLISHED") {
        throw new Error(`Locked package "${packageSlug}" version ${entry.version} is not published`);
      }
      if (version.contentHash !== entry.contentHash) {
        throw new Error(`Locked package "${packageSlug}" content hash does not match Registry version ${entry.version}`);
      }
      if (!version.inlineContent) {
        throw new Error(`Locked package "${packageSlug}" version ${entry.version} has no inline executor content`);
      }
      packages.push({
        packageSlug,
        packageId: pkg._id,
        versionId: version._id,
        version: version.version,
        contentHash: version.contentHash,
        content: version.inlineContent,
      });
    }

    const receiptId = await ctx.db.insert("contextActivationReceipts", {
      repoSlug: args.repoSlug,
      workflowRunId: args.workflowRunId,
      lockManifestHash: lock.manifestHash,
      packages: packages.map(({ content: _content, ...receiptPackage }) => receiptPackage),
      idempotencyKey: args.idempotencyKey,
      actorId: args.actorId,
      createdAt: Date.now(),
    });
    await insertAudit(ctx, {
      actorId: args.actorId,
      description: `Activated ${packages.length} locked context package(s) for run ${args.workflowRunId}`,
      targetId: receiptId,
      afterState: { repoSlug: args.repoSlug, workflowRunId: args.workflowRunId, packageCount: packages.length },
    });

    return { receiptId, packages, reused: false };
  },
});

export const activateForWorkflowRun = mutation({
  args: {
    repoSlug: v.string(),
    workflowRunId: v.id("workflowRuns"),
    idempotencyKey: v.string(),
    actorId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireContextRegistryEnabled(ctx);

    const run = await ctx.db.get(args.workflowRunId);
    if (!run) throw new Error("Workflow run not found");

    const prior = await ctx.db
      .query("workflowContextActivationReceipts")
      .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", args.idempotencyKey))
      .first();
    if (prior) {
      if (prior.workflowRunId !== args.workflowRunId || prior.repoSlug !== args.repoSlug) {
        throw new Error("Context activation idempotency key is already bound to another run or repository");
      }
      return { receiptId: prior._id, packages: prior.packages, reused: true };
    }

    const lock = await ctx.db
      .query("contextLocks")
      .withIndex("by_repo", (q) => q.eq("repoSlug", args.repoSlug))
      .unique();
    if (!lock) throw new Error(`No stored context lock for repository "${args.repoSlug}"`);

    const resolved = parseResolvedContextLock(lock.lockJson);
    const packages: Array<{
      packageSlug: string;
      packageId: any;
      versionId: any;
      version: string;
      contentHash: string;
      content: string;
    }> = [];

    for (const [packageSlug, entry] of Object.entries(resolved).sort(([a], [b]) => a.localeCompare(b))) {
      const pkg = await ctx.db
        .query("contextPackages")
        .withIndex("by_slug", (q) => q.eq("slug", packageSlug))
        .unique();
      if (!pkg) throw new Error(`Locked package "${packageSlug}" no longer exists in the Registry`);

      const version = await ctx.db
        .query("contextPackageVersions")
        .withIndex("by_package_version", (q) => q.eq("packageId", pkg._id).eq("version", entry.version))
        .unique();
      if (!version || version.status !== "PUBLISHED") {
        throw new Error(`Locked package "${packageSlug}" version ${entry.version} is not published`);
      }
      if (version.contentHash !== entry.contentHash) {
        throw new Error(`Locked package "${packageSlug}" content hash does not match Registry version ${entry.version}`);
      }
      if (!version.inlineContent) {
        throw new Error(`Locked package "${packageSlug}" version ${entry.version} has no inline executor content`);
      }
      packages.push({
        packageSlug,
        packageId: pkg._id,
        versionId: version._id,
        version: version.version,
        contentHash: version.contentHash,
        content: version.inlineContent,
      });
    }

    const receiptId = await ctx.db.insert("workflowContextActivationReceipts", {
      repoSlug: args.repoSlug,
      workflowRunId: args.workflowRunId,
      lockManifestHash: lock.manifestHash,
      packages: packages.map(({ content: _content, ...receiptPackage }) => receiptPackage),
      idempotencyKey: args.idempotencyKey,
      actorId: args.actorId,
      createdAt: Date.now(),
    });

    await ctx.db.patch(args.workflowRunId, {
      metadata: { ...(run.metadata ?? {}), contextActivationReceiptId: receiptId, contextRepoSlug: args.repoSlug },
    });

    return { receiptId, packages, reused: false };
  },
});
