import { offlineSandboxIssues as isolatedSandboxIssues } from "./localQualificationSandbox";

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
  executionBackend: "persistent-worker" | "remote-sandbox" | "isolated-container";
  repositoryDataClassification: unknown;
  sandboxProfileSnapshot?: unknown;
  dataBoundaryCount?: number;
}

export interface RepositoryRemoteExecutionPolicyResult {
  allowed: boolean;
  repositoryDataClassification: RepositoryDataClassification | "UNCLASSIFIED";
  providerEnforcedEgressRequired: boolean;
  providerEnforcedEgressProven: boolean;
  reasonCode?: "PROVIDER_EGRESS_REQUIRED_FOR_SENSITIVE_REPOSITORY" | "PROVIDER_EGRESS_REQUIRED_FOR_SENSITIVE_WORK" | "ISOLATED_PUBLIC_SCOPE_REQUIRED" | "EXECUTION_BACKEND_UNSUPPORTED";
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

  // Initial deterministic admission is limited to public, non-sensitive work.
  // This cannot substitute local isolation for sensitive-data egress authority.
  if (input.executionBackend === "isolated-container") {
    const allowed = repositoryDataClassification === "PUBLIC" && !sensitiveWork
      && isolatedSandboxIssues(input.sandboxProfileSnapshot).length === 0;
    return { allowed, repositoryDataClassification, providerEnforcedEgressRequired,
      providerEnforcedEgressProven: false, ...(allowed ? {} : { reasonCode: "ISOLATED_PUBLIC_SCOPE_REQUIRED" as const }) };
  }
  if (input.executionBackend !== "persistent-worker" && input.executionBackend !== "remote-sandbox") {
    return { allowed: false, repositoryDataClassification, providerEnforcedEgressRequired,
      providerEnforcedEgressProven, reasonCode: "EXECUTION_BACKEND_UNSUPPORTED" };
  }

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
