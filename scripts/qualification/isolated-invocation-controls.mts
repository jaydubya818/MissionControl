import { mkdirSync, writeFileSync } from "node:fs";
import { loadIsolatedInvocationBackend } from "../../apps/orchestration-server/src/loadIsolatedInvocationBackend.js";
import { ISOLATED_INVOCATION_EFFECTIVE_CONFIG, ISOLATED_INVOCATION_RUNTIME_ARTIFACT } from "../../packages/workflow-engine/src/harnessManifests.js";
import { COMPOSITION_SCHEMA, INVOCATION_SCHEMA, INVOCATION_RESULT_SCHEMA, ISOLATED_CONTAINER_POLICY_DIGEST, invocationDigest, type IsolatedInvocation } from "../../packages/workflow-engine/src/isolatedInvocation.js";
import { RENDER_MARKDOWN_OPERATION_DIGEST } from "../../packages/workflow-engine/src/deterministicWorkload.js";

const [bundlePath, output, dockerPath] = process.argv.slice(2);
if (!bundlePath || !output || !dockerPath) throw new Error("Required: exact backend bundle, new evidence directory, Docker executable");
mkdirSync(output);
const Adapter = await loadIsolatedInvocationBackend(bundlePath);
const records: unknown[] = [];
for (const [scenario, expected] of [["success", "SUCCESS"], ["stale-result", "STALE"], ["cancel", "CANCELED"], ["timeout", "TIMED_OUT"]] as const) {
  const sha = `sha256:${"a".repeat(64)}`;
  const composition = { schema: COMPOSITION_SCHEMA, profileClass: "isolated-offline-control/v1" as const,
    bridge: { id: "isolated-invocation", version: "1", digest: ISOLATED_INVOCATION_EFFECTIVE_CONFIG.bridgeImplementationDigest },
    backend: { id: "docker-chroot-offline", version: "1", digest: ISOLATED_INVOCATION_EFFECTIVE_CONFIG.backendImplementationDigest },
    runtimeImage: ISOLATED_INVOCATION_RUNTIME_ARTIFACT.imageDigest!, isolationDigest: ISOLATED_CONTAINER_POLICY_DIGEST,
    invocationSchema: INVOCATION_SCHEMA, resultSchema: INVOCATION_RESULT_SCHEMA };
  const request: IsolatedInvocation = { schema: INVOCATION_SCHEMA, resultSchema: INVOCATION_RESULT_SCHEMA,
    executionId: `control-execution-${scenario}`, attemptId: `control-attempt-${scenario}`, taskId: "control-task", workOrderId: "control-workorder",
    plan: { id: "control-plan", version: 1, digest: sha }, factoryVersion: { id: "control-factory", configurationDigest: "factory-v1-12345678" },
    budgetReservationId: "control-reservation", correlationId: `control-correlation-${scenario}`, profileId: "control-profile",
    profileDigest: sha, executionManifestDigest: sha, composition, compositionDigest: invocationDigest(composition),
    lease: { leaseId: "control-lease", ownerId: "control-owner", workerId: "control-worker", sessionId: "control-session", generation: 1 },
    workload: { reference: "render-markdown/v1", digest: RENDER_MARKDOWN_OPERATION_DIGEST,
      input: { title: "Synthetic qualification", paragraphs: ["This is synthetic, non-customer content."], outputPath: "docs/control.md" } },
    capabilities: ["render-markdown"], limits: { timeoutMs: scenario === "timeout" ? 1000 : 20_000, budgetReference: "offline-zero-provider-calls/v1" },
    transmission: "NONE", modelRoute: "NONE" };
  const controller = new AbortController();
  const checks: string[] = [];
  const adapter = new Adapter(composition, async (_request, phase) => { checks.push(phase); return !(scenario === "stale-result" && phase === "RESULT"); }, dockerPath);
  const handle = await adapter.execute(await adapter.prepare({ executionId: request.executionId, repositoryRoot: "/workspace", workingDirectory: "/workspace",
    prompt: JSON.stringify(request), allowedPaths: [], timeoutMs: request.limits.timeoutMs, isolation: "WORKSPACE_WRITE" }, {
    signal: controller.signal, emit: async () => {
      if (scenario === "cancel") controller.abort();
      if (scenario === "timeout") await new Promise<void>(() => {});
    },
  }));
  const result = await adapter.collectResult(handle);
  let cleanup = "VERIFIED";
  try { await adapter.cleanup(handle); } catch { cleanup = "UNVERIFIED"; }
  const receipt = JSON.parse(result.output!);
  const record = { scenario, expected, request, checks, result, cleanup,
    evidenceOrigin: "CONTROL_FIXTURE", canonicalAttempt: false, profileAdmission: false, behavioralPass: false,
    passed: receipt.status === expected && cleanup === "VERIFIED"
      && (scenario !== "success" || receipt.candidateFiles.length === 1)
      && (!["success", "stale-result"].includes(scenario) || result.invocationEvidence.validatedRuntimeResult?.status === "SUCCESS")
      && result.invocationEvidence.authority === "NONE" };
  records.push(record);
  writeFileSync(`${output}/${scenario}.json`, JSON.stringify(record, null, 2) + "\n");
  console.log(JSON.stringify({ scenario, status: receipt.status, cleanup, passed: record.passed }));
  if (!record.passed) process.exitCode = 1;
}
writeFileSync(`${output}/summary.json`, JSON.stringify(records, null, 2) + "\n");
