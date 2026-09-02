import type { LucideIcon } from "lucide-react";
import {
  Activity, BarChart3, Bot, BookOpen, Brain, Building2, CheckCircle2,
  ClipboardList, Cog, FileSearch, FlaskConical, Gauge, GitBranch, Landmark,
  LayoutDashboard, ListChecks, Radar, ScrollText, Shield, Sparkles, Target,
  TrendingUp, Wrench, Scale, Route,
  KeyRound,
} from "lucide-react";
import type { MainView } from "../TopNav";
import type { NavGroup } from "./navConfig";

/**
 * Engineering-OS information architecture (flag eos.command-center-preview).
 * Organized around operator jobs. Route capability metadata decides which
 * live, preview, and demo destinations are exposed.
 */
export const EOS_NAV_GROUPS: NavGroup[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard, items: [
    { view: "command-center" as MainView, label: "Command Center", icon: LayoutDashboard },
  ]},
  { id: "strategy", label: "Strategy", icon: Target, items: [
    { view: "missions" as MainView, label: "Missions", icon: Target },
    { view: "goals" as MainView, label: "Objectives", icon: TrendingUp },
  ]},
  { id: "delivery", label: "Delivery", icon: Wrench, items: [
    { view: "control-work-orders" as MainView, label: "Work Orders", icon: ClipboardList },
    { view: "tasks" as MainView, label: "Tasks", icon: ListChecks },
    { view: "factory" as MainView, label: "Factory Board", icon: Wrench },
    { view: "trace-inspector" as MainView, label: "Observability & Evals", icon: GitBranch },
    { view: "code" as MainView, label: "Pipelines", icon: Cog },
    { view: "dag" as MainView, label: "Task Graph", icon: GitBranch },
  ]},
  { id: "operations", label: "Operations", icon: Gauge, items: [
    { view: "agents" as MainView, label: "Agent Registry", icon: Bot },
    { view: "atc" as MainView, label: "Queue", icon: Radar },
    { view: "automations" as MainView, label: "Automations", icon: Sparkles },
    { view: "audit" as MainView, label: "Approvals & Audit", icon: ScrollText },
    { view: "telemetry" as MainView, label: "Incidents", icon: Activity },
    { view: "analytics" as MainView, label: "Cost", icon: BarChart3 },
  ]},
  { id: "intelligence", label: "Intelligence", icon: Brain, items: [
    { view: "operator-evals" as MainView, label: "Operator Evals", icon: FlaskConical },
    { view: "harness-loops" as MainView, label: "Loop Engineering", icon: GitBranch },
    { view: "effectiveness" as MainView, label: "AI Effectiveness", icon: Gauge },
    { view: "factory-health" as MainView, label: "Factory Health", icon: CheckCircle2 },
    { view: "readiness" as MainView, label: "Environment Readiness", icon: Landmark },
    { view: "friction" as MainView, label: "Friction & Waste", icon: Activity },
    { view: "recommendations" as MainView, label: "Recommendations", icon: Sparkles },
    { view: "dossier" as MainView, label: "Evidence Dossiers", icon: Scale },
  ]},
  { id: "quality-automation", label: "Quality & Automation", icon: Shield, items: [
    { view: "harness-code-review-wizard" as MainView, label: "Code Review Setup", icon: CheckCircle2 },
    { view: "harness-change-review" as MainView, label: "Change Review", icon: FileSearch },
    { view: "registry-runs" as MainView, label: "Agent Code Quality", icon: FlaskConical },
    { view: "harness-meta-loop" as MainView, label: "Improvement History", icon: GitBranch },
  ]},
  { id: "knowledge", label: "Knowledge", icon: BookOpen, items: [
    { view: "skills" as MainView, label: "Context Catalog", icon: Sparkles },
    { view: "registry-lifecycle" as MainView, label: "Context CDL", icon: BookOpen },
    { view: "registry-evaluate" as MainView, label: "Evaluate Skill", icon: FlaskConical },
    { view: "registry-inventory" as MainView, label: "Skill Inventory", icon: ClipboardList },
    { view: "registry-installations" as MainView, label: "Installations", icon: ClipboardList },
    { view: "registry-runs" as MainView, label: "Eval Runs", icon: FlaskConical },
    { view: "memory" as MainView, label: "Memory", icon: Brain },
    { view: "docs" as MainView, label: "Docs", icon: BookOpen },
  ]},
  { id: "governance", label: "Governance", icon: Shield, items: [
    { view: "policies" as MainView, label: "Policies", icon: Shield },
    { view: "identity" as MainView, label: "Identities", icon: ClipboardList },
    { view: "deployments" as MainView, label: "Deployments", icon: GitBranch },
    { view: "qc-rulesets" as MainView, label: "QC Rulesets", icon: ListChecks },
  ]},
  { id: "administration", label: "Settings", icon: Building2, items: [
    { view: "projects" as MainView, label: "Workspaces & Repositories", icon: Building2 },
    { view: "model-routing" as MainView, label: "Execution Routing", icon: Route },
    { view: "access-profiles" as MainView, label: "Access Profiles", icon: KeyRound },
    { view: "gateway" as MainView, label: "Gateway", icon: Cog },
    { view: "system" as MainView, label: "Database", icon: Cog },
  ]},
  { id: "developer-tools", label: "Developer Tools", icon: Wrench, items: [
    { view: "design-system" as MainView, label: "Design DNA", icon: Sparkles },
    { view: "recorder" as MainView, label: "Recorder", icon: Activity },
    { view: "test-generation" as MainView, label: "Test Generation", icon: FlaskConical },
    { view: "api-import" as MainView, label: "API Import", icon: FileSearch },
  ]},
  { id: "labs", label: "Labs", icon: FlaskConical, items: [
    { view: "agent-catalog" as MainView, label: "Agent Capability Catalog", icon: Bot },
    { view: "flaky-steps" as MainView, label: "Flaky Steps", icon: Activity },
    { view: "gherkin" as MainView, label: "Gherkin Studio", icon: ScrollText },
    { view: "codegen" as MainView, label: "CodeGen", icon: Cog },
    { view: "pipeline" as MainView, label: "Build Pipeline", icon: Cog },
  ]},
];
