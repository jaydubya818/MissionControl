/** Per-PR change risk gate badge (Change Risk Analyzer from talk). */
export function HarnessChangeRiskBadge({
  requiresHuman,
  reason,
  prLines,
}: {
  requiresHuman: boolean;
  reason?: string;
  prLines?: number;
}): JSX.Element {
  const smallPr = prLines !== undefined && prLines <= 300;
  const autoEligible = !requiresHuman && smallPr;

  return (
    <div className="inline-flex flex-wrap items-center gap-2">
      <span
        className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase ${
          requiresHuman
            ? "bg-warn/15 text-warn"
            : autoEligible
              ? "bg-ok/15 text-ok"
              : "bg-registry-accent-soft text-registry-accent"
        }`}
      >
        {requiresHuman ? "Human review required" : autoEligible ? "Auto-merge eligible" : "Agent review only"}
      </span>
      {prLines !== undefined && (
        <span className="text-[10px] text-ink-muted">{prLines} diff lines</span>
      )}
      {reason ? <span className="text-[10px] text-ink-muted">{reason}</span> : null}
    </div>
  );
}

export function evaluateChangeRisk(input: {
  strictness: number;
  repoFullName: string;
  diffLineCount?: number;
  ciStatus?: string;
}): { requiresHuman: boolean; reason: string } {
  const lines = input.diffLineCount ?? 0;
  if (lines > 5000) {
    return { requiresHuman: true, reason: "Large PR (>5000 lines)" };
  }
  if (/prod|api|auth|payment/i.test(input.repoFullName) && input.strictness > 40) {
    return { requiresHuman: true, reason: "Production path + strict policy" };
  }
  if (input.ciStatus === "FAIL") {
    return { requiresHuman: true, reason: "CI failing" };
  }
  if (lines <= 300 && input.strictness < 60) {
    return { requiresHuman: false, reason: "Small contained change" };
  }
  return {
    requiresHuman: input.strictness >= 50,
    reason: input.strictness >= 50 ? "Policy strictness" : "Low-risk path",
  };
}
