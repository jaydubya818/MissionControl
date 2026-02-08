import { describe, it, expect } from "vitest";
import { validatePersona, matchPersona, AgentPersona } from "../persona";

const VALID_PERSONA: AgentPersona = {
  name: "TestAgent",
  emoji: "🧪",
  role: "SPECIALIST",
  description: "A test agent",
  trigger_patterns: ["test", "spec", "check"],
  risk_profile: "GREEN",
  allowed_task_types: ["CODE", "RESEARCH"],
  allowed_tools: ["shell", "file_read"],
  budgets: {
    daily_cap: 5.0,
    per_run_cap: 0.5,
  },
  capabilities: ["testing"],
  system_prompt: "You are a test agent.",
};

describe("validatePersona", () => {
  it("returns no errors for a valid persona", () => {
    const errors = validatePersona(VALID_PERSONA);
    expect(errors).toEqual([]);
  });

  it("rejects null/undefined", () => {
    const errors = validatePersona(null);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].field).toBe("root");
  });

  it("rejects missing name", () => {
    const bad = { ...VALID_PERSONA, name: undefined };
    const errors = validatePersona(bad);
    expect(errors.some((e) => e.field === "name")).toBe(true);
  });

  it("rejects invalid role", () => {
    const bad = { ...VALID_PERSONA, role: "ADMIN" };
    const errors = validatePersona(bad);
    expect(errors.some((e) => e.field === "role")).toBe(true);
  });

  it("rejects invalid risk_profile", () => {
    const bad = { ...VALID_PERSONA, risk_profile: "BLUE" };
    const errors = validatePersona(bad);
    expect(errors.some((e) => e.field === "risk_profile")).toBe(true);
  });

  it("rejects non-array trigger_patterns", () => {
    const bad = { ...VALID_PERSONA, trigger_patterns: "not-an-array" };
    const errors = validatePersona(bad);
    expect(errors.some((e) => e.field === "trigger_patterns")).toBe(true);
  });

  it("rejects missing budgets", () => {
    const bad = { ...VALID_PERSONA, budgets: undefined };
    const errors = validatePersona(bad);
    expect(errors.some((e) => e.field === "budgets")).toBe(true);
  });

  it("rejects zero daily_cap", () => {
    const bad = { ...VALID_PERSONA, budgets: { daily_cap: 0, per_run_cap: 0.5 } };
    const errors = validatePersona(bad);
    expect(errors.some((e) => e.field === "budgets.daily_cap")).toBe(true);
  });

  it("rejects negative per_run_cap", () => {
    const bad = { ...VALID_PERSONA, budgets: { daily_cap: 5, per_run_cap: -1 } };
    const errors = validatePersona(bad);
    expect(errors.some((e) => e.field === "budgets.per_run_cap")).toBe(true);
  });
});

describe("matchPersona", () => {
  const personas = new Map<string, AgentPersona>();

  const coder: AgentPersona = {
    ...VALID_PERSONA,
    name: "Coder",
    trigger_patterns: ["implement", "code", "build", "function", "class"],
  };

  const researcher: AgentPersona = {
    ...VALID_PERSONA,
    name: "Researcher",
    trigger_patterns: ["research", "investigate", "analyze", "study"],
  };

  const coordinator: AgentPersona = {
    ...VALID_PERSONA,
    name: "Coordinator",
    trigger_patterns: ["always_active"],
  };

  personas.set("coder", coder);
  personas.set("researcher", researcher);
  personas.set("coordinator", coordinator);

  it("matches coder for implementation tasks", () => {
    const result = matchPersona("implement the user authentication function", personas);
    expect(result?.name).toBe("Coder");
  });

  it("matches researcher for research tasks", () => {
    const result = matchPersona("research best practices for caching", personas);
    expect(result?.name).toBe("Researcher");
  });

  it("returns null for no match", () => {
    const result = matchPersona("deploy to production", personas);
    expect(result).toBeNull();
  });

  it("skips always_active personas", () => {
    const result = matchPersona("always_active coordinator task", personas);
    // Should not match coordinator since it's always_active
    expect(result?.name).not.toBe("Coordinator");
  });

  it("picks the persona with the most trigger matches", () => {
    // "code and build a function" matches coder 3x (code, build, function)
    // but only matches researcher 0x
    const result = matchPersona("code and build a function", personas);
    expect(result?.name).toBe("Coder");
  });
});
