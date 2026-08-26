const INCIDENT_STAGES = [
  "CLARIFY",
  "CONTAIN",
  "OBSERVE",
  "ISOLATE",
  "RESTORE",
  "CORRECT",
  "PREVENT",
  "MEASURE",
];

const REQUIRED_WORK_ORDER_CLASSES = ["BUG_FIX", "FEATURE", "REFACTOR", "SECURITY_POLICY"];
const REQUIRED_FAILURE_DRILLS = [
  "PROCESS_RESTART",
  "PROVIDER_OUTAGE_OR_RATE_LIMIT",
  "LATE_EVENT",
  "CANCELLATION",
  "STALE_EVIDENCE",
  "PR_HEAD_DRIFT",
  "CREDENTIAL_REVOCATION",
  "CLEANUP_FAILURE",
];

export function evaluateProductionPilotPreflight(manifest) {
  const findings = [];
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    return { ok: false, findings: ["manifest must be a JSON object"] };
  }
  if (manifest.schema !== "mission-control-production-pilot/v1") {
    findings.push("schema must be mission-control-production-pilot/v1");
  }
  requireText(manifest.pilotId, "pilotId", findings);
  requireText(manifest.repository?.repository, "repository.repository", findings);
  requireText(manifest.repository?.defaultBranch, "repository.defaultBranch", findings);
  const classification = manifest.repository?.dataClassification;
  if (!["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED"].includes(classification)) {
    findings.push("repository.dataClassification must be explicitly classified");
  }
  requireText(manifest.designPartner?.team, "designPartner.team", findings);
  requireText(manifest.designPartner?.champion, "designPartner.champion", findings);
  requireText(manifest.designPartner?.forwardDeployedEngineer, "designPartner.forwardDeployedEngineer", findings);
  requireText(manifest.incidentDrill?.incidentCommander, "incidentDrill.incidentCommander", findings);
  requireTimestamp(manifest.incidentDrill?.completedAt, "incidentDrill.completedAt", findings);
  requireText(manifest.incidentDrill?.scenario, "incidentDrill.scenario", findings);
  requireEvidence(manifest.incidentDrill?.evidenceReferences, "incidentDrill.evidenceReferences", findings);

  const recordedStages = new Map(
    Array.isArray(manifest.incidentDrill?.stages)
      ? manifest.incidentDrill.stages.map((stage) => [stage?.stage, stage])
      : [],
  );
  for (const stageName of INCIDENT_STAGES) {
    const stage = recordedStages.get(stageName);
    if (!stage) {
      findings.push(`incidentDrill.stages is missing ${stageName}`);
      continue;
    }
    requireText(stage.owner, `incidentDrill.stages.${stageName}.owner`, findings);
    requireText(stage.action, `incidentDrill.stages.${stageName}.action`, findings);
    requireEvidence(stage.evidenceReferences, `incidentDrill.stages.${stageName}.evidenceReferences`, findings);
  }

  const backend = manifest.execution?.backend;
  if (!["LOCAL", "REMOTE_SANDBOX"].includes(backend)) {
    findings.push("execution.backend must be LOCAL or REMOTE_SANDBOX");
  }
  const sensitiveRepository = classification !== "PUBLIC";
  if (backend === "REMOTE_SANDBOX" && sensitiveRepository
    && manifest.execution?.providerEnforcedEgressProven !== true) {
    findings.push("sensitive remote pilot requires provider-enforced egress proof");
  }
  if (backend === "LOCAL" && !nonEmpty(manifest.execution?.approvedHostBinding)) {
    findings.push("local pilot requires execution.approvedHostBinding");
  }

  const workOrders = Array.isArray(manifest.workOrderPortfolio) ? manifest.workOrderPortfolio : [];
  if (workOrders.length < 10) findings.push("workOrderPortfolio must contain at least ten planned WorkOrders");
  const identifiers = new Set();
  for (const workOrder of workOrders) {
    requireText(workOrder?.id, "workOrderPortfolio[].id", findings);
    requireText(workOrder?.title, "workOrderPortfolio[].title", findings);
    if (!REQUIRED_WORK_ORDER_CLASSES.includes(workOrder?.class)) {
      findings.push(`workOrderPortfolio ${workOrder?.id ?? "<unknown>"} has an invalid class`);
    }
    if (nonEmpty(workOrder?.id)) {
      if (identifiers.has(workOrder.id)) findings.push(`workOrderPortfolio contains duplicate id ${workOrder.id}`);
      identifiers.add(workOrder.id);
    }
  }
  for (const workOrderClass of REQUIRED_WORK_ORDER_CLASSES) {
    if (!workOrders.some((workOrder) => workOrder?.class === workOrderClass)) {
      findings.push(`workOrderPortfolio is missing class ${workOrderClass}`);
    }
  }

  for (const gate of ["humanPlanApproval", "independentVerification", "humanAcceptance", "humanMerge"]) {
    if (manifest.authority?.[gate] !== true) findings.push(`authority.${gate} must remain required`);
  }
  for (const forbidden of ["guardedAuto", "autonomousMerge", "autonomousDeployment", "learningPromotion"]) {
    if (manifest.authority?.[forbidden] !== false) findings.push(`authority.${forbidden} must remain disabled`);
  }

  const failureDrills = Array.isArray(manifest.failureDrills) ? manifest.failureDrills : [];
  for (const drill of REQUIRED_FAILURE_DRILLS) {
    if (!failureDrills.some((item) => item?.kind === drill && nonEmpty(item?.owner))) {
      findings.push(`failureDrills is missing an owned ${drill} drill`);
    }
  }

  return { ok: findings.length === 0, findings: [...new Set(findings)] };
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

function nonEmpty(value) {
  return typeof value === "string" && value === value.trim() && value.length > 0 && !/[\0\r\n]/.test(value);
}

function isPlaceholder(value) {
  return /^<.*>$/.test(value) || /^(todo|tbd|unknown|placeholder)$/i.test(value);
}

export const productionPilotPreflightContract = Object.freeze({
  incidentStages: INCIDENT_STAGES,
  requiredWorkOrderClasses: REQUIRED_WORK_ORDER_CLASSES,
  requiredFailureDrills: REQUIRED_FAILURE_DRILLS,
});
