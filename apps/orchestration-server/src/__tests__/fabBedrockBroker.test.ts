import { afterEach, describe, expect, it, vi } from "vitest";
import { liabilityDigest } from "../../../../convex/lib/providerLiability.js";
import { bedrockModelRouteBinding } from "../bedrockModelRouteBinding.js";
import { createFabBedrockBrokerFactory } from "../fabBedrockBroker.js";

const route = {
  provider: "AWS Bedrock" as const,
  region: "us-east-1" as const,
  modelId: "anthropic.claude-sonnet-4-6" as const,
  foundationModelArn: "arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-sonnet-4-6" as const,
  inferenceProfileId: "us.anthropic.claude-sonnet-4-6" as const,
  inferenceProfileArn: "arn:aws:bedrock:us-east-1:123456789012:inference-profile/us.anthropic.claude-sonnet-4-6",
  topology: "US_GEOGRAPHIC_CROSS_REGION" as const,
  globalInference: false as const,
  allowedDestinationRegions: ["us-east-1", "us-east-2", "us-west-2"],
  awsAccountId: "123456789012",
  projectEnvironmentId: "qualification",
  roleArn: "arn:aws:iam::123456789012:role/qualification",
};
const priceDigest = `sha256:${"a".repeat(64)}`;

afterEach(() => vi.unstubAllEnvs());

function fixture() {
  vi.stubEnv("MISSION_CONTROL_SERVICE_COMMAND_SECRET", "fab-broker-test-secret");
  const order: string[] = [];
  const client = {
    action: vi.fn(async (_reference, args) => {
      order.push("reserve");
      const payload = JSON.parse(args.payloadJson);
      return {
        requestId: payload.requestId,
        requestDigest: payload.requestDigest,
        priceDigest,
        bridgeIdentityDigest: liabilityDigest(payload.bridgeIdentity),
        admittedAt: 100,
        validUntil: Date.now() + 30_000,
      };
    }),
  };
  const transport = {
    evidenceClass: "APPROVED_QUALIFICATION" as const,
    countInputTokens: vi.fn(async () => { order.push("count"); return { inputTokens: 7, requestId: "count-1" }; }),
    send: vi.fn(async () => {
      order.push("send");
      return { requestId: "provider-1", body: {
        model: "anthropic.claude-sonnet-4-6",
        role: "assistant",
        content: [{ type: "text", text: "ok" }],
        stop_reason: "end_turn",
        usage: { input_tokens: 7, output_tokens: 2 },
      } };
    }),
  };
  const accounting = {
    scope: { projectId: "project", repositoryId: "repository" },
    prepare: vi.fn(async () => { order.push("prepare"); return { journalId: "journal", slot: "0000", intentDigest: priceDigest }; }),
    capture: vi.fn(async () => { order.push("capture"); return { journalId: "journal", slot: "0000", observationDigest: priceDigest, state: "PENDING" as const }; }),
    deliver: vi.fn(async () => { order.push("deliver"); return { duplicate: false, incident: false }; }),
  };
  const brokerFactory = createFabBedrockBrokerFactory(client as any, {
    route,
    reservationId: "reservation",
    priceDigest,
    maximumOutputTokens: 16,
    timeoutMs: 10_000,
  }, transport, accounting);
  const context = { emit: vi.fn(), attempt: {
    projectId: "project", repositoryId: "repository", workflowRunId: "attempt",
    workOrderId: "work-order", workOrderRevision: 1, attemptId: "attempt",
    leaseId: "lease", generation: 1, executionProfileId: "profile",
    executionProfileDigest: `sha256:${"b".repeat(64)}`,
    harnessDigest: `sha256:${"c".repeat(64)}`,
    runtimeDigest: `sha256:${"d".repeat(64)}`,
    modelRouteDigest: bedrockModelRouteBinding(route).routeDigest,
    executorIdentity: "worker:session:1", environmentReference: "worktree:attempt",
    sourceRevision: "f".repeat(40), acceptanceCriteria: [], assertActive: vi.fn(async () => {}),
  } };
  const request = {
    requestId: "request-1",
    requestDigest: "e".repeat(64),
    route: {
      accountId: route.awsAccountId, region: route.region, modelId: route.modelId,
      inferenceProfileId: route.inferenceProfileId, inferenceProfileArn: route.inferenceProfileArn,
    },
    credentialReference: "aws:fdlc-qualification:bedrock-sonnet-4-6",
    body: JSON.stringify({ anthropic_version: "bedrock-2023-05-31", max_tokens: 16, messages: [{ role: "user", content: "x" }], tools: [] }),
    maximumOutputTokens: 16,
  };
  return { brokerFactory, context, request, transport, accounting, client, order };
}

describe("Fab Bedrock broker", () => {
  it("counts, journals, reserves, sends, captures, and acknowledges in order", async () => {
    const f = fixture();
    const broker = await f.brokerFactory({ context: f.context as any });
    await expect(broker.invoke(f.request, new AbortController().signal)).resolves.toMatchObject({
      requestDigest: f.request.requestDigest,
      providerRequestId: "provider-1",
      httpStatus: 200,
      attempts: 1,
    });
    expect(f.order).toEqual(["count", "prepare", "reserve", "send", "capture", "deliver"]);
    expect(f.accounting.capture).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      usage: expect.objectContaining({ inputTokens: 7, outputTokens: 2, classification: "ACTUAL" }),
    }));
  });

  it("rejects malformed output bounds before token counting or dispatch", async () => {
    const f = fixture();
    const broker = await f.brokerFactory({ context: f.context as any });
    await expect(broker.invoke({ ...f.request, maximumOutputTokens: 0 }, new AbortController().signal))
      .rejects.toThrow("FAB_BEDROCK_REQUEST_BINDING_INVALID");
    expect(f.transport.countInputTokens).not.toHaveBeenCalled();
    expect(f.transport.send).not.toHaveBeenCalled();
  });
});
