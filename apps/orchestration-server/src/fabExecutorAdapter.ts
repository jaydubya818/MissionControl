import { createHash } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import {
  FabAgent, EnvironmentCredentialProvider, StoredCredentialProvider, KeychainCredentialStore,
  Redactor, HttpModelProvider, BedrockModelProvider, Repository, SessionStore, newSession, parseConfig,
  type BedrockBrokerTransport, type FabConfig, type ModelProvider, type Session,
} from "@fdlc/fab";
import {
  GENERIC_HARNESS_CONTRACT_VERSION, NO_HARNESS_AUTHORITY,
  harnessCapabilityManifestDigest, harnessExecutionRequestDigest, harnessRuntimeArtifactDigest,
  type HarnessExecutorAdapter, type HarnessCapabilityManifest, type HarnessExecutionContext,
  type HarnessExecutorCapabilities, type ExecutorRequest, type ExecutorEvent, type ExecutorResult,
} from "@mission-control/workflow-engine";
import { canonicalHash } from "@mission-control/shared";
import { validateChangedFileScope } from "./factoryPathScope.js";
import { verifyFabRuntime } from "./fabRuntimeIdentity.js";
import { FAB_RUNTIME_PIN } from "./fabRuntimePin.js";

export const FAB_RUNTIME_COMMIT = FAB_RUNTIME_PIN.sourceCommit;
const IDENTITY = { harnessId: "fab", harnessVersion: FAB_RUNTIME_PIN.version, harnessCommit: FAB_RUNTIME_COMMIT, adapterId: "fab", adapterVersion: "v1" };
type AttemptContext = NonNullable<HarnessExecutionContext["attempt"]>;
interface Prepared {
  request: ExecutorRequest; context: HarnessExecutionContext; attempt: AttemptContext;
  session: Session; store: SessionStore; redactor: Redactor; model: ModelProvider;
  controller: AbortController; events: ExecutorEvent[]; startedAt: number; started: boolean;
}
interface Handle { prepared: Prepared; result: Promise<ExecutorResult> }
export interface FabAdapterOptions {
  config: FabConfig; stateDirectory: string;
  /** Tests inject model transport here. Production configuration never selects a mock. */
  modelFactory?: (config: FabConfig, redactor: Redactor) => Promise<ModelProvider>;
  /** Host-owned binding to canonical authority and durable inference liability.
   * Configuration files cannot supply or select an arbitrary transport. */
  bedrockBrokerFactory?: (input: { config: FabConfig; request: ExecutorRequest; context: HarnessExecutionContext }) => Promise<BedrockBrokerTransport>;
}

export function loadFabExecutorAdapter(configPath: string, stateDirectory: string, bedrockBrokerFactory?: FabAdapterOptions["bedrockBrokerFactory"]): FabExecutorAdapter {
  if (!path.isAbsolute(configPath) || !path.isAbsolute(stateDirectory)) throw new Error("Fab requires explicit absolute config and state paths.");
  const text = readFileSync(configPath, "utf8");
  if (Buffer.byteLength(text) > 32000) throw new Error("Fab configuration exceeds its byte limit.");
  const config = parseConfig(JSON.parse(text));
  const realConfigPath = realpathSync(configPath);
  if (realConfigPath === config.repository || realConfigPath.startsWith(config.repository + path.sep)) throw new Error("Fab operator configuration must be outside the worktree.");
  if (new Redactor().containsSecret(text)) throw new Error("Fab configuration must contain credential references only.");
  return new FabExecutorAdapter({ config, stateDirectory, bedrockBrokerFactory });
}

/** Execution only: no queue, lease, verifier, approval or publication implementation. */
export class FabExecutorAdapter implements HarnessExecutorAdapter<Prepared, Handle> {
  private readonly options: FabAdapterOptions;
  private readonly manifest: HarnessCapabilityManifest;
  private readonly environment: NodeJS.ProcessEnv;
  private readonly runtimeArtifact = verifyFabRuntime();
  constructor(options: FabAdapterOptions) {
    this.options = { ...options, config: parseConfig(structuredClone(options.config)) };
    const source = this.options.config.credential.source;
    this.environment = source.kind === "environment" ? { [source.variable]: process.env[source.variable] } : {};
    if (this.options.config.credential.owner !== `local:${process.getuid?.() ?? "user"}`) throw new Error("Fab credential owner does not match the worker OS user.");
    this.manifest = fabManifest(this.options.config);
  }
  capabilities(): HarnessExecutorCapabilities {
    return { contractVersion: GENERIC_HARNESS_CONTRACT_VERSION, adapter: "fab", version: "v1", displayName: "Fab (Experimental)",
      provider: factoryProvider(this.options.config), capabilityManifest: structuredClone(this.manifest), runtimeArtifact: structuredClone(this.runtimeArtifact), executionBackends: ["persistent-worker"],
      authority: NO_HARNESS_AUTHORITY, supportsCancel: true, supportsResume: false, supportsRepositoryMutation: true,
      isolationModes: ["WORKSPACE_WRITE"], emittedEvents: ["EXECUTION_STARTED", "TOOL_CALLED", "ARTIFACT_PRODUCED", "EXECUTION_COMPLETED", "EXECUTION_FAILED", "EXECUTION_CANCELED"] };
  }
  validateConfiguration(request: ExecutorRequest) {
    const config = this.options.config; const issues: Array<{field: string; message: string}> = [];
    const issue = (field: string, message: string) => issues.push({ field, message });
    const provider = factoryProvider(config);
    const providerRoute = factoryProviderRoute(config);
    const governedWorktreePrefix = `${config.repository}${path.sep}.mission-control${path.sep}worktrees${path.sep}`;
    const repositoryMatches = request.repositoryRoot === config.repository
      || (config.provider === "bedrock" && request.repositoryRoot.startsWith(governedWorktreePrefix));
    if (!repositoryMatches || request.workingDirectory !== request.repositoryRoot) issue("repositoryRoot", "Fab requires the configured repository or its canonical Mission Control Attempt worktree.");
    if (request.provider !== provider || request.model !== config.model) issue("model", "Fab requires the exact explicitly selected provider/model.");
    if (request.modelRouteDigest !== undefined || request.providerRoute !== undefined || request.reasoningConfig !== undefined) {
      if (!/^sha256:[a-f0-9]{64}$/.test(request.modelRouteDigest ?? "")) issue("modelRouteDigest", "Fab requires the exact frozen model-route digest.");
      if (request.providerRoute !== providerRoute) issue("providerRoute", "Fab requires its exact configured provider route.");
      if (request.reasoningConfig !== undefined) issue("reasoningConfig", "Fab cannot translate reasoning controls; use a separately qualified configuration.");
    }
    if (request.isolation !== "WORKSPACE_WRITE" || request.filesystemReadScope) issue("isolation", "Fab has no whole-agent OS read boundary; WORKSPACE_ONLY and read-only execution are unsupported.");
    if (request.timeoutMs < config.timeoutMs || request.structuredOutput) issue("limits", "Fab requires its bounded timeout and canonical factory result schema.");
    if (!validateChangedFileScope(config.writableFiles, { allowedPaths: request.allowedPaths, excludedPaths: request.deniedPaths ?? [] }).ok) issue("allowedPaths", "Fab writable files exceed the MC frozen scope.");
    return issues;
  }
  async estimate() { return { estimatedCostUsd: null, estimatedRuntimeMinutes: null, confidence: "LOW" as const }; }
  async prepare(request: ExecutorRequest, context: HarnessExecutionContext): Promise<Prepared> {
    if (this.validateConfiguration(request).length) throw new Error("Fab request does not match its admitted configuration.");
    const attempt = context.attempt;
    if (!attempt || !attempt.workOrderId || !attempt.attemptId || !attempt.executorIdentity || !attempt.environmentReference) throw new Error("Fab requires canonical MC Attempt authority and linkage.");
    context.signal?.throwIfAborted(); await attempt.assertActive(); context.signal?.throwIfAborted();
    if (harnessRuntimeArtifactDigest(verifyFabRuntime()) !== harnessRuntimeArtifactDigest(this.runtimeArtifact)) throw new Error("Fab runtime changed after worker registration.");
    const configured = this.options.config;
    const config = configured.provider === "bedrock" && request.repositoryRoot !== configured.repository
      ? parseConfig({ ...structuredClone(configured), repository: request.repositoryRoot,
          credential: { ...structuredClone(configured.credential), scope: { kind: "repository", root: request.repositoryRoot } } })
      : configured;
    if (canonicalHash(attempt.acceptanceCriteria.map(item => item.title)) !== canonicalHash(config.acceptanceCriteria)) throw new Error("Fab criteria differ from the frozen WorkOrder.");
    const redactor = new Redactor();
    const store = new SessionStore(this.options.stateDirectory, config.repository, redactor);
    const session = newSession(config, redactor.text(request.prompt));
    if (session.baseline !== attempt.sourceRevision) throw new Error("Fab baseline differs from the frozen MC source revision.");
    session.id = sessionId(request.executionId);
    session.governed = { workOrderId: attempt.workOrderId, attemptId: attempt.attemptId, executionId: request.executionId,
      executorIdentity: attempt.executorIdentity, environmentReference: attempt.environmentReference, credentialReference: config.credential.id,
      sourceRevision: session.baseline, candidateRevision: null, startedAt: session.createdAt, completedAt: null };
    // Initialize credential redaction before writing private evidence; reserve before inference.
    let model: ModelProvider;
    if (config.provider === "bedrock") {
      if (!this.options.bedrockBrokerFactory) throw new Error("Fab Bedrock requires an enrolled canonical broker; HTTP and ambient AWS fallback are prohibited.");
      const transport = await this.options.bedrockBrokerFactory({ config: structuredClone(config), request: structuredClone(request), context });
      context.signal?.throwIfAborted(); await attempt.assertActive(); context.signal?.throwIfAborted();
      model = new BedrockModelProvider({ config, transport, redactor });
    } else {
      model = this.options.modelFactory ? await this.options.modelFactory(config, redactor) : await createModel(config, redactor, this.environment);
    }
    store.reserve(session);
    return { request: structuredClone(request), context, attempt, session, store, redactor, model, controller: new AbortController(), events: [], startedAt: Date.now(), started: false };
  }
  async execute(prepared: Prepared): Promise<Handle> {
    if (prepared.started) throw new Error("Fab invocation already started; replay is denied.");
    prepared.started = true;
    await prepared.context.invocationObserver?.started(prepared.request.executionId);
    return { prepared, result: this.perform(prepared) };
  }
  private async perform(p: Prepared): Promise<ExecutorResult> {
    const signal = AbortSignal.any([p.controller.signal, ...(p.context.signal ? [p.context.signal] : []), AbortSignal.timeout(p.request.timeoutMs)]);
    let emissions = Promise.resolve();
    const emit = (type: ExecutorEvent["type"], summary: string, metadata?: Record<string, unknown>) => {
      const event: ExecutorEvent = p.redactor.value({ executionId: p.request.executionId, sequence: p.events.length + 1, type, occurredAt: Date.now(), summary, metadata });
      p.events.push(event); emissions = emissions.then(async () => { await p.context.emit(event); });
      void emissions.catch(() => p.controller.abort());
    };
    const checkpoint = async () => { await emissions; signal.throwIfAborted(); await p.attempt.assertActive(); signal.throwIfAborted(); };
    try {
      await checkpoint(); emit("EXECUTION_STARTED", "MC-authorized Fab planning and bounded execution", { fabSessionId: p.session.id, ...p.session.governed });
      const agent = new FabAgent({ session: p.session, model: p.model, store: p.store, redactor: p.redactor, checkpoint,
        observe: event => {
          const data = event.data && typeof event.data === "object" ? event.data as Record<string, unknown> : {};
          const output = data.output && typeof data.output === "object" ? data.output as Record<string, unknown> : {};
          // Source text and full transcripts stay in the private Fab session. MC gets
          // bounded observations and content identity, not repeated file/tool buffers.
          emit(event.kind === "tool_started" ? "TOOL_CALLED" : "ARTIFACT_PRODUCED", event.kind, {
            fabSessionId: p.session.id, fabSequence: event.sequence, producerOnly: true,
            ...(typeof data.name === "string" ? { tool: data.name } : {}),
            ...(typeof data.id === "string" ? { toolCallId: data.id } : {}),
            ...(typeof data.durationMs === "number" ? { durationMs: data.durationMs } : {}),
            ...(event.kind === "model_completed" ? { usage: data.usage, finish: data.finish, returnedModel: data.returnedModel ?? null } : {}),
            ...(event.kind === "provider_request" ? { providerRequest: data } : {}),
            ...(typeof data.call === "number" ? { modelCall: data.call } : {}),
            ...(typeof output.status === "string" ? { observedStatus: output.status } : {}),
            ...(typeof output.candidateDigest === "string" ? { candidateDigest: output.candidateDigest } : {}),
          });
        } });
      await agent.plan(signal);
      if (p.session.status === "awaiting_approval" && p.session.approvalDigest) {
        await checkpoint();
        // The frozen MC assignment authorizes this bounded build. Final acceptance remains MC-owned.
        await agent.run(p.session.approvalDigest, signal);
      }
      await checkpoint();
    } catch {
      p.session.status = signal.aborted ? "cancelled" : "blocked";
      p.session.unresolved = ["Execution stopped or authority became unavailable; MC reconciliation is required."];
    }
    const completed = p.session.status === "candidate";
    const status = completed ? "COMPLETED" : signal.aborted || p.session.status === "cancelled" ? "CANCELED" : "FAILED";
    p.session.governed!.completedAt = new Date().toISOString(); p.store.save(p.session);
    emit(status === "COMPLETED" ? "EXECUTION_COMPLETED" : status === "CANCELED" ? "EXECUTION_CANCELED" : "EXECUTION_FAILED", `Fab ${status.toLowerCase()}`, { fabSessionId: p.session.id });
    await emissions;
    await p.context.invocationObserver?.completed(p.request.executionId);
    const output = JSON.stringify(p.redactor.value({ schema: "factory-result/v1", status: completed ? "COMPLETED" : "BLOCKED",
      summary: p.session.summary ?? "Fab did not produce a qualified candidate.", completedAcceptanceCriterionIds: [], incompleteAcceptanceCriterionIds: [],
      unknownAcceptanceCriterionIds: p.attempt.acceptanceCriteria.map(item => item.id), verificationCommands: p.session.config.checks.map(check => check.argv.join(" ")),
      knownRisks: [...p.session.unresolved, "Fab producer checks are not independent acceptance evidence."], nextAction: "MC must capture and independently verify the exact candidate, then apply its approval/publication policy." }));
    const finishedAt = Date.now();
    return { executionId: p.request.executionId, status, output, ...(completed ? {} : { error: "Fab execution blocked, failed or cancelled; inspect its redacted evidence." }), normalizedResult: {
      schemaVersion: "harness-result/v1", executionId: p.request.executionId, status, harness: this.manifest.identity,
      provenance: { provider: p.request.provider ?? p.model.provider, model: p.model.model,
        ...(p.request.modelRouteDigest ? { modelRouteDigest: p.request.modelRouteDigest, providerRoute: p.request.providerRoute } : {}),
        capabilityManifestSha256: harnessCapabilityManifestDigest(this.manifest),
        effectiveConfigSha256: this.manifest.effectiveConfigSha256, executableSha256: this.runtimeArtifact.executableSha256,
        runtimeArtifact: structuredClone(this.runtimeArtifact), runtimeArtifactDigest: harnessRuntimeArtifactDigest(this.runtimeArtifact), imageDigest: null,
        requestSha256: harnessExecutionRequestDigest(p.request),
        providerMetadata: { fabSessionId: p.session.id, workOrderId: p.attempt.workOrderId, attemptId: p.attempt.attemptId, credentialReference: p.session.config.credential.id, environmentReference: p.attempt.environmentReference } },
      timing: { startedAt: p.startedAt, finishedAt, wallClockMs: finishedAt - p.startedAt },
      repository: { root: p.request.repositoryRoot, workingDirectory: p.request.workingDirectory, baselineCommit: p.session.baseline, headCommit: p.session.baseline, headChanged: false,
        changedFiles: p.session.filesModified.map(name => ({ path: name, status: "M", additions: null, deletions: null })), scopeViolations: [] },
      events: { items: p.events, toolCalls: p.session.events.filter(event => event.kind === "tool_started").length, modelRequests: p.session.modelCalls, retries: p.session.retries, sessionCount: 1 },
      usage: { inputTokens: p.session.usage.inputTokens, outputTokens: p.session.usage.outputTokens, cacheReadTokens: p.session.usage.cachedTokens, cacheWriteTokens: p.session.usage.cacheWriteTokens ?? null, costUsd: p.session.usage.costUsd },
      exitCode: null, signal: null, output, structuredOutput: { schema: "factory-result/v1", summary: p.redactor.text(p.session.summary ?? "Blocked") }, error: completed ? null : "Fab execution did not complete.",
      cancellation: { requested: signal.aborted, mode: "IN_PROCESS_AGENT" }, cleanup: { status: "COMPLETED", completedAt: finishedAt, error: null },
    } };
  }
  async collectResult(handle: Handle) { return handle.result; }
  async cancel(handle: Handle) { handle.prepared.controller.abort(); return true; }
  async cleanup(handle: Handle) { await handle.result.catch(() => undefined); }
  async recordCandidate(executionId: string, candidate: { sourceRevision: string; candidateRevision: string }) {
    const store = new SessionStore(this.options.stateDirectory, this.options.config.repository, new Redactor());
    const session = store.load(sessionId(executionId));
    const repository = new Repository(session.config.repository, session.config.writableFiles);
    repository.assertClean();
    const contentDigest = createHash("sha256").update(JSON.stringify({ revision: session.baseline, files: repository.snapshot() })).digest("hex");
    if (session.status !== "candidate" || session.governed?.executionId !== executionId || session.baseline !== candidate.sourceRevision
      || repository.revision() !== candidate.candidateRevision || session.candidateDigest !== contentDigest) throw new Error("MC candidate no longer matches the Fab checked content.");
    session.candidateRevision = candidate.candidateRevision; session.governed.candidateRevision = candidate.candidateRevision;
    session.updatedAt = new Date().toISOString(); store.save(session);
  }
  async health() { return { status: process.platform === "darwin" ? "DEGRADED" as const : "UNAVAILABLE" as const, checkedAt: Date.now(), adapter: "fab", version: "v1", details: "Experimental: explicit credentials/config and admitted local worktree required; live models and full runtime sandbox unqualified." }; }
}
function sessionId(executionId: string) {
  const hex = createHash("sha256").update(executionId).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
async function createModel(config: FabConfig, redactor: Redactor, environment: NodeJS.ProcessEnv) {
  if (config.provider === "bedrock" || config.credential.source.kind === "broker") throw new Error("Fab Bedrock requires the explicit canonical broker path.");
  const credentials = config.credential.source.kind === "environment" ? new EnvironmentCredentialProvider(config.credential, redactor, environment)
    : await StoredCredentialProvider.create(config.credential, new KeychainCredentialStore(redactor), redactor);
  await credentials.use(config.credential, async () => {});
  return new HttpModelProvider({ provider: config.provider, model: config.model, credentials, reference: config.credential, redactor });
}
export function fabManifest(config: FabConfig): HarnessCapabilityManifest {
  const supported = "SUPPORTED", partial = "PARTIAL", no = "UNSUPPORTED";
  return { schemaVersion: "harness-capability-manifest/v1", scope: "ADAPTER_EFFECTIVE", identity: IDENTITY, effectiveConfigSha256: canonicalHash({ config, runtime: FAB_RUNTIME_COMMIT }),
    models: { providerSelection: supported, modelSelection: supported, supported: [{ provider: factoryProvider(config), modelId: config.model, selection: "PASSTHROUGH", contextWindowTokens: null, modalities: ["text"] }], reasoningControls: no },
    filesystem: { read: supported, write: supported, pathAllowlist: supported, changedFileCapture: supported },
    shell: { available: partial, commandTimeout: supported, processTreeCancellation: supported, credentialEnvironmentScrub: supported },
    git: { status: supported, diff: supported, commit: no, branch: no, remotePublication: no },
    browser: { webSearch: no, webFetch: no, interactiveBrowser: no }, tools: { native: supported, mcp: no, structuredOutput: supported, telemetry: supported },
    subagents: { available: no, parallel: no, background: no, eventVisibility: no }, streaming: { events: supported, modelDeltas: no, durableReplay: no },
    context: { persistentSessions: supported, resume: no, fork: no, compaction: no, instructionFiles: partial }, headless: { support: supported, mode: "API" },
    cancellation: { support: supported, mode: "IN_PROCESS_AGENT", idempotentCleanup: true }, sandbox: { isolationModes: ["WORKSPACE_WRITE"], externalSandboxRecommended: true, requirements: ["macOS Seatbelt for checks", "Operator-controlled checkout; no hostile same-UID process"] },
    network: { providerApi: true, packageInstall: false, runtimeEgressControl: partial, destinations: [config.provider === "bedrock" ? "bedrock-runtime.us-east-1.amazonaws.com" : config.provider === "openai" ? "api.openai.com" : "api.anthropic.com"] },
    credentials: { classes: ["explicit-user-BYOK-reference"], passedToToolProcesses: false, redaction: partial },
    telemetry: { tokens: partial, cost: no, toolCalls: supported, modelRequests: supported, retries: supported },
    admission: { maturity: "EXPERIMENTAL", executionBackends: ["persistent-worker"], requiredExternalControls: ["MC Attempt lease checkpoints", "Separate verification Attempt", "MC approval and publication"], prohibitedAuthorities: ["worker-leases", "verification-subjects", "verification-plans", "evidence-authority", "github-publication", "acceptance"] },
    limitations: ["No live provider/model qualification.", "No whole-agent OS sandbox or remote backend.", "Fixed files/checks and bounded UTF-8 snapshots only.", "Uncertain invocation replay denied; MC must reconcile or issue a new Attempt."] };
}

function factoryProvider(config: FabConfig) {
  return config.provider === "bedrock" ? "aws-bedrock" : config.provider;
}

function factoryProviderRoute(config: FabConfig) {
  return config.provider === "bedrock"
    ? `${config.bedrockRoute!.region}/${config.bedrockRoute!.inferenceProfileId}`
    : config.provider;
}
