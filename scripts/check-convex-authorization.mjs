#!/usr/bin/env node
/**
 * Authorization ratchet for public Convex functions.
 *
 * A Convex `query`/`mutation`/`action` export is callable by anyone who knows
 * the deployment URL, and that URL ships to every browser as `VITE_CONVEX_URL`.
 * This repository still carries a large legacy surface of such functions with
 * no server-side authorization; migrating all of them at once is not safe.
 *
 * So this gate does not demand zero — it demands **no new debt**:
 *
 *   - Any public function that is unauthorized and NOT in the baseline fails.
 *   - The baseline may only shrink. Removing an entry is the goal.
 *   - Declaring an endpoint anonymous on purpose means using `publicQuery` /
 *     `publicMutation` from `convex/lib/authedFunctions.ts`, which requires an
 *     explicit `reason` — a reviewed decision, not an omission.
 *
 * Fix a failure by authorizing the function (see `convex/lib/authedFunctions.ts`
 * and `convex/authorization.ts`), by making it `internal*` if it has no external
 * caller, or — if it genuinely must be anonymous — by using `publicQuery` /
 * `publicMutation` with a reason.
 *
 * Regenerate the baseline after a migration:  node scripts/check-convex-authorization.mjs --update
 */

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  compareToBaseline,
  scanConvexAuthorization,
  toIdentifiers,
} from "./lib/convex-authorization-scan.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baselinePath = path.join(repoRoot, "scripts", "convex-authorization-baseline.json");

const scan = scanConvexAuthorization(repoRoot);
const current = toIdentifiers(scan.unauthorized);

if (process.argv.includes("--update")) {
  writeFileSync(
    baselinePath,
    `${JSON.stringify(
      {
        $comment:
          "Public Convex functions that still resolve no server-side authorization. " +
          "This list may only shrink. See scripts/check-convex-authorization.mjs.",
        generatedFrom: "node scripts/check-convex-authorization.mjs --update",
        unauthorized: current,
      },
      null,
      2,
    )}\n`,
  );
  console.log(`Baseline updated: ${current.length} unauthorized public function(s).`);
  process.exit(0);
}

let baseline;
try {
  baseline = JSON.parse(readFileSync(baselinePath, "utf8")).unauthorized ?? [];
} catch {
  console.error(
    `Convex authorization ratchet: ERROR\nMissing or unreadable baseline at ${baselinePath}.\n` +
      "Create it with: node scripts/check-convex-authorization.mjs --update",
  );
  process.exit(1);
}

const { added, removed } = compareToBaseline(current, baseline);

console.log(
  `Convex public functions: ${scan.total} total · ${scan.authorizedCount} authorized · ` +
    `${scan.declaredPublicCount} declared-public · ${current.length} unauthorized ` +
    `(baseline ${baseline.length}).`,
);

if (removed.length > 0) {
  console.log(`\n${removed.length} function(s) left the unauthorized set — nice:`);
  for (const id of removed.slice(0, 25)) console.log(`  - ${id}`);
  if (removed.length > 25) console.log(`  … and ${removed.length - 25} more`);
  console.log("\nRun `node scripts/check-convex-authorization.mjs --update` to lock the gain in.");
}

if (added.length > 0) {
  console.error(
    `\nConvex authorization ratchet: FAIL\n${added.length} public Convex function(s) resolve no ` +
      "server-side authorization and are not in the baseline:\n",
  );
  for (const id of added) {
    const fn = scan.unauthorized.find((entry) => `${entry.module}:${entry.name}` === id);
    console.error(`  - ${id} (${fn?.kind ?? "?"}) — convex/${fn?.module}.ts:${fn?.line ?? "?"}`);
  }
  console.error(
    "\nEvery one of these is callable by anyone holding the deployment URL.\n" +
      "Resolve by one of:\n" +
      "  1. Use a wrapper from convex/lib/authedFunctions.ts (authedQuery, workspaceMutation, adminMutation, …).\n" +
      "  2. Call requireWorkspaceAccess / requireCompanyPermission / requireCompanyAdministrator in the handler.\n" +
      "  3. Make it internalQuery/internalMutation/internalAction if it has no external caller.\n" +
      "  4. If it must be anonymous, use publicQuery/publicMutation with an explicit `reason`.\n",
  );
  process.exit(1);
}

console.log("\nConvex authorization ratchet: PASS — no new unauthorized public functions.");
