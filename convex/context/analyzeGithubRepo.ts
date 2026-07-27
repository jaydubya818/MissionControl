/**
 * Analyze a public GitHub repository for SKILL.md files and import into the registry.
 */

import { v } from "convex/values";
import { action } from "../_generated/server";
import { api } from "../_generated/api";
import {
  discoverSkillPaths,
  extractSkillFrontmatter,
  fetchSkillContent,
  parseRepoInput,
  quickLintSkill,
} from "../lib/githubRepoSkills";
import { repoFullName, sha256Hex } from "../lib/harnessPrChecks";

export const analyzeRepository = action({
  args: {
    repoUrl: v.string(),
    projectId: v.optional(v.id("projects")),
    actorId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { owner, repo } = parseRepoInput(args.repoUrl);
    const token = process.env.GITHUB_TOKEN;
    const skills = await discoverSkillPaths(owner, repo, token);

    if (skills.length === 0) {
      return {
        success: false as const,
        error: "No SKILL.md files found in repository default branch",
        imported: [] as string[],
      };
    }

    const imported: Array<{ name: string; slug: string; score: number; version?: string }> = [];
    const errors: string[] = [];

    for (const skill of skills) {
      try {
        const content = await fetchSkillContent(skill.rawUrl, token);
        const fm = extractSkillFrontmatter(content);
        const lint = quickLintSkill(content);
        const contentHash = `sha256:${await sha256Hex(content)}`;
        const slugScope = repo.replace(/[^a-z0-9-]/gi, "-").toLowerCase();
        const result = await ctx.runMutation(api.context.importSkills.importSkillMarkdown, {
          slug: `${slugScope}/${fm.name}`,
          name: fm.name,
          description: fm.description,
          content,
          owner: fm.owner,
          type: "SKILL",
          contentHash,
          qualityScore: lint.score,
          reviewAxes: lint.axes,
          tags: ["github-import", owner],
          sourceRepo: repoFullName(owner, repo),
          sourcePath: skill.sourcePath,
          projectId: args.projectId,
          actorId: args.actorId ?? "github-analyze",
        });
        imported.push({
          name: fm.name,
          slug: `${slugScope}/${fm.name}`,
          score: lint.score,
          version: result?.version,
        });
      } catch (err) {
        errors.push(`${skill.sourcePath}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return {
      success: imported.length > 0,
      imported,
      errors,
      scanned: skills.length,
    };
  },
});
