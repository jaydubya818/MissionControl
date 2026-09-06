 import { StringDecoder } from "node:string_decoder";
import {
  CODEX_BEDROCK_V1_HARNESS_MANIFEST,
  harnessCapabilityManifestDigest,
} from "@mission-control/workflow-engine";
import { CodexBedrockExecutorAdapter } from "./codexBedrockExecutorAdapter.js";
import { BedrockSettlementError, type BedrockInferenceBridge } from "./bedrockInferenceBridge.js";
import type { AccountingReference } from "./accountingDeliveryJournal.js";
import {
  responsesToBedrock,
  bedrockToResponses,
} from "./bedrockResponsesProtocol.js"; import { execFile, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { promisify } from "node:util";
import { homedir } from "node:os";
import { canonicalHash } from "@mission-control/shared";
import { redactSandboxTail, sandboxProfileDigest, type SandboxProvider, type SandboxProfileSnapshot, type SandboxAllocationRequest, type SandboxAllocation, type SandboxStartRequest, type SandboxStartReceipt, type SandboxTerminationReceipt } from "./sandboxProvider.js";

const exec = promisify(execFile);
const ROOT = "/var/lib/mission-control/attempt";
export const DOCKER_PROVIDER_ID = "factory/docker-offline/v1";
export const DOCKER_INVOCATION_SCHEMA = "factory-docker-invocation/v1";
export type DockerTerminalState =  | "SUCCESS" | "WORKLOAD_FAILURE" | "INFRASTRUCTURE_FAILURE" | "TIMEOUT" | "CANCELED" | "FENCED" | "INVALID_REQUEST" | "BUDGET_DENIED" | "POLICY_DENIED";
export class DockerBoundaryError extends Error {
  constructor(readonly terminalState: DockerTerminalState, message: string) { super(message); }
}
export interface DockerProviderIdentity {
  image: string;
  imageId: string;
  platform: "linux/amd64";
  dockerPath: string;
  socketPath: string;
}
export const DOCKER_CANDIDATE_IDENTITY: DockerProviderIdentity = Object.freeze({
  image: "mission-control/factory-docker-qualification@sha256:32951f1bd7974c9f6e7d37e75b5356ba0196120448b8b10b47bb34fc2dbe34e2",
  imageId: "sha256:32951f1bd7974c9f6e7d37e75b5356ba0196120448b8b10b47bb34fc2dbe34e2",
  platform: "linux/amd64",
  dockerPath: "/Applications/Docker.app/Contents/Resources/bin/docker",
  socketPath: `${homedir()}/.docker/run/docker.sock`,
});

interface OwnedContainer {
  request: SandboxAllocationRequest;
  allocation: SandboxAllocation;
  process?: ChildProcessWithoutNullStreams;
  result?: Buffer;
  exitCode?: number | null;
  failure?: string;
  accountingReference?: AccountingReference;
  stderrTail?: string;
  canceled: boolean;
  timer?: ReturnType<typeof setTimeout>;
  terminalState?: DockerTerminalState;
  policyInspection?: Record<string, unknown>;
 inferenceAbort?: AbortController; }

/** Internal, offline qualification provider. It cannot issue inference requests.
 * The existing worker owns leases, reporting, verification and publication gates.
 * There are no mounts, dynamic Docker options, ambient credentials or mutable tags.
 */
export class DockerSandboxProvider implements SandboxProvider {
  readonly kind = "DOCKER" as const;
  private readonly owned = new Map<string, OwnedContainer>();
  private readonly identity: Readonly<DockerProviderIdentity>;
   private readonly providerId: string; constructor(identity: DockerProviderIdentity ,
    private readonly options: {
      createBedrockBridge?: (
        request: SandboxStartRequest,
      ) => BedrockInferenceBridge;
    } = {} ) {
     this.providerId = options.createBedrockBridge
      ? "factory/docker-bedrock/v1"
      : DOCKER_PROVIDER_ID;
    if (
      options.createBedrockBridge &&
      identity.image === DOCKER_CANDIDATE_IDENTITY.image
    )
      throw new DockerBoundaryError(
        "POLICY_DENIED",
        "Bedrock bootstrap requires its separately qualified image.",
      ); if (!/^[a-z0-9][a-z0-9/._:-]*@sha256:[a-f0-9]{64}$/.test(identity.image) || !/^sha256:[a-f0-9]{64}$/.test(identity.imageId) || identity.platform !== "linux/amd64"
      || !identity.dockerPath.startsWith("/") || !identity.socketPath.startsWith("/")) throw new DockerBoundaryError("POLICY_DENIED", "Docker requires a frozen local image ID, platform and local transport.");
    this.identity = Object.freeze({ ...identity });
  }
  private args(args: string[]) { return ["--host", `unix://${this.identity.socketPath}`, ...args]; }
  private async docker(args: string[]) {
    return (await exec(this.identity.dockerPath, this.args(args), { timeout: 30_000, maxBuffer: 12 * 1024 * 1024, env: { PATH: "/usr/bin:/bin", HOME: homedir() } })).stdout;
  }
  async validateProfile(profile: SandboxProfileSnapshot) {
    const errors: string[] = [];
    if (profile.schema !== "factory-sandbox-profile/v1" || profile.provider !== this.kind
      || profile.providerProfile !== this.providerId || profile.providerProfileVersion !== "1"
      || profile.machine.image !== this.identity.image || profile.machine.cpu !== 1 || profile.machine.memoryMb !== 512
      || profile.supervisor.transport !== "DOCKER_STDIN" || profile.supervisor.version !== "mission-control-supervisor/v1"
      || profile.credentials.inference !== "NONE" || profile.credentials.githubAuthority !== "NONE"
      || profile.credentials.providerAuthority !== "NONE" || profile.credentials.repositoryAccess !== "CONTROL_PLANE_SNAPSHOT"
      || profile.network.egress !== "RESTRICTED_ALLOWLIST" || profile.network.egressAllowlist.length !== 0
      || profile.network.publicIngress !== false || profile.network.exposedPorts.length !== 0
      || profile.preview.mode !== "DISABLED" || profile.security !== undefined
      || !profile.teardown.terminateOnEveryTerminalState || !profile.teardown.verifyResourceAbsent || profile.teardown.supportsResume
      || !Number.isSafeInteger(profile.runtime.maxRuntimeMs) || !Number.isSafeInteger(profile.runtime.resultPollIntervalMs)
      || profile.readiness.state === "BLOCKED"
      || profile.runtime.maxRuntimeMs < 1_000 || profile.runtime.maxRuntimeMs > 900_000
      || profile.runtime.resultPollIntervalMs < 250 || profile.runtime.resultPollIntervalMs > 5_000) errors.push("Unsupported Docker offline profile; inference is not qualified.");
    return { valid: errors.length === 0, dispatchable: errors.length === 0, readiness: errors.length ?  ( "BLOCKED" as const  ) :  ( "DEGRADED" as const ) , errors, warnings: ["Offline qualification only; no provider route or readiness authority."], profileDigest: sandboxProfileDigest(profile) };
  }
  async allocate(request: SandboxAllocationRequest): Promise<SandboxAllocation> {
    if (!(await this.validateProfile(request.profile)).dispatchable || !/^mc-attempt-[a-f0-9]{16}$/.test(request.resourceName)
      || !request.attemptLeaseId || !request.manifestDigest.startsWith("sha256:")) throw new DockerBoundaryError("INVALID_REQUEST", "Invalid Docker allocation.");
    const version = JSON.parse(await this.docker(["version", "--format", "{{json .Server}}"]));
    if (version.Os !== "linux" || Number(version.Version?.split(".")[0]) < 29) throw new DockerBoundaryError("POLICY_DENIED", "Requires Linux Docker Engine 29 or newer; exact engine qualification remains required.");
    const securityOptions = JSON.parse(await this.docker(["info", "--format", "{{json .SecurityOptions}}"]));
    if (!securityOptions.includes("name=seccomp,profile=builtin")) throw new DockerBoundaryError("POLICY_DENIED", "Docker default seccomp is not enabled.");
    const [image] = JSON.parse(await this.docker(["image", "inspect", this.identity.image]));
    if (image.Id !== this.identity.imageId || !image.RepoDigests?.includes(this.identity.image) || image.Os !== "linux" || image.Architecture !== "amd64"
      || Object.keys(image.Config.Volumes ?? {}).length) throw new DockerBoundaryError("POLICY_DENIED", "Image identity or implicit volume mismatch.");
    // Docker name collision is rejected. Never reuse, adopt, or remove another lease's resource.
    const id = (await this.docker(["create", "--pull=never", "--platform=linux/amd64", "--name", request.resourceName,
      "--label", `mc.provider=${this.providerId}`, "--label", `mc.lease=${request.attemptLeaseId}`,
      "--label", `mc.manifest=${request.manifestDigest}`, "--user=10001:10001", "--read-only", "--network=none",
      "--cap-drop=ALL", "--security-opt=no-new-privileges", "--cpus=1", "--memory=512m", "--memory-swap=512m", "--pids-limit=64",
      "--ipc=private", "--cgroupns=private", "--log-driver=none",
      "--tmpfs", `${ROOT}:rw,nosuid,nodev,noexec,size=134217728,uid=10001,gid=10001,mode=0700`,
      "--tmpfs", "/tmp:rw,nosuid,nodev,noexec,size=16777216,uid=10001,gid=10001,mode=0700",
      "--env", `MC_DEADLINE_AT=${request.requestedAt + request.profile.runtime.maxRuntimeMs}`,
      "--env", `HOME=${ROOT}/home`, "--env", "TMPDIR=/tmp", "--env", "LANG=C",
      "--workdir", ROOT, "--entrypoint=node", "--interactive", this.identity.image, "/opt/factory/bridge.mjs"])).trim();
    const allocation: SandboxAllocation = { provider: this.kind, providerResourceId: id, resourceName: request.resourceName, state: "READY", createdAt: Date.now(), readyAt: Date.now(), providerMetadata: { schema: "factory-docker-resource/v1", image: this.identity.image, leaseId: request.attemptLeaseId, manifestDigest: request.manifestDigest } };
    this.owned.set(id, { request: structuredClone(request), allocation, canceled: false });
    try { await this.assertContainer(allocation); } catch (error) { await this.terminate(allocation); throw error; }
    return allocation;
  }
  private record(allocation: SandboxAllocation) {
    let record = this.owned.get(allocation.providerResourceId);
    if (allocation.provider !== this.kind || !/^mc-attempt-[a-f0-9]{16}$/.test(allocation.resourceName)
      || !/^[a-f0-9]{64}$/.test(allocation.providerResourceId)) throw new DockerBoundaryError("FENCED", "Unknown or stale Docker allocation; no resource authority.");
    if (!record) {
      // Only durable control-plane allocations may recover teardown authority.
      // Exact Docker labels are checked before any mutation. Recovery never resumes execution.
      const m = allocation.providerMetadata;
      if (m?.schema !== "factory-docker-resource/v1" || m.image !== this.identity.image
        || typeof m.leaseId !== "string" || !m.leaseId || !/^sha256:[a-f0-9]{64}$/.test(String(m.manifestDigest))) throw new DockerBoundaryError("FENCED", "Missing durable Docker ownership proof.");
      record = { request: { resourceName: allocation.resourceName, attemptLeaseId: m.leaseId, manifestDigest: m.manifestDigest } as SandboxAllocationRequest, allocation, canceled: true };
      this.owned.set(allocation.providerResourceId, record);
    }
    if (record.allocation.resourceName !== allocation.resourceName) throw new DockerBoundaryError("FENCED", "Docker ownership mismatch.");
    return record;
  }
  private async assertContainer(allocation: SandboxAllocation) {
    const record = this.record(allocation);
    const [actual] = JSON.parse(await this.docker(["inspect", allocation.providerResourceId]));
    this.assertOwnership(actual, allocation, record.request);
    assertDockerContainerPolicy(actual, this.identity.imageId, record.request ,
      this.providerId );
    record.policyInspection = { image: actual.Image, user: actual.Config.User, networkMode: actual.HostConfig.NetworkMode, readonlyRootfs: actual.HostConfig.ReadonlyRootfs, capabilitiesDropped: actual.HostConfig.CapDrop, securityOptions: actual.HostConfig.SecurityOpt, pidMode: actual.HostConfig.PidMode, memory: actual.HostConfig.Memory, cpu: actual.HostConfig.NanoCpus, pids: actual.HostConfig.PidsLimit, tmpfs: actual.HostConfig.Tmpfs, mounts: actual.Mounts, privileged: actual.HostConfig.Privileged };
    return actual;
  }
  private assertOwnership(actual: any, allocation: SandboxAllocation, request: SandboxAllocationRequest) {
    if (actual.Id !== allocation.providerResourceId || actual.Name !== `/${allocation.resourceName}`
      || actual.Config?.Labels?.["mc.provider"] !== this.providerId
      || actual.Config?.Labels?.["mc.lease"] !== request.attemptLeaseId
      || actual.Config?.Labels?.["mc.manifest"] !== request.manifestDigest) throw new DockerBoundaryError("FENCED", "Docker resource ownership not proven.");
  }
  private async ownedState(allocation: SandboxAllocation) {
    const r = this.record(allocation);
    const [actual] = JSON.parse(await this.docker(["inspect", allocation.providerResourceId]));
    this.assertOwnership(actual, allocation, r.request);
    return actual;
  }
  async inspect(allocation: SandboxAllocation): Promise<SandboxAllocation> {
    const record = this.record(allocation);
    await this.assertContainer(allocation);
    return { ...record.allocation, state: record.result ? "RESULT_READY" : record.process ? "RUNNING" : "READY", lastHeartbeatAt: Date.now() };
  }
  async start(request: SandboxStartRequest): Promise<SandboxStartReceipt> {
    const record = this.record(request.allocation);
    if (record.canceled || record.process) throw new DockerBoundaryError("FENCED", "Canceled or already-started Docker allocation.");
    if (Object.keys(request.environment).length) throw new DockerBoundaryError("POLICY_DENIED", "Docker workload cannot receive credentials.");
    if (request.manifestDigest !== record.request.manifestDigest || request.manifestDigest !== `sha256:${canonicalHash(request.executionManifest)}`
      || request.attemptId !== record.request.attemptId || request.workOrderId !== record.request.workOrderId
      || request.sourceSha !== record.request.sourceSha || request.profileDigest !== sandboxProfileDigest(record.request.profile)
      || request.environmentDescriptor.provider !== this.kind || request.environmentDescriptor.image !== this.identity.image) throw new DockerBoundaryError("INVALID_REQUEST", "Docker invocation does not match its frozen allocation.");
    // Until the provider liability broker is behaviorally qualified, only the immutable
    // deterministic probe is executable. No caller-supplied command, prompt or model call.
    if ( !this.options.createBedrockBridge &&
      ( request.executor.command !== "node" || JSON.stringify(request.executor.args) !== JSON.stringify(["/opt/factory/qualification.mjs"])
      || request.executor.resultPath !== `${ROOT}/executor-result.json`)  ) throw new DockerBoundaryError("BUDGET_DENIED", "Inference dispatch denied: no qualified hard-budget broker path.");
     let bridge: BedrockInferenceBridge | undefined;
    if (this.options.createBedrockBridge) {
      const manifest = request.executionManifest as any;
      if (
        manifest.version !== "factory-execution-manifest/v3" ||
        manifest.harness.adapter !== "codex" ||
        manifest.harness.version !== "bedrock-v1" ||
        manifest.harness.capabilityManifestSha256 !==
          harnessCapabilityManifestDigest(CODEX_BEDROCK_V1_HARNESS_MANIFEST)
      )
        throw new DockerBoundaryError(
          "POLICY_DENIED",
          "Exact Bedrock V3 composition required.",
        );
      const expected = new CodexBedrockExecutorAdapter().createRemoteInvocation(
        {
          executionId: request.attemptId,
          repositoryRoot: `${ROOT}/repository`,
          workingDirectory: `${ROOT}/repository`,
          prompt: manifest.compiledPrompt,
          allowedPaths: manifest.repository.allowedPaths,
          deniedPaths: manifest.repository.excludedPaths,
          timeoutMs: manifest.harness.timeoutMs,
          isolation: manifest.harness.isolation,
          provider: manifest.modelRoute.routeSnapshot.provider,
          model: manifest.modelRoute.routeSnapshot.modelId,
          providerRoute: manifest.modelRoute.routeSnapshot.providerRoute,
          modelRouteDigest: manifest.modelRoute.routeDigest,
        },
        {
          repositoryRoot: `${ROOT}/repository`,
          resultPath: `${ROOT}/executor-result.json`,
        },
      );
      if (canonicalHash(expected) !== canonicalHash(request.executor))
        throw new DockerBoundaryError(
          "POLICY_DENIED",
          "Bedrock invocation differs from canonical builder.",
        );
      bridge = this.options.createBedrockBridge(request);
      bridge.assertExecutionBinding({
        workflowRunId: request.workflowRunId,
        leaseId: record.request.attemptLeaseId,
        workOrderId: request.workOrderId,
        workOrderRevision: request.workOrderRevisionNumber,
        executionProfileId: manifest.executionProfile.profileId,
        executionProfileDigest: manifest.executionProfile.profileDigest,
        harnessDigest: manifest.harness.capabilityManifestSha256,
        runtimeDigest: manifest.harness.runtimeArtifactDigest,
        modelRouteDigest: manifest.modelRoute.routeDigest,
      });
      record.inferenceAbort = new AbortController();
    } const config = dockerSupervisorConfig(request);
    const envelope = Buffer.from(JSON.stringify({ schema : bridge ? "factory-docker-duplex/v1" : DOCKER_INVOCATION_SCHEMA, deadlineAt: record.request.requestedAt + record.request.profile.runtime.maxRuntimeMs, leaseId: record.request.attemptLeaseId, config, repository: request.repositoryArchive.toString("base64") }));
    if (envelope.length > 32 * 1024 * 1024) throw new DockerBoundaryError("INVALID_REQUEST", "Docker invocation exceeds bounded input.");
    await this.assertContainer(request.allocation);
    if (record.canceled) throw new DockerBoundaryError("FENCED", "Lease canceled before start.");
    const child = spawn(this.identity.dockerPath, this.args(["start", "--attach", "--interactive", request.allocation.providerResourceId]), { env: { PATH: "/usr/bin:/bin", HOME: homedir() }, stdio: "pipe" });
    record.process = child;
    const chunks: Buffer[] = [];
    let size = 0;
     const decoder = new StringDecoder("utf8");
    let frameBuffer = "",
      sequence = 0,
      pendingFrame = false,
      finalFrame = false;
    const frameFailure = (error?: unknown) => {
      if (error instanceof BedrockSettlementError && error.accountingReference) {
        const reference = error.accountingReference;
        record.accountingReference = { journalId: reference.journalId, slot: reference.slot,
          observationDigest: reference.observationDigest, state: reference.state };
      }
      record.failure =
        error instanceof Error && /^[A-Z0-9_]{1,100}$/.test(error.message)
          ? error.message
          : "Invalid or failed inference frame";
      void this.cancel(request.allocation, "Bridge failure").catch(() => {});
    };
    const consumeFrame = async (line: string) => {
      try {
        const frame = JSON.parse(line);
        if (frame.type === "result" && !pendingFrame && !finalFrame) {
          finalFrame = true;
          chunks.push(Buffer.from(JSON.stringify(frame.body)));
          child.stdin.end();
          return;
        }
        if (
          !bridge ||
          frame.type !== "request" ||
          frame.sequence !== sequence + 1 ||
          pendingFrame ||
          finalFrame ||
          ++sequence > 100
        )
          throw new Error("Unexpected inference frame");
        pendingFrame = true;
        const translated = responsesToBedrock(frame.body, 4096);
        const result = await bridge.infer(
          `${request.attemptId}:${sequence}`,
          translated.request,
          record.inferenceAbort!.signal,
        );
        if (record.canceled) throw new Error("Canceled reply");
        const reply = bedrockToResponses(result, translated, `${sequence}`);
        child.stdin.write(
          JSON.stringify({ type: "reply", sequence, events: reply.events }) +
            "\n",
        );
        pendingFrame = false;
      } catch (error) {
        frameFailure(error);
      }
    }; child.stdout.on("data", (chunk: Buffer) => { size += chunk.length; if (size > 16 * 1024 * 1024)  {
        frameFailure();
        return;
      }
      if (!bridge) { chunks.push(chunk); return;
      }
      frameBuffer += decoder.write(chunk);
      if (Buffer.byteLength(frameBuffer) > 10 * 1024 * 1024) { frameFailure() ;
        return;
      }
      let newline: number;
      while ((newline = frameBuffer.indexOf("\n")) >= 0) {const line = frameBuffer.slice(0, newline);
        frameBuffer = frameBuffer.slice(newline + 1);
        void consumeFrame(line); } });
    // Do not persist arbitrary process stderr; it can contain workload data.
    child.stderr.on("data", (chunk: Buffer) => { record.stderrTail = redactSandboxTail((record.stderrTail ?? "") + chunk.toString("utf8")).slice(-4000); }); child.stdin.on("error", () => {});
    child.on("error", () => { record. inferenceAbort?.abort();
      record. failure = "Docker transport failed"; record.terminalState = "INFRASTRUCTURE_FAILURE"; });
    child.on("close", (code) => {  frameBuffer += decoder.end();
      record.inferenceAbort?.abort();
      if (bridge && (pendingFrame || frameBuffer.length))
        record.failure ??= "Bridge exited with incomplete frame"; clearTimeout(record.timer); record.exitCode = code; if (!record.canceled && !record.failure && code === 0 &&
        (!bridge || finalFrame) ) { record.result = Buffer.concat(chunks); record.terminalState = "WORKLOAD_FAILURE"; } else record.terminalState ??= code === 124 ? "TIMEOUT" : "INFRASTRUCTURE_FAILURE"; });
    record.timer = setTimeout(() => { record.terminalState = "TIMEOUT"; void this.cancel(request.allocation, "Frozen deadline").catch(() => {}); }, Math.max(1, Math.min(request.executor.timeoutMs, record.request.requestedAt + record.request.profile.runtime.maxRuntimeMs - Date.now())));
     if (bridge) child.stdin.write(Buffer.concat([envelope, Buffer.from("\n")]));
    else child.stdin.end(envelope);
    return { processId: request.allocation.providerResourceId, startedAt: Date.now(), state: "RUNNING" };
  }
  async fetchResult(allocation: SandboxAllocation) { const r = this.record(allocation); return r.canceled ? null :  ( r.result ?? null ) ; }
  async fetchDiagnostics(allocation: SandboxAllocation) { const r = this.record(allocation); return { provider: this.providerId, terminalState: r.terminalState ?? null, supervisorProcessRunning: r.exitCode === undefined && !r.failure, exitCode: r.exitCode ?? null, failure: r.failure ?? null, accountingReference: r.accountingReference ?? null, stderrTail: r.stderrTail ?? null, policyInspection: r.policyInspection ?? null }; }
  async cancel(allocation: SandboxAllocation, _reason: string) {
    const r = this.record(allocation );
    r.inferenceAbort?.abort( ); r.canceled = true; r.result = undefined; r.terminalState ??= "CANCELED";
    const actual = await this.ownedState(allocation);
    if (actual.State.Running) await this.docker(["kill", allocation.providerResourceId]);
  }
  async terminate(allocation: SandboxAllocation): Promise<SandboxTerminationReceipt> {
    if (!allocation.providerResourceId) return await this.terminateRequested(allocation);
    const record = this.record(allocation); const requestedAt = Date.now();
    const present = await this.docker(["ps", "--all", "--quiet", "--no-trunc", "--filter", `id=${allocation.providerResourceId}`]);
    if (present.trim()) {
      await this.ownedState(allocation);
      await this.docker(["rm", "--force", "--volumes", allocation.providerResourceId]);
    }
    // Prove daemon responsiveness plus absence; an inspect connection error is not absence.
    const remaining = await this.docker(["ps", "--all", "--quiet", "--no-trunc", "--filter", `id=${allocation.providerResourceId}`]);
    if (remaining.trim()) throw new Error("Docker resource absence not proven");
    clearTimeout(record.timer); record. inferenceAbort?.abort();
    record. process?.kill(); this.owned.delete(allocation.providerResourceId);
    return { providerResourceId: allocation.providerResourceId, resourceName: allocation.resourceName, requestedAt, confirmedAbsentAt: Date.now(), resourceAbsent: true };
  }
  private async terminateRequested(allocation: SandboxAllocation): Promise<SandboxTerminationReceipt> {
    const journal = allocation as SandboxAllocation & { profileSnapshot?: SandboxProfileSnapshot; attemptLeaseId?: string; manifestDigest?: string  ; };
    if (journal.provider !== "DOCKER" || !/^mc-attempt-[a-f0-9]{16}$/.test(journal.resourceName)
      || !journal.attemptLeaseId || !/^sha256:[a-f0-9]{64}$/.test(journal.manifestDigest ?? "")
      || !journal.profileSnapshot || !(await this.validateProfile(journal.profileSnapshot)).dispatchable) {
      throw new DockerBoundaryError("FENCED", "Missing frozen Docker request recovery authority.");
    }
    const requestedAt = Date.now();
    const proof = { schema: "factory-docker-request-recovery/v1" as const, image: this.identity.image,
      attemptLeaseId: journal.attemptLeaseId, manifestDigest: journal.manifestDigest! };
    const find = async () => (await this.docker(["ps", "--all", "--quiet", "--no-trunc", "--filter", `name=^/${journal.resourceName}$`])).trim();
    const id = await find();
    if (!id) throw new DockerBoundaryError("INFRASTRUCTURE_FAILURE", "Docker creation outcome remains unknown; request journal must remain unresolved.");
    if (id) {
      if (!/^[a-f0-9]{64}$/.test(id)) throw new DockerBoundaryError("FENCED", "Ambiguous Docker request identity.");
      const [actual] = JSON.parse(await this.docker(["inspect", id]));
      this.assertOwnership(actual, { ...allocation, providerResourceId: id }, {
        resourceName: journal.resourceName, attemptLeaseId: journal.attemptLeaseId, manifestDigest: journal.manifestDigest,
      } as SandboxAllocationRequest);
      if (actual.Image !== this.identity.imageId) throw new DockerBoundaryError("FENCED", "Recovered Docker image mismatch.");
      await this.docker(["rm", "--force", "--volumes", id]);
    }
    if (await find()) throw new Error("Requested Docker resource absence not proven");
    return { providerResourceId: id, resourceName: journal.resourceName,
      requestedAt, confirmedAbsentAt: Date.now(), resourceAbsent: true, allocationRecoveryProof: proof };
  }

}

export function assertDockerContainerPolicy(actual: any, image: string, request: SandboxAllocationRequest ,
  providerId = DOCKER_PROVIDER_ID ) {
  const h = actual.HostConfig; const c = actual.Config;
  const tmpfs = h?.Tmpfs ?? {};
  if (actual.Image !== image || actual.Name !== `/${request.resourceName}` || c?.User !== "10001:10001"
    || c?.Labels?.["mc.lease"] !== request.attemptLeaseId || c?.Labels?.["mc.manifest"] !== request.manifestDigest
    || c?.Labels?.["mc.provider"] !== providerId || !h?.ReadonlyRootfs || h.Privileged || h.NetworkMode !== "none"
    || JSON.stringify(h.CapDrop) !== '["ALL"]' || (h.CapAdd?.length ?? 0) !== 0
    || JSON.stringify(h.SecurityOpt) !== '["no-new-privileges"]' || h.PidMode !== "" || h.IpcMode !== "private"
    || h.CgroupnsMode !== "private" || h.NanoCpus !== 1_000_000_000 || h.Memory !== 536870912 || h.MemorySwap !== 536870912 || h.PidsLimit !== 64
    || (h.Binds?.length ?? 0) !== 0 || (h.Devices?.length ?? 0) !== 0 || (h.VolumesFrom?.length ?? 0) !== 0
    || (c.Env ?? []).some((entry: string) => !["PATH", "NODE_VERSION", "YARN_VERSION", "HOME", "TMPDIR", "LANG", "MC_DEADLINE_AT"].includes(entry.split("=")[0]))
    || Object.keys(h.PortBindings ?? {}).length !== 0 || (actual.Mounts ?? []).some((m: any) => m.Type !== "tmpfs")
    || JSON.stringify(c.Entrypoint) !== '["node"]' || JSON.stringify(c.Cmd) !== '["/opt/factory/bridge.mjs"]'
    || Object.keys(tmpfs).length !== 2
    || tmpfs[ROOT] !== "rw,nosuid,nodev,noexec,size=134217728,uid=10001,gid=10001,mode=0700"
    || tmpfs["/tmp"] !== "rw,nosuid,nodev,noexec,size=16777216,uid=10001,gid=10001,mode=0700") throw new DockerBoundaryError("POLICY_DENIED", "Docker inspection does not match frozen containment policy.");
}

/** Preserve the governed admission instant across the container boundary. */
export function dockerSupervisorConfig(request: SandboxStartRequest) {
  if (request.executionManifest.version === "factory-execution-manifest/v3" && (!Number.isSafeInteger(request.profileAdmittedAt) || Number(request.profileAdmittedAt) <= 0)) throw new DockerBoundaryError("INVALID_REQUEST", "V3 Docker execution requires the governed profile admission instant.");
  return { profileAdmittedAt: request.profileAdmittedAt, executionManifest: request.executionManifest, attemptId: request.attemptId, workOrderId: request.workOrderId,
      workOrderRevisionNumber: request.workOrderRevisionNumber, workflowRunId: request.workflowRunId, manifestDigest: request.manifestDigest,
      profileDigest: request.profileDigest, sourceSha: request.sourceSha, environmentDescriptor: request.environmentDescriptor,
      repositoryRoot: `${ROOT}/repository`, outputPath: `${ROOT}/result.json`, diagnosticsPath: `${ROOT}/diagnostics.json`, executor: request.executor, environment: {} };
}
