/**
 * QC Artifacts — Convex Functions
 * 
 * Evidence packs, reports, and trace logs.
 */

import { v } from "convex/values";
import { query, internalMutation } from "./_generated/server";
import { Id } from "./_generated/dataModel";

// ============================================================================
// QUERIES
// ============================================================================

/**
 * List artifacts for a QC run
 */
export const listByRun = query({
  args: { qcRunId: v.id("qcRuns") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("qcArtifacts")
      .withIndex("by_run", (q) => q.eq("qcRunId", args.qcRunId))
      .collect();
  },
});

/**
 * Get download URL for an artifact
 */
export const getDownloadUrl = query({
  args: { id: v.id("qcArtifacts") },
  handler: async (ctx, args) => {
    const artifact = await ctx.db.get(args.id);
    if (!artifact) {
      throw new Error("Artifact not found");
    }
    
    if (artifact.storageId) {
      // Return Convex file storage URL
      const url = await ctx.storage.getUrl(artifact.storageId as Id<"_storage">);
      return { url, inline: false };
    }
    
    if (artifact.content) {
      // Return inline content
      return { content: artifact.content, inline: true };
    }
    
    throw new Error("Artifact has no content or storage reference");
  },
});

// ============================================================================
// MUTATIONS
// ============================================================================

/**
 * Store an artifact (internal)
 */
export const store = internalMutation({
  args: {
    qcRunId: v.id("qcRuns"),
    tenantId: v.optional(v.id("tenants")),
    projectId: v.optional(v.id("projects")),
    type: v.union(
      v.literal("EVIDENCE_PACK_JSON"),
      v.literal("SUMMARY_MD"),
      v.literal("TRACE_MATRIX"),
      v.literal("COVERAGE_REPORT"),
      v.literal("CUSTOM")
    ),
    name: v.string(),
    storageId: v.optional(v.id("_storage")),
    content: v.optional(v.string()),
    mimeType: v.string(),
    sizeBytes: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("qcArtifacts", {
      qcRunId: args.qcRunId,
      tenantId: args.tenantId,
      projectId: args.projectId,
      type: args.type,
      name: args.name,
      storageId: args.storageId,
      content: args.content,
      mimeType: args.mimeType,
      sizeBytes: args.sizeBytes,
    });
    
    return { id };
  },
});
