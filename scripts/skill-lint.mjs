#!/usr/bin/env node
/**
 * skill-lint — lint SKILL.md files against the Mission Control skill standard.
 *
 * Usage:
 *   node scripts/skill-lint.mjs                    # lint root SKILL.md + skills/<asterisk>/SKILL.md
 *   node scripts/skill-lint.mjs <path>             # lint one SKILL.md file (or a skill directory)
 *   node scripts/skill-lint.mjs --min-score 80     # additionally fail if any skill scores below 80
 *
 * Exits 1 when any error-severity finding is reported, or when a skill scores
 * below --min-score (CI quality gate).
 * Requires the built context-tools dist:
 *   pnpm --filter @mission-control/context-tools build
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const distPath = join(repoRoot, "packages", "context-tools", "dist", "index.js");

if (!existsSync(distPath)) {
  console.error("skill-lint: context-tools dist not found.");
  console.error("Build it first: pnpm --filter @mission-control/context-tools build");
  process.exit(1);
}

const { lintSkill } = await import(pathToFileURL(distPath).href);

/** @returns {{file: string, withPath: boolean}[]} */
function collectTargets(arg) {
  const rootSkill = join(repoRoot, "SKILL.md");
  if (arg !== undefined) {
    let file = resolve(arg);
    if (existsSync(file) && statSync(file).isDirectory()) {
      file = join(file, "SKILL.md");
    }
    if (!existsSync(file)) {
      console.error(`skill-lint: no such file: ${file}`);
      process.exit(1);
    }
    // The root umbrella skill has no skill directory; skip the name-mismatch path.
    return [{ file, withPath: file !== rootSkill }];
  }

  const targets = [];
  if (existsSync(rootSkill)) {
    targets.push({ file: rootSkill, withPath: false });
  }
  const skillsDir = join(repoRoot, "skills");
  if (existsSync(skillsDir)) {
    for (const entry of readdirSync(skillsDir).sort()) {
      const candidate = join(skillsDir, entry, "SKILL.md");
      if (existsSync(candidate)) {
        targets.push({ file: candidate, withPath: true });
      }
    }
  }
  if (targets.length === 0) {
    console.error("skill-lint: no SKILL.md files found");
    process.exit(1);
  }
  return targets;
}

const SEVERITY_ORDER = { error: 0, warning: 1, info: 2 };

const cliArgs = process.argv.slice(2);
let minScore = null;
const minScoreIdx = cliArgs.indexOf("--min-score");
if (minScoreIdx !== -1) {
  minScore = Number(cliArgs[minScoreIdx + 1]);
  if (!Number.isFinite(minScore)) {
    console.error("skill-lint: --min-score requires a number");
    process.exit(1);
  }
  cliArgs.splice(minScoreIdx, 2);
}

const targets = collectTargets(cliArgs[0]);
let errorCount = 0;
let warningCount = 0;
let totalScore = 0;
let belowMinScore = 0;

for (const { file, withPath } of targets) {
  const markdown = readFileSync(file, "utf8");
  const rel = relative(repoRoot, file);
  const result = lintSkill(markdown, withPath ? { path: file } : {});
  totalScore += result.score;
  if (minScore !== null && result.score < minScore) belowMinScore++;

  const { validation, implementation, activation } = result.axes;
  console.log(
    `${rel} — score ${result.score}/100 (validation ${validation}, implementation ${implementation}, activation ${activation})`,
  );
  for (const finding of [...result.findings].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || (a.line ?? 0) - (b.line ?? 0),
  )) {
    if (finding.severity === "error") errorCount++;
    if (finding.severity === "warning") warningCount++;
    const location = finding.line !== undefined ? ` (line ${finding.line})` : "";
    console.log(`  ${finding.severity.padEnd(7)} ${finding.rule}${location}: ${finding.message}`);
  }
}

const avg = Math.round(totalScore / targets.length);
console.log("");
console.log(
  `${targets.length} skill(s) linted — ${errorCount} error(s), ${warningCount} warning(s), average score ${avg}/100`,
);

if (minScore !== null && belowMinScore > 0) {
  console.error(`skill-lint: ${belowMinScore} skill(s) scored below --min-score ${minScore}`);
  process.exit(1);
}

if (errorCount > 0) {
  process.exit(1);
}
