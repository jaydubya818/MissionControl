/**
 * Skill linter: scores a SKILL.md file (0-100) against the Mission Control
 * skill standard and reports rule findings.
 *
 * Rules:
 *   frontmatter-missing         error    score capped at 40
 *   frontmatter-invalid         error    score capped at 40
 *   required-field-missing      error    -15 each
 *   activation-language-missing error    -20
 *   description-too-short       warning  -10   (< 80 chars)
 *   description-too-long        warning  -5    (> 500 chars)
 *   name-mismatch               warning  -5    (directory name != frontmatter name)
 *   body-too-long               warning  -5    (> 500 lines)
 *   no-headings                 info     -2    (no "##" sections)
 *   dangerous-instruction       error    -30 each
 *
 * Score starts at 100 (40 when a cap rule fires), deductions apply on top,
 * floor is 0. Findings are deterministically ordered by line, then rule id,
 * then message.
 */

import {
  SkillFrontmatterError,
  extractRawFrontmatter,
  validateRawFrontmatter,
  type RawFrontmatter,
} from "./skillFrontmatter.js";

export type SkillLintSeverity = "error" | "warning" | "info";

export interface SkillLintFinding {
  readonly rule: string;
  readonly severity: SkillLintSeverity;
  readonly message: string;
  readonly line?: number;
}

/**
 * Per-axis review scores (0-100), mirroring Tessl-style skill reviews:
 *   validation     — is the skill well-formed? (frontmatter, required fields, naming)
 *   implementation — is the body sound? (length, structure, dangerous instructions)
 *   activation     — will agents know when to use it? (activation language, description quality)
 */
export interface SkillReviewAxes {
  readonly validation: number;
  readonly implementation: number;
  readonly activation: number;
}

export interface SkillLintResult {
  readonly score: number;
  readonly axes: SkillReviewAxes;
  readonly findings: SkillLintFinding[];
}

export interface SkillLintOptions {
  /** File path of the skill; enables the name-mismatch rule. */
  readonly path?: string;
}

const DESCRIPTION_MIN_CHARS = 80;
const DESCRIPTION_MAX_CHARS = 500;
const BODY_MAX_LINES = 500;

const ACTIVATION_RE = /\b(use (this skill )?when|use for|invoke when|trigger|activates? when)\b/i;

const DANGEROUS_RE = /rm -rf|curl[^|]*\|\s*(ba)?sh|sudo\s|chmod 777/;

const HEADING_RE = /^##/m;

const SCORE_CAP_RULES: readonly string[] = ["frontmatter-missing", "frontmatter-invalid"];

const DEDUCTIONS: Readonly<Record<string, number>> = {
  "frontmatter-missing": 0, // capped instead
  "frontmatter-invalid": 0, // capped instead
  "required-field-missing": 15,
  "activation-language-missing": 20,
  "description-too-short": 10,
  "description-too-long": 5,
  "name-mismatch": 5,
  "body-too-long": 5,
  "no-headings": 2,
  "dangerous-instruction": 30,
};

type ReviewAxis = keyof SkillReviewAxes;

const RULE_AXIS: Readonly<Record<string, ReviewAxis>> = {
  "frontmatter-missing": "validation",
  "frontmatter-invalid": "validation",
  "required-field-missing": "validation",
  "name-mismatch": "validation",
  "activation-language-missing": "activation",
  "description-too-short": "activation",
  "description-too-long": "activation",
  "body-too-long": "implementation",
  "no-headings": "implementation",
  "dangerous-instruction": "implementation",
};

function computeAxes(findings: SkillLintFinding[]): SkillReviewAxes {
  const axes: Record<ReviewAxis, number> = {
    validation: findings.some((f) => SCORE_CAP_RULES.includes(f.rule)) ? 40 : 100,
    implementation: 100,
    activation: 100,
  };
  for (const finding of findings) {
    const axis = RULE_AXIS[finding.rule];
    if (axis !== undefined) {
      axes[axis] -= DEDUCTIONS[finding.rule] ?? 0;
    }
  }
  return {
    validation: Math.max(0, axes.validation),
    implementation: Math.max(0, axes.implementation),
    activation: Math.max(0, axes.activation),
  };
}

/** Directory name from a path like "skills/foo/SKILL.md" -> "foo". */
function directoryName(path: string): string | null {
  const parts = path.replace(/\\/g, "/").split("/").filter((p) => p.length > 0);
  if (parts.length < 2) return null;
  return parts[parts.length - 2];
}

function lintFrontmatter(raw: RawFrontmatter, opts: SkillLintOptions, findings: SkillLintFinding[]): void {
  const { issues } = validateRawFrontmatter(raw);
  for (const issue of issues) {
    if (issue.kind === "missing") {
      findings.push({
        rule: "required-field-missing",
        severity: "error",
        message: issue.message,
        line: issue.line,
      });
    } else {
      findings.push({
        rule: "frontmatter-invalid",
        severity: "error",
        message: issue.message,
        line: issue.line,
      });
    }
  }

  const description = raw.entries.description;
  if (description !== undefined && typeof description.value === "string" && description.value.trim() !== "") {
    const text = description.value;
    if (!ACTIVATION_RE.test(text)) {
      findings.push({
        rule: "activation-language-missing",
        severity: "error",
        message:
          'description must state when to activate the skill (e.g. "Use this skill when ...", "Invoke when ...")',
        line: description.line,
      });
    }
    if (text.length < DESCRIPTION_MIN_CHARS) {
      findings.push({
        rule: "description-too-short",
        severity: "warning",
        message: `description is ${text.length} chars; aim for at least ${DESCRIPTION_MIN_CHARS}`,
        line: description.line,
      });
    }
    if (text.length > DESCRIPTION_MAX_CHARS) {
      findings.push({
        rule: "description-too-long",
        severity: "warning",
        message: `description is ${text.length} chars; keep it under ${DESCRIPTION_MAX_CHARS}`,
        line: description.line,
      });
    }
  }

  const name = raw.entries.name;
  if (
    opts.path !== undefined &&
    name !== undefined &&
    typeof name.value === "string" &&
    name.value.trim() !== ""
  ) {
    const dir = directoryName(opts.path);
    if (dir !== null && dir !== name.value) {
      findings.push({
        rule: "name-mismatch",
        severity: "warning",
        message: `frontmatter name "${name.value}" does not match directory name "${dir}"`,
        line: name.line,
      });
    }
  }
}

function lintBody(body: string, bodyStartLine: number, findings: SkillLintFinding[]): void {
  const lines = body.split(/\r?\n/);

  if (lines.length > BODY_MAX_LINES) {
    findings.push({
      rule: "body-too-long",
      severity: "warning",
      message: `body is ${lines.length} lines; split content over ${BODY_MAX_LINES} lines into referenced files (progressive disclosure)`,
      line: bodyStartLine,
    });
  }

  if (body.trim() !== "" && !HEADING_RE.test(body)) {
    findings.push({
      rule: "no-headings",
      severity: "info",
      message: 'body has no "##" sections; add headings so agents can scan the skill',
      line: bodyStartLine,
    });
  }

  for (let i = 0; i < lines.length; i++) {
    if (DANGEROUS_RE.test(lines[i])) {
      findings.push({
        rule: "dangerous-instruction",
        severity: "error",
        message: `dangerous instruction pattern: ${lines[i].trim().slice(0, 80)}`,
        line: bodyStartLine + i,
      });
    }
  }
}

export function lintSkill(markdown: string, opts: SkillLintOptions = {}): SkillLintResult {
  const findings: SkillLintFinding[] = [];

  let raw: RawFrontmatter | null = null;
  let body = markdown;
  let bodyStartLine = 1;

  try {
    raw = extractRawFrontmatter(markdown);
  } catch (err) {
    if (!(err instanceof SkillFrontmatterError)) throw err;
    findings.push({
      rule: "frontmatter-invalid",
      severity: "error",
      // The error message embeds a "line N: " prefix; the finding carries the
      // line separately.
      message: err.line !== undefined ? err.message.replace(/^line \d+: /, "") : err.message,
      line: err.line,
    });
  }

  if (findings.length === 0 && raw === null) {
    findings.push({
      rule: "frontmatter-missing",
      severity: "error",
      message: 'no frontmatter block: file must start with a "---" line',
      line: 1,
    });
  }

  if (raw !== null) {
    body = raw.body;
    bodyStartLine = raw.bodyStartLine;
    lintFrontmatter(raw, opts, findings);
  }

  lintBody(body, bodyStartLine, findings);

  findings.sort(
    (a, b) =>
      (a.line ?? 0) - (b.line ?? 0) || a.rule.localeCompare(b.rule) || a.message.localeCompare(b.message),
  );

  let score = findings.some((f) => SCORE_CAP_RULES.includes(f.rule)) ? 40 : 100;
  for (const finding of findings) {
    score -= DEDUCTIONS[finding.rule] ?? 0;
  }
  score = Math.max(0, score);

  return { score, axes: computeAxes(findings), findings };
}
