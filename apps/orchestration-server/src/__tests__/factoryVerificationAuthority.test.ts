/**
 * End-to-end adversarial fixtures for the verification trust boundary.
 *
 * These write a genuinely malicious candidate to disk and run the REAL
 * `executeIndependentVerification` against it — no mocks — so each test is a
 * demonstration that the attack is refused rather than an assertion about
 * internal structure.
 *
 * The attacks share one shape: the candidate does not attack the verifier, it
 * rewrites the definition of passing. Every one of them satisfies the
 * executable allowlist, because `pnpm` and `make` are on it.
 */

import { chmod, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { executeIndependentVerification } from "../factoryVerification.js";

const cleanup: string[] = [];
afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function candidateWorktree(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "mc-adversarial-candidate-"));
  cleanup.push(root);
  for (const [relative, content] of Object.entries(files)) {
    const target = path.join(root, relative);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content, "utf8");
    if (relative.endsWith(".sh")) await chmod(target, 0o755);
  }
  return root;
}

function specification(options: {
  executable: string;
  args: string[];
  authorityPolicy?: unknown;
}) {
  return {
    riskLevel: "MEDIUM",
    riskReasons: ["adversarial fixture"],
    requiredApprovals: [],
    acceptanceCriteria: [
      {
        id: "ac-1",
        title: "Independent check passes",
        requiredEvidence: [{ category: "TEST_RESULT", minimumCount: 1, independent: true }],
      },
    ],
    negativeConstraints: [],
    changeBudget: {
      maxFilesChanged: 20,
      maxLinesChanged: 500,
      allowedPaths: ["**"],
      deniedPaths: [],
      allowedCommandClasses: ["TEST"],
      prohibitedCommandClasses: ["DESTRUCTIVE", "PUBLISH"],
      allowDependencyChanges: true,
      allowSchemaChanges: true,
      allowMigrations: true,
      allowInfrastructureChanges: true,
    },
    verificationContract: {
      schemaVersion: 1,
      enforcementMode: "ENFORCED",
      requireHumanReview: false,
      ...(options.authorityPolicy ? { authorityPolicy: options.authorityPolicy } : {}),
      checks: [
        {
          id: "command",
          name: "Independent command",
          category: "UNIT_TEST",
          verifierId: "factory-command/v1",
          mandatory: true,
          acceptanceCriterionIds: ["ac-1"],
          evidenceCategory: "TEST_RESULT",
          command: {
            executable: options.executable,
            args: options.args,
            commandClass: "TEST",
            timeoutMs: 15_000,
          },
        },
      ],
    },
  };
}

async function verify(input: {
  repositoryRoot: string;
  specification: unknown;
  changedFiles: string[];
  deletedFiles?: string[];
  diff?: string;
}) {
  return await executeIndependentVerification({
    workflowRunId: "run-adversarial",
    workOrderId: "wo-adversarial",
    workOrderRevisionNumber: 1,
    title: "Adversarial candidate",
    specification: input.specification,
    repositoryRoot: input.repositoryRoot,
    candidate: {
      sourceRevision: "base",
      candidateRevision: "head",
      changedFiles: input.changedFiles,
      deletedFiles: input.deletedFiles ?? [],
      linesAdded: 5,
      linesDeleted: 0,
      diff: input.diff ?? "+export const a = 1;",
    },
  });
}

function authorityCheck(result: Awaited<ReturnType<typeof verify>>) {
  return result.checks.find((check) => check.verifierId === "factory-verification-authority");
}

describe("a candidate cannot certify itself", () => {
  it("refuses a candidate whose package.json redefines the test script to exit 0", async () => {
    // The canonical attack. `node -e process.exit(0)` stands in for the script
    // body a package manager would run; the point is that the COMMAND passes
    // and the verdict is still refused.
    const repositoryRoot = await candidateWorktree({
      "package.json": JSON.stringify({ name: "victim", scripts: { test: "exit 0" } }, null, 2),
      "src/feature.ts": "export const feature = true;\n",
    });
    const result = await verify({
      repositoryRoot,
      specification: specification({ executable: "node", args: ["-e", "process.exit(0)"] }),
      changedFiles: ["package.json", "src/feature.ts"],
    });

    // The command itself genuinely passed — that is the whole problem.
    expect(result.checks.find((check) => check.checkId === "command")?.status).toBe("PASS");
    // And the run is still not verified.
    expect(result.verdict).toBe("BLOCKED");
    expect(authorityCheck(result)?.status).toBe("FAIL");
    expect(result.verdictReasons.join(" ")).toMatch(/PACKAGE_MANIFEST/);
  });

  it("refuses a candidate that rewrites the Makefile target the contract runs", async () => {
    const repositoryRoot = await candidateWorktree({
      Makefile: "test:\n\t@echo PASS\n",
      "src/feature.ts": "export const feature = true;\n",
    });
    const result = await verify({
      repositoryRoot,
      specification: specification({ executable: "node", args: ["-e", "process.exit(0)"] }),
      changedFiles: ["Makefile", "src/feature.ts"],
    });
    expect(result.verdict).toBe("BLOCKED");
    expect(result.verdictReasons.join(" ")).toMatch(/BUILD_SCRIPT/);
  });

  it("refuses a candidate that deletes the tests that would have failed", async () => {
    const repositoryRoot = await candidateWorktree({ "src/feature.ts": "export const a = 1;\n" });
    const result = await verify({
      repositoryRoot,
      specification: specification({ executable: "node", args: ["-e", "process.exit(0)"] }),
      changedFiles: ["src/feature.ts"],
      deletedFiles: ["src/__tests__/feature.test.ts"],
    });
    expect(result.verdict).toBe("BLOCKED");
    expect(result.verdictReasons.join(" ")).toMatch(/TEST_SOURCE/);
  });

  it("refuses a candidate that rewrites the test runner configuration", async () => {
    const repositoryRoot = await candidateWorktree({
      "vitest.config.ts": "export default { test: { include: [] } };\n",
    });
    const result = await verify({
      repositoryRoot,
      specification: specification({ executable: "node", args: ["-e", "process.exit(0)"] }),
      changedFiles: ["vitest.config.ts"],
    });
    expect(result.verdict).toBe("BLOCKED");
    expect(result.verdictReasons.join(" ")).toMatch(/TEST_CONFIG/);
  });

  it("still verifies an honest candidate that adds a feature and its test", async () => {
    // The control has to stay usable. Adding a test alongside a feature is
    // ordinary work and must not be refused, or the control gets switched off.
    const repositoryRoot = await candidateWorktree({
      "src/feature.ts": "export const feature = true;\n",
      "src/__tests__/feature.test.ts": "// asserts feature\n",
    });
    const result = await verify({
      repositoryRoot,
      specification: specification({ executable: "node", args: ["-e", "process.exit(0)"] }),
      changedFiles: ["src/feature.ts", "src/__tests__/feature.test.ts"],
    });
    expect(result.verdict).toBe("VERIFIED");
    expect(authorityCheck(result)?.status).toBe("PASS");
  });

  it("verifies a surface change only when the frozen contract authorised it first", async () => {
    const repositoryRoot = await candidateWorktree({
      "vitest.config.ts": "export default { test: {} };\n",
    });
    const result = await verify({
      repositoryRoot,
      specification: specification({
        executable: "node",
        args: ["-e", "process.exit(0)"],
        authorityPolicy: {
          allowedSurfaceMutations: ["TEST_CONFIG"],
          reason: "This WorkOrder is the Jest-to-Vitest migration.",
        },
      }),
      changedFiles: ["vitest.config.ts"],
    });
    expect(result.verdict).toBe("VERIFIED");
    expect(authorityCheck(result)?.status).toBe("PASS");
  });
});

describe("verifier environment containment", () => {
  it("does not expose the operator HOME to a candidate-controlled command", async () => {
    // Regression: `sanitizedEnvironment()` forwarded HOME, so a candidate's
    // test script could read ~/.config/gh/hosts.yml, ~/.npmrc, ~/.ssh and
    // ~/.git-credentials and print them into the verification log. The
    // executable allowlist never sees anything but the package manager.
    const repositoryRoot = await candidateWorktree({ "src/a.ts": "export const a = 1;\n" });
    const result = await verify({
      repositoryRoot,
      specification: specification({
        executable: "node",
        args: ["-e", "console.log('HOME=' + process.env.HOME)"],
      }),
      changedFiles: ["src/a.ts"],
    });
    const output = String(
      result.checks.find((check) => check.checkId === "command")?.evidence?.[0]?.metadata?.output ?? "",
    );
    expect(output).toContain("HOME=");
    expect(output).toContain(repositoryRoot);
    expect(output).not.toContain(process.env.HOME ?? " never");
  });

  it("disables package-manager lifecycle scripts for candidate-controlled commands", async () => {
    // preinstall / postinstall / prepare are candidate-authored shell that
    // would otherwise run before any check began.
    const repositoryRoot = await candidateWorktree({ "src/a.ts": "export const a = 1;\n" });
    const result = await verify({
      repositoryRoot,
      specification: specification({
        executable: "node",
        args: ["-e", "console.log('IGNORE=' + process.env.npm_config_ignore_scripts)"],
      }),
      changedFiles: ["src/a.ts"],
    });
    const output = String(
      result.checks.find((check) => check.checkId === "command")?.evidence?.[0]?.metadata?.output ?? "",
    );
    expect(output).toContain("IGNORE=true");
  });
});
