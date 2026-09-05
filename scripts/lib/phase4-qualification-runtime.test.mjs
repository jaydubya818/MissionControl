import { mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertPhase4SourceQuiescent,
  phase4BackendArguments,
  phase4CliEnvironment,
  phase4UiEnvironment,
  readPhase4SourceRuntime,
  writePhase4WorkerEnvironment,
} from "./phase4-qualification-runtime.mjs";

const roots = [];
afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("Phase 4 isolated qualification runtime", () => {
  it("builds an isolated no-beacon backend and UI environment", () => {
    const runtime = {
      adminKey: "secret-admin-key",
      backendBinary: "/tmp/backend",
      cloudPort: 3224,
      convexUrl: "http://127.0.0.1:3224",
      databasePath: "/tmp/qualification/database.sqlite3",
      instanceName: "phase4-real-mcp-qualification-test",
      instanceSecret: "secret-instance-key",
      sitePort: 3225,
      storagePath: "/tmp/qualification/storage",
      uiPort: 5199,
    };
    expect(phase4BackendArguments(runtime)).toEqual(expect.arrayContaining([
      "--disable-beacon", "/tmp/qualification/database.sqlite3", "--local-storage", "/tmp/qualification/storage",
    ]));
    expect(phase4CliEnvironment(runtime, { CONVEX_DEPLOYMENT: "shared", KEEP: "yes" })).toMatchObject({
      CONVEX_SELF_HOSTED_URL: runtime.convexUrl,
      CONVEX_SELF_HOSTED_ADMIN_KEY: runtime.adminKey,
      KEEP: "yes",
    });
    expect(phase4CliEnvironment(runtime, { CONVEX_DEPLOYMENT: "shared" })).not.toHaveProperty("CONVEX_DEPLOYMENT");
    expect(phase4UiEnvironment(runtime, {})).toMatchObject({
      VITE_CONVEX_URL: runtime.convexUrl,
      VITE_AUTH_MODE: "demo",
      VITE_FLAG_UI_SHELL_V2: "true",
    });
  });

  it("requires the source backend, database, and storage", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "phase4-runtime-test-"));
    roots.push(root);
    const home = path.join(root, "home");
    const state = path.join(root, "state");
    mkdirSync(state, { recursive: true });
    writeFileSync(path.join(state, "config.json"), JSON.stringify({ backendVersion: "test-version", ports: { cloud: 3214, site: 3215 } }));
    vi.stubEnv("HOME", home);
    expect(() => readPhase4SourceRuntime(path.join(state, "config.json"))).toThrow("backend binary is unavailable");
    expect(readFileSync(path.join(state, "config.json"), "utf8")).toContain("test-version");
  });

  it("fails closed unless the source backend is stopped and SQLite has no active sidecars", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "phase4-source-quiescence-test-"));
    roots.push(root);
    const databasePath = path.join(root, "database.sqlite3");
    writeFileSync(databasePath, "fixture");
    const source = { databasePath, ports: [3214, 3215] };
    await expect(assertPhase4SourceQuiescent(source, async (port) => port === 3214))
      .rejects.toThrow("source backend must be stopped");
    writeFileSync(`${databasePath}-wal`, "active");
    await expect(assertPhase4SourceQuiescent(source, async () => false))
      .rejects.toThrow("active SQLite sidecar");
    rmSync(`${databasePath}-wal`);
    await expect(assertPhase4SourceQuiescent(source, async () => false)).resolves.toBeUndefined();
  });

  it("writes a private worker environment for the disposable service-command secret", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "phase4-worker-env-test-"));
    roots.push(root);
    const environmentPath = writePhase4WorkerEnvironment(root, {
      convexUrl: "http://127.0.0.1:3224",
      serviceCommandSecret: "qualification-secret",
    });
    expect(readFileSync(environmentPath, "utf8")).toBe([
      "CONVEX_URL=http://127.0.0.1:3224",
      "MISSION_CONTROL_SERVICE_COMMAND_SECRET=qualification-secret",
      "",
    ].join("\n"));
    expect(statSync(environmentPath).mode & 0o777).toBe(0o600);
  });
});
