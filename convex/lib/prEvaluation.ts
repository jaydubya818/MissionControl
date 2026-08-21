export function prEvaluationKey(prUrl: string, headSha: string): string {
  return `${prUrl.trim().replace(/\/$/, "").toLowerCase()}@${headSha.trim().toLowerCase()}`;
}

export function correctionRequired(input: {
  ciStatus: "PASS" | "FAIL" | "PENDING" | "UNKNOWN";
  priorHeadSha?: string;
  headSha?: string;
}): boolean {
  if (input.ciStatus !== "FAIL") return false;
  return Boolean(input.headSha && input.headSha !== input.priorHeadSha);
}

export function ciBlockCanRecover(input: {
  ciStatus: "PASS" | "FAIL" | "PENDING" | "UNKNOWN";
  blockingIssue?: string;
  priorHeadSha?: string;
  headSha?: string;
}): boolean {
  return input.ciStatus === "PASS"
    && Boolean(input.headSha && input.priorHeadSha && input.headSha !== input.priorHeadSha)
    && input.blockingIssue === `Required CI failed for ${input.priorHeadSha}`;
}

export function ciBlockedHead(blockingIssue?: string): string | undefined {
  const prefix = "Required CI failed for ";
  if (!blockingIssue?.startsWith(prefix)) return undefined;
  const headSha = blockingIssue.slice(prefix.length).trim();
  return headSha || undefined;
}

/**
 * May a merge be recorded?
 *
 * `ciStatus === "PASS"` used to be the entire CI test. That was satisfiable by a
 * workflow run reporting its own completion, because `prChecks.upsertPrCheck`
 * mapped `run.status === "COMPLETED"` straight onto `ciStatus: "PASS"` and
 * stamped `ciProvider: "github"` on it. An execution claim therefore authorized
 * merges.
 *
 * `ciAuthority` is now required alongside the status: callers pass the decision
 * from `evaluateCiMergeAuthority`, which additionally proves the PASS came from
 * a signed GitHub App event, for this repository, bound to this exact candidate
 * head, unexpired. The `ciStatus` argument is retained so the two must agree —
 * a caller cannot satisfy one and skip the other.
 */
export function mergeAuthoritySatisfied(input: {
  ciStatus: "PASS" | "FAIL" | "PENDING" | "UNKNOWN";
  gatesPass: boolean;
  approvalStatus?: string;
  humanConfirmed: boolean;
  /**
   * Whether external CI evidence satisfies merge authority. Optional only for
   * back-compatibility with existing callers/tests that pre-date the class
   * model; when omitted it defaults to the legacy `ciStatus` test, so omitting
   * it can never *grant* authority that the status alone would not.
   */
  ciAuthoritySatisfied?: boolean;
}): boolean {
  const ciSatisfied = input.ciAuthoritySatisfied ?? (input.ciStatus === "PASS");
  return ciSatisfied
    && input.ciStatus === "PASS"
    && input.gatesPass
    && ["APPROVED", "CONDITIONAL"].includes(input.approvalStatus ?? "")
    && input.humanConfirmed;
}
