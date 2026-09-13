import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const schema = readFileSync(new URL("../schema.ts", import.meta.url), "utf8");
const runs = readFileSync(new URL("../factoryRuns.ts", import.meta.url), "utf8");
const workOrders = readFileSync(new URL("../workOrders.ts", import.meta.url), "utf8");

describe("Factory Run persistence and dispatch contract", () => {
  it("persists immutable membership and typed dependency lineage", () => {
    expect(schema).toContain("factoryRunWorkOrders: defineTable");
    expect(schema).toContain("workOrderDependencies: defineTable");
    expect(schema).toContain('v.literal("ACCEPTED_OUTPUT_REQUIRED")');
    expect(runs).toContain("membershipDigest");
    expect(runs).toContain("sourcePlanRevision");
    expect(runs).not.toContain('ctx.db.delete("factoryRunWorkOrders"');
    expect(runs).not.toContain('ctx.db.patch(member');
  });

  it("uses the explicit membership edge for summaries and dispatch", () => {
    expect(runs).toContain("summarizeFactoryRun");
    expect(workOrders).toContain("loadFactoryRunDependencyBlockers");
    expect(workOrders).toContain("evaluateFactoryDependency");
    expect(workOrders).toContain('"factory-run-dependencies"');
  });
});
