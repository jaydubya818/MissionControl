/**
 * Truthful display of *what kind* of statement a green check is.
 *
 * "This check passed" and "this check is independent" are different claims, and
 * the UI previously rendered only the first while operators read it as both. A
 * `pnpm test` PASS was shown identically whether or not the candidate had
 * rewritten `package.json#scripts.test`, and a `ciStatus: PASS` derived from a
 * workflow run reporting its own completion was shown identically to a signed
 * GitHub App attestation.
 *
 * The result stays where it is; the authority is shown next to it. An operator
 * scanning the table sees the status, and the badge tells them how much the
 * status is worth without them having to open anything.
 */

import { cn } from "@/lib/utils";

export type EvidenceAuthorityKind =
  | "INDEPENDENT"
  | "CANDIDATE_DEPENDENT"
  | "EXTERNAL_OBSERVED"
  | "EXECUTION_CLAIM"
  | "HUMAN_DECISION"
  | "UNKNOWN";

interface AuthorityPresentation {
  label: string;
  /** One line an operator can act on, not a taxonomy lecture. */
  summary: string;
  className: string;
}

const PRESENTATION: Record<EvidenceAuthorityKind, AuthorityPresentation> = {
  INDEPENDENT: {
    label: "Independent",
    summary: "Produced by a verifier the candidate does not control.",
    className: "border-ok/40 bg-ok/10 text-ink",
  },
  CANDIDATE_DEPENDENT: {
    label: "Candidate-dependent",
    summary:
      "The check ran, and the candidate's own repository defines what passing means. Useful evidence; not independent proof.",
    className: "border-warn/40 bg-warn/10 text-ink",
  },
  EXTERNAL_OBSERVED: {
    label: "Externally observed",
    summary:
      "An outside provider confirmed the run happened. Whether the candidate defined the check is shown separately.",
    className: "border-line-control bg-surface-2 text-ink",
  },
  EXECUTION_CLAIM: {
    label: "Self-reported",
    summary:
      "The component that did the work is the only thing asserting it succeeded. No independent party observed it.",
    className: "border-warn/40 bg-warn/10 text-ink",
  },
  HUMAN_DECISION: {
    label: "Human-recorded",
    summary: "A named operator recorded this. It is a decision, not a measurement.",
    className: "border-line-control bg-surface-2 text-ink",
  },
  UNKNOWN: {
    label: "Authority unknown",
    summary:
      "This record predates authority classification, so its independence cannot be established. Treat as self-reported.",
    className: "border-warn/40 bg-warn/10 text-ink",
  },
};

/**
 * Map a verification evidence producer onto a display kind.
 *
 * A missing `definitionAuthority` reads as UNKNOWN rather than as independent —
 * omission must never be the optimistic case.
 */
export function authorityKindForProducer(producer?: {
  independent?: boolean;
  definitionAuthority?: "CANDIDATE_DEPENDENT" | "INDEPENDENT";
}): EvidenceAuthorityKind {
  if (!producer) return "UNKNOWN";
  if (producer.definitionAuthority === "INDEPENDENT") return "INDEPENDENT";
  if (producer.definitionAuthority === "CANDIDATE_DEPENDENT") return "CANDIDATE_DEPENDENT";
  return "UNKNOWN";
}

/** Map a stored PR-check observation authority onto a display kind. */
export function authorityKindForObservation(observation?: string): EvidenceAuthorityKind {
  switch (observation) {
    case "EXTERNAL_CI_ATTESTATION":
      return "EXTERNAL_OBSERVED";
    case "INDEPENDENT_VERIFIER_ATTESTATION":
      return "INDEPENDENT";
    case "HUMAN_DECISION":
      return "HUMAN_DECISION";
    case "EXECUTION_CLAIM":
    case "SYSTEM_OBSERVATION":
      return "EXECUTION_CLAIM";
    default:
      return "UNKNOWN";
  }
}

export interface EvidenceAuthorityBadgeProps {
  kind: EvidenceAuthorityKind;
  /** Specific reason from the server, shown in place of the generic summary. */
  reason?: string;
  className?: string;
}

export function EvidenceAuthorityBadge({
  kind,
  reason,
  className,
}: EvidenceAuthorityBadgeProps): JSX.Element {
  const presentation = PRESENTATION[kind];
  const detail = reason?.trim() || presentation.summary;
  return (
    <span
      // The detail is the drill-down: available on hover and to assistive tech
      // without adding a second row to a dense table.
      title={detail}
      aria-label={`${presentation.label} — ${detail}`}
      className={cn(
        "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap",
        presentation.className,
        className,
      )}
    >
      {presentation.label}
    </span>
  );
}

/**
 * Whether an overall verification badge may be shown as green.
 *
 * A run whose criteria demanded independent evidence but received only
 * candidate-dependent evidence has a real verdict of NOT_VERIFIED — this exists
 * so no summary tile renders green next to it.
 */
export function verificationIsGreen(verdict?: string): boolean {
  return verdict === "VERIFIED";
}
