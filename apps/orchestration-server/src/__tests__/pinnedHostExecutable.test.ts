import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, writeFile, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { pinHostExecutable } from "../pinnedHostExecutable.js";

const disposals: Array<() => Promise<unknown>> = [];
afterEach(async () => { for (const dispose of disposals.splice(0).reverse()) await dispose(); });
describe("verified host executable byte pin", () => {
  it("keeps the admitted bytes after the installation pathname is replaced", async () => {
    const root = await mkdtemp(join(tmpdir(), "mc-pin-test-")); disposals.push(() => rm(root, { recursive: true, force: true }));
    const source = join(root, "installed"); const original = Buffer.from("synthetic original executable bytes");
    await writeFile(source, original);
    const pinned = await pinHostExecutable(source, createHash("sha256").update(original).digest("hex")); disposals.push(pinned.dispose);
    await writeFile(source, "substituted executable");
    expect(pinned.executable).not.toBe(source);
    expect(await readFile(pinned.executable)).toEqual(original);
    await Promise.all([pinned.dispose(), pinned.dispose()]);
    await expect(readFile(pinned.executable)).rejects.toThrow();
  });
  it("rejects unadmitted bytes and symbolic links", async () => {
    const root = await mkdtemp(join(tmpdir(), "mc-pin-negative-")); disposals.push(() => rm(root, { recursive: true, force: true }));
    const source = join(root, "installed"), link = join(root, "link"); await writeFile(source, "original"); await symlink(source, link);
    await expect(pinHostExecutable(source, "0".repeat(64))).rejects.toThrow("admitted bytes");
    await expect(pinHostExecutable(link, createHash("sha256").update("original").digest("hex"))).rejects.toThrow();
  });
});
