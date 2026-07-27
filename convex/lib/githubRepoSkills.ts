import { parseGitHubRepoUrl } from "./harnessPrChecks";

export interface DiscoveredSkill {
  sourcePath: string;
  rawUrl: string;
}

export interface SkillFrontmatterFields {
  name: string;
  description: string;
  owner: string;
  version?: string;
  capabilities?: string[];
}

export function extractSkillFrontmatter(content: string): SkillFrontmatterFields {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) {
    throw new Error("Missing YAML frontmatter delimiters (---)");
  }
  const block = match[1];
  const fields: Record<string, string> = {};
  for (const line of block.split("\n")) {
    const kv = line.match(/^([A-Za-z_][A-Za-z0-9_-]*):\s*(.+)$/);
    if (kv) fields[kv[1]] = kv[2].trim().replace(/^['"]|['"]$/g, "");
  }
  if (!fields.name || !fields.description || !fields.owner) {
    throw new Error("Required frontmatter fields: name, description, owner");
  }
  return {
    name: fields.name,
    description: fields.description,
    owner: fields.owner,
    version: fields.version,
  };
}

export function quickLintSkill(content: string): {
  score: number;
  axes: { validation: number; implementation: number; activation: number };
} {
  let score = 100;
  try {
    extractSkillFrontmatter(content);
  } catch {
    score = 40;
  }
  const body = content.replace(/^---[\s\S]*?---\r?\n?/, "");
  if (body.length < 200) score -= 10;
  if (!/\b(use when|use for|invoke when)\b/i.test(content)) score -= 15;
  if (/^##/m.test(body) === false) score -= 5;
  score = Math.max(0, Math.min(100, score));
  return {
    score,
    axes: {
      validation: score,
      implementation: Math.max(0, score - 5),
      activation: /\b(use when|use for)\b/i.test(content) ? score : Math.max(0, score - 20),
    },
  };
}

export async function discoverSkillPaths(
  owner: string,
  repo: string,
  token?: string
): Promise<DiscoveredSkill[]> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "MissionControl-Registry-Analyze",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const refRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers });
  if (!refRes.ok) {
    throw new Error(`GitHub repo lookup failed (${refRes.status})`);
  }
  const repoMeta = (await refRes.json()) as { default_branch?: string };
  const branch = repoMeta.default_branch ?? "main";

  const treeRes = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
    { headers }
  );
  if (!treeRes.ok) {
    throw new Error(`GitHub tree lookup failed (${treeRes.status})`);
  }
  const tree = (await treeRes.json()) as { tree?: Array<{ path?: string; type?: string }> };
  const paths = (tree.tree ?? [])
    .filter((n) => n.type === "blob" && n.path?.endsWith("SKILL.md"))
    .map((n) => n.path!)
    .slice(0, 40);

  return paths.map((sourcePath) => ({
    sourcePath,
    rawUrl: `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${sourcePath}`,
  }));
}

export async function fetchSkillContent(rawUrl: string, token?: string): Promise<string> {
  const headers: Record<string, string> = { "User-Agent": "MissionControl-Registry-Analyze" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(rawUrl, { headers });
  if (!res.ok) throw new Error(`Failed to fetch ${rawUrl} (${res.status})`);
  return res.text();
}

export function parseRepoInput(input: string): { owner: string; repo: string } {
  const parsed = parseGitHubRepoUrl(input);
  if (!parsed) throw new Error("Invalid GitHub repository URL");
  return parsed;
}
