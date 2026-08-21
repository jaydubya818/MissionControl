import { describe, expect, it } from "vitest";
import { EOS_NAV_GROUPS } from "./eosNavConfig";
import { NAV_GROUPS } from "./navConfig";
import { filterNavGroups } from "./navFilter";
import { hasDeclaredRouteCapability, routeCapability } from "./routeCapabilities";

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
      "trace-inspector",
      "agents",
      "atc",
      "automations",
      "audit",
      "telemetry",
      "operator-evals",
      "harness-loops",
      "skills",
      "memory",
      "docs",
      "identity",
      "deployments",
      "projects",
      "model-routing",
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
    expect(previewViews.find((item) => item.view === "dag")?.badge).toBe("Preview");
    expect(previewViews.find((item) => item.view === "harness-loops")?.badge).toBeUndefined();
    expect(demoViews.find((item) => item.view === "dossier")?.badge).toBe("Demo");
  });

  it("labels non-live routes even when capability enforcement is off", () => {
    // Regression: `enforceRouteCapabilities` defaults to false (the
    // `eos.command-center-preview` flag ships default-off), which meant the
    // default shell rendered ~100 routes — including demo-only and mock-backed
    // ones — with no Preview/Demo badge, indistinguishable from governed Live
    // surfaces. Enforcement decides whether a route is HIDDEN; it must not
    // decide whether the operator can tell what a route is.
    const items = filterNavGroups(NAV_GROUPS).flatMap((group) => group.items);
    const byView = new Map(items.map((item) => [item.view, item]));

    expect(byView.get("control-work-orders")?.badge).toBeUndefined();
    expect(byView.get("dag")?.badge).toBe("Preview");
    expect(byView.get("docs")?.badge).toBe("Global");

    // Every non-Live route carries a maturity badge — asserted as a property
    // over the whole nav rather than against specific ids, so declaring a
    // capability for any route cannot break this test without an actual
    // behaviour regression.
    for (const item of items) {
      const capability = routeCapability(item.view);
      if (capability.maturity === "live") continue;
      expect(item.badge, `${item.view} (${capability.maturity}) must be labelled`).toBeDefined();
    }
  });

  it("requires an explicit capability declaration for every EOS navigation item", () => {
    const undeclared = EOS_NAV_GROUPS.flatMap((group) => group.items)
      .map((item) => item.view)
      .filter((view) => !hasDeclaredRouteCapability(view));

    expect(undeclared).toEqual([]);
  });
});
