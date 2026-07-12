/**
 * Executor contract — the boundary between Mission Control and external
 * execution supervisors (currently the Pi bridge, executor type PI_BRIDGE).
 *
 * Authority model (approved 2026-07-11):
 *   - Mission Control owns policy, state, approval, verification, trust,
 *     cost, and audit. An executor NEVER marks a work order DONE — a
 *     successful execution lands in AWAITING_VERIFICATION and only
 *     Mission Control's acceptance-criteria logic derives DONE.
 *   - The executor supervises execution, translates states, heartbeats,
 *     and reports evidence.
 *
 * Pure module: no Convex imports. Mirrored (and exhaustively tested) in
 * the Pi repository's adapter — update both when a state is added.
 */

import {
  nextStateForRunStatus,
  type DispatchableState,
  type DispatchVerificationStatus,
} from "./workOrderDispatch";

/** Execution states emitted by the Pi bridge state machine. */
export const BRIDGE_EXECUTION_STATES = [
  "accepted",
  "starting",
  "running",
  "producing_artifacts",
  "succeeded",
  "failed",
  "timed_out",
  "interrupted",
  "cancelled",
] as const;

export type BridgeExecutionState = (typeof BRIDGE_EXECUTION_STATES)[number];

export function isBridgeExecutionState(value: string): value is BridgeExecutionState {
  return (BRIDGE_EXECUTION_STATES as readonly string[]).includes(value);
}

export interface BridgeStateMappingInput {
  bridgeState: BridgeExecutionState;
  verificationStatus: DispatchVerificationStatus;
  currentState: DispatchableState;
}

export interface BridgeStateMappingResult {
  state: DispatchableState;
  blockingIssue?: string;
  requiredHumanAction?: string;
  terminal: boolean;
}

/**
 * Map a bridge execution state onto the work-order state machine.
 * `succeeded` delegates to nextStateForRunStatus(COMPLETED, …) — the same
 * rule the internal workflow path uses — so DONE is only ever derived from
 * Mission Control's verification status, never asserted by the executor.
 */
export function mapBridgeState(input: BridgeStateMappingInput): BridgeStateMappingResult {
  switch (input.bridgeState) {
    case "accepted":
    case "starting":
      return { state: "DISPATCHED", terminal: false };
    case "running":
    case "producing_artifacts":
      return { state: "IN_PROGRESS", terminal: false };
    case "succeeded": {
      const state = nextStateForRunStatus({
        currentState: input.currentState,
        runStatus: "COMPLETED",
        verificationStatus: input.verificationStatus,
      });
      return {
        state,
        terminal: state === "DONE",
        requiredHumanAction:
          state === "AWAITING_VERIFICATION"
            ? "Record completion evidence against acceptance criteria."
            : undefined,
      };
    }
    case "failed":
      return {
        state: "BLOCKED",
        terminal: false,
        blockingIssue: "Executor reported execution failure",
        requiredHumanAction: "Review failure and retry or revise the work order.",
      };
    case "timed_out":
      return {
        state: "BLOCKED",
        terminal: false,
        blockingIssue: "executor-timeout",
        requiredHumanAction: "Investigate timeout; retry with a larger budget or smaller scope.",
      };
    case "interrupted":
      return {
        state: "BLOCKED",
        terminal: false,
        blockingIssue: "executor-interrupted",
        requiredHumanAction: "Execution was interrupted by a human; resume or cancel.",
      };
    case "cancelled":
      return { state: "CANCELED", terminal: true };
  }
}

// ── Idempotency keys ────────────────────────────────────────────────────────
// Deterministic, timestamp-free: replays of any bridge event are absorbed by
// the by_idempotency indexes. Prefix "pib" namespaces the Pi bridge.

export function claimKey(workOrderId: string, attempt: number): string {
  return `pib:claim:${workOrderId}:${attempt}`;
}

export function stateKey(workOrderId: string, bridgeRunId: string, seq: number): string {
  return `pib:state:${workOrderId}:${bridgeRunId}:${seq}`;
}

export function runKey(workOrderId: string, bridgeRunId: string): string {
  return `pib:run:${workOrderId}:${bridgeRunId}`;
}

export function artifactKey(workOrderId: string, artifactId: string): string {
  return `pib:art:${workOrderId}:${artifactId}`;
}

export function verificationKey(
  workOrderId: string,
  criterionId: string,
  bridgeRunId: string
): string {
  return `pib:verify:${workOrderId}:${criterionId}:${bridgeRunId}`;
}

// ── Claim leases ────────────────────────────────────────────────────────────

/** Default lease: executor must renew (via reportExecutionEvent) within this window. */
export const DEFAULT_CLAIM_LEASE_MS = 15 * 60_000;

export function leaseExpired(now: number, claimLeaseExpiresAt: number | undefined): boolean {
  return claimLeaseExpiresAt !== undefined && now > claimLeaseExpiresAt;
}

// ── Correlation chain ───────────────────────────────────────────────────────

/**
 * Universal correlation chain. Every executor report carries the subset it
 * knows; Mission Control accumulates the union on the work order so any run,
 * PR, or session can be traced end to end.
 */
export interface CorrelationChain {
  missionId?: string;
  workOrderId: string;
  taskId?: string;
  executionId?: string;
  runId?: string;
  bridgeRunId?: string;
  hermesSessionId?: string;
  pullRequestId?: string;
}

/** Merge newly reported correlation ids into the stored set (never erases). */
export function mergeCorrelation(
  existing: Partial<CorrelationChain> | undefined,
  incoming: Partial<CorrelationChain>
): Partial<CorrelationChain> {
  const merged: Partial<CorrelationChain> = { ...existing };
  for (const [key, value] of Object.entries(incoming) as Array<
    [keyof CorrelationChain, string | undefined]
  >) {
    if (value !== undefined && value !== "") merged[key] = value;
  }
  return merged;
}
