import { describe, expect, it } from "vitest";
import { mapCheckRunsToSignals } from "../lib/githubCiIngest";
import { buildFileTreeFromPaths } from "../lib/fileTree";

describe("githubCiIngest", () => {
  it("maps GitHub check runs to CI signals", () => {
    const mapped = mapCheckRunsToSignals([
      { name: "unit-tests", status: "completed", conclusion: "success" },
      { name: "vitest", status: "completed", conclusion: "failure" },
      { name: "lint", status: "completed", conclusion: "success" },
    ]);
    expect(mapped.ciStatus).toBe("FAIL");
    expect(mapped.testPassCount).toBe(1);
    expect(mapped.testFailCount).toBe(1);
  });
});

describe("fileTree", () => {
  it("builds nested folders from flat paths", () => {
    const tree = buildFileTreeFromPaths([
      "skills/foo/SKILL.md",
      "skills/foo/docs/guide.md",
    ]);
    expect(tree[0]?.kind).toBe("folder");
    expect(tree[0]?.children?.length).toBeGreaterThan(0);
  });
});
