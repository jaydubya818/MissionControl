import type { RenderMarkdownWorkload, VerifyDocumentTemplate } from "@mission-control/workflow-engine/harness-contract";
import { executionProfileCurrentnessIssues, executionProfilePersistedRecordBlockers, executionProfileProjectionBlockers,
  type ExecutionProfileProjection } from "./executionProfile";
import { deterministicFactoryOperation } from "./factoryWorkflowContract";
import { computeCanonicalHash } from "./genomeHash";

interface FactoryConfigurationCommon {
  purpose: "SOFTWARE" | "VERIFICATION" | "INTELLIGENT_AUTOMATION";
  repositoryId: string;
  repositoryMode?: "LOCAL_SYNTHETIC_QUALIFICATION";
  repositoryAdmissionDigest?: string;
  repositoryDataClassification?: "PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "RESTRICTED";
  workflowId: string;
  executor: { adapter: string; version: string };
  harnessCapabilityManifest: unknown;
  harnessCapabilityManifestDigest: string;
  harnessEffectiveConfigSha256: string;
  harnessRuntimeArtifact: unknown;
  harnessRuntimeArtifactDigest: string;
  executionProfileId?: string;
  executionProfileVersion?: number;
  executionProfileDigest?: string;
  executionProfileQualificationDigest?: string;
  sandboxProfileId?: string;
  sandboxProfileDigest?: string;
  codeScopeIds: string[];
  agentBindings: Array<{ workflowAgentId: string; agentVersionId: string }>;
  policyEnvelopeId?: string;
  environmentId?: string;
  qualificationEnvironmentDigest?: string;
  budget: { maxCostUsd: number; maxRuntimeMinutes: number; maxAttempts: number };
  verifierIds: string[];
  riskBoundary: "GREEN" | "YELLOW" | "RED";
  recovery: { pause: boolean; cancel: boolean; retry: boolean; resume: boolean };
}

/** Historical inference configurations retain mandatory exact model identities.
 * The separate, explicit offline shape cannot carry inference authority. This
 * type does not admit execution; live profile and canonical gates still apply. */
export type FactoryConfigurationInput = FactoryConfigurationCommon & (
  | {
      executionBackend: "persistent-worker" | "remote-sandbox";
      modelCatalogId: string;
      modelRouteDigest: string;
      inferenceConstraint?: never;
      deterministicOperation?: never;
    }
  | {
      executionBackend: "isolated-container";
      modelCatalogId?: never;
      modelRouteDigest?: never;
      inferenceConstraint: { schema: "factory-inference-constraint/v1"; mode: "DENIED" };
      deterministicOperation: RenderMarkdownWorkload | VerifyDocumentTemplate;
      purpose: "SOFTWARE" | "VERIFICATION";
      riskBoundary: "GREEN";
      agentBindings: [];
      executionProfileId: string;
      executionProfileVersion: number;
      executionProfileDigest: string;
      executionProfileQualificationDigest: string;
      sandboxProfileId: string;
      sandboxProfileDigest: string;
    }
);

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stable(item)])
    );
  }
  return value;
}

export function factoryConfigurationDigest(input: FactoryConfigurationInput): string {
  const serialized = JSON.stringify(stable({
    ...input,
    codeScopeIds: [...input.codeScopeIds].sort(),
    agentBindings: [...input.agentBindings].sort((left, right) =>
      left.workflowAgentId.localeCompare(right.workflowAgentId)
      || left.agentVersionId.localeCompare(right.agentVersionId)
    ),
    verifierIds: [...input.verifierIds].sort(),
  }));
  let hash = 0x811c9dc5;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `factory-v1-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

/** Reconstruct only the immutable configuration fields, excluding row metadata. */
export function factoryVersionConfigurationDigest(version: any): string {
  const keys = ["purpose", "repositoryId", "repositoryMode", "repositoryAdmissionDigest", "repositoryDataClassification", "workflowId", "executor",
    "harnessCapabilityManifest", "harnessCapabilityManifestDigest", "harnessEffectiveConfigSha256",
    "harnessRuntimeArtifact", "harnessRuntimeArtifactDigest", "executionProfileId", "executionProfileVersion",
    "executionProfileDigest", "executionProfileQualificationDigest", "sandboxProfileId", "sandboxProfileDigest",
    "codeScopeIds", "agentBindings", "policyEnvelopeId", "environmentId", "qualificationEnvironmentDigest",
    "budget", "verifierIds", "riskBoundary", "recovery", "executionBackend"];
  const configuration = Object.fromEntries(keys.map(key => [key, version[key]]));
  if (version.executionBackend === "isolated-container") {
    configuration.inferenceConstraint = version.inferenceConstraint;
    configuration.deterministicOperation = version.deterministicOperation;
  } else {
    configuration.modelCatalogId = version.modelCatalogId;
    configuration.modelRouteDigest = version.modelRouteDigest;
  }
  return factoryConfigurationDigest(configuration as FactoryConfigurationInput);
}

export function validFactoryBudget(input: FactoryConfigurationInput["budget"]): boolean {
  return input.maxCostUsd > 0 && input.maxCostUsd <= 1_000 &&
    input.maxRuntimeMinutes > 0 && input.maxRuntimeMinutes <= 480 &&
    Number.isInteger(input.maxAttempts) && input.maxAttempts > 0 && input.maxAttempts <= 3;
}

export function validFactoryExecutorBinding(input: FactoryConfigurationInput["executor"]): boolean {
  return boundedIdentity(input.adapter) && boundedIdentity(input.version);
}

export function validFactoryExecutionProfileBinding(input: Pick<FactoryConfigurationInput,
  "executionProfileId" | "executionProfileVersion" | "executionProfileDigest" | "executionProfileQualificationDigest"
>): boolean {
  const values = [
    input.executionProfileId,
    input.executionProfileVersion,
    input.executionProfileDigest,
    input.executionProfileQualificationDigest,
  ];
  if (values.every((value) => value === undefined)) return true;
  return boundedIdentity(input.executionProfileId ?? "")
    && Number.isSafeInteger(input.executionProfileVersion)
    && input.executionProfileVersion! > 0
    && /^sha256:[a-f0-9]{64}$/i.test(input.executionProfileDigest ?? "")
    && /^sha256:[a-f0-9]{64}$/i.test(input.executionProfileQualificationDigest ?? "");
}

export function validFactoryExecutionBinding(input: Pick<FactoryConfigurationInput,
  "executionBackend" | "sandboxProfileId" | "sandboxProfileDigest" | "riskBoundary" | "recovery"
> & { offlineAdmission?: {
  profile: NonNullable<Parameters<typeof executionProfileCurrentnessIssues>[0]["profile"]> & { projectId?: unknown; tenantId?: unknown };
  sandboxProfile: (NonNullable<Parameters<typeof executionProfileCurrentnessIssues>[0]["sandboxProfile"]> & { projectId?: unknown; tenantId?: unknown }) | null | undefined;
  projection: ExecutionProfileProjection;
  workflow: unknown;
  repositoryDataClassification: string;
  now: number;
  projectId: string; tenantId: string; purpose: string; agentBindings: unknown[]; deterministicOperation: unknown;
} }): boolean {
  if (input.executionBackend === "persistent-worker") {
    return !input.sandboxProfileId && !input.sandboxProfileDigest;
  }
  if (input.executionBackend === "isolated-container") {
    const admission = input.offlineAdmission;
    if (!admission || !Number.isFinite(admission.now) || admission.repositoryDataClassification !== "PUBLIC"
      || input.riskBoundary !== "GREEN" || !input.recovery.cancel || !input.recovery.retry
      || input.recovery.pause || input.recovery.resume) return false;
    const { profile, projection, sandboxProfile, now } = admission;
    try {
      const qualification = profile.qualificationSnapshot as any;
      if (projection.executionBackend !== "isolated-container" || profile.executionBackend !== "isolated-container"
        || !admission.projectId || !admission.tenantId
        || profile.projectId !== admission.projectId || profile.tenantId !== admission.tenantId
        || sandboxProfile?.projectId !== admission.projectId || sandboxProfile?.tenantId !== admission.tenantId
        || !qualification?.scope?.workloadClasses?.includes("SOFTWARE_CHANGE") || !qualification.scope.riskClasses?.includes("GREEN")
        || input.sandboxProfileId !== projection.sandboxProfileId || input.sandboxProfileDigest !== projection.sandboxProfileDigest
        || executionProfileCurrentnessIssues({ profile, sandboxProfile, modelRoute: null, now }).length
        || executionProfilePersistedRecordBlockers(profile).length
        || executionProfileProjectionBlockers({ profileId: String(profile._id), profileSnapshot: profile.immutableSnapshot,
          profileDigest: profile.profileDigest!, qualificationSnapshot: profile.qualificationSnapshot!,
          qualificationDigest: profile.qualificationDigest!, projection }).length) return false;
      const operation = deterministicFactoryOperation({ workflow: admission.workflow, profileSnapshot: profile.immutableSnapshot,
        purpose: admission.purpose, riskBoundary: input.riskBoundary, agentBindings: admission.agentBindings });
      return computeCanonicalHash(operation) === computeCanonicalHash(admission.deterministicOperation);
    } catch { return false; }
  }
  if (input.executionBackend !== "remote-sandbox") return false;
  return Boolean(input.sandboxProfileId && input.sandboxProfileDigest)
    && input.riskBoundary !== "RED"
    && input.recovery.cancel
    && input.recovery.retry
    && !input.recovery.pause
    && !input.recovery.resume;
}

function boundedIdentity(value: string): boolean {
  return value === value.trim()
    && value.length > 0
    && value.length <= 100
    && !/[\0\r\n]/.test(value);
}
