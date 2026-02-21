/**
 * Workflow Loader Tests
 */

import { describe, it, expect } from "vitest";
import { validateWorkflow } from "../loader";

describe("validateWorkflow", () => {
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
          expects: "STATUS: done",
          retryLimit: 2,
          timeoutMinutes: 10,
        },
      ],
    };
    
    const errors = validateWorkflow(workflow);
    expect(errors).toEqual([]);
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
