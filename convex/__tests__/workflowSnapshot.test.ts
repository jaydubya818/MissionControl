import { describe, expect, it } from "vitest";
import {
  snapshotWorkflowDefinition,
  workflowDefinitionChanged,
} from "../lib/workflowSnapshot";

describe("workflow definition snapshots", () => {
  it("freezes the deterministic contract discriminator without changing legacy snapshots", () => {
    const workflow = { workflowId: "synthetic-render", name: "Synthetic", description: "Synthetic", agents: [], steps: [], active: true, version: 1 };
    expect(snapshotWorkflowDefinition({ ...workflow, contractVersion: "factory-workflow-contract/v1" })).toEqual(snapshotWorkflowDefinition(workflow));
    const deterministic = { ...workflow, contractVersion: "factory-workflow-contract/v2" };
    expect(snapshotWorkflowDefinition(deterministic).contractVersion).toBe("factory-workflow-contract/v2");
    expect(workflowDefinitionChanged(workflow, deterministic)).toBe(true);
  });
  it("captures the executable version with deterministic defaults", () => {
    const snapshot = snapshotWorkflowDefinition({
      workflowId: "loop-engineering",
      name: "Loop Engineering",
      description: "Governed research graph",
      agents: [{ id: "researcher", persona: "Primary Researcher" }],
      steps: [{
        id: "research",
        agent: "researcher",
        input: "Research {{task}}",
        expects: "findings",
        retryLimit: 1,
        timeoutMinutes: 20,
      }],
      active: true,
      version: 4,
    });

    expect(snapshot).toMatchObject({
      workflowId: "loop-engineering",
      topology: "LINEAR",
      maxConcurrency: 1,
      active: true,
      version: 4,
    });
    expect(snapshot.steps).toHaveLength(1);
  });

  it("does not copy database identity or mutable installation metadata", () => {
    const snapshot = snapshotWorkflowDefinition({
      _id: "workflow-row",
      _creationTime: 1,
      workflowId: "loop-engineering",
      name: "Loop Engineering",
      description: "Governed research graph",
      topology: "DAG",
      maxConcurrency: 3,
      agents: [],
      steps: [],
      active: true,
      version: 4,
      updatedAt: 999,
      metadata: { installer: "seed" },
    });

    expect(snapshot).not.toHaveProperty("_id");
    expect(snapshot).not.toHaveProperty("updatedAt");
    expect(snapshot).not.toHaveProperty("metadata");
  });

  it("keeps repeated workflow installation idempotent", () => {
    const existing = {
      workflowId: "loop-engineering",
      name: "Loop Engineering",
      description: "Governed research graph",
      topology: "DAG",
      maxConcurrency: 3,
      agents: [],
      steps: [],
      active: true,
      version: 4,
      updatedAt: 100,
    };

    expect(workflowDefinitionChanged(existing, {
      ...existing,
      version: undefined,
      updatedAt: undefined,
    })).toBe(false);
    expect(workflowDefinitionChanged(existing, {
      ...existing,
      maxConcurrency: 4,
    })).toBe(true);
  });
});
