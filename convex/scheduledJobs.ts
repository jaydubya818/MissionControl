import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import type { GenericMutationCtx } from "convex/server";
import type { DataModel } from "./_generated/dataModel";
import type { GenericDatabaseReader } from "convex/server";
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

type RunPolicy = "standard" | "run_if_idle" | "run_if_not_run_since" | "run_at_least_per_period" | "skip_if_last_run_within";
type RunPolicyParams = {
  periodSeconds?: number;
  minRuns?: number;
  debounceSeconds?: number;
  idleThresholdPct?: number;
};

/** Evaluate run policy using only db reads (for use in mutations or queries). */
async function evaluateRunPolicy(
  ctx: { db: GenericDatabaseReader<DataModel> },
  job: Doc<"scheduledJobs">
): Promise<{ allowed: boolean; reason: string }> {
  const now = Date.now();
  const policy = (job.runPolicy ?? "standard") as RunPolicy;
  const params = (job.runPolicyParams ?? {}) as RunPolicyParams;

  if (policy === "standard") {
    return { allowed: true, reason: "Standard cron" };
  }

  // Conflict group: skip if another job in same group ran recently (within its lastRunDuration)
  if (job.conflictGroup) {
    const allJobs = await ctx.db.query("scheduledJobs").collect();
    const durationMs = job.lastRunDuration ?? 5 * 60 * 1000; // default 5 min
    const cutoff = now - durationMs;
    const conflicting = allJobs.filter(
      (j) =>
        j._id !== job._id &&
        j.conflictGroup === job.conflictGroup &&
        j.lastRun != null &&
        j.lastRun >= cutoff
    );
    if (conflicting.length > 0) {
      return {
        allowed: false,
        reason: `Conflict group "${job.conflictGroup}": another job ran within last ${Math.round(durationMs / 60000)}m`,
      };
    }
  }

  if (policy === "run_if_idle") {
    const inProgress = await ctx.db
      .query("tasks")
      .withIndex("by_status", (q: any) => q.eq("status", "IN_PROGRESS"))
      .take(1);
    const assigned = await ctx.db
      .query("tasks")
      .withIndex("by_status", (q: any) => q.eq("status", "ASSIGNED"))
      .take(1);
    const ready = await ctx.db
      .query("tasks")
      .withIndex("by_status", (q: any) => q.eq("status", "READY"))
      .take(1);
    if (inProgress ?? ready ?? assigned) {
      return { allowed: false, reason: "Agents busy (tasks IN_PROGRESS or READY)" };
    }
    return { allowed: true, reason: "System idle" };
  }

  if (policy === "run_if_not_run_since") {
    const periodSeconds = params.periodSeconds ?? 86400; // 24h default
    const periodMs = periodSeconds * 1000;
    const lastRun = job.lastRun ?? 0;
    if (now - lastRun < periodMs) {
      return {
        allowed: false,
        reason: `Last run ${Math.round((now - lastRun) / 60000)}m ago; need ${periodSeconds / 3600}h since last run`,
      };
    }
    return { allowed: true, reason: `Not run in ${periodSeconds / 3600}h` };
  }

  if (policy === "run_at_least_per_period") {
    const periodSeconds = params.periodSeconds ?? 86400;
    const minRuns = params.minRuns ?? 1;
    const intervalMs = (periodSeconds / minRuns) * 1000;
    const lastRun = job.lastRun ?? 0;
    if (now - lastRun < intervalMs) {
      return {
        allowed: false,
        reason: `SLA: need ${minRuns} runs per ${periodSeconds / 3600}h; last run ${Math.round((now - lastRun) / 60000)}m ago`,
      };
    }
    return { allowed: true, reason: "SLA window allows run" };
  }

  if (policy === "skip_if_last_run_within") {
    const debounceSeconds = params.debounceSeconds ?? 600; // 10 min default
    const debounceMs = debounceSeconds * 1000;
    const lastRun = job.lastRun ?? 0;
    if (lastRun > 0 && now - lastRun < debounceMs) {
      return {
        allowed: false,
        reason: `Debounce: last run ${Math.round((now - lastRun) / 60)}s ago (min ${debounceSeconds}s)`,
      };
    }
    return { allowed: true, reason: "Debounce window passed" };
  }

  return { allowed: true, reason: "Unknown policy, allow" };
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

const runPolicyValidator = v.optional(
  v.union(
    v.literal("standard"),
    v.literal("run_if_idle"),
    v.literal("run_if_not_run_since"),
    v.literal("run_at_least_per_period"),
    v.literal("skip_if_last_run_within")
  )
);

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
    runPolicy: runPolicyValidator,
    runPolicyParams: v.optional(v.any()),
    priority: v.optional(v.number()),
    conflictGroup: v.optional(v.string()),
    lastRunDuration: v.optional(v.number()),
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
      runPolicy: args.runPolicy,
      runPolicyParams: args.runPolicyParams,
      priority: args.priority,
      conflictGroup: args.conflictGroup,
      lastRunDuration: args.lastRunDuration,
    });
    return { id };
  },
});

export const update = mutation({
  args: {
    id: v.id("scheduledJobs"),
    name: v.optional(v.string()),
    cronExpression: v.optional(v.string()),
    targetId: v.optional(v.string()),
    autoRerunFlaky: v.optional(v.boolean()),
    enabled: v.optional(v.boolean()),
    runPolicy: runPolicyValidator,
    runPolicyParams: v.optional(v.any()),
    priority: v.optional(v.number()),
    conflictGroup: v.optional(v.string()),
    lastRunDuration: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    const job = await ctx.db.get(id);
    if (!job) throw new Error("Scheduled job not found");
    const patch: Record<string, unknown> = {};
    if (updates.name !== undefined) patch.name = updates.name;
    if (updates.cronExpression !== undefined) {
      patch.cronExpression = updates.cronExpression;
      patch.nextRun = parseNextRun(updates.cronExpression, Date.now());
    }
    if (updates.targetId !== undefined) patch.targetId = updates.targetId;
    if (updates.autoRerunFlaky !== undefined) patch.autoRerunFlaky = updates.autoRerunFlaky;
    if (updates.enabled !== undefined) patch.enabled = updates.enabled;
    if (updates.runPolicy !== undefined) patch.runPolicy = updates.runPolicy;
    if (updates.runPolicyParams !== undefined) patch.runPolicyParams = updates.runPolicyParams;
    if (updates.priority !== undefined) patch.priority = updates.priority;
    if (updates.conflictGroup !== undefined) patch.conflictGroup = updates.conflictGroup;
    if (updates.lastRunDuration !== undefined) patch.lastRunDuration = updates.lastRunDuration;
    await ctx.db.patch(id, patch);
    return { success: true };
  },
});

export const evaluatePolicy = query({
  args: { id: v.id("scheduledJobs") },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.id);
    if (!job) return { allowed: false, reason: "Job not found" };
    return evaluateRunPolicy(ctx, job);
  },
});

export const setEnabled = mutation({
  args: { id: v.id("scheduledJobs"), enabled: v.boolean() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { enabled: args.enabled });
    return { success: true };
  },
});

export const remove = mutation({
  args: { id: v.id("scheduledJobs") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
    return { success: true };
  },
});

export const runNow = mutation({
  args: {
    id: v.id("scheduledJobs"),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.id);
    if (!job) throw new Error("Scheduled job not found");
    const evaluation = await evaluateRunPolicy(ctx, job);
    if (!evaluation.allowed) {
      if (args.dryRun) {
        return { success: false, skipped: true, reason: evaluation.reason };
      }
      throw new Error(`Run policy blocked: ${evaluation.reason}`);
    }
    if (args.dryRun) {
      return { success: true, wouldRun: true, reason: evaluation.reason };
    }
    const now = Date.now();
    await ctx.db.patch(args.id, {
      lastRun: now,
      nextRun: parseNextRun(job.cronExpression, now),
    });
    if (job.jobType === "mission_prompt") {
      await ctx.scheduler.runAfter(0, api.mission.reversePrompt, {
        projectId: job.projectId ?? undefined,
        autoCreate: true,
        maxSuggestions: 3,
      });
    }
    await ctx.db.insert("activities", {
      projectId: job.projectId,
      actorType: "SYSTEM",
      action: "SCHEDULED_JOB_RUN_NOW",
      description: `Manually triggered scheduled job ${job.name}`,
      targetType: "SCHEDULED_JOB",
      targetId: args.id,
      metadata: { jobType: job.jobType, targetId: job.targetId },
    });
    return { success: true };
  },
});

export const executeDue = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const enabled = await ctx.db
      .query("scheduledJobs")
      .withIndex("by_enabled", (q) => q.eq("enabled", true))
      .collect();
    // Sort by priority (1=critical first), then by nextRun
    const due = enabled
      .filter((j) => j.nextRun <= now)
      .sort((a, b) => (a.priority ?? 3) - (b.priority ?? 3) || a.nextRun - b.nextRun);
    let executed = 0;
    for (const job of due) {
      const evaluation = await evaluateRunPolicy(ctx, job);
      if (!evaluation.allowed) continue;
      executed += 1;
      await ctx.db.patch(job._id, {
        lastRun: now,
        nextRun: parseNextRun(job.cronExpression, now),
      });

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
