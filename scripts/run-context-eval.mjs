#!/usr/bin/env node
/**
 * Run a baseline vs candidate eval for a context package version.
 *
 * Uses runProxyEval (structural review score as candidate proxy) until an
 * external agent runner is wired.
 *
 * Usage:
 *   node scripts/run-context-eval.mjs <package-slug>
 *
 * Prereqs: CONVEX_URL, `eval.framework` flag enabled.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
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

const slug = process.argv[2];
if (!slug) {
  console.error("Usage: node scripts/run-context-eval.mjs <package-slug>");
  process.exit(1);
}

const client = new ConvexHttpClient(loadConvexUrl());
const pkg = await client.query("context/packages:getBySlug", { slug });
if (!pkg) {
  console.error(`✗ Package not found: ${slug}`);
  process.exit(1);
}

const completed = await client.mutation("context/evals:runProxyEval", {
  packageId: pkg._id,
  idempotencyKey: `cli-eval:${slug}:${Date.now()}`,
  actorId: "run-context-eval",
});

console.log(
  `✓ Eval complete for ${slug}\n` +
    `  Baseline avg:  ${completed.baselineScore}\n` +
    `  Candidate avg: ${completed.candidateScore}\n` +
    `  Impact score:  ${completed.impactScore} (Δ ${completed.impactDelta})`
);
