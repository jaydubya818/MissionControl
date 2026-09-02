import { canonicalHash } from "@mission-control/shared";

export const QUALITY_CONTRACT_SCHEMA_VERSION = 2;

export interface ApprovedPlanQualityContractInput {
  missionId: string;
  missionPlanId: string;
  missionPlanRevision: number;
  objective: string;
  businessContext?: string;
  constraints?: string[];
  sourceOfTruthRefs?: Array<{ kind: string; label: string; location: string }>;
  repository: string;
  repositoryBranch: string;
  planningRepositorySha?: string;
  summary: string;
  rollbackApproach?: string;
  assertions: Array<{
    assertionId: string;
    title: string;
    outcome: string;
    verificationMethod: string;
    passCondition: string;
    requiredEvidence: string;
    requiresIndependentValidation: boolean;
    waiverAllowed: boolean;
    sourceRequirementIds?: string[];
    sourceAcceptanceExpectationIds?: string[];
    sourceVerificationExpectationIds?: string[];
  }>;
  specLineage?: {
    missionSpecRevisionId: string;
    missionSpecDigest: string;
    missionSpecQualityEvaluationId: string;
    projectConstitutionRevisionId: string;
    projectConstitutionDigest: string;
    requirementsCoverage: {
      schemaVersion: number;
      rows: Array<{
        specRequirementId: string;
        acceptanceExpectationIds: string[];
        planAssertionIds: string[];
        workOrderBlueprintIds: string[];
        acceptanceCriterionIds: string[];
        verificationCheckIds: string[];
        complete: boolean;
      }>;
      complete: boolean;
      digest: string;
    };
    checklistLineage: {
      requirementsQualityItemIds: string[];
      governanceConstraintItemIds: string[];
      evidenceBearingVerificationItemIds: string[];
    };
  };
  workOrderBlueprints: Array<{
    id: string;
    title: string;
    desiredOutcome: string;
    workflowId?: string;
    workflowVersion?: number;
    sequence: number;
    role: string;
    isMutating: boolean;
    riskLevel?: string;
    constraints?: string[];
    requiredApprovals?: string[];
    dependsOnBlueprintIds: string[];
    assertionIds: string[];
  }>;
}

function sortedStrings(values: string[] | undefined): string[] {
  return [...(values ?? [])].sort((left, right) => left.localeCompare(right));
}

/**
 * Compile the human-approved Plan into an immutable assurance projection.
 * The returned object is a projection, not an independently mutable aggregate.
 */
export function compileApprovedPlanQualityContract(
  input: ApprovedPlanQualityContractInput,
) {
  const projection = {
    schemaVersion: input.planningRepositorySha ? 3 : input.specLineage ? QUALITY_CONTRACT_SCHEMA_VERSION : 1,
    source: {
      missionId: input.missionId,
      missionPlanId: input.missionPlanId,
      missionPlanRevision: input.missionPlanRevision,
      ...(input.specLineage ? {
        missionSpecRevisionId: input.specLineage.missionSpecRevisionId,
        missionSpecDigest: input.specLineage.missionSpecDigest,
        missionSpecQualityEvaluationId: input.specLineage.missionSpecQualityEvaluationId,
        projectConstitutionRevisionId: input.specLineage.projectConstitutionRevisionId,
        projectConstitutionDigest: input.specLineage.projectConstitutionDigest,
      } : {}),
    },
    intent: {
      objective: input.objective,
      businessContext: input.businessContext,
      constraints: sortedStrings(input.constraints),
      sourceOfTruthRefs: [...(input.sourceOfTruthRefs ?? [])].sort((left, right) =>
        left.kind.localeCompare(right.kind)
        || left.location.localeCompare(right.location)
        || left.label.localeCompare(right.label)
      ),
    },
    repository: {
      repository: input.repository,
      branch: input.repositoryBranch,
      planningRepositorySha: input.planningRepositorySha,
    },
    plan: {
      summary: input.summary,
      rollbackApproach: input.rollbackApproach,
    },
    assertions: [...input.assertions]
      .sort((left, right) => left.assertionId.localeCompare(right.assertionId))
      .map((assertion) => ({ ...assertion })),
    workOrders: [...input.workOrderBlueprints]
      .sort((left, right) => left.sequence - right.sequence || left.id.localeCompare(right.id))
      .map((blueprint) => ({
        ...blueprint,
        constraints: sortedStrings(blueprint.constraints),
        requiredApprovals: sortedStrings(blueprint.requiredApprovals),
        dependsOnBlueprintIds: sortedStrings(blueprint.dependsOnBlueprintIds),
        assertionIds: sortedStrings(blueprint.assertionIds),
      })),
    ...(input.specLineage ? {
      requirementsCoverage: input.specLineage.requirementsCoverage,
      checklistLineage: input.specLineage.checklistLineage,
    } : {}),
  };

  return {
    projection,
    digest: `sha256:${canonicalHash(projection)}`,
  };
}
