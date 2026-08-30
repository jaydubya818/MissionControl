import { describe, expect, it } from "vitest";
import {
  initialViewFromLocation,
  shouldAutoCollapseChat,
  shouldDeferRouteWrite,
  viewFromPath,
} from "./AppShellV2";

const VIEWS = ["command-center", "agents", "model-routing", "automations", "automation-runs", "missions", "mission-detail"];

describe("v2 route synchronization", () => {
  it("reads a declared v2 view from a deep link", () => {
    expect(viewFromPath("/v2/agents", VIEWS)).toBe("agents");
    expect(viewFromPath("/v2/automations/automation-1", VIEWS)).toBe("automations");
    expect(viewFromPath("/v2/automation-runs/run-1", VIEWS)).toBe("automation-runs");
    expect(viewFromPath("/v2/not-a-view", VIEWS)).toBeNull();
  });

  it("does not overwrite a direct deep link with persisted view state", () => {
    expect(shouldDeferRouteWrite("/v2/agents", VIEWS, "command-center")).toBe(true);
    expect(shouldDeferRouteWrite("/v2/agents", VIEWS, "agents")).toBe(false);
    expect(
      initialViewFromLocation("/v2/model-routing", VIEWS, "home")
    ).toBe("model-routing");
    expect(
      initialViewFromLocation("/v2/not-a-view", VIEWS, "command-center")
    ).toBe("command-center");
  });

  it("maps canonical and legacy Mission details to the existing detail view", () => {
    expect(
      viewFromPath(
        "/v2/missions/mission-123",
        VIEWS,
        "?workspace=workspace-1"
      )
    ).toBe("mission-detail");
    expect(
      viewFromPath(
        "/v2/missions",
        VIEWS,
        "?workspace=workspace-1&mission=mission-123"
      )
    ).toBe("mission-detail");
    expect(
      shouldDeferRouteWrite(
        "/v2/missions/mission-123",
        VIEWS,
        "missions",
        "?workspace=workspace-1"
      )
    ).toBe(true);
  });

  it("prioritizes dense Plan and review surfaces on constrained desktop widths", () => {
    expect(shouldAutoCollapseChat("mission-detail", true)).toBe(true);
    expect(shouldAutoCollapseChat("harness-change-review", true)).toBe(true);
    expect(shouldAutoCollapseChat("command-center", true)).toBe(false);
    expect(shouldAutoCollapseChat("mission-detail", false)).toBe(false);
  });
});
