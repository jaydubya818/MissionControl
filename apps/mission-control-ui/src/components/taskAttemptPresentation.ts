export interface TaskAttemptPresentationInput {
  currentAttemptNumber: number;
  currentAttemptStatus: string | null;
  currentAttemptExecutionState?: string | null;
  currentAttemptExecutionReason?: string | null;
  currentAttemptPurpose: string;
  currentVerificationStatus: string | null;
  currentVerificationVerdict: string | null;
  currentSourceAttemptNumber: number | null;
  currentSourceAttemptStatus: string | null;
}

export type TaskAttemptTone = "neutral" | "success" | "warning" | "error" | "info";

function titleCaseStatus(status: string) {
  return status.toLowerCase().replace(/_/g, " ").replace(/^./, (letter) => letter.toUpperCase());
}

export function presentTaskAttempt(attempt: TaskAttemptPresentationInput): {
  label: string;
  tone: TaskAttemptTone;
  sourceLabel: string | null;
} {
  const lineage = `Attempt ${attempt.currentAttemptNumber}`;
  const executionState = attempt.currentAttemptExecutionState ?? attempt.currentAttemptStatus;
  const sourceLabel = attempt.currentSourceAttemptNumber && attempt.currentSourceAttemptStatus
    ? `Source attempt ${attempt.currentSourceAttemptNumber} · ${titleCaseStatus(attempt.currentSourceAttemptStatus)}`
    : null;

  if (attempt.currentAttemptPurpose === "VERIFICATION") {
    if (executionState === "STALE") return { label: `${lineage} · Verification stale`, tone: "error", sourceLabel };
    if (attempt.currentVerificationStatus === "STALE") return { label: `${lineage} · Verification stale`, tone: "warning", sourceLabel };
    if (attempt.currentVerificationVerdict === "VERIFIED") return { label: `${lineage} · Verified`, tone: "success", sourceLabel };
    if (attempt.currentVerificationVerdict === "NOT_VERIFIED") return { label: `${lineage} · Not verified`, tone: "error", sourceLabel };
    if (attempt.currentVerificationVerdict === "BLOCKED") return { label: `${lineage} · Verification blocked`, tone: "error", sourceLabel };
    if (attempt.currentVerificationVerdict === "REQUIRES_HUMAN_REVIEW") return { label: `${lineage} · Review verification`, tone: "warning", sourceLabel };
    if (attempt.currentVerificationStatus === "FAILED" || attempt.currentAttemptStatus === "FAILED") {
      return { label: `${lineage} · Verification failed`, tone: "error", sourceLabel };
    }
    if (attempt.currentAttemptStatus === "COMPLETED") {
      return { label: `${lineage} · Verification outcome unavailable`, tone: "neutral", sourceLabel };
    }
    return { label: `${lineage} · ${titleCaseStatus(executionState ?? "pending verification")}`, tone: "info", sourceLabel };
  }

  return {
    label: `${lineage} · ${titleCaseStatus(executionState ?? "pending")}`,
    tone: ["FAILED", "COMPLETED_FAILURE", "STALE"].includes(executionState ?? "") ? "error"
      : executionState === "COMPLETED_SUCCESS" ? "success" : executionState === "BLOCKED" ? "warning" : "info",
    sourceLabel: null,
  };
}
