import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const attempts = readFileSync(new URL("../factory/attempts.ts", import.meta.url), "utf8");
const cancellation = readFileSync(new URL("../workflowRuns.ts", import.meta.url), "utf8");

describe("Factory operational controls", () => {
  it("blocks new Factory claims for every non-normal operator mode", () => {
    expect(attempts).toContain("getEffectiveOperatorControl(ctx.db, run.projectId)");
    expect(attempts).toContain('operatorControl.mode !== "NORMAL"');
    expect(attempts).toContain("claimed: false");
  });

  it("keeps selected cancellation durable and auditable", () => {
    expect(cancellation).toContain("export const requestCancellation");
    expect(cancellation).toContain("cancellationRequestedAt");
    expect(cancellation).toContain('eventType: "CANCELLATION_REQUESTED"');
  });
});
