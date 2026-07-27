#!/usr/bin/env node
/**
 * mc-context — context manifest / lock CLI (Software Factory Epic 3).
 *
 * Usage:
 *   node scripts/mc-context.mjs [--dir <path>] [--json] <command> [args]
 *
 * Commands:
 *   init                 Write a starter mc-context.json (errors if it exists)
 *   list                 Show manifest entries + lock resolution status
 *   add <slug> [range]   Add or update a package entry in the manifest
 *   remove <slug>        Remove a package entry from the manifest
 *   lock                 Resolve against the registry, write mc-context.lock,
 *                        and sync manifest + lock + installations to Convex
 *   verify               Re-resolve and compare with the lock; exit 1 on drift
 *   diff                 Show what a fresh resolution would change vs the lock
 *   outdated             List locked packages with newer registry versions
 *   scan                 Discover local SKILL.md files and sync installations to Convex
 *
 * Files are read/written in CWD unless --dir <path> is given. Registry
 * commands (add's default range, lock, verify, diff, outdated) call the
 * Convex deployment via `npx convex run` and need a configured deployment
 * (.env.local) plus the `context.registry` feature flag for writes.
 *
 * Exit codes: 0 clean, 1 on errors, conflicts, or drift.
 * Requires the built context-tools dist (auto-built when missing).
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const distPath = join(repoRoot, "packages", "context-tools", "dist", "index.js");

const MANIFEST_FILE = "mc-context.json";
const LOCK_FILE = "mc-context.lock";

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);
let workDir = process.cwd();
let jsonOutput = false;
const positional = [];

for (let i = 0; i < argv.length; i++) {
  const arg = argv[i];
  if (arg === "--dir") {
    const value = argv[++i];
    if (value === undefined) fail("--dir requires a path argument");
    workDir = resolve(value);
  } else if (arg === "--json") {
    jsonOutput = true;
  } else if (arg.startsWith("--")) {
    fail(`unknown flag: ${arg}`);
  } else {
    positional.push(arg);
  }
}

const [command, ...commandArgs] = positional;

function fail(message) {
  console.error(`mc-context: ${message}`);
  process.exit(1);
}

function emit(json, human) {
  if (jsonOutput) {
    console.log(JSON.stringify(json, null, 2));
  } else {
    console.log(human);
  }
}

// ---------------------------------------------------------------------------
// context-tools dist (auto-build when missing)
// ---------------------------------------------------------------------------

if (!existsSync(distPath)) {
  console.error("mc-context: context-tools dist not found — building...");
  const build = spawnSync(
    "pnpm",
    ["--filter", "@mission-control/context-tools", "build"],
    { cwd: repoRoot, stdio: "inherit" }
  );
  if (build.status !== 0 || !existsSync(distPath)) {
    fail("failed to build @mission-control/context-tools");
  }
}

const tools = await import(pathToFileURL(distPath).href);
const {
  parseManifest,
  serializeManifest,
  parseLock,
  serializeLock,
  resolve: resolvePackages,
  diffLock,
  checkOutdated,
  isValidRange,
} = tools;

// ---------------------------------------------------------------------------
// File + Convex helpers
// ---------------------------------------------------------------------------

const manifestPath = () => join(workDir, MANIFEST_FILE);
const lockPath = () => join(workDir, LOCK_FILE);

function readManifest() {
  if (!existsSync(manifestPath())) {
    fail(`${MANIFEST_FILE} not found in ${workDir} — run "mc context init" first`);
  }
  try {
    return parseManifest(readFileSync(manifestPath(), "utf8"));
  } catch (err) {
    fail(`invalid ${MANIFEST_FILE}: ${err.message}`);
  }
}

function readLock() {
  if (!existsSync(lockPath())) {
    fail(`${LOCK_FILE} not found in ${workDir} — run "mc context lock" first`);
  }
  try {
    return parseLock(readFileSync(lockPath(), "utf8"));
  } catch (err) {
    fail(`invalid ${LOCK_FILE}: ${err.message}`);
  }
}

function sha256(text) {
  return `sha256:${createHash("sha256").update(text, "utf8").digest("hex")}`;
}

/** Run a Convex function from the repo root; returns parsed JSON result. */
function convexRun(fn, args) {
  let stdout;
  try {
    stdout = execFileSync(
      "npx",
      ["convex", "run", fn, JSON.stringify(args ?? {})],
      { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
    );
  } catch (err) {
    const detail = (err.stderr ?? "").toString().trim().split("\n").pop() ?? "";
    fail(
      `could not reach the Convex registry (npx convex run ${fn} failed).\n` +
        `  Check that .env.local is configured and \`npx convex dev\` has run once.\n` +
        (detail ? `  ${detail}` : "")
    );
  }
  const trimmed = stdout.trim();
  if (trimmed === "") return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    fail(`unexpected non-JSON response from ${fn}: ${trimmed.slice(0, 200)}`);
  }
}

function fetchRegistrySnapshot() {
  const snapshot = convexRun("context/manifests:registrySnapshot", {});
  if (!Array.isArray(snapshot)) {
    fail("registry snapshot response was not an array");
  }
  return snapshot;
}

/** "owner/repo" from the git remote, or the directory basename. */
function detectRepositorySlug() {
  try {
    const url = execFileSync("git", ["config", "--get", "remote.origin.url"], {
      cwd: workDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    const match = url.match(/[:/]([^/:]+\/[^/]+?)(\.git)?$/);
    if (match) return match[1];
  } catch {
    // not a git repo or no remote — fall through
  }
  return basename(workDir);
}

function formatIssue(issue) {
  switch (issue.kind) {
    case "missing":
      return `missing   ${issue.slug} (requested by ${issue.requestedBy}) — not in the registry`;
    case "conflict": {
      const wants = issue.requirements
        .map((r) => `${r.requestedBy} wants ${r.range}`)
        .join(", ");
      return `conflict  ${issue.slug} — no version satisfies all ranges (${wants})`;
    }
    case "circular":
      return `circular  ${[...issue.cycle, issue.cycle[0]].join(" -> ")}`;
    default:
      return `unknown issue: ${JSON.stringify(issue)}`;
  }
}

function reportIssues(issues) {
  for (const issue of issues) {
    console.error(`  ${formatIssue(issue)}`);
  }
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

function cmdInit() {
  if (existsSync(manifestPath())) {
    fail(`${MANIFEST_FILE} already exists in ${workDir}`);
  }
  const manifest = {
    schemaVersion: "1.0",
    repository: detectRepositorySlug(),
    contextPackages: {},
  };
  writeFileSync(manifestPath(), serializeManifest(manifest));
  emit(
    { created: manifestPath(), repository: manifest.repository },
    `Created ${MANIFEST_FILE} for "${manifest.repository}" in ${workDir}`
  );
}

function cmdList() {
  const manifest = readManifest();
  const slugs = Object.keys(manifest.contextPackages).sort();
  const lock = existsSync(lockPath()) ? readLock() : null;

  if (jsonOutput) {
    emit(
      {
        repository: manifest.repository,
        contextPackages: manifest.contextPackages,
        lock: lock?.resolved ?? null,
      },
      ""
    );
    return;
  }

  console.log(`Repository: ${manifest.repository}`);
  if (slugs.length === 0) {
    console.log("No context packages declared.");
    return;
  }
  console.log(`${slugs.length} package(s):`);
  for (const slug of slugs) {
    const range = manifest.contextPackages[slug];
    const locked = lock?.resolved[slug];
    const status = locked
      ? `locked ${locked.version}`
      : lock
        ? "NOT IN LOCK — run \"mc context lock\""
        : "no lock file";
    console.log(`  ${slug}  ${range}  (${status})`);
  }
  if (lock) {
    const stray = Object.keys(lock.resolved).filter(
      (slug) => !(slug in manifest.contextPackages)
    );
    for (const slug of stray.sort()) {
      console.log(`  ${slug}  (transitive)  locked ${lock.resolved[slug].version}`);
    }
  }
}

function cmdAdd() {
  const [slug, rangeArg] = commandArgs;
  if (!slug) fail('usage: mc context add <slug> [range]');
  const manifest = readManifest();

  let range = rangeArg;
  if (range === undefined) {
    const snapshot = fetchRegistrySnapshot();
    const versions = snapshot
      .filter((pkg) => pkg.slug === slug)
      .map((pkg) => pkg.version)
      .sort((a, b) => {
        const [aMaj, aMin, aPat] = a.split(".").map(Number);
        const [bMaj, bMin, bPat] = b.split(".").map(Number);
        return aMaj - bMaj || aMin - bMin || aPat - bPat;
      });
    if (versions.length === 0) {
      fail(
        `package "${slug}" has no published versions in the registry — ` +
          "pass an explicit range or publish the package first"
      );
    }
    range = `^${versions[versions.length - 1]}`;
  }
  if (!isValidRange(range)) {
    fail(
      `invalid range "${range}" — supported forms: "1.2.3", "^1.2.3", "~1.2.3", ">=1.2.3"`
    );
  }

  const updated = {
    ...manifest,
    contextPackages: { ...manifest.contextPackages, [slug]: range },
  };
  // Round-trip through the parser so slug validation applies to the new entry.
  let serialized;
  try {
    serialized = serializeManifest(parseManifest(JSON.stringify(updated)));
  } catch (err) {
    fail(err.message);
  }
  writeFileSync(manifestPath(), serialized);
  emit(
    { added: slug, range },
    `Added ${slug} @ ${range} — run "mc context lock" to resolve`
  );
}

function cmdRemove() {
  const [slug] = commandArgs;
  if (!slug) fail("usage: mc context remove <slug>");
  const manifest = readManifest();
  if (!(slug in manifest.contextPackages)) {
    fail(`package "${slug}" is not in ${MANIFEST_FILE}`);
  }
  const contextPackages = { ...manifest.contextPackages };
  delete contextPackages[slug];
  writeFileSync(
    manifestPath(),
    serializeManifest({ ...manifest, contextPackages })
  );
  emit(
    { removed: slug },
    `Removed ${slug} — run "mc context lock" to update the lock`
  );
}

function resolveAgainstRegistry(manifest) {
  const snapshot = fetchRegistrySnapshot();
  return { snapshot, result: resolvePackages(manifest, snapshot) };
}

function cmdLock() {
  const manifest = readManifest();
  const manifestJson = readFileSync(manifestPath(), "utf8");
  const { result } = resolveAgainstRegistry(manifest);

  if (!result.ok) {
    console.error("Resolution failed:");
    reportIssues(result.issues);
    process.exit(1);
  }

  const lock = { schemaVersion: "1.0", resolved: result.resolved };
  writeFileSync(lockPath(), serializeLock(lock));

  const slugs = Object.keys(result.resolved).sort();
  const manifestHash = sha256(manifestJson);

  convexRun("context/manifests:saveManifest", {
    repoSlug: manifest.repository,
    manifestJson,
    actorId: "mc-cli",
  });
  convexRun("context/manifests:saveLock", {
    repoSlug: manifest.repository,
    lockJson: serializeLock(lock),
    manifestHash,
    resolvedCount: slugs.length,
    actorId: "mc-cli",
  });
  convexRun("context/manifests:syncInstallations", {
    repoSlug: manifest.repository,
    entries: slugs.map((slug) => ({
      packageSlug: slug,
      version: result.resolved[slug].version,
      contentHash: result.resolved[slug].contentHash,
      state: "INSTALLED",
    })),
    actorId: "mc-cli",
  });

  if (jsonOutput) {
    emit({ locked: result.resolved, manifestHash }, "");
    return;
  }
  console.log(`Locked ${slugs.length} package(s) into ${LOCK_FILE}:`);
  for (const slug of slugs) {
    console.log(`  ${slug} @ ${result.resolved[slug].version}`);
  }
  console.log(`Manifest hash ${manifestHash}`);
  console.log("Synced manifest, lock, and installations to Convex.");
}

function cmdVerify() {
  const manifest = readManifest();
  const lock = readLock();
  const { result } = resolveAgainstRegistry(manifest);

  if (!result.ok) {
    console.error("Resolution failed:");
    reportIssues(result.issues);
    process.exit(1);
  }

  const fresh = { schemaVersion: "1.0", resolved: result.resolved };
  const diff = diffLock(lock, fresh);
  const clean =
    diff.added.length === 0 &&
    diff.removed.length === 0 &&
    diff.changed.length === 0;

  if (jsonOutput) {
    emit({ clean, diff }, "");
    if (!clean) process.exit(1);
    return;
  }

  if (clean) {
    console.log(
      `Lock is up to date — ${Object.keys(lock.resolved).length} package(s) verified.`
    );
    return;
  }
  console.error(`${LOCK_FILE} is out of date with the registry/manifest:`);
  for (const slug of diff.added) {
    console.error(`  added    ${slug} @ ${fresh.resolved[slug].version}`);
  }
  for (const slug of diff.removed) {
    console.error(`  removed  ${slug} (was ${lock.resolved[slug].version})`);
  }
  for (const change of diff.changed) {
    console.error(
      `  changed  ${change.slug}: ${change.from.version} -> ${change.to.version}`
    );
  }
  console.error('Run "mc context lock" to update.');
  process.exit(1);
}

function cmdDiff() {
  const manifest = readManifest();
  const lock = readLock();
  const { result } = resolveAgainstRegistry(manifest);

  if (!result.ok) {
    console.error("Resolution failed:");
    reportIssues(result.issues);
    process.exit(1);
  }

  const fresh = { schemaVersion: "1.0", resolved: result.resolved };
  const diff = diffLock(lock, fresh);

  if (jsonOutput) {
    emit(diff, "");
    return;
  }
  if (
    diff.added.length === 0 &&
    diff.removed.length === 0 &&
    diff.changed.length === 0
  ) {
    console.log("No changes — lock matches a fresh resolution.");
    return;
  }
  for (const slug of diff.added) {
    console.log(`+ ${slug} @ ${fresh.resolved[slug].version}`);
  }
  for (const slug of diff.removed) {
    console.log(`- ${slug} (was ${lock.resolved[slug].version})`);
  }
  for (const change of diff.changed) {
    console.log(`~ ${change.slug}: ${change.from.version} -> ${change.to.version}`);
  }
}

function cmdOutdated() {
  const manifest = readManifest();
  const lock = readLock();
  const snapshot = fetchRegistrySnapshot();
  const outdated = checkOutdated(lock, snapshot, manifest);

  if (jsonOutput) {
    emit(outdated, "");
    return;
  }
  if (outdated.length === 0) {
    console.log("All locked packages are up to date.");
    return;
  }
  console.log(`${outdated.length} package(s) have newer versions:`);
  for (const pkg of outdated) {
    const satisfying =
      pkg.latestSatisfying !== undefined
        ? ` (latest satisfying manifest range: ${pkg.latestSatisfying})`
        : "";
    console.log(`  ${pkg.slug}: ${pkg.current} -> ${pkg.latest}${satisfying}`);
  }
}

function discoverLocalSkills() {
  const roots = [
    join(workDir, ".agents", "skills"),
    join(workDir, ".cursor", "skills"),
    join(workDir, "skills"),
  ];
  const discovered = [];
  const seen = new Set();

  for (const root of roots) {
    if (!existsSync(root)) continue;
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const skillPath = join(root, entry.name, "SKILL.md");
      if (!existsSync(skillPath) || seen.has(skillPath)) continue;
      seen.add(skillPath);
      const content = readFileSync(skillPath, "utf8");
      const nameMatch = content.match(/^name:\s*(.+)$/m);
      const name = nameMatch?.[1]?.trim() ?? entry.name;
      const slug = name.includes("/") ? name : `local/${name}`;
      discovered.push({
        slug,
        name,
        path: skillPath.replace(workDir + "/", ""),
        contentHash: sha256(content),
      });
    }
  }
  return discovered;
}

function cmdScan() {
  const repoSlug = existsSync(manifestPath())
    ? readManifest().repository
    : detectRepositorySlug();
  const snapshot = fetchRegistrySnapshot();
  const discovered = discoverLocalSkills();

  const entries = discovered.map((skill) => {
    const registryPkg = snapshot.find((pkg) => pkg.slug === skill.slug);
    const version = registryPkg?.version ?? "0.0.0-local";
    const contentHash = registryPkg?.contentHash ?? skill.contentHash;
    const state = registryPkg ? "INSTALLED" : "MISSING";
    return {
      packageSlug: skill.slug,
      version,
      contentHash,
      state,
    };
  });

  if (entries.length === 0) {
    emit({ discovered: [], synced: null }, "No local SKILL.md files found under .agents/skills, .cursor/skills, or skills/");
    return;
  }

  const syncResult = convexRun("context/manifests:syncInstallations", {
    repoSlug,
    entries,
    actorId: "mc-cli-scan",
  });

  if (jsonOutput) {
    emit({ discovered, synced: syncResult }, "");
    return;
  }

  console.log(`Discovered ${discovered.length} local skill(s) for ${repoSlug}:`);
  for (const skill of discovered) {
    console.log(`  ${skill.slug} (${skill.path})`);
  }
  console.log("Synced installations to Convex.");
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

switch (command) {
  case "init":
    cmdInit();
    break;
  case "list":
    cmdList();
    break;
  case "add":
    cmdAdd();
    break;
  case "remove":
    cmdRemove();
    break;
  case "lock":
    cmdLock();
    break;
  case "verify":
    cmdVerify();
    break;
  case "diff":
    cmdDiff();
    break;
  case "outdated":
    cmdOutdated();
    break;
  case "scan":
    cmdScan();
    break;
  case undefined:
  case "help":
  case "--help":
    console.log(
      [
        "usage: mc context [--dir <path>] [--json] <command>",
        "",
        "commands:",
        "  init                 write a starter mc-context.json",
        "  list                 show manifest entries + lock status",
        "  add <slug> [range]   add/update a package entry",
        "  remove <slug>        remove a package entry",
        "  lock                 resolve, write mc-context.lock, sync to Convex",
        "  verify               re-resolve and compare with the lock (exit 1 on drift)",
        "  diff                 show fresh resolution vs the lock",
        "  outdated             list locked packages with newer versions",
        "  scan                 discover local skills and sync installations to Convex",
      ].join("\n")
    );
    break;
  default:
    fail(`unknown command: ${command} (run "mc context help")`);
}
