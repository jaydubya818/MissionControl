/**
 * Code review wizard — evidence from legible PR/CI surfaces.
 */

import { v } from "convex/values";
import { query } from "../_generated/server";

export interface EvidenceFinding {
  id: string;
  label: string;
  detail: string;
  source: "pr" | "ci" | "qc" | "inferred";
  selected: boolean;
}

export const gatherEvidence = query({
  args: {
    projectId: v.optional(v.id("projects")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 12;
    const findings: EvidenceFinding[] = [];
    const seen = new Set<string>();

    const push = (f: Omit<EvidenceFinding, "selected">) => {
      if (seen.has(f.id)) return;
      seen.add(f.id);
      findings.push({ ...f, selected: true });
    };

    let prChecks = await ctx.db.query("harnessPrChecks").collect();
    if (args.projectId) {
      prChecks = prChecks.filter((p) => p.projectId === args.projectId);
    }
    prChecks.sort((a, b) => b.syncedAt - a.syncedAt);

    for (const pr of prChecks.slice(0, 5)) {
      for (const lens of pr.changeReviewLenses ?? []) {
        if (lens.score !== undefined && lens.score < 80) {
          push({
            id: `lens-${pr._id}-${lens.id}`,
            label: `${lens.label} review gap (${lens.score}%)`,
            detail: `From ${pr.repoFullName}${pr.prNumber ? ` #${pr.prNumber}` : ""}`,
            source: "pr",
          });
        }
      }
      if (pr.ciStatus === "FAIL") {
        push({
          id: `ci-fail-${pr._id}`,
          label: "Repeating CI failure",
          detail: pr.title ?? pr.prUrl,
          source: "ci",
        });
      }
      for (const m of pr.mutationTesting?.findings?.filter((f) => !f.caught).slice(0, 2) ?? []) {
        push({
          id: `mut-${pr._id}-${m.id}`,
          label: m.mutation,
          detail: m.file ?? "mutation gap",
          source: "qc",
        });
      }
    }

    const qcRuns = await ctx.db.query("qcRuns").order("desc").take(10);
    for (const run of qcRuns) {
      const qcFindings = await ctx.db
        .query("qcFindings")
        .withIndex("by_run", (q) => q.eq("qcRunId", run._id))
        .take(5);
      for (const f of qcFindings) {
        if (f.severity === "RED" || f.severity === "YELLOW") {
          push({
            id: `qc-${f._id}`,
            label: f.title ?? f.category ?? "QC finding",
            detail: `${f.severity} · ${f.category ?? "quality"}`,
            source: "qc",
          });
        }
      }
    }

    if (findings.length === 0) {
      push({
        id: "inferred-style",
        label: "Style guide from PR comments",
        detail: "No synced PRs yet — seed demo or ingest a GitHub PR",
        source: "inferred",
      });
      push({
        id: "inferred-convex",
        label: "Missing error handling in convex/",
        detail: "Common agent failure pattern",
        source: "inferred",
      });
      push({
        id: "inferred-boundary",
        label: "Test boundary conditions",
        detail: "Frequent review theme",
        source: "inferred",
      });
    }

    return {
      findings: findings.slice(0, limit),
      prCount: prChecks.length,
      latestPrUrl: prChecks[0]?.prUrl,
    };
  },
});
