#!/usr/bin/env node
/**
 * Import this repository's skills into the governed context registry.
 *
 * For root SKILL.md and every skills/<name>/SKILL.md: parse frontmatter,
 * compute the structural quality score with the skill linter (context-tools),
 * compute sha256, and call context/importSkills:importSkillMarkdown.
 *
 * Prereqs: CONVEX_URL (env or .env.local); `context.registry` flag enabled.
 * Idempotent: re-import of identical content creates no new version (the
 * mutation reuses content by hash where unchanged; otherwise bumps patch).
 */

import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ConvexHttpClient } from "convex/browser";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const distEntry = join(repoRoot, "packages/context-tools/dist/index.js");
if (!existsSync(distEntry)) {
  console.log("Building @mission-control/context-tools…");
  execSync("pnpm --filter @mission-control/context-tools build", {
    cwd: repoRoot,
    stdio: "inherit",
  });
}
const { lintSkill, parseSkillFrontmatter } = await import(distEntry);

function loadConvexUrl() {
  if (process.env.CONVEX_URL) return process.env.CONVEX_URL;
  const envPath = join(repoRoot, ".env.local");
  if (existsSync(envPath)) {
    const match = readFileSync(envPath, "utf8").match(/^CONVEX_URL=(.+)$/m);
    if (match) return match[1].trim();
  }
  console.error("✗ CONVEX_URL not set");
  process.exit(1);
}

function gitSha() {
  try {
    return execSync("git rev-parse HEAD", { cwd: repoRoot }).toString().trim();
  } catch {
    return undefined;
  }
}

const client = new ConvexHttpClient(loadConvexUrl());
const commitSha = gitSha();

const targets = [
  { path: join(repoRoot, "SKILL.md"), sourcePath: "SKILL.md" },
  ...readdirSync(join(repoRoot, "skills"), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => ({
      path: join(repoRoot, "skills", d.name, "SKILL.md"),
      sourcePath: `skills/${d.name}/SKILL.md`,
    })),
];

let imported = 0;
for (const target of targets) {
  if (!existsSync(target.path)) continue;
  const content = readFileSync(target.path, "utf8");
  let fm;
  try {
    fm = parseSkillFrontmatter(content);
  } catch (err) {
    console.error(`✗ ${target.sourcePath}: ${err.message}`);
    process.exitCode = 1;
    continue;
  }
  const lint = lintSkill(content, { path: target.sourcePath });
  const contentHash = `sha256:${createHash("sha256").update(content).digest("hex")}`;

  const result = await client.mutation("context/importSkills:importSkillMarkdown", {
    slug: `software-factory/${fm.name}`,
    name: fm.name,
    description: fm.description,
    content,
    owner: fm.owner,
    type: "SKILL",
    contentHash,
    qualityScore: lint.score,
    reviewAxes: lint.axes,
    tags: ["agent-operations", ...(fm.capabilities ?? []).slice(0, 4)],
    sourceRepo: "jaydubya818/MissionControl",
    sourcePath: target.sourcePath,
    sourceCommitSha: commitSha,
    actorId: "import-repo-skills",
  });
  console.log(
    `✓ ${fm.name} — score ${lint.score}, version ${result?.version ?? "?"}`
  );
  imported++;
}
console.log(`\n${imported}/${targets.length} skills imported.`);
