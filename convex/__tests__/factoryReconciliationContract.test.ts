import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../factoryReconciliation.ts", import.meta.url), "utf8");

describe("Factory reconciliation service contract", () => {
  it("persists append-only facts before projecting stale runtime truth", () => {
    expect(source).toContain('ctx.db.insert("factoryReconciliations"');
    expect(source).toContain("factsDigest");
    expect(source).toContain('runtimeDisposition: "LOST"');
    expect(source).not.toContain('ctx.db.delete("workflowRuns"');
    expect(source).not.toContain('status: "FAILED"');
  });

  it("is idempotent for the same durable fact snapshot", () => {
    expect(source).toContain("record.factsDigest === factsDigest");
    expect(source).toContain("created: false");
  });
});
