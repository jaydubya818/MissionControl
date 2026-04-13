import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "../../..");
const USER_HOME = process.env.HOME ?? process.env.USERPROFILE ?? "";

export type SkillSource = "repo" | "codex" | "openclaw";

export interface SkillRecord {
  id: string;
  name: string;
  source: SkillSource;
  sourceLabel: string;
  relativePath: string;
  skillPath: string;
  updatedAt: number;
  fileCount: number;
  description: string | null;
}

export interface SkillFileRecord {
  path: string;
  name: string;
  extension: string;
  size: number;
  updatedAt: number;
}

const SKILL_SOURCE_LABELS: Record<SkillSource, string> = {
  repo: "Repo plugin",
  codex: "Codex",
  openclaw: "OpenClaw",
};

function isDirectory(targetPath: string): boolean {
  try {
    return fs.statSync(targetPath).isDirectory();
  } catch {
    return false;
  }
}

function isFile(targetPath: string): boolean {
  try {
    return fs.statSync(targetPath).isFile();
  } catch {
    return false;
  }
}

function safeResolve(basePath: string, relativePath: string): string {
  const resolved = path.resolve(basePath, relativePath);
  const normalizedBase = path.resolve(basePath);
  if (resolved !== normalizedBase && !resolved.startsWith(`${normalizedBase}${path.sep}`)) {
    throw new Error("Path escapes allowed skill root");
  }
  return resolved;
}

function countFiles(directoryPath: string): number {
  let count = 0;
  const stack = [directoryPath];

  while (stack.length > 0) {
    const currentPath = stack.pop();
    if (!currentPath || !isDirectory(currentPath)) continue;

    for (const entry of fs.readdirSync(currentPath, { withFileTypes: true })) {
      if (entry.name === ".DS_Store") continue;
      const entryPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) stack.push(entryPath);
      if (entry.isFile()) count += 1;
    }
  }

  return count;
}

function parseSkillDescription(skillFilePath: string): string | null {
  try {
    const raw = fs.readFileSync(skillFilePath, "utf8");
    const lines = raw.split(/\r?\n/).slice(0, 40);
    let inFrontmatter = false;

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed === "---") {
        inFrontmatter = !inFrontmatter;
        continue;
      }
      if (inFrontmatter) {
        const match = /^description:\s*(.+)$/.exec(trimmed);
        if (match) return match[1].replace(/^["']|["']$/g, "");
        continue;
      }
      if (!trimmed || trimmed.startsWith("#")) continue;
      return trimmed;
    }
  } catch {
    return null;
  }

  return null;
}

function makeSkillId(source: SkillSource, relativePath: string): string {
  return `${source}:${relativePath.replace(/\\/g, "/")}`;
}

export function discoverSkills(): SkillRecord[] {
  const records: SkillRecord[] = [];

  const codexRoot = USER_HOME ? path.join(USER_HOME, ".codex", "skills") : null;
  if (codexRoot && isDirectory(codexRoot)) {
    for (const entry of fs.readdirSync(codexRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const skillPath = path.join(codexRoot, entry.name);
      const skillFilePath = path.join(skillPath, "SKILL.md");
      if (!isFile(skillFilePath)) continue;
      const stats = fs.statSync(skillFilePath);
      records.push({
        id: makeSkillId("codex", entry.name),
        name: entry.name,
        source: "codex",
        sourceLabel: SKILL_SOURCE_LABELS.codex,
        relativePath: entry.name,
        skillPath,
        updatedAt: stats.mtimeMs,
        fileCount: countFiles(skillPath),
        description: parseSkillDescription(skillFilePath),
      });
    }
  }

  const openclawRoot = USER_HOME ? path.join(USER_HOME, ".openclaw", "skills") : null;
  if (openclawRoot && isDirectory(openclawRoot)) {
    for (const entry of fs.readdirSync(openclawRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const skillPath = path.join(openclawRoot, entry.name);
      const skillFilePath = path.join(skillPath, "SKILL.md");
      if (!isFile(skillFilePath)) continue;
      const stats = fs.statSync(skillFilePath);
      records.push({
        id: makeSkillId("openclaw", entry.name),
        name: entry.name,
        source: "openclaw",
        sourceLabel: SKILL_SOURCE_LABELS.openclaw,
        relativePath: entry.name,
        skillPath,
        updatedAt: stats.mtimeMs,
        fileCount: countFiles(skillPath),
        description: parseSkillDescription(skillFilePath),
      });
    }
  }

  const repoPluginsRoot = path.join(REPO_ROOT, "plugins");
  if (isDirectory(repoPluginsRoot)) {
    for (const pluginEntry of fs.readdirSync(repoPluginsRoot, { withFileTypes: true })) {
      if (!pluginEntry.isDirectory()) continue;
      const skillsRoot = path.join(repoPluginsRoot, pluginEntry.name, "skills");
      if (!isDirectory(skillsRoot)) continue;

      for (const skillEntry of fs.readdirSync(skillsRoot, { withFileTypes: true })) {
        if (!skillEntry.isDirectory()) continue;
        const skillPath = path.join(skillsRoot, skillEntry.name);
        const skillFilePath = path.join(skillPath, "SKILL.md");
        if (!isFile(skillFilePath)) continue;
        const stats = fs.statSync(skillFilePath);
        const relativePath = path.posix.join(pluginEntry.name, skillEntry.name);
        records.push({
          id: makeSkillId("repo", relativePath),
          name: skillEntry.name,
          source: "repo",
          sourceLabel: SKILL_SOURCE_LABELS.repo,
          relativePath,
          skillPath,
          updatedAt: stats.mtimeMs,
          fileCount: countFiles(skillPath),
          description: parseSkillDescription(skillFilePath),
        });
      }
    }
  }

  return records.sort((left, right) => right.updatedAt - left.updatedAt);
}

export function resolveSkill(skillId: string): SkillRecord {
  const match = discoverSkills().find((skill) => skill.id === skillId);
  if (!match) {
    throw new Error("Skill not found");
  }
  return match;
}

export function listSkillFiles(skillId: string): SkillFileRecord[] {
  const skill = resolveSkill(skillId);
  const files: SkillFileRecord[] = [];
  const stack = [skill.skillPath];

  while (stack.length > 0) {
    const currentPath = stack.pop();
    if (!currentPath || !isDirectory(currentPath)) continue;

    for (const entry of fs.readdirSync(currentPath, { withFileTypes: true })) {
      if (entry.name === ".DS_Store") continue;
      const entryPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        stack.push(entryPath);
        continue;
      }
      if (!entry.isFile()) continue;
      const stats = fs.statSync(entryPath);
      const relativePath = path.relative(skill.skillPath, entryPath).replace(/\\/g, "/");
      files.push({
        path: relativePath,
        name: entry.name,
        extension: path.extname(entry.name).slice(1),
        size: stats.size,
        updatedAt: stats.mtimeMs,
      });
    }
  }

  return files.sort((left, right) => left.path.localeCompare(right.path));
}

export function readSkillFile(skillId: string, relativeFilePath: string) {
  const skill = resolveSkill(skillId);
  const targetPath = safeResolve(skill.skillPath, relativeFilePath);
  if (!isFile(targetPath)) {
    throw new Error("File not found");
  }

  const stats = fs.statSync(targetPath);
  return {
    path: relativeFilePath,
    content: fs.readFileSync(targetPath, "utf8"),
    updatedAt: stats.mtimeMs,
    size: stats.size,
  };
}

export function writeSkillFile(skillId: string, relativeFilePath: string, content: string) {
  const skill = resolveSkill(skillId);
  const targetPath = safeResolve(skill.skillPath, relativeFilePath);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, content, "utf8");
  const stats = fs.statSync(targetPath);

  return {
    success: true,
    path: relativeFilePath,
    updatedAt: stats.mtimeMs,
    size: stats.size,
    bytesWritten: Buffer.byteLength(content, "utf8"),
  };
}
