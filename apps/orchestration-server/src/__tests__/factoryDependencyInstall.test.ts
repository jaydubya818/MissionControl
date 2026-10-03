import { access, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { installFrozenPnpmDependencies } from "../factoryGitRuntime.js";

const cleanup: string[] = [];
afterEach(async () => {
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
      expect(env.COREPACK_ENABLE_PROJECT_SPEC).toBe("0");
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
});
