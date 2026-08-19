import { describe, expect, it } from "vitest";
import type { Id } from "../_generated/dataModel";
import { executionRoutingRequested, sandboxProfileProductionEligible } from "../lib/executionRouting";

describe("execution routing rollout", () => {
  it("preserves legacy dispatch unless an exact Factory baseline or pin opts in", () => {
    expect(executionRoutingRequested({})).toBe(false);
    expect(executionRoutingRequested({
      factoryDefinitionVersionId: "factory-version" as Id<"factoryDefinitionVersions">,
    })).toBe(true);
    expect(executionRoutingRequested({
      executionRoutingPin: {
        factoryDefinitionVersionId: "factory-version" as Id<"factoryDefinitionVersions">,
        factoryConfigurationDigest: "sha256:frozen",
        reason: "Operator-selected exact tuple",
        pinnedBy: "operator",
        pinnedAt: 1,
      },
    })).toBe(true);
  });

  it("keeps qualification-only sandbox profiles out of production routing", () => {
    expect(sandboxProfileProductionEligible({ immutableSnapshot: {
      security: { qualificationOnly: true },
    } })).toBe(false);
    expect(sandboxProfileProductionEligible({ immutableSnapshot: {
      security: { qualificationOnly: false },
    } })).toBe(true);
    expect(sandboxProfileProductionEligible({ immutableSnapshot: {} })).toBe(true);
  });
});
