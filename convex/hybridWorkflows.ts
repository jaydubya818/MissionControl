import { v } from "convex/values";
import { mutation, query, action } from "./_generated/server";
import { api } from "./_generated/api";
import { executionRunnerUnavailable } from "./execution";

function buildWorkflowId(): string {
  return `hyb_${Math.random().toString(36).slice(2, 10)}`;
}

export const list = query({
  args: {
    projectId: v.optional(v.id("projects")),
    activeOnly: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const rows = args.projectId
      ? await ctx.db.query("hybridWorkflows").withIndex("by_project", (q) => q.eq("projectId", args.projectId)).order("desc").take(args.limit ?? 50)
      : await ctx.db.query("hybridWorkflows").order("desc").take(args.limit ?? 50);
    return args.activeOnly ? rows.filter((row) => row.active) : rows;
  },
});

export const get = query({
  args: { id: v.id("hybridWorkflows") },
  handler: async (ctx, args) => await ctx.db.get(args.id),
});

export const getResults = query({
  args: { id: v.id("hybridWorkflows"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("executionResults")
      .withIndex("by_type", (q) => q.eq("executionType", "hybrid"))
      .order("desc")
      .take(args.limit ?? 20);
    return rows.filter((row) => row.workflowId === args.id);
  },
});

export const create = mutation({
  args: {
    projectId: v.optional(v.id("projects")),
    name: v.string(),
    description: v.optional(v.string()),
    apiSetupSteps: v.array(v.any()),
    uiValidationSteps: v.array(v.string()),
    executionMode: v.union(
      v.literal("api_only"),
      v.literal("ui_only"),
      v.literal("hybrid"),
      v.literal("auto_detect")
    ),
    stopOnFailure: v.optional(v.boolean()),
    timeoutSeconds: v.optional(v.number()),
    retryEnabled: v.optional(v.boolean()),
    createdBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const workflowId = buildWorkflowId();
    const id = await ctx.db.insert("hybridWorkflows", {
      tenantId: undefined,
      projectId: args.projectId,
      workflowId,
      name: args.name,
      description: args.description,
      apiSetupSteps: args.apiSetupSteps,
      uiValidationSteps: args.uiValidationSteps,
      executionMode: args.executionMode,
      stopOnFailure: args.stopOnFailure ?? false,
      timeoutSeconds: args.timeoutSeconds ?? 300,
      retryEnabled: args.retryEnabled ?? true,
      createdBy: args.createdBy,
      active: true,
    });
    return { id, workflowId };
  },
});

export const execute: any = action({
  args: {
    id: v.id("hybridWorkflows"),
    executedBy: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<never> => {
    const workflow = await ctx.runQuery(api.hybridWorkflows.get, { id: args.id });
    if (!workflow) throw new Error("Hybrid workflow not found");
    // Previously: `execution.executeHybrid` invented a per-step verdict for
    // every API step and marked every UI command "passed" without running one,
    // then persisted the totals to `executionResults`. Fail closed instead.
    throw executionRunnerUnavailable();
  },
});
