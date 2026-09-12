import { computeCanonicalHash } from "./genomeHash.js";

/** Historical schema. It is readable only for frozen legacy Factory Versions. */
export const LEGACY_EXACT_MODEL_ROUTE_SCHEMA = "factory-model-route/v1" as const;
/** Current inference-only model-route identity. */
export const EXACT_MODEL_ROUTE_SCHEMA = "factory-model-route/v2" as const;
export const LEGACY_MODEL_ROUTE_QUALIFICATION_SCHEMA = "factory-model-route-qualification/v1" as const;
export const MODEL_ROUTE_QUALIFICATION_SCHEMA = "factory-model-route-qualification/v2" as const;
export const MODEL_ROUTE_COST_POLICY_SCHEMA = "factory-model-route-cost-policy/v1" as const;

export type ModelRouteExecutionBackend = "persistent-worker" | "remote-sandbox";
export type ModelRouteRiskClass = "GREEN" | "YELLOW" | "RED";

export interface ModelRouteReasoningConfigInput {
  effort?: string;
  temperature?: number;
  maxTokens?: number;
}

/** V2 owns inference identity only. Harness and runtime identity belong to the
 * execution composition and are qualified separately. */
export interface ExactModelRouteInput {
  provider: string;
  providerRoute: string;
  modelId: string;
  reasoningConfig?: ModelRouteReasoningConfigInput;
}

/** The exact V1 shape is retained for version-aware readers and fixtures. */
export interface LegacyExactModelRouteInput {
  provider: string;
  providerRoute: string;
  modelId: string;
  capabilityIdentity: {
    adapter: string;
    version: string;
    capabilityManifestDigest: string;
    effectiveConfigSha256: string;
  };
  runtimeIdentity: {
    kind: "CODEX_CLI";
    cliVersion: string;
    executableSha256?: string;
    imageDigest?: string;
  };
}

export interface ModelRouteExecutionCompatibilityBindingInput {
  adapter: string;
  version: string;
  capabilityManifestDigest: string;
  effectiveConfigSha256: string;
  runtimeArtifactDigest: string;
  executionBackend: ModelRouteExecutionBackend;
}

export interface ExactModelRouteQualificationInput {
  routeDigest: string;
  evidenceReference: string;
  evidenceDigest: string;
  workloadClasses: string[];
  riskClasses: ModelRouteRiskClass[];
  repositoryIds?: string[];
  costPolicy?: unknown;
  promotedBy: string;
  promotedAt: number;
  compatibility: ModelRouteExecutionCompatibilityBindingInput;
}

export interface FrozenLegacyModelRouteExecutionInput {
  adapter: string;
  version: string;
  capabilityManifestDigest: string;
  effectiveConfigSha256: string;
  executionBackend: ModelRouteExecutionBackend;
  executableSha256?: string;
  imageDigest?: string;
}

export interface ModelRouteAdmissionRecord {
  routeSnapshot?: unknown;
  routeDigest?: string;
  enabled?: boolean;
  qualificationStatus?: string;
  admissionStatus?: string;
  qualificationSnapshot?: unknown;
  qualificationDigest?: string;
  estimatedCostPerRunUsd?: number;
  riskApproved?: boolean;
  costPolicySnapshot?: unknown;
  costPolicyDigest?: string;
}

export function exactModelRouteSnapshot(input: ExactModelRouteInput) {
  const reasoningConfig = {
    ...(input.reasoningConfig?.effort !== undefined
      ? { effort: input.reasoningConfig.effort.trim().toLowerCase() }
      : {}),
    ...(input.reasoningConfig?.temperature !== undefined
      ? { temperature: input.reasoningConfig.temperature }
      : {}),
    ...(input.reasoningConfig?.maxTokens !== undefined
      ? { maxTokens: input.reasoningConfig.maxTokens }
      : {}),
  };
  const snapshot = {
    schema: EXACT_MODEL_ROUTE_SCHEMA,
    provider: input.provider.trim().toLowerCase(),
    providerRoute: input.providerRoute.trim().toLowerCase(),
    modelId: input.modelId.trim(),
    ...(Object.keys(reasoningConfig).length > 0 ? { reasoningConfig } : {}),
  };
  const issues = exactModelRouteV2Issues(snapshot);
  if (issues.length) throw new Error(`Exact model route identity is invalid (${issues.join(", ")}).`);
  return snapshot;
}

/** Version-aware route validation. Unknown schema versions fail closed. */
export function exactModelRouteIssues(input: unknown): string[] {
  if (!input || typeof input !== "object" || Array.isArray(input)) return ["route-snapshot-invalid"];
  const route = input as Record<string, unknown>;
  if (route.schema === EXACT_MODEL_ROUTE_SCHEMA) return exactModelRouteV2Issues(route);
  if (route.schema === LEGACY_EXACT_MODEL_ROUTE_SCHEMA) return legacyExactModelRouteIssues(route);
  return ["route-schema-invalid"];
}

export function exactModelRouteV2Issues(input: unknown): string[] {
  if (!input || typeof input !== "object" || Array.isArray(input)) return ["route-snapshot-invalid"];
  const route = input as Record<string, any>;
  const issues: string[] = [];
  if (route.schema !== EXACT_MODEL_ROUTE_SCHEMA) issues.push("route-schema-invalid");
  if (!onlyKeys(route, ["schema", "provider", "providerRoute", "modelId", "reasoningConfig"])) {
    issues.push("route-fields-invalid");
  }
  if (hasOwn(route, "capabilityIdentity")) issues.push("harness-identity-not-allowed");
  if (hasOwn(route, "runtimeIdentity")) issues.push("runtime-identity-not-allowed");
  for (const [name, value, max] of [
    ["provider", route.provider, 100],
    ["provider-route", route.providerRoute, 100],
    ["model", route.modelId, 200],
  ] as const) {
    if (!boundedIdentity(value, max)) issues.push(`${name}-invalid`);
  }
  if (boundedIdentity(route.provider, 100) && route.provider !== route.provider.toLowerCase()) {
    issues.push("provider-noncanonical");
  }
  if (boundedIdentity(route.providerRoute, 100) && route.providerRoute !== route.providerRoute.toLowerCase()) {
    issues.push("provider-route-noncanonical");
  }
  if (route.reasoningConfig !== undefined) {
    if (!route.reasoningConfig || typeof route.reasoningConfig !== "object" || Array.isArray(route.reasoningConfig)) {
      issues.push("reasoning-config-invalid");
    } else {
      const reasoning = route.reasoningConfig as Record<string, unknown>;
      if (!onlyKeys(reasoning, ["effort", "temperature", "maxTokens"]) || Object.keys(reasoning).length === 0) {
        issues.push("reasoning-config-invalid");
      }
      if (reasoning.effort !== undefined && (
        !boundedIdentity(reasoning.effort, 64)
        || reasoning.effort !== reasoning.effort.toLowerCase()
      )) {
        issues.push("reasoning-effort-invalid");
      }
      if (reasoning.temperature !== undefined && (
        typeof reasoning.temperature !== "number"
        || !Number.isFinite(reasoning.temperature)
        || reasoning.temperature < 0
        || reasoning.temperature > 2
      )) {
        issues.push("reasoning-temperature-invalid");
      }
      if (reasoning.maxTokens !== undefined && (
        !Number.isSafeInteger(reasoning.maxTokens)
        || (reasoning.maxTokens as number) < 1
        || (reasoning.maxTokens as number) > 10_000_000
      )) {
        issues.push("reasoning-max-tokens-invalid");
      }
    }
  }
  return issues;
}

/** The V1 validator intentionally preserves the historical validation rules. */
export function legacyExactModelRouteIssues(input: unknown): string[] {
  if (!input || typeof input !== "object" || Array.isArray(input)) return ["route-snapshot-invalid"];
  const route = input as Record<string, any>;
  const issues: string[] = [];
  if (route.schema !== LEGACY_EXACT_MODEL_ROUTE_SCHEMA) issues.push("route-schema-invalid");
  for (const [name, value, max] of [
    ["provider", route.provider, 100],
    ["provider-route", route.providerRoute, 100],
    ["model", route.modelId, 200],
    ["adapter", route.capabilityIdentity?.adapter, 100],
    ["adapter-version", route.capabilityIdentity?.version, 100],
    ["cli-version", route.runtimeIdentity?.cliVersion, 100],
  ] as const) {
    if (!boundedIdentity(value, max)) issues.push(`${name}-invalid`);
  }
  if (route.runtimeIdentity?.kind !== "CODEX_CLI") issues.push("runtime-kind-invalid");
  if (!sha256Prefixed(route.capabilityIdentity?.capabilityManifestDigest)) issues.push("capability-digest-invalid");
  if (!sha256Bare(route.capabilityIdentity?.effectiveConfigSha256)) issues.push("configuration-digest-invalid");
  if (route.runtimeIdentity?.executableSha256 !== undefined && !sha256Bare(route.runtimeIdentity.executableSha256)) {
    issues.push("executable-digest-invalid");
  }
  if (route.runtimeIdentity?.imageDigest !== undefined && !sha256Prefixed(route.runtimeIdentity.imageDigest)) {
    issues.push("image-digest-invalid");
  }
  if (!route.runtimeIdentity?.executableSha256 && !route.runtimeIdentity?.imageDigest) {
    issues.push("runtime-artifact-identity-missing");
  }
  return issues;
}

/** Uses each persisted schema's original namespace, preserving historical V1 hashes. */
export function exactModelRouteDigest(snapshot: unknown) {
  const issues = exactModelRouteIssues(snapshot);
  if (issues.length) throw new Error(`Exact model route identity is invalid (${issues.join(", ")}).`);
  const schema = (snapshot as Record<string, unknown>).schema as
    | typeof EXACT_MODEL_ROUTE_SCHEMA
    | typeof LEGACY_EXACT_MODEL_ROUTE_SCHEMA;
  return `sha256:${computeCanonicalHash({ namespace: schema, value: snapshot })}`;
}

export function legacyExactModelRouteDigest(snapshot: unknown) {
  const issues = legacyExactModelRouteIssues(snapshot);
  if (issues.length) throw new Error(`Legacy exact model route identity is invalid (${issues.join(", ")}).`);
  return `sha256:${computeCanonicalHash({ namespace: LEGACY_EXACT_MODEL_ROUTE_SCHEMA, value: snapshot })}`;
}

export function modelRouteCostPolicyDigest(snapshot: unknown) {
  if (modelRouteCostPolicyIssues(snapshot).length) {
    throw new Error("Exact model route cost policy is invalid.");
  }
  return `sha256:${computeCanonicalHash({ namespace: MODEL_ROUTE_COST_POLICY_SCHEMA, value: snapshot })}`;
}

export function modelRouteCostPolicyIssues(input: unknown): string[] {
  if (!input || typeof input !== "object" || Array.isArray(input)) return ["cost-policy-invalid"];
  const policy = input as Record<string, any>;
  const source = policy.source as Record<string, any> | undefined;
  const issues: string[] = [];
  if (policy.schema !== MODEL_ROUTE_COST_POLICY_SCHEMA) issues.push("cost-policy-schema-invalid");
  if (policy.method !== "FULL_APPROVED_WORK_ORDER_CAP_RESERVATION") issues.push("cost-policy-method-invalid");
  if (policy.currency !== "USD") issues.push("cost-policy-currency-invalid");
  if (!Number.isFinite(policy.estimatedCostPerRunUsd) || policy.estimatedCostPerRunUsd <= 0 || policy.estimatedCostPerRunUsd > 1_000) {
    issues.push("cost-policy-estimate-invalid");
  }
  if (policy.reservationMode !== "FULL_ESTIMATE") issues.push("cost-policy-reservation-invalid");
  if (policy.actualCostTelemetry !== "MEASURED" && policy.actualCostTelemetry !== "UNAVAILABLE") {
    issues.push("cost-policy-actual-telemetry-invalid");
  }
  if (policy.actualCostTelemetry === "UNAVAILABLE" && !boundedIdentity(policy.unknownActualCostReason, 1_000)) {
    issues.push("cost-policy-unknown-reason-invalid");
  }
  if (!boundedIdentity(policy.evidence?.reference, 1_000) || !sha256Prefixed(policy.evidence?.digest)) {
    issues.push("cost-policy-evidence-invalid");
  }
  if (!source
    || source.kind !== "APPROVED_WORK_ORDER"
    || !boundedIdentity(source.workOrderId, 200)
    || !Number.isSafeInteger(source.workOrderRevisionNumber)
    || source.workOrderRevisionNumber < 1
    || !boundedIdentity(source.missionPlanId, 200)
    || !Number.isSafeInteger(source.missionPlanRevision)
    || source.missionPlanRevision < 1
    || !Number.isFinite(source.planEstimatedCostUsd)
    || source.planEstimatedCostUsd <= 0
    || !Number.isFinite(source.workOrderEstimatedCostUsd)
    || source.workOrderEstimatedCostUsd <= 0
    || !Number.isFinite(source.hardLimitUsd)
    || source.hardLimitUsd <= 0
    || !Number.isSafeInteger(source.maxRuntimeMinutes)
    || source.maxRuntimeMinutes < 1
    || !Number.isSafeInteger(source.maxAttempts)
    || source.maxAttempts < 1) {
    issues.push("cost-policy-source-invalid");
  } else if (policy.estimatedCostPerRunUsd !== source.hardLimitUsd
    || source.workOrderEstimatedCostUsd !== source.hardLimitUsd
    || source.planEstimatedCostUsd < source.workOrderEstimatedCostUsd) {
    issues.push("cost-policy-full-cap-mismatch");
  }
  return issues;
}

export function modelRouteExecutionCompatibilityBinding(
  input: ModelRouteExecutionCompatibilityBindingInput,
) {
  const binding = {
    adapter: input.adapter.trim(),
    version: input.version.trim(),
    capabilityManifestDigest: input.capabilityManifestDigest.trim().toLowerCase(),
    effectiveConfigSha256: input.effectiveConfigSha256.trim().toLowerCase(),
    runtimeArtifactDigest: input.runtimeArtifactDigest.trim().toLowerCase(),
    executionBackend: input.executionBackend,
  };
  const issues = modelRouteExecutionCompatibilityIssues(binding);
  if (issues.length) throw new Error(`Model-route execution compatibility is invalid (${issues.join(", ")}).`);
  return binding;
}

export function modelRouteExecutionCompatibilityIssues(input: unknown): string[] {
  if (!input || typeof input !== "object" || Array.isArray(input)) return ["compatibility-binding-invalid"];
  const binding = input as Record<string, unknown>;
  const issues: string[] = [];
  if (!onlyKeys(binding, [
    "adapter",
    "version",
    "capabilityManifestDigest",
    "effectiveConfigSha256",
    "runtimeArtifactDigest",
    "executionBackend",
  ])) issues.push("compatibility-fields-invalid");
  if (!boundedIdentity(binding.adapter, 100)) issues.push("compatibility-adapter-invalid");
  if (!boundedIdentity(binding.version, 100)) issues.push("compatibility-version-invalid");
  if (!sha256Prefixed(binding.capabilityManifestDigest)) issues.push("compatibility-capability-digest-invalid");
  if (!sha256Bare(binding.effectiveConfigSha256)) issues.push("compatibility-configuration-digest-invalid");
  if (!sha256Prefixed(binding.runtimeArtifactDigest)) issues.push("compatibility-runtime-artifact-digest-invalid");
  if (sha256Prefixed(binding.capabilityManifestDigest)
    && binding.capabilityManifestDigest !== binding.capabilityManifestDigest.toLowerCase()) {
    issues.push("compatibility-capability-digest-noncanonical");
  }
  if (sha256Bare(binding.effectiveConfigSha256)
    && binding.effectiveConfigSha256 !== binding.effectiveConfigSha256.toLowerCase()) {
    issues.push("compatibility-configuration-digest-noncanonical");
  }
  if (sha256Prefixed(binding.runtimeArtifactDigest)
    && binding.runtimeArtifactDigest !== binding.runtimeArtifactDigest.toLowerCase()) {
    issues.push("compatibility-runtime-artifact-digest-noncanonical");
  }
  if (binding.executionBackend !== "persistent-worker" && binding.executionBackend !== "remote-sandbox") {
    issues.push("compatibility-backend-invalid");
  }
  return issues;
}

export function exactModelRouteQualificationSnapshot(input: ExactModelRouteQualificationInput) {
  const repositoryIds = [...(input.repositoryIds ?? [])].sort();
  const snapshot = {
    schema: MODEL_ROUTE_QUALIFICATION_SCHEMA,
    routeDigest: input.routeDigest.trim().toLowerCase(),
    evidence: {
      reference: input.evidenceReference.trim(),
      digest: input.evidenceDigest.trim().toLowerCase(),
    },
    scope: {
      workloadClasses: [...input.workloadClasses].sort(),
      riskClasses: [...input.riskClasses].sort(),
      ...(repositoryIds.length > 0 ? { repositoryIds } : {}),
    },
    ...(input.costPolicy !== undefined ? { costPolicy: input.costPolicy } : {}),
    promotedBy: input.promotedBy.trim(),
    promotedAt: input.promotedAt,
    compatibility: modelRouteExecutionCompatibilityBinding(input.compatibility),
    authority: executionOnlyAuthority(),
  };
  const issues = modelRouteQualificationV2Issues(snapshot);
  if (issues.length) throw new Error(`Exact model route qualification is invalid (${issues.join(", ")}).`);
  return snapshot;
}

/** Version-aware qualification validation. V1 rules remain byte-for-byte hash compatible. */
export function modelRouteQualificationIssues(input: unknown): string[] {
  if (!input || typeof input !== "object" || Array.isArray(input)) return ["qualification-snapshot-invalid"];
  const qualification = input as Record<string, unknown>;
  if (qualification.schema === MODEL_ROUTE_QUALIFICATION_SCHEMA) {
    return modelRouteQualificationV2Issues(qualification);
  }
  if (qualification.schema === LEGACY_MODEL_ROUTE_QUALIFICATION_SCHEMA) {
    return legacyModelRouteQualificationIssues(qualification);
  }
  return ["qualification-schema-invalid"];
}

export function modelRouteQualificationV2Issues(input: unknown): string[] {
  if (!input || typeof input !== "object" || Array.isArray(input)) return ["qualification-snapshot-invalid"];
  const qualification = input as Record<string, any>;
  const issues = qualificationCommonIssues(qualification, MODEL_ROUTE_QUALIFICATION_SCHEMA);
  if (!onlyKeys(qualification, [
    "schema",
    "routeDigest",
    "evidence",
    "scope",
    "promotedBy",
    "promotedAt",
    "compatibility",
    "authority",
    "costPolicy",
  ])) issues.push("qualification-fields-invalid");
  if (!onlyKeys(qualification.evidence, ["reference", "digest"])) issues.push("qualification-evidence-fields-invalid");
  if (!onlyKeys(qualification.scope, ["workloadClasses", "riskClasses", "repositoryIds"])) issues.push("qualification-scope-fields-invalid");
  if (!onlyKeys(qualification.authority, [
    "executionOnly",
    "routing",
    "verification",
    "acceptance",
    "publication",
    "merge",
  ])) issues.push("qualification-authority-fields-invalid");
  if (sha256Prefixed(qualification.routeDigest) && qualification.routeDigest !== qualification.routeDigest.toLowerCase()) {
    issues.push("qualification-route-digest-noncanonical");
  }
  if (sha256Prefixed(qualification.evidence?.digest)
    && qualification.evidence.digest !== qualification.evidence.digest.toLowerCase()) {
    issues.push("qualification-evidence-digest-noncanonical");
  }
  if (Array.isArray(qualification.scope?.workloadClasses)
    && !isSorted(qualification.scope.workloadClasses)) issues.push("qualification-workload-scope-noncanonical");
  if (Array.isArray(qualification.scope?.riskClasses)
    && !isSorted(qualification.scope.riskClasses)) issues.push("qualification-risk-scope-noncanonical");
  if (Array.isArray(qualification.scope?.repositoryIds)
    && !isSorted(qualification.scope.repositoryIds)) issues.push("qualification-repository-scope-noncanonical");
  issues.push(...modelRouteExecutionCompatibilityIssues(qualification.compatibility));
  return issues;
}

/** The V1 qualification validator preserves the checks used before V2. */
export function legacyModelRouteQualificationIssues(input: unknown): string[] {
  if (!input || typeof input !== "object" || Array.isArray(input)) return ["qualification-snapshot-invalid"];
  return qualificationCommonIssues(
    input as Record<string, any>,
    LEGACY_MODEL_ROUTE_QUALIFICATION_SCHEMA,
  );
}

export function modelRouteQualificationDigest(snapshot: unknown) {
  const issues = modelRouteQualificationIssues(snapshot);
  if (issues.length) throw new Error(`Exact model route qualification is invalid (${issues.join(", ")}).`);
  const schema = (snapshot as Record<string, unknown>).schema as
    | typeof MODEL_ROUTE_QUALIFICATION_SCHEMA
    | typeof LEGACY_MODEL_ROUTE_QUALIFICATION_SCHEMA;
  return `sha256:${computeCanonicalHash({ namespace: schema, value: snapshot })}`;
}

/** Compatibility API for readers that only need persisted route/evidence integrity.
 * New Factory creation must call modelRouteEligibleForNewFactoryVersion with the
 * exact harness/runtime/backend binding. */
export function modelRouteProductionEligible(
  route: ModelRouteAdmissionRecord | null | undefined,
) {
  return qualifiedRecordForSchemas(route);
}

/** New Factory Versions admit only V2 routes whose qualification names the exact
 * harness manifest, effective config, runtime artifact, and backend. */
export function modelRouteEligibleForNewFactoryVersion(
  route: ModelRouteAdmissionRecord | null | undefined,
  execution: ModelRouteExecutionCompatibilityBindingInput,
) {
  if (!qualifiedRecordForSchemas(route, EXACT_MODEL_ROUTE_SCHEMA, MODEL_ROUTE_QUALIFICATION_SCHEMA)) {
    return false;
  }
  return modelRouteExecutionCompatibilityMatches(route!.qualificationSnapshot, execution);
}

/** Historical V1 eligibility is deliberately named and cannot authorize a new
 * Factory Version. It is for already-frozen legacy Factory Versions only. */
export function frozenLegacyModelRouteProductionEligible(
  route: ModelRouteAdmissionRecord | null | undefined,
) {
  return qualifiedRecordForSchemas(
    route,
    LEGACY_EXACT_MODEL_ROUTE_SCHEMA,
    LEGACY_MODEL_ROUTE_QUALIFICATION_SCHEMA,
  );
}

export function frozenLegacyModelRouteEligibleForExecution(
  route: ModelRouteAdmissionRecord | null | undefined,
  execution: FrozenLegacyModelRouteExecutionInput,
) {
  return frozenLegacyModelRouteProductionEligible(route)
    && legacyModelRouteMatchesExecution(route!.routeSnapshot, execution);
}

/** Reconciles an old contaminated route against an already-frozen execution.
 * No V1 values are inferred or promoted into a V2 qualification. */
export function legacyModelRouteMatchesExecution(
  routeSnapshot: unknown,
  execution: FrozenLegacyModelRouteExecutionInput,
) {
  if (legacyExactModelRouteIssues(routeSnapshot).length > 0) return false;
  const route = routeSnapshot as Record<string, any>;
  if (!boundedIdentity(execution.adapter, 100)
    || !boundedIdentity(execution.version, 100)
    || !sha256Prefixed(execution.capabilityManifestDigest)
    || !sha256Bare(execution.effectiveConfigSha256)
    || route.capabilityIdentity.adapter !== execution.adapter
    || route.capabilityIdentity.version !== execution.version
    || route.capabilityIdentity.capabilityManifestDigest !== execution.capabilityManifestDigest
    || route.capabilityIdentity.effectiveConfigSha256 !== execution.effectiveConfigSha256) {
    return false;
  }
  if (execution.executionBackend === "persistent-worker") {
    return sha256Bare(execution.executableSha256)
      && route.runtimeIdentity.executableSha256 === execution.executableSha256;
  }
  if (execution.executionBackend === "remote-sandbox") {
    return sha256Prefixed(execution.imageDigest)
      && route.runtimeIdentity.imageDigest === execution.imageDigest;
  }
  return false;
}

export function modelRouteExecutionCompatibilityMatches(
  qualificationSnapshot: unknown,
  execution: ModelRouteExecutionCompatibilityBindingInput,
) {
  if (modelRouteQualificationV2Issues(qualificationSnapshot).length > 0) return false;
  let normalized: ReturnType<typeof modelRouteExecutionCompatibilityBinding>;
  try {
    normalized = modelRouteExecutionCompatibilityBinding(execution);
  } catch {
    return false;
  }
  const expected = (qualificationSnapshot as Record<string, any>).compatibility;
  return expected.adapter === normalized.adapter
    && expected.version === normalized.version
    && expected.capabilityManifestDigest === normalized.capabilityManifestDigest
    && expected.effectiveConfigSha256 === normalized.effectiveConfigSha256
    && expected.runtimeArtifactDigest === normalized.runtimeArtifactDigest
    && expected.executionBackend === normalized.executionBackend;
}

export function modelRouteQualifiedFor(
  route: ModelRouteAdmissionRecord | null | undefined,
  input: {
    workloadClass: string;
    riskClass: ModelRouteRiskClass;
    repositoryId?: string;
  },
) {
  if (!modelRouteProductionEligible(route)) return false;
  const qualification = route!.qualificationSnapshot as Record<string, any>;
  if (!qualification.scope.workloadClasses.includes(input.workloadClass)
    || !qualification.scope.riskClasses.includes(input.riskClass)) return false;
  const repositoryIds = qualification.scope.repositoryIds as string[] | undefined;
  if (input.repositoryId && repositoryIds !== undefined && !repositoryIds.includes(input.repositoryId)) return false;
  if (input.riskClass === "RED") {
    return route!.riskApproved === true
      && qualification.costPolicy !== undefined
      && modelRouteCostPolicyIssues(qualification.costPolicy).length === 0
      && route!.estimatedCostPerRunUsd === qualification.costPolicy.estimatedCostPerRunUsd;
  }
  return true;
}

function qualifiedRecordForSchemas(
  route: ModelRouteAdmissionRecord | null | undefined,
  requiredRouteSchema?: typeof EXACT_MODEL_ROUTE_SCHEMA | typeof LEGACY_EXACT_MODEL_ROUTE_SCHEMA,
  requiredQualificationSchema?: typeof MODEL_ROUTE_QUALIFICATION_SCHEMA | typeof LEGACY_MODEL_ROUTE_QUALIFICATION_SCHEMA,
) {
  if (!route?.routeSnapshot || !route.routeDigest || exactModelRouteIssues(route.routeSnapshot).length > 0) return false;
  const routeSchema = (route.routeSnapshot as Record<string, unknown>).schema;
  if (requiredRouteSchema && routeSchema !== requiredRouteSchema) return false;
  if (exactModelRouteDigest(route.routeSnapshot) !== route.routeDigest) return false;
  if (!route.enabled
    || route.qualificationStatus !== "EVIDENCE_QUALIFIED"
    || route.admissionStatus !== "PRODUCTION_PILOT_ELIGIBLE") return false;
  if (!route.qualificationSnapshot || !route.qualificationDigest
    || modelRouteQualificationIssues(route.qualificationSnapshot).length > 0) return false;
  const qualification = route.qualificationSnapshot as Record<string, unknown>;
  const qualificationSchema = qualification.schema;
  if (requiredQualificationSchema && qualificationSchema !== requiredQualificationSchema) return false;
  if ((routeSchema === EXACT_MODEL_ROUTE_SCHEMA && qualificationSchema !== MODEL_ROUTE_QUALIFICATION_SCHEMA)
    || (routeSchema === LEGACY_EXACT_MODEL_ROUTE_SCHEMA
      && qualificationSchema !== LEGACY_MODEL_ROUTE_QUALIFICATION_SCHEMA)) return false;
  if (qualification.costPolicy !== undefined) {
    const costPolicy = qualification.costPolicy as Record<string, any>;
    if (modelRouteCostPolicyIssues(costPolicy).length > 0
      || route.costPolicySnapshot === undefined
      || JSON.stringify(route.costPolicySnapshot) !== JSON.stringify(costPolicy)
      || route.costPolicyDigest !== modelRouteCostPolicyDigest(costPolicy)
      || route.estimatedCostPerRunUsd !== costPolicy.estimatedCostPerRunUsd) return false;
  }
  if ((qualification.scope as Record<string, any>)?.riskClasses?.includes("RED")
    && route.riskApproved !== true) return false;
  return qualification.routeDigest === route.routeDigest
    && modelRouteQualificationDigest(route.qualificationSnapshot) === route.qualificationDigest;
}

function qualificationCommonIssues(
  qualification: Record<string, any>,
  schema: typeof MODEL_ROUTE_QUALIFICATION_SCHEMA | typeof LEGACY_MODEL_ROUTE_QUALIFICATION_SCHEMA,
): string[] {
  const issues: string[] = [];
  if (qualification.schema !== schema) issues.push("qualification-schema-invalid");
  if (!sha256Prefixed(qualification.routeDigest)) issues.push("qualification-route-digest-invalid");
  if (!sha256Prefixed(qualification.evidence?.digest)) issues.push("qualification-evidence-digest-invalid");
  if (!boundedIdentity(qualification.evidence?.reference, 1_000)) issues.push("qualification-evidence-reference-invalid");
  if (!boundedEnumArray(qualification.scope?.workloadClasses, 20)) issues.push("qualification-workload-scope-invalid");
  if (!Array.isArray(qualification.scope?.riskClasses)
    || qualification.scope.riskClasses.length < 1
    || new Set(qualification.scope.riskClasses).size !== qualification.scope.riskClasses.length
    || qualification.scope.riskClasses.some((risk: unknown) => risk !== "GREEN" && risk !== "YELLOW" && risk !== "RED")) {
    issues.push("qualification-risk-scope-invalid");
  }
  if (qualification.scope?.repositoryIds !== undefined
    && !boundedIdentityArray(qualification.scope.repositoryIds, 100, 200)) {
    issues.push("qualification-repository-scope-invalid");
  }
  if (qualification.costPolicy !== undefined
    && modelRouteCostPolicyIssues(qualification.costPolicy).length > 0) {
    issues.push("qualification-cost-policy-invalid");
  }
  if (!boundedIdentity(qualification.promotedBy, 200)) issues.push("qualification-promoter-invalid");
  if (!Number.isFinite(qualification.promotedAt)) issues.push("qualification-promotion-time-invalid");
  if (qualification.authority?.executionOnly !== true
    || qualification.authority?.routing !== false
    || qualification.authority?.verification !== false
    || qualification.authority?.acceptance !== false
    || qualification.authority?.publication !== false
    || qualification.authority?.merge !== false) {
    issues.push("qualification-authority-invalid");
  }
  return issues;
}

function executionOnlyAuthority() {
  return {
    executionOnly: true,
    routing: false,
    verification: false,
    acceptance: false,
    publication: false,
    merge: false,
  } as const;
}

function onlyKeys(value: unknown, allowed: readonly string[]): boolean {
  return Boolean(value && typeof value === "object" && !Array.isArray(value))
    && Object.keys(value as Record<string, unknown>).every((key) => allowed.includes(key));
}

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function isSorted(value: unknown[]): boolean {
  return value.every((item, index) => index === 0 || String(value[index - 1]).localeCompare(String(item)) <= 0);
}

function boundedIdentity(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value === value.trim()
    && value.length > 0 && value.length <= maximum && !/[\0\r\n]/.test(value);
}

function sha256Prefixed(value: unknown): value is string {
  return typeof value === "string" && /^sha256:[a-f0-9]{64}$/i.test(value);
}

function sha256Bare(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
}

function boundedEnumArray(value: unknown, maximum: number): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.length <= maximum
    && new Set(value).size === value.length
    && value.every((item) => boundedIdentity(item, 64) && /^[A-Z][A-Z0-9_]{1,63}$/.test(item));
}

function boundedIdentityArray(value: unknown, maximumItems: number, maximumLength: number): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.length <= maximumItems
    && new Set(value).size === value.length
    && value.every((item) => boundedIdentity(item, maximumLength));
}
