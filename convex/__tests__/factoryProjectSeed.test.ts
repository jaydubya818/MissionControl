import { describe, expect, it } from "vitest";
import { buildFactoryProjectSeed, normalizeFactoryProjectSlug } from "../lib/factoryProjectSeed";

describe("factory project seed", () => {
  it("normalizes project names into stable slugs", () => {
    expect(normalizeFactoryProjectSlug(" Apple Notes / Workday Factory!! ")).toBe("apple-notes-workday-factory");
    expect(normalizeFactoryProjectSlug("---")).toBe("software-factory");
  });

  it("builds an idempotent project seed with workflow and work order coverage", () => {
    const seed = buildFactoryProjectSeed({
      name: "WAID Factory",
      repository: "jaydubya818/MissionControl",
      requestedBy: "Hermes",
    });

    expect(seed.project.slug).toBe("waid-factory");
    expect(seed.idempotencyScope).toBe("factory-project:waid-factory");
    expect(seed.workflows.map((workflow) => workflow.workflowId)).toEqual([
      "factory-intake-plan",
      "factory-pi-execute-verify",
      "factory-writeback-preview",
    ]);
    expect(seed.workOrders).toHaveLength(3);
    expect(seed.workOrders.some((order) => order.state === "BLOCKED")).toBe(true);
    expect(seed.workOrders.some((order) => order.acceptanceCriteria.some((criterion) => criterion.status === "STALE"))).toBe(true);
    expect(seed.workOrders.every((order) => order.repository === "jaydubya818/MissionControl")).toBe(true);
  });
});
