import { sha256Hex } from "./canonicalDigest.js";

export const FACTORY_DEPLOYMENT_PACKAGE_SCHEMA =
  "fdlc.factory-deployment-package/v1" as const;
export const FACTORY_DEPLOYMENT_PACKAGE_CANONICALIZATION =
  "fdlc-canonical-json/v1" as const;
export const FACTORY_DEPLOYMENT_PACKAGE_ALGORITHM = "sha256" as const;
export const FACTORY_DEPLOYMENT_PACKAGE_MAX_BYTES = 256_000;
export const FACTORY_DEPLOYMENT_PACKAGE_MAX_ARRAY_ITEMS = 200;
export const FACTORY_DEPLOYMENT_PACKAGE_MAX_CODE_SCOPES = 50;

export type FactoryPackageStatus =
  | "DRAFT"
  | "READY_FOR_REVIEW"
  | "APPROVED"
  | "PUBLISHED"
  | "SUPERSEDED"
  | "REJECTED"
  | "REVOKED"
  | "STALE";

export type FactoryPackageImportErrorCode =
  | "UNSUPPORTED_CONTRACT_VERSION"
  | "INVALID_PACKAGE"
  | "PAYLOAD_TOO_LARGE"
  | "DIGEST_MISMATCH"
  | "ORIGIN_UNVERIFIED"
  | "APPROVAL_UNVERIFIED"
  | "PACKAGE_NOT_PUBLISHED"
  | "PACKAGE_STALE"
  | "PACKAGE_REVOKED"
  | "PACKAGE_NOT_FOUND"
  | "AUTHENTICATION_REQUIRED"
  | "TARGET_NOT_FOUND"
  | "TARGET_UNAUTHORIZED"
  | "CODE_SCOPE_REJECTED"
  | "WORKFLOW_UNAVAILABLE"
  | "QUALIFICATION_MODE_DISABLED"
  | "PLAN_RELEASE_DISABLED"
  | "SPEC_INTAKE_REQUIRED"
  | "IDEMPOTENCY_CONFLICT"
  | "TEMPORARY_UNAVAILABLE";

export class FactoryPackageContractError extends Error {
  readonly code: FactoryPackageImportErrorCode;

  constructor(code: FactoryPackageImportErrorCode, message: string) {
    super(message);
    this.name = "FactoryPackageContractError";
    this.code = code;
  }
}

export interface FactoryPackageIssuer {
  issuer_id: string;
  issuer_type: "FDLC_FACTORY_ENGINEER";
  environment: string;
  authority_scope: "DEPLOYMENT_PACKAGE_PUBLISH";
}

export interface FactoryPackageSourceReference {
  kind: "EVIDENCE" | "VERIFIED_CLAIM" | "APPROVED_INPUT" | "ASSUMPTION";
  ref: string;
  version?: number | null;
  sha256: string;
}

export interface FactoryPackageRequirement {
  key: string;
  statement: string;
}

export interface FactoryPackageAcceptanceCriterion extends FactoryPackageRequirement {
  verification_method: string;
}

export interface FactoryPackageAuthorityBoundary {
  key: string;
  subject: string;
  maximum_authority: string;
  prohibited_actions: string[];
}

export interface FactoryPackageVerificationRequirement extends FactoryPackageRequirement {
  evidence_required: string[];
  independent: boolean;
}

export type MissionPlanVerificationMethod =
  | "COMMAND"
  | "TEST"
  | "BROWSER"
  | "MANUAL"
  | "CHECKLIST";
export type MissionPlanRiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface FactoryPackagePlanAssertion {
  assertion_id: string;
  title: string;
  outcome: string;
  verification_method: MissionPlanVerificationMethod;
  pass_condition: string;
  required_evidence: string;
  requires_independent_validation: boolean;
  waiver_allowed: boolean;
}

export interface FactoryPackageWorkOrderBlueprint {
  key: string;
  title: string;
  outcome: string;
  requirements: string[];
  acceptance_criterion_refs: string[];
  constraints: string[];
  requested_code_scopes: string[];
  capability_requirement_refs: string[];
  verification_requirement_refs: string[];
  authority_boundary_refs: string[];
  sequence: number;
  execution_role: "WORKER" | "VALIDATOR";
  is_mutating: boolean;
  priority: 1 | 2 | 3 | 4;
  risk_level: MissionPlanRiskLevel;
  required_approvals: string[];
  dependencies: string[];
  assertion_ids: string[];
}

export interface FactoryDeploymentIntent {
  mission_title: string;
  mission_context: string;
  stop_condition: string;
  plan_summary: string;
  rollback_approach: string;
  objective: string;
  intent: string;
  specification: string;
  acceptance_criteria: FactoryPackageAcceptanceCriterion[];
  constraints: FactoryPackageRequirement[];
  required_capabilities: FactoryPackageRequirement[];
  required_agents: FactoryPackageRequirement[];
  required_skills: FactoryPackageRequirement[];
  required_tools: FactoryPackageRequirement[];
  model_requirements: FactoryPackageRequirement[];
  context_requirements: FactoryPackageRequirement[];
  environment_requirements: FactoryPackageRequirement[];
  authority_boundaries: FactoryPackageAuthorityBoundary[];
  policy_requirements: FactoryPackageRequirement[];
  approval_requirements: FactoryPackageRequirement[];
  verification_contract: FactoryPackageVerificationRequirement[];
  evaluation_requirements: FactoryPackageRequirement[];
  rollback_requirements: FactoryPackageRequirement[];
  observability_requirements: FactoryPackageRequirement[];
  economics_baseline: Record<string, unknown>;
  risk_summary: FactoryPackageRequirement[];
  evidence_refs: FactoryPackageSourceReference[];
  decision_refs: FactoryPackageSourceReference[];
  provenance: FactoryPackageSourceReference[];
  plan_assertions: FactoryPackagePlanAssertion[];
  work_order_blueprints: FactoryPackageWorkOrderBlueprint[];
}

export interface FactoryDeploymentPackage {
  schema_version: typeof FACTORY_DEPLOYMENT_PACKAGE_SCHEMA;
  package_id: string;
  package_version: number;
  status: "PUBLISHED";
  issuer: FactoryPackageIssuer;
  issued_at: string;
  approval: FactoryPackageApprovalBinding;
  integrity: {
    canonicalization: typeof FACTORY_DEPLOYMENT_PACKAGE_CANONICALIZATION;
    algorithm: typeof FACTORY_DEPLOYMENT_PACKAGE_ALGORITHM;
    digest: string;
  };
  source: {
    engagement_id: string;
    customer_factory_model: FactoryPackageImmutableVersionReference;
    current_workflow: FactoryPackageImmutableVersionReference;
    target_workflow: FactoryPackageImmutableVersionReference;
    readiness_assessment: FactoryPackageImmutableVersionReference;
    factory_opportunity: FactoryPackageImmutableVersionReference;
  };
  target: FactoryPackageDeploymentTarget;
  deployment_intent: FactoryDeploymentIntent;
}

export interface FactoryPackageImmutableVersionReference {
  id: string;
  version: number;
  digest: string;
}

export interface FactoryPackageDeploymentTarget {
  workspace_ref: string;
  repository_ref: string;
  requested_code_scopes: string[];
  semantic_execution_workflow_ref: string;
  environment_class: string;
}

export interface FactoryPackageApprovalBinding {
  decision_ref: FactoryPackageSourceReference;
  approved_by: string;
  authorized_by_ref: string;
  authority_basis_ref: FactoryPackageSourceReference;
  approved_at: string;
}

export interface FactoryPackageAttestation {
  package_id: string;
  package_version: number;
  digest: string;
  current_status: FactoryPackageStatus;
  issuer: FactoryPackageIssuer;
  approval: FactoryPackageApprovalBinding;
  published_at: string;
  retrieved_at: string;
  correlation_id: string;
}

export interface FactoryPackageRetrieval {
  package: FactoryDeploymentPackage;
  attestation: FactoryPackageAttestation;
}

export interface FactoryPackageValidationOptions {
  nowMs?: number;
  maxAttestationAgeMs?: number;
}

export function canonicalFactoryPackageJson(value: unknown): string {
  return canonicalize(value, "$", new Set());
}

function canonicalize(
  value: unknown,
  path: string,
  ancestors: Set<object>,
): string {
  if (value === null || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "string") {
    assertUnicodeScalarString(value, path);
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      throw new FactoryPackageContractError(
        "INVALID_PACKAGE",
        `${path} must use safe integers or strings for numeric contract values.`,
      );
    }
    return JSON.stringify(value);
  }
  if (typeof value !== "object" || value === undefined) {
    throw new FactoryPackageContractError(
      "INVALID_PACKAGE",
      `${path} is not canonical JSON data.`,
    );
  }
  if (ancestors.has(value)) {
    throw new FactoryPackageContractError(
      "INVALID_PACKAGE",
      `${path} contains a circular value.`,
    );
  }
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return `[${value.map((item, index) => canonicalize(item, `${path}[${index}]`, ancestors)).join(",")}]`;
    }
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record);
    for (const key of keys) {
      if (!/^[\x00-\x7f]*$/.test(key)) {
        throw new FactoryPackageContractError(
          "INVALID_PACKAGE",
          `${path} contains a non-ASCII object key.`,
        );
      }
      assertUnicodeScalarString(key, `${path} object key`);
      if (record[key] === undefined) {
        throw new FactoryPackageContractError(
          "INVALID_PACKAGE",
          `${path}.${key} cannot be undefined.`,
        );
      }
    }
    keys.sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalize(record[key], `${path}.${key}`, ancestors)}`).join(",")}}`;
  } finally {
    ancestors.delete(value);
  }
}

function assertUnicodeScalarString(value: string, path: string): void {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (Number.isNaN(next) || next < 0xdc00 || next > 0xdfff) {
        throw new FactoryPackageContractError(
          "INVALID_PACKAGE",
          `${path} contains invalid Unicode.`,
        );
      }
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      throw new FactoryPackageContractError(
        "INVALID_PACKAGE",
        `${path} contains invalid Unicode.`,
      );
    }
  }
}

export function factoryDeploymentPackageDigest(
  value: Omit<FactoryDeploymentPackage, "integrity"> & {
    integrity: Omit<FactoryDeploymentPackage["integrity"], "digest"> & {
      digest?: string;
    };
  },
): string {
  const { digest: _digest, ...integrity } = value.integrity;
  const digestInput = { ...value, integrity };
  return `sha256:${sha256Hex(canonicalFactoryPackageJson(digestInput))}`;
}

export function assertFactoryPackagePayloadSize(payload: string): void {
  if (
    new TextEncoder().encode(payload).byteLength >
    FACTORY_DEPLOYMENT_PACKAGE_MAX_BYTES
  ) {
    throw new FactoryPackageContractError(
      "PAYLOAD_TOO_LARGE",
      "Factory package response exceeds 256,000 UTF-8 bytes.",
    );
  }
}

export function validateFactoryPackageRetrieval(
  value: unknown,
  expectedIssuer: FactoryPackageIssuer,
  options: FactoryPackageValidationOptions = {},
): FactoryPackageRetrieval {
  const root = record(value, "$", "INVALID_PACKAGE");
  const packageValue = record(root.package, "package", "INVALID_PACKAGE");
  const attestation = record(
    root.attestation,
    "attestation",
    "ORIGIN_UNVERIFIED",
  );

  if (packageValue.schema_version !== FACTORY_DEPLOYMENT_PACKAGE_SCHEMA) {
    throw new FactoryPackageContractError(
      "UNSUPPORTED_CONTRACT_VERSION",
      "Factory deployment package schema is unsupported.",
    );
  }
  if (packageValue.status !== "PUBLISHED") {
    throw statusError(packageValue.status);
  }
  if (attestation.current_status !== "PUBLISHED") {
    throw statusError(attestation.current_status);
  }

  const packageIssuer = validateIssuer(packageValue.issuer, "package.issuer");
  const attestedIssuer = validateIssuer(
    attestation.issuer,
    "attestation.issuer",
  );
  if (
    !sameIssuer(packageIssuer, expectedIssuer) ||
    !sameIssuer(attestedIssuer, expectedIssuer)
  ) {
    throw new FactoryPackageContractError(
      "ORIGIN_UNVERIFIED",
      "Factory package issuer is not trusted.",
    );
  }

  const integrity = record(
    packageValue.integrity,
    "package.integrity",
    "INVALID_PACKAGE",
  );
  if (
    integrity.canonicalization !==
      FACTORY_DEPLOYMENT_PACKAGE_CANONICALIZATION ||
    integrity.algorithm !== FACTORY_DEPLOYMENT_PACKAGE_ALGORITHM
  ) {
    throw new FactoryPackageContractError(
      "UNSUPPORTED_CONTRACT_VERSION",
      "Factory package canonicalization or digest algorithm is unsupported.",
    );
  }
  const declaredDigest = digest(
    integrity.digest,
    "package.integrity.digest",
    "DIGEST_MISMATCH",
  );

  const packageId = uuid(
    packageValue.package_id,
    "package.package_id",
    "INVALID_PACKAGE",
  );
  const packageVersion = positiveInteger(
    packageValue.package_version,
    "package.package_version",
    "INVALID_PACKAGE",
  );
  const issuedAt = timestamp(
    packageValue.issued_at,
    "package.issued_at",
    "INVALID_PACKAGE",
  );
  validateApproval(packageValue.approval, "package.approval");
  validateSource(packageValue.source);
  const target = validateTarget(packageValue.target);
  validateDeploymentIntent(
    packageValue.deployment_intent,
    target.requestedCodeScopes,
  );

  const computedDigest = factoryDeploymentPackageDigest(
    packageValue as unknown as FactoryDeploymentPackage,
  );
  if (computedDigest !== declaredDigest) {
    throw new FactoryPackageContractError(
      "DIGEST_MISMATCH",
      "Factory package content does not match its declared digest.",
    );
  }

  if (
    uuid(
      attestation.package_id,
      "attestation.package_id",
      "ORIGIN_UNVERIFIED",
    ) !== packageId ||
    positiveInteger(
      attestation.package_version,
      "attestation.package_version",
      "ORIGIN_UNVERIFIED",
    ) !== packageVersion ||
    digest(attestation.digest, "attestation.digest", "ORIGIN_UNVERIFIED") !==
      declaredDigest
  ) {
    throw new FactoryPackageContractError(
      "ORIGIN_UNVERIFIED",
      "Factory package attestation does not bind the retrieved package identity and digest.",
    );
  }
  validateApproval(attestation.approval, "attestation.approval");
  if (
    canonicalFactoryPackageJson(attestation.approval) !==
    canonicalFactoryPackageJson(packageValue.approval)
  ) {
    throw new FactoryPackageContractError(
      "APPROVAL_UNVERIFIED",
      "Factory package attestation does not bind the immutable approval decision.",
    );
  }
  const publishedAt = timestamp(
    attestation.published_at,
    "attestation.published_at",
    "ORIGIN_UNVERIFIED",
  );
  const retrievedAt = timestamp(
    attestation.retrieved_at,
    "attestation.retrieved_at",
    "ORIGIN_UNVERIFIED",
  );
  uuid(
    attestation.correlation_id,
    "attestation.correlation_id",
    "ORIGIN_UNVERIFIED",
  );
  assertTimestampOrder(
    packageValue.approval,
    issuedAt,
    publishedAt,
    retrievedAt,
    options,
  );

  return value as FactoryPackageRetrieval;
}

function statusError(status: unknown): FactoryPackageContractError {
  if (status === "REVOKED") {
    return new FactoryPackageContractError(
      "PACKAGE_REVOKED",
      "Factory package is revoked.",
    );
  }
  if (status === "STALE") {
    return new FactoryPackageContractError(
      "PACKAGE_STALE",
      "Factory package is stale.",
    );
  }
  return new FactoryPackageContractError(
    "PACKAGE_NOT_PUBLISHED",
    "Factory package is not currently published.",
  );
}

function validateIssuer(value: unknown, path: string): FactoryPackageIssuer {
  const issuer = record(value, path, "ORIGIN_UNVERIFIED");
  const result: FactoryPackageIssuer = {
    issuer_id: string(
      issuer.issuer_id,
      `${path}.issuer_id`,
      "ORIGIN_UNVERIFIED",
      255,
    ),
    issuer_type: literal(
      issuer.issuer_type,
      "FDLC_FACTORY_ENGINEER",
      `${path}.issuer_type`,
      "ORIGIN_UNVERIFIED",
    ),
    environment: string(
      issuer.environment,
      `${path}.environment`,
      "ORIGIN_UNVERIFIED",
      120,
    ),
    authority_scope: literal(
      issuer.authority_scope,
      "DEPLOYMENT_PACKAGE_PUBLISH",
      `${path}.authority_scope`,
      "ORIGIN_UNVERIFIED",
    ),
  };
  return result;
}

function sameIssuer(
  left: FactoryPackageIssuer,
  right: FactoryPackageIssuer,
): boolean {
  return (
    left.issuer_id === right.issuer_id &&
    left.issuer_type === right.issuer_type &&
    left.environment === right.environment &&
    left.authority_scope === right.authority_scope
  );
}

function validateSource(value: unknown): void {
  const source = record(value, "package.source", "INVALID_PACKAGE");
  uuid(source.engagement_id, "package.source.engagement_id", "INVALID_PACKAGE");
  for (const field of [
    "customer_factory_model",
    "current_workflow",
    "target_workflow",
    "readiness_assessment",
    "factory_opportunity",
  ] as const) {
    validateImmutableVersionReference(source[field], `package.source.${field}`);
  }
}

function validateImmutableVersionReference(value: unknown, path: string): void {
  const reference = record(value, path, "INVALID_PACKAGE");
  uuid(reference.id, `${path}.id`, "INVALID_PACKAGE");
  positiveInteger(reference.version, `${path}.version`, "INVALID_PACKAGE");
  digest(reference.digest, `${path}.digest`, "INVALID_PACKAGE");
}

function validateTarget(value: unknown): { requestedCodeScopes: Set<string> } {
  const target = record(value, "package.target", "INVALID_PACKAGE");
  string(
    target.workspace_ref,
    "package.target.workspace_ref",
    "INVALID_PACKAGE",
    1_024,
  );
  string(
    target.repository_ref,
    "package.target.repository_ref",
    "INVALID_PACKAGE",
    1_024,
  );
  const scopes = stringArray(
    target.requested_code_scopes,
    "package.target.requested_code_scopes",
    true,
  );
  if (scopes.length > FACTORY_DEPLOYMENT_PACKAGE_MAX_CODE_SCOPES) {
    invalid("package.target.requested_code_scopes cannot exceed 50 items.");
  }
  if (new Set(scopes).size !== scopes.length)
    invalid("package.target.requested_code_scopes must be unique.");
  string(
    target.semantic_execution_workflow_ref,
    "package.target.semantic_execution_workflow_ref",
    "INVALID_PACKAGE",
    1_024,
  );
  string(
    target.environment_class,
    "package.target.environment_class",
    "INVALID_PACKAGE",
    160,
  );
  return { requestedCodeScopes: new Set(scopes) };
}

function validateDeploymentIntent(
  value: unknown,
  requestedCodeScopes: Set<string>,
): void {
  const intent = record(value, "package.deployment_intent", "INVALID_PACKAGE");
  string(
    intent.mission_title,
    "deployment_intent.mission_title",
    "INVALID_PACKAGE",
    512,
  );
  string(
    intent.mission_context,
    "deployment_intent.mission_context",
    "INVALID_PACKAGE",
    8_000,
  );
  string(
    intent.stop_condition,
    "deployment_intent.stop_condition",
    "INVALID_PACKAGE",
    4_000,
  );
  string(
    intent.plan_summary,
    "deployment_intent.plan_summary",
    "INVALID_PACKAGE",
    8_000,
  );
  string(
    intent.rollback_approach,
    "deployment_intent.rollback_approach",
    "INVALID_PACKAGE",
    4_000,
  );
  string(
    intent.objective,
    "deployment_intent.objective",
    "INVALID_PACKAGE",
    4_000,
  );
  string(intent.intent, "deployment_intent.intent", "INVALID_PACKAGE", 4_000);
  string(
    intent.specification,
    "deployment_intent.specification",
    "INVALID_PACKAGE",
    20_000,
  );

  const requirementCollections = [
    ["acceptance_criteria", true],
    ["constraints", true],
    ["required_capabilities", true],
    ["required_agents", false],
    ["required_skills", false],
    ["required_tools", false],
    ["model_requirements", false],
    ["context_requirements", true],
    ["environment_requirements", true],
    ["policy_requirements", true],
    ["approval_requirements", true],
    ["evaluation_requirements", true],
    ["rollback_requirements", true],
    ["observability_requirements", true],
    ["risk_summary", true],
  ] as const;
  for (const [field, required] of requirementCollections) {
    const values = array(
      intent[field],
      `deployment_intent.${field}`,
      "INVALID_PACKAGE",
      required,
    );
    values.forEach((item, index) =>
      validateRequirement(item, `deployment_intent.${field}[${index}]`),
    );
    uniqueIds(values, "key", `deployment_intent.${field}`);
  }
  const criteria = intent.acceptance_criteria as unknown[];
  criteria.forEach((item, index) => {
    const criterion = record(
      item,
      `deployment_intent.acceptance_criteria[${index}]`,
      "INVALID_PACKAGE",
    );
    string(
      criterion.verification_method,
      `deployment_intent.acceptance_criteria[${index}].verification_method`,
      "INVALID_PACKAGE",
      2_000,
    );
  });

  const boundaries = array(
    intent.authority_boundaries,
    "deployment_intent.authority_boundaries",
    "INVALID_PACKAGE",
    true,
  );
  boundaries.forEach((item, index) => {
    const boundary = record(
      item,
      `deployment_intent.authority_boundaries[${index}]`,
      "INVALID_PACKAGE",
    );
    string(
      boundary.key,
      `authority_boundaries[${index}].key`,
      "INVALID_PACKAGE",
      160,
    );
    string(
      boundary.subject,
      `authority_boundaries[${index}].subject`,
      "INVALID_PACKAGE",
      512,
    );
    string(
      boundary.maximum_authority,
      `authority_boundaries[${index}].maximum_authority`,
      "INVALID_PACKAGE",
      2_000,
    );
    stringArray(
      boundary.prohibited_actions,
      `authority_boundaries[${index}].prohibited_actions`,
      true,
    );
  });
  uniqueIds(boundaries, "key", "deployment_intent.authority_boundaries");

  const verification = array(
    intent.verification_contract,
    "deployment_intent.verification_contract",
    "INVALID_PACKAGE",
    true,
  );
  verification.forEach((item, index) => {
    const requirement = record(
      item,
      `deployment_intent.verification_contract[${index}]`,
      "INVALID_PACKAGE",
    );
    validateRequirement(
      requirement,
      `deployment_intent.verification_contract[${index}]`,
    );
    stringArray(
      requirement.evidence_required,
      `verification_contract[${index}].evidence_required`,
      true,
    );
    boolean(
      requirement.independent,
      `verification_contract[${index}].independent`,
    );
  });
  uniqueIds(verification, "key", "deployment_intent.verification_contract");

  record(
    intent.economics_baseline,
    "deployment_intent.economics_baseline",
    "INVALID_PACKAGE",
  );
  canonicalFactoryPackageJson(intent.economics_baseline);
  for (const field of [
    "evidence_refs",
    "decision_refs",
    "provenance",
  ] as const) {
    const refs = array(
      intent[field],
      `deployment_intent.${field}`,
      "INVALID_PACKAGE",
      true,
    );
    refs.forEach((item, index) =>
      validateSourceReference(item, `deployment_intent.${field}[${index}]`),
    );
  }

  const assertions = array(
    intent.plan_assertions,
    "deployment_intent.plan_assertions",
    "INVALID_PACKAGE",
    true,
  );
  const assertionIds = uniqueIds(assertions, "assertion_id", "plan_assertions");
  assertions.forEach((item, index) => validatePlanAssertion(item, index));
  const blueprints = array(
    intent.work_order_blueprints,
    "deployment_intent.work_order_blueprints",
    "INVALID_PACKAGE",
    true,
  );
  const blueprintIds = uniqueIds(blueprints, "key", "work_order_blueprints");
  const criterionIds = idSet(intent.acceptance_criteria as unknown[], "key");
  const capabilityIds = idSet(intent.required_capabilities as unknown[], "key");
  const verificationIds = idSet(verification, "key");
  const authorityIds = idSet(boundaries, "key");
  const approvalIds = idSet(intent.approval_requirements as unknown[], "key");
  const sequenceIds = new Set<number>();
  const sequenceByBlueprint = new Map<string, number>();
  const dependencies = new Map<string, string[]>();
  const coveredCriterionIds = new Set<string>();
  blueprints.forEach((item, index) => {
    const blueprint = validateBlueprint(item, index);
    if (sequenceIds.has(blueprint.sequence))
      invalid("Work-order blueprint sequence values must be unique.");
    sequenceIds.add(blueprint.sequence);
    sequenceByBlueprint.set(blueprint.key, blueprint.sequence);
    dependencies.set(blueprint.key, blueprint.dependencies);
    uniqueReferences(
      blueprint.assertion_ids,
      `work_order_blueprints[${index}].assertion_ids`,
    );
    uniqueReferences(
      blueprint.acceptance_criterion_refs,
      `work_order_blueprints[${index}].acceptance_criterion_refs`,
    );
    uniqueReferences(
      blueprint.capability_requirement_refs,
      `work_order_blueprints[${index}].capability_requirement_refs`,
    );
    uniqueReferences(
      blueprint.verification_requirement_refs,
      `work_order_blueprints[${index}].verification_requirement_refs`,
    );
    uniqueReferences(
      blueprint.authority_boundary_refs,
      `work_order_blueprints[${index}].authority_boundary_refs`,
    );
    uniqueReferences(
      blueprint.required_approvals,
      `work_order_blueprints[${index}].required_approvals`,
    );
    uniqueReferences(
      blueprint.dependencies,
      `work_order_blueprints[${index}].dependencies`,
    );
    uniqueReferences(
      blueprint.requested_code_scopes,
      `work_order_blueprints[${index}].requested_code_scopes`,
    );
    references(
      blueprint.assertion_ids,
      assertionIds,
      `work_order_blueprints[${index}].assertion_ids`,
    );
    references(
      blueprint.acceptance_criterion_refs,
      criterionIds,
      `work_order_blueprints[${index}].acceptance_criterion_refs`,
    );
    blueprint.acceptance_criterion_refs.forEach((reference) =>
      coveredCriterionIds.add(reference),
    );
    references(
      blueprint.capability_requirement_refs,
      capabilityIds,
      `work_order_blueprints[${index}].capability_requirement_refs`,
    );
    references(
      blueprint.verification_requirement_refs,
      verificationIds,
      `work_order_blueprints[${index}].verification_requirement_refs`,
    );
    references(
      blueprint.authority_boundary_refs,
      authorityIds,
      `work_order_blueprints[${index}].authority_boundary_refs`,
    );
    references(
      blueprint.required_approvals,
      approvalIds,
      `work_order_blueprints[${index}].required_approvals`,
    );
    references(
      blueprint.dependencies,
      blueprintIds,
      `work_order_blueprints[${index}].dependencies`,
    );
    references(
      blueprint.requested_code_scopes,
      requestedCodeScopes,
      `work_order_blueprints[${index}].requested_code_scopes`,
    );
    if (blueprint.requested_code_scopes.length !== requestedCodeScopes.size) {
      invalid(
        `work_order_blueprints[${index}].requested_code_scopes must equal the package target scope set.`,
      );
    }
    if (blueprint.dependencies.includes(blueprint.key))
      invalid(`Blueprint ${blueprint.key} cannot depend on itself.`);
  });
  const uncoveredCriterionIds = [...criterionIds].filter(
    (criterionId) => !coveredCriterionIds.has(criterionId),
  );
  if (uncoveredCriterionIds.length > 0) {
    invalid(
      `Every acceptance criterion must be referenced by a work-order blueprint. Uncovered: ${uncoveredCriterionIds.join(", ")}.`,
    );
  }
  for (const [blueprintId, blueprintDependencies] of dependencies) {
    const sequence = sequenceByBlueprint.get(blueprintId)!;
    if (
      blueprintDependencies.some(
        (dependency) =>
          (sequenceByBlueprint.get(dependency) ?? Number.POSITIVE_INFINITY) >=
          sequence,
      )
    ) {
      invalid(
        `Blueprint ${blueprintId} dependencies must have an earlier sequence.`,
      );
    }
  }
  assertAcyclic(dependencies);
  canonicalFactoryPackageJson(intent);
}

function validateRequirement(value: unknown, path: string): void {
  const requirement = record(value, path, "INVALID_PACKAGE");
  string(requirement.key, `${path}.key`, "INVALID_PACKAGE", 160);
  string(requirement.statement, `${path}.statement`, "INVALID_PACKAGE", 4_000);
}

function validateSourceReference(value: unknown, path: string): void {
  const ref = record(value, path, "INVALID_PACKAGE");
  const kind = enumValue(ref.kind, SOURCE_KINDS, `${path}.kind`);
  string(ref.ref, `${path}.ref`, "INVALID_PACKAGE", 1_024);
  digest(ref.sha256, `${path}.sha256`, "INVALID_PACKAGE");
  if (ref.version !== undefined && ref.version !== null) {
    positiveInteger(ref.version, `${path}.version`, "INVALID_PACKAGE");
  }
  if (
    (kind === "VERIFIED_CLAIM" || kind === "APPROVED_INPUT") &&
    (ref.version === undefined || ref.version === null)
  ) {
    invalid(`${path} must pin an immutable version.`);
  }
}

function validatePlanAssertion(value: unknown, index: number): void {
  const path = `deployment_intent.plan_assertions[${index}]`;
  const assertion = record(value, path, "INVALID_PACKAGE");
  string(
    assertion.assertion_id,
    `${path}.assertion_id`,
    "INVALID_PACKAGE",
    160,
  );
  string(assertion.title, `${path}.title`, "INVALID_PACKAGE", 512);
  string(assertion.outcome, `${path}.outcome`, "INVALID_PACKAGE", 4_000);
  enumValue(
    assertion.verification_method,
    VERIFICATION_METHODS,
    `${path}.verification_method`,
  );
  string(
    assertion.pass_condition,
    `${path}.pass_condition`,
    "INVALID_PACKAGE",
    2_000,
  );
  string(
    assertion.required_evidence,
    `${path}.required_evidence`,
    "INVALID_PACKAGE",
    4_000,
  );
  boolean(
    assertion.requires_independent_validation,
    `${path}.requires_independent_validation`,
  );
  boolean(assertion.waiver_allowed, `${path}.waiver_allowed`);
}

function validateBlueprint(
  value: unknown,
  index: number,
): FactoryPackageWorkOrderBlueprint {
  const path = `deployment_intent.work_order_blueprints[${index}]`;
  const blueprint = record(value, path, "INVALID_PACKAGE");
  string(blueprint.key, `${path}.key`, "INVALID_PACKAGE", 160);
  string(blueprint.title, `${path}.title`, "INVALID_PACKAGE", 512);
  string(blueprint.outcome, `${path}.outcome`, "INVALID_PACKAGE", 4_000);
  stringArray(blueprint.requirements, `${path}.requirements`, true);
  stringArray(
    blueprint.acceptance_criterion_refs,
    `${path}.acceptance_criterion_refs`,
    true,
  );
  stringArray(blueprint.constraints, `${path}.constraints`, false);
  stringArray(
    blueprint.requested_code_scopes,
    `${path}.requested_code_scopes`,
    true,
  );
  stringArray(
    blueprint.capability_requirement_refs,
    `${path}.capability_requirement_refs`,
    true,
  );
  stringArray(
    blueprint.verification_requirement_refs,
    `${path}.verification_requirement_refs`,
    true,
  );
  stringArray(
    blueprint.authority_boundary_refs,
    `${path}.authority_boundary_refs`,
    true,
  );
  positiveInteger(blueprint.sequence, `${path}.sequence`, "INVALID_PACKAGE");
  enumValue(
    blueprint.execution_role,
    EXECUTION_ROLES,
    `${path}.execution_role`,
  );
  boolean(blueprint.is_mutating, `${path}.is_mutating`);
  enumValue(blueprint.priority, PRIORITIES, `${path}.priority`);
  enumValue(blueprint.risk_level, RISK_LEVELS, `${path}.risk_level`);
  stringArray(
    blueprint.required_approvals,
    `${path}.required_approvals`,
    false,
  );
  stringArray(blueprint.dependencies, `${path}.dependencies`, false);
  stringArray(blueprint.assertion_ids, `${path}.assertion_ids`, true);
  return value as FactoryPackageWorkOrderBlueprint;
}

function validateApproval(value: unknown, path: string): void {
  const approval = record(value, path, "APPROVAL_UNVERIFIED");
  validateApprovalReference(approval.decision_ref, `${path}.decision_ref`);
  uuid(approval.approved_by, `${path}.approved_by`, "APPROVAL_UNVERIFIED");
  string(
    approval.authorized_by_ref,
    `${path}.authorized_by_ref`,
    "APPROVAL_UNVERIFIED",
    1_024,
  );
  validateApprovalReference(
    approval.authority_basis_ref,
    `${path}.authority_basis_ref`,
  );
  timestamp(approval.approved_at, `${path}.approved_at`, "APPROVAL_UNVERIFIED");
}

function validateApprovalReference(value: unknown, path: string): void {
  const reference = record(value, path, "APPROVAL_UNVERIFIED");
  if (reference.kind !== "APPROVED_INPUT") {
    throw new FactoryPackageContractError(
      "APPROVAL_UNVERIFIED",
      `${path} must be an APPROVED_INPUT reference.`,
    );
  }
  string(reference.ref, `${path}.ref`, "APPROVAL_UNVERIFIED", 1_024);
  positiveInteger(reference.version, `${path}.version`, "APPROVAL_UNVERIFIED");
  digest(reference.sha256, `${path}.sha256`, "APPROVAL_UNVERIFIED");
}

function assertTimestampOrder(
  packageApproval: unknown,
  issuedAt: string,
  publishedAt: string,
  retrievedAt: string,
  options: FactoryPackageValidationOptions,
): void {
  const approval = record(
    packageApproval,
    "package.approval",
    "APPROVAL_UNVERIFIED",
  );
  const approvedAt = Date.parse(approval.approved_at as string);
  const issued = Date.parse(issuedAt);
  const published = Date.parse(publishedAt);
  const retrieved = Date.parse(retrievedAt);
  if (approvedAt > issued || issued > published || published > retrieved) {
    throw new FactoryPackageContractError(
      "APPROVAL_UNVERIFIED",
      "Factory package approval and publication timestamps are inconsistent.",
    );
  }
  const now = options.nowMs ?? Date.now();
  const maxAge = options.maxAttestationAgeMs ?? 5 * 60_000;
  if (retrieved > now + 60_000 || now - retrieved > maxAge) {
    throw new FactoryPackageContractError(
      "PACKAGE_STALE",
      "Factory package attestation is not fresh.",
    );
  }
}

function record(
  value: unknown,
  path: string,
  code: FactoryPackageImportErrorCode,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new FactoryPackageContractError(code, `${path} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function array(
  value: unknown,
  path: string,
  code: FactoryPackageImportErrorCode,
  nonEmpty: boolean,
): unknown[] {
  if (
    !Array.isArray(value) ||
    (nonEmpty && value.length === 0) ||
    value.length > FACTORY_DEPLOYMENT_PACKAGE_MAX_ARRAY_ITEMS
  ) {
    throw new FactoryPackageContractError(
      code,
      `${path} must be ${nonEmpty ? "a non-empty" : "an"} array of at most ${FACTORY_DEPLOYMENT_PACKAGE_MAX_ARRAY_ITEMS} items.`,
    );
  }
  return value;
}

function string(
  value: unknown,
  path: string,
  code: FactoryPackageImportErrorCode,
  maxLength: number,
): string {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) {
    throw new FactoryPackageContractError(
      code,
      `${path} must be a non-empty string of at most ${maxLength} characters.`,
    );
  }
  return value;
}

function stringArray(
  value: unknown,
  path: string,
  nonEmpty: boolean,
): string[] {
  const values = array(value, path, "INVALID_PACKAGE", nonEmpty);
  return values.map((item, index) =>
    string(item, `${path}[${index}]`, "INVALID_PACKAGE", 2_000),
  );
}

function positiveInteger(
  value: unknown,
  path: string,
  code: FactoryPackageImportErrorCode,
): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new FactoryPackageContractError(
      code,
      `${path} must be a positive safe integer.`,
    );
  }
  return value as number;
}

function boolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") invalid(`${path} must be a boolean.`);
  return value as boolean;
}

function timestamp(
  value: unknown,
  path: string,
  code: FactoryPackageImportErrorCode,
): string {
  const result = string(value, path, code, 64);
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|\+00:00)$/.test(
      result,
    ) ||
    Number.isNaN(Date.parse(result))
  ) {
    throw new FactoryPackageContractError(
      code,
      `${path} must be a UTC RFC 3339 timestamp.`,
    );
  }
  return result;
}

function digest(
  value: unknown,
  path: string,
  code: FactoryPackageImportErrorCode,
): string {
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/.test(value)) {
    throw new FactoryPackageContractError(
      code,
      `${path} must be a lowercase SHA-256 digest.`,
    );
  }
  return value;
}

function uuid(
  value: unknown,
  path: string,
  code: FactoryPackageImportErrorCode,
): string {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    throw new FactoryPackageContractError(code, `${path} must be a UUID.`);
  }
  return value;
}

function literal<T extends string>(
  value: unknown,
  expected: T,
  path: string,
  code: FactoryPackageImportErrorCode,
): T {
  if (value !== expected)
    throw new FactoryPackageContractError(code, `${path} is not allowed.`);
  return expected;
}

function enumValue<T extends string | number>(
  value: unknown,
  allowed: readonly T[],
  path: string,
): T {
  if (!allowed.includes(value as T)) invalid(`${path} is not supported.`);
  return value as T;
}

function uniqueIds(
  values: unknown[],
  field: string,
  path: string,
): Set<string> {
  const result = idSet(values, field);
  if (result.size !== values.length)
    invalid(`${path} must use unique ${field} values.`);
  return result;
}

function idSet(values: unknown[], field: string): Set<string> {
  return new Set(
    values.map((item, index) => {
      const value = record(item, `${field}[${index}]`, "INVALID_PACKAGE")[
        field
      ];
      return string(
        value,
        `${field}[${index}].${field}`,
        "INVALID_PACKAGE",
        160,
      );
    }),
  );
}

function references(
  values: string[],
  available: Set<string>,
  path: string,
): void {
  const missing = values.filter((value) => !available.has(value));
  if (missing.length > 0)
    invalid(`${path} contains unknown references: ${missing.join(", ")}.`);
}

function uniqueReferences(values: string[], path: string): void {
  if (new Set(values).size !== values.length)
    invalid(`${path} must not contain duplicate references.`);
}

function assertAcyclic(graph: Map<string, string[]>): void {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string) => {
    if (visiting.has(id))
      invalid(
        `Work-order blueprint dependency graph contains a cycle at ${id}.`,
      );
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of graph.get(id) ?? []) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of graph.keys()) visit(id);
}

function invalid(message: string): never {
  throw new FactoryPackageContractError("INVALID_PACKAGE", message);
}

const SOURCE_KINDS = [
  "EVIDENCE",
  "VERIFIED_CLAIM",
  "APPROVED_INPUT",
  "ASSUMPTION",
] as const;
const VERIFICATION_METHODS = [
  "COMMAND",
  "TEST",
  "BROWSER",
  "MANUAL",
  "CHECKLIST",
] as const;
const EXECUTION_ROLES = ["WORKER", "VALIDATOR"] as const;
const PRIORITIES = [1, 2, 3, 4] as const;
const RISK_LEVELS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
