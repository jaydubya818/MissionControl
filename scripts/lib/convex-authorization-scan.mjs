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
import ts from "typescript";

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
  "requireFactoryActionWithAudit",
  // Public human action -> internal authorized mutation -> durable denial audit.
  "runAuditedHumanMutation",
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

/** Module-local helper functions, keyed by name. */
function localHelpers(sourceFile) {
  const helpers = new Map();
  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name && statement.body) {
      helpers.set(statement.name.text, statement);
      continue;
    }
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue;
      if (ts.isArrowFunction(declaration.initializer) || ts.isFunctionExpression(declaration.initializer)) {
        helpers.set(declaration.name.text, declaration.initializer);
      }
    }
  }
  return helpers;
}

function expressionName(expression) {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) {
    const parent = expressionName(expression.expression);
    return parent ? `${parent}.${expression.name.text}` : expression.name.text;
  }
  return "";
}

/**
 * Resolve actual call expressions, never comments or string literals.
 *
 * The old text search could be satisfied by a comment containing
 * `requireWorkspaceAccess` or by `void "ctx.auth.getUserIdentity"`. This gate
 * is a ratchet, so a trivially spoofable marker would be worse than no marker.
 */
function nodeIsAuthorized(node, helpers, seen = new Set()) {
  const root = ts.isFunctionLike(node) && node.body ? node.body : node;
  const visit = (candidate) => {
    // An uncalled nested function does not authorize its containing handler.
    if (candidate !== root && ts.isFunctionLike(candidate)) return false;
    if (ts.isCallExpression(candidate)) {
      const called = expressionName(candidate.expression);
      if (AUTHORIZATION_MARKERS.includes(called)) return true;
      if (ts.isIdentifier(candidate.expression)) {
        const helper = helpers.get(called);
        if (helper && !seen.has(called)) {
          const nextSeen = new Set(seen).add(called);
          if (nodeIsAuthorized(helper, helpers, nextSeen)) return true;
        }
      }
    }
    return ts.forEachChild(candidate, visit) === true;
  };
  return visit(root) === true;
}

function exported(statement) {
  return statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) === true;
}

function handlerNode(initializer, helpers) {
  if (!ts.isCallExpression(initializer)) return undefined;
  const options = initializer.arguments[0];
  if (!options || !ts.isObjectLiteralExpression(options)) return undefined;
  for (const property of options.properties) {
    if (ts.isMethodDeclaration(property) && property.name?.getText() === "handler") return property;
    if (!ts.isPropertyAssignment(property) || property.name.getText() !== "handler") continue;
    if (ts.isIdentifier(property.initializer)) return helpers.get(property.initializer.text);
    return property.initializer;
  }
  return undefined;
}

/**
 * Scan one file.
 *
 * @returns {{ module: string, name: string, kind: string, authorized: boolean,
 *            declaredPublic: boolean, line: number }[]}
 */
export function scanFile(filePath, repoRoot) {
  const source = readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const helpers = localHelpers(sourceFile);
  const moduleName = path
    .relative(path.join(repoRoot, "convex"), filePath)
    .replace(/\.ts$/, "")
    .split(path.sep)
    .join("/");

  const results = [];
  const builders = new Set([...PUBLIC_KINDS, ...AUTHORIZING_WRAPPERS, ...DECLARED_PUBLIC_WRAPPERS]);
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement) || !exported(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !declaration.initializer || !ts.isCallExpression(declaration.initializer)) continue;
      const name = declaration.name.text;
      const kind = expressionName(declaration.initializer.expression);
      if (!builders.has(kind)) continue;
      const line = sourceFile.getLineAndCharacterOfPosition(declaration.getStart(sourceFile)).line + 1;
      if (AUTHORIZING_WRAPPERS.includes(kind)) {
        results.push({ module: moduleName, name, kind, authorized: true, declaredPublic: false, line });
        continue;
      }
      if (DECLARED_PUBLIC_WRAPPERS.includes(kind)) {
        results.push({ module: moduleName, name, kind, authorized: false, declaredPublic: true, line });
        continue;
      }
      const handler = handlerNode(declaration.initializer, helpers);
      results.push({
        module: moduleName,
        name,
        kind,
        authorized: Boolean(handler && nodeIsAuthorized(handler, helpers)),
        declaredPublic: false,
        line,
      });
    }
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
