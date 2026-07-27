import { describe, expect, it } from "vitest";
import { computeMergeGates, passedGateIds } from "../../convex/lib/mergeGates";

describe("mergeGates", () => {
  it("passes all gates when signals are strong", () => {
    const gates = computeMergeGates({
      lenses: [
        { id: "security", label: "Security", enabled: true, score: 90 },
        { id: "readability", label: "Readability", enabled: true, score: 85 },
        { id: "platform", label: "Platform", enabled: true, score: 80 },
      ],
      ciStatus: "PASS",
      mutationCoveragePct: 75,
      activeVerifierCount: 2,
      securityFindingCount: 0,
    });
    expect(gates).toHaveLength(5);
    expect(passedGateIds(gates)).toHaveLength(5);
  });

  it("blocks adversarial when security score is low", () => {
    const gates = computeMergeGates({
      lenses: [{ id: "security", label: "Security", enabled: true, score: 50 }],
      ciStatus: "PASS",
      activeVerifierCount: 1,
    });
    const adversarial = gates.find((g) => g.id === "adversarial");
    expect(adversarial?.passed).toBe(false);
  });
});
