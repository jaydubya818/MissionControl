import { describe, it, expect } from "vitest";
import { classifyRisk, requiresApproval, canSpawn, evaluatePolicy } from "../evaluator";
import { Agent, Task } from "@mission-control/shared";

// Test fixtures
function makeAgent(overrides?: Partial<Agent>): Agent {
  return {
    _id: "agent-1",
    _creationTime: Date.now(),
    name: "Test Agent",
    sessionKey: "session-1",
    autonomyLevel: "SPECIALIST",
    status: "ACTIVE",
    modelConfig: { primary: "claude-3-sonnet" },
    toolPermissions: [],
    budgets: { dailyCap: 5, perRunCap: 0.75 },
    errorStreak: 0,
    totalSpend: 0,
    todaySpend: 0,
    metadata: {},
    ...overrides,
  };
}

function makeTask(overrides?: Partial<Task>): Task {
  return {
    _id: "task-1",
    _creationTime: Date.now(),
    title: "Test Task",
    description: "A test task",
    type: "ENGINEERING",
    status: "IN_PROGRESS",
    priority: 3,
    assigneeIds: ["agent-1"],
    reviewerIds: [],
    subscriberIds: [],
    dependsOn: [],
    budget: 8,
    spend: 2,
    metadata: {},
    ...overrides,
  };
}

describe("classifyRisk", () => {
  it("classifies GREEN tools", () => {
    expect(classifyRisk("read_db")).toBe("green");
    expect(classifyRisk("query_db")).toBe("green");
    expect(classifyRisk("read_file")).toBe("green");
    expect(classifyRisk("web_search")).toBe("green");
    expect(classifyRisk("analyze_data")).toBe("green");
  });

  it("classifies YELLOW tools", () => {
    expect(classifyRisk("shell_exec")).toBe("yellow");
    expect(classifyRisk("git_commit")).toBe("yellow");
    expect(classifyRisk("write_file")).toBe("yellow");
    expect(classifyRisk("network_call")).toBe("yellow");
    expect(classifyRisk("delete_file")).toBe("yellow");
  });

  it("classifies RED tools", () => {
    expect(classifyRisk("send_email")).toBe("red");
    expect(classifyRisk("deploy_prod")).toBe("red");
    expect(classifyRisk("drop_table")).toBe("red");
    expect(classifyRisk("access_secrets")).toBe("red");
    expect(classifyRisk("rm_rf")).toBe("red");
  });

  it("defaults unknown tools to YELLOW", () => {
    expect(classifyRisk("unknown_tool")).toBe("yellow");
  });

  it("upgrades to RED when params contain secrets", () => {
    const risk = classifyRisk("write_file", {
      content: "api_key=sk-1234567890abcdefghijklmnopqrstuvwxyz",
    });
    expect(risk).toBe("red");
  });

  it("upgrades to RED when params affect production", () => {
    const risk = classifyRisk("shell_exec", {
      command: "deploy to production",
    });
    expect(risk).toBe("red");
  });
});

describe("requiresApproval", () => {
  it("always requires approval for RED risk", () => {
    const agent = makeAgent();
    const task = makeTask();
    const result = requiresApproval("send_email", "red", agent, task);
    expect(result.required).toBe(true);
    expect(result.reason).toContain("RED");
  });

  it("requires approval for YELLOW when agent is INTERN", () => {
    const agent = makeAgent({ autonomyLevel: "INTERN" });
    const task = makeTask();
    const result = requiresApproval("shell_exec", "yellow", agent, task);
    expect(result.required).toBe(true);
    expect(result.reason).toContain("INTERN");
  });

  it("does NOT require approval for YELLOW when agent is SPECIALIST", () => {
    const agent = makeAgent({ autonomyLevel: "SPECIALIST" });
    const task = makeTask();
    const result = requiresApproval("shell_exec", "yellow", agent, task);
    expect(result.required).toBe(false);
  });

  it("does NOT require approval for GREEN", () => {
    const agent = makeAgent({ autonomyLevel: "INTERN" });
    const task = makeTask();
    const result = requiresApproval("read_db", "green", agent, task);
    expect(result.required).toBe(false);
  });

  it("requires approval when cost exceeds per-run cap", () => {
    const agent = makeAgent({ budgets: { dailyCap: 5, perRunCap: 0.50 } });
    const task = makeTask();
    const result = requiresApproval("shell_exec", "yellow", agent, task, {
      estimatedCost: 1.0,
    });
    expect(result.required).toBe(true);
    expect(result.reason).toContain("per-run cap");
  });

  it("requires approval when cost exceeds task budget", () => {
    // Use large per-run cap so that check doesn't trigger first
    const agent = makeAgent({ budgets: { dailyCap: 50, perRunCap: 10 } });
    const task = makeTask({ budget: 3, spend: 2.5 });
    const result = requiresApproval("shell_exec", "yellow", agent, task, {
      estimatedCost: 1.0,
    });
    expect(result.required).toBe(true);
    expect(result.reason).toContain("task budget");
  });

  it("requires approval when cost exceeds agent daily budget", () => {
    const agent = makeAgent({
      budgets: { dailyCap: 5, perRunCap: 3 },
      todaySpend: 4.5,
    });
    const task = makeTask();
    const result = requiresApproval("shell_exec", "yellow", agent, task, {
      estimatedCost: 1.0,
    });
    expect(result.required).toBe(true);
    expect(result.reason).toContain("daily budget");
  });
});

describe("canSpawn", () => {
  it("allows SPECIALIST to spawn", () => {
    const agent = makeAgent({ autonomyLevel: "SPECIALIST" });
    const result = canSpawn(agent);
    expect(result.allowed).toBe(true);
  });

  it("allows LEAD to spawn", () => {
    const agent = makeAgent({ autonomyLevel: "LEAD" });
    const result = canSpawn(agent);
    expect(result.allowed).toBe(true);
  });

  it("prevents INTERN from spawning", () => {
    const agent = makeAgent({ autonomyLevel: "INTERN" });
    const result = canSpawn(agent);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("INTERN");
  });
});

describe("evaluatePolicy", () => {
  it("allows GREEN tool for any agent", () => {
    const agent = makeAgent({ autonomyLevel: "INTERN" });
    const task = makeTask();
    const result = evaluatePolicy("read_db", {}, agent, task);
    expect(result.allowed).toBe(true);
    expect(result.requiresApproval).toBe(false);
    expect(result.risk).toBe("green");
  });

  it("allows YELLOW tool for SPECIALIST without approval", () => {
    const agent = makeAgent({ autonomyLevel: "SPECIALIST" });
    const task = makeTask();
    const result = evaluatePolicy("git_commit", {}, agent, task);
    expect(result.allowed).toBe(true);
    expect(result.requiresApproval).toBe(false);
    expect(result.risk).toBe("yellow");
  });

  it("requires approval for RED tool regardless of level", () => {
    const agent = makeAgent({ autonomyLevel: "LEAD" });
    const task = makeTask();
    const result = evaluatePolicy("deploy_prod", {}, agent, task);
    expect(result.allowed).toBe(true); // RED tools are not blocked outright, but require approval
    expect(result.requiresApproval).toBe(true);
    expect(result.risk).toBe("red");
  });

  it("blocks disallowed shell commands", () => {
    const agent = makeAgent();
    const task = makeTask();
    const result = evaluatePolicy("shell_exec", { command: "rm -rf /" }, agent, task);
    expect(result.allowed).toBe(false);
  });

  it("blocks disallowed network calls", () => {
    const agent = makeAgent();
    const task = makeTask();
    const result = evaluatePolicy("network_call", { url: "https://evil.com/steal" }, agent, task);
    expect(result.allowed).toBe(false);
  });

  it("blocks writes to .env files", () => {
    const agent = makeAgent();
    const task = makeTask();
    const result = evaluatePolicy("write_file", { path: ".env" }, agent, task);
    expect(result.allowed).toBe(false);
  });

  it("allows writes to src path", () => {
    const agent = makeAgent();
    const task = makeTask();
    const result = evaluatePolicy("write_file", { path: "src/utils.ts" }, agent, task);
    expect(result.allowed).toBe(true);
  });
});
