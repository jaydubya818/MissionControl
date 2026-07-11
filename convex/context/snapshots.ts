/**
 * Context Bill of Materials snapshots (Software Factory Epic 4).
 *
 * A contextSnapshots row is the immutable record of everything that shaped
 * an agent run — model, agent version, context packages with content
 * hashes, tools, feature flags, repo state, workflow/policy versions.
 *
 * IMMUTABILITY: one snapshot per run, inserted once by createSnapshot and
 * never patched afterwards. No update mutation may exist for this table —
 * a snapshot that can change is worthless as evidence.
 *
 * createSnapshot is gated behind the `context.cbom` feature flag and
 * audited via `activities` (CONTEXT_SNAPSHOT_CREATED). Queries are open —
 * reads are harmless before the subsystem launches. Diff/export logic is
 * pure and lives in lib/contextSnapshots.ts (unit tested — no Convex
 * runtime). See docs/software-factory/CBOM.md for the contract.
 */

import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { requireContextCbomEnabled } from "../lib/contextCbomGate";
import { isValidContentHash } from "../lib/contextPackages";
import { resolveAllFlags, type FlagRow } from "../lib/flags";
import {
  diffSnapshots,
  normalizeSnapshotForExport,
  type SnapshotDiff,
  type SnapshotLike,
} from "../lib/contextSnapshots";

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export const getById = query({
  args: { id: v.id("contextSnapshots") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const getByRun = query({
  args: { runId: v.id("runs") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("contextSnapshots")
      .withIndex("by_run", (q) => q.eq("runId", args.runId))
      .unique();
  },
});

export const listByAgent = query({
  args: { agentId: v.id("agents") },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("contextSnapshots")
      .withIndex("by_agent", (q) => q.eq("agentId", args.agentId))
      .collect();
    return rows.sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const listByRepo = query({
  args: { repoSlug: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("contextSnapshots")
      .withIndex("by_repo", (q) => q.eq("repoSlug", args.repoSlug))
      .collect();
    return rows.sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const listByWorkOrder = query({
  args: { workOrderId: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("contextSnapshots")
      .withIndex("by_work_order", (q) => q.eq("workOrderId", args.workOrderId))
      .collect();
    return rows.sort((a, b) => b.createdAt - a.createdAt);
  },
});

/**
 * Structured diff between two snapshots, a (baseline) → b (candidate):
 * packages added/removed/changed, model change, flag flips, repositorySha
 * change, tools added/removed. Pure logic in lib/contextSnapshots.ts.
 */
export const compareSnapshots = query({
  args: { aId: v.id("contextSnapshots"), bId: v.id("contextSnapshots") },
  handler: async (ctx, args): Promise<SnapshotDiff> => {
    const a = await ctx.db.get(args.aId);
    if (a === null) throw new Error(`Snapshot ${args.aId} not found`);
    const b = await ctx.db.get(args.bId);
    if (b === null) throw new Error(`Snapshot ${args.bId} not found`);
    return diffSnapshots(a as SnapshotLike, b as SnapshotLike);
  },
});

/**
 * Stable JSON-serializable export of a snapshot (system fields stripped,
 * keys and arrays deterministically sorted) suitable for reproducing the
 * run's context or feeding a future signing step.
 */
export const exportSnapshot = query({
  args: { id: v.id("contextSnapshots") },
  handler: async (ctx, args): Promise<Record<string, unknown>> => {
    const snapshot = await ctx.db.get(args.id);
    if (snapshot === null) throw new Error(`Snapshot ${args.id} not found`);
    return normalizeSnapshotForExport(snapshot as SnapshotLike);
  },
});

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/**
 * Record the CBOM for a run. Called at run start by the workflow executor
 * (and the Pi-bridge adapter, PR 21c). Feature flags are NOT caller
 * supplied: the mutation resolves every known + database-backed flag at
 * insert time so the snapshot records what was actually on.
 *
 * Rejects when the target run already has a snapshot — snapshots are
 * immutable, one per run.
 */
export const createSnapshot = mutation({
  args: {
    runId: v.optional(v.id("runs")),
    taskId: v.optional(v.id("tasks")),
    workOrderId: v.optional(v.string()),
    repoSlug: v.optional(v.string()),
    repositorySha: v.optional(v.string()),
    branch: v.optional(v.string()),
    worktreePath: v.optional(v.string()),
    model: v.string(),
    modelVersion: v.optional(v.string()),
    agentId: v.optional(v.id("agents")),
    agentVersion: v.optional(v.string()),
    soulVersionHash: v.optional(v.string()),
    workflowVersion: v.optional(v.string()),
    policyVersion: v.optional(v.string()),
    packages: v.array(
      v.object({
        packageId: v.optional(v.id("contextPackages")),
        slug: v.string(),
        version: v.string(),
        contentHash: v.string(),
        sourceCommitSha: v.optional(v.string()),
      })
    ),
    tools: v.optional(
      v.array(
        v.object({
          name: v.string(),
          version: v.optional(v.string()),
          server: v.optional(v.string()),
          permissions: v.optional(v.array(v.string())),
        })
      )
    ),
    environmentHash: v.optional(v.string()),
    runtimeConfigHash: v.optional(v.string()),
    approvalPolicy: v.optional(v.string()),
    riskClassification: v.optional(v.string()),
    actorId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Resolve the run first so the flag gate can honor project overrides.
    let run = null;
    if (args.runId !== undefined) {
      run = await ctx.db.get(args.runId);
      if (run === null) {
        throw new Error(`Run ${args.runId} not found`);
      }
    }

    await requireContextCbomEnabled(ctx, run?.projectId ?? null);

    // Immutability: one snapshot per run, never replaced.
    if (args.runId !== undefined) {
      const existing = await ctx.db
        .query("contextSnapshots")
        .withIndex("by_run", (q) => q.eq("runId", args.runId))
        .first();
      if (existing !== null || run?.contextSnapshotId !== undefined) {
        throw new Error(
          `Run ${args.runId} already has a context snapshot — snapshots are immutable, one per run`
        );
      }
    }

    for (const pkg of args.packages) {
      if (!isValidContentHash(pkg.contentHash)) {
        throw new Error(
          `Invalid contentHash for package "${pkg.slug}" — expected "sha256:" + 64 lowercase hex chars`
        );
      }
    }

    // Auto-capture the resolved feature-flag surface at snapshot time.
    const flagRows = (await ctx.db
      .query("featureFlags")
      .collect()) as unknown as FlagRow[];
    const featureFlags = resolveAllFlags(
      flagRows,
      (run?.projectId as string | undefined) ?? null
    ).map((flag) => ({ key: flag.key, enabled: flag.enabled }));

    const { actorId, ...snapshotFields } = args;
    const snapshotId = await ctx.db.insert("contextSnapshots", {
      ...snapshotFields,
      featureFlags,
      createdAt: Date.now(),
    });

    if (args.runId !== undefined) {
      await ctx.db.patch(args.runId, { contextSnapshotId: snapshotId });
    }

    await ctx.db.insert("activities", {
      actorType: "SYSTEM" as const,
      actorId,
      action: "CONTEXT_SNAPSHOT_CREATED",
      description:
        `Context snapshot created for ${args.runId ?? args.workOrderId ?? "unattached run"} — ` +
        `model ${args.model}, ${args.packages.length} package(s)`,
      targetType: "contextSnapshot",
      targetId: snapshotId,
      taskId: args.taskId,
      agentId: args.agentId,
      afterState: {
        runId: args.runId,
        workOrderId: args.workOrderId,
        model: args.model,
        packageCount: args.packages.length,
        flagCount: featureFlags.length,
      },
    });

    return snapshotId;
  },
});
