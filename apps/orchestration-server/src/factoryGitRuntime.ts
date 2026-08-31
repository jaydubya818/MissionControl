import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { assertCanonicalWorktreeBoundary, assertWorktreeBoundary } from "./factoryPathScope.js";
import { ensureFactoryWorkspaceOwnership, type FactoryWorkspaceOwner } from "./factoryWorkspaceOwnership.js";

const execFileAsync = promisify(execFile);

type DependencyInstaller = (worktree: string) => Promise<void>;

export async function ensureFactoryWorktree(input: {
  checkoutRoot: string;
  worktree: string;
  branch: string;
  baseSha: string;
  ownership?: FactoryWorkspaceOwner;
}) {
  const lexicalBoundary = assertWorktreeBoundary(input.checkoutRoot, input.worktree);
  assertFactoryBranch(input.branch);
  const repositoryRoot = path.resolve((await runGit(lexicalBoundary.checkoutRoot, ["rev-parse", "--show-toplevel"])).stdout.trim());
  if (await realpath(repositoryRoot) !== await realpath(lexicalBoundary.checkoutRoot)) throw new Error("Factory host checkout root does not match the Git repository root.");
  const boundary = await assertCanonicalWorktreeBoundary(input.checkoutRoot, input.worktree, { createRoot: true });
  if (!/^[a-f0-9]{40,64}$/i.test(input.baseSha)
    || !await gitSucceeds(boundary.checkoutRoot, ["cat-file", "-e", `${input.baseSha}^{commit}`])) {
    throw new Error("Factory worktree requires the exact frozen base commit to exist locally.");
  }
  const worktreeExists = await exists(boundary.worktree);
  if (input.ownership) {
    await ensureFactoryWorkspaceOwnership({ owner: input.ownership, allowCreate: !worktreeExists });
  }

  if (worktreeExists) {
    const existingRoot = path.resolve((await runGit(boundary.worktree, ["rev-parse", "--show-toplevel"])).stdout.trim());
    const existingBranch = (await runGit(boundary.worktree, ["branch", "--show-current"])).stdout.trim();
    if (await realpath(existingRoot) !== await realpath(boundary.worktree) || existingBranch !== input.branch) {
      throw new Error("Existing Factory worktree does not match the frozen attempt branch.");
    }
    if (!await gitSucceeds(boundary.worktree, ["merge-base", "--is-ancestor", input.baseSha, "HEAD"])) {
      throw new Error("Existing Factory worktree does not descend from the frozen base commit.");
    }
    return boundary.worktree;
  }

  const localBranchExists = await gitSucceeds(boundary.checkoutRoot, ["show-ref", "--verify", "--quiet", `refs/heads/${input.branch}`]);
  if (localBranchExists) {
    await runGit(boundary.checkoutRoot, ["worktree", "add", boundary.worktree, input.branch]);
    if (!await gitSucceeds(boundary.worktree, ["merge-base", "--is-ancestor", input.baseSha, "HEAD"])) {
      throw new Error("Existing Factory branch does not descend from the frozen base commit.");
    }
    return boundary.worktree;
  }
  await runGit(boundary.checkoutRoot, ["worktree", "add", "-b", input.branch, boundary.worktree, input.baseSha]);
  return boundary.worktree;
}

/**
 * Materialize a frozen pnpm dependency graph before an executor or verifier
 * starts. Linked Git worktrees intentionally do not inherit node_modules from
 * the host checkout; without this step, an otherwise valid Attempt can spend
 * its model budget only to discover that deterministic verification cannot
 * start.
 *
 * Installation is offline, lockfile-frozen, and lifecycle-script-free. The
 * Git status must be byte-for-byte unchanged so dependency preparation cannot
 * become an undeclared source mutation.
 */
export async function prepareFactoryDependencies(
  input: { worktree: string },
  install: DependencyInstaller = installFrozenPnpmDependencies,
) {
  if (!await exists(path.join(input.worktree, "pnpm-lock.yaml"))) {
    return { status: "NOT_REQUIRED" as const, packageManager: null };
  }
  const before = (await runGit(input.worktree, ["status", "--porcelain=v1", "-z", "--untracked-files=all"])).stdout;
  await install(input.worktree);
  const after = (await runGit(input.worktree, ["status", "--porcelain=v1", "-z", "--untracked-files=all"])).stdout;
  if (after !== before) {
    throw new Error("Frozen dependency preparation changed repository source state.");
  }
  return { status: "PREPARED" as const, packageManager: "pnpm" as const };
}

async function installFrozenPnpmDependencies(worktree: string) {
  try {
    await execFileAsync("pnpm", [
      "install",
      "--offline",
      "--frozen-lockfile",
      "--ignore-scripts",
      "--reporter=silent",
    ], {
      cwd: worktree,
      env: {
        ...process.env,
        CI: "1",
        npm_config_ignore_scripts: "true",
        NPM_CONFIG_IGNORE_SCRIPTS: "true",
      },
      timeout: 300_000,
      maxBuffer: 4 * 1024 * 1024,
    });
  } catch (error: any) {
    const detail = `${error?.stderr ?? error?.stdout ?? error?.message ?? "unknown error"}`.trim();
    throw new Error(`Factory dependency preparation failed in frozen offline mode${detail ? `: ${detail.slice(-2_000)}` : "."}`);
  }
}

export async function listChangedFiles(worktree: string, baseSha?: string) {
  const [tracked, untracked, committed] = await Promise.all([
    runGit(worktree, ["diff", "--name-only", "-z", "HEAD"]),
    runGit(worktree, ["ls-files", "--others", "-z", "--exclude-standard"]),
    baseSha
      ? runGit(worktree, ["diff", "--name-only", "-z", `${baseSha}...HEAD`])
      : Promise.resolve({ stdout: "", stderr: "" }),
  ]);
  return Array.from(new Set([...splitNull(tracked.stdout), ...splitNull(untracked.stdout), ...splitNull(committed.stdout)])).sort();
}

export async function inspectCandidateChange(worktree: string, baseRevisionOrDefaultBranch: string, exactBaseRevision?: string) {
  if (exactBaseRevision && !/^[0-9a-f]{40,64}$/.test(exactBaseRevision)) {
    throw new Error("Exact candidate base revision is invalid.");
  }
  const baseReference = exactBaseRevision
    ?? (/^[0-9a-f]{40,64}$/i.test(baseRevisionOrDefaultBranch)
      ? baseRevisionOrDefaultBranch
      : await resolveBaseReference(worktree, baseRevisionOrDefaultBranch));
  const [sourceRevision, candidateRevision, treeRevision, changed, deleted, numstat, diff] = await Promise.all([
    runGit(worktree, ["rev-parse", baseReference]),
    runGit(worktree, ["rev-parse", "HEAD"]),
    runGit(worktree, ["rev-parse", "HEAD^{tree}"]),
    runGit(worktree, ["diff", "--name-only", "-z", `${baseReference}...HEAD`]),
    runGit(worktree, ["diff", "--diff-filter=D", "--name-only", "-z", `${baseReference}...HEAD`]),
    runGit(worktree, ["diff", "--numstat", `${baseReference}...HEAD`]),
    runGit(worktree, ["diff", "--no-ext-diff", "--unified=3", `${baseReference}...HEAD`]),
  ]);
  let linesAdded = 0;
  let linesDeleted = 0;
  for (const line of numstat.stdout.split("\n")) {
    const [added, removed] = line.split("\t");
    if (/^\d+$/.test(added ?? "")) linesAdded += Number(added);
    if (/^\d+$/.test(removed ?? "")) linesDeleted += Number(removed);
  }
  return {
    sourceRevision: sourceRevision.stdout.trim(),
    candidateRevision: candidateRevision.stdout.trim(),
    treeRevision: treeRevision.stdout.trim(),
    changedFiles: splitNull(changed.stdout).sort(),
    deletedFiles: splitNull(deleted.stdout).sort(),
    linesAdded,
    linesDeleted,
    diff: diff.stdout,
  };
}

export async function ensureVerificationWorktree(input: {
  checkoutRoot: string;
  worktree: string;
  candidateSha: string;
  treeSha: string;
}) {
  const boundary = assertWorktreeBoundary(input.checkoutRoot, input.worktree);
  const repositoryRoot = path.resolve((await runGit(boundary.checkoutRoot, ["rev-parse", "--show-toplevel"])).stdout.trim());
  if (await realpath(repositoryRoot) !== await realpath(boundary.checkoutRoot)) {
    throw new Error("Verification host checkout root does not match the Git repository root.");
  }
  await mkdir(boundary.worktreeRoot, { recursive: true });
  if (!await exists(boundary.worktree)) {
    await runGit(boundary.checkoutRoot, ["worktree", "add", "--detach", boundary.worktree, input.candidateSha]);
  }
  const [root, head, tree, status] = await Promise.all([
    runGit(boundary.worktree, ["rev-parse", "--show-toplevel"]),
    runGit(boundary.worktree, ["rev-parse", "HEAD"]),
    runGit(boundary.worktree, ["rev-parse", "HEAD^{tree}"]),
    runGit(boundary.worktree, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]),
  ]);
  if (await realpath(path.resolve(root.stdout.trim())) !== await realpath(boundary.worktree)) {
    throw new Error("Verification worktree is not the frozen attempt-specific root.");
  }
  if (head.stdout.trim() !== input.candidateSha || tree.stdout.trim() !== input.treeSha || status.stdout.length > 0) {
    throw new Error("Verification worktree does not match the immutable candidate commit and tree.");
  }
  return boundary.worktree;
}

export async function ensurePlanningWorktree(input: {
  checkoutRoot: string;
  worktree: string;
  planningRepositorySha: string;
}) {
  const lexicalBoundary = assertWorktreeBoundary(input.checkoutRoot, input.worktree);
  const repositoryRoot = path.resolve((await runGit(lexicalBoundary.checkoutRoot, ["rev-parse", "--show-toplevel"])).stdout.trim());
  if (await realpath(repositoryRoot) !== await realpath(lexicalBoundary.checkoutRoot)) {
    throw new Error("Planning host checkout root does not match the Git repository root.");
  }
  const boundary = await assertCanonicalWorktreeBoundary(input.checkoutRoot, input.worktree, { createRoot: true });
  if (!/^[a-f0-9]{40,64}$/i.test(input.planningRepositorySha)
    || !await gitSucceeds(boundary.checkoutRoot, ["cat-file", "-e", `${input.planningRepositorySha}^{commit}`])) {
    throw new Error("Planning requires the exact frozen repository commit to exist locally.");
  }
  if (!await exists(boundary.worktree)) {
    await runGit(boundary.checkoutRoot, ["worktree", "add", "--detach", boundary.worktree, input.planningRepositorySha]);
  }
  await assertPlanningWorktreeUnchanged(boundary.worktree, input.planningRepositorySha);
  const branch = (await runGit(boundary.worktree, ["branch", "--show-current"])).stdout.trim();
  if (branch) throw new Error("Planning worktree must remain detached from mutable branch state.");
  return boundary.worktree;
}

export async function assertPlanningWorktreeUnchanged(worktree: string, planningRepositorySha: string) {
  const [head, status] = await Promise.all([
    runGit(worktree, ["rev-parse", "HEAD"]),
    runGit(worktree, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]),
  ]);
  if (head.stdout.trim() !== planningRepositorySha) {
    throw new Error("Planning worktree moved away from the frozen repository revision.");
  }
  if (status.stdout.length > 0) {
    throw new Error("Read-only planning left repository changes behind.");
  }
}

export async function releasePlanningWorktree(input: {
  checkoutRoot: string;
  worktree: string;
  planningRepositorySha: string;
}) {
  const boundary = await assertCanonicalWorktreeBoundary(input.checkoutRoot, input.worktree, { requireWorktree: true });
  await assertPlanningWorktreeUnchanged(boundary.worktree, input.planningRepositorySha);
  await runGit(boundary.checkoutRoot, ["worktree", "remove", boundary.worktree]);
}

export async function assertFactoryCandidateUnchanged(worktree: string, expectedHead: string) {
  const [head, status] = await Promise.all([
    runGit(worktree, ["rev-parse", "HEAD"]),
    runGit(worktree, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]),
  ]);
  if (head.stdout.trim() !== expectedHead) throw new Error("Verification changed the candidate commit. Pull-request creation was blocked.");
  if (status.stdout.length > 0) throw new Error("Verification left repository changes behind. Evidence must be produced from the exact clean candidate commit.");
}

export async function commitFactoryChanges(input: {
  worktree: string;
  changedFiles: string[];
  title: string;
}) {
  if (input.changedFiles.length === 0) throw new Error("Factory attempt produced no changed files.");
  const dirty = (await runGit(input.worktree, ["status", "--porcelain=v1", "-z", "--untracked-files=all"])).stdout.length > 0;
  if (!dirty) return await currentHead(input.worktree);
  await runGit(input.worktree, ["add", "--all", "--", ...input.changedFiles]);
  if (await gitSucceeds(input.worktree, ["diff", "--cached", "--quiet"])) {
    throw new Error("Factory attempt produced no committable changes.");
  }
  // Preserve the repository operator's configured identity. Factory execution
  // provenance belongs in Attempt/evidence records, not in Git authorship.
  await runGit(input.worktree, ["commit", "-m", input.title.slice(0, 200)]);
  return (await runGit(input.worktree, ["rev-parse", "HEAD"])).stdout.trim();
}

export async function pushFactoryBranch(input: {
  worktree: string;
  repository: string;
  branch: string;
  installationToken: string;
}) {
  assertFactoryBranch(input.branch);
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(input.repository)) throw new Error("GitHub repository identity is invalid.");
  const helperDirectory = await mkdtemp(path.join(tmpdir(), "mc-git-askpass-"));
  const helperPath = path.join(helperDirectory, "askpass.sh");
  try {
    await writeFile(helperPath, [
      "#!/bin/sh",
      "case \"$1\" in",
      "  *Username*) printf '%s\\n' 'x-access-token' ;;",
      "  *) printf '%s\\n' \"$MC_GITHUB_INSTALLATION_TOKEN\" ;;",
      "esac",
      "",
    ].join("\n"), { encoding: "utf8", mode: 0o700 });
    await chmod(helperPath, 0o700);
    await runGit(input.worktree, [
      "push",
      `https://github.com/${input.repository}.git`,
      `HEAD:refs/heads/${input.branch}`,
    ], {
      GIT_ASKPASS: helperPath,
      GIT_TERMINAL_PROMPT: "0",
      MC_GITHUB_INSTALLATION_TOKEN: input.installationToken,
    });
  } finally {
    await rm(helperDirectory, { recursive: true, force: true });
  }
}

export async function currentHead(worktree: string) {
  return (await runGit(worktree, ["rev-parse", "HEAD"])).stdout.trim();
}

export async function createFactorySourceBundle(worktree: string, sourceSha: string) {
  if (!/^[a-f0-9]{40,64}$/i.test(sourceSha)) throw new Error("Factory source SHA is invalid.");
  const observed = await currentHead(worktree);
  if (observed !== sourceSha) throw new Error("Factory worktree does not match the frozen source SHA before sandbox upload.");
  const result = await execFileAsync("git", ["bundle", "create", "-", "HEAD"], {
    cwd: worktree,
    env: process.env,
    encoding: "buffer",
    maxBuffer: 32 * 1024 * 1024,
  });
  return Buffer.from(result.stdout);
}

export async function materializeRemoteCandidate(input: {
  worktree: string;
  sourceSha: string;
  patch: Buffer;
}) {
  if (!/^[a-f0-9]{40,64}$/i.test(input.sourceSha)) throw new Error("Remote candidate source SHA is invalid.");
  const [head, status] = await Promise.all([
    currentHead(input.worktree),
    runGit(input.worktree, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]),
  ]);
  if (head !== input.sourceSha) throw new Error("Host worktree moved after the remote sandbox source was frozen.");
  if (status.stdout.length > 0) throw new Error("Host worktree is not clean before remote result materialization.");
  if (input.patch.byteLength === 0) return;
  const patchDirectory = await mkdtemp(path.join(tmpdir(), "mc-factory-patch-"));
  const patchPath = path.join(patchDirectory, "candidate.patch");
  try {
    await writeFile(patchPath, input.patch, { mode: 0o600 });
    await execFileAsync("git", ["apply", "--binary", "--whitespace=nowarn", patchPath], {
      cwd: input.worktree, env: process.env, maxBuffer: 20 * 1024 * 1024,
    });
  } catch (cause: any) {
    const detail = String(cause?.stderr ?? cause?.message ?? "git apply failed").slice(0, 1_000);
    throw new Error(`Remote candidate patch could not be materialized: ${detail}`);
  } finally {
    await rm(patchDirectory, { recursive: true, force: true });
  }
}

function assertFactoryBranch(branch: string) {
  if (!/^mc\/[A-Za-z0-9._/-]+$/.test(branch) || branch.includes("..") || branch.endsWith("/")) {
    throw new Error("Factory branch must use a safe server-owned mc/ namespace.");
  }
}

async function runGit(cwd: string, args: string[], additionalEnv?: Record<string, string>) {
  try {
    return await execFileAsync("git", args, {
      cwd,
      env: { ...process.env, ...additionalEnv },
      maxBuffer: 20 * 1024 * 1024,
    });
  } catch (cause: any) {
    const detail = String(cause?.stderr ?? cause?.message ?? "Git command failed")
      .replace(/(authorization|token|password)\s*[:=]\s*\S+/gi, "$1=[REDACTED]")
      .slice(0, 1_000);
    throw new Error(`Git operation failed: ${detail}`);
  }
}

async function gitSucceeds(cwd: string, args: string[]) {
  try {
    await execFileAsync("git", args, { cwd, env: process.env, maxBuffer: 2 * 1024 * 1024 });
    return true;
  } catch {
    return false;
  }
}

async function exists(candidate: string) {
  return await stat(candidate).then(() => true).catch(() => false);
}

function splitNull(value: string) {
  return value.split("\0").map((item) => item.trim()).filter(Boolean);
}

async function resolveBaseReference(worktree: string, defaultBranch: string) {
  return await gitSucceeds(worktree, ["show-ref", "--verify", "--quiet", `refs/remotes/origin/${defaultBranch}`])
    ? `origin/${defaultBranch}`
    : defaultBranch;
}
