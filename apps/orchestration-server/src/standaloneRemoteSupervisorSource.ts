/**
 * Self-contained supervisor source uploaded to an execution-only VM.
 * Keep this dependency-free: the remote image receives Node, Git, frozen
 * inputs, and no Mission Control source tree.
 */
export function standaloneRemoteSupervisorSource() {
  return String.raw`
import { createHash } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { appendFileSync, closeSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const MAX_BYTES = 1048576;
const MAX_LINES = 10000;
const LIFECYCLE_PATH = "/var/lib/mission-control/attempt/lifecycle.jsonl";
const lifecycleEvents = [];
const arrayFields = ["completedAcceptanceCriterionIds", "incompleteAcceptanceCriterionIds", "unknownAcceptanceCriterionIds", "verificationCommands", "knownRisks"];
const canonical = (value) => value === null || typeof value !== "object"
  ? (JSON.stringify(value) ?? "undefined")
  : Array.isArray(value)
    ? "[" + value.map((item) => item === undefined ? "" : canonical(item)).join(",") + "]"
    : "{" + Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => JSON.stringify(key) + ":" + canonical(item)).join(",") + "}";
const digest = (namespace, value) => "sha256:" + createHash("sha256").update(canonical({ namespace, value })).digest("hex");
const redact = (value) => String(value)
  .replace(/\bsk-or-v1-[A-Za-z0-9_-]+/g, "[REDACTED_OPENROUTER_KEY]")
  .replace(/\bgh[pousr]_[A-Za-z0-9_]+/g, "[REDACTED_PROVIDER_TOKEN]")
  .replace(/(authorization|cookie|token|secret|password|api[-_]?key)\s*[:=]\s*([^\s,;]+)/gi, "$1=[REDACTED]");
const atomicWrite = (file, content) => {
  const directory = dirname(file);
  mkdirSync(directory, { recursive: true, mode: 448 });
  const temporary = file + ".tmp-" + process.pid + "-" + Date.now();
  let descriptor;
  try {
    descriptor = openSync(temporary, "wx", 384);
    writeFileSync(descriptor, content);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    renameSync(temporary, file);
    const directoryDescriptor = openSync(directory, "r");
    try { fsyncSync(directoryDescriptor); } finally { closeSync(directoryDescriptor); }
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    try { unlinkSync(temporary); } catch {}
  }
};
const fileObservation = (file) => {
  if (!file) return { state: "NOT_REQUESTED" };
  try {
    const entry = lstatSync(file);
    return {
      state: "PRESENT",
      type: entry.isDirectory() ? "DIRECTORY" : entry.isFile() ? "FILE" : entry.isSymbolicLink() ? "SYMLINK" : "OTHER",
      mode: (entry.mode & 0o777).toString(8).padStart(3, "0"),
      uid: entry.uid,
      gid: entry.gid,
      byteLength: entry.size,
    };
  } catch (error) {
    return { state: error?.code === "ENOENT" ? "ABSENT" : "STAT_ERROR" };
  }
};
const trace = (stage, details = {}) => {
  const event = { stage, occurredAt: Date.now(), ...details };
  lifecycleEvents.push(event);
  try {
    const currentSize = fileObservation(LIFECYCLE_PATH).byteLength ?? 0;
    if (currentSize < 65536) appendFileSync(LIFECYCLE_PATH, JSON.stringify(event) + "\n", { encoding: "utf8", mode: 0o600 });
  } catch {}
  return event;
};
const observeNetworkPolicy = () => {
  try {
    const ruleset = execFileSync("nft", ["list", "chain", "inet", "mission_control_egress", "output"], { encoding: "utf8", timeout: 5000 });
    return { state: "OBSERVED", rulesetDigest: digest("factory-sandbox-network-counters/v1", ruleset), rulesetTail: redact(ruleset).slice(-16000) };
  } catch (error) {
    return { state: "UNAVAILABLE", reason: redact(error?.message ?? error).slice(0, 1000) };
  }
};
const resultValidationIssues = (candidate) => {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return ["RESULT_NOT_OBJECT"];
  const allowed = new Set(["schema", "status", "summary", ...arrayFields, "nextAction"]);
  const issues = [];
  const unexpected = Object.keys(candidate).filter((key) => !allowed.has(key)).sort();
  if (unexpected.length) issues.push("UNEXPECTED_FIELDS:" + unexpected.join(","));
  if (candidate.schema !== "factory-result/v1") issues.push("SCHEMA_DISCRIMINATOR_INVALID");
  if (!["COMPLETED", "BLOCKED", "FAILED"].includes(candidate.status)) issues.push("STATUS_INVALID");
  if (typeof candidate.summary !== "string" || !candidate.summary.trim() || candidate.summary.length > 4000) issues.push("SUMMARY_INVALID");
  if (typeof candidate.nextAction !== "string" || candidate.nextAction.length > 4000) issues.push("NEXT_ACTION_INVALID");
  for (const field of arrayFields) {
    if (!Array.isArray(candidate[field]) || candidate[field].length > 200 || candidate[field].some((item) => typeof item !== "string" || item.length > 2000)) issues.push(field.toUpperCase() + "_INVALID");
  }
  if (arrayFields.slice(0, 3).every((field) => Array.isArray(candidate[field]))) {
    const criteria = [...candidate.completedAcceptanceCriterionIds, ...candidate.incompleteAcceptanceCriterionIds, ...candidate.unknownAcceptanceCriterionIds];
    if (new Set(criteria).size !== criteria.length) issues.push("ACCEPTANCE_CRITERION_DUPLICATED");
  }
  return issues;
};
const parseResult = (text) => {
  if (Buffer.byteLength(text, "utf8") > MAX_BYTES) return undefined;
  let candidate;
  try { candidate = JSON.parse(text.trim()); } catch { return undefined; }
  if (resultValidationIssues(candidate).length) return undefined;
  return candidate;
};
const resultContextIssues = (result, expectedCriterionIds) => {
  if (!Array.isArray(expectedCriterionIds) || expectedCriterionIds.some((id) => typeof id !== "string" || !id) || new Set(expectedCriterionIds).size !== expectedCriterionIds.length) return ["EXPECTED_ACCEPTANCE_CRITERIA_INVALID"];
  const expected = [...expectedCriterionIds].sort();
  const reported = [...result.completedAcceptanceCriterionIds, ...result.incompleteAcceptanceCriterionIds, ...result.unknownAcceptanceCriterionIds].sort();
  const issues = [];
  if (JSON.stringify(reported) !== JSON.stringify(expected)) issues.push("ACCEPTANCE_CRITERIA_ACCOUNTING_INVALID");
  if (result.status === "COMPLETED" && (result.incompleteAcceptanceCriterionIds.length || result.unknownAcceptanceCriterionIds.length)) issues.push("COMPLETED_RESULT_HAS_UNRESOLVED_CRITERIA");
  return issues;
};
const inspectFile = (file) => {
  if (!file) return { state: "NOT_REQUESTED", byteLength: null, digest: null, tail: "", validationIssues: [] };
  let content;
  try { content = readFileSync(file, "utf8"); } catch (error) {
    return error?.code === "ENOENT"
      ? { state: "ABSENT", byteLength: null, digest: null, tail: "", validationIssues: [] }
      : { state: "READ_ERROR", byteLength: null, digest: null, tail: "", validationIssues: [] };
  }
  const byteLength = Buffer.byteLength(content, "utf8");
  const evidence = { byteLength, digest: digest("factory-executor-result-output/v1", content), tail: redact(content).slice(-4000) };
  if (byteLength > MAX_BYTES) return { state: "TOO_LARGE", ...evidence, validationIssues: ["RESULT_TOO_LARGE"] };
  const trimmed = content.trim();
  if (!trimmed) return { state: "EMPTY", ...evidence, validationIssues: ["RESULT_EMPTY"] };
  let candidate;
  try { candidate = JSON.parse(trimmed); } catch (error) {
    const truncated = /unexpected end|unterminated/i.test(String(error?.message ?? "")) || !/[}\]]$/.test(trimmed);
    const state = truncated ? "TRUNCATED" : "INVALID_JSON";
    return { state, ...evidence, validationIssues: [state === "TRUNCATED" ? "JSON_TRUNCATED" : "JSON_INVALID"] };
  }
  const validationIssues = resultValidationIssues(candidate);
  const result = parseResult(JSON.stringify(candidate));
  return result ? { state: "VALID", ...evidence, validationIssues: [], result } : { state: "SCHEMA_INVALID", ...evidence, validationIssues };
};
const inspectJsonl = (stdout, byteLength = Buffer.byteLength(stdout, "utf8")) => {
  const lines = stdout.split("\n").filter((line) => line.trim());
  let malformedLineCount = 0;
  let terminalCompletedCount = 0;
  let terminalFailureCount = 0;
  let completedIndex = -1;
  let inputTokens = null;
  let outputTokens = null;
  const candidates = [];
  if (byteLength <= MAX_BYTES && lines.length <= MAX_LINES) lines.forEach((line, index) => {
    let event;
    try { event = JSON.parse(line); } catch { malformedLineCount += 1; return; }
    if (event?.type === "turn.completed") {
      terminalCompletedCount += 1;
      completedIndex = index;
      const observedInput = event.usage?.input_tokens ?? event.usage?.inputTokens;
      const observedOutput = event.usage?.output_tokens ?? event.usage?.outputTokens;
      inputTokens = Number.isSafeInteger(observedInput) && observedInput >= 0 ? observedInput : null;
      outputTokens = Number.isSafeInteger(observedOutput) && observedOutput >= 0 ? observedOutput : null;
    }
    if (["turn.failed", "turn.canceled", "error"].includes(event?.type)) terminalFailureCount += 1;
    if (event?.type === "item.completed" && event.item?.type === "agent_message" && typeof event.item.text === "string") {
      const result = parseResult(event.item.text);
      if (result) candidates.push({ result, index });
    }
  });
  const result = byteLength <= MAX_BYTES && lines.length <= MAX_LINES && malformedLineCount === 0
    && terminalCompletedCount === 1 && terminalFailureCount === 0 && candidates.length === 1
    && candidates[0].index < completedIndex ? candidates[0].result : undefined;
  return {
    result,
    inputTokens,
    outputTokens,
    tooLarge: byteLength > MAX_BYTES || lines.length > MAX_LINES,
    provenance: { byteLength, lineCount: Math.min(lines.length, MAX_LINES + 1), malformedLineCount, terminalCompletedCount, terminalFailureCount, validCandidateCount: candidates.length },
  };
};
const makeFailure = (failureClass, code, stage, summary) => ({
  class: failureClass,
  code,
  stage,
  retryable: failureClass === "RETRYABLE_INFRA" || failureClass === "RETRYABLE_EXECUTION",
  summary: redact(summary).slice(0, 1000),
});
const failedResult = (decision) => ({
  schema: "factory-result/v1",
  status: "FAILED",
  summary: decision.summary,
  completedAcceptanceCriterionIds: [],
  incompleteAcceptanceCriterionIds: [],
  unknownAcceptanceCriterionIds: [],
  verificationCommands: [],
  knownRisks: [decision.class + ":" + decision.code],
  nextAction: "Inspect the bounded remote execution evidence before deciding whether to retry.",
});
const chooseFailure = (file, jsonl) => {
  if (jsonl.tooLarge) return makeFailure("NON_RETRYABLE_RESULT", "JSONL_TOO_LARGE", "RESULT_RECONSTRUCTION", "Codex JSONL exceeded the frozen reconstruction bound.");
  if (jsonl.provenance.malformedLineCount > 0) return makeFailure("NON_RETRYABLE_RESULT", "JSONL_MALFORMED", "RESULT_RECONSTRUCTION", "Codex JSONL contained malformed non-empty lines.");
  if (jsonl.provenance.validCandidateCount > 1) return makeFailure("NON_RETRYABLE_RESULT", "JSONL_AMBIGUOUS", "RESULT_RECONSTRUCTION", "Codex JSONL contained multiple schema-valid result candidates.");
  if (jsonl.provenance.terminalFailureCount > 0) return makeFailure("NON_RETRYABLE_RESULT", "JSONL_TERMINAL_FAILURE", "RESULT_RECONSTRUCTION", "Codex JSONL ended in a terminal failure state.");
  if (jsonl.provenance.validCandidateCount === 1 && jsonl.provenance.terminalCompletedCount !== 1) return makeFailure("NON_RETRYABLE_RESULT", "JSONL_INCOMPLETE", "RESULT_RECONSTRUCTION", "Codex JSONL had a result candidate without exactly one terminal completion event.");
  const codes = { NOT_REQUESTED: "RESULT_MISSING", ABSENT: "RESULT_FILE_MISSING", EMPTY: "RESULT_FILE_EMPTY", TRUNCATED: "RESULT_FILE_TRUNCATED", INVALID_JSON: "RESULT_INVALID_JSON", SCHEMA_INVALID: "RESULT_SCHEMA_INVALID", TOO_LARGE: "RESULT_FILE_TOO_LARGE", READ_ERROR: "RESULT_FILE_READ_ERROR", VALID: "RESULT_UNACCEPTED" };
  return makeFailure("NON_RETRYABLE_RESULT", codes[file.state], "RESULT_RECONSTRUCTION", "No accepted factory-result/v1 was available; output-file state was " + file.state + ".");
};

let fatalDiagnosticsPath = "/var/lib/mission-control/attempt/diagnostics.json";
trace("SUPERVISOR_STARTED", { pid: process.pid, uid: process.getuid?.() ?? null, gid: process.getgid?.() ?? null });
try {
const config = JSON.parse(readFileSync(process.argv[2], "utf8"));
fatalDiagnosticsPath = config.diagnosticsPath ?? config.outputPath + ".diagnostics.json";
trace("CONFIG_LOADED", {
  attemptId: config.attemptId,
  files: {
    repository: fileObservation(config.repositoryRoot),
    home: fileObservation(config.executionSecurity?.homePath),
    temporary: fileObservation(config.executionSecurity?.temporaryPath),
    outputSchema: fileObservation(config.outputSchemaPath),
    executorResult: fileObservation(config.executor?.resultPath),
    supervisorResult: fileObservation(config.outputPath),
    diagnostics: fileObservation(fatalDiagnosticsPath),
  },
});
const manifest = config.executionManifest;
const manifestDigest = "sha256:" + createHash("sha256").update(canonical(manifest)).digest("hex");
const harnessFields = ["adapter", "version", "harnessId", "harnessVersion", "provider", "model"];
if (!manifest || manifest.version !== "factory-execution-manifest/v1" || manifestDigest !== config.manifestDigest
  || manifest.causation?.workOrderId !== config.workOrderId || manifest.causation?.workOrderRevisionNumber !== config.workOrderRevisionNumber
  || manifest.causation?.workflowRunId !== config.workflowRunId || manifest.repository?.baseSha !== config.sourceSha
  || manifest.sandbox?.profileDigest !== config.profileDigest || manifest.sandbox?.supervisorVersion !== "mission-control-supervisor/v1"
  || manifest.harness?.pullRequestAuthority !== "CONTROL_PLANE_ONLY" || manifest.harness?.executionBackend !== "remote-sandbox"
  || harnessFields.some((field) => typeof manifest.harness?.[field] !== "string" || !manifest.harness[field])
  || !Array.isArray(manifest.intent?.acceptanceCriterionIds) || manifest.intent.acceptanceCriterionIds.some((id) => typeof id !== "string" || !id)
  || new Set(manifest.intent.acceptanceCriterionIds).size !== manifest.intent.acceptanceCriterionIds.length
  || !Array.isArray(manifest.sandbox?.credentialGrants)
  || manifest.sandbox.credentialGrants.some((grant) => grant.secretValueIncluded !== false || grant.githubAuthority !== "NONE" || grant.providerAuthority !== "NONE")) {
  throw new Error("Frozen execution manifest is invalid or exceeds sandbox authority.");
}
trace("MANIFEST_VALIDATED", { attemptId: config.attemptId, sourceSha: config.sourceSha });
const executionSecurity = config.executionSecurity;
if (executionSecurity && (executionSecurity.user !== "mc-attempt" || executionSecurity.uid !== 10001 || executionSecurity.gid !== 10001
  || executionSecurity.homePath !== "/var/lib/mission-control/attempt/home"
  || executionSecurity.temporaryPath !== "/var/lib/mission-control/attempt/tmp" || executionSecurity.noNewPrivileges !== true
  || executionSecurity.capabilityMode !== "DROP_ALL")) {
  throw new Error("Frozen non-root execution identity is invalid.");
}
const confinementArgs = executionSecurity ? [
  "--no-new-privs",
  "--bounding-set=-all",
  "--inh-caps=-all",
  "--ambient-caps=-all",
  "--reuid=" + executionSecurity.uid,
  "--regid=" + executionSecurity.gid,
  "--clear-groups",
] : [];
const confinedEnvironment = executionSecurity
  ? { PATH: "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin", HOME: executionSecurity.homePath, TMPDIR: executionSecurity.temporaryPath, SHELL: "/bin/sh" }
  : { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "" };
const repositoryGit = (args, options = {}) => execFileSync(
  executionSecurity ? "setpriv" : "git",
  executionSecurity ? [...confinementArgs, "--", "git", ...args] : args,
  { cwd: config.repositoryRoot, env: confinedEnvironment, ...options },
);
const startedAt = Date.now();
trace("REPOSITORY_VALIDATION_STARTED", { repository: fileObservation(config.repositoryRoot) });
const source = repositoryGit(["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
if (source !== config.sourceSha) throw new Error("Frozen source SHA mismatch.");
trace("REPOSITORY_VALIDATED", { sourceSha: source });
const childCommand = executionSecurity ? "setpriv" : config.executor.command;
const childArgs = executionSecurity ? [
  ...confinementArgs,
  "--",
  config.executor.command,
  ...config.executor.args,
] : config.executor.args;
const childEnvironment = executionSecurity
  ? { ...confinedEnvironment, ...config.environment }
  : { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", ...config.environment };
trace("CODEX_SPAWN_STARTED", {
  command: config.executor.command,
  uid: executionSecurity?.uid ?? process.getuid?.() ?? null,
  gid: executionSecurity?.gid ?? process.getgid?.() ?? null,
  environmentKeys: Object.keys(childEnvironment).sort(),
});
const child = spawn(childCommand, childArgs, { cwd: config.repositoryRoot, env: childEnvironment, stdio: ["ignore", "pipe", "pipe"], detached: true });
trace("CODEX_SPAWNED", { pid: child.pid ?? null, detached: true });
const boundedCapture = (namespace) => {
  const hash = createHash("sha256").update(namespace + "\0");
  let byteLength = 0;
  let tail = "";
  return {
    push(chunk) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      hash.update(buffer);
      byteLength += buffer.length;
      tail = (tail + buffer.toString("utf8")).slice(-MAX_BYTES);
    },
    finish() {
      const retainedBytes = Buffer.byteLength(tail, "utf8");
      return { tail, byteLength, truncatedBytes: Math.max(0, byteLength - retainedBytes), digest: "sha256:" + hash.digest("hex") };
    },
  };
};
const stdoutCapture = boundedCapture("factory-sandbox-stdout/v1");
const stderrCapture = boundedCapture("factory-sandbox-stderr/v1");
let timedOut = false;
let canceled = false;
let firstExecutorOutputObserved = false;
const captureExecutorOutput = (stream, capture, chunk) => {
  capture.push(chunk);
  if (!firstExecutorOutputObserved) {
    firstExecutorOutputObserved = true;
    trace("CODEX_FIRST_EVENT", { stream, byteLength: Buffer.byteLength(chunk) });
  }
};
child.stdout.on("data", (chunk) => captureExecutorOutput("stdout", stdoutCapture, chunk));
child.stderr.on("data", (chunk) => captureExecutorOutput("stderr", stderrCapture, chunk));
const terminateChild = (signal) => {
  try { process.kill(-child.pid, signal); } catch { try { child.kill(signal); } catch {} }
};
let forceKillTimer;
const requestTermination = (reason) => {
  if (reason === "timeout") timedOut = true;
  else canceled = true;
  terminateChild("SIGTERM");
  forceKillTimer = setTimeout(() => terminateChild("SIGKILL"), 2000);
  forceKillTimer.unref();
};
const cancel = () => requestTermination("canceled");
process.once("SIGTERM", cancel);
process.once("SIGINT", cancel);
const timer = setTimeout(() => requestTermination("timeout"), config.executor.timeoutMs);
const childExit = await new Promise((resolve, reject) => {
  child.once("error", reject);
  child.once("close", (code, signal) => resolve({ code, signal }));
});
trace("CODEX_TERMINAL", { exitCode: childExit.code, signal: childExit.signal, timedOut, canceled });
clearTimeout(timer);
if (forceKillTimer) clearTimeout(forceKillTimer);
process.removeListener("SIGTERM", cancel);
process.removeListener("SIGINT", cancel);
const exitCode = childExit.code ?? (childExit.signal === "SIGKILL" ? 137 : childExit.signal === "SIGTERM" ? 143 : 1);
const stdoutEvidence = stdoutCapture.finish();
const stderrEvidence = stderrCapture.finish();
const stdout = stdoutEvidence.tail;
const stderr = stderrEvidence.tail;

const file = inspectFile(config.executor.resultPath);
trace("EXECUTOR_OUTPUT_INSPECTED", { state: file.state, byteLength: file.byteLength, file: fileObservation(config.executor.resultPath) });
const jsonl = inspectJsonl(stdout, stdoutEvidence.byteLength);
let structured = file.result;
let resultSource = structured ? "OUTPUT_FILE" : "NONE";
if (!structured && file.state === "NOT_REQUESTED" && stdoutEvidence.byteLength <= MAX_BYTES) {
  structured = parseResult(stdout);
  if (structured) resultSource = "EXECUTOR_STDOUT";
}
if (!structured && jsonl.result) {
  structured = jsonl.result;
  resultSource = "CODEX_JSONL_RECONSTRUCTION";
}
let decision;
if (canceled) decision = makeFailure("UNKNOWN", "ATTEMPT_CANCELED", "EXECUTOR", "Remote executor was canceled by the control plane.");
else if (timedOut) decision = makeFailure("RETRYABLE_EXECUTION", "EXECUTOR_TIMEOUT", "EXECUTOR", "Remote executor exceeded the frozen Attempt timeout.");
else if (exitCode !== 0) {
  const detail = stderr || "Remote executor exited non-zero.";
  if (/\b429\b|rate[ -]?limit|too many requests/i.test(detail)) decision = makeFailure("RETRYABLE_EXECUTION", "MODEL_RATE_LIMIT", "EXECUTOR", detail);
  else if (/\b(502|503|504)\b|temporar(?:y|ily) unavailable|provider overloaded|connection reset/i.test(detail)) decision = makeFailure("RETRYABLE_EXECUTION", "MODEL_TRANSIENT_PROVIDER", "EXECUTOR", detail);
  else decision = makeFailure("UNKNOWN", "EXECUTOR_UNCLASSIFIED", "EXECUTOR", detail);
}
else if (!structured) decision = chooseFailure(file, jsonl);
else if (resultContextIssues(structured, manifest.intent.acceptanceCriterionIds).length) decision = makeFailure("NON_RETRYABLE_RESULT", "RESULT_ACCEPTANCE_CONTEXT_INVALID", "RESULT_VALIDATION", "factory-result/v1 acceptance-criterion accounting did not match the frozen WorkOrder.");
else if (structured.status !== "COMPLETED") decision = makeFailure("NON_RETRYABLE_RESULT", "DETERMINISTIC_GATE_FAILURE", "RESULT_VALIDATION", "Executor returned " + structured.status + ": " + structured.nextAction);
if (!structured) structured = failedResult(decision);
const accepted = !decision && structured.status === "COMPLETED";
const resultProvenance = { source: resultSource, outputFile: { state: file.state, byteLength: file.byteLength }, jsonl: jsonl.provenance };
const diagnosticsPath = config.diagnosticsPath ?? config.outputPath + ".diagnostics.json";
const networkPolicy = observeNetworkPolicy();
trace("DIAGNOSTICS_WRITE_STARTED", { path: diagnosticsPath, networkPolicyState: networkPolicy.state });
atomicWrite(diagnosticsPath, JSON.stringify({
  attemptId: config.attemptId,
  manifestDigest: config.manifestDigest,
  sourceSha: config.sourceSha,
  phase: "EXECUTOR_FINISHED",
  executor: {
    exitCode,
    timedOut,
    canceled,
    stdoutDigest: stdoutEvidence.digest,
    stderrDigest: stderrEvidence.digest,
    stdoutByteLength: stdoutEvidence.byteLength,
    stderrByteLength: stderrEvidence.byteLength,
    stdoutTruncatedBytes: stdoutEvidence.truncatedBytes,
    stderrTruncatedBytes: stderrEvidence.truncatedBytes,
    stdoutTail: redact(stdout).slice(-16000),
    stderrTail: redact(stderr).slice(-16000),
  },
  resultProvenance,
  resultOutput: { state: file.state, byteLength: file.byteLength, digest: file.digest, tail: file.tail, validationIssues: file.validationIssues },
  networkPolicy,
  lifecycleTrace: lifecycleEvents,
  failure: decision ?? null,
}));
trace("DIAGNOSTICS_WRITTEN", { file: fileObservation(diagnosticsPath) });
if (config.faultInjection?.crashAfterDiagnostics) throw new Error("Injected supervisor crash after executor diagnostics persistence.");

// Stage the harness's changes (respecting .gitignore) before computing the
// candidate, bounded by the frozen code scope. A harness creates new files
// without staging them, and \`git diff <sha>\` cannot see untracked paths, so
// the bundle would carry a half-change that the host's changed-file
// cross-check cannot detect — the host list is derived from the same patch.
// The pathspec mirrors the host-side \`stagingPathspec\` in sandboxSupervisor.ts;
// standaloneSupervisorStagingPathspec keeps the two derivations equivalent.
const stagePaths = (Array.isArray(manifest.repository && manifest.repository.allowedPaths) ? manifest.repository.allowedPaths : [])
  .map((entry) => String(entry === undefined || entry === null ? "" : entry).trim())
  .filter((entry) => entry.length > 0 && !entry.startsWith("/") && !entry.includes(".."));
repositoryGit(["add", "-A", "--", ...(stagePaths.length > 0 ? stagePaths : ["."])], { encoding: "utf8" });
const patch = repositoryGit(["diff", "--cached", "--binary", "--full-index", config.sourceSha, "--"], { maxBuffer: 8388608 });
const patchContent = patch.toString("base64");
const changedFiles = repositoryGit(["diff", "--cached", "--name-only", config.sourceSha, "--"], { encoding: "utf8" }).split("\n").map((item) => item.trim()).filter(Boolean).sort();
const finishedAt = Date.now();
trace("RESULT_FINALIZATION_STARTED", { changedFileCount: changedFiles.length });
const bundle = {
  schema: "factory-sandbox-result/v1",
  attemptId: config.attemptId,
  workOrderId: config.workOrderId,
  workOrderRevisionNumber: config.workOrderRevisionNumber,
  workflowRunId: config.workflowRunId,
  manifestDigest: config.manifestDigest,
  profileDigest: config.profileDigest,
  sourceSha: config.sourceSha,
  supervisorVersion: "mission-control-supervisor/v1",
  harness: { adapter: manifest.harness.adapter, version: manifest.harness.version, harnessId: manifest.harness.harnessId, harnessVersion: manifest.harness.harnessVersion, provider: manifest.harness.provider, model: manifest.harness.model },
  environment: config.environmentDescriptor,
  startedAt,
  finishedAt,
  status: canceled ? "CANCELED" : timedOut ? "TIMED_OUT" : accepted ? "COMPLETED" : "FAILED",
  resultProvenance: { ...resultProvenance, context: { attemptId: config.attemptId, manifestDigest: config.manifestDigest, sourceSha: config.sourceSha } },
  ...(decision ? { failure: decision } : {}),
  structuredResult: structured,
  changedFiles,
  diff: { filesChanged: changedFiles.length },
  commandResults: [{ commandClass: "EXECUTOR", exitCode, durationMs: finishedAt - startedAt, timedOut }],
  verificationInputs: { reportedCommands: structured.verificationCommands },
  artifacts: [],
  events: lifecycleEvents.map((event) => ({ type: event.stage, occurredAt: event.occurredAt })),
  patch: { format: "GIT_BINARY_DIFF", encoding: "BASE64", byteLength: patch.length, digest: digest("factory-sandbox-patch/v1", patchContent), content: patchContent },
  executor: { exitCode, stdoutDigest: stdoutEvidence.digest, stderrDigest: stderrEvidence.digest, stdoutTail: redact(stdout).slice(-16000), stderrTail: redact(stderr).slice(-16000), resultOutput: { state: file.state, byteLength: file.byteLength, digest: file.digest, tail: file.tail, validationIssues: file.validationIssues } },
  usage: { providerCostUsd: null, inferenceCostUsd: null, inputTokens: jsonl.inputTokens, outputTokens: jsonl.outputTokens, observedAt: finishedAt, providerRuntimeMs: finishedAt - startedAt, enforcement: "OBSERVATION_ONLY" },
};
bundle.digest = digest("factory-sandbox-result/v1", bundle);
atomicWrite(config.outputPath, JSON.stringify(bundle));
trace("RESULT_WRITTEN", { status: bundle.status, file: fileObservation(config.outputPath) });
trace("SUPERVISOR_TERMINAL", { exitCode: 0, signal: null });
} catch (error) {
  const fatal = {
    name: String(error?.name ?? "Error"),
    code: error?.code == null ? null : String(error.code),
    message: redact(error?.message ?? error).slice(0, 4000),
    stack: redact(error?.stack ?? "").slice(-16000),
  };
  trace("SUPERVISOR_TERMINAL", { exitCode: 1, signal: null, fatal: { name: fatal.name, code: fatal.code, message: fatal.message } });
  try {
    if (fileObservation(fatalDiagnosticsPath).state !== "PRESENT") {
      atomicWrite(fatalDiagnosticsPath, JSON.stringify({
        phase: "SUPERVISOR_FATAL",
        fatal,
        networkPolicy: observeNetworkPolicy(),
        lifecycleTrace: lifecycleEvents,
      }));
    }
  } catch {}
  process.stderr.write(fatal.message + "\n");
  process.exitCode = 1;
}
`.trim();
}
