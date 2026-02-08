import { describe, it, expect } from "vitest";
import { delegate, delegateAll, AgentCandidate } from "../delegator";
import { Subtask } from "../decomposer";

const makeAgent = (overrides: Partial<AgentCandidate> = {}): AgentCandidate => ({
  id: "agent-1",
  name: "Coder",
  role: "SPECIALIST",
  status: "ACTIVE",
  allowedTaskTypes: ["ENGINEERING", "DOCS"],
  capabilities: ["code_generation", "testing", "file_operations"],
  budgetRemaining: 5.0,
  activeTaskCount: 0,
  performanceScore: 0.85,
  ...overrides,
});

const makeSubtask = (overrides: Partial<Subtask> = {}): Subtask => ({
  title: "Implement feature",
  description: "Build the thing",
  type: "ENGINEERING",
  priority: 2,
  estimatedMinutes: 60,
  dependsOn: [],
  requiredCapabilities: ["code_generation"],
  deliverable: "Working code",
  ...overrides,
});

describe("delegate", () => {
  it("selects the best available agent", () => {
    const candidates = [
      makeAgent({ id: "a1", name: "Coder", performanceScore: 0.9 }),
      makeAgent({ id: "a2", name: "Researcher", performanceScore: 0.7, capabilities: ["research"] }),
    ];

    const result = delegate(makeSubtask(), 0, candidates);
    expect(result).not.toBeNull();
    expect(result!.assignedAgentId).toBe("a1");
  });

  it("returns null when no eligible agents", () => {
    const candidates = [
      makeAgent({ status: "OFFLINE" }),
      makeAgent({ id: "a2", status: "QUARANTINED" }),
    ];

    const result = delegate(makeSubtask(), 0, candidates);
    expect(result).toBeNull();
  });

  it("skips agents with no budget", () => {
    const candidates = [
      makeAgent({ id: "a1", budgetRemaining: 0 }),
      makeAgent({ id: "a2", budgetRemaining: 3.0, performanceScore: 0.5 }),
    ];

    const result = delegate(makeSubtask(), 0, candidates);
    expect(result).not.toBeNull();
    expect(result!.assignedAgentId).toBe("a2");
  });

  it("skips agents that dont support the task type", () => {
    const candidates = [
      makeAgent({ id: "a1", allowedTaskTypes: ["CONTENT"] }),
      makeAgent({ id: "a2", allowedTaskTypes: ["ENGINEERING"] }),
    ];

    const result = delegate(makeSubtask({ type: "ENGINEERING" }), 0, candidates);
    expect(result).not.toBeNull();
    expect(result!.assignedAgentId).toBe("a2");
  });

  it("prefers agents with fewer active tasks", () => {
    const candidates = [
      makeAgent({ id: "a1", activeTaskCount: 5, performanceScore: 0.9 }),
      makeAgent({ id: "a2", activeTaskCount: 0, performanceScore: 0.85 }),
    ];

    const result = delegate(makeSubtask(), 0, candidates);
    expect(result).not.toBeNull();
    expect(result!.assignedAgentId).toBe("a2");
  });

  it("includes reasoning in the result", () => {
    const candidates = [makeAgent()];
    const result = delegate(makeSubtask(), 0, candidates);
    expect(result).not.toBeNull();
    expect(result!.reasoning).toContain("Role:");
    expect(result!.reasoning).toContain("Performance:");
  });
});

describe("delegateAll", () => {
  it("distributes subtasks across agents", () => {
    const subtasks = [
      makeSubtask({ title: "Task A", type: "ENGINEERING" }),
      makeSubtask({ title: "Task B", type: "ENGINEERING" }),
      makeSubtask({ title: "Task C", type: "ENGINEERING" }),
    ];
    
    const candidates = [
      makeAgent({ id: "a1", name: "Coder A" }),
      makeAgent({ id: "a2", name: "Coder B" }),
    ];
    
    const results = delegateAll(subtasks, candidates);
    expect(results.length).toBe(3);
  });

  it("returns fewer results when not all subtasks can be delegated", () => {
    const subtasks = [
      makeSubtask({ title: "Task A", type: "ENGINEERING" }),
      makeSubtask({ title: "Task B", type: "DESIGN" }), // No agent supports DESIGN
    ];
    
    const candidates = [
      makeAgent({ id: "a1", allowedTaskTypes: ["ENGINEERING"] }),
    ];
    
    const results = delegateAll(subtasks, candidates);
    expect(results.length).toBe(1);
    expect(results[0].subtask.title).toBe("Task A");
  });
});
