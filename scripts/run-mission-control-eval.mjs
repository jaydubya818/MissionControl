#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import {
  MISSION_CONTROL_GOLDEN_SUITE_V1,
  buildEvalBaseline,
  canonicalDigest,
  evaluateSuiteRun,
  evalSuiteDigest,
  runSuiteNegativeControls,
  sha256Hex,
  validateEvalBaseline,
  validateEvalReceipt,
} from "@mission-control/shared";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultEvidence = "docs/testing/evidence/system-factory-e2e-v2/scenario-evidence.json";
const defaultBaseline = "evals/mission-control-golden-v1/baselines/main.json";
const options = parseArgs(process.argv.slice(2));
const inputRelativePath = options.input ?? defaultEvidence;
const inputPath = resolveInsideRepo(inputRelativePath);
const inputBytes = readFileSync(inputPath, "utf8");
const actual = JSON.parse(inputBytes);
const suite = MISSION_CONTROL_GOLDEN_SUITE_V1;
const suiteDigest = evalSuiteDigest(suite);
const startedAt = new Date().toISOString();
const revision = gitValue(["rev-parse", "HEAD"]);
const baseRevision = gitValue(["merge-base", "HEAD", "origin/main"], false);
const artifactDigest = `sha256:${sha256Hex(inputBytes)}`;
const runId = options.runId ?? `mission-control-golden:${revision.slice(0, 12)}:${Date.now()}`;
const provenance = {
  repository: "jaydubya818/MissionControl",
  revision,
  ...(baseRevision ? { baseRevision } : {}),
  adapter: {
    id: "system-factory-scenario-evidence",
    version: "1.0.0",
    digest: canonicalDigest("mission-control/eval-adapter", {
      id: "system-factory-scenario-evidence",
      version: "1.0.0",
    }),
  },
  runtime: { name: "node", version: process.versions.node },
  datasetDigest: suiteDigest,
  resolvedConfigDigest: canonicalDigest("mission-control/eval-config", {
    suiteDigest,
    evidencePath: inputRelativePath,
    seed: "mission-control-golden-v1",
  }),
  seed: "mission-control-golden-v1",
  artifacts: [{ path: inputRelativePath, digest: artifactDigest }],
};

let baseline;
const baselinePath = resolveInsideRepo(options.baseline ?? defaultBaseline);
if (!options.createBaseline) {
  try {
    baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
    const findings = validateEvalBaseline(baseline);
    if (findings.length > 0) throw new Error(`Invalid baseline: ${findings.join(" ")}`);
  } catch (error) {
    if (options.checkBaseline) throw error;
    if (/** @type {NodeJS.ErrnoException} */ (error).code !== "ENOENT") throw error;
  }
}

const outcomes = suite.cases.map((testCase) => ({
  caseKey: testCase.key,
  status: "SCORED",
  actual,
  evidenceRefs: [inputRelativePath],
  ...(testCase.key === "economics-attribution" ? {
    durationMs: finiteNonNegative(actual?.performance?.durationMs),
    costUsd: finiteNonNegative(actual?.performance?.costUsd),
  } : {}),
}));
const negativeControls = runSuiteNegativeControls(suite, actual);
const receipt = evaluateSuiteRun({
  suite,
  baseline,
  runId,
  idempotencyKey: options.idempotencyKey ?? `${revision}:${artifactDigest}:${suiteDigest}`,
  runStatus: "COMPLETED",
  provenance,
  outcomes,
  startedAt,
  finishedAt: new Date().toISOString(),
});
const receiptFindings = validateEvalReceipt(receipt);
const receiptSchema = JSON.parse(readFileSync(path.join(repoRoot, "evals/schemas/eval-receipt.schema.json"), "utf8"));
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const schemaValid = ajv.validate(receiptSchema, receipt);
const schemaErrors = schemaValid ? [] : (ajv.errors ?? []).map((error) => `${error.instancePath || "/"} ${error.message}`);

if (options.receipt) {
  writeFileSync(path.resolve(repoRoot, options.receipt), `${JSON.stringify(receipt, null, 2)}\n`);
}
if (options.createBaseline) {
  const created = buildEvalBaseline({
    baselineId: options.baselineId ?? "mission-control-golden-v1-main",
    suite,
    receipt,
    createdAt: options.baselineCreatedAt ?? startedAt,
  });
  writeFileSync(path.resolve(repoRoot, options.createBaseline), `${JSON.stringify(created, null, 2)}\n`);
}

const failedControls = negativeControls.filter((control) => !control.passed);
const summary = {
  runId: receipt.runId,
  verdict: receipt.verdict,
  publishable: receipt.publishable,
  blocking: `${receipt.metrics.blockingPassed}/${receipt.metrics.blockingCases}`,
  advisory: `${receipt.metrics.advisoryPassed}/${receipt.metrics.advisoryCases}`,
  regressions: receipt.regressions.length,
  negativeControls: `${negativeControls.length - failedControls.length}/${negativeControls.length}`,
  accountingErrors: receipt.accountingErrors,
  validationErrors: receiptFindings,
  schemaErrors,
  receiptDigest: receipt.receiptDigest,
};
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);

if (failedControls.length > 0) {
  process.stderr.write(`Negative controls failed: ${failedControls.map((control) => control.caseKey).join(", ")}\n`);
  process.exitCode = 1;
} else if (receiptFindings.length > 0 || schemaErrors.length > 0 || receipt.verdict === "INVALID" || receipt.verdict === "FAIL") {
  process.exitCode = 1;
}

function parseArgs(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--check-baseline") {
      parsed.checkBaseline = true;
      continue;
    }
    const key = argument.startsWith("--") ? argument.slice(2) : "";
    if (!["input", "baseline", "receipt", "create-baseline", "baseline-id", "baseline-created-at", "run-id", "idempotency-key"].includes(key)) {
      throw new Error(`Unknown argument: ${argument}`);
    }
    const value = args[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${argument} requires a value.`);
    parsed[toCamelCase(key)] = value;
    index += 1;
  }
  return parsed;
}

function toCamelCase(value) {
  return value.replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
}

function resolveInsideRepo(relativePath) {
  const resolved = path.resolve(repoRoot, relativePath);
  if (resolved !== repoRoot && !resolved.startsWith(`${repoRoot}${path.sep}`)) {
    throw new Error(`Path must stay inside the repository: ${relativePath}`);
  }
  return resolved;
}

function gitValue(args, required = true) {
  const result = spawnSync("git", args, { cwd: repoRoot, encoding: "utf8" });
  if (result.status !== 0) {
    if (!required) return undefined;
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  }
  return result.stdout.trim();
}

function finiteNonNegative(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}
