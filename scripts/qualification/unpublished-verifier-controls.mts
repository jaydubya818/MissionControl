import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { COMPOSITION_SCHEMA, INVOCATION_SCHEMA, INVOCATION_RESULT_SCHEMA, ISOLATED_CONTAINER_POLICY_DIGEST, invocationDigest, type IsolatedInvocation } from "../../packages/workflow-engine/src/isolatedInvocation.js";
import { VERIFY_DOCUMENT_OPERATION_DIGEST } from "../../packages/workflow-engine/src/deterministicVerification.js";

// Component execution controls only. No Factory admission, canonical Attempt,
// independent-verification receipt, human acceptance or publication authority.
const [buildDirectory, imageFile, outputDirectory, dockerPath] = process.argv.slice(2);
if (!buildDirectory || !imageFile || !outputDirectory || !dockerPath) throw new Error("Exact build, image, new output and Docker path required.");
mkdirSync(outputDirectory);
const build = JSON.parse(readFileSync(join(buildDirectory, "build.json"), "utf8"));
const backendPath = join(buildDirectory, "backend.mjs");
const hash = (bytes: Buffer | string) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
if (hash(readFileSync(backendPath)) !== build.artifacts.backend.digest) throw new Error("Backend build bytes changed.");
const { IsolatedInvocationAdapter } = await import(pathToFileURL(backendPath).href);
const image = readFileSync(imageFile, "utf8").trim();
const composition = { schema: COMPOSITION_SCHEMA, profileClass: "isolated-offline-control/v1" as const,
  bridge: { id: "isolated-invocation", version: "1", digest: build.artifacts.bridge.digest },
  backend: { id: "docker-chroot-offline", version: "1", digest: build.artifacts.backend.digest },
  runtimeImage: image, isolationDigest: ISOLATED_CONTAINER_POLICY_DIGEST,
  invocationSchema: INVOCATION_SCHEMA, resultSchema: INVOCATION_RESULT_SCHEMA };
const content = "# Synthetic qualification\n\nSynthetic, non-customer content.\n";
for (const [scenario, expected] of [["match", "SUCCESS"], ["mutation", "WORKLOAD_FAILURE"], ["canceled", "CANCELED"], ["stale", "STALE"]] as const) {
  const sha = `sha256:${"a".repeat(64)}`;
  const request: IsolatedInvocation = { schema: INVOCATION_SCHEMA, resultSchema: INVOCATION_RESULT_SCHEMA,
    executionId: `component-${scenario}`, attemptId: `component-attempt-${scenario}`, taskId: "component-task", workOrderId: "component-work-order",
    plan: { id: "component-plan", version: 1, digest: sha }, factoryVersion: { id: "component-factory", configurationDigest: "factory-v1-12345678" },
    budgetReservationId: "component-reservation", correlationId: `component-${scenario}`, profileId: "component-profile", profileDigest: sha,
    executionManifestDigest: sha, composition, compositionDigest: invocationDigest(composition),
    lease: { leaseId: "component-lease", ownerId: "component-owner", workerId: "component-worker", sessionId: "component-session", generation: 1 },
    workload: { reference: "verify-document-bytes/v1", digest: VERIFY_DOCUMENT_OPERATION_DIGEST, input: {
      subjectDigest: sha, verificationPlanDigest: sha, repositoryId: "component-repository", workOrderId: "component-work-order",
      workOrderRevisionNumber: 1, producerAttemptId: "component-producer", candidateSha: "b".repeat(40), candidateTreeSha: "c".repeat(40),
      path: "docs/synthetic.md", expectedContentSha256: hash(content), candidateContent: content + (scenario === "mutation" ? "Mutation\n" : ""),
    } }, capabilities: ["verify-document-bytes"], limits: { timeoutMs: 20000, budgetReference: "offline-zero-provider-calls/v1" },
    transmission: "NONE", modelRoute: "NONE" };
  const controller = new AbortController();
  const adapter = new IsolatedInvocationAdapter(composition, async (_: unknown, phase: string) => !(scenario === "stale" && phase === "RESULT"), dockerPath);
  const handle = await adapter.execute(await adapter.prepare({ executionId: request.executionId, repositoryRoot: "/workspace", workingDirectory: "/workspace",
    prompt: JSON.stringify(request), allowedPaths: [], timeoutMs: request.limits.timeoutMs, isolation: "READ_ONLY" }, {
    signal: controller.signal, emit: async () => { if (scenario === "canceled") controller.abort(); },
  }));
  const result = await adapter.collectResult(handle);
  let cleanupVerified = true;
  try { await adapter.cleanup(handle); } catch { cleanupVerified = false; }
  const observed = JSON.parse(result.output);
  const passed = observed.status === expected && cleanupVerified && observed.behavioralPass === false && observed.providerCalls === 0;
  writeFileSync(join(outputDirectory, `${scenario}.json`), JSON.stringify({ scenario, expected, passed, request, result, cleanupVerified,
    classification: "COMPONENT_CONTROL", canonicalAttempt: false, profileAdmission: false, acceptanceAuthority: "NONE" }, null, 2) + "\n");
  console.log(JSON.stringify({ scenario, expected, observed: observed.status, cleanupVerified, passed }));
  if (!passed) process.exitCode = 1;
}
