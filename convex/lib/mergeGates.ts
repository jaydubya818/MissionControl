/** Paul Stack five merge gates — derived from PR check + verifier signals. */

import type { ChangeReviewLens } from "./harnessPrChecks";

export interface MergeGateStatus {
  id: string;
  label: string;
  description: string;
  passed: boolean;
}

const GATE_META = [
  {
    id: "code-review",
    label: "Code review",
    description: "Standard PR review lens — required by process.",
  },
  {
    id: "adversarial",
    label: "Adversarial review",
    description: "Assume everything is broken — prove security, injection, architecture.",
  },
  {
    id: "ux-review",
    label: "UX / CLI review",
    description: "Verb consistency (create, get), no CLI regressions.",
  },
  {
    id: "ci-security",
    label: "CI security review",
    description: "Catch pipeline injection before merge.",
  },
  {
    id: "skill-check",
    label: "Skill check",
    description: "Skill content, format, triggers — agent experience gate.",
  },
] as const;

function lensScore(lenses: ChangeReviewLens[], id: string): number | undefined {
  return lenses.find((l) => l.id === id)?.score;
}

export function computeMergeGates(input: {
  lenses: ChangeReviewLens[];
  ciStatus?: string;
  mutationCoveragePct?: number;
  activeVerifierCount: number;
  securityFindingCount?: number;
}): MergeGateStatus[] {
  const { lenses, ciStatus, mutationCoveragePct, activeVerifierCount, securityFindingCount } = input;
  const securityScore = lensScore(lenses, "security") ?? 0;
  const readabilityScore = lensScore(lenses, "readability") ?? 0;
  const platformScore = lensScore(lenses, "platform") ?? 0;
  const hasLenses = lenses.length > 0;
  const ciPass = ciStatus === "PASS";
  const secFindings = securityFindingCount ?? 0;

  const passedById: Record<string, boolean> = {
    "code-review": hasLenses && (securityScore + readabilityScore + platformScore) / 3 >= 70,
    adversarial: securityScore >= 80 && secFindings === 0,
    "ux-review": readabilityScore >= 75 && platformScore >= 70,
    "ci-security": ciPass && secFindings === 0,
    "skill-check": activeVerifierCount > 0 || (mutationCoveragePct ?? 0) >= 60,
  };

  return GATE_META.map((g) => ({
    id: g.id,
    label: g.label,
    description: g.description,
    passed: passedById[g.id] ?? false,
  }));
}

export function passedGateIds(gates: MergeGateStatus[]): string[] {
  return gates.filter((g) => g.passed).map((g) => g.id);
}
