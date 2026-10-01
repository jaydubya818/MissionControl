import { describe, expect, it } from "vitest";
import { EOS_NAV_GROUPS } from "./eosNavConfig";
import {
  BASIC_VIEWS,
  countHiddenByLevel,
  filterNavGroupsByLevel,
  isViewAboveLevel,
  minimumLevelForView,
} from "./navLevel";

const viewsOf = (groups: ReturnType<typeof filterNavGroupsByLevel>) =>
  groups.flatMap((g) => g.items.map((i) => i.view as string));

describe("progressive navigation levels", () => {
  it("shows 8 or fewer destinations at Basic", () => {
    const visible = viewsOf(filterNavGroupsByLevel(EOS_NAV_GROUPS, "basic"));
    expect(visible.length).toBeGreaterThan(0);
    expect(visible.length).toBeLessThanOrEqual(8);
  });

  it("every Basic view exists in the V2 navigation", () => {
    const all = new Set(viewsOf(EOS_NAV_GROUPS));
    for (const view of BASIC_VIEWS) expect(all.has(view)).toBe(true);
  });

  it("Intermediate is a strict superset of Basic and Advanced shows everything", () => {
    const basic = viewsOf(filterNavGroupsByLevel(EOS_NAV_GROUPS, "basic"));
    const mid = viewsOf(filterNavGroupsByLevel(EOS_NAV_GROUPS, "intermediate"));
    const adv = viewsOf(filterNavGroupsByLevel(EOS_NAV_GROUPS, "advanced"));
    expect(mid.length).toBeGreaterThan(basic.length);
    for (const view of basic) expect(mid).toContain(view);
    expect(adv).toEqual(viewsOf(EOS_NAV_GROUPS));
  });

  it("keeps a deep-linked view visible and flags it as above the level", () => {
    const visible = viewsOf(
      filterNavGroupsByLevel(EOS_NAV_GROUPS, "basic", { keepVisible: ["policies"] }),
    );
    expect(visible).toContain("policies");
    expect(isViewAboveLevel("policies", "basic")).toBe(true);
    expect(isViewAboveLevel("missions", "basic")).toBe(false);
  });

  it("drops groups that end up empty and does not mutate the source", () => {
    const before = JSON.stringify(EOS_NAV_GROUPS.map((g) => g.items.length));
    const basic = filterNavGroupsByLevel(EOS_NAV_GROUPS, "basic");
    expect(basic.every((g) => g.items.length > 0)).toBe(true);
    expect(JSON.stringify(EOS_NAV_GROUPS.map((g) => g.items.length))).toBe(before);
  });

  it("counts what a higher level would reveal", () => {
    expect(countHiddenByLevel(EOS_NAV_GROUPS, "advanced")).toBe(0);
    expect(countHiddenByLevel(EOS_NAV_GROUPS, "basic")).toBeGreaterThan(
      countHiddenByLevel(EOS_NAV_GROUPS, "intermediate"),
    );
  });

  it("classifies unknown views as Advanced", () => {
    expect(minimumLevelForView("some-new-view")).toBe("advanced");
  });
});
