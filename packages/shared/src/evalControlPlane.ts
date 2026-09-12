import { canonicalDigest } from "./canonicalDigest.js";

export const EVAL_RECEIPT_SCHEMA_VERSION = "mission-control/eval-receipt/v1" as const;
export const EVAL_SUITE_SCHEMA_VERSION = "mission-control/eval-suite/v1" as const;
export const EVAL_BASELINE_SCHEMA_VERSION = "mission-control/eval-baseline/v1" as const;

export type EvalCaseSeverity = "BLOCKING" | "ADVISORY";
export type EvalCaseVerdict = "PASS" | "FAIL" | "INVALID" | "SKIPPED";
export type EvalReceiptVerdict = "PASS" | "WARN" | "FAIL" | "INVALID";
export type EvalRunStatus = "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELED";
export type EvalFailureOrigin =
  | "SYSTEM_UNDER_TEST"
  | "HARNESS"
  | "JUDGE"
  | "DATA"
  | "INFRASTRUCTURE";

export type EvalAssertion =
  | { code: string; path: string; operator: "EQUALS"; expected: unknown }
  | { code: string; path: string; operator: "EQUALS_PATH"; expectedPath: string }
  | { code: string; path: string; operator: "NOT_EQUALS_PATH"; expectedPath: string }
  | { code: string; path: string; operator: "PRESENT" }
  | { code: string; path: string; operator: "SHA256" }
  | { code: string; path: string; operator: "IS_NUMBER" }
  | { code: string; path: string; operator: "NUMBER_GTE"; minimum: number }
  | { code: string; path: string; operator: "ARRAY_MIN_LENGTH"; minimum: number }
  | { code: string; path: string; operator: "ARRAY_LENGTH_EQUALS"; expected: number }
  | { code: string; path: string; operator: "ARRAY_INCLUDES"; expected: unknown }
  | { code: string; path: string; operator: "ALL_STRINGS_START_WITH"; prefix: string };

export interface EvalNegativeControlMutation {
  path: string;
  value: unknown;
}

export interface EvalSuiteCaseDefinition {
  key: string;
  name: string;
  description: string;
  severity: EvalCaseSeverity;
  slices: string[];
  publicInput: {
    objective: string;
    evidenceContract: string[];
  };
  sealedAssertions: EvalAssertion[];
  negativeControl: {
    description: string;
    mutations: EvalNegativeControlMutation[];
  };
}

export interface EvalSuiteDefinition {
  schemaVersion: typeof EVAL_SUITE_SCHEMA_VERSION;
  key: string;
  name: string;
  description: string;
  version: number;
  invalidRatioLimit: number;
  cases: EvalSuiteCaseDefinition[];
}

export interface PublicEvalSuiteCase {
  key: string;
  name: string;
  description: string;
  severity: EvalCaseSeverity;
  slices: string[];
  publicInput: EvalSuiteCaseDefinition["publicInput"];
}

export interface PublicEvalSuite {
  schemaVersion: typeof EVAL_SUITE_SCHEMA_VERSION;
  key: string;
  name: string;
  description: string;
  version: number;
  manifestDigest: string;
  cases: PublicEvalSuiteCase[];
}

export interface EvalRunArtifact {
  path: string;
  digest: string;
}

export interface EvalRunProvenance {
  repository: string;
  revision: string;
  baseRevision?: string;
  adapter: {
    id: string;
    version: string;
    digest: string;
  };
  runtime: {
    name: string;
    version: string;
  };
  model?: {
    provider: string;
    id: string;
    version: string;
  };
  promptDigest?: string;
  rubricDigest?: string;
  datasetDigest: string;
  resolvedConfigDigest: string;
  seed: string;
  artifacts: EvalRunArtifact[];
}

export interface EvalCaseOutcome {
  caseKey: string;
  status: "SCORED" | "ERROR" | "SKIPPED";
  actual?: unknown;
  failureOrigin?: Exclude<EvalFailureOrigin, "SYSTEM_UNDER_TEST">;
  error?: string;
  durationMs?: number;
  costUsd?: number;
  evidenceRefs: string[];
}

export interface EvalAssertionResult {
  code: string;
  path: string;
  operator: EvalAssertion["operator"];
  passed: boolean;
  observed: unknown;
  expected?: unknown;
}

export interface EvalCaseResult {
  caseKey: string;
  caseName: string;
  severity: EvalCaseSeverity;
  slices: string[];
  verdict: EvalCaseVerdict;
  score: number;
  failureOrigin?: EvalFailureOrigin;
  assertionResults: EvalAssertionResult[];
  failedAssertionCodes: string[];
  evidenceRefs: string[];
  durationMs?: number;
  costUsd?: number;
  outputDigest?: string;
  error?: string;
}

export interface EvalSliceMetric {
  slice: string;
  cases: number;
  passed: number;
  failed: number;
  invalid: number;
  skipped: number;
  passRate: number;
}

export interface EvalReceiptMetrics {
  totalCases: number;
  scoredCases: number;
  passedCases: number;
  failedCases: number;
  invalidCases: number;
  skippedCases: number;
  blockingCases: number;
  blockingPassed: number;
  advisoryCases: number;
  advisoryPassed: number;
  completionRate: number;
  blockingPassRate: number;
  advisoryPassRate: number;
  invalidRatio: number;
  totalDurationMs: number;
  totalCostUsd: number;
  slices: EvalSliceMetric[];
}

export interface EvalBaselineCase {
  caseKey: string;
  severity: EvalCaseSeverity;
  verdict: EvalCaseVerdict;
  score: number;
}

export interface EvalBaseline {
  schemaVersion: typeof EVAL_BASELINE_SCHEMA_VERSION;
  baselineId: string;
  suiteKey: string;
  suiteVersion: number;
  suiteDigest: string;
  sourceReceiptDigest: string;
  cases: EvalBaselineCase[];
  slices: Array<{ slice: string; passRate: number }>;
  createdAt: string;
  baselineDigest: string;
}

export interface EvalRegression {
  scope: "CASE" | "SLICE";
  key: string;
  severity: EvalCaseSeverity;
  baseline: number | string;
  candidate: number | string;
  blocking: boolean;
}

export interface EvalRunReceipt {
  schemaVersion: typeof EVAL_RECEIPT_SCHEMA_VERSION;
  runId: string;
  idempotencyKey: string;
  suite: {
    key: string;
    version: number;
    digest: string;
  };
  baseline?: {
    baselineId: string;
    digest: string;
  };
  runStatus: EvalRunStatus;
  verdict: EvalReceiptVerdict;
  publishable: boolean;
  releaseBlocking: false;
  acceptanceAuthority: false;
  provenance: EvalRunProvenance;
  metrics: EvalReceiptMetrics;
  results: EvalCaseResult[];
  regressions: EvalRegression[];
  accountingErrors: string[];
  startedAt: string;
  finishedAt: string;
  receiptDigest: string;
}

export interface EvaluateSuiteRunInput {
  suite: EvalSuiteDefinition;
  runId: string;
  idempotencyKey: string;
  runStatus: EvalRunStatus;
  provenance: EvalRunProvenance;
  outcomes: EvalCaseOutcome[];
  baseline?: EvalBaseline;
  startedAt: string;
  finishedAt: string;
}

const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/;
const GIT_REVISION_PATTERN = /^[0-9a-f]{7,64}$/i;

export function evalSuiteDigest(suite: EvalSuiteDefinition): string {
  return canonicalDigest("mission-control/eval-suite", suite);
}

export function publicEvalSuite(suite: EvalSuiteDefinition): PublicEvalSuite {
  return {
    schemaVersion: suite.schemaVersion,
    key: suite.key,
    name: suite.name,
    description: suite.description,
    version: suite.version,
    manifestDigest: evalSuiteDigest(suite),
    cases: suite.cases.map(({ key, name, description, severity, slices, publicInput }) => ({
      key,
      name,
      description,
      severity,
      slices: [...slices],
      publicInput: {
        objective: publicInput.objective,
        evidenceContract: [...publicInput.evidenceContract],
      },
    })),
  };
}

export function validateEvalSuite(suite: EvalSuiteDefinition): string[] {
  const findings: string[] = [];
  if (suite.schemaVersion !== EVAL_SUITE_SCHEMA_VERSION) findings.push("Unsupported suite schema version.");
  if (!suite.key.trim()) findings.push("Suite key is required.");
  if (!Number.isInteger(suite.version) || suite.version < 1) findings.push("Suite version must be a positive integer.");
  if (!(suite.invalidRatioLimit >= 0 && suite.invalidRatioLimit <= 1)) findings.push("Invalid-ratio limit must be between zero and one.");
  if (suite.cases.length === 0) findings.push("A suite must contain at least one case.");
  const keys = new Set<string>();
  for (const testCase of suite.cases) {
    if (!testCase.key.trim()) findings.push("Every case requires a key.");
    if (keys.has(testCase.key)) findings.push(`Duplicate case key: ${testCase.key}`);
    keys.add(testCase.key);
    if (testCase.slices.length === 0) findings.push(`${testCase.key}: at least one slice is required.`);
    if (testCase.sealedAssertions.length === 0) findings.push(`${testCase.key}: sealed assertions are required.`);
    if (testCase.negativeControl.mutations.length === 0) findings.push(`${testCase.key}: a negative control is required.`);
    const assertionCodes = new Set<string>();
    for (const assertion of testCase.sealedAssertions) {
      if (assertionCodes.has(assertion.code)) findings.push(`${testCase.key}: duplicate assertion code ${assertion.code}.`);
      assertionCodes.add(assertion.code);
      if (!assertion.path.trim()) findings.push(`${testCase.key}/${assertion.code}: assertion path is required.`);
    }
  }
  return findings;
}

export function evaluateEvalCase(
  definition: EvalSuiteCaseDefinition,
  outcome: EvalCaseOutcome,
): EvalCaseResult {
  const common = {
    caseKey: definition.key,
    caseName: definition.name,
    severity: definition.severity,
    slices: [...definition.slices],
    evidenceRefs: [...outcome.evidenceRefs],
    durationMs: finiteNonNegative(outcome.durationMs),
    costUsd: finiteNonNegative(outcome.costUsd),
  };

  if (outcome.status === "SKIPPED") {
    return {
      ...common,
      verdict: "SKIPPED",
      score: 0,
      failureOrigin: outcome.failureOrigin ?? "HARNESS",
      assertionResults: [],
      failedAssertionCodes: definition.sealedAssertions.map((assertion) => assertion.code),
      error: outcome.error?.trim() || "Case was skipped.",
    };
  }

  if (outcome.status === "ERROR" || outcome.actual === undefined) {
    return {
      ...common,
      verdict: "INVALID",
      score: 0,
      failureOrigin: outcome.failureOrigin ?? (outcome.actual === undefined ? "DATA" : "HARNESS"),
      assertionResults: [],
      failedAssertionCodes: definition.sealedAssertions.map((assertion) => assertion.code),
      error: outcome.error?.trim() || "Case did not provide a scoreable output.",
    };
  }

  const assertionResults = definition.sealedAssertions.map((assertion) => evaluateAssertion(assertion, outcome.actual));
  const passedCount = assertionResults.filter((assertion) => assertion.passed).length;
  const passed = passedCount === assertionResults.length;
  return {
    ...common,
    verdict: passed ? "PASS" : "FAIL",
    score: assertionResults.length ? passedCount / assertionResults.length : 0,
    failureOrigin: passed ? undefined : "SYSTEM_UNDER_TEST",
    assertionResults,
    failedAssertionCodes: assertionResults.filter((assertion) => !assertion.passed).map((assertion) => assertion.code),
    outputDigest: canonicalDigest("mission-control/eval-case-output", outcome.actual),
  };
}

export function evaluateSuiteRun(input: EvaluateSuiteRunInput): EvalRunReceipt {
  const accountingErrors: string[] = [];
  const suiteFindings = validateEvalSuite(input.suite);
  if (suiteFindings.length) accountingErrors.push(...suiteFindings.map((finding) => `suite: ${finding}`));

  const suiteCases = new Map(input.suite.cases.map((testCase) => [testCase.key, testCase]));
  const outcomeBuckets = new Map<string, EvalCaseOutcome[]>();
  for (const outcome of input.outcomes) {
    const bucket = outcomeBuckets.get(outcome.caseKey) ?? [];
    bucket.push(outcome);
    outcomeBuckets.set(outcome.caseKey, bucket);
    if (!suiteCases.has(outcome.caseKey)) accountingErrors.push(`Unknown outcome case: ${outcome.caseKey}`);
  }

  const results = input.suite.cases.map((testCase) => {
    const outcomes = outcomeBuckets.get(testCase.key) ?? [];
    if (outcomes.length === 0) {
      accountingErrors.push(`Missing outcome for case: ${testCase.key}`);
      return evaluateEvalCase(testCase, {
        caseKey: testCase.key,
        status: "SKIPPED",
        failureOrigin: "HARNESS",
        error: "Runner did not return this case.",
        evidenceRefs: [],
      });
    }
    if (outcomes.length > 1) {
      accountingErrors.push(`Duplicate outcomes for case: ${testCase.key}`);
      return evaluateEvalCase(testCase, {
        caseKey: testCase.key,
        status: "ERROR",
        failureOrigin: "HARNESS",
        error: "Runner returned duplicate case outcomes.",
        evidenceRefs: outcomes.flatMap((outcome) => outcome.evidenceRefs),
      });
    }
    return evaluateEvalCase(testCase, outcomes[0]);
  });

  const provenanceErrors = validateEvalRunProvenance(input.provenance, evalSuiteDigest(input.suite));
  accountingErrors.push(...provenanceErrors.map((finding) => `provenance: ${finding}`));
  const metrics = aggregateEvalResults(results);
  const regressions = input.baseline ? compareEvalResultsToBaseline(input.suite, results, input.baseline) : [];
  const hasBlockingFailure = results.some((result) => result.severity === "BLOCKING" && result.verdict !== "PASS");
  const hasAdvisoryFailure = results.some((result) => result.severity === "ADVISORY" && result.verdict !== "PASS");
  const hasInvalidOrSkipped = results.some((result) => result.verdict === "INVALID" || result.verdict === "SKIPPED");
  const invalidByRatio = metrics.invalidRatio > input.suite.invalidRatioLimit;
  const hasBlockingRegression = regressions.some((regression) => regression.blocking);
  const runCompleted = input.runStatus === "COMPLETED";
  const verdict: EvalReceiptVerdict = !runCompleted || accountingErrors.length > 0 || hasInvalidOrSkipped || invalidByRatio
    ? "INVALID"
    : hasBlockingFailure || hasBlockingRegression
      ? "FAIL"
      : hasAdvisoryFailure || regressions.length > 0
        ? "WARN"
        : "PASS";
  const publishable = runCompleted
    && accountingErrors.length === 0
    && !hasInvalidOrSkipped
    && !invalidByRatio
    && metrics.scoredCases === input.suite.cases.length;

  const unsigned = compactUndefined({
    schemaVersion: EVAL_RECEIPT_SCHEMA_VERSION,
    runId: input.runId,
    idempotencyKey: input.idempotencyKey,
    suite: {
      key: input.suite.key,
      version: input.suite.version,
      digest: evalSuiteDigest(input.suite),
    },
    baseline: input.baseline ? {
      baselineId: input.baseline.baselineId,
      digest: input.baseline.baselineDigest,
    } : undefined,
    runStatus: input.runStatus,
    verdict,
    publishable,
    releaseBlocking: false,
    acceptanceAuthority: false,
    provenance: copyProvenance(input.provenance),
    metrics,
    results,
    regressions,
    accountingErrors,
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
  }) as Omit<EvalRunReceipt, "receiptDigest">;
  return {
    ...unsigned,
    receiptDigest: canonicalDigest("mission-control/eval-receipt", unsigned),
  };
}

export function buildEvalBaseline(input: {
  baselineId: string;
  suite: EvalSuiteDefinition;
  receipt: EvalRunReceipt;
  createdAt: string;
}): EvalBaseline {
  if (input.receipt.suite.digest !== evalSuiteDigest(input.suite)) {
    throw new Error("Baseline receipt does not match the suite digest.");
  }
  if (!input.receipt.publishable) throw new Error("Only a publishable receipt can become a baseline.");
  const unsigned: Omit<EvalBaseline, "baselineDigest"> = {
    schemaVersion: EVAL_BASELINE_SCHEMA_VERSION,
    baselineId: input.baselineId,
    suiteKey: input.suite.key,
    suiteVersion: input.suite.version,
    suiteDigest: input.receipt.suite.digest,
    sourceReceiptDigest: input.receipt.receiptDigest,
    cases: input.receipt.results.map((result) => ({
      caseKey: result.caseKey,
      severity: result.severity,
      verdict: result.verdict,
      score: result.score,
    })),
    slices: input.receipt.metrics.slices.map((slice) => ({ slice: slice.slice, passRate: slice.passRate })),
    createdAt: input.createdAt,
  };
  return {
    ...unsigned,
    baselineDigest: canonicalDigest("mission-control/eval-baseline", unsigned),
  };
}

export function validateEvalBaseline(baseline: EvalBaseline): string[] {
  const findings: string[] = [];
  if (baseline.schemaVersion !== EVAL_BASELINE_SCHEMA_VERSION) findings.push("Unsupported baseline schema version.");
  if (!baseline.baselineId.trim()) findings.push("Baseline id is required.");
  if (!SHA256_PATTERN.test(baseline.suiteDigest)) findings.push("Suite digest must be SHA-256.");
  if (!SHA256_PATTERN.test(baseline.sourceReceiptDigest)) findings.push("Source receipt digest must be SHA-256.");
  const { baselineDigest: _digest, ...unsigned } = baseline;
  const expected = canonicalDigest("mission-control/eval-baseline", unsigned);
  if (baseline.baselineDigest !== expected) findings.push("Baseline digest does not match its contents.");
  return findings;
}

export function validateEvalReceipt(receipt: EvalRunReceipt): string[] {
  const findings: string[] = [];
  if (receipt.schemaVersion !== EVAL_RECEIPT_SCHEMA_VERSION) findings.push("Unsupported receipt schema version.");
  if (!SHA256_PATTERN.test(receipt.suite.digest)) findings.push("Suite digest must be SHA-256.");
  if (!SHA256_PATTERN.test(receipt.receiptDigest)) findings.push("Receipt digest must be SHA-256.");
  if (receipt.releaseBlocking !== false) findings.push("V1 receipts cannot hold release authority.");
  if (receipt.acceptanceAuthority !== false) findings.push("Eval receipts cannot hold acceptance authority.");
  if (receipt.metrics.totalCases !== receipt.results.length) findings.push("Receipt total does not match result rows.");
  const { receiptDigest: _digest, ...unsigned } = receipt;
  const expected = canonicalDigest("mission-control/eval-receipt", unsigned);
  if (receipt.receiptDigest !== expected) findings.push("Receipt digest does not match its contents.");
  if (receipt.verdict === "PASS" && (!receipt.publishable || receipt.results.some((result) => result.verdict !== "PASS"))) {
    findings.push("A passing receipt must be publishable and contain only passing cases.");
  }
  if (receipt.publishable && receipt.metrics.scoredCases !== receipt.metrics.totalCases) {
    findings.push("A publishable receipt requires complete scored-case accounting.");
  }
  return findings;
}

export function runSuiteNegativeControls(
  suite: EvalSuiteDefinition,
  actual: unknown,
): Array<{ caseKey: string; passed: boolean; original: EvalCaseVerdict; controlled: EvalCaseVerdict; error?: string }> {
  return suite.cases.map((testCase) => {
    const original = evaluateEvalCase(testCase, {
      caseKey: testCase.key,
      status: "SCORED",
      actual,
      evidenceRefs: ["negative-control:original"],
    });
    const controlledActual = applyEvalMutations(actual, testCase.negativeControl.mutations);
    const controlled = evaluateEvalCase(testCase, {
      caseKey: testCase.key,
      status: "SCORED",
      actual: controlledActual,
      evidenceRefs: ["negative-control:degraded"],
    });
    const passed = controlled.verdict === "FAIL" && controlled.score < original.score;
    return {
      caseKey: testCase.key,
      passed,
      original: original.verdict,
      controlled: controlled.verdict,
      error: passed ? undefined : `${testCase.negativeControl.description} did not make the case strictly worse.`,
    };
  });
}

export function applyEvalMutations(value: unknown, mutations: EvalNegativeControlMutation[]): unknown {
  const cloned = cloneJsonValue(value);
  for (const mutation of mutations) setPath(cloned, mutation.path, cloneJsonValue(mutation.value));
  return cloned;
}

export function validateEvalRunProvenance(provenance: EvalRunProvenance, suiteDigest?: string): string[] {
  const findings: string[] = [];
  if (!provenance.repository.trim()) findings.push("Repository is required.");
  if (!GIT_REVISION_PATTERN.test(provenance.revision)) findings.push("Revision must be a pinned Git commit.");
  if (provenance.baseRevision && !GIT_REVISION_PATTERN.test(provenance.baseRevision)) findings.push("Base revision must be a pinned Git commit.");
  if (!provenance.adapter.id.trim() || !provenance.adapter.version.trim()) findings.push("Adapter id and version are required.");
  if (!SHA256_PATTERN.test(provenance.adapter.digest)) findings.push("Adapter digest must be SHA-256.");
  if (!provenance.runtime.name.trim() || !provenance.runtime.version.trim()) findings.push("Runtime name and version are required.");
  if (!SHA256_PATTERN.test(provenance.datasetDigest)) findings.push("Dataset digest must be SHA-256.");
  if (suiteDigest && provenance.datasetDigest !== suiteDigest) findings.push("Dataset digest must match the evaluated suite.");
  if (!SHA256_PATTERN.test(provenance.resolvedConfigDigest)) findings.push("Resolved configuration digest must be SHA-256.");
  if (provenance.promptDigest && !SHA256_PATTERN.test(provenance.promptDigest)) findings.push("Prompt digest must be SHA-256.");
  if (provenance.rubricDigest && !SHA256_PATTERN.test(provenance.rubricDigest)) findings.push("Rubric digest must be SHA-256.");
  if (!provenance.seed.trim()) findings.push("Seed is required.");
  if (provenance.model && (!provenance.model.provider.trim() || !provenance.model.id.trim() || !provenance.model.version.trim())) {
    findings.push("Model provider, id, and version are required together.");
  }
  if (provenance.artifacts.length === 0) findings.push("At least one source artifact is required.");
  const artifactPaths = new Set<string>();
  for (const artifact of provenance.artifacts) {
    if (!artifact.path.trim()) findings.push("Artifact path is required.");
    if (artifactPaths.has(artifact.path)) findings.push(`Duplicate artifact path: ${artifact.path}`);
    artifactPaths.add(artifact.path);
    if (!SHA256_PATTERN.test(artifact.digest)) findings.push(`${artifact.path || "Artifact"} digest must be SHA-256.`);
  }
  return findings;
}

function evaluateAssertion(assertion: EvalAssertion, actual: unknown): EvalAssertionResult {
  const observed = getPath(actual, assertion.path);
  let expected: unknown;
  let passed = false;
  switch (assertion.operator) {
    case "EQUALS":
      expected = assertion.expected;
      passed = deepEqual(observed, assertion.expected);
      break;
    case "EQUALS_PATH":
      expected = getPath(actual, assertion.expectedPath);
      passed = deepEqual(observed, expected);
      break;
    case "NOT_EQUALS_PATH":
      expected = getPath(actual, assertion.expectedPath);
      passed = observed !== undefined && expected !== undefined && !deepEqual(observed, expected);
      break;
    case "PRESENT":
      expected = "present";
      passed = observed !== undefined && observed !== null && observed !== "";
      break;
    case "SHA256":
      expected = "sha256:<64 lowercase hex>";
      passed = typeof observed === "string" && SHA256_PATTERN.test(observed);
      break;
    case "IS_NUMBER":
      expected = "finite number";
      passed = typeof observed === "number" && Number.isFinite(observed);
      break;
    case "NUMBER_GTE":
      expected = `>= ${assertion.minimum}`;
      passed = typeof observed === "number" && Number.isFinite(observed) && observed >= assertion.minimum;
      break;
    case "ARRAY_MIN_LENGTH":
      expected = `array length >= ${assertion.minimum}`;
      passed = Array.isArray(observed) && observed.length >= assertion.minimum;
      break;
    case "ARRAY_LENGTH_EQUALS":
      expected = `array length = ${assertion.expected}`;
      passed = Array.isArray(observed) && observed.length === assertion.expected;
      break;
    case "ARRAY_INCLUDES":
      expected = assertion.expected;
      passed = Array.isArray(observed) && observed.some((item) => deepEqual(item, assertion.expected));
      break;
    case "ALL_STRINGS_START_WITH":
      expected = `all values start with ${assertion.prefix}`;
      passed = isRecord(observed)
        && Object.keys(observed).length > 0
        && Object.values(observed).every((item) => typeof item === "string" && item.startsWith(assertion.prefix));
      break;
  }
  return {
    code: assertion.code,
    path: assertion.path,
    operator: assertion.operator,
    passed,
    observed,
    expected,
  };
}

function aggregateEvalResults(results: EvalCaseResult[]): EvalReceiptMetrics {
  const scored = results.filter((result) => result.verdict === "PASS" || result.verdict === "FAIL");
  const blocking = results.filter((result) => result.severity === "BLOCKING");
  const advisory = results.filter((result) => result.severity === "ADVISORY");
  const slices = new Map<string, EvalCaseResult[]>();
  for (const result of results) {
    for (const slice of result.slices) slices.set(slice, [...(slices.get(slice) ?? []), result]);
  }
  return {
    totalCases: results.length,
    scoredCases: scored.length,
    passedCases: results.filter((result) => result.verdict === "PASS").length,
    failedCases: results.filter((result) => result.verdict === "FAIL").length,
    invalidCases: results.filter((result) => result.verdict === "INVALID").length,
    skippedCases: results.filter((result) => result.verdict === "SKIPPED").length,
    blockingCases: blocking.length,
    blockingPassed: blocking.filter((result) => result.verdict === "PASS").length,
    advisoryCases: advisory.length,
    advisoryPassed: advisory.filter((result) => result.verdict === "PASS").length,
    completionRate: ratio(scored.length, results.length),
    blockingPassRate: ratio(blocking.filter((result) => result.verdict === "PASS").length, blocking.length),
    advisoryPassRate: ratio(advisory.filter((result) => result.verdict === "PASS").length, advisory.length),
    invalidRatio: ratio(results.filter((result) => result.verdict === "INVALID" || result.verdict === "SKIPPED").length, results.length),
    totalDurationMs: results.reduce((sum, result) => sum + (result.durationMs ?? 0), 0),
    totalCostUsd: results.reduce((sum, result) => sum + (result.costUsd ?? 0), 0),
    slices: [...slices.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([slice, rows]) => {
      const passed = rows.filter((row) => row.verdict === "PASS").length;
      return {
        slice,
        cases: rows.length,
        passed,
        failed: rows.filter((row) => row.verdict === "FAIL").length,
        invalid: rows.filter((row) => row.verdict === "INVALID").length,
        skipped: rows.filter((row) => row.verdict === "SKIPPED").length,
        passRate: ratio(passed, rows.length),
      };
    }),
  };
}

function compareEvalResultsToBaseline(
  suite: EvalSuiteDefinition,
  results: EvalCaseResult[],
  baseline: EvalBaseline,
): EvalRegression[] {
  const regressions: EvalRegression[] = [];
  if (baseline.suiteKey !== suite.key || baseline.suiteVersion !== suite.version || baseline.suiteDigest !== evalSuiteDigest(suite)) {
    return [{
      scope: "CASE",
      key: "baseline-lineage",
      severity: "BLOCKING",
      baseline: baseline.suiteDigest,
      candidate: evalSuiteDigest(suite),
      blocking: true,
    }];
  }
  const resultByKey = new Map(results.map((result) => [result.caseKey, result]));
  for (const baselineCase of baseline.cases) {
    const candidate = resultByKey.get(baselineCase.caseKey);
    if (!candidate || (baselineCase.verdict === "PASS" && candidate.verdict !== "PASS") || candidate.score < baselineCase.score) {
      regressions.push({
        scope: "CASE",
        key: baselineCase.caseKey,
        severity: baselineCase.severity,
        baseline: baselineCase.verdict === "PASS" ? baselineCase.score : baselineCase.verdict,
        candidate: candidate?.score ?? "SKIPPED",
        blocking: baselineCase.severity === "BLOCKING",
      });
    }
  }
  const sliceByKey = new Map(aggregateEvalResults(results).slices.map((slice) => [slice.slice, slice]));
  for (const baselineSlice of baseline.slices) {
    const candidate = sliceByKey.get(baselineSlice.slice);
    if (!candidate || candidate.passRate < baselineSlice.passRate) {
      const blocking = suite.cases.some((testCase) => testCase.severity === "BLOCKING" && testCase.slices.includes(baselineSlice.slice));
      regressions.push({
        scope: "SLICE",
        key: baselineSlice.slice,
        severity: blocking ? "BLOCKING" : "ADVISORY",
        baseline: baselineSlice.passRate,
        candidate: candidate?.passRate ?? 0,
        blocking,
      });
    }
  }
  return regressions;
}

function copyProvenance(provenance: EvalRunProvenance): EvalRunProvenance {
  return {
    ...provenance,
    adapter: { ...provenance.adapter },
    runtime: { ...provenance.runtime },
    model: provenance.model ? { ...provenance.model } : undefined,
    artifacts: provenance.artifacts.map((artifact) => ({ ...artifact })),
  };
}

function getPath(value: unknown, path: string): unknown {
  const segments = normalizePath(path);
  let current: unknown = value;
  for (const segment of segments) {
    if (!isRecord(current) && !Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function setPath(value: unknown, path: string, replacement: unknown) {
  const segments = normalizePath(path);
  if (segments.length === 0) throw new Error("Negative-control mutation cannot replace the document root.");
  let current = value;
  for (const segment of segments.slice(0, -1)) {
    if (!isRecord(current) && !Array.isArray(current)) throw new Error(`Cannot mutate missing path ${path}.`);
    current = (current as Record<string, unknown>)[segment];
  }
  if (!isRecord(current) && !Array.isArray(current)) throw new Error(`Cannot mutate missing path ${path}.`);
  (current as Record<string, unknown>)[segments.at(-1)!] = replacement;
}

function normalizePath(path: string): string[] {
  const normalized = path.trim().replace(/^\$\.?/, "");
  return normalized ? normalized.split(".").filter(Boolean) : [];
}

function cloneJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cloneJsonValue);
  if (isRecord(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneJsonValue(item)]));
  return value;
}

function compactUndefined(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(compactUndefined);
  if (isRecord(value)) {
    return Object.fromEntries(Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => [key, compactUndefined(item)]));
  }
  return value;
}

function deepEqual(left: unknown, right: unknown): boolean {
  return canonicalDigest("mission-control/eval-equality", left) === canonicalDigest("mission-control/eval-equality", right);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function finiteNonNegative(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function ratio(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 1;
}
