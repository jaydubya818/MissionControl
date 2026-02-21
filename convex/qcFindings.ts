/**
 * QC Findings — Convex Functions
 * 
 * Individual quality check results.
 */

import { v } from "convex/values";
import { query, internalMutation } from "./_generated/server";
import { Id } from "./_generated/dataModel";

// ============================================================================
// QUERIES
// ============================================================================

/**
 * List findings for a QC run
 */
export const listByRun = query({
  args: {
    qcRunId: v.id("qcRuns"),
    severity: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let findings = await ctx.db
      .query("qcFindings")
      .withIndex("by_run", (q) => q.eq("qcRunId", args.qcRunId))
      .collect();
    
    if (args.severity) {
      findings = findings.filter((f) => f.severity === args.severity);
    }
    
    // Sort by severity (RED > YELLOW > GREEN > INFO)
    const severityOrder = { RED: 0, YELLOW: 1, GREEN: 2, INFO: 3 };
    findings.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
    
    return findings;
  },
});

// ============================================================================
// MUTATIONS
// ============================================================================

/**
 * Insert a finding (internal)
 */
export const insert = internalMutation({
  args: {
    qcRunId: v.id("qcRuns"),
    tenantId: v.optional(v.id("tenants")),
    projectId: v.optional(v.id("projects")),
    severity: v.union(v.literal("RED"), v.literal("YELLOW"), v.literal("GREEN"), v.literal("INFO")),
    category: v.union(
      v.literal("REQUIREMENT_GAP"),
      v.literal("DOCS_DRIFT"),
      v.literal("COVERAGE_GAP"),
      v.literal("SECURITY_GAP"),
      v.literal("CONFIG_MISSING"),
      v.literal("DELIVERY_GATE")
    ),
    title: v.string(),
    description: v.string(),
    filePaths: v.optional(v.array(v.string())),
    lineRanges: v.optional(v.array(v.object({
      file: v.string(),
      start: v.number(),
      end: v.number(),
    }))),
    prdRefs: v.optional(v.array(v.string())),
    suggestedFix: v.optional(v.string()),
    confidence: v.optional(v.number()),
    linkedTaskId: v.optional(v.id("tasks")),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("qcFindings", {
      qcRunId: args.qcRunId,
      tenantId: args.tenantId,
      projectId: args.projectId,
      severity: args.severity,
      category: args.category,
      title: args.title,
      description: args.description,
      filePaths: args.filePaths,
      lineRanges: args.lineRanges,
      prdRefs: args.prdRefs,
      suggestedFix: args.suggestedFix,
      confidence: args.confidence,
      linkedTaskId: args.linkedTaskId,
    });
    
    return { id };
  },
});
