import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import {
  assertFactoryCandidateUnchanged,
  assertPlanningWorktreeUnchanged,
  commitFactoryChanges,
  ensureFactoryWorktree,
  ensurePlanningWorktree,
  ensureVerificationWorktree,
  inspectCandidateChange,
  listChangedFiles,
  prepareFactoryDependencies,
  releasePlanningWorktree,
} from "../factoryGitRuntime.js";

const execFileAsync = promisify(execFile);
const cleanup: string[] = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("Factory Git runtime", () => {
  it("creates and reconciles the exact worktree branch across retries", async () => {
    const repository = await mkdtemp(path.join(tmpdir(), "mc-factory-git-test-"));
    cleanup.push(repository);
    await git(repository, ["init", "-b", "main"]);
    await git(repository, ["config", "user.name", "Test"]);
    await git(repository, ["config", "user.email", "test@example.com"]);
    await mkdir(path.join(repository, "apps", "ui"), { recursive: true });
    await writeFile(path.join(repository, "apps", "ui", "App.tsx"), "export const value = 1;\n");
    await git(repository, ["add", "."]);
    await git(repository, ["commit", "-m", "Initial"]);
    const baseSha = (await git(repository, ["rev-parse", "HEAD"])).stdout.trim();

    const worktree = path.join(repository, ".mission-control", "worktrees", "attempt-1");
    await ensureFactoryWorktree({ checkoutRoot: repository, worktree, branch: "mc/attempt-1", baseSha });
    await writeFile(path.join(worktree, "apps", "ui", "App.tsx"), "export const value = 2;\n");
    expect(await listChangedFiles(worktree, baseSha)).toEqual(["apps/ui/App.tsx"]);
    const firstHead = await commitFactoryChanges({ worktree, changedFiles: ["apps/ui/App.tsx"], title: "Update app" });
    expect((await git(worktree, ["show", "-s", "--format=%an <%ae>", firstHead])).stdout.trim())
      .toBe("Test <test@example.com>");
    const candidate = await inspectCandidateChange(worktree, baseSha);
    expect(candidate).toMatchObject({ sourceRevision: baseSha, candidateRevision: firstHead, changedFiles: ["apps/ui/App.tsx"], linesAdded: 1, linesDeleted: 1 });
    await expect(assertFactoryCandidateUnchanged(worktree, firstHead)).resolves.toBeUndefined();

    await writeFile(path.join(repository, "README.md"), "moving default branch\n");
    await git(repository, ["add", "README.md"]);
    await git(repository, ["commit", "-m", "Advance main"]);
    const movingBase = await inspectCandidateChange(worktree, "main");
    expect(movingBase.sourceRevision).not.toBe(candidate.sourceRevision);
    const exactBase = await inspectCandidateChange(worktree, "main", candidate.sourceRevision);
    expect(exactBase).toMatchObject({
      sourceRevision: candidate.sourceRevision,
      candidateRevision: candidate.candidateRevision,
      treeRevision: candidate.treeRevision,
    });

    const verificationWorktree = path.join(repository, ".mission-control", "worktrees", "verification-1");
    await expect(ensureVerificationWorktree({
      checkoutRoot: repository,
      worktree: verificationWorktree,
      candidateSha: candidate.candidateRevision,
      treeSha: candidate.treeRevision,
    })).resolves.toBe(verificationWorktree);
    await writeFile(path.join(verificationWorktree, "verification-output.tmp"), "untrusted side effect\n");
    await expect(ensureVerificationWorktree({
      checkoutRoot: repository,
      worktree: verificationWorktree,
      candidateSha: candidate.candidateRevision,
      treeSha: candidate.treeRevision,
    })).rejects.toThrow(/does not match the immutable candidate commit and tree/);
    await rm(path.join(verificationWorktree, "verification-output.tmp"));

    await writeFile(path.join(worktree, "verification-output.tmp"), "untrusted side effect\n");
    await expect(assertFactoryCandidateUnchanged(worktree, firstHead)).rejects.toThrow(/left repository changes behind/);
    await rm(path.join(worktree, "verification-output.tmp"));

    await ensureFactoryWorktree({ checkoutRoot: repository, worktree, branch: "mc/attempt-1", baseSha });
    expect(await listChangedFiles(worktree, baseSha)).toEqual(["apps/ui/App.tsx"]);
    expect(await commitFactoryChanges({ worktree, changedFiles: ["apps/ui/App.tsx"], title: "Update app" })).toBe(firstHead);
  });

  it("prepares frozen dependencies without changing source state", async () => {
    const repository = await mkdtemp(path.join(tmpdir(), "mc-factory-dependencies-"));
    cleanup.push(repository);
    await git(repository, ["init", "-b", "main"]);
    await git(repository, ["config", "user.name", "Test"]);
    await git(repository, ["config", "user.email", "test@example.com"]);
    await writeFile(path.join(repository, ".gitignore"), "node_modules/\n");
    await writeFile(path.join(repository, "package.json"), '{"private":true}\n');
    await writeFile(path.join(repository, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
    await git(repository, ["add", "."]);
    await git(repository, ["commit", "-m", "Initial"]);
    const baseSha = (await git(repository, ["rev-parse", "HEAD"])).stdout.trim();
    const worktree = path.join(repository, ".mission-control", "worktrees", "attempt-dependencies");
    await ensureFactoryWorktree({ checkoutRoot: repository, worktree, branch: "mc/attempt-dependencies", baseSha });

    await expect(prepareFactoryDependencies({ worktree }, async (root) => {
      await mkdir(path.join(root, "node_modules"), { recursive: true });
      await writeFile(path.join(root, "node_modules", ".prepared"), "offline\n");
    })).resolves.toEqual({ status: "PREPARED", packageManager: "pnpm" });
    expect((await git(worktree, ["status", "--porcelain=v1"])).stdout).toBe("");

    await expect(prepareFactoryDependencies({ worktree }, async (root) => {
      await writeFile(path.join(root, "package.json"), '{"private":false}\n');
    })).rejects.toThrow(/changed repository source state/);
  });

  it("rejects a worktree root symlink that escapes the canonical checkout", async () => {
    const repository = await mkdtemp(path.join(tmpdir(), "mc-factory-git-symlink-"));
    const escapedRoot = await mkdtemp(path.join(tmpdir(), "mc-factory-git-escaped-"));
    cleanup.push(repository, escapedRoot);
    await git(repository, ["init", "-b", "main"]);
    await git(repository, ["config", "user.name", "Test"]);
    await git(repository, ["config", "user.email", "test@example.com"]);
    await writeFile(path.join(repository, "README.md"), "safe\n");
    await git(repository, ["add", "."]);
    await git(repository, ["commit", "-m", "Initial"]);
    const baseSha = (await git(repository, ["rev-parse", "HEAD"])).stdout.trim();
    await mkdir(path.join(repository, ".mission-control"));
    await symlink(escapedRoot, path.join(repository, ".mission-control", "worktrees"));

    await expect(ensureFactoryWorktree({
      checkoutRoot: repository,
      worktree: path.join(repository, ".mission-control", "worktrees", "attempt-escape"),
      branch: "mc/attempt-escape",
      baseSha,
    })).rejects.toThrow(/symbolic link|resolve inside/);
  });

  it("binds planning to a detached exact SHA and rejects any repository change", async () => {
    const repository = await mkdtemp(path.join(tmpdir(), "mc-planning-git-test-"));
    cleanup.push(repository);
    await git(repository, ["init", "-b", "main"]);
    await git(repository, ["config", "user.name", "Test"]);
    await git(repository, ["config", "user.email", "test@example.com"]);
    await writeFile(path.join(repository, "README.md"), "planning baseline\n");
    await git(repository, ["add", "."]);
    await git(repository, ["commit", "-m", "Planning baseline"]);
    const planningRepositorySha = (await git(repository, ["rev-parse", "HEAD"])).stdout.trim();
    const worktree = path.join(repository, ".mission-control", "worktrees", "planning-run-1");

    await expect(ensurePlanningWorktree({ checkoutRoot: repository, worktree, planningRepositorySha }))
      .resolves.toBe(worktree);
    expect((await git(worktree, ["branch", "--show-current"])).stdout.trim()).toBe("");
    await expect(assertPlanningWorktreeUnchanged(worktree, planningRepositorySha)).resolves.toBeUndefined();

    await writeFile(path.join(worktree, "planner-output.tmp"), "unauthorized write\n");
    await expect(assertPlanningWorktreeUnchanged(worktree, planningRepositorySha))
      .rejects.toThrow(/Read-only planning left repository changes behind/);
    await rm(path.join(worktree, "planner-output.tmp"));

    await expect(releasePlanningWorktree({ checkoutRoot: repository, worktree, planningRepositorySha }))
      .resolves.toBeUndefined();
  });
});

async function git(cwd: string, args: string[]) {
  return await execFileAsync("git", args, { cwd });
}
