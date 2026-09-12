import {
  freezeVerificationPlan,
  type VerificationPlan,
  type VerificationRequirement,
  type RequiredVerificationRisk,
  type RequiredEvidence,
} from "@mission-control/workflow-engine/verification-plan";

const SYSTEM_VERIFICATION_CHECKS = {
  verificationAuthority: {
    id: "factory-verification-authority",
    name: "Verification authority",
    category: "POLICY",
    verifierId: "factory-verification-authority",
    mandatory: true,
    acceptanceCriterionIds: [],
    evidenceCategory: "POLICY_RESULT",
  },
  changeBudget: {
    id: "factory-change-budget",
    name: "Change budget",
    category: "CHANGE_BUDGET",
    verifierId: "factory-change-budget",
    mandatory: true,
    acceptanceCriterionIds: [],
    evidenceCategory: "POLICY_RESULT",
  },
  negativeConstraints: {
    id: "factory-negative-constraints",
    name: "Negative-space constraints",
    category: "POLICY",
    verifierId: "factory-negative-constraints",
    mandatory: true,
    acceptanceCriterionIds: [],
    evidenceCategory: "POLICY_RESULT",
  },
} as const;

export function effectivePolicyV2VerificationChecks(workOrder: any): any[] {
  const checks = [...(workOrder.verificationContract?.checks ?? [])];
  if (!checks.some((check) => check.verifierId === SYSTEM_VERIFICATION_CHECKS.verificationAuthority.verifierId)) {
    checks.unshift(SYSTEM_VERIFICATION_CHECKS.verificationAuthority);
  }
  if (workOrder.changeBudget && !checks.some((check) => check.verifierId === SYSTEM_VERIFICATION_CHECKS.changeBudget.verifierId)) {
    checks.unshift(SYSTEM_VERIFICATION_CHECKS.changeBudget);
  }
  if ((workOrder.negativeConstraints ?? []).length > 0
    && !checks.some((check) => check.verifierId === SYSTEM_VERIFICATION_CHECKS.negativeConstraints.verifierId)) {
    checks.unshift(SYSTEM_VERIFICATION_CHECKS.negativeConstraints);
  }
  return checks;
}

function evidenceType(category: string): RequiredEvidence["evidenceType"] {
  if (category === "UNIT_TEST") return "UNIT_TEST";
  if (category === "INTEGRATION_TEST" || category === "CONTRACT_TEST") return "INTEGRATION_TEST";
  if (category === "SECURITY") return "SECURITY_CHECK";
  if (category === "BUILD" || category === "TYPECHECK") return "ARTIFACT_INSPECTION";
  return "CUSTOM";
}

/**
 * Deterministically freezes the approved WorkOrder/Quality Contract into the
 * canonical policy-v2 Verification Plan. The verifier may add discovered
 * risks, but it cannot remove or rewrite any contract requirement, required
 * risk, or required evidence item.
 */
export function compilePolicyV2VerificationPlan(input: {
  now: number;
  workOrder: any;
  sourceAttempt: any;
  verificationAttemptId: string;
  verificationSubject: any;
  factoryDefinitionId: string;
  factoryDefinitionVersionId: string;
  executorInvocationId: string;
}): VerificationPlan {
  if (input.workOrder.verificationContract?.schemaVersion !== 2
    || !input.workOrder.verificationContractDigest
    || !input.workOrder.qualityContractDigest) {
    throw new Error("Policy-v2 verification requires the frozen Verification and Plan Quality Contract digests.");
  }
  const requirements: VerificationRequirement[] = (input.workOrder.requirements ?? []).map((requirement: any) => ({
    id: requirement.id,
    description: requirement.description,
    source: "WORK_ORDER",
    sourceReference: requirement.id,
    criticality: requirement.priority === "MUST" ? "REQUIRED" : "IMPORTANT",
  }));
  const requirementIdsByCriterion = new Map((input.workOrder.acceptanceCriteria ?? []).map((criterion: any) => [
    criterion.id,
    criterion.requirementIds?.length ? criterion.requirementIds : requirements.map((requirement) => requirement.id),
  ]));
  const requiredRisks: RequiredVerificationRisk[] = input.workOrder.verificationContract.requiredRisks.map((risk: any) => ({
    id: risk.id,
    description: risk.description,
    severity: risk.severity,
    source: risk.source,
    affectedAreas: [...(input.workOrder.changeBudget?.allowedPaths ?? [])].sort(),
  }));
  const requiredEvidence: RequiredEvidence[] = effectivePolicyV2VerificationChecks(input.workOrder).map((check: any) => ({
    id: check.id,
    requirementIds: [...new Set(check.acceptanceCriterionIds.flatMap((criterionId: string) =>
      requirementIdsByCriterion.get(criterionId) ?? []
    ))].sort() as string[],
    requiredRiskIds: requiredRisks
      .filter((risk) => input.workOrder.verificationContract.requiredRisks
        .find((candidate: any) => candidate.id === risk.id)?.requiredEvidenceIds.includes(check.id))
      .map((risk) => risk.id)
      .sort(),
    description: check.name,
    evidenceType: evidenceType(check.category),
    required: check.mandatory,
  }));
  const workOrderId = String(input.workOrder._id);
  const sourceAttemptId = String(input.sourceAttempt._id);
  const draft = {
    planVersion: 1 as const,
    workOrderId,
    workOrderRevisionNumber: input.workOrder.currentRevisionNumber ?? 1,
    verificationContractDigest: input.workOrder.verificationContractDigest,
    sourceAttemptId,
    verificationAttemptId: input.verificationAttemptId,
    verificationSubject: input.verificationSubject,
    generatedBy: {
      factoryDefinitionId: input.factoryDefinitionId,
      factoryDefinitionVersionId: input.factoryDefinitionVersionId,
      attemptId: input.verificationAttemptId,
      executorInvocationId: input.executorInvocationId,
    },
    requirements,
    requiredRisks,
    discoveredRisks: [],
    requiredEvidence,
    createdAt: input.now,
  };
  return freezeVerificationPlan(draft, {
    workOrderId,
    workOrderRevisionNumber: input.workOrder.currentRevisionNumber ?? 1,
    verificationContractDigest: input.workOrder.verificationContractDigest,
    sourceAttemptId,
    verificationAttemptId: input.verificationAttemptId,
    verificationSubjectDigest: input.verificationSubject.digest,
    requiredRequirements: requirements,
    requiredRisks,
    requiredEvidenceIds: requiredEvidence.filter((item) => item.required).map((item) => item.id),
  });
}

const CHECK_STATUSES = new Set(["PASS", "FAIL", "SKIPPED", "NOT_CONFIGURED", "ERROR"]);

/**
 * Converts a verifier transport packet into the canonical persistence shape.
 * Identity-bearing check fields and criterion coverage come from the frozen
 * WorkOrder/Plan, never from worker-authored presentation fields.
 */
export function normalizePolicyV2VerificationResults(input: {
  workOrder: any;
  plan: VerificationPlan;
  packetChecks: any[];
  evidenceIdsByCheck: Map<string, any[]>;
}) {
  const planEvidenceById = new Map(input.plan.requiredEvidence.map((item) => [item.id, item]));
  const checkSpecsById = new Map(effectivePolicyV2VerificationChecks(input.workOrder).map((check) => [check.id, check]));
  const seen = new Set<string>();
  const checks = input.packetChecks.map((reported) => {
    const checkId = typeof reported?.checkId === "string" ? reported.checkId : "";
    if (!checkId || seen.has(checkId)) throw new Error(`Verifier reported a missing or duplicate check identity: ${checkId || "unknown"}`);
    seen.add(checkId);
    const spec = checkSpecsById.get(checkId) as any;
    if (!spec || !planEvidenceById.has(checkId)) {
      throw new Error(`Verifier reported evidence outside the frozen Verification Plan: ${checkId}`);
    }
    if (!CHECK_STATUSES.has(reported.status)) throw new Error(`Verifier reported an invalid status for ${checkId}.`);
    const startedAt = Number.isFinite(reported.startedAt) ? reported.startedAt : 0;
    const completedAt = Number.isFinite(reported.completedAt) ? reported.completedAt : startedAt;
    return {
      checkId,
      name: spec.name,
      category: spec.category,
      verifierId: spec.verifierId,
      mandatory: spec.mandatory,
      status: reported.status,
      summary: String(reported.summary ?? "Verification check completed.").slice(0, 2_000),
      acceptanceCriterionIds: [...spec.acceptanceCriterionIds],
      startedAt,
      completedAt,
      durationMs: Number.isFinite(reported.durationMs) ? Math.max(0, reported.durationMs) : Math.max(0, completedAt - startedAt),
      evidenceIds: [...(input.evidenceIdsByCheck.get(checkId) ?? [])],
      violations: Array.isArray(reported.violations)
        ? reported.violations.filter((item: unknown) => typeof item === "string").map((item: string) => item.slice(0, 2_000))
        : [],
      metadata: reported.metadata,
    };
  });
  const checksById = new Map(checks.map((check) => [check.checkId, check]));
  const criterionCoverage = (input.workOrder.acceptanceCriteria ?? []).map((criterion: any) => {
    const requiredCheckIds = effectivePolicyV2VerificationChecks(input.workOrder)
      .filter((check) => check.acceptanceCriterionIds.includes(criterion.id) && planEvidenceById.get(check.id)?.required)
      .map((check) => check.id);
    const usableChecks = requiredCheckIds
      .map((checkId) => checksById.get(checkId))
      .filter((check) => check?.status === "PASS" && check.evidenceIds.length > 0);
    const evidenceIds = usableChecks.flatMap((check) => check!.evidenceIds);
    const missingEvidence = requiredCheckIds.filter((checkId) => {
      const check = checksById.get(checkId);
      return check?.status !== "PASS" || check.evidenceIds.length === 0;
    });
    if (requiredCheckIds.length === 0) missingEvidence.push("no-required-check");
    return {
      criterionId: criterion.id,
      title: String(criterion.title ?? criterion.description ?? criterion.id),
      status: missingEvidence.length === 0 ? "EVIDENCED" as const : "MISSING" as const,
      requiredEvidenceCount: requiredCheckIds.length,
      usableEvidenceCount: usableChecks.length,
      missingEvidence,
      evidenceIds,
    };
  });
  return { checks, criterionCoverage };
}
