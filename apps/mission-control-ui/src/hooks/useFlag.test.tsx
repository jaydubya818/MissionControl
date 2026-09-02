import { renderHook } from "@testing-library/react";
import { useQuery } from "convex/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useFlag } from "./useFlag";

vi.mock("convex/react", () => ({ useQuery: vi.fn() }));
vi.mock("../../../../convex/_generated/api", () => ({
  api: { featureFlags: { isEnabled: "featureFlags:isEnabled" } },
}));

describe("useFlag", () => {
  beforeEach(() => {
    vi.mocked(useQuery).mockReset();
    vi.mocked(useQuery).mockReturnValue(true);
  });

  it("resolves a project-scoped flag against the active workspace", () => {
    const projectId = "project-1" as never;

    const { result } = renderHook(() =>
      useFlag("missions.plan-release-v1", projectId),
    );

    expect(result.current).toBe(true);
    expect(useQuery).toHaveBeenCalledWith("featureFlags:isEnabled", {
      key: "missions.plan-release-v1",
      projectId,
    });
  });

  it("preserves global flag resolution when no workspace is supplied", () => {
    renderHook(() => useFlag("ui.shell.v2"));

    expect(useQuery).toHaveBeenCalledWith("featureFlags:isEnabled", {
      key: "ui.shell.v2",
      projectId: undefined,
    });
  });
});
