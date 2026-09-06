import { v } from "convex/values";
import { liabilityDigest } from "./providerLiability";

/** Host-selected binding. The workload cannot select or mutate these fields. */
export const bedrockBridgeIdentityValidator = v.object({
  schema: v.literal("factory-bedrock-inference/v1"),
  workOrderId: v.string(),
  workOrderRevision: v.number(),
  executionProfileId: v.string(),
  executionProfileDigest: v.string(),
  harnessDigest: v.string(),
  runtimeDigest: v.string(),
  backend: v.literal("remote-sandbox"),
  modelRouteDigest: v.string(),
  priceDigest: v.string(),
  provider: v.literal("aws-bedrock"),
  model: v.literal("anthropic.claude-sonnet-4-6"),
  retryGeneration: v.literal(0),
});

export interface BedrockBridgeIdentity {
  schema: "factory-bedrock-inference/v1";
  workOrderId: string;
  workOrderRevision: number;
  executionProfileId: string;
  executionProfileDigest: string;
  harnessDigest: string;
  runtimeDigest: string;
  backend: "remote-sandbox";
  modelRouteDigest: string;
  priceDigest: string;
  provider: "aws-bedrock";
  model: "anthropic.claude-sonnet-4-6";
  retryGeneration: 0;
}

export function assertBedrockBridgeIdentity(
  supplied: BedrockBridgeIdentity | undefined,
  expected: BedrockBridgeIdentity,
  profileSnapshot: any,
) {
  if (
    !supplied ||
    liabilityDigest(supplied) !== liabilityDigest(expected) ||
    profileSnapshot?.harness?.adapter !== "codex" ||
    profileSnapshot?.harness?.version !== "bedrock-v1" ||
    profileSnapshot?.sandboxProfile?.profileSnapshot?.provider !== "DOCKER" ||
    profileSnapshot?.modelRoute?.routeSnapshot?.provider !== "aws-bedrock" ||
    profileSnapshot?.modelRoute?.routeSnapshot?.modelId !== expected.model
  ) {
    throw new Error("BEDROCK_BRIDGE_IDENTITY_MISMATCH");
  }
}
