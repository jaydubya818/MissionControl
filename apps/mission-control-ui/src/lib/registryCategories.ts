import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  Boxes,
  Bug,
  Cloud,
  Database,
  FlaskConical,
  Globe,
  Layers,
  Palette,
  Settings,
  Shield,
  Sparkles,
} from "lucide-react";

export interface RegistryCategoryDef {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
}

/** Tessl-style discover categories (10 + All). */
export const REGISTRY_CATEGORIES: RegistryCategoryDef[] = [
  {
    id: "all",
    label: "All Skills",
    description: "Browse every skill in the registry",
    icon: Boxes,
  },
  {
    id: "testing-quality",
    label: "Testing & QA",
    description: "Test generation, coverage, and quality assurance workflows",
    icon: FlaskConical,
  },
  {
    id: "security-compliance",
    label: "Security & Compliance",
    description: "Security reviews, compliance checks, and safe defaults",
    icon: Shield,
  },
  {
    id: "documentation",
    label: "Documentation Generation",
    description: "Docs, READMEs, API references, and technical writing",
    icon: BookOpen,
  },
  {
    id: "debugging",
    label: "Debugging & Error Handling",
    description: "Diagnose failures, trace errors, and harden error paths",
    icon: Bug,
  },
  {
    id: "api-development",
    label: "API Development",
    description: "REST, GraphQL, SDK design, and integration patterns",
    icon: Layers,
  },
  {
    id: "web-development",
    label: "Web Design",
    description: "UI components, layouts, accessibility, and frontend polish",
    icon: Palette,
  },
  {
    id: "database",
    label: "Database Management",
    description: "Schema design, queries, migrations, and performance",
    icon: Database,
  },
  {
    id: "infrastructure",
    label: "Infrastructure",
    description: "Cloud, containers, networking, and platform operations",
    icon: Cloud,
  },
  {
    id: "agent-operations",
    label: "Machine Learning & AI",
    description: "Agent workflows, prompts, evals, and model routing",
    icon: Sparkles,
  },
  {
    id: "release-engineering",
    label: "DevOps",
    description: "CI/CD, deployments, release automation, and delivery",
    icon: Settings,
  },
];

export function impactMultiplier(
  qualityScore: number | null,
  impactScore: number | null,
  baselineScore?: number | null,
  candidateScore?: number | null
): number | null {
  if (
    baselineScore != null &&
    candidateScore != null &&
    Number.isFinite(baselineScore) &&
    baselineScore > 0
  ) {
    return Math.round((candidateScore / baselineScore) * 100) / 100;
  }
  if (impactScore != null && qualityScore != null && qualityScore > 0) {
    const baseline = Math.max(qualityScore * 0.35, 28);
    return Math.round((impactScore / baseline) * 100) / 100;
  }
  if (qualityScore != null && qualityScore >= 75) {
    return Math.round((1 + (qualityScore - 72) / 28) * 100) / 100;
  }
  return null;
}

export function containsLabel(type: string): string {
  switch (type) {
    case "SKILL":
      return "Skills";
    case "DOCUMENTATION":
      return "Docs";
    case "RULES":
      return "Rules";
    default:
      return type.replace(/_/g, " ");
  }
}
