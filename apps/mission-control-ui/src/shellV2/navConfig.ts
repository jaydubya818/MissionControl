import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BarChart3,
  Bot,
  BookOpen,
  Brain,
  Building2,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Code2,
  Cog,
  FileSearch,
  FlaskConical,
  Gauge,
  GitBranch,
  Landmark,
  LayoutDashboard,
  ListChecks,
  MessageSquare,
  Orbit,
  Radar,
  ScrollText,
  Shield,
  Sparkles,
  Target,
  Users,
  Wrench,
} from "lucide-react";
import type { MainView } from "../TopNav";

export interface NavItem {
  view: MainView;
  label: string;
  icon: LucideIcon;
}

export interface NavGroup {
  id: string;
  label: string;
  icon: LucideIcon;
  items: NavItem[];
}

/**
 * Software Factory information architecture (ui.shell.v2).
 * Five primary domains plus a secondary Workspace group so every existing
 * view stays reachable. Factory-specific pages (Work Orders, Repositories,
 * Pull Requests, Registry) land in later PRs and slot into these groups.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    id: "operate",
    label: "Operate",
    icon: LayoutDashboard,
    items: [
      { view: "home", label: "Overview", icon: LayoutDashboard },
      { view: "goals", label: "Missions", icon: Target },
      { view: "tasks", label: "Tasks", icon: ListChecks },
      { view: "dag", label: "Task Graph", icon: GitBranch },
      { view: "calendar", label: "Calendar", icon: CalendarDays },
      { view: "ops-schedule", label: "Schedule", icon: ClipboardList },
      { view: "audit", label: "Audit", icon: ScrollText },
    ],
  },
  {
    id: "control",
    label: "Control",
    icon: Orbit,
    items: [
      { view: "control-portfolio", label: "Portfolio", icon: Target },
      { view: "control-work-orders", label: "Work Orders", icon: ClipboardList },
      { view: "control-fleet", label: "Fleet", icon: Bot },
      { view: "control-approvals", label: "Approvals", icon: CheckCircle2 },
    ],
  },
  {
    id: "factory",
    label: "Factory",
    icon: Wrench,
    items: [
      { view: "code", label: "Pipelines", icon: GitBranch },
      { view: "codegen", label: "CodeGen", icon: Code2 },
      { view: "recorder", label: "Recorder", icon: Activity },
      { view: "test-generation", label: "Test Generation", icon: FlaskConical },
      { view: "api-import", label: "API Import", icon: FileSearch },
      { view: "execution", label: "Execution", icon: CheckCircle2 },
      { view: "flaky-steps", label: "Flaky Steps", icon: Activity },
      { view: "hybrid-workflows", label: "Hybrid Workflows", icon: GitBranch },
      { view: "gherkin", label: "Gherkin Studio", icon: ScrollText },
      { view: "schedule", label: "Run Schedule", icon: CalendarDays },
      { view: "pipeline", label: "Build Pipeline", icon: Cog },
      { view: "factory", label: "Factory Board", icon: Wrench },
    ],
  },
  {
    id: "intelligence",
    label: "Intelligence",
    icon: Brain,
    items: [
      { view: "agents", label: "Agents", icon: Bot },
      { view: "atc", label: "ATC Board", icon: Radar },
      { view: "directory", label: "Templates", icon: BookOpen },
      { view: "identity", label: "Identities", icon: Users },
      { view: "skills", label: "Registry", icon: Sparkles },
      { view: "memory", label: "Memory", icon: Brain },
      { view: "docs", label: "Knowledge", icon: BookOpen },
      { view: "search", label: "Search", icon: FileSearch },
      { view: "hiring", label: "Hiring", icon: Users },
    ],
  },
  {
    id: "observe",
    label: "Observe",
    icon: Gauge,
    items: [
      { view: "telemetry", label: "Telemetry", icon: Activity },
      { view: "metrics", label: "Metrics", icon: BarChart3 },
      { view: "qc-dashboard", label: "QC Dashboard", icon: Gauge },
      { view: "qc-runs", label: "QC Runs", icon: FlaskConical },
      { view: "qc-findings", label: "QC Findings", icon: FileSearch },
      { view: "qc-metrics", label: "QC Metrics", icon: BarChart3 },
      { view: "qc-environments", label: "QC Environments", icon: Landmark },
      { view: "radar", label: "Radar", icon: Radar },
      { view: "system", label: "System", icon: Cog },
    ],
  },
  {
    id: "govern",
    label: "Govern",
    icon: Shield,
    items: [
      { view: "policies", label: "Policies", icon: Shield },
      { view: "deployments", label: "Deployments", icon: GitBranch },
      { view: "qc-rulesets", label: "QC Rulesets", icon: ListChecks },
      { view: "gateway", label: "Gateway", icon: Cog },
      { view: "schedules", label: "Agent Schedules", icon: CalendarDays },
      { view: "design-system", label: "Design DNA", icon: Sparkles },
    ],
  },
  {
    id: "workspace",
    label: "Workspace",
    icon: Building2,
    items: [
      { view: "chat", label: "Chat", icon: MessageSquare },
      { view: "live-chat", label: "Live Chat", icon: MessageSquare },
      { view: "council", label: "Council", icon: Users },
      { view: "command", label: "Command", icon: Cog },
      { view: "content-pipeline", label: "Content", icon: ScrollText },
      { view: "captures", label: "Captures", icon: FileSearch },
      { view: "projects", label: "Projects", icon: Building2 },
      { view: "telegraph", label: "Telegraph", icon: MessageSquare },
      { view: "meetings", label: "Meetings", icon: CalendarDays },
      { view: "voice", label: "Voice", icon: Activity },
      { view: "crm", label: "CRM", icon: Users },
      { view: "people", label: "People", icon: Users },
      { view: "team", label: "Team", icon: Users },
      { view: "org", label: "Org Chart", icon: Building2 },
      { view: "office", label: "Office", icon: Building2 },
      { view: "live-office", label: "Live Office", icon: Building2 },
      { view: "feedback", label: "Feedback", icon: MessageSquare },
    ],
  },
];

export function groupForView(view: MainView): NavGroup | undefined {
  return NAV_GROUPS.find((g) => g.items.some((i) => i.view === view));
}

export function itemForView(view: MainView): NavItem | undefined {
  for (const group of NAV_GROUPS) {
    const item = group.items.find((i) => i.view === view);
    if (item) return item;
  }
  return undefined;
}

/** Flat list of all views reachable from the v2 navigation. */
export function allNavViews(): MainView[] {
  return NAV_GROUPS.flatMap((g) => g.items.map((i) => i.view));
}
