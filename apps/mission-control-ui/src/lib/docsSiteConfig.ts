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
    id: "software-factory-enhancement",
    label: "Software Factory Enhancement",
    icon: Layers,
    pages: [
      {
        id: "sfe-overview",
        title: "Software Factory Enhancement Overview",
        description: "Status, findings, decisions, and next actions",
        path: "software-factory-enhancement/overview",
      },
      {
        id: "sfe-canonical-hierarchy",
        title: "Canonical Delivery Hierarchy",
        description: "Goal, Mission, Work Order, Task, and Attempt ownership",
        path: "software-factory-enhancement/canonical-delivery-hierarchy",
      },
      {
        id: "sfe-task-workorder-experience",
        title: "Work Orders and Tasks Experience",
        description: "Current state and target operator experience",
        path: "software-factory-enhancement/task-workorder-experience",
      },
      {
        id: "sfe-implementation-plan",
        title: "Master Enhancement Plan",
        description: "Reviewable PR sequence and approval boundaries",
        path: "software-factory-enhancement/implementation-plan",
      },
      {
        id: "sfe-migration-plan",
        title: "Task and Work Order Migration Plan",
        description: "Compatibility, validation, rollback, and migration gates",
        path: "software-factory-enhancement/migration-plan",
      },
      {
        id: "sfe-browser-results",
        title: "Browser Test Results",
        description: "Task Kanban, Work Orders, Docs, console, and network evidence",
        path: "software-factory-enhancement/browser-test-results",
      },
      {
        id: "sfe-decision-log",
        title: "Decision Log",
        description: "Material product and architecture decisions",
        path: "software-factory-enhancement/decision-log",
      },
      {
        id: "sfe-docs-assessment",
        title: "Mission Control Docs Product Assessment",
        description: "Docs capabilities, defects, and remediation recommendations",
        path: "software-factory-enhancement/docs-product-assessment",
      },
      {
        id: "sfe-documentation-governance",
        title: "Documentation Governance",
        description: "Operator Docs and repository synchronization policy",
        path: "software-factory-enhancement/documentation-governance",
      },
      {
        id: "docs-001-workspace-routing",
        title: "DOCS-001 Workspace Routing Results",
        description: "Invalid workspace recovery, isolation, and browser evidence",
        path: "software-factory-enhancement/docs-001-workspace-routing-results",
      },
      {
        id: "task-workorder-pr1-implementation",
        title: "Task-to-Work-Order PR 1",
        description: "Canonical Task parentage, governance, and Attempt projection",
        path: "software-factory-enhancement/implementation/task-workorder-pr1",
      },
      {
        id: "task-workorder-pr1-browser-results",
        title: "Task-to-Work-Order Browser Results",
        description: "Deterministic governed and Ungoverned Task evidence",
        path: "software-factory-enhancement/testing/task-workorder-browser-results",
      },
      {
        id: "ci-schema-drift-repair",
        title: "CI Schema Drift Repair",
        description: "Release-gate and automation contract restoration",
        path: "software-factory-enhancement/testing/ci-schema-drift-repair",
      },
      {
        id: "task-attempt-scheduler-pr2-implementation",
        title: "Task Attempt Scheduler PR 2",
        description: "Explicit scheduling, immutable Attempts, and governed retry",
        path: "software-factory-enhancement/implementation/task-attempt-scheduler-pr2",
      },
      {
        id: "task-attempt-scheduler-pr2-browser-results",
        title: "Task Attempt Scheduler Browser Results",
        description: "Deterministic start, failure, retry, and persistence evidence",
        path: "software-factory-enhancement/testing/task-attempt-scheduler-browser-results",
      },
      {
        id: "workflow-state-cleanup-pr3-implementation",
        title: "Workflow State Cleanup PR 3",
        description: "Canonical Ready state and structured Review/Blocked context",
        path: "software-factory-enhancement/implementation/workflow-state-cleanup-pr3",
      },
      {
        id: "workflow-state-cleanup-pr3-browser-results",
        title: "Workflow State Cleanup Browser Results",
        description: "Reasoned transitions, persistence, compatibility, and audit evidence",
        path: "software-factory-enhancement/testing/workflow-state-cleanup-browser-results",
      },
    ],
  },
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

export function resolveDocsPageId(id: string | null | undefined): string {
  return id && findDocsPage(id) ? id : DEFAULT_DOCS_PAGE_ID;
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
