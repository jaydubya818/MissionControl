import { describe, expect, it } from "vitest";
import {
  REPOSITORY_DISPATCH_EXECUTOR_ID,
  REPOSITORY_DISPATCH_OBSERVER_ID,
  INCIDENT_COMMAND_AUTHORITY_ID,
  repositoryDispatchAdmissionRejectionReason,
  validateIncidentControlAuthority,
  validateObservedControlReceipt,
} from "../lib/factoryIncidentControl";

const now = 1_000_000;

function receipt(overrides: Record<string, unknown> = {}) {
  return {
    _id: "receipt",
    incidentId: "incident",
    projectId: "project",
    repositoryId: "repository",
    operation: "PAUSE_REPOSITORY_DISPATCH",
    controlKey: "PAUSE_REPOSITORY_DISPATCH",
    receiptType: "COMMAND_ISSUED",
    requestId: "request-123456",
    result: "PASS",
    producerId: REPOSITORY_DISPATCH_EXECUTOR_ID,
    authorityExpiresAt: now + 60_000,
    authorityActorId: "operator",
    authoritySequence: 1,
    runtimeContractVersion: 53,
    expectedAdmission: "DENIED",
    createdAt: now,
    ...overrides,
  };
}

describe("repository dispatch incident control", () => {
  it("fails closed for a paused repository without affecting an unrelated repository", () => {
    expect(repositoryDispatchAdmissionRejectionReason({
      projectId: "project",
      projection: { projectId: "project", admission: "DENIED" },
    })).toBe("repository-dispatch-paused");
    expect(repositoryDispatchAdmissionRejectionReason({ projectId: "other", projection: null })).toBeNull();
  });

  it("requires bounded current authority from the exact commander", () => {
    const valid = {
      now,
      authorityExpiresAt: now + 60_000,
      expectedSequence: 1,
      actualSequence: 1,
      expectedCommanderActorId: "operator",
      actualCommanderActorId: "operator",
      actorId: "operator",
    };
    expect(validateIncidentControlAuthority(valid)).toBeNull();
    expect(validateIncidentControlAuthority({ ...valid, actualSequence: 2 })).toBe("incident-control-authority-stale");
    expect(validateIncidentControlAuthority({ ...valid, actorId: "other" })).toBe("incident-control-commander-mismatch");
    expect(validateIncidentControlAuthority({ ...valid, authorityExpiresAt: now })).toBe("incident-control-authority-expired-or-unbounded");
  });

  it("accepts only command to acknowledgment to independent observed-effect lineage", () => {
    const request = receipt({ _id: "request", receiptType: "COMMAND_REQUESTED", producerId: INCIDENT_COMMAND_AUTHORITY_ID });
    const command = receipt({ _id: "command", predecessorReceiptId: "request" });
    const acknowledgment = receipt({
      _id: "ack",
      receiptType: "ACKNOWLEDGED",
      predecessorReceiptId: "command",
    });
    const effect = receipt({
      _id: "effect",
      receiptType: "EFFECT_OBSERVED",
      predecessorReceiptId: "ack",
      producerId: REPOSITORY_DISPATCH_OBSERVER_ID,
      observedAdmission: "DENIED",
    });
    const input = {
      request,
      command,
      acknowledgment,
      effect,
      incidentId: "incident",
      projectId: "project",
      repositoryId: "repository",
      operation: "PAUSE_REPOSITORY_DISPATCH" as const,
      controlKey: "PAUSE_REPOSITORY_DISPATCH",
      earliestCreatedAt: now,
      observedAt: now,
      evaluatedAt: now,
      expectedAuthorityActorId: "operator",
      expectedAuthoritySequence: 1,
      expectedRuntimeContractVersion: 53,
    };
    expect(validateObservedControlReceipt(input)).toBeNull();
    expect(validateObservedControlReceipt({ ...input, effect: { ...effect, producerId: REPOSITORY_DISPATCH_EXECUTOR_ID } }))
      .toBe("incident-control-observer-not-independent");
    expect(validateObservedControlReceipt({ ...input, command: { ...command, producerId: "replacement-executor" } }))
      .toBe("incident-control-executor-identity-mismatch");
    expect(validateObservedControlReceipt({ ...input, effect: { ...effect, repositoryId: "forged" } }))
      .toBe("incident-control-receipt-scope-mismatch");
    expect(validateObservedControlReceipt({ ...input, effect: { ...effect, predecessorReceiptId: "replacement" } }))
      .toBe("incident-control-receipt-lineage-mismatch");
    expect(validateObservedControlReceipt({ ...input, effect: { ...effect, observedAdmission: "ENABLED" } }))
      .toBe("incident-control-effect-mismatch");
    expect(validateObservedControlReceipt({ ...input, effect: { ...effect, runtimeContractVersion: 52 } }))
      .toBe("incident-control-runtime-contract-mismatch");
    expect(validateObservedControlReceipt({ ...input, effect: { ...effect, authoritySequence: 2 } }))
      .toBe("incident-control-authority-lineage-mismatch");
    expect(validateObservedControlReceipt({ ...input, acknowledgment: null })).toBe("incident-control-receipt-missing");
    expect(validateObservedControlReceipt({ ...input, evaluatedAt: now + 60_001 })).toBe("incident-control-authority-stale");
  });
});
