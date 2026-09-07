import { describe, expect, it } from "vitest";
import { mkdtemp, writeFile, readFile, rm, mkdir, symlink } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { materializeDeterministicCandidate } from "../factoryGitRuntime.js";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RENDER_MARKDOWN_OPERATION_DIGEST } from "../../../../packages/workflow-engine/src/deterministicWorkload.js";
import { VERIFY_DOCUMENT_OPERATION_DIGEST } from "../../../../packages/workflow-engine/src/deterministicVerification.js";
import { sha256Hex } from "@mission-control/shared";
import { IsolatedInvocationAdapter, ISOLATED_CONTAINER_POLICY_DIGEST } from "../isolatedInvocationAdapter.js";
import { COMPOSITION_SCHEMA, INVOCATION_SCHEMA, INVOCATION_RESULT_SCHEMA, SYNTHETIC_WORKLOAD_DIGEST, invocationDigest, isolatedInvocationIssues, invocationResult, invocationResultMatches, type IsolatedInvocation } from "../../../../packages/workflow-engine/src/isolatedInvocation.js";

export function controlRequest(): IsolatedInvocation {
  const sha = `sha256:${"a".repeat(64)}`;
  const composition = { schema: COMPOSITION_SCHEMA, profileClass: "isolated-offline-control/v1" as const,
    bridge: { id: "isolated-invocation", version: "1", digest: sha }, backend: { id: "docker-chroot-offline", version: "1", digest: sha },
    runtimeImage: sha, isolationDigest: ISOLATED_CONTAINER_POLICY_DIGEST, invocationSchema: INVOCATION_SCHEMA, resultSchema: INVOCATION_RESULT_SCHEMA };
  return { schema: INVOCATION_SCHEMA, resultSchema: INVOCATION_RESULT_SCHEMA, executionId: "control-execution", attemptId: "control-attempt", workOrderId: "control-workorder", correlationId: "control-correlation", profileId: "control-profile", profileDigest: sha, executionManifestDigest: sha,
    taskId: "control-task", plan: { id: "control-plan", version: 1, digest: sha }, factoryVersion: { id: "control-factory-version", configurationDigest: "factory-v1-12345678" }, budgetReservationId: "control-reservation",
    composition, compositionDigest: invocationDigest(composition), lease: { leaseId: "control-lease", ownerId: "control-service", workerId: "control-worker", sessionId: "control-session", generation: 1 },
    workload: { reference: "synthetic-receipt/v1", digest: SYNTHETIC_WORKLOAD_DIGEST }, capabilities: ["synthetic-receipt"], limits: { timeoutMs: 100, budgetReference: "offline-zero-provider-calls/v1" }, transmission: "NONE", modelRoute: "NONE" };
}
function wrap(request: IsolatedInvocation) { return { executionId: request.executionId, repositoryRoot: "/workspace", workingDirectory: "/workspace", prompt: JSON.stringify(request), allowedPaths: [], timeoutMs: request.limits.timeoutMs, isolation: "WORKSPACE_WRITE" as const }; }

describe("offline invocation contract (not profile admission)", () => {
  it("cannot turn a failed independent byte comparison into a successful result", () => {
    const request = controlRequest();
    const content = "# Synthetic\n";
    request.workload = { reference: "verify-document-bytes/v1", digest: VERIFY_DOCUMENT_OPERATION_DIGEST,
      input: { subjectDigest: request.profileDigest, verificationPlanDigest: request.plan.digest,
        repositoryId: "repository", workOrderId: request.workOrderId, workOrderRevisionNumber: 1,
        producerAttemptId: "producer", candidateSha: "a".repeat(40), candidateTreeSha: "b".repeat(40),
        path: "docs/synthetic.md", expectedContentSha256: `sha256:${sha256Hex(new TextEncoder().encode(content))}`,
        candidateContent: content } };
    request.capabilities = ["verify-document-bytes"];
    expect(isolatedInvocationIssues(request)).toEqual([]);
    const success = invocationResult(request, "SUCCESS", 1, 2);
    expect(success).toMatchObject({ status: "SUCCESS", candidateFiles: [], behavioralPass: false, providerCalls: 0 });
    request.workload.input.candidateContent += "Mutation\n";
    expect(invocationResultMatches(success, request)).toBe(false);
    const failed = invocationResult(request, "SUCCESS", 1, 2);
    expect(failed.status).toBe("WORKLOAD_FAILURE");
    expect(invocationResultMatches({ ...failed, status: "SUCCESS" }, request)).toBe(false);
    for (const status of ["CANCELED", "TIMED_OUT", "STALE"] as const) {
      expect(invocationResult(request, status, 1, 2).status).toBe(status);
    }
  });
  it.each([false, true])("materializes scoped runtime content and rejects symlink escape=%s", async linked => {
    const directory = await mkdtemp(join(tmpdir(), "deterministic-candidate-control-"));
    try {
      const repository = join(directory, "repository"); const outside = join(directory, "outside");
      await mkdir(repository); await mkdir(outside);
      const git = (args: string[]) => promisify(execFile)("git", args, { cwd: repository });
      await git(["init", "-b", "main"]); await git(["config", "user.name", "Synthetic Qualification"]);
      await git(["config", "user.email", "synthetic@example.test"]);
      await writeFile(join(repository, "README.md"), "Synthetic baseline\n");
      if (linked) await symlink(outside, join(repository, "docs"));
      await git(["add", "."]); await git(["commit", "-m", "Synthetic baseline"]);
      const sourceSha = (await git(["rev-parse", "HEAD"])).stdout.trim();
      const request = controlRequest();
      request.workload = { reference: "render-markdown/v1", digest: RENDER_MARKDOWN_OPERATION_DIGEST,
        input: { title: "Synthetic", paragraphs: ["Synthetic content."], outputPath: "docs/control.md" } };
      request.capabilities = ["render-markdown"];
      const result = invocationResult(request, "SUCCESS", 1, 2);
      const input = { worktree: repository, sourceSha, request, result, allowedPaths: ["docs/**"], excludedPaths: [] };
      await expect(materializeDeterministicCandidate({ ...input, allowedPaths: ["other/**"] })).rejects.toThrow("approved code scope");
      await expect(materializeDeterministicCandidate({ ...input, excludedPaths: ["docs/control.md"] })).rejects.toThrow("approved code scope");
      await expect(materializeDeterministicCandidate({ ...input, result: invocationResult(request, "CANCELED", 1, 2) })).rejects.toThrow("exact runtime result");
      const forged = structuredClone(result); forged.candidateFiles[0].content = "Forged content";
      await expect(materializeDeterministicCandidate({ ...input, result: forged })).rejects.toThrow("exact runtime result");
      if (linked) {
        await expect(materializeDeterministicCandidate(input)).rejects.toThrow("could not be materialized");
        await expect(readFile(join(outside, "control.md"))).rejects.toThrow();
      } else {
        await materializeDeterministicCandidate(input);
        expect(await readFile(join(repository, "docs/control.md"), "utf8")).toBe(result.candidateFiles[0].content);
        await expect(materializeDeterministicCandidate(input)).rejects.toThrow("not clean");
      }
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
  it.each(["stale", "event-failure"])("retains actual runtime bytes and drains split UTF-8 after %s", async mode => {
    const request = controlRequest();
    request.limits.timeoutMs = 5000;
    request.workload = { reference: "render-markdown/v1", digest: RENDER_MARKDOWN_OPERATION_DIGEST,
      input: { title: "Synthetic 界 document", paragraphs: ["Synthetic content."], outputPath: "docs/control.md" } };
    request.capabilities = ["render-markdown"];
    const expected = invocationResult(request, "SUCCESS", 1, 2);
    const bytes = Buffer.from(JSON.stringify(expected));
    const split = bytes.indexOf(Buffer.from("界")) + 1;
    const directory = await mkdtemp(join(tmpdir(), "invocation-utf8-control-"));
    try {
      const executable = join(directory, "fake-docker");
      const marker = join(directory, "runtime-exited");
      await writeFile(executable, `#!${process.execPath}\nconst prefix=process.argv.slice(2,6);if(prefix[0]!=='--host'||prefix[1]!=='unix:///var/run/docker.sock'||prefix[2]!=='--config'||require('node:fs').readdirSync(prefix[3]).some(name=>name!=='container.id'))process.exit(9);const args=process.argv.slice(6);\nif(args[0]==='run'){const cid=args.indexOf('--cidfile');require('node:fs').writeFileSync(args[cid+1],'b'.repeat(64));process.on('exit',()=>require('node:fs').writeFileSync(${JSON.stringify(marker)},'done'));process.stdin.resume();process.stdin.on('end',()=>{const b=Buffer.from('${bytes.toString("base64")}','base64');process.stdout.write(b.subarray(0,${split}));setTimeout(()=>process.stdout.end(b.subarray(${split})),30);});}else if(args[0]==='container'){process.stderr.write('No such container: '+args.at(-1));process.exitCode=1;}\n`, { mode: 0o700 });
      const adapter = new IsolatedInvocationAdapter(request.composition, async (_value, phase) => mode !== "stale" || phase !== "RESULT", executable);
      const handle = await adapter.execute(await adapter.prepare(wrap(request), { emit: async () => {
        if (mode !== "event-failure") return;
        for (let index = 0; index < 200; index++) {
          try { await readFile(marker); break; } catch { await new Promise(resolve => setTimeout(resolve, 10)); }
        }
        await new Promise(resolve => setTimeout(resolve, 30));
        throw new Error("Synthetic event consumer failure after runtime output");
      } }));
      const result = await adapter.collectResult(handle);
      expect(JSON.parse(result.output!).status).toBe(mode === "stale" ? "STALE" : "INFRASTRUCTURE_FAILURE");
      expect(result.invocationEvidence.authority).toBe("NONE");
      expect(result.invocationEvidence.validatedRuntimeResult).toEqual(expected);
      expect(Buffer.from(result.invocationEvidence.stdoutBase64, "base64")).toEqual(bytes);
      expect(result.invocationEvidence.truncated).toBe(false);
      expect(result.invocationEvidence.exitCode).toBe(0);
      expect(result.invocationEvidence.cleanupVerified).toBe(true);
      await adapter.cleanup(handle);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
  it("binds candidate content and canonical causation without granting acceptance", () => {
    const request = controlRequest();
    request.workload = { reference: "render-markdown/v1", digest: RENDER_MARKDOWN_OPERATION_DIGEST,
      input: { title: "Synthetic document", paragraphs: ["Synthetic qualification content."], outputPath: "docs/control.md" } };
    request.capabilities = ["render-markdown"];
    expect(isolatedInvocationIssues(request)).toEqual([]);
    const result = invocationResult(request, "SUCCESS", 1, 2);
    expect(result.candidateFiles).toHaveLength(1);
    expect(invocationResultMatches(result, request)).toBe(true);
    for (const field of ["taskId", "budgetReservationId"] as const) {
      expect(invocationResultMatches(result, { ...request, [field]: "other" })).toBe(false);
    }
    expect(invocationResultMatches(result, { ...request, plan: { ...request.plan, version: 2 } })).toBe(false);
    expect(invocationResultMatches(result, { ...request, factoryVersion: { ...request.factoryVersion, id: "other" } })).toBe(false);
    const altered = structuredClone(result);
    altered.candidateFiles[0].content += "Substituted";
    expect(invocationResultMatches(altered, request)).toBe(false);
    for (const status of ["POLICY_DENIED", "BUDGET_DENIED", "CANCELED", "TIMED_OUT", "STALE", "WORKLOAD_FAILURE", "INFRASTRUCTURE_FAILURE"] as const) {
      const denied = invocationResult(request, status, 1, 2);
      expect(denied.candidateFiles).toEqual([]);
      expect(denied.resultDigest).toBeNull();
      expect(invocationResultMatches(denied, request)).toBe(true);
    }
  });
  it("accepts exact synthetic contract and never claims behavioral PASS", () => {
    const request = controlRequest();
    expect(isolatedInvocationIssues(request)).toEqual([]);
    const result = invocationResult(request, "SUCCESS", 1, 2);
    expect(invocationResultMatches(result, request)).toBe(true);
    expect(invocationResultMatches({ ...result, evidenceOrigin: "MEASURED" }, request)).toBe(false);
    expect(invocationResultMatches({ ...result, behavioralPass: true }, request)).toBe(false);
    expect(invocationResultMatches({ ...result, attemptId: "substitute" }, request)).toBe(false);
  });
  for (const field of ["bridge.id", "bridge.version", "bridge.digest", "backend.id", "backend.version", "backend.digest", "runtimeImage", "isolationDigest", "invocationSchema", "resultSchema", "profileClass"]) {
    it(`rejects composition substitution: ${field}`, () => {
      const original = controlRequest();
      const adapter = new IsolatedInvocationAdapter(original.composition, async () => false, "/nonexistent-docker");
      const changed = structuredClone(original);
      const [key, sub] = field.split(".");
      if (sub) (changed.composition as any)[key][sub] = "substituted";
      else (changed.composition as any)[key] = "substituted";
      changed.compositionDigest = invocationDigest(changed.composition);
      expect(adapter.validateConfiguration(wrap(changed)).length).toBeGreaterThan(0);
    });
  }
  it("rejects arbitrary content, unknown fields, external route and capability expansion", () => {
    for (const patch of [{ command: "arbitrary" }, { modelRoute: "openai" }, { transmission: "admitted" }, { capabilities: ["synthetic-receipt", "shell"] }, { workload: { reference: "arbitrary", digest: "anything" } }, { lease: { ...controlRequest().lease, generation: 0 } }]) {
      expect(isolatedInvocationIssues({ ...controlRequest(), ...patch }).length).toBeGreaterThan(0);
    }
  });
  it("rejects stale authority without launching a process", async () => {
    const request = controlRequest();
    const adapter = new IsolatedInvocationAdapter(request.composition, async () => false, "/nonexistent-docker");
    const prepared = await adapter.prepare(wrap(request), { emit() {} });
    const handle = await adapter.execute(prepared);
    expect(JSON.parse((await adapter.collectResult(handle)).output!).status).toBe("STALE");
    await expect(adapter.collectResult(handle)).rejects.toThrow("already collected");
    await adapter.cleanup(handle);
  });
  it("bounds a stalled authority check", async () => {
    const request = controlRequest(); request.limits.timeoutMs = 10;
    const adapter = new IsolatedInvocationAdapter(request.composition, async () => new Promise<boolean>(() => {}), "/nonexistent-docker");
    const handle = await adapter.execute(await adapter.prepare(wrap(request), { emit() {} }));
    expect(JSON.parse((await adapter.collectResult(handle)).output!).status).toBe("TIMED_OUT");
    await adapter.cleanup(handle);
  });
  it("cancels during stalled authority and rejects foreign handles", async () => {
    const request = controlRequest();
    const controller = new AbortController();
    const adapter = new IsolatedInvocationAdapter(request.composition, async () => new Promise<boolean>(() => {}), "/nonexistent-docker");
    const handle = await adapter.execute(await adapter.prepare(wrap(request), { emit() {}, signal: controller.signal }));
    controller.abort();
    expect(JSON.parse((await adapter.collectResult(handle)).output!).status).toBe("CANCELED");
    await expect(adapter.collectResult({})).rejects.toThrow("Foreign");
    await expect(adapter.cancel({})).rejects.toThrow("Foreign");
    await adapter.cleanup(handle);
  });
  it("rejects preparation tampering and duplicate execution", async () => {
    const request = controlRequest();
    const adapter = new IsolatedInvocationAdapter(request.composition, async () => true, "/nonexistent-docker");
    const prepared = await adapter.prepare(wrap(request), { emit() {} });
    prepared.request.attemptId = "changed";
    await expect(adapter.execute(prepared)).rejects.toThrow("modified");
    await expect(adapter.prepare(wrap(request), { emit() {} })).rejects.toThrow("replay");
    expect(adapter.capabilities().executionBackends).toEqual([]);
  });
  it("captures a spawn failure while the event consumer is delayed", async () => {
    const request = controlRequest(); request.limits.timeoutMs = 1000;
    const adapter = new IsolatedInvocationAdapter(request.composition, async () => true, "/nonexistent-docker");
    const handle = await adapter.execute(await adapter.prepare(wrap(request), {
      emit: async () => { await new Promise(resolve => setTimeout(resolve, 20)); },
    }));
    expect(JSON.parse((await adapter.collectResult(handle)).output!).status).toBe("INFRASTRUCTURE_FAILURE");
    await expect(adapter.cleanup(handle)).rejects.toThrow("cleanup unverified");
  });
  it("adapter cancellation wakes pending authority and cleanup is idempotent", async () => {
    const request = controlRequest(); request.limits.timeoutMs = 60_000;
    const adapter = new IsolatedInvocationAdapter(request.composition, async () => new Promise<boolean>(() => {}), "/nonexistent-docker");
    const handle = await adapter.execute(await adapter.prepare(wrap(request), { emit() {} }));
    await adapter.cancel(handle);
    expect(JSON.parse((await adapter.collectResult(handle)).output!).status).toBe("CANCELED");
    await adapter.cleanup(handle);
    await adapter.cleanup(handle);
  });
});
