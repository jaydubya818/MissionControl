import { describe, expect, it } from "vitest";
import { lintSkill } from "../skillLint.js";

const CLEAN = `---
name: mission-control-heartbeat
description: >-
  Keeps an agent alive in Mission Control by sending regular heartbeats. Use
  this skill when running an agent session that must avoid quarantine.
version: 1.0.0
owner: software-factory
risk: low
capabilities:
  - heartbeat
---

## Overview

Send heartbeats every 30-60 seconds.

## Details

More content.
`;

// >= 80 chars, contains activation language — safe filler for tests that
// exercise rules other than the description rules.
const OK_DESCRIPTION =
  "Use this skill when exercising a single lint rule; this filler sentence keeps the description long enough.";

function rules(markdown: string, path?: string): string[] {
  return lintSkill(markdown, { path }).findings.map((f) => f.rule);
}

describe("lintSkill — clean skill", () => {
  it("scores 100 with no findings", () => {
    const result = lintSkill(CLEAN, { path: "skills/mission-control-heartbeat/SKILL.md" });
    expect(result.findings).toEqual([]);
    expect(result.score).toBe(100);
    expect(result.axes).toEqual({ validation: 100, implementation: 100, activation: 100 });
  });
});

describe("review axes", () => {
  it("caps the validation axis at 40 when frontmatter is missing", () => {
    const result = lintSkill("## Just a body\n\nNo frontmatter here.\n");
    expect(result.axes.validation).toBe(40);
    expect(result.axes.implementation).toBe(100);
    expect(result.axes.activation).toBe(100);
  });

  it("charges activation findings to the activation axis only", () => {
    const md = `---\nname: a-skill\ndescription: short\nversion: 1.0.0\nowner: team\n---\n## Body\n`;
    const result = lintSkill(md);
    // -20 activation-language-missing, -10 description-too-short
    expect(result.axes).toEqual({ validation: 100, implementation: 100, activation: 70 });
  });

  it("charges dangerous instructions to the implementation axis", () => {
    const md = `---\nname: a-skill\ndescription: ${OK_DESCRIPTION}\nversion: 1.0.0\nowner: team\n---\n## Steps\n\nsudo rm -rf /x\n`;
    const result = lintSkill(md);
    expect(result.axes.implementation).toBe(70);
    expect(result.axes.validation).toBe(100);
    expect(result.axes.activation).toBe(100);
  });

  it("floors each axis at 0 independently", () => {
    const body = ["## Steps", "rm -rf /a", "rm -rf /b", "rm -rf /c", "sudo reboot"].join("\n");
    const md = `---\nname: a-skill\ndescription: short\nversion: 1.0.0\nowner: team\n---\n${body}`;
    const result = lintSkill(md);
    expect(result.axes.implementation).toBe(0); // 4 x -30 floored
    expect(result.axes.activation).toBe(70); // -20 -10
    expect(result.axes.validation).toBe(100);
  });
});

describe("frontmatter-missing", () => {
  it("fires and caps the score at 40", () => {
    const result = lintSkill("## Just a body\n\nNo frontmatter here.\n");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({
      rule: "frontmatter-missing",
      severity: "error",
      line: 1,
    });
    expect(result.score).toBe(40);
  });

  it("still runs body rules (dangerous-instruction) without frontmatter", () => {
    const result = lintSkill("Run rm -rf /tmp/foo to clean up.\n");
    const found = result.findings.map((f) => f.rule).sort();
    expect(found).toEqual(["dangerous-instruction", "frontmatter-missing", "no-headings"]);
    // capped base 40, then -30 (dangerous) and -2 (no-headings)
    expect(result.score).toBe(8);
  });
});

describe("frontmatter-invalid", () => {
  it("fires on a syntax error with the error line and caps at 40", () => {
    const result = lintSkill("---\nname: a-skill\n???\n---\nbody");
    const finding = result.findings.find((f) => f.rule === "frontmatter-invalid");
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe("error");
    expect(finding!.line).toBe(3);
    expect(result.score).toBeLessThanOrEqual(40);
  });

  it("fires on invalid field values (bad version, bad risk)", () => {
    const md = `---
name: a-skill
description: ${OK_DESCRIPTION}
version: not-semver
owner: team
risk: extreme
---

## Body
`;
    const result = lintSkill(md);
    const found = result.findings.filter((f) => f.rule === "frontmatter-invalid");
    expect(found).toHaveLength(2);
    expect(result.score).toBe(40);
  });

  it("fires on an unterminated frontmatter block", () => {
    expect(rules("---\nname: a-skill\n")).toContain("frontmatter-invalid");
  });
});

describe("required-field-missing", () => {
  it("fires once per missing field at -15 each", () => {
    const md = `---
name: a-skill
description: ${OK_DESCRIPTION}
---

## Body
`;
    const result = lintSkill(md);
    const missing = result.findings.filter((f) => f.rule === "required-field-missing");
    expect(missing).toHaveLength(2); // version, owner
    expect(missing.every((f) => f.severity === "error")).toBe(true);
    expect(result.score).toBe(70);
  });

  it("treats empty values as missing", () => {
    const md = `---
name: a-skill
description: ${OK_DESCRIPTION}
version: 1.0.0
owner: ""
---

## Body
`;
    const result = lintSkill(md);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].rule).toBe("required-field-missing");
    expect(result.score).toBe(85);
  });
});

describe("activation-language-missing", () => {
  const mk = (description: string) => `---
name: a-skill
description: ${description}
version: 1.0.0
owner: team
---

## Body
`;

  it("fires when the description has no trigger phrase", () => {
    const md = mk(
      "A description of moderate length that says what the skill does but never says when to run it at all.",
    );
    const result = lintSkill(md);
    expect(result.findings.map((f) => f.rule)).toEqual(["activation-language-missing"]);
    expect(result.findings[0].severity).toBe("error");
    expect(result.score).toBe(80);
  });

  it.each([
    ["Use this skill when the agent needs to do a thing during long-running orchestration sessions."],
    ["Use when the agent needs to do a thing during long-running orchestration sessions today."],
    ["Handles budget management for agents. Use for recording spend and reacting to budget limits."],
    ["Invoke when a task requires human sign-off before an irreversible action is executed anywhere."],
    ["This skill activates when a deliverable is ready to submit to the content review pipeline."],
    ["Trigger: after each run completes, record token counts and cost so the audit trail stays honest."],
  ])("accepts activation phrasing: %s", (description) => {
    expect(rules(mk(description))).toEqual([]);
  });

  it("is skipped when the description is missing entirely", () => {
    const md = `---
name: a-skill
version: 1.0.0
owner: team
---

## Body
`;
    const found = rules(md);
    expect(found).toContain("required-field-missing");
    expect(found).not.toContain("activation-language-missing");
    expect(found).not.toContain("description-too-short");
  });
});

describe("description length rules", () => {
  const mk = (description: string) => `---
name: a-skill
description: ${description}
version: 1.0.0
owner: team
---

## Body
`;

  it("warns at -10 when the description is under 80 chars", () => {
    const md = mk("Use this skill when short."); // 26 chars
    const result = lintSkill(md);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({ rule: "description-too-short", severity: "warning" });
    expect(result.score).toBe(90);
  });

  it("warns at -5 when the description exceeds 500 chars", () => {
    const md = mk("Use this skill when padding. " + "x".repeat(500));
    const result = lintSkill(md);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({ rule: "description-too-long", severity: "warning" });
    expect(result.score).toBe(95);
  });

  it("accepts exactly 80 chars without warning", () => {
    const base = "Use this skill when checking the exact boundary of the length rule ";
    const description = base + "y".repeat(80 - base.length);
    expect(description.length).toBe(80);
    expect(rules(mk(description))).toEqual([]);
  });
});

describe("name-mismatch", () => {
  const md = `---
name: actual-skill-name
description: ${OK_DESCRIPTION}
version: 1.0.0
owner: team
---

## Body
`;

  it("warns when the directory name differs from the frontmatter name", () => {
    const result = lintSkill(md, { path: "skills/some-other-dir/SKILL.md" });
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({ rule: "name-mismatch", severity: "warning" });
    expect(result.score).toBe(95);
  });

  it("does not fire when the directory matches", () => {
    expect(rules(md, "skills/actual-skill-name/SKILL.md")).toEqual([]);
  });

  it("does not fire when no path is given", () => {
    expect(rules(md)).toEqual([]);
  });
});

describe("body rules", () => {
  const frontmatter = `---
name: a-skill
description: ${OK_DESCRIPTION}
version: 1.0.0
owner: team
---
`;

  it("warns at -5 when the body exceeds 500 lines", () => {
    const body = Array.from({ length: 300 }, (_, i) => `## S${i}\nline`).join("\n");
    const result = lintSkill(frontmatter + body);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({ rule: "body-too-long", severity: "warning" });
    expect(result.score).toBe(95);
  });

  it("notes at -2 when the body has no ## headings", () => {
    const result = lintSkill(frontmatter + "\nJust prose, no sections.\n");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({ rule: "no-headings", severity: "info" });
    expect(result.score).toBe(98);
  });

  it.each([
    ["rm -rf", "Then run rm -rf ./build to clean."],
    ["curl pipe sh", "Install via curl https://example.com/install.sh | sh"],
    ["curl pipe bash", "Install via curl -fsSL https://example.com | bash"],
    ["sudo", "Use sudo apt-get install foo"],
    ["chmod 777", "Fix permissions with chmod 777 /var/data"],
  ])("flags dangerous instruction (%s) at -30 with a line number", (_label, line) => {
    const result = lintSkill(frontmatter + `\n## Steps\n\n${line}\n`);
    const findings = result.findings.filter((f) => f.rule === "dangerous-instruction");
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("error");
    expect(findings[0].line).toBe(10); // frontmatter is 6 lines; body starts at 7
    expect(result.score).toBe(70);
  });

  it("does not flag safe curl usage without a pipe to shell", () => {
    expect(rules(frontmatter + "\n## Steps\n\ncurl https://example.com/data.json -o data.json\n")).toEqual([]);
  });
});

describe("score arithmetic and determinism", () => {
  it("floors the score at 0", () => {
    const body = ["## Steps", "rm -rf /a", "rm -rf /b", "rm -rf /c", "sudo reboot"].join("\n");
    const md = `---\nname: a-skill\ndescription: short\nversion: 1.0.0\nowner: team\n---\n${body}`;
    const result = lintSkill(md);
    // -20 activation, -10 too-short, 4 x -30 dangerous => floored
    expect(result.score).toBe(0);
  });

  it("applies deductions on top of the 40 cap", () => {
    const md = `---\nname: a-skill\ndescription: short description\nversion: nope\nowner: team\n---\n## Body\n`;
    const result = lintSkill(md);
    expect(rules(md).sort()).toEqual([
      "activation-language-missing",
      "description-too-short",
      "frontmatter-invalid",
    ]);
    // capped base 40, then -20 and -10
    expect(result.score).toBe(10);
  });

  it("orders findings by line, then rule", () => {
    const md = `---\nname: Bad Name\ndescription: short\nversion: 1.0.0\nowner: team\n---\nno headings body\n\nsudo rm -rf /x\n`;
    const result = lintSkill(md);
    expect(result.findings.length).toBeGreaterThanOrEqual(4);
    const lines = result.findings.map((f) => f.line ?? 0);
    expect([...lines].sort((a, b) => a - b)).toEqual(lines);
  });

  it("is deterministic across repeated runs", () => {
    const md = `---\nname: Bad Name\ndescription: short\nversion: 1.0.0\nowner: team\n---\nsudo thing\n`;
    expect(lintSkill(md)).toEqual(lintSkill(md));
  });
});
