import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { logTaskEvent } from "./lib/taskEvents";

const riskLevelValidator = v.union(
  v.literal("GREEN"),
  v.literal("YELLOW"),
  v.literal("RED")
);

const toolStatusValidator = v.union(
  v.literal("PENDING"),
  v.literal("RUNNING"),
  v.literal("SUCCESS"),
  v.literal("FAILED"),
  v.literal("DENIED")
);

export const listByRun = query({
  args: {
    runId: v.id("runs"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("toolCalls")
      .withIndex("by_run", (q) => q.eq("runId", args.runId))
      .order("desc")
      .take(args.limit ?? 100);
  },
});

export const listByTask = query({
  args: {
    taskId: v.id("tasks"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("toolCalls")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .order("desc")
      .take(args.limit ?? 200);
  },
});

export const start = mutation({
  args: {
    runId: v.id("runs"),
    toolName: v.string(),
    toolVersion: v.optional(v.string()),
    riskLevel: riskLevelValidator,
    policyResult: v.optional(v.object({
      decision: v.string(),
      reason: v.string(),
      approvalId: v.optional(v.string()),
    })),
    inputPreview: v.optional(v.string()),
    inputHash: v.optional(v.string()),
    taskId: v.optional(v.id("tasks")),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) {
      throw new Error("Run not found");
    }

    const taskId = args.taskId ?? run.taskId ?? undefined;
    const startedAt = Date.now();

    const toolCallId = await ctx.db.insert("toolCalls", {
      projectId: run.projectId,
      runId: args.runId,
      agentId: run.agentId,
      taskId,
      toolName: args.toolName,
      toolVersion: args.toolVersion,
      riskLevel: args.riskLevel,
      policyResult: args.policyResult,
      inputPreview: args.inputPreview,
      inputHash: args.inputHash,
      startedAt,
      status: "RUNNING",
      retryCount: 0,
    });

    if (taskId) {
      await logTaskEvent(ctx, {
        taskId,
        projectId: run.projectId,
        eventType: "TOOL_CALL",
        actorType: "AGENT",
        actorId: String(run.agentId),
        relatedId: String(toolCallId),
        afterState: { status: "RUNNING" },
        metadata: {
          phase: "START",
          toolName: args.toolName,
          riskLevel: args.riskLevel,
          decision: args.policyResult?.decision,
          reason: args.policyResult?.reason,
        },
      });
    }

    return {
      toolCall: await ctx.db.get(toolCallId),
      created: true,
    };
  },
});

export const complete = mutation({
  args: {
    toolCallId: v.id("toolCalls"),
    status: toolStatusValidator,
    outputPreview: v.optional(v.string()),
    outputHash: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const toolCall = await ctx.db.get(args.toolCallId);
    if (!toolCall) {
      throw new Error("Tool call not found");
    }

    const endedAt = Date.now();

    await ctx.db.patch(args.toolCallId, {
      status: args.status,
      outputPreview: args.outputPreview,
      outputHash: args.outputHash,
      error: args.error,
      endedAt,
      durationMs: endedAt - toolCall.startedAt,
    });

    if (toolCall.taskId) {
      await logTaskEvent(ctx, {
        taskId: toolCall.taskId,
        projectId: toolCall.projectId,
        eventType: "TOOL_CALL",
        actorType: "AGENT",
        actorId: String(toolCall.agentId),
        relatedId: String(args.toolCallId),
        beforeState: { status: "RUNNING" },
        afterState: { status: args.status },
        metadata: {
          phase: "END",
          toolName: toolCall.toolName,
          riskLevel: toolCall.riskLevel,
          error: args.error,
        },
      });
    }

    return {
      success: true,
      toolCall: await ctx.db.get(args.toolCallId),
    };
  },
});
