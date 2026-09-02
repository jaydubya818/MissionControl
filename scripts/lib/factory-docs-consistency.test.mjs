import { afterEach, describe, expect, it } from "vitest";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkFactoryDocs } from "./factory-docs-consistency.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("factory documentation consistency", () => {
  it("accepts the current repository documentation", () => {
    expect(checkFactoryDocs({ repositoryRoot })).toEqual({ ok: true, findings: [] });
  });

  it("rejects runtime-version and maturity-plan drift", () => {
    const fixtureRoot = copyDocumentationFixture();
    const readmePath = path.join(fixtureRoot, "README.md");
    writeFileSync(readmePath, readFileSync(readmePath, "utf8").replace("runtime contract: **v36**", "runtime contract: **v35**"));

    const planPath = path.join(fixtureRoot, "docs/plans/2026-08-17-feat-autonomous-execution-routing-v1-plan.md");
    writeFileSync(planPath, readFileSync(planPath, "utf8").replace("status: complete", "status: active"));

    const result = checkFactoryDocs({ repositoryRoot: fixtureRoot });
    expect(result.ok).toBe(false);
    expect(result.findings).toContain("README.md: runtime contract v35 does not match source v36");
    expect(result.findings.some((finding) => finding.includes("qualified capability points to plan status active"))).toBe(true);
  });
});

function copyDocumentationFixture() {
  const fixtureRoot = mkdtempSync(path.join(os.tmpdir(), "mission-control-factory-docs-"));
  temporaryRoots.push(fixtureRoot);
  for (const relativePath of [
    "README.md",
    "docs/OVERVIEW.md",
    "convex/lib/runtimeContract.ts",
    "docs/product",
    "docs/software-factory",
    "docs/MISSION_CONTROL_RUNBOOK.md",
    "docs/runbook/RUNBOOK.md",
    "docs/mission-control-existing-system-assessment.md",
    "docs/plans/software-factory-capability-map.md",
    "docs/plans/2026-08-15-feat-observability-traces-evals-v1-plan.md",
    "docs/plans/2026-08-16-feat-generic-harness-contract-v1-plan.md",
    "docs/plans/2026-08-16-feat-factory-learning-continuous-improvement-v1-plan.md",
    "docs/plans/2026-08-17-feat-autonomous-execution-routing-v1-plan.md",
    "docs/plans/2026-08-25-feat-software-factory-production-convergence-plan.md",
    "docs/testing/evidence",
    "packages/workflow-engine/src/harnessManifests.ts",
  ]) {
    cpSync(path.join(repositoryRoot, relativePath), path.join(fixtureRoot, relativePath), { recursive: true });
  }
  return fixtureRoot;
}
