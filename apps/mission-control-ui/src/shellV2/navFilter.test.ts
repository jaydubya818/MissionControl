import { describe, expect, it } from "vitest";
import { NAV_GROUPS } from "./navConfig";
import { filterNavGroups } from "./navFilter";

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
});
