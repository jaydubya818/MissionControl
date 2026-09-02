import { describe, expect, it } from "vitest";
import { evalCaseTone, evalNextAction, evalVerdictTone, shortEvalDigest } from "./evalControlPlaneViewModel";

describe("eval control-plane presentation", () => {
  it("makes invalid runs visually blocking and explicit about harness repair", () => {
    expect(evalVerdictTone("INVALID")).toBe("error");
    expect(evalCaseTone("SKIPPED")).toBe("warning");
    expect(evalNextAction({ verdict: "INVALID", invalidCases: 1 })).toContain("Repair the harness");
  });

  it("keeps warnings distinct from blocking regressions", () => {
    expect(evalVerdictTone("WARN")).toBe("warning");
    expect(evalNextAction({ verdict: "WARN", advisoryFailures: 1 })).toContain("Blocking trust checks are intact");
    expect(evalNextAction({ verdict: "FAIL", blockingRegressions: 1 })).toContain("blocking case and slice regressions");
  });

  it("formats pinned identities without dropping the meaningful prefix", () => {
    expect(shortEvalDigest(`sha256:${"a".repeat(64)}`)).toBe("a".repeat(12));
    expect(shortEvalDigest("0123456789abcdef")).toBe("0123456789ab");
  });
});
