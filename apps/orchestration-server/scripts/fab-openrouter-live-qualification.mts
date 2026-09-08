import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseConfig } from "@fdlc/fab";
import { runHarnessExecution, type ExecutorRequest, type HarnessExecutionContext } from "@mission-control/workflow-engine";
import { FabExecutorAdapter } from "../src/fabExecutorAdapter.js";
import { createFabOpenRouterBrokerFactory } from "../src/fabOpenRouterBroker.js";
import { openRouterModelRouteBinding } from "../src/openRouterModelRouteBinding.js";
import { commitFactoryChanges } from "../src/factoryGitRuntime.js";
import { OpenRouterSandboxCredentialBroker } from "../src/sandboxCredentials.js";

const modelId = "openai/gpt-4.1-mini";
const route = openRouterModelRouteBinding({ modelId, maxCostUsd: 0.5, maximumOutputTokens: 512 });
const evidenceDirectory = path.resolve("../..", "docs/testing/evidence/fab-openrouter-live-2026-09-07");
const priorConservativeExposureUsd = 2.554822;
const hardCeilingUsd = 5;

if (process.argv.includes("--check")) {
  if (priorConservativeExposureUsd + route.maxCostUsd > hardCeilingUsd) throw new Error("FAB_OPENROUTER_HARD_CEILING_EXCEEDED");
  console.log(JSON.stringify({ status: "PASS", route, hardCeilingUsd, maximumNewLiabilityUsd: route.maxCostUsd }));
  process.exit(0);
}

const managementKey = process.env.OPENROUTER_MANAGEMENT_API_KEY?.trim();
if (!managementKey) throw new Error("OPENROUTER_MANAGEMENT_API_KEY is required directly in the qualification environment.");
if (priorConservativeExposureUsd + route.maxCostUsd > hardCeilingUsd) throw new Error("FAB_OPENROUTER_HARD_CEILING_EXCEEDED");

const temporary = mkdtempSync("/private/tmp/fab-openrouter-live-");
const repository = path.join(temporary, "producer");
const stateDirectory = path.join(temporary, "state");
mkdirSync(path.join(repository, "src"), { recursive: true });
writeFileSync(path.join(repository, "src/price.mjs"), "export function finalPrice(subtotal, discount) {\n  return subtotal + discount;\n}\n");
const git = (cwd: string, args: string[]) => execFileSync("/usr/bin/git", ["-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", ...args], {
  cwd, encoding: "utf8", env: { PATH: "/usr/bin:/bin", HOME: temporary, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "Fab Qualification", GIT_AUTHOR_EMAIL: "fab-qualification@example.invalid", GIT_COMMITTER_NAME: "Fab Qualification", GIT_COMMITTER_EMAIL: "fab-qualification@example.invalid" },
}).trim();
git(repository, ["init", "-q"]); git(repository, ["add", "."]); git(repository, ["commit", "-qm", "Synthetic qualification baseline"]);
const sourceRevision = git(repository, ["rev-parse", "HEAD"]);
const ids = {
  workOrderId: `wo-openrouter-${randomUUID()}`,
  producerAttemptId: `attempt-producer-${randomUUID()}`,
  producerLeaseId: `lease-producer-${randomUUID()}`,
  verifierAttemptId: `attempt-verifier-${randomUUID()}`,
  verifierLeaseId: `lease-verifier-${randomUUID()}`,
  workflowRunId: `workflow-openrouter-${randomUUID()}`,
  executionId: `execution-openrouter-${randomUUID()}`,
};
const config = parseConfig({
  version: 1, repository, provider: "openrouter", model: modelId,
  credential: { id: "fab-openrouter-attempt-broker-v1", owner: `local:${process.getuid?.()}`, provider: "openrouter", scope: { kind: "repository", root: repository }, source: { kind: "broker" } },
  writableFiles: ["src/price.mjs"],
  checks: [{ id: "price-test", argv: [process.execPath, "--input-type=module", "-e", "import {finalPrice} from './src/price.mjs'; if(finalPrice(10000,1500)!==8500) throw new Error('discount must reduce subtotal')"] }],
  acceptanceCriteria: ["finalPrice subtracts a whole-cent discount from a whole-cent subtotal."],
  maxTurns: 8, timeoutMs: 180000, checkTimeoutMs: 15000,
});
const broker = new OpenRouterSandboxCredentialBroker(managementKey);
const providerFailures: Array<{ status: number; detail: string }> = [];
const adapter = new FabExecutorAdapter({ config, stateDirectory, openRouterRouteBinding: route, openRouterBrokerFactory: createFabOpenRouterBrokerFactory(broker, route, fetch, failure => providerFailures.push(failure)) });
const request: ExecutorRequest = {
  executionId: ids.executionId, repositoryRoot: repository, workingDirectory: repository,
  provider: "openrouter", providerRoute: route.providerRoute, modelRouteDigest: route.routeDigest, model: modelId,
  prompt: "Fix the synthetic finalPrice function so discount is subtracted. Change only src/price.mjs, run price-test, and finish the candidate truthfully.",
  allowedPaths: ["src/price.mjs"], deniedPaths: [], timeoutMs: 180000, isolation: "WORKSPACE_WRITE",
};
const emitted: unknown[] = [];
const context: HarnessExecutionContext = { emit: event => { emitted.push(event); }, attempt: {
  projectId: "j17xq74zm135scn7m6zme1cf298dw2r8", repositoryId: "1359341480", workflowRunId: ids.workflowRunId,
  workOrderId: ids.workOrderId, workOrderRevision: 1, attemptId: ids.producerAttemptId, leaseId: ids.producerLeaseId, generation: 1,
  executionProfileId: "fab-openrouter-local-v1", executionProfileDigest: `sha256:${"1".repeat(64)}`,
  harnessDigest: `sha256:${"2".repeat(64)}`, runtimeDigest: `sha256:${"3".repeat(64)}`, modelRouteDigest: route.routeDigest,
  executorIdentity: "fab:local-qualification:1", environmentReference: "local-non-production:openrouter-qualification", sourceRevision,
  acceptanceCriteria: [{ id: "AC-OPENROUTER-1", title: config.acceptanceCriteria[0]! }], assertActive: async () => {},
} };

let result: Awaited<ReturnType<typeof runHarnessExecution>> | undefined;
let candidateRevision: string | null = null;
let verifier: Record<string, unknown> = { status: "NOT_RUN" };
try {
  result = await runHarnessExecution(adapter, request, context);
  if (result.status === "COMPLETED") {
    candidateRevision = await commitFactoryChanges({ worktree: repository, changedFiles: ["src/price.mjs"], title: "Fix synthetic discount calculation" });
    await adapter.recordCandidate(ids.executionId, { sourceRevision, candidateRevision });
    const verifierRoot = path.join(temporary, "verifier");
    git(repository, ["worktree", "add", "--detach", verifierRoot, candidateRevision]);
    const verifierStarted = Date.now();
    let passed = false; let error: string | null = null;
    try { execFileSync(process.execPath, ["--input-type=module", "-e", "import {finalPrice} from './src/price.mjs'; if(finalPrice(10000,1500)!==8500) throw new Error('discount must reduce subtotal')"], { cwd: verifierRoot, stdio: "pipe", timeout: 15000 }); passed = true; }
    catch { error = "Independent synthetic verification command failed."; }
    const verifiedHead = git(verifierRoot, ["rev-parse", "HEAD"]);
    verifier = { status: passed && verifiedHead === candidateRevision ? "PASS" : "FAIL", attemptId: ids.verifierAttemptId, leaseId: ids.verifierLeaseId,
      independentFromProducer: ids.verifierAttemptId !== ids.producerAttemptId && ids.verifierLeaseId !== ids.producerLeaseId,
      subjectRevision: candidateRevision, observedRevision: verifiedHead, latencyMs: Date.now() - verifierStarted, error };
  }
} finally {
  const requests = ((result?.normalizedResult?.events.items ?? []).filter(event => event.summary === "provider_request")
    .map(event => event.metadata?.providerRequest as Record<string, unknown>));
  const uniqueRequests = [...new Map(requests.map(receipt => [String(receipt.localRequestId), receipt])).values()];
  const health = await adapter.health();
  const record = {
    schema: "fab-openrouter-live-qualification/v1", recordedAt: new Date().toISOString(), status: result?.status === "COMPLETED" && verifier.status === "PASS" ? "PASS" : "FAIL",
    inputClassification: "PUBLIC_SYNTHETIC_FIXTURE", mode: "LOCAL_NON_PRODUCTION", ids, sourceRevision, candidateRevision,
    route: { ...route, endpoint: "https://openrouter.ai/api/v1/chat/completions", protocol: "openrouter-chat-completions/non-streaming", retries: 0, fallback: false, streaming: false },
    liability: { hardCeilingUsd, priorConservativeExposureUsd, maximumNewLiabilityUsd: route.maxCostUsd, maximumAggregateLiabilityUsd: priorConservativeExposureUsd + route.maxCostUsd },
    producer: { status: result?.status ?? "FAILED_BEFORE_RESULT", health, modelRequests: result?.normalizedResult?.events.modelRequests ?? null,
      usage: result?.normalizedResult?.usage ?? null, latencyMs: result?.normalizedResult?.timing.wallClockMs ?? null,
      returnedModels: [...new Set(uniqueRequests.map(item => item.returnedModel).filter(Boolean))], requests: uniqueRequests,
      failure: result?.status === "COMPLETED" ? null : result?.error ?? "NO_RESULT", providerFailures },
    verifier,
    readiness: { fab: result?.status === "COMPLETED" && verifier.status === "PASS" ? "READY" : "NOT_READY", rule: "AT_LEAST_ONE_QUALIFIED_PROVIDER_ROUTE",
      providers: [{ provider: "openrouter", status: result?.status === "COMPLETED" && verifier.status === "PASS" ? "ACTIVE_QUALIFIED" : "FAILED" }, { provider: "bedrock", status: "EXTERNAL_WAIT", reason: "AWS_QUOTA", readinessDependency: false }] },
    evidenceDigest: createHash("sha256").update(JSON.stringify({ ids, sourceRevision, candidateRevision, requests: uniqueRequests, verifier })).digest("hex"),
  };
  mkdirSync(evidenceDirectory, { recursive: true });
  writeFileSync(path.join(evidenceDirectory, "live-result.json"), JSON.stringify(record, null, 2) + "\n", { mode: 0o600 });
  rmSync(temporary, { recursive: true, force: true });
  console.log(JSON.stringify(record, null, 2));
  if (record.status !== "PASS") process.exitCode = 1;
}
