import { createHash } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { canonicalDigest, canonicalHash } from "@mission-control/shared";
import { createPatchDescriptor, createSandboxResultBundle, encodeSandboxResultBundle, type SandboxResultBundle } from "./sandboxResultBundle.js";
import { SANDBOX_SUPERVISOR_VERSION, redactSandboxText } from "./sandboxProvider.js";

const execFileAsync = promisify(execFile);

export interface SandboxSupervisorInput {
  executionManifest: Record<string, unknown>;
  attemptId: string;
  workOrderId: string;
  workOrderRevisionNumber: number;
  workflowRunId: string;
  manifestDigest: string;
  profileDigest: string;
  sourceSha: string;
  environmentDescriptor: {
    provider: "EXE_DEV" | "FAKE";
    image: string;
  };
  repositoryRoot: string;
  outputPath: string;
  executor: {
    command: string;
    args: string[];
    timeoutMs: number;
    resultPath?: string;
  };
  environment: Record<string, string>;
}

export async function runSandboxSupervisor(input: SandboxSupervisorInput, signal?: AbortSignal): Promise<SandboxResultBundle> {
  validateSupervisorInput(input);
  const startedAt = Date.now();
  const observedSource = (await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: input.repositoryRoot })).stdout.trim();
  if (observedSource !== input.sourceSha) throw new Error("Sandbox repository does not match the frozen source SHA.");
  const execution = await runExecutor(input, signal);
  const patch = await execFileAsync("git", ["diff", "--binary", "--full-index", input.sourceSha, "--"], {
    cwd: input.repositoryRoot,
    maxBuffer: 8 * 1024 * 1024,
    encoding: "buffer",
  });
  const structuredOutput = input.executor.resultPath
    ? await readFile(input.executor.resultPath, "utf8").catch(() => execution.stdout)
    : execution.stdout;
  const structuredResult = parseStructuredResult(structuredOutput);
  const status = execution.timedOut ? "TIMED_OUT" : signal?.aborted ? "CANCELED" : execution.exitCode === 0 ? "COMPLETED" : "FAILED";
  const changedFiles = (await execFileAsync("git", ["diff", "--name-only", input.sourceSha, "--"], { cwd: input.repositoryRoot })).stdout
    .split("\n").map((value) => value.trim()).filter(Boolean).sort();
  const numstat = (await execFileAsync("git", ["diff", "--numstat", input.sourceSha, "--"], { cwd: input.repositoryRoot })).stdout;
  const { linesAdded, linesDeleted } = summarizeNumstat(numstat);
  const finishedAt = Date.now();
  const bundle = createSandboxResultBundle({
    schema: "factory-sandbox-result/v1",
    attemptId: input.attemptId,
    workOrderId: input.workOrderId,
    workOrderRevisionNumber: input.workOrderRevisionNumber,
    workflowRunId: input.workflowRunId,
    manifestDigest: input.manifestDigest,
    profileDigest: input.profileDigest,
    sourceSha: input.sourceSha,
    supervisorVersion: SANDBOX_SUPERVISOR_VERSION,
    environment: input.environmentDescriptor,
    startedAt,
    finishedAt,
    status,
    structuredResult,
    changedFiles,
    diff: { filesChanged: changedFiles.length, linesAdded, linesDeleted },
    commandResults: [{ commandClass: "EXECUTOR", exitCode: execution.exitCode, durationMs: finishedAt - startedAt, timedOut: execution.timedOut }],
    verificationInputs: { reportedCommands: structuredResult.verificationCommands },
    artifacts: [],
    events: [
      { type: "SUPERVISOR_STARTED", occurredAt: startedAt },
      { type: "EXECUTOR_FINISHED", occurredAt: finishedAt },
      { type: "RESULT_WRITTEN", occurredAt: finishedAt },
    ],
    patch: createPatchDescriptor(Buffer.from(patch.stdout)),
    executor: {
      exitCode: execution.exitCode,
      stdoutDigest: canonicalDigest("factory-sandbox-stdout/v1", execution.stdout),
      stderrDigest: canonicalDigest("factory-sandbox-stderr/v1", execution.stderr),
      stdoutTail: redactSandboxText(execution.stdout.slice(-16_000)),
      stderrTail: redactSandboxText(execution.stderr.slice(-16_000)),
    },
    usage: { observedAt: finishedAt, providerRuntimeMs: finishedAt - startedAt, enforcement: "OBSERVATION_ONLY" },
  });
  await writeFile(input.outputPath, encodeSandboxResultBundle(bundle), { mode: 0o600 });
  return bundle;
}

export async function runSandboxSupervisorFromConfig(configPath: string) {
  const raw = await readFile(configPath, "utf8");
  const input = JSON.parse(raw) as SandboxSupervisorInput;
  return await runSandboxSupervisor(input);
}

export function standaloneSandboxSupervisorSource() {
  // This source is intentionally self-contained: exe.dev VMs need Node and Git,
  // but never the Mission Control source tree or control-plane credentials.
  return `
import { createHash } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
const canonical=(v)=>v===null||typeof v!=="object"?(JSON.stringify(v)??"undefined"):Array.isArray(v)?"["+v.map(x=>x===undefined?"":canonical(x)).join(",")+"]":"{"+Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>JSON.stringify(k)+":"+canonical(x)).join(",")+"}";
const digest=(namespace,value)=>"sha256:"+createHash("sha256").update(canonical({namespace,value})).digest("hex");
const redact=(value)=>String(value).replace(/(authorization|cookie|token|secret|password|api[-_]?key)\\s*[:=]\\s*([^\\s,;]+)/gi,"$1=[REDACTED]");
const config=JSON.parse(readFileSync(process.argv[2],"utf8"));
const manifest=config.executionManifest;
const manifestDigest="sha256:"+createHash("sha256").update(canonical(manifest)).digest("hex");
if(!manifest||manifest.version!=="factory-execution-manifest/v1"||manifestDigest!==config.manifestDigest||manifest.causation?.workOrderId!==config.workOrderId||manifest.causation?.workOrderRevisionNumber!==config.workOrderRevisionNumber||manifest.causation?.workflowRunId!==config.workflowRunId||manifest.repository?.baseSha!==config.sourceSha||manifest.sandbox?.profileDigest!==config.profileDigest||manifest.sandbox?.supervisorVersion!=="mission-control-supervisor/v1"||manifest.harness?.pullRequestAuthority!=="CONTROL_PLANE_ONLY"||manifest.harness?.executionBackend!=="remote-sandbox"||!Array.isArray(manifest.sandbox?.credentialGrants)||manifest.sandbox.credentialGrants.some(grant=>grant.secretValueIncluded!==false||grant.githubAuthority!=="NONE"||grant.providerAuthority!=="NONE")) throw new Error("Frozen execution manifest is invalid or exceeds sandbox authority.");
const startedAt=Date.now();
const source=execFileSync("git",["rev-parse","HEAD"],{cwd:config.repositoryRoot,encoding:"utf8"}).trim();
if(source!==config.sourceSha) throw new Error("Frozen source SHA mismatch.");
const child=spawn(config.executor.command,config.executor.args,{cwd:config.repositoryRoot,env:{PATH:process.env.PATH??"",HOME:process.env.HOME??"",...config.environment},stdio:["ignore","pipe","pipe"]});
let stdout="",stderr="",timedOut=false;
child.stdout.on("data",c=>stdout+=c); child.stderr.on("data",c=>stderr+=c);
const timer=setTimeout(()=>{timedOut=true;child.kill("SIGTERM")},config.executor.timeoutMs);
const exitCode=await new Promise(resolve=>child.once("close",code=>resolve(code))); clearTimeout(timer);
let structuredText=stdout; if(config.executor.resultPath){try{structuredText=readFileSync(config.executor.resultPath,"utf8")}catch{}}
const structuredArrayFields=["completedAcceptanceCriterionIds","incompleteAcceptanceCriterionIds","unknownAcceptanceCriterionIds","verificationCommands","knownRisks"];
const agentOutputs=[];for(const line of stdout.split("\\n")){try{const event=JSON.parse(line);if(event.type==="item.completed"&&event.item?.type==="agent_message"&&typeof event.item.text==="string")agentOutputs.push(event.item.text)}catch{}}
let structured;for(const candidateText of [structuredText,...agentOutputs.reverse()]){try{const candidate=JSON.parse(candidateText.trim());const valid=candidate&&typeof candidate==="object"&&["COMPLETED","BLOCKED","FAILED"].includes(candidate.status)&&typeof candidate.summary==="string"&&candidate.summary.trim()&&typeof candidate.nextAction==="string"&&structuredArrayFields.every(field=>Array.isArray(candidate[field])&&candidate[field].every(value=>typeof value==="string"));if(valid){structured={...candidate,schema:"factory-result/v1"};break}}catch{}}
if(!structured)structured={schema:"factory-result/v1",status:"FAILED",summary:"Executor did not return valid factory-result/v1 JSON.",completedAcceptanceCriterionIds:[],incompleteAcceptanceCriterionIds:[],unknownAcceptanceCriterionIds:[],verificationCommands:[],knownRisks:["Executor output failed factory-result/v1 validation."],nextAction:"Inspect executor evidence."};
const patch=execFileSync("git",["diff","--binary","--full-index",config.sourceSha,"--"],{cwd:config.repositoryRoot,maxBuffer:8388608});
const patchContent=patch.toString("base64");
const changedFiles=execFileSync("git",["diff","--name-only",config.sourceSha,"--"],{cwd:config.repositoryRoot,encoding:"utf8"}).split("\\n").map(x=>x.trim()).filter(Boolean).sort();
const finishedAt=Date.now();
const bundle={schema:"factory-sandbox-result/v1",attemptId:config.attemptId,workOrderId:config.workOrderId,workOrderRevisionNumber:config.workOrderRevisionNumber,workflowRunId:config.workflowRunId,manifestDigest:config.manifestDigest,profileDigest:config.profileDigest,sourceSha:config.sourceSha,supervisorVersion:"mission-control-supervisor/v1",environment:config.environmentDescriptor,startedAt,finishedAt,status:timedOut?"TIMED_OUT":exitCode===0&&structured.status==="COMPLETED"?"COMPLETED":"FAILED",structuredResult:structured,changedFiles,diff:{filesChanged:changedFiles.length},commandResults:[{commandClass:"EXECUTOR",exitCode,durationMs:finishedAt-startedAt,timedOut}],verificationInputs:{reportedCommands:structured.verificationCommands??[]},artifacts:[],events:[{type:"SUPERVISOR_STARTED",occurredAt:startedAt},{type:"EXECUTOR_FINISHED",occurredAt:finishedAt},{type:"RESULT_WRITTEN",occurredAt:finishedAt}],patch:{format:"GIT_BINARY_DIFF",encoding:"BASE64",byteLength:patch.length,digest:digest("factory-sandbox-patch/v1",patchContent),content:patchContent},executor:{exitCode,stdoutDigest:digest("factory-sandbox-stdout/v1",stdout),stderrDigest:digest("factory-sandbox-stderr/v1",stderr),stdoutTail:redact(stdout.slice(-16000)),stderrTail:redact(stderr.slice(-16000))},usage:{observedAt:finishedAt,providerRuntimeMs:finishedAt-startedAt,enforcement:"OBSERVATION_ONLY"}};
bundle.digest=digest("factory-sandbox-result/v1",bundle);
writeFileSync(config.outputPath,JSON.stringify(bundle),{mode:384});
`.trim();
}

function validateSupervisorInput(input: SandboxSupervisorInput) {
  if (!input.attemptId || !input.workOrderId || !Number.isSafeInteger(input.workOrderRevisionNumber) || input.workOrderRevisionNumber < 1 || !input.workflowRunId || !input.manifestDigest || !input.profileDigest || !/^[a-f0-9]{40,64}$/i.test(input.sourceSha)) throw new Error("Supervisor identity is invalid.");
  const manifest: any = input.executionManifest;
  const credentialGrants = manifest?.sandbox?.credentialGrants;
  if (manifest?.version !== "factory-execution-manifest/v1"
    || input.manifestDigest !== `sha256:${canonicalHash(manifest)}`
    || manifest?.causation?.workOrderId !== input.workOrderId
    || manifest?.causation?.workOrderRevisionNumber !== input.workOrderRevisionNumber
    || manifest?.causation?.workflowRunId !== input.workflowRunId
    || manifest?.repository?.baseSha !== input.sourceSha
    || manifest?.sandbox?.profileDigest !== input.profileDigest
    || manifest?.sandbox?.supervisorVersion !== SANDBOX_SUPERVISOR_VERSION
    || manifest?.harness?.pullRequestAuthority !== "CONTROL_PLANE_ONLY"
    || manifest?.harness?.executionBackend !== "remote-sandbox"
    || !Array.isArray(credentialGrants)
    || credentialGrants.some((grant: any) => grant?.secretValueIncluded !== false || grant?.githubAuthority !== "NONE" || grant?.providerAuthority !== "NONE")) {
    throw new Error("Frozen execution manifest is invalid or exceeds sandbox authority.");
  }
  if (!["EXE_DEV", "FAKE"].includes(input.environmentDescriptor?.provider) || !input.environmentDescriptor?.image) throw new Error("Supervisor environment identity is invalid.");
  if (!path.isAbsolute(input.repositoryRoot) || !path.isAbsolute(input.outputPath)) throw new Error("Supervisor paths must be absolute.");
  if (!input.executor.command || !Array.isArray(input.executor.args) || !Number.isSafeInteger(input.executor.timeoutMs) || input.executor.timeoutMs < 1_000 || input.executor.timeoutMs > 8 * 60 * 60 * 1_000) throw new Error("Supervisor executor contract is invalid.");
  const allowedEnvironment = new Set(["OPENROUTER_API_KEY", "OPENAI_BASE_URL", "OPENAI_API_KEY"]);
  for (const key of Object.keys(input.environment)) if (!allowedEnvironment.has(key)) throw new Error(`Supervisor environment grant ${key} is not allowed.`);
}

function summarizeNumstat(value: string) {
  let linesAdded = 0;
  let linesDeleted = 0;
  for (const line of value.split("\n")) {
    const [added, deleted] = line.split("\t");
    if (/^\d+$/.test(added ?? "")) linesAdded += Number(added);
    if (/^\d+$/.test(deleted ?? "")) linesDeleted += Number(deleted);
  }
  return { linesAdded, linesDeleted };
}

async function runExecutor(input: SandboxSupervisorInput, signal?: AbortSignal) {
  return await new Promise<{ exitCode: number | null; stdout: string; stderr: string; timedOut: boolean }>((resolve, reject) => {
    const child = spawn(input.executor.command, input.executor.args, {
      cwd: input.repositoryRoot,
      env: { PATH: process.env.PATH, HOME: process.env.HOME, ...input.environment },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    const timeout = setTimeout(() => { timedOut = true; child.kill("SIGTERM"); }, input.executor.timeoutMs);
    const abort = () => child.kill("SIGTERM");
    signal?.addEventListener("abort", abort, { once: true });
    child.once("error", reject);
    child.once("close", (exitCode) => {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
      resolve({ exitCode, stdout, stderr, timedOut });
    });
  });
}

function parseStructuredResult(stdout: string): SandboxResultBundle["structuredResult"] {
  let candidate: any;
  try { candidate = JSON.parse(stdout.trim()); } catch { throw new Error("Sandbox executor did not return factory-result/v1 JSON."); }
  const arrays = ["completedAcceptanceCriterionIds", "incompleteAcceptanceCriterionIds", "unknownAcceptanceCriterionIds", "verificationCommands", "knownRisks"];
  if (!["COMPLETED", "BLOCKED", "FAILED"].includes(candidate?.status) || typeof candidate?.summary !== "string" || typeof candidate?.nextAction !== "string" || arrays.some((field) => !Array.isArray(candidate?.[field]))) throw new Error("Sandbox executor result failed factory-result/v1 validation.");
  return { schema: "factory-result/v1", ...candidate };
}
