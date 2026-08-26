import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  compareContractSnapshots,
  extractPublicConvexContracts,
  extractRuntimeContractVersion,
  runRuntimeContractGuard,
} from "./runtime-contract-guard.mjs";

const VERSION_SOURCE = "export const RUNTIME_CONTRACT_VERSION = 1;\n";

function publicQuery({ args = 'v.object({ limit: v.optional(v.number()) })', handler = "[]" } = {}) {
  return `
    import { query, internalQuery } from "./_generated/server";
    export const list = query({
      args: ${args},
      handler: async () => ${handler},
    });
    export const hidden = internalQuery({ args: {}, handler: async () => null });
  `;
}

function git(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" });
}

function createRepository() {
  const cwd = mkdtempSync(path.join(tmpdir(), "mc-runtime-contract-"));
  mkdirSync(path.join(cwd, "convex", "lib"), { recursive: true });
  writeFileSync(path.join(cwd, "convex", "alerts.ts"), publicQuery());
  writeFileSync(path.join(cwd, "convex", "lib", "runtimeContract.ts"), VERSION_SOURCE);
  git(cwd, ["init", "-q"]);
  git(cwd, ["config", "user.name", "Mission Control Test"]);
  git(cwd, ["config", "user.email", "test@mission-control.local"]);
  git(cwd, ["add", "convex"]);
  git(cwd, ["commit", "-qm", "base"]);
  return cwd;
}

describe("runtime contract extraction", () => {
  it("extracts public builders and excludes internal functions", () => {
    const contracts = extractPublicConvexContracts(publicQuery(), "convex/alerts.ts");

    expect([...contracts.keys()]).toEqual(["alerts:list"]);
    expect(contracts.get("alerts:list")).toMatchObject({ kind: "query", returns: null });
  });

  it("normalizes explicitly public wrappers to their Convex contract kind", () => {
    const contracts = extractPublicConvexContracts(`
      import { query } from "./_generated/server";
      const publicQuery = query;
      export const transitionMap = publicQuery({ args: {}, handler: async () => ({}) });
    `, "convex/tasks.ts");

    expect(contracts.get("tasks:transitionMap")).toMatchObject({ kind: "query" });
  });

  it("normalizes formatting while retaining validator structure", () => {
    const compact = extractPublicConvexContracts(
      publicQuery({ args: "v.object({limit:v.number()})" }),
      "convex/alerts.ts",
    );
    const formatted = extractPublicConvexContracts(
      publicQuery({ args: "v.object({ limit: v.number() })" }),
      "convex/alerts.ts",
    );

    expect(compareContractSnapshots(compact, formatted)).toEqual([]);
  });

  it("normalizes equivalent string literal styles", () => {
    const singleQuotes = extractPublicConvexContracts(
      publicQuery({ args: "v.object({ projectId: v.id('projects') })" }),
      "convex/alerts.ts",
    );
    const doubleQuotes = extractPublicConvexContracts(
      publicQuery({ args: 'v.object({ projectId: v.id("projects") })' }),
      "convex/alerts.ts",
    );

    expect(compareContractSnapshots(singleQuotes, doubleQuotes)).toEqual([]);
  });

  it("tracks local validator dependencies used by public arguments", () => {
    const source = (validator) => `
      import { query } from "./_generated/server";
      import { v } from "convex/values";
      const limitValidator = ${validator};
      export const list = query({ args: { limit: limitValidator }, handler: async () => [] });
    `;
    const base = extractPublicConvexContracts(source("v.number()"), "convex/alerts.ts");
    const current = extractPublicConvexContracts(
      source("v.optional(v.number())"),
      "convex/alerts.ts",
    );

    expect(compareContractSnapshots(base, current)).toEqual([
      { name: "alerts:list", reason: "args changed" },
    ]);
  });

  it("does not treat argument field names as local validator dependencies", () => {
    const source = (unrelatedValue) => `
      import { query } from "./_generated/server";
      import { v } from "convex/values";
      const status = ${unrelatedValue};
      export const list = query({ args: { status: v.string() }, handler: async () => status });
    `;
    const base = extractPublicConvexContracts(source('"OPEN"'), "convex/alerts.ts");
    const current = extractPublicConvexContracts(source('"CLOSED"'), "convex/alerts.ts");

    expect(compareContractSnapshots(base, current)).toEqual([]);
  });

  it("detects explicit return-validator changes", () => {
    const source = (returns) => `
      import { query } from "./_generated/server";
      import { v } from "convex/values";
      export const list = query({ args: {}, returns: ${returns}, handler: async () => [] });
    `;
    const base = extractPublicConvexContracts(source("v.array(v.string())"), "convex/alerts.ts");
    const current = extractPublicConvexContracts(
      source("v.array(v.object({ id: v.string() }))"),
      "convex/alerts.ts",
    );

    expect(compareContractSnapshots(base, current)).toEqual([
      { name: "alerts:list", reason: "returns changed" },
    ]);
  });

  it("reports added, removed, and validator changes", () => {
    const base = extractPublicConvexContracts(publicQuery(), "convex/alerts.ts");
    const current = extractPublicConvexContracts(
      publicQuery({ args: "v.object({ projectId: v.id('projects') })" }),
      "convex/alerts.ts",
    );

    expect(compareContractSnapshots(base, current)).toEqual([
      { name: "alerts:list", reason: "args changed" },
    ]);
    expect(compareContractSnapshots(new Map(), current)).toEqual([
      { name: "alerts:list", reason: "added" },
    ]);
    expect(compareContractSnapshots(base, new Map())).toEqual([
      { name: "alerts:list", reason: "removed" },
    ]);
  });

  it("requires a numeric literal runtime version", () => {
    expect(extractRuntimeContractVersion(VERSION_SOURCE)).toBe(1);
    expect(() => extractRuntimeContractVersion("export const OTHER = 1;")).toThrow(
      "RUNTIME_CONTRACT_VERSION must be a numeric literal",
    );
  });
});

describe("Git-base runtime contract guard", () => {
  it("uses HEAD when a temporary repository has no origin/main", () => {
    const cwd = createRepository();

    const result = runRuntimeContractGuard({ cwd });

    expect(result.ok).toBe(true);
    expect(result.changes).toEqual([]);
  });

  it("ignores handler-only implementation changes", () => {
    const cwd = createRepository();
    writeFileSync(
      path.join(cwd, "convex", "alerts.ts"),
      publicQuery({ handler: "[{ status: 'OPEN' }]" }),
    );

    const result = runRuntimeContractGuard({ cwd, baseRef: "HEAD" });

    expect(result.ok).toBe(true);
    expect(result.changes).toEqual([]);
  });

  it("fails a public validator change without a version increment", () => {
    const cwd = createRepository();
    writeFileSync(
      path.join(cwd, "convex", "alerts.ts"),
      publicQuery({ args: "v.object({ projectId: v.id('projects') })" }),
    );

    const result = runRuntimeContractGuard({ cwd, baseRef: "HEAD" });

    expect(result.ok).toBe(false);
    expect(result.message).toContain("without incrementing RUNTIME_CONTRACT_VERSION");
    expect(result.changes).toEqual([{ name: "alerts:list", reason: "args changed" }]);
  });

  it("accepts a public validator change with a version increment", () => {
    const cwd = createRepository();
    writeFileSync(
      path.join(cwd, "convex", "alerts.ts"),
      publicQuery({ args: "v.object({ projectId: v.id('projects') })" }),
    );
    writeFileSync(
      path.join(cwd, "convex", "lib", "runtimeContract.ts"),
      "export const RUNTIME_CONTRACT_VERSION = 2;\n",
    );

    const result = runRuntimeContractGuard({ cwd, baseRef: "HEAD" });

    expect(result.ok).toBe(true);
    expect(result.message).toContain("version v1 → v2");
  });

  it("reports a tracked public function file deleted from the worktree", () => {
    const cwd = createRepository();
    rmSync(path.join(cwd, "convex", "alerts.ts"));
    writeFileSync(
      path.join(cwd, "convex", "lib", "runtimeContract.ts"),
      "export const RUNTIME_CONTRACT_VERSION = 2;\n",
    );

    const result = runRuntimeContractGuard({ cwd, baseRef: "HEAD" });

    expect(result.ok).toBe(true);
    expect(result.changes).toEqual([{ name: "alerts:list", reason: "removed" }]);
  });
});
