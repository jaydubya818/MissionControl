import { describe, expect, it } from "vitest";
import { CODEX_V1_HARNESS_MANIFEST, type ExecutorEvent } from "@mission-control/workflow-engine";
import { mapExecutorObservations } from "../factoryAttemptWorker.js";

describe("Factory executor observability", () => {
  it("maps Codex into nested agent, generation, and tool boundaries without raw prompts or invented usage", () => {
    const events: ExecutorEvent[] = [
      { executionId: "x", sequence: 1, type: "EXECUTION_STARTED", occurredAt: 100, summary: "started" },
      { executionId: "x", sequence: 2, type: "COMMAND_STARTED", occurredAt: 120, summary: "command" },
      { executionId: "x", sequence: 3, type: "COMMAND_COMPLETED", occurredAt: 180, summary: "complete", metadata: { exitCode: 0 } },
      { executionId: "x", sequence: 4, type: "EXECUTION_COMPLETED", occurredAt: 200, summary: "done" },
    ];
    const observations = mapExecutorObservations({
      runId: "run-1",
      events,
      harness: { adapter: "codex", version: "v1", displayName: "Codex CLI" },
      provider: "openai",
      model: "gpt-fixture",
      promptDigest: "sha256:fixture-digest",
      promptVersion: "factory-v1",
    });

    expect(observations.map((observation) => observation.type)).toEqual(["AGENT", "GENERATION", "TOOL"]);
    expect(observations[1]).toMatchObject({
      parentIdempotencyKey: observations[0].idempotencyKey,
      model: "gpt-fixture",
      provider: "openai",
      promptVersion: "factory-v1",
      input: { promptDigest: "sha256:fixture-digest" },
    });
    expect(observations[2]).toMatchObject({
      parentIdempotencyKey: observations[1].idempotencyKey,
      startedAt: 120,
      endedAt: 180,
      toolName: "codex/v1",
      status: "SUCCESS",
    });
    expect(JSON.stringify(observations)).not.toContain("compiledPrompt");
    expect(observations.every((observation) => observation.tokenUsage === undefined)).toBe(true);
    expect(observations.every((observation) => observation.estimatedCostUsd === undefined)).toBe(true);
  });

  it("keeps failed and incomplete command timing attributable", () => {
    const observations = mapExecutorObservations({
      runId: "run-failed",
      harness: { adapter: "loom", version: "v1", displayName: "Loom" },
      provider: "anthropic",
      events: [
        { executionId: "x", sequence: 1, type: "EXECUTION_STARTED", occurredAt: 100, summary: "started" },
        { executionId: "x", sequence: 2, type: "COMMAND_STARTED", occurredAt: 120, summary: "command" },
        { executionId: "x", sequence: 3, type: "EXECUTION_FAILED", occurredAt: 160, summary: "executor failed" },
      ],
      promptDigest: "sha256:fixture-digest",
    });

    expect(observations).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "AGENT", status: "FAILED", endedAt: 160 }),
      expect.objectContaining({ type: "GENERATION", status: "FAILED", endedAt: 160 }),
      expect.objectContaining({
        type: "TOOL",
        parentIdempotencyKey: "harness-generation:run-failed:primary",
        status: "FAILED",
        startedAt: 120,
        error: { message: "executor failed" },
      }),
    ]));
  });
});
