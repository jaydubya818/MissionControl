import { describe, expect, it, vi } from "vitest";
import {
  DEEPSEEK_V1_RUNTIME_ARTIFACT,
  GENERIC_HARNESS_CONTRACT_VERSION,
  NO_HARNESS_AUTHORITY,
  runHarnessExecution,
  type ExecutorRequest,
  type HarnessExecutorAdapter,
} from "../executorAdapter.js";

describe("Generic Harness Contract V1", () => {
  it("requires the complete execution-only lifecycle surface", () => {
    const request: ExecutorRequest = {
      executionId: "execution-1",
      repositoryRoot: "/tmp/repository",
      workingDirectory: "/tmp/repository",
      task: "Implement the approved change.",
      allowedPaths: ["src/**"],
      deniedPaths: ["src/auth/**"],
      timeoutMs: 60_000,
      isolation: "WORKSPACE_WRITE",
      provider: "openai",
      model: "gpt-5.6-terra",
    };
    const adapter = {} as HarnessExecutorAdapter;
    expect(request.isolation).toBe("WORKSPACE_WRITE");
    expectTypeOf(adapter.capabilityManifest).toBeFunction();
    expectTypeOf(adapter.validateConfiguration).toBeFunction();
    expectTypeOf(adapter.estimate).toBeFunction();
    expectTypeOf(adapter.prepare).toBeFunction();
    expectTypeOf(adapter.execute).toBeFunction();
    expectTypeOf(adapter.collectResult).toBeFunction();
    expectTypeOf(adapter.cancel).toBeFunction();
    expectTypeOf(adapter.cleanup).toBeFunction();
    expectTypeOf(adapter.health).toBeFunction();
  });

  it("runs prepare, execute, result collection, and mandatory cleanup in order", async () => {
    const lifecycle: string[] = [];
    const adapter: HarnessExecutorAdapter<ExecutorRequest, { request: ExecutorRequest }> = {
      capabilities: () => ({
        contractVersion: GENERIC_HARNESS_CONTRACT_VERSION,
        adapter: "deepseek-harness",
        version: "v1",
        displayName: "DeepSeek Harness fixture",
        provider: "fixture",
        runtimeArtifact: DEEPSEEK_V1_RUNTIME_ARTIFACT,
        executionBackends: ["persistent-worker"],
        authority: NO_HARNESS_AUTHORITY,
        supportsCancel: true,
        supportsResume: false,
        supportsRepositoryMutation: true,
        isolationModes: ["READ_ONLY", "WORKSPACE_WRITE"],
        emittedEvents: ["EXECUTION_STARTED", "EXECUTION_COMPLETED"],
      }),
      validateConfiguration: () => [],
      estimate: async () => ({ estimatedCostUsd: 0, estimatedRuntimeMinutes: 1, confidence: "LOW" }),
      prepare: async (request) => { lifecycle.push("prepare"); return request; },
      execute: async (request) => { lifecycle.push("execute"); return { request }; },
      collectResult: async ({ request }) => {
        lifecycle.push("collectResult");
        return { executionId: request.executionId, status: "COMPLETED", output: "candidate" };
      },
      cancel: async () => { lifecycle.push("cancel"); return true; },
      cleanup: async () => { lifecycle.push("cleanup"); },
      health: async () => ({
        status: "READY",
        checkedAt: Date.now(),
        adapter: "deepseek-harness",
        version: "v1",
      }),
    };
    const request: ExecutorRequest = {
      executionId: "execution-2",
      repositoryRoot: "/tmp/repository",
      workingDirectory: "/tmp/repository",
      prompt: "Implement the approved change.",
      allowedPaths: ["src/**"],
      timeoutMs: 60_000,
      isolation: "WORKSPACE_WRITE",
    };

    await expect(runHarnessExecution(adapter, request, { emit: () => undefined })).resolves.toMatchObject({
      executionId: "execution-2",
      status: "COMPLETED",
      output: "candidate",
    });
    expect(lifecycle).toEqual(["prepare", "execute", "collectResult", "cleanup"]);
  });

  it("still cleans up when result collection fails", async () => {
    const cleanup = vi.fn();
    const adapter = {
      prepare: async () => ({}),
      execute: async () => ({}),
      collectResult: async () => { throw new Error("result unavailable"); },
      cleanup,
    } as unknown as HarnessExecutorAdapter<Record<string, never>, Record<string, never>>;

    await expect(runHarnessExecution(adapter, {} as ExecutorRequest, { emit: () => undefined }))
      .rejects.toThrow("result unavailable");
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it("routes an aborted execution through handle-scoped cancellation before cleanup", async () => {
    const controller = new AbortController();
    let releaseResult!: () => void;
    const resultReady = new Promise<void>((resolve) => { releaseResult = resolve; });
    const lifecycle: string[] = [];
    const adapter = {
      prepare: async () => { lifecycle.push("prepare"); return {}; },
      execute: async () => { lifecycle.push("execute"); return { executionId: "execution-3" }; },
      collectResult: async () => {
        lifecycle.push("collectResult");
        await resultReady;
        return { executionId: "execution-3", status: "CANCELED" as const };
      },
      cancel: async () => { lifecycle.push("cancel"); releaseResult(); return true; },
      cleanup: async () => { lifecycle.push("cleanup"); },
    } as unknown as HarnessExecutorAdapter<Record<string, never>, { executionId: string }>;

    const execution = runHarnessExecution(adapter, {} as ExecutorRequest, {
      emit: () => undefined,
      signal: controller.signal,
    });
    controller.abort("worker-shutdown");

    await expect(execution).resolves.toMatchObject({ status: "CANCELED" });
    expect(lifecycle).toEqual(["prepare", "execute", "collectResult", "cancel", "cleanup"]);
  });
});
