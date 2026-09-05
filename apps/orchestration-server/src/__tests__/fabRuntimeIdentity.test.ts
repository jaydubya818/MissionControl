import { cpSync, existsSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { fabPackageClosure, verifyFabRuntime } from "../fabRuntimeIdentity.js";

const cleanup: string[] = [];
afterEach(() => { for (const root of cleanup.splice(0)) rmSync(root, { force: true, recursive: true }); });
describe("Fab executable and package identity", () => {
  it("binds installed package bytes and the actual Node executable, and detects substitution", () => {
    const root = mkdtempSync("/private/tmp/fab-runtime-identity-"); cleanup.push(root);
    const installed = createRequire(import.meta.url).resolve.paths("@fdlc/fab")!
      .map(searchRoot => path.join(searchRoot, "@fdlc/fab"))
      .find(candidate => existsSync(path.join(candidate, "dist/index.js")))!;
    cpSync(realpathSync(installed), root, { recursive: true });
    const identity = verifyFabRuntime(root);
    expect(identity.executableSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(identity.closureSha256).toBe(fabPackageClosure(root));
    writeFileSync(path.join(root, "dist/index.js"), "changed runtime");
    expect(() => verifyFabRuntime(root)).toThrow("pinned");
  });
  it("rejects linked files even when their target bytes are readable", () => {
    const root = mkdtempSync("/private/tmp/fab-runtime-link-"); cleanup.push(root);
    symlinkSync(process.execPath, path.join(root, "node"));
    expect(() => fabPackageClosure(root)).toThrow("linked");
  });
});
