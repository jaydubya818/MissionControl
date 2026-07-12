import { describe, expect, it } from "vitest";
import { NAV_GROUPS, allNavViews, groupForView, itemForView } from "./navConfig";

describe("navConfig", () => {
  it("has the five Software Factory domains plus workspace", () => {
    expect(NAV_GROUPS.map((g) => g.id)).toEqual([
      "operate",
      "control",
      "factory",
      "intelligence",
      "observe",
      "govern",
      "workspace",
    ]);
  });

  it("contains no duplicate views across groups", () => {
    const views = allNavViews();
    expect(new Set(views).size).toBe(views.length);
  });

  it("keeps every legacy MainView reachable", () => {
    // Mirror of VALID_MAIN_VIEWS in App.tsx — update both when adding views
    const required = [
      "home", "atc", "tasks", "agents", "directory", "policies", "deployments", "audit", "telemetry",
      "dag", "chat", "council", "calendar", "projects", "memory", "captures", "docs", "skills", "people", "org",
      "design-system", "office", "live-office", "search", "identity", "telegraph", "meetings", "voice",
      "content-pipeline", "crm", "command", "code", "recorder", "test-generation", "api-import", "execution",
      "flaky-steps", "hybrid-workflows", "schedule", "codegen", "gherkin", "metrics", "qc-dashboard", "qc-runs",
      "qc-environments", "qc-findings", "qc-metrics", "qc-rulesets", "gateway", "live-chat", "schedules",
      "hiring", "team", "system", "radar", "factory", "pipeline", "feedback", "ops-schedule", "goals",
      "control-portfolio", "control-work-orders", "control-fleet", "control-approvals",
    ];
    const reachable = new Set(allNavViews());
    const missing = required.filter((v) => !reachable.has(v as never));
    expect(missing).toEqual([]);
  });

  it("lists every EOS preview view in eosNavConfig", async () => {
    const { EOS_NAV_GROUPS } = await import("./eosNavConfig");
    const eosViews = EOS_NAV_GROUPS.flatMap((g) => g.items.map((i) => i.view));
    const required = [
      "command-center", "missions", "trace-inspector", "effectiveness", "factory-health",
      "readiness", "friction", "agent-catalog", "dossier", "recommendations",
    ];
    const missing = required.filter((v) => !eosViews.includes(v as never));
    expect(missing).toEqual([]);
  });

  it("resolves group and item lookups", () => {
    expect(groupForView("tasks")?.id).toBe("operate");
    expect(groupForView("policies")?.id).toBe("govern");
    expect(itemForView("skills")?.label).toBe("Registry");
    expect(itemForView("nonexistent" as never)).toBeUndefined();
  });
});
