import { describe, expect, it } from "vitest";
import { factoryWorkflowContractIssues, workflowRunCompatibilityProjection } from "../lib/factoryWorkflowContract";

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
