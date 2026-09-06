import { expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { canonicalHash } from "@mission-control/shared";
import { DockerSandboxProvider } from "../dockerSandboxProvider.js";
import { BedrockSettlementError } from "../bedrockInferenceBridge.js";
import { DOCKER_BEDROCK_CANDIDATE_IDENTITY } from "../dockerBedrockIdentity.js";
import { CodexBedrockExecutorAdapter } from "../codexBedrockExecutorAdapter.js";
import { sandboxProfileDigest } from "../sandboxProvider.js";
import { bedrockProfileFixture } from "./fixtures/bedrockProfileFixture.js";
import { bridgeFixture } from "./fixtures/bedrockBridgeFixture.js";
const processMock = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock("node:child_process", async (original) => ({ ...await original<typeof import("node:child_process")>(), spawn: processMock.spawn }));

it("retains only the durable reference through the real Docker frame failure and diagnostics path", async () => {
  const sourceSha = "a".repeat(40), f = bedrockProfileFixture(sourceSha, "/fixture/repository"), m = f.manifest;
  const manifestDigest = `sha256:${canonicalHash(m)}`, runId = m.causation.workflowRunId;
  const allocation = { provider: "DOCKER" as const, providerResourceId: "b".repeat(64), resourceName: m.sandbox.resourceName, state: "READY" as const, createdAt: Date.now() };
  const reference = { journalId: "8b91a279-6d8a-46d3-b814-c3b861f71731", slot: "0000", observationDigest: `sha256:${"c".repeat(64)}`, state: "PENDING" as const };
  const budget = bridgeFixture();
  const error = new BedrockSettlementError(budget.binding, { reservationId: "reservation", workflowRunId: runId, leaseId: "lease", generation: 1,
    usage: { requestId: "request", requestDigest: `sha256:${"d".repeat(64)}`, provider: "aws-bedrock", model: "model", providerRequestId: "private-provider-id",
      usageId: "private-usage-id", inputTokens: 10, outputTokens: 5, classification: "ACTUAL", expectedReceiptRevision: 0 } }, new Error("private backend error"), reference);
  const bridge = { assertExecutionBinding: vi.fn(), infer: vi.fn().mockRejectedValue(error) };
  const provider = new DockerSandboxProvider(DOCKER_BEDROCK_CANDIDATE_IDENTITY, { createBedrockBridge: () => bridge as never });
  // Replace daemon/process I/O only. The production frame consumer, protocol
  // validation, failure catch, cancellation and diagnostics still execute.
  const owned = provider as unknown as { owned: Map<string, unknown>; assertContainer(): Promise<void>; ownedState(): Promise<unknown> };
  owned.owned.set(allocation.providerResourceId, { allocation, canceled: false, request: { profile: f.profile, attemptId: runId,
    workOrderId: m.causation.workOrderId, sourceSha, manifestDigest, attemptLeaseId: "lease", requestedAt: Date.now() } });
  vi.spyOn(owned, "assertContainer").mockResolvedValue(undefined);
  vi.spyOn(owned, "ownedState").mockResolvedValue({ State: { Running: false } });
  const child = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn() });
  const containerInput: string[] = []; child.stdin.on("data", (chunk) => containerInput.push(String(chunk)));
  processMock.spawn.mockReturnValue(child);
  const root = "/var/lib/mission-control/attempt";
  const executor = new CodexBedrockExecutorAdapter().createRemoteInvocation({ executionId: runId, repositoryRoot: `${root}/repository`, workingDirectory: `${root}/repository`,
    prompt: m.compiledPrompt, allowedPaths: m.repository.allowedPaths, deniedPaths: m.repository.excludedPaths, timeoutMs: m.harness.timeoutMs,
    isolation: m.harness.isolation, provider: m.modelRoute.routeSnapshot.provider, model: m.modelRoute.routeSnapshot.modelId,
    providerRoute: m.modelRoute.routeSnapshot.providerRoute, modelRouteDigest: m.modelRoute.routeDigest }, { repositoryRoot: `${root}/repository`, resultPath: `${root}/executor-result.json` });
  try {
    await provider.start({ allocation, executionManifest: m, profileAdmittedAt: Date.now(), workOrderId: m.causation.workOrderId, workOrderRevisionNumber: 1,
      workflowRunId: runId, attemptId: runId, manifestDigest, sourceSha, profileDigest: sandboxProfileDigest(f.profile),
      environmentDescriptor: { provider: "DOCKER", image: DOCKER_BEDROCK_CANDIDATE_IDENTITY.image }, repositoryArchive: Buffer.from("offline fixture"), supervisorSource: "", executor, environment: {} });
    child.stdout.write(JSON.stringify({ type: "request", sequence: 1, body: { model: "anthropic.claude-sonnet-4-6", input: "private prompt", max_output_tokens: 20 } }) + "\n");
    await vi.waitFor(async () => expect((await provider.fetchDiagnostics(allocation)).accountingReference).toEqual(reference));
    const diagnostics = JSON.stringify(await provider.fetchDiagnostics(allocation));
    expect(diagnostics).not.toMatch(/private-provider-id|private-usage-id|private backend error|settlementPayload/);
    expect(containerInput.join("")).not.toContain(reference.observationDigest);
    expect(containerInput.join("")).not.toContain("private-provider-id");
    expect(await provider.fetchResult(allocation)).toBeNull();
    expect(bridge.infer).toHaveBeenCalledTimes(1);
  } finally { child.emit("close", 1); child.stdin.destroy(); child.stdout.destroy(); child.stderr.destroy(); vi.restoreAllMocks(); }
});
