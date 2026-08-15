/**
 * Workflow Loader Tests
 */

import { describe, it, expect } from "vitest";
import { loadWorkflow, validateWorkflow } from "../loader.js";

describe("validateWorkflow", () => {
  it("loads the bounded continuous-research evidence workflow", () => {
    const workflow = loadWorkflow("../../workflows/continuous-research.yaml");

    expect(workflow.id).toBe("continuous-research");
    expect(workflow.topology).toBe("LINEAR");
    expect(workflow.maxConcurrency).toBe(1);
    expect(workflow.agents.map((agent) => agent.id)).toEqual([
      "claim-extractor",
      "claim-verifier",
    ]);
    expect(workflow.steps.map((step) => ({
      id: step.id,
      kind: step.kind,
      isolation: step.isolation,
    }))).toEqual([
      { id: "extractClaims", kind: "AGENT", isolation: "READ_ONLY" },
      { id: "verifyClaims", kind: "VERIFY", isolation: "READ_ONLY" },
    ]);
    expect(validateWorkflow(workflow)).toEqual([]);
  });

  it("keeps repository-changing feature steps in isolated worktrees", () => {
    const workflow = loadWorkflow("../../workflows/feature-dev.yaml");
    const isolation = Object.fromEntries(workflow.steps.map((step) => [step.id, step.isolation]));
    expect(isolation).toMatchObject({
      plan: "READ_ONLY",
      setup: "WORKTREE",
      implement: "WORKTREE",
      verify: "READ_ONLY",
      test: "WORKTREE",
      pr: "WORKTREE",
      review: "READ_ONLY",
    });
  });
  it("should validate a correct workflow", () => {
    const workflow = {
      id: "test-workflow",
      name: "Test Workflow",
      description: "A test workflow",
      agents: [
        { id: "agent1", persona: "Coder" },
      ],
      steps: [
        {
          id: "step1",
          agent: "agent1",
          input: "Do something",
          expects: "result",
          outputSchema: {
            type: "object",
            required: ["status", "result"],
            properties: { status: { type: "string" }, result: { type: "string" } },
          },
          retryLimit: 2,
          timeoutMinutes: 10,
        },
      ],
    };
    
    const errors = validateWorkflow(workflow);
    expect(errors).toEqual([]);
  });

  it("validates a bounded parallel workflow graph", () => {
    const workflow = {
      id: "research-graph",
      name: "Research Graph",
      description: "Parallel research with a verification barrier",
      topology: "DAG",
      maxConcurrency: 3,
      convergence: {
        maxIterations: 3,
        stopCondition: "All material claims have accepted evidence",
      },
      agents: [
        { id: "researcher", persona: "Research" },
        { id: "verifier", persona: "QA" },
      ],
      steps: [
        {
          id: "research-a",
          agent: "researcher",
          input: "Research A",
          expects: "source ledger",
          outputSchema: { type: "object", required: ["status"], properties: { status: { type: "string" } } },
          retryLimit: 2,
          timeoutMinutes: 20,
          kind: "AGENT",
          modelTier: "BALANCED",
          isolation: "READ_ONLY",
          failurePolicy: "BLOCK",
        },
        {
          id: "research-b",
          agent: "researcher",
          input: "Research B",
          expects: "source ledger",
          outputSchema: { type: "object", required: ["status"], properties: { status: { type: "string" } } },
          retryLimit: 2,
          timeoutMinutes: 20,
          kind: "AGENT",
          modelTier: "BALANCED",
          isolation: "READ_ONLY",
          failurePolicy: "BLOCK",
        },
        {
          id: "verify",
          agent: "verifier",
          input: "Verify both ledgers",
          expects: "verified evidence",
          outputSchema: { type: "object", required: ["status"], properties: { status: { type: "string" } } },
          retryLimit: 1,
          timeoutMinutes: 20,
          dependsOn: ["research-a", "research-b"],
          kind: "VERIFY",
          modelTier: "POWERFUL",
          isolation: "READ_ONLY",
          failurePolicy: "BLOCK",
        },
      ],
    };

    expect(validateWorkflow(workflow)).toEqual([]);
  });

  it("rejects heuristic completion and agent-owned pull-request authority", () => {
    const errors = validateWorkflow({
      id: "unsafe",
      name: "Unsafe",
      description: "Legacy authority",
      agents: [{ id: "agent1", persona: "Coder" }],
      steps: [{
        id: "pr",
        agent: "agent1",
        input: "Use gh pr create and approve for merge",
        expects: "STATUS: done",
        retryLimit: 0,
        timeoutMinutes: 5,
      }],
    });
    expect(errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "steps[0].expects" }),
      expect.objectContaining({ field: "steps[0].input" }),
      expect.objectContaining({ field: "steps[0].outputSchema" }),
    ]));
  });

  it("rejects cyclic graph dependencies", () => {
    const workflow = {
      id: "cyclic",
      name: "Cyclic",
      description: "Invalid cyclic workflow",
      topology: "DAG",
      agents: [{ id: "agent1", persona: "Coder" }],
      steps: [
        {
          id: "a",
          agent: "agent1",
          input: "A",
          expects: "done",
          retryLimit: 1,
          timeoutMinutes: 10,
          dependsOn: ["b"],
        },
        {
          id: "b",
          agent: "agent1",
          input: "B",
          expects: "done",
          retryLimit: 1,
          timeoutMinutes: 10,
          dependsOn: ["a"],
        },
      ],
    };

    expect(validateWorkflow(workflow)).toContainEqual({
      field: "steps",
      message: "Workflow graph contains a cycle",
    });
  });
  
  it("should require id field", () => {
    const workflow = {
      name: "Test",
      description: "Test",
      agents: [],
      steps: [],
    };
    
    const errors = validateWorkflow(workflow);
    expect(errors).toContainEqual({
      field: "id",
      message: "Required string field 'id' is missing",
    });
  });
  
  it("should require name field", () => {
    const workflow = {
      id: "test",
      description: "Test",
      agents: [],
      steps: [],
    };
    
    const errors = validateWorkflow(workflow);
    expect(errors).toContainEqual({
      field: "name",
      message: "Required string field 'name' is missing",
    });
  });
  
  it("should require description field", () => {
    const workflow = {
      id: "test",
      name: "Test",
      agents: [],
      steps: [],
    };
    
    const errors = validateWorkflow(workflow);
    expect(errors).toContainEqual({
      field: "description",
      message: "Required string field 'description' is missing",
    });
  });
  
  it("should require agents array", () => {
    const workflow = {
      id: "test",
      name: "Test",
      description: "Test",
      steps: [],
    };
    
    const errors = validateWorkflow(workflow);
    expect(errors).toContainEqual({
      field: "agents",
      message: "Required array field 'agents' is missing",
    });
  });
  
  it("should require steps array", () => {
    const workflow = {
      id: "test",
      name: "Test",
      description: "Test",
      agents: [],
    };
    
    const errors = validateWorkflow(workflow);
    expect(errors).toContainEqual({
      field: "steps",
      message: "Required array field 'steps' is missing",
    });
  });
  
  it("should require at least one step", () => {
    const workflow = {
      id: "test",
      name: "Test",
      description: "Test",
      agents: [{ id: "agent1", persona: "Coder" }],
      steps: [],
    };
    
    const errors = validateWorkflow(workflow);
    expect(errors).toContainEqual({
      field: "steps",
      message: "Workflow must have at least one step",
    });
  });
  
  it("should validate agent fields", () => {
    const workflow = {
      id: "test",
      name: "Test",
      description: "Test",
      agents: [
        { id: "agent1" }, // missing persona
        { persona: "Coder" }, // missing id
      ],
      steps: [
        {
          id: "step1",
          agent: "agent1",
          input: "Test",
          expects: "done",
          retryLimit: 2,
          timeoutMinutes: 10,
        },
      ],
    };
    
    const errors = validateWorkflow(workflow);
    expect(errors).toContainEqual({
      field: "agents[0].persona",
      message: "Agent persona is required",
    });
    expect(errors).toContainEqual({
      field: "agents[1].id",
      message: "Agent id is required",
    });
  });
  
  it("should validate step fields", () => {
    const workflow = {
      id: "test",
      name: "Test",
      description: "Test",
      agents: [{ id: "agent1", persona: "Coder" }],
      steps: [
        {
          // missing all required fields
        },
      ],
    };
    
    const errors = validateWorkflow(workflow);
    expect(errors).toContainEqual({
      field: "steps[0].id",
      message: "Step id is required",
    });
    expect(errors).toContainEqual({
      field: "steps[0].agent",
      message: "Step agent is required",
    });
    expect(errors).toContainEqual({
      field: "steps[0].input",
      message: "Step input is required",
    });
    expect(errors).toContainEqual({
      field: "steps[0].expects",
      message: "Step expects is required",
    });
  });
  
  it("should validate retryLimit is non-negative number", () => {
    const workflow = {
      id: "test",
      name: "Test",
      description: "Test",
      agents: [{ id: "agent1", persona: "Coder" }],
      steps: [
        {
          id: "step1",
          agent: "agent1",
          input: "Test",
          expects: "done",
          retryLimit: -1,
          timeoutMinutes: 10,
        },
      ],
    };
    
    const errors = validateWorkflow(workflow);
    expect(errors).toContainEqual({
      field: "steps[0].retryLimit",
      message: "Step retryLimit must be a non-negative number",
    });
  });
  
  it("should validate timeoutMinutes is positive number", () => {
    const workflow = {
      id: "test",
      name: "Test",
      description: "Test",
      agents: [{ id: "agent1", persona: "Coder" }],
      steps: [
        {
          id: "step1",
          agent: "agent1",
          input: "Test",
          expects: "done",
          retryLimit: 2,
          timeoutMinutes: 0,
        },
      ],
    };
    
    const errors = validateWorkflow(workflow);
    expect(errors).toContainEqual({
      field: "steps[0].timeoutMinutes",
      message: "Step timeoutMinutes must be a positive number",
    });
  });
  
  it("should validate agent references in steps", () => {
    const workflow = {
      id: "test",
      name: "Test",
      description: "Test",
      agents: [{ id: "agent1", persona: "Coder" }],
      steps: [
        {
          id: "step1",
          agent: "nonexistent",
          input: "Test",
          expects: "done",
          retryLimit: 2,
          timeoutMinutes: 10,
        },
      ],
    };
    
    const errors = validateWorkflow(workflow);
    expect(errors).toContainEqual({
      field: "steps[0].agent",
      message: 'Agent "nonexistent" not defined in agents array',
    });
  });
  
  it("should return multiple errors", () => {
    const workflow = {
      // missing id, name, description
      agents: [
        { id: "agent1" }, // missing persona
      ],
      steps: [
        {
          id: "step1",
          agent: "missing",
          // missing input, expects, retryLimit, timeoutMinutes
        },
      ],
    };
    
    const errors = validateWorkflow(workflow);
    expect(errors.length).toBeGreaterThan(5);
  });
});
