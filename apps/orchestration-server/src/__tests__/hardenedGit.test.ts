import { afterEach, describe, expect, it, vi } from "vitest";
import { hardenedGitArgs, hardenedGitEnvironment } from "../hardenedGit.js";

afterEach(() => vi.unstubAllEnvs());

describe("Factory hardened Git subprocess context", () => {
  it("drops ambient repository/config/hook redirection while preserving operator identity", () => {
    vi.stubEnv("GIT_DIR", "/tmp/attacker");
    vi.stubEnv("GIT_CONFIG_COUNT", "1");
    vi.stubEnv("GIT_CONFIG_KEY_0", "core.hooksPath");
    vi.stubEnv("GIT_CONFIG_VALUE_0", "/tmp/hooks");
    vi.stubEnv("GIT_AUTHOR_NAME", "Repository Operator");
    vi.stubEnv("GIT_AUTHOR_EMAIL", "operator@example.test");
    const env = hardenedGitEnvironment();
    expect(env).not.toHaveProperty("GIT_DIR");
    expect(env).not.toHaveProperty("GIT_CONFIG_COUNT");
    expect(env).not.toHaveProperty("GIT_CONFIG_KEY_0");
    expect(env).not.toHaveProperty("GIT_CONFIG_VALUE_0");
    expect(env).toMatchObject({ GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_AUTHOR_NAME: "Repository Operator", GIT_AUTHOR_EMAIL: "operator@example.test" });
    expect(hardenedGitArgs(["status"])).toEqual(["-c", "core.fsmonitor=false", "-c", "core.hooksPath=/dev/null",
      "-c", "protocol.file.allow=never", "status"]);
  });
});
