import { describe, expect, it } from "vitest";
import {
  BRIDGE_EXECUTION_STATES,
  DEFAULT_CLAIM_LEASE_MS,
  artifactKey,
  claimKey,
  isBridgeExecutionState,
  leaseExpired,
  mapBridgeState,
  mergeCorrelation,
  runKey,
  stateKey,
  verificationKey,
  type BridgeExecutionState,
} from "../lib/executorContract";

const ANY_CURRENT = "IN_PROGRESS" as const;

describe("mapBridgeState — exhaustive", () => {
  it("covers every bridge state (fails when a state is added without mapping)", () => {
    for (const state of BRIDGE_EXECUTION_STATES) {
      const result = mapBridgeState({
        bridgeState: state,
        verificationStatus: "PENDING",
        currentState: ANY_CURRENT,
      });
      expect(result.state, state).toBeTruthy();
    }
  });

  it.each([
    ["accepted", "DISPATCHED"],
    ["starting", "DISPATCHED"],
    ["running", "IN_PROGRESS"],
    ["producing_artifacts", "IN_PROGRESS"],
    ["failed", "BLOCKED"],
    ["timed_out", "BLOCKED"],
    ["interrupted", "BLOCKED"],
    ["cancelled", "CANCELED"],
  ] as const)("%s → %s", (bridge, expected) => {
    expect(
      mapBridgeState({
        bridgeState: bridge as BridgeExecutionState,
        verificationStatus: "PENDING",
        currentState: ANY_CURRENT,
      }).state
    ).toBe(expected);
  });

  it("succeeded with pending verification → AWAITING_VERIFICATION, never DONE", () => {
    const result = mapBridgeState({
      bridgeState: "succeeded",
      verificationStatus: "PENDING",
      currentState: ANY_CURRENT,
    });
    expect(result.state).toBe("AWAITING_VERIFICATION");
    expect(result.terminal).toBe(false);
    expect(result.requiredHumanAction).toContain("acceptance criteria");
  });

  it("succeeded with FAIL verification stays out of DONE", () => {
    expect(
      mapBridgeState({
        bridgeState: "succeeded",
        verificationStatus: "FAIL",
        currentState: ANY_CURRENT,
      }).state
    ).toBe("AWAITING_VERIFICATION");
  });

  it("succeeded never yields DONE from the state map — verification owns completion", () => {
    // Reconciled with main's receipts model: the pure run-status map always
    // lands on AWAITING_VERIFICATION. DONE is derived only by
    // recordVerificationEvidence once acceptance criteria pass/waive.
    for (const vs of ["PASS", "WAIVED"] as const) {
      const result = mapBridgeState({
        bridgeState: "succeeded",
        verificationStatus: vs,
        currentState: ANY_CURRENT,
      });
      expect(result.state).toBe("AWAITING_VERIFICATION");
      expect(result.terminal).toBe(false);
    }
  });

  it("failure modes carry blocking issues and human actions", () => {
    for (const state of ["failed", "timed_out", "interrupted"] as const) {
      const result = mapBridgeState({
        bridgeState: state,
        verificationStatus: "PENDING",
        currentState: ANY_CURRENT,
      });
      expect(result.blockingIssue, state).toBeTruthy();
      expect(result.requiredHumanAction, state).toBeTruthy();
    }
  });

  it("validates bridge state strings", () => {
    expect(isBridgeExecutionState("running")).toBe(true);
    expect(isBridgeExecutionState("DONE")).toBe(false);
    expect(isBridgeExecutionState("")).toBe(false);
  });
});

describe("idempotency keys — deterministic, timestamp-free", () => {
  it("same inputs always produce the same key", () => {
    expect(claimKey("wo1", 2)).toBe(claimKey("wo1", 2));
    expect(stateKey("wo1", "br1", 7)).toBe(stateKey("wo1", "br1", 7));
    expect(runKey("wo1", "br1")).toBe(runKey("wo1", "br1"));
    expect(artifactKey("wo1", "a1")).toBe(artifactKey("wo1", "a1"));
    expect(verificationKey("wo1", "c1", "br1")).toBe(verificationKey("wo1", "c1", "br1"));
  });

  it("distinct inputs produce distinct keys with the pib namespace", () => {
    const keys = [
      claimKey("wo1", 1),
      claimKey("wo1", 2),
      claimKey("wo2", 1),
      stateKey("wo1", "br1", 1),
      stateKey("wo1", "br1", 2),
      stateKey("wo1", "br2", 1),
      runKey("wo1", "br1"),
      artifactKey("wo1", "a1"),
      artifactKey("wo1", "a2"),
      verificationKey("wo1", "c1", "br1"),
    ];
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) expect(key.startsWith("pib:")).toBe(true);
  });
});

describe("claim leases", () => {
  it("expired only after the deadline", () => {
    expect(leaseExpired(1_000, 2_000)).toBe(false);
    expect(leaseExpired(2_000, 2_000)).toBe(false);
    expect(leaseExpired(2_001, 2_000)).toBe(true);
  });

  it("no lease means never expired", () => {
    expect(leaseExpired(Number.MAX_SAFE_INTEGER, undefined)).toBe(false);
  });

  it("default lease is a positive window", () => {
    expect(DEFAULT_CLAIM_LEASE_MS).toBeGreaterThan(0);
  });
});

describe("correlation chain", () => {
  it("accumulates without erasing", () => {
    const first = mergeCorrelation(undefined, {
      workOrderId: "wo1",
      executionId: "ex1",
    });
    const second = mergeCorrelation(first, {
      workOrderId: "wo1",
      bridgeRunId: "br1",
      hermesSessionId: "hs1",
    });
    const third = mergeCorrelation(second, { pullRequestId: "pr42", runId: "run9" });
    expect(third).toEqual({
      workOrderId: "wo1",
      executionId: "ex1",
      bridgeRunId: "br1",
      hermesSessionId: "hs1",
      pullRequestId: "pr42",
      runId: "run9",
    });
  });

  it("ignores undefined and empty values", () => {
    const merged = mergeCorrelation(
      { workOrderId: "wo1", bridgeRunId: "br1" },
      { bridgeRunId: undefined, hermesSessionId: "" }
    );
    expect(merged).toEqual({ workOrderId: "wo1", bridgeRunId: "br1" });
  });
});
