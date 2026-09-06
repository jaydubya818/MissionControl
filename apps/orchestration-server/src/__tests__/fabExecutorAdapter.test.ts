import { execFileSync, spawn } from "node:child_process";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseConfig, EnvironmentCredentialProvider, HttpModelProvider, SessionStore, Redactor, FabAgent } from "@fdlc/fab";
import { factoryWorkerEligibility } from "../../../../convex/lib/factoryWorkerRuntime";
import { harnessManifestIssues, harnessNormalizedResultIssues, runHarnessExecution, type ExecutorRequest, type HarnessExecutionContext } from "@mission-control/workflow-engine";
import { FabExecutorAdapter } from "../fabExecutorAdapter.js";
import { HarnessAdapterRegistry } from "../harnessAdapterRegistry.js";
import { commitFactoryChanges } from "../factoryGitRuntime.js";

const cleanup: string[] = [];
const KEY = "fab-non-secret-governed-fixture-987654";
afterEach(() => { for (const directory of cleanup.splice(0)) rmSync(directory, { recursive: true, force: true }); });
function fixture(options: { attack?: string; hangModel?: boolean; slowCheck?: boolean } = {}) {
  const directory = mkdtempSync("/private/tmp/fab-governed-"); cleanup.push(directory);
  const root = path.join(directory, "repo"); mkdirSync(root); mkdirSync(path.join(root, "src"));
  const before = "export const value = 1;\n"; writeFileSync(path.join(root, "src/value.mjs"), before);
  const git = (args: string[]) => execFileSync("/usr/bin/git", ["-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", ...args], { cwd: root, encoding: "utf8", env: { PATH: "/usr/bin:/bin", HOME: directory, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" } }).trim();
  git(["init", "-q"]); git(["config", "user.name", "MC Fab Fixture"]); git(["config", "user.email", "fixture@example.invalid"]); git(["add", "."]); git(["commit", "-qm", "fixture baseline"]);
  const baseline = git(["rev-parse", "HEAD"]);
  const config = parseConfig({ version: 1, repository: root, provider: "openai", model: "fixture-explicit-model",
    credential: { id: "fixture-key-ref", owner: `local:${process.getuid?.()}`, provider: "openai", scope: { kind: "repository", root }, source: { kind: "environment", variable: "FAB_GOVERNED_TEST_KEY" } },
    writableFiles: ["src/value.mjs"], acceptanceCriteria: ["Value equals 2."],
    checks: [{ id: "test", argv: [process.execPath, "--input-type=module", "-e", options.slowCheck ? "setTimeout(()=>{},30000)" : "import {value} from './src/value.mjs'; if(value!==2) throw new Error('incorrect value')"] }], maxTurns: 8, timeoutMs: 10000, checkTimeoutMs: 5000 });
  let modelCalls = 0;
  const adapter = new FabExecutorAdapter({ config, stateDirectory: path.join(directory, "state"), modelFactory: async (c, redactor) => {
    const credentials = new EnvironmentCredentialProvider(c.credential, redactor, { FAB_GOVERNED_TEST_KEY: KEY });
    return new HttpModelProvider({ provider: c.provider, model: c.model, credentials, reference: c.credential, redactor, fetchImpl: async (_url, init) => {
      modelCalls++;
      if (options.hangModel) return new Promise(() => {});
      expect(String(init?.body)).not.toContain(KEY);
      let name = "submit_plan"; let args: Record<string, unknown> = { summary: "Set the value", steps: ["Edit one file", "Run test"] };
      if (modelCalls === 2) { name = "write_file"; args = { path: options.attack ?? "src/value.mjs", content: "export const value = 2;\n", expectedHash: createHash("sha256").update(before).digest("hex") }; }
      if (modelCalls === 2 && options.attack === "self-approval") { name = "approve_candidate"; args = { verdict: "VERIFIED", publication: true }; }
      if (modelCalls === 3) { name = "run_check"; args = { id: "test" }; }
      if (modelCalls >= 4) { name = options.attack ? "report_blocked" : "finish_candidate"; args = options.attack ? { reason: "Scope denied" } : { summary: "Value corrected", unresolved: [] }; }
      return Response.json({ model: c.model, choices: [{ message: { content: KEY, tool_calls: [{ id: `call_${modelCalls}`, type: "function", function: { name, arguments: JSON.stringify(args) } }] }, finish_reason: "tool_calls" }], usage: { prompt_tokens: 10, completion_tokens: 5 } });
    } });
  } });
  const request: ExecutorRequest = { executionId: "fixture-attempt:manifest", repositoryRoot: root, workingDirectory: root, provider: config.provider, model: config.model, prompt: "Set the value to 2", allowedPaths: ["src/**"], deniedPaths: [], timeoutMs: 10000, isolation: "WORKSPACE_WRITE" };
  const assertActive = vi.fn(async () => {});
  const context: HarnessExecutionContext = { emit: vi.fn(), attempt: { workOrderId: "wo-1", attemptId: "attempt-1", executorIdentity: "worker-1:session-1:1", environmentReference: "local-worktree:attempt-1", sourceRevision: baseline, acceptanceCriteria: [{ id: "ac-1", title: config.acceptanceCriteria[0]! }], assertActive } };
  return { adapter, config, context, request, directory, root, git, baseline, modelCalls: () => modelCalls, assertActive };
}

describe("Fab canonical MC harness conformance", () => {
  function bedrockFixture() {
    const f = fixture();
    const route = { accountId: "123456789012", region: "us-east-1", modelId: "anthropic.claude-sonnet-4-6", inferenceProfileId: "us.anthropic.claude-sonnet-4-6", inferenceProfileArn: "arn:aws:bedrock:us-east-1:123456789012:inference-profile/us.anthropic.claude-sonnet-4-6" } as const;
    const config = parseConfig({ ...f.config, provider: "bedrock", model: route.modelId, bedrockRoute: route,
      credential: { ...f.config.credential, provider: "bedrock", source: { kind: "broker" } } });
    const request = { ...f.request, provider: "bedrock", model: route.modelId };
    return { ...f, config, request, route };
  }
  it("requires an explicit Bedrock broker and cannot select the test model factory or ambient credential path", async () => {
    const f = bedrockFixture(); const modelFactory = vi.fn();
    const adapter = new FabExecutorAdapter({ config: f.config, stateDirectory: path.join(f.directory, "bedrock-state"), modelFactory });
    await expect(adapter.prepare(f.request, f.context)).rejects.toThrow("enrolled canonical broker");
    expect(modelFactory).not.toHaveBeenCalled();
    expect(adapter.capabilities().capabilityManifest?.network.destinations).toEqual(["bedrock-runtime.us-east-1.amazonaws.com"]);
    expect(Object.values(adapter.capabilities().authority).every(value => value === "NONE")).toBe(true);
  });
  it("rechecks canonical authority after Bedrock broker enrollment before any provider request", async () => {
    const f = bedrockFixture(); const invoke = vi.fn();
    const adapter = new FabExecutorAdapter({ config: f.config, stateDirectory: path.join(f.directory, "bedrock-state"), bedrockBrokerFactory: async input => {
      expect(input.request).toEqual(f.request); expect(input.context.attempt?.attemptId).toBe("attempt-1");
      f.assertActive.mockRejectedValue(new Error("lease lost while enrolling broker"));
      return { identity: () => ({ route: f.route, credentialReference: f.config.credential.id, maximumAttempts: 1 }), invoke };
    } });
    await expect(adapter.prepare(f.request, f.context)).rejects.toThrow("lease lost while enrolling broker");
    expect(invoke).not.toHaveBeenCalled();
  });
  it("runs the real Fab loop through a synthetic Bedrock broker while preserving canonical request linkage", async () => {
    const f = bedrockFixture(); let calls = 0;
    const providerRequests: Array<{ id: string; digest: string }> = [];
    const adapter = new FabExecutorAdapter({ config: f.config, stateDirectory: path.join(f.directory, "bedrock-state"), bedrockBrokerFactory: async () => ({
      identity: () => ({ route: f.route, credentialReference: f.config.credential.id, maximumAttempts: 1 }),
      invoke: async request => {
        calls++; providerRequests.push({ id: request.requestId, digest: request.requestDigest });
        const wire = JSON.parse(request.body);
        expect(wire.anthropic_version).toBe("bedrock-2023-05-31"); expect(wire.model).toBeUndefined();
        expect(request.route).toEqual(f.route); expect(request.credentialReference).toBe(f.config.credential.id);
        let name = "submit_plan"; let input: Record<string, unknown> = { summary: "Set the value", steps: ["Edit one file", "Run test"] };
        if (calls === 2) { name = "write_file"; input = { path: "src/value.mjs", content: "export const value = 2;\n", expectedHash: createHash("sha256").update("export const value = 1;\n").digest("hex") }; }
        if (calls === 3) { name = "run_check"; input = { id: "test" }; }
        if (calls === 4) { name = "finish_candidate"; input = { summary: "Value corrected", unresolved: [] }; }
        return { requestDigest: request.requestDigest, providerRequestId: `aws-fixture-${calls}`, httpStatus: 200, attempts: 1,
          body: JSON.stringify({ model: "claude-sonnet-4-6", content: [{ type: "tool_use", id: `tool_${calls}`, name, input }], stop_reason: "tool_use", usage: { input_tokens: 10, output_tokens: 5 } }) };
      },
    }) });
    const result = await runHarnessExecution(adapter, f.request, f.context);
    expect(result.status).toBe("COMPLETED"); expect(calls).toBe(4);
    expect(result.normalizedResult?.provenance.provider).toBe("bedrock");
    expect(result.normalizedResult?.usage.inputTokens).toBe(40);
    expect(result.normalizedResult?.usage.costUsd).toBeNull();
    const observed = result.normalizedResult?.events.items.filter(event => event.summary === "provider_request").map(event => event.metadata?.providerRequest as Record<string, unknown>);
    for (const request of providerRequests) {
      expect(observed?.some(receipt => receipt.localRequestId === request.id && receipt.requestDigest === request.digest && receipt.phase === "SUCCEEDED")).toBe(true);
    }
    expect(JSON.parse(result.output!).completedAcceptanceCriterionIds).toEqual([]);
    expect(harnessNormalizedResultIssues(result.normalizedResult!)).toEqual([]);
  });
  it("requires durable request evidence before dispatch and records in-process lifecycle", async () => {
    const f = fixture();
    const started = vi.fn(async () => {});
    const completed = vi.fn(async () => {});
    f.context.invocationObserver = { started, completed };
    f.context.emit = async event => {
      if (event.summary === "provider_request") {
        expect(f.modelCalls()).toBe(0);
        throw new Error("Canonical evidence unavailable");
      }
    };
    await expect(runHarnessExecution(f.adapter, f.request, f.context)).rejects.toThrow("Canonical evidence unavailable");
    expect(f.modelCalls()).toBe(0);
    expect(started).toHaveBeenCalledWith(f.request.executionId);
    // No completion receipt is invented when the evidence channel failed.
    expect(completed).not.toHaveBeenCalled();
  });
  it("registers an execution-only manifest and rejects scope, model, root and containment mismatch", () => {
    const f = fixture(); const registry = new HarnessAdapterRegistry([f.adapter]);
    expect(registry.require({ adapter: "fab", version: "v1" })).toBe(f.adapter);
    expect(harnessManifestIssues(f.adapter.capabilities().capabilityManifest!)).toEqual([]);
    expect(Object.values(f.adapter.capabilities().authority).every(value => value === "NONE")).toBe(true);
    const registration = registry.requireRegistration({ adapter: "fab", version: "v1" });
    const eligibility = factoryWorkerEligibility({ worker: { workerId: "worker-1", status: "READY", dirty: false,
      capacity: { maxConcurrentRuns: 1, currentRuns: 0 }, workerRuntime: { sessionId: "session-1", generation: 1, hostRuntimeType: "local-macos",
        executionBackends: ["persistent-worker"], supportedExecutors: [{ adapter: "fab", version: "v1", capabilityManifest: registration.manifest!,
          capabilityManifestSha256: registration.capabilityManifestSha256!, effectiveConfigSha256: registration.effectiveConfigSha256!,
          runtimeArtifact: registration.runtimeArtifact, runtimeArtifactSha256: registration.runtimeArtifactSha256,
          supportsCancel: true, supportsResume: false, isolationModes: ["WORKSPACE_WRITE"] }],
        sandboxCapabilities: ["git-worktree", "workspace-write"], repositoryAccess: [{ repositoryId: "repo-1", access: "READ_WRITE" }], readiness: "READY", draining: false, lastHeartbeatAt: 1000 } },
      requirements: { repositoryId: "repo-1", executor: { adapter: "fab", version: "v1", capabilityManifestSha256: registration.capabilityManifestSha256!, effectiveConfigSha256: registration.effectiveConfigSha256!, runtimeArtifactSha256: registration.runtimeArtifactSha256 },
        provider: f.config.provider, model: f.config.model, harnessCapabilities: [{ capability: "filesystem.write", minimumSupport: "PARTIAL" }], isolation: "WORKSPACE_WRITE", sandboxCapabilities: ["git-worktree", "workspace-write"], executionBackend: "persistent-worker" },
      activeWorkerLeaseCount: 0, now: 1000 });
    expect(eligibility.eligible).toBe(true);
    for (const changed of [{ model: "other" }, { provider: "anthropic" }, { allowedPaths: ["other/**"] }, { repositoryRoot: "/other" }, { filesystemReadScope: "WORKSPACE_ONLY" as const }, { isolation: "READ_ONLY" as const }]) expect(f.adapter.validateConfiguration({ ...f.request, ...changed }).length).toBeGreaterThan(0);
    const routed = { ...f.request, modelRouteDigest: `sha256:${"a".repeat(64)}`, providerRoute: "openai" };
    expect(f.adapter.validateConfiguration(routed)).toEqual([]);
    for (const changed of [{ modelRouteDigest: "invalid" }, { providerRoute: "broker" }, { reasoningConfig: { effort: "high" } }]) {
      expect(f.adapter.validateConfiguration({ ...routed, ...changed }).length).toBeGreaterThan(0);
    }
  });
  it("denies missing or lost MC authority before any inference", async () => {
    const f = fixture();
    await expect(f.adapter.prepare(f.request, { emit: () => {} })).rejects.toThrow("authority");
    f.assertActive.mockRejectedValue(new Error("lease lost"));
    await expect(f.adapter.prepare(f.request, f.context)).rejects.toThrow("lease lost"); expect(f.modelCalls()).toBe(0);
  });
  it("produces real checked edits, canonical evidence and candidate linkage without acceptance authority", async () => {
    const f = fixture(); const result = await runHarnessExecution(f.adapter, f.request, f.context);
    expect(result.status).toBe("COMPLETED"); expect(harnessNormalizedResultIssues(result.normalizedResult!)).toEqual([]);
    expect(JSON.stringify(result.normalizedResult?.events)).not.toContain("export const");
    expect(result.normalizedResult?.events.items.find(event => event.summary === "model_completed")?.metadata?.returnedModel).toBe(f.config.model);
    expect(JSON.parse(result.output!).completedAcceptanceCriterionIds).toEqual([]);
    const candidateRevision = await commitFactoryChanges({ worktree: f.root, changedFiles: ["src/value.mjs"], title: "Fab fixture" });
    await f.adapter.recordCandidate(f.request.executionId, { sourceRevision: f.baseline, candidateRevision });
    const evidenceFile = path.join(f.directory, "state", readdirSync(path.join(f.directory, "state")).find(name => name.endsWith(".json"))!);
    const evidence = readFileSync(evidenceFile, "utf8"); const session = JSON.parse(evidence).session;
    expect(session.governed).toMatchObject({ workOrderId: "wo-1", attemptId: "attempt-1", sourceRevision: f.baseline, candidateRevision });
    expect(session.independent).toBe(false); expect(session.checks[0].status).toBe("passed"); expect(evidence + JSON.stringify(result)).not.toContain(KEY);
    writeFileSync(path.join(f.root, "src/value.mjs"), "changed after verification");
    await expect(f.adapter.recordCandidate(f.request.executionId, { sourceRevision: f.baseline, candidateRevision })).rejects.toThrow();
  });
  for (const attack of ["../escape.mjs", ".env", "src/credentials.json", "self-approval"]) it(`rejects injected path or authority ${attack}`, async () => {
    const f = fixture({ attack }); const result = await runHarnessExecution(f.adapter, f.request, f.context);
    expect(result.status).toBe("FAILED"); expect(readFileSync(path.join(f.root, "src/value.mjs"), "utf8")).toContain("value = 1");
  });
  it("denies duplicate execution after prepare/crash/reconnect and local resume without MC", async () => {
    const f = fixture(); const prepared = await f.adapter.prepare(f.request, f.context);
    await expect(f.adapter.prepare(f.request, f.context)).rejects.toThrow("already has a session"); expect(f.modelCalls()).toBe(0);
    const redactor = new Redactor();
    expect(() => new FabAgent({ session: prepared.session, model: prepared.model, store: new SessionStore(path.join(f.directory, "state"), f.root, redactor), redactor })).toThrow("checkpoint");
  });
  it("preserves an actual killed worker's uncertain model request and refuses its replay", async () => {
    const f = fixture();
    const entry = path.join(f.directory, "crash-fixture.mjs");
    const adapterModule = new URL("../fabExecutorAdapter.ts", import.meta.url).href;
    writeFileSync(entry, `import {FabExecutorAdapter} from ${JSON.stringify(adapterModule)};
      const config = ${JSON.stringify(f.config)};
      const adapter = new FabExecutorAdapter({config,stateDirectory:${JSON.stringify(path.join(f.directory, "state"))},modelFactory:async()=>({
        provider:config.provider,model:config.model,capabilities:{tools:true,streaming:false,reasoningControls:false,contextWindow:null},
        invoke:async()=>{process.stdout.write('MODEL_PENDING\\n');return new Promise(()=>{});}
      })});
      const context={emit:()=>{},attempt:{...${JSON.stringify(f.context.attempt)},assertActive:async()=>{}}};
      setInterval(()=>{},1000);
      const prepared=await adapter.prepare(${JSON.stringify(f.request)},context);
      await adapter.collectResult(await adapter.execute(prepared));
    `);
    const loader = createRequire(import.meta.url).resolve("tsx");
    await new Promise<void>((resolve, reject) => {
      const child = spawn(process.execPath, ["--import", loader, entry], { env: { PATH: "/opt/homebrew/bin:/usr/bin:/bin", HOME: f.directory, TMPDIR: "/private/tmp", GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" }, stdio: ["ignore", "pipe", "pipe"] });
      let output = ""; let killed = false;
      const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("Crash fixture did not reach the model checkpoint.")); }, 10000);
      child.on("error", reject);
      child.stdout.on("data", chunk => { output += String(chunk); if (!killed && output.includes("MODEL_PENDING")) { killed = true; child.kill("SIGKILL"); } });
      child.on("close", (_code, signal) => { clearTimeout(timer); if (killed && signal === "SIGKILL") resolve(); else reject(new Error("Crash fixture failed before its checkpoint.")); });
    });
    const stateDirectory = path.join(f.directory, "state");
    const state = JSON.parse(readFileSync(path.join(stateDirectory, readdirSync(stateDirectory).find(name => name.endsWith(".json"))!), "utf8")).session;
    expect(state.status).toBe("planning"); expect(state.events.at(-1).kind).toBe("model_started");
    expect(readdirSync(stateDirectory).some(name => name.endsWith(".lock"))).toBe(true);
    await expect(f.adapter.prepare(f.request, f.context)).rejects.toThrow("already has a session"); expect(f.modelCalls()).toBe(0);
  });
  for (const stage of ["model", "check"] as const) it(`cancels during ${stage} execution and prevents successful handoff`, async () => {
    const f = fixture({ hangModel: stage === "model", slowCheck: stage === "check" }); const controller = new AbortController(); f.context.signal = controller.signal;
    if (stage === "check") f.context.emit = event => { if (event.summary === "tool_started" && JSON.stringify(event.metadata).includes("run_check")) setTimeout(() => controller.abort(), 30); };
    else setTimeout(() => controller.abort(), 100);
    const result = await runHarnessExecution(f.adapter, f.request, f.context); expect(result.status).toBe("CANCELED");
  });
  it("fails closed when lease authority is lost after an observed tool", async () => {
    const f = fixture(); let lost = false;
    f.context.emit = event => { if (event.summary === "tool_started" && JSON.stringify(event.metadata).includes("write_file")) lost = true; };
    f.assertActive.mockImplementation(async () => { if (lost) throw new Error("lease expired"); });
    const result = await runHarnessExecution(f.adapter, f.request, f.context); expect(result.status).toBe("FAILED");
    expect(result.normalizedResult?.events.modelRequests).toBeLessThanOrEqual(2);
  });
});
