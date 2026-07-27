import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import {
  buildChangeReviewLenses,
  buildMutationTestingReport,
  type PrCheckSignals,
} from "../lib/harnessPrChecks";

export const applyCiIngest = internalMutation({
  args: {
    projectId: v.optional(v.id("projects")),
    prUrl: v.string(),
    prNumber: v.optional(v.number()),
    repoFullName: v.string(),
    branch: v.optional(v.string()),
    title: v.optional(v.string()),
    ciStatus: v.optional(
      v.union(
        v.literal("PASS"),
        v.literal("FAIL"),
        v.literal("PENDING"),
        v.literal("UNKNOWN")
      )
    ),
    ciRunUrl: v.optional(v.string()),
    headSha: v.optional(v.string()),
    checkRuns: v.optional(
      v.array(
        v.object({
          name: v.string(),
          status: v.string(),
          conclusion: v.optional(v.union(v.string(), v.null())),
          html_url: v.optional(v.string()),
        })
      )
    ),
    signals: v.optional(
      v.object({
        testPassCount: v.optional(v.number()),
        testFailCount: v.optional(v.number()),
        diffLineCount: v.optional(v.number()),
        verificationPassRate: v.optional(v.number()),
        securityFindingCount: v.optional(v.number()),
        qcFindings: v.optional(
          v.array(
            v.object({
              title: v.optional(v.string()),
              category: v.optional(v.string()),
              severity: v.string(),
            })
          )
        ),
      })
    ),
    sourceRef: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const signals: PrCheckSignals = {
      qcFindings: args.signals?.qcFindings ?? [],
      testPassCount: args.signals?.testPassCount,
      testFailCount: args.signals?.testFailCount,
      diffLineCount: args.signals?.diffLineCount,
      verificationPassRate: args.signals?.verificationPassRate,
      securityFindingCount: args.signals?.securityFindingCount,
    };

    const changeReviewLenses = buildChangeReviewLenses(signals);
    const mutationTesting = buildMutationTestingReport(signals);
    const now = Date.now();

    const existing = await ctx.db
      .query("harnessPrChecks")
      .withIndex("by_pr_url", (q) => q.eq("prUrl", args.prUrl))
      .unique();

    const doc = {
      projectId: args.projectId,
      prUrl: args.prUrl,
      prNumber: args.prNumber,
      repoFullName: args.repoFullName,
      branch: args.branch,
      title: args.title,
      ciStatus: args.ciStatus ?? "UNKNOWN",
      ciRunUrl: args.ciRunUrl,
      ciProvider: "github",
      source: "GITHUB" as const,
      sourceRef: args.sourceRef ?? args.headSha,
      changeReviewLenses,
      mutationTesting,
      syncedAt: now,
      createdAt: existing?.createdAt ?? now,
      metadata: {
        headSha: args.headSha,
        checkRuns: args.checkRuns,
        diffLineCount: args.signals?.diffLineCount,
      },
    };

    if (existing) {
      await ctx.db.patch(existing._id, doc);
      return existing._id;
    }
    return ctx.db.insert("harnessPrChecks", doc);
  },
});
