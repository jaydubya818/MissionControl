import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const baseline = JSON.parse(await readFile(new URL("../../docs/enterprise-factory/CHECKPOINT_1C_BEDROCK_BASELINE.json", import.meta.url)));
const root = await mkdtemp(join(tmpdir(), "mc-bedrock-regression-"));
try {
  const report = join(root, "vitest.json");
  let exitCode = 0;
  try { execFileSync("pnpm", ["exec", "vitest", "run", baseline.suite, "--reporter=json", `--outputFile=${report}`], { stdio: "pipe", timeout: 120000 }); }
  catch (error) { exitCode = error.status; if (exitCode !== 1) throw error; }
  const result = JSON.parse(await readFile(report, "utf8"));
  const failures = result.testResults.flatMap(file => file.assertionResults.filter(test => test.status === "failed").map(test => test.fullName)).sort();
  const changedReasons = result.testResults.flatMap(file => file.assertionResults.filter(test => test.status === "failed"
    && !test.failureMessages.some(message => message.includes(baseline.failureReason))).map(test => test.fullName));
  const introduced = failures.filter(name => !baseline.failureNames.includes(name));
  const resolved = baseline.failureNames.filter(name => !failures.includes(name));
  const digest = createHash("sha256").update(JSON.stringify(failures)).digest("hex");
  const evidence = { baselineSourceSha: baseline.sourceSha, suite: baseline.suite, total: result.numTotalTests,
    passed: result.numPassedTests, failed: result.numFailedTests, introduced, resolved, changedReasons, failureSetSha256: digest,
    suiteExitCode: exitCode, status: "BASELINE_UNCHANGED_NOT_GREEN" };
  assert.equal(result.numRuntimeErrorTestSuites ?? 0, 0, "New Bedrock suite/runtime errors are not baseline failures");
  assert.equal(result.numPendingTests, 0, "Bedrock tests must not be skipped");
  assert.equal(result.numTotalTests, baseline.total, "Bedrock test inventory changed; review the baseline");
  assert.equal(result.numFailedTests, baseline.failed, "Bedrock failure count changed; inspect the delta");
  assert.equal(result.numPassedTests, baseline.passed, "Bedrock passing count changed");
  assert.deepEqual(introduced, [], "New Bedrock failures must not be attributed to the baseline");
  assert.deepEqual(resolved, [], "Resolved baseline failures require explicit review");
  assert.deepEqual(changedReasons, [], "Bedrock failures have a new cause; do not hide it behind known names");
  assert.equal(digest, baseline.failureSetSha256, "Bedrock failure identity changed");
  if (process.env.MC_COMPATIBILITY_EVIDENCE) await writeFile(resolve(process.env.MC_COMPATIBILITY_EVIDENCE), JSON.stringify(evidence, null, 2) + "\n");
  console.log(JSON.stringify(evidence));
} finally { await rm(root, { recursive: true, force: true }); }
