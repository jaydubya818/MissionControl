import { describe, expect, it } from "vitest";
import {
  isRegistryView,
  registryTabFromView,
  registryViewFromTab,
} from "./registryViews";

describe("registryViews", () => {
  it("maps views to tabs and back", () => {
    expect(registryTabFromView("registry-lifecycle")).toBe("lifecycle");
    expect(registryViewFromTab("lifecycle")).toBe("registry-lifecycle");
    expect(registryTabFromView("skills")).toBe("catalog");
    expect(registryViewFromTab("catalog")).toBe("skills");
  });

  it("identifies registry routes", () => {
    expect(isRegistryView("registry-runs")).toBe(true);
    expect(isRegistryView("harness-health")).toBe(false);
  });
});
