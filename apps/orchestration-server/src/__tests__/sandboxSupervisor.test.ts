import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { canonicalHash } from "@mission-control/shared";
import { runSandboxSupervisor } from "../sandboxSupervisor.js";
import { standaloneRemoteSupervisorSource } from "../standaloneRemoteSupervisorSource.js";
import { SANDBOX_SUPERVISOR_VERSION } from "../sandboxProvider.js";

const execFileAsync = promisify(execFile);
const cleanup: string[] = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function git(cwd: string, args: string[]) {
  return await execFileAsync("git", args, { cwd });
}

async function initRepository(prefix: string) {
  const repository = await mkdtemp(path.join(tmpdir(), prefix));
  cleanup.push(repository);
  await git(repository, ["init", "-b", "main"]);
  await git(repository, ["config", "user.name", "Test"]);
  await git(repository, ["config", "user.email", "test@example.com"]);
  return repository;
}

describe("sandbox supervisor candidate capture", () => {
  it("includes staged, unstaged, and newly created files, and excludes ignored ones", async () => {
    // Regression: `git diff <sourceSha>` cannot see untracked paths, so a
    // harness that ADDED a file produced a bundle carrying only the modified
    // files. The host's changed-file cross-check is derived from the same
    // patch, so it could not detect the omission — the control plane published
    // a pull request containing a broken half-change.
    const repository = await initRepository("mc-sandbox-supervisor-");
    await mkdir(path.join(repository, "src"), { recursive: true });
    await writeFile(path.join(repository, "src", "staged.ts"), "export const staged = 1;\n");
    await writeFile(path.join(repository, "src", "unstaged.ts"), "export const unstaged = 1;\n");
    await writeFile(path.join(repository, ".gitignore"), "ignored/\n");
    await git(repository, ["add", "."]);
    await git(repository, ["commit", "-m", "Initial"]);
    const sourceSha = (await git(repository, ["rev-parse", "HEAD"])).stdout.trim();

    const outputPath = path.join(repository, "result.json");
    const executionManifest = buildManifest({ sourceSha, profileDigest: "sha256:profile" });
    const manifestDigest = `sha256:${canonicalHash(executionManifest)}`;

    // The "executor" leaves the repository in all three states at once:
    // a change it staged itself, a change it left unstaged, a file it created
    // and never added, plus an ignored artefact that must stay out.
    const script = [
      "set -eu",
      `cd ${JSON.stringify(repository)}`,
      "printf 'export const staged = 2;\\n' > src/staged.ts",
      "git add src/staged.ts",
      "printf 'export const unstaged = 2;\\n' > src/unstaged.ts",
      "printf 'export const created = 1;\\n' > src/created.ts",
      "mkdir -p ignored",
      "printf 'junk\\n' > ignored/build.log",
      `printf '%s' '{"schema":"factory-result/v1","status":"COMPLETED","summary":"done","completedAcceptanceCriterionIds":[],"incompleteAcceptanceCriterionIds":[],"unknownAcceptanceCriterionIds":[],"verificationCommands":[],"knownRisks":[],"nextAction":"review"}'`,
    ].join("\n");

    const bundle = await runSandboxSupervisor({
      executionManifest,
      attemptId: "attempt-1",
      workOrderId: "work-order-1",
      workOrderRevisionNumber: 1,
      workflowRunId: "run-1",
      manifestDigest,
      profileDigest: "sha256:profile",
      sourceSha,
      environmentDescriptor: { provider: "FAKE", image: "node:20" },
      repositoryRoot: repository,
      outputPath,
      executor: { command: "bash", args: ["-c", script], timeoutMs: 60_000 },
      environment: {},
    });

    expect(bundle.status).toBe("COMPLETED");
    expect(bundle.changedFiles).toEqual(["src/created.ts", "src/staged.ts", "src/unstaged.ts"]);
    expect(bundle.changedFiles).not.toContain("ignored/build.log");
    expect(bundle.diff.filesChanged).toBe(3);

    const patch = Buffer.from(bundle.patch.content, "base64").toString("utf8");
    expect(patch).toContain("export const staged = 2;");
    expect(patch).toContain("export const unstaged = 2;");
    expect(patch).toContain("export const created = 1;");
    expect(patch).not.toContain("ignored/build.log");

    const persisted = JSON.parse(await readFile(outputPath, "utf8"));
    expect(persisted.changedFiles).toEqual(["src/created.ts", "src/staged.ts", "src/unstaged.ts"]);
  });

  it("represents deletions and refuses paths outside the frozen scope", async () => {
    // Staging is bounded by `repository.allowedPaths`. A harness that deletes a
    // tracked file must have that deletion carried into the candidate, and a
    // file it writes outside the frozen scope must never enter the bundle —
    // otherwise `git add -A` would widen the WorkOrder's authorized surface.
    const repository = await initRepository("mc-sandbox-scope-");
    await mkdir(path.join(repository, "src"), { recursive: true });
    await mkdir(path.join(repository, "outside"), { recursive: true });
    await writeFile(path.join(repository, "src", "a.ts"), "export const a = 1;\n");
    await writeFile(path.join(repository, "src", "gone.ts"), "export const gone = 1;\n");
    await writeFile(path.join(repository, "outside", "keep.ts"), "export const keep = 1;\n");
    await git(repository, ["add", "."]);
    await git(repository, ["commit", "-m", "Initial"]);
    const sourceSha = (await git(repository, ["rev-parse", "HEAD"])).stdout.trim();

    const outputPath = path.join(repository, "result.json");
    const executionManifest = buildManifest({ sourceSha, profileDigest: "sha256:profile" });
    const manifestDigest = `sha256:${canonicalHash(executionManifest)}`;

    const script = [
      "set -eu",
      `cd ${JSON.stringify(repository)}`,
      "rm src/gone.ts",
      "printf 'export const sneaky = 2;\\n' > outside/sneaky.ts",
      `printf '%s' '{"schema":"factory-result/v1","status":"COMPLETED","summary":"done","completedAcceptanceCriterionIds":[],"incompleteAcceptanceCriterionIds":[],"unknownAcceptanceCriterionIds":[],"verificationCommands":[],"knownRisks":[],"nextAction":"review"}'`,
    ].join("\n");

    const bundle = await runSandboxSupervisor({
      executionManifest,
      attemptId: "attempt-1",
      workOrderId: "work-order-1",
      workOrderRevisionNumber: 1,
      workflowRunId: "run-1",
      manifestDigest,
      profileDigest: "sha256:profile",
      sourceSha,
      environmentDescriptor: { provider: "FAKE", image: "node:20" },
      repositoryRoot: repository,
      outputPath,
      executor: { command: "bash", args: ["-c", script], timeoutMs: 60_000 },
      environment: {},
    });

    expect(bundle.changedFiles).toContain("src/gone.ts");
    expect(Buffer.from(bundle.patch.content, "base64").toString("utf8")).toContain("deleted file");
    expect(bundle.changedFiles).not.toContain("outside/sneaky.ts");
  });

  it("keeps the standalone remote supervisor equivalent to the in-process one", async () => {
    // The remote VM executes this generated source, not the module above. Run
    // it for real against a temp repository rather than string-matching the
    // source, so an equivalent refactor cannot fail and a broken one cannot pass.
    const repository = await initRepository("mc-standalone-supervisor-");
    await mkdir(path.join(repository, "src"), { recursive: true });
    await writeFile(path.join(repository, "src", "a.ts"), "export const a = 1;\n");
    await git(repository, ["add", "."]);
    await git(repository, ["commit", "-m", "Initial"]);
    const sourceSha = (await git(repository, ["rev-parse", "HEAD"])).stdout.trim();

    const executionManifest = buildManifest({ sourceSha, profileDigest: "sha256:profile" });
    const manifestDigest = `sha256:${canonicalHash(executionManifest)}`;
    const outputPath = path.join(repository, "standalone-result.json");
    const configPath = path.join(repository, "standalone-config.json");
    const supervisorPath = path.join(repository, "standalone-supervisor.mjs");

    await writeFile(supervisorPath, standaloneRemoteSupervisorSource(), "utf8");
    await writeFile(configPath, JSON.stringify({
      executionManifest,
      attemptId: "attempt-1",
      workOrderId: "work-order-1",
      workOrderRevisionNumber: 1,
      workflowRunId: "run-1",
      manifestDigest,
      profileDigest: "sha256:profile",
      sourceSha,
      environmentDescriptor: { provider: "FAKE", image: "node:20" },
      repositoryRoot: repository,
      outputPath,
      executor: {
        command: "bash",
        args: ["-c", `cd ${JSON.stringify(repository)}; printf 'export const created = 1;\\n' > src/created.ts; printf '%s' '{"schema":"factory-result/v1","status":"COMPLETED","summary":"done","completedAcceptanceCriterionIds":[],"incompleteAcceptanceCriterionIds":[],"unknownAcceptanceCriterionIds":[],"verificationCommands":[],"knownRisks":[],"nextAction":"review"}'`],
        timeoutMs: 60_000,
      },
      environment: {},
    }), "utf8");

    await execFileAsync(process.execPath, [supervisorPath, configPath], { cwd: repository });
    const bundle = JSON.parse(await readFile(outputPath, "utf8"));
    expect(bundle.changedFiles).toContain("src/created.ts");
    expect(Buffer.from(bundle.patch.content, "base64").toString("utf8")).toContain("export const created = 1;");
  });
});

function buildManifest(input: { sourceSha: string; profileDigest: string }) {
  return {
    version: "factory-execution-manifest/v1",
    causation: {
      workOrderId: "work-order-1",
      workOrderRevisionNumber: 1,
      workflowRunId: "run-1",
    },
    repository: { baseSha: input.sourceSha, allowedPaths: ["src"] },
    intent: { acceptanceCriterionIds: [] },
    sandbox: {
      profileDigest: input.profileDigest,
      supervisorVersion: SANDBOX_SUPERVISOR_VERSION,
      credentialGrants: [],
    },
    harness: {
      pullRequestAuthority: "CONTROL_PLANE_ONLY",
      executionBackend: "remote-sandbox",
      adapter: "codex",
      version: "factory-harness/v1",
      harnessId: "harness-test",
      harnessVersion: "1.0.0",
      provider: "openrouter",
      model: "test-model",
    },
  };
}
