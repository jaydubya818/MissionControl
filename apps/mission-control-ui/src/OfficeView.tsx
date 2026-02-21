import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { motion, AnimatePresence } from "framer-motion";
import type { Id, Doc } from "../../../convex/_generated/dataModel";
import { cn } from "@/lib/utils";

interface OfficeViewProps {
  projectId: Id<"projects"> | null;
}

type AgentStatusType = "ACTIVE" | "PAUSED" | "DRAINED" | "QUARANTINED" | "OFFLINE";

function getStatusConfig(status: AgentStatusType, hasTask: boolean) {
  switch (status) {
    case "ACTIVE":
      return hasTask
        ? { twText: "text-emerald-400", twBg: "bg-emerald-500", twBorder: "border-emerald-500", twBgFaint: "bg-emerald-500/20", label: "Working", glow: true, pulse: true }
        : { twText: "text-blue-400", twBg: "bg-blue-500", twBorder: "border-blue-500", twBgFaint: "bg-blue-500/20", label: "Idle", glow: false, pulse: false };
    case "PAUSED":
      return { twText: "text-amber-400", twBg: "bg-amber-500", twBorder: "border-amber-500", twBgFaint: "bg-amber-500/20", label: "Paused", glow: false, pulse: false };
    case "DRAINED":
      return { twText: "text-amber-400", twBg: "bg-amber-500", twBorder: "border-amber-500", twBgFaint: "bg-amber-500/20", label: "Draining", glow: false, pulse: false };
    case "QUARANTINED":
      return { twText: "text-red-400", twBg: "bg-red-500", twBorder: "border-red-500", twBgFaint: "bg-red-500/20", label: "Quarantined", glow: true, pulse: true };
    case "OFFLINE":
      return { twText: "text-muted-foreground", twBg: "bg-muted-foreground", twBorder: "border-muted-foreground", twBgFaint: "bg-muted-foreground/20", label: "Offline", glow: false, pulse: false };
    default:
      return { twText: "text-muted-foreground", twBg: "bg-muted-foreground", twBorder: "border-muted-foreground", twBgFaint: "bg-muted-foreground/20", label: status, glow: false, pulse: false };
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
      return { twBg: "bg-blue-500/15", twText: "text-blue-400", label: "Lead" };
    case "SPECIALIST":
      return { twBg: "bg-blue-500/15", twText: "text-blue-400", label: "Specialist" };
    case "INTERN":
      return { twBg: "bg-cyan-500/15", twText: "text-cyan-400", label: "Intern" };
    default:
      return { twBg: "bg-muted", twText: "text-muted-foreground", label: role };
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
      <main className="flex-1 overflow-auto bg-background p-6">
        <div className="flex flex-col items-center justify-center h-full">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
            className="w-7 h-7 border-3 border-border border-t-primary rounded-full"
          />
          <div className="text-muted-foreground mt-3">Loading office...</div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 overflow-auto bg-background p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground m-0">Agent Office</h1>
            <p className="text-sm text-muted-foreground mt-0.5 mb-0">Real-time agent workstation view</p>
          </div>
          {stats.quarantined > 0 && (
            <button
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
              className={cn(
                "px-4 py-2 text-xs font-semibold border-none rounded-lg text-white cursor-pointer transition-opacity whitespace-nowrap self-start",
                resetting ? "bg-muted-foreground cursor-not-allowed" : "bg-emerald-500"
              )}
            >
              {resetting ? "Resetting..." : `Reset ${stats.quarantined} Quarantined`}
            </button>
          )}
        </div>

        {/* Stats Row */}
        <div className="flex gap-2 flex-wrap">
          <StatChip
            label={`All (${stats.total})`}
            value={stats.total}
            colorClass="text-muted-foreground"
            dotClass="bg-muted-foreground"
            activeBorderClass="border-muted-foreground"
            activeBgClass="bg-muted-foreground/15"
            active={filterStatus === "ALL"}
            onClick={() => setFilterStatus("ALL")}
            hideValue
          />
          <span className="w-px h-5 bg-border shrink-0" />
          <StatChip
            label="Working"
            value={stats.working}
            colorClass="text-emerald-400"
            dotClass="bg-emerald-500"
            activeBorderClass="border-emerald-500"
            activeBgClass="bg-emerald-500/15"
            active={filterStatus === "ACTIVE"}
            onClick={() => setFilterStatus(filterStatus === "ACTIVE" ? "ALL" : "ACTIVE")}
          />
          <StatChip
            label="Idle"
            value={stats.idle}
            colorClass="text-blue-400"
            dotClass="bg-blue-500"
            activeBorderClass="border-blue-500"
            activeBgClass="bg-blue-500/15"
            active={false}
          />
          <StatChip
            label="Paused"
            value={stats.paused}
            colorClass="text-amber-400"
            dotClass="bg-amber-500"
            activeBorderClass="border-amber-500"
            activeBgClass="bg-amber-500/15"
            active={filterStatus === "PAUSED"}
            onClick={() => setFilterStatus(filterStatus === "PAUSED" ? "ALL" : "PAUSED")}
          />
          <StatChip
            label="Offline"
            value={stats.offline}
            colorClass="text-muted-foreground"
            dotClass="bg-muted-foreground"
            activeBorderClass="border-muted-foreground"
            activeBgClass="bg-muted-foreground/15"
            active={filterStatus === "OFFLINE"}
            onClick={() => setFilterStatus(filterStatus === "OFFLINE" ? "ALL" : "OFFLINE")}
          />
          {stats.quarantined > 0 && (
            <StatChip
              label="Quarantined"
              value={stats.quarantined}
              colorClass="text-red-400"
              dotClass="bg-red-500"
              activeBorderClass="border-red-500"
              activeBgClass="bg-red-500/15"
              active={filterStatus === "QUARANTINED"}
              onClick={() =>
                setFilterStatus(filterStatus === "QUARANTINED" ? "ALL" : "QUARANTINED")
              }
            />
          )}
        </div>
      </div>

      {/* Agent Grid */}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
        <AnimatePresence mode="popLayout">
          {filteredAgents.map(({ agent, currentTask }) => (
            <motion.div
              key={agent._id}
              layout
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.25 }}
            >
              <AgentCard
                agent={agent}
                currentTask={currentTask}
                isSelected={agent._id === selectedAgent}
                onSelect={() =>
                  setSelectedAgent(selectedAgent === agent._id ? null : agent._id)
                }
              />
            </motion.div>
          ))}
        </AnimatePresence>

        {filteredAgents.length === 0 && (
          <div className="col-span-full flex flex-col items-center justify-center py-16 px-5">
            <span className="text-2xl">&#128373;</span>
            <p className="text-muted-foreground mt-2 mb-0">
              No agents match the current filter
            </p>
          </div>
        )}
      </div>

      {/* Detail Panel */}
      <AnimatePresence>
        {selectedAgent && (
          <AgentDetailPanel
            agentId={selectedAgent}
            projectId={projectId}
            onClose={() => setSelectedAgent(null)}
          />
        )}
      </AnimatePresence>
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
        "flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-inherit transition-all text-foreground",
        active
          ? cn("border-[1.5px]", activeBorderClass, activeBgClass)
          : "border border-border bg-card",
        onClick ? "cursor-pointer" : "cursor-default"
      )}
    >
      {!hideValue && (
        <span className={cn("w-2 h-2 rounded-full shrink-0", dotClass)} />
      )}
      {!hideValue && <span className="font-semibold">{value}</span>}
      <span className={active ? "text-foreground" : "text-muted-foreground"}>{label}</span>
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
    <motion.button
      onClick={onSelect}
      whileHover={{ y: -3, transition: { duration: 0.15 } }}
      whileTap={{ scale: 0.98 }}
      className={cn(
        "w-full text-left bg-card border rounded-xl p-4 cursor-pointer font-inherit flex flex-col gap-3 transition-[border-color,box-shadow]",
        isSelected
          ? "border-primary shadow-[0_0_0_1px_hsl(var(--primary)),0_4px_20px_hsl(var(--primary)/0.12)]"
          : isWorking
            ? "border-emerald-500/30 shadow-[0_0_20px_rgba(16,185,129,0.07),0_2px_8px_rgba(0,0,0,0.25)] border-l-[3px] border-l-emerald-500"
            : "border-border shadow-[0_2px_8px_rgba(0,0,0,0.2)]"
      )}
    >
      {/* Top Row: Avatar + Name + Status */}
      <div className="flex items-center gap-3">
        {/* Avatar with status ring */}
        <div className="relative">
          {statusConfig.pulse && (
            <motion.div
              animate={{ scale: [1, 1.5], opacity: [0.5, 0] }}
              transition={{ repeat: Infinity, duration: 1.8, ease: "easeOut" }}
              className={cn("absolute -inset-[3px] rounded-full border-2", statusConfig.twBorder)}
            />
          )}
          <div
            className={cn(
              "w-11 h-11 rounded-full border-2 flex items-center justify-center font-bold relative z-[1]",
              statusConfig.twBgFaint,
              statusConfig.twBorder,
              statusConfig.twText,
              agent.emoji ? "text-xl" : "text-lg"
            )}
          >
            {agent.emoji || agent.name.charAt(0).toUpperCase()}
          </div>
          <div
            className={cn(
              "absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-card z-[2]",
              statusConfig.twBg
            )}
          />
        </div>

        {/* Name + Role */}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-foreground leading-tight">{agent.name}</div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span
              className={cn(
                "px-1.5 py-px rounded-lg text-[0.65rem] font-semibold tracking-wide",
                roleBadge.twBg,
                roleBadge.twText
              )}
            >
              {roleBadge.label}
            </span>
            <span className={cn("text-[0.7rem] font-semibold", statusConfig.twText)}>
              {statusConfig.label}
            </span>
          </div>
        </div>
      </div>

      {/* Current Task / Activity */}
      <div className="min-h-[36px]">
        {isWorking && currentTask ? (
          <div className="flex items-start gap-2 p-2 px-2.5 rounded-lg bg-emerald-500/5 border border-emerald-500/10">
            <div className="flex gap-[3px] pt-1 shrink-0">
              <motion.span
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ repeat: Infinity, duration: 1.2, delay: 0 }}
                className="w-1 h-1 rounded-full bg-emerald-500"
              />
              <motion.span
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ repeat: Infinity, duration: 1.2, delay: 0.2 }}
                className="w-1 h-1 rounded-full bg-emerald-500"
              />
              <motion.span
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ repeat: Infinity, duration: 1.2, delay: 0.4 }}
                className="w-1 h-1 rounded-full bg-emerald-500"
              />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <div className="text-[0.6rem] text-emerald-400 font-semibold uppercase tracking-wider mb-0.5">Working on</div>
                {currentTask.startedAt && (
                  <div className="text-[0.6rem] text-muted-foreground">
                    {formatElapsed(currentTask.startedAt)}
                  </div>
                )}
              </div>
              <div className="text-[0.78rem] text-foreground font-medium overflow-hidden text-ellipsis whitespace-nowrap">{currentTask.title}</div>
              <div className="mt-1 rounded-sm h-0.5 bg-emerald-500/10 overflow-hidden">
                <motion.div
                  animate={{ x: ["-100%", "200%"] }}
                  transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                  className="w-2/5 h-full bg-emerald-500/30 rounded-sm"
                />
              </div>
            </div>
          </div>
        ) : agent.status === "ACTIVE" ? (
          <div className="flex items-center gap-1.5 p-2 px-2.5 rounded-lg bg-muted-foreground/5">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted-foreground">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" />
            </svg>
            <span className="text-muted-foreground text-xs">
              Waiting for assignment
            </span>
          </div>
        ) : agent.status === "QUARANTINED" ? (
          <div className="flex items-center gap-1.5 p-2 px-2.5 rounded-lg bg-red-500/5">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-red-400">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <span className="text-red-400 text-xs">
              {agent.lastError || "Unresponsive"}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 p-2 px-2.5 rounded-lg bg-muted-foreground/5">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted-foreground">
              <rect x="6" y="4" width="4" height="16" rx="1" />
              <rect x="14" y="4" width="4" height="16" rx="1" />
            </svg>
            <span className="text-muted-foreground text-xs">
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
            <span className="text-muted-foreground text-[0.65rem]">Budget</span>
            <span className="text-muted-foreground text-[0.65rem] font-medium">
              ${agent.spendToday.toFixed(2)} / ${agent.budgetDaily.toFixed(2)}
            </span>
          </div>
          <div className="w-full h-1 rounded-sm bg-muted-foreground/20 overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(budgetPct, 100)}%` }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              className={cn(
                "h-1 rounded-sm transition-[width] duration-600 ease-out",
                budgetPct > 90
                  ? "bg-red-500"
                  : budgetPct > 70
                    ? "bg-amber-500"
                    : "bg-emerald-500"
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
            strokeWidth="2"
            className={heartbeat.healthy ? "text-emerald-400" : "text-red-400"}
          >
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
          </svg>
          <span
            className={cn(
              "text-[0.65rem]",
              heartbeat.healthy ? "text-muted-foreground" : "text-red-400"
            )}
          >
            {heartbeat.text}
          </span>
        </div>
      </div>
    </motion.button>
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
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-black/45 z-[999]"
      />
      {/* Panel */}
      <motion.div
        initial={{ x: 420 }}
        animate={{ x: 0 }}
        exit={{ x: 420 }}
        transition={{ type: "spring", damping: 28, stiffness: 300 }}
        className="fixed top-0 right-0 bottom-0 w-[400px] max-w-[90vw] bg-background border-l border-border z-[1000] flex flex-col overflow-hidden"
      >
        {/* Panel header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "w-12 h-12 rounded-full border-2 flex items-center justify-center text-xl font-bold",
                statusConfig.twBgFaint,
                statusConfig.twBorder,
                statusConfig.twText
              )}
            >
              {agent.emoji || agent.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h2 className="m-0 text-xl font-bold text-foreground">
                {agent.name}
              </h2>
              <div className="flex items-center gap-2 mt-0.5">
                <span
                  className={cn(
                    "px-2 py-px rounded-lg text-[0.7rem] font-semibold",
                    roleBadge.twBg,
                    roleBadge.twText
                  )}
                >
                  {roleBadge.label}
                </span>
                <span className={cn("flex items-center gap-1 text-xs font-semibold", statusConfig.twText)}>
                  <span className={cn("w-[7px] h-[7px] rounded-full", statusConfig.twBg)} />
                  {statusConfig.label}
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg border-none bg-transparent text-muted-foreground cursor-pointer flex items-center justify-center transition-colors hover:bg-muted"
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
              <div className="text-[0.7rem] font-bold text-muted-foreground uppercase tracking-wider mb-2">Current Task</div>
              <div className="p-2.5 px-3 rounded-lg bg-card border border-border">
                <div className="text-sm font-semibold text-foreground mb-1">
                  {currentTask.title}
                </div>
                <div className="text-xs text-muted-foreground flex items-center gap-2">
                  <span className="px-1.5 py-px rounded bg-emerald-500/20 text-emerald-400 text-[0.65rem] font-semibold">
                    {currentTask.status}
                  </span>
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
            <div className="text-[0.7rem] font-bold text-muted-foreground uppercase tracking-wider mb-2">Details</div>
            <div className="flex flex-col">
              <DetailRow label="Workspace" value={agent.workspacePath} />
              <DetailRow
                label="Heartbeat"
                value={heartbeat.text}
                valueClass={heartbeat.healthy ? "text-emerald-400" : "text-red-400"}
              />
              <DetailRow label="Error Streak" value={String(agent.errorStreak)} />
              {agent.lastError && (
                <DetailRow label="Last Error" value={agent.lastError} valueClass="text-red-400" />
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
            <div className="text-[0.7rem] font-bold text-muted-foreground uppercase tracking-wider mb-2">Budget</div>
            <div className="p-2.5 px-3 rounded-lg bg-card border border-border">
              <div className="flex justify-between mb-1.5">
                <span className="text-sm text-muted-foreground">
                  Daily Spend
                </span>
                <span className="text-sm font-semibold text-foreground">
                  ${agent.spendToday.toFixed(2)} / ${agent.budgetDaily.toFixed(2)}
                </span>
              </div>
              <div className="w-full h-1.5 rounded-sm bg-muted-foreground/20 overflow-hidden">
                <div
                  className={cn(
                    "h-1.5 rounded-sm transition-[width] duration-600 ease-out",
                    budgetPct > 90
                      ? "bg-red-500"
                      : budgetPct > 70
                        ? "bg-amber-500"
                        : "bg-emerald-500"
                  )}
                  style={{ width: `${Math.min(budgetPct, 100)}%` }}
                />
              </div>
              <div className="flex justify-between mt-2 text-[0.7rem] text-muted-foreground">
                <span>Per-run limit: ${agent.budgetPerRun.toFixed(2)}</span>
                <span>{budgetPct.toFixed(0)}% used</span>
              </div>
            </div>
          </div>

          {/* Assigned Tasks */}
          {assignedTasks && assignedTasks.length > 0 && (
            <div>
              <div className="text-[0.7rem] font-bold text-muted-foreground uppercase tracking-wider mb-2">
                Assigned Tasks ({assignedTasks.length})
              </div>
              <div className="flex flex-col gap-1.5">
                {assignedTasks.slice(0, 8).map((t) => (
                  <div key={t._id} className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-card border border-border">
                    <span
                      className={cn(
                        "w-1.5 h-1.5 rounded-full shrink-0",
                        t.status === "IN_PROGRESS"
                          ? "bg-emerald-500"
                          : t.status === "BLOCKED"
                            ? "bg-red-500"
                            : "bg-blue-500"
                      )}
                    />
                    <span className="flex-1 text-xs text-foreground overflow-hidden text-ellipsis whitespace-nowrap">
                      {t.title}
                    </span>
                    <span className="text-[0.6rem] text-muted-foreground shrink-0">
                      {t.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </motion.div>
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
    <div className="flex justify-between items-center py-[7px] border-b border-border">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span
        className={cn(
          "text-xs font-medium text-right max-w-[60%] overflow-hidden text-ellipsis whitespace-nowrap",
          valueClass ?? "text-foreground"
        )}
      >
        {value}
      </span>
    </div>
  );
}
