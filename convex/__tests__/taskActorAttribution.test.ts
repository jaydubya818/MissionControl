import { describe, expect, it } from "vitest";
import { transition, assign } from "../tasks";

function functionHandler<T extends (...args: any[]) => any>(registered: unknown): T {
  return (registered as { _handler: T })._handler;
}

/**
 * Minimal anonymous context: no identity, and no company memberships to find.
 * The point of these tests is that a HUMAN-attributed write cannot proceed on a
 * caller-supplied name.
 */
function anonymousCtx() {
  const cursor: any = {
    withIndex: () => cursor,
    filter: () => cursor,
    collect: async () => [],
    first: async () => null,
    order: () => cursor,
    take: async () => [],
  };
  return {
    auth: { getUserIdentity: async () => null },
    db: {
      get: async () => null,
      query: () => cursor,
      insert: async () => "row-1",
      patch: async () => undefined,
    },
  } as any;
}

describe("task actor attribution", () => {
  it("refuses a HUMAN transition attributed by the caller", async () => {
    // Regression: `actorUserId` was a caller-supplied string written straight
    // into `activities.actorId`, and every UI call site sent "operator". Anyone
    // with the deployment URL could transition a task under any name.
    await expect(
      functionHandler(transition)(anonymousCtx(), {
        taskId: "task-1",
        toStatus: "READY",
        actorType: "HUMAN",
        actorUserId: "ceo@example.com",
        idempotencyKey: "k1",
      }),
    ).rejects.toThrow(/Authentication is required|unavailable or unauthorized/i);
  });

  it("refuses a HUMAN assignment attributed by the caller", async () => {
    await expect(
      functionHandler(assign)(anonymousCtx(), {
        taskId: "task-1",
        agentIds: [],
        actorType: "HUMAN",
        actorUserId: "ceo@example.com",
        idempotencyKey: "k2",
      }),
    ).rejects.toThrow(/Authentication is required|unavailable or unauthorized/i);
  });
});
