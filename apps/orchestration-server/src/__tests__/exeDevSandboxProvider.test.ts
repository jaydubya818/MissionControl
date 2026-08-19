import { describe, expect, it, vi } from "vitest";
import { canonicalHash } from "@mission-control/shared";
import { ExeDevSandboxProvider, exeDevCommandErrorDetail, type ExeDevTransport } from "../exeDevSandboxProvider.js";
import type { SandboxProfileSnapshot } from "../sandboxProvider.js";

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

    expect(vmText).toHaveBeenCalledTimes(6);
    expect(vmText.mock.calls[0][1]).toBe(vmText.mock.calls[1][1]);
    expect(vmText.mock.calls[0][2]).toBe(vmText.mock.calls[1][2]);
    expect(JSON.parse(Buffer.from(vmText.mock.calls[3][2], "base64").toString("utf8"))).toEqual({ type: "object", required: ["status"] });
    const uploadedConfig = JSON.parse(Buffer.from(vmText.mock.calls[4][2], "base64").toString("utf8"));
    expect(uploadedConfig.executionManifest).toEqual(executionManifest);
    const supervisorLaunch = vmText.mock.calls[5][1];
    expect(supervisorLaunch).toContain("git clone --quiet");
    expect(supervisorLaunch).toContain("command -v setsid");
    expect(supervisorLaunch).toContain("nohup setsid node");
    expect(supervisorLaunch).toContain("2>&1 &\nprintf '%s'");
    expect(supervisorLaunch).not.toContain("&;");
    expect(supervisorLaunch).not.toContain("attempt-only");
    await provider.cancel(allocation, "test cancellation");
    const cancellation = vmText.mock.calls[6][1];
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
