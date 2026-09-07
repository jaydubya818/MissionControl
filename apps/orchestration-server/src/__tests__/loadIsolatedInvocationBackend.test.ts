import { mkdtemp, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadIsolatedInvocationBackend } from "../loadIsolatedInvocationBackend.js";
const directories: string[] = [];
afterEach(async () => { for (const path of directories.splice(0)) await rm(path, { recursive: true, force: true }); });
describe("exact isolated backend loading", () => {
  it("rejects substituted code before its top-level code can execute", async () => {
    const directory = await mkdtemp(join(tmpdir(), "isolated-loader-test-")); directories.push(directory);
    const path = join(directory, "backend.mjs");
    await writeFile(path, "throw new Error('UNTRUSTED_MODULE_EXECUTED');");
    await expect(loadIsolatedInvocationBackend(path)).rejects.toThrow("does not match the registered implementation");
  });
  it("rejects symlinks and unbounded bundles before import", async () => {
    const directory = await mkdtemp(join(tmpdir(), "isolated-loader-test-")); directories.push(directory);
    const path = join(directory, "backend.mjs");
    await writeFile(path, " ".repeat(256_001));
    await expect(loadIsolatedInvocationBackend(path)).rejects.toThrow("size or kind");
    const alias = join(directory, "alias.mjs"); await symlink(path, alias);
    await expect(loadIsolatedInvocationBackend(alias)).rejects.toThrow();
  });
});
