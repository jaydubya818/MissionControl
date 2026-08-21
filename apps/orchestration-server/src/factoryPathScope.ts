import { lstat, mkdir, realpath } from "node:fs/promises";
import path from "node:path";

export interface FrozenCodeScope {
  allowedPaths: string[];
  excludedPaths: string[];
}

export function validateChangedFileScope(changedFiles: string[], scope: FrozenCodeScope) {
  // A path that cannot be normalized (absolute, traversing, empty) must fail
  // the scope gate rather than being silently dropped — dropping it made the
  // gate return ok:true for exactly the inputs it exists to reject. The
  // equivalent workflow-engine implementation (repositoryScope) fails closed.
  const invalidPaths = Array.from(new Set(
    changedFiles.filter((file) => !normalizeRepositoryPath(file)).map((file) => String(file)),
  )).sort();
  const normalized = Array.from(new Set(changedFiles.map(normalizeRepositoryPath).filter(Boolean))).sort();
  const outsideScope = [
    ...invalidPaths,
    ...normalized.filter((file) =>
      !scope.allowedPaths.some((pattern) => matchesRepositoryPattern(file, pattern))
      || scope.excludedPaths.some((pattern) => matchesRepositoryPattern(file, pattern))
    ),
  ];
  // `changedFiles` is what callers render and record as "what changed"; keeping
  // the rejected entries out of it would re-introduce the silent drop this
  // function exists to remove, just one boundary later.
  return {
    ok: outsideScope.length === 0,
    changedFiles: [...normalized, ...invalidPaths].sort(),
    outsideScope,
    invalidPaths,
  };
}

export function assertWorktreeBoundary(checkoutRoot: string, worktree: string) {
  const root = path.resolve(checkoutRoot);
  const target = path.resolve(worktree);
  const requiredRoot = path.join(root, ".mission-control", "worktrees");
  const relative = path.relative(requiredRoot, target);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("The Factory worktree must be attempt-specific and remain inside .mission-control/worktrees.");
  }
  return { checkoutRoot: root, worktree: target, worktreeRoot: requiredRoot };
}

export async function assertCanonicalWorktreeBoundary(
  checkoutRoot: string,
  worktree: string,
  options: { createRoot?: boolean; requireWorktree?: boolean } = {},
) {
  const boundary = assertWorktreeBoundary(checkoutRoot, worktree);
  const missionControlRoot = path.join(boundary.checkoutRoot, ".mission-control");
  await ensureRealDirectory(missionControlRoot, options.createRoot ?? false);
  await ensureRealDirectory(boundary.worktreeRoot, options.createRoot ?? false);

  const [realCheckoutRoot, realWorktreeRoot] = await Promise.all([
    realpath(boundary.checkoutRoot),
    realpath(boundary.worktreeRoot),
  ]);
  if (realWorktreeRoot !== path.join(realCheckoutRoot, ".mission-control", "worktrees")) {
    throw new Error("The Factory worktree root must resolve inside the approved checkout root without symbolic links.");
  }

  const worktreeEntry = await lstat(boundary.worktree).catch(() => null);
  if (!worktreeEntry) {
    if (options.requireWorktree) throw new Error("The Factory worktree does not exist.");
    return { ...boundary, checkoutRoot: realCheckoutRoot, worktreeRoot: realWorktreeRoot };
  }
  if (worktreeEntry.isSymbolicLink() || !worktreeEntry.isDirectory()) {
    throw new Error("The Factory worktree must be a real directory, not a symbolic link.");
  }
  const realWorktree = await realpath(boundary.worktree);
  const relative = path.relative(realWorktreeRoot, realWorktree);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("The canonical Factory worktree escaped the approved worktree root.");
  }
  return {
    checkoutRoot: realCheckoutRoot,
    worktree: realWorktree,
    worktreeRoot: realWorktreeRoot,
  };
}

async function ensureRealDirectory(directory: string, create: boolean) {
  let entry = await lstat(directory).catch(() => null);
  if (!entry && create) {
    try {
      await mkdir(directory, { mode: 0o700 });
    } catch (error: any) {
      if (error?.code !== "EEXIST") throw error;
    }
    entry = await lstat(directory).catch(() => null);
  }
  if (!entry) throw new Error("The Factory worktree root is missing.");
  if (entry.isSymbolicLink() || !entry.isDirectory()) {
    throw new Error("The Factory worktree path cannot traverse a symbolic link.");
  }
}

export function normalizeRepositoryPath(value: string) {
  const normalized = value.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "");
  if (!normalized || normalized.startsWith("/") || normalized.split("/").includes("..")) return "";
  return normalized;
}

export function matchesRepositoryPattern(file: string, rawPattern: string) {
  const pattern = normalizeRepositoryPath(rawPattern);
  if (!pattern) return false;
  if (!pattern.includes("*")) return file === pattern || file.startsWith(`${pattern}/`);
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "\u0000")
    .replace(/\*/g, "[^/]*")
    .replace(/\u0000/g, ".*");
  return new RegExp(`^${escaped}$`).test(file);
}
