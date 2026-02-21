import { v } from "convex/values";
import { mutation, query, action } from "./_generated/server";

function buildResultId(): string {
  return `exec_${Math.random().toString(36).slice(2, 10)}`;
}

function evaluateSteps(steps: Array<{ name: string; shouldFail?: boolean }>) {
  const startedAt = Date.now();
  const evaluated = steps.map((step, index) => ({
    step: step.name,
    status: step.shouldFail ? "failed" : "passed",
    responseTimeMs: 60 + index * 20,
    error: step.shouldFail ? "Simulated failure" : undefined,
  }));
  const passed = evaluated.filter((s) => s.status === "passed").length;
  const failed = evaluated.length - passed;
  return {
    evaluated,
    passed,
    failed,
    success: failed === 0,
    totalTime: Date.now() - startedAt + evaluated.length * 10,
  };
}

export const list = query({
  args: {
    projectId: v.optional(v.id("projects")),
    executionType: v.optional(v.union(v.literal("api"), v.literal("ui"), v.literal("hybrid"))),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const rows = args.projectId
      ? await ctx.db.query("executionResults").withIndex("by_project", (q) => q.eq("projectId", args.projectId)).order("desc").take(args.limit ?? 50)
      : await ctx.db.query("executionResults").order("desc").take(args.limit ?? 50);
    return args.executionType ? rows.filter((row) => row.executionType === args.executionType) : rows;
  },
});

export const get = query({
  args: { id: v.id("executionResults") },
  handler: async (ctx, args) => await ctx.db.get(args.id),
});

export const executeApi = action({
  args: {
    projectId: v.optional(v.id("projects")),
    executedBy: v.optional(v.string()),
    steps: v.array(v.object({ name: v.string(), shouldFail: v.optional(v.boolean()) })),
  },
  handler: async (_ctx, args) => {
    const result = evaluateSteps(args.steps.map((step) => ({ name: step.name, shouldFail: step.shouldFail })));
    return { ...result };
  },
});

export const executeUi = action({
  args: {
    projectId: v.optional(v.id("projects")),
    executedBy: v.optional(v.string()),
    commands: v.array(v.string()),
  },
  handler: async (_ctx, args) => {
    const steps = args.commands.map((command) => ({ step: command, status: "passed", responseTimeMs: 80 })) as Array<{ step: string; status: string; responseTimeMs: number }>;
    return {
      success: true,
      passed: steps.length,
      failed: 0,
      totalTime: steps.length * 80,
      steps,
    };
  },
});

export const executeHybrid = action({
  args: {
    projectId: v.optional(v.id("projects")),
    executedBy: v.optional(v.string()),
    apiSteps: v.array(v.object({ name: v.string(), shouldFail: v.optional(v.boolean()) })),
    uiCommands: v.array(v.string()),
  },
  handler: async (_ctx, args) => {
    const api = evaluateSteps(args.apiSteps);
    const uiPassed = args.uiCommands.length;
    const failed = api.failed;
    return {
      success: failed === 0,
      passed: api.passed + uiPassed,
      failed,
      totalTime: api.totalTime + uiPassed * 75,
      context: { apiContextReady: api.success },
      steps: [
        ...api.evaluated,
        ...args.uiCommands.map((command) => ({ step: command, status: "passed", responseTimeMs: 75 })),
      ],
    };
  },
});

export const storeResult = mutation({
  args: {
    projectId: v.optional(v.id("projects")),
    executionType: v.union(v.literal("api"), v.literal("ui"), v.literal("hybrid")),
    suiteId: v.optional(v.id("testSuites")),
    workflowId: v.optional(v.id("hybridWorkflows")),
    jobId: v.optional(v.id("scheduledJobs")),
    steps: v.array(v.any()),
    totalTime: v.number(),
    passed: v.number(),
    failed: v.number(),
    success: v.boolean(),
    context: v.optional(v.any()),
    executedBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const resultId = buildResultId();
    const id = await ctx.db.insert("executionResults", {
      tenantId: undefined,
      projectId: args.projectId,
      resultId,
      executionType: args.executionType,
      suiteId: args.suiteId,
      workflowId: args.workflowId,
      jobId: args.jobId,
      steps: args.steps,
      totalTime: args.totalTime,
      passed: args.passed,
      failed: args.failed,
      success: args.success,
      context: args.context,
      executedAt: Date.now(),
      executedBy: args.executedBy,
    });
    return { id, resultId };
  },
});
