import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { lintSkill } from "../skillLint.js";
import { parseSkillFrontmatter, serializeSkillFrontmatter } from "../skillFrontmatter.js";

const root = fileURLToPath(new URL("../../../../", import.meta.url));
const source = JSON.parse(readFileSync(join(root, "docs/skills/skillz-source.json"), "utf8")) as {
  skills: Record<string, string>;
  nativeSkills: string[];
};

function directoryHash(directory: string): string {
  const hash = createHash("sha256");
  function files(current: string, prefix = ""): string[] {
    return readdirSync(current, { withFileTypes: true }).flatMap((entry) => {
      const relative = prefix + entry.name;
      return entry.isDirectory() ? files(join(current, entry.name), relative + "/") : [relative];
    });
  }
  for (const file of files(directory).sort()) {
    hash.update(file).update("\0").update(readFileSync(join(directory, file))).update("\0");
  }
  return hash.digest("hex");
}

describe("pinned Skillz catalog", () => {
  it("contains all 109 upstream skills and all nine native skills", () => {
    const expected = [...Object.keys(source.skills), ...source.nativeSkills].sort();
    expect(Object.keys(source.skills)).toHaveLength(109);
    expect(source.nativeSkills).toHaveLength(9);
    const actual = readdirSync(join(root, "skills"), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name).sort();
    expect(actual).toEqual(expected);
  });

  it("preserves every vendored skill and supporting file from the recorded source", () => {
    for (const [name, expected] of Object.entries(source.skills)) {
      expect(directoryHash(join(root, "skills", name)), name).toBe(expected);
    }
  });

  it("parses, round-trips, and quality-checks every upstream skill", () => {
    for (const name of Object.keys(source.skills)) {
      const path = join(root, "skills", name, "SKILL.md");
      const markdown = readFileSync(path, "utf8");
      const frontmatter = parseSkillFrontmatter(markdown);
      expect(frontmatter.name).toBe(name);
      expect(parseSkillFrontmatter(serializeSkillFrontmatter(frontmatter))).toEqual(frontmatter);
      const lint = lintSkill(markdown, { path });
      expect(lint.findings.filter((finding) => finding.severity === "error"), name).toEqual([]);
      expect(lint.score, name).toBeGreaterThanOrEqual(80);
    }
  });
});
