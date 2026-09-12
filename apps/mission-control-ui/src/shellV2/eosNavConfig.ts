import {
  Activity,
  BarChart3,
  Bot,
  BookOpen,
  Brain,
  Building2,
  CheckCircle2,
  ClipboardList,
  Cog,
  FileSearch,
  FlaskConical,
  Gauge,
  GitBranch,
  Landmark,
  LayoutDashboard,
  ListChecks,
  Radar,
  Route,
  Scale,
  ScrollText,
  Shield,
  Sparkles,
  Target,
  TrendingUp,
  Wrench,
} from "lucide-react";
import type { MainView } from "../TopNav";
import type { NavGroup } from "./navConfig";

/**
 * V2 operator information architecture.
 *
 * Six job-oriented domains keep the governed delivery path legible. Preview
 * and demo-only intelligence stays in one collapsed Labs group instead of
 * competing with the primary lifecycle.
 */
export const EOS_NAV_GROUPS: NavGroup[] = [
  {
    id: "overview",
    label: "Overview",
    icon: LayoutDashboard,
    items: [
      { view: "command-center" as MainView, label: "Command Center", icon: LayoutDashboard },
      { view: "missions" as MainView, label: "Missions", icon: Target },
      { view: "goals" as MainView, label: "Objectives", icon: TrendingUp },
    ],
  },
  {
    id: "delivery",
    label: "Delivery",
    icon: Wrench,
    items: [
      { view: "control-work-orders" as MainView, label: "Work Orders", icon: ClipboardList },
      { view: "tasks" as MainView, label: "Tasks", icon: ListChecks },
      { view: "factory" as MainView, label: "Factory Board", icon: Wrench },
      { view: "atc" as MainView, label: "Queue", icon: Radar },
      { view: "automations" as MainView, label: "Automations", icon: Sparkles },
    ],
  },
  {
    id: "review",
    label: "Review & release",
    icon: Shield,
    items: [
      { view: "audit" as MainView, label: "Approvals & Audit", icon: ScrollText },
      { view: "trace-inspector" as MainView, label: "Observability & Evals", icon: GitBranch },
      { view: "telemetry" as MainView, label: "Incidents", icon: Activity },
      { view: "deployments" as MainView, label: "Deployments", icon: GitBranch },
      { view: "analytics" as MainView, label: "Cost", icon: BarChart3 },
    ],
  },
  {
    id: "knowledge",
    label: "Knowledge",
    icon: BookOpen,
    items: [
      { view: "skills" as MainView, label: "Context Catalog", icon: Sparkles },
      { view: "memory" as MainView, label: "Memory", icon: Brain },
      { view: "docs" as MainView, label: "Docs", icon: BookOpen },
    ],
  },
  {
    id: "system",
    label: "System",
    icon: Cog,
    items: [
      { view: "projects" as MainView, label: "Workspaces & Repositories", icon: Building2 },
      { view: "agents" as MainView, label: "Agent Registry", icon: Bot },
      { view: "identity" as MainView, label: "Identities", icon: ClipboardList },
      { view: "model-routing" as MainView, label: "Execution Routing", icon: Route },
      { view: "policies" as MainView, label: "Policies", icon: Shield },
      { view: "gateway" as MainView, label: "Gateway", icon: Cog },
      { view: "system" as MainView, label: "Database", icon: Cog },
    ],
  },
  {
    id: "labs",
    label: "Labs",
    icon: FlaskConical,
    items: [
      { view: "operator-evals" as MainView, label: "Operator Evals", icon: FlaskConical },
      { view: "harness-loops" as MainView, label: "Loop Engineering", icon: GitBranch },
      { view: "effectiveness" as MainView, label: "AI Effectiveness", icon: Gauge },
      { view: "factory-health" as MainView, label: "Factory Health", icon: CheckCircle2 },
      { view: "readiness" as MainView, label: "Environment Readiness", icon: Landmark },
      { view: "friction" as MainView, label: "Friction & Waste", icon: Activity },
      { view: "recommendations" as MainView, label: "Recommendations", icon: Sparkles },
      { view: "dossier" as MainView, label: "Evidence Dossiers", icon: Scale },
      { view: "agent-catalog" as MainView, label: "Agent Capability Catalog", icon: Bot },
      { view: "harness-code-review-wizard" as MainView, label: "Code Review Setup", icon: CheckCircle2 },
      { view: "harness-change-review" as MainView, label: "Change Review", icon: FileSearch },
    ],
  },
];
