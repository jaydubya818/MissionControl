import { execFile, spawn } from "node:child_process";
import { appendFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type {
  SandboxAllocation,
  SandboxAllocationRequest,
  SandboxProvider,
  SandboxProfileSnapshot,
  SandboxProfileValidation,
  SandboxSecurityProof,
  SandboxStartReceipt,
  SandboxStartRequest,
  SandboxTerminationReceipt,
} from "./sandboxProvider.js";
import { assertSafeSandboxResourceName, redactSandboxText, validateSandboxProfile } from "./sandboxProvider.js";
import { standaloneRestrictedSandboxBootstrapSource } from "./standaloneRestrictedSandboxBootstrapSource.js";

const execFileAsync = promisify(execFile);
const EXE_DEV_HOST = "exe.dev";
const EXE_DEV_HOST_FINGERPRINT = "SHA256:JJOP/lwiBGOMilfONPWZCXUrfK154cnJFXcqlsi6lPo";
const EXE_DEV_TAG = "mission-control-factory-attempt";
const READY_STATES = new Set(["ready", "running"]);
const TERMINAL_STATES = new Set(["stopped", "failed", "error"]);
const REMOTE_ROOT = "/var/lib/mission-control/attempt";
const RESTRICTED_BOOTSTRAP_PATH = `${REMOTE_ROOT}/restricted-bootstrap.mjs`;
const RESTRICTED_BOOTSTRAP_CONFIG_PATH = `${REMOTE_ROOT}/restricted-bootstrap.json`;
const RESTRICTED_SECURITY_PROOF_PATH = `${REMOTE_ROOT}/security-proof.json`;

export interface ExeDevTransport {
  lobbyJson(command: string[]): Promise<any>;
  vmText(resourceName: string, command: string, input?: string): Promise<string>;
  dispose?(): Promise<void> | void;
}

export class ExeDevSandboxProvider implements SandboxProvider {
  readonly kind = "EXE_DEV" as const;
  constructor(
    private readonly transport: ExeDevTransport = new ExeDevSshTransport(),
    private readonly now: () => number = Date.now,
    private readonly sleep: (durationMs: number) => Promise<void> = (durationMs) => new Promise((resolve) => setTimeout(resolve, durationMs)),
  ) {}

  async validateProfile(profile: SandboxProfileSnapshot): Promise<SandboxProfileValidation> {
    const validation = validateSandboxProfile(profile);
    const errors = [...validation.errors];
    if (profile.provider !== "EXE_DEV") errors.push("exe.dev provider requires an EXE_DEV profile.");
    if (!/^[A-Za-z0-9._:/@+-]+$/.test(profile.machine.image)) errors.push("exe.dev image identifier contains unsupported characters.");
    if (profile.machine.cpu < 2) errors.push("The certified exe.dev N=1 profile requires at least 2 CPUs.");
    if (profile.machine.memoryMb < 2_048) errors.push("The certified exe.dev N=1 profile requires at least 2048 MB of memory.");
    if (profile.machine.diskGb < 10) errors.push("The certified exe.dev N=1 profile requires at least 10 GB of disk.");
    return {
      ...validation,
      valid: errors.length === 0,
      dispatchable: errors.length === 0 && validation.readiness !== "BLOCKED",
      readiness: errors.length === 0 ? validation.readiness : "BLOCKED",
      errors,
    };
  }

  async allocate(request: SandboxAllocationRequest): Promise<SandboxAllocation> {
    assertSafeSandboxResourceName(request.resourceName);
    const validation = await this.validateProfile(request.profile);
    if (!validation.dispatchable) throw new Error(`Sandbox Profile is not dispatchable: ${validation.errors.join(" ")}`);
    const integrations = await this.transport.lobbyJson(["integrations", "list", "--json", "--usage"]);
    if (hasAutomaticIntegration(integrations)) {
      throw new Error("exe.dev has an automatic integration attached to new VMs; remote sandbox allocation is blocked.");
    }
    const existing = findVm(await this.transport.lobbyJson(["ls", "--json"]), request.resourceName);
    if (existing) return allocationFromVm(existing, request.resourceName, this.now());
    const payload = await this.transport.lobbyJson([
      "new",
      `--name=${request.resourceName}`,
      `--cpu=${request.profile.machine.cpu}`,
      `--memory=${request.profile.machine.memoryMb}MB`,
      `--disk=${request.profile.machine.diskGb}GB`,
      `--image=${request.profile.machine.image}`,
      `--tag=${EXE_DEV_TAG}`,
      "--no-email",
      "--json",
    ]);
    const record = findVm(payload, request.resourceName) ?? payload;
    return allocationFromVm(record, request.resourceName, this.now());
  }

  async inspect(allocation: SandboxAllocation): Promise<SandboxAllocation> {
    assertSafeSandboxResourceName(allocation.resourceName);
    const record = findVm(await this.transport.lobbyJson(["ls", allocation.resourceName, "--json"]), allocation.resourceName);
    if (!record) return { ...allocation, state: "TERMINATED", terminatedAt: this.now(), lastHeartbeatAt: this.now() };
    const status = String(record.status ?? "").toLowerCase();
    const state = READY_STATES.has(status)
      ? allocation.startedAt ? "RUNNING" : "READY"
      : TERMINAL_STATES.has(status) ? "FAILED" : "ALLOCATING";
    return {
      ...allocation,
      state,
      readyAt: READY_STATES.has(status) ? allocation.readyAt ?? this.now() : allocation.readyAt,
      lastHeartbeatAt: this.now(),
      providerMetadata: sanitizedProviderMetadata(record),
    };
  }

  async start(request: SandboxStartRequest): Promise<SandboxStartReceipt> {
    assertSafeSandboxResourceName(request.allocation.resourceName);
    if (request.allocation.provider !== this.kind) throw new Error("Sandbox allocation belongs to a different provider.");
    if (!/^[a-f0-9]{40,64}$/i.test(request.sourceSha)) throw new Error("Sandbox start requires an immutable source SHA.");
    const outputSchemaPath = `${REMOTE_ROOT}/factory-result.schema.json`;
    if (request.executor.outputSchemaPath !== undefined || request.executor.outputSchema !== undefined) {
      if (request.executor.outputSchemaPath !== outputSchemaPath || !request.executor.outputSchema) {
        throw new Error("Remote harness output schema must use the bounded Attempt schema path.");
      }
    }
    if (request.security) {
      const environmentKeys = Object.keys(request.environment).sort();
      if (request.executor.resultPath !== `${REMOTE_ROOT}/executor-result.json`) {
        throw new Error("Restricted sandbox executor result must use the bounded Attempt result path.");
      }
      if (JSON.stringify(environmentKeys) !== JSON.stringify(["OPENAI_API_KEY", "OPENAI_BASE_URL"])
        || !request.environment.OPENAI_API_KEY
        || request.environment.OPENAI_BASE_URL !== "https://openrouter.ai/api/v1") {
        throw new Error("Restricted sandbox environment exceeds Attempt-scoped inference authority.");
      }
    }
    const config = {
      executionManifest: request.executionManifest,
      attemptId: request.attemptId,
      workOrderId: request.workOrderId,
      workOrderRevisionNumber: request.workOrderRevisionNumber,
      workflowRunId: request.workflowRunId,
      manifestDigest: request.manifestDigest,
      profileDigest: request.profileDigest,
      sourceSha: request.sourceSha,
      environmentDescriptor: request.environmentDescriptor,
      repositoryRoot: `${REMOTE_ROOT}/repository`,
      outputPath: `${REMOTE_ROOT}/result.json`,
      diagnosticsPath: `${REMOTE_ROOT}/diagnostics.json`,
      executor: {
        command: request.executor.command,
        args: request.executor.args,
        resultPath: request.executor.resultPath,
        timeoutMs: request.executor.timeoutMs,
      },
      ...(request.security ? { executionSecurity: request.security.execution } : {}),
      environment: request.environment,
    };
    await this.upload(request.allocation.resourceName, `${REMOTE_ROOT}/repository.bundle`, request.repositoryArchive);
    await this.upload(request.allocation.resourceName, `${REMOTE_ROOT}/supervisor.mjs`, Buffer.from(request.supervisorSource, "utf8"));
    if (request.executor.outputSchema) {
      await this.upload(request.allocation.resourceName, outputSchemaPath, Buffer.from(JSON.stringify(request.executor.outputSchema), "utf8"));
    }
    await this.transport.vmText(request.allocation.resourceName, [
      "set -eu",
      `rm -rf ${REMOTE_ROOT}/repository`,
      `git clone --quiet ${REMOTE_ROOT}/repository.bundle ${REMOTE_ROOT}/repository`,
      `git -C ${REMOTE_ROOT}/repository checkout --quiet ${request.sourceSha}`,
      `rm -f ${REMOTE_ROOT}/repository.bundle`,
      `rm -f ${REMOTE_ROOT}/result.json ${REMOTE_ROOT}/result.json.tmp-* ${REMOTE_ROOT}/diagnostics.json ${REMOTE_ROOT}/diagnostics.json.tmp-* ${REMOTE_ROOT}/executor-result.json ${RESTRICTED_SECURITY_PROOF_PATH}`,
    ].join("\n"));
    let securityProof: SandboxSecurityProof | undefined;
    if (request.security) {
      const observedProviderImage = String(request.allocation.providerMetadata?.image ?? "");
      if (!observedProviderImage) throw new Error("exe.dev did not report the allocated image identity.");
      await this.upload(request.allocation.resourceName, RESTRICTED_BOOTSTRAP_PATH, Buffer.from(standaloneRestrictedSandboxBootstrapSource(), "utf8"));
      await this.upload(request.allocation.resourceName, RESTRICTED_BOOTSTRAP_CONFIG_PATH, Buffer.from(JSON.stringify({
        security: request.security,
        expectedImage: request.environmentDescriptor.image,
        observedProviderImage,
        remoteRoot: REMOTE_ROOT,
        repositoryRoot: `${REMOTE_ROOT}/repository`,
        executorResultPath: request.executor.resultPath,
        outputSchemaPath: request.executor.outputSchemaPath,
        proofPath: RESTRICTED_SECURITY_PROOF_PATH,
      }), "utf8"));
      const proofOutput = await this.transport.vmText(
        request.allocation.resourceName,
        `node ${RESTRICTED_BOOTSTRAP_PATH} ${RESTRICTED_BOOTSTRAP_CONFIG_PATH}`,
      );
      securityProof = assertRestrictedSecurityProof(JSON.parse(proofOutput), request.security);
    }
    await this.upload(request.allocation.resourceName, `${REMOTE_ROOT}/config.json`, Buffer.from(JSON.stringify(config), "utf8"));
    await this.transport.vmText(request.allocation.resourceName, [
      "set -eu",
      "command -v setsid >/dev/null",
      `nohup setsid node ${REMOTE_ROOT}/supervisor.mjs ${REMOTE_ROOT}/config.json >${REMOTE_ROOT}/supervisor.log 2>&1 &`,
      `printf '%s' \"$!\" >${REMOTE_ROOT}/pid`,
      `cat ${REMOTE_ROOT}/pid`,
    ].join("\n"));
    return {
      processId: `${request.allocation.providerResourceId}:supervisor`,
      startedAt: this.now(),
      state: "RUNNING",
      ...(securityProof ? { securityProof } : {}),
    };
  }

  async fetchResult(allocation: SandboxAllocation): Promise<Buffer | null> {
    assertSafeSandboxResourceName(allocation.resourceName);
    const encoded = await this.transport.vmText(
      allocation.resourceName,
      `if test -f ${REMOTE_ROOT}/result.json; then base64 <${REMOTE_ROOT}/result.json | tr -d '\\n'; fi`,
    );
    const trimmed = encoded.trim();
    return trimmed ? Buffer.from(trimmed, "base64") : null;
  }

  async fetchDiagnostics(allocation: SandboxAllocation): Promise<Record<string, unknown> | null> {
    assertSafeSandboxResourceName(allocation.resourceName);
    const encoded = await this.transport.vmText(
      allocation.resourceName,
      [
        `if test -f ${REMOTE_ROOT}/pid && kill -0 "$(cat ${REMOTE_ROOT}/pid)" 2>/dev/null; then printf '1\\n'; else printf '0\\n'; fi`,
        `if test -f ${REMOTE_ROOT}/diagnostics.json; then`,
        `head -c 65536 ${REMOTE_ROOT}/diagnostics.json | base64 | tr -d '\\n'`,
        `elif test -f ${REMOTE_ROOT}/supervisor.log; then`,
        `tail -c 16000 ${REMOTE_ROOT}/supervisor.log | base64 | tr -d '\\n'`,
        "fi",
      ].join("\n"),
    );
    const trimmed = encoded.trim();
    if (!trimmed) return null;
    const lines = trimmed.split(/\r?\n/);
    const hasProcessState = lines[0] === "0" || lines[0] === "1";
    const supervisorProcessRunning = hasProcessState ? lines.shift() === "1" : null;
    const text = Buffer.from(lines.join(""), "base64").toString("utf8");
    try {
      const value = JSON.parse(text);
      return value && typeof value === "object" && !Array.isArray(value)
        ? { ...value as Record<string, unknown>, supervisorProcessRunning }
        : { supervisorLogTail: redactSandboxText(text), supervisorProcessRunning };
    } catch {
      return { supervisorLogTail: redactSandboxText(text), supervisorProcessRunning };
    }
  }

  async cancel(allocation: SandboxAllocation, _reason: string): Promise<void> {
    assertSafeSandboxResourceName(allocation.resourceName);
    await this.transport.vmText(
      allocation.resourceName,
      [
        `if test -f ${REMOTE_ROOT}/pid; then`,
        `pid="$(cat ${REMOTE_ROOT}/pid)"`,
        'kill -TERM -- "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true',
        "for attempt in $(seq 1 50); do",
        'if ! kill -0 -- "-$pid" 2>/dev/null; then exit 0; fi',
        "sleep 0.1",
        "done",
        'kill -KILL -- "-$pid" 2>/dev/null || kill -KILL "$pid" 2>/dev/null || true',
        "fi",
      ].join("\n"),
    );
  }

  async terminate(allocation: SandboxAllocation): Promise<SandboxTerminationReceipt> {
    assertSafeSandboxResourceName(allocation.resourceName);
    const requestedAt = this.now();
    const existing = findVm(await this.transport.lobbyJson(["ls", "--json"]), allocation.resourceName);
    if (existing) await this.transport.lobbyJson(["rm", allocation.resourceName, "--json"]);
    const deadline = this.now() + 30_000;
    while (this.now() < deadline) {
      const remaining = findVm(await this.transport.lobbyJson(["ls", "--json"]), allocation.resourceName);
      if (!remaining) {
        return {
          providerResourceId: allocation.providerResourceId,
          resourceName: allocation.resourceName,
          requestedAt,
          confirmedAbsentAt: this.now(),
          resourceAbsent: true,
        };
      }
      await this.sleep(500);
    }
    throw new Error(`Sandbox ${allocation.resourceName} remains in exe.dev inventory after termination.`);
  }

  private async upload(resourceName: string, remotePath: string, content: Buffer) {
    const encoded = content.toString("base64");
    let lastError: unknown;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        await this.transport.vmText(resourceName, `umask 077; mkdir -p ${REMOTE_ROOT}; base64 -d >${remotePath}`, encoded);
        return;
      } catch (error) {
        lastError = error;
        if (attempt < 3) await this.sleep(attempt * 500);
      }
    }
    throw lastError;
  }
}

function assertRestrictedSecurityProof(
  value: unknown,
  expected: NonNullable<SandboxProfileSnapshot["security"]>,
): SandboxSecurityProof {
  const proof = value as SandboxSecurityProof;
  if (!proof || proof.schema !== "factory-sandbox-security-proof/v1"
    || proof.profile !== expected.profile
    || !Number.isFinite(proof.observedAt)
    || proof.toolchain?.nodeVersion !== expected.toolchain.nodeVersion
    || proof.toolchain?.codexVersion !== expected.toolchain.codexVersion
    || proof.toolchain?.codexBinarySha256 !== expected.toolchain.codexBinarySha256
    || proof.toolchain?.toolchainInputsSha256 !== expected.toolchain.toolchainInputsSha256
    || proof.network?.enforcement !== "GUEST_NFTABLES"
    || proof.network?.providerEnforced !== false
    || !/^sha256:[a-f0-9]{64}$/i.test(proof.network.policyDigest)
    || JSON.stringify(proof.network.allowedHttpsHosts) !== JSON.stringify(expected.network.allowedHttpsHosts)
    || !Array.isArray(proof.network.resolvedAddresses) || proof.network.resolvedAddresses.length === 0
    || !proof.network.controlExternalEndpointReachable
    || !proof.network.approvedEndpointReachable
    || !proof.network.arbitraryExternalBlocked
    || !proof.network.privateNetworkBlocked
    || !proof.network.metadataBlocked
    || !proof.network.unexpectedDnsBlocked
    || !proof.filesystem?.protectedPathsReadOnly
    || proof.filesystem.repositoryOwnerUid !== expected.execution.uid
    || proof.filesystem.repositoryOwnerGid !== expected.execution.gid
    || proof.toolchain?.executionUid !== expected.execution.uid
    || proof.toolchain?.executionGid !== expected.execution.gid) {
    throw new Error("Restricted sandbox bootstrap returned an invalid or incomplete security proof.");
  }
  return proof;
}

export class ExeDevSshTransport implements ExeDevTransport {
  private readonly directoryPromise = mkdtemp(path.join(tmpdir(), "mc-exedev-provider-"));
  private readonly trustedHosts = new Set<string>();
  constructor(private readonly identityFile = process.env.EXEDEV_IDENTITY_FILE?.trim()) {}

  async lobbyJson(command: string[]) {
    const output = await this.run(EXE_DEV_HOST, command);
    try { return JSON.parse(output.trim()); } catch { throw new Error("exe.dev returned non-JSON provider output."); }
  }

  async vmText(resourceName: string, command: string, input?: string) {
    assertSafeSandboxResourceName(resourceName);
    return await this.run(`${resourceName}.exe.xyz`, [command], input);
  }

  async dispose() {
    await rm(await this.directoryPromise, { recursive: true, force: true });
  }

  private async run(host: string, remoteCommand: string[], input?: string) {
    const knownHosts = await this.trust(host);
    const args = [
      "-o", "BatchMode=yes",
      "-o", "ConnectTimeout=10",
      "-o", "StrictHostKeyChecking=yes",
      "-o", `UserKnownHostsFile=${knownHosts}`,
      "-o", "LogLevel=ERROR",
    ];
    if (this.identityFile) args.push("-o", "IdentitiesOnly=yes", "-i", this.identityFile);
    args.push(host, ...remoteCommand);
    try {
      if (input === undefined) {
        const result = await execFileAsync("ssh", args, { maxBuffer: 12 * 1024 * 1024, timeout: 60_000 });
        return result.stdout;
      }
      return (await spawnWithInput("ssh", args, input, 60_000)).stdout;
    } catch (error: any) {
      const detail = exeDevCommandErrorDetail(error);
      throw new Error(`exe.dev command failed: ${redactSandboxText(detail)}`);
    }
  }

  private async trust(host: string) {
    const directory = await this.directoryPromise;
    const knownHosts = path.join(directory, "known_hosts");
    if (this.trustedHosts.has(host)) return knownHosts;
    const scan = await execFileAsync("ssh-keyscan", ["-t", "rsa", host], { timeout: 10_000 });
    const fingerprint = await spawnWithInput("ssh-keygen", ["-lf", "-", "-E", "sha256"], scan.stdout, 10_000);
    const observed = fingerprint.stdout.match(/SHA256:[A-Za-z0-9+/=]+/)?.[0];
    if (observed !== EXE_DEV_HOST_FINGERPRINT) throw new Error("exe.dev SSH host fingerprint did not match the pinned control-plane value.");
    if (this.trustedHosts.size === 0) await writeFile(knownHosts, scan.stdout, { mode: 0o600 });
    else await appendFile(knownHosts, scan.stdout);
    this.trustedHosts.add(host);
    return knownHosts;
  }
}

export function exeDevCommandErrorDetail(error: any) {
  return String(error?.stderr ?? "").trim()
    || String(error?.stdout ?? "").trim()
    || String(error?.message ?? "exe.dev command failed");
}

function findVm(payload: any, name: string) {
  const records = Array.isArray(payload) ? payload : Array.isArray(payload?.vms) ? payload.vms : Array.isArray(payload?.boxes) ? payload.boxes : payload ? [payload] : [];
  return records.find((record: any) => String(record?.vm_name ?? record?.name ?? record?.box_name ?? "") === name);
}

function hasAutomaticIntegration(payload: unknown): boolean {
  if (payload === "auto:all") return true;
  if (Array.isArray(payload)) return payload.some(hasAutomaticIntegration);
  return Boolean(payload && typeof payload === "object" && Object.values(payload).some(hasAutomaticIntegration));
}

function allocationFromVm(record: any, resourceName: string, now: number): SandboxAllocation {
  const status = String(record?.status ?? "").toLowerCase();
  const ready = READY_STATES.has(status);
  return {
    provider: "EXE_DEV",
    providerResourceId: String(record?.id ?? record?.vm_id ?? record?.vm_name ?? resourceName),
    resourceName,
    state: ready ? "READY" : TERMINAL_STATES.has(status) ? "FAILED" : "ALLOCATING",
    createdAt: parseTime(record?.created_at) ?? now,
    readyAt: ready ? now : undefined,
    lastHeartbeatAt: now,
    providerMetadata: sanitizedProviderMetadata(record),
  };
}

function sanitizedProviderMetadata(record: any) {
  return {
    status: String(record?.status ?? "unknown"),
    image: String(record?.image ?? record?.image_name ?? "unknown"),
    cpu: numberOrUndefined(record?.cpu ?? record?.cpus),
    memoryMb: numberOrUndefined(record?.memory_mb),
    diskGb: numberOrUndefined(record?.disk_gb),
  };
}

function parseTime(value: unknown) {
  const timestamp = typeof value === "number" ? value : Date.parse(String(value ?? ""));
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

function numberOrUndefined(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

async function spawnWithInput(command: string, args: string[], input: string, timeoutMs: number) {
  return await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => child.kill("SIGTERM"), timeoutMs);
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0) reject(Object.assign(new Error(`${command} exited with ${code}.`), { stderr }));
      else resolve({ stdout, stderr });
    });
    child.stdin.end(input);
  });
}
