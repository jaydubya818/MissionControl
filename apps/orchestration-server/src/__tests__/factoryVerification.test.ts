import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { WorkOrderVerificationSpec } from "@mission-control/workflow-engine/verification";
import { afterEach, describe, expect, it } from "vitest";
import {
  executeIndependentVerification,
  factoryVerificationCommandDeniedReason,
} from "../factoryVerification.js";

const cleanup: string[] = [];
afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

function specification(commandClass = "TEST", args = ["-e", "console.log('ok')"]) {
  return {
    riskLevel: "MEDIUM",
    riskReasons: ["bounded test"],
    requiredApprovals: [],
    acceptanceCriteria: [{ id: "ac-1", title: "Independent check passes", requiredEvidence: [{ category: "TEST_RESULT", minimumCount: 1, independent: true }] }],
    negativeConstraints: [],
    changeBudget: {
      maxFilesChanged: 2, maxLinesChanged: 20, allowedPaths: ["src/**"], deniedPaths: [],
      allowedCommandClasses: ["TEST"], prohibitedCommandClasses: ["DESTRUCTIVE", "PUBLISH"],
      allowDependencyChanges: false, allowSchemaChanges: false, allowMigrations: false, allowInfrastructureChanges: false,
    },
    verificationContract: { schemaVersion: 1, enforcementMode: "ENFORCED", requireHumanReview: false, checks: [{
      id: "command", name: "Independent command", category: "UNIT_TEST", verifierId: "factory-command/v1", mandatory: true,
      acceptanceCriterionIds: ["ac-1"], evidenceCategory: "TEST_RESULT",
      command: { executable: "node", args, commandClass, timeoutMs: 5_000 },
    }] },
  };
}

function verificationBudget(
  allowedCommandClasses: NonNullable<WorkOrderVerificationSpec["changeBudget"]>["allowedCommandClasses"] = ["TEST"],
): NonNullable<WorkOrderVerificationSpec["changeBudget"]> {
  return {
    maxFilesChanged: 2,
    maxLinesChanged: 20,
    allowedPaths: ["src/**"],
    deniedPaths: [],
    allowedCommandClasses,
    prohibitedCommandClasses: ["DESTRUCTIVE", "PUBLISH"],
    allowDependencyChanges: false,
    allowSchemaChanges: false,
    allowMigrations: false,
    allowInfrastructureChanges: false,
  };
}

async function execute(spec: any) {
  const repositoryRoot = await mkdtemp(path.join(tmpdir(), "mc-factory-verification-"));
  cleanup.push(repositoryRoot);
  return await executeIndependentVerification({
    workflowRunId: "run-1", workOrderId: "wo-1", workOrderRevisionNumber: 1,
    title: "Verify", specification: spec, repositoryRoot,
    candidate: { sourceRevision: "base", candidateRevision: "head", changedFiles: ["src/a.ts"], deletedFiles: [], linesAdded: 2, linesDeleted: 1, diff: "+export const a = 1;" },
  });
}

describe("Factory independent command verification", () => {
  it("produces independent evidence for an allowlisted command", async () => {
    const result = await execute(specification());
    expect(result.verdict).toBe("VERIFIED");
    expect(result.checks.find((check) => check.checkId === "command")).toMatchObject({ status: "PASS", metadata: { policyDecision: "APPROVED" } });
  });

  it("fails closed for prohibited command authority", async () => {
    const result = await execute(specification("PUBLISH"));
    expect(result.verdict).toBe("NOT_VERIFIED");
    expect(result.checks.find((check) => check.checkId === "command")).toMatchObject({ status: "FAIL", metadata: { commandDenied: true } });
  });

  it("allows only the exact frozen offline pnpm install through corepack", () => {
    const budget = verificationBudget(["DEPENDENCY_SCAN"]);

    expect(factoryVerificationCommandDeniedReason({
      executable: "corepack",
      args: ["pnpm", "install", "--frozen-lockfile", "--offline"],
      commandClass: "DEPENDENCY_SCAN",
      timeoutMs: 300_000,
    }, budget)).toBeUndefined();
  });

  it.each([
    ["different package manager", ["npm", "install", "--frozen-lockfile", "--offline"]],
    ["missing offline mode", ["pnpm", "install", "--frozen-lockfile"]],
    ["additional argument", ["pnpm", "install", "--frozen-lockfile", "--offline", "--ignore-scripts"]],
    ["different argument order", ["pnpm", "install", "--offline", "--frozen-lockfile"]],
    ["version-qualified package manager", ["pnpm@9.0.0", "install", "--frozen-lockfile", "--offline"]],
    ["arbitrary corepack command", ["enable"]],
  ])("rejects corepack with %s", (_description, args) => {
    const budget = verificationBudget(["DEPENDENCY_SCAN"]);

    expect(factoryVerificationCommandDeniedReason({
      executable: "corepack",
      args,
      commandClass: "DEPENDENCY_SCAN",
      timeoutMs: 300_000,
    }, budget)).toBe("Executable corepack is only allowed for: corepack pnpm install --frozen-lockfile --offline.");
  });

  it("keeps direct package installation denied", () => {
    const budget = verificationBudget(["DEPENDENCY_SCAN"]);

    expect(factoryVerificationCommandDeniedReason({
      executable: "pnpm",
      args: ["install", "--frozen-lockfile", "--offline"],
      commandClass: "DEPENDENCY_SCAN",
      timeoutMs: 300_000,
    }, budget)).toBe("Verification commands cannot install, publish, deploy, release, or change package state.");
  });

  it("still applies Work Order command-class policy to the corepack exception", () => {
    const budget = verificationBudget();

    expect(factoryVerificationCommandDeniedReason({
      executable: "corepack",
      args: ["pnpm", "install", "--frozen-lockfile", "--offline"],
      commandClass: "DEPENDENCY_SCAN",
      timeoutMs: 300_000,
    }, budget)).toBe("Command class DEPENDENCY_SCAN is not allowed by the WorkOrder budget.");
  });

  it("fails dependency admission before Corepack when the package manager is not pinned", async () => {
    const spec = specification("DEPENDENCY_SCAN", ["pnpm", "install", "--frozen-lockfile", "--offline"]);
    spec.changeBudget.allowedCommandClasses = ["DEPENDENCY_SCAN"];
    spec.verificationContract.checks[0].command = {
      executable: "corepack",
      args: ["pnpm", "install", "--frozen-lockfile", "--offline"],
      commandClass: "DEPENDENCY_SCAN",
      timeoutMs: 600_000,
    };

    const result = await execute(spec);

    expect(result.verdict).toBe("BLOCKED");
    expect(result.checks.find((check) => check.checkId === "command")).toMatchObject({
      status: "NOT_EVALUATED",
      metadata: {
        dependencyAdmission: true,
        failureClass: "VERIFICATION_ENVIRONMENT_FAILURE",
        reasonCode: "DEPENDENCY_PACKAGE_MANIFEST_UNAVAILABLE",
      },
    });
    expect(result.completedAt - result.startedAt).toBeLessThan(1_000);
  });

  it("terminates the owned subprocess tree and records a machine-readable timeout", async () => {
    const args = ["-e", [
      "const { spawn } = require('node:child_process')",
      "const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' })",
      "console.log(child.pid)",
      "setInterval(() => {}, 1000)",
    ].join(";")];
    const spec = specification("TEST", args);
    spec.verificationContract.checks[0].command.timeoutMs = 100;

    const result = await execute(spec);
    const check = result.checks.find((item) => item.checkId === "command")!;
    const grandchildPid = Number(check.evidence[0]?.metadata?.output);

    expect(result.verdict).toBe("BLOCKED");
    expect(check).toMatchObject({
      status: "TIMED_OUT",
      metadata: { failureClass: "VERIFICATION_FAILURE", reasonCode: "VERIFICATION_COMMAND_TIMEOUT" },
    });
    expect(Number.isSafeInteger(grandchildPid)).toBe(true);
    expect(() => process.kill(grandchildPid, 0)).toThrow();
  });
});
