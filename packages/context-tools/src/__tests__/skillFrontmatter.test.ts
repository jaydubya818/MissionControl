import { describe, expect, it } from "vitest";
import {
  SkillFrontmatterError,
  extractRawFrontmatter,
  isKebabCase,
  parseSkillFrontmatter,
  serializeSkillFrontmatter,
  validateRawFrontmatter,
  type SkillFrontmatter,
} from "../skillFrontmatter.js";

const VALID = `---
name: mission-control-heartbeat
description: >-
  Keeps an agent alive in Mission Control. Use this skill when you need to run
  a heartbeat loop and react to quarantine rules.
version: 1.0.0
owner: software-factory
risk: low
capabilities:
  - heartbeat
  - quarantine-recovery
requires_tools:
  - convex
related_skills:
  - mission-control-register-agent
compatibility: convex-backend
---

## Body

Content here.
`;

describe("parseSkillFrontmatter — valid documents", () => {
  it("parses a fully populated frontmatter block", () => {
    const fm = parseSkillFrontmatter(VALID);
    expect(fm.name).toBe("mission-control-heartbeat");
    expect(fm.version).toBe("1.0.0");
    expect(fm.owner).toBe("software-factory");
    expect(fm.risk).toBe("low");
    expect(fm.capabilities).toEqual(["heartbeat", "quarantine-recovery"]);
    expect(fm.requires_tools).toEqual(["convex"]);
    expect(fm.related_skills).toEqual(["mission-control-register-agent"]);
    expect(fm.compatibility).toBe("convex-backend");
  });

  it("folds a > block scalar into space-joined text", () => {
    const fm = parseSkillFrontmatter(VALID);
    expect(fm.description).toBe(
      "Keeps an agent alive in Mission Control. Use this skill when you need to run a heartbeat loop and react to quarantine rules.",
    );
  });

  it("keeps newlines in a | literal block scalar", () => {
    const md = `---
name: demo-skill
description: |-
  Line one.
  Line two.
version: 0.1.0
owner: team
---
body`;
    expect(parseSkillFrontmatter(md).description).toBe("Line one.\nLine two.");
  });

  it("folds blank lines in a > block into newlines", () => {
    const md = `---
name: demo-skill
description: >-
  Para one a
  para one b.

  Para two.
version: 0.1.0
owner: team
---
body`;
    expect(parseSkillFrontmatter(md).description).toBe("Para one a para one b.\nPara two.");
  });

  it("strips single and double quotes from scalars", () => {
    const md = `---
name: demo-skill
description: "Use this skill when quoting: it has punctuation."
version: 0.1.0
owner: 'the-team'
---
body`;
    const fm = parseSkillFrontmatter(md);
    expect(fm.description).toBe("Use this skill when quoting: it has punctuation.");
    expect(fm.owner).toBe("the-team");
  });

  it("omits optional fields that are absent", () => {
    const md = `---
name: demo-skill
description: Use this skill when demonstrating the minimal valid frontmatter shape.
---
body`;
    const fm = parseSkillFrontmatter(md);
    expect(fm.version).toBeUndefined();
    expect(fm.owner).toBeUndefined();
    expect(fm.risk).toBeUndefined();
    expect(fm.capabilities).toBeUndefined();
    expect(fm.compatibility).toBeUndefined();
  });

  it("normalizes portable Agent Skills metadata", () => {
    const md = `---
name: portable-skill
description: Use this skill when validating portable Agent Skills metadata.
license: MIT
compatibility: Works with Agent Skills-compatible harnesses.
metadata:
  author: upstream-author
  source-version: "0.9.29"
  owner: software-factory
  risk: medium
  capabilities: planning,multi-agent-workflow
allowed-tools: >-
  Bash(git status *) Bash(pnpm test *)
user-invocable: false
---
body`;
    expect(parseSkillFrontmatter(md)).toEqual({
      name: "portable-skill",
      description: "Use this skill when validating portable Agent Skills metadata.",
      owner: "software-factory",
      risk: "medium",
      capabilities: ["planning", "multi-agent-workflow"],
      compatibility: "Works with Agent Skills-compatible harnesses.",
      license: "MIT",
      allowedTools: "Bash(git status *) Bash(pnpm test *)",
      userInvocable: false,
      metadata: {
        author: "upstream-author",
        "source-version": "0.9.29",
        owner: "software-factory",
        risk: "medium",
        capabilities: "planning,multi-agent-workflow",
      },
    });
  });

  it("prefers legacy top-level governance fields over metadata", () => {
    const md = `---
name: mixed-skill
description: Use this skill when validating mixed legacy and portable metadata.
version: 2.0.0
owner: local-team
risk: low
capabilities:
  - local-capability
metadata:
  version: 1.0.0
  owner: upstream-team
  risk: high
  capabilities: upstream-capability
---
body`;
    const fm = parseSkillFrontmatter(md);
    expect(fm.version).toBe("2.0.0");
    expect(fm.owner).toBe("local-team");
    expect(fm.risk).toBe("low");
    expect(fm.capabilities).toEqual(["local-capability"]);
  });

  it("skips blank lines and comments inside the block", () => {
    const md = `---
name: demo-skill

# a comment
description: Use this skill when checking comment and blank-line handling in the parser.
version: 0.1.0
owner: team
---
body`;
    expect(parseSkillFrontmatter(md).name).toBe("demo-skill");
  });
});

function withFrontmatter(overrides: Record<string, string>, drop: string[] = []): string {
  const fields: Record<string, string> = {
    name: "demo-skill",
    description: "Use this skill when validating the frontmatter matrix in unit tests.",
    version: "1.0.0",
    owner: "team",
    ...overrides,
  };
  for (const key of drop) delete fields[key];
  const lines = Object.entries(fields).map(([k, v]) => `${k}: ${v}`);
  return ["---", ...lines, "---", "body"].join("\n");
}

describe("parseSkillFrontmatter — invalid documents", () => {
  it("throws when frontmatter is missing entirely", () => {
    expect(() => parseSkillFrontmatter("# Just a heading\n")).toThrow(SkillFrontmatterError);
    expect(() => parseSkillFrontmatter("")).toThrow(/missing frontmatter/);
  });

  it("throws on an unterminated block", () => {
    expect(() => parseSkillFrontmatter("---\nname: x\n")).toThrow(/missing closing "---"/);
  });

  it.each([
    ["name", withFrontmatter({}, ["name"])],
    ["description", withFrontmatter({}, ["description"])],
  ])("throws when required field %s is missing", (field, md) => {
    expect(() => parseSkillFrontmatter(md)).toThrow(new RegExp(`"${field}" is missing`));
  });

  it("throws on empty required values", () => {
    expect(() => parseSkillFrontmatter(withFrontmatter({ owner: '""' }))).toThrow(/"owner" is empty/);
  });

  it.each([
    ["Not-Kebab"],
    ["has_underscore"],
    ["-leading-dash"],
    ["double--dash"],
    ["UPPER"],
  ])("rejects non-kebab-case name %j", (name) => {
    expect(() => parseSkillFrontmatter(withFrontmatter({ name }))).toThrow(/kebab-case/);
  });

  it.each([["1.2"], ["v1.2.3"], ["1.2.3-beta"], ["01.2.3"]])("rejects invalid version %j", (version) => {
    expect(() => parseSkillFrontmatter(withFrontmatter({ version }))).toThrow(SkillFrontmatterError);
  });

  it("rejects invalid risk values", () => {
    expect(() => parseSkillFrontmatter(withFrontmatter({ risk: "extreme" }))).toThrow(
      /"risk" must be one of low, medium, high/,
    );
  });

  it("rejects unknown fields", () => {
    expect(() => parseSkillFrontmatter(withFrontmatter({ colour: "red" }))).toThrow(/unknown field "colour"/);
  });

  it("rejects a scalar where a list is required", () => {
    expect(() => parseSkillFrontmatter(withFrontmatter({ capabilities: "heartbeat" }))).toThrow(
      /"capabilities" must be a string list/,
    );
  });

  it("rejects duplicate keys with a line number", () => {
    const md = "---\nname: a-skill\nname: b-skill\n---\nbody";
    try {
      parseSkillFrontmatter(md);
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(SkillFrontmatterError);
      expect((err as SkillFrontmatterError).line).toBe(3);
      expect((err as SkillFrontmatterError).message).toMatch(/duplicate key "name"/);
    }
  });

  it.each([
    ["flow sequence", "capabilities: [a, b]", /flow collections/],
    ["flow mapping", "compatibility: {a: 1}", /flow collections/],
    ["tab indentation", "capabilities:\n\t- x", /tabs are not allowed/],
    ["nested mapping", "compatibility:\n  nested: yes\n  deeper: no", /list|nested/],
    ["nested metadata mapping", "metadata:\n  owner:\n    nested: no", /metadata values must be scalars/],
    ["anchor", "owner: &anchor team", /anchors/],
  ])("rejects unsupported YAML (%s) with a typed error", (_label, snippet, re) => {
    const md = `---\nname: demo-skill\ndescription: Use this skill when testing unsupported syntax rejection paths.\nversion: 1.0.0\n${snippet}\n---\nbody`;
    expect(() => parseSkillFrontmatter(md)).toThrow(SkillFrontmatterError);
    expect(() => parseSkillFrontmatter(md)).toThrow(re);
  });

  it("reports line numbers for syntax errors", () => {
    const md = "---\nname: demo-skill\nnot a key value line\n---\nbody";
    try {
      parseSkillFrontmatter(md);
      expect.unreachable("should have thrown");
    } catch (err) {
      expect((err as SkillFrontmatterError).line).toBe(3);
    }
  });
});

describe("extractRawFrontmatter / validateRawFrontmatter", () => {
  it("returns null when there is no frontmatter", () => {
    expect(extractRawFrontmatter("hello\n---\n")).toBeNull();
  });

  it("computes body and bodyStartLine", () => {
    const raw = extractRawFrontmatter("---\nname: x-skill\n---\nline one\nline two");
    expect(raw).not.toBeNull();
    expect(raw!.body).toBe("line one\nline two");
    expect(raw!.bodyStartLine).toBe(4);
  });

  it("collects every field issue instead of stopping at the first", () => {
    const raw = extractRawFrontmatter("---\nname: Bad_Name\nversion: nope\n---\nbody");
    const { frontmatter, issues } = validateRawFrontmatter(raw!);
    expect(frontmatter).toBeNull();
    const fields = issues.map((i) => i.field).sort();
    expect(fields).toEqual(["description", "name", "version"]);
  });
});

describe("serializeSkillFrontmatter", () => {
  const fm: SkillFrontmatter = {
    name: "demo-skill",
    description: "Use this skill when checking that serialization round-trips through the parser.",
    version: "1.2.3",
    owner: "software-factory",
    risk: "medium",
    capabilities: ["one", "two"],
    requires_tools: ["convex"],
    related_skills: ["other-skill"],
    compatibility: "convex-backend",
  };

  it("round-trips through parseSkillFrontmatter", () => {
    const block = serializeSkillFrontmatter(fm);
    expect(parseSkillFrontmatter(block + "body")).toEqual(fm);
  });

  it("round-trips multi-line descriptions via literal blocks", () => {
    const multi: SkillFrontmatter = { ...fm, description: "Use this skill when:\n- testing\n- round-trips" };
    const block = serializeSkillFrontmatter(multi);
    expect(block).toContain("description: |-");
    expect(parseSkillFrontmatter(block + "body").description).toBe(multi.description);
  });

  it("emits a stable canonical key order", () => {
    const block = serializeSkillFrontmatter(fm);
    const keys = block
      .split("\n")
      .map((l) => /^([a-z_]+):/.exec(l)?.[1])
      .filter((k): k is string => k !== undefined);
    expect(keys).toEqual([
      "name",
      "description",
      "version",
      "owner",
      "risk",
      "capabilities",
      "requires_tools",
      "related_skills",
      "compatibility",
    ]);
  });

  it("omits absent optional fields", () => {
    const minimal: SkillFrontmatter = {
      name: "demo-skill",
      description: "Use this skill when verifying that optional fields are omitted from output.",
    };
    const block = serializeSkillFrontmatter(minimal);
    expect(block).not.toContain("version:");
    expect(block).not.toContain("owner:");
    expect(block).not.toContain("risk:");
    expect(block).not.toContain("capabilities:");
  });

  it("round-trips portable fields and metadata", () => {
    const portable: SkillFrontmatter = {
      name: "portable-skill",
      description: "Use this skill when checking portable frontmatter serialization.",
      owner: "software-factory",
      license: "MIT",
      allowedTools: "Bash(git status *)",
      userInvocable: false,
      metadata: {
        owner: "software-factory",
        author: "upstream-author",
      },
    };
    const block = serializeSkillFrontmatter(portable);
    expect(parseSkillFrontmatter(block + "body")).toEqual(portable);
  });

  it("rejects frontmatter that would not validate", () => {
    expect(() => serializeSkillFrontmatter({ ...fm, name: "Not Kebab" })).toThrow(SkillFrontmatterError);
    expect(() => serializeSkillFrontmatter({ ...fm, version: "1.2" })).toThrow(SkillFrontmatterError);
  });
});

describe("isKebabCase", () => {
  it.each([
    ["mission-control", true],
    ["a", true],
    ["a1-b2", true],
    ["A-b", false],
    ["a_b", false],
    ["a--b", false],
    ["-a", false],
    ["a-", false],
    ["", false],
  ])("isKebabCase(%j) === %j", (input, expected) => {
    expect(isKebabCase(input)).toBe(expected);
  });
});
