import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  generationPrompt,
  researchPrompt,
  validateCandidateOutput,
  validateResearchOutput,
} from "../missionPlanningContract.js";
import {
  BUILT_IN_MISSION_PLANNER_CONFIG_DIGEST,
  BUILT_IN_MISSION_PLANNER_IDENTITY,
  canonicalHash,
} from "@mission-control/shared";

const cleanup: string[] = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function repositoryFixture() {
  const root = await mkdtemp(path.join(tmpdir(), "mc-planning-contract-"));
  cleanup.push(root);
  await mkdir(path.join(root, "apps", "ui"), { recursive: true });
  await writeFile(path.join(root, "apps", "ui", "Plan.tsx"), [
    "export function Plan() {",
    "  return <main>Governed plan</main>;",
    "}",
    ...Array.from({ length: 30 }, (_, index) => `// evidence line ${index + 1}`),
    "",
  ].join("\n"));
  return root;
}

function inputSnapshot() {
  return {
    mission: { missionId: "mission-1", title: "Plan safely", objective: "Produce a reviewed Plan" },
    repository: {
      repositoryId: "repository-1",
      repository: "sellerfi/mission-control",
      defaultBranch: "main",
      planningRepositorySha: "a".repeat(40),
    },
    workflows: [{ workflowId: "implementation", version: 1, name: "Implementation" }],
  };
}

function researchOutput(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    schema: "repository-research-packet/v1",
    files: [{ path: "apps/ui/Plan.tsx", reason: "Existing planning surface" }],
    citations: [{ id: "citation-1", path: "apps/ui/Plan.tsx", startLine: 1, endLine: 3 }],
    findings: [{ id: "finding-1", title: "Planning surface exists", detail: "The Mission Plan UI is repository-local.", citationIds: ["citation-1"] }],
    unknowns: [{ question: "Is the feature enabled in production?", impact: "Deployment evidence is outside this exact checkout." }],
    ...overrides,
  });
}

function candidateOutput(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    schema: "mission-plan-candidate/v1",
    summary: "Add the governed planning path and preserve human approval.",
    rollbackApproach: "Revert the candidate pull request and retain the prior approved Plan.",
    estimatedCostUsd: 4,
    workOrderBlueprints: [{
      id: "implement-planning",
      title: "Implement governed planning",
      desiredOutcome: "A validated candidate reaches the existing Plan editor.",
      workflowId: "implementation",
      workflowVersion: 1,
      sequence: 1,
      role: "WORKER",
      isMutating: true,
      priority: 2,
      riskLevel: "HIGH",
      modelComplexity: "STANDARD",
      branchStrategy: "isolated-worktree",
      constraints: ["Preserve human approval"],
      requiredApprovals: ["HUMAN_REVIEW"],
      estimatedCostUsd: 4,
      implementationPolicy: {
        allowedCommands: ["pnpm typecheck", "pnpm test"],
        independentVerification: {
          executable: "pnpm",
          args: ["test"],
          category: "UNIT_TEST",
          commandClass: "TEST",
          evidenceCategory: "TEST_RESULT",
          timeoutMs: 60_000,
        },
        maxFilesChanged: 20,
        maxLinesChanged: 2_000,
        maxCostUsd: 4,
        maxAttempts: 2,
        timeoutMinutes: 30,
        stopCondition: "Stop after deterministic checks pass and evidence is persisted.",
      },
      dependsOnBlueprintIds: [],
      assertionIds: ["planning-candidate-visible"],
    }],
    assertions: [{
      assertionId: "planning-candidate-visible",
      title: "Candidate is reviewable",
      outcome: "The existing Plan editor displays the validated candidate.",
      verificationMethod: "BROWSER",
      passCondition: "An operator can inspect and edit the candidate before saving.",
      requiredEvidence: "Browser result and persisted planning provenance",
      requiresIndependentValidation: true,
      waiverAllowed: false,
      sourceRequirementIds: [],
      sourceAcceptanceExpectationIds: [],
      sourceVerificationExpectationIds: [],
    }],
    ...overrides,
  });
}

describe("Mission Planning Agent contracts", () => {
  it("creates an exact-SHA research packet with server-read citation excerpts", async () => {
    const worktree = await repositoryFixture();
    const packet = await validateResearchOutput({
      output: researchOutput(),
      worktree,
      repository: "sellerfi/mission-control",
      sha: "a".repeat(40),
    });

    expect(packet).toMatchObject({
      schema: "repository-research-packet/v1",
      repository: "sellerfi/mission-control",
      sha: "a".repeat(40),
      citations: [{ id: "citation-1", excerpt: expect.stringContaining("Governed plan") }],
    });
    expect(packet.digest).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("rejects path traversal, symlink escape, malformed JSON, and invented citations", async () => {
    const worktree = await repositoryFixture();
    const escaped = await mkdtemp(path.join(tmpdir(), "mc-planning-escaped-"));
    cleanup.push(escaped);
    await writeFile(path.join(escaped, "secret.txt"), "secret\n");
    await symlink(path.join(escaped, "secret.txt"), path.join(worktree, "apps", "ui", "escape.txt"));

    await expect(validateResearchOutput({ output: "not-json", worktree, repository: "repo", sha: "a".repeat(40) }))
      .rejects.toThrow(/not valid JSON/);
    await expect(validateResearchOutput({
      output: researchOutput({ files: [{ path: "../secret.txt", reason: "escape" }], citations: [{ id: "c", path: "../secret.txt", startLine: 1, endLine: 1 }] }),
      worktree,
      repository: "repo",
      sha: "a".repeat(40),
    })).rejects.toThrow(/relative|escapes/);
    await expect(validateResearchOutput({
      output: researchOutput({ files: [{ path: "apps/ui/escape.txt", reason: "escape" }], citations: [{ id: "c", path: "apps/ui/escape.txt", startLine: 1, endLine: 1 }] }),
      worktree,
      repository: "repo",
      sha: "a".repeat(40),
    })).rejects.toThrow(/outside the exact checkout/);
    await expect(validateResearchOutput({
      output: researchOutput({ citations: [{ id: "citation-1", path: "apps/ui/Plan.tsx", startLine: 99, endLine: 99 }] }),
      worktree,
      repository: "repo",
      sha: "a".repeat(40),
    })).rejects.toThrow(/outside apps\/ui\/Plan.tsx/);
  });

  it("accepts a focused exact range longer than the former hidden span cap", async () => {
    const worktree = await repositoryFixture();
    const packet = await validateResearchOutput({
      output: researchOutput({ citations: [{ id: "citation-1", path: "apps/ui/Plan.tsx", startLine: 1, endLine: 25 }] }),
      worktree,
      repository: "repo",
      sha: "a".repeat(40),
    });

    expect(packet.citations[0]).toMatchObject({ startLine: 1, endLine: 25 });
  });

  it("validates a candidate against exact frozen workflow versions and immutable repository identity", () => {
    const result = validateCandidateOutput({ output: candidateOutput(), inputSnapshot: inputSnapshot() });
    expect(result.candidatePlan).toMatchObject({
      repository: "sellerfi/mission-control",
      repositoryBranch: "main",
      workOrderBlueprints: [{ workflowId: "implementation", workflowVersion: 1 }],
    });
    expect(result.candidateDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("fails closed on hallucinated workflows and structurally invalid candidate output", () => {
    const hallucinated = JSON.parse(candidateOutput());
    hallucinated.workOrderBlueprints[0].workflowId = "invented-workflow";
    expect(() => validateCandidateOutput({ output: JSON.stringify(hallucinated), inputSnapshot: inputSnapshot() }))
      .toThrow(/unavailable workflow version/);
    expect(() => validateCandidateOutput({ output: candidateOutput({ assertions: [] }), inputSnapshot: inputSnapshot() }))
      .toThrow(/Plan assertions/);
  });

  it("digests the JSON-safe candidate that crosses the worker boundary", () => {
    const output = JSON.parse(candidateOutput());
    output.estimatedCostUsd = null;
    output.workOrderBlueprints[0].modelComplexity = null;
    output.workOrderBlueprints[0].implementationPolicy.maxCostUsd = null;
    const result = validateCandidateOutput({ output: JSON.stringify(output), inputSnapshot: inputSnapshot() });
    const transported = JSON.parse(JSON.stringify(result.candidatePlan));

    expect(result.candidatePlan).toEqual(transported);
    expect(result.candidateDigest).toBe(`sha256:${canonicalHash(transported)}`);
  });

  it("explicitly excludes network, writes, Git mutation, and governance authority from both phases", () => {
    const research = researchPrompt(inputSnapshot());
    const generation = generationPrompt(inputSnapshot(), {
      schema: "repository-research-packet/v1",
      repository: "repo",
      sha: "a".repeat(40),
      files: [], citations: [], findings: [], unknowns: [], digest: `sha256:${"b".repeat(64)}`,
    });
    for (const prompt of [research, generation]) {
      expect(prompt).toContain("network");
      expect(prompt).toContain("file writes");
      expect(prompt).toContain("Git mutation");
    }
    expect(research).toContain("both endpoints must exist in the cited file");
    expect(generation).toContain("Never grant the planner submission, approval, execution, verification, publication, merge, or acceptance authority.");
  });

  it("names the built-in prompt implementation that actually executes", () => {
    expect(BUILT_IN_MISSION_PLANNER_IDENTITY).toEqual({
      kind: "BUILT_IN",
      plannerId: "mission-planner",
      version: "v1",
      displayName: "Mission Planner",
      researchPromptVersion: "mission-planner-research/v1",
      generationPromptVersion: "mission-planner-generation/v1",
    });
    expect(BUILT_IN_MISSION_PLANNER_CONFIG_DIGEST).toMatch(/^sha256:[a-f0-9]{64}$/);
  });
});
