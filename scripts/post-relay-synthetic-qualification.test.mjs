import { describe, expect, it } from "vitest";
import { runPostRelaySyntheticQualification } from "./lib/postRelaySyntheticQualification.mts";

describe("post-Relay synthetic Factory qualification", () => {
  it("qualifies the three-WorkOrder happy path and bounded failure matrix", async () => {
    const report = await runPostRelaySyntheticQualification();
    expect(report.memberCount).toBe(3);
    expect(report.memberWorkOrderIds).toEqual(["WO-Q001", "WO-Q002", "WO-Q003"]);
    expect(report.dispatchOrder).toEqual(["WO-Q001", "WO-Q002", "WO-Q003"]);
    expect(report.happyPath.counts).toEqual({ total: 3, accepted: 3, active: 0, blocked: 0, failed: 0 });
    expect(report.happyPath.outcome.outcome).toBe("ACCEPTED");
    expect(report.failureScenarios.timeout).toMatchObject({ check: "TIMED_OUT", downstream: "BLOCKED_BY_DEPENDENCY" });
    expect(report.failureScenarios.environment.outcome).toBe("BLOCKED");
    expect(report.failureScenarios.product.outcome).toBe("PRODUCT_FAILED");
    expect(report.failureScenarios.crash).toMatchObject({ disposition: "STALE", preserveAttempt: true, createNewAttempt: true });
    expect(report.failureScenarios.verifierCrash).toMatchObject({ disposition: "STALE", preserveAttempt: true, createNewAttempt: true });
    expect(report.failureScenarios.drain).toMatchObject({ claim: { allow: false }, active: { allow: true, abortActive: false }, workerExit: "STOPPED" });
    expect(report.failureScenarios.dependencyGate).toMatchObject({ satisfied: false, reasonCode: "ACCEPTED_OUTPUT_REQUIRED" });
    expect(report.exactCandidateRetry).toEqual({ sameCandidate: true, distinctVerifiers: true, oldEvidenceUnchanged: true });
    expect(report.restart).toEqual({
      readyWorkOrderPreserved: true,
      attemptsPreserved: true,
      candidatesPreserved: true,
      duplicateProducerCreated: false,
      duplicateCandidateCreated: false,
      unauthorizedRetryCreated: false,
    });
  }, 20_000);
});
