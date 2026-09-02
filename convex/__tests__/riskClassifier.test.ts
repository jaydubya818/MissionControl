import { describe, expect, it } from "vitest";
import {
  AUTONOMY_RULES,
  TOOL_RISK_MAP,
  affectsProduction,
  classifyRisk,
  containsSecrets,
  requiresApproval,
} from "../lib/riskClassifier";
import { TOOL_RISK_MAP as POLICY_ENGINE_TOOL_RISK_MAP } from "../../packages/policy-engine/src/rules";

describe("classifyRisk", () => {
  it("returns the mapped risk for known tools", () => {
    expect(classifyRisk("read_file")).toBe("GREEN");
    expect(classifyRisk("write_file")).toBe("YELLOW");
    expect(classifyRisk("git_force_push")).toBe("RED");
  });

  it("defaults unknown tools to YELLOW", () => {
    expect(classifyRisk("some_new_tool")).toBe("YELLOW");
    expect(classifyRisk("")).toBe("YELLOW");
  });

  it("is case-sensitive on tool names, so a differently cased known tool falls back to YELLOW", () => {
    expect(classifyRisk("Read_File")).toBe("YELLOW");
    expect(classifyRisk("RM_RF")).toBe("YELLOW");
  });

  it("escalates any tool to RED when params mention a secret", () => {
    expect(classifyRisk("read_file", { path: "config/credentials.json" })).toBe("RED");
    expect(classifyRisk("read_file", { path: ".env.local" })).toBe("RED");
    expect(classifyRisk("write_file", { content: "API_KEY=abc" })).toBe("RED");
    expect(classifyRisk("search", { query: "id_rsa private_key" })).toBe("RED");
  });

  it("escalates any tool to RED when params reference production", () => {
    expect(classifyRisk("read_file", { path: "deploy/prod.yaml" })).toBe("RED");
    expect(classifyRisk("shell", { command: "git push --force" })).toBe("RED");
    expect(classifyRisk("shell", { command: "git reset --hard" })).toBe("RED");
    expect(classifyRisk("write_file", { path: "docs/deployment.md" })).toBe("RED");
  });

  it("matches params by substring, so the escalation is over-inclusive rather than under-inclusive", () => {
    // "tokenizer" contains "token"; "products" does not match /prod\b/.
    expect(classifyRisk("search", { query: "tokenizer" })).toBe("RED");
    expect(classifyRisk("search", { query: "products" })).toBe("GREEN");
  });

  it("matches nested params and keys, not just top-level string values", () => {
    expect(classifyRisk("read_file", { nested: { password: "x" } })).toBe("RED");
    expect(classifyRisk("read_file", { list: ["ok", "secret"] })).toBe("RED");
  });

  it("never downgrades a RED tool", () => {
    expect(classifyRisk("rm_rf", { path: "/tmp/scratch" })).toBe("RED");
  });

  it("leaves a known tool at its mapped level when params are clean", () => {
    expect(classifyRisk("read_file", { path: "README.md" })).toBe("GREEN");
    expect(classifyRisk("shell", { command: "ls -la" })).toBe("YELLOW");
  });
});

describe("containsSecrets / affectsProduction", () => {
  it("flag the documented secret indicators", () => {
    for (const sample of [
      "api_key", "apikey", "api-key", "secret", "password", "token",
      "private_key", "private-key", ".env", "credentials", "auth_header", "auth-header",
    ]) {
      expect(containsSecrets(sample), sample).toBe(true);
    }
    expect(containsSecrets("README.md")).toBe(false);
  });

  it("flag the documented production indicators", () => {
    for (const sample of [
      "production", "prod", "prod/", "--force", "--hard", "main branch", "master  branch", "deploy",
    ]) {
      expect(affectsProduction(sample), sample).toBe(true);
    }
    expect(affectsProduction("products")).toBe(false);
    expect(affectsProduction("mainline")).toBe(false);
  });
});

describe("requiresApproval", () => {
  it("always requires approval for RED regardless of role or budget", () => {
    for (const role of ["INTERN", "SPECIALIST", "LEAD", "CEO", "unknown"]) {
      expect(requiresApproval("RED", role, 0, 1_000).required, role).toBe(true);
    }
  });

  it("requires approval for YELLOW only for INTERN", () => {
    expect(requiresApproval("YELLOW", "INTERN").required).toBe(true);
    expect(requiresApproval("YELLOW", "SPECIALIST").required).toBe(false);
    expect(requiresApproval("YELLOW", "LEAD").required).toBe(false);
  });

  it("treats an unknown role as INTERN (fail-safe)", () => {
    expect(AUTONOMY_RULES.CEO).toBeUndefined();
    expect(requiresApproval("YELLOW", "CEO").required).toBe(true);
    expect(requiresApproval("YELLOW", "").required).toBe(true);
  });

  it("requires approval when the estimated cost exceeds the remaining budget", () => {
    const result = requiresApproval("GREEN", "LEAD", 5, 4.5);
    expect(result.required).toBe(true);
    expect(result.reason).toBe("Estimated cost ($5.00) exceeds remaining budget ($4.50)");
  });

  it("allows a cost that exactly equals the remaining budget", () => {
    expect(requiresApproval("GREEN", "LEAD", 4.5, 4.5).required).toBe(false);
  });

  it("skips the budget check when either side is undefined", () => {
    expect(requiresApproval("GREEN", "INTERN", 100, undefined).required).toBe(false);
    expect(requiresApproval("GREEN", "INTERN", undefined, 0).required).toBe(false);
  });

  it("checks the budget only after the role gate passes", () => {
    const result = requiresApproval("YELLOW", "INTERN", 100, 1);
    expect(result.reason).toBe("INTERN agents require approval for YELLOW actions");
  });
});

describe("parity with packages/policy-engine TOOL_RISK_MAP", () => {
  // The file header claims this map is "synced with packages/policy-engine/src/rules.ts".
  // The two vocabularies differ, which is tolerable for GREEN/YELLOW because an unknown
  // tool defaults to YELLOW here. It is not tolerable for RED: a tool the policy engine
  // treats as RED must not fall through to the YELLOW default, because YELLOW is
  // auto-approved for SPECIALIST and LEAD agents.
  it("classifies every policy-engine RED tool as RED", () => {
    const policyEngineRed = Object.entries(POLICY_ENGINE_TOOL_RISK_MAP)
      .filter(([, risk]) => risk === "red")
      .map(([tool]) => tool);
    expect(policyEngineRed.length).toBeGreaterThan(0);
    const misclassified = policyEngineRed.filter((tool) => classifyRisk(tool) !== "RED");
    expect(misclassified).toEqual([]);
  });

  it("never rates a tool lower than the policy engine does", () => {
    const rank = { GREEN: 0, YELLOW: 1, RED: 2 } as const;
    const weaker = Object.entries(POLICY_ENGINE_TOOL_RISK_MAP)
      .filter(([tool, risk]) => {
        const here = TOOL_RISK_MAP[tool];
        return here !== undefined && rank[here] < rank[risk.toUpperCase() as keyof typeof rank];
      })
      .map(([tool]) => tool);
    expect(weaker).toEqual([]);
  });
});
