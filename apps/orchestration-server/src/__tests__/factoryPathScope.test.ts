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
      invalidPaths: [],
    });
  });

  it("fails the scope gate closed for paths that cannot be normalized", () => {
    // Regression: unnormalizable entries used to be dropped by `.filter(Boolean)`,
    // so an absolute or traversing path could never appear in outsideScope and
    // the gate returned ok:true for exactly the inputs it exists to reject.
    const result = validateChangedFileScope(
      ["apps/ui/src/App.tsx", "/etc/shadow", "../../outside.ts", ""],
      { allowedPaths: ["apps/ui/**"], excludedPaths: [] }
    );
    expect(result.ok).toBe(false);
    expect(result.invalidPaths).toEqual(["", "../../outside.ts", "/etc/shadow"]);
    expect(result.outsideScope).toEqual(expect.arrayContaining(["/etc/shadow", "../../outside.ts"]));
    // Rejected entries stay visible in changedFiles so a caller rendering
    // "what changed" cannot disagree with the gate that blocked it.
    expect(result.changedFiles).toEqual(["", "../../outside.ts", "/etc/shadow", "apps/ui/src/App.tsx"]);
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
