import { describe, expect, it } from "vitest";
import {
  evaluateFactoryDispatchPreflight,
  factoryVersionApprovesWorkOrderScopes,
  genericHarnessV1RecoveryReady,
  selectCurrentFactoryHost,
  type FactoryDispatchPreflightInput,
} from "../lib/factoryDispatch";

const ready: FactoryDispatchPreflightInput = {
  factoryRequired: true,
  versionProvided: true,
  definitionActive: true,
  versionIsActive: true,
  assessmentPasses: true,
  assessmentCurrent: true,
  digestMatches: true,
  repositoryReady: true,
  repositoryPolicyReady: true,
  remoteEgressPolicyReady: true,
  githubReady: true,
  workflowMatches: true,
  workflowContractReady: true,
  executorReady: true,
  executionProfileReady: true,
  codeScopesReady: true,
  agentManifestsReady: true,
  policyReady: true,
  verifiersReady: true,
  hostReady: true,
  budgetReady: true,
  recoveryReady: true,
  worktreeProvided: true,
  mutating: true,
  activeRepositoryMutation: false,
};

describe("Factory dispatch preflight", () => {
  it("requires a Factory version for Mission-linked execution", () => {
    expect(evaluateFactoryDispatchPreflight({ ...ready, versionProvided: false })).toMatchObject({
      ok: false,
      blocker: "factory-version-required",
    });
  });

  it("returns the first actionable readiness root cause", () => {
    expect(evaluateFactoryDispatchPreflight({ ...ready, githubReady: false, hostReady: false })).toEqual({
      ok: false,
      blocker: "github-app-not-ready",
      remediation: "Repair and reverify the GitHub App installation.",
    });
  });

  it("blocks a second mutating attempt across Missions for one repository", () => {
    expect(evaluateFactoryDispatchPreflight({ ...ready, activeRepositoryMutation: true })).toMatchObject({
      ok: false,
      blocker: "repository-mutation-already-active",
    });
  });

  it("blocks sensitive remote work without provider-enforced egress", () => {
    expect(evaluateFactoryDispatchPreflight({ ...ready, remoteEgressPolicyReady: false })).toEqual({
      ok: false,
      blocker: "provider-egress-required",
      remediation: "Use Local execution or a remote profile with provider-enforced egress evidence.",
    });
  });

  it("reports an exact profile-currentness blocker before worker selection", () => {
    expect(evaluateFactoryDispatchPreflight({ ...ready, executionProfileReady: false })).toEqual({
      ok: false,
      blocker: "execution-profile-not-current",
      remediation: "Select or requalify the exact Execution Profile frozen by this Factory version.",
    });
  });

  it("preserves legacy non-Mission dispatch while migration is in progress", () => {
    expect(evaluateFactoryDispatchPreflight({ ...ready, factoryRequired: false, versionProvided: false })).toEqual({ ok: true });
  });

  it("preserves the qualified V1 recovery authority for every harness", () => {
    expect(genericHarnessV1RecoveryReady({ pause: false, cancel: true, retry: true, resume: false })).toBe(true);
    expect(genericHarnessV1RecoveryReady({ pause: true, cancel: true, retry: true, resume: false })).toBe(false);
    expect(genericHarnessV1RecoveryReady({ pause: false, cancel: true, retry: true, resume: true })).toBe(false);
  });

  it("requires every WorkOrder scope to be frozen into the Factory version", () => {
    expect(factoryVersionApprovesWorkOrderScopes(["scope-a", "scope-b"], ["scope-b"])).toBe(true);
    expect(factoryVersionApprovesWorkOrderScopes(["scope-a"], ["scope-b"])).toBe(false);
    expect(factoryVersionApprovesWorkOrderScopes(["scope-a"], [])).toBe(false);
  });

  it("selects the newest current clean host for the exact repository", () => {
    const now = 100_000_000;
    expect(selectCurrentFactoryHost([
      { hostId: "stale", repository: "sellerfi/marketplace", status: "READY", dirty: false, checkedAt: now - 24 * 60 * 60 * 1_000 - 1 },
      { hostId: "wrong-repository", repository: "sellerfi/docs", status: "READY", dirty: false, checkedAt: now },
      { hostId: "dirty", repository: "SellerFi/Marketplace", status: "READY", dirty: true, checkedAt: now },
      { hostId: "older", repository: "sellerfi/marketplace", status: "READY", dirty: false, checkedAt: now - 2_000 },
      { hostId: "newer", repository: " SellerFi/Marketplace ", status: "READY", dirty: false, checkedAt: now - 1_000 },
    ], "sellerfi/marketplace", now)?.hostId).toBe("newer");
  });

  it("honors an explicitly selected eligible host and rejects an ineligible one", () => {
    const hosts = [
      { hostId: "host-a", repository: "sellerfi/marketplace", status: "READY", dirty: false, checkedAt: 9_000 },
      { hostId: "host-b", repository: "sellerfi/marketplace", status: "DIRTY", dirty: true, checkedAt: 10_000 },
    ];
    expect(selectCurrentFactoryHost(hosts, "sellerfi/marketplace", 10_000, "host-a")?.hostId).toBe("host-a");
    expect(selectCurrentFactoryHost(hosts, "sellerfi/marketplace", 10_000, "host-b")).toBeNull();
  });
});
