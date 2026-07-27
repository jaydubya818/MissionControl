import type { ReviewAxes } from "../RegistryView";

export type SkillPitfallId =
  | "vague-description"
  | "god-skill"
  | "context-bloat"
  | "human-audience"
  | "weak-activation";

export interface SkillPitfall {
  id: SkillPitfallId;
  title: string;
  severity: "warn" | "info";
  detail: string;
  fix: string;
}

const VAGUE_DESCRIPTION_RE =
  /\b(helpful skill|quality improvement|general purpose|all.?in.?one|does everything|code review and quality)\b/i;

const HUMAN_AUDIENCE_RE =
  /\b(what is a REST API|HTTP stands for|introduction to|for humans|as a developer you should know)\b/i;

const ACTIVATION_RE = /\b(use (this skill )?when|use for|invoke when|run eslint|flag type|password hashing|argon2)\b/i;

/** Heuristic pitfall detection aligned with Tessl OSS outreach (Baptiste Fernandez talk). */
export function detectSkillPitfalls(input: {
  description: string;
  name?: string;
  tags?: string[];
  reviewAxes?: ReviewAxes | null;
  bodyLineEstimate?: number;
}): SkillPitfall[] {
  const pitfalls: SkillPitfall[] = [];
  const desc = input.description.trim();
  const axes = input.reviewAxes;

  if (desc.length < 80 || VAGUE_DESCRIPTION_RE.test(desc) || !ACTIVATION_RE.test(desc)) {
    pitfalls.push({
      id: "vague-description",
      title: "Vague activation description",
      severity: "warn",
      detail:
        'Descriptions are the activation function — generic phrasing like "helpful skill for code review" rarely triggers at the right moment.',
      fix: 'Name concrete tools, file types, and triggers: "Run ESLint with project rules; flag type-safety violations in .ts files."',
    });
  }

  if ((input.tags?.length ?? 0) > 8 || (input.bodyLineEstimate ?? 0) > 500) {
    pitfalls.push({
      id: "god-skill",
      title: "God skill — too broad",
      severity: "warn",
      detail:
        "Skills that do everything are rarely activated correctly; agents pick them for the wrong reason and performance drops.",
      fix: "Split into focused skills with narrow triggers. One clear purpose per SKILL.md.",
    });
  }

  if (desc.length > 500 || (axes?.implementation ?? 100) < 60) {
    pitfalls.push({
      id: "context-bloat",
      title: "Context bloat",
      severity: "warn",
      detail:
        "Duplicative or overly long skills waste tokens and dilute the signal agents need at activation time.",
      fix: "Trim to navigation-first structure; move depth into reference files. Target lean descriptions under 500 chars.",
    });
  }

  if (HUMAN_AUDIENCE_RE.test(desc)) {
    pitfalls.push({
      id: "human-audience",
      title: "Written for humans, not agents",
      severity: "info",
      detail:
        "Explaining basics like REST APIs to agents is wasted context — skills should be directive checklists for agents.",
      fix: "Remove tutorial prose; keep executable steps, globs, and verification commands agents can run.",
    });
  }

  if ((axes?.activation ?? 100) < 75) {
    pitfalls.push({
      id: "weak-activation",
      title: "Weak activation language",
      severity: "warn",
      detail:
        "Missing explicit 'use when' phrasing — agents may skip the skill even when it would help.",
      fix: 'Add activation language: "Use this skill when…" with domain terms and file patterns.',
    });
  }

  return pitfalls;
}

export const DESCRIPTION_EXAMPLES = {
  bad: "This is a helpful skill for code review and quality improvement.",
  good:
    "Run ESLint with project rules; flag type-safety violations, missing error handling in convex/, and accessibility gaps in React components.",
} as const;
