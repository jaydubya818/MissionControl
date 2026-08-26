import {
  evaluateProductionPilotPreflight,
  productionPilotPreflightContract,
} from "./production-pilot-preflight.mjs";

const REQUIRED_LINEAGE = [
  "missionId",
  "planId",
  "workOrderRevisionId",
  "attemptId",
  "candidateSha",
  "verificationAttemptId",
  "reviewPackageId",
  "pullRequestUrl",
  "humanAcceptanceDecisionId",
  "humanMergeDecisionId",
];

const REQUIRED_METRICS = [
  "timeToReviewReadyPrMs",
  "reviewLatencyMs",
  "humanAttentionMinutes",
  "retryCount",
  "correctionCount",
];

const COST_COMPONENTS = [
  "model",
  "compute",
  "sandbox",
  "humanAttention",
  "retry",
  "review",
];

const OUTCOME_STATES = ["HEALTHY", "INCIDENT", "ROLLED_BACK", "DEGRADED", "UNKNOWN"];
const SAFETY_ESCAPE_FIELDS = [
  "authorityBoundaryEscapes",
  "crossCompanyEscapes",
  "secretEscapes",
  "repositoryScopeEscapes",
];

export function evaluateProductionPilotEvidence(manifest) {
  const preflight = evaluateProductionPilotPreflight(manifest);
  const findings = preflight.findings.map((finding) => `preflight: ${finding}`);
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    return { ok: false, findings, summary: emptySummary() };
  }

  const portfolio = Array.isArray(manifest.workOrderPortfolio) ? manifest.workOrderPortfolio : [];
  const portfolioById = new Map(portfolio.map((item) => [item?.id, item]));
  const results = Array.isArray(manifest.results) ? manifest.results : [];
  const accepted = results.filter((result) => result?.status === "ACCEPTED");
  const acceptedIdentifiers = new Set();

  if (accepted.length < 10) findings.push("results must contain at least ten accepted WorkOrders");
  for (const result of accepted) {
    const prefix = `results.${result?.workOrderId ?? "<unknown>"}`;
    requireText(result?.workOrderId, `${prefix}.workOrderId`, findings);
    if (!portfolioById.has(result?.workOrderId)) findings.push(`${prefix} is not declared in workOrderPortfolio`);
    if (acceptedIdentifiers.has(result?.workOrderId)) findings.push(`${prefix} is duplicated`);
    acceptedIdentifiers.add(result?.workOrderId);

    for (const field of REQUIRED_LINEAGE) requireText(result?.lineage?.[field], `${prefix}.lineage.${field}`, findings);
    if (nonEmpty(result?.lineage?.pullRequestUrl) && !isHttpUrl(result.lineage.pullRequestUrl)) {
      findings.push(`${prefix}.lineage.pullRequestUrl must be an HTTP(S) URL`);
    }

    for (const field of REQUIRED_METRICS) requireNonNegativeNumber(result?.metrics?.[field], `${prefix}.metrics.${field}`, findings);
    if (typeof result?.metrics?.firstPassVerification !== "boolean") {
      findings.push(`${prefix}.metrics.firstPassVerification must be boolean`);
    }
    if (result?.metrics?.recoveryTimeMs !== null && result?.metrics?.recoveryTimeMs !== undefined) {
      requireNonNegativeNumber(result.metrics.recoveryTimeMs, `${prefix}.metrics.recoveryTimeMs`, findings);
    }
    if (result?.metrics?.correctionCount > 0) {
      requireEvidence(result?.correctionEvidenceReferences, `${prefix}.correctionEvidenceReferences`, findings);
    }
    if (result?.metrics?.recoveryTimeMs > 0) {
      requireEvidence(result?.recoveryEvidenceReferences, `${prefix}.recoveryEvidenceReferences`, findings);
    }

    for (const component of COST_COMPONENTS) validateCost(result?.costs?.[component], `${prefix}.costs.${component}`, findings);
    validateOutcome(result?.outcome, `${prefix}.outcome`, findings);
  }

  for (const workOrderClass of productionPilotPreflightContract.requiredWorkOrderClasses) {
    if (!accepted.some((result) => portfolioById.get(result.workOrderId)?.class === workOrderClass)) {
      findings.push(`accepted results are missing class ${workOrderClass}`);
    }
  }

  const drills = Array.isArray(manifest.failureDrills) ? manifest.failureDrills : [];
  for (const kind of productionPilotPreflightContract.requiredFailureDrills) {
    const drill = drills.find((item) => item?.kind === kind);
    if (!drill) continue;
    if (typeof drill.passed !== "boolean") findings.push(`failureDrills.${kind}.passed must be boolean`);
    requireEvidence(drill.evidenceReferences, `failureDrills.${kind}.evidenceReferences`, findings);
    if (drill.passed === false) requireText(drill.decisionPacketReference, `failureDrills.${kind}.decisionPacketReference`, findings);
  }

  for (const field of SAFETY_ESCAPE_FIELDS) {
    if (manifest.safetySummary?.[field] !== 0) findings.push(`safetySummary.${field} must equal zero`);
  }

  const summary = summarizeProductionPilotEvidence(manifest);
  const decision = manifest.exitDecision;
  if (!decision || !["GO", "NO_GO"].includes(decision.decision)) {
    findings.push("exitDecision.decision must be GO or NO_GO");
  }
  requireText(decision?.decidedBy, "exitDecision.decidedBy", findings);
  requireTimestamp(decision?.decidedAt, "exitDecision.decidedAt", findings);
  requireEvidence(decision?.evidenceReferences, "exitDecision.evidenceReferences", findings);
  requireText(decision?.remoteSandboxEgressResidualRisk, "exitDecision.remoteSandboxEgressResidualRisk", findings);
  if (decision?.acceptedWorkOrderCount !== accepted.length) {
    findings.push("exitDecision.acceptedWorkOrderCount must match accepted results");
  }
  if (typeof decision?.costEfficiencyClaimed !== "boolean") {
    findings.push("exitDecision.costEfficiencyClaimed must be boolean");
  }
  const hasUnknownCost = Object.values(summary.costCoverage).some((coverage) => coverage.measured < accepted.length);
  if (decision?.costEfficiencyClaimed === true && hasUnknownCost) {
    findings.push("exitDecision.costEfficiencyClaimed cannot be true while any accepted cost is unknown");
  }

  return { ok: findings.length === 0, findings: [...new Set(findings)], summary };
}

export function summarizeProductionPilotEvidence(manifest) {
  const results = Array.isArray(manifest?.results) ? manifest.results : [];
  const accepted = results.filter((result) => result?.status === "ACCEPTED");
  const costCoverage = Object.fromEntries(COST_COMPONENTS.map((component) => {
    const measured = accepted.filter((result) => Number.isFinite(result?.costs?.[component]?.usd)).length;
    return [component, { measured, total: accepted.length }];
  }));
  return {
    acceptedWorkOrders: accepted.length,
    firstPassVerification: accepted.filter((result) => result?.metrics?.firstPassVerification === true).length,
    correctedWorkOrders: accepted.filter((result) => result?.metrics?.correctionCount > 0).length,
    recoveredWorkOrders: accepted.filter((result) => result?.metrics?.recoveryTimeMs > 0).length,
    observedIncidents: accepted.filter((result) => result?.outcome?.status === "INCIDENT").length,
    observedRollbacks: accepted.filter((result) => result?.outcome?.status === "ROLLED_BACK").length,
    unknownOutcomes: accepted.filter((result) => result?.outcome?.status === "UNKNOWN").length,
    costCoverage,
  };
}

function validateCost(cost, field, findings) {
  if (!cost || typeof cost !== "object" || !("usd" in cost)) {
    findings.push(`${field}.usd must be a non-negative number or null`);
    return;
  }
  if (cost.usd === null) {
    requireText(cost.unknownReason, `${field}.unknownReason`, findings);
    requireText(cost.coverageImpact, `${field}.coverageImpact`, findings);
    return;
  }
  requireNonNegativeNumber(cost.usd, `${field}.usd`, findings);
  requireEvidence(cost.evidenceReferences, `${field}.evidenceReferences`, findings);
}

function validateOutcome(outcome, field, findings) {
  if (!OUTCOME_STATES.includes(outcome?.status)) findings.push(`${field}.status must be a supported observed outcome`);
  requireTimestamp(outcome?.observedAt, `${field}.observedAt`, findings);
  requireEvidence(outcome?.evidenceReferences, `${field}.evidenceReferences`, findings);
  if (outcome?.status === "INCIDENT") requireText(outcome.incidentId, `${field}.incidentId`, findings);
  if (outcome?.status === "ROLLED_BACK") requireText(outcome.rollbackId, `${field}.rollbackId`, findings);
  if (outcome?.status === "UNKNOWN") requireText(outcome.unknownReason, `${field}.unknownReason`, findings);
}

function requireText(value, field, findings) {
  if (!nonEmpty(value) || isPlaceholder(value)) findings.push(`${field} must be a named non-placeholder value`);
}

function requireTimestamp(value, field, findings) {
  if (!nonEmpty(value) || Number.isNaN(Date.parse(value))) findings.push(`${field} must be an ISO-8601 timestamp`);
}

function requireEvidence(value, field, findings) {
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => !nonEmpty(item) || isPlaceholder(item))) {
    findings.push(`${field} must contain at least one exact evidence reference`);
  }
}

function requireNonNegativeNumber(value, field, findings) {
  if (!Number.isFinite(value) || value < 0) findings.push(`${field} must be a non-negative number`);
}

function nonEmpty(value) {
  return typeof value === "string" && value === value.trim() && value.length > 0 && !/[\0\r\n]/.test(value);
}

function isPlaceholder(value) {
  return /^<.*>$/.test(value) || /^(todo|tbd|unknown|placeholder)$/i.test(value);
}

function isHttpUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function emptySummary() {
  return {
    acceptedWorkOrders: 0,
    firstPassVerification: 0,
    correctedWorkOrders: 0,
    recoveredWorkOrders: 0,
    observedIncidents: 0,
    observedRollbacks: 0,
    unknownOutcomes: 0,
    costCoverage: Object.fromEntries(COST_COMPONENTS.map((component) => [component, { measured: 0, total: 0 }])),
  };
}

export const productionPilotEvidenceContract = Object.freeze({
  requiredLineage: REQUIRED_LINEAGE,
  requiredMetrics: REQUIRED_METRICS,
  costComponents: COST_COMPONENTS,
  outcomeStates: OUTCOME_STATES,
  safetyEscapeFields: SAFETY_ESCAPE_FIELDS,
});
