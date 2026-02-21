import { v } from "convex/values";
import { mutation, query, action } from "./_generated/server";
import { api } from "./_generated/api";

function buildSuiteId(): string {
  return `suite_${Math.random().toString(36).slice(2, 10)}`;
}

type SourcePayload = Record<string, unknown>;

function generateApiSteps(sourceData: SourcePayload): Array<Record<string, unknown>> {
  const endpoints = Array.isArray(sourceData.endpoints) ? sourceData.endpoints : [];
  return endpoints.map((endpoint, idx) => ({
    title: `API Step ${idx + 1}`,
    method: (endpoint as { method?: string }).method ?? "GET",
    url: (endpoint as { url?: string }).url ?? "/",
    headers: {},
    asserts: [{ type: "status", expected: 200 }],
  }));
}

function generateUiSteps(sourceData: SourcePayload): string[] {
  const interactions = Array.isArray(sourceData.interactions) ? sourceData.interactions : [];
  return interactions.map((entry) => `await page.${String((entry as { action?: string }).action ?? "waitForTimeout")}(100);`);
}

export const list = query({
  args: {
    projectId: v.optional(v.id("projects")),
    testType: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const suites = args.projectId
      ? await ctx.db.query("testSuites").withIndex("by_project", (q) => q.eq("projectId", args.projectId)).order("desc").take(args.limit ?? 100)
      : await ctx.db.query("testSuites").order("desc").take(args.limit ?? 100);
    return args.testType ? suites.filter((suite) => suite.testType === args.testType) : suites;
  },
});

export const get = query({
  args: { id: v.id("testSuites") },
  handler: async (ctx, args) => await ctx.db.get(args.id),
});

export const create = mutation({
  args: {
    projectId: v.optional(v.id("projects")),
    createdBy: v.optional(v.string()),
    name: v.string(),
    description: v.optional(v.string()),
    testType: v.union(
      v.literal("api_functional"),
      v.literal("api_integration"),
      v.literal("ui_functional"),
      v.literal("ui_e2e"),
      v.literal("hybrid_workflow"),
      v.literal("performance"),
      v.literal("security")
    ),
    apiTests: v.optional(v.array(v.any())),
    uiTests: v.optional(v.array(v.string())),
    gherkinFeature: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const suiteId = buildSuiteId();
    const id = await ctx.db.insert("testSuites", {
      tenantId: undefined,
      projectId: args.projectId,
      suiteId,
      name: args.name,
      description: args.description,
      testType: args.testType,
      apiTests: args.apiTests,
      uiTests: args.uiTests,
      gherkinFeature: args.gherkinFeature,
      executionMode: args.testType.includes("api")
        ? "api_only"
        : args.testType.includes("ui")
          ? "ui_only"
          : "hybrid",
      retryEnabled: true,
      timeoutSeconds: 300,
      tags: args.tags,
      createdBy: args.createdBy,
      status: "READY",
    });
    return { id, suiteId };
  },
});

export const generate: any = action({
  args: {
    projectId: v.optional(v.id("projects")),
    createdBy: v.optional(v.string()),
    testType: v.union(
      v.literal("api_functional"),
      v.literal("api_integration"),
      v.literal("ui_functional"),
      v.literal("ui_e2e"),
      v.literal("hybrid_workflow"),
      v.literal("performance"),
      v.literal("security")
    ),
    sourceData: v.any(),
    suiteName: v.optional(v.string()),
    autoExecute: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<any> => {
    const sourceData = (args.sourceData ?? {}) as SourcePayload;
    const apiTests = generateApiSteps(sourceData);
    const uiTests = generateUiSteps(sourceData);
    const gherkin = `Feature: ${args.suiteName ?? "Generated test suite"}\n  Scenario: Auto-generated`;

    const created: any = await ctx.runMutation(api.testGeneration.create, {
      projectId: args.projectId,
      createdBy: args.createdBy,
      name: args.suiteName ?? "Generated Test Suite",
      description: "Automatically generated from source payload",
      testType: args.testType,
      apiTests,
      uiTests,
      gherkinFeature: gherkin,
      tags: ["generated"],
    });

    let executionResult: Record<string, unknown> | undefined;
    if (args.autoExecute) {
      if (args.testType === "hybrid_workflow") {
        executionResult = await ctx.runAction(api.execution.executeHybrid, {
          projectId: args.projectId,
          executedBy: args.createdBy,
          apiSteps: apiTests.map((step, index) => ({ name: String(step.title ?? `step-${index + 1}`) })),
          uiCommands: uiTests,
        });
      } else if (args.testType.includes("api")) {
        executionResult = await ctx.runAction(api.execution.executeApi, {
          projectId: args.projectId,
          executedBy: args.createdBy,
          steps: apiTests.map((step, index) => ({ name: String(step.title ?? `step-${index + 1}`) })),
        });
      } else {
        executionResult = await ctx.runAction(api.execution.executeUi, {
          projectId: args.projectId,
          executedBy: args.createdBy,
          commands: uiTests,
        });
      }
    }

    return {
      suiteId: created.suiteId,
      id: created.id,
      testType: args.testType,
      generated: {
        apiTests: apiTests.length,
        uiTests: uiTests.length,
      },
      executionResult,
    };
  },
});

export const execute = action({
  args: {
    id: v.id("testSuites"),
    executedBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const suite = await ctx.runQuery(api.testGeneration.get, { id: args.id });
    if (!suite) throw new Error("Test suite not found");

    let executionResult: Record<string, unknown>;
    if (suite.testType === "hybrid_workflow") {
      executionResult = await ctx.runAction(api.execution.executeHybrid, {
        projectId: suite.projectId,
        executedBy: args.executedBy,
        apiSteps: (suite.apiTests ?? []).map((step: any, index: number) => ({ name: String(step.title ?? `step-${index + 1}`) })),
        uiCommands: suite.uiTests ?? [],
      });
    } else if (suite.testType.includes("api")) {
      executionResult = await ctx.runAction(api.execution.executeApi, {
        projectId: suite.projectId,
        executedBy: args.executedBy,
        steps: (suite.apiTests ?? []).map((step: any, index: number) => ({ name: String(step.title ?? `step-${index + 1}`) })),
      });
    } else {
      executionResult = await ctx.runAction(api.execution.executeUi, {
        projectId: suite.projectId,
        executedBy: args.executedBy,
        commands: suite.uiTests ?? [],
      });
    }

    await ctx.runMutation(api.execution.storeResult, {
      projectId: suite.projectId,
      executionType: suite.executionMode === "hybrid" ? "hybrid" : suite.executionMode === "api_only" ? "api" : "ui",
      suiteId: args.id,
      steps: (executionResult.steps as unknown[]) ?? [],
      totalTime: Number(executionResult.totalTime ?? 0),
      passed: Number(executionResult.passed ?? 0),
      failed: Number(executionResult.failed ?? 0),
      success: Boolean(executionResult.success),
      context: executionResult.context,
      executedBy: args.executedBy,
    });

    return executionResult;
  },
});
