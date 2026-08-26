import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(process.cwd(), "scripts/codex-factory-worker.ts"), "utf8");

describe("retired direct Codex factory worker", () => {
  it("fails explicitly and directs operators to the canonical runtime", () => {
    expect(source).toContain("Retired in Runtime Contract v33");
    expect(source).toContain("throw new Error(");
    expect(source).toContain("Start mission-control-orchestration instead.");
  });

  it("does not retain the legacy worker loop or task controls", () => {
    expect(source).not.toContain("FACTORY_TASK_TIMEOUT_MS");
    expect(source).not.toContain("FACTORY_MAX_TASKS");
    expect(source).not.toContain("activeExecutionController");
    expect(source).not.toContain("api.tasks.");
  });
});
