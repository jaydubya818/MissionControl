import { computeCanonicalHash } from "./genomeHash.js";

/** A subordinate material policy, qualified by the existing Execution Profile receipt. */
export const OFFLINE_EXECUTION_POLICY_SCHEMA = "factory-offline-execution-policy/v1" as const;
export const OFFLINE_EXECUTION_PROFILE_SCHEMA = "factory-execution-profile/v2" as const;
export const NO_INFERENCE_CONSTRAINT = Object.freeze({ schema: "factory-inference-constraint/v1", mode: "DENIED" } as const);

export function isNoInferenceConstraint(value: unknown): value is typeof NO_INFERENCE_CONSTRAINT {
  return exact(value, ["schema", "mode"])
    && value.schema === NO_INFERENCE_CONSTRAINT.schema && value.mode === "DENIED";
}

export interface OfflineExecutionPolicy {
  schema: typeof OFFLINE_EXECUTION_POLICY_SCHEMA;
  bridge: { id: string; version: string; implementationDigest: string; invocationSchema: string; resultSchema: string };
  backend: { id: string; version: string; implementationDigest: string; environment: "LOCAL_CONTAINER" };
  isolation: { profileId: string; profileDigest: string; evidenceDigest: string; admissionDigest: string; qualifiedAt: number; validUntil: number };
  transmission: { schema: "factory-transmission-policy/v1"; mode: "DENY_ALL"; destinations: []; credentialClasses: []; maxOutboundBytes: 0 };
  budget: { schema: "factory-provider-budget/v1"; mode: "NO_PROVIDER_EXECUTION"; maxProviderCalls: 0; maxProviderLiabilityUsd: 0 };
  capabilities: ["render-markdown", "synthetic-receipt"] | ["verify-document-bytes"];
}

export function offlinePolicyDigest(value: unknown): string {
  return `sha256:${computeCanonicalHash({ namespace: OFFLINE_EXECUTION_POLICY_SCHEMA, value })}`;
}
function exact(value: unknown, keys: string[]): value is Record<string, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).sort().join(",") === [...keys].sort().join(",");
}
function digest(value: unknown): value is string { return typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value); }
function identity(value: unknown): value is string { return typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,199}$/.test(value); }

export function offlineExecutionPolicyIssues(value: unknown): string[] {
  if (!exact(value, ["schema", "bridge", "backend", "isolation", "transmission", "budget", "capabilities"])) return ["offline-policy-fields-invalid"];
  const issues: string[] = [];
  if (value.schema !== OFFLINE_EXECUTION_POLICY_SCHEMA) issues.push("offline-policy-schema-invalid");
  if (!exact(value.bridge, ["id", "version", "implementationDigest", "invocationSchema", "resultSchema"])
    || ![value.bridge.id, value.bridge.version, value.bridge.invocationSchema, value.bridge.resultSchema].every(identity)
    || !digest(value.bridge.implementationDigest)) issues.push("offline-bridge-invalid");
  if (!exact(value.backend, ["id", "version", "implementationDigest", "environment"])
    || ![value.backend.id, value.backend.version].every(identity) || !digest(value.backend.implementationDigest)
    || value.backend.environment !== "LOCAL_CONTAINER") issues.push("offline-backend-invalid");
  const isolation = value.isolation;
  if (!exact(isolation, ["profileId", "profileDigest", "evidenceDigest", "admissionDigest", "qualifiedAt", "validUntil"])
    || !identity(isolation.profileId) || !digest(isolation.profileDigest) || !digest(isolation.evidenceDigest) || !digest(isolation.admissionDigest)
    || !Number.isSafeInteger(isolation.qualifiedAt) || isolation.qualifiedAt < 0
    || !Number.isSafeInteger(isolation.validUntil) || isolation.validUntil <= isolation.qualifiedAt) issues.push("offline-isolation-invalid");
  if (computeCanonicalHash(value.transmission) !== computeCanonicalHash({ schema: "factory-transmission-policy/v1", mode: "DENY_ALL", destinations: [], credentialClasses: [], maxOutboundBytes: 0 })) issues.push("offline-transmission-invalid");
  if (computeCanonicalHash(value.budget) !== computeCanonicalHash({ schema: "factory-provider-budget/v1", mode: "NO_PROVIDER_EXECUTION", maxProviderCalls: 0, maxProviderLiabilityUsd: 0 })) issues.push("offline-budget-invalid");
  if (![computeCanonicalHash(["render-markdown", "synthetic-receipt"]), computeCanonicalHash(["verify-document-bytes"])]
    .includes(computeCanonicalHash(value.capabilities))) issues.push("offline-capabilities-invalid");
  return issues;
}
