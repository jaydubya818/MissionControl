#!/usr/bin/env node
import { existsSync, lstatSync, readFileSync, readlinkSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { isSensitiveTrackedPath, scanTextForSecrets } from "./lib/repository-secret-scan.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const listed = spawnSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
  cwd: repositoryRoot,
  encoding: "utf8",
});
if (listed.status !== 0) throw new Error(`git ls-files failed: ${listed.stderr.trim()}`);

const candidateFiles = listed.stdout.split("\0").filter(Boolean);
const findings = [];
let checkedFileCount = 0;
for (const filePath of candidateFiles) {
  if (isSensitiveTrackedPath(filePath)) {
    findings.push({ filePath, line: 1, rule: "sensitive-tracked-file" });
    continue;
  }

  const absolutePath = path.join(repositoryRoot, filePath);
  // `git ls-files` includes paths deleted in the working tree until the deletion
  // is staged. Release checks must scan the candidate tree without crashing.
  if (!existsSync(absolutePath)) continue;

  checkedFileCount += 1;
  const stats = lstatSync(absolutePath);
  const content = stats.isSymbolicLink()
    ? Buffer.from(readlinkSync(absolutePath), "utf8")
    : readFileSync(absolutePath);
  if (content.byteLength > 2 * 1024 * 1024) continue;
  if (content.includes(0)) continue;
  for (const finding of scanTextForSecrets(content.toString("utf8"))) {
    findings.push({ filePath, ...finding });
  }
}

if (findings.length > 0) {
  console.error(`FAIL repository secret scan: ${findings.length} high-confidence finding(s)`);
  for (const finding of findings) {
    console.error(`- ${finding.rule} at ${finding.filePath}:${finding.line}`);
  }
  process.exit(1);
}

console.log(`PASS repository secret scan: ${checkedFileCount} candidate files checked; no credential material found`);
