import { describe, expect, it } from "vitest";
import {
  AUTONOMY_STAGES,
  FACTORY_CHECKLIST,
  WORKSHOP_AUTOMATIONS,
  ASSEMBLY_LINE,
} from "./harnessWorkshop";

describe("harnessWorkshop", () => {
  it("defines six autonomy stages", () => {
    expect(AUTONOMY_STAGES).toHaveLength(6);
    expect(AUTONOMY_STAGES[0].level).toBe(0);
    expect(AUTONOMY_STAGES[5].id).toBe("dark-factory");
  });

  it("covers factory checklist categories", () => {
    const categories = new Set(FACTORY_CHECKLIST.map((i) => i.category));
    expect(categories.has("primitives")).toBe(true);
    expect(categories.has("verifiable")).toBe(true);
  });

  it("lists Eric workshop automations", () => {
    expect(WORKSHOP_AUTOMATIONS.some((a) => a.id === "daily-review")).toBe(true);
    expect(WORKSHOP_AUTOMATIONS.some((a) => a.id === "continual-learning")).toBe(true);
  });

  it("defines SLC assembly line", () => {
    expect(ASSEMBLY_LINE.map((s) => s.id)).toEqual(["plan", "produce", "review", "ship"]);
  });
});
