import { v } from "convex/values";

const common = {
  factoryDefinitionVersionId: v.id("factoryDefinitionVersions"),
  factoryConfigurationDigest: v.string(),
  adapter: v.string(), version: v.string(),
  capabilityManifestSha256: v.string(), effectiveConfigSha256: v.string(),
  repositoryId: v.id("workspaceRepositories"),
};

/** Both storage and reporting use the same shape. Registration additionally
 * checks exact canonical Factory identity and registered executor artifacts. */
export const factoryWorkerVersionBindingValidator = v.union(
  v.object({ ...common, provider: v.string(), model: v.string(), modelRouteDigest: v.string(),
    executionBackend: v.string(), runtimeArtifactSha256: v.optional(v.string()), sandboxProfileDigest: v.optional(v.string()) }),
  v.object({ ...common, executionBackend: v.literal("isolated-container"),
    inferenceConstraint: v.object({ schema: v.literal("factory-inference-constraint/v1"), mode: v.literal("DENIED") }),
    runtimeArtifactSha256: v.string(), sandboxProfileDigest: v.string() }),
);
