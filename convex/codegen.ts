import { v } from "convex/values";
import { mutation, query, action } from "./_generated/server";
import { api } from "./_generated/api";

function buildRequestId(): string {
  return `cg_${Math.random().toString(36).slice(2, 10)}`;
}

function makeMockDiff(filePath: string, prompt: string): string {
  return [
    `--- a/${filePath}`,
    `+++ b/${filePath}`,
    "@@",
    `+// CodeGen suggestion: ${prompt}`,
  ].join("\n");
}

export const list = query({
  args: {
    projectId: v.optional(v.id("projects")),
    status: v.optional(v.union(v.literal("PENDING"), v.literal("GENERATING"), v.literal("COMPLETED"), v.literal("FAILED"))),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const rows = args.projectId
      ? await ctx.db.query("codegenRequests").withIndex("by_project", (q) => q.eq("projectId", args.projectId)).order("desc").take(args.limit ?? 50)
      : await ctx.db.query("codegenRequests").order("desc").take(args.limit ?? 50);
    return args.status ? rows.filter((row) => row.status === args.status) : rows;
  },
});

export const get = query({
  args: { id: v.id("codegenRequests") },
  handler: async (ctx, args) => await ctx.db.get(args.id),
});

export const requestPatch = mutation({
  args: {
    projectId: v.optional(v.id("projects")),
    filePath: v.string(),
    prompt: v.string(),
    requestedBy: v.string(),
  },
  handler: async (ctx, args) => {
    const requestId = buildRequestId();
    const id = await ctx.db.insert("codegenRequests", {
      tenantId: undefined,
      projectId: args.projectId,
      requestId,
      filePath: args.filePath,
      prompt: args.prompt,
      status: "PENDING",
      requestedBy: args.requestedBy,
      createdAt: Date.now(),
    });
    return { id, requestId };
  },
});

export const generateDiff = action({
  args: { id: v.id("codegenRequests") },
  handler: async (ctx, args) => {
    const request = await ctx.runQuery(api.codegen.get, { id: args.id });
    if (!request) throw new Error("CodeGen request not found");

    await ctx.runMutation(api.codegen.updateStatus, { id: args.id, status: "GENERATING" });
    const diff = makeMockDiff(request.filePath, request.prompt);

    await ctx.runMutation(api.codegen.complete, {
      id: args.id,
      diff,
      branchName: `patch/${request.requestId}`,
      commitHash: `mock-${Date.now()}`,
      prUrl: `https://github.com/mock-org/mock-repo/pull/${Math.floor(Math.random() * 9000) + 1000}`,
    });

    return { success: true, diff };
  },
});

export const applyAndPR: any = action({
  args: { id: v.id("codegenRequests") },
  handler: async (ctx, args): Promise<any> => {
    const request = await ctx.runQuery(api.codegen.get, { id: args.id });
    if (!request) throw new Error("CodeGen request not found");
    if (!request.prUrl) {
      await ctx.runAction(api.codegen.generateDiff, { id: args.id });
    }
    const latest = await ctx.runQuery(api.codegen.get, { id: args.id });
    return { success: true, prUrl: latest?.prUrl, branchName: latest?.branchName };
  },
});

export const updateStatus = mutation({
  args: {
    id: v.id("codegenRequests"),
    status: v.union(v.literal("PENDING"), v.literal("GENERATING"), v.literal("COMPLETED"), v.literal("FAILED")),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { status: args.status });
    return { success: true };
  },
});

export const complete = mutation({
  args: {
    id: v.id("codegenRequests"),
    diff: v.string(),
    branchName: v.string(),
    commitHash: v.string(),
    prUrl: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      status: "COMPLETED",
      diff: args.diff,
      branchName: args.branchName,
      commitHash: args.commitHash,
      prUrl: args.prUrl,
      completedAt: Date.now(),
    });
    return { success: true };
  },
});
