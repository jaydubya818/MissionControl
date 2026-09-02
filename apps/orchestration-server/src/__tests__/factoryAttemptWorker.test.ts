import { execFile } from "node:child_process";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CodexV1ExecutorAdapter } from "../codexExecutorAdapter.js";
import {
  FACTORY_ATTEMPT_LEASE_DURATION_MS,
  FactoryAttemptWorker,
  factoryRunQueryArgs,
  matchesWorkerScope,
  type FactoryAttemptWorkerDependencies,
} from "../factoryAttemptWorker.js";
import {
  assertFactoryCandidateUnchanged,
  commitFactoryChanges,
  ensureFactoryWorktree,
  ensureVerificationWorktree,
  inspectCandidateChange,
  listChangedFiles,
  pushFactoryBranch,
} from "../factoryGitRuntime.js";
import { executeIndependentVerification } from "../factoryVerification.js";
import { canonicalHash } from "@mission-control/shared";
import { CODEX_V1_HARNESS_MANIFEST, harnessCapabilityManifestDigest } from "@mission-control/workflow-engine";

const execFileAsync = promisify(execFile);
const cleanup: string[] = [];
let previousServiceSecret: string | undefined;

beforeEach(() => {
  previousServiceSecret = process.env.MISSION_CONTROL_SERVICE_COMMAND_SECRET;
  process.env.MISSION_CONTROL_SERVICE_COMMAND_SECRET = "verification-first-worker-test-secret";
});

afterEach(async () => {
  if (previousServiceSecret === undefined) delete process.env.MISSION_CONTROL_SERVICE_COMMAND_SECRET;
  else process.env.MISSION_CONTROL_SERVICE_COMMAND_SECRET = previousServiceSecret;
  await Promise.all(cleanup.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("FactoryAttemptWorker verification-first lifecycle", () => {
  it("keeps the renewable Attempt lease beyond the publication safety window", () => {
    expect(FACTORY_ATTEMPT_LEASE_DURATION_MS).toBe(120_000);
    expect(FACTORY_ATTEMPT_LEASE_DURATION_MS).toBeGreaterThan(60_000);
  });

  it("claims only the repository bound by the documented durable-worker configuration", () => {
    const scope = { projectId: "project-1", repositoryId: "repository-1" };
    expect(matchesWorkerScope({ projectId: "project-1", repositoryId: "repository-1" }, scope)).toBe(true);
    expect(matchesWorkerScope({ projectId: "project-1", repositoryId: "repository-other" }, scope)).toBe(false);
    expect(matchesWorkerScope({ projectId: "project-other", repositoryId: "repository-1" }, scope)).toBe(false);
    expect(factoryRunQueryArgs("PENDING", scope)).toEqual({
      status: "PENDING",
      limit: 100,
      projectId: "project-1",
      repositoryId: "repository-1",
    });
  });

  it("does not claim or fall back when the frozen harness identity is unsupported", async () => {
    const unsupported = {
      _id: "workflow-run-unsupported",
      runId: "factory-run-unsupported",
      projectId: "project-1",
      repositoryId: "repository-1",
      factoryDefinitionVersionId: "factory-version-1",
      executionManifestDigest: "sha256:manifest",
      executorAdapter: "loom",
      executorVersion: "v1",
      executionManifest: { harness: { adapter: "loom", version: "v1", executionBackend: "persistent-worker" } },
      status: "PENDING",
    };
    const client = {
      query: vi.fn(async (_query: unknown, args: any) => args.status === "PENDING" ? [unsupported] : []),
      action: vi.fn(),
    } as any;
    const worker = new FactoryAttemptWorker(
      client,
      new CodexV1ExecutorAdapter("codex-fixture", vi.fn() as any),
      true,
      60_000,
    );

    await worker.tick();

    expect(client.action).not.toHaveBeenCalled();
    expect(worker.status().activeRunIds).toEqual([]);
    await worker.stop();
  });

  it("turns governed issue intent into a verified, evidence-linked pull request", async () => {
    const fixture = await runFixture("VERIFIED");

    await vi.waitFor(
      () =>
        expect(fixture.worker.status()).toEqual(
          expect.objectContaining({ completedCount: 1, lastError: null }),
        ),
      { timeout: 3_000 },
    );

    expect(fixture.createPullRequest).toHaveBeenCalledOnce();
    const pullRequestInput = fixture.createPullRequest.mock.calls[0][0];
    expect(pullRequestInput.body).toContain("Verdict: **VERIFIED**");
    expect(pullRequestInput.body).toContain("Receipt: `receipt-1`");
    expect(fixture.reports.find((packet) => packet.verification)?.verification).toMatchObject({
      verdict: "VERIFIED",
      candidateRevision: expect.any(String),
      sourceRevision: expect.any(String),
    });
    const observations = fixture.reports.flatMap((packet) => packet.observations ?? []);
    expect(observations).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "AGENT", provider: "openai", status: "SUCCESS" }),
      expect.objectContaining({ type: "GENERATION", provider: "openai", status: "SUCCESS" }),
    ]));
    const pullRequestArtifact = fixture.reports.at(-1)?.artifacts?.find((artifact: any) => artifact.artifactType === "PULL_REQUEST");
    expect(pullRequestArtifact?.metadata).toMatchObject({
      sourceRevision: expect.stringMatching(/^[a-f0-9]{40}$/),
      headSha: expect.stringMatching(/^[a-f0-9]{40}$/),
      changedFiles: ["src/feature.ts"],
    });
    expect(fixture.reports.at(-1)?.terminal).toEqual({ status: "COMPLETED" });
    await fixture.worker.stop();
  });

  it("completes a non-mutating candidate as durable evidence without provider publication", async () => {
    const fixture = await runFixture("VERIFIED", {
      isMutating: false,
      noVerificationContract: true,
    });

    await vi.waitFor(() => expect(fixture.worker.status()).toMatchObject({ completedCount: 1, failedCount: 0 }));

    expect(fixture.authorizePublication).not.toHaveBeenCalled();
    expect(fixture.pushFactoryBranch).not.toHaveBeenCalled();
    expect(fixture.createPullRequest).not.toHaveBeenCalled();
    expect(fixture.executeVerification).not.toHaveBeenCalled();
    expect(fixture.reports.at(-1)).toMatchObject({
      artifacts: expect.arrayContaining([
        expect.objectContaining({ artifactType: "STRUCTURED_OUTPUT" }),
        expect.objectContaining({ artifactType: "CODE_DIFF" }),
      ]),
      terminal: { status: "COMPLETED" },
    });
    await fixture.worker.stop();
  });

  it("executes an independently registered harness identity through the unchanged governed lifecycle", async () => {
    const fixture = await runFixture("VERIFIED", {
      harness: { adapter: "loom", version: "v1", displayName: "Loom fixture", provider: "anthropic" },
    });

    await vi.waitFor(() => expect(fixture.worker.status()).toMatchObject({ completedCount: 1, failedCount: 0 }));
    const observations = fixture.reports.flatMap((packet) => packet.observations ?? []);
    expect(observations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "AGENT",
        provider: "anthropic",
        metadata: { adapter: "loom", adapterVersion: "v1" },
      }),
    ]));
    expect(fixture.reports.at(-1)?.terminal).toEqual({ status: "COMPLETED" });
    await fixture.worker.stop();
  });

  it("completes the durable worker golden path and cleans only its proven worktree", async () => {
    const fixture = await runFixture("VERIFIED", { durable: true });

    await vi.waitFor(() => expect(fixture.worker.status()).toMatchObject({ completedCount: 1, failedCount: 0 }));
    expect(fixture.reports.find((packet) => packet.artifacts?.some((artifact: any) => artifact.artifactType === "PULL_REQUEST")))
      .toBeTruthy();
    expect(fixture.reports.at(-1)?.events).toEqual([
      expect.objectContaining({
        metadata: expect.objectContaining({ lifecycleType: "WORKSPACE_CLEANUP_COMPLETED" }),
      }),
    ]);
    expect(fixture.reports.at(-1)?.terminal).toEqual({ status: "COMPLETED" });
    await expect(access(fixture.worktree)).rejects.toThrow();
    await fixture.worker.stop();
  });

  it("does not create a pull request when the control plane rejects the verification packet", async () => {
    const fixture = await runFixture("NOT_VERIFIED");

    await vi.waitFor(() => expect(fixture.worker.status().failedCount).toBe(1));

    expect(fixture.createPullRequest).not.toHaveBeenCalled();
    expect(fixture.reports.at(-1)?.terminal).toMatchObject({
      status: "FAILED",
      failureReason: expect.stringContaining("Independent verification did not pass: NOT_VERIFIED"),
    });
    await fixture.worker.stop();
  });

  it("pauses for human review and resumes publication without rerunning Codex or verification", async () => {
    const fixture = await runFixture("REQUIRES_HUMAN_REVIEW");

    await vi.waitFor(() => expect(fixture.reports.some((packet) => packet.verification)).toBe(true));
    await vi.waitFor(() => expect(fixture.worker.status().activeRunIds).toEqual([]));
    expect(fixture.createPullRequest).not.toHaveBeenCalled();
    expect(fixture.reports.some((packet) => packet.terminal)).toBe(false);
    expect(fixture.executeCodex).toHaveBeenCalledOnce();
    expect(fixture.executeVerification).toHaveBeenCalledOnce();

    await fixture.worker.stop();
    fixture.resumeAfterApproval();
    const restartedWorker = fixture.createRestartedWorker();
    await restartedWorker.tick();
    await vi.waitFor(() => expect(restartedWorker.status().completedCount).toBe(1));

    expect(fixture.createPullRequest).toHaveBeenCalledOnce();
    expect(fixture.authorizePublication).toHaveBeenCalledOnce();
    expect(fixture.authorizePublication.mock.invocationCallOrder[0]).toBeLessThan(
      fixture.pushFactoryBranch.mock.invocationCallOrder[0],
    );
    expect(fixture.executeCodex).toHaveBeenCalledOnce();
    expect(fixture.executeVerification).toHaveBeenCalledOnce();
    expect(fixture.reports.at(-1)?.artifacts?.find((artifact: any) => artifact.artifactType === "PULL_REQUEST")?.metadata)
      .toMatchObject({ sourceRevision: verifiedSha(), headSha: expect.stringMatching(/^[a-f0-9]{40}$/) });
    expect(fixture.reports.at(-1)?.terminal).toEqual({ status: "COMPLETED" });
    await restartedWorker.stop();
  });

  it("persists a verification mismatch, blocks publication, and recovers with a new immutable Attempt", async () => {
    const mismatched = await runFixture("VERIFIED", { attempt: 1, dirtyVerification: true });
    await vi.waitFor(() => expect(mismatched.worker.status().failedCount).toBe(1));

    const failurePacket = mismatched.reports.at(-1);
    const failureEvidence = failurePacket?.artifacts?.find((artifact: any) => artifact.artifactType === "VERIFICATION_EVIDENCE");
    expect(failureEvidence).toMatchObject({
      metadata: {
        failureClass: "CANDIDATE_INTEGRITY_MISMATCH",
        candidateRevision: expect.stringMatching(/^[a-f0-9]{40}$/),
      },
    });
    expect(failureEvidence.metadata.checkSummary).toEqual(
      expect.arrayContaining([expect.objectContaining({ status: "PASS", verifierId: "factory-command/v1" })]),
    );
    expect(failurePacket?.terminal).toMatchObject({
      status: "FAILED",
      failureReason: expect.stringContaining("Verification left repository changes behind"),
    });
    expect(mismatched.createPullRequest).not.toHaveBeenCalled();
    const historicalPackets = structuredClone(mismatched.reports);
    await mismatched.worker.stop();

    const recovered = await runFixture("VERIFIED", { attempt: 2 });
    await vi.waitFor(() => expect(recovered.worker.status().completedCount).toBe(1));
    const recoveredArtifact = recovered.reports.at(-1)?.artifacts?.find((artifact: any) => artifact.artifactType === "PULL_REQUEST");

    expect(recovered.createPullRequest).toHaveBeenCalledOnce();
    expect(recoveredArtifact?.metadata).toMatchObject({
      workflowRunId: "workflow-run-2",
      headSha: expect.stringMatching(/^[a-f0-9]{40}$/),
      installationId: "303",
    });
    expect(recoveredArtifact?.metadata.headSha).not.toBe(failureEvidence.metadata.candidateRevision);
    expect(mismatched.reports).toEqual(historicalPackets);
    await recovered.worker.stop();
  });

  it("runs policy-v2 verification in a distinct detached exact-subject Attempt", async () => {
    const checkoutRoot = await mkdtemp(path.join(tmpdir(), "mc-policy-v2-verifier-"));
    cleanup.push(checkoutRoot);
    await git(checkoutRoot, ["init", "-b", "main"]);
    await git(checkoutRoot, ["config", "user.name", "Mission Control Test"]);
    await git(checkoutRoot, ["config", "user.email", "factory@example.test"]);
    await mkdir(path.join(checkoutRoot, "src"), { recursive: true });
    await writeFile(path.join(checkoutRoot, "src", "feature.ts"), "export const value = 1;\n");
    await git(checkoutRoot, ["add", "."]);
    await git(checkoutRoot, ["commit", "-m", "base"]);
    const sourceRevision = (await git(checkoutRoot, ["rev-parse", "HEAD"])).stdout.trim();
    await git(checkoutRoot, ["checkout", "-b", "mc/candidate"]);
    await writeFile(path.join(checkoutRoot, "src", "feature.ts"), "export const value = 2;\n");
    await git(checkoutRoot, ["add", "."]);
    await git(checkoutRoot, ["commit", "-m", "candidate"]);
    const candidateSha = (await git(checkoutRoot, ["rev-parse", "HEAD"])).stdout.trim();
    const treeSha = (await git(checkoutRoot, ["rev-parse", "HEAD^{tree}"])).stdout.trim();
    const run = {
      _id: "verification-attempt-1", runId: "verify-1", projectId: "project-1", repositoryId: "repository-1",
      factoryDefinitionVersionId: "verification-factory-v1", executionManifestDigest: "sha256:manifest-v2",
      executorAdapter: "codex", executorVersion: "v1", attemptPurpose: "VERIFICATION", status: "PENDING",
    };
    const subject = {
      version: 1, kind: "GIT_CANDIDATE", subjectId: "subject-1", digest: "sha256:subject",
      workOrderId: "work-order-1", workOrderRevisionNumber: 1, verificationContractDigest: "sha256:contract",
      sourceAttemptId: "implementation-attempt-1", repositoryId: "repository-1", provider: "GITHUB",
      providerRepositoryId: "101", candidateSha, treeSha,
      pullRequest: { providerPullRequestId: "PR_1", number: 101, url: "https://github.com/sellerfi/mission-control-fixture/pull/101", baseRef: "main", headRef: "mc/candidate", headSha: candidateSha, draftAtPublication: true },
    };
    const worktree = path.join(checkoutRoot, ".mission-control", "worktrees", "verify-1");
    const claim = {
      claimed: true, ...run, workflowRunId: run._id, workOrderId: "work-order-1", checkoutRoot, worktree,
      sourceWorktree: path.join(checkoutRoot, ".mission-control", "worktrees", "source-1"),
      sourceRevision,
      branch: "mc/candidate", defaultBranch: "main", repository: "sellerfi/mission-control-fixture",
      providerRepositoryId: "101", installation: { appId: "202", installationId: "303" },
      verificationSubject: subject, verificationPlan: { planId: "plan-1", planDigest: "sha256:plan" },
      executionManifest: {
        ...executionManifest(),
        causation: { workflowRunId: run._id, workOrderRevisionNumber: 1 },
        harness: {
          ...executionManifest().harness,
          isolation: "READ_ONLY",
          requiredCapabilities: ["git-worktree", "read-only"],
        },
        workOrderSpecification: {
          ...executionManifest().workOrderSpecification,
          verificationContract: {
            ...executionManifest().workOrderSpecification.verificationContract,
            schemaVersion: 2,
            requiredRisks: [],
            independence: { required: true, minimumBoundary: "SEPARATE_ATTEMPT" },
          },
        },
      },
    };
    const executionManifestDigest = `sha256:${canonicalHash(claim.executionManifest)}`;
    run.executionManifestDigest = executionManifestDigest;
    claim.executionManifestDigest = executionManifestDigest;
    const reports: any[] = [];
    let pending = true;
    const client = {
      query: vi.fn(async (_query: unknown, args: any) => args.status === "PENDING" && pending ? [run] : []),
      action: vi.fn(async (_action: unknown, command: any) => {
        const payload = JSON.parse(command.payloadJson);
        if (!payload.packet) return claim;
        pending = false;
        reports.push({ capability: command.envelope.capability, packet: payload.packet });
        return { accepted: true, verdict: "VERIFIED" };
      }),
    } as any;
    const executeImplementation = vi.fn(async () => {
      throw new Error("Implementation adapter must not run for verification Attempts.");
    });
    const adapter = new CodexV1ExecutorAdapter("codex-fixture", executeImplementation as any);
    const dependencies: FactoryAttemptWorkerDependencies = {
      ensureFactoryWorktree,
      ensureVerificationWorktree,
      listChangedFiles,
      commitFactoryChanges,
      inspectCandidateChange,
      assertFactoryCandidateUnchanged,
      executeIndependentVerification,
      loadGithubAppPrivateKey: () => undefined,
      getGithubAppId: () => undefined,
      mintInstallationToken: vi.fn() as any,
      pushFactoryBranch: vi.fn() as any,
      createOrReusePullRequest: vi.fn() as any,
    };
    const worker = new FactoryAttemptWorker(client, adapter, true, 60_000, dependencies);
    await worker.tick();
    await vi.waitFor(() => expect(worker.status().completedCount).toBe(1));

    expect(executeImplementation).not.toHaveBeenCalled();
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({
      capability: "verification:report",
      packet: {
        terminal: { status: "COMPLETED" },
        verification: { sourceRevision, candidateRevision: candidateSha },
        isolation: {
          mode: "DETACHED_GIT_WORKTREE",
          headSha: candidateSha,
          treeSha,
          initialClean: true,
          finalSubjectMatch: true,
          attestedAt: expect.any(Number),
        },
      },
    });
    expect(dependencies.createOrReusePullRequest).not.toHaveBeenCalled();
    await worker.stop();
  });
});

function verifiedSha() {
  return expect.stringMatching(/^[a-f0-9]{40}$/);
}

async function runFixture(
  serverVerdict: "VERIFIED" | "NOT_VERIFIED" | "REQUIRES_HUMAN_REVIEW",
  options: {
    attempt?: number;
    dirtyVerification?: boolean;
    durable?: boolean;
    isMutating?: boolean;
    noVerificationContract?: boolean;
    harness?: { adapter: string; version: string; displayName: string; provider: string };
  } = {},
) {
  const attempt = options.attempt ?? 1;
  const checkoutRoot = await mkdtemp(path.join(tmpdir(), "mc-verification-first-worker-"));
  cleanup.push(checkoutRoot);
  await git(checkoutRoot, ["init", "-b", "main"]);
  await git(checkoutRoot, ["config", "user.name", "Mission Control Test"]);
  await git(checkoutRoot, ["config", "user.email", "factory@example.test"]);
  await git(checkoutRoot, ["remote", "add", "origin", "https://github.com/sellerfi/mission-control-fixture.git"]);
  await mkdir(path.join(checkoutRoot, "src"), { recursive: true });
  await writeFile(path.join(checkoutRoot, "src", "feature.ts"), "export const verified = false;\n");
  await git(checkoutRoot, ["add", "."]);
  await git(checkoutRoot, ["commit", "-m", "Initial fixture"]);
  const baseSha = (await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: checkoutRoot })).stdout.trim();

  const worktree = path.join(checkoutRoot, ".mission-control", "worktrees", `attempt-${attempt}`);
  const reports: any[] = [];
  const manifest = executionManifest({ attempt, dirtyVerification: options.dirtyVerification, baseSha });
  if (options.noVerificationContract) {
    delete (manifest.workOrderSpecification as { verificationContract?: unknown }).verificationContract;
  }
  if (options.harness) {
    const capabilityManifest = fixtureHarnessManifest(options.harness);
    manifest.harness.adapter = options.harness.adapter;
    manifest.harness.version = options.harness.version;
    manifest.harness.harnessId = capabilityManifest.identity.harnessId;
    manifest.harness.harnessVersion = capabilityManifest.identity.harnessVersion;
    manifest.harness.capabilityManifest = capabilityManifest;
    manifest.harness.capabilityManifestSha256 = harnessCapabilityManifestDigest(capabilityManifest);
    manifest.harness.effectiveConfigSha256 = capabilityManifest.effectiveConfigSha256;
    manifest.harness.provider = options.harness.provider;
  }
  const run = {
    _id: `workflow-run-${attempt}`,
    runId: `factory-run-${attempt}`,
    projectId: "project-1",
    repositoryId: "repository-1",
    factoryDefinitionVersionId: "factory-version-1",
    executionManifestDigest: `sha256:${canonicalHash(manifest)}`,
    executorAdapter: options.harness?.adapter ?? "codex",
    executorVersion: options.harness?.version ?? "v1",
    isMutating: options.isMutating ?? true,
    status: "PENDING",
  };
  const claim = {
    claimed: true,
    ...run,
    workflowRunId: run._id,
    workOrderId: "work-order-1",
    checkoutRoot,
    worktree,
    branch: `mc/verification-first-fixture-${attempt}`,
    defaultBranch: "main",
    repository: "sellerfi/mission-control-fixture",
    providerRepositoryId: "101",
    installation: { appId: "202", installationId: "303" },
    executionManifest: manifest,
  };
  let lifecycle: "INITIAL" | "PAUSED" | "RESUME" | "COMPLETED" = "INITIAL";
  let verifiedCandidate: { sourceRevision: string; candidateRevision: string } | null = null;
  const authorizePublication = vi.fn(async (payload: any) => ({
    authorized: true,
    publicationPermitId: `permit:${payload.leaseId}`,
    candidateRevision: payload.candidateRevision,
    validUntil: Date.now() + 10 * 60_000,
  }));
  const client = {
    query: vi.fn(async (_query: unknown, args: any) => (
      args.status === "PENDING" && ["INITIAL", "RESUME"].includes(lifecycle) ? [run] : []
    )),
    action: vi.fn(async (_action: unknown, command: { payloadJson: string }) => {
      const payload = JSON.parse(command.payloadJson);
      if (payload.candidateRevision && payload.leaseId && !payload.leaseDurationMs) {
        return await authorizePublication(payload);
      }
      if (!payload.packet) {
        if (payload.workerGeneration) return { renewed: true };
        if (lifecycle === "RESUME") {
          if (!verifiedCandidate) throw new Error("Missing verified candidate fixture state");
          return {
            ...claim,
            publicationCheckpoint: {
              ...verifiedCandidate,
              authorizationValidUntil: Date.now() + 10 * 60_000,
              changedFiles: ["src/feature.ts"],
              verification: {
                verdict: "VERIFIED",
                verdictReasons: ["Human review approved the exact candidate."],
                verificationReceiptId: "receipt-approved",
              },
              structuredResult: completedFactoryResult(),
            },
          };
        }
        return options.durable ? {
          ...claim,
          lease: {
            leaseId: payload.leaseId,
            ownerId: "factory-service",
            workerId: "worker-1",
            workerSessionId: "session-1",
            workerGeneration: 1,
            claimedAt: Date.now(),
            heartbeatAt: Date.now(),
            expiresAt: Date.now() + 60_000,
          },
        } : claim;
      }
      reports.push(payload.packet);
      if (payload.packet.verification) {
        verifiedCandidate = {
          sourceRevision: payload.packet.verification.sourceRevision,
          candidateRevision: payload.packet.verification.candidateRevision,
        };
        if (serverVerdict === "REQUIRES_HUMAN_REVIEW") lifecycle = "PAUSED";
        return {
          verification: {
            verdict: serverVerdict,
            verdictReasons: serverVerdict === "VERIFIED"
              ? ["All mandatory proof is present."]
              : serverVerdict === "REQUIRES_HUMAN_REVIEW"
                ? ["The verification contract reserves final advancement for human review."]
                : ["Control-plane recomputation rejected the packet."],
            verificationReceiptId: "receipt-1",
            paused: serverVerdict === "REQUIRES_HUMAN_REVIEW",
          },
        };
      }
      if (payload.packet.terminal?.status === "COMPLETED") lifecycle = "COMPLETED";
      return { reported: true };
    }),
  } as any;
  const executeCodex = vi.fn(async ({ cwd, onSpawn, onExit }: {
    cwd: string;
    onSpawn?: (pid: number) => Promise<void> | void;
    onExit?: (pid: number, exitCode?: number) => Promise<void> | void;
  }) => {
    const startedAt = Date.now();
    await onSpawn?.(4242);
    await writeFile(
      path.join(cwd, "src", "feature.ts"),
      `export const verified = true; // corrected Attempt ${attempt}\n`,
    );
    await onExit?.(4242, 0);
    return {
      exitCode: 0,
      signal: null,
      output: JSON.stringify(completedFactoryResult()),
      stdout: '{"type":"turn.completed","usage":{"input_tokens":25,"output_tokens":10}}\n',
      stderr: "",
      startedAt,
      finishedAt: Date.now(),
      timedOut: false,
    };
  });
  const codexAdapter = new CodexV1ExecutorAdapter("codex-fixture", executeCodex);
  const adapter = options.harness ? withHarnessIdentity(codexAdapter, options.harness) : codexAdapter;
  const createPullRequest = vi.fn(async (input: Parameters<FactoryAttemptWorkerDependencies["createOrReusePullRequest"]>[0]) => ({
    number: 42,
    url: "https://github.com/sellerfi/mission-control-fixture/pull/42",
    nodeId: "PR_fixture",
    headSha: input.headSha,
    draft: input.draft === true,
    reused: false,
  }));
  const executeVerification = vi.fn(executeIndependentVerification);
  const pushFactoryBranchMock = vi.fn(async (input) => {
    expect(input.branch).toBe(`mc/verification-first-fixture-${attempt}`);
  });
  const dependencies: FactoryAttemptWorkerDependencies = {
    ensureFactoryWorktree,
    ensureVerificationWorktree,
    listChangedFiles,
    commitFactoryChanges,
    inspectCandidateChange,
    assertFactoryCandidateUnchanged,
    executeIndependentVerification: executeVerification,
    loadGithubAppPrivateKey: () => "test-private-key",
    getGithubAppId: () => "202",
    mintInstallationToken: async () => ({ token: "installation-token", expiresAt: Date.now() + 10 * 60_000 }),
    pushFactoryBranch: pushFactoryBranchMock as typeof pushFactoryBranch,
    createOrReusePullRequest: createPullRequest,
  };
  const createRestartedWorker = () => new FactoryAttemptWorker(
    client,
    adapter,
    true,
    60_000,
    dependencies,
    undefined,
    options.durable ? { workerId: "worker-1", sessionId: "session-1", maxConcurrentRuns: 1 } : undefined,
  );
  const worker = createRestartedWorker();

  await worker.tick();
  return {
    worker,
    reports,
    createPullRequest,
    executeCodex,
    executeVerification,
    authorizePublication,
    pushFactoryBranch: pushFactoryBranchMock,
    createRestartedWorker,
    worktree,
    resumeAfterApproval: () => { lifecycle = "RESUME"; },
  };
}

function withHarnessIdentity(
  adapter: CodexV1ExecutorAdapter,
  identity: { adapter: string; version: string; displayName: string; provider: string },
) {
  const manifest = fixtureHarnessManifest(identity);
  return {
    capabilities: () => ({ ...adapter.capabilities(), ...identity, capabilityManifest: manifest }),
    validateConfiguration: () => [],
    estimate: adapter.estimate.bind(adapter),
    prepare: (request: any, context: any) => adapter.prepare({ ...request, provider: "openai" }, context),
    execute: adapter.execute.bind(adapter),
    collectResult: async (handle: Parameters<typeof adapter.collectResult>[0]) => {
      const result = await adapter.collectResult(handle);
      if (result.normalizedResult) {
        result.normalizedResult.harness = manifest.identity;
        result.normalizedResult.provenance.capabilityManifestSha256 = harnessCapabilityManifestDigest(manifest);
        result.normalizedResult.provenance.effectiveConfigSha256 = manifest.effectiveConfigSha256;
        result.normalizedResult.provenance.provider = identity.provider;
      }
      return result;
    },
    cancel: adapter.cancel.bind(adapter),
    cleanup: adapter.cleanup.bind(adapter),
    health: adapter.health.bind(adapter),
    createRemoteInvocation: adapter.createRemoteInvocation.bind(adapter),
  } as any;
}

function fixtureHarnessManifest(
  identity: { adapter: string; version: string; displayName: string; provider: string },
) {
  return {
    ...structuredClone(CODEX_V1_HARNESS_MANIFEST),
    identity: {
      ...CODEX_V1_HARNESS_MANIFEST.identity,
      harnessId: `${identity.adapter}-fixture`,
      harnessVersion: identity.version,
      adapterId: identity.adapter,
      adapterVersion: identity.version,
    },
    models: {
      ...CODEX_V1_HARNESS_MANIFEST.models,
      supported: CODEX_V1_HARNESS_MANIFEST.models.supported.map((model) => ({ ...model, provider: identity.provider })),
    },
  };
}

function completedFactoryResult() {
  return {
    schema: "factory-result/v1",
    status: "COMPLETED",
    summary: "Implement the governed issue outcome",
    completedAcceptanceCriterionIds: ["ac-1"],
    incompleteAcceptanceCriterionIds: [],
    unknownAcceptanceCriterionIds: [],
    verificationCommands: ["node -e deterministic verifier"],
    knownRisks: [],
    nextAction: "Run independent factory verification.",
  };
}

function executionManifest(options: { attempt?: number; dirtyVerification?: boolean; baseSha?: string } = {}) {
  return {
    version: "factory-execution-manifest/v1",
    causation: { workflowRunId: `workflow-run-${options.attempt ?? 1}`, workOrderRevisionNumber: 1, sourceIssue: "sellerfi/mission-control-fixture#17" },
    harness: {
      adapter: "codex",
      version: "v1",
      harnessId: "codex-cli",
      harnessVersion: "0.146.0",
      harnessCommit: "e363b08c9175ac1cbe5893615dd2cb9ddf95043b",
      capabilityManifest: CODEX_V1_HARNESS_MANIFEST,
      capabilityManifestSha256: harnessCapabilityManifestDigest(CODEX_V1_HARNESS_MANIFEST),
      effectiveConfigSha256: CODEX_V1_HARNESS_MANIFEST.effectiveConfigSha256,
      provider: "openai",
      model: "gpt-5.6-terra",
      isolation: "WORKSPACE_WRITE",
      executionBackend: "persistent-worker",
      requiredCapabilities: ["git-worktree", "workspace-write"],
      requiredHarnessCapabilities: [],
      pullRequestAuthority: "CONTROL_PLANE_ONLY",
      timeoutMs: 60_000,
    },
    repository: { baseSha: options.baseSha ?? "a".repeat(40), allowedPaths: ["src/**"], excludedPaths: [] },
    workflow: { steps: [] },
    compiledPrompt: "Implement the approved issue intent within the frozen Work Order contract.",
    intent: { title: "Governed issue intent becomes a verified pull request" },
    workOrderSpecification: {
      riskLevel: "MEDIUM",
      riskReasons: ["Bounded source change"],
      requiredApprovals: [],
      acceptanceCriteria: [{
        id: "ac-1",
        title: "Candidate change is independently verified",
        requiredEvidence: [{ category: "TEST_RESULT", minimumCount: 1, independent: true }],
      }],
      negativeConstraints: [{ id: "no-test-removal", type: "NO_TEST_REMOVAL", description: "Do not remove tests." }],
      changeBudget: {
        maxFilesChanged: 1,
        maxLinesChanged: 2,
        allowedPaths: ["src/**"],
        deniedPaths: ["src/auth/**"],
        allowedCommandClasses: ["TEST"],
        prohibitedCommandClasses: ["DESTRUCTIVE", "PRODUCTION_ACCESS", "SECRETS_ACCESS", "PUBLISH"],
        allowDependencyChanges: false,
        allowSchemaChanges: false,
        allowMigrations: false,
        allowInfrastructureChanges: false,
      },
      verificationContract: {
        schemaVersion: 1,
        enforcementMode: "ENFORCED",
        requireHumanReview: false,
        checks: [{
          id: "deterministic-test",
          name: "Deterministic independent test",
          category: "UNIT_TEST",
          verifierId: "factory-command/v1",
          mandatory: true,
          acceptanceCriterionIds: ["ac-1"],
          evidenceCategory: "TEST_RESULT",
          command: {
            executable: "node",
            args: ["-e", options.dirtyVerification
              ? "require('fs').writeFileSync('src/verifier-touch.ts', 'mismatch')"
              : "console.log('verified')"],
            commandClass: "TEST",
            timeoutMs: 5_000,
          },
        }],
      },
    },
  };
}

async function git(cwd: string, args: string[]) {
  return await execFileAsync("git", args, { cwd });
}
