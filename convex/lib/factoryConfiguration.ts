export interface FactoryConfigurationInput {
  purpose: "SOFTWARE" | "VERIFICATION" | "INTELLIGENT_AUTOMATION";
  repositoryId: string;
  repositoryDataClassification?: "PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "RESTRICTED";
  workflowId: string;
  executor: { adapter: string; version: string };
  harnessCapabilityManifest: unknown;
  harnessCapabilityManifestDigest: string;
  harnessEffectiveConfigSha256: string;
  modelCatalogId: string;
  modelRouteDigest: string;
  executionBackend: "persistent-worker" | "remote-sandbox";
  sandboxProfileId?: string;
  sandboxProfileDigest?: string;
  codeScopeIds: string[];
  agentBindings: Array<{ workflowAgentId: string; agentVersionId: string }>;
  policyEnvelopeId?: string;
  environmentId?: string;
  budget: { maxCostUsd: number; maxRuntimeMinutes: number; maxAttempts: number };
  verifierIds: string[];
  riskBoundary: "GREEN" | "YELLOW" | "RED";
  recovery: { pause: boolean; cancel: boolean; retry: boolean; resume: boolean };
}

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

export function validFactoryBudget(input: FactoryConfigurationInput["budget"]): boolean {
  return input.maxCostUsd > 0 && input.maxCostUsd <= 1_000 &&
    input.maxRuntimeMinutes > 0 && input.maxRuntimeMinutes <= 480 &&
    Number.isInteger(input.maxAttempts) && input.maxAttempts > 0 && input.maxAttempts <= 3;
}

export function validFactoryExecutorBinding(input: FactoryConfigurationInput["executor"]): boolean {
  return boundedIdentity(input.adapter) && boundedIdentity(input.version);
}

export function validFactoryExecutionBinding(input: Pick<FactoryConfigurationInput,
  "executionBackend" | "sandboxProfileId" | "sandboxProfileDigest" | "riskBoundary" | "recovery"
>): boolean {
  if (input.executionBackend === "persistent-worker") {
    return !input.sandboxProfileId && !input.sandboxProfileDigest;
  }
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
