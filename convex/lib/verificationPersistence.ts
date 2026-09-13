const CHECK_STATUSES = new Set([
  "PASS", "FAIL", "SKIPPED", "NOT_CONFIGURED", "ERROR", "TIMED_OUT",
  "BLOCKED_BY_DEPENDENCY", "NOT_EVALUATED",
]);
const EVIDENCE_CATEGORIES = new Set([
  "TEST_RESULT", "BUILD_RESULT", "STATIC_ANALYSIS", "SECURITY_SCAN", "COMMAND_LOG",
  "FILE_DIFF", "SCREENSHOT", "BROWSER_RESULT", "PERFORMANCE_RESULT", "REVIEW_RESULT",
  "POLICY_RESULT", "CI_RESULT", "RUNTIME_OBSERVATION",
]);

type NormalizedEvidence = {
  evidenceKey: string;
  checkId: string;
  category: string;
  result: string;
  summary: string;
  acceptanceCriterionIds: string[];
  producer: { id: string; role: string; independent: boolean };
  contentHash?: string;
  artifactReferences: string[];
  metadata?: any;
};

export function recomputeVerificationPacket(workOrder: any, packet: any) {
  if (!workOrder?.verificationContract) throw new Error("WorkOrder has no verification contract.");
  if (!packet || typeof packet !== "object") throw new Error("Verification packet is invalid.");
  const sourceRevision = requiredText(packet.sourceRevision, "source revision", 200);
  const candidateRevision = requiredText(packet.candidateRevision, "candidate revision", 200);
  if (sourceRevision === candidateRevision) throw new Error("Verification candidate must differ from its source revision.");

  const expectedChecks = addSystemChecks(workOrder.verificationContract.checks ?? [], workOrder);
  const expectedIds = new Set(expectedChecks.map((check: any) => check.id));
  const supplied = Array.isArray(packet.checks) ? packet.checks : [];
  if (supplied.length > 50) throw new Error("Verification packet exceeds the check limit.");
  for (const check of supplied) {
    if (!expectedIds.has(check?.checkId)) throw new Error(`Unexpected verification check: ${check?.checkId ?? "<missing>"}.`);
  }
  const duplicateCheckId = firstDuplicate(supplied.map((check: any) => check?.checkId));
  if (duplicateCheckId) throw new Error(`Duplicate verification check: ${duplicateCheckId}.`);

  const criterionIds = new Set<string>((workOrder.acceptanceCriteria ?? []).map((criterion: any) => String(criterion.id)));
  const evidenceKeys = new Set<string>();
  const allEvidence: NormalizedEvidence[] = [];
  const checks = expectedChecks.map((expected: any) => {
    const raw = supplied.find((check: any) => check.checkId === expected.id);
    if (!raw) return missingCheck(expected);
    const status = CHECK_STATUSES.has(raw.status) ? raw.status : "ERROR";
    const evidence: NormalizedEvidence[] = (Array.isArray(raw.evidence) ? raw.evidence : []).map((item: any): NormalizedEvidence => {
      const normalized = normalizeEvidence(item, expected, criterionIds, workOrder.verificationContract.schemaVersion !== 2);
      if (evidenceKeys.has(normalized.evidenceKey)) throw new Error(`Duplicate evidence key: ${normalized.evidenceKey}.`);
      evidenceKeys.add(normalized.evidenceKey);
      allEvidence.push(normalized);
      return normalized;
    });
    const startedAt = finiteTimestamp(raw.startedAt) ?? Date.now();
    const completedAt = finiteTimestamp(raw.completedAt) ?? startedAt;
    return {
      checkId: expected.id,
      name: expected.name,
      category: expected.category,
      verifierId: expected.verifierId,
      mandatory: expected.mandatory,
      status,
      summary: requiredText(raw.summary, `summary for ${expected.id}`, 2_000),
      acceptanceCriterionIds: expected.acceptanceCriterionIds ?? [],
      startedAt,
      completedAt: Math.max(startedAt, completedAt),
      durationMs: Math.max(0, Math.min(30 * 60_000, Number(raw.durationMs) || completedAt - startedAt)),
      evidenceKeys: evidence.map((item) => item.evidenceKey),
      violations: textArray(raw.violations, 50, 1_000),
      metadata: raw.metadata,
    };
  });

  if (allEvidence.length > 100) throw new Error("Verification packet exceeds the evidence limit.");
  const coverage = calculateCoverage(workOrder.acceptanceCriteria ?? [], checks, allEvidence);
  const blocking = checks.filter((check: any) => check.status === "FAIL"
    && ["CHANGE_BUDGET", "POLICY"].includes(check.category)
    && check.metadata?.blocking === true);
  const mandatoryUnevaluated = checks.filter((check: any) => check.mandatory
    && ["NOT_CONFIGURED", "ERROR", "TIMED_OUT", "BLOCKED_BY_DEPENDENCY", "NOT_EVALUATED"].includes(check.status));
  const mandatoryFailures = checks.filter((check: any) => check.mandatory
    && !["PASS", "NOT_CONFIGURED", "ERROR", "TIMED_OUT", "BLOCKED_BY_DEPENDENCY", "NOT_EVALUATED"].includes(check.status));
  const uncovered = coverage.filter((criterion: any) => criterion.status === "MISSING");
  const unevaluatedCoverage = coverage.filter((criterion: any) => criterion.status === "NOT_EVALUATED");
  let verdict: "VERIFIED" | "NOT_VERIFIED" | "BLOCKED" | "REQUIRES_HUMAN_REVIEW";
  let verdictReasons: string[];
  if (blocking.length) {
    verdict = "BLOCKED";
    verdictReasons = blocking.flatMap((check: any) => check.violations.length ? check.violations : [check.summary]);
  } else if (mandatoryUnevaluated.length || unevaluatedCoverage.length) {
    verdict = "BLOCKED";
    verdictReasons = [
      ...mandatoryUnevaluated.map((check: any) => `${check.name}: ${check.status} — ${check.summary}`),
      ...unevaluatedCoverage.map((criterion: any) => `${criterion.criterionId} was not evaluated (${criterion.missingEvidence.join(", ")}).`),
    ];
  } else if (mandatoryFailures.length || uncovered.length) {
    verdict = "NOT_VERIFIED";
    verdictReasons = [
      ...mandatoryFailures.map((check: any) => `${check.name}: ${check.status} — ${check.summary}`),
      ...uncovered.map((criterion: any) => `${criterion.criterionId} lacks required evidence (${criterion.missingEvidence.join(", ")}).`),
    ];
  } else if (workOrder.verificationContract.requireHumanReview) {
    verdict = "REQUIRES_HUMAN_REVIEW";
    verdictReasons = ["The verification contract reserves final advancement for human review."];
  } else {
    verdict = "VERIFIED";
    verdictReasons = ["All mandatory checks passed and every acceptance criterion has usable evidence."];
  }

  const startedAt = finiteTimestamp(packet.startedAt) ?? Math.min(...checks.map((check: any) => check.startedAt));
  const completedAt = finiteTimestamp(packet.completedAt) ?? Math.max(...checks.map((check: any) => check.completedAt));
  return {
    engineVersion: requiredText(packet.engineVersion, "engine version", 100),
    sourceRevision,
    candidateRevision,
    checks,
    evidence: allEvidence,
    coverage,
    requirementsPassed: coverage.filter((item: any) => item.status === "EVIDENCED").length,
    requirementsFailed: coverage.filter((item: any) => item.status === "MISSING").length,
    violations: checks.flatMap((check: any) => check.violations),
    approvalRequirements: [...new Set(workOrder.requiredApprovals ?? [])],
    riskLevel: workOrder.riskLevel,
    riskReasons: workOrder.riskReasons ?? [],
    verdict,
    verdictReasons,
    startedAt,
    completedAt: Math.max(startedAt, completedAt),
    durationMs: Math.max(0, Math.max(startedAt, completedAt) - startedAt),
  };
}

function addSystemChecks(checks: any[], workOrder: any) {
  const result = [...checks];
  if (workOrder.changeBudget && !result.some((check) => check.verifierId === "factory-change-budget")) {
    result.unshift({ id: "factory-change-budget", name: "Change budget", category: "CHANGE_BUDGET", verifierId: "factory-change-budget", mandatory: true, acceptanceCriterionIds: [], evidenceCategory: "POLICY_RESULT" });
  }
  if ((workOrder.negativeConstraints ?? []).length && !result.some((check) => check.verifierId === "factory-negative-constraints")) {
    result.unshift({ id: "factory-negative-constraints", name: "Negative-space constraints", category: "POLICY", verifierId: "factory-negative-constraints", mandatory: true, acceptanceCriterionIds: [], evidenceCategory: "POLICY_RESULT" });
  }
  return result;
}

function normalizeEvidence(item: any, check: any, criterionIds: Set<string>, allowLegacyProducerIndependence: boolean): NormalizedEvidence {
  const acceptanceCriterionIds = textArray(item?.acceptanceCriterionIds, 50, 200);
  for (const criterionId of acceptanceCriterionIds) {
    if (!criterionIds.has(criterionId)) throw new Error(`Evidence references unknown criterion ${criterionId}.`);
    if (!(check.acceptanceCriterionIds ?? []).includes(criterionId)) throw new Error(`Evidence for ${check.id} references an unmapped criterion ${criterionId}.`);
  }
  if (!EVIDENCE_CATEGORIES.has(item?.category)) throw new Error(`Evidence for ${check.id} has an invalid category.`);
  if (!CHECK_STATUSES.has(item?.result)) throw new Error(`Evidence for ${check.id} has an invalid result.`);
  return {
    evidenceKey: requiredText(item?.evidenceKey, `evidence key for ${check.id}`, 300),
    checkId: check.id,
    category: item.category,
    result: item.result,
    summary: requiredText(item?.summary, `evidence summary for ${check.id}`, 2_000),
    acceptanceCriterionIds,
    producer: {
      id: requiredText(item?.producer?.id, `evidence producer for ${check.id}`, 200),
      role: requiredText(item?.producer?.role, `evidence producer role for ${check.id}`, 200),
      independent: allowLegacyProducerIndependence && item?.producer?.independent === true,
    },
    contentHash: optionalText(item?.contentHash, 200),
    artifactReferences: textArray(item?.artifactReferences, 20, 2_000),
    metadata: item?.metadata,
  };
}

function calculateCoverage(criteria: any[], checks: any[], evidence: NormalizedEvidence[]) {
  const passingCheckIds = new Set(checks.filter((check: any) => check.status === "PASS").map((check: any) => check.checkId));
  const usable = evidence.filter((item) => item.result === "PASS" && passingCheckIds.has(item.checkId));
  return criteria.map((criterion: any) => {
    const candidateEvidence = usable.filter((item) => item.acceptanceCriterionIds.includes(criterion.id));
    const requirements = criterion.requiredEvidence?.length
      ? criterion.requiredEvidence
      : [{ category: undefined, minimumCount: 1, independent: false }];
    const missingEvidence = requirements.flatMap((requirement: any) => {
      const matches = candidateEvidence.filter((item) => (!requirement.category || item.category === requirement.category)
        && (!requirement.independent || item.producer.independent));
      return matches.length >= requirement.minimumCount
        ? []
        : [`${requirement.category ?? "ANY"}: ${matches.length}/${requirement.minimumCount}${requirement.independent ? " independent" : ""}`];
    });
    const mappedChecks = checks.filter((check: any) => (check.acceptanceCriterionIds ?? []).includes(criterion.id));
    const unevaluated = mappedChecks.some((check: any) => [
      "NOT_CONFIGURED", "ERROR", "TIMED_OUT", "BLOCKED_BY_DEPENDENCY", "NOT_EVALUATED",
    ].includes(check.status));
    return {
      criterionId: criterion.id,
      title: criterion.title,
      status: missingEvidence.length ? (unevaluated ? "NOT_EVALUATED" as const : "MISSING" as const) : "EVIDENCED" as const,
      requiredEvidenceCount: requirements.reduce((sum: number, item: any) => sum + item.minimumCount, 0),
      usableEvidenceCount: candidateEvidence.length,
      missingEvidence,
      evidenceKeys: candidateEvidence.map((item) => item.evidenceKey),
    };
  });
}

function missingCheck(check: any) {
  const now = Date.now();
  return {
    checkId: check.id, name: check.name, category: check.category, verifierId: check.verifierId,
    mandatory: check.mandatory, status: "NOT_CONFIGURED", summary: `Required verifier ${check.verifierId} did not report a result.`,
    acceptanceCriterionIds: check.acceptanceCriterionIds ?? [], startedAt: now, completedAt: now,
    durationMs: 0, evidenceKeys: [], violations: [], metadata: undefined,
  };
}

function requiredText(value: unknown, label: string, max: number) {
  const text = optionalText(value, max);
  if (!text) throw new Error(`Verification ${label} is required.`);
  return text;
}

function optionalText(value: unknown, max: number) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : undefined;
}

function textArray(value: unknown, maxItems: number, maxLength: number) {
  if (!Array.isArray(value)) return [];
  if (value.length > maxItems || value.some((item) => typeof item !== "string")) throw new Error("Verification packet contains an invalid text list.");
  return value.map((item) => item.trim().slice(0, maxLength)).filter(Boolean);
}

function finiteTimestamp(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

function firstDuplicate(values: unknown[]) {
  const seen = new Set<unknown>();
  for (const value of values) {
    if (seen.has(value)) return value;
    seen.add(value);
  }
}
