import { describe, expect, it } from "vitest";
import {
  computeMaturityStage,
  pct,
  trendDelta,
} from "../lib/factoryHealth";

describe("factoryHealth lib", () => {
  it("computes pct safely", () => {
    expect(pct(1, 4)).toBe(25);
    expect(pct(0, 0)).toBe(0);
  });

  it("computes trend delta", () => {
    expect(trendDelta(10, 5)).toBe(100);
    expect(trendDelta(0, 0)).toBe(0);
  });

  it("derives maturity stage from signals", () => {
    expect(
      computeMaturityStage({
        hasIssueDispatch: true,
        hasOuterLoop: true,
        hasMetaLoop: true,
        interactiveOnly: false,
      })
    ).toBe("FULL_FACTORY");
    expect(
      computeMaturityStage({
        hasIssueDispatch: false,
        hasOuterLoop: false,
        hasMetaLoop: false,
        interactiveOnly: true,
      })
    ).toBe("INTERACTIVE");
  });
});
