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
import {
  CODEX_V1_HARNESS_MANIFEST,
  CODEX_V1_RUNTIME_ARTIFACT,
  harnessCapabilityManifestDigest,
  harnessRuntimeArtifactDigest,
} from "@mission-control/workflow-engine";
import {
  executionProfileDigest,
  executionProfileQualificationDigest,
  executionProfileQualificationSnapshot,
  executionProfileSnapshot,
} from "../../../../convex/lib/executionProfile.js";

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

  it("reads V2 model/backend bindings and rejects a tampered runtime artifact before execution", async () => {
    const repository = await initRepository("mc-sandbox-supervisor-v2-");
    await mkdir(path.join(repository, "src"), { recursive: true });
    await writeFile(path.join(repository, "src", "a.ts"), "export const a = 1;\n");
    await git(repository, ["add", "."]);
    await git(repository, ["commit", "-m", "Initial"]);
    const sourceSha = (await git(repository, ["rev-parse", "HEAD"])).stdout.trim();
    const executionManifest = buildV2Manifest({ sourceSha, profileDigest: "sha256:profile" });
    const outputPath = path.join(repository, "result.json");
    const bundle = await runSandboxSupervisor({
      executionManifest,
      attemptId: "attempt-1",
      workOrderId: "work-order-1",
      workOrderRevisionNumber: 1,
      workflowRunId: "run-1",
      manifestDigest: `sha256:${canonicalHash(executionManifest)}`,
      profileDigest: "sha256:profile",
      sourceSha,
      environmentDescriptor: { provider: "FAKE", image: "node:20" },
      repositoryRoot: repository,
      outputPath,
      executor: {
        command: process.execPath,
        args: ["-e", `process.stdout.write(${JSON.stringify(JSON.stringify(successfulResult()))})`],
        timeoutMs: 60_000,
        ...v2ExecutorBinding(executionManifest),
      },
      environment: { OPENAI_BASE_URL: "https://openrouter.ai/api/v1" },
    });
    expect(bundle.harness).toMatchObject({
      provider: "openai",
      model: "gpt-5.6-terra",
      modelRouteDigest: executionManifest.modelRoute.routeDigest,
      providerRoute: "openrouter",
    });

    const tampered = structuredClone(executionManifest);
    tampered.harness.runtimeArtifact.executableSha256 = "f".repeat(64);
    const marker = path.join(repository, "executor-ran");
    await expect(runSandboxSupervisor({
      executionManifest: tampered,
      attemptId: "attempt-1",
      workOrderId: "work-order-1",
      workOrderRevisionNumber: 1,
      workflowRunId: "run-1",
      manifestDigest: `sha256:${canonicalHash(tampered)}`,
      profileDigest: "sha256:profile",
      sourceSha,
      environmentDescriptor: { provider: "FAKE", image: "node:20" },
      repositoryRoot: repository,
      outputPath,
      executor: {
        command: process.execPath,
        args: ["-e", `require("node:fs").writeFileSync(${JSON.stringify(marker)}, "ran")`],
        timeoutMs: 60_000,
        ...v2ExecutorBinding(tampered),
      },
      environment: { OPENAI_BASE_URL: "https://openrouter.ai/api/v1" },
    })).rejects.toThrow(/invalid model, harness, or runtime bindings/);
    await expect(readFile(marker)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("admits V3 only with a current exact Execution Profile before running the executor", async () => {
    const repository = await initRepository("mc-sandbox-supervisor-v3-");
    await mkdir(path.join(repository, "src"), { recursive: true });
    await writeFile(path.join(repository, "src", "a.ts"), "export const a = 1;\n");
    await git(repository, ["add", "."]);
    await git(repository, ["commit", "-m", "Initial"]);
    const sourceSha = (await git(repository, ["rev-parse", "HEAD"])).stdout.trim();
    const executionManifest = buildV3Manifest({ sourceSha, approvedAt: 1, validUntil: 2 });
    const marker = path.join(repository, "executor-ran");
    const execute = async (
      manifest: ReturnType<typeof buildV3Manifest>,
      profileAdmittedAt: number | undefined = 1,
    ) => runSandboxSupervisor({
      executionManifest: manifest,
      attemptId: "attempt-1",
      workOrderId: "work-order-1",
      workOrderRevisionNumber: 1,
      workflowRunId: "run-1",
      manifestDigest: `sha256:${canonicalHash(manifest)}`,
      profileAdmittedAt,
      profileDigest: manifest.sandbox.profileDigest,
      sourceSha,
      environmentDescriptor: { provider: "FAKE", image: "node:20" },
      repositoryRoot: repository,
      outputPath: path.join(repository, "result.json"),
      executor: {
        command: process.execPath,
        args: ["-e", `require("node:fs").writeFileSync(${JSON.stringify(marker)}, "ran"); process.stdout.write(${JSON.stringify(JSON.stringify(successfulResult()))})`],
        timeoutMs: 60_000,
        ...v2ExecutorBinding(manifest),
      },
      environment: { OPENAI_BASE_URL: "https://openrouter.ai/api/v1" },
    });

    await expect(execute(executionManifest)).resolves.toMatchObject({ status: "COMPLETED" });
    expect(await readFile(marker, "utf8")).toBe("ran");
    await rm(marker);

    const substituted = structuredClone(executionManifest);
    substituted.executionProfile.profileSnapshot.harness.adapter = "substituted-harness";
    await expect(execute(substituted)).rejects.toThrow(/invalid, expired, or substituted Execution Profile/);
    await expect(readFile(marker)).rejects.toMatchObject({ code: "ENOENT" });

    const malformed = structuredClone(executionManifest) as any;
    malformed.executionProfile.unexpected = true;
    await expect(execute(malformed)).rejects.toThrow(/invalid, expired, or substituted Execution Profile/);
    await expect(readFile(marker)).rejects.toMatchObject({ code: "ENOENT" });

    const widenedCapabilities = structuredClone(executionManifest);
    widenedCapabilities.harness.requiredCapabilities = [
      ...widenedCapabilities.harness.requiredCapabilities,
      "undeclared-capability",
    ];
    await expect(execute(widenedCapabilities)).rejects.toThrow(/invalid, expired, or substituted Execution Profile/);
    await expect(readFile(marker)).rejects.toMatchObject({ code: "ENOENT" });

    await expect(execute(executionManifest, 2)).rejects.toThrow(/invalid, expired, or substituted Execution Profile/);
    await expect(readFile(marker)).rejects.toMatchObject({ code: "ENOENT" });
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

    const executionManifest = buildV3Manifest({ sourceSha, approvedAt: 1, validUntil: 2 });
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
      profileAdmittedAt: 1,
      profileDigest: executionManifest.sandbox.profileDigest,
      sourceSha,
      environmentDescriptor: { provider: "FAKE", image: "node:20" },
      repositoryRoot: repository,
      outputPath,
      executor: {
        command: "bash",
        args: ["-c", `cd ${JSON.stringify(repository)}; printf 'export const created = 1;\\n' > src/created.ts; printf '%s' '{"schema":"factory-result/v1","status":"COMPLETED","summary":"done","completedAcceptanceCriterionIds":[],"incompleteAcceptanceCriterionIds":[],"unknownAcceptanceCriterionIds":[],"verificationCommands":[],"knownRisks":[],"nextAction":"review"}'`],
        timeoutMs: 60_000,
        ...v2ExecutorBinding(executionManifest),
      },
      environment: { OPENAI_BASE_URL: "https://openrouter.ai/api/v1" },
    }), "utf8");

    await execFileAsync(process.execPath, [supervisorPath, configPath], { cwd: repository });
    const bundle = JSON.parse(await readFile(outputPath, "utf8"));
    expect(bundle.changedFiles).toContain("src/created.ts");
    expect(bundle.harness).toMatchObject({
      provider: "openai",
      model: "gpt-5.6-terra",
      modelRouteDigest: executionManifest.modelRoute.routeDigest,
      providerRoute: "openrouter",
    });
    expect(Buffer.from(bundle.patch.content, "base64").toString("utf8")).toContain("export const created = 1;");

    const rejectedConfig = JSON.parse(await readFile(configPath, "utf8"));
    rejectedConfig.profileAdmittedAt = 2;
    rejectedConfig.outputPath = path.join(repository, "rejected-result.json");
    const rejectedMarker = path.join(repository, "standalone-executor-ran");
    rejectedConfig.executor.args = ["-e", `require("node:fs").writeFileSync(${JSON.stringify(rejectedMarker)}, "ran")`];
    rejectedConfig.executor.command = process.execPath;
    await writeFile(configPath, JSON.stringify(rejectedConfig), "utf8");
    await expect(execFileAsync(process.execPath, [supervisorPath, configPath], { cwd: repository }))
      .rejects.toThrow(/Command failed/);
    await expect(readFile(rejectedMarker)).rejects.toMatchObject({ code: "ENOENT" });
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

function buildV2Manifest(input: { sourceSha: string; profileDigest: string }) {
  const routeSnapshot = {
    schema: "factory-model-route/v2",
    provider: "openai",
    providerRoute: "openrouter",
    modelId: "gpt-5.6-terra",
  };
  const routeDigest = `sha256:${canonicalHash({ namespace: "factory-model-route/v2", value: routeSnapshot })}`;
  const runtimeArtifact = structuredClone(CODEX_V1_RUNTIME_ARTIFACT);
  const runtimeArtifactDigest = harnessRuntimeArtifactDigest(runtimeArtifact);
  const qualificationSnapshot = {
    schema: "factory-model-route-qualification/v2",
    routeDigest,
    evidence: { reference: "fixture://remote-route", digest: `sha256:${"1".repeat(64)}` },
    scope: { workloadClasses: ["SOFTWARE_CHANGE"], riskClasses: ["GREEN"] },
    promotedBy: "sandbox-supervisor-test",
    promotedAt: 1,
    compatibility: {
      adapter: "codex",
      version: "v1",
      capabilityManifestDigest: harnessCapabilityManifestDigest(CODEX_V1_HARNESS_MANIFEST),
      effectiveConfigSha256: CODEX_V1_HARNESS_MANIFEST.effectiveConfigSha256,
      runtimeArtifactDigest,
      executionBackend: "remote-sandbox",
    },
    authority: { executionOnly: true, routing: false, verification: false, acceptance: false, publication: false, merge: false },
  };
  return {
    version: "factory-execution-manifest/v2",
    causation: { workOrderId: "work-order-1", workOrderRevisionNumber: 1, workflowRunId: "run-1" },
    repository: { baseSha: input.sourceSha, allowedPaths: ["src"] },
    intent: { acceptanceCriterionIds: [] },
    sandbox: {
      profileDigest: input.profileDigest,
      supervisorVersion: SANDBOX_SUPERVISOR_VERSION,
      credentialGrants: [],
    },
    harness: {
      pullRequestAuthority: "CONTROL_PLANE_ONLY",
      adapter: "codex",
      version: "v1",
      harnessId: CODEX_V1_HARNESS_MANIFEST.identity.harnessId,
      harnessVersion: CODEX_V1_HARNESS_MANIFEST.identity.harnessVersion,
      harnessCommit: CODEX_V1_HARNESS_MANIFEST.identity.harnessCommit,
      capabilityManifest: CODEX_V1_HARNESS_MANIFEST,
      capabilityManifestSha256: harnessCapabilityManifestDigest(CODEX_V1_HARNESS_MANIFEST),
      effectiveConfigSha256: CODEX_V1_HARNESS_MANIFEST.effectiveConfigSha256,
      runtimeArtifact,
      runtimeArtifactDigest,
    },
    modelRoute: {
      catalogId: "route-codex-v2",
      routeDigest,
      routeSnapshot,
      qualificationDigest: `sha256:${canonicalHash({ namespace: "factory-model-route-qualification/v2", value: qualificationSnapshot })}`,
      qualificationSnapshot,
    },
    executionBackend: "remote-sandbox",
  };
}

function buildV3Manifest(input: { sourceSha: string; approvedAt?: number; validUntil?: number }) {
  const imageDigest = `sha256:${"9".repeat(64)}`;
  const sandboxProfileSnapshot = {
    schema: "factory-sandbox-profile/v1",
    profileKey: "fake-remote-sandbox",
    version: 1,
    provider: "FAKE",
    machine: { image: `node:20@${imageDigest}` },
    security: { image: { digest: imageDigest } },
    qualification: {
      supportedWorkloadClasses: ["SOFTWARE_CHANGE"],
      supportedRiskClasses: ["GREEN"],
    },
  };
  const sandboxProfileDigest = `sha256:${canonicalHash({
    namespace: "factory-sandbox-profile/v1",
    value: sandboxProfileSnapshot,
  })}`;
  const routeSnapshot = {
    schema: "factory-model-route/v2",
    provider: "openai",
    providerRoute: "openrouter",
    modelId: "gpt-5.6-terra",
  };
  const routeDigest = `sha256:${canonicalHash({ namespace: "factory-model-route/v2", value: routeSnapshot })}`;
  const runtimeArtifact = {
    schemaVersion: "harness-runtime-artifact/v1" as const,
    kind: "CONTAINER_IMAGE" as const,
    name: "codex-cli-sandbox",
    version: "sandbox-v1",
    executableSha256: null,
    imageDigest,
  };
  const runtimeArtifactDigest = harnessRuntimeArtifactDigest(runtimeArtifact);
  const modelQualificationSnapshot = {
    schema: "factory-model-route-qualification/v2",
    routeDigest,
    evidence: { reference: "fixture://remote-route", digest: `sha256:${"1".repeat(64)}` },
    scope: { workloadClasses: ["SOFTWARE_CHANGE"], riskClasses: ["GREEN"] },
    promotedBy: "sandbox-supervisor-test",
    promotedAt: 1,
    compatibility: {
      adapter: "codex",
      version: "v1",
      capabilityManifestDigest: harnessCapabilityManifestDigest(CODEX_V1_HARNESS_MANIFEST),
      effectiveConfigSha256: CODEX_V1_HARNESS_MANIFEST.effectiveConfigSha256,
      runtimeArtifactDigest,
      executionBackend: "remote-sandbox" as const,
    },
    authority: { executionOnly: true, routing: false, verification: false, acceptance: false, publication: false, merge: false },
  };
  const modelQualificationDigest = `sha256:${canonicalHash({
    namespace: "factory-model-route-qualification/v2",
    value: modelQualificationSnapshot,
  })}`;
  const profileSnapshot = executionProfileSnapshot({
    profileKey: "remote-software-change",
    version: 1,
    harness: {
      adapter: "codex",
      version: "v1",
      capabilityManifest: CODEX_V1_HARNESS_MANIFEST,
      capabilityManifestDigest: harnessCapabilityManifestDigest(CODEX_V1_HARNESS_MANIFEST),
      effectiveConfigSha256: CODEX_V1_HARNESS_MANIFEST.effectiveConfigSha256,
    },
    runtimeArtifact: { snapshot: runtimeArtifact, digest: runtimeArtifactDigest },
    executionBackend: "remote-sandbox",
    modelRoute: {
      catalogId: "route-codex-v2",
      routeSnapshot,
      routeDigest,
      qualificationSnapshot: modelQualificationSnapshot,
      qualificationDigest: modelQualificationDigest,
    },
    sandboxProfile: {
      profileId: "sandbox-profile-1",
      profileSnapshot: sandboxProfileSnapshot,
      profileDigest: sandboxProfileDigest,
    },
    isolationModes: ["WORKSPACE_WRITE"],
  });
  const profileDigest = executionProfileDigest(profileSnapshot);
  const approvedAt = input.approvedAt ?? Date.now();
  const qualificationSnapshot = executionProfileQualificationSnapshot({
    profileId: "execution-profile-1",
    profileSnapshot,
    profileDigest,
    workloadClasses: ["SOFTWARE_CHANGE"],
    riskClasses: ["GREEN"],
    evidenceReference: "fixture://execution-profile",
    evidenceDigest: `sha256:${"2".repeat(64)}`,
    approvedBy: "sandbox-supervisor-test",
    approvedAt,
    validUntil: input.validUntil ?? approvedAt + 60_000,
  });
  return {
    version: "factory-execution-manifest/v3" as const,
    causation: { workOrderId: "work-order-1", workOrderRevisionNumber: 1, workflowRunId: "run-1" },
    repository: { baseSha: input.sourceSha, allowedPaths: ["src"] },
    intent: { acceptanceCriterionIds: [] },
    sandbox: {
      profileId: "sandbox-profile-1",
      profileDigest: sandboxProfileDigest,
      profileSnapshot: sandboxProfileSnapshot,
      supervisorVersion: SANDBOX_SUPERVISOR_VERSION,
      credentialGrants: [],
    },
    harness: {
      pullRequestAuthority: "CONTROL_PLANE_ONLY",
      adapter: "codex",
      version: "v1",
      harnessId: CODEX_V1_HARNESS_MANIFEST.identity.harnessId,
      harnessVersion: CODEX_V1_HARNESS_MANIFEST.identity.harnessVersion,
      harnessCommit: CODEX_V1_HARNESS_MANIFEST.identity.harnessCommit,
      capabilityManifest: CODEX_V1_HARNESS_MANIFEST,
      capabilityManifestSha256: harnessCapabilityManifestDigest(CODEX_V1_HARNESS_MANIFEST),
      effectiveConfigSha256: CODEX_V1_HARNESS_MANIFEST.effectiveConfigSha256,
      runtimeArtifact,
      runtimeArtifactDigest,
      isolation: "WORKSPACE_WRITE",
      requiredHarnessCapabilities: profileSnapshot.requiredHarnessCapabilities,
      requiredCapabilities: profileSnapshot.requiredSandboxCapabilities,
    },
    modelRoute: {
      catalogId: "route-codex-v2",
      routeDigest,
      routeSnapshot,
      qualificationDigest: modelQualificationDigest,
      qualificationSnapshot: modelQualificationSnapshot,
    },
    executionBackend: "remote-sandbox" as const,
    executionProfile: {
      profileId: "execution-profile-1",
      profileKey: profileSnapshot.profileKey,
      version: profileSnapshot.version,
      profileDigest,
      profileSnapshot,
      qualificationDigest: executionProfileQualificationDigest(qualificationSnapshot),
      qualificationSnapshot,
    },
  };
}

function v2ExecutorBinding(manifest: { modelRoute: ReturnType<typeof buildV2Manifest>["modelRoute"] }) {
  return {
    provider: manifest.modelRoute.routeSnapshot.provider,
    model: manifest.modelRoute.routeSnapshot.modelId,
    modelRouteDigest: manifest.modelRoute.routeDigest,
    providerRoute: manifest.modelRoute.routeSnapshot.providerRoute,
  };
}

function successfulResult() {
  return {
    schema: "factory-result/v1",
    status: "COMPLETED",
    summary: "done",
    completedAcceptanceCriterionIds: [],
    incompleteAcceptanceCriterionIds: [],
    unknownAcceptanceCriterionIds: [],
    verificationCommands: [],
    knownRisks: [],
    nextAction: "review",
  };
}
