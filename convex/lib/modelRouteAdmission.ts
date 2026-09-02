import { computeCanonicalHash } from "./genomeHash";

export const EXACT_MODEL_ROUTE_SCHEMA = "factory-model-route/v1" as const;
export const MODEL_ROUTE_QUALIFICATION_SCHEMA = "factory-model-route-qualification/v1" as const;
export const MODEL_ROUTE_COST_POLICY_SCHEMA = "factory-model-route-cost-policy/v1" as const;

export interface ExactModelRouteInput {
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

export function exactModelRouteSnapshot(input: ExactModelRouteInput) {
  const snapshot = {
    schema: EXACT_MODEL_ROUTE_SCHEMA,
    provider: input.provider.trim().toLowerCase(),
    providerRoute: input.providerRoute.trim().toLowerCase(),
    modelId: input.modelId.trim(),
    capabilityIdentity: {
      adapter: input.capabilityIdentity.adapter.trim(),
      version: input.capabilityIdentity.version.trim(),
      capabilityManifestDigest: input.capabilityIdentity.capabilityManifestDigest.trim().toLowerCase(),
      effectiveConfigSha256: input.capabilityIdentity.effectiveConfigSha256.trim().toLowerCase(),
    },
    runtimeIdentity: {
      kind: input.runtimeIdentity.kind,
      cliVersion: input.runtimeIdentity.cliVersion.trim(),
      ...(input.runtimeIdentity.executableSha256
        ? { executableSha256: input.runtimeIdentity.executableSha256.trim().toLowerCase() }
        : {}),
      ...(input.runtimeIdentity.imageDigest
        ? { imageDigest: input.runtimeIdentity.imageDigest.trim().toLowerCase() }
        : {}),
    },
  };
  const issues = exactModelRouteIssues(snapshot);
  if (issues.length) throw new Error(`Exact model route identity is invalid (${issues.join(", ")}).`);
  return snapshot;
}

export function exactModelRouteIssues(input: unknown): string[] {
  if (!input || typeof input !== "object" || Array.isArray(input)) return ["route-snapshot-invalid"];
  const route = input as Record<string, any>;
  const issues: string[] = [];
  if (route.schema !== EXACT_MODEL_ROUTE_SCHEMA) issues.push("route-schema-invalid");
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

export function exactModelRouteDigest(snapshot: unknown) {
  const issues = exactModelRouteIssues(snapshot);
  if (issues.length) throw new Error(`Exact model route identity is invalid (${issues.join(", ")}).`);
  return `sha256:${computeCanonicalHash({ namespace: EXACT_MODEL_ROUTE_SCHEMA, value: snapshot })}`;
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

export function modelRouteProductionEligible(route: {
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
} | null | undefined) {
  if (!route?.routeSnapshot || !route.routeDigest || exactModelRouteIssues(route.routeSnapshot).length) return false;
  if (exactModelRouteDigest(route.routeSnapshot) !== route.routeDigest) return false;
  if (!route.enabled || route.qualificationStatus !== "EVIDENCE_QUALIFIED"
    || route.admissionStatus !== "PRODUCTION_PILOT_ELIGIBLE") return false;
  const qualification = route.qualificationSnapshot as Record<string, any> | undefined;
  if (!qualification || qualification.schema !== MODEL_ROUTE_QUALIFICATION_SCHEMA
    || qualification.routeDigest !== route.routeDigest
    || qualification.authority?.executionOnly !== true
    || qualification.authority?.routing !== false
    || qualification.authority?.verification !== false
    || qualification.authority?.acceptance !== false
    || qualification.authority?.publication !== false
    || qualification.authority?.merge !== false
    || !boundedIdentity(qualification.promotedBy, 200)
    || !Number.isFinite(qualification.promotedAt)
    || !boundedEnumArray(qualification.scope?.workloadClasses, 20)
    || !Array.isArray(qualification.scope?.riskClasses)
    || qualification.scope.riskClasses.length < 1
    || new Set(qualification.scope.riskClasses).size !== qualification.scope.riskClasses.length
    || qualification.scope.riskClasses.some((risk: unknown) => risk !== "GREEN" && risk !== "YELLOW" && risk !== "RED")
    || (qualification.scope?.repositoryIds !== undefined
      && (!boundedIdentityArray(qualification.scope.repositoryIds, 100, 200)))
    || !sha256Prefixed(qualification.evidence?.digest)
    || !boundedIdentity(qualification.evidence?.reference, 1_000)) return false;
  if (qualification.costPolicy !== undefined) {
    if (modelRouteCostPolicyIssues(qualification.costPolicy).length
      || route.costPolicySnapshot === undefined
      || JSON.stringify(route.costPolicySnapshot) !== JSON.stringify(qualification.costPolicy)
      || route.costPolicyDigest !== modelRouteCostPolicyDigest(qualification.costPolicy)
      || route.estimatedCostPerRunUsd !== qualification.costPolicy.estimatedCostPerRunUsd) return false;
  }
  if (qualification.scope.riskClasses.includes("RED") && route.riskApproved !== true) return false;
  return route.qualificationDigest === `sha256:${computeCanonicalHash({
    namespace: MODEL_ROUTE_QUALIFICATION_SCHEMA,
    value: qualification,
  })}`;
}

export function modelRouteQualifiedFor(route: Parameters<typeof modelRouteProductionEligible>[0], input: {
  workloadClass: string;
  riskClass: "GREEN" | "YELLOW" | "RED";
  repositoryId?: string;
}) {
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
