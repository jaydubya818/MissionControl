import { execFile } from "node:child_process";
import { access, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installFrozenPnpmDependencies } from "../factoryGitRuntime.js";

const cleanup: string[] = [];
const execFileAsync = promisify(execFile);
beforeEach(() => {
  vi.stubEnv("MISSION_CONTROL_FACTORY_PNPM_CLI_PATH", undefined);
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(cleanup.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});
async function directory() {
  const result = await mkdtemp(path.join(tmpdir(), "mc-install-test-"));
  cleanup.push(result);
  return result;
}

describe("factory dependency installation", () => {
  it.each([
    { name: "no operator store", store: false, cacheMiss: true, expectedNetwork: ["1"] },
    { name: "populated operator store", store: true, cacheMiss: false, expectedNetwork: ["0"] },
    { name: "operator cache miss", store: true, cacheMiss: true, expectedNetwork: ["0", "1"] },
  ])("uses the expected install attempts for $name", async ({ store, cacheMiss, expectedNetwork }) => {
    const root = await directory();
    const configuredStore = store ? await realpath(await directory()) : null;
    const calls: Array<{ args: string[]; env: NodeJS.ProcessEnv }> = [];
    await installFrozenPnpmDependencies(root, {
      configuredStore,
      executePnpm: async (args, env) => {
        calls.push({ args, env });
        if (cacheMiss && args.includes("--offline")) throw new Error("Package not in store");
      },
    });
    expect(calls.map(({ env }) => env.COREPACK_ENABLE_NETWORK)).toEqual(expectedNetwork);
    for (const { args, env } of calls) {
      expect(args).toEqual(expect.arrayContaining([
        "install", "--frozen-lockfile", "--ignore-scripts", "--ignore-pnpmfile",
        "--config.userconfig=/dev/null", "--config.globalconfig=/dev/null",
        "--config.manage-package-manager-versions=false", "--config.side-effects-cache=false",
      ]));
      expect(args.includes("--offline")).toBe(env.COREPACK_ENABLE_NETWORK === "0");
      expect(env.npm_config_ignore_scripts).toBe("true");
      expect(env.NPM_CONFIG_IGNORE_SCRIPTS).toBe("true");
      expect(env.COREPACK_ENABLE_PROJECT_SPEC).toBe("0");
      expect(env.COREPACK_ENABLE_AUTO_PIN).toBe("0");
      expect(env.COREPACK_DEFAULT_TO_LATEST).toBe("0");
      expect(env.PATH).toBe("/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin");
      expect(args).toContain(`--store-dir=${configuredStore ?? path.join(env.HOME!, "store")}`);
      await expect(access(env.HOME!)).rejects.toMatchObject({ code: "ENOENT" });
    }
    if (configuredStore) await expect(access(configuredStore)).resolves.toBeUndefined();
  });

  it.each([false, true])("reports online failures and cleans scratch state (operator store: %s)", async (store) => {
    const calls: NodeJS.ProcessEnv[] = [];
    await expect(installFrozenPnpmDependencies(await directory(), {
      configuredStore: store ? await directory() : null,
      executePnpm: async (_args, env) => {
        calls.push(env);
        throw Object.assign(new Error("install failed"), {
          stderr: env.COREPACK_ENABLE_NETWORK === "0" ? "offline miss" : "registry unavailable",
        });
      },
    })).rejects.toThrow("Factory dependency preparation failed: registry unavailable");
    expect(calls).toHaveLength(store ? 2 : 1);
    for (const env of calls) await expect(access(env.HOME!)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects a relative or candidate-owned store before executing pnpm", async () => {
    const root = await directory();
    let invoked = false;
    for (const configuredStore of ["relative-store", root]) {
      await expect(installFrozenPnpmDependencies(root, {
        configuredStore,
        executePnpm: async () => { invoked = true; },
      })).rejects.toThrow(/must be absolute|must be outside/);
    }
    expect(invoked).toBe(false);
  });

  it("executes a canonical host CLI with the worker Node and scrubbed environment", async () => {
    const root = await directory();
    const host = await directory();
    const cli = path.join(host, "host pnpm.cjs");
    const link = path.join(host, "pnpm-link.cjs");
    const receipt = path.join(host, "receipt.json");
    await writeFile(cli, `require("node:fs").writeFileSync(${JSON.stringify(receipt)}, JSON.stringify({ execPath: process.execPath, argv: process.argv, env: process.env, cwd: process.cwd() }));\n`);
    await symlink(cli, link);
    vi.stubEnv("MISSION_CONTROL_FACTORY_PNPM_CLI_PATH", link);
    vi.stubEnv("PATH", root);
    vi.stubEnv("NODE_OPTIONS", "--require=/candidate/preload.cjs");
    vi.stubEnv("NODE_PATH", path.join(root, "node_modules"));
    vi.stubEnv("NPM_CONFIG_USERCONFIG", path.join(root, ".npmrc"));
    vi.stubEnv("MISSION_CONTROL_SERVICE_COMMAND_SECRET", "test-only-host-secret");

    await installFrozenPnpmDependencies(root, { configuredStore: null });

    const executed = JSON.parse(await readFile(receipt, "utf8"));
    expect(executed.execPath).toBe(process.execPath);
    expect(executed.argv.slice(0, 3)).toEqual([process.execPath, await realpath(cli), "install"]);
    expect(executed.cwd).toBe(await realpath(root));
    expect(executed.argv).toEqual(expect.arrayContaining(["--frozen-lockfile", "--ignore-scripts", "--ignore-pnpmfile"]));
    expect(executed.env.PATH).toBe("/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin");
    expect(executed.env.HOME).toBe(executed.env.TMPDIR);
    expect(executed.env.HOME).not.toBe(process.env.HOME);
    expect(executed.env.COREPACK_ENABLE_NETWORK).toBe("1");
    for (const key of ["NODE_OPTIONS", "NODE_PATH", "NPM_CONFIG_USERCONFIG", "MISSION_CONTROL_SERVICE_COMMAND_SECRET", "MISSION_CONTROL_FACTORY_PNPM_CLI_PATH"]) {
      expect(executed.env).not.toHaveProperty(key);
    }
    await expect(access(executed.env.HOME)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects relative paths and directories before executing the host CLI", async () => {
    let invoked = false;
    for (const cli of ["relative/pnpm.cjs", await directory()]) {
      vi.stubEnv("MISSION_CONTROL_FACTORY_PNPM_CLI_PATH", cli);
      await expect(installFrozenPnpmDependencies(await directory(), {
        configuredStore: null,
        executePnpm: async () => { invoked = true; },
      })).rejects.toThrow(/must be absolute|must resolve to a regular file/);
    }
    expect(invoked).toBe(false);
  });

  it("rejects candidate CLI paths and symlinks in both directions", async () => {
    const root = await directory();
    const host = await directory();
    const candidateCli = path.join(root, "candidate.cjs");
    const hostCli = path.join(host, "host.cjs");
    const candidateLink = path.join(root, "host-link.cjs");
    const hostLink = path.join(host, "candidate-link.cjs");
    const rootLink = path.join(host, "candidate-root");
    await writeFile(candidateCli, "throw new Error('candidate CLI executed');\n");
    await writeFile(hostCli, "throw new Error('host CLI executed');\n");
    await symlink(hostCli, candidateLink);
    await symlink(candidateCli, hostLink);
    await symlink(root, rootLink);
    let invoked = false;
    for (const cli of [candidateCli, candidateLink, hostLink, path.join(rootLink, "host-link.cjs")]) {
      vi.stubEnv("MISSION_CONTROL_FACTORY_PNPM_CLI_PATH", cli);
      await expect(installFrozenPnpmDependencies(rootLink, {
        configuredStore: null,
        executePnpm: async () => { invoked = true; },
      })).rejects.toThrow("The host pnpm CLI must be outside the candidate worktree.");
    }
    expect(invoked).toBe(false);
  });

  it("reports the missing configured CLI path with its error code", async () => {
    const cli = path.join(await directory(), "missing.cjs");
    vi.stubEnv("MISSION_CONTROL_FACTORY_PNPM_CLI_PATH", cli);
    await expect(installFrozenPnpmDependencies(await directory(), { configuredStore: null }))
      .rejects.toMatchObject({ code: "ENOENT", message: expect.stringContaining(cli) });
  });

  it("preserves a missing executable diagnostic when stderr and stdout are empty", async () => {
    const executable = path.join(await directory(), "missing-pnpm");
    await expect(installFrozenPnpmDependencies(await directory(), {
      configuredStore: null,
      executePnpm: async (args, env) => { await execFileAsync(executable, args, { env }); },
    })).rejects.toMatchObject({
      code: "ENOENT",
      message: `Factory dependency preparation failed (ENOENT): spawn ${executable} ENOENT`,
    });
  });

  it.each([
    { stderr: "registry unavailable", stdout: "package details", expected: "registry unavailable" },
    { stderr: "  \n", stdout: "package details", expected: "package details" },
    { stderr: "", stdout: "", expected: "install failed" },
  ])("reports the first nonempty failure detail: $expected", async ({ stderr, stdout, expected }) => {
    await expect(installFrozenPnpmDependencies(await directory(), {
      configuredStore: null,
      executePnpm: async () => { throw Object.assign(new Error("install failed"), { stderr, stdout, code: 1 }); },
    })).rejects.toMatchObject({ code: 1, message: `Factory dependency preparation failed (1): ${expected}` });
  });
});
