#!/usr/bin/env node
/**
 * Import Agentic-KB Graphify graph.json into Convex knowledge graph tables.
 *
 * Reads AGENTIC_KB_PATH/graphify-out/graph.json (default ~/Agentic-KB) and
 * calls knowledgeGraph:importGraphifyJson.
 *
 * Prereqs: CONVEX_URL in env or .env.local
 *
 * Usage:
 *   node scripts/import-knowledge-graph.mjs
 *   AGENTIC_KB_PATH=~/Agentic-KB node scripts/import-knowledge-graph.mjs
 *   node scripts/import-knowledge-graph.mjs --project-slug sf-demo
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ConvexHttpClient } from "convex/browser";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

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

function parseArgs(argv) {
  const args = { projectSlug: undefined };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--project-slug" && argv[i + 1]) {
      args.projectSlug = argv[++i];
    }
  }
  return args;
}

const { projectSlug } = parseArgs(process.argv);
const agenticKbPath =
  process.env.AGENTIC_KB_PATH ?? join(homedir(), "Agentic-KB");
const graphPath = join(agenticKbPath, "graphify-out", "graph.json");

if (!existsSync(graphPath)) {
  console.error(`✗ Graph file not found: ${graphPath}`);
  console.error("  Set AGENTIC_KB_PATH to your Agentic-KB clone.");
  process.exit(1);
}

const payload = JSON.parse(readFileSync(graphPath, "utf8"));
const contentHash = createHash("sha256")
  .update(readFileSync(graphPath, "utf8"))
  .digest("hex");

const client = new ConvexHttpClient(loadConvexUrl());

let projectId;
if (projectSlug) {
  const project = await client.query("projects:getBySlug", { slug: projectSlug });
  if (!project) {
    console.error(`✗ Project not found for slug: ${projectSlug}`);
    process.exit(1);
  }
  projectId = project._id;
}

// `knowledgeGraph:importGraphifyJson` is an `internalMutation`: it writes
// governed knowledge-graph state and has no browser caller, so it is not
// internet-callable. `ConvexHttpClient` cannot address internal functions —
// this line used to be a `client.mutation(...)` and broke when the function was
// made internal. `npx convex run` authenticates with deployment admin
// credentials and can, which is the same path the seeders and migrations use.
const importArgs = JSON.stringify({
  projectId,
  source: "agentic-kb",
  payload,
  idempotencyKey: `knowledge-graph:agentic-kb:${contentHash.slice(0, 16)}`,
});
const run = spawnSync("npx", ["convex", "run", "knowledgeGraph:importGraphifyJson", importArgs], {
  encoding: "utf8",
  cwd: join(dirname(fileURLToPath(import.meta.url)), ".."),
});
if (run.status !== 0) {
  console.error(run.stderr?.trim() || "convex run failed");
  process.exit(1);
}
const result = (() => {
  try {
    return JSON.parse(run.stdout.trim().split("\n").pop() ?? "{}");
  } catch {
    return { output: run.stdout.trim() };
  }
})();

console.log("Knowledge graph import complete:");
console.log(
  `  nodes: ${result.nodeCount ?? result.stats?.nodeCount ?? "?"}, edges: ${result.edgeCount ?? result.stats?.edgeCount ?? "?"}, hyperedges: ${result.hyperedgeCount ?? result.stats?.hyperedgeCount ?? "?"}`
);
if (result.skipped) {
  console.log("  (skipped — already imported with same idempotency key)");
}
