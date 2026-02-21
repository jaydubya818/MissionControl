import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { api } from "./_generated/api";

function buildJobId(): string {
  return `job_${Math.random().toString(36).slice(2, 10)}`;
}

function parseNextRun(cronExpression: string, from = Date.now()): number {
  // Supported minimal format: "*/N * * * *" -> every N minutes
  const match = cronExpression.match(/^\*\/(\d+)\s+\*\s+\*\s+\*\s+\*$/);
  if (!match) return from + 5 * 60 * 1000;
  const minutes = Math.max(Number(match[1]), 1);
  return from + minutes * 60 * 1000;
}

export const list = query({
  args: {
    projectId: v.optional(v.id("projects")),
    enabledOnly: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const rows = args.projectId
      ? await ctx.db.query("scheduledJobs").withIndex("by_project", (q) => q.eq("projectId", args.projectId)).order("desc").take(args.limit ?? 100)
      : await ctx.db.query("scheduledJobs").order("desc").take(args.limit ?? 100);
    return args.enabledOnly ? rows.filter((row) => row.enabled) : rows;
  },
});

export const create = mutation({
  args: {
    projectId: v.optional(v.id("projects")),
    name: v.string(),
    jobType: v.union(
      v.literal("test_suite"), 
      v.literal("qc_run"), 
      v.literal("workflow"), 
      v.literal("hybrid"),
      v.literal("mission_prompt")
    ),
    cronExpression: v.string(),
    targetId: v.optional(v.string()),
    autoRerunFlaky: v.optional(v.boolean()),
    enabled: v.optional(v.boolean()),
    createdBy: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const id = await ctx.db.insert("scheduledJobs", {
      tenantId: undefined,
      projectId: args.projectId,
      jobId: buildJobId(),
      name: args.name,
      jobType: args.jobType,
      cronExpression: args.cronExpression,
      nextRun: parseNextRun(args.cronExpression, now),
      targetId: args.targetId ?? "",
      autoRerunFlaky: args.autoRerunFlaky ?? false,
      enabled: args.enabled ?? true,
      createdBy: args.createdBy,
    });
    return { id };
  },
});

export const setEnabled = mutation({
  args: { id: v.id("scheduledJobs"), enabled: v.boolean() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { enabled: args.enabled });
    return { success: true };
  },
});

export const executeDue = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const enabled = await ctx.db.query("scheduledJobs").withIndex("by_enabled", (q) => q.eq("enabled", true)).collect();
    let executed = 0;
    for (const job of enabled) {
      if (job.nextRun > now) continue;
      executed += 1;
      await ctx.db.patch(job._id, {
        lastRun: now,
        nextRun: parseNextRun(job.cronExpression, now),
      });
      
      // Execute mission_prompt jobs by calling reversePrompt with autoCreate
      if (job.jobType === "mission_prompt") {
        try {
          await ctx.scheduler.runAfter(0, api.mission.reversePrompt, {
            projectId: job.projectId,
            autoCreate: true,
            maxSuggestions: 3,
          });
        } catch (error) {
          console.error("Failed to execute mission_prompt job:", error);
        }
      }
      
      await ctx.db.insert("activities", {
        projectId: job.projectId,
        actorType: "SYSTEM",
        action: "SCHEDULED_JOB_EXECUTED",
        description: `Executed scheduled job ${job.name}`,
        targetType: "SCHEDULED_JOB",
        targetId: job._id,
        metadata: {
          jobType: job.jobType,
          targetId: job.targetId,
          autoRerunFlaky: job.autoRerunFlaky,
        },
      });
    }
    return { executed };
  },
});
