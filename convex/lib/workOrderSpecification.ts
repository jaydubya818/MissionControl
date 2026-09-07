const RISK_RANK = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 } as const;
type RiskLevel = keyof typeof RISK_RANK;

export function validateWorkOrderSpecification(input: any) {
  const issues: string[] = [];
  const requirements = input.requirements ?? [];
  const criteria = input.acceptanceCriteria ?? [];
  const constraints = input.negativeConstraints ?? [];
  const checks = input.verificationContract?.checks ?? [];
  const requiredRisks = input.verificationContract?.schemaVersion === 2
    ? input.verificationContract.requiredRisks ?? []
    : [];
  validateUniqueIds(requirements, "requirement", issues);
  validateUniqueIds(criteria, "acceptance criterion", issues);
  validateUniqueIds(constraints, "negative constraint", issues);
  validateUniqueIds(checks, "verification check", issues);
  validateUniqueIds(requiredRisks, "required verification risk", issues);
  const requirementIds = new Set(requirements.map((item: any) => item.id));
  const criterionIds = new Set(criteria.map((item: any) => item.id));
  for (const requirement of requirements) {
    if (!requirement.title?.trim() || !requirement.description?.trim()) issues.push(`Requirement ${requirement.id || "<missing>"} needs a title and description.`);
  }
  for (const criterion of criteria) {
    for (const requirementId of criterion.requirementIds ?? []) {
      if (!requirementIds.has(requirementId)) issues.push(`Acceptance criterion ${criterion.id} references unknown requirement ${requirementId}.`);
    }
    for (const evidence of criterion.requiredEvidence ?? []) {
      if (!Number.isSafeInteger(evidence.minimumCount) || evidence.minimumCount < 1) issues.push(`Acceptance criterion ${criterion.id} has an invalid evidence minimum.`);
    }
  }
  for (const check of checks) {
    if (!check.name?.trim() || !check.verifierId?.trim()) issues.push(`Verification check ${check.id || "<missing>"} needs a name and verifier.`);
    for (const criterionId of check.acceptanceCriterionIds ?? []) {
      if (!criterionIds.has(criterionId)) issues.push(`Verification check ${check.id} references unknown criterion ${criterionId}.`);
    }
    if (check.command && (!check.command.executable?.trim() || !Number.isSafeInteger(check.command.timeoutMs) || check.command.timeoutMs < 1_000 || check.command.timeoutMs > 30 * 60_000)) {
      issues.push(`Verification check ${check.id} has an invalid command or timeout.`);
    }
  }
  const mandatoryCheckIds = new Set(checks.filter((check: any) => check.mandatory).map((check: any) => check.id));
  for (const risk of requiredRisks) {
    if (!risk.description?.trim()) issues.push(`Required verification risk ${risk.id || "<missing>"} needs a description.`);
    if (!(risk.requiredEvidenceIds ?? []).length) issues.push(`Required verification risk ${risk.id} needs at least one required evidence mapping.`);
    for (const evidenceId of risk.requiredEvidenceIds ?? []) {
      if (!mandatoryCheckIds.has(evidenceId)) issues.push(`Required verification risk ${risk.id} references unknown or optional evidence ${evidenceId}.`);
    }
  }
  if (input.verificationContract?.enforcementMode === "ENFORCED") {
    if (!input.changeBudget) issues.push("An enforced verification contract requires a change budget.");
    if (input.verificationContract.requireHumanReview && !(input.requiredApprovals ?? []).length) {
      issues.push("Human review requires at least one explicit approval type.");
    }
    for (const criterion of criteria) {
      if (!checks.some((check: any) => check.mandatory && check.acceptanceCriterionIds?.includes(criterion.id))) {
        issues.push(`Acceptance criterion ${criterion.id} is not mapped to a mandatory verification check.`);
      }
    }
    if (input.verificationContract.schemaVersion === 2 && input.verificationContract.independence?.required !== true) {
      issues.push("An enforced policy-v2 verification contract requires separate-Attempt independence.");
    }
  }
  if (input.changeBudget) {
    for (const [label, value] of [["maximum files", input.changeBudget.maxFilesChanged], ["maximum lines", input.changeBudget.maxLinesChanged]] as const) {
      if (!Number.isSafeInteger(value) || value < 1) issues.push(`Change budget ${label} must be a positive integer.`);
    }
    const prohibited = new Set(input.changeBudget.prohibitedCommandClasses ?? []);
    for (const allowed of input.changeBudget.allowedCommandClasses ?? []) {
      if (prohibited.has(allowed)) issues.push(`Command class ${allowed} cannot be both allowed and prohibited.`);
    }
  }
  return { valid: issues.length === 0, issues };
}

export function classifyWorkOrderRisk(input: any): { riskLevel: RiskLevel; riskReasons: string[] } {
  const requested = (input.riskLevel ?? "MEDIUM") as RiskLevel;
  let riskLevel: RiskLevel = requested;
  const reasons = new Set<string>([`Operator-selected ${requested.toLowerCase()} risk.`]);
  const text = [input.title, input.desiredOutcome, input.context, ...(input.requirements ?? []).flatMap((item: any) => [item.title, item.description]), ...(input.positiveConstraints ?? [])]
    .filter(Boolean)
    .flatMap((value) => String(value).toLowerCase().split(/[.;\n]+/))
    .filter((clause) => !/\b(?:no|without|never|prohibit(?:ed)?|forbid(?:den)?|outside scope|out of scope)\b[^.;\n]{0,120}\b(?:production|infrastructure|terraform|kubernetes|iam|credential|secret|authentication|authorization|customer data|personally identifiable|pii)\b/.test(clause))
    .join(" ");
  const paths = [...(input.changeBudget?.allowedPaths ?? [])].join(" ").toLowerCase();
  const promote = (level: RiskLevel, reason: string) => {
    if (RISK_RANK[level] > RISK_RANK[riskLevel]) riskLevel = level;
    reasons.add(reason);
  };
  if (/payment|financial|money|billing|payout|escrow/.test(text + paths)) promote("CRITICAL", "Payments or financial behavior is in scope.");
  if (/production|infrastructure|terraform|kubernetes|iam|credential|secret/.test(text + paths)) promote("CRITICAL", "Production, infrastructure, identity, or secret boundaries are in scope.");
  if (/authentication|authorization|\bauth\b|customer data|personally identifiable|\bpii\b/.test(text + paths)) promote("HIGH", "Authentication, authorization, or customer data is in scope.");
  if (/migration|schema|public api|openapi|graphql/.test(text + paths) || input.changeBudget?.allowSchemaChanges || input.changeBudget?.allowMigrations) promote("HIGH", "Schema, migration, or public contract change is permitted.");
  if (input.changeBudget?.allowDependencyChanges) promote("MEDIUM", "Dependency changes are permitted.");
  if (input.changeBudget?.allowInfrastructureChanges) promote("CRITICAL", "Infrastructure changes are permitted.");
  if ((input.changeBudget?.maxFilesChanged ?? 0) > 20 || (input.changeBudget?.maxLinesChanged ?? 0) > 1_000) promote("HIGH", "The change budget permits a broad blast radius.");
  return { riskLevel, riskReasons: [...reasons] };
}

function validateUniqueIds(items: any[], label: string, issues: string[]) {
  const ids = new Set<string>();
  for (const item of items) {
    const id = typeof item?.id === "string" ? item.id.trim() : "";
    if (!id) issues.push(`Every ${label} needs an ID.`);
    else if (ids.has(id)) issues.push(`Duplicate ${label} ID: ${id}.`);
    else ids.add(id);
  }
}
