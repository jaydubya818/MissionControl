import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdir, writeFile, rm, symlink, readFile, chmod, link } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { canonicalJson, sha256Hex } from "@mission-control/shared";
import { attestLocalQualificationRepository } from "../localQualificationRepository.js";
import { hardenedGitArgs, hardenedGitEnvironment } from "../hardenedGit.js";
const roots: string[] = [];
afterEach(async () => { vi.unstubAllEnvs(); for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function fixture() {
  const parent = `/private/tmp/mc-local-qualification-${randomBytes(16).toString("hex")}`;
  roots.push(parent); await mkdir(parent, { mode: 0o700 });
  const root = `${parent}/repository`; await mkdir(root);
  const env = { PATH: process.env.PATH, HOME: parent, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" };
  const git = (...args: string[]) => execFileSync("git", ["-c", "user.name=Synthetic Fixture", "-c", "user.email=fixture@example.test", ...args], { cwd: root, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  git("init", "-b", "main");
  const files = [{ path: ".gitignore", content: ".mission-control/\n" }, { path: "README.md", content: "# Synthetic fixture\n" }];
  for (const file of files) await writeFile(`${root}/${file.path}`, file.content);
  git("add", "."); git("commit", "-m", "Synthetic baseline");
  const binding = { root, fixtureId: "owned-fixture", digest: `sha256:${sha256Hex(root)}`, baselineCommit: git("rev-parse", "HEAD"),
    baselineTree: git("rev-parse", "HEAD^{tree}"), fixtureContentDigest: `sha256:${sha256Hex(canonicalJson(files.map(f => ({ path: f.path, contentDigest: `sha256:${sha256Hex(f.content)}` }))))}` };
  await writeFile(`${parent}/qualification-owner.json`, JSON.stringify({ schema: "local-qualification-owner/v1", fixtureId: binding.fixtureId,
    admissionDigest: binding.digest, root }));
  return { parent, root, git, binding };
}
describe("real disposable repository ownership controls", () => {
  it("attests exact owned no-remote source bytes", async () => {
    const f = await fixture(); expect(await attestLocalQualificationRepository(f.binding)).toMatchObject({ noRemotes: true, root: f.root, baselineCommit: f.binding.baselineCommit });
  });
  it("commits a candidate with scoped identity while preserving the admitted repository config", async () => {
    const f = await fixture();
    const originalConfig = await readFile(`${f.root}/.git/config`, "utf8");
    for (const role of ["AUTHOR", "COMMITTER"]) {
      vi.stubEnv(`GIT_${role}_NAME`, "Synthetic Qualification");
      vi.stubEnv(`GIT_${role}_EMAIL`, "qualification@example.test");
    }
    // Match the canonical worker's hardened Git environment with no global config.
    const candidate = `${f.parent}/candidate`;
    f.git("worktree", "add", "--detach", candidate, f.binding.baselineCommit);
    const git = (...args: string[]) => execFileSync("git", hardenedGitArgs(args), {
      cwd: candidate, env: hardenedGitEnvironment(), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
    }).trim();
    await writeFile(`${candidate}/README.md`, "# Verified synthetic candidate\n");
    git("add", "README.md"); git("commit", "-m", "Synthetic candidate");
    expect(git("log", "-1", "--format=%an <%ae>|%cn <%ce>")).toBe(
      "Synthetic Qualification <qualification@example.test>|Synthetic Qualification <qualification@example.test>");
    expect(git("rev-parse", "HEAD")).not.toBe(f.binding.baselineCommit);
    expect(await readFile(`${f.root}/.git/config`, "utf8")).toBe(originalConfig);
    expect(await attestLocalQualificationRepository(f.binding)).toMatchObject({ noRemotes: true });
    // Persisting author config is still outside the admitted repository contract.
    f.git("config", "--local", "user.name", "Synthetic Qualification");
    await expect(attestLocalQualificationRepository(f.binding)).rejects.toThrow("unadmitted behavior");
  });
  it("rejects unrelated roots and parent traversal", async () => {
    const f = await fixture(); const other = await fixture();
    await expect(attestLocalQualificationRepository({ ...f.binding, root: other.root })).rejects.toThrow();
    await expect(attestLocalQualificationRepository({ ...f.binding, root: f.root + "/../repository" })).rejects.toThrow();
  });
  it("rejects symlink root and file escape without altering the target", async () => {
    const f = await fixture(); const other = await fixture();
    await rm(f.root, { recursive: true }); await symlink(other.root, f.root);
    await expect(attestLocalQualificationRepository(f.binding)).rejects.toThrow();
    const original = await readFile(`${other.root}/README.md`, "utf8");
    await symlink("/etc/hosts", `${other.root}/escape`);
    await expect(attestLocalQualificationRepository(other.binding)).rejects.toThrow();
    expect(await readFile(`${other.root}/README.md`, "utf8")).toBe(original);
  });
  it("rejects source mutation and stale baseline", async () => {
    const f = await fixture(); await writeFile(`${f.root}/README.md`, "changed\n");
    await expect(attestLocalQualificationRepository(f.binding)).rejects.toThrow();
    f.git("add", "."); f.git("commit", "-m", "Synthetic changed baseline");
    await expect(attestLocalQualificationRepository(f.binding)).rejects.toThrow();
  });
  it("rejects remote and executable Git configuration before Git runs", async () => {
    const f = await fixture(); f.git("remote", "add", "origin", "https://example.invalid/fixture.git");
    await expect(attestLocalQualificationRepository(f.binding)).rejects.toThrow();
  });
  it("rejects a shared parent and forged ownership marker", async () => {
    const f = await fixture(); await chmod(f.parent, 0o755);
    await expect(attestLocalQualificationRepository(f.binding)).rejects.toThrow();
    await chmod(f.parent, 0o700); await writeFile(`${f.parent}/qualification-owner.json`, "{}");
    await expect(attestLocalQualificationRepository(f.binding)).rejects.toThrow();
  });
  it("rejects external Git object storage", async () => {
    const f = await fixture(); await writeFile(`${f.root}/.git/objects/info/alternates`, "/outside/objects\n");
    await expect(attestLocalQualificationRepository(f.binding)).rejects.toThrow();
  });
  it("rejects source files hard-linked outside the admitted repository", async () => {
    const f = await fixture();
    await link(`${f.root}/README.md`, `${f.parent}/shared-readme`);
    await expect(attestLocalQualificationRepository(f.binding)).rejects.toThrow();
  });
});
