import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { FakeSandboxProvider } from "../fakeSandboxProvider.js";
import { FakeSandboxCredentialBroker } from "../sandboxCredentials.js";
import { InMemoryRemoteSandboxJournal, RemoteSandboxRuntime } from "../remoteSandboxRuntime.js";
import { createPatchDescriptor, createSandboxResultBundle, encodeSandboxResultBundle, parseAndValidateSandboxResultBundle } from "../sandboxResultBundle.js";
import { runSandboxSupervisor, standaloneSandboxSupervisorSource } from "../sandboxSupervisor.js";
import { sandboxProfileDigest, stableSandboxResourceName, validateSandboxProfile, type SandboxProfileSnapshot } from "../sandboxProvider.js";
import { canonicalHash } from "@mission-control/shared";

const execFileAsync = promisify(execFile);
const sourceSha = "0123456789abcdef0123456789abcdef01234567";

describe("remote sandbox contracts", () => {
  it("normalizes unrestricted egress as dispatchable but DEGRADED", () => {
    const validation = validateSandboxProfile(profile());
    expect(validation).toMatchObject({ valid: true, dispatchable: true, readiness: "DEGRADED" });
    expect(validation.warnings).toContain("Provider egress is unrestricted; the profile must be visibly DEGRADED.");
    expect(stableSandboxResourceName({ projectId: "p1", workflowRunId: "r1", attemptId: "a1" })).toMatch(/^mc-attempt-[a-f0-9]{16}$/);
  });

  it("rejects public ports, unproven restricted egress, and resumable profiles", () => {
    const invalid = profile();
    (invalid.network as any).publicIngress = true;
    invalid.network.exposedPorts = [3000];
    invalid.network.egress = "RESTRICTED_ALLOWLIST";
    invalid.readiness.egressEnforcementProven = false;
    (invalid.teardown as any).supportsResume = true;
    const validation = validateSandboxProfile(invalid);
    expect(validation.dispatchable).toBe(false);
    expect(validation.errors.join(" ")).toMatch(/Public ingress/);
    expect(validation.errors.join(" ")).toMatch(/Restricted egress/);
    expect(validation.errors.join(" ")).toMatch(/non-resumable/);
  });

  it("detects result bundle and patch tampering", () => {
    const bundle = resultBundle();
    const expected = {
      attemptId: bundle.attemptId,
      workOrderId: bundle.workOrderId,
      workOrderRevisionNumber: bundle.workOrderRevisionNumber,
      workflowRunId: bundle.workflowRunId,
      manifestDigest: bundle.manifestDigest,
      profileDigest: bundle.profileDigest,
      sourceSha: bundle.sourceSha,
      supervisorVersion: bundle.supervisorVersion,
      environment: bundle.environment,
      maxRuntimeMs: 60_000,
    };
    expect(parseAndValidateSandboxResultBundle(encodeSandboxResultBundle(bundle), expected).digest).toBe(bundle.digest);
    const tampered = { ...bundle, structuredResult: { ...bundle.structuredResult, summary: "tampered" } };
    expect(() => parseAndValidateSandboxResultBundle(Buffer.from(JSON.stringify(tampered)), expected)).toThrow(/digest is invalid/);
  });
});

describe("RemoteSandboxRuntime", () => {
  it("runs the deterministic provider path and proves credential/resource absence before returning", async () => {
    const selectedProfile = profile();
    const bundle = resultBundle(selectedProfile);
    const provider = new FakeSandboxProvider({ result: encodeSandboxResultBundle(bundle) });
    const credentials = new FakeSandboxCredentialBroker();
    const journal = new InMemoryRemoteSandboxJournal();
    const runtime = new RemoteSandboxRuntime(provider, credentials, journal);
    const result = await runtime.execute(request(selectedProfile));

    expect(result.bundle.digest).toBe(bundle.digest);
    expect(result.termination.resourceAbsent).toBe(true);
    expect(credentials.active.size).toBe(0);
    expect(journal.allocationRequests).toHaveLength(1);
    expect(journal.issuedCredentials[0]).not.toHaveProperty("secret");
    expect(journal.events.map((event) => event.type)).toEqual([
      "SANDBOX_REQUESTED",
      "SANDBOX_ALLOCATED",
      "SANDBOX_STARTED",
      "SANDBOX_RESULT_RECEIVED",
      "SANDBOX_CREDENTIAL_REVOKED",
      "SANDBOX_TERMINATION_REQUESTED",
      "SANDBOX_TERMINATED",
    ]);
    expect(provider.calls.at(-1)).toMatch(/^terminate:/);
  });

  it("revokes and tears down after executor startup failure", async () => {
    const selectedProfile = profile();
    const provider = new FakeSandboxProvider({ failAt: "START" });
    const credentials = new FakeSandboxCredentialBroker();
    const journal = new InMemoryRemoteSandboxJournal();
    const runtime = new RemoteSandboxRuntime(provider, credentials, journal);

    await expect(runtime.execute(request(selectedProfile))).rejects.toThrow(/fake start failure/);
    expect(credentials.active.size).toBe(0);
    expect(journal.revokedCredentials).toHaveLength(1);
    expect(journal.terminations).toHaveLength(1);
    expect(journal.events.map((event) => event.type)).toContain("SANDBOX_FAILED");
  });

  it("durably records teardown failure after revoking the Attempt credential", async () => {
    const selectedProfile = profile();
    const bundle = resultBundle(selectedProfile);
    const provider = new FakeSandboxProvider({
      result: encodeSandboxResultBundle(bundle),
      failAt: "TERMINATE",
    });
    const credentials = new FakeSandboxCredentialBroker();
    const journal = new InMemoryRemoteSandboxJournal();
    const runtime = new RemoteSandboxRuntime(provider, credentials, journal);

    await expect(runtime.execute(request(selectedProfile))).rejects.toThrow(
      /Deterministic fake teardown failure/,
    );

    expect(credentials.active.size).toBe(0);
    expect(journal.revokedCredentials).toHaveLength(1);
    expect(journal.terminations).toHaveLength(0);
    expect(journal.events).toContainEqual(expect.objectContaining({
      type: "SANDBOX_FAILED",
      metadata: expect.objectContaining({
        phase: "CLEANUP",
        credentialRevoked: true,
        resourceAbsenceProven: false,
      }),
    }));
    expect(provider.inventory()[0].state).not.toBe("TERMINATED");
  });
});

describe("sandbox supervisor", () => {
  it("pins the source, runs a bounded executor, and writes a content-addressed binary patch", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "mc-supervisor-test-"));
    try {
      await execFileAsync("git", ["init", "-q"], { cwd: directory });
      await writeFile(path.join(directory, "README.md"), "before\n");
      await execFileAsync("git", ["add", "README.md"], { cwd: directory });
      await execFileAsync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-qm", "base"], { cwd: directory });
      const head = (await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: directory })).stdout.trim();
      const script = [
        "const fs=require('fs');",
        "fs.writeFileSync('README.md','after\\n');",
        `process.stdout.write(JSON.stringify(${JSON.stringify(structuredResult())}));`,
      ].join("");
      const outputPath = path.join(directory, "result.json");
      const executionManifest = remoteExecutionManifest({ sourceSha: head, profileDigest: "sha256:profile" });
      const bundle = await runSandboxSupervisor({
        executionManifest,
        attemptId: "attempt-1",
        workOrderId: "work-order-1",
        workOrderRevisionNumber: 1,
        workflowRunId: "run-1",
        manifestDigest: `sha256:${canonicalHash(executionManifest)}`,
        profileDigest: "sha256:profile",
        sourceSha: head,
        environmentDescriptor: { provider: "FAKE", image: "debian:bookworm" },
        repositoryRoot: directory,
        outputPath,
        executor: { command: process.execPath, args: ["-e", script], timeoutMs: 5_000 },
        environment: {},
      });
      expect(bundle.status).toBe("COMPLETED");
      expect(bundle.patch.byteLength).toBeGreaterThan(0);
      expect(JSON.parse(await readFile(outputPath, "utf8")).digest).toBe(bundle.digest);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("normalizes malformed remote harness output into a fail-closed result bundle", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "mc-standalone-supervisor-test-"));
    try {
      await execFileAsync("git", ["init", "-q"], { cwd: directory });
      await writeFile(path.join(directory, "README.md"), "before\n");
      await execFileAsync("git", ["add", "README.md"], { cwd: directory });
      await execFileAsync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-qm", "base"], { cwd: directory });
      const head = (await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: directory })).stdout.trim();
      const profileDigest = "sha256:profile";
      const executionManifest = remoteExecutionManifest({ sourceSha: head, profileDigest });
      const manifestDigest = `sha256:${canonicalHash(executionManifest)}`;
      const supervisorPath = path.join(directory, "standalone-supervisor.mjs");
      const configPath = path.join(directory, "config.json");
      const outputPath = path.join(directory, "result.json");
      await writeFile(supervisorPath, standaloneSandboxSupervisorSource());
      await writeFile(configPath, JSON.stringify({
        executionManifest,
        attemptId: "attempt-malformed",
        workOrderId: "work-order-1",
        workOrderRevisionNumber: 1,
        workflowRunId: "run-1",
        manifestDigest,
        profileDigest,
        sourceSha: head,
        environmentDescriptor: { provider: "FAKE", image: "debian:bookworm" },
        repositoryRoot: directory,
        outputPath,
        executor: {
          command: process.execPath,
          args: ["-e", "process.stdout.write(JSON.stringify({status:'COMPLETED'}))"],
          timeoutMs: 5_000,
        },
        environment: {},
      }));

      await execFileAsync(process.execPath, [supervisorPath, configPath], { cwd: directory });
      const bundle = parseAndValidateSandboxResultBundle(Buffer.from(await readFile(outputPath)), {
        attemptId: "attempt-malformed",
        workOrderId: "work-order-1",
        workOrderRevisionNumber: 1,
        workflowRunId: "run-1",
        manifestDigest,
        profileDigest,
        sourceSha: head,
        supervisorVersion: "mission-control-supervisor/v1",
        environment: { provider: "FAKE", image: "debian:bookworm" },
        maxRuntimeMs: 60_000,
      });
      expect(bundle.structuredResult).toMatchObject({
        status: "FAILED",
        summary: "Executor did not return valid factory-result/v1 JSON.",
      });
      expect(bundle.status).toBe("FAILED");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("uses the last Codex agent message when the remote output file is empty", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "mc-standalone-supervisor-jsonl-test-"));
    try {
      await execFileAsync("git", ["init", "-q"], { cwd: directory });
      await writeFile(path.join(directory, "README.md"), "before\n");
      await execFileAsync("git", ["add", "README.md"], { cwd: directory });
      await execFileAsync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-qm", "base"], { cwd: directory });
      const head = (await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: directory })).stdout.trim();
      const profileDigest = "sha256:profile";
      const executionManifest = remoteExecutionManifest({ sourceSha: head, profileDigest });
      const manifestDigest = `sha256:${canonicalHash(executionManifest)}`;
      const supervisorPath = path.join(directory, "standalone-supervisor.mjs");
      const configPath = path.join(directory, "config.json");
      const outputPath = path.join(directory, "result.json");
      const executorResultPath = path.join(directory, "executor-result.json");
      const jsonlEvent = { type: "item.completed", item: { type: "agent_message", text: JSON.stringify(structuredResult()) } };
      await writeFile(supervisorPath, standaloneSandboxSupervisorSource());
      await writeFile(executorResultPath, "");
      await writeFile(configPath, JSON.stringify({
        executionManifest,
        attemptId: "attempt-jsonl",
        workOrderId: "work-order-1",
        workOrderRevisionNumber: 1,
        workflowRunId: "run-1",
        manifestDigest,
        profileDigest,
        sourceSha: head,
        environmentDescriptor: { provider: "FAKE", image: "debian:bookworm" },
        repositoryRoot: directory,
        outputPath,
        executor: {
          command: process.execPath,
          args: ["-e", `process.stdout.write(${JSON.stringify(`${JSON.stringify(jsonlEvent)}\n`)})`],
          resultPath: executorResultPath,
          timeoutMs: 5_000,
        },
        environment: {},
      }));

      await execFileAsync(process.execPath, [supervisorPath, configPath], { cwd: directory });
      const bundle = parseAndValidateSandboxResultBundle(Buffer.from(await readFile(outputPath)), {
        attemptId: "attempt-jsonl",
        workOrderId: "work-order-1",
        workOrderRevisionNumber: 1,
        workflowRunId: "run-1",
        manifestDigest,
        profileDigest,
        sourceSha: head,
        supervisorVersion: "mission-control-supervisor/v1",
        environment: { provider: "FAKE", image: "debian:bookworm" },
        maxRuntimeMs: 60_000,
      });
      expect(bundle.status).toBe("COMPLETED");
      expect(bundle.structuredResult).toMatchObject({
        status: "COMPLETED",
        summary: "Implemented the requested change.",
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

function profile(): SandboxProfileSnapshot {
  return {
    schema: "factory-sandbox-profile/v1",
    profileKey: "exe-standard",
    version: 1,
    provider: "FAKE",
    providerProfile: "standard",
    providerProfileVersion: "2026-08-15",
    machine: { image: "debian:bookworm", cpu: 2, memoryMb: 4_096, diskGb: 20 },
    supervisor: { version: "mission-control-supervisor/v1", transport: "SSH" },
    runtime: { maxRuntimeMs: 300_000, resultPollIntervalMs: 250, resultRetentionMs: 86_400_000 },
    network: { egress: "UNRESTRICTED", egressAllowlist: [], publicIngress: false, exposedPorts: [] },
    credentials: { inference: "ATTEMPT_SCOPED_OPENROUTER", repositoryAccess: "CONTROL_PLANE_SNAPSHOT", githubAuthority: "NONE", providerAuthority: "NONE" },
    spend: { maxUsd: 2, enforcement: "PROVIDER_KEY_LIMIT" },
    teardown: { terminateOnEveryTerminalState: true, verifyResourceAbsent: true, supportsResume: false },
    preview: { mode: "DISABLED" },
    readiness: { state: "DEGRADED", checkedAt: Date.now(), reason: "Fake provider; unrestricted egress represented honestly.", egressEnforcementProven: false },
  };
}

function structuredResult() {
  return {
    schema: "factory-result/v1" as const,
    status: "COMPLETED" as const,
    summary: "Implemented the requested change.",
    completedAcceptanceCriterionIds: ["ac-1"],
    incompleteAcceptanceCriterionIds: [],
    unknownAcceptanceCriterionIds: [],
    verificationCommands: ["pnpm test"],
    knownRisks: [],
    nextAction: "Review the pull request.",
  };
}

function resultBundle(selectedProfile = profile()) {
  return createSandboxResultBundle({
    schema: "factory-sandbox-result/v1",
    attemptId: "attempt-1",
    workOrderId: "work-order-1",
    workOrderRevisionNumber: 1,
    workflowRunId: "run-1",
    manifestDigest: "sha256:manifest",
    profileDigest: sandboxProfileDigest(selectedProfile),
    sourceSha,
    supervisorVersion: "mission-control-supervisor/v1",
    environment: { provider: "FAKE", image: "debian:bookworm" },
    startedAt: 1,
    finishedAt: 2,
    status: "COMPLETED",
    structuredResult: structuredResult(),
    changedFiles: ["a"],
    diff: { filesChanged: 1, linesAdded: 1, linesDeleted: 0 },
    commandResults: [{ commandClass: "EXECUTOR", exitCode: 0, durationMs: 1, timedOut: false }],
    verificationInputs: { reportedCommands: ["pnpm test"] },
    artifacts: [],
    events: [{ type: "RESULT_WRITTEN", occurredAt: 2 }],
    patch: createPatchDescriptor(Buffer.from("diff --git a/a b/a\n")),
    executor: { exitCode: 0, stdoutDigest: "sha256:stdout", stderrDigest: "sha256:stderr", stdoutTail: "", stderrTail: "" },
    usage: { providerCostUsd: 0.01, inferenceCostUsd: 0.02, providerRuntimeMs: 1, observedAt: 2, enforcement: "PROVIDER_REPORTED" },
  });
}

function request(selectedProfile: SandboxProfileSnapshot) {
  return {
    projectId: "project-1",
    workOrderId: "work-order-1",
    workOrderRevisionNumber: 1,
    workflowRunId: "run-1",
    attemptId: "attempt-1",
    attemptLeaseId: "lease-1",
    executionManifest: {},
    manifestDigest: "sha256:manifest",
    sourceSha,
    profile: selectedProfile,
    repositoryBundle: Buffer.from("bundle"),
    supervisorSource: "// supervisor",
    executor: { command: "codex", args: ["exec"], model: "openai/gpt-5", prompt: "Implement it", allowedPaths: ["src/**"], timeoutMs: 300_000 },
  };
}

function remoteExecutionManifest(input: { sourceSha: string; profileDigest: string }) {
  return {
    version: "factory-execution-manifest/v1",
    causation: { workOrderId: "work-order-1", workOrderRevisionNumber: 1, workflowRunId: "run-1" },
    repository: { baseSha: input.sourceSha },
    harness: { executionBackend: "remote-sandbox", pullRequestAuthority: "CONTROL_PLANE_ONLY" },
    sandbox: {
      profileDigest: input.profileDigest,
      supervisorVersion: "mission-control-supervisor/v1",
      credentialGrants: [{ secretValueIncluded: false, githubAuthority: "NONE", providerAuthority: "NONE" }],
    },
  };
}
