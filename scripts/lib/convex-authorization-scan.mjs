/**
 * Source-aware scan of every PUBLIC Convex function and whether it resolves
 * authorization server-side.
 *
 * A Convex `query`/`mutation`/`action` export is internet-callable by anyone
 * holding the deployment URL, which ships to the browser as `VITE_CONVEX_URL`.
 * "Public" therefore means internet-facing. This scanner exists so that the
 * number of internet-facing functions with no authorization can only ever go
 * DOWN — see `scripts/check-convex-authorization.mjs` for the ratchet.
 *
 * Deliberately not a regex over whole files: it isolates each function body by
 * brace matching so a helper call three functions away cannot make an
 * unauthorized function look authorized. It also follows one level of local
 * helper calls, because the established pattern in this repository is a
 * module-local `requireXAuthority(ctx, …)` wrapper.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

/** Calls that establish server-side authority. */
const AUTHORIZATION_MARKERS = [
  "requireCompanyAccess",
  "requireCompanyPermission",
  "requireCompanyAdministrator",
  "requireWorkspaceAccess",
  "requireWorkspacePermission",
  "requireAuthorizedDeliveryScope",
  "assertAuthorizedDeliveryRecord",
  "requireApprovalDecisionAuthority",
  "requireMemberAdministration",
  "requireWebhookWorkspace",
  "requireAgentFleetAuthority",
  "authorizeProviderCall",
  "assertWorkspaceAccess",
  "assertCompanyAdministrator",
  "assertAuthenticated",
  "ctx.auth.getUserIdentity",
  // Signed service-command boundary (convex/serviceCommands.ts).
  "authorizeServiceCommand",
  "claimScoped",
];

/** Wrappers from convex/lib/authedFunctions.ts that authorize by construction. */
const AUTHORIZING_WRAPPERS = [
  "authedQuery",
  "authedMutation",
  "workspaceQuery",
  "workspaceMutation",
  "companyQuery",
  "companyMutation",
  "adminQuery",
  "adminMutation",
];

/** Wrappers that declare a deliberate unauthenticated exposure. */
const DECLARED_PUBLIC_WRAPPERS = ["publicQuery", "publicMutation"];

const PUBLIC_KINDS = ["query", "mutation", "action"];

function listSourceFiles(root) {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) {
        if (entry === "_generated" || entry === "__tests__" || entry === "node_modules") continue;
        walk(full);
        continue;
      }
      if (entry.endsWith(".ts") && !entry.endsWith(".d.ts")) out.push(full);
    }
  };
  walk(root);
  return out.sort();
}

/** Return the source slice from `start` to its matching closing brace. */
function sliceBalanced(source, start) {
  let depth = 0;
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return source.slice(start);
}

/** Bodies of module-local helper functions, keyed by name. */
function localHelperBodies(source) {
  const helpers = new Map();
  const pattern = /(?:async\s+)?function\s+([A-Za-z0-9_]+)\s*\(/g;
  let match;
  while ((match = pattern.exec(source)) !== null) {
    const open = source.indexOf("{", match.index);
    if (open === -1) continue;
    helpers.set(match[1], sliceBalanced(source, open));
  }
  return helpers;
}

function bodyIsAuthorized(body, helpers, seen = new Set()) {
  if (AUTHORIZATION_MARKERS.some((marker) => body.includes(marker))) return true;
  for (const [name, helperBody] of helpers) {
    if (seen.has(name)) continue;
    if (!new RegExp(`\\b${name}\\s*\\(`).test(body)) continue;
    seen.add(name);
    if (bodyIsAuthorized(helperBody, helpers, seen)) return true;
  }
  return false;
}

/**
 * Scan one file.
 *
 * @returns {{ module: string, name: string, kind: string, authorized: boolean,
 *            declaredPublic: boolean, line: number }[]}
 */
export function scanFile(filePath, repoRoot) {
  const source = readFileSync(filePath, "utf8");
  const helpers = localHelperBodies(source);
  const moduleName = path
    .relative(path.join(repoRoot, "convex"), filePath)
    .replace(/\.ts$/, "")
    .split(path.sep)
    .join("/");

  const results = [];
  const pattern = new RegExp(
    `export\\s+const\\s+([A-Za-z0-9_]+)\\s*(?::\\s*[^=]+?)?=\\s*(${[
      ...PUBLIC_KINDS,
      ...AUTHORIZING_WRAPPERS,
      ...DECLARED_PUBLIC_WRAPPERS,
    ].join("|")})\\s*\\(`,
    "g",
  );

  let match;
  while ((match = pattern.exec(source)) !== null) {
    const [, name, kind] = match;
    const line = source.slice(0, match.index).split("\n").length;
    if (AUTHORIZING_WRAPPERS.includes(kind)) {
      results.push({ module: moduleName, name, kind, authorized: true, declaredPublic: false, line });
      continue;
    }
    if (DECLARED_PUBLIC_WRAPPERS.includes(kind)) {
      results.push({ module: moduleName, name, kind, authorized: false, declaredPublic: true, line });
      continue;
    }
    const open = source.indexOf("{", match.index + match[0].length - 1);
    const body = open === -1 ? "" : sliceBalanced(source, open);
    results.push({
      module: moduleName,
      name,
      kind,
      authorized: bodyIsAuthorized(body, helpers),
      declaredPublic: false,
      line,
    });
  }
  return results;
}

/** Scan the whole `convex/` tree. */
export function scanConvexAuthorization(repoRoot) {
  const files = listSourceFiles(path.join(repoRoot, "convex"));
  const functions = files.flatMap((file) => scanFile(file, repoRoot));
  const unauthorized = functions.filter((fn) => !fn.authorized && !fn.declaredPublic);
  return {
    functions,
    unauthorized,
    total: functions.length,
    authorizedCount: functions.filter((fn) => fn.authorized).length,
    declaredPublicCount: functions.filter((fn) => fn.declaredPublic).length,
  };
}

/** Stable `module:name` identifiers, sorted, for baseline comparison. */
export function toIdentifiers(entries) {
  return [...new Set(entries.map((fn) => `${fn.module}:${fn.name}`))].sort();
}

/** Compare a scan against a committed baseline. */
export function compareToBaseline(current, baseline) {
  const baselineSet = new Set(baseline);
  const currentSet = new Set(current);
  return {
    added: current.filter((id) => !baselineSet.has(id)),
    removed: baseline.filter((id) => !currentSet.has(id)),
  };
}
