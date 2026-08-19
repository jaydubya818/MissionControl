import { describe, expect, it, vi } from "vitest";
import { canonicalHash } from "@mission-control/shared";
import { ExeDevSandboxProvider, exeDevCommandErrorDetail, type ExeDevTransport } from "../exeDevSandboxProvider.js";
import type { SandboxProfileSnapshot, SandboxSecurityProof } from "../sandboxProvider.js";

describe("ExeDevSandboxProvider", () => {
  it("keeps production dispatch blocked until live lifecycle certification is recorded", async () => {
    const provider = new ExeDevSandboxProvider({ lobbyJson: vi.fn(), vmText: vi.fn() } as ExeDevTransport);
    const uncertified = profile();
    uncertified.readiness.liveCertified = false;

    await expect(provider.validateProfile(uncertified)).resolves.toMatchObject({
      dispatchable: false,
      readiness: "BLOCKED",
      errors: expect.arrayContaining([expect.stringMatching(/Live exe\.dev lifecycle certification/)]),
    });
  });

  it("blocks resource sizes below the live-proven exe.dev N=1 floor", async () => {
    const provider = new ExeDevSandboxProvider({ lobbyJson: vi.fn(), vmText: vi.fn() } as ExeDevTransport);
    const undersized = profile();
    undersized.machine = { ...undersized.machine, cpu: 1, memoryMb: 512, diskGb: 5 };

    await expect(provider.validateProfile(undersized)).resolves.toMatchObject({
      dispatchable: false,
      readiness: "BLOCKED",
      errors: expect.arrayContaining([
        expect.stringMatching(/at least 2 CPUs/),
        expect.stringMatching(/at least 2048 MB/),
        expect.stringMatching(/at least 10 GB/),
      ]),
    });
  });

  it("preserves provider diagnostics emitted on stdout when stderr is empty", () => {
    expect(exeDevCommandErrorDetail({
      stdout: "minimum resource size is not supported\n",
      stderr: "",
      message: "Command failed",
    })).toBe("minimum resource size is not supported");
  });

  it("allocates the exact Attempt resource without public ports or embedded credentials", async () => {
    const lobbyJson = vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce({ vm_name: "mc-attempt-0123456789abcdef", id: "vm-1", status: "ready", image: "debian:bookworm" });
    const provider = new ExeDevSandboxProvider({ lobbyJson, vmText: vi.fn().mockResolvedValue("123") } as ExeDevTransport);
    const allocation = await provider.allocate(request(profile()));

    expect(allocation.state).toBe("READY");
    const createCommand = lobbyJson.mock.calls[2][0] as string[];
    expect(createCommand).toEqual(expect.arrayContaining([
      "new", "--name=mc-attempt-0123456789abcdef", "--cpu=2", "--memory=4096MB", "--disk=20GB", "--image=debian:bookworm",
    ]));
    expect(createCommand.join(" ")).not.toMatch(/--port|--env|token|secret|key=/i);
  });

  it("blocks allocation when exe.dev would attach an automatic integration", async () => {
    const lobbyJson = vi.fn().mockResolvedValueOnce([{ name: "github", attach: "auto:all" }]);
    const provider = new ExeDevSandboxProvider({ lobbyJson, vmText: vi.fn() } as ExeDevTransport);

    await expect(provider.allocate(request(profile()))).rejects.toThrow(/automatic integration/);
    expect(lobbyJson).toHaveBeenCalledTimes(1);
  });

  it("uploads the frozen inputs over SSH and confirms exact-name absence on teardown", async () => {
    const lobbyJson = vi.fn()
      .mockResolvedValueOnce([{ vm_name: "mc-attempt-0123456789abcdef", id: "vm-1", status: "ready" }])
      .mockResolvedValueOnce({ removed: true })
      .mockResolvedValueOnce([]);
    const vmText = vi.fn()
      .mockRejectedValueOnce(new Error("transient SSH upload failure"))
      .mockResolvedValue("321");
    const provider = new ExeDevSandboxProvider(
      { lobbyJson, vmText } as ExeDevTransport,
      Date.now,
      async () => undefined,
    );
    const allocation = { provider: "EXE_DEV" as const, providerResourceId: "vm-1", resourceName: "mc-attempt-0123456789abcdef", state: "READY" as const, createdAt: 1 };
    const executionManifest = manifest();
    await provider.start({
      allocation, executionManifest, workOrderId: "w1", workOrderRevisionNumber: 1, workflowRunId: "r1", attemptId: "a1",
      manifestDigest: `sha256:${canonicalHash(executionManifest)}`, sourceSha: "a".repeat(40), profileDigest: "sha256:profile",
      environmentDescriptor: { provider: "EXE_DEV", image: "debian:bookworm" }, repositoryArchive: Buffer.from("bundle"), supervisorSource: "// supervisor",
      executor: {
        command: "codex",
        args: ["exec", "--output-schema", "/var/lib/mission-control/attempt/factory-result.schema.json"],
        outputSchemaPath: "/var/lib/mission-control/attempt/factory-result.schema.json",
        outputSchema: { type: "object", required: ["status"] },
        prompt: "p",
        allowedPaths: ["src/**"],
        timeoutMs: 60_000,
      },
      environment: { OPENAI_API_KEY: "attempt-only", OPENAI_BASE_URL: "https://openrouter.ai/api/v1" },
    });

    expect(vmText).toHaveBeenCalledTimes(7);
    expect(vmText.mock.calls[0][1]).toBe(vmText.mock.calls[1][1]);
    expect(vmText.mock.calls[0][2]).toBe(vmText.mock.calls[1][2]);
    expect(JSON.parse(Buffer.from(vmText.mock.calls[3][2], "base64").toString("utf8"))).toEqual({ type: "object", required: ["status"] });
    const uploadedConfig = JSON.parse(Buffer.from(vmText.mock.calls[5][2], "base64").toString("utf8"));
    expect(uploadedConfig.executionManifest).toEqual(executionManifest);
    const preparation = vmText.mock.calls[4][1];
    expect(preparation).toContain("git clone --quiet");
    expect(preparation).toContain("rm -f /var/lib/mission-control/attempt/result.json");
    const supervisorLaunch = vmText.mock.calls[6][1];
    expect(supervisorLaunch).toContain("command -v setsid");
    expect(supervisorLaunch).toContain("nohup setsid node");
    expect(supervisorLaunch).toContain("2>&1 &\nprintf '%s'");
    expect(supervisorLaunch).not.toContain("&;");
    expect(supervisorLaunch).not.toContain("attempt-only");
    await provider.cancel(allocation, "test cancellation");
    const cancellation = vmText.mock.calls[7][1];
    expect(cancellation).toContain('kill -TERM -- "-$pid"');
    expect(cancellation).toContain('kill -KILL -- "-$pid"');
    const receipt = await provider.terminate(allocation);
    expect(receipt.resourceAbsent).toBe(true);
    expect(lobbyJson.mock.calls[1][0]).toEqual(["rm", allocation.resourceName, "--json"]);
  });

  it("fails closed when teardown cannot confirm exact absence", async () => {
    const name = "mc-attempt-0123456789abcdef";
    const record = { vm_name: name, id: "vm-1", status: "ready" };
    const lobbyJson = vi.fn().mockResolvedValue([record]);
    let now = 1;
    const provider = new ExeDevSandboxProvider(
      { lobbyJson, vmText: vi.fn() } as ExeDevTransport,
      () => now,
      async (duration) => { now += duration; },
    );
    await expect(provider.terminate({ provider: "EXE_DEV", providerResourceId: "vm-1", resourceName: name, state: "READY", createdAt: 1 }))
      .rejects.toThrow(/remains in exe.dev inventory/);
  });

  it("verifies the pinned toolchain and guest policy before launching a non-root restricted candidate", async () => {
    const selectedProfile = restrictedProfile();
    const proof = restrictedProof();
    const vmText = vi.fn().mockImplementation(async (_resourceName: string, command: string) =>
      command.startsWith("node /var/lib/mission-control/attempt/restricted-bootstrap.mjs")
        ? JSON.stringify(proof)
        : "321");
    const provider = new ExeDevSandboxProvider({ lobbyJson: vi.fn(), vmText } as ExeDevTransport);
    const allocation = {
      provider: "EXE_DEV" as const,
      providerResourceId: "vm-1",
      resourceName: "mc-attempt-0123456789abcdef",
      state: "READY" as const,
      createdAt: 1,
      providerMetadata: { image: selectedProfile.machine.image },
    };
    const executionManifest = manifest();
    const receipt = await provider.start({
      allocation, executionManifest, workOrderId: "w1", workOrderRevisionNumber: 1, workflowRunId: "r1", attemptId: "a1",
      manifestDigest: `sha256:${canonicalHash(executionManifest)}`, sourceSha: "a".repeat(40), profileDigest: "sha256:profile",
      security: selectedProfile.security,
      environmentDescriptor: { provider: "EXE_DEV", image: selectedProfile.machine.image }, repositoryArchive: Buffer.from("bundle"), supervisorSource: "// supervisor",
      executor: {
        command: "codex",
        args: ["exec", "--output-schema", "/var/lib/mission-control/attempt/factory-result.schema.json"],
        resultPath: "/var/lib/mission-control/attempt/executor-result.json",
        outputSchemaPath: "/var/lib/mission-control/attempt/factory-result.schema.json",
        outputSchema: { type: "object", required: ["status"] },
        prompt: "p",
        allowedPaths: ["src/**"],
        timeoutMs: 60_000,
      },
      environment: { OPENAI_API_KEY: "attempt-only", OPENAI_BASE_URL: "https://openrouter.ai/api/v1" },
    });

    expect(receipt.securityProof).toEqual(proof);
    const commands = vmText.mock.calls.map((call) => String(call[1]));
    expect(commands.some((command) => command.includes("restricted-bootstrap.mjs"))).toBe(true);
    expect(commands.join("\n")).not.toContain("attempt-only");
    const configUpload = vmText.mock.calls.find((call) => String(call[1]).endsWith(">/var/lib/mission-control/attempt/config.json"));
    const uploadedConfig = JSON.parse(Buffer.from(String(configUpload?.[2]), "base64").toString("utf8"));
    expect(uploadedConfig.executionSecurity).toEqual(selectedProfile.security?.execution);
  });

  it("fails closed when the restricted bootstrap omits a negative network proof", async () => {
    const selectedProfile = restrictedProfile();
    const proof = restrictedProof();
    proof.network.metadataBlocked = false;
    const vmText = vi.fn().mockImplementation(async (_resourceName: string, command: string) =>
      command.startsWith("node /var/lib/mission-control/attempt/restricted-bootstrap.mjs")
        ? JSON.stringify(proof)
        : "321");
    const provider = new ExeDevSandboxProvider({ lobbyJson: vi.fn(), vmText } as ExeDevTransport);
    const allocation = {
      provider: "EXE_DEV" as const,
      providerResourceId: "vm-1",
      resourceName: "mc-attempt-0123456789abcdef",
      state: "READY" as const,
      createdAt: 1,
      providerMetadata: { image: selectedProfile.machine.image },
    };

    await expect(provider.start({
      allocation, executionManifest: manifest(), workOrderId: "w1", workOrderRevisionNumber: 1, workflowRunId: "r1", attemptId: "a1",
      manifestDigest: "sha256:manifest", sourceSha: "a".repeat(40), profileDigest: "sha256:profile", security: selectedProfile.security,
      environmentDescriptor: { provider: "EXE_DEV", image: selectedProfile.machine.image }, repositoryArchive: Buffer.from("bundle"), supervisorSource: "// supervisor",
      executor: {
        command: "codex", args: ["exec"], resultPath: "/var/lib/mission-control/attempt/executor-result.json",
        prompt: "p", allowedPaths: ["src/**"], timeoutMs: 60_000,
      },
      environment: { OPENAI_API_KEY: "attempt-only", OPENAI_BASE_URL: "https://openrouter.ai/api/v1" },
    })).rejects.toThrow(/invalid or incomplete security proof/);
    expect(vmText.mock.calls.some((call) => String(call[1]).includes("nohup setsid"))).toBe(false);
  });

  it("retrieves bounded supervisor diagnostics before teardown", async () => {
    const diagnostics = { phase: "EXECUTOR_FINISHED", failure: { class: "NON_RETRYABLE_RESULT", code: "RESULT_FILE_MISSING" } };
    const vmText = vi.fn().mockResolvedValue(`0\n${Buffer.from(JSON.stringify(diagnostics)).toString("base64")}`);
    const provider = new ExeDevSandboxProvider({ lobbyJson: vi.fn(), vmText } as ExeDevTransport);
    const allocation = { provider: "EXE_DEV" as const, providerResourceId: "vm-1", resourceName: "mc-attempt-0123456789abcdef", state: "RUNNING" as const, createdAt: 1 };

    await expect(provider.fetchDiagnostics(allocation)).resolves.toEqual({ ...diagnostics, supervisorProcessRunning: false });
    expect(vmText.mock.calls[0][1]).toContain("diagnostics.json");
    expect(vmText.mock.calls[0][1]).toContain("head -c 65536");
  });
});

function request(selectedProfile: SandboxProfileSnapshot) {
  return {
    resourceName: "mc-attempt-0123456789abcdef", projectId: "p1", workOrderId: "w1", workflowRunId: "r1", attemptId: "a1",
    attemptLeaseId: "l1", manifestDigest: "sha256:manifest", sourceSha: "a".repeat(40), profile: selectedProfile, requestedAt: 1,
  };
}

function profile(): SandboxProfileSnapshot {
  return {
    schema: "factory-sandbox-profile/v1", profileKey: "exe-standard", version: 1, provider: "EXE_DEV",
    providerProfile: "standard", providerProfileVersion: "v1", machine: { image: "debian:bookworm", cpu: 2, memoryMb: 4_096, diskGb: 20 },
    supervisor: { version: "mission-control-supervisor/v1", transport: "SSH" },
    runtime: { maxRuntimeMs: 60_000, resultPollIntervalMs: 250, resultRetentionMs: 86_400_000 },
    network: { egress: "UNRESTRICTED", egressAllowlist: [], publicIngress: false, exposedPorts: [] },
    credentials: { inference: "ATTEMPT_SCOPED_OPENROUTER", repositoryAccess: "CONTROL_PLANE_SNAPSHOT", githubAuthority: "NONE", providerAuthority: "NONE" },
    spend: { maxUsd: 1, enforcement: "PROVIDER_KEY_LIMIT" }, teardown: { terminateOnEveryTerminalState: true, verifyResourceAbsent: true, supportsResume: false },
    preview: { mode: "DISABLED" }, readiness: { state: "DEGRADED", checkedAt: 1, reason: "Unrestricted egress", egressEnforcementProven: false, liveCertified: true },
  };
}

function restrictedProfile(): SandboxProfileSnapshot {
  const digest = `sha256:${"a".repeat(64)}`;
  return {
    ...profile(),
    profileKey: "exe-remote-restricted-candidate-v1",
    providerProfileVersion: "restricted-candidate-v1",
    machine: { ...profile().machine, image: `ghcr.io/jaydubya818/mission-control-remote-sandbox@${digest}` },
    network: { egress: "RESTRICTED_ALLOWLIST", egressAllowlist: ["openrouter.ai:443"], publicIngress: false, exposedPorts: [] },
    readiness: { state: "DEGRADED", checkedAt: 1, reason: "Guest policy only", egressEnforcementProven: true, liveCertified: true },
    security: {
      schema: "factory-sandbox-security/v1",
      profile: "remote-sandbox/exe-dev/restricted-candidate-v1",
      qualificationOnly: true,
      image: { digest, provenanceReference: "https://github.com/jaydubya818/MissionControl/actions/runs/1", sbomDigest: `sha256:${"b".repeat(64)}` },
      toolchain: {
        nodeVersion: "v26.7.0", codexVersion: "codex-cli 0.146.0",
        codexBinarySha256: `sha256:${"c".repeat(64)}`, toolchainInputsSha256: `sha256:${"d".repeat(64)}`,
      },
      execution: {
        user: "mc-attempt", uid: 10_001, gid: 10_001,
        homePath: "/var/lib/mission-control/attempt/home", temporaryPath: "/var/lib/mission-control/attempt/tmp", noNewPrivileges: true,
      },
      network: {
        enforcement: "GUEST_NFTABLES", providerEnforced: false, allowedHttpsHosts: ["openrouter.ai"],
        dnsMode: "CONTROL_PLANE_RESOLVE_ETC_HOSTS", denyPrivateNetworks: true, denyLinkLocal: true,
        denyMetadata: true, denyUnexpectedDns: true,
      },
    },
  };
}

function restrictedProof(): SandboxSecurityProof {
  return {
    schema: "factory-sandbox-security-proof/v1",
    profile: "remote-sandbox/exe-dev/restricted-candidate-v1",
    observedAt: 1,
    toolchain: {
      nodeVersion: "v26.7.0", codexVersion: "codex-cli 0.146.0",
      codexBinarySha256: `sha256:${"c".repeat(64)}`, toolchainInputsSha256: `sha256:${"d".repeat(64)}`,
      executionUid: 10_001, executionGid: 10_001,
    },
    filesystem: { repositoryOwnerUid: 10_001, repositoryOwnerGid: 10_001, protectedPathsReadOnly: true },
    network: {
      enforcement: "GUEST_NFTABLES", providerEnforced: false, policyDigest: `sha256:${"e".repeat(64)}`,
      allowedHttpsHosts: ["openrouter.ai"], resolvedAddresses: ["104.18.12.12"],
      controlExternalEndpointReachable: true,
      approvedEndpointReachable: true, arbitraryExternalBlocked: true, privateNetworkBlocked: true,
      metadataBlocked: true, unexpectedDnsBlocked: true,
    },
  };
}

function manifest() {
  return {
    version: "factory-execution-manifest/v1",
    causation: { workOrderId: "w1", workOrderRevisionNumber: 1, workflowRunId: "r1" },
    repository: { baseSha: "a".repeat(40) },
    harness: { executionBackend: "remote-sandbox", pullRequestAuthority: "CONTROL_PLANE_ONLY" },
    sandbox: {
      profileDigest: "sha256:profile", supervisorVersion: "mission-control-supervisor/v1",
      credentialGrants: [{ secretValueIncluded: false, githubAuthority: "NONE", providerAuthority: "NONE" }],
    },
  };
}
