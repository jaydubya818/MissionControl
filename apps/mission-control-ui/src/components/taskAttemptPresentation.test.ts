import { describe, expect, it } from "vitest";
import { presentTaskAttempt, type TaskAttemptPresentationInput } from "./taskAttemptPresentation";

const ATTEMPT: TaskAttemptPresentationInput = {
  currentAttemptNumber: 3,
  currentAttemptStatus: "COMPLETED",
  currentAttemptExecutionState: "COMPLETED_SUCCESS",
  currentAttemptPurpose: "VERIFICATION",
  currentVerificationStatus: "FAILED",
  currentVerificationVerdict: "NOT_VERIFIED",
  currentSourceAttemptNumber: 2,
  currentSourceAttemptStatus: "FAILED",
};

describe("Task Attempt presentation", () => {
  it("shows a failed verification verdict instead of presenting terminality as success", () => {
    expect(presentTaskAttempt(ATTEMPT)).toEqual({
      label: "Attempt 3 · Not verified",
      tone: "error",
      sourceLabel: "Source attempt 2 · Failed",
    });
  });

  it("does not imply success when a completed Verification Attempt has no verdict", () => {
    expect(presentTaskAttempt({
      ...ATTEMPT,
      currentVerificationStatus: null,
      currentVerificationVerdict: null,
      currentSourceAttemptNumber: null,
      currentSourceAttemptStatus: null,
    })).toEqual({
      label: "Attempt 3 · Verification outcome unavailable",
      tone: "neutral",
      sourceLabel: null,
    });
  });

  it("uses success styling only for an explicit VERIFIED verdict", () => {
    expect(presentTaskAttempt({
      ...ATTEMPT,
      currentVerificationStatus: "PASSED",
      currentVerificationVerdict: "VERIFIED",
      currentSourceAttemptStatus: "COMPLETED",
    })).toMatchObject({ label: "Attempt 3 · Verified", tone: "success" });
  });

  it("never presents a missing executor as legitimately running", () => {
    expect(presentTaskAttempt({
      ...ATTEMPT,
      currentAttemptStatus: "RUNNING",
      currentAttemptExecutionState: "STALE",
      currentVerificationStatus: null,
      currentVerificationVerdict: null,
    })).toMatchObject({ label: "Attempt 3 · Verification stale", tone: "error" });
  });
});
