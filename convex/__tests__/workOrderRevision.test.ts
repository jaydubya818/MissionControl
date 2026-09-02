import { describe, expect, it } from "vitest";
import {
  buildRevisionSnapshot,
  evaluateRevisionImpact,
  nextStateAfterRevision,
  runMatchesCurrentRevision,
  snapshotRevisionFields,
} from "../lib/workOrderRevision";

const baseWorkOrder = {
  title: "Ship inspector",
  desiredOutcome: "Inspect runs",
  workflowId: "feature-dev",
  repository: "jaydubya818/MissionControl",
  codeScopeIds: ["scope-ui"],
  branchStrategy: "isolated",
  priority: 2,
  riskLevel: "MEDIUM",
  requestedBy: "Hermes",
  assignedAgent: "Pi",
  assignedSquad: "Factory",
  acceptanceCriteria: [
    { id: "ac-1", title: "Build passes", verificationMethod: "TEST", status: "PASS" },
    { id: "ac-2", title: "Evidence linked", verificationMethod: "TEST", status: "PASS" },
  ],
  constraints: ["Keep Convex as source of truth"],
  dependencies: ["feature-dev"],
  sourceOfTruthRefs: [{ kind: "REPO", label: "MissionControl", location: "github.com/jaydubya818/MissionControl" }],
  requiredApprovals: [],
  metadata: { environment: { node: "20" } },
};

describe("work order revision helpers", () => {
  it("requires reverification for acceptance-criteria changes", () => {
    const current = snapshotRevisionFields(baseWorkOrder);
    const next = buildRevisionSnapshot({
      current,
      patch: {
        acceptanceCriteria: [
          { id: "ac-1", title: "Build passes", verificationMethod: "TEST", status: "PENDING" },
          { id: "ac-2", title: "Evidence linked and screenshot captured", verificationMethod: "TEST", status: "PENDING" },
        ],
      },
    });

    const impact = evaluateRevisionImpact({ current, next, currentState: "READY" });
    expect(impact.requiresReverification).toBe(true);
    expect(impact.impactedAcceptanceCriteria).toEqual(["ac-2"]);
    expect(impact.invalidateAllReceipts).toBe(false);
  });

  it("requires reapproval when risk increases", () => {
    const current = snapshotRevisionFields(baseWorkOrder);
    const next = buildRevisionSnapshot({ current, patch: { riskLevel: "HIGH", requiredApprovals: ["RISK_REVIEW"] } });
    const impact = evaluateRevisionImpact({ current, next, currentState: "READY" });

    expect(impact.riskReassessment).toBe("INCREASED");
    expect(impact.requiresReapproval).toBe(true);
    expect(impact.impactedApprovalTypes).toEqual(["RISK_REVIEW"]);
  });

  it("requires reapproval without reverification when the cumulative cost cap changes", () => {
    const current = snapshotRevisionFields({
      ...baseWorkOrder,
      requiredApprovals: ["SCOPE_APPROVAL", "RISK_REVIEW"],
      metadata: {
        ...baseWorkOrder.metadata,
        implementationPolicy: { maxCostUsd: 24, maxAttempts: 3, timeoutMinutes: 60 },
      },
    });
    const next = buildRevisionSnapshot({
      current,
      patch: {
        metadata: {
          ...current.metadata,
          implementationPolicy: { ...current.metadata.implementationPolicy, maxCostUsd: 48 },
        },
      },
    });
    const impact = evaluateRevisionImpact({ current, next, currentState: "READY" });

    expect(impact.changedFields).toEqual(["metadata"]);
    expect(impact.materiality).toBe("REAPPROVAL");
    expect(impact.requiresReapproval).toBe(true);
    expect(impact.requiresReverification).toBe(false);
    expect(impact.impactedApprovalTypes).toEqual(["RISK_REVIEW", "SCOPE_APPROVAL"]);
  });

  it("requires reapproval and reverification when the executable code scope changes", () => {
    const current = snapshotRevisionFields(baseWorkOrder);
    const next = buildRevisionSnapshot({
      current,
      patch: { codeScopeIds: ["scope-planning", "scope-ui"] },
    });
    const impact = evaluateRevisionImpact({ current, next, currentState: "BLOCKED" });

    expect(next.codeScopeIds).toEqual(["scope-planning", "scope-ui"]);
    expect(impact.changedFields).toContain("codeScopeIds");
    expect(impact.requiresReapproval).toBe(true);
    expect(impact.requiresReverification).toBe(true);
  });

  it("forces full reopen when a done work order materially changes", () => {
    const current = snapshotRevisionFields(baseWorkOrder);
    const next = buildRevisionSnapshot({ current, patch: { repository: "jaydubya818/OtherRepo" } });
    const impact = evaluateRevisionImpact({ current, next, currentState: "DONE" });

    expect(impact.materiality).toBe("FULL_REOPEN");
    expect(impact.requiresFullReopen).toBe(true);
  });

  it("keeps unaffected evidence valid when only one criterion changes", () => {
    const current = snapshotRevisionFields(baseWorkOrder);
    const next = buildRevisionSnapshot({
      current,
      patch: {
        acceptanceCriteria: [
          { id: "ac-1", title: "Build passes with release smoke", verificationMethod: "TEST", status: "PENDING" },
          { id: "ac-2", title: "Evidence linked", verificationMethod: "TEST", status: "PASS" },
        ],
      },
    });
    const impact = evaluateRevisionImpact({ current, next, currentState: "READY" });

    expect(impact.impactedAcceptanceCriteria).toEqual(["ac-1"]);
    expect(impact.invalidateAllReceipts).toBe(false);
  });

  it("moves a revised completed work order into reopened", () => {
    expect(nextStateAfterRevision({
      currentState: "DONE",
      hasActiveRun: false,
      requiresReapproval: false,
      requiresReverification: true,
      requiresFullReopen: true,
    })).toBe("REOPENED");
  });

  it("detects when an active run is on an older revision", () => {
    expect(runMatchesCurrentRevision(1, 2)).toBe(false);
    expect(runMatchesCurrentRevision(2, 2)).toBe(true);
  });
});
