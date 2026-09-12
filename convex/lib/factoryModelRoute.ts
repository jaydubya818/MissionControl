import type {
  HarnessCapabilityManifest,
  HarnessRuntimeArtifactIdentity,
} from "@mission-control/workflow-engine/harness-contract";
import { harnessSupportsModel } from "@mission-control/workflow-engine/harness-contract";
import {
  EXACT_MODEL_ROUTE_SCHEMA,
  LEGACY_EXACT_MODEL_ROUTE_SCHEMA,
  exactModelRouteDigest,
  frozenLegacyModelRouteEligibleForExecution,
  modelRouteEligibleForNewFactoryVersion,
  modelRouteProductionEligible,
  modelRouteQualifiedFor,
  modelRouteQualificationDigest,
  type ModelRouteExecutionBackend,
  type ModelRouteExecutionCompatibilityBindingInput,
  type ModelRouteRiskClass,
} from "./modelRouteAdmission";

export interface FactoryWorkflowModelRoute {
  provider: string;
  modelId: string;
  temperature?: number;
  maxTokens?: number;
}

interface ExecutableWorkflowModelRoute extends FactoryWorkflowModelRoute {
  providerIsCanonical: boolean;
}

interface FactoryModelRouteIdentity {
  schema?: string;
  provider: string;
  modelId: string;
  reasoningConfig?: {
    temperature?: number;
    maxTokens?: number;
  };
}

export interface FrozenFactoryHarnessIdentity {
  adapter: string;
  version: string;
  capabilityManifestSha256: string;
  effectiveConfigSha256: string;
  runtimeArtifact: HarnessRuntimeArtifactIdentity;
  runtimeArtifactSha256: string;
}

export function factoryModelRouteCompatibility(input: {
  harness: FrozenFactoryHarnessIdentity;
  executionBackend: ModelRouteExecutionBackend;
}) {
  return {
    adapter: input.harness.adapter,
    version: input.harness.version,
    capabilityManifestDigest: input.harness.capabilityManifestSha256,
    effectiveConfigSha256: input.harness.effectiveConfigSha256,
    runtimeArtifactDigest: input.harness.runtimeArtifactSha256,
    executionBackend: input.executionBackend,
  };
}

/** Version-aware route admission for an already-frozen Factory Version.
 * V2 qualification binds the independently owned identities. V1 remains an
 * exact compatibility path and can never authorize creation of a new version. */
export function frozenFactoryModelRouteEligible(input: {
  route: {
    routeSnapshot?: unknown;
    routeDigest?: string;
    enabled?: boolean;
    qualificationStatus?: string;
    admissionStatus?: string;
    qualificationSnapshot?: unknown;
    qualificationDigest?: string;
  } | null | undefined;
  version: {
    modelRouteSnapshot?: unknown;
    modelRouteDigest?: string;
    modelQualificationSnapshot?: unknown;
    modelQualificationDigest?: string;
  };
  harness: FrozenFactoryHarnessIdentity;
  executionBackend: ModelRouteExecutionBackend;
}) {
  const { route, version } = input;
  if (!route?.routeSnapshot || !route.routeDigest || !route.qualificationSnapshot
    || !route.qualificationDigest || !version.modelRouteSnapshot
    || !version.modelRouteDigest || !version.modelQualificationSnapshot
    || !version.modelQualificationDigest
    || route.routeDigest !== version.modelRouteDigest
    || route.qualificationDigest !== version.modelQualificationDigest) {
    return false;
  }
  try {
    if (exactModelRouteDigest(route.routeSnapshot) !== route.routeDigest
      || exactModelRouteDigest(version.modelRouteSnapshot) !== version.modelRouteDigest
      || modelRouteQualificationDigest(route.qualificationSnapshot) !== route.qualificationDigest
      || modelRouteQualificationDigest(version.modelQualificationSnapshot) !== version.modelQualificationDigest) {
      return false;
    }
  } catch {
    return false;
  }
  const routeSchema = (route.routeSnapshot as Record<string, unknown>).schema;
  const frozenSchema = (version.modelRouteSnapshot as Record<string, unknown>).schema;
  if (routeSchema !== frozenSchema) return false;
  if (routeSchema === EXACT_MODEL_ROUTE_SCHEMA) {
    return modelRouteEligibleForNewFactoryVersion(
      route,
      factoryModelRouteCompatibility(input),
    );
  }
  if (routeSchema !== LEGACY_EXACT_MODEL_ROUTE_SCHEMA) return false;
  return frozenLegacyModelRouteEligibleForExecution(route, {
    adapter: input.harness.adapter,
    version: input.harness.version,
    capabilityManifestDigest: input.harness.capabilityManifestSha256,
    effectiveConfigSha256: input.harness.effectiveConfigSha256,
    executionBackend: input.executionBackend,
    ...(input.harness.runtimeArtifact.executableSha256
      ? { executableSha256: input.harness.runtimeArtifact.executableSha256 }
      : {}),
    ...(input.harness.runtimeArtifact.imageDigest
      ? { imageDigest: input.harness.runtimeArtifact.imageDigest }
      : {}),
  });
}

export function resolveFactoryWorkflowModelRoute(input: {
  workflow: { steps?: Array<{ id?: string; agent?: string; kind?: string }> } | null | undefined;
  agentBindings: Array<{ workflowAgentId: string }>;
  agentVersions: Array<{ genome?: { modelConfig?: FactoryWorkflowModelRoute } } | { model?: FactoryWorkflowModelRoute } | null | undefined>;
}): FactoryWorkflowModelRoute {
  const routes = executableWorkflowModelRoutes(input);
  const selected = routes[0];
  if (routes.some((route) => route.provider !== selected.provider || route.modelId !== selected.modelId)) {
    throw new Error("Every executable workflow role must use the same exact model route.");
  }
  return { provider: selected.provider, modelId: selected.modelId };
}

/** V2 reasoning controls are part of inference identity, so every executable
 * Agent Version must agree with the route's temperature/token settings. The
 * historical V1 route never froze those fields and retains its original exact
 * provider/model comparison instead of inventing new legacy identity. */
export function factoryWorkflowModelRouteMatches(
  input: Parameters<typeof resolveFactoryWorkflowModelRoute>[0],
  expected: FactoryModelRouteIdentity,
) {
  try {
    const candidates = executableWorkflowModelRoutes(input);
    if (expected.schema !== LEGACY_EXACT_MODEL_ROUTE_SCHEMA
      && candidates.some((candidate) => !candidate.providerIsCanonical)) {
      return false;
    }
    const route = resolveFactoryWorkflowModelRoute(input);
    if (route.provider !== expected.provider.trim().toLowerCase()
      || route.modelId !== expected.modelId.trim()) {
      return false;
    }
    if (expected.schema === LEGACY_EXACT_MODEL_ROUTE_SCHEMA) return true;
    const expectedTemperature = expected.reasoningConfig?.temperature;
    const expectedMaxTokens = expected.reasoningConfig?.maxTokens;
    return candidates.every((candidate) => (
      candidate.temperature === expectedTemperature
      && candidate.maxTokens === expectedMaxTokens
    ));
  } catch {
    return false;
  }
}

export function matchingFactoryModelRouteQualifications<T extends ModelRouteAdmissionCandidate>(input: {
  routes: T[];
  selectedCatalogId?: string;
  workflow: Parameters<typeof resolveFactoryWorkflowModelRoute>[0];
  compatibility: ModelRouteExecutionCompatibilityBindingInput;
  riskClass: ModelRouteRiskClass;
  workloadClass: string;
  repositoryId?: string;
}): T[] {
  return input.routes.filter((route) =>
    (!input.selectedCatalogId || String(route._id) === input.selectedCatalogId)
    && !route.deprecated
    && (route.routeSnapshot as Record<string, unknown> | undefined)?.schema === EXACT_MODEL_ROUTE_SCHEMA
    && factoryWorkflowModelRouteMatches(input.workflow, route.routeSnapshot as FactoryModelRouteIdentity)
    && modelRouteEligibleForNewFactoryVersion(route, input.compatibility)
    && modelRouteQualifiedFor(route, {
      riskClass: input.riskClass,
      workloadClass: input.workloadClass,
      repositoryId: input.repositoryId,
    })
  );
}

/** Mission planning is execution by the active Factory Version, not a second
 * composition point. Resolve only the catalog row frozen by that version and
 * then prove its exact route, qualification, harness, runtime, backend, and
 * planning scope. A sibling row can never act as a fallback. */
export function selectFrozenFactoryPlanningModelRoute<T extends PlanningModelRouteCandidate>(input: {
  routes: T[];
  selectedCatalogId: string;
  projectId: string;
  version: Parameters<typeof frozenFactoryModelRouteEligible>[0]["version"];
  harness: FrozenFactoryHarnessIdentity & { capabilityManifest: HarnessCapabilityManifest };
  executionBackend: ModelRouteExecutionBackend;
  repositoryId: string;
}): T | null {
  if (input.executionBackend !== "persistent-worker") return null;
  const route = input.routes.find((candidate) => String(candidate._id) === input.selectedCatalogId);
  const routeSnapshot = route?.routeSnapshot as Record<string, unknown> | undefined;
  if (!route
    || (route.projectId !== undefined && String(route.projectId) !== input.projectId)
    || routeSnapshot?.provider !== route.provider
    || routeSnapshot?.modelId !== route.modelId
    || !harnessSupportsModel(input.harness.capabilityManifest, route.provider, route.modelId)
    || !modelRouteQualifiedFor(route, {
      workloadClass: "MISSION_PLANNING",
      riskClass: "YELLOW",
      repositoryId: input.repositoryId,
    })
    || !frozenFactoryModelRouteEligible({
      route,
      version: input.version,
      harness: input.harness,
      executionBackend: input.executionBackend,
    })) {
    return null;
  }
  return route;
}

/** Version composition must expose every promoted V2 qualification instance.
 * Generic model routing deliberately collapses sibling rows by modelId, while
 * Factory creation disambiguates immutable qualifications by modelCatalogId. */
export function factoryVersionModelRouteOptions<T extends ModelRouteAdmissionCandidate>(
  routes: T[],
): T[] {
  return routes.filter((route) =>
    !route.deprecated
    && (route.routeSnapshot as Record<string, unknown> | undefined)?.schema === EXACT_MODEL_ROUTE_SCHEMA
    && modelRouteProductionEligible(route)
  );
}

interface ModelRouteAdmissionCandidate {
  _id: unknown;
  deprecated?: boolean;
  routeSnapshot?: unknown;
  routeDigest?: string;
  enabled?: boolean;
  qualificationStatus?: string;
  admissionStatus?: string;
  qualificationSnapshot?: unknown;
  qualificationDigest?: string;
}

interface PlanningModelRouteCandidate extends ModelRouteAdmissionCandidate {
  provider: string;
  modelId: string;
  projectId?: unknown;
}

function executableWorkflowModelRoutes(
  input: Parameters<typeof resolveFactoryWorkflowModelRoute>[0],
): ExecutableWorkflowModelRoute[] {
  const executableSteps = (input.workflow?.steps ?? []).filter((step) => step.kind !== "GATE");
  if (executableSteps.length === 0) {
    throw new Error("Factory workflow requires at least one executable model role.");
  }
  const versionsByAgent = new Map(input.agentBindings.map((binding, index) => [
    binding.workflowAgentId,
    input.agentVersions[index],
  ]));
  return executableSteps.map((step) => {
    const version = versionsByAgent.get(step.agent ?? "");
    const route = version && "genome" in version
      ? version.genome?.modelConfig
      : version && "model" in version
        ? version.model
        : undefined;
    if (!route || !boundedIdentity(route.provider, 100) || !boundedIdentity(route.modelId, 200)) {
      throw new Error(`Executable workflow role ${step.id ?? "unknown-step"} is missing an exact model route.`);
    }
    return {
      provider: route.provider.trim().toLowerCase(),
      providerIsCanonical: route.provider === route.provider.toLowerCase(),
      modelId: route.modelId.trim(),
      ...(route.temperature !== undefined ? { temperature: route.temperature } : {}),
      ...(route.maxTokens !== undefined ? { maxTokens: route.maxTokens } : {}),
    };
  });
}

function boundedIdentity(value: unknown, maximum: number): value is string {
  return typeof value === "string"
    && value === value.trim()
    && value.length > 0
    && value.length <= maximum
    && !/[\0\r\n]/.test(value);
}
