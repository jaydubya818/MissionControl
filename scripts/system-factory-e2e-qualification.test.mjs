import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, test } from "vitest";

const runnerPath = fileURLToPath(new URL("./system-factory-e2e-qualification.mjs", import.meta.url));
const directories = [];
const preloadSource = `
import childProcess from "node:child_process";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
const scenario = JSON.parse(process.env.QUALIFICATION_TEST_SCENARIO);
const observations = [];
const receiptPath = process.env.QUALIFICATION_TEST_RECEIPT;
const observationsPath = process.env.QUALIFICATION_TEST_OBSERVATIONS;
let step = 0;
childProcess.spawnSync = (command, args) => {
  if (command === "git" && ["merge-base", "rev-parse"].includes(args[0])) {
    if (scenario.killGit === args[0]) process.kill(process.pid, "SIGKILL");
    if (scenario.failGit === args[0]) return { status: 1, stderr: "injected Git metadata failure" };
    return { status: 0, stdout: "a".repeat(40) + "\\n", stderr: "" };
  }
  observations.push({ command, args, receipt: fs.existsSync(receiptPath) ? JSON.parse(fs.readFileSync(receiptPath, "utf8")) : null });
  fs.writeFileSync(observationsPath, JSON.stringify(observations));
  step++;
  if (step === scenario.at) {
    if (scenario.action === "kill") process.kill(process.pid, "SIGKILL");
    if (scenario.action === "throw") throw new Error("injected command failure");
    if (scenario.action === "spawn-error") return { status: null, error: new Error("injected spawn error") };
    if (scenario.action === "signal") return { status: null, signal: "SIGTERM" };
    if (scenario.action === "fail") return { status: 7 };
  }
  return { status: 0 };
};
const renameSync = fs.renameSync;
let renames = 0;
fs.renameSync = (...args) => {
  renames++;
  if (renames === scenario.failRenameAt) throw new Error("injected receipt replacement failure");
  return renameSync(...args);
};
syncBuiltinESMExports();
`;

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function runQualification(scenario = {}, previousReceipt) {
  const directory = mkdtempSync(path.join(tmpdir(), "mc-qualification-receipt-"));
  directories.push(directory);
  mkdirSync(path.join(directory, "scripts"));
  const runner = path.join(directory, "scripts", "system-factory-e2e-qualification.mjs");
  copyFileSync(runnerPath, runner);
  const preload = path.join(directory, "preload.mjs");
  writeFileSync(preload, preloadSource);
  const evidenceSlug = scenario.evidenceSlug ?? "system-factory-e2e-v2";
  const receiptPath = path.join(directory, "docs", "testing", "evidence", evidenceSlug, "automated-checks.json");
  if (previousReceipt) {
    mkdirSync(path.dirname(receiptPath), { recursive: true });
    writeFileSync(receiptPath, JSON.stringify(previousReceipt));
  }
  const observationsPath = path.join(directory, "observations.json");
  const processResult = spawnSync(process.execPath, ["--import", preload, runner], {
    cwd: directory,
    encoding: "utf8",
    timeout: 10_000,
    env: {
      MC_QUALIFICATION_EVIDENCE_SLUG: evidenceSlug,
      QUALIFICATION_TEST_SCENARIO: JSON.stringify(scenario),
      QUALIFICATION_TEST_RECEIPT: receiptPath,
      QUALIFICATION_TEST_OBSERVATIONS: observationsPath,
    },
  });
  return {
    processResult,
    receipt: existsSync(receiptPath) ? JSON.parse(readFileSync(receiptPath, "utf8")) : null,
    observations: existsSync(observationsPath) ? JSON.parse(readFileSync(observationsPath, "utf8")) : [],
  };
}

test("interruption after a successful check retains an incomplete receipt", () => {
  const { processResult, receipt, observations } = runQualification({ at: 2, action: "kill" });
  assert.equal(processResult.signal, "SIGKILL");
  assert.equal(observations.length, 2);
  assert.equal(receipt.result, "RUNNING");
  assert.equal(receipt.completedAt, null);
  assert.equal(receipt.completedChecks, 1);
  assert.ok(receipt.expectedChecks > receipt.completedChecks);
});

test("a new run replaces an old pass before its first qualification command", () => {
  const previousReceipt = { result: "PASS", startedAt: "previous-run", completedAt: "previous-completion" };
  const { processResult, receipt, observations } = runQualification({ at: 1, action: "kill" }, previousReceipt);
  assert.equal(processResult.signal, "SIGKILL");
  assert.equal(observations[0].receipt.result, "RUNNING");
  assert.equal(receipt.result, "RUNNING");
  assert.equal(receipt.completedAt, null);
  assert.equal(receipt.completedChecks, 0);
  assert.notEqual(receipt.startedAt, "previous-run");
});

for (const failGit of ["merge-base", "rev-parse"]) {
  test(`failed ${failGit} metadata lookup cannot retain a previous pass`, () => {
    const previousReceipt = { result: "PASS", startedAt: "previous-run", completedAt: "previous-completion" };
    const { processResult, receipt, observations } = runQualification({ failGit }, previousReceipt);
    assert.equal(processResult.status, 1);
    assert.equal(observations.length, 0);
    assert.equal(receipt.result, "FAIL");
    assert.ok(receipt.completedAt);
    assert.equal(receipt.startedHead, null);
    if (failGit === "merge-base") assert.equal(receipt.baseSha, null);
    assert.equal(receipt.expectedChecks, null);
    assert.equal(receipt.completedChecks, 0);
    assert.match(receipt.setupError, /injected Git metadata failure/);
  });
}

test("interruption during Git metadata lookup invalidates a previous pass", () => {
  const previousReceipt = { result: "PASS", startedAt: "previous-run", completedAt: "previous-completion" };
  const { processResult, receipt } = runQualification({ killGit: "merge-base" }, previousReceipt);
  assert.equal(processResult.signal, "SIGKILL");
  assert.equal(receipt.result, "RUNNING");
  assert.equal(receipt.completedAt, null);
  assert.equal(receipt.startedHead, null);
  assert.equal(receipt.baseSha, null);
});

test("only the complete command sequence produces a passing receipt", () => {
  const { processResult, receipt, observations } = runQualification();
  assert.equal(processResult.status, 0, processResult.stderr);
  assert.equal(receipt.schemaVersion, "system-factory-e2e-automated-checks/v3");
  assert.equal(receipt.result, "PASS");
  assert.ok(receipt.completedAt);
  assert.equal(receipt.completedChecks, receipt.expectedChecks);
  assert.equal(receipt.expectedChecks, observations.length);
  assert.equal(receipt.checks.length, observations.length);
  for (let index = 0; index < observations.length; index++) {
    const observation = observations[index];
    assert.equal(observation.receipt.result, "RUNNING");
    assert.equal(observation.receipt.completedAt, null);
    assert.equal(observation.receipt.completedChecks, index);
    assert.equal(receipt.checks[index].command, [observation.command, ...observation.args].join(" "));
    assert.equal(receipt.checks[index].status, "PASS");
  }
});

test("custom evidence directories count their extra historical gate", () => {
  const normal = runQualification();
  const custom = runQualification({ evidenceSlug: "receipt-regression" });
  assert.equal(custom.processResult.status, 0, custom.processResult.stderr);
  assert.equal(custom.receipt.result, "PASS");
  assert.equal(custom.receipt.expectedChecks, normal.receipt.expectedChecks + 1);
  assert.equal(custom.receipt.completedChecks, custom.receipt.expectedChecks);
});

for (const action of ["fail", "spawn-error", "signal", "throw"]) {
  test(`${action} stops the run and retains a terminal failure`, () => {
    const { processResult, receipt, observations } = runQualification({ at: 2, action });
    assert.equal(processResult.status, 1, processResult.stderr);
    assert.equal(observations.length, 2);
    assert.equal(receipt.result, "FAIL");
    assert.ok(receipt.completedAt);
    assert.equal(receipt.completedChecks, 2);
    assert.equal(receipt.checks[0].status, "PASS");
    assert.equal(receipt.checks[1].status, "FAIL");
    assert.equal(receipt.checks[1].exitCode, action === "fail" ? 7 : 1);
    if (action === "signal") assert.equal(receipt.checks[1].signal, "SIGTERM");
    if (action === "spawn-error") assert.equal(receipt.checks[1].error, "injected spawn error");
    if (action === "throw") assert.equal(receipt.checks[1].error, "injected command failure");
  });
}

test("failed atomic replacement preserves the previous incomplete JSON", () => {
  const { processResult, receipt } = runQualification({ failRenameAt: 3 });
  assert.equal(processResult.status, 1);
  assert.match(processResult.stderr, /injected receipt replacement failure/);
  assert.equal(receipt.result, "RUNNING");
  assert.equal(receipt.completedAt, null);
  assert.equal(receipt.completedChecks, 0);
});

test("a failed final replacement cannot publish a passing receipt", () => {
  const completedRun = runQualification();
  const { processResult, receipt } = runQualification({ failRenameAt: completedRun.receipt.expectedChecks + 3 });
  assert.equal(processResult.status, 1);
  assert.match(processResult.stderr, /injected receipt replacement failure/);
  assert.equal(receipt.result, "RUNNING");
  assert.equal(receipt.completedAt, null);
  assert.equal(receipt.completedChecks, receipt.expectedChecks);
});
