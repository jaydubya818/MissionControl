import { describe, expect, it, vi } from "vitest";
import { claimInternal, heartbeatInternal, finalizeInternal, reportInternal } from "../executionWorker";

type Handler = { _handler: (ctx: any, args: any) => Promise<any> };
const invoke = (mutation: unknown, ctx: unknown, args: unknown) => (mutation as Handler)._handler(ctx, args);
const legacyRun = () => ({
  _id: "attempt", status: "RUNNING", executionClaimId: "claim", executionLeaseExpiresAt: Date.now() + 60_000,
  factoryDefinitionVersionId: "version", executorAdapter: "codex", executorVersion: "v1",
  projectId: "project", workOrderId: "order", parentTaskId: "task", worktree: "/qualification", branch: "mc/qualification",
});

describe("Legacy worker endpoint authority", () => {
  it.each([
    { executionManifest: { repository: { baseSha: "a".repeat(40) } } },
    { executionManifestDigest: `sha256:${"b".repeat(64)}` },
    { lease: { leaseId: "canonical-lease" } },
  ])("keeps canonical Attempts on their canonical endpoints: %j", async marker => {
    const run = { ...legacyRun(), ...marker };
    const patch = vi.fn(); const db = { get: vi.fn(async () => run), patch };
    for (const mutation of [heartbeatInternal, finalizeInternal, reportInternal]) {
      await expect(invoke(mutation, { db }, {
        workflowRunId: "attempt", claimId: "claim", leaseDurationMs: 60_000,
        status: "COMPLETED", summary: "Fixture", events: [],
      })).rejects.toThrow("Canonical Factory Attempts");
    }
    expect(patch).not.toHaveBeenCalled();
    const query: any = { withIndex: () => query, collect: async () => [run] };
    expect(await invoke(claimInternal, { db: { query: () => query } }, {
      projectId: "project", repositoryId: "repository", workerId: "worker", claimId: "new", leaseDurationMs: 60_000,
    })).toBeNull();
  });

  it("continues to renew a legacy Factory execution with its legacy claim", async () => {
    const patch = vi.fn();
    await invoke(heartbeatInternal, { db: { get: async () => legacyRun(), patch } }, {
      workflowRunId: "attempt", claimId: "claim", leaseDurationMs: 60_000,
    });
    expect(patch).toHaveBeenCalledOnce();
  });
});
