import { describe, expect, it } from "vitest";
import { executionRoutingEstimatedCost } from "../lib/executionRouting";

describe("executionRoutingEstimatedCost", () => {
  it("keeps the exact route estimate authoritative when present", () => {
    expect(executionRoutingEstimatedCost(3, 9)).toBe(3);
  });

  it("uses the human-approved Plan estimate when a yellow route omits route-wide cost", () => {
    expect(executionRoutingEstimatedCost(undefined, 9)).toBe(9);
  });

  it("does not fabricate an estimate when neither authority supplied one", () => {
    expect(executionRoutingEstimatedCost(undefined, undefined)).toBeUndefined();
  });
});
