import { describe, expect, it } from "vitest";
import {
  canTransitionMission,
  missionIterationAuthorized,
  evaluateMissionAcceptance,
  evaluateMissionDeliveryProgress,
  validateMissionHandoff,
  validateMissionWorkOrderDispatch,
} from "../lib/missionGovernance";

describe("mission governance", () => {
  it.each([[0, 0, true], [1, 0, false], [0, 1, true], [1, 1, false], [1, 2, true], [2, 2, false], [-1, 0, false], [0, -1, false]] as const)(
    "dispatches only an authorized iteration (%s corrections, limit %s)", (iterations, limit, allowed) => {
      expect(validateMissionWorkOrderDispatch({
        missionState: "IN_PROGRESS", planApproved: true, executionPolicy: "SERIAL_MUTATIONS",
        workOrderReleased: true, isMutating: true, hasActiveMutatingWorkOrder: false,
        predecessorHandoffValid: true, budgetRemaining: true,
        correctiveIterationsRemaining: missionIterationAuthorized(iterations, limit),
      })).toEqual(allowed ? { ok: true } : { ok: false, reason: "corrective-iteration-limit" });
    },
  );
  it("only allows declared lifecycle transitions", () => {
    expect(canTransitionMission("AWAITING_PLAN_APPROVAL", "READY")).toBe(true);
    expect(canTransitionMission("DRAFT", "DONE")).toBe(false);
  });

  it("blocks dispatch before a plan is approved", () => {
    expect(validateMissionWorkOrderDispatch({
      missionState: "READY", planApproved: false, executionPolicy: "SERIAL_MUTATIONS",
      workOrderReleased: true, isMutating: true, hasActiveMutatingWorkOrder: false,
      predecessorHandoffValid: true, budgetRemaining: true, correctiveIterationsRemaining: true,
    })).toEqual({ ok: false, reason: "plan-not-approved" });
  });

  it("serializes repository-changing work", () => {
    expect(validateMissionWorkOrderDispatch({
      missionState: "IN_PROGRESS", planApproved: true, executionPolicy: "SERIAL_MUTATIONS",
      workOrderReleased: true, isMutating: true, hasActiveMutatingWorkOrder: true,
      predecessorHandoffValid: true, budgetRemaining: true, correctiveIterationsRemaining: true,
    })).toEqual({ ok: false, reason: "active-mutating-work-order-exists" });
  });

  it("allows bounded read-only work while a mutation is active", () => {
    expect(validateMissionWorkOrderDispatch({
      missionState: "IN_PROGRESS", planApproved: true, executionPolicy: "SERIAL_MUTATIONS",
      workOrderReleased: true, isMutating: false, hasActiveMutatingWorkOrder: true,
      predecessorHandoffValid: true, budgetRemaining: true, correctiveIterationsRemaining: true,
    })).toEqual({ ok: true });
  });

  it("requires an operator recovery path after failed validation", () => {
    expect(canTransitionMission("BLOCKED", "READY")).toBe(true);
    expect(validateMissionWorkOrderDispatch({
      missionState: "READY", planApproved: true, executionPolicy: "SERIAL_MUTATIONS",
      workOrderReleased: true, isMutating: true, hasActiveMutatingWorkOrder: false,
      predecessorHandoffValid: true, budgetRemaining: true, correctiveIterationsRemaining: false,
    })).toEqual({ ok: false, reason: "corrective-iteration-limit" });
  });

  it("rejects a complete handoff with unknown assertions", () => {
    expect(validateMissionHandoff({
      role: "WORKER", outcome: "COMPLETE", completedAssertionIds: ["a-1"],
      incompleteAssertionIds: [], unknownAssertionIds: ["a-2"],
      commands: [{ command: "pnpm test", exitCode: 0 }], knownRisks: [], nextAction: "Validate the result",
    })).toEqual({ ok: false, reason: "complete-handoff-has-open-assertions" });
  });

  it("requires independent validation before acceptance", () => {
    const result = evaluateMissionAcceptance({
      assertions: [{ id: "a-1", status: "PASS", requiresIndependentValidation: true }],
    });
    expect(result.eligible).toBe(false);
    expect(result.unverifiedAssertionIds).toEqual(["a-1"]);
  });

  it("allows a fully evidenced contract", () => {
    expect(evaluateMissionAcceptance({
      assertions: [{
        id: "a-1",
        status: "PASS",
        requiresIndependentValidation: true,
        validatorRunId: "run-1",
        verificationReceiptId: "receipt-1",
      }],
      workOrders: [{ id: "wo-1", state: "DONE" }],
      handoffs: [{
        workOrderId: "wo-1",
        outcome: "COMPLETE",
        incompleteAssertionIds: [],
        unknownAssertionIds: [],
      }],
    }).eligible).toBe(true);
  });

  it("keeps Mission acceptance closed until WorkOrders and handoffs are complete", () => {
    const result = evaluateMissionAcceptance({
      assertions: [{ id: "a-1", status: "PASS", requiresIndependentValidation: false }],
      workOrders: [{ id: "wo-1", state: "IN_PROGRESS" }],
      handoffs: [],
    });
    expect(result.eligible).toBe(false);
    expect(result.incompleteWorkOrderIds).toEqual(["wo-1"]);
    expect(result.missingHandoffWorkOrderIds).toEqual(["wo-1"]);
  });

  it("opens validation only after every Worker is accepted and handed off", () => {
    const progress = evaluateMissionDeliveryProgress({
      workOrders: [
        { id: "worker", role: "WORKER", state: "DONE" },
        { id: "validator", role: "VALIDATOR", state: "READY" },
      ],
      handoffs: [{
        workOrderId: "worker",
        outcome: "COMPLETE",
        incompleteAssertionIds: [],
        unknownAssertionIds: [],
      }],
    });
    expect(progress.allWorkersComplete).toBe(true);
    expect(progress.allValidatorsComplete).toBe(false);
  });

  it("allows Validator dispatch at the validation gate but not initial Worker dispatch", () => {
    const shared = {
      missionState: "AWAITING_VALIDATION" as const,
      planApproved: true,
      executionPolicy: "SERIAL_MUTATIONS" as const,
      workOrderReleased: true,
      isMutating: false,
      hasActiveMutatingWorkOrder: false,
      predecessorHandoffValid: true,
      budgetRemaining: true,
      correctiveIterationsRemaining: true,
    };
    expect(validateMissionWorkOrderDispatch({ ...shared, workOrderRole: "VALIDATOR" })).toEqual({ ok: true });
    expect(validateMissionWorkOrderDispatch({ ...shared, workOrderRole: "WORKER" })).toEqual({
      ok: false,
      reason: "mission-not-dispatchable:AWAITING_VALIDATION",
    });
  });
});
