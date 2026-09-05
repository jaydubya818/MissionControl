import { constants, createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { open, readdir, readlink, realpath } from "node:fs/promises";
import path from "node:path";

const TREE_DIGEST_NAMESPACE = "deepseek-installation-tree/v1";
const FILE_HASH_CONCURRENCY = 8;

type InstallationEntry =
  | { kind: "directory"; relativePath: string }
  | { kind: "file"; relativePath: string; absolutePath: string; sha256?: string }
  | { kind: "symlink"; relativePath: string; target: string };

/**
 * Hash the complete installed runtime, not only its CLI entry point.
 *
 * The canonical stream is a namespace line followed by JSON tuple lines in
 * byte-sorted relative-path order. Directory records preserve empty
 * directories, file records include a SHA-256 of their bytes, and symlink
 * records include their link text. Only the checkout's root `.git` entry is
 * excluded. Symlinks must resolve inside the installation root, and all other
 * filesystem object types fail closed. POSIX mode bits are deliberately not
 * hashed: the adapter launches the entry point through `process.execPath`, and
 * dependency identity depends on path, type, link topology, and bytes rather
 * than checkout umask. A file that cannot be read still fails verification.
 */
export async function deepSeekInstallationTreeDigest(root: string): Promise<string> {
  const canonicalRoot = await realpath(root);
  const entries: InstallationEntry[] = [];
  await collectInstallationEntries(canonicalRoot, canonicalRoot, entries);
  entries.sort((left, right) => compareBytes(left.relativePath, right.relativePath));

  const files = entries.filter((entry): entry is Extract<InstallationEntry, { kind: "file" }> => entry.kind === "file");
  let nextFileIndex = 0;
  await Promise.all(Array.from(
    { length: Math.min(FILE_HASH_CONCURRENCY, files.length) },
    async () => {
      while (nextFileIndex < files.length) {
        const file = files[nextFileIndex];
        nextFileIndex += 1;
        file.sha256 = await sha256RegularFile(file.absolutePath, file.relativePath);
      }
    },
  ));

  const digest = createHash("sha256");
  digest.update(`${TREE_DIGEST_NAMESPACE}\n`);
  for (const entry of entries) {
    const record = entry.kind === "file"
      ? [entry.kind, entry.relativePath, entry.sha256]
      : entry.kind === "symlink"
        ? [entry.kind, entry.relativePath, entry.target]
        : [entry.kind, entry.relativePath];
    digest.update(`${JSON.stringify(record)}\n`);
  }
  return digest.digest("hex");
}

async function collectInstallationEntries(
  canonicalRoot: string,
  directory: string,
  entries: InstallationEntry[],
): Promise<void> {
  const dirents = await readdir(directory, { withFileTypes: true });
  dirents.sort((left, right) => compareBytes(left.name, right.name));

  for (const dirent of dirents) {
    const absolutePath = path.join(directory, dirent.name);
    const relativePath = portableRelativePath(canonicalRoot, absolutePath);
    if (relativePath === ".git") continue;

    if (dirent.isDirectory()) {
      entries.push({ kind: "directory", relativePath });
      await collectInstallationEntries(canonicalRoot, absolutePath, entries);
      continue;
    }
    if (dirent.isFile()) {
      entries.push({ kind: "file", relativePath, absolutePath });
      continue;
    }
    if (dirent.isSymbolicLink()) {
      const [target, resolvedTarget] = await Promise.all([
        readlink(absolutePath),
        realpath(absolutePath).catch(() => {
          throw new Error(`DeepSeek Harness installation contains a dangling symlink: ${relativePath}.`);
        }),
      ]);
      const lexicalTarget = path.resolve(path.dirname(absolutePath), target);
      if (!isInside(canonicalRoot, lexicalTarget)) {
        throw new Error(`DeepSeek Harness installation symlink escapes its root: ${relativePath}.`);
      }
      if (!isInside(canonicalRoot, resolvedTarget)) {
        throw new Error(`DeepSeek Harness installation symlink escapes its root: ${relativePath}.`);
      }
      if (isRootGitMetadata(canonicalRoot, resolvedTarget)) {
        throw new Error(`DeepSeek Harness installation symlink targets excluded .git metadata: ${relativePath}.`);
      }
      entries.push({ kind: "symlink", relativePath, target });
      continue;
    }
    throw new Error(`DeepSeek Harness installation contains a special file: ${relativePath}.`);
  }
}

async function sha256RegularFile(absolutePath: string, relativePath: string): Promise<string> {
  let handle;
  try {
    handle = await open(absolutePath, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (error) {
    throw new Error(`DeepSeek Harness installation file cannot be opened safely: ${relativePath}.`, { cause: error });
  }
  try {
    const stat = await handle.stat();
    if (!stat.isFile()) {
      throw new Error(`DeepSeek Harness installation entry changed type while hashing: ${relativePath}.`);
    }
    const digest = createHash("sha256");
    const stream = createReadStream(absolutePath, { fd: handle.fd, autoClose: false });
    for await (const chunk of stream) digest.update(chunk);
    return digest.digest("hex");
  } finally {
    await handle.close();
  }
}

function portableRelativePath(root: string, value: string): string {
  return path.relative(root, value).split(path.sep).join("/");
}

function isInside(root: string, value: string): boolean {
  const relative = path.relative(root, value);
  return relative === "" || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`));
}

function isRootGitMetadata(root: string, value: string): boolean {
  const relative = portableRelativePath(root, value);
  return relative === ".git" || relative.startsWith(".git/");
}

function compareBytes(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left), Buffer.from(right));
}
