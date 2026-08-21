import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { canonicalHash } from "@mission-control/shared";
import {
  runSandboxSupervisor,
} from "../sandboxSupervisor.js";
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

describe("sandbox supervisor candidate capture", () => {
  it("includes newly created files in the patch and changed-file set", async () => {
    // Regression: `git diff <sourceSha>` cannot see untracked paths, so a
    // harness that ADDED a file produced a bundle carrying only the modified
    // files. The host's changed-file cross-check is derived from the same
    // patch, so it could not detect the omission — the control plane published
    // a pull request containing a broken half-change.
    const repository = await mkdtemp(path.join(tmpdir(), "mc-sandbox-supervisor-"));
    cleanup.push(repository);
    await git(repository, ["init", "-b", "main"]);
    await git(repository, ["config", "user.name", "Test"]);
    await git(repository, ["config", "user.email", "test@example.com"]);
    await mkdir(path.join(repository, "src"), { recursive: true });
    await writeFile(path.join(repository, "src", "a.ts"), "export const a = 1;\n");
    await writeFile(path.join(repository, ".gitignore"), "ignored/\n");
    await git(repository, ["add", "."]);
    await git(repository, ["commit", "-m", "Initial"]);
    const sourceSha = (await git(repository, ["rev-parse", "HEAD"])).stdout.trim();

    const outputPath = path.join(repository, "result.json");
    const executionManifest = buildManifest({ sourceSha, profileDigest: "sha256:profile" });
    const manifestDigest = `sha256:${canonicalHash(executionManifest)}`;

    // The "executor" edits a tracked file, creates a new one, and drops an
    // ignored artefact that must stay out of the candidate.
    const script = [
      "set -eu",
      `printf 'export const a = 2;\\n' > ${JSON.stringify(path.join(repository, "src", "a.ts"))}`,
      `printf 'export const b = 1;\\n' > ${JSON.stringify(path.join(repository, "src", "b.ts"))}`,
      `mkdir -p ${JSON.stringify(path.join(repository, "ignored"))}`,
      `printf 'junk\\n' > ${JSON.stringify(path.join(repository, "ignored", "build.log"))}`,
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
    expect(bundle.changedFiles).toEqual(["src/a.ts", "src/b.ts"]);
    expect(bundle.changedFiles).not.toContain("ignored/build.log");
    expect(bundle.diff.filesChanged).toBe(2);

    const patch = Buffer.from(bundle.patch.content, "base64").toString("utf8");
    expect(patch).toContain("src/b.ts");
    expect(patch).toContain("export const b = 1;");

    const persisted = JSON.parse(await readFile(outputPath, "utf8"));
    expect(persisted.changedFiles).toEqual(["src/a.ts", "src/b.ts"]);
  });

  it("represents deletions and refuses paths outside the frozen scope", async () => {
    // Staging is bounded by `repository.allowedPaths`. A harness that deletes a
    // tracked file must have that deletion carried into the candidate, and a
    // file it writes outside the frozen scope must never enter the bundle —
    // otherwise `git add -A` would widen the WorkOrder's authorized surface.
    const repository = await mkdtemp(path.join(tmpdir(), "mc-sandbox-scope-"));
    cleanup.push(repository);
    await git(repository, ["init", "-b", "main"]);
    await git(repository, ["config", "user.name", "Test"]);
    await git(repository, ["config", "user.email", "test@example.com"]);
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
      `rm ${JSON.stringify(path.join(repository, "src", "gone.ts"))}`,
      `printf 'export const outside = 2;\\n' > ${JSON.stringify(path.join(repository, "outside", "sneaky.ts"))}`,
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

    // The deletion inside the frozen scope is represented.
    expect(bundle.changedFiles).toContain("src/gone.ts");
    expect(Buffer.from(bundle.patch.content, "base64").toString("utf8")).toContain("deleted file");
    // The untracked file written outside the frozen scope is not.
    expect(bundle.changedFiles).not.toContain("outside/sneaky.ts");
  });

  it("keeps the standalone remote supervisor equivalent to the in-process one", async () => {
    // The remote VM executes this generated source, not the module above. Run
    // it for real against a temp repository rather than string-matching the
    // source, so an equivalent refactor cannot fail and a broken one cannot pass.
    const repository = await mkdtemp(path.join(tmpdir(), "mc-standalone-supervisor-"));
    cleanup.push(repository);
    await git(repository, ["init", "-b", "main"]);
    await git(repository, ["config", "user.name", "Test"]);
    await git(repository, ["config", "user.email", "test@example.com"]);
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
        args: ["-c", `printf 'export const b = 1;\\n' > ${JSON.stringify(path.join(repository, "src", "b.ts"))}; printf '%s' '{"schema":"factory-result/v1","status":"COMPLETED","summary":"done","completedAcceptanceCriterionIds":[],"incompleteAcceptanceCriterionIds":[],"unknownAcceptanceCriterionIds":[],"verificationCommands":[],"knownRisks":[],"nextAction":"review"}'`],
        timeoutMs: 60_000,
      },
      environment: {},
    }), "utf8");

    await execFileAsync(process.execPath, [supervisorPath, configPath], { cwd: repository });
    const bundle = JSON.parse(await readFile(outputPath, "utf8"));
    expect(bundle.changedFiles).toContain("src/b.ts");
    expect(Buffer.from(bundle.patch.content, "base64").toString("utf8")).toContain("export const b = 1;");
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
    // `intent` and the full harness identity became mandatory when mainline
    // added acceptance-criterion accounting to the supervisor contract; the
    // fixture tracks the contract rather than pinning an older shape.
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
