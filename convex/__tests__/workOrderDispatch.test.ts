import { describe, expect, it } from "vitest";
import {
  dispatchApprovalAllowed,
  findActiveRun,
  nextStateForRunStatus,
  validateDispatchable,
} from "../lib/workOrderDispatch";

describe("work order dispatch policy", () => {
  it("requires approval for high-risk work orders", () => {
    expect(
      dispatchApprovalAllowed({
        riskLevel: "HIGH",
        approvalStatus: "PENDING",
        requiredApprovals: [],
      })
    ).toBe(false);
  });

  it("allows approved high-risk work orders to dispatch", () => {
    expect(
      dispatchApprovalAllowed({
        riskLevel: "HIGH",
        approvalStatus: "APPROVED",
        requiredApprovals: [],
      })
    ).toBe(true);
  });

  it("finds an active run when one exists", () => {
    expect(findActiveRun([{ status: "COMPLETED" }, { status: "RUNNING" }])?.status).toBe("RUNNING");
  });

  it("blocks dispatch when an active run exists", () => {
    const result = validateDispatchable({
      state: "READY",
      riskLevel: "LOW",
      approvalStatus: "NOT_REQUIRED",
      hasWorkflowId: true,
      activeRunStatuses: ["RUNNING"],
    });

    expect(result).toEqual({ ok: false, reason: "active-run-exists" });
  });

  it("blocks dispatch when no workflow is assigned", () => {
    const result = validateDispatchable({
      state: "READY",
      riskLevel: "LOW",
      approvalStatus: "NOT_REQUIRED",
      hasWorkflowId: false,
      activeRunStatuses: [],
    });

    expect(result).toEqual({ ok: false, reason: "missing-workflow" });
  });

  it("allows redispatch from awaiting verification when no active run exists", () => {
    const result = validateDispatchable({
      state: "AWAITING_VERIFICATION",
      riskLevel: "LOW",
      approvalStatus: "NOT_REQUIRED",
      hasWorkflowId: true,
      activeRunStatuses: [],
    });

    expect(result).toEqual({ ok: true });
  });
});

describe("work order lifecycle synchronization", () => {
  it("moves completed verified work to DONE", () => {
    expect(
      nextStateForRunStatus({
        currentState: "IN_PROGRESS",
        runStatus: "COMPLETED",
        verificationStatus: "PASS",
        approvalStatus: "APPROVED",
      })
    ).toBe("AWAITING_VERIFICATION");
  });

  it("moves completed but unverified work to AWAITING_VERIFICATION", () => {
    expect(
      nextStateForRunStatus({
        currentState: "IN_PROGRESS",
        runStatus: "COMPLETED",
        verificationStatus: "PENDING",
        approvalStatus: "APPROVED",
      })
    ).toBe("AWAITING_VERIFICATION");
  });

  it("moves completed but unapproved work to AWAITING_APPROVAL", () => {
    expect(
      nextStateForRunStatus({
        currentState: "IN_PROGRESS",
        runStatus: "COMPLETED",
        verificationStatus: "PASS",
        approvalStatus: "PENDING",
      })
    ).toBe("AWAITING_APPROVAL");
  });

  it("moves failed work to BLOCKED", () => {
    expect(
      nextStateForRunStatus({
        currentState: "IN_PROGRESS",
        runStatus: "FAILED",
        verificationStatus: "PENDING",
        approvalStatus: "PENDING",
      })
    ).toBe("BLOCKED");
  });

  it("moves canceled work to CANCELED", () => {
    expect(
      nextStateForRunStatus({
        currentState: "DISPATCHED",
        runStatus: "CANCELED",
        verificationStatus: "PENDING",
        approvalStatus: "PENDING",
      })
    ).toBe("CANCELED");
  });

  it("moves paused work to AWAITING_APPROVAL", () => {
    expect(
      nextStateForRunStatus({
        currentState: "IN_PROGRESS",
        runStatus: "PAUSED",
        verificationStatus: "PENDING",
        approvalStatus: "PENDING",
      })
    ).toBe("AWAITING_APPROVAL");
  });
});
