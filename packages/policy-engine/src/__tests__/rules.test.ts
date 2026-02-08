import { describe, it, expect } from "vitest";
import {
  AUTONOMY_RULES,
  TOOL_RISK_MAP,
  ALLOWLISTS,
  BUDGET_DEFAULTS,
  SPAWN_LIMITS,
  LOOP_DETECTION,
  DEFAULT_POLICY_V1,
} from "../rules";

describe("AUTONOMY_RULES", () => {
  it("defines all three levels", () => {
    expect(AUTONOMY_RULES).toHaveProperty("INTERN");
    expect(AUTONOMY_RULES).toHaveProperty("SPECIALIST");
    expect(AUTONOMY_RULES).toHaveProperty("LEAD");
  });

  it("INTERN cannot spawn and needs approval for everything", () => {
    expect(AUTONOMY_RULES.INTERN.canSpawn).toBe(false);
    expect(AUTONOMY_RULES.INTERN.requiresApprovalForYellow).toBe(true);
    expect(AUTONOMY_RULES.INTERN.requiresApprovalForRed).toBe(true);
  });

  it("SPECIALIST can spawn and handle YELLOW independently", () => {
    expect(AUTONOMY_RULES.SPECIALIST.canSpawn).toBe(true);
    expect(AUTONOMY_RULES.SPECIALIST.yellowAllowed).toBe(true);
    expect(AUTONOMY_RULES.SPECIALIST.requiresApprovalForYellow).toBe(false);
    expect(AUTONOMY_RULES.SPECIALIST.requiresApprovalForRed).toBe(true);
  });

  it("LEAD has same permissions as SPECIALIST", () => {
    expect(AUTONOMY_RULES.LEAD.canSpawn).toBe(true);
    expect(AUTONOMY_RULES.LEAD.requiresApprovalForRed).toBe(true);
  });

  it("no autonomy level allows RED without approval", () => {
    for (const level of Object.values(AUTONOMY_RULES)) {
      expect(level.requiresApprovalForRed).toBe(true);
    }
  });
});

describe("TOOL_RISK_MAP", () => {
  it("classifies read operations as green", () => {
    expect(TOOL_RISK_MAP.read_db).toBe("green");
    expect(TOOL_RISK_MAP.read_file).toBe("green");
    expect(TOOL_RISK_MAP.web_search).toBe("green");
  });

  it("classifies write operations as yellow", () => {
    expect(TOOL_RISK_MAP.write_file).toBe("yellow");
    expect(TOOL_RISK_MAP.git_commit).toBe("yellow");
    expect(TOOL_RISK_MAP.shell_exec).toBe("yellow");
  });

  it("classifies external/destructive operations as red", () => {
    expect(TOOL_RISK_MAP.send_email).toBe("red");
    expect(TOOL_RISK_MAP.deploy_prod).toBe("red");
    expect(TOOL_RISK_MAP.rm_rf).toBe("red");
    expect(TOOL_RISK_MAP.drop_table).toBe("red");
  });

  it("has at least 9 green, 10 yellow, and 12 red tools", () => {
    const counts = { green: 0, yellow: 0, red: 0 };
    for (const risk of Object.values(TOOL_RISK_MAP)) {
      counts[risk]++;
    }
    expect(counts.green).toBeGreaterThanOrEqual(9);
    expect(counts.yellow).toBeGreaterThanOrEqual(10);
    expect(counts.red).toBeGreaterThanOrEqual(12);
  });
});

describe("ALLOWLISTS", () => {
  it("has shell allowlist and blocklist", () => {
    expect(ALLOWLISTS.shell.length).toBeGreaterThan(0);
    expect(ALLOWLISTS.shellBlocked.length).toBeGreaterThan(0);
  });

  it("has network allowlist", () => {
    expect(ALLOWLISTS.network.length).toBeGreaterThan(0);
    expect(ALLOWLISTS.network).toContain("github.com");
  });

  it("has filesystem read/write/writeBlocked lists", () => {
    expect(ALLOWLISTS.filesystem.read.length).toBeGreaterThan(0);
    expect(ALLOWLISTS.filesystem.write.length).toBeGreaterThan(0);
    expect(ALLOWLISTS.filesystem.writeBlocked.length).toBeGreaterThan(0);
  });

  it("blocks .env in write blocklist", () => {
    expect(ALLOWLISTS.filesystem.writeBlocked).toContain(".env");
    expect(ALLOWLISTS.filesystem.writeBlocked).toContain(".env.local");
  });
});

describe("BUDGET_DEFAULTS", () => {
  it("INTERN has lowest budgets", () => {
    expect(BUDGET_DEFAULTS.perAgentDaily.INTERN).toBeLessThan(BUDGET_DEFAULTS.perAgentDaily.SPECIALIST);
    expect(BUDGET_DEFAULTS.perRun.INTERN).toBeLessThan(BUDGET_DEFAULTS.perRun.SPECIALIST);
  });

  it("LEAD has highest budgets", () => {
    expect(BUDGET_DEFAULTS.perAgentDaily.LEAD).toBeGreaterThan(BUDGET_DEFAULTS.perAgentDaily.SPECIALIST);
    expect(BUDGET_DEFAULTS.perRun.LEAD).toBeGreaterThan(BUDGET_DEFAULTS.perRun.SPECIALIST);
  });

  it("defines budgets for all task types", () => {
    const types = ["CONTENT", "SOCIAL", "EMAIL_MARKETING", "CUSTOMER_RESEARCH",
      "SEO_RESEARCH", "ENGINEERING", "DOCS", "OPS"];
    for (const type of types) {
      expect(BUDGET_DEFAULTS.perTask[type as keyof typeof BUDGET_DEFAULTS.perTask]).toBeGreaterThan(0);
    }
  });
});

describe("SPAWN_LIMITS", () => {
  it("has reasonable limits", () => {
    expect(SPAWN_LIMITS.maxActive).toBeGreaterThan(0);
    expect(SPAWN_LIMITS.maxPerParent).toBeGreaterThan(0);
    expect(SPAWN_LIMITS.maxDepth).toBeGreaterThan(0);
    expect(SPAWN_LIMITS.ttl).toBeGreaterThan(0);
  });
});

describe("LOOP_DETECTION", () => {
  it("has all thresholds defined", () => {
    expect(LOOP_DETECTION.commentRateThreshold).toBeGreaterThan(0);
    expect(LOOP_DETECTION.commentRateWindow).toBeGreaterThan(0);
    expect(LOOP_DETECTION.reviewCycleLimit).toBeGreaterThan(0);
    expect(LOOP_DETECTION.backAndForthLimit).toBeGreaterThan(0);
    expect(LOOP_DETECTION.backAndForthWindow).toBeGreaterThan(0);
    expect(LOOP_DETECTION.retryLimit).toBeGreaterThan(0);
  });
});

describe("DEFAULT_POLICY_V1", () => {
  it("is version v1 and active", () => {
    expect(DEFAULT_POLICY_V1.version).toBe("v1");
    expect(DEFAULT_POLICY_V1.active).toBe(true);
  });

  it("includes all required sections", () => {
    expect(DEFAULT_POLICY_V1.autonomyRules).toBeDefined();
    expect(DEFAULT_POLICY_V1.riskMap).toBeDefined();
    expect(DEFAULT_POLICY_V1.allowlists).toBeDefined();
    expect(DEFAULT_POLICY_V1.budgets).toBeDefined();
    expect(DEFAULT_POLICY_V1.spawnLimits).toBeDefined();
    expect(DEFAULT_POLICY_V1.loopDetection).toBeDefined();
  });
});
