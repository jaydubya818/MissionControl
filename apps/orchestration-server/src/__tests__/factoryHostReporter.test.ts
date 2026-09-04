import { execFile } from "node:child_process";
import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import {
  FactoryHostReporter,
  canonicalRepositoryFromRemote,
  factorySandboxCapabilities,
  inspectFactoryCheckout,
} from "../factoryHostReporter.js";
import {
  CODEX_V1_HARNESS_MANIFEST,
  CODEX_V1_RUNTIME_ARTIFACT,
  harnessCapabilityManifestDigest,
  harnessRuntimeArtifactDigest,
} from "@mission-control/workflow-engine";

const execFileAsync = promisify(execFile);
const cleanup: string[] = [];
const originalServiceCommandSecret = process.env.MISSION_CONTROL_SERVICE_COMMAND_SECRET;

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
  if (originalServiceCommandSecret === undefined) {
    delete process.env.MISSION_CONTROL_SERVICE_COMMAND_SECRET;
  } else {
    process.env.MISSION_CONTROL_SERVICE_COMMAND_SECRET = originalServiceCommandSecret;
  }
});

describe("Factory host reporting", () => {
  it("advertises optional publication and remote sandbox capabilities only when configured", () => {
    expect(factorySandboxCapabilities({
      githubAppPublicationReady: false,
      remoteSandboxBackendReady: false,
    })).toEqual(["git-worktree", "workspace-write", "read-only"]);

    expect(factorySandboxCapabilities({
      githubAppPublicationReady: true,
      remoteSandboxBackendReady: true,
    })).toEqual([
      "git-worktree",
      "workspace-write",
      "read-only",
      "github-app-publication",
      "remote-sandbox",
      "sandbox-provider:exe-dev",
    ]);
  });

  it.each([
    ["git@github.com:jaydubya818/MissionControl.git", "jaydubya818/MissionControl"],
    ["https://github.com/jaydubya818/MissionControl.git", "jaydubya818/MissionControl"],
    ["ssh://git@github.com/jaydubya818/MissionControl", "jaydubya818/MissionControl"],
  ])("normalizes %s", (remote, expected) => {
    expect(canonicalRepositoryFromRemote(remote)).toBe(expected);
  });

  it.each([
    "https://evil.example/jaydubya818/MissionControl.git",
    "git@evil.example:jaydubya818/MissionControl.git",
    "file:///tmp/jaydubya818/MissionControl.git",
    "https://github.com/jaydubya818/MissionControl/extra.git",
  ])("rejects a non-canonical GitHub origin %s", (remote) => {
    expect(() => canonicalRepositoryFromRemote(remote)).toThrow(/GitHub|github\.com/);
  });

  it("reports the real root, identity, revision, and dirty state", async () => {
    const repository = await mkdtemp(path.join(os.tmpdir(), "mc-host-report-"));
    cleanup.push(repository);
    await git(repository, ["init", "-b", "main"]);
    await git(repository, ["config", "user.name", "Mission Control Test"]);
    await git(repository, ["config", "user.email", "factory@example.test"]);
    await git(repository, ["remote", "add", "origin", "git@github.com:jaydubya818/MissionControl.git"]);
    await writeFile(path.join(repository, "README.md"), "ready\n");
    await git(repository, ["add", "README.md"]);
    await git(repository, ["commit", "-m", "fixture"]);

    const clean = await inspectFactoryCheckout(repository);
    expect(clean).toMatchObject({
      repository: "jaydubya818/MissionControl",
      checkoutRoot: await realpath(repository),
      observedBranch: "main",
      baseBranch: "main",
      dirty: false,
    });
    expect(clean.observedCommit).toMatch(/^[0-9a-f]{40}$/);
    expect(clean.baseCommit).toBe(clean.observedCommit);

    process.env.MISSION_CONTROL_SERVICE_COMMAND_SECRET = "test-service-command-secret";
    let report: any;
    let healthReport: any;
    const reporter = new FactoryHostReporter({
      mutation: async (_mutation: unknown, payload: unknown) => { report = payload; },
      action: async (_action: unknown, payload: unknown) => { healthReport = payload; },
    } as any, {
      projectId: "project-1",
      repositoryId: "repository-1",
      hostId: "worker-1",
      sessionId: "session-1",
      checkoutRoot: repository,
      maxConcurrentRuns: 1,
      getCurrentRuns: () => 0,
      hostRuntimeType: "persistent-worker",
      executionBackends: ["persistent-worker"],
      supportedExecutors: [{
        adapter: "codex",
        version: "v1",
        capabilityManifest: CODEX_V1_HARNESS_MANIFEST,
        capabilityManifestSha256: harnessCapabilityManifestDigest(CODEX_V1_HARNESS_MANIFEST),
        effectiveConfigSha256: CODEX_V1_HARNESS_MANIFEST.effectiveConfigSha256,
        runtimeArtifact: CODEX_V1_RUNTIME_ARTIFACT,
        runtimeArtifactSha256: harnessRuntimeArtifactDigest(CODEX_V1_RUNTIME_ARTIFACT),
        supportsCancel: true,
        supportsResume: false,
        isolationModes: ["READ_ONLY", "WORKSPACE_WRITE"],
        emittedEvents: ["EXECUTION_STARTED"],
        supportsRepositoryMutation: true,
      } as any],
      sandboxCapabilities: ["git-worktree", "workspace-write", "read-only"],
      factoryVersionBindings: [{
        factoryDefinitionVersionId: "factory-version-1",
        factoryConfigurationDigest: "factory-v1-test",
        adapter: "codex",
        version: "v1",
        provider: "openai",
        model: "gpt-test",
        capabilityManifestSha256: harnessCapabilityManifestDigest(CODEX_V1_HARNESS_MANIFEST),
        effectiveConfigSha256: CODEX_V1_HARNESS_MANIFEST.effectiveConfigSha256,
        executionBackend: "persistent-worker",
        modelRouteDigest: `sha256:${"a".repeat(64)}`,
        repositoryId: "repository-1",
      }],
    });
    await reporter.report();
    expect(report.workerRuntime.supportedExecutors).toEqual([{
      adapter: "codex",
      version: "v1",
      capabilityManifest: CODEX_V1_HARNESS_MANIFEST,
      capabilityManifestSha256: harnessCapabilityManifestDigest(CODEX_V1_HARNESS_MANIFEST),
      effectiveConfigSha256: CODEX_V1_HARNESS_MANIFEST.effectiveConfigSha256,
      runtimeArtifact: CODEX_V1_RUNTIME_ARTIFACT,
      runtimeArtifactSha256: harnessRuntimeArtifactDigest(CODEX_V1_RUNTIME_ARTIFACT),
      supportsCancel: true,
      supportsResume: false,
      isolationModes: ["READ_ONLY", "WORKSPACE_WRITE"],
    }]);
    expect(healthReport.envelope).toMatchObject({
      capability: "models.report-exact-route-health",
      projectId: "project-1",
      repositoryId: "repository-1",
    });
    expect(JSON.parse(healthReport.payloadJson)).toEqual({
      factoryDefinitionVersionId: "factory-version-1",
      expectedRouteDigest: `sha256:${"a".repeat(64)}`,
      availability: "HEALTHY",
    });

    await writeFile(path.join(repository, "README.md"), "dirty\n");
    expect((await inspectFactoryCheckout(repository)).dirty).toBe(true);
  });
});

async function git(cwd: string, args: string[]) {
  await execFileAsync("git", args, { cwd, env: process.env });
}
