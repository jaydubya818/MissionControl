import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const taskmasterRequire = createRequire(require.resolve("@taskmasterai/cli"));
const taskmasterRoot = path.dirname(taskmasterRequire.resolve("@taskmasterai/cli/package.json"));
const taskmasterZodPath = pathToFileURL(taskmasterRequire.resolve("zod")).href;
const taskmasterAiSdkPath = pathToFileURL(path.join(path.dirname(taskmasterRequire.resolve("ai/package.json")), "dist/index.mjs")).href;
const taskmasterAiModulePath = pathToFileURL(path.join(taskmasterRoot, "src/lib/ai.js")).href;
const originalFetch = globalThis.fetch;
const plannedTasks = {
  tasks: [
    {
      title: "Initialize workspace",
      description: "Create the project structure required by the PRD.",
      priority: "high",
      details: "Add package manifests and the operator shell entrypoint.",
      testStrategy: "Inspect the created files and run the typecheck command.",
    },
  ],
};

function planningSchema(z) {
  const taskSchema = z.object({
    title: z.string().describe("Clear, concise task title"),
    description: z.string().describe("Detailed description of what needs to be done"),
    status: z.enum(["pending", "in-progress", "done", "blocked", "cancelled", "deferred"]).default("pending").describe("Task status"),
    priority: z.enum(["high", "medium", "low"]).describe("Task priority level"),
    dependencies: z.array(z.number()).default([]).describe("IDs of tasks this depends on"),
    details: z.string().describe("Implementation details and technical considerations"),
    testStrategy: z.string().describe("How to verify this task is complete"),
  });
  return z.object({
    tasks: z.array(taskSchema).describe("Array of generated tasks"),
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
  globalThis.fetch = originalFetch;
});

describe("Taskmaster planning path under the repository Zod override", () => {
  it("resolves Zod 4.6.6 for Taskmaster and parses the generateTasksFromPRD schema", async () => {
    const { version } = require(taskmasterRequire.resolve("zod/package.json"));
    expect(version).toBe("4.6.6");

    const { z } = await import(taskmasterZodPath);
    expect(planningSchema(z).parse(plannedTasks)).toMatchObject({
      tasks: [{ title: "Initialize workspace", status: "pending", dependencies: [] }],
    });
  });

  it("validates generateTasksFromPRD output through AI SDK generateObject on Zod 4", async () => {
    const { z } = await import(taskmasterZodPath);
    const { generateObject } = await import(taskmasterAiSdkPath);
    const result = await generateObject({
      model: {
        specificationVersion: "v2",
        provider: "mock",
        modelId: "taskmaster-planning-zod-smoke",
        supportedUrls: {},
        async doGenerate() {
          return {
            finishReason: "stop",
            usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
            content: [{ type: "text", text: JSON.stringify(plannedTasks) }],
            warnings: [],
          };
        },
        async doStream() {
          throw new Error("stream unused");
        },
      },
      schema: planningSchema(z),
      prompt: "Analyze the following PRD and generate exactly 1 development tasks.",
    });
    expect(result.object.tasks).toEqual([
      {
        title: "Initialize workspace",
        description: "Create the project structure required by the PRD.",
        status: "pending",
        priority: "high",
        dependencies: [],
        details: "Add package manifests and the operator shell entrypoint.",
        testStrategy: "Inspect the created files and run the typecheck command.",
      },
    ]);
  });

  it("runs Taskmaster generateTasksFromPRD through generateObject on the installed Zod 4 schema", async () => {
    const requests = [];
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-api03-taskmaster-zod-smoke-key");
    globalThis.fetch = async (_input, init) => {
      const body = JSON.parse(init.body);
      requests.push(body);
      return new Response(JSON.stringify({
        id: "msg_test",
        type: "message",
        role: "assistant",
        model: "claude-sonnet-4-5-20250929",
        content: [{ type: "tool_use", id: "toolu_test", name: "json", input: plannedTasks }],
        stop_reason: "tool_use",
        usage: { input_tokens: 10, output_tokens: 20 },
      }), { status: 200, headers: { "content-type": "application/json" } });
    };

    const { generateTasksFromPRD } = await import(taskmasterAiModulePath);
    const tasks = await generateTasksFromPRD(
      "Operators own intent and approval. Agents execute bounded software-change work orders with evidence.",
      { numTasks: 1 },
    );

    expect(requests).toHaveLength(1);
    expect(requests[0].messages[0].content[0].text).toContain("generate exactly 1 development tasks");
    expect(requests[0].tools[0]).toMatchObject({
      name: "json",
      input_schema: {
        type: "object",
        required: ["tasks"],
        properties: {
          tasks: {
            type: "array",
            items: {
              type: "object",
              required: ["title", "description", "priority", "details", "testStrategy"],
            },
          },
        },
      },
    });
    expect(tasks).toEqual([
      {
        title: "Initialize workspace",
        description: "Create the project structure required by the PRD.",
        status: "pending",
        priority: "high",
        dependencies: [],
        details: "Add package manifests and the operator shell entrypoint.",
        testStrategy: "Inspect the created files and run the typecheck command.",
      },
    ]);
  });
});
