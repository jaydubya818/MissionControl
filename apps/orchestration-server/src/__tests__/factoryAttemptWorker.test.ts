import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CodexV1ExecutorAdapter } from "../codexExecutorAdapter.js";
import {
  FactoryAttemptWorker,
  factoryRunQueryArgs,
  matchesWorkerScope,
  type FactoryAttemptWorkerDependencies,
} from "../factoryAttemptWorker.js";
import {
  assertFactoryCandidateUnchanged,
  commitFactoryChanges,
  ensureFactoryWorktree,
  inspectCandidateChange,
  listChangedFiles,
  pushFactoryBranch,
} from "../factoryGitRuntime.js";
import { executeIndependentVerification } from "../factoryVerification.js";

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

  it("turns governed issue intent into a verified, evidence-linked pull request", async () => {
    const fixture = await runFixture("VERIFIED");

    await vi.waitFor(() => expect(fixture.worker.status().completedCount).toBe(1));

    expect(fixture.createPullRequest).toHaveBeenCalledOnce();
    const pullRequestInput = fixture.createPullRequest.mock.calls[0][0];
    expect(pullRequestInput.body).toContain("Verdict: **VERIFIED**");
    expect(pullRequestInput.body).toContain("Receipt: `receipt-1`");
    expect(fixture.reports.find((packet) => packet.verification)?.verification).toMatchObject({
      verdict: "VERIFIED",
      candidateRevision: expect.any(String),
      sourceRevision: expect.any(String),
    });
    const pullRequestArtifact = fixture.reports.at(-1)?.artifacts?.find((artifact: any) => artifact.artifactType === "PULL_REQUEST");
    expect(pullRequestArtifact?.metadata).toMatchObject({
      sourceRevision: expect.stringMatching(/^[a-f0-9]{40}$/),
      headSha: expect.stringMatching(/^[a-f0-9]{40}$/),
      changedFiles: ["src/feature.ts"],
    });
    expect(fixture.reports.at(-1)?.terminal).toEqual({ status: "COMPLETED" });
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
});

function verifiedSha() {
  return expect.stringMatching(/^[a-f0-9]{40}$/);
}

async function runFixture(serverVerdict: "VERIFIED" | "NOT_VERIFIED" | "REQUIRES_HUMAN_REVIEW") {
  const checkoutRoot = await mkdtemp(path.join(tmpdir(), "mc-verification-first-worker-"));
  cleanup.push(checkoutRoot);
  await git(checkoutRoot, ["init", "-b", "main"]);
  await git(checkoutRoot, ["config", "user.name", "Mission Control Test"]);
  await git(checkoutRoot, ["config", "user.email", "factory@example.test"]);
  await mkdir(path.join(checkoutRoot, "src"), { recursive: true });
  await writeFile(path.join(checkoutRoot, "src", "feature.ts"), "export const verified = false;\n");
  await git(checkoutRoot, ["add", "."]);
  await git(checkoutRoot, ["commit", "-m", "Initial fixture"]);

  const worktree = path.join(checkoutRoot, ".mission-control", "worktrees", "attempt-1");
  const reports: any[] = [];
  const run = {
    _id: "workflow-run-1",
    runId: "factory-run-1",
    projectId: "project-1",
    repositoryId: "repository-1",
    factoryDefinitionVersionId: "factory-version-1",
    executionManifestDigest: "sha256:manifest",
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
    branch: "mc/verification-first-fixture",
    defaultBranch: "main",
    repository: "sellerfi/mission-control-fixture",
    providerRepositoryId: "101",
    installation: { appId: "202", installationId: "303" },
    executionManifest: executionManifest(),
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
        return claim;
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
  const executeCodex = vi.fn(async ({ cwd }: { cwd: string }) => {
    await writeFile(path.join(cwd, "src", "feature.ts"), "export const verified = true;\n");
    return {
      exitCode: 0,
      output: JSON.stringify(completedFactoryResult()),
    };
  });
  const adapter = new CodexV1ExecutorAdapter("codex-fixture", executeCodex);
  const createPullRequest = vi.fn(async (input: Parameters<FactoryAttemptWorkerDependencies["createOrReusePullRequest"]>[0]) => ({
    number: 42,
    url: "https://example.test/sellerfi/mission-control-fixture/pull/42",
    nodeId: "PR_fixture",
    headSha: input.headSha,
    reused: false,
  }));
  const executeVerification = vi.fn(executeIndependentVerification);
  const pushFactoryBranchMock = vi.fn(async (input) => {
    expect(input.branch).toBe("mc/verification-first-fixture");
  });
  const dependencies: FactoryAttemptWorkerDependencies = {
    ensureFactoryWorktree,
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
  const createRestartedWorker = () => new FactoryAttemptWorker(client, adapter, true, 60_000, dependencies);
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
    resumeAfterApproval: () => { lifecycle = "RESUME"; },
  };
}

function completedFactoryResult() {
  return {
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

function executionManifest() {
  return {
    version: "factory-execution-manifest/v1",
    causation: { workOrderRevisionNumber: 1, sourceIssue: "sellerfi/mission-control-fixture#17" },
    harness: {
      adapter: "codex",
      version: "v1",
      isolation: "WORKSPACE_WRITE",
      pullRequestAuthority: "CONTROL_PLANE_ONLY",
      timeoutMs: 60_000,
    },
    repository: { allowedPaths: ["src/**"], excludedPaths: [] },
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
          command: { executable: "node", args: ["-e", "console.log('verified')"], commandClass: "TEST", timeoutMs: 5_000 },
        }],
      },
    },
  };
}

async function git(cwd: string, args: string[]) {
  await execFileAsync("git", args, { cwd });
}
