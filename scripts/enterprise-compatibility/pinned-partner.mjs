import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { pathToFileURL } from "node:url";

export const pinnedSha = "fa48a820ba185eb9b891130c78166463b61cba74";
export async function loadPinnedPartner(source) {
  if (!source) throw Error("MC_MYFACTORY_COMPATIBILITY_GIT is required; no unpinned fallback");
  const root = await mkdtemp(join(tmpdir(), "mc-partner-contract-"));
  const files = ["packages/hosted-routing/src/result.ts", "packages/hosted-routing/src/index.mjs",
    "packages/contracts/src/model-reference.ts", "packages/contracts/src/cloud-execution.ts"];
  for (const file of files) {
    const bytes = execFileSync("git", [`--git-dir=${source}`, "show", `${pinnedSha}:${file}`]);
    await mkdir(dirname(join(root, file)), { recursive: true }); await writeFile(join(root, file), bytes);
  }
  await writeFile(join(root, "package.json"), '{"type":"module"}');
  const result = await import(pathToFileURL(join(root, files[0])).href);
  const cloud = await import(pathToFileURL(join(root, files[3])).href);
  return { root, result, cloud };
}
