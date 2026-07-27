import { describe, expect, it } from "vitest";
import {
  ENABLEMENT_LADDER,
  PATTERN_CATEGORIES,
  ADOPTION_METRICS,
  COLLABORATION_MODES,
} from "./harnessPatterns";

describe("harnessPatterns", () => {
  it("defines four enablement layers", () => {
    expect(ENABLEMENT_LADDER).toHaveLength(4);
    expect(ENABLEMENT_LADDER[0]?.id).toBe("agent");
    expect(ENABLEMENT_LADDER[3]?.id).toBe("org");
  });

  it("lists five hand-curated pattern categories", () => {
    expect(PATTERN_CATEGORIES).toHaveLength(5);
    expect(PATTERN_CATEGORIES.some((c) => c.id === "platform")).toBe(true);
  });

  it("prefers human-touch metrics over token spend", () => {
    const good = ADOPTION_METRICS.filter((m) => m.good);
    const bad = ADOPTION_METRICS.filter((m) => !m.good);
    expect(good.some((m) => m.id === "human-touches")).toBe(true);
    expect(bad.some((m) => m.id === "token-spend")).toBe(true);
  });

  it("defines solo shared multiplayer progression", () => {
    expect(COLLABORATION_MODES.map((m) => m.id)).toEqual(["solo", "shared", "multiplayer"]);
  });
});
