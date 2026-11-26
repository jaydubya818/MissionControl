const INSTRUCTION_PATTERN = /\b(ignore (?:all |any )?(?:previous|prior) instructions?|system prompt|developer message|tool call|exfiltrat(?:e|ion)|reveal (?:a )?secret)\b/i;

/** External review and CI text is evidence, never executable instruction. */
export function sanitizeMetaSignalText(value: string, maxLength = 1_000): string {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .split(/\r?\n/)
    .map((line) => INSTRUCTION_PATTERN.test(line) ? "[untrusted instruction removed]" : line)
    .join("\n")
    .trim()
    .slice(0, maxLength);
}

export function buildMetaMeasurement(input: {
  baseline: number;
  result: number;
  target: number;
  targetDirection?: "HIGHER_IS_BETTER" | "LOWER_IS_BETTER";
  unit: string;
  evidenceRefs: string[];
}, measuredAt = Date.now()) {
  if (![input.baseline, input.result, input.target].every(Number.isFinite)) {
    throw new Error("Measurement baseline, result, and target must be finite numbers.");
  }
  const targetDirection = input.targetDirection ?? "HIGHER_IS_BETTER";
  const targetMet = targetDirection === "LOWER_IS_BETTER"
    ? input.result <= input.target
    : input.result >= input.target;
  const verdict = targetMet ? "MET" as const : "MISSED" as const;
  return {
    baseline: input.baseline,
    result: input.result,
    target: input.target,
    targetDirection,
    unit: input.unit,
    evidenceRefs: input.evidenceRefs,
    verdict,
    measuredAt,
  };
}
