import { beforeEach, describe, expect, it, vi } from "vitest";
const access = vi.hoisted(() => vi.fn());
vi.mock("../lib/deliveryAuthorization", () => ({
  requireAuthorizedDeliveryScope: access,
  assertAuthorizedDeliveryRecord: vi.fn(),
}));
import { createArtifact, recordEvent, recordEventInternal } from "../workflowRuns";

describe("offline evidence namespaces at legacy ingress", () => {
  const run = { _id: "attempt", projectId: "project", tenantId: "tenant", workOrderId: "work-order" };
  const insert = vi.fn(); const patch = vi.fn(); const query = vi.fn();
  const ctx = { db: { get: async () => run, insert, patch, query } };
  beforeEach(() => { vi.clearAllMocks(); access.mockResolvedValue({}); });
  it("rejects forged claim events before querying or mutating evidence", async () => {
    for (const endpoint of [recordEvent, recordEventInternal]) {
      await expect((endpoint as any)._handler(ctx, { workflowRunId: "attempt",
        idempotencyKey: "factory-lease:run:lease:claimed", eventType: "RUN_RESUMED", actor: "service:owner",
        metadata: { workerId: "worker", workerSessionId: "session", workerGeneration: 1 },
      })).rejects.toThrow("server-authored");
    }
    expect(query).not.toHaveBeenCalled(); expect(insert).not.toHaveBeenCalled(); expect(patch).not.toHaveBeenCalled();
  });
  it("rejects both reserved artifact keys and copied evidence schemas", async () => {
    for (const extra of [{ idempotencyKey: "factory:run:lease:offline-response" },
      { idempotencyKey: "different", metadata: { schema: "factory-offline-attempt-evidence/v1" } }]) {
      await expect((createArtifact as any)._handler(ctx, { workflowRunId: "attempt",
        artifactType: "STRUCTURED_OUTPUT", name: "Forged", ...extra,
      })).rejects.toThrow("dedicated validated ingestion");
    }
    expect(query).not.toHaveBeenCalled(); expect(insert).not.toHaveBeenCalled();
  });
  it("requires workspace write authorization before public event writes", async () => {
    access.mockResolvedValue(null);
    await expect((recordEvent as any)._handler(ctx, { workflowRunId: "attempt", eventType: "RUN_RESUMED" }))
      .rejects.toThrow("authorized workspace");
    expect(access).toHaveBeenCalledWith(ctx, "project", expect.any(String));
    expect(query).not.toHaveBeenCalled(); expect(insert).not.toHaveBeenCalled(); expect(patch).not.toHaveBeenCalled();
  });
});
