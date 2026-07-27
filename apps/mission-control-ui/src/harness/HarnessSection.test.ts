import { describe, expect, it } from "vitest";
import { HARNESS_VIEWS } from "../harness/harnessViews";

describe("harnessViews", () => {
  it("includes all conference-inspired pages", () => {
    expect(HARNESS_VIEWS).toContain("harness-patterns");
    expect(HARNESS_VIEWS).toContain("harness-architect");
    expect(HARNESS_VIEWS).toContain("harness-software-factory");
    expect(HARNESS_VIEWS).toContain("harness-workshop");
    expect(HARNESS_VIEWS).toContain("harness-automations");
    expect(HARNESS_VIEWS).toContain("harness-agent-fleet");
  });
});
