import { describe, expect, it, vi } from "vitest";
import { upsert } from "../workflows";
import { start } from "../workflowRuns";

const handler = (registered: unknown) => (registered as { _handler: (ctx: any, args: any) => Promise<unknown> })._handler;

describe("deterministic workflow entry-point authority", () => {
  it.each([{ projectId: "workspace-1" }, { contractVersion: "factory-workflow-contract/v1" }, { contractVersion: "factory-workflow-contract/v2" }])(
    "rejects legacy replacement of a production identity %j before any write", async owned => {
      const patch = vi.fn();
      const insert = vi.fn();
      const context = { db: { query: () => ({ withIndex: () => ({ first: async () => ({ _id: "workflow-1", ...owned }) }) }), patch, insert } };
      await expect(handler(upsert)(context, { workflowId: "owned-workflow" })).rejects.toThrow("authorized production registration");
      expect(patch).not.toHaveBeenCalled();
      expect(insert).not.toHaveBeenCalled();
    },
  );
  it.each([undefined, "workspace-1"])("rejects generic deterministic run creation with project %s", async projectId => {
    const insert = vi.fn();
    const context = { db: { query: () => ({ withIndex: () => ({ first: async () => ({
      active: true, contractVersion: "factory-workflow-contract/v2", steps: [{ kind: "DETERMINISTIC" }],
    }) }) }), insert } };
    await expect(handler(start)(context, { workflowId: "synthetic-render", projectId })).rejects.toThrow("canonical WorkOrder");
    expect(insert).not.toHaveBeenCalled();
  });
});
