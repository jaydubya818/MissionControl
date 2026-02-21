import { v } from "convex/values";
import { mutation, query, action } from "./_generated/server";
import { api } from "./_generated/api";

function buildCollectionId(): string {
  return `col_${Math.random().toString(36).slice(2, 10)}`;
}

export const list = query({
  args: {
    projectId: v.optional(v.id("projects")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return args.projectId
      ? await ctx.db.query("apiCollections").withIndex("by_project", (q) => q.eq("projectId", args.projectId)).order("desc").take(args.limit ?? 50)
      : await ctx.db.query("apiCollections").order("desc").take(args.limit ?? 50);
  },
});

export const get = query({
  args: { id: v.id("apiCollections") },
  handler: async (ctx, args) => await ctx.db.get(args.id),
});

export const importCollection = mutation({
  args: {
    projectId: v.optional(v.id("projects")),
    importedBy: v.string(),
    name: v.string(),
    collectionType: v.union(
      v.literal("postman"),
      v.literal("bruno"),
      v.literal("soapui"),
      v.literal("openapi")
    ),
    raw: v.any(),
  },
  handler: async (ctx, args) => {
    const steps = Array.isArray((args.raw as { steps?: unknown[] })?.steps)
      ? ((args.raw as { steps: unknown[] }).steps as Record<string, unknown>[])
      : [];

    const collectionId = buildCollectionId();
    const id = await ctx.db.insert("apiCollections", {
      tenantId: undefined,
      projectId: args.projectId,
      collectionId,
      name: args.name,
      collectionType: args.collectionType,
      steps,
      importedBy: args.importedBy,
      importedAt: Date.now(),
      totalSteps: steps.length,
      metadata: { rawPreview: JSON.stringify(args.raw).slice(0, 1000) },
    });
    return { id, collectionId, totalSteps: steps.length };
  },
});

export const remove = mutation({
  args: { id: v.id("apiCollections") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
    return { success: true };
  },
});

export const convertToTests: any = action({
  args: {
    id: v.id("apiCollections"),
    createdBy: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<any> => {
    const collection = await ctx.runQuery(api.apiCollections.get, { id: args.id });
    if (!collection) throw new Error("Collection not found");
    const suite = await ctx.runMutation(api.testGeneration.create, {
      projectId: collection.projectId,
      createdBy: args.createdBy,
      name: `${collection.name} Test Suite`,
      description: `Generated from ${collection.collectionType} collection`,
      testType: "api_functional",
      apiTests: collection.steps,
      uiTests: [],
      gherkinFeature: `Feature: ${collection.name}\n  Scenario: Generated from imported API collection`,
      tags: ["api-import"],
    });
    return suite;
  },
});
