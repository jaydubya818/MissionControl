#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceSlug = process.env.MC_QUALIFICATION_EVIDENCE_SLUG ?? "system-factory-e2e-v2";
if (!/^[a-z0-9][a-z0-9-]*$/.test(evidenceSlug)) {
  throw new Error("MC_QUALIFICATION_EVIDENCE_SLUG must be a simple lowercase evidence directory name.");
}
const evidenceDirectory = path.join(repoRoot, "docs/testing/evidence", evidenceSlug);
const scenarioEvidencePath = path.join(evidenceDirectory, "scenario-evidence.json");
const automatedChecksPath = path.join(evidenceDirectory, "automated-checks.json");
const baseSha =
  process.env.MC_QUALIFICATION_BASE_SHA ??
  gitValue(["merge-base", "HEAD", "origin/main"]);
const startedHead = gitValue(["rev-parse", "HEAD"]);
const startedAt = new Date().toISOString();
const checks = [];

mkdirSync(evidenceDirectory, { recursive: true });

const steps = [
  {
    name: "frozen dependency, advisory, credential, and release configuration gates",
    command: "pnpm",
    args: ["run", "release:security"],
    env: { AUTHORIZATION_BASE_SHA: baseSha },
  },
  {
    name: "release hardening contract tests",
    command: "pnpm",
    args: [
      "exec", "vitest", "run",
      "scripts/lib/dependency-audit-gate.test.mjs",
      "scripts/lib/factory-docs-consistency.test.mjs",
      "scripts/lib/production-pilot-preflight.test.mjs",
      "scripts/lib/production-pilot-evidence.test.mjs",
      "scripts/lib/repository-secret-scan.test.mjs",
      "scripts/lib/release-config.test.mjs",
    ],
  },
  {
    name: "historical V1 evidence immutability",
    command: "git",
    args: ["diff", "--exit-code", baseSha, "--", "docs/testing/evidence/system-factory-e2e-v1"],
  },
  ...(evidenceSlug === "system-factory-e2e-v2" ? [] : [{
    name: "historical V2 evidence immutability",
    command: "git",
    args: ["diff", "--exit-code", baseSha, "--", "docs/testing/evidence/system-factory-e2e-v2"],
  }]),
  {
    name: "prepare canonical workspace packages",
    command: "pnpm",
    args: ["run", "ci:prepare"],
  },
  {
    name: "composed system qualification and execution-boundary failures",
    command: "pnpm",
    args: [
      "--filter", "@mission-control/orchestration-server", "exec", "vitest", "run",
      "src/__tests__/systemFactoryQualification.test.ts",
      "src/__tests__/factoryAttemptWorker.test.ts",
      "src/__tests__/factoryAttemptWorkerRemote.test.ts",
      "src/__tests__/factoryVerification.test.ts",
      "src/__tests__/remoteSandboxRuntime.test.ts",
      "src/__tests__/sandboxReconciler.test.ts",
      "src/__tests__/sandboxCredentials.test.ts",
      "src/__tests__/githubAppPublisher.test.ts",
      "src/__tests__/auth.test.ts",
      "src/__tests__/orchestrationSecurity.test.ts",
      "src/__tests__/harnessAdapterRegistry.test.ts",
      "src/__tests__/deepseekHarnessExecutorAdapter.test.ts",
    ],
    env: {
      MC_SYSTEM_QUALIFICATION_EVIDENCE: scenarioEvidencePath,
      MC_QUALIFICATION_BASE_SHA: baseSha,
    },
  },
  {
    name: "receipt-first Mission Control golden eval",
    command: "node",
    args: [
      "scripts/run-mission-control-eval.mjs",
      "--input", path.relative(repoRoot, scenarioEvidencePath),
      "--baseline", "evals/mission-control-golden-v1/baselines/main.json",
      "--receipt", path.relative(repoRoot, path.join(evidenceDirectory, "eval-receipt.json")),
      "--check-baseline",
    ],
  },
  {
    name: "Mission, WorkOrder, Memory, Observability, GitHub, and Learning contracts",
    command: "pnpm",
    args: [
      "exec", "vitest", "run",
      "convex/__tests__/missionPlan.test.ts",
      "convex/__tests__/missionSpec.test.ts",
      "convex/__tests__/missionSpecAuthority.test.ts",
      "convex/__tests__/missionWorkOrderContract.test.ts",
      "convex/__tests__/factoryConfiguration.test.ts",
      "convex/__tests__/factoryWorkerRuntime.test.ts",
      "convex/__tests__/executionManifest.test.ts",
      "convex/__tests__/qualityContract.test.ts",
      "convex/__tests__/workOrderGovernance.test.ts",
      "convex/__tests__/factoryRuntimeGoldenPath.test.ts",
      "convex/__tests__/codexFactoryWorkerGuardrails.test.ts",
      "convex/__tests__/executionRecovery.test.ts",
      "convex/__tests__/factoryMemory.test.ts",
      "convex/__tests__/observabilityGoldenPath.test.ts",
      "convex/__tests__/workflowObservability.test.ts",
      "convex/__tests__/factoryLearning.test.ts",
      "convex/__tests__/reviewPackage.test.ts",
      "convex/__tests__/reviewIntelligence.test.ts",
      "convex/__tests__/reviewIntelligenceAuthority.test.ts",
      "convex/__tests__/reviewIntelligenceGoldenPath.test.ts",
      "convex/__tests__/policyV2Verification.test.ts",
      "convex/__tests__/qualityGateDecision.test.ts",
      "convex/__tests__/verificationPersistence.test.ts",
      "convex/__tests__/verificationEligibilitySchemaContract.test.ts",
      "convex/__tests__/githubAppReadiness.test.ts",
      "convex/__tests__/githubCiIngest.test.ts",
    ],
  },
  {
    name: "generic harness contract and exact manifest admission",
    command: "pnpm",
    args: [
      "--filter", "@mission-control/workflow-engine", "exec", "vitest", "run",
      "src/__tests__/executorAdapter.test.ts",
      "src/__tests__/harnessContract.test.ts",
    ],
  },
  {
    name: "Verification Factory exact-current contracts",
    command: "pnpm",
    args: [
      "--filter", "@mission-control/workflow-engine", "exec", "vitest", "run",
      "src/__tests__/verificationCurrentness.test.ts",
      "src/__tests__/verificationIndependence.test.ts",
      "src/__tests__/verificationPlan.test.ts",
      "src/__tests__/verificationSubject.test.ts",
      "src/__tests__/verificationDecision.test.ts",
      "src/__tests__/verification.test.ts",
    ],
  },
  {
    name: "Factory Memory deterministic golden path",
    command: "pnpm",
    args: ["--filter", "@mission-control/memory", "test"],
  },
  {
    name: "Progressive Factory and Factory Learning UI contracts",
    command: "pnpm",
    args: [
      "--filter", "mission-control-ui", "exec", "vitest", "run",
      "src/factoryExperience/CreateFactoryMissionDialog.test.tsx",
      "src/factoryExperience/ExperienceLevelSelector.test.tsx",
      "src/factoryExperience/FactoryPhaseInspector.test.tsx",
      "src/factoryExperience/factoryLearningModel.test.ts",
      "src/factoryExperience/phaseProjection.test.ts",
      "src/factoryExperience/recipeCatalog.test.ts",
      "src/factoryExperience/useFactoryExperienceLevel.test.tsx",
      "src/controlPlane/ReviewEvidencePackage.test.tsx",
    ],
  },
  {
    name: "full repository tests",
    command: "pnpm",
    args: ["test"],
  },
  {
    name: "TypeScript and skill lint",
    command: "pnpm",
    args: ["run", "lint"],
  },
  {
    name: "runtime-contract guard",
    command: "node",
    args: ["scripts/check-runtime-contract.mjs", "--base", baseSha],
  },
  {
    name: "production build",
    command: "pnpm",
    args: ["run", "build"],
  },
  {
    name: "orchestration startup smoke",
    command: "pnpm",
    args: ["run", "smoke:orchestration-start"],
  },
  {
    name: "git whitespace integrity",
    command: "git",
    args: ["diff", "--check"],
  },
];

let failed = false;
for (const step of steps) {
  const stepStartedAt = Date.now();
  process.stdout.write(`\n=== ${step.name} ===\n`);
  const result = spawnSync(step.command, step.args, {
    cwd: repoRoot,
    env: { ...process.env, ...(step.env ?? {}) },
    stdio: "inherit",
  });
  const status = result.status ?? 1;
  checks.push({
    name: step.name,
    command: [step.command, ...step.args].join(" "),
    status: status === 0 ? "PASS" : "FAIL",
    exitCode: status,
    durationMs: Date.now() - stepStartedAt,
  });
  writeAutomatedChecks();
  if (status !== 0) {
    failed = true;
    break;
  }
}

writeAutomatedChecks();
process.exitCode = failed ? 1 : 0;

function gitValue(args) {
  const result = spawnSync("git", args, { cwd: repoRoot, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  }
  return result.stdout.trim();
}

function writeAutomatedChecks() {
  writeFileSync(automatedChecksPath, JSON.stringify({
    schemaVersion: "system-factory-e2e-automated-checks/v2",
    baseSha,
    startedHead,
    startedAt,
    completedAt: new Date().toISOString(),
    result: failed || checks.some((check) => check.status === "FAIL") ? "FAIL" : "PASS",
    checks,
  }, null, 2) + "\n");
}
