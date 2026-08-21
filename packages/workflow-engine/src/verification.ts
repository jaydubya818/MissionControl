import {
  authorityDigestInput,
  evaluateVerificationAuthority,
  type VerificationAuthorityPolicy,
} from "./verificationAuthority.js";

export type VerificationCheckStatus = "PASS" | "FAIL" | "SKIPPED" | "NOT_CONFIGURED" | "ERROR";
export type VerificationVerdict = "VERIFIED" | "NOT_VERIFIED" | "BLOCKED" | "REQUIRES_HUMAN_REVIEW";

export type VerificationCategory =
  | "BUILD" | "TYPECHECK" | "UNIT_TEST" | "INTEGRATION_TEST" | "CONTRACT_TEST"
  | "SECURITY" | "SECRETS" | "DEPENDENCY" | "POLICY" | "CHANGE_BUDGET"
  | "ACCEPTANCE" | "INDEPENDENT_REVIEW";

export type EvidenceCategory =
  | "TEST_RESULT" | "BUILD_RESULT" | "STATIC_ANALYSIS" | "SECURITY_SCAN"
  | "COMMAND_LOG" | "FILE_DIFF" | "SCREENSHOT" | "BROWSER_RESULT"
  | "PERFORMANCE_RESULT" | "REVIEW_RESULT" | "POLICY_RESULT" | "CI_RESULT"
  | "RUNTIME_OBSERVATION";

export type CommandClass =
  | "BUILD" | "TYPECHECK" | "TEST" | "LINT" | "SECURITY_SCAN" | "DEPENDENCY_SCAN"
  | "MIGRATION" | "INFRASTRUCTURE" | "PRODUCTION_ACCESS" | "SECRETS_ACCESS"
  | "DESTRUCTIVE" | "PUBLISH";

/**
 * How independent the evidence for a criterion has to be.
 *
 * Two different properties were previously collapsed into one boolean:
 *
 * - **Lineage independence** — the verifier ran as a separate Attempt, lease and
 *   executor invocation from the builder. This is what `independent: boolean`
 *   has always meant, and it is what `deriveVerificationIndependence` proves.
 * - **Definition independence** — the candidate does not control what the check
 *   considers "passing". `pnpm test` is lineage-independent and definition-
 *   dependent at the same time.
 *
 * `independent: true` keeps its original lineage meaning so existing contracts
 * are unchanged. `independenceLevel` is the new, explicit axis, and it defaults
 * to `CANDIDATE_DEPENDENT_ALLOWED` — i.e. exactly the behaviour every existing
 * contract already has. A contract opts in to the stronger requirement; nothing
 * is silently tightened underneath deployments that never asked for it.
 */
export type EvidenceIndependenceLevel =
  /** Any evidence for the category counts. */
  | "ANY_VERIFICATION"
  /** Repository-defined checks count. The default, and correct for most work. */
  | "CANDIDATE_DEPENDENT_ALLOWED"
  /** Only evidence the candidate cannot have defined counts. */
  | "INDEPENDENT_REQUIRED";

export interface EvidenceRequirement {
  category: EvidenceCategory;
  minimumCount: number;
  /** Lineage independence: produced by a verifier separate from the builder. */
  independent: boolean;
  /**
   * Definition independence. Absent means `CANDIDATE_DEPENDENT_ALLOWED`.
   * Set `INDEPENDENT_REQUIRED` for security, authorization, sandbox isolation,
   * publication authority, and acceptance invariants.
   */
  independenceLevel?: EvidenceIndependenceLevel;
}

export interface AcceptanceCriterionSpec {
  id: string;
  title: string;
  requirementIds?: string[];
  requiredEvidence?: EvidenceRequirement[];
}

export interface ChangeBudget {
  maxFilesChanged: number;
  maxLinesChanged: number;
  allowedPaths: string[];
  deniedPaths: string[];
  allowedCommandClasses: CommandClass[];
  prohibitedCommandClasses: CommandClass[];
  allowDependencyChanges: boolean;
  allowSchemaChanges: boolean;
  allowMigrations: boolean;
  allowInfrastructureChanges: boolean;
}

export interface NegativeConstraint {
  id: string;
  type:
    | "PROTECTED_PATH" | "NO_AUTH_CHANGES" | "NO_PRODUCTION_ACCESS"
    | "NO_PLAINTEXT_SECRETS" | "NO_PUBLIC_API_CHANGES" | "NO_SCHEMA_CHANGES"
    | "NO_NEW_DEPENDENCIES" | "NO_TEST_REMOVAL" | "NO_ASSERTION_WEAKENING"
    | "NO_VERIFICATION_CONFIG_CHANGES" | "CUSTOM";
  description: string;
  paths?: string[];
  pattern?: string;
}

export interface VerificationCheckSpec {
  id: string;
  name: string;
  category: VerificationCategory;
  verifierId: string;
  mandatory: boolean;
  acceptanceCriterionIds: string[];
  evidenceCategory: EvidenceCategory;
  command?: {
    executable: string;
    args: string[];
    commandClass: CommandClass;
    timeoutMs: number;
  };
}

export interface VerificationContract {
  schemaVersion: number;
  enforcementMode: "OBSERVE_ONLY" | "ENFORCED";
  checks: VerificationCheckSpec[];
  requireHumanReview: boolean;
  /**
   * Permission for this WorkOrder's candidate to change files that determine
   * its own verification verdict (package scripts, Makefiles, test configs,
   * tests themselves).
   *
   * Absent means "not permitted", which is the safe default. It is part of the
   * FROZEN contract precisely so that the decision predates the candidate:
   * a candidate can never grant itself this. See `verificationAuthority.ts`.
   */
  authorityPolicy?: VerificationAuthorityPolicy;
}

export interface WorkOrderVerificationSpec {
  id: string;
  revisionNumber: number;
  title: string;
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  riskReasons: string[];
  acceptanceCriteria: AcceptanceCriterionSpec[];
  negativeConstraints: NegativeConstraint[];
  changeBudget?: ChangeBudget;
  verificationContract?: VerificationContract;
  requiredApprovals: string[];
}

export interface CandidateChange {
  sourceRevision: string;
  candidateRevision: string;
  changedFiles: string[];
  deletedFiles: string[];
  linesAdded: number;
  linesDeleted: number;
  diff: string;
}

export interface VerificationEvidenceDraft {
  evidenceKey: string;
  category: EvidenceCategory;
  result: VerificationCheckStatus;
  summary: string;
  acceptanceCriterionIds: string[];
  producer: {
    id: string;
    role: string;
    /** Lineage independence — a separate verifier process produced this. */
    independent: boolean;
    /**
     * Definition independence — whether the candidate controls what this check
     * treats as passing. Absent on evidence produced before the axis existed,
     * and treated as CANDIDATE_DEPENDENT (the safe reading) when required.
     */
    definitionAuthority?: "CANDIDATE_DEPENDENT" | "INDEPENDENT";
  };
  contentHash?: string;
  artifactReferences?: string[];
  metadata?: Record<string, unknown>;
}

export interface VerificationCheckResult {
  checkId: string;
  name: string;
  category: VerificationCategory;
  verifierId: string;
  mandatory: boolean;
  status: VerificationCheckStatus;
  summary: string;
  acceptanceCriterionIds: string[];
  startedAt: number;
  completedAt: number;
  durationMs: number;
  evidence: VerificationEvidenceDraft[];
  violations: string[];
  metadata?: Record<string, unknown>;
}

export interface CriterionCoverage {
  criterionId: string;
  title: string;
  status: "EVIDENCED" | "MISSING";
  requiredEvidenceCount: number;
  usableEvidenceCount: number;
  missingEvidence: string[];
  evidenceKeys: string[];
}

export interface VerificationExecutionContext {
  workflowRunId: string;
  workOrder: WorkOrderVerificationSpec;
  candidate: CandidateChange;
  signal?: AbortSignal;
}

export interface Verifier {
  id: string;
  name: string;
  supports(check: VerificationCheckSpec): boolean;
  execute(context: VerificationExecutionContext, check: VerificationCheckSpec): Promise<VerificationCheckResult>;
}

export interface VerificationEngineResult {
  engineVersion: string;
  startedAt: number;
  completedAt: number;
  sourceRevision: string;
  candidateRevision: string;
  checks: VerificationCheckResult[];
  coverage: CriterionCoverage[];
  requirementsPassed: number;
  requirementsFailed: number;
  violations: string[];
  approvalRequirements: string[];
  riskLevel: WorkOrderVerificationSpec["riskLevel"];
  riskReasons: string[];
  verdict: VerificationVerdict;
  verdictReasons: string[];
}

/**
 * Always-on system check. Unlike a negative constraint, this is NOT opt-in:
 * a WorkOrder cannot escape it by simply not declaring it. See
 * `verificationAuthority.ts` for why.
 */
const VERIFICATION_AUTHORITY_CHECK: VerificationCheckSpec = {
  id: "factory-verification-authority", name: "Verification authority", category: "POLICY",
  verifierId: "factory-verification-authority", mandatory: true, acceptanceCriterionIds: [], evidenceCategory: "POLICY_RESULT",
};
const CHANGE_BUDGET_CHECK: VerificationCheckSpec = {
  id: "factory-change-budget", name: "Change budget", category: "CHANGE_BUDGET",
  verifierId: "factory-change-budget", mandatory: true, acceptanceCriterionIds: [], evidenceCategory: "POLICY_RESULT",
};
const NEGATIVE_CONSTRAINTS_CHECK: VerificationCheckSpec = {
  id: "factory-negative-constraints", name: "Negative-space constraints", category: "POLICY",
  verifierId: "factory-negative-constraints", mandatory: true, acceptanceCriterionIds: [], evidenceCategory: "POLICY_RESULT",
};

export class VerificationEngine {
  private readonly verifiers: Verifier[];

  constructor(verifiers: Verifier[], private readonly engineVersion = "verification-engine/v1") {
    // The authority verifier is supplied by the engine rather than by the
    // caller. A control that a caller can forget to register is a control an
    // attacker only has to get omitted once; making it structural means no
    // call site can produce a VERIFIED verdict without it having run.
    const hasAuthorityVerifier = verifiers.some(
      (verifier) => verifier.id === VERIFICATION_AUTHORITY_CHECK.verifierId,
    );
    this.verifiers = hasAuthorityVerifier ? verifiers : [new VerificationAuthorityVerifier(), ...verifiers];
  }

  async execute(context: VerificationExecutionContext): Promise<VerificationEngineResult> {
    const startedAt = Date.now();
    const contract = context.workOrder.verificationContract;
    const checks = contract
      ? addSystemChecks(contract.checks, context.workOrder)
      : [notConfiguredContractCheck(context.workOrder.acceptanceCriteria.map((criterion) => criterion.id))];
    const results: VerificationCheckResult[] = [];
    for (const check of checks) {
      if (context.signal?.aborted) {
        results.push(resultForStatus(check, "ERROR", "Verification was canceled before this check ran."));
        continue;
      }
      const verifier = this.verifiers.find((candidate) => candidate.supports(check));
      if (!verifier) {
        results.push(resultForStatus(check, "NOT_CONFIGURED", `Required verifier ${check.verifierId} is not configured.`));
        continue;
      }
      try {
        results.push(normalizeResult(check, await verifier.execute(context, check)));
      } catch (error) {
        results.push(resultForStatus(check, "ERROR", error instanceof Error ? error.message : String(error)));
      }
    }
    const coverage = calculateCriterionCoverage(context.workOrder.acceptanceCriteria, results);
    const outcome = evaluateVerificationOutcome({ checks: results, coverage, requireHumanReview: contract?.requireHumanReview ?? false });
    const completedAt = Date.now();
    return {
      engineVersion: this.engineVersion,
      startedAt,
      completedAt,
      sourceRevision: context.candidate.sourceRevision,
      candidateRevision: context.candidate.candidateRevision,
      checks: results,
      coverage,
      requirementsPassed: coverage.filter((item) => item.status === "EVIDENCED").length,
      requirementsFailed: coverage.filter((item) => item.status === "MISSING").length,
      violations: results.flatMap((result) => result.violations),
      approvalRequirements: context.workOrder.requiredApprovals,
      riskLevel: context.workOrder.riskLevel,
      riskReasons: context.workOrder.riskReasons,
      ...outcome,
    };
  }
}

export class ChangeBudgetVerifier implements Verifier {
  readonly id = "factory-change-budget";
  readonly name = "Factory change-budget verifier";
  supports(check: VerificationCheckSpec) { return check.verifierId === this.id; }

  async execute(context: VerificationExecutionContext, check: VerificationCheckSpec): Promise<VerificationCheckResult> {
    const startedAt = Date.now();
    const budget = context.workOrder.changeBudget;
    if (!budget) return resultForStatus(check, "NOT_CONFIGURED", "The WorkOrder has no change budget.", startedAt);
    const change = context.candidate;
    const violations: string[] = [];
    const totalLines = change.linesAdded + change.linesDeleted;
    if (change.changedFiles.length > budget.maxFilesChanged) violations.push(`Change budget exceeded: ${change.changedFiles.length} files changed; maximum ${budget.maxFilesChanged}.`);
    if (totalLines > budget.maxLinesChanged) violations.push(`Change budget exceeded: ${totalLines} changed lines; maximum ${budget.maxLinesChanged}.`);
    const outsideAllowed = budget.allowedPaths.length
      ? change.changedFiles.filter((file) => !budget.allowedPaths.some((pattern) => matchesRepositoryPattern(file, pattern))) : [];
    const denied = change.changedFiles.filter((file) => budget.deniedPaths.some((pattern) => matchesRepositoryPattern(file, pattern)));
    if (outsideAllowed.length) violations.push(`Files outside allowed paths: ${outsideAllowed.join(", ")}.`);
    if (denied.length) violations.push(`Protected paths modified: ${denied.join(", ")}.`);
    if (!budget.allowDependencyChanges && change.changedFiles.some(isDependencyFile)) violations.push("Dependency changes are not permitted.");
    if (!budget.allowSchemaChanges && change.changedFiles.some(isSchemaFile)) violations.push("Schema changes are not permitted.");
    if (!budget.allowMigrations && change.changedFiles.some(isMigrationFile)) violations.push("Migration changes are not permitted.");
    if (!budget.allowInfrastructureChanges && change.changedFiles.some(isInfrastructureFile)) violations.push("Infrastructure changes are not permitted.");
    const status: VerificationCheckStatus = violations.length ? "FAIL" : "PASS";
    const completedAt = Date.now();
    return {
      checkId: check.id, name: check.name, category: check.category, verifierId: this.id, mandatory: check.mandatory,
      status, summary: violations.length ? violations.join(" ") : `Change stayed within ${budget.maxFilesChanged} files and ${budget.maxLinesChanged} changed lines.`,
      acceptanceCriterionIds: [], startedAt, completedAt, durationMs: Math.max(0, completedAt - startedAt), violations,
      evidence: [{
        evidenceKey: `${context.workflowRunId}:${check.id}`, category: "POLICY_RESULT", result: status,
        summary: violations.length ? violations.join(" ") : "Change budget satisfied.", acceptanceCriterionIds: [],
        producer: { id: this.id, role: "FACTORY_POLICY", independent: true },
        metadata: { changedFiles: change.changedFiles, linesAdded: change.linesAdded, linesDeleted: change.linesDeleted, maximumFiles: budget.maxFilesChanged, maximumLines: budget.maxLinesChanged },
      }],
      metadata: { blocking: violations.length > 0 },
    };
  }
}

export class NegativeConstraintVerifier implements Verifier {
  readonly id = "factory-negative-constraints";
  readonly name = "Factory negative-constraint verifier";
  supports(check: VerificationCheckSpec) { return check.verifierId === this.id; }

  async execute(context: VerificationExecutionContext, check: VerificationCheckSpec): Promise<VerificationCheckResult> {
    const startedAt = Date.now();
    const violations = context.workOrder.negativeConstraints.flatMap((constraint) => evaluateNegativeConstraint(constraint, context.candidate));
    const status: VerificationCheckStatus = violations.length ? "FAIL" : "PASS";
    const completedAt = Date.now();
    return {
      checkId: check.id, name: check.name, category: check.category, verifierId: this.id, mandatory: check.mandatory,
      status, summary: violations.length ? violations.join(" ") : "All negative-space constraints were satisfied.",
      acceptanceCriterionIds: [], startedAt, completedAt, durationMs: Math.max(0, completedAt - startedAt), violations,
      evidence: [{
        evidenceKey: `${context.workflowRunId}:${check.id}`, category: "POLICY_RESULT", result: status,
        summary: violations.length ? violations.join(" ") : "Negative-space constraints satisfied.", acceptanceCriterionIds: [],
        producer: { id: this.id, role: "FACTORY_POLICY", independent: true },
        metadata: { evaluatedConstraintIds: context.workOrder.negativeConstraints.map((constraint) => constraint.id) },
      }],
      metadata: { blocking: violations.length > 0 },
    };
  }
}

/**
 * Always-on check that the candidate did not redefine its own proof.
 *
 * Emits `metadata.blocking = true` on failure, so `evaluateVerificationOutcome`
 * returns BLOCKED rather than merely NOT_VERIFIED — this is a governance
 * violation, not a failing test.
 */
export class VerificationAuthorityVerifier implements Verifier {
  readonly id = "factory-verification-authority";
  readonly name = "Verification authority verifier";
  supports(check: VerificationCheckSpec) { return check.verifierId === this.id; }

  async execute(context: VerificationExecutionContext, check: VerificationCheckSpec): Promise<VerificationCheckResult> {
    const startedAt = Date.now();
    const contract = context.workOrder.verificationContract;
    const evaluation = evaluateVerificationAuthority({
      candidate: context.candidate,
      checks: contract?.checks ?? [],
      policy: contract?.authorityPolicy,
    });
    const violations = evaluation.findings.map((finding) => finding.message);
    const completedAt = Date.now();
    return {
      checkId: check.id, name: check.name, category: check.category, verifierId: this.id, mandatory: check.mandatory,
      status: evaluation.status, summary: evaluation.summary, acceptanceCriterionIds: [],
      startedAt, completedAt, durationMs: Math.max(0, completedAt - startedAt), violations,
      evidence: [{
        evidenceKey: `${context.workflowRunId}:${check.id}`, category: "POLICY_RESULT", result: evaluation.status,
        summary: evaluation.summary, acceptanceCriterionIds: [],
        producer: { id: this.id, role: "FACTORY_POLICY", independent: true },
        metadata: {
          findings: evaluation.findings,
          allowedMutations: evaluation.allowed,
          commandAuthority: evaluation.commandAuthority,
          authorityDigestInput: authorityDigestInput(evaluation),
        },
      }],
      metadata: { blocking: evaluation.status === "FAIL" },
    };
  }
}

export function calculateCriterionCoverage(criteria: AcceptanceCriterionSpec[], checks: VerificationCheckResult[]): CriterionCoverage[] {
  const usableEvidence = checks.filter((check) => check.status === "PASS").flatMap((check) => check.evidence).filter((evidence) => evidence.result === "PASS");
  return criteria.map((criterion) => {
    const criterionEvidence = usableEvidence.filter((evidence) => evidence.acceptanceCriterionIds.includes(criterion.id));
    const required = criterion.requiredEvidence?.length ? criterion.requiredEvidence : [{ category: undefined, minimumCount: 1, independent: false }];
    const missingEvidence: string[] = [];
    for (const requirement of required) {
      const level = (requirement as EvidenceRequirement).independenceLevel ?? "CANDIDATE_DEPENDENT_ALLOWED";
      const matches = criterionEvidence.filter((evidence) => {
        if (requirement.category && evidence.category !== requirement.category) return false;
        // Lineage requirement, unchanged.
        if (requirement.independent && !evidence.producer.independent) return false;
        // Definition requirement. Missing definitionAuthority reads as
        // CANDIDATE_DEPENDENT, so old evidence can never satisfy a new
        // INDEPENDENT_REQUIRED criterion by omission.
        if (level === "INDEPENDENT_REQUIRED" && evidence.producer.definitionAuthority !== "INDEPENDENT") {
          return false;
        }
        return true;
      });
      if (matches.length < requirement.minimumCount) {
        const qualifiers = [
          requirement.independent ? "independent" : "",
          level === "INDEPENDENT_REQUIRED" ? "candidate-independent" : "",
        ].filter(Boolean).join(", ");
        missingEvidence.push(`${requirement.category ?? "ANY"}: ${matches.length}/${requirement.minimumCount}${qualifiers ? ` ${qualifiers}` : ""}`);
      }
    }
    return {
      criterionId: criterion.id, title: criterion.title, status: missingEvidence.length ? "MISSING" : "EVIDENCED",
      requiredEvidenceCount: required.reduce((sum, item) => sum + item.minimumCount, 0), usableEvidenceCount: criterionEvidence.length,
      missingEvidence, evidenceKeys: criterionEvidence.map((evidence) => evidence.evidenceKey),
    };
  });
}

export function evaluateVerificationOutcome(input: { checks: VerificationCheckResult[]; coverage: CriterionCoverage[]; requireHumanReview: boolean }): { verdict: VerificationVerdict; verdictReasons: string[] } {
  const blocking = input.checks.filter((check) => check.status === "FAIL" && (check.category === "CHANGE_BUDGET" || check.category === "POLICY") && check.metadata?.blocking === true);
  if (blocking.length) return { verdict: "BLOCKED", verdictReasons: blocking.flatMap((check) => check.violations.length ? check.violations : [check.summary]) };
  const mandatoryFailures = input.checks.filter((check) => check.mandatory && check.status !== "PASS");
  const uncovered = input.coverage.filter((criterion) => criterion.status !== "EVIDENCED");
  if (mandatoryFailures.length || uncovered.length) {
    return { verdict: "NOT_VERIFIED", verdictReasons: [
      ...mandatoryFailures.map((check) => `${check.name}: ${check.status} — ${check.summary}`),
      ...uncovered.map((criterion) => `${criterion.criterionId} lacks required evidence (${criterion.missingEvidence.join(", ")}).`),
    ] };
  }
  if (input.requireHumanReview) return { verdict: "REQUIRES_HUMAN_REVIEW", verdictReasons: ["The verification contract reserves final advancement for human review."] };
  return { verdict: "VERIFIED", verdictReasons: ["All mandatory checks passed and every acceptance criterion has usable evidence."] };
}

export function matchesRepositoryPattern(file: string, rawPattern: string) {
  const normalizedFile = normalizeRepositoryPath(file);
  const pattern = normalizeRepositoryPath(rawPattern);
  if (!normalizedFile || !pattern) return false;
  if (!pattern.includes("*")) return normalizedFile === pattern || normalizedFile.startsWith(`${pattern}/`);
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*/g, "\u0000").replace(/\*/g, "[^/]*").replace(/\u0000/g, ".*");
  return new RegExp(`^${escaped}$`).test(normalizedFile);
}

function addSystemChecks(checks: VerificationCheckSpec[], workOrder: WorkOrderVerificationSpec) {
  const result = [...checks];
  if (workOrder.changeBudget && !result.some((check) => check.verifierId === CHANGE_BUDGET_CHECK.verifierId)) result.unshift(CHANGE_BUDGET_CHECK);
  // Unconditional: the change budget and negative constraints are opt-in per
  // WorkOrder, but "the candidate may not redefine its own proof" is not
  // negotiable by the WorkOrder that is being proved.
  if (!result.some((check) => check.verifierId === VERIFICATION_AUTHORITY_CHECK.verifierId)) result.unshift(VERIFICATION_AUTHORITY_CHECK);
  if (workOrder.negativeConstraints.length && !result.some((check) => check.verifierId === NEGATIVE_CONSTRAINTS_CHECK.verifierId)) result.unshift(NEGATIVE_CONSTRAINTS_CHECK);
  return result;
}

function notConfiguredContractCheck(criterionIds: string[]): VerificationCheckSpec {
  return { id: "verification-contract", name: "Verification contract", category: "POLICY", verifierId: "verification-contract-not-configured", mandatory: true, acceptanceCriterionIds: criterionIds, evidenceCategory: "POLICY_RESULT" };
}

function normalizeResult(check: VerificationCheckSpec, result: VerificationCheckResult): VerificationCheckResult {
  return { ...result, checkId: check.id, name: check.name, category: check.category, verifierId: check.verifierId, mandatory: check.mandatory,
    acceptanceCriterionIds: check.acceptanceCriterionIds,
    evidence: result.evidence.map((evidence) => ({ ...evidence, acceptanceCriterionIds: evidence.acceptanceCriterionIds.length ? evidence.acceptanceCriterionIds : check.acceptanceCriterionIds })),
  };
}

function resultForStatus(check: VerificationCheckSpec, status: VerificationCheckStatus, summary: string, startedAt = Date.now()): VerificationCheckResult {
  const completedAt = Date.now();
  return { checkId: check.id, name: check.name, category: check.category, verifierId: check.verifierId, mandatory: check.mandatory, status, summary,
    acceptanceCriterionIds: check.acceptanceCriterionIds, startedAt, completedAt, durationMs: Math.max(0, completedAt - startedAt), evidence: [], violations: [] };
}

function evaluateNegativeConstraint(constraint: NegativeConstraint, change: CandidateChange) {
  const files = change.changedFiles;
  const matches = (patterns: string[]) => files.filter((file) => patterns.some((pattern) => matchesRepositoryPattern(file, pattern)));
  let violatingFiles: string[] = [];
  let diffViolation = false;
  switch (constraint.type) {
    case "PROTECTED_PATH":
    case "CUSTOM":
      violatingFiles = matches(constraint.paths ?? []);
      diffViolation = Boolean(constraint.pattern && safeRegexTest(constraint.pattern, change.diff));
      break;
    case "NO_AUTH_CHANGES": violatingFiles = files.filter((file) => /(^|\/)(auth|authentication|authorization|iam)(\/|\.|$)/i.test(file)); break;
    case "NO_PRODUCTION_ACCESS": diffViolation = /(^|[^a-z])(production|prod)[^\n]*(credential|secret|token|database|deploy)/im.test(change.diff); break;
    case "NO_PLAINTEXT_SECRETS": diffViolation = /^\+.*(api[_-]?key|secret|password|private[_-]?key|token)\s*[:=]\s*["'][^"']{8,}/im.test(change.diff); break;
    case "NO_PUBLIC_API_CHANGES": violatingFiles = files.filter((file) => /(^|\/)(api|openapi|graphql|routes?|public)(\/|\.|$)/i.test(file)); break;
    case "NO_SCHEMA_CHANGES": violatingFiles = files.filter(isSchemaFile); break;
    case "NO_NEW_DEPENDENCIES": violatingFiles = files.filter(isDependencyFile); break;
    case "NO_TEST_REMOVAL": violatingFiles = change.deletedFiles.filter(isTestFile); diffViolation = /^-.*\b(describe|it|test)\s*\(/m.test(change.diff); break;
    case "NO_ASSERTION_WEAKENING": diffViolation = /^-.*\b(expect|assert)\b/m.test(change.diff) || /^\+.*\b(describe|it|test)\.(skip|only)\b/m.test(change.diff) || /^\+.*(@ts-ignore|eslint-disable|noqa)/m.test(change.diff); break;
    case "NO_VERIFICATION_CONFIG_CHANGES": violatingFiles = files.filter(isVerificationConfigFile); break;
  }
  if (!violatingFiles.length && !diffViolation) return [];
  const details = [violatingFiles.length ? `files: ${violatingFiles.join(", ")}` : "", diffViolation ? "diff pattern matched" : ""].filter(Boolean).join("; ");
  return [`${constraint.id}: ${constraint.description}${details ? ` (${details})` : ""}.`];
}

function normalizeRepositoryPath(value: string) { return value.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, ""); }
function safeRegexTest(pattern: string, value: string) { try { return new RegExp(pattern, "m").test(value); } catch { return true; } }
function isDependencyFile(file: string) { return /(^|\/)(package\.json|pnpm-lock\.yaml|yarn\.lock|package-lock\.json|Gemfile(?:\.lock)?|requirements.*\.txt|poetry\.lock|go\.(mod|sum)|Cargo\.(toml|lock))$/i.test(file); }
function isSchemaFile(file: string) { return /(^|\/)(schema\.(ts|js|sql|graphql)|[^/]+\.prisma)$/i.test(file); }
function isMigrationFile(file: string) { return /(^|\/)(migrations?|db\/migrate)(\/|$)/i.test(file); }
function isInfrastructureFile(file: string) { return /(^|\/)(infra|infrastructure|terraform|k8s|kubernetes|helm|\.github\/workflows)(\/|$)|(^|\/)(Dockerfile|docker-compose\.ya?ml)$/i.test(file); }
function isTestFile(file: string) { return /(^|\/)(__tests__|tests?|spec)(\/|$)|\.(test|spec)\.[^/]+$/i.test(file); }
function isVerificationConfigFile(file: string) { return /(^|\/)(vitest|jest|playwright|eslint|tsconfig|pytest|tox|coverage|sonar|codecov|\.github\/workflows)[^/]*\.(json|js|cjs|mjs|ts|ya?ml|toml)$/i.test(file); }
