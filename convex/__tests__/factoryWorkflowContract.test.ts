import { describe, expect, it } from "vitest";
import { deterministicWorkflowOperation, factoryWorkflowContractIssues, workflowRunCompatibilityProjection } from "../lib/factoryWorkflowContract";
import { RENDER_MARKDOWN_OPERATION_DIGEST } from "@mission-control/workflow-engine/harness-contract";

function deterministicWorkflow() {
  return {
    contractVersion: "factory-workflow-contract/v2", active: true, agents: [], topology: "LINEAR", maxConcurrency: 1,
    steps: [{ id: "render", kind: "DETERMINISTIC", agent: "", retryLimit: 0, timeoutMinutes: 1,
      input: JSON.stringify({ reference: "render-markdown/v1", digest: RENDER_MARKDOWN_OPERATION_DIGEST,
        input: { title: "Synthetic document", paragraphs: ["Synthetic qualification content."], outputPath: "docs/synthetic.md" } }),
      outputSchema: { type: "object", required: ["status"], properties: { status: { type: "string" } } },
    }],
  };
}

describe("deterministic Factory workflow boundary", () => {
  it("admits only a registered bounded operation without inference authority", () => {
    const workflow = deterministicWorkflow();
    expect(factoryWorkflowContractIssues(workflow)).toEqual([]);
    expect(deterministicWorkflowOperation(workflow).reference).toBe("render-markdown/v1");
  });
  it.each([
    ["legacy version", { contractVersion: "factory-workflow-contract/v1" }],
    ["unknown version", { contractVersion: "factory-workflow-contract/v999" }],
    ["inference agent", { agents: [{ id: "model" }] }],
    ["concurrent execution", { maxConcurrency: 2 }],
    ["DAG", { topology: "DAG" }],
    ["retry engine", { convergence: { maxIterations: 2 } }],
    ["multiple operations", { steps: [...deterministicWorkflow().steps, ...deterministicWorkflow().steps] }],
  ])("rejects %s", (_label, changed) => {
    expect(factoryWorkflowContractIssues({ ...deterministicWorkflow(), ...changed })).not.toEqual([]);
  });
  it.each([
    { agent: "model" }, { kind: "AGENT" }, { retryLimit: 1 }, { timeoutMinutes: 2 },
    { timeoutMinutes: 0 }, { timeoutMinutes: Infinity }, { dependsOn: ["other"] },
    { modelTier: "FAST" }, { condition: "true" }, { failurePolicy: "CONTINUE" },
    { isolation: "READ_ONLY" }, { command: "echo synthetic" }, { input: "not json" },
    { id: "../../path" }, { outputSchema: {} },
  ])("rejects step authority expansion %j", changed => {
    const workflow = deterministicWorkflow();
    expect(factoryWorkflowContractIssues({ ...workflow, steps: [{ ...workflow.steps[0], ...changed }] })).not.toEqual([]);
  });
  it("rejects changed operation digest and undeclared workload fields", () => {
    for (const changed of [{ digest: `sha256:${"0".repeat(64)}` }, { provider: "fake-provider" }]) {
      const workflow = deterministicWorkflow();
      workflow.steps[0].input = JSON.stringify({ ...JSON.parse(workflow.steps[0].input), ...changed });
      expect(factoryWorkflowContractIssues(workflow)).not.toEqual([]);
    }
  });
});

describe("Factory workflow contract", () => {
  it("accepts schema-validated execution with a human gate", () => {
    expect(factoryWorkflowContractIssues({
      active: true,
      steps: [
        { id: "implement", expects: "summary", outputSchema: { type: "object", required: ["status", "summary"], properties: { status: { type: "string" } } } },
        { id: "approval", kind: "GATE", expects: "APPROVED", input: "Wait for the recorded human decision" },
      ],
    })).toEqual([]);
  });

  it("rejects heuristic completion and provider authority", () => {
    expect(factoryWorkflowContractIssues({
      active: true,
      steps: [{ id: "pr", expects: "STATUS: done", input: "Use gh pr create" }],
    })).toEqual([
      "pr:heuristic-completion",
      "pr:structured-status-required",
      "pr:provider-authority-forbidden",
    ]);
  });

  it("preserves honest compatibility lineage without inventing terminal status", () => {
    const currentWorkflow = {
      active: true,
      steps: [{ id: "implement", outputSchema: { type: "object", required: ["status"], properties: { status: { type: "string" } } } }],
    };
    expect(workflowRunCompatibilityProjection({
      status: "FAILED",
      workflowId: "legacy",
      steps: [{ status: "BLOCKED" }],
    }, currentWorkflow)).toMatchObject({
      classification: "LEGACY_BUT_VALID",
      normalized: { status: "FAILED", lineage: "PRESERVED_SOURCE" },
      executionEligible: false,
    });
    expect(workflowRunCompatibilityProjection({
      status: "COMPLETED",
      workflowId: "unsafe",
      workflowVersion: 1,
      workflowSnapshot: { active: true, steps: [{ id: "implement" }] },
      steps: [{ status: "PENDING" }],
    }, currentWorkflow)).toMatchObject({
      classification: "GENUINELY_INVALID",
      normalized: { status: null, lineage: "UNRESOLVED" },
    });
    expect(workflowRunCompatibilityProjection({
      status: "FAILED",
      workflowId: "stale",
      workflowVersion: 1,
      workflowSnapshot: { active: true, steps: [{ id: "implement" }] },
      steps: [{ status: "BLOCKED" }],
    }, currentWorkflow)).toMatchObject({
      classification: "STALE_SCHEMA",
      normalized: { status: "FAILED", lineage: "PRESERVED_SOURCE" },
    });
  });
});
