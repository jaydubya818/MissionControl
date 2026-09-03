import { describe, expect, it, vi } from "vitest";
import { requireFactoryActionWithAudit } from "../lib/factoryActionAuthorization";

/**
 * Characterization tests for requireFactoryActionWithAudit, which had zero
 * test coverage. It is a write-guarding function: every factory action that
 * uses it depends on the allow/deny/audit behavior pinned here.
 */

const projectId = "project1" as any;
const permission = "factory.read" as any;

function fakeCtx(decision: unknown, runMutation = vi.fn().mockResolvedValue(undefined)) {
  return {
    runQuery: vi.fn().mockResolvedValue(decision),
    runMutation,
  };
}

describe("requireFactoryActionWithAudit", () => {
  it("returns the decision as-is and records no denial when allowed", async () => {
    const decision = { allowed: true, projectExists: true };
    const ctx = fakeCtx(decision);

    await expect(
      requireFactoryActionWithAudit(ctx, { projectId, permission, operation: "op" })
    ).resolves.toEqual(decision);
    expect(ctx.runMutation).not.toHaveBeenCalled();
  });

  it("records a denial with the decision's actor/reason and throws a generic error when denied on an existing project", async () => {
    const runMutation = vi.fn().mockResolvedValue(undefined);
    const ctx = fakeCtx(
      { allowed: false, projectExists: true, actorId: "actor1", reasonCode: "no_permission" },
      runMutation
    );

    await expect(
      requireFactoryActionWithAudit(ctx, { projectId, permission, operation: "op" })
    ).rejects.toThrow("This factory operation is unavailable or unauthorized.");

    expect(runMutation).toHaveBeenCalledTimes(1);
    const [, args] = runMutation.mock.calls[0];
    expect(args).toMatchObject({
      projectId,
      permission,
      operation: "op",
      actorId: "actor1",
      reasonCode: "no_permission",
    });
    expect(typeof args.attemptId).toBe("string");
  });

  it("throws without recording a denial when the project does not exist", async () => {
    const runMutation = vi.fn().mockResolvedValue(undefined);
    const ctx = fakeCtx({ allowed: false, projectExists: false }, runMutation);

    await expect(
      requireFactoryActionWithAudit(ctx, { projectId, permission, operation: "op" })
    ).rejects.toThrow("This factory operation is unavailable or unauthorized.");
    expect(runMutation).not.toHaveBeenCalled();
  });
});
