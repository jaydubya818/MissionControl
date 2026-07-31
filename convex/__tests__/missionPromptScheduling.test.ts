import { describe, expect, it } from "vitest";
import { evaluateMissionPromptReadiness } from "../lib/missionPromptScheduling";

describe("mission prompt scheduling readiness", () => {
  it.each([undefined, null, "", "   "])(
    "blocks scheduling without an actionable mission statement (%s)",
    (missionStatement) => {
      expect(evaluateMissionPromptReadiness(missionStatement)).toEqual({
        allowed: false,
        reason: "No mission statement set. Configure the workspace mission before running this job.",
      });
    },
  );

  it("allows scheduling when the mission statement contains content", () => {
    expect(
      evaluateMissionPromptReadiness("  Ship governed, evidence-backed work.  "),
    ).toEqual({
      allowed: true,
      reason: "Mission statement configured",
    });
  });
});
