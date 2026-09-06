import type { ConvexHttpClient } from "convex/browser";
import type { FactoryAttemptWorkerDependencies } from "./factoryAttemptWorker.js";
import {
  BedrockInferenceBridge,
  canonicalBedrockBridgeAuthority,
} from "./bedrockInferenceBridge.js";
import type { BedrockTransport } from "./bedrockAdapter.js";
import { bedrockRouteSchema, type BedrockRoute } from "./bedrockRoute.js";
import { DockerSandboxProvider } from "./dockerSandboxProvider.js";
import { DOCKER_BEDROCK_CANDIDATE_IDENTITY } from "./dockerBedrockIdentity.js";
import { bedrockModelRouteBinding } from "./bedrockModelRouteBinding.js";

/** Explicit host configuration. IDs select canonical records; they grant no
 * admission. No environment, AWS profile, or credential discovery occurs here. */
export interface BedrockFactoryConfiguration {
  route: BedrockRoute;
  reservationId: string;
  priceDigest: string;
  maximumOutputTokens: number;
  timeoutMs: number;
}
export function bedrockFactoryProviderFactory(
  client: ConvexHttpClient,
  configuration: BedrockFactoryConfiguration,
  transport: BedrockTransport,
): NonNullable<FactoryAttemptWorkerDependencies["createSandboxProvider"]> {
  const config = structuredClone(configuration);
  config.route = bedrockRouteSchema.parse(config.route);
  if (
    !config.reservationId ||
    !/^sha256:[a-f0-9]{64}$/.test(config.priceDigest)
  )
    throw new Error("BEDROCK_CONFIGURATION_REQUIRED");
  return (profile, context) => {
    if (
      profile.provider !== "DOCKER" ||
      profile.providerProfile !== "factory/docker-bedrock/v1" ||
      profile.machine.image !== DOCKER_BEDROCK_CANDIDATE_IDENTITY.image
    )
      throw new Error("BEDROCK_BACKEND_MISMATCH");
    return new DockerSandboxProvider(DOCKER_BEDROCK_CANDIDATE_IDENTITY, {
      createBedrockBridge: () => {
        if (!context) throw new Error("RECOVERY_CANNOT_INVOKE");
        const { claim, manifest, leaseId } = context;
        if (
          claim.attemptPurpose === "VERIFICATION" ||
          manifest.harness.adapter !== "codex" ||
          manifest.harness.version !== "bedrock-v1" ||
          manifest.version !== "factory-execution-manifest/v3" ||
          !manifest.modelRoute ||
          !manifest.executionProfile ||
          !manifest.harness.runtimeArtifactDigest ||
          manifest.modelRoute.routeDigest !==
            bedrockModelRouteBinding(config.route).routeDigest
        )
          throw new Error("BEDROCK_CLAIM_MISMATCH");
        const scope = {
          projectId: String(claim.projectId),
          repositoryId: String(claim.repositoryId),
        };
        return new BedrockInferenceBridge(
          {
            ...scope,
            workflowRunId: String(claim.workflowRunId),
            leaseId,
            generation: claim.lease.workerGeneration,
            reservationId: config.reservationId,
            route: config.route,
            maximumOutputTokens: config.maximumOutputTokens,
            timeoutMs: config.timeoutMs,
            identity: {
              schema: "factory-bedrock-inference/v1",
              workOrderId: String(claim.workOrderId),
              workOrderRevision: manifest.causation.workOrderRevisionNumber,
              executionProfileId: manifest.executionProfile.profileId,
              executionProfileDigest: manifest.executionProfile.profileDigest,
              harnessDigest: manifest.harness.capabilityManifestSha256,
              runtimeDigest: manifest.harness.runtimeArtifactDigest,
              backend: "remote-sandbox",
              modelRouteDigest: manifest.modelRoute.routeDigest,
              priceDigest: config.priceDigest,
              provider: "aws-bedrock",
              model: "anthropic.claude-sonnet-4-6",
              retryGeneration: 0,
            },
          },
          canonicalBedrockBridgeAuthority(client, scope),
          transport,
        );
      },
    });
  };
}

export function selectBedrockFactoryProvider(
  bedrock: NonNullable<
    FactoryAttemptWorkerDependencies["createSandboxProvider"]
  >,
  existing: NonNullable<
    FactoryAttemptWorkerDependencies["createSandboxProvider"]
  >,
): NonNullable<FactoryAttemptWorkerDependencies["createSandboxProvider"]> {
  return (profile, context) =>
    profile.provider === "DOCKER" &&
    profile.providerProfile === "factory/docker-bedrock/v1"
      ? bedrock(profile, context)
      : existing(profile, context);
}
