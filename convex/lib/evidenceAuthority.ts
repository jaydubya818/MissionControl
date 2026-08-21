/**
 * Evidence authority classes, and the rule that authority never increases by copying.
 *
 * ## The bug this exists to prevent
 *
 * `harnessPrChecks` has two writers that produce structurally identical rows:
 *
 * 1. `factory/githubCi.applyCiIngest` — an `internalMutation` behind the signed
 *    service envelope (`github.pr-evidence.ingest`), carrying `installationId`,
 *    `providerRepositoryId`, `headSha`, and a `sourceEventId` for replay
 *    protection. This is a genuine external attestation.
 *
 * 2. `factory/prChecks.upsertPrCheck` (via `syncFromSources` / `recordManual`) —
 *    which set `ciProvider: "github"` and derived
 *    `ciStatus: run.status === "COMPLETED" ? "PASS" : ...` from a **workflow run
 *    reporting its own completion**, with none of the provenance above.
 *
 * `mergeAuthoritySatisfied` then required only `ciStatus === "PASS"`. So a run
 * saying "I finished" became, three table hops later, the CI gate that authorized
 * a merge. Nothing lied at any single step; the authority was laundered by
 * copying a value into a field whose name implied a stronger source.
 *
 * ## Two orthogonal axes
 *
 * Conflating these is what makes the mistake easy, so they are modelled apart:
 *
 * - **Observation authority** (this module): *who asserts that this happened?*
 *   A worker asserting its own success is an `EXECUTION_CLAIM` no matter how many
 *   tables it passes through.
 *
 * - **Definition authority** (`@mission-control/workflow-engine/verification-authority`):
 *   *who decided what "success" means?* GitHub truthfully reporting SUCCESS for a
 *   workflow the candidate rewrote to `exit 0` is a real external observation of a
 *   candidate-defined check.
 *
 * Evidence is only **independent** when it is strong on both axes. A green CI
 * badge on a candidate-authored workflow is externally observed and
 * candidate-defined — worth recording, never sufficient on its own.
 */

/** Who asserts that the observed thing happened. */
export type ObservationAuthority =
  /** The producer reporting on its own work. The weakest class; the default. */
  | "EXECUTION_CLAIM"
  /** An external provider observed it, with provenance we can re-derive. */
  | "EXTERNAL_CI_ATTESTATION"
  /** A Mission Control verifier attempt with proven lineage isolation. */
  | "INDEPENDENT_VERIFIER_ATTESTATION"
  /** Mission Control's own measurement of its own infrastructure. */
  | "SYSTEM_OBSERVATION"
  /** A named human decided. */
  | "HUMAN_DECISION";

/**
 * Ordering used only to detect *laundering* — a transformation whose output
 * claims more authority than its input. It is deliberately not a quality
 * ranking: a HUMAN_DECISION is not "better evidence" than a verifier
 * attestation, it is a different kind of statement. What the ordering encodes
 * is how hard the class is to forge from inside the system.
 */
const AUTHORITY_RANK: Record<ObservationAuthority, number> = {
  EXECUTION_CLAIM: 0,
  SYSTEM_OBSERVATION: 1,
  EXTERNAL_CI_ATTESTATION: 2,
  HUMAN_DECISION: 3,
  INDEPENDENT_VERIFIER_ATTESTATION: 4,
};

/**
 * Authority must never increase across a transformation.
 *
 * `derived` is what a consumer would treat the record as; `inputs` are the
 * classes of everything that fed it. Copying a value never strengthens it.
 */
export function isAuthorityLaundering(
  derived: ObservationAuthority,
  inputs: ObservationAuthority[],
): boolean {
  if (inputs.length === 0) return false;
  const strongestInput = Math.max(...inputs.map((input) => AUTHORITY_RANK[input]));
  return AUTHORITY_RANK[derived] > strongestInput;
}

export interface PrCheckProvenance {
  source: "CODEGEN" | "WORKFLOW" | "GITHUB" | "MANUAL";
  /** GitHub App installation that produced the event. */
  installationId?: string;
  /** Provider-side numeric repository id, not a caller-supplied name. */
  providerRepositoryId?: string;
  provider?: string;
  /** Exact commit the check ran against. */
  headSha?: string;
  /** Provider event id; the replay/duplicate key. */
  sourceEventId?: string;
}

export interface PrCheckAuthorityResolution {
  authority: ObservationAuthority;
  /** Why it landed in that class — surfaced to operators, not just logs. */
  reason: string;
  /** Provenance fields a stronger class would have required but that are missing. */
  missingProvenance: string[];
}

const TRUSTED_GITHUB_FIELDS: Array<keyof PrCheckProvenance> = [
  "installationId",
  "providerRepositoryId",
  "provider",
  "headSha",
  "sourceEventId",
];

/**
 * Derive a PR check's observation authority from its provenance.
 *
 * Derived, never stored-and-trusted: a row cannot carry a label saying it is an
 * external attestation. It either has the provenance or it does not.
 */
export function classifyPrCheckAuthority(row: PrCheckProvenance): PrCheckAuthorityResolution {
  if (row.source === "MANUAL") {
    return {
      authority: "HUMAN_DECISION",
      reason: "Recorded manually by an authorized operator.",
      missingProvenance: [],
    };
  }

  if (row.source === "WORKFLOW" || row.source === "CODEGEN") {
    return {
      authority: "EXECUTION_CLAIM",
      reason:
        `Derived from the ${row.source === "WORKFLOW" ? "workflow run" : "codegen request"}'s own ` +
        "reported status. The producer is reporting on itself; no external provider observed it.",
      missingProvenance: TRUSTED_GITHUB_FIELDS.filter((field) => !row[field]).map(String),
    };
  }

  const missing = TRUSTED_GITHUB_FIELDS.filter((field) => !row[field]).map(String);
  if (missing.length > 0) {
    return {
      authority: "EXECUTION_CLAIM",
      reason:
        "Labelled as a GitHub result but missing the provenance required to prove GitHub produced it. " +
        "Fails closed to the weakest class rather than trusting the label.",
      missingProvenance: missing,
    };
  }

  return {
    authority: "EXTERNAL_CI_ATTESTATION",
    reason:
      "GitHub App installation, provider repository id, head SHA, and provider event id are all present, " +
      "so the result is re-derivable from a signed provider event.",
    missingProvenance: [],
  };
}

export type CiMergeAuthorityRefusal =
  | "NO_CI_EVIDENCE"
  | "NOT_EXTERNALLY_ATTESTED"
  | "NOT_PASSING"
  | "STALE_HEAD"
  | "ATTESTATION_EXPIRED"
  | "REPOSITORY_MISMATCH";

export interface CiMergeAuthorityDecision {
  satisfied: boolean;
  refusal?: CiMergeAuthorityRefusal;
  authority: ObservationAuthority;
  detail: string;
}

/**
 * May this CI evidence participate in merge authority?
 *
 * Previously the whole test was `ciStatus === "PASS"`. It now additionally
 * requires that the PASS came from outside Mission Control, is bound to the
 * exact candidate head under consideration, is for this repository, and has not
 * expired.
 */
export function evaluateCiMergeAuthority(input: {
  row?: (PrCheckProvenance & {
    ciStatus?: "PASS" | "FAIL" | "PENDING" | "UNKNOWN";
    attestationExpiresAt?: number;
  }) | null;
  /** The candidate head the merge decision is about. */
  expectedHeadSha?: string;
  /** Provider repository id the WorkOrder is bound to, when known. */
  expectedProviderRepositoryId?: string;
  now: number;
}): CiMergeAuthorityDecision {
  const row = input.row;
  if (!row) {
    return {
      satisfied: false,
      refusal: "NO_CI_EVIDENCE",
      authority: "EXECUTION_CLAIM",
      detail: "No CI evidence is recorded for this pull request.",
    };
  }

  const resolution = classifyPrCheckAuthority(row);
  if (resolution.authority !== "EXTERNAL_CI_ATTESTATION") {
    return {
      satisfied: false,
      refusal: "NOT_EXTERNALLY_ATTESTED",
      authority: resolution.authority,
      detail:
        `CI evidence is ${resolution.authority}, not an external attestation. ${resolution.reason}` +
        (resolution.missingProvenance.length
          ? ` Missing: ${resolution.missingProvenance.join(", ")}.`
          : ""),
    };
  }

  if (row.ciStatus !== "PASS") {
    return {
      satisfied: false,
      refusal: "NOT_PASSING",
      authority: resolution.authority,
      detail: `External CI reported ${row.ciStatus ?? "UNKNOWN"}.`,
    };
  }

  if (
    input.expectedProviderRepositoryId &&
    row.providerRepositoryId !== input.expectedProviderRepositoryId
  ) {
    return {
      satisfied: false,
      refusal: "REPOSITORY_MISMATCH",
      authority: resolution.authority,
      detail:
        `CI evidence is for provider repository ${row.providerRepositoryId}, ` +
        `not ${input.expectedProviderRepositoryId}. A valid check from another repository proves nothing here.`,
    };
  }

  if (input.expectedHeadSha && row.headSha !== input.expectedHeadSha) {
    return {
      satisfied: false,
      refusal: "STALE_HEAD",
      authority: resolution.authority,
      detail:
        `CI evidence is bound to head ${row.headSha ?? "(none)"}, but the candidate under consideration ` +
        `is ${input.expectedHeadSha}. A valid result for a previous candidate does not carry forward.`,
    };
  }

  if (row.attestationExpiresAt !== undefined && row.attestationExpiresAt <= input.now) {
    return {
      satisfied: false,
      refusal: "ATTESTATION_EXPIRED",
      authority: resolution.authority,
      detail: "The external CI attestation has expired and must be re-observed.",
    };
  }

  return {
    satisfied: true,
    authority: resolution.authority,
    detail: "External CI attestation is passing, current for this candidate head, and in scope.",
  };
}

/**
 * Whether the checks that produced a CI result were themselves defined by the
 * candidate.
 *
 * This is the second axis, and the one that makes a green GitHub badge
 * misleading rather than merely weak:
 *
 *     candidate edits .github/workflows/verify.yml so the job runs `exit 0`
 *       -> GitHub runs it and truthfully reports SUCCESS
 *       -> the attestation is genuine: GitHub really did observe a success
 *       -> and it proves nothing, because the candidate wrote the success
 *
 * `EXTERNAL_CI_ATTESTATION` remains the correct OBSERVATION class there — GitHub
 * did observe it. What must not happen is that observation being read as
 * independent verification. So definition authority is tracked separately and
 * both are required before evidence counts as independent.
 */
export type DefinitionAuthority = "CANDIDATE_DEPENDENT" | "INDEPENDENT";

/** Repository paths whose content defines what a CI run executes. */
const CI_DEFINITION_PATTERN =
  /(^|\/)\.github\/workflows\/|(^|\/)(\.gitlab-ci\.ya?ml|azure-pipelines\.ya?ml|Jenkinsfile)$|(^|\/)\.circleci\/|(^|\/)\.buildkite\//i;

export interface CiDefinitionAuthorityResolution {
  authority: DefinitionAuthority;
  /** The candidate-authored files that define the CI run, if any. */
  definingPaths: string[];
  reason: string;
}

/**
 * Decide whether a CI result's definition is candidate-controlled.
 *
 * `trustedWorkflowRefs` names workflows Mission Control considers out of the
 * candidate's reach — for example an organisation-level reusable workflow
 * referenced by `owner/repo/.github/workflows/x.yml@sha`, which the candidate's
 * repository cannot modify. When the observed check maps to one of those, the
 * result stays INDEPENDENT even though the candidate touched its own CI files.
 */
export function classifyCiDefinitionAuthority(input: {
  /** Files this candidate changed or deleted, relative to the repository root. */
  candidatePaths: string[];
  /** Workflow identities that are not modifiable from this repository. */
  trustedWorkflowRefs?: string[];
  /** Workflow/check identity the result came from, when known. */
  observedWorkflowRef?: string;
}): CiDefinitionAuthorityResolution {
  const trusted = input.trustedWorkflowRefs ?? [];
  if (input.observedWorkflowRef && trusted.includes(input.observedWorkflowRef)) {
    return {
      authority: "INDEPENDENT",
      definingPaths: [],
      reason:
        `The check ran from ${input.observedWorkflowRef}, which is registered as not modifiable from this repository.`,
    };
  }

  const definingPaths = input.candidatePaths
    .map((path) => path.replace(/\\/g, "/").replace(/^\.\//, ""))
    .filter((path) => CI_DEFINITION_PATTERN.test(path))
    .sort();

  if (definingPaths.length === 0) {
    return {
      authority: "INDEPENDENT",
      definingPaths: [],
      reason: "The candidate did not modify any CI definition that could change what the checks run.",
    };
  }

  return {
    authority: "CANDIDATE_DEPENDENT",
    definingPaths,
    reason:
      `The candidate modified ${definingPaths.join(", ")}, which define what CI executes. The provider ` +
      "genuinely observed the run; the candidate authored what it observed.",
  };
}

export interface EvidenceIndependence {
  independent: boolean;
  observation: ObservationAuthority;
  definition: DefinitionAuthority;
  reason: string;
}

/**
 * Evidence is independent only when it is strong on BOTH axes.
 *
 * This is the single function a consumer should ask, rather than reading either
 * axis alone and drawing the wrong conclusion from it.
 */
export function resolveEvidenceIndependence(input: {
  observation: ObservationAuthority;
  definition: DefinitionAuthority;
}): EvidenceIndependence {
  const observationIsExternal =
    input.observation === "EXTERNAL_CI_ATTESTATION" ||
    input.observation === "INDEPENDENT_VERIFIER_ATTESTATION";

  if (!observationIsExternal) {
    return {
      independent: false,
      observation: input.observation,
      definition: input.definition,
      reason: `Observation authority is ${input.observation}: the producer is reporting on its own work.`,
    };
  }
  if (input.definition === "CANDIDATE_DEPENDENT") {
    return {
      independent: false,
      observation: input.observation,
      definition: input.definition,
      reason:
        "Externally observed, but the candidate defined what was checked. Observation without independent " +
        "definition is a true statement about a test the subject wrote for itself.",
    };
  }
  return {
    independent: true,
    observation: input.observation,
    definition: input.definition,
    reason: "Observed outside Mission Control, against a definition the candidate does not control.",
  };
}
