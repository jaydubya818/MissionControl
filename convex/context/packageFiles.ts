import { v } from "convex/values";
import { action } from "../_generated/server";
import { discoverSkillPaths } from "../lib/githubRepoSkills";
import { buildFileTreeFromPaths, skillDirectoryPrefix } from "../lib/fileTree";

export const listSourceTree = action({
  args: {
    sourceRepo: v.string(),
    sourcePath: v.optional(v.string()),
  },
  handler: async (_ctx, args) => {
    const parts = args.sourceRepo.trim().split("/");
    if (parts.length !== 2) {
      throw new Error("sourceRepo must be owner/repo");
    }
    const [owner, repo] = parts;
    const token = process.env.GITHUB_TOKEN;

    const skills = await discoverSkillPaths(owner, repo, token);
    const prefix = skillDirectoryPrefix(args.sourcePath);
    const relevant = prefix
      ? skills.filter((s) => s.sourcePath.startsWith(`${prefix}/`) || s.sourcePath === args.sourcePath)
      : skills;

    const paths = relevant.map((s) => s.sourcePath);
    if (args.sourcePath && !paths.includes(args.sourcePath)) {
      paths.unshift(args.sourcePath);
    }

    const tree = buildFileTreeFromPaths(paths);
    return { paths, tree, sourceRepo: args.sourceRepo, prefix: prefix || null };
  },
});
