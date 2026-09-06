import { describe, expect, it } from "vitest";
import { planReadiness, summarizeWorkOrderReadiness, type ReadinessCheck } from "../lib/workOrderReadiness";
import { factoryDispatchChecks, evaluateFactoryDispatchPreflight, type FactoryDispatchPreflightInput } from "../lib/factoryDispatch";

const approved = { missionId: "mission", currentPlanId: "plan", workOrderPlanRevision: 2, releasedAt: 1,
  plan: { _id: "plan", missionId: "mission", status: "APPROVED", revisionNumber: 2 } };

describe("WorkOrder readiness truthfulness", () => {
  it.each([
    { ...approved, currentPlanId: "new-plan" },
    { ...approved, workOrderPlanRevision: 1 },
    { ...approved, plan: { ...approved.plan, missionId: "foreign" } },
    { ...approved, plan: { ...approved.plan, status: "SUPERSEDED" } },
    { ...approved, releasedAt: undefined },
    { ...approved, plan: null },
  ])("blocks stale, foreign, unapproved or unreleased Plan lineage", (input) => {
    expect(summarizeWorkOrderReadiness(planReadiness(input)).admissionEligible).toBe(false);
  });

  it("does not turn an empty inspection into readiness", () => {
    expect(summarizeWorkOrderReadiness([]).admissionEligible).toBe(false);
  });

  it("distinguishes admitted preparation from proven execution", () => {
    const deferred: ReadinessCheck = { code: "dependencies", label: "Dependencies", status: "DEFERRED", boundary: "PRE_EXECUTION", reason: "Worker must prepare the exact Attempt." };
    const result = summarizeWorkOrderReadiness([...planReadiness(approved), deferred]);
    expect(result).toMatchObject({ admissionEligible: true, executionReady: false, authoritative: false, status: "PREPARATION_REQUIRED" });
    expect(result.pending).toEqual([deferred]);
  });

  it("blocks unknown admission facts, rather than counting them as passed", () => {
    const result = summarizeWorkOrderReadiness([{ code: "budget", label: "Budget", status: "DEFERRED", boundary: "ADMISSION", reason: "Actual authority unavailable" }]);
    expect(result.admissionEligible).toBe(false);
  });

  it("reports all canonical Factory failures without changing dispatch's first blocker", () => {
    const input = Object.fromEntries([
      "versionProvided", "definitionActive", "versionIsActive", "assessmentPasses", "assessmentCurrent", "digestMatches",
      "repositoryReady", "repositoryPolicyReady", "remoteEgressPolicyReady", "githubReady", "workflowMatches", "workflowContractReady",
      "executorReady", "codeScopesReady", "agentManifestsReady", "policyReady", "verifiersReady", "hostReady", "budgetReady",
      "recoveryReady", "worktreeProvided",
    ].map((key) => [key, true])) as unknown as FactoryDispatchPreflightInput;
    Object.assign(input, { factoryRequired: true, mutating: true, activeRepositoryMutation: true,
      hostReady: false, budgetReady: false, policyReady: false, digestMatches: false });
    expect(factoryDispatchChecks(input).filter((item) => !item.passed).map((item) => item.code)).toEqual([
      "factory-digest-mismatch", "execution-profile-not-current", "policy-not-ready", "host-not-ready", "budget-not-ready", "repository-mutation-already-active",
    ]);
    expect(evaluateFactoryDispatchPreflight(input).blocker).toBe("factory-digest-mismatch");
  });
});
