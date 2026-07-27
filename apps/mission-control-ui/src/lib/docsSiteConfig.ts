import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  FlaskConical,
  Layers,
  Rocket,
  Shield,
  Wrench,
} from "lucide-react";

export type DocsSitePage = {
  id: string;
  title: string;
  description?: string;
  /** Path relative to docs/site/ without .md */
  path: string;
};

export type DocsSiteSection = {
  id: string;
  label: string;
  icon: LucideIcon;
  pages: DocsSitePage[];
};

/** Tessl-style information architecture for Mission Control docs. */
export const DOCS_SITE_SECTIONS: DocsSiteSection[] = [
  {
    id: "overview",
    label: "Overview",
    icon: BookOpen,
    pages: [
      {
        id: "overview-readme",
        title: "What is Mission Control?",
        description: "Platform overview and six core components",
        path: "overview/readme",
      },
      {
        id: "platform-components",
        title: "Platform components",
        description: "Registry, factory, harness, observability",
        path: "overview/platform-components",
      },
    ],
  },
  {
    id: "get-started",
    label: "Get started",
    icon: Rocket,
    pages: [
      {
        id: "set-up",
        title: "Set up Mission Control",
        path: "get-started/set-up-mission-control",
      },
      {
        id: "run-demo",
        title: "Run the demo",
        path: "get-started/run-the-demo",
      },
      {
        id: "first-skill",
        title: "Improve your first skill",
        path: "get-started/improve-your-first-skill",
      },
    ],
  },
  {
    id: "tutorials",
    label: "Tutorials",
    icon: FlaskConical,
    pages: [
      { id: "tutorials-index", title: "Tutorial index", path: "tutorials/tutorials" },
      { id: "work-orders", title: "Governing WorkOrders", path: "tutorials/governing-work-orders" },
      { id: "code-review", title: "Agentic code review", path: "tutorials/setting-up-agentic-code-review" },
      { id: "improve-skill", title: "Improving a skill", path: "tutorials/improving-a-skill" },
      { id: "secure-skills", title: "Insecure skills", path: "tutorials/protecting-against-insecure-skills" },
      { id: "automate", title: "Automating tasks", path: "tutorials/automating-repetitive-tasks" },
    ],
  },
  {
    id: "harness",
    label: "Harness",
    icon: Wrench,
    pages: [
      { id: "sw-factory", title: "Software factory", path: "harness/software-factory" },
      { id: "architect", title: "Architect mode", path: "harness/architect-mode" },
      { id: "wizard", title: "Code review wizard", path: "harness/code-review-wizard" },
    ],
  },
  {
    id: "registry",
    label: "Registry",
    icon: Layers,
    pages: [
      { id: "discover", title: "Discover & install", path: "registry/discover-and-install" },
      { id: "cdl", title: "Context CDL", path: "registry/context-cdl" },
      { id: "evals", title: "Eval runs", path: "registry/eval-runs" },
    ],
  },
  {
    id: "reference",
    label: "Reference",
    icon: Shield,
    pages: [
      { id: "glossary", title: "Glossary", path: "reference/glossary" },
      { id: "eos-nav", title: "EOS navigation", path: "reference/eos-navigation" },
      { id: "flags", title: "Feature flags", path: "reference/feature-flags" },
    ],
  },
];

export const DOCS_SITE_PAGES: DocsSitePage[] = DOCS_SITE_SECTIONS.flatMap((s) => s.pages);

export const DEFAULT_DOCS_PAGE_ID = "overview-readme";

export function findDocsPage(id: string): DocsSitePage | undefined {
  return DOCS_SITE_PAGES.find((p) => p.id === id);
}

/** Resolve relative markdown links (e.g. ../get-started/run-the-demo.md) to a docs page id. */
export function resolveDocsPageByHref(href: string, currentPagePath: string): string | null {
  if (href.startsWith("http://") || href.startsWith("https://") || href.startsWith("#")) {
    return null;
  }
  const normalized = href.replace(/^\.\//, "").replace(/\.md$/i, "");
  let targetPath = normalized;
  if (href.startsWith("../") || href.startsWith("./")) {
    const currentDir = currentPagePath.includes("/")
      ? currentPagePath.slice(0, currentPagePath.lastIndexOf("/"))
      : "";
    const parts = [...currentDir.split("/").filter(Boolean), ...href.split("/")];
    const resolved: string[] = [];
    for (const part of parts) {
      if (part === "..") resolved.pop();
      else if (part !== "." && part !== "") resolved.push(part.replace(/\.md$/i, ""));
    }
    targetPath = resolved.join("/");
  }
  const page = DOCS_SITE_PAGES.find((p) => p.path === targetPath);
  return page?.id ?? null;
}

/** Vite raw imports for all docs/site markdown pages. */
export const docsSiteModules = import.meta.glob("../../../../docs/site/**/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

export function docsMarkdownForPath(relativePath: string): string | null {
  const key = `../../../../docs/site/${relativePath}.md`;
  return docsSiteModules[key] ?? null;
}

export const LEGACY_REPO_DOCS = [
  { title: "PRD V2", path: "docs/PRD_V2.md", description: "Product requirements" },
  { title: "Architecture", path: "docs/ARCHITECTURE.md", description: "System architecture" },
  { title: "Backend Structure", path: "docs/BACKEND_STRUCTURE.md", description: "Convex API surface" },
  { title: "Frontend Guidelines", path: "docs/FRONTEND_GUIDELINES.md", description: "UI/UX standards" },
  { title: "Context Manifests", path: "docs/CONTEXT_MANIFESTS.md", description: "Lock and install" },
  { title: "Creating Plugins", path: "docs/CREATING_PLUGINS.md", description: "Registry packages" },
  { title: "Software Factory IA", path: "docs/software-factory/information-architecture.md", description: "Entity model" },
  { title: "Runbook", path: "docs/runbook/RUNBOOK.md", description: "Operations" },
  { title: "Feature Flags (repo)", path: "docs/FEATURE_FLAGS.md", description: "Full flag list" },
];
