import { spawn, execFile, type ChildProcess } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExecutorRequest, ExecutorResult, HarnessExecutionContext, HarnessExecutorAdapter, HarnessExecutorCapabilities } from "@mission-control/workflow-engine";
import { GENERIC_HARNESS_CONTRACT_VERSION, NO_HARNESS_AUTHORITY } from "../../../packages/workflow-engine/src/executorAdapter.js";
import { isolatedInvocationIssues, invocationCompositionIssues, invocationDigest, invocationResult, invocationResultMatches, type InvocationComposition, type InvocationStatus, type IsolatedInvocation, type IsolatedInvocationResult } from "../../../packages/workflow-engine/src/isolatedInvocation.js";

const exec = promisify(execFile);
export { ISOLATED_CONTAINER_POLICY, ISOLATED_CONTAINER_POLICY_DIGEST } from "../../../packages/workflow-engine/src/isolatedInvocation.js";
import { ISOLATED_CONTAINER_POLICY_DIGEST } from "../../../packages/workflow-engine/src/isolatedInvocation.js";

interface Prepared { request: IsolatedInvocation; context: HarnessExecutionContext }
export interface IsolatedExecutorResult extends ExecutorResult {
  invocationEvidence: { schema: "factory-isolated-execution-evidence/v2"; evidenceOrigin: "CONTROL_FIXTURE"; authority: "NONE";
    container: { name: string; id: string | null };
    stdoutBase64: string; capturedStdoutSha256: string; truncated: boolean; exitCode: number | null; cleanupVerified: boolean;
    validatedRuntimeResult: IsolatedInvocationResult | null };
}
interface HandleState { stdout: Buffer; truncated: boolean; exitCode: number | null; validatedRuntimeResult: IsolatedInvocationResult | null; prepared: Prepared; name: string; containerId?: string; promise: Promise<IsolatedInvocationResult>; fence?: InvocationStatus; cleanupFailed: boolean; child?: ChildProcess; startedAt: number; cancellation: AbortController; dockerConfig?: string }

/** Offline adapter only. No production registry backend is advertised until governed profile admission exists. */
export class IsolatedInvocationAdapter implements HarnessExecutorAdapter<Prepared, object> {
  private readonly composition: InvocationComposition;
  private readonly prepared = new WeakMap<Prepared, string>();
  private readonly executions = new Set<string>();
  private readonly handles = new WeakMap<object, HandleState>();
  private readonly collected = new WeakSet<object>();
  private readonly cleaned = new WeakSet<object>();
  constructor(composition: InvocationComposition,
    private readonly authority: (request: IsolatedInvocation, phase: "DISPATCH" | "RESULT") => Promise<boolean>,
    private readonly dockerExecutable: string) {
    if (invocationCompositionIssues(composition).length || composition.isolationDigest !== ISOLATED_CONTAINER_POLICY_DIGEST
      || composition.bridge.id !== "isolated-invocation" || composition.bridge.version !== "1"
      || composition.backend.id !== "docker-chroot-offline" || composition.backend.version !== "1") throw new Error("Unsupported exact composition");
    this.composition = structuredClone(composition);
  }
  capabilities(): HarnessExecutorCapabilities {
    return { contractVersion: GENERIC_HARNESS_CONTRACT_VERSION, adapter: "isolated-invocation", version: "1", displayName: "Offline isolated invocation",
      runtimeArtifact: { schemaVersion: "harness-runtime-artifact/v1", kind: "CONTAINER_IMAGE", name: "isolated-invocation", version: "1", executableSha256: null, imageDigest: this.composition.runtimeImage },
      executionBackends: [], authority: NO_HARNESS_AUTHORITY, supportsCancel: true, supportsResume: false,
      supportsRepositoryMutation: false, isolationModes: ["READ_ONLY", "WORKSPACE_WRITE"], emittedEvents: ["EXECUTION_STARTED"] };
  }
  validateConfiguration(request: ExecutorRequest) {
    const issues: string[] = [];
    const allowed = ["executionId", "repositoryRoot", "workingDirectory", "prompt", "allowedPaths", "timeoutMs", "isolation"];
    if (Object.keys(request).some(key => !allowed.includes(key))) issues.push("unsupported-executor-field");
    if (request.repositoryRoot !== "/workspace" || request.workingDirectory !== "/workspace" || !["READ_ONLY", "WORKSPACE_WRITE"].includes(request.isolation)
      || !Array.isArray(request.allowedPaths) || request.allowedPaths.length !== 0) issues.push("ambient-workload-forbidden");
    try {
      if (typeof request.prompt !== "string" || Buffer.byteLength(request.prompt) > 16_384) throw new Error();
      const invocation = JSON.parse(request.prompt);
      issues.push(...isolatedInvocationIssues(invocation));
      if (request.isolation !== (invocation.workload?.reference === "verify-document-bytes/v1" ? "READ_ONLY" : "WORKSPACE_WRITE")) issues.push("operation-isolation-mismatch");
      if (invocation.executionId !== request.executionId || invocation.limits?.timeoutMs !== request.timeoutMs) issues.push("executor-request-mismatch");
      if (invocationDigest(invocation.composition) !== invocationDigest(this.composition)) issues.push("composition-substitution");
    } catch { issues.push("invalid-invocation-json"); }
    return issues.map(message => ({ field: "prompt", message }));
  }
  async estimate() { return { estimatedCostUsd: null, estimatedRuntimeMinutes: null, confidence: "LOW" as const }; }
  async prepare(request: ExecutorRequest, context: HarnessExecutionContext) {
    const issues = this.validateConfiguration(request);
    if (issues.length) throw new Error(issues.map(x => x.message).join(","));
    if (context.signal?.aborted) throw new Error("Invocation canceled before preparation");
    const invocation: IsolatedInvocation = JSON.parse(request.prompt);
    if (this.executions.has(invocation.executionId)) throw new Error("Invocation replay");
    this.executions.add(invocation.executionId);
    const prepared = { request: invocation, context: { ...context } };
    this.prepared.set(prepared, invocationDigest(invocation));
    return prepared;
  }
  async execute(prepared: Prepared): Promise<object> {
    if (this.prepared.get(prepared) !== invocationDigest(prepared.request)) throw new Error("Unprepared, modified or replayed invocation");
    this.prepared.delete(prepared);
    prepared = { request: structuredClone(prepared.request), context: prepared.context };
    const handle: HandleState = { stdout: Buffer.alloc(0), truncated: false, exitCode: null, validatedRuntimeResult: null, prepared, name: `mc-invoke-${randomUUID()}`, promise: Promise.resolve(null as never), cleanupFailed: false, startedAt: Date.now(), cancellation: new AbortController() };
    handle.promise = this.dispatch(handle);
    const token = Object.freeze({});
    this.handles.set(token, handle);
    return token;
  }
  private async dispatch(handle: HandleState): Promise<IsolatedInvocationResult> {
    const { request, context } = handle.prepared;
    const startedAt = handle.startedAt;
    const result = (status: InvocationStatus) => invocationResult(request, status, startedAt);
    if (context.signal?.aborted || handle.fence) return result("CANCELED");
    try { if (!await this.bounded(this.authority(structuredClone(request), "DISPATCH"), handle)) return result("STALE"); }
    catch { return result(handle.fence ?? "STALE"); }
    if (context.signal?.aborted || handle.fence) return result("CANCELED");
    if (Date.now() - startedAt >= request.limits.timeoutMs) return result("TIMED_OUT");
    const args = ["run", "--pull", "never", "--name", handle.name, "--network", "none", "--read-only", "--cap-drop", "ALL",
      "--cap-add", "SYS_CHROOT", "--cap-add", "SETUID", "--cap-add", "SETGID", "--security-opt", "no-new-privileges",
      "--pids-limit", "64", "--memory", "256m", "--cpus", "1",
      "--tmpfs", "/jail/workspace:rw,noexec,nosuid,size=16777216,uid=65534,gid=65534,mode=0700",
      "--tmpfs", "/jail/tmp:rw,noexec,nosuid,size=16777216,uid=65534,gid=65534,mode=0700",
      "--entrypoint", "/usr/bin/env", "-i", request.composition.runtimeImage,
      "-i", "PATH=/runtime", "HOME=/workspace", "TMPDIR=/tmp", "LANG=C", "/usr/sbin/chroot", "--userspec=65534:65534", "/jail", "/runtime/node", "/runtime/invoke.mjs"];
    // Docker's -i flag precedes the image; no shell expansion, host mounts or inherited credentials.
    let timer: ReturnType<typeof setTimeout> | undefined;
    let closed: Promise<number | null> | undefined;
    const abort = () => { void this.cancelState(handle).catch(() => { handle.cleanupFailed = true; }); };
    try {
      handle.dockerConfig = await mkdtemp(join(tmpdir(), "mc-offline-docker-"));
      if (context.signal?.aborted || handle.fence || Date.now() - startedAt >= request.limits.timeoutMs) {
        handle.fence ??= context.signal?.aborted ? "CANCELED" : "TIMED_OUT";
        throw new Error(handle.fence);
      }
      args.splice(1, 0, "--cidfile", join(handle.dockerConfig, "container.id"));
      const child = spawn(this.dockerExecutable, [...this.dockerOptions(handle), ...args], { env: { PATH: "/usr/local/bin:/usr/bin:/bin" }, stdio: ["pipe", "pipe", "pipe"] });
      handle.child = child;
      const exit = new Promise<number | null>((resolve) => {
        // Observe spawn errors immediately, even while the event consumer is pending.
        child.once("error", () => { /* close follows failed spawn; keep the error observed immediately. */ });
        child.once("close", code => { handle.exitCode = code; resolve(code); });
      });
      closed = exit;
      child.stdout.on("data", chunk => {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        const remaining = 32_768 - handle.stdout.length;
        handle.stdout = Buffer.concat([handle.stdout, bytes.subarray(0, remaining)]);
        if (bytes.length > remaining) { handle.truncated = true; handle.fence ??= "INFRASTRUCTURE_FAILURE"; child.kill("SIGKILL"); }
      });
      child.stderr.resume();
      child.stdin.on("error", () => { /* exit status records rejected input/closed process */ });
      timer = setTimeout(() => { handle.fence ??= "TIMED_OUT"; child.kill("SIGKILL"); }, Math.max(1, request.limits.timeoutMs - (Date.now() - startedAt)));
      context.signal?.addEventListener("abort", abort, { once: true });
      if (context.signal?.aborted || handle.fence) { handle.fence ??= "CANCELED"; child.kill("SIGKILL"); }
      child.stdin.end(JSON.stringify(request));
      await this.bounded(Promise.resolve(context.emit({ executionId: request.executionId, sequence: 1, type: "EXECUTION_STARTED", occurredAt: Date.now(), summary: "Offline container invocation started." })), handle);
      const code = await exit;
      handle.exitCode = code;
      if (code === 0 && !handle.truncated) {
        try {
          const candidate: unknown = JSON.parse(handle.stdout.toString("utf8"));
          if (invocationResultMatches(candidate, request)) handle.validatedRuntimeResult = candidate;
        } catch { /* Invalid runtime bytes remain bounded, non-authoritative evidence. */ }
      }
      if (handle.fence) return result(handle.fence);
      if (code !== 0) return result(code === 2 ? "INVALID_REQUEST" : "INFRASTRUCTURE_FAILURE");
      return handle.validatedRuntimeResult ?? result("INFRASTRUCTURE_FAILURE");
    } catch { return result(handle.fence ?? "INFRASTRUCTURE_FAILURE"); }
    finally {
      if (timer) clearTimeout(timer);
      context.signal?.removeEventListener("abort", abort);
      handle.child?.kill("SIGKILL");
      if (closed) {
        let drainTimer: ReturnType<typeof setTimeout> | undefined;
        try {
          const drained = await Promise.race([closed.then(() => true), new Promise<boolean>(resolve => {
            drainTimer = setTimeout(() => resolve(false), 10_000);
          })]);
          if (!drained) handle.cleanupFailed = true;
          else if (handle.exitCode === 0 && !handle.truncated) {
            try {
              const observed: unknown = JSON.parse(handle.stdout.toString("utf8"));
              if (invocationResultMatches(observed, request)) handle.validatedRuntimeResult = observed;
            } catch { /* Retain raw bytes without claiming a validated runtime result. */ }
          }
        } finally { if (drainTimer) clearTimeout(drainTimer); }
      }
      if (handle.dockerConfig) {
        try {
          const id = (await readFile(join(handle.dockerConfig, "container.id"), "utf8")).trim();
          if (!/^[a-f0-9]{64}$/.test(id)) throw new Error("Invalid Docker container identity");
          handle.containerId = id;
        } catch { if (handle.validatedRuntimeResult) handle.fence ??= "INFRASTRUCTURE_FAILURE"; }
      }
      await this.stop(handle);
      if (handle.dockerConfig) {
        try { await rm(handle.dockerConfig, { recursive: true, force: true }); }
        catch { handle.cleanupFailed = true; }
      }
    }
  }
  private async bounded<T>(operation: Promise<T>, handle: HandleState): Promise<T> {
    const signal = handle.prepared.context.signal;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let abort = () => {};
    try {
      return await Promise.race([operation, new Promise<never>((_, reject) => {
        const fail = (status: InvocationStatus) => { handle.fence ??= status; handle.child?.kill("SIGKILL"); reject(new Error(status)); };
        abort = () => fail("CANCELED");
        signal?.addEventListener("abort", abort, { once: true });
        handle.cancellation.signal.addEventListener("abort", abort, { once: true });
        const remaining = handle.prepared.request.limits.timeoutMs - (Date.now() - handle.startedAt);
        if (signal?.aborted || handle.cancellation.signal.aborted || handle.fence === "CANCELED") fail("CANCELED");
        else if (remaining <= 0) fail("TIMED_OUT");
        else timer = setTimeout(() => fail("TIMED_OUT"), remaining);
      })]);
    } finally { if (timer) clearTimeout(timer); signal?.removeEventListener("abort", abort); handle.cancellation.signal.removeEventListener("abort", abort); }
  }
  private dockerOptions(handle: HandleState) {
    if (!handle.dockerConfig) throw new Error("Isolated Docker configuration is missing");
    return ["--host", "unix:///var/run/docker.sock", "--config", handle.dockerConfig];
  }
  private async stop(handle: HandleState) {
    if (!handle.dockerConfig) return;
    const resource = handle.containerId ?? handle.name;
    const options = { timeout: 10_000, env: { PATH: "/usr/local/bin:/usr/bin:/bin" } };
    try { await exec(this.dockerExecutable, [...this.dockerOptions(handle), "rm", "-f", resource], options); }
    catch { /* An already absent container is idempotent; inspect must prove absence. */ }
    try {
      await exec(this.dockerExecutable, [...this.dockerOptions(handle), "container", "inspect", resource], options);
      handle.cleanupFailed = true;
    } catch (error) {
      const failure = error as { code?: unknown; stderr?: unknown };
      handle.cleanupFailed = handle.cleanupFailed || failure.code !== 1 || typeof failure.stderr !== "string"
        || !failure.stderr.includes(`No such container: ${resource}`);
    }
  }
  async collectResult(token: object): Promise<IsolatedExecutorResult> {
    const handle = this.requireHandle(token);
    if (this.collected.has(token)) throw new Error("Result already collected");
    this.collected.add(token);
    let receipt = await handle.promise;
    if (handle.fence) receipt = invocationResult(handle.prepared.request, handle.fence, receipt.startedAt);
    else if (handle.cleanupFailed) receipt = invocationResult(handle.prepared.request, "INFRASTRUCTURE_FAILURE", receipt.startedAt);
    else {
      try { if (!await this.bounded(this.authority(structuredClone(handle.prepared.request), "RESULT"), handle)) receipt = invocationResult(handle.prepared.request, "STALE", receipt.startedAt); }
      catch { receipt = invocationResult(handle.prepared.request, "STALE", receipt.startedAt); }
    }
    if (handle.fence) receipt = invocationResult(handle.prepared.request, handle.fence, receipt.startedAt);
    return { executionId: receipt.executionId, status: receipt.status === "SUCCESS" ? "COMPLETED" : receipt.status === "CANCELED" ? "CANCELED" : "FAILED", output: JSON.stringify(receipt),
      invocationEvidence: { schema: "factory-isolated-execution-evidence/v2", evidenceOrigin: "CONTROL_FIXTURE", authority: "NONE",
        container: { name: handle.name, id: handle.containerId ?? null },
        stdoutBase64: handle.stdout.toString("base64"), capturedStdoutSha256: `sha256:${createHash("sha256").update(handle.stdout).digest("hex")}`,
        truncated: handle.truncated, exitCode: handle.exitCode, cleanupVerified: !handle.cleanupFailed, validatedRuntimeResult: structuredClone(handle.validatedRuntimeResult) } };
  }
  private async cancelState(handle: HandleState) { handle.fence ??= "CANCELED"; handle.cancellation.abort(); handle.child?.kill("SIGKILL"); return true; }
  private requireHandle(token: object) { const state = this.handles.get(token); if (!state) throw new Error("Foreign or cleaned invocation handle"); return state; }
  async cancel(token: object) { return this.cancelState(this.requireHandle(token)); }
  async cleanup(token: object) { if (this.cleaned.has(token)) return; const handle = this.requireHandle(token); await handle.promise; if (handle.cleanupFailed) throw new Error("Container cleanup unverified"); this.handles.delete(token); this.cleaned.add(token); }
  async health(): ReturnType<HarnessExecutorAdapter["health"]> { return { status: "UNAVAILABLE" as const, checkedAt: Date.now(), adapter: "isolated-invocation", version: "1", details: "Governed profile admission is not qualified. Offline controls only." }; }
}
