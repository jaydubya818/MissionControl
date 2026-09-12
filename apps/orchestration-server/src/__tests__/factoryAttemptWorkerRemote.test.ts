import { execFile } from "node:child_process";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { canonicalHash } from "@mission-control/shared";
import { CODEX_V1_HARNESS_MANIFEST, harnessCapabilityManifestDigest } from "@mission-control/workflow-engine";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CodexV1ExecutorAdapter } from "../codexExecutorAdapter.js";
import { assertRemoteCandidateIdentity, FactoryAttemptWorker, type FactoryAttemptWorkerDependencies } from "../factoryAttemptWorker.js";
import { FakeSandboxProvider } from "../fakeSandboxProvider.js";
import { FakeSandboxCredentialBroker } from "../sandboxCredentials.js";
import { createPatchDescriptor, createSandboxResultBundle, encodeSandboxResultBundle } from "../sandboxResultBundle.js";
import { sandboxProfileDigest, stableSandboxResourceName, type SandboxProfileSnapshot } from "../sandboxProvider.js";
import {
  assertFactoryCandidateUnchanged,
  commitFactoryChanges,
  createFactorySourceBundle,
  ensureFactoryWorktree,
  ensureVerificationWorktree,
  inspectCandidateChange,
  listChangedFiles,
  materializeRemoteCandidate,
  pushFactoryBranch,
} from "../factoryGitRuntime.js";
import { executeIndependentVerification } from "../factoryVerification.js";

const execFileAsync = promisify(execFile);
const cleanup: string[] = [];
import { profile, executionManifest } from "./fixtures/remoteWorkerFixture.js";
const fakeImageDigest = `sha256:${"e".repeat(64)}`;
const fakeImage = `fake:test@${fakeImageDigest}`;
let previousServiceSecret: string | undefined;

beforeEach(() => {
  previousServiceSecret = process.env.MISSION_CONTROL_SERVICE_COMMAND_SECRET;
  process.env.MISSION_CONTROL_SERVICE_COMMAND_SECRET = "remote-factory-worker-test-secret";
});

afterEach(async () => {
  if (previousServiceSecret === undefined) delete process.env.MISSION_CONTROL_SERVICE_COMMAND_SECRET;
  else process.env.MISSION_CONTROL_SERVICE_COMMAND_SECRET = previousServiceSecret;
  await Promise.all(cleanup.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("FactoryAttemptWorker remote Sandbox backend", () => {
  it("rejects stale source and wrong candidate SHAs as non-retryable result failures", () => {
    for (const input of [
      { expectedSourceSha: "a".repeat(40), observedSourceSha: "b".repeat(40), expectedCandidateSha: "c".repeat(40), observedCandidateSha: "c".repeat(40), code: "CANDIDATE_SOURCE_SHA_MISMATCH" },
      { expectedSourceSha: "a".repeat(40), observedSourceSha: "a".repeat(40), expectedCandidateSha: "c".repeat(40), observedCandidateSha: "d".repeat(40), code: "CANDIDATE_SHA_MISMATCH" },
    ]) {
      try {
        assertRemoteCandidateIdentity(input);
        throw new Error("Expected candidate identity rejection.");
      } catch (error: any) {
        expect(error.failure).toMatchObject({ class: "NON_RETRYABLE_RESULT", code: input.code, retryable: false });
      }
    }
  });

  it("runs beneath the canonical worker lease, verifies on the host, cleans up, and only then publishes one PR", async () => {
    const checkoutRoot = await mkdtemp(path.join(tmpdir(), "mc-remote-worker-"));
    cleanup.push(checkoutRoot);
    await git(checkoutRoot, ["init", "-b", "main"]);
    await git(checkoutRoot, ["config", "user.name", "Mission Control Test"]);
    await git(checkoutRoot, ["config", "user.email", "factory@example.test"]);
    await git(checkoutRoot, ["remote", "add", "origin", "https://github.com/sellerfi/mission-control-fixture.git"]);
    await mkdir(path.join(checkoutRoot, "src"), { recursive: true });
    await writeFile(path.join(checkoutRoot, "src", "remote.ts"), "export const remote = false;\n");
    await git(checkoutRoot, ["add", "."]);
    await git(checkoutRoot, ["commit", "-m", "Initial fixture"]);
    const sourceSha = (await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: checkoutRoot })).stdout.trim();
    await writeFile(path.join(checkoutRoot, "src", "remote.ts"), "export const remote = true;\n");
    const patchBytes = Buffer.from((await execFileAsync("git", ["diff", "--binary", "--full-index", "HEAD", "--"], { cwd: checkoutRoot, encoding: "buffer" })).stdout);
    await git(checkoutRoot, ["checkout", "--", "src/remote.ts"]);

    const selectedProfile = profile();
    const worktree = path.join(checkoutRoot, ".mission-control", "worktrees", "remote-attempt");
    const manifest = executionManifest(selectedProfile, sourceSha, worktree);
    const manifestDigest = `sha256:${canonicalHash(manifest)}`;
    const resultBundle = createSandboxResultBundle({
      schema: "factory-sandbox-result/v1",
      attemptId: "factory-run-remote",
      workOrderId: "work-order-1",
      workOrderRevisionNumber: 1,
      workflowRunId: "factory-run-remote",
      manifestDigest,
      profileDigest: sandboxProfileDigest(selectedProfile),
      sourceSha,
      supervisorVersion: "mission-control-supervisor/v1",
      harness: {
        adapter: "codex",
        version: "v1",
        harnessId: "codex-cli",
        harnessVersion: "0.146.0",
        provider: "openai",
        model: "gpt-5",
      },
      environment: { provider: selectedProfile.provider, image: selectedProfile.machine.image },
      startedAt: 1,
      finishedAt: 2,
      status: "COMPLETED",
      resultProvenance: {
        source: "OUTPUT_FILE",
        outputFile: { state: "VALID", byteLength: 100 },
        jsonl: { byteLength: 0, lineCount: 0, malformedLineCount: 0, terminalCompletedCount: 0, terminalFailureCount: 0, validCandidateCount: 0 },
        context: { attemptId: "factory-run-remote", manifestDigest, sourceSha },
      },
      structuredResult: {
        schema: "factory-result/v1",
        status: "COMPLETED",
        summary: "Implement the remote sandbox change",
        completedAcceptanceCriterionIds: ["ac-remote"],
        incompleteAcceptanceCriterionIds: [],
        unknownAcceptanceCriterionIds: [],
        verificationCommands: ["node -e verifier"],
        knownRisks: [],
        nextAction: "Review the pull request.",
      },
      changedFiles: ["src/remote.ts"],
      diff: { filesChanged: 1, linesAdded: 1, linesDeleted: 1 },
      commandResults: [{ commandClass: "EXECUTOR", exitCode: 0, durationMs: 1, timedOut: false }],
      verificationInputs: { reportedCommands: ["node -e verifier"] },
      artifacts: [],
      events: [{ type: "RESULT_WRITTEN", occurredAt: 2 }],
      patch: createPatchDescriptor(patchBytes),
      executor: { exitCode: 0, stdoutDigest: "sha256:stdout", stderrDigest: "sha256:stderr", stdoutTail: "", stderrTail: "" },
      usage: { providerCostUsd: 0.01, inferenceCostUsd: 0.03, inputTokens: 10, outputTokens: 5, providerRuntimeMs: 1, observedAt: 2, enforcement: "PROVIDER_REPORTED" },
    });
    const provider = new FakeSandboxProvider({ result: encodeSandboxResultBundle(resultBundle) });
    const credentials = new FakeSandboxCredentialBroker();
    const reports: any[] = [];
    const operationOrder: string[] = [];
    const originalTerminate = provider.terminate.bind(provider);
    provider.terminate = async (allocation) => {
      operationOrder.push("terminate");
      return await originalTerminate(allocation);
    };
    const run = {
      _id: "workflow-run-remote",
      runId: "factory-run-remote",
      projectId: "project-1",
      repositoryId: "repository-1",
      factoryDefinitionVersionId: "factory-version-1",
      executionManifestDigest: manifestDigest,
      executionManifest: manifest,
      executorAdapter: "codex",
      executorVersion: "v1",
      status: "PENDING",
    };
    const claim = {
      claimed: true,
      ...run,
      workflowRunId: run._id,
      workOrderId: "work-order-1",
      checkoutRoot,
      worktree,
      branch: "mc/remote-worker-fixture",
      defaultBranch: "main",
      repository: "sellerfi/mission-control-fixture",
      providerRepositoryId: "101",
      installation: { appId: "202", installationId: "303" },
      executionManifest: manifest,
    };
    let completed = false;
    const client = {
      query: vi.fn(async (_query: unknown, args: any) => args.status === "PENDING" && !completed ? [run] : []),
      action: vi.fn(async (action: string, command: { payloadJson: string }) => {
        const payload = JSON.parse(command.payloadJson);
        if (action === "serviceCommands:listFactorySandboxReconcileCandidates") return [];
        if (action === "serviceCommands:claimFactoryAttempt") {
          return {
            ...claim,
            lease: {
              leaseId: payload.leaseId,
              ownerId: "factory-execution-worker",
              workerId: "worker-remote-1",
              workerSessionId: "session-remote-1",
              workerGeneration: 7,
              claimedAt: Date.now(), heartbeatAt: Date.now(), expiresAt: Date.now() + 60_000,
            },
          };
        }
        if (action === "serviceCommands:renewFactoryAttempt") return { renewed: true };
        if (action === "serviceCommands:authorizeFactoryPublication") {
          operationOrder.push("authorize-publication");
          return { authorized: true, publicationPermitId: "permit-remote", candidateRevision: payload.candidateRevision, validUntil: Date.now() + 600_000 };
        }
        reports.push(payload.packet);
        if (payload.packet?.verification) {
          operationOrder.push("host-verification");
          return { verification: { verdict: "VERIFIED", verdictReasons: ["Host verifier passed."], verificationReceiptId: "receipt-remote" } };
        }
        if (payload.packet?.terminal?.status === "COMPLETED") completed = true;
        return { accepted: true };
      }),
    } as any;
    const createPullRequest = vi.fn(async () => {
      operationOrder.push("create-pr");
      return { number: 73, url: "https://github.com/sellerfi/mission-control-fixture/pull/73", nodeId: "PR_remote", headSha: "", draft: true, reused: false };
    });
    const dependencies: FactoryAttemptWorkerDependencies = {
      ensureFactoryWorktree,
      ensureVerificationWorktree,
      listChangedFiles,
      commitFactoryChanges,
      inspectCandidateChange,
      assertFactoryCandidateUnchanged,
      executeIndependentVerification,
      loadGithubAppPrivateKey: () => "test-private-key",
      getGithubAppId: () => "202",
      mintInstallationToken: async () => ({ token: "installation-token", expiresAt: Date.now() + 600_000 }),
      pushFactoryBranch: (async () => { operationOrder.push("push"); }) as typeof pushFactoryBranch,
      createOrReusePullRequest: createPullRequest,
      createFactorySourceBundle,
      materializeRemoteCandidate,
      createSandboxProvider: () => provider,
      createSandboxCredentialBroker: () => credentials,
    };
    const worker = new FactoryAttemptWorker(
      client,
      new CodexV1ExecutorAdapter(),
      true,
      60_000,
      dependencies,
      { projectId: "project-1", repositoryId: "repository-1" },
      { workerId: "worker-remote-1", sessionId: "session-remote-1", maxConcurrentRuns: 1 },
    );

    await worker.tick();
    await vi.waitFor(
      () => expect(worker.status().completedCount).toBe(1),
      { timeout: 3_000 },
    );

    expect(credentials.active.size).toBe(0);
    expect(provider.inventory()[0].state).toBe("TERMINATED");
    expect(provider.calls.filter((call) => call.startsWith("start:"))).toHaveLength(1);
    expect(operationOrder).toEqual(["host-verification", "terminate", "authorize-publication", "push", "create-pr"]);
    expect(createPullRequest).toHaveBeenCalledOnce();
    const allocationRequest = reports.find((packet) => packet.sandbox?.operation === "REQUESTED")?.sandbox.request;
    expect(allocationRequest).toMatchObject({
      attemptId: "factory-run-remote", workflowRunId: "workflow-run-remote", manifestDigest, sourceSha, profile: selectedProfile,
    });
    const startRequest = provider.startRequest(manifest.sandbox.resourceName);
    expect(startRequest?.workflowRunId).toBe("factory-run-remote");
    expect(Object.keys(startRequest?.environment ?? {}).sort()).toEqual(["OPENAI_API_KEY", "OPENAI_BASE_URL"]);
    expect(JSON.stringify(startRequest)).not.toContain("test-private-key");
    expect(JSON.stringify(startRequest)).not.toContain("MISSION_CONTROL_SERVICE_COMMAND_SECRET");
    expect(reports.flatMap((packet) => packet.events ?? []).map((event) => event.eventType)).toEqual(expect.arrayContaining([
      "SANDBOX_REQUESTED", "SANDBOX_ALLOCATED", "SANDBOX_STARTED", "SANDBOX_RESULT_RECEIVED",
      "SANDBOX_CREDENTIAL_REVOKED", "SANDBOX_TERMINATION_REQUESTED", "SANDBOX_TERMINATED",
    ]));
    expect(JSON.stringify(reports.find((packet) => packet.credential?.operation === "ISSUED"))).not.toContain("fake-attempt-key");
    expect(reports.some((packet) => packet.credential?.operation === "REVOKED")).toBe(true);
    expect(reports.some((packet) => packet.sandbox?.operation === "TERMINATED" && packet.sandbox.receipt.resourceAbsent === true)).toBe(true);
    expect(reports.at(-1)?.terminal).toEqual({ status: "COMPLETED" });
    await expect(access(worktree)).rejects.toMatchObject({ code: "ENOENT" });
    await worker.stop();
  });
});


async function git(cwd: string, args: string[]) {
  await execFileAsync("git", args, { cwd });
}
