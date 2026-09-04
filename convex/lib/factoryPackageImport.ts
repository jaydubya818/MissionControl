import {
  FactoryPackageContractError,
  canonicalFactoryPackageJson,
  sha256Hex,
  type FactoryPackageRetrieval,
} from "@mission-control/shared";
import type { MissionPlanInput } from "./missionPlan";

export const FACTORY_PACKAGE_MAPPING_REVISION = 1;

export interface FactoryPackageCodeScopeMapping {
  requestedCodeScope: string;
  codeScopeId: string;
}

export interface FactoryPackageLocalTarget {
  projectId: string;
  repositoryId: string;
  ownerMemberId: string;
  owningTeamId: string;
  codeScopeMappings: FactoryPackageCodeScopeMapping[];
  workflowId: string;
  workflowVersion: number;
  executionEnvironment: "LOCAL" | "CLOUD" | "REMOTE" | "POLICY_SELECTED";
  repository: string;
  repositoryBranch: string;
}

export interface FactoryPackageMissionDraft {
  title: string;
  objective: string;
  context: string;
  constraints: string[];
  sourceOfTruthRefs: Array<{ kind: "URL"; label: string; location: string }>;
  stopCondition: string;
  ownerMemberId: string;
  owningTeamId: string;
  repositoryId: string;
  codeScopeIds: string[];
  executionEnvironment: FactoryPackageLocalTarget["executionEnvironment"];
}

export interface FactoryPackageMappedDrafts {
  mission: FactoryPackageMissionDraft;
  plan: MissionPlanInput;
  idempotencyKey: string;
  targetFingerprint: string;
  mappingDigest: string;
  mappingRevision: number;
  warnings: string[];
}

export interface ExistingFactoryPackageImport {
  packageDigest: string;
  targetFingerprint: string;
}

export type FactoryPackageRetryDecision =
  | "CREATE"
  | "RETURN_EXISTING"
  | "CONFLICT";
export type FactoryPackageGovernanceBlocker =
  | "PLAN_RELEASE_DISABLED"
  | "SPEC_INTAKE_REQUIRED";

export function factoryPackageGovernanceBlockers(input: {
  planReleaseEnabled: boolean;
  specIntakeEnabled: boolean;
}): FactoryPackageGovernanceBlocker[] {
  return [
    ...(!input.planReleaseEnabled ? ["PLAN_RELEASE_DISABLED" as const] : []),
    ...(input.specIntakeEnabled ? ["SPEC_INTAKE_REQUIRED" as const] : []),
  ];
}

export function factoryPackageImportKey(
  issuerId: string,
  packageId: string,
  packageVersion: number,
): string {
  return `factory-package:${issuerId}:${packageId}:${packageVersion}`;
}

export function resolveFactoryPackageImportRetry(
  existing: ExistingFactoryPackageImport | null,
  candidate: ExistingFactoryPackageImport,
): FactoryPackageRetryDecision {
  if (!existing) return "CREATE";
  return existing.packageDigest === candidate.packageDigest &&
    existing.targetFingerprint === candidate.targetFingerprint
    ? "RETURN_EXISTING"
    : "CONFLICT";
}

export function assertFactoryPackageTargetBinding(
  retrieval: FactoryPackageRetrieval,
  workspaceRef: string,
  repository: string,
): void {
  if (
    retrieval.package.target.workspace_ref !== workspaceRef ||
    retrieval.package.target.repository_ref.toLowerCase() !==
      `github.com/${repository}`.toLowerCase()
  ) {
    throw new FactoryPackageContractError(
      "TARGET_NOT_FOUND",
      "Factory package target does not match the configured Mission Control workspace and repository.",
    );
  }
}

export function assertFactoryPackageLocalProjectBinding(
  configuredProjectId: string,
  selectedProjectId: string,
): void {
  if (configuredProjectId !== selectedProjectId) {
    throw new FactoryPackageContractError(
      "TARGET_UNAUTHORIZED",
      "Factory package import is not authorized for the selected Mission Control workspace.",
    );
  }
}

export function mapFactoryPackageToDrafts(input: {
  retrieval: FactoryPackageRetrieval;
  target: FactoryPackageLocalTarget;
  packageReferenceUrl: string;
}): FactoryPackageMappedDrafts {
  const { package: packageDocument } = input.retrieval;
  const intent = packageDocument.deployment_intent;
  const requestedScopes = packageDocument.target.requested_code_scopes;
  const mappedScopeRefs = input.target.codeScopeMappings.map(
    (mapping) => mapping.requestedCodeScope,
  );
  assertExactMapping(
    requestedScopes,
    mappedScopeRefs,
    "Factory package code scopes",
  );
  for (const blueprint of intent.work_order_blueprints) {
    assertExactMapping(
      requestedScopes,
      blueprint.requested_code_scopes,
      `Factory blueprint ${blueprint.key} code scopes`,
    );
  }
  if (
    !Number.isSafeInteger(input.target.workflowVersion) ||
    input.target.workflowVersion < 1
  ) {
    throw new Error(
      "Factory package workflow mapping requires a positive local workflow version.",
    );
  }

  const targetFingerprint = factoryPackageTargetFingerprint(
    packageDocument.target,
    input.target,
  );
  const mappingDigest = factoryPackageMappingDigest(
    packageDocument.integrity.digest,
    targetFingerprint,
  );
  const requirementByKey = new Map(
    [
      ...intent.constraints,
      ...intent.required_capabilities,
      ...intent.verification_contract,
    ].map((requirement) => [requirement.key, requirement.statement]),
  );
  const acceptanceByKey = new Map(
    intent.acceptance_criteria.map((criterion) => [criterion.key, criterion]),
  );
  const authorityByKey = new Map(
    intent.authority_boundaries.map((boundary) => [boundary.key, boundary]),
  );

  return {
    mission: {
      title: intent.mission_title,
      objective: intent.objective,
      context: `${intent.mission_context}\n\nFactory deployment intent:\n${intent.intent}`,
      constraints: unique([
        ...intent.constraints.map((constraint) => constraint.statement),
        ...intent.environment_requirements.map(
          (requirement) => `Environment requirement: ${requirement.statement}`,
        ),
        ...intent.policy_requirements.map(
          (requirement) => `Policy requirement: ${requirement.statement}`,
        ),
        ...intent.approval_requirements.map(
          (requirement) => `Approval requirement: ${requirement.statement}`,
        ),
        ...intent.authority_boundaries.map(authorityConstraint),
      ]),
      sourceOfTruthRefs: [
        {
          kind: "URL",
          label: `Factory Deployment Package ${packageDocument.package_id} v${packageDocument.package_version}`,
          location: input.packageReferenceUrl,
        },
      ],
      stopCondition: intent.stop_condition,
      ownerMemberId: input.target.ownerMemberId,
      owningTeamId: input.target.owningTeamId,
      repositoryId: input.target.repositoryId,
      codeScopeIds: input.target.codeScopeMappings.map(
        (mapping) => mapping.codeScopeId,
      ),
      executionEnvironment: input.target.executionEnvironment,
    },
    plan: {
      summary: `${intent.plan_summary}\n\nFactory deployment specification:\n${intent.specification}`,
      rollbackApproach: intent.rollback_approach,
      repository: input.target.repository,
      repositoryBranch: input.target.repositoryBranch,
      assertions: intent.plan_assertions.map((assertion) => {
        const linkedBlueprints = intent.work_order_blueprints.filter(
          (blueprint) =>
            blueprint.assertion_ids.includes(assertion.assertion_id),
        );
        return {
          assertionId: assertion.assertion_id,
          title: assertion.title,
          outcome: assertion.outcome,
          verificationMethod: assertion.verification_method,
          passCondition: assertion.pass_condition,
          requiredEvidence: assertion.required_evidence,
          requiresIndependentValidation:
            assertion.requires_independent_validation,
          waiverAllowed: assertion.waiver_allowed,
          sourceRequirementIds: unique(
            linkedBlueprints.flatMap(
              (blueprint) => blueprint.capability_requirement_refs,
            ),
          ),
          sourceAcceptanceExpectationIds: unique(
            linkedBlueprints.flatMap(
              (blueprint) => blueprint.acceptance_criterion_refs,
            ),
          ),
          sourceVerificationExpectationIds: unique(
            linkedBlueprints.flatMap(
              (blueprint) => blueprint.verification_requirement_refs,
            ),
          ),
        };
      }),
      workOrderBlueprints: intent.work_order_blueprints.map((blueprint) => ({
        id: blueprint.key,
        title: blueprint.title,
        desiredOutcome: blueprint.outcome,
        workflowId: input.target.workflowId,
        workflowVersion: input.target.workflowVersion,
        sequence: blueprint.sequence,
        role: blueprint.execution_role,
        isMutating: blueprint.is_mutating,
        priority: blueprint.priority,
        riskLevel: blueprint.risk_level,
        constraints: unique([
          ...blueprint.requirements.map(
            (requirement) =>
              `Factory requirement: ${requirementByKey.get(requirement) ?? requirement}`,
          ),
          ...blueprint.constraints.map(
            (constraint) =>
              `Factory constraint: ${requirementByKey.get(constraint) ?? constraint}`,
          ),
          ...blueprint.acceptance_criterion_refs.map((reference) => {
            const criterion = acceptanceByKey.get(reference)!;
            return `Acceptance criterion ${reference} (${criterion.verification_method}): ${criterion.statement}`;
          }),
          ...blueprint.capability_requirement_refs.map(
            (reference) =>
              `Capability requirement: ${requirementByKey.get(reference) ?? reference}`,
          ),
          ...blueprint.verification_requirement_refs.map(
            (reference) =>
              `Verification requirement: ${requirementByKey.get(reference) ?? reference}`,
          ),
          ...blueprint.authority_boundary_refs.map((reference) => {
            const boundary = authorityByKey.get(reference);
            return boundary
              ? authorityConstraint(boundary)
              : `Authority boundary: ${reference}`;
          }),
        ]),
        requiredApprovals: blueprint.required_approvals,
        dependsOnBlueprintIds: blueprint.dependencies,
        assertionIds: blueprint.assertion_ids,
      })),
    },
    idempotencyKey: factoryPackageImportKey(
      packageDocument.issuer.issuer_id,
      packageDocument.package_id,
      packageDocument.package_version,
    ),
    targetFingerprint,
    mappingDigest,
    mappingRevision: FACTORY_PACKAGE_MAPPING_REVISION,
    warnings: [
      "Factory Engineer requirements remain upstream provenance; Mission Control resolves current capabilities and policy independently.",
      `Factory Engineer requires environment class ${packageDocument.target.environment_class}; Mission Control selected ${input.target.executionEnvironment} and remains authoritative for runtime admission.`,
      ...(intent.work_order_blueprints.some(
        (blueprint) => blueprint.is_mutating,
      )
        ? [
            "Mutating WorkOrders remain draft blueprints until a human supplies Mission Control branch and implementation policies.",
          ]
        : []),
    ],
  };
}

export function factoryPackageTargetFingerprint(
  packageTarget: FactoryPackageRetrieval["package"]["target"],
  localTarget: FactoryPackageLocalTarget,
): string {
  return digest({
    packageTarget,
    localTarget: {
      projectId: localTarget.projectId,
      repositoryId: localTarget.repositoryId,
      ownerMemberId: localTarget.ownerMemberId,
      owningTeamId: localTarget.owningTeamId,
      codeScopeMappings: localTarget.codeScopeMappings,
      workflowId: localTarget.workflowId,
      workflowVersion: localTarget.workflowVersion,
      executionEnvironment: localTarget.executionEnvironment,
      repository: localTarget.repository,
      repositoryBranch: localTarget.repositoryBranch,
    },
  });
}

export function factoryPackageMappingDigest(
  packageDigest: string,
  targetFingerprint: string,
): string {
  return digest({
    mappingRevision: FACTORY_PACKAGE_MAPPING_REVISION,
    packageDigest,
    targetFingerprint,
  });
}

function assertExactMapping(
  expected: string[],
  mapped: string[],
  label: string,
): void {
  if (
    new Set(mapped).size !== mapped.length ||
    expected.length !== mapped.length ||
    expected.some((value) => !mapped.includes(value))
  ) {
    throw new Error(`${label} require an exact one-to-one local mapping.`);
  }
}

function authorityConstraint(boundary: {
  key: string;
  subject: string;
  maximum_authority: string;
  prohibited_actions: string[];
}): string {
  return `Authority boundary ${boundary.key} for ${boundary.subject}: maximum authority ${boundary.maximum_authority}; prohibited actions: ${boundary.prohibited_actions.join(", ")}.`;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function digest(value: unknown): string {
  return `sha256:${sha256Hex(canonicalFactoryPackageJson(value))}`;
}
