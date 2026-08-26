import { describe, expect, it, vi } from "vitest";
import { runAuditedHumanMutation } from "../lib/humanActionAudit";

function context(domainResult: unknown) {
  const runMutation = vi.fn()
    .mockImplementationOnce(async () => {
      if (domainResult instanceof Error) throw domainResult;
      return domainResult;
    })
    .mockResolvedValueOnce("audit-record-id");
  return {
    ctx: {
      runQuery: vi.fn().mockResolvedValue({ projectId: "project-1", tenantId: "tenant-1" }),
      runMutation,
      auth: {
        getUserIdentity: vi.fn().mockResolvedValue({ subject: "operator-subject" }),
      },
    },
    runMutation,
  };
}

describe("audited human action boundary", () => {
  it("returns successful domain results without writing a denial record", async () => {
    const { ctx, runMutation } = context({ success: true });

    await expect(runAuditedHumanMutation(
      ctx,
      "internal-domain-mutation",
      { taskId: "task-1" },
      "tasks.update",
      { taskId: "task-1" },
    )).resolves.toEqual({ success: true });

    expect(runMutation).toHaveBeenCalledTimes(1);
  });

  it("persists a sanitized denial in a separate mutation and preserves the error", async () => {
    const denial = new Error("Authenticated operator membership is required.");
    const { ctx, runMutation } = context(denial);

    await expect(runAuditedHumanMutation(
      ctx,
      "internal-domain-mutation",
      { taskId: "task-1", content: "must-not-be-audited" },
      "tasks.update",
      { taskId: "task-1" },
    )).rejects.toBe(denial);

    expect(runMutation).toHaveBeenCalledTimes(2);
    expect(runMutation.mock.calls[1]?.[1]).toEqual({
      projectId: "project-1",
      tenantId: "tenant-1",
      operation: "tasks.update",
      identitySubject: "operator-subject",
    });
    expect(JSON.stringify(runMutation.mock.calls[1]?.[1])).not.toContain("must-not-be-audited");
  });

  it("does not misclassify domain validation failures as authorization denials", async () => {
    const validationError = new Error("A resolution note is required.");
    const { ctx, runMutation } = context(validationError);

    await expect(runAuditedHumanMutation(
      ctx,
      "internal-domain-mutation",
      {},
      "alerts.resolve",
      {},
    )).rejects.toBe(validationError);

    expect(runMutation).toHaveBeenCalledTimes(1);
  });
});
