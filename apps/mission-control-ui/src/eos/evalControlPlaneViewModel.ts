import type { StatusBadgeProps } from "../components/factory/badges";

export type EvalReceiptVerdict = "PASS" | "WARN" | "FAIL" | "INVALID";

export function evalVerdictTone(verdict?: string): StatusBadgeProps["tone"] {
  if (verdict === "PASS") return "success";
  if (verdict === "WARN") return "warning";
  if (verdict === "FAIL" || verdict === "INVALID") return "error";
  return "neutral";
}

export function evalCaseTone(verdict?: string): StatusBadgeProps["tone"] {
  if (verdict === "PASS") return "success";
  if (verdict === "FAIL" || verdict === "INVALID") return "error";
  if (verdict === "SKIPPED") return "warning";
  return "neutral";
}

export function evalNextAction(input?: {
  verdict?: string;
  blockingRegressions?: number;
  invalidCases?: number;
  advisoryFailures?: number;
}): string {
  if (!input?.verdict) return "Run the suite against an exact candidate and publish its complete receipt.";
  if (input.verdict === "INVALID" || (input.invalidCases ?? 0) > 0) {
    return "Repair the harness or missing case accounting, then rerun. Do not interpret this result as product quality.";
  }
  if (input.verdict === "FAIL" || (input.blockingRegressions ?? 0) > 0) {
    return "Investigate the blocking case and slice regressions before relying on this candidate.";
  }
  if (input.verdict === "WARN" || (input.advisoryFailures ?? 0) > 0) {
    return "Blocking trust checks are intact. Close the advisory evidence gaps before claiming full coverage.";
  }
  return "No eval exception requires action. Independent verification and human acceptance still apply.";
}

export function shortEvalDigest(value?: string, length = 12): string {
  if (!value) return "—";
  return value.startsWith("sha256:") ? value.slice(7, 7 + length) : value.slice(0, length);
}
