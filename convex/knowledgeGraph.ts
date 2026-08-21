/**
 * Knowledge Graph — Agentic-KB Graphify overlay for Memory section.
 */

import { v } from "convex/values";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation, mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  getNeighborhoodForNode,
  normalizeGraphifyPayload,
  summarizeSnapshot,
  type KnowledgeGraphSource,
  type NormalizedGraphEdge,
  type NormalizedGraphHyperedge,
  type NormalizedGraphNode,
  type NormalizedGraphSnapshot,
} from "./lib/knowledgeGraph";

const graphSource = v.union(
  v.literal("agentic-kb"),
  v.literal("obsidian"),
  v.literal("mission-control")
);

const graphNodeInput = v.object({
  externalId: v.string(),
  label: v.string(),
  fileType: v.optional(v.string()),
  sourceFile: v.optional(v.string()),
  community: v.optional(v.number()),
  metadata: v.optional(v.any()),
});

const graphEdgeInput = v.object({
  externalId: v.string(),
  fromExternalId: v.string(),
  toExternalId: v.string(),
  relation: v.string(),
  confidence: v.optional(v.string()),
  confidenceScore: v.optional(v.number()),
  weight: v.optional(v.number()),
  sourceFile: v.optional(v.string()),
});

const graphHyperedgeInput = v.object({
  externalId: v.string(),
  label: v.string(),
  nodeExternalIds: v.array(v.string()),
  relation: v.string(),
  confidence: v.optional(v.string()),
  confidenceScore: v.optional(v.number()),
  sourceFile: v.optional(v.string()),
});

async function loadSnapshotForSource(
  ctx: QueryCtx | MutationCtx,
  source: KnowledgeGraphSource,
  projectId?: Id<"projects">
): Promise<NormalizedGraphSnapshot> {
  const nodeRows = projectId
    ? await ctx.db
        .query("knowledgeGraphNodes")
        .withIndex("by_project_source", (q) =>
          q.eq("projectId", projectId).eq("source", source)
        )
        .collect()
    : await ctx.db
        .query("knowledgeGraphNodes")
        .withIndex("by_source", (q) => q.eq("source", source))
        .collect();

  const edgeRows = projectId
    ? await ctx.db
        .query("knowledgeGraphEdges")
        .withIndex("by_project_source", (q) =>
          q.eq("projectId", projectId).eq("source", source)
        )
        .collect()
    : await ctx.db
        .query("knowledgeGraphEdges")
        .withIndex("by_source", (q) => q.eq("source", source))
        .collect();

  const hyperedgeRows = projectId
    ? await ctx.db
        .query("knowledgeGraphHyperedges")
        .withIndex("by_project_source", (q) =>
          q.eq("projectId", projectId).eq("source", source)
        )
        .collect()
    : await ctx.db
        .query("knowledgeGraphHyperedges")
        .withIndex("by_source", (q) => q.eq("source", source))
        .collect();

  return {
    nodes: nodeRows.map((row) => ({
      externalId: row.externalId,
      label: row.label,
      fileType: row.fileType,
      sourceFile: row.sourceFile,
      community: row.community,
      metadata: row.metadata,
    })),
    edges: edgeRows.map((row) => ({
      externalId: row.externalId,
      fromExternalId: row.fromExternalId,
      toExternalId: row.toExternalId,
      relation: row.relation,
      confidence: row.confidence,
      confidenceScore: row.confidenceScore,
      weight: row.weight,
      sourceFile: row.sourceFile,
    })),
    hyperedges: hyperedgeRows.map((row) => ({
      externalId: row.externalId,
      label: row.label,
      nodeExternalIds: row.nodeExternalIds,
      relation: row.relation,
      confidence: row.confidence,
      confidenceScore: row.confidenceScore,
      sourceFile: row.sourceFile,
    })),
  };
}

async function clearSnapshotForSource(
  ctx: MutationCtx,
  source: KnowledgeGraphSource,
  projectId?: Id<"projects">
) {
  const nodeRows = projectId
    ? await ctx.db
        .query("knowledgeGraphNodes")
        .withIndex("by_project_source", (q) =>
          q.eq("projectId", projectId).eq("source", source)
        )
        .collect()
    : await ctx.db
        .query("knowledgeGraphNodes")
        .withIndex("by_source", (q) => q.eq("source", source))
        .collect();

  for (const row of nodeRows) {
    await ctx.db.delete(row._id);
  }

  const edgeRows = projectId
    ? await ctx.db
        .query("knowledgeGraphEdges")
        .withIndex("by_project_source", (q) =>
          q.eq("projectId", projectId).eq("source", source)
        )
        .collect()
    : await ctx.db
        .query("knowledgeGraphEdges")
        .withIndex("by_source", (q) => q.eq("source", source))
        .collect();

  for (const row of edgeRows) {
    await ctx.db.delete(row._id);
  }

  const hyperedgeRows = projectId
    ? await ctx.db
        .query("knowledgeGraphHyperedges")
        .withIndex("by_project_source", (q) =>
          q.eq("projectId", projectId).eq("source", source)
        )
        .collect()
    : await ctx.db
        .query("knowledgeGraphHyperedges")
        .withIndex("by_source", (q) => q.eq("source", source))
        .collect();

  for (const row of hyperedgeRows) {
    await ctx.db.delete(row._id);
  }
}

async function applySnapshotImport(
  ctx: MutationCtx,
  args: {
    projectId?: Id<"projects">;
    source: KnowledgeGraphSource;
    nodes: NormalizedGraphNode[];
    edges: NormalizedGraphEdge[];
    hyperedges: NormalizedGraphHyperedge[];
    idempotencyKey?: string;
  }
) {
  const now = Date.now();

  await clearSnapshotForSource(ctx, args.source, args.projectId);

  for (const node of args.nodes) {
    await ctx.db.insert("knowledgeGraphNodes", {
      projectId: args.projectId,
      source: args.source,
      externalId: node.externalId,
      label: node.label,
      fileType: node.fileType,
      sourceFile: node.sourceFile,
      community: node.community,
      metadata: node.metadata,
      importedAt: now,
    });
  }

  for (const edge of args.edges) {
    await ctx.db.insert("knowledgeGraphEdges", {
      projectId: args.projectId,
      source: args.source,
      externalId: edge.externalId,
      fromExternalId: edge.fromExternalId,
      toExternalId: edge.toExternalId,
      relation: edge.relation,
      confidence: edge.confidence,
      confidenceScore: edge.confidenceScore,
      weight: edge.weight,
      sourceFile: edge.sourceFile,
      importedAt: now,
    });
  }

  for (const hyperedge of args.hyperedges) {
    await ctx.db.insert("knowledgeGraphHyperedges", {
      projectId: args.projectId,
      source: args.source,
      externalId: hyperedge.externalId,
      label: hyperedge.label,
      nodeExternalIds: hyperedge.nodeExternalIds,
      relation: hyperedge.relation,
      confidence: hyperedge.confidence,
      confidenceScore: hyperedge.confidenceScore,
      sourceFile: hyperedge.sourceFile,
      importedAt: now,
    });
  }

  if (args.idempotencyKey) {
    await ctx.db.insert("activities", {
      actorType: "SYSTEM",
      action: "KNOWLEDGE_GRAPH_IMPORTED",
      description: `Imported knowledge graph (${args.source}): ${args.nodes.length} nodes, ${args.edges.length} edges, ${args.hyperedges.length} hyperedges [${args.idempotencyKey}]`,
      projectId: args.projectId,
      metadata: { idempotencyKey: args.idempotencyKey },
    });
  }

  return {
    skipped: false,
    nodeCount: args.nodes.length,
    edgeCount: args.edges.length,
    hyperedgeCount: args.hyperedges.length,
  };
}

export const getSnapshot = query({
  args: {
    projectId: v.optional(v.id("projects")),
    source: v.optional(graphSource),
  },
  handler: async (ctx, args) => {
    const source: KnowledgeGraphSource = args.source ?? "agentic-kb";
    const snapshot = await loadSnapshotForSource(ctx, source, args.projectId);
    return {
      source,
      ...snapshot,
      stats: summarizeSnapshot(snapshot),
    };
  },
});

export const getNeighborhood = query({
  args: {
    externalId: v.string(),
    projectId: v.optional(v.id("projects")),
    source: v.optional(graphSource),
  },
  handler: async (ctx, args) => {
    const source: KnowledgeGraphSource = args.source ?? "agentic-kb";
    const snapshot = await loadSnapshotForSource(ctx, source, args.projectId);
    return getNeighborhoodForNode(args.externalId, snapshot);
  },
});

export const importSnapshot = internalMutation({
  args: {
    projectId: v.optional(v.id("projects")),
    source: graphSource,
    nodes: v.array(graphNodeInput),
    edges: v.array(graphEdgeInput),
    hyperedges: v.array(graphHyperedgeInput),
    idempotencyKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return applySnapshotImport(ctx, args);
  },
});

/** Import from raw Graphify JSON payload (normalizes server-side). */
export const importGraphifyJson = internalMutation({
  args: {
    projectId: v.optional(v.id("projects")),
    source: v.optional(graphSource),
    payload: v.any(),
    idempotencyKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const normalized = normalizeGraphifyPayload(args.payload ?? {});
    const source: KnowledgeGraphSource = args.source ?? "agentic-kb";

    const result = await applySnapshotImport(ctx, {
      projectId: args.projectId,
      source,
      nodes: normalized.nodes,
      edges: normalized.edges,
      hyperedges: normalized.hyperedges,
      idempotencyKey: args.idempotencyKey,
    });

    return {
      ...result,
      stats: summarizeSnapshot(normalized),
    };
  },
});
