import { describe, expect, it } from "vitest";
import { NAV_GROUPS, allNavViews, groupForView, itemForView } from "./navConfig";

describe("navConfig", () => {
  it("has the Software Factory domains plus harness, workspace and labs", () => {
    expect(NAV_GROUPS.map((g) => g.id)).toEqual([
      "operate",
      "control",
      "harness",
      "factory",
      "intelligence",
      "observe",
      "platform",
      "govern",
      "workspace",
      "labs",
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
      "harness-health", "harness-loops", "harness-control-plane", "harness-work-ledger",
      "harness-verifiers", "harness-change-review", "harness-change-risk", "harness-launch",
      "harness-meta-loop", "harness-team-pulse", "harness-builder", "harness-maintenance", "harness-code-review-wizard",
      "harness-workshop", "harness-automations", "harness-agent-fleet", "harness-software-factory", "harness-architect", "harness-patterns",
      "registry-lifecycle", "registry-evaluate", "registry-inventory", "registry-installations", "registry-runs",
      "analytics", "command-center", "missions", "trace-inspector", "effectiveness", "factory-health",
      "readiness", "friction", "agent-catalog", "dossier", "recommendations",
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

  it("keeps EOS administration and labs groups within six visible items each", async () => {
    const { EOS_NAV_GROUPS } = await import("./eosNavConfig");
    const administration = EOS_NAV_GROUPS.find((g) => g.id === "administration");
    const labs = EOS_NAV_GROUPS.find((g) => g.id === "labs");
    expect(administration?.items.length).toBeLessThanOrEqual(6);
    expect(labs?.items.length).toBeLessThanOrEqual(6);
  });

  it("resolves group and item lookups", () => {
    expect(groupForView("tasks")?.id).toBe("operate");
    expect(groupForView("policies")?.id).toBe("govern");
    expect(itemForView("skills")?.label).toBe("Registry Discover");
    expect(itemForView("nonexistent" as never)).toBeUndefined();
  });
});
