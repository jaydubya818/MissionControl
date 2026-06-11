import React, { useState, useMemo, useCallback, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id, Doc } from "../../../convex/_generated/dataModel";
import type { MainView } from "./TopNav";
import {
  Bot,
  Zap,
  Eye,
  CheckCircle2,
  ShieldAlert,
  DollarSign,
  Activity,
  BarChart3,
  Clock,
  AlertTriangle,
  Users,
  Hammer,
  Loader2,
  Rocket,
  TrendingUp,
  GitBranch,
  Cpu,
  Network,
  Plus,
  ListChecks,
  FlaskConical,
  FileText,
  ChevronRight,
  ArrowUpRight,
  Gauge,
  Shield,
  Layers,
  GripVertical,
  Radio,
  Calendar,
  Inbox,
  X,
  Sparkles,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { StatusDot, type StatusDotVariant } from "@/components/ui/status-dot";
import { AutoRefreshBadge } from "@/components/ui/auto-refresh-badge";
import { SkeletonCard } from "@/components/ui/skeleton-card";
import { MissionBanner } from "@/components/MissionBanner";
import { MissionSnapshot } from "@/components/MissionSnapshot";
import { ExecutionReadiness } from "@/components/ExecutionReadiness";
import { FleetPreview } from "@/components/FleetPreview";
import { OperatorTipsCard } from "@/components/OperatorTipsCard";
import { NeonChartContainer, NeonChartTheme } from "@/components/NeonChartTheme";
import { QuotaFuelGauge } from "@/components/QuotaFuelGauge";
import { cn } from "@/lib/utils";
import { getOrchestrationBaseUrl } from "@/lib/orchestrationUrl";
import { getBuildPipelineStages, getCurrentBuildStage } from "@/lib/buildPipeline";
import type { LucideIcon } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  Cell,
  LineChart,
  Line,
  AreaChart,
  Area,
} from "recharts";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const DASHBOARD_LAYOUT_KEY = "mc.dashboard_layout";
const DEFAULT_SECTION_ORDER = [
  "statusBar",
  "quickActions",
  "actionQueue",
  "healthStrip",
  "watchNext",
  "upcoming",
  "aiUsage",
  "metricRow1",
  "metricRow2",
  "agentSquad",
  "buildQueue",
  "blockers",
  "taskPipelineActivity",
  "usageTrends",
  "topTasksByCost",
  "topRunsByTokens",
  "velocityFooter",
] as const;

const SECTION_LABELS: Record<string, string> = {
  statusBar: "System status",
  quickActions: "Quick navigation",
  actionQueue: "Operator action queue",
  healthStrip: "Platform health",
  watchNext: "Watch next",
  upcoming: "Upcoming tasks & jobs",
  aiUsage: "AI usage (24h)",
  metricRow1: "Metrics (quota & agents)",
  metricRow2: "Metrics (spend & tasks)",
  agentSquad: "Agent squad",
  buildQueue: "Build queue",
  blockers: "Blockers",
  taskPipelineActivity: "Task pipeline & activity",
  usageTrends: "Usage trends",
  topTasksByCost: "Top tasks by cost",
  topRunsByTokens: "Top runs by tokens",
  velocityFooter: "Velocity summary",
};

interface DashboardOverviewProps {
  projectId: Id<"projects"> | null;
  onClose: () => void;
  onOpenMissionModal?: () => void;
  onOpenSuggestionsDrawer?: () => void;
  onSelectAgent?: (agentId: Id<"agents">) => void;
  onNavigate?: (view: MainView) => void;
  onOpenApprovals?: () => void;
  onOpenCostAnalytics?: () => void;
  onOpenAlertRules?: () => void;
  onTaskSelect?: (taskId: Id<"tasks">) => void;
  onNavigateToGateway?: () => void;
  onOpenCreateTask?: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// METRIC CARD
// ─────────────────────────────────────────────────────────────────────────────

interface MetricCardProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  subtitle?: string;
  accent?: string;
  onClick?: () => void;
  badge?: string;
  badgeVariant?: "urgent" | "info" | "success";
  trend?: { direction: "up" | "down" | "flat"; label: string };
}

function MetricCard({
  icon: Icon,
  label,
  value,
  subtitle,
  accent = "text-primary",
  onClick,
  badge,
  badgeVariant = "info",
  trend,
}: MetricCardProps) {
  const iconBg =
    accent.includes("primary") || accent.includes("emerald") ? "bg-primary/10 border-primary/20" :
    accent.includes("amber")   ? "bg-amber-500/10 border-amber-500/20" :
    accent.includes("destructive") || accent.includes("red") ? "bg-red-500/10 border-red-500/20" :
    accent.includes("violet")  ? "bg-violet-500/10 border-violet-500/20" :
    "bg-primary/10 border-primary/20";

  const topBar =
    accent.includes("primary") || accent.includes("emerald") ? "bg-primary/60" :
    accent.includes("amber")   ? "bg-amber-500/60" :
    accent.includes("destructive") || accent.includes("red") ? "bg-red-500/60" :
    accent.includes("violet")  ? "bg-violet-500/60" :
    "bg-primary/60";

  const badgeStyles = {
    urgent: "bg-red-500/15 text-red-400 border-red-500/20",
    info: "bg-primary/10 text-primary border-primary/20",
    success: "bg-primary/10 text-primary border-primary/20",
  };

  return (
    <Card
      className={cn(
        "group relative overflow-hidden p-5 md:p-6 transition-all duration-200",
        onClick && "cursor-pointer hover:border-cyan-300/20 hover:shadow-[0_24px_60px_rgba(8,47,73,0.28)] hover:-translate-y-[1px]"
      )}
      onClick={onClick}
    >
      <div className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(103,232,249,0.6),transparent)]" />
      <div className={`absolute inset-x-5 top-0 h-[2px] rounded-full ${topBar}`} />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(103,232,249,0.08),transparent_28%),radial-gradient(circle_at_bottom_left,rgba(16,185,129,0.05),transparent_24%)] opacity-80" />

      <div className="relative mb-5 flex items-start justify-between">
        <div className={`rounded-2xl ${iconBg} p-3 border shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]`}>
          <Icon className={`h-4 w-4 ${accent}`} strokeWidth={1.5} />
        </div>
        <div className="flex items-center gap-2">
          {badge && (
            <span className={cn("text-[0.65rem] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border", badgeStyles[badgeVariant])}>
              {badge}
            </span>
          )}
          {onClick && (
            <ChevronRight className="h-3 w-3 text-muted-foreground/30 group-hover:text-muted-foreground/60 transition-colors" />
          )}
        </div>
      </div>

      <div className={`relative mb-1 font-[family:var(--font-display)] text-[2rem] font-semibold tracking-[-0.05em] tabular-nums ${accent}`}>
        {value}
      </div>
      <div className="relative text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
        {label}
      </div>
      {subtitle && (
        <div className="relative mt-2 text-[11px] leading-relaxed text-muted-foreground/72">
          {subtitle}
        </div>
      )}
      {trend && (
        <div className={cn(
          "relative mt-3 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-medium",
          trend.direction === "up" ? "bg-emerald-300/12 text-emerald-100" :
          trend.direction === "down" ? "bg-red-400/12 text-red-200" : "bg-muted/60 text-muted-foreground"
        )}>
          <TrendingUp className={cn("h-3 w-3", trend.direction === "down" && "rotate-180")} />
          {trend.label}
        </div>
      )}
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AGENT SQUAD CARD
// ─────────────────────────────────────────────────────────────────────────────

const agentStatusDotMap: Record<string, StatusDotVariant> = {
  ACTIVE: "active",
  PAUSED: "paused",
  DRAINED: "warning",
  QUARANTINED: "error",
  OFFLINE: "offline",
};

function AgentSquadCard({
  agent,
  currentTask,
  onClick,
}: {
  agent: Doc<"agents">;
  currentTask?: Doc<"tasks"> | null;
  onClick?: () => void;
}) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Card
            className="p-3.5 cursor-pointer hover:bg-muted/50 hover:border-border/80 hover:shadow-sm transition-all group"
            onClick={onClick}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick?.();
              }
            }}
            aria-label={`Agent ${agent.name}, ${agent.status}. Click to open details.`}
          >
            <div className="flex items-center gap-3">
              <span className="text-lg shrink-0">{agent.emoji ?? "🤖"}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-foreground truncate" title={agent._id}>
                    {agent.name}
                  </span>
                  <StatusDot
                    variant={agentStatusDotMap[agent.status] ?? "offline"}
                    pulse={agent.status === "ACTIVE"}
                    size="sm"
                  />
                </div>
                <span className="text-[0.65rem] uppercase tracking-wider text-muted-foreground/60">
                  {agent.role}
                </span>
              </div>
              <ArrowUpRight className="h-3 w-3 text-muted-foreground/20 group-hover:text-muted-foreground/50 transition-colors shrink-0" />
            </div>
            <div className="mt-2 pl-8">
              {currentTask ? (
                <p className="text-[0.7rem] text-muted-foreground leading-relaxed truncate">
                  {currentTask.title}
                </p>
              ) : (
                <p className="text-[0.7rem] text-muted-foreground/40 italic">
                  {agent.status === "ACTIVE" ? "Idle" : agent.status.toLowerCase()}
                </p>
              )}
              {agent.lastHeartbeatAt && (
                <p className="text-[0.65rem] text-muted-foreground/30 mt-0.5">
                  Last seen {formatRelativeTime(agent.lastHeartbeatAt)}
                </p>
              )}
            </div>
          </Card>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[280px]">
          <div className="font-medium">{agent.name}</div>
          <div className="text-[0.65rem] text-muted-foreground break-all">{agent._id}</div>
          <div className="text-[0.7rem] mt-0.5">Click to open agent details</div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// QUICK ACTIONS
// ─────────────────────────────────────────────────────────────────────────────

function QuickActionsBar({
  onNavigate,
  onOpenApprovals,
  onOpenAlertRules,
  onToggleLayout,
  isLayoutCustomizing,
}: {
  onNavigate?: (view: MainView) => void;
  onOpenApprovals?: () => void;
  onOpenAlertRules?: () => void;
  onToggleLayout?: () => void;
  isLayoutCustomizing?: boolean;
}) {
  const actions: { icon: LucideIcon; label: string; description: string; onClick: () => void; accent: string }[] = [
    {
      icon: Plus,
      label: "New Task",
      description: "Add to INBOX",
      onClick: () => onNavigate?.("tasks"),
      accent: "text-primary",
    },
    {
      icon: GitBranch,
      label: "DAG View",
      description: "Mission graph",
      onClick: () => onNavigate?.("dag"),
      accent: "text-violet-500",
    },
    {
      icon: Shield,
      label: "Approvals",
      description: "Review queue",
      onClick: () => onOpenApprovals?.(),
      accent: "text-amber-500",
    },
    ...(onOpenAlertRules
      ? [
          {
            icon: Layers,
            label: "Alert Rules",
            description: "Cost thresholds & alerts",
            onClick: () => onOpenAlertRules?.(),
            accent: "text-rose-500",
          } as const,
        ]
      : []),
    {
      icon: Cpu,
      label: "Agents",
      description: "Registry",
      onClick: () => onNavigate?.("agents"),
      accent: "text-primary",
    },
    {
      icon: Network,
      label: "Policies",
      description: "Risk controls",
      onClick: () => onNavigate?.("policies"),
      accent: "text-blue-500",
    },
    {
      icon: FlaskConical,
      label: "QC",
      description: "Quality gates",
      onClick: () => onNavigate?.("qc-dashboard"),
      accent: "text-rose-500",
    },
    {
      icon: FileText,
      label: "Audit",
      description: "Audit trail",
      onClick: () => onNavigate?.("audit"),
      accent: "text-zinc-400",
    },
    {
      icon: Clock,
      label: "Calendar",
      description: "Scheduled tasks",
      onClick: () => onNavigate?.("calendar"),
      accent: "text-sky-500",
    },
    {
      icon: ListChecks,
      label: "Schedules",
      description: "Cron jobs",
      onClick: () => onNavigate?.("schedules"),
      accent: "text-amber-500",
    },
    {
      icon: Layers,
      label: "Memory",
      description: "Agent memory",
      onClick: () => onNavigate?.("memory"),
      accent: "text-cyan-500",
    },
  ];

  return (
    <Card className="p-4 mb-6">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <Gauge className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Quick Navigation
          </span>
        </div>
        {onToggleLayout && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-[0.65rem] text-muted-foreground hover:text-foreground"
            onClick={onToggleLayout}
          >
            {isLayoutCustomizing ? "Done" : "Customize layout"}
          </Button>
        )}
      </div>
      <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
        {actions.map((action) => (
          <button
            key={action.label}
            onClick={action.onClick}
            className="flex flex-col items-center gap-1.5 p-2.5 rounded-lg hover:bg-muted/60 transition-colors group"
          >
            <div className={cn("p-2 rounded-lg bg-muted/40 group-hover:bg-muted/80 transition-colors")}>
              <action.icon className={cn("h-3.5 w-3.5", action.accent)} strokeWidth={1.5} />
            </div>
            <span className="text-[0.65rem] font-medium text-muted-foreground group-hover:text-foreground transition-colors text-center leading-tight">
              {action.label}
            </span>
          </button>
        ))}
      </div>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SYSTEM STATUS BAR
// ─────────────────────────────────────────────────────────────────────────────

function formatCycleTime(ms: number | null): string {
  if (ms === null) return "—";
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = ms / 3_600_000;
  if (hours < 48) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

function SystemStatusBar({
  agents,
  tasks,
  approvals,
}: {
  agents: Doc<"agents">[];
  tasks: Doc<"tasks">[];
  approvals: Doc<"approvals">[];
}) {
  const quarantinedCount = agents.filter((a) => a.status === "QUARANTINED").length;
  const activeAgentCount = agents.filter((a) => a.status === "ACTIVE").length;
  const runningCount = tasks.filter((t) => t.status === "IN_PROGRESS").length;
  const failedCount = tasks.filter((t) => t.status === "FAILED").length;
  const blockedCount = tasks.filter((t) => t.status === "BLOCKED").length;
  const pendingApprovals = approvals.length;

  const cycleSamples = tasks.filter(
    (t) => t.status === "DONE" && typeof t.startedAt === "number" && typeof t.completedAt === "number"
  );
  const avgCycleMs =
    cycleSamples.length > 0
      ? cycleSamples.reduce((sum, t) => sum + ((t.completedAt as number) - (t.startedAt as number)), 0) /
        cycleSamples.length
      : null;

  const hasError = quarantinedCount > 0 || failedCount > 0;
  const hasWarning = blockedCount > 0 || pendingApprovals > 0;
  const isHealthy = !hasError && !hasWarning;

  // Tone classes: cyan = active/running, amber = warning, red = blocked/failing
  const metrics: Array<{ label: string; value: string; tone: "cyan" | "amber" | "red" | "neutral" | "green" }> = [
    { label: "Active Agents", value: String(activeAgentCount), tone: activeAgentCount > 0 ? "cyan" : "neutral" },
    { label: "Running Tasks", value: String(runningCount), tone: runningCount > 0 ? "cyan" : "neutral" },
    { label: "Blocked", value: String(blockedCount), tone: blockedCount > 0 ? "amber" : "green" },
    { label: "Approvals", value: String(pendingApprovals), tone: pendingApprovals > 0 ? "amber" : "green" },
    { label: "Failed Runs", value: String(failedCount), tone: failedCount > 0 ? "red" : "green" },
    { label: "Avg Cycle", value: formatCycleTime(avgCycleMs), tone: "neutral" },
  ];

  const toneClass: Record<string, string> = {
    cyan: "text-cyan-200",
    amber: "text-amber-300",
    red: "text-red-400",
    green: "text-emerald-300",
    neutral: "text-foreground/70",
  };

  return (
    <div
      className={cn(
        "mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border px-4 py-2.5 text-xs",
        "bg-[linear-gradient(180deg,color-mix(in_srgb,var(--shell-panel)_96%,transparent),color-mix(in_srgb,var(--background)_92%,transparent))]",
        isHealthy ? "border-[var(--panel-line)]" : hasError ? "border-red-500/25" : "border-amber-500/25"
      )}
    >
      <div className="flex items-center gap-2">
        <StatusDot
          variant={isHealthy ? "active" : hasError ? "error" : "warning"}
          pulse
          size="sm"
        />
        <span
          className={cn(
            "font-semibold uppercase tracking-[0.14em]",
            isHealthy ? "text-emerald-300" : hasError ? "text-red-400" : "text-amber-300"
          )}
        >
          {isHealthy ? "All systems operational" : hasError ? "Faults detected" : "Attention required"}
        </span>
        {quarantinedCount > 0 && (
          <span className="rounded-full border border-red-500/25 bg-red-500/10 px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wider text-red-400">
            {quarantinedCount} quarantined
          </span>
        )}
      </div>

      <div className="hidden h-4 w-px bg-[var(--panel-line-strong)] sm:block" />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {metrics.map((metric) => (
          <div key={metric.label} className="flex items-baseline gap-1.5">
            <span className={cn("font-[family:var(--font-display)] text-sm font-semibold tabular-nums", toneClass[metric.tone])}>
              {metric.value}
            </span>
            <span className="text-[0.6rem] font-medium uppercase tracking-[0.14em] text-muted-foreground/70">
              {metric.label}
            </span>
          </div>
        ))}
      </div>

      <div className="ml-auto flex items-center gap-1.5 text-muted-foreground/60">
        <Clock className="h-3 w-3" />
        <span className="text-[0.65rem] tabular-nums">{new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ERROR BOUNDARY (so missing Convex function doesn't crash the whole dashboard)
// ─────────────────────────────────────────────────────────────────────────────

function SectionErrorBoundary({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

// ─────────────────────────────────────────────────────────────────────────────
// TOP RUNS BY TOKENS (isolated so missing getTopRunsByTokens doesn't crash dashboard)
// ─────────────────────────────────────────────────────────────────────────────

function TopRunsByTokensSection({
  projectId,
  onTaskSelect,
  onNavigate,
}: {
  projectId: Id<"projects"> | null;
  onTaskSelect?: (taskId: Id<"tasks">) => void;
  onNavigate?: (view: MainView) => void;
}) {
  const topRunsByTokens = useQuery(
    api.runs.getTopRunsByTokens,
    projectId ? { projectId, limit: 10, windowHours: 24 } : { limit: 10, windowHours: 24 }
  );

  if (!Array.isArray(topRunsByTokens) || topRunsByTokens.length === 0) return null;

  return (
    <Card className="p-4 mb-4">
      <div className="text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
        Top runs by tokens (24h)
      </div>
      <div className="space-y-1">
        {topRunsByTokens.map((run) => {
          const totalTokens = (run.inputTokens ?? 0) + (run.outputTokens ?? 0);
          const sessionLabel = run.sessionKey
            ? run.sessionKey.length > 24
              ? `${run.sessionKey.slice(0, 21)}…`
              : run.sessionKey
            : String(run._id);
          const fullSessionId = run.sessionKey ?? String(run._id);
          return (
            <TooltipProvider key={run._id}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => {
                      if (run.taskId) {
                        onTaskSelect?.(run.taskId);
                        onNavigate?.("tasks");
                      } else if (run.sessionKey && onNavigate) {
                        onNavigate("live-chat");
                      }
                    }}
                    className={cn(
                      "w-full flex items-center justify-between px-3 py-2 rounded-md text-left group",
                      (run.taskId || run.sessionKey) && onNavigate
                        ? "hover:bg-muted/50 transition-colors cursor-pointer"
                        : "cursor-default"
                    )}
                  >
                    <span className="text-xs text-foreground/90 truncate flex-1 mr-2 group-hover:text-foreground">
                      {sessionLabel}
                    </span>
                    <span className="text-[0.65rem] text-muted-foreground shrink-0 mr-2">
                      {(totalTokens / 1000).toFixed(1)}k
                    </span>
                    <span className="text-xs font-medium text-[var(--neon-green)] shrink-0">
                      ${(run.costUsd ?? 0).toFixed(2)}
                    </span>
                    {((run.taskId || run.sessionKey) && onNavigate) && (
                      <ChevronRight className="h-3 w-3 text-muted-foreground/40 shrink-0 ml-1" aria-hidden />
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[320px]">
                  <div className="text-[0.65rem] break-all font-mono">{fullSessionId}</div>
                  {run.taskId && <div className="text-[0.65rem] text-muted-foreground mt-0.5">Click to open task</div>}
                  {!run.taskId && run.sessionKey && <div className="text-[0.65rem] text-muted-foreground mt-0.5">Click to open Live Agent Chat</div>}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          );
        })}
      </div>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function formatElapsed(startMs: number): string {
  const diff = Date.now() - startMs;
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m`;
}

// ─────────────────────────────────────────────────────────────────────────────
// SORTABLE SECTION (for layout customize)
// ─────────────────────────────────────────────────────────────────────────────

function SortableSection({
  id,
  canDrag,
  children,
}: {
  id: string;
  canDrag: boolean;
  children: React.ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled: !canDrag });

  const style = transform
    ? { transform: CSS.Transform.toString(transform), transition }
    : undefined;

  if (!canDrag) {
    return <div className="mb-0">{children}</div>;
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "mb-6 flex items-start gap-2 rounded-lg border border-dashed border-muted-foreground/20 bg-muted/10 p-2",
        isDragging && "opacity-60 z-10"
      )}
    >
      <button
        type="button"
        className="mt-1.5 p-1 rounded hover:bg-muted/50 cursor-grab active:cursor-grabbing text-muted-foreground"
        aria-label="Drag to reorder"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export function DashboardOverview({
  projectId,
  onOpenMissionModal,
  onOpenSuggestionsDrawer,
  onSelectAgent,
  onNavigate,
  onOpenApprovals,
  onOpenAlertRules,
  onTaskSelect,
  onNavigateToGateway,
  onOpenCreateTask,
}: DashboardOverviewProps) {
  const [deploying, setDeploying] = useState(false);
  const [customizeLayout, setCustomizeLayout] = useState(false);
  const [gatewayConfigured, setGatewayConfigured] = useState<boolean | null>(null);
  const [dashboardLens, setDashboardLens] = useState<"operator" | "builder" | "executive">("operator");
  const [quickStartDismissed, setQuickStartDismissed] = useState<boolean>(() => {
    try {
      return localStorage.getItem("mc.quickstart.dismissed") === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    let cancelled = false;
    const base = getOrchestrationBaseUrl();
    fetch(base ? `${base}/gateway/status` : "/gateway/status")
      .then((r) => r.json())
      .then((data: { configured?: boolean; urlConfigured?: boolean; tokenConfigured?: boolean }) => {
        if (!cancelled)
          setGatewayConfigured(Boolean(data.configured ?? (data.urlConfigured && data.tokenConfigured)));
      })
      .catch(() => {
        if (!cancelled) setGatewayConfigured(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const [sectionOrder, setSectionOrder] = useState<string[]>(() => {
    try {
      const s = localStorage.getItem(DASHBOARD_LAYOUT_KEY);
      if (s) {
        const a = JSON.parse(s) as unknown;
        if (Array.isArray(a) && a.length > 0) return a;
      }
    } catch {
      // ignore
    }
    return [...DEFAULT_SECTION_ORDER];
  });

  const orderedIds = useMemo(() => {
    const merged = sectionOrder.filter((id) =>
      (DEFAULT_SECTION_ORDER as readonly string[]).includes(id)
    );
    for (const id of DEFAULT_SECTION_ORDER) {
      if (!merged.includes(id)) merged.push(id);
    }
    return merged;
  }, [sectionOrder]);

  const layoutSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const handleLayoutDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      setSectionOrder((prev) => {
        const ids = [...prev];
        const from = ids.indexOf(active.id as string);
        const to = ids.indexOf(over.id as string);
        if (from === -1 || to === -1) return prev;
        const [removed] = ids.splice(from, 1);
        ids.splice(to, 0, removed);
        try {
          localStorage.setItem(DASHBOARD_LAYOUT_KEY, JSON.stringify(ids));
        } catch {
          // ignore
        }
        return ids;
      });
    },
    []
  );

  const agents = useQuery(api.agents.listAll, projectId ? { projectId } : {});
  const tasks = useQuery(api.tasks.listAll, projectId ? { projectId } : {});
  const scheduledJobs = useQuery(api.scheduledJobs.list, projectId ? { projectId } : {});
  const approvals = useQuery(api.approvals.listPending, projectId ? { projectId, limit: 100 } : { limit: 100 });
  const openAlerts = useQuery(api.alerts.listOpen, { limit: 10 });
  const activities = useQuery(api.activities.listRecent, projectId ? { projectId, limit: 12 } : { limit: 12 });
  const missionData = useQuery(api.mission.getMission, projectId ? { projectId } : {});
  const usageByModel = useQuery(api.runs.getUsageByModel, projectId ? { projectId, windowHours: 24 } : { windowHours: 24 });
  const [chartWindowHours, setChartWindowHours] = useState<24 | 168 | 720>(24);
  const usageTimeSeries = useQuery(
    api.runs.getUsageTimeSeries,
    projectId
      ? {
          projectId,
          windowHours: chartWindowHours,
          bucketHours: chartWindowHours === 24 ? 1 : chartWindowHours === 168 ? 24 : 24,
        }
      : {
          windowHours: chartWindowHours,
          bucketHours: chartWindowHours === 24 ? 1 : chartWindowHours === 168 ? 24 : 24,
        }
  );
  const deploySquad = useMutation(api.squad.deploySquad);

  const isLoading = !agents || !tasks || !approvals || !activities;

  if (isLoading) {
    return (
      <main className="flex-1 overflow-auto p-6">
        <div className="max-w-[1400px] mx-auto">
          <div className="h-1.5 w-full rounded bg-muted/40 mb-6 skeleton-shimmer" />
          <div className="flex items-center justify-between mb-6">
            <div>
              <div className="h-5 w-48 rounded skeleton-shimmer mb-2" />
              <div className="h-3 w-64 rounded skeleton-shimmer" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonCard key={i} lines={2} />
            ))}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} lines={2} />
            ))}
          </div>
        </div>
      </main>
    );
  }

  // ── Computed metrics ──────────────────────────────────────────────────────
  const activeAgents = agents.filter((a) => a.status === "ACTIVE").length;
  const pausedAgents = agents.filter((a) => a.status === "PAUSED").length;
  const quarantinedAgents = agents.filter((a) => a.status === "QUARANTINED").length;
  const inProgressTasks = tasks.filter((t) => t.status === "IN_PROGRESS").length;
  const reviewTasks = tasks.filter((t) => t.status === "REVIEW").length;
  const doneTasks = tasks.filter((t) => t.status === "DONE").length;
  const blockedTasks = tasks.filter((t) => t.status === "BLOCKED").length;
  const needsApprovalTasks = tasks.filter((t) => t.status === "NEEDS_APPROVAL").length;
  const totalCost = tasks.reduce((sum, t) => sum + (Number(t.actualCost) ?? 0), 0);
  const completionRate = ((doneTasks / Math.max(tasks.length, 1)) * 100).toFixed(0);

  const statusCounts = {
    INBOX: tasks.filter((t) => t.status === "INBOX").length,
    ASSIGNED: tasks.filter((t) => t.status === "ASSIGNED").length,
    IN_PROGRESS: inProgressTasks,
    REVIEW: reviewTasks,
    NEEDS_APPROVAL: needsApprovalTasks,
    BLOCKED: blockedTasks,
    DONE: doneTasks,
    CANCELED: tasks.filter((t) => t.status === "CANCELED").length,
  };

  const buildTasks = tasks.filter(
    (t) => t.status === "IN_PROGRESS" && (t.type === "ENGINEERING" || t.type === "OPS")
  );
  const hasMission = Boolean(missionData?.missionStatement?.trim());
  const pipelineStages = getBuildPipelineStages({
    hasMission,
    taskCount: tasks.length,
    activeAgents,
    gatewayConfigured,
    approvalsCount: approvals.length,
  });
  const currentBuildStage = getCurrentBuildStage(pipelineStages);

  const blockedTasksList = tasks.filter((t) => t.status === "BLOCKED").slice(0, 4);
  const priorityQueue = (
    blockedTasksList.length > 0
      ? blockedTasksList
      : tasks.filter((t) => ["NEEDS_APPROVAL", "IN_PROGRESS", "ASSIGNED"].includes(t.status)).slice(0, 4)
  );
  const analystQueue = [
    ...approvals.slice(0, 2).map((approval) => ({
      id: `approval-${approval._id}`,
      title: approval.title,
      detail: approval.description || "Operator approval is required before execution can continue.",
      urgency: "High",
      lane: "Approval",
      onClick: onOpenApprovals,
      actionLabel: "Review",
    })),
    ...priorityQueue.map((task) => ({
      id: `task-${task._id}`,
      title: task.title,
      detail:
        task.status === "BLOCKED"
          ? task.blockedReason || "Execution is stalled until someone removes a dependency."
          : task.description || "This task is shaping the next operator decision.",
      urgency:
        task.status === "BLOCKED" || task.status === "NEEDS_APPROVAL"
          ? "High"
          : task.status === "IN_PROGRESS"
            ? "Medium"
            : "Low",
      lane: task.status.replace(/_/g, " "),
      onClick: () => onTaskSelect?.(task._id),
      actionLabel: "Open",
    })),
  ].slice(0, 5);
  const signalLandscape = [
    {
      label: "Queue pressure",
      value: `${statusCounts.INBOX + blockedTasks}`,
      detail: "inbox + blocked",
      percent: tasks.length > 0 ? Math.min(100, Math.round(((statusCounts.INBOX + blockedTasks) / tasks.length) * 100)) : 0,
      tone: "bg-amber-300",
    },
    {
      label: "Execution heat",
      value: `${inProgressTasks}`,
      detail: "actively moving",
      percent: tasks.length > 0 ? Math.min(100, Math.round((inProgressTasks / tasks.length) * 100)) : 0,
      tone: "bg-cyan-300",
    },
    {
      label: "Human gates",
      value: `${approvals.length}`,
      detail: "pending reviews",
      percent: Math.min(100, approvals.length * 18),
      tone: "bg-rose-300",
    },
    {
      label: "Fleet pulse",
      value: `${activeAgents}/${agents.length}`,
      detail: "live agents",
      percent: agents.length > 0 ? Math.round((activeAgents / agents.length) * 100) : 0,
      tone: "bg-emerald-300",
    },
  ];
  const throughputSignals = [
    {
      label: "Gateway",
      value: gatewayConfigured ? "Connected" : "Needs setup",
      tone: gatewayConfigured ? "text-emerald-100" : "text-amber-200",
      detail: gatewayConfigured ? "Streaming and session control are reachable." : "Realtime work is trust-limited until the gateway is connected.",
    },
    {
      label: "Approvals",
      value: approvals.length > 0 ? `${approvals.length} pending` : "Clear",
      tone: approvals.length > 0 ? "text-amber-200" : "text-cyan-100",
      detail: approvals.length > 0 ? "Operator review is gating execution." : "No human review bottlenecks right now.",
    },
    {
      label: "Queue",
      value: tasks.length > 0 ? `${tasks.length} tasks` : "Empty",
      tone: tasks.length > 0 ? "text-cyan-100" : "text-amber-200",
      detail: tasks.length > 0 ? `${statusCounts.INBOX} still waiting in the inbox.` : "Seed the next task so the system does not idle out.",
    },
  ];
  const showQuickStart =
    !quickStartDismissed &&
    (gatewayConfigured === false || agents.length === 0 || tasks.length === 0);

  const alertsList = openAlerts ?? [];
  const pinnedSectionIds = new Set(["statusBar", "quickActions", "actionQueue"]);
  const lensMeta: Record<"operator" | "builder" | "executive", { label: string; detail: string; sections: Set<string> }> = {
    operator: {
      label: "Operator",
      detail: "Triage blockers, queue pressure, and next actions.",
      sections: new Set(["healthStrip", "watchNext", "upcoming", "blockers", "taskPipelineActivity"]),
    },
    builder: {
      label: "Builder",
      detail: "Track build throughput, cost, and execution signals.",
      sections: new Set(["buildQueue", "usageTrends", "topTasksByCost", "topRunsByTokens", "agentSquad", "aiUsage"]),
    },
    executive: {
      label: "Executive",
      detail: "Review health, spend, and delivery posture without the operational clutter.",
      sections: new Set(["healthStrip", "metricRow1", "metricRow2", "usageTrends", "velocityFooter"]),
    },
  } as const;
  const primaryHeadline =
    approvals.length > 0
      ? `${approvals.length} approval${approvals.length === 1 ? "" : "s"} are waiting on you`
      : blockedTasks > 0
        ? `${blockedTasks} blocker${blockedTasks === 1 ? "" : "s"} are slowing execution`
        : activeAgents === 0
          ? "The fleet is idle"
          : inProgressTasks > 0
            ? `${inProgressTasks} task${inProgressTasks === 1 ? "" : "s"} are actively moving`
            : "The system is steady and ready";
  const primaryDetail =
    approvals.length > 0
      ? "Resolve pending decisions first so agents can continue with confidence."
      : blockedTasks > 0
        ? "Open the task board and clear blockers before throughput degrades."
        : activeAgents === 0
          ? "Bring agents online or seed work before the queue loses momentum."
          : inProgressTasks > 0
            ? "Execution is healthy. Review recent events and decide what should happen next."
            : "There are no active blockers. Use the home view to seed the next move.";
  const checklistItems = [
    {
      id: "gateway",
      label: "Gateway connected",
      detail: gatewayConfigured ? "Live streaming and chat are available." : "Streaming is not configured yet.",
      done: Boolean(gatewayConfigured),
      actionLabel: gatewayConfigured ? "Review gateway" : "Connect gateway",
      onClick: gatewayConfigured ? () => onNavigate?.("gateway") : onNavigateToGateway,
    },
    {
      id: "fleet",
      label: "Agents online",
      detail: activeAgents > 0 ? `${activeAgents} live agent${activeAgents === 1 ? "" : "s"} available.` : "No live agents are currently reporting in.",
      done: activeAgents > 0,
      actionLabel: "Open agents",
      onClick: () => onNavigate?.("agents"),
    },
    {
      id: "queue",
      label: "Mission queue seeded",
      detail: tasks.length > 0 ? `${tasks.length} queued task${tasks.length === 1 ? "" : "s"} in the system.` : "No tasks are queued right now.",
      done: tasks.length > 0,
      actionLabel: tasks.length > 0 ? "Open tasks" : "Create task",
      onClick: tasks.length > 0 ? () => onNavigate?.("tasks") : onOpenCreateTask,
    },
  ];

  const renderDashboardSection = (id: string): React.ReactNode => {
    switch (id) {
      case "statusBar":
        return <SystemStatusBar agents={agents} tasks={tasks} approvals={approvals} />;
      case "quickActions":
        return (
          <QuickActionsBar
            onNavigate={onNavigate}
            onOpenApprovals={onOpenApprovals}
            onOpenAlertRules={onOpenAlertRules}
            onToggleLayout={() => setCustomizeLayout((v) => !v)}
            isLayoutCustomizing={customizeLayout}
          />
        );
      case "actionQueue": {
        const needsApprovalTasks = tasks.filter((t) => t.status === "NEEDS_APPROVAL");
        const count = approvals.length + needsApprovalTasks.length + alertsList.length;
        return (
          <Card className="p-4 mb-4">
            <div className="flex items-center justify-between gap-2 mb-3">
              <Inbox className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Operator action queue
              </span>
              {count > 0 && (
                <span className="text-[0.65rem] font-medium px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-500 border border-amber-500/20">
                  {count} action{count !== 1 ? "s" : ""}
                </span>
              )}
            </div>
            <div className="space-y-1.5">
              {approvals.length > 0 && (
                <button
                  type="button"
                  onClick={onOpenApprovals}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-md hover:bg-muted/50 text-left text-xs"
                >
                  <span className="text-foreground/90">{approvals.length} pending approval(s)</span>
                  <ChevronRight className="h-3 w-3 text-muted-foreground" />
                </button>
              )}
              {needsApprovalTasks.length > 0 && (
                <button
                  type="button"
                  onClick={() => onNavigate?.("tasks")}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-md hover:bg-muted/50 text-left text-xs"
                >
                  <span className="text-foreground/90">{needsApprovalTasks.length} task(s) need approval</span>
                  <ChevronRight className="h-3 w-3 text-muted-foreground" />
                </button>
              )}
              {alertsList.length > 0 && (
                <button
                  type="button"
                  onClick={onOpenAlertRules}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-md hover:bg-muted/50 text-left text-xs"
                >
                  <span className="text-foreground/90">{alertsList.length} open alert(s)</span>
                  <ChevronRight className="h-3 w-3 text-muted-foreground" />
                </button>
              )}
              {count === 0 && (
                <p className="text-xs text-muted-foreground/70 py-2">No actions required</p>
              )}
            </div>
          </Card>
        );
      }
      case "healthStrip": {
        const failedCount = tasks.filter((t) => t.status === "FAILED").length;
        const issues = [
          quarantinedAgents > 0 && `${quarantinedAgents} quarantined`,
          failedCount > 0 && `${failedCount} failed`,
          blockedTasks > 0 && `${blockedTasks} blocked`,
          approvals.length > 0 && `${approvals.length} pending approvals`,
        ].filter(Boolean) as string[];
        const isHealthy = issues.length === 0;
        return (
          <Card className="p-4 mb-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <StatusDot variant={isHealthy ? "active" : "error"} pulse size="sm" />
                <span className="text-xs font-semibold text-foreground">
                  {isHealthy ? "Platform healthy" : "Attention required"}
                </span>
              </div>
              {issues.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {issues.map((label, i) => (
                    <span
                      key={i}
                      className="text-[0.65rem] px-2 py-0.5 rounded-full border bg-amber-500/10 border-amber-500/20 text-amber-500"
                    >
                      {label}
                    </span>
                  ))}
                </div>
              )}
              {onNavigate && (
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onNavigate("system")}>
                  System
                </Button>
              )}
            </div>
          </Card>
        );
      }
      case "watchNext":
        return (
          <Card className="p-4 mb-4">
            <div className="text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Watch next
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Button variant="outline" size="sm" className="h-9 justify-start gap-2 text-xs" onClick={() => onNavigate?.("tasks")}>
                <ListChecks className="h-3.5 w-3.5" />
                Tasks
              </Button>
              <Button variant="outline" size="sm" className="h-9 justify-start gap-2 text-xs" onClick={() => onNavigate?.("calendar")}>
                <Calendar className="h-3.5 w-3.5" />
                Calendar
              </Button>
              <Button variant="outline" size="sm" className="h-9 justify-start gap-2 text-xs" onClick={onNavigateToGateway}>
                <Radio className="h-3.5 w-3.5" />
                Gateway
              </Button>
              <Button variant="outline" size="sm" className="h-9 justify-start gap-2 text-xs" onClick={() => onNavigate?.("qc-dashboard")}>
                <FlaskConical className="h-3.5 w-3.5" />
                QC Dashboard
              </Button>
            </div>
          </Card>
        );
      case "upcoming":
        if (!onNavigate) return null;
        {
          const now = Date.now();
          const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
          const upcomingTasks = tasks
            .filter((t) => t.scheduledFor != null && t.scheduledFor >= now && t.scheduledFor <= now + sevenDaysMs)
            .sort((a, b) => (a.scheduledFor ?? 0) - (b.scheduledFor ?? 0))
            .slice(0, 5);
          const jobsList = scheduledJobs ?? [];
          const nextJobRuns = [...jobsList]
            .filter((j) => j.nextRun != null && j.nextRun >= now)
            .sort((a, b) => (a.nextRun ?? 0) - (b.nextRun ?? 0))
            .slice(0, 5);
          const hasAny = upcomingTasks.length > 0 || nextJobRuns.length > 0;
          return (
            <Card className="mb-4 p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">
                  What&apos;s running without you
                </span>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onNavigate("calendar")}>
                    Calendar
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onNavigate("ops-schedule")}>
                    Schedule
                  </Button>
                </div>
              </div>
              {hasAny ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <p className="text-[0.65rem] text-muted-foreground/70 mb-2">Next tasks</p>
                    {upcomingTasks.length === 0 ? (
                      <p className="text-xs text-muted-foreground/70">None in next 7 days</p>
                    ) : (
                      <ul className="space-y-1">
                        {upcomingTasks.slice(0, 5).map((t) => (
                          <li key={t._id}>
                            <button
                              type="button"
                              className="w-full text-left text-xs truncate text-foreground/90 hover:text-foreground"
                              onClick={() => {
                                onTaskSelect?.(t._id);
                                onNavigate("tasks");
                              }}
                            >
                              {t.title}
                            </button>
                            <span className="text-[0.65rem] text-muted-foreground">
                              {t.scheduledFor
                                ? new Date(t.scheduledFor).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
                                : ""}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div>
                    <p className="text-[0.65rem] text-muted-foreground/70 mb-2">Next job runs</p>
                    {nextJobRuns.length === 0 ? (
                      <p className="text-xs text-muted-foreground/70">None scheduled</p>
                    ) : (
                      <ul className="space-y-1">
                        {nextJobRuns.slice(0, 5).map((j) => (
                          <li key={j._id} className="flex justify-between gap-2 text-xs">
                            <span className="truncate text-foreground/90">{j.name}</span>
                            <span className="text-muted-foreground shrink-0">
                              {j.nextRun ? new Date(j.nextRun).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground/70 py-1">
                  No upcoming tasks or job runs.{" "}
                  <button type="button" className="underline hover:text-foreground" onClick={() => onNavigate("ops-schedule")}>View Schedule</button> or{" "}
                  <button type="button" className="underline hover:text-foreground" onClick={() => onNavigate("calendar")}>Calendar</button>.
                </p>
              )}
            </Card>
          );
        }
      case "aiUsage":
        return (
          <Card className="p-4 mb-4" key="aiUsage">
            <div className="text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              AI Usage (24h)
            </div>
            {usageByModel && usageByModel.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {usageByModel.map(({ model, inputTokens, outputTokens, costUsd }) => {
                  const inK = (inputTokens ?? 0) / 1000;
                  const outK = (outputTokens ?? 0) / 1000;
                  const cost = costUsd ?? 0;
                  return (
                    <div
                      key={model}
                      className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs"
                    >
                      <div className="font-medium text-foreground truncate" title={model}>
                        {model}
                      </div>
                      <div className="text-muted-foreground mt-1">
                        In: {inK.toFixed(1)}k · Out: {outK.toFixed(1)}k · ~${cost.toFixed(2)}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground/70 py-2">No usage in last 24h</p>
            )}
          </Card>
        );
      case "metricRow1":
        return (
          <div key="metricRow1" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-4">
            <QuotaFuelGauge className="min-h-[120px]" />
            <MetricCard
              icon={Bot}
              label="Active Agents"
              value={activeAgents}
              subtitle={`${agents.length} total · ${pausedAgents} paused${quarantinedAgents > 0 ? ` · ${quarantinedAgents} quarantined` : ""}`}
              accent="text-primary"
              onClick={() => onNavigate?.("agents")}
              badge={quarantinedAgents > 0 ? `${quarantinedAgents} issue${quarantinedAgents > 1 ? "s" : ""}` : undefined}
              badgeVariant="urgent"
              trend={{ direction: "up", label: `${activeAgents} of ${agents.length} running` }}
            />
            <MetricCard
              icon={Zap}
              label="In Progress"
              value={inProgressTasks}
              subtitle={`${tasks.length} total tasks`}
              accent="text-amber-500"
              onClick={() => onNavigate?.("tasks")}
              trend={{ direction: inProgressTasks > 0 ? "up" : "flat", label: `${tasks.length} across all states` }}
            />
            <MetricCard
              icon={Eye}
              label="In Review"
              value={reviewTasks}
              subtitle={`${doneTasks} completed`}
              accent="text-primary"
              onClick={() => onNavigate?.("tasks")}
              badge={reviewTasks > 0 ? "needs review" : undefined}
              badgeVariant="info"
            />
            <MetricCard
              icon={ShieldAlert}
              label="Pending Approvals"
              value={approvals.length}
              subtitle={approvals.length > 0 ? "Action required" : "All clear"}
              accent={approvals.length > 0 ? "text-destructive" : "text-primary"}
              onClick={onOpenApprovals}
              badge={approvals.length > 0 ? "urgent" : undefined}
              badgeVariant="urgent"
            />
          </div>
        );
      case "metricRow2":
        return (
          <div key="metricRow2" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <MetricCard
                      icon={DollarSign}
                      label="Total Spend"
                      value={`$${totalCost.toFixed(2)}`}
                      subtitle="Across all tasks"
                      accent="text-primary"
                    />
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-[260px]">
                  Cost from agent runs. Savings vs. paying list price without run-level optimizations.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <MetricCard
              icon={CheckCircle2}
              label="Completed"
              value={doneTasks}
              subtitle={`${completionRate}% completion rate`}
              accent="text-primary"
              onClick={() => onNavigate?.("tasks")}
              trend={{ direction: "up", label: `${completionRate}% done` }}
            />
            <MetricCard
              icon={AlertTriangle}
              label="Blocked"
              value={blockedTasks}
              subtitle={blockedTasks > 0 ? "Needs attention" : "No blockers"}
              accent={blockedTasks > 0 ? "text-destructive" : "text-primary"}
              onClick={() => onNavigate?.("tasks")}
              badge={blockedTasks > 0 ? "blocked" : undefined}
              badgeVariant="urgent"
            />
            <MetricCard
              icon={ListChecks}
              label="Needs Approval"
              value={needsApprovalTasks}
              subtitle={needsApprovalTasks > 0 ? "Awaiting review" : "Clear"}
              accent={needsApprovalTasks > 0 ? "text-amber-500" : "text-primary"}
              onClick={() => onNavigate?.("tasks")}
            />
          </div>
        );
      case "agentSquad":
        return agents.length > 0 ? (
          <Card key="agentSquad" className="p-5 mb-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Agent Squad
                </span>
                <span className="text-[0.65rem] text-muted-foreground/50 ml-1">
                  {activeAgents} active / {agents.length} total
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 text-[0.65rem] text-muted-foreground hover:text-foreground"
                onClick={() => onNavigate?.("agents")}
              >
                View all
                <ChevronRight className="h-3 w-3" />
              </Button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {agents.map((agent) => {
                const currentTask = agent.currentTaskId
                  ? tasks.find((t) => t._id === agent.currentTaskId) ?? null
                  : null;
                return (
                  <AgentSquadCard
                    key={agent._id}
                    agent={agent}
                    currentTask={currentTask}
                    onClick={() => onSelectAgent?.(agent._id)}
                  />
                );
              })}
            </div>
          </Card>
        ) : null;
      case "buildQueue":
        return buildTasks.length > 0 ? (
          <Card key="buildQueue" className="p-5 mb-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Hammer className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Build Queue
                </span>
                <span className="text-[0.65rem] text-muted-foreground/50 ml-1">
                  {buildTasks.length} active
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 text-[0.65rem] text-muted-foreground hover:text-foreground"
                onClick={() => onNavigate?.("tasks")}
              >
                View board
                <ChevronRight className="h-3 w-3" />
              </Button>
            </div>
            <div className="space-y-1.5">
              {buildTasks.slice(0, 8).map((task) => {
                const assignee = task.assigneeIds[0]
                  ? agents.find((a) => a._id === task.assigneeIds[0])
                  : null;
                return (
                  <button
                    key={task._id}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-muted/50 transition-colors text-left group"
                    onClick={() => onNavigate?.("tasks")}
                  >
                    <Loader2 className="h-3 w-3 text-amber-500 animate-spin shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-foreground/90 truncate group-hover:text-foreground transition-colors">
                        {task.title}
                      </p>
                      <p className="text-[0.65rem] text-muted-foreground/50">
                        {assignee ? `${assignee.emoji ?? "🤖"} ${assignee.name}` : "Unassigned"}
                        {task.startedAt && <> &middot; {formatElapsed(task.startedAt)}</>}
                      </p>
                    </div>
                    <span className="text-[0.65rem] uppercase tracking-wider text-amber-500/70 shrink-0">
                      {task.type}
                    </span>
                    <ChevronRight className="h-3 w-3 text-muted-foreground/20 group-hover:text-muted-foreground/50 shrink-0 transition-colors" />
                  </button>
                );
              })}
            </div>
          </Card>
        ) : null;
      case "blockers":
        return blockedTasksList.length > 0 ? (
          <Card key="blockers" className="p-5 mb-6 border-red-500/20 bg-red-500/3">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-400" />
                <span className="text-xs font-semibold uppercase tracking-wider text-red-400">
                  Blockers
                </span>
                <span className="text-[0.65rem] px-1.5 py-0.5 rounded bg-red-500/15 text-red-400 border border-red-500/20 font-medium uppercase tracking-wider">
                  {blockedTasksList.length} task{blockedTasksList.length > 1 ? "s" : ""} blocked
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 text-[0.65rem] text-red-400/70 hover:text-red-400"
                onClick={() => onNavigate?.("tasks")}
              >
                Resolve
                <ChevronRight className="h-3 w-3" />
              </Button>
            </div>
            <div className="space-y-1.5">
              {blockedTasksList.map((task) => (
                <button
                  key={task._id}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-md hover:bg-red-500/5 transition-colors text-left group"
                  onClick={() => onNavigate?.("tasks")}
                >
                  <div className="h-1.5 w-1.5 rounded-full bg-red-400 shrink-0" />
                  <span className="text-xs text-foreground/80 truncate flex-1 group-hover:text-foreground transition-colors">
                    {task.title}
                  </span>
                  <span className="text-[0.65rem] text-muted-foreground/40 shrink-0">{task.type}</span>
                </button>
              ))}
            </div>
          </Card>
        ) : null;
      case "taskPipelineActivity":
        return (
          <div key="taskPipelineActivity" className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <NeonChartContainer className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Task Pipeline
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 text-[0.65rem] text-muted-foreground hover:text-foreground"
                  onClick={() => onNavigate?.("tasks")}
                >
                  Open board
                  <ChevronRight className="h-3 w-3" />
                </Button>
              </div>
              <div className="h-[240px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={Object.entries(statusCounts).map(([status, count]) => ({
                      name: status.replace(/_/g, " "),
                      count,
                      fill: status === "DONE" ? "var(--neon-green)" : status === "IN_PROGRESS" ? "var(--neon-cyan)" : "var(--muted-foreground)",
                    }))}
                    layout="vertical"
                    margin={{ top: 0, right: 8, left: 0, bottom: 0 }}
                  >
                    <XAxis type="number" hide />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={72}
                      tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                      tickLine={{ stroke: "var(--glass-border)" }}
                      axisLine={{ stroke: "var(--glass-border)" }}
                    />
                    <RechartsTooltip
                      contentStyle={{
                        background: "var(--glass-bg)",
                        border: "1px solid var(--glass-border)",
                        borderRadius: "8px",
                      }}
                      labelStyle={{ color: "var(--foreground)" }}
                      formatter={(value: number) => [value, "Tasks"]}
                    />
                    <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={20}>
                      {Object.entries(statusCounts).map(([status]) => (
                        <Cell
                          key={status}
                          fill={
                            status === "DONE"
                              ? "var(--neon-green)"
                              : status === "IN_PROGRESS" || status === "REVIEW"
                                ? "var(--neon-cyan)"
                                : status === "BLOCKED" || status === "NEEDS_APPROVAL"
                                  ? "var(--neon-magenta)"
                                  : NeonChartTheme.gradientColors[0]
                          }
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </NeonChartContainer>
            <Card className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Recent Activity
                  </span>
                </div>
                <span className="text-[0.65rem] text-muted-foreground/40">Live</span>
              </div>
              <div className="space-y-0.5 max-h-[280px] overflow-y-auto">
                {activities.slice(0, 12).map((activity) => (
                  <div
                    key={activity._id}
                    className="flex items-start gap-3 px-3 py-2 rounded-md hover:bg-muted/50 transition-colors cursor-default"
                  >
                    <div className="mt-1 shrink-0">
                      <Clock className="h-3 w-3 text-muted-foreground/40" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-foreground/80 leading-relaxed truncate">
                        {activity.description}
                      </p>
                      <p className="text-[0.65rem] text-muted-foreground/50 mt-0.5">
                        <span className="uppercase tracking-wider">{activity.actorType}</span>
                        {" · "}
                        {new Date(activity._creationTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                ))}
                {activities.length === 0 && (
                  <div className="py-10 text-center">
                    <Activity className="h-6 w-6 text-muted-foreground/20 mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground/50">No recent activity</p>
                    <p className="text-[0.65rem] text-muted-foreground/30 mt-1">
                      Activity will appear here once agents start working
                    </p>
                  </div>
                )}
              </div>
            </Card>
          </div>
        );
      case "usageTrends":
        return usageTimeSeries && usageTimeSeries.length > 0 ? (
          <div key="usageTrends" className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            <NeonChartContainer className="p-5">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Token usage
                </span>
                <div className="flex gap-1">
                  <Button variant={chartWindowHours === 24 ? "secondary" : "ghost"} size="sm" className="h-7 text-[0.65rem]" onClick={() => setChartWindowHours(24)}>24h</Button>
                  <Button variant={chartWindowHours === 168 ? "secondary" : "ghost"} size="sm" className="h-7 text-[0.65rem]" onClick={() => setChartWindowHours(168)}>7d</Button>
                  <Button variant={chartWindowHours === 720 ? "secondary" : "ghost"} size="sm" className="h-7 text-[0.65rem]" onClick={() => setChartWindowHours(720)}>30d</Button>
                </div>
              </div>
              <div className="h-[200px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={usageTimeSeries.map((d) => ({ ...d, totalTokens: d.inputTokens + d.outputTokens }))}
                    margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
                  >
                    <XAxis
                      dataKey="period"
                      tick={{ fill: NeonChartTheme.styles.fill, fontSize: 10 }}
                      tickFormatter={(v) =>
                        chartWindowHours === 24 ? v.slice(11, 13) : chartWindowHours === 168 ? v.slice(5, 10) : v.slice(0, 10)
                      }
                    />
                    <YAxis
                      tick={{ fill: NeonChartTheme.styles.fill, fontSize: 10 }}
                      tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
                    />
                    <RechartsTooltip
                      contentStyle={{
                        background: "var(--glass-bg)",
                        border: "1px solid var(--glass-border)",
                        borderRadius: "8px",
                      }}
                      formatter={(value: number) => [value >= 1000 ? `${(value / 1000).toFixed(1)}k` : value, "Tokens"]}
                      labelFormatter={(l) => (typeof l === "string" ? l : "")}
                    />
                    <Area
                      type="monotone"
                      dataKey="totalTokens"
                      stroke="var(--neon-cyan)"
                      fill="var(--neon-cyan)"
                      fillOpacity={0.2}
                      strokeWidth={1.5}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </NeonChartContainer>
            <NeonChartContainer className="p-5">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Cost trend
                </span>
              </div>
              <div className="h-[200px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={usageTimeSeries} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <XAxis
                      dataKey="period"
                      tick={{ fill: NeonChartTheme.styles.fill, fontSize: 10 }}
                      tickFormatter={(v) =>
                        chartWindowHours === 24 ? v.slice(11, 13) : chartWindowHours === 168 ? v.slice(5, 10) : v.slice(0, 10)
                      }
                    />
                    <YAxis
                      tick={{ fill: NeonChartTheme.styles.fill, fontSize: 10 }}
                      tickFormatter={(v) => `$${Number(v).toFixed(2)}`}
                    />
                    <RechartsTooltip
                      contentStyle={{
                        background: "var(--glass-bg)",
                        border: "1px solid var(--glass-border)",
                        borderRadius: "8px",
                      }}
                      formatter={(value: number) => [`$${Number(value).toFixed(2)}`, "Cost"]}
                      labelFormatter={(l) => (typeof l === "string" ? l : "")}
                    />
                    <Line type="monotone" dataKey="costUsd" stroke="var(--neon-green)" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </NeonChartContainer>
          </div>
        ) : null;
      case "topTasksByCost":
        return tasks.filter((t) => t.actualCost > 0).length > 0 ? (
          <Card key="topTasksByCost" className="p-4 mb-4">
            <div className="text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Top tasks by cost
            </div>
            <div className="space-y-1">
              {[...tasks]
                .filter((t) => t.actualCost > 0)
                .sort((a, b) => b.actualCost - a.actualCost)
                .slice(0, 5)
                .map((task) => (
                  <button
                    key={task._id}
                    type="button"
                    onClick={() => {
                      onTaskSelect?.(task._id);
                      onNavigate?.("tasks");
                    }}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-md hover:bg-muted/50 transition-colors text-left group"
                  >
                    <span className="text-xs text-foreground/90 truncate flex-1 mr-2 group-hover:text-foreground">
                      {task.title}
                    </span>
                    <span className="text-xs font-medium text-[var(--neon-green)] shrink-0">
                      ${task.actualCost.toFixed(2)}
                    </span>
                    <ChevronRight className="h-3 w-3 text-muted-foreground/40 shrink-0" />
                  </button>
                ))}
            </div>
          </Card>
        ) : null;
      case "topRunsByTokens":
        return (
          <SectionErrorBoundary key="topRunsByTokens">
            <TopRunsByTokensSection
              projectId={projectId}
              onTaskSelect={onTaskSelect}
              onNavigate={onNavigate}
            />
          </SectionErrorBoundary>
        );
      case "velocityFooter":
        return (
          <div key="velocityFooter" className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { icon: TrendingUp, label: "Throughput", value: `${doneTasks} tasks`, sub: "completed total" },
              {
                icon: Cpu,
                label: "Squad Utilization",
                value: agents.length > 0 ? `${Math.round((activeAgents / agents.length) * 100)}%` : "0%",
                sub: `${activeAgents ?? 0}/${agents.length} agents active`,
              },
              {
                icon: DollarSign,
                label: "Avg Cost / Task",
                value: doneTasks > 0 ? `$${(Number(totalCost) / doneTasks).toFixed(3)}` : "$0.000",
                sub: "per completed task",
              },
              {
                icon: Shield,
                label: "Policy Status",
                value: approvals.length === 0 ? "Clear" : `${approvals.length} pending`,
                sub: approvals.length > 0 ? "review required" : "no approvals needed",
              },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-3 px-4 py-3 rounded-lg bg-muted/30 border border-border/50">
                <item.icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" strokeWidth={1.5} />
                <div>
                  <div className="text-xs font-semibold text-foreground">{item.value}</div>
                  <div className="text-[0.65rem] text-muted-foreground/60 uppercase tracking-wider">{item.label}</div>
                  <div className="text-[0.65rem] text-muted-foreground/40">{item.sub}</div>
                </div>
              </div>
            ))}
          </div>
        );
      default:
        return null;
    }
  };

  const filteredSectionIds = orderedIds.filter((id) => !pinnedSectionIds.has(id) && lensMeta[dashboardLens].sections.has(id as keyof typeof SECTION_LABELS | string));
  const orderedSectionNodes = filteredSectionIds
    .filter((id) => !pinnedSectionIds.has(id))
    .map((id) => (
    <React.Fragment key={id}>
      {renderDashboardSection(id)}
    </React.Fragment>
    ));

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <main className="flex-1 overflow-auto">
      <div className="max-w-[1720px] mx-auto px-6 py-5">
        <SystemStatusBar agents={agents} tasks={tasks} approvals={approvals} />

        <MissionSnapshot
          hasMission={!!missionData?.missionStatement}
          agents={agents}
          tasks={tasks}
          approvals={approvals}
          onOpenMission={() => onOpenMissionModal?.()}
          onOpenFleet={() => onNavigate?.("control-fleet")}
          onOpenApprovals={onOpenApprovals}
          onOpenTasks={() => onNavigate?.("tasks")}
        />

        <MissionBanner
          projectId={projectId}
          onEditClick={() => onOpenMissionModal?.()}
          onReversePromptClick={() => onOpenSuggestionsDrawer?.()}
          onImportFromJira={onNavigateToGateway}
          onConnectFleet={() => onNavigate?.("agents")}
          brief={{
            stageLabel: currentBuildStage.label,
            stageEyebrow: currentBuildStage.eyebrow,
            artifact: currentBuildStage.artifact,
            rule:
              currentBuildStage.id === "prototype"
                ? "Get a yes on the prototype before backend complexity expands."
                : currentBuildStage.id === "backend"
                  ? "Generate backend shape from approved frontend and docs, not guesswork."
                  : "Define actors and constraints before expanding feature scope.",
          }}
          className="mb-6"
        />


        <FleetPreview
          agents={agents}
          tasks={tasks}
          onSelectAgent={onSelectAgent}
          onRegisterAgent={() => onNavigate?.("agents")}
          onResumeFleet={() => onNavigate?.("agents")}
          onLaunchTask={() => onOpenCreateTask?.()}
          onInspectFleet={() => onNavigate?.("control-fleet")}
        />

        <ExecutionReadiness
          readiness={{
            missionDefined: !!missionData?.missionStatement,
            actorsSelected: agents.length > 0,
            toolsConnected: gatewayConfigured === true,
            observabilityEnabled: (activities?.length ?? 0) > 0,
          }}
          onOpenMission={() => onOpenMissionModal?.()}
          onOpenFleet={() => onNavigate?.("agents")}
          onOpenGateway={onNavigateToGateway}
          onOpenApprovals={onOpenApprovals}
        />

        <OperatorTipsCard
          onNavigate={onNavigate}
          hasMission={!!missionData?.missionStatement}
          hasAgents={agents.length > 0}
          gatewayConfigured={gatewayConfigured}
          onOpenMission={() => onOpenMissionModal?.()}
          onOpenGateway={onNavigateToGateway}
        />
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.7fr)_360px] mb-8">
          <Card className="overflow-hidden">
            <div className="grid gap-0 xl:grid-cols-[minmax(0,1.2fr)_380px]">
              <div className="relative border-b border-[var(--panel-line)] p-6 xl:border-b-0 xl:border-r">
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.12),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.14),transparent_28%)]" />
                <div className="relative">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-100/80">
                        Home command deck
                      </span>
                      <span className="rounded-full border border-[var(--panel-line)] bg-[color:var(--shell-panel)] px-3 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                        {activeAgents} live agents
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(Object.keys(lensMeta) as Array<keyof typeof lensMeta>).map((lens) => (
                        <button
                          key={lens}
                          type="button"
                          onClick={() => setDashboardLens(lens)}
                          className={cn(
                            "rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] transition-all",
                            dashboardLens === lens
                              ? "border-cyan-300/20 bg-cyan-400/10 text-cyan-100 shadow-[var(--glow-cyan)]"
                              : "border-[var(--panel-line)] bg-[color:var(--shell-panel)] text-muted-foreground hover:text-foreground"
                          )}
                        >
                          {lensMeta[lens].label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <h1 className="mt-4 max-w-3xl font-[family:var(--font-display)] text-3xl font-semibold leading-tight tracking-[0.04em] text-foreground xl:text-4xl">
                    {primaryHeadline}
                  </h1>
                  <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground xl:text-base">
                    {primaryDetail}
                  </p>
                  <p className="mt-2 text-[11px] font-medium uppercase tracking-[0.16em] text-cyan-100/70">
                    {lensMeta[dashboardLens].detail}
                  </p>

                  <div className="mt-5 flex flex-wrap gap-2">
                    {approvals.length > 0 && onOpenApprovals && (
                      <Button variant="neon-cyan" size="sm" onClick={onOpenApprovals}>
                        <Shield className="h-3.5 w-3.5" />
                        Review approvals
                      </Button>
                    )}
                    {blockedTasks > 0 && onNavigate && (
                      <Button variant="outline" size="sm" onClick={() => onNavigate("tasks")}>
                        <AlertTriangle className="h-3.5 w-3.5" />
                        Resolve blockers
                      </Button>
                    )}
                    {onOpenCreateTask && (
                      <Button variant="outline" size="sm" onClick={onOpenCreateTask}>
                        <Plus className="h-3.5 w-3.5" />
                        New task
                      </Button>
                    )}
                    {onOpenSuggestionsDrawer && (
                      <Button variant="ghost" size="sm" onClick={onOpenSuggestionsDrawer}>
                        <Sparkles className="h-3.5 w-3.5" />
                        Reverse prompt
                      </Button>
                    )}
                  </div>

                  <div className="mt-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
                    {[
                      { label: "Active agents", value: activeAgents, sub: `${agents.length} total agents`, accent: "text-cyan-100" },
                      { label: "In progress", value: inProgressTasks, sub: `${statusCounts.INBOX} waiting in inbox`, accent: "text-emerald-100" },
                      { label: "Pending approvals", value: approvals.length, sub: approvals.length > 0 ? "human action required" : "all clear", accent: approvals.length > 0 ? "text-amber-200" : "text-cyan-100" },
                      { label: "Blocked tasks", value: blockedTasks, sub: blockedTasks > 0 ? "throughput at risk" : "no current blockers", accent: blockedTasks > 0 ? "text-rose-200" : "text-cyan-100" },
                    ].map((item) => (
                      <div key={item.label} className="rounded-xl border border-[var(--panel-line)] bg-[color:var(--shell-panel)] px-4 py-4">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                          {item.label}
                        </div>
                        <div className={cn("mt-2 text-3xl font-semibold tabular-nums", item.accent)}>
                          {item.value}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">{item.sub}</div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-5 grid gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
                    <div className="rounded-2xl border border-[var(--panel-line)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--shell-panel)_92%,transparent),color-mix(in_srgb,var(--background)_88%,transparent))] p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200/70">
                            Critical path
                          </div>
                          <div className="mt-1 text-sm font-semibold text-foreground">
                            {priorityQueue.length > 0 ? "What is slowing or gating progress right now" : "No active blockers in the critical path"}
                          </div>
                        </div>
                        {onNavigate && (
                          <Button variant="ghost" size="sm" onClick={() => onNavigate("tasks")}>
                            Open board
                          </Button>
                        )}
                      </div>
                      <div className="mt-4 space-y-2">
                        {priorityQueue.length > 0 ? (
                          priorityQueue.map((task) => (
                            <button
                              key={task._id}
                              type="button"
                              onClick={() => onTaskSelect?.(task._id)}
                              className="flex w-full items-start justify-between gap-3 rounded-lg border border-[var(--panel-line)] bg-[color:var(--shell-panel)] px-4 py-3 text-left transition-all hover:border-cyan-300/20 hover:bg-cyan-400/6"
                            >
                              <div className="min-w-0">
                                <div className="text-sm font-semibold text-foreground">{task.title}</div>
                                <div className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                                  {task.status === "BLOCKED"
                                    ? task.blockedReason || "Blocked work needs operator action before execution can continue."
                                    : task.description || "This task is currently shaping the next operator decision."}
                                </div>
                              </div>
                              <span className="rounded-full border border-[var(--panel-line)] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                                {task.status.replace(/_/g, " ")}
                              </span>
                            </button>
                          ))
                        ) : (
                          <div className="rounded-lg border border-[var(--panel-line)] bg-[color:var(--shell-panel)] px-4 py-4 text-sm text-muted-foreground">
                            The queue is clear. This is the right time to seed a new task, inspect recent output quality, or tighten routing rules before pressure returns.
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-[var(--panel-line)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--shell-panel)_92%,transparent),color-mix(in_srgb,var(--background)_88%,transparent))] p-4">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200/70">
                        Operator readout
                      </div>
                      <div className="mt-1 text-sm font-semibold text-foreground">
                        Trust indicators for the current operating state
                      </div>
                      <div className="mt-4 space-y-3">
                        {throughputSignals.map((signal) => (
                          <div key={signal.label} className="rounded-lg border border-[var(--panel-line)] bg-[color:var(--shell-panel)] px-4 py-3">
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                                {signal.label}
                              </div>
                              <div className={cn("text-xs font-semibold uppercase tracking-[0.14em]", signal.tone)}>
                                {signal.value}
                              </div>
                            </div>
                            <div className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                              {signal.detail}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-6">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-200/70">
                      Live pulse
                    </div>
                    <div className="mt-1 text-sm font-semibold text-foreground">Recent operational movement</div>
                  </div>
                  <AutoRefreshBadge interval={15} active />
                </div>

                <div className="mt-4 space-y-2">
                  {activities.slice(0, 5).map((activity) => (
                    <div key={activity._id} className="rounded-lg border border-[var(--panel-line)] bg-[color:var(--shell-panel)] px-4 py-3">
                      <div className="flex items-start gap-3">
                        <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-cyan-300 status-dot-pulse" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm leading-relaxed text-foreground/90">{activity.description}</p>
                          <p className="mt-1 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                            {activity.actorType} · {new Date(activity._creationTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 rounded-xl border border-[var(--panel-line)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--shell-panel)_92%,transparent),transparent)] px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Execution posture</div>
                      <div className="mt-1 text-sm font-semibold text-foreground">
                        {completionRate}% completion rate
                      </div>
                    </div>
                    <span className="rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-100">
                      ${totalCost.toFixed(2)} spent
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-2xl border border-[var(--panel-line)] px-3 py-3">
                      <div className="text-xl font-semibold text-foreground">{doneTasks}</div>
                      <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Completed</div>
                    </div>
                    <div className="rounded-2xl border border-[var(--panel-line)] px-3 py-3">
                      <div className="text-xl font-semibold text-foreground">{reviewTasks}</div>
                      <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Review</div>
                    </div>
                    <div className="rounded-2xl border border-[var(--panel-line)] px-3 py-3">
                      <div className="text-xl font-semibold text-foreground">{activities.length}</div>
                      <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Events</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Card>

          <div className="space-y-4">
            <Card className="p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-200/70">
                    Launch checklist
                  </div>
                  <div className="mt-1 text-sm font-semibold text-foreground">
                    Get Mission Control into a trustworthy operating state
                  </div>
                </div>
                {showQuickStart && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 shrink-0"
                    aria-label="Dismiss quick start"
                    onClick={() => {
                      setQuickStartDismissed(true);
                      try {
                        localStorage.setItem("mc.quickstart.dismissed", "1");
                      } catch {
                        // ignore
                      }
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <div className="mt-4 space-y-3">
                {checklistItems.map((item) => (
                  <div key={item.id} className="rounded-xl border border-[var(--panel-line)] bg-[color:var(--shell-panel)] px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <StatusDot variant={item.done ? "healthy" : "warning"} pulse={!item.done} size="md" />
                        <div>
                          <div className="text-sm font-semibold text-foreground">{item.label}</div>
                          <div className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.detail}</div>
                        </div>
                      </div>
                      {item.onClick && (
                        <Button size="sm" variant={item.done ? "outline" : "neon"} onClick={item.onClick}>
                          {item.actionLabel}
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {renderDashboardSection("actionQueue")}
          </div>
        </div>

        {renderDashboardSection("quickActions")}
        <div className="mb-8 grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <Card className="p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-200/70">
                  Analyst queue
                </div>
                <div className="mt-1 text-sm font-semibold text-foreground">
                  Triage what deserves operator attention next
                </div>
              </div>
              <span className="rounded-full border border-[var(--panel-line)] bg-[color:var(--shell-panel)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                {analystQueue.length} live items
              </span>
            </div>
            <div className="mt-4 space-y-3">
              {analystQueue.map((item) => (
                <div key={item.id} className="rounded-xl border border-[var(--panel-line)] bg-[color:var(--shell-panel)] px-4 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-sm font-semibold text-foreground">{item.title}</div>
                        <span className="rounded-full border border-[var(--panel-line)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                          {item.lane}
                        </span>
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em]",
                            item.urgency === "High"
                              ? "bg-rose-400/12 text-rose-200"
                              : item.urgency === "Medium"
                                ? "bg-amber-300/12 text-amber-100"
                                : "bg-cyan-300/10 text-cyan-100"
                          )}
                        >
                          {item.urgency}
                        </span>
                      </div>
                      <div className="mt-2 text-sm leading-relaxed text-muted-foreground">
                        {item.detail}
                      </div>
                    </div>
                    {item.onClick && (
                      <Button variant="outline" size="sm" onClick={item.onClick}>
                        {item.actionLabel}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-200/70">
                  Signal landscape
                </div>
                <div className="mt-1 text-sm font-semibold text-foreground">
                  Live health ratios inspired by modern observability decks
                </div>
              </div>
              <AutoRefreshBadge interval={15} active />
            </div>
            <div className="mt-4 grid gap-3">
              {signalLandscape.map((signal) => (
                <div key={signal.label} className="rounded-xl border border-[var(--panel-line)] bg-[color:var(--shell-panel)] px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                        {signal.label}
                      </div>
                      <div className="mt-1 text-sm text-muted-foreground">{signal.detail}</div>
                    </div>
                    <div className="text-2xl font-semibold tracking-[-0.04em] text-foreground">
                      {signal.value}
                    </div>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted/60">
                    <div
                      className={cn("h-full rounded-full", signal.tone)}
                      style={{ width: `${signal.percent}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
        {orderedSectionNodes}

        {/* Customize layout dialog renders below; section order is driven by orderedSectionNodes above. */}

        {/* Customize layout dialog — reorder sections; order persisted to localStorage */}
        <Dialog open={customizeLayout} onOpenChange={(open) => !open && setCustomizeLayout(false)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Reorder dashboard sections</DialogTitle>
              <DialogDescription>
                Drag to reorder. Order is saved automatically. Dashboard section order is stored in this browser.
              </DialogDescription>
            </DialogHeader>
            <DndContext
              sensors={layoutSensors}
              collisionDetection={closestCenter}
              onDragEnd={handleLayoutDragEnd}
            >
              <SortableContext items={orderedIds} strategy={verticalListSortingStrategy}>
                <div className="space-y-1 mt-2 max-h-[60vh] overflow-y-auto">
                  {orderedIds.map((id) => (
                    <SortableSection key={id} id={id} canDrag={true}>
                      <span className="text-sm font-medium">{SECTION_LABELS[id] ?? id}</span>
                    </SortableSection>
                  ))}
                </div>
              </SortableContext>
            </DndContext>
            <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-border">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSectionOrder([...DEFAULT_SECTION_ORDER]);
                  try {
                    localStorage.setItem(DASHBOARD_LAYOUT_KEY, JSON.stringify([...DEFAULT_SECTION_ORDER]));
                  } catch {
                    // ignore
                  }
                }}
              >
                Reset to default
              </Button>
              <Button size="sm" onClick={() => setCustomizeLayout(false)}>
                Done
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </main>
  );
}
