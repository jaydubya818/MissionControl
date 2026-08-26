import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

const PUBLIC_BUILDERS = new Map([
  ["query", "query"],
  ["mutation", "mutation"],
  ["action", "action"],
  // Explicit unauthenticated wrappers still expose ordinary Convex contracts.
  ["publicQuery", "query"],
  ["publicMutation", "mutation"],
]);
const VERSION_FILE = "convex/lib/runtimeContract.ts";
const VERSION_EXPORT = "RUNTIME_CONTRACT_VERSION";

function propertyName(property) {
  if (!property.name) return undefined;
  if (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) {
    return property.name.text;
  }
  return undefined;
}

function canonicalizeNode(node, sourceFile) {
  if (!node) return null;
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    true,
    ts.LanguageVariant.Standard,
    node.getText(sourceFile),
  );
  const tokens = [];
  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
    const tokenText =
      token === ts.SyntaxKind.StringLiteral ||
      token === ts.SyntaxKind.NoSubstitutionTemplateLiteral ||
      token === ts.SyntaxKind.NumericLiteral
        ? scanner.getTokenValue()
        : scanner.getTokenText();
    tokens.push([token, tokenText]);
  }
  return JSON.stringify(tokens);
}

function localInitializers(sourceFile) {
  const initializers = new Map();
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.initializer) {
        initializers.set(declaration.name.text, declaration.initializer);
      }
    }
  }
  return initializers;
}

function canonicalizeContractNode(node, sourceFile, initializers) {
  if (!node) return null;
  const dependencies = new Map();
  const visited = new Set();

  const captureDependencies = (candidate) => {
    const isPropertyName =
      (ts.isPropertyAssignment(candidate.parent) && candidate.parent.name === candidate) ||
      (ts.isPropertyAccessExpression(candidate.parent) && candidate.parent.name === candidate);
    if (
      ts.isIdentifier(candidate) &&
      !isPropertyName &&
      initializers.has(candidate.text) &&
      !visited.has(candidate.text)
    ) {
      visited.add(candidate.text);
      const initializer = initializers.get(candidate.text);
      dependencies.set(candidate.text, canonicalizeNode(initializer, sourceFile));
      captureDependencies(initializer);
    }
    ts.forEachChild(candidate, captureDependencies);
  };
  captureDependencies(node);

  return JSON.stringify({
    expression: canonicalizeNode(node, sourceFile),
    dependencies: [...dependencies].sort(([left], [right]) => left.localeCompare(right)),
  });
}

function contractProperty(config, name) {
  const property = config.properties.find(
    (candidate) => ts.isPropertyAssignment(candidate) && propertyName(candidate) === name,
  );
  return property && ts.isPropertyAssignment(property) ? property.initializer : undefined;
}

export function extractPublicConvexContracts(source, filePath) {
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const contracts = new Map();
  const initializers = localInitializers(sourceFile);

  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    const isExported = statement.modifiers?.some(
      (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
    );
    if (!isExported) continue;

    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue;
      if (!ts.isCallExpression(declaration.initializer)) continue;
      if (!ts.isIdentifier(declaration.initializer.expression)) continue;

      const builder = declaration.initializer.expression.text;
      const kind = PUBLIC_BUILDERS.get(builder);
      if (!kind) continue;
      const config = declaration.initializer.arguments[0];
      if (!config || !ts.isObjectLiteralExpression(config)) continue;

      const moduleName = filePath
        .replaceAll("\\", "/")
        .replace(/^convex\//, "")
        .replace(/\.tsx?$/, "");
      contracts.set(`${moduleName}:${declaration.name.text}`, {
        kind,
        args: canonicalizeContractNode(
          contractProperty(config, "args"),
          sourceFile,
          initializers,
        ),
        returns: canonicalizeContractNode(
          contractProperty(config, "returns"),
          sourceFile,
          initializers,
        ),
      });
    }
  }

  return contracts;
}

export function extractRuntimeContractVersion(source, filePath = VERSION_FILE) {
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (
        ts.isIdentifier(declaration.name) &&
        declaration.name.text === VERSION_EXPORT &&
        declaration.initializer &&
        ts.isNumericLiteral(declaration.initializer)
      ) {
        return Number(declaration.initializer.text);
      }
    }
  }

  throw new Error(`${VERSION_EXPORT} must be a numeric literal in ${filePath}`);
}

export function compareContractSnapshots(baseContracts, currentContracts) {
  const names = new Set([...baseContracts.keys(), ...currentContracts.keys()]);
  const changes = [];

  for (const name of [...names].sort()) {
    const base = baseContracts.get(name);
    const current = currentContracts.get(name);
    if (!base) {
      changes.push({ name, reason: "added" });
      continue;
    }
    if (!current) {
      changes.push({ name, reason: "removed" });
      continue;
    }

    const changedFields = ["kind", "args", "returns"].filter(
      (field) => base[field] !== current[field],
    );
    if (changedFields.length > 0) {
      changes.push({ name, reason: `${changedFields.join(", ")} changed` });
    }
  }

  return changes;
}

function isConvexSource(filePath) {
  const normalized = filePath.replaceAll("\\", "/");
  return (
    /^convex\/.+\.tsx?$/.test(normalized) &&
    !normalized.startsWith("convex/_generated/") &&
    !normalized.includes("/__tests__/") &&
    !/\.(test|spec)\.tsx?$/.test(normalized)
  );
}

function git(cwd, args) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function gitFiles(cwd, args) {
  return git(cwd, args).split("\0").filter(isConvexSource);
}

function contractsFromEntries(entries) {
  const contracts = new Map();
  for (const [filePath, source] of entries) {
    for (const [name, contract] of extractPublicConvexContracts(source, filePath)) {
      contracts.set(name, contract);
    }
  }
  return contracts;
}

function baseEntries(cwd, baseRef) {
  const files = gitFiles(cwd, ["ls-tree", "-r", "--name-only", "-z", baseRef, "--", "convex"]);
  return files.map((filePath) => [filePath, git(cwd, ["show", `${baseRef}:${filePath}`])]);
}

function currentEntries(cwd) {
  const files = gitFiles(cwd, ["ls-files", "-co", "--exclude-standard", "-z", "--", "convex"]);
  return files
    .filter((filePath) => existsSync(path.join(cwd, filePath)))
    .map((filePath) => [filePath, readFileSync(path.join(cwd, filePath), "utf8")]);
}

function resolveBaseRef(cwd, requestedBase) {
  const candidates =
    requestedBase && !/^0+$/.test(requestedBase)
      ? [requestedBase]
      : ["origin/main", "HEAD"];
  for (const candidate of candidates) {
    try {
      return git(cwd, ["rev-parse", "--verify", `${candidate}^{commit}`]).trim();
    } catch {
      // Try the next deterministic local fallback.
    }
  }
  throw new Error(`Could not resolve runtime contract base: ${candidates.join(", ")}`);
}

export function runRuntimeContractGuard({ cwd = process.cwd(), baseRef } = {}) {
  const resolvedBase = resolveBaseRef(cwd, baseRef);
  const baseContracts = contractsFromEntries(baseEntries(cwd, resolvedBase));
  const currentContracts = contractsFromEntries(currentEntries(cwd));
  const changes = compareContractSnapshots(baseContracts, currentContracts);
  const baseVersion = extractRuntimeContractVersion(
    git(cwd, ["show", `${resolvedBase}:${VERSION_FILE}`]),
  );
  const currentVersion = extractRuntimeContractVersion(
    readFileSync(path.join(cwd, VERSION_FILE), "utf8"),
  );

  if (currentVersion < baseVersion) {
    return {
      ok: false,
      baseRef: resolvedBase,
      baseVersion,
      currentVersion,
      changes,
      message: `${VERSION_EXPORT} cannot decrease (base v${baseVersion}, current v${currentVersion}).`,
    };
  }

  if (changes.length > 0 && currentVersion <= baseVersion) {
    return {
      ok: false,
      baseRef: resolvedBase,
      baseVersion,
      currentVersion,
      changes,
      message: `Public Convex contracts changed without incrementing ${VERSION_EXPORT} (base v${baseVersion}, current v${currentVersion}).`,
    };
  }

  const message =
    changes.length === 0
      ? `No public Convex validator contract changes detected across ${currentContracts.size} functions.`
      : `Accepted ${changes.length} public Convex contract change(s) with version v${baseVersion} → v${currentVersion}.`;
  return {
    ok: true,
    baseRef: resolvedBase,
    baseVersion,
    currentVersion,
    changes,
    message,
  };
}
