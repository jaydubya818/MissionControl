export const REPOSITORY_DATA_CLASSIFICATIONS = [
  "PUBLIC",
  "INTERNAL",
  "CONFIDENTIAL",
  "RESTRICTED",
] as const;

export type RepositoryDataClassification = typeof REPOSITORY_DATA_CLASSIFICATIONS[number];

export const DEFAULT_REPOSITORY_DATA_CLASSIFICATION: RepositoryDataClassification = "INTERNAL";

export function normalizeRepositoryDataClassification(
  value: unknown,
): RepositoryDataClassification | "UNCLASSIFIED" {
  return REPOSITORY_DATA_CLASSIFICATIONS.includes(value as RepositoryDataClassification)
    ? value as RepositoryDataClassification
    : "UNCLASSIFIED";
}

export function repositoryRequiresProviderEnforcedEgress(value: unknown): boolean {
  return normalizeRepositoryDataClassification(value) !== "PUBLIC";
}

export function sandboxHasProviderEnforcedEgress(snapshot: unknown): boolean {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return false;
  const profile = snapshot as Record<string, any>;
  return profile.readiness?.providerEgressEnforcementProven === true
    && profile.qualification?.providerEgress?.providerEnforced === true
    && profile.security?.network?.providerEnforced === true;
}

export interface RepositoryRemoteExecutionPolicyInput {
  executionBackend: "persistent-worker" | "remote-sandbox";
  repositoryDataClassification: unknown;
  sandboxProfileSnapshot?: unknown;
  dataBoundaryCount?: number;
}

export interface RepositoryRemoteExecutionPolicyResult {
  allowed: boolean;
  repositoryDataClassification: RepositoryDataClassification | "UNCLASSIFIED";
  providerEnforcedEgressRequired: boolean;
  providerEnforcedEgressProven: boolean;
  reasonCode?: "PROVIDER_EGRESS_REQUIRED_FOR_SENSITIVE_REPOSITORY" | "PROVIDER_EGRESS_REQUIRED_FOR_SENSITIVE_WORK";
}

/**
 * Local execution remains eligible under the governed worker boundary. Remote
 * execution fails closed for every unclassified or non-public repository and
 * for a public repository when the WorkOrder declares a sensitive data boundary.
 */
export function evaluateRepositoryRemoteExecutionPolicy(
  input: RepositoryRemoteExecutionPolicyInput,
): RepositoryRemoteExecutionPolicyResult {
  const repositoryDataClassification = normalizeRepositoryDataClassification(
    input.repositoryDataClassification,
  );
  const sensitiveRepository = repositoryRequiresProviderEnforcedEgress(
    repositoryDataClassification,
  );
  const sensitiveWork = (input.dataBoundaryCount ?? 0) > 0;
  const providerEnforcedEgressRequired = sensitiveRepository || sensitiveWork;
  const providerEnforcedEgressProven = sandboxHasProviderEnforcedEgress(
    input.sandboxProfileSnapshot,
  );

  if (
    input.executionBackend === "remote-sandbox"
    && providerEnforcedEgressRequired
    && !providerEnforcedEgressProven
  ) {
    return {
      allowed: false,
      repositoryDataClassification,
      providerEnforcedEgressRequired,
      providerEnforcedEgressProven,
      reasonCode: sensitiveRepository
        ? "PROVIDER_EGRESS_REQUIRED_FOR_SENSITIVE_REPOSITORY"
        : "PROVIDER_EGRESS_REQUIRED_FOR_SENSITIVE_WORK",
    };
  }

  return {
    allowed: true,
    repositoryDataClassification,
    providerEnforcedEgressRequired,
    providerEnforcedEgressProven,
  };
}
