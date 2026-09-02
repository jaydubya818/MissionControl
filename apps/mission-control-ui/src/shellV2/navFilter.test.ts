import { describe, expect, it } from "vitest";
import { EOS_NAV_GROUPS } from "./eosNavConfig";
import { NAV_GROUPS } from "./navConfig";
import { filterNavGroups } from "./navFilter";
import { hasDeclaredRouteCapability } from "./routeCapabilities";

describe("filterNavGroups", () => {
  it("hides control stub views by default", () => {
    const filtered = filterNavGroups(NAV_GROUPS);
    const views = filtered.flatMap((g) => g.items.map((i) => i.view));
    expect(views).not.toContain("control-portfolio");
    expect(views).not.toContain("control-fleet");
    expect(views).toContain("control-work-orders");
    expect(views).toContain("control-approvals");
  });

  it("shows control stub views when showControlStubs is true", () => {
    const filtered = filterNavGroups(NAV_GROUPS, { showControlStubs: true });
    const views = filtered.flatMap((g) => g.items.map((i) => i.view));
    expect(views).toContain("control-portfolio");
    expect(views).toContain("control-fleet");
  });

  it("shows only declared live EOS routes by default", () => {
    const filtered = filterNavGroups(EOS_NAV_GROUPS, {
      enforceRouteCapabilities: true,
    });
    const items = filtered.flatMap((group) => group.items);
    const views = items.map((item) => item.view);

    expect(views).toContain("agents");
    expect(views).toContain("model-routing");
    expect(views).not.toContain("agent-catalog");
    expect(views).not.toContain("dossier");
    expect(items.find((item) => item.view === "docs")?.badge).toBe("Global");
    expect(views).toEqual([
      "command-center",
      "missions",
      "control-work-orders",
      "tasks",
      "factory",
      "atc",
      "automations",
      "audit",
      "trace-inspector",
      "telemetry",
      "deployments",
      "skills",
      "memory",
      "docs",
      "projects",
      "agents",
      "identity",
      "model-routing",
      "operator-evals",
      "harness-loops",
    ]);
  });

  it("exposes preview and demo routes only through their explicit flags", () => {
    const previewViews = filterNavGroups(EOS_NAV_GROUPS, {
      enforceRouteCapabilities: true,
      showPreviewRoutes: true,
    }).flatMap((group) => group.items);
    const demoViews = filterNavGroups(EOS_NAV_GROUPS, {
      enforceRouteCapabilities: true,
      showDemoRoutes: true,
    }).flatMap((group) => group.items);

    expect(previewViews.find((item) => item.view === "effectiveness")).toBeUndefined();
    expect(previewViews.find((item) => item.view === "policies")?.badge).toBe("Preview");
    expect(previewViews.find((item) => item.view === "harness-loops")?.badge).toBeUndefined();
    expect(demoViews.find((item) => item.view === "dossier")?.badge).toBe("Demo");
  });

  it("requires an explicit capability declaration for every EOS navigation item", () => {
    const undeclared = EOS_NAV_GROUPS.flatMap((group) => group.items)
      .map((item) => item.view)
      .filter((view) => !hasDeclaredRouteCapability(view));

    expect(undeclared).toEqual([]);
  });
});
