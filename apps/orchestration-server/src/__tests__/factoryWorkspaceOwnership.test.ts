import { execFile } from "node:child_process";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import {
  cleanupOwnedFactoryWorkspace,
  ensureFactoryWorkspaceOwnership,
  loadFactoryWorkspaceOwnership,
  recordFactoryExecutorStarted,
  recordFactoryExecutorTerminated,
  recordFactoryInvocationStarted,
  recordFactoryInvocationCompleted,
  recordFactoryPublication,
  recordFactorySandboxStarted,
  recordFactorySandboxTerminated,
  transferFactoryPublicationWorkspace,
  transferFactoryRecoveryWorkspace,
  type FactoryWorkspaceOwner,
} from "../factoryWorkspaceOwnership.js";

const execFileAsync = promisify(execFile);
const cleanup: string[] = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("Factory workspace ownership", () => {
  it("transfers a finished in-process invocation but preserves unknown execution after a crash", async () => {
    const fixture = await createFixture();
    await ensureFactoryWorkspaceOwnership({ owner: fixture.owner, allowCreate: true });
    await recordFactoryInvocationStarted(fixture.owner, "invocation-1");
    const transfer = { previousOwner: fixture.owner, nextOwner: { ...fixture.owner, leaseId: "lease-2", workerSessionId: "session-2", workerGeneration: 2 }, checkpointCandidateSha: fixture.headSha };
    await expect(transferFactoryPublicationWorkspace(transfer)).rejects.toThrow(/terminated workspace/);
    await expect(recordFactoryInvocationCompleted(fixture.owner, "wrong-invocation")).rejects.toThrow(/does not match/);
    await recordFactoryInvocationCompleted(fixture.owner, "invocation-1");
    expect(await transferFactoryPublicationWorkspace(transfer)).toMatchObject({ leaseId: "lease-2", process: { kind: "IN_PROCESS_AGENT", state: "TERMINATED", executionId: "invocation-1" } });
    // Reconcile a committed local handoff whose acknowledgement was lost.
    expect(await transferFactoryPublicationWorkspace(transfer)).toMatchObject({ leaseId: "lease-2" });
    expect(await transferFactoryPublicationWorkspace({ ...transfer, nextOwner: { ...transfer.nextOwner, leaseId: "lease-3" } })).toMatchObject({ leaseId: "lease-3" });
  });
  it("preserves a workspace when the complete ownership tuple does not match", async () => {
    const fixture = await createFixture();
    await ensureFactoryWorkspaceOwnership({ owner: fixture.owner, allowCreate: true });

    await expect(ensureFactoryWorkspaceOwnership({
      owner: { ...fixture.owner, leaseId: "lease-other" },
      allowCreate: false,
    })).rejects.toThrow(/ownership tuple mismatch/);
    await expect(access(fixture.worktree)).resolves.toBeUndefined();
  });

  it("preserves dirty and running workspaces instead of forcing cleanup", async () => {
    const fixture = await createFixture();
    await ensureFactoryWorkspaceOwnership({ owner: fixture.owner, allowCreate: true });
    await recordFactoryExecutorStarted(fixture.owner, 12345);
    await recordFactoryPublication(fixture.owner, {
      headSha: fixture.headSha,
      pullRequestUrl: "https://github.com/sellerfi/runtime-fixture/pull/1",
    });
    const running = await cleanupOwnedFactoryWorkspace({
      owner: fixture.owner,
      expectedHeadSha: fixture.headSha,
      expectedPullRequestUrl: "https://github.com/sellerfi/runtime-fixture/pull/1",
    });
    expect(running).toEqual({ outcome: "PRESERVED", reason: "executor-process-not-proven-terminated" });

    await recordFactoryExecutorTerminated(fixture.owner, { pid: 12345, exitCode: 0 });
    await writeFile(path.join(fixture.worktree, "operator-inspection.txt"), "preserve me\n");
    const dirty = await cleanupOwnedFactoryWorkspace({
      owner: fixture.owner,
      expectedHeadSha: fixture.headSha,
      expectedPullRequestUrl: "https://github.com/sellerfi/runtime-fixture/pull/1",
    });
    expect(dirty).toMatchObject({ outcome: "PRESERVED", reason: "git-worktree-ownership-proof-mismatch-or-dirty" });
    await expect(access(path.join(fixture.worktree, "operator-inspection.txt"))).resolves.toBeUndefined();
  });

  it("binds one exact PID lifecycle to the full ownership tuple", async () => {
    const fixture = await createFixture();
    await ensureFactoryWorkspaceOwnership({ owner: fixture.owner, allowCreate: true });
    await recordFactoryExecutorStarted(fixture.owner, 12345);
    await expect(recordFactoryExecutorStarted(fixture.owner, 54321)).rejects.toThrow(/already established/);
    await expect(recordFactoryExecutorTerminated(fixture.owner, { pid: 54321, exitCode: 0 }))
      .rejects.toThrow(/does not match/);
    expect(await loadFactoryWorkspaceOwnership(fixture.owner)).toMatchObject({
      process: { state: "RUNNING", pid: 12345 },
    });
  });

  it("uses the canonical process and workspace owner for an exact remote sandbox lifecycle", async () => {
    const fixture = await createFixture();
    const owner = { ...fixture.owner, sandboxId: "mc-attempt-0123456789abcdef" };
    await ensureFactoryWorkspaceOwnership({ owner, allowCreate: true });
    await recordFactorySandboxStarted(owner, {
      providerResourceId: "provider-resource-1",
      externalProcessId: "sandbox-process-1",
    });
    await expect(recordFactorySandboxTerminated(owner, {
      providerResourceId: "provider-resource-other",
      resourceName: owner.sandboxId,
      confirmedAbsentAt: Date.now(),
      resourceAbsent: true,
    })).rejects.toThrow(/provider identity does not match/);
    await recordFactorySandboxTerminated(owner, {
      providerResourceId: "provider-resource-1",
      resourceName: owner.sandboxId,
      confirmedAbsentAt: Date.now(),
      resourceAbsent: true,
    });
    expect(await loadFactoryWorkspaceOwnership(owner)).toMatchObject({
      sandboxId: owner.sandboxId,
      process: {
        kind: "REMOTE_SANDBOX",
        state: "TERMINATED",
        providerResourceId: "provider-resource-1",
        externalProcessId: "sandbox-process-1",
      },
    });
  });

  it("preserves cleanup when the checkout origin host is not the frozen GitHub repository", async () => {
    const fixture = await createFixture();
    await ensureFactoryWorkspaceOwnership({ owner: fixture.owner, allowCreate: true });
    await recordFactoryExecutorStarted(fixture.owner, 12345);
    await recordFactoryExecutorTerminated(fixture.owner, { pid: 12345, exitCode: 0 });
    await recordFactoryPublication(fixture.owner, {
      headSha: fixture.headSha,
      pullRequestUrl: "https://github.com/sellerfi/runtime-fixture/pull/3",
    });
    await git(fixture.checkoutRoot, ["remote", "set-url", "origin", "https://evil.example/sellerfi/runtime-fixture.git"]);

    expect(await cleanupOwnedFactoryWorkspace({
      owner: fixture.owner,
      expectedHeadSha: fixture.headSha,
      expectedPullRequestUrl: "https://github.com/sellerfi/runtime-fixture/pull/3",
    })).toMatchObject({ outcome: "PRESERVED" });
    await expect(access(fixture.worktree)).resolves.toBeUndefined();
  });

  it("removes only an exact, clean, published, terminated worktree", async () => {
    const fixture = await createFixture();
    await ensureFactoryWorkspaceOwnership({ owner: fixture.owner, allowCreate: true });
    await recordFactoryExecutorStarted(fixture.owner, 23456);
    await recordFactoryExecutorTerminated(fixture.owner, { pid: 23456, exitCode: 0 });
    await recordFactoryPublication(fixture.owner, {
      headSha: fixture.headSha,
      pullRequestUrl: "https://github.com/sellerfi/runtime-fixture/pull/2",
    });

    expect(await cleanupOwnedFactoryWorkspace({
      owner: fixture.owner,
      expectedHeadSha: fixture.headSha,
      expectedPullRequestUrl: "https://github.com/sellerfi/runtime-fixture/pull/2",
    })).toEqual({ outcome: "COMPLETED", reason: "exact-owned-clean-published-worktree-removed" });
    await expect(access(fixture.worktree)).rejects.toThrow();
    expect(await loadFactoryWorkspaceOwnership(fixture.owner)).toMatchObject({ cleanup: { status: "COMPLETED" } });
  });

  it("transfers only a clean terminated publication checkpoint to a new worker session", async () => {
    const fixture = await createFixture();
    await ensureFactoryWorkspaceOwnership({ owner: fixture.owner, allowCreate: true });
    await recordFactoryExecutorStarted(fixture.owner, 34567);
    await recordFactoryExecutorTerminated(fixture.owner, { pid: 34567, exitCode: 0 });
    const nextOwner = {
      ...fixture.owner,
      workerSessionId: "session-2",
      workerGeneration: 2,
      leaseId: "lease-2",
    };
    expect(await transferFactoryPublicationWorkspace({
      previousOwner: fixture.owner,
      nextOwner,
      checkpointCandidateSha: fixture.headSha,
    })).toMatchObject({ workerSessionId: "session-2", workerGeneration: 2, leaseId: "lease-2" });
  });

  it("rejects publication transfer to another stable worker or a replayed lease", async () => {
    const fixture = await createFixture();
    await ensureFactoryWorkspaceOwnership({ owner: fixture.owner, allowCreate: true });
    await recordFactoryExecutorStarted(fixture.owner, 34567);
    await recordFactoryExecutorTerminated(fixture.owner, { pid: 34567, exitCode: 0 });
    await expect(transferFactoryPublicationWorkspace({
      previousOwner: fixture.owner,
      nextOwner: { ...fixture.owner, workerId: "worker-other", workerSessionId: "session-2", workerGeneration: 2, leaseId: "lease-2" },
      checkpointCandidateSha: fixture.headSha,
    })).rejects.toThrow(/same stable worker/);
    await expect(transferFactoryPublicationWorkspace({
      previousOwner: fixture.owner,
      nextOwner: { ...fixture.owner, workerSessionId: "session-2", workerGeneration: 2 },
      checkpointCandidateSha: fixture.headSha,
    })).rejects.toThrow(/new lease/);
  });

  it("rekeys one clean terminated workspace to an exact linked recovery Attempt", async () => {
    const fixture = await createFixture();
    await ensureFactoryWorkspaceOwnership({ owner: fixture.owner, allowCreate: true });
    await recordFactoryExecutorStarted(fixture.owner, 34567);
    await recordFactoryExecutorTerminated(fixture.owner, { pid: 34567, exitCode: 1 });
    const nextOwner = {
      ...fixture.owner,
      workflowRunId: "workflow-run-recovery",
      executionManifestDigest: `sha256:${"a".repeat(64)}`,
      workerSessionId: "session-2",
      workerGeneration: 2,
      leaseId: "lease-2",
    };
    expect(await transferFactoryRecoveryWorkspace({
      previousOwner: fixture.owner,
      nextOwner,
      checkpointCandidateSha: fixture.headSha,
    })).toMatchObject({
      workflowRunId: "workflow-run-recovery",
      executionManifestDigest: `sha256:${"a".repeat(64)}`,
      workerSessionId: "session-2",
    });
    expect(await loadFactoryWorkspaceOwnership(fixture.owner)).toBeUndefined();
    expect(await loadFactoryWorkspaceOwnership(nextOwner)).toMatchObject({ workflowRunId: "workflow-run-recovery" });
  });
});

async function createFixture() {
  const checkoutRoot = await mkdtemp(path.join(tmpdir(), "mc-workspace-owner-test-"));
  cleanup.push(checkoutRoot);
  await git(checkoutRoot, ["init", "-b", "main"]);
  await git(checkoutRoot, ["config", "user.name", "Mission Control Test"]);
  await git(checkoutRoot, ["config", "user.email", "factory@example.test"]);
  await git(checkoutRoot, ["remote", "add", "origin", "https://github.com/sellerfi/runtime-fixture.git"]);
  await mkdir(path.join(checkoutRoot, "src"), { recursive: true });
  await writeFile(path.join(checkoutRoot, "src", "index.ts"), "export const runtime = true;\n");
  await git(checkoutRoot, ["add", "."]);
  await git(checkoutRoot, ["commit", "-m", "Initial"]);
  const headSha = await git(checkoutRoot, ["rev-parse", "HEAD"]);
  const worktree = path.join(checkoutRoot, ".mission-control", "worktrees", "attempt-1");
  await git(checkoutRoot, ["worktree", "add", "-b", "mc/attempt-1", worktree, headSha]);
  const owner: FactoryWorkspaceOwner = {
    repositoryIdentity: "sellerfi/runtime-fixture",
    workflowRunId: "workflow-run-1",
    workerId: "worker-1",
    workerSessionId: "session-1",
    workerGeneration: 1,
    leaseId: "lease-1",
    branch: "mc/attempt-1",
    worktree,
    checkoutRoot,
    executionManifestDigest: `sha256:${"f".repeat(64)}`,
    baseSha: headSha,
  };
  return { checkoutRoot, worktree, headSha, owner };
}

async function git(cwd: string, args: string[]) {
  const result = await execFileAsync("git", args, { cwd });
  return result.stdout.trim();
}
