import { execFile } from "node:child_process";
import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { canonicalJson, sha256Hex } from "@mission-control/shared";

const exec = promisify(execFile);
export interface LocalQualificationRepositoryBinding {
  root: string; fixtureId: string; baselineCommit: string; baselineTree: string;
  fixtureContentDigest: string; digest: string;
}

export function localQualificationRepositoryBinding(serialized: string | undefined): LocalQualificationRepositoryBinding | undefined {
  if (!serialized) return undefined;
  const admission = JSON.parse(serialized) as Record<string, unknown>;
  const fields = ["schema", "mode", "program", "tenantId", "projectId", "engagementId", "operatorId", "environmentId",
    "hostId", "fixtureId", "root", "baselineCommit", "baselineTree", "fixtureContentDigest", "expiresAt",
    "publicationAuthority", "productionAuthority"];
  if (!admission || Array.isArray(admission) || Object.keys(admission).sort().join(",") !== fields.sort().join(",")
    || admission.schema !== "local-synthetic-repository-admission/v1"
    || admission.mode !== "LOCAL_SYNTHETIC_QUALIFICATION"
    || admission.program !== "unpublished-handoff-fixture/v1"
    || admission.engagementId !== admission.projectId
    || admission.publicationAuthority !== "NONE" || admission.productionAuthority !== "NONE"
    || !Number.isFinite(admission.expiresAt) || Number(admission.expiresAt) <= Date.now()
    || typeof admission.root !== "string" || !/^\/private\/tmp\/mc-local-qualification-[a-f0-9]{32}\/repository$/.test(admission.root)
    || typeof admission.fixtureId !== "string"
    || typeof admission.baselineCommit !== "string" || !/^[a-f0-9]{40,64}$/.test(admission.baselineCommit)
    || typeof admission.baselineTree !== "string" || admission.baselineTree.length !== admission.baselineCommit.length
    || !/^[a-f0-9]{40,64}$/.test(admission.baselineTree)
    || typeof admission.fixtureContentDigest !== "string" || !/^sha256:[a-f0-9]{64}$/.test(admission.fixtureContentDigest)) {
    throw new Error("Offline worker local repository admission is malformed, expired, or carries prohibited authority.");
  }
  return {
    root: admission.root,
    fixtureId: admission.fixtureId,
    baselineCommit: admission.baselineCommit,
    baselineTree: admission.baselineTree,
    fixtureContentDigest: admission.fixtureContentDigest,
    digest: `sha256:${sha256Hex(canonicalJson(admission))}`,
  };
}

/** Filesystem proof is produced on the admitted host, never inferred from a
 * control-plane path string. Re-run before each producer/verifier execution. */
export async function attestLocalQualificationRepository(binding: LocalQualificationRepositoryBinding) {
  const root = binding.root;
  if (!/^\/private\/tmp\/mc-local-qualification-[a-f0-9]{32}\/repository$/.test(root)
    || await realpath(root) !== root) throw new Error("Local qualification root is not the exact disposable canonical root.");
  const parent = path.dirname(root);
  const owner = await lstat(parent);
  if (!owner.isDirectory() || owner.isSymbolicLink() || owner.uid !== process.getuid?.()
    || (owner.mode & 0o077) !== 0) throw new Error("Qualification fixture directory is not exclusively owned.");
  const markerPath = path.join(parent, "qualification-owner.json");
  const markerStat = await lstat(markerPath);
  if (!markerStat.isFile() || markerStat.isSymbolicLink() || markerStat.uid !== owner.uid || markerStat.size > 4096) {
    throw new Error("Qualification ownership marker is invalid.");
  }
  const marker = JSON.parse(await readFile(markerPath, "utf8"));
  if (canonicalJson(marker) !== canonicalJson({ schema: "local-qualification-owner/v1", fixtureId: binding.fixtureId,
    admissionDigest: binding.digest, root })) throw new Error("Repository does not belong to the admitted fixture.");
  const gitDirectory = await lstat(path.join(root, ".git"));
  if (!gitDirectory.isDirectory() || gitDirectory.isSymbolicLink()) throw new Error("Qualification source must own its Git directory.");
  const gitConfig = await readFile(path.join(root, ".git/config"), "utf8");
  const configLines = gitConfig.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (configLines[0] !== "[core]" || configLines.slice(1).some(line =>
    !/^(repositoryformatversion = 0|filemode = (true|false)|bare = false|logallrefupdates = true|ignorecase = true|precomposeunicode = true)$/.test(line))) {
    throw new Error("Qualification Git configuration contains unadmitted behavior.");
  }
  const files: Array<{ path: string; contentDigest: string }> = [];
  let totalBytes = 0;
  let entryCount = 0;
  async function inspect(directory: string, relative: string) {
    for (const name of await readdir(directory)) {
      if (++entryCount > 10000) throw new Error("Qualification repository exceeds its bounded size.");
      const filename = path.join(directory, name);
      const key = relative ? `${relative}/${name}` : name;
      const metadata = await lstat(filename);
      if (metadata.isSymbolicLink() || metadata.uid !== owner.uid || (!metadata.isFile() && !metadata.isDirectory())
        || (metadata.isFile() && metadata.nlink !== 1)) {
        throw new Error("Qualification repository contains an escape or non-owned entry.");
      }
      if (key === ".git/objects/info/alternates" || key === ".git/commondir" || key === ".git/info/grafts"
        || key.startsWith(".git/refs/replace/")) throw new Error("Qualification repository has external or replacement object authority.");
      if (metadata.isDirectory()) await inspect(filename, key);
      else if (!key.startsWith(".git/") && !key.startsWith(".mission-control/")) {
        totalBytes += metadata.size;
        if (totalBytes > 16384 || files.length >= 16 || (metadata.mode & 0o111) !== 0) {
          throw new Error("Qualification source exceeds the bounded non-executable fixture.");
        }
        files.push({ path: key, contentDigest: `sha256:${sha256Hex(await readFile(filename))}` });
      }
    }
  }
  await inspect(root, "");
  const env = { PATH: process.env.PATH, HOME: parent, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_NO_REPLACE_OBJECTS: "1", GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0" };
  const git = async (...args: string[]) => (await exec("git", ["-c", "core.hooksPath=/dev/null", "-c", "core.fsmonitor=false", ...args],
    { cwd: root, env, timeout: 10000, maxBuffer: 65536 })).stdout.trim();
  if (await git("remote") || await git("status", "--porcelain")
    || await git("rev-parse", "HEAD") !== binding.baselineCommit
    || await git("rev-parse", "HEAD^{tree}") !== binding.baselineTree
    || await git("rev-parse", "--show-toplevel") !== root) throw new Error("Qualification source is remote, dirty, unrelated or stale.");
  const fixtureContentDigest = `sha256:${sha256Hex(canonicalJson(files.sort((a, b) => a.path.localeCompare(b.path))))}`;
  if (fixtureContentDigest !== binding.fixtureContentDigest) throw new Error("Qualification fixture content changed.");
  return { schema: "local-qualification-root-observation/v1" as const, admissionDigest: binding.digest, root,
    baselineCommit: binding.baselineCommit, baselineTree: binding.baselineTree, fixtureContentDigest,
    noRemotes: true as const, ownerUid: owner.uid, observedAt: Date.now() };
}
