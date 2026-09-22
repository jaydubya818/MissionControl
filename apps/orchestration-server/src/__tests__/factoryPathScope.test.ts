import { describe, expect, it } from "vitest";
import { assertWorktreeBoundary, matchesRepositoryPattern, validateChangedFileScope } from "../factoryPathScope.js";

describe("Factory path scope", () => {
  it("allows included files and lets exclusions win", () => {
    expect(validateChangedFileScope(
      ["apps/ui/src/App.tsx", "apps/ui/generated/schema.ts"],
      { allowedPaths: ["apps/ui/**"], excludedPaths: ["apps/ui/generated/**"] }
    )).toEqual({
      ok: false,
      changedFiles: ["apps/ui/generated/schema.ts", "apps/ui/src/App.tsx"],
      outsideScope: ["apps/ui/generated/schema.ts"],
    });
  });

  it("ignores factory-owned skill materialization", () => {
    expect(validateChangedFileScope(
      [
        "app/api/health/route.ts",
        ".mission-control/skills/mission-control-delivery/SKILL.md",
        ".mission-control/skills/poteto-mode/SKILL.md",
      ],
      { allowedPaths: ["app/**"], excludedPaths: [] },
    )).toEqual({
      ok: true,
      changedFiles: ["app/api/health/route.ts"],
      outsideScope: [],
    });
  });

  it("treats a non-glob directory as a subtree", () => {
    expect(matchesRepositoryPattern("convex/factory/attempts.ts", "convex")).toBe(true);
    expect(matchesRepositoryPattern("apps/ui/App.tsx", "convex")).toBe(false);
  });

  it("requires attempt worktrees under the governed checkout root", () => {
    expect(assertWorktreeBoundary("/repo", "/repo/.mission-control/worktrees/attempt-1").worktree).toBe("/repo/.mission-control/worktrees/attempt-1");
    expect(() => assertWorktreeBoundary("/repo", "/tmp/attempt-1")).toThrow(/attempt-specific/);
    expect(() => assertWorktreeBoundary("/repo", "/repo/.mission-control/worktrees")).toThrow(/attempt-specific/);
  });
});
