import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id, Doc } from "../../../convex/_generated/dataModel";
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
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusDot, type StatusDotVariant } from "@/components/ui/status-dot";
import { AutoRefreshBadge } from "@/components/ui/auto-refresh-badge";
import { SkeletonCard } from "@/components/ui/skeleton-card";
import { MissionBanner } from "@/components/MissionBanner";
import type { LucideIcon } from "lucide-react";

interface DashboardOverviewProps {
  projectId: Id<"projects"> | null;
  onClose: () => void;
  onOpenMissionModal?: () => void;
  onOpenSuggestionsDrawer?: () => void;
  onSelectAgent?: (agentId: Id<"agents">) => void;
}

interface MetricCardProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  subtitle?: string;
  accent?: string;
}

function MetricCard({ icon: Icon, label, value, subtitle, accent = "text-primary" }: MetricCardProps) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between mb-3">
        <div className="rounded-md bg-muted p-2 border border-border">
          <Icon className={`h-4 w-4 ${accent}`} strokeWidth={1.5} />
        </div>
      </div>
      <div className={`text-2xl font-semibold tracking-tight ${accent} mb-0.5`}>
        {value}
      </div>
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      {subtitle && (
        <div className="text-xs text-muted-foreground/60 mt-1">
          {subtitle}
        </div>
      )}
    </Card>
  );
}

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
    <Card className="p-3.5 cursor-pointer hover:bg-muted/50 transition-colors" onClick={onClick}>
      <div className="flex items-center gap-3">
        <span className="text-lg shrink-0">{agent.emoji ?? "🤖"}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-foreground truncate">
              {agent.name}
            </span>
            <StatusDot
              variant={agentStatusDotMap[agent.status] ?? "offline"}
              pulse={agent.status === "ACTIVE"}
              size="sm"
            />
          </div>
          <span className="text-[0.6rem] uppercase tracking-wider text-muted-foreground/60">
            {agent.role}
          </span>
        </div>
      </div>
      <div className="mt-2 pl-8">
        {currentTask ? (
          <p className="text-[0.65rem] text-muted-foreground leading-relaxed truncate">
            {currentTask.title}
          </p>
        ) : (
          <p className="text-[0.65rem] text-muted-foreground/40 italic">
            {agent.status === "ACTIVE" ? "Idle" : agent.status.toLowerCase()}
          </p>
        )}
        {agent.lastHeartbeatAt && (
          <p className="text-[0.6rem] text-muted-foreground/30 mt-0.5">
            Last seen {formatRelativeTime(agent.lastHeartbeatAt)}
          </p>
        )}
      </div>
    </Card>
  );
}

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

export function DashboardOverview({ projectId, onOpenMissionModal, onOpenSuggestionsDrawer, onSelectAgent }: DashboardOverviewProps) {
  const [deploying, setDeploying] = useState(false);

  const agents = useQuery(api.agents.listAll, projectId ? { projectId } : {});
  const tasks = useQuery(api.tasks.listAll, projectId ? { projectId } : {});
  const approvals = useQuery(api.approvals.listPending, projectId ? { projectId, limit: 100 } : { limit: 100 });
  const activities = useQuery(api.activities.listRecent, projectId ? { projectId, limit: 10 } : { limit: 10 });
  const deploySquad = useMutation(api.squad.deploySquad);

  const isLoading = !agents || !tasks || !approvals || !activities;

  if (isLoading) {
    return (
      <main className="flex-1 overflow-auto p-6">
        <div className="max-w-[1400px] mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div>
              <div className="h-5 w-48 rounded skeleton-shimmer mb-2" />
              <div className="h-3 w-64 rounded skeleton-shimmer" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <SkeletonCard key={i} lines={2} />
            ))}
          </div>
        </div>
      </main>
    );
  }

  const activeAgents = agents.filter((a) => a.status === "ACTIVE").length;
  const pausedAgents = agents.filter((a) => a.status === "PAUSED").length;
  const quarantinedAgents = agents.filter((a) => a.status === "QUARANTINED").length;
  const inProgressTasks = tasks.filter((t) => t.status === "IN_PROGRESS").length;
  const reviewTasks = tasks.filter((t) => t.status === "REVIEW").length;
  const doneTasks = tasks.filter((t) => t.status === "DONE").length;
  const blockedTasks = tasks.filter((t) => t.status === "BLOCKED").length;
  const totalCost = tasks.reduce((sum, t) => sum + t.actualCost, 0);

  const statusCounts = {
    INBOX: tasks.filter((t) => t.status === "INBOX").length,
    ASSIGNED: tasks.filter((t) => t.status === "ASSIGNED").length,
    IN_PROGRESS: inProgressTasks,
    REVIEW: reviewTasks,
    NEEDS_APPROVAL: tasks.filter((t) => t.status === "NEEDS_APPROVAL").length,
    BLOCKED: blockedTasks,
    DONE: doneTasks,
    CANCELED: tasks.filter((t) => t.status === "CANCELED").length,
  };

  const buildTasks = tasks.filter(
    (t) => t.status === "IN_PROGRESS" && (t.type === "ENGINEERING" || t.type === "OPS")
  );

  return (
    <main className="flex-1 overflow-auto">
      <div className="max-w-[1400px] mx-auto px-6 py-5">
        <MissionBanner
          projectId={projectId}
          onEditClick={() => onOpenMissionModal?.()}
          onReversePromptClick={() => onOpenSuggestionsDrawer?.()}
        />

        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-foreground">
              Command Center
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Real-time system health and operational metrics
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button
              disabled={deploying}
              onClick={async () => {
                setDeploying(true);
                try {
                  await deploySquad({ projectId: projectId ?? undefined });
                } finally {
                  setDeploying(false);
                }
              }}
              size="sm"
              className="h-8 gap-1.5 text-xs"
            >
              {deploying ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Rocket className="h-3 w-3" />
              )}
              Deploy Squad
            </Button>
            <AutoRefreshBadge interval={15} active />
            <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-500">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Connected
            </span>
          </div>
        </div>

        {/* Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <MetricCard
            icon={Bot}
            label="Active Agents"
            value={activeAgents}
            subtitle={`${agents.length} total · ${pausedAgents} paused${quarantinedAgents > 0 ? ` · ${quarantinedAgents} quarantined` : ""}`}
            accent="text-emerald-500"
          />
          <MetricCard
            icon={Zap}
            label="In Progress"
            value={inProgressTasks}
            subtitle={`${tasks.length} total tasks`}
            accent="text-amber-500"
          />
          <MetricCard
            icon={Eye}
            label="In Review"
            value={reviewTasks}
            subtitle={`${doneTasks} completed`}
            accent="text-primary"
          />
          <MetricCard
            icon={ShieldAlert}
            label="Pending Approvals"
            value={approvals.length}
            subtitle={approvals.length > 0 ? "Action required" : "All clear"}
            accent={approvals.length > 0 ? "text-destructive" : "text-emerald-500"}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
          <MetricCard
            icon={DollarSign}
            label="Total Spend"
            value={`$${totalCost.toFixed(2)}`}
            subtitle="Across all tasks"
            accent="text-primary"
          />
          <MetricCard
            icon={CheckCircle2}
            label="Completed"
            value={doneTasks}
            subtitle={`${((doneTasks / Math.max(tasks.length, 1)) * 100).toFixed(0)}% completion rate`}
            accent="text-emerald-500"
          />
          <MetricCard
            icon={AlertTriangle}
            label="Blocked"
            value={blockedTasks}
            subtitle={blockedTasks > 0 ? "Needs attention" : "No blockers"}
            accent={blockedTasks > 0 ? "text-destructive" : "text-emerald-500"}
          />
        </div>

        {/* Agent Squad */}
        {agents.length > 0 && (
          <Card className="p-5 mb-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Agent Squad
                </span>
                <span className="text-[0.6rem] text-muted-foreground/50 ml-1">
                  {activeAgents} active / {agents.length} total
                </span>
              </div>
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
        )}

        {/* Build Queue */}
        {buildTasks.length > 0 && (
          <Card className="p-5 mb-6">
            <div className="flex items-center gap-2 mb-4">
              <Hammer className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Build Queue
              </span>
              <span className="text-[0.6rem] text-muted-foreground/50 ml-1">
                {buildTasks.length} active
              </span>
            </div>
            <div className="space-y-2">
              {buildTasks.slice(0, 8).map((task) => {
                const assignee = task.assigneeIds[0]
                  ? agents.find((a) => a._id === task.assigneeIds[0])
                  : null;
                return (
                  <div
                    key={task._id}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-muted/50 transition-colors"
                  >
                    <Loader2 className="h-3 w-3 text-amber-500 animate-spin shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-foreground/90 truncate">
                        {task.title}
                      </p>
                      <p className="text-[0.6rem] text-muted-foreground/50">
                        {assignee
                          ? `${assignee.emoji ?? "🤖"} ${assignee.name}`
                          : "Unassigned"}
                        {task.startedAt && (
                          <> &middot; {formatElapsed(task.startedAt)}</>
                        )}
                      </p>
                    </div>
                    <span className="text-[0.6rem] uppercase tracking-wider text-amber-500/70 shrink-0">
                      {task.type}
                    </span>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {/* Task Pipeline + Recent Activity */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Task Pipeline
              </span>
            </div>
            <div className="space-y-2">
              {Object.entries(statusCounts).map(([status, count]) => {
                const max = Math.max(...Object.values(statusCounts), 1);
                const pct = (count / max) * 100;
                const statusColors: Record<string, string> = {
                  INBOX: "bg-zinc-500",
                  ASSIGNED: "bg-blue-500",
                  IN_PROGRESS: "bg-amber-500",
                  REVIEW: "bg-blue-500",
                  NEEDS_APPROVAL: "bg-red-500",
                  BLOCKED: "bg-red-600",
                  DONE: "bg-emerald-500",
                  CANCELED: "bg-zinc-600",
                };
                return (
                  <div key={status} className="flex items-center gap-3">
                    <span className="text-xs font-medium text-muted-foreground w-28 shrink-0 uppercase tracking-wider">
                      {status.replace("_", " ")}
                    </span>
                    <div className="flex-1 h-1.5 rounded-full bg-muted">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${statusColors[status] ?? "bg-zinc-500"}`}
                        style={{ width: `${Math.max(pct, count > 0 ? 4 : 0)}%` }}
                      />
                    </div>
                    <span className="text-xs font-medium text-foreground w-6 text-right">
                      {count}
                    </span>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <Activity className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Recent Activity
              </span>
            </div>
            <div className="space-y-1.5 max-h-[260px] overflow-y-auto">
              {activities.slice(0, 8).map((activity) => (
                <div
                  key={activity._id}
                  className="flex items-start gap-3 px-3 py-2.5 rounded-md hover:bg-muted/50 transition-colors"
                >
                  <div className="mt-1">
                    <Clock className="h-3 w-3 text-muted-foreground/50" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-foreground/90 leading-relaxed truncate">
                      {activity.description}
                    </p>
                    <p className="text-xs text-muted-foreground/60 mt-0.5">
                      {activity.actorType} &middot;{" "}
                      {new Date(activity._creationTime).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </div>
              ))}
              {activities.length === 0 && (
                <div className="py-8 text-center text-xs text-muted-foreground">
                  No recent activity
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </main>
  );
}
