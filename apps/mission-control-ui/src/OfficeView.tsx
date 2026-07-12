import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id, Doc } from "../../../convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { PageHeader } from "./components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "./components/factory/badges";
import { MetricBlock } from "./components/factory/MetricBlock";
import { EmptyState } from "@/components/ui/empty-state";
import { Building2, RotateCcw } from "lucide-react";

interface OfficeViewProps {
  projectId: Id<"projects"> | null;
}

type AgentStatusType = "ACTIVE" | "PAUSED" | "DRAINED" | "QUARANTINED" | "OFFLINE";

function getStatusConfig(status: AgentStatusType, hasTask: boolean) {
  switch (status) {
    case "ACTIVE":
      return hasTask
        ? { twText: "text-ok", twBg: "bg-ok", label: "Working" }
        : { twText: "text-info-accent", twBg: "bg-info-accent", label: "Idle" };
    case "PAUSED":
      return { twText: "text-warn", twBg: "bg-warn", label: "Paused" };
    case "DRAINED":
      return { twText: "text-warn", twBg: "bg-warn", label: "Draining" };
    case "QUARANTINED":
      return { twText: "text-err", twBg: "bg-err", label: "Quarantined" };
    case "OFFLINE":
      return { twText: "text-ink-muted", twBg: "bg-ink-muted", label: "Offline" };
    default:
      return { twText: "text-ink-muted", twBg: "bg-ink-muted", label: status };
  }
}

function getHeartbeatAge(lastHeartbeatAt?: number): { text: string; healthy: boolean } {
  if (!lastHeartbeatAt) return { text: "Never", healthy: false };
  const diffMs = Date.now() - lastHeartbeatAt;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return { text: `${diffSec}s ago`, healthy: true };
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return { text: `${diffMin}m ago`, healthy: diffMin < 3 };
  const diffH = Math.floor(diffMin / 60);
  return { text: `${diffH}h ago`, healthy: false };
}

function formatElapsed(startedAt: number): string {
  const diffMs = Date.now() - startedAt;
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just started";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  return remMins > 0 ? `${hours}h ${remMins}m` : `${hours}h`;
}

function getRoleBadge(role: string) {
  switch (role) {
    case "LEAD":
      return { label: "Lead" };
    case "SPECIALIST":
      return { label: "Specialist" };
    case "INTERN":
      return { label: "Intern" };
    default:
      return { label: role };
  }
}

export function OfficeView({ projectId }: OfficeViewProps) {
  const agents = useQuery(api.agents.list, { projectId: projectId ?? undefined });
  const tasks = useQuery(api.tasks.list, { projectId: projectId ?? undefined });
  const resetAllAgents = useMutation(api.agents.resetAll);
  const [selectedAgent, setSelectedAgent] = useState<Id<"agents"> | null>(null);
  const [filterStatus, setFilterStatus] = useState<"ALL" | AgentStatusType>("ALL");
  const [resetting, setResetting] = useState(false);
  const [, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 10_000);
    return () => clearInterval(interval);
  }, []);

  const agentsWithTasks = useMemo(() => {
    if (!agents) return [];
    return agents.map((agent) => {
      const currentTask = agent.currentTaskId
        ? tasks?.find((t) => t._id === agent.currentTaskId)
        : null;
      return { agent, currentTask };
    });
  }, [agents, tasks]);

  const filteredAgents = useMemo(() => {
    const base = filterStatus === "ALL" ? agentsWithTasks : agentsWithTasks.filter((a) => a.agent.status === filterStatus);
    const statusOrder: Record<string, number> = {
      ACTIVE: 0,
      PAUSED: 2,
      DRAINED: 3,
      QUARANTINED: 4,
      OFFLINE: 5,
    };
    return [...base].sort((a, b) => {
      const aWorking = a.agent.status === "ACTIVE" && !!a.currentTask ? -1 : 0;
      const bWorking = b.agent.status === "ACTIVE" && !!b.currentTask ? -1 : 0;
      if (aWorking !== bWorking) return aWorking - bWorking;
      const aOrder = statusOrder[a.agent.status] ?? 9;
      const bOrder = statusOrder[b.agent.status] ?? 9;
      return aOrder - bOrder;
    });
  }, [agentsWithTasks, filterStatus]);

  const stats = useMemo(() => {
    if (!agents) return { total: 0, active: 0, working: 0, idle: 0, paused: 0, offline: 0, quarantined: 0 };
    const active = agents.filter((a) => a.status === "ACTIVE");
    const working = active.filter((a) => a.currentTaskId);
    return {
      total: agents.length,
      active: active.length,
      working: working.length,
      idle: active.length - working.length,
      paused: agents.filter((a) => a.status === "PAUSED").length,
      offline: agents.filter((a) => a.status === "OFFLINE").length,
      quarantined: agents.filter((a) => a.status === "QUARANTINED").length,
    };
  }, [agents]);

  if (!agents) {
    return (
      <main className="relative flex min-h-0 flex-1 flex-col overflow-y-auto bg-app">
        <div className="mx-auto w-full max-w-[1200px] px-6 py-6">
          <div className="h-[640px] animate-pulse rounded-xl border border-line bg-surface-2" />
        </div>
      </main>
    );
  }

  return (
    <main className="relative flex min-h-0 flex-1 flex-col overflow-y-auto bg-app">
      <PageHeader
        title="Office"
        description="Live workstation view for agent posture, task attachment, budget burn, and heartbeat quality."
        eyebrow="Comms"
        icon={<Building2 size={16} strokeWidth={1.7} />}
        status={<StatusBadge tone="neutral">{stats.total} agents</StatusBadge>}
        actions={
          stats.quarantined > 0 ? (
            <Button
              variant="default"
              size="sm"
              onClick={async () => {
                setResetting(true);
                try {
                  await resetAllAgents({ projectId: projectId ?? undefined });
                } catch (err: any) {
                  console.error("Reset all agents failed:", err);
                  alert(err.message || "Failed to reset agents. Please try again.");
                } finally {
                  setResetting(false);
                }
              }}
              disabled={resetting}
            >
              <RotateCcw className="h-4 w-4" />
              {resetting ? "Resetting" : `Reset ${stats.quarantined} quarantined`}
            </Button>
          ) : undefined
        }
      />

      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-6 py-6">
        <div className="grid gap-4 md:grid-cols-4">
          <Card className="p-4">
            <MetricBlock
              label="Working"
              value={stats.working}
              detail="Agents with an active task and healthy execution posture"
            />
          </Card>
          <Card className="p-4">
            <MetricBlock
              label="Idle"
              value={stats.idle}
              detail="Active agents that are waiting on new assignment"
            />
          </Card>
          <Card className="p-4">
            <MetricBlock
              label="Paused / offline"
              value={stats.paused + stats.offline}
              detail="Agents not expected to produce work right now"
            />
          </Card>
          <Card className="p-4">
            <MetricBlock
              label="Quarantined"
              value={stats.quarantined}
              detail="Agents that need explicit recovery before they can rejoin execution"
            />
          </Card>
        </div>

        <Card className="p-4">
          <div className="flex flex-wrap gap-2">
            <StatChip
              label={`All (${stats.total})`}
              value={stats.total}
              colorClass="text-ink-muted"
              dotClass="bg-ink-muted"
              activeBorderClass="border-line-strong"
              activeBgClass="bg-surface-2"
              active={filterStatus === "ALL"}
              onClick={() => setFilterStatus("ALL")}
              hideValue
            />
            <StatChip
              label="Working"
              value={stats.working}
              colorClass="text-ok"
              dotClass="bg-ok"
              activeBorderClass="border-line-strong"
              activeBgClass="bg-surface-2"
              active={filterStatus === "ACTIVE"}
              onClick={() => setFilterStatus(filterStatus === "ACTIVE" ? "ALL" : "ACTIVE")}
            />
            <StatChip
              label="Paused"
              value={stats.paused}
              colorClass="text-warn"
              dotClass="bg-warn"
              activeBorderClass="border-line-strong"
              activeBgClass="bg-surface-2"
              active={filterStatus === "PAUSED"}
              onClick={() => setFilterStatus(filterStatus === "PAUSED" ? "ALL" : "PAUSED")}
            />
            <StatChip
              label="Offline"
              value={stats.offline}
              colorClass="text-ink-muted"
              dotClass="bg-ink-muted"
              activeBorderClass="border-line-strong"
              activeBgClass="bg-surface-2"
              active={filterStatus === "OFFLINE"}
              onClick={() => setFilterStatus(filterStatus === "OFFLINE" ? "ALL" : "OFFLINE")}
            />
            {stats.quarantined > 0 ? (
              <StatChip
                label="Quarantined"
                value={stats.quarantined}
                colorClass="text-err"
                dotClass="bg-err"
                activeBorderClass="border-line-strong"
                activeBgClass="bg-surface-2"
                active={filterStatus === "QUARANTINED"}
                onClick={() => setFilterStatus(filterStatus === "QUARANTINED" ? "ALL" : "QUARANTINED")}
              />
            ) : null}
          </div>
        </Card>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
            {filteredAgents.map(({ agent, currentTask }) => (
              <div key={agent._id}>
                <AgentCard
                  agent={agent}
                  currentTask={currentTask}
                  isSelected={agent._id === selectedAgent}
                  onSelect={() => setSelectedAgent(selectedAgent === agent._id ? null : agent._id)}
                />
              </div>
            ))}

            {filteredAgents.length === 0 ? (
              <div className="col-span-full">
                <EmptyState
                  icon={Building2}
                  title="No agents match this filter"
                  description="Relax the office filter or reactivate the relevant workers to repopulate this workstation view."
                />
              </div>
            ) : null}
          </div>

          <Card className="p-5">
            <h3 className="text-[15px] font-semibold text-ink">Operator guidance</h3>
            <div className="mt-3 space-y-3 text-[13.5px] leading-relaxed text-ink-secondary">
              <div className="rounded-lg border border-line bg-surface-2 px-4 py-4">
                Working and healthy are not the same thing. Use the heartbeat and error posture together before trusting an active agent.
              </div>
              <div className="rounded-lg border border-line bg-surface-2 px-4 py-4">
                Quarantined agents should be treated as a system-design problem first, not just an agent-level problem.
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Detail Panel */}
      {selectedAgent && (
        <AgentDetailPanel
          agentId={selectedAgent}
          projectId={projectId}
          onClose={() => setSelectedAgent(null)}
        />
      )}
    </main>
  );
}

/* ============================================================================
   Stat Chip
   ============================================================================ */

function StatChip({
  label,
  value,
  colorClass,
  dotClass,
  activeBorderClass,
  activeBgClass,
  active,
  onClick,
  hideValue,
}: {
  label: string;
  value: number;
  colorClass: string;
  dotClass: string;
  activeBorderClass: string;
  activeBgClass: string;
  active: boolean;
  onClick?: () => void;
  hideValue?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 px-3 py-1.5 rounded-lg text-[12.5px] transition-colors duration-150",
        active
          ? cn("border text-ink", activeBorderClass, activeBgClass)
          : "border border-line bg-surface-1 text-ink-secondary hover:border-line-strong hover:text-ink",
        onClick ? "cursor-pointer" : "cursor-default"
      )}
    >
      {!hideValue && (
        <span className={cn("w-2 h-2 rounded-full shrink-0", dotClass)} />
      )}
      {!hideValue && <span className="font-semibold tabular-nums">{value}</span>}
      <span className={active ? "text-ink" : "text-ink-secondary"}>{label}</span>
    </button>
  );
}

/* ============================================================================
   Agent Card
   ============================================================================ */

interface AgentCardProps {
  agent: Doc<"agents">;
  currentTask: Doc<"tasks"> | null | undefined;
  isSelected: boolean;
  onSelect: () => void;
}

function AgentCard({ agent, currentTask, isSelected, onSelect }: AgentCardProps) {
  const statusConfig = getStatusConfig(agent.status as AgentStatusType, !!currentTask);
  const roleBadge = getRoleBadge(agent.role);
  const heartbeat = getHeartbeatAge(agent.lastHeartbeatAt);
  const budgetPct = agent.budgetDaily > 0 ? (agent.spendToday / agent.budgetDaily) * 100 : 0;
  const isWorking = agent.status === "ACTIVE" && !!currentTask;

  return (
    <button
      onClick={onSelect}
      className={cn(
        "w-full text-left bg-surface-1 border rounded-xl p-4 cursor-pointer flex flex-col gap-3 transition-colors duration-150",
        isSelected
          ? "border-line-strong bg-surface-2"
          : "border-line hover:border-line-strong"
      )}
    >
      {/* Top Row: Avatar + Name + Status */}
      <div className="flex items-center gap-3">
        {/* Avatar with status dot */}
        <div className="relative">
          <div
            className={cn(
              "w-11 h-11 rounded-full border border-line bg-surface-2 text-ink flex items-center justify-center font-semibold",
              agent.emoji ? "text-xl" : "text-lg"
            )}
          >
            {agent.emoji || agent.name.charAt(0).toUpperCase()}
          </div>
          <div
            className={cn(
              "absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-surface-1",
              statusConfig.twBg
            )}
          />
        </div>

        {/* Name + Role */}
        <div className="flex-1 min-w-0">
          <div className="text-[13.5px] font-semibold text-ink leading-tight">{agent.name}</div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <StatusBadge tone="neutral">{roleBadge.label}</StatusBadge>
            <span className="text-[11.5px] text-ink-secondary">
              {statusConfig.label}
            </span>
          </div>
        </div>
      </div>

      {/* Current Task / Activity */}
      <div className="min-h-[36px]">
        {isWorking && currentTask ? (
          <div className="flex items-start gap-2 p-2 px-2.5 rounded-lg bg-surface-2 border border-line">
            <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-ok shrink-0" aria-hidden />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <div className="text-[11.5px] text-ink-muted mb-0.5">Working on</div>
                {currentTask.startedAt && (
                  <div className="text-[11.5px] text-ink-muted">
                    {formatElapsed(currentTask.startedAt)}
                  </div>
                )}
              </div>
              <div className="text-[12.5px] text-ink font-medium overflow-hidden text-ellipsis whitespace-nowrap">{currentTask.title}</div>
            </div>
          </div>
        ) : agent.status === "ACTIVE" ? (
          <div className="flex items-center gap-1.5 p-2 px-2.5 rounded-lg bg-surface-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="text-ink-muted">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" />
            </svg>
            <span className="text-ink-muted text-[12.5px]">
              Waiting for assignment
            </span>
          </div>
        ) : agent.status === "QUARANTINED" ? (
          <div className="flex items-center gap-1.5 p-2 px-2.5 rounded-lg bg-err-soft">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="text-err">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <span className="text-err text-[12.5px]">
              {agent.lastError || "Unresponsive"}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 p-2 px-2.5 rounded-lg bg-surface-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="text-ink-muted">
              <rect x="6" y="4" width="4" height="16" rx="1" />
              <rect x="14" y="4" width="4" height="16" rx="1" />
            </svg>
            <span className="text-ink-muted text-[12.5px]">
              {agent.status === "PAUSED" ? "Paused" : "Offline"}
            </span>
          </div>
        )}
      </div>

      {/* Bottom: Budget Bar + Heartbeat */}
      <div className="flex flex-col gap-1.5">
        {/* Budget bar */}
        <div>
          <div className="flex justify-between mb-0.5">
            <span className="text-ink-muted text-[11.5px]">Budget</span>
            <span className="text-ink-muted text-[11.5px] font-medium">
              ${agent.spendToday.toFixed(2)} / ${agent.budgetDaily.toFixed(2)}
            </span>
          </div>
          <div className="w-full h-1 rounded-sm bg-surface-3 overflow-hidden">
            <div
              style={{ width: `${Math.min(budgetPct, 100)}%` }}
              className={cn(
                "h-1 rounded-sm transition-[width] duration-150 ease-out",
                budgetPct > 90
                  ? "bg-err"
                  : budgetPct > 70
                    ? "bg-warn"
                    : "bg-ok"
              )}
            />
          </div>
        </div>

        {/* Heartbeat */}
        <div className="flex items-center gap-1.5">
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            className={heartbeat.healthy ? "text-ok" : "text-err"}
          >
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
          </svg>
          <span
            className={cn(
              "text-[11.5px]",
              heartbeat.healthy ? "text-ink-muted" : "text-err"
            )}
          >
            {heartbeat.text}
          </span>
        </div>
      </div>
    </button>
  );
}

/* ============================================================================
   Agent Detail Panel (Slide-in from right)
   ============================================================================ */

function AgentDetailPanel({
  agentId,
  projectId,
  onClose,
}: {
  agentId: Id<"agents">;
  projectId: Id<"projects"> | null;
  onClose: () => void;
}) {
  const agent = useQuery(api.agents.get, { agentId });
  const tasks = useQuery(api.tasks.list, { projectId: projectId ?? undefined });

  if (!agent) return null;

  const currentTask = agent.currentTaskId
    ? tasks?.find((t) => t._id === agent.currentTaskId)
    : null;

  const assignedTasks = tasks?.filter(
    (t) => t.assigneeIds.includes(agentId) && t.status !== "DONE" && t.status !== "CANCELED"
  );

  const statusConfig = getStatusConfig(agent.status as AgentStatusType, !!currentTask);
  const roleBadge = getRoleBadge(agent.role);
  const heartbeat = getHeartbeatAge(agent.lastHeartbeatAt);
  const budgetPct =
    agent.budgetDaily > 0 ? (agent.spendToday / agent.budgetDaily) * 100 : 0;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/45 z-[999]"
      />
      {/* Panel */}
      <div className="fixed top-0 right-0 bottom-0 w-[400px] max-w-[90vw] bg-surface-1 border-l border-line z-[1000] flex flex-col overflow-hidden">
        {/* Panel header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-line shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full border border-line bg-surface-2 text-ink flex items-center justify-center text-xl font-semibold">
              {agent.emoji || agent.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h2 className="m-0 text-[19px] font-semibold text-ink">
                {agent.name}
              </h2>
              <div className="flex items-center gap-2 mt-0.5">
                <StatusBadge tone="neutral">{roleBadge.label}</StatusBadge>
                <span className="flex items-center gap-1 text-[11.5px] text-ink-secondary">
                  <span className={cn("w-[7px] h-[7px] rounded-full", statusConfig.twBg)} />
                  {statusConfig.label}
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg border-none bg-transparent text-ink-muted cursor-pointer flex items-center justify-center transition-colors duration-150 hover:bg-surface-2 hover:text-ink"
            aria-label="Close"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Panel body */}
        <div className="flex-1 overflow-auto p-5 flex flex-col gap-5">
          {/* Current Task */}
          {currentTask && (
            <div>
              <div className="text-[11.5px] font-medium uppercase tracking-[0.06em] text-ink-muted mb-2">Current Task</div>
              <div className="p-2.5 px-3 rounded-lg bg-surface-2 border border-line">
                <div className="text-[13.5px] font-semibold text-ink mb-1">
                  {currentTask.title}
                </div>
                <div className="text-[12.5px] text-ink-muted flex items-center gap-2">
                  <StatusBadge tone="info">{currentTask.status}</StatusBadge>
                  <span>{currentTask.type}</span>
                  {currentTask.estimatedCost != null && (
                    <span>~${currentTask.estimatedCost.toFixed(2)}</span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Details Grid */}
          <div>
            <div className="text-[11.5px] font-medium uppercase tracking-[0.06em] text-ink-muted mb-2">Details</div>
            <div className="flex flex-col">
              <DetailRow label="Workspace" value={agent.workspacePath} />
              <DetailRow
                label="Heartbeat"
                value={heartbeat.text}
                valueClass={heartbeat.healthy ? "text-ok" : "text-err"}
              />
              <DetailRow label="Error Streak" value={String(agent.errorStreak)} />
              {agent.lastError && (
                <DetailRow label="Last Error" value={agent.lastError} valueClass="text-err" />
              )}
              <DetailRow
                label="Can Spawn"
                value={agent.canSpawn ? `Yes (max ${agent.maxSubAgents})` : "No"}
              />
              {agent.allowedTaskTypes.length > 0 && (
                <DetailRow
                  label="Task Types"
                  value={agent.allowedTaskTypes.join(", ")}
                />
              )}
            </div>
          </div>

          {/* Budget */}
          <div>
            <div className="text-[11.5px] font-medium uppercase tracking-[0.06em] text-ink-muted mb-2">Budget</div>
            <div className="p-2.5 px-3 rounded-lg bg-surface-2 border border-line">
              <div className="flex justify-between mb-1.5">
                <span className="text-[13.5px] text-ink-muted">
                  Daily Spend
                </span>
                <span className="text-[13.5px] font-semibold text-ink">
                  ${agent.spendToday.toFixed(2)} / ${agent.budgetDaily.toFixed(2)}
                </span>
              </div>
              <div className="w-full h-1.5 rounded-sm bg-surface-3 overflow-hidden">
                <div
                  className={cn(
                    "h-1.5 rounded-sm transition-[width] duration-150 ease-out",
                    budgetPct > 90
                      ? "bg-err"
                      : budgetPct > 70
                        ? "bg-warn"
                        : "bg-ok"
                  )}
                  style={{ width: `${Math.min(budgetPct, 100)}%` }}
                />
              </div>
              <div className="flex justify-between mt-2 text-[11.5px] text-ink-muted">
                <span>Per-run limit: ${agent.budgetPerRun.toFixed(2)}</span>
                <span>{budgetPct.toFixed(0)}% used</span>
              </div>
            </div>
          </div>

          {/* Assigned Tasks */}
          {assignedTasks && assignedTasks.length > 0 && (
            <div>
              <div className="text-[11.5px] font-medium uppercase tracking-[0.06em] text-ink-muted mb-2">
                Assigned Tasks ({assignedTasks.length})
              </div>
              <div className="flex flex-col gap-1.5">
                {assignedTasks.slice(0, 8).map((t) => (
                  <div key={t._id} className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-surface-2 border border-line">
                    <span
                      className={cn(
                        "w-1.5 h-1.5 rounded-full shrink-0",
                        t.status === "IN_PROGRESS"
                          ? "bg-ok"
                          : t.status === "BLOCKED"
                            ? "bg-err"
                            : "bg-info-accent"
                      )}
                    />
                    <span className="flex-1 text-[12.5px] text-ink overflow-hidden text-ellipsis whitespace-nowrap">
                      {t.title}
                    </span>
                    <span className="text-[11.5px] text-ink-muted shrink-0">
                      {t.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/* ============================================================================
   Small Components
   ============================================================================ */

function DetailRow({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex justify-between items-center py-[7px] border-b border-line">
      <span className="text-[12.5px] text-ink-muted">{label}</span>
      <span
        className={cn(
          "text-[12.5px] font-medium text-right max-w-[60%] overflow-hidden text-ellipsis whitespace-nowrap",
          valueClass ?? "text-ink"
        )}
      >
        {value}
      </span>
    </div>
  );
}
