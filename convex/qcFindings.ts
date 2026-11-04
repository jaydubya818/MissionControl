/**
 * QC Findings — Convex Functions
 * 
 * Individual quality check results.
 */

import { v } from "convex/values";
import { query, internalMutation } from "./lib/missionScopedFunctions";
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

/**
 * List recent findings across runs (for findings browser)
 */
export const listRecent = query({
  args: {
    projectId: v.optional(v.id("projects")),
    environment: v.optional(v.union(
      v.literal("local"),
      v.literal("dev"),
      v.literal("staging"),
      v.literal("pilot"),
      v.literal("production")
    )),
    severity: v.optional(v.string()),
    category: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 100;
    let runs = await ctx.db.query("qcRuns").order("desc").take(100);
    if (args.projectId) {
      runs = runs.filter((r) => r.projectId === args.projectId);
    }
    if (args.environment) {
      runs = runs.filter((r) => r.environment === args.environment);
    }
    const runIds = new Set(runs.map((r) => r._id));
    const runMap = new Map(runs.map((r) => [r._id, r]));

    let findings = args.projectId
      ? await ctx.db
          .query("qcFindings")
          .withIndex("by_project", (q) => q.eq("projectId", args.projectId!))
          .collect()
      : await ctx.db.query("qcFindings").collect();

    findings = findings.filter((f) => runIds.has(f.qcRunId));
    if (args.severity) findings = findings.filter((f) => f.severity === args.severity);
    if (args.category) findings = findings.filter((f) => f.category === args.category);
    findings.sort((a, b) => (b._creationTime ?? 0) - (a._creationTime ?? 0));
    findings = findings.slice(0, limit);

    return findings.map((f) => {
      const run = runMap.get(f.qcRunId);
      return {
        ...f,
        runId: run?.runId ?? null,
        environment: run?.environment ?? null,
      };
    });
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
      v.literal("DELIVERY_GATE"),
      v.literal("AGENT_HALLUCINATION"),
      v.literal("TASK_INCOMPLETE"),
      v.literal("OUTPUT_FORMAT_ERROR"),
      v.literal("PERFORMANCE_REGRESSION"),
      v.literal("DEPENDENCY_RISK")
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
