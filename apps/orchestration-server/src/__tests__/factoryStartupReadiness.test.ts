import { describe, expect, it } from "vitest";
import { evaluateFactoryStartupReadiness, parseFactoryVersionBindings } from "../factoryStartupReadiness.js";

const configured = {
  CONVEX_URL: "https://example.convex.cloud",
  CODEX_WORKER_PROJECT_ID: "project-1",
  CODEX_WORKER_REPOSITORY_ID: "repository-1",
  MISSION_CONTROL_SERVICE_COMMAND_SECRET: "secret-must-not-be-printed",
  CODEX_FACTORY_WORKER_ENABLED: "true",
  MISSION_CONTROL_ACCOUNTING_JOURNAL_DIR: "/var/lib/mission-control/accounting",
  CODEX_WORKER_FACTORY_VERSION_BINDINGS_JSON: JSON.stringify([{ repositoryId: "repository-1" }]),
};
const evaluate = (env: NodeJS.ProcessEnv = configured) => evaluateFactoryStartupReadiness({ env,
  platform: "darwin", architecture: "arm64", checkedAt: 123,
  codexHealth: { status: "READY" }, packageManager: { status: "PASS" } });

describe("factory startup diagnostic", () => {
  it("reports all missing prerequisites without stopping at the first setting", () => {
    const result = evaluate({});
    expect(result.localPrerequisites).toBe("BLOCKED");
    expect(result.checks.filter((check) => check.status === "FAIL").map((check) => check.id)).toEqual([
      "control-plane-url", "project-scope", "repository-scope", "service-signing", "worker-selection", "accounting-path", "factory-version-bindings",
    ]);
    expect(result.nextActions.length).toBeGreaterThan(2);
  });

  it("never turns configured local prerequisites into dispatch admission", () => {
    expect(evaluate()).toMatchObject({ localPrerequisites: "CHECKED", dispatchAdmission: "UNVERIFIED", executionAuthority: false });
    expect(evaluate().checks.find((check) => check.id === "service-registration")?.status).toBe("UNVERIFIED");
    expect(JSON.stringify(evaluate())).not.toContain(configured.MISSION_CONTROL_SERVICE_COMMAND_SECRET);
  });

  it.each(["https://user:secret@example.com", "https://example.com?token=secret", "https://example.com#secret", "http://example.com", "javascript:secret", "not-a-url"])("rejects unsafe backend input without printing it: %s", (url) => {
    const result = evaluate({ ...configured, CONVEX_URL: url });
    expect(result.checks.find((check) => check.id === "control-plane-url")?.status).toBe("FAIL");
    expect(JSON.stringify(result)).not.toContain(url);
  });

  it("accepts loopback configuration while retaining the unverified connection state", () => {
    expect(evaluate({ ...configured, CONVEX_URL: "http://127.0.0.1:3290" })).toMatchObject({ localPrerequisites: "CHECKED", dispatchAdmission: "UNVERIFIED" });
  });

  it.each([{ FACTORY_EXECUTION_ENABLED: "1" }, { SHADOW_PROVIDER_ONLY: "true" }, { MC_OFFLINE_FACTORY_WORKER_ENABLED: "1" }])("blocks incompatible or inference-denied execution: %j", (extra) => {
    expect(evaluate({ ...configured, ...extra }).checks.find((check) => check.id === "execution-mode")?.status).toBe("FAIL");
  });

  it("retains the actual Codex adapter failure", () => {
    const result = evaluateFactoryStartupReadiness({ env: configured, platform: "linux", architecture: "x64", checkedAt: 123,
      codexHealth: { status: "UNAVAILABLE" }, packageManager: { status: "PASS" } });
    expect(result.localPrerequisites).toBe("BLOCKED");
    expect(result.checks.find((check) => check.id === "codex-runtime")?.status).toBe("FAIL");
  });

  it("names an unset or /tmp TMPDIR when the Codex containment probe cannot be trusted", () => {
    const failing = (env: NodeJS.ProcessEnv, platform = "darwin") => evaluateFactoryStartupReadiness({ env, platform, architecture: "arm64", checkedAt: 123,
      codexHealth: { status: "UNAVAILABLE" }, packageManager: { status: "PASS" } }).checks.find((check) => check.id === "codex-runtime")!;
    for (const env of [configured, { ...configured, TMPDIR: "/tmp" }, { ...configured, TMPDIR: "/private/tmp/x" }]) {
      expect(failing(env)).toMatchObject({ status: "FAIL", settings: ["CODEX_EXECUTABLE", "TMPDIR"] });
      expect(failing(env).nextAction).toContain("DARWIN_USER_TEMP_DIR");
    }
    expect(failing({ ...configured, TMPDIR: "/var/folders/1h/abc/T/" }).nextAction).not.toContain("TMPDIR");
    expect(failing(configured, "linux").nextAction).not.toContain("TMPDIR");
    const ready = evaluateFactoryStartupReadiness({ env: configured, platform: "darwin", architecture: "arm64", checkedAt: 123,
      codexHealth: { status: "READY" }, packageManager: { status: "PASS" } }).checks.find((check) => check.id === "codex-runtime")!;
    expect(ready).toMatchObject({ status: "PASS", settings: ["CODEX_EXECUTABLE"] });
  });

  it("does not qualify unprobed providers", () => {
    const result = evaluate({ ...configured, CODEX_FACTORY_WORKER_ENABLED: "false", CODEX_BEDROCK_HARNESS_ENABLED: "1" });
    expect(result.checks.find((check) => check.id === "provider-admission")?.status).toBe("UNVERIFIED");
    expect(result.dispatchAdmission).toBe("UNVERIFIED");
  });

  it("blocks Fab on Linux without changing its native guard", () => {
    const result = evaluateFactoryStartupReadiness({ env: { ...configured, FAB_EXECUTOR_ENABLED: "1" }, platform: "linux", architecture: "x64", checkedAt: 123 });
    expect(result.checks.find((check) => check.id === "fab-platform")?.status).toBe("FAIL");
  });

  it("rejects malformed and cross-repository binding input without leaking its content", () => {
    for (const input of ["secret-malformed-json", JSON.stringify([{ repositoryId: "secret-other-repo" }])]) {
      const result = evaluate({ ...configured, CODEX_WORKER_FACTORY_VERSION_BINDINGS_JSON: input });
      expect(result.checks.find((check) => check.id === "factory-version-bindings")?.status).toBe("FAIL");
      expect(JSON.stringify(result)).not.toContain(input);
    }
  });

  it("does not equate configured accounting storage with validated durability", () => {
    expect(evaluate({ ...configured, MISSION_CONTROL_ACCOUNTING_JOURNAL_DIR: "relative/path" }).localPrerequisites).toBe("BLOCKED");
    expect(evaluate().checks.find((check) => check.id === "accounting-path")?.nextAction).toContain("durability");
  });
});

describe("shared factory binding parser", () => {
  it("preserves valid startup binding data and absence", () => {
    expect(parseFactoryVersionBindings(undefined, "repository-1")).toBeUndefined();
    expect(parseFactoryVersionBindings(configured.CODEX_WORKER_FACTORY_VERSION_BINDINGS_JSON, "repository-1")).toEqual([{ repositoryId: "repository-1" }]);
  });
  it.each(["{}", "[]", "[null]", "[[]]", JSON.stringify(Array(33).fill({ repositoryId: "repository-1" }))])("rejects invalid binding collections: %s", (value) => {
    expect(() => parseFactoryVersionBindings(value, "repository-1")).toThrow();
  });
});
