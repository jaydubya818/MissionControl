import { useMemo } from "react";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import {
  Radar,
  Bot,
  PlusCircle,
  Play,
  Rocket,
  ScanSearch,
  HeartPulse,
  type LucideIcon,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface FleetPreviewProps {
  agents: Doc<"agents">[];
  tasks: Doc<"tasks">[];
  onSelectAgent?: (agentId: Id<"agents">) => void;
  onRegisterAgent?: () => void;
  onResumeFleet?: () => void;
  onLaunchTask?: () => void;
  onInspectFleet?: () => void;
  className?: string;
}

const AGENT_STATUS_META: Record<
  string,
  { label: string; dot: string; text: string }
> = {
  ACTIVE: { label: "Active", dot: "bg-emerald-400", text: "text-emerald-200" },
  PAUSED: { label: "Paused", dot: "bg-amber-400", text: "text-amber-200" },
  DRAINED: { label: "Drained", dot: "bg-zinc-400", text: "text-zinc-300" },
  QUARANTINED: { label: "Quarantined", dot: "bg-red-400", text: "text-red-300" },
  OFFLINE: { label: "Offline", dot: "bg-zinc-500", text: "text-zinc-400" },
};

function heartbeatLabel(lastHeartbeatAt: number | undefined): { label: string; stale: boolean } {
  if (!lastHeartbeatAt) return { label: "No heartbeat", stale: true };
  const deltaMs = Date.now() - lastHeartbeatAt;
  const minutes = Math.floor(deltaMs / 60_000);
  if (minutes < 1) return { label: "Just now", stale: false };
  if (minutes < 60) return { label: `${minutes}m ago`, stale: minutes > 10 };
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { label: `${hours}h ago`, stale: true };
  return { label: `${Math.floor(hours / 24)}d ago`, stale: true };
}

function EmptyAction({
  icon: Icon,
  label,
  detail,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  detail: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        "group flex flex-col items-start gap-1.5 rounded-xl border border-[var(--panel-line)] bg-[color:var(--shell-panel)] px-3.5 py-3 text-left transition-all duration-150",
        onClick
          ? "cursor-pointer hover:border-cyan-300/25 hover:bg-cyan-400/6 hover:shadow-[var(--card-shadow-hover)]"
          : "opacity-60"
      )}
    >
      <span className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
        <Icon
          className="h-3.5 w-3.5 text-cyan-200/80 transition-transform duration-150 group-hover:scale-110"
          strokeWidth={1.7}
        />
        {label}
      </span>
      <span className="text-[11px] leading-relaxed text-muted-foreground">{detail}</span>
    </button>
  );
}

export function FleetPreview({
  agents,
  tasks,
  onSelectAgent,
  onRegisterAgent,
  onResumeFleet,
  onLaunchTask,
  onInspectFleet,
  className,
}: FleetPreviewProps) {
  const taskById = useMemo(() => {
    const map = new Map<string, Doc<"tasks">>();
    for (const task of tasks) map.set(task._id, task);
    return map;
  }, [tasks]);

  const runningAgents = agents.filter((a) => a.status === "ACTIVE");
  const hasPausedAgents = agents.some((a) => a.status === "PAUSED" || a.status === "DRAINED");

  // ── Empty / idle state ─────────────────────────────────────────────────────
  if (runningAgents.length === 0) {
    return (
      <Card className={cn("mb-6 overflow-hidden", className)}>
        <div className="relative">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(103,232,249,0.07),transparent_38%)]" />
          <div className="relative px-5 py-5">
            <div className="flex items-start gap-3">
              <div className="relative mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[var(--panel-line-strong)] bg-[color:var(--shell-panel)] text-muted-foreground">
                <Radar className="h-4.5 w-4.5" strokeWidth={1.6} />
                <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-zinc-500/80 ring-2 ring-[color:var(--background)]" />
              </div>
              <div className="min-w-0">
                <div className="mc-kicker">Agent fleet</div>
                <div className="mt-1 font-[family:var(--font-display)] text-base font-semibold text-foreground">
                  No agents are currently running
                </div>
                <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                  {agents.length > 0
                    ? `${agents.length} agent${agents.length === 1 ? " is" : "s are"} registered but idle. Resume the fleet or launch a task to begin execution.`
                    : "Connect Cursor, Claude Code, Codex, or custom agents to start running autonomous workstreams."}
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
              <EmptyAction
                icon={PlusCircle}
                label="Register Agent"
                detail="Add a Cursor, Claude Code, Codex, or custom runtime."
                onClick={onRegisterAgent}
              />
              <EmptyAction
                icon={Play}
                label="Resume Fleet"
                detail={
                  hasPausedAgents
                    ? "Bring paused agents back online."
                    : "No paused agents to resume yet."
                }
                onClick={hasPausedAgents ? onResumeFleet : undefined}
              />
              <EmptyAction
                icon={Rocket}
                label="Launch Task"
                detail="Queue work so agents have something to claim."
                onClick={onLaunchTask}
              />
              <EmptyAction
                icon={ScanSearch}
                label="Inspect Fleet"
                detail="Review registered agents, budgets, and health."
                onClick={onInspectFleet}
              />
            </div>
          </div>
        </div>
      </Card>
    );
  }

  // ── Active fleet preview ───────────────────────────────────────────────────
  return (
    <Card className={cn("mb-6 overflow-hidden", className)}>
      <div className="flex items-center justify-between gap-2 border-b border-[var(--panel-line)] px-4 py-3">
        <div className="flex items-center gap-2">
          <Radar className="h-3.5 w-3.5 text-cyan-200/80" strokeWidth={1.7} />
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Agent fleet
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300/25 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-200">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
            {runningAgents.length} running
          </span>
        </div>
        {onInspectFleet && (
          <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-[11px] text-muted-foreground" onClick={onInspectFleet}>
            <ScanSearch className="h-3 w-3" strokeWidth={1.7} />
            Inspect fleet
          </Button>
        )}
      </div>
      <div className="divide-y divide-[var(--panel-line)]">
        {agents.slice(0, 6).map((agent) => {
          const meta = AGENT_STATUS_META[agent.status] ?? AGENT_STATUS_META.OFFLINE;
          const currentTask = agent.currentTaskId ? taskById.get(agent.currentTaskId) : undefined;
          const heartbeat = heartbeatLabel(agent.lastHeartbeatAt);
          return (
            <button
              key={agent._id}
              type="button"
              onClick={() => onSelectAgent?.(agent._id)}
              className="grid w-full grid-cols-[auto_minmax(0,1.2fr)_minmax(0,1.6fr)_auto_auto] items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-white/[0.03]"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--panel-line)] bg-[color:var(--shell-panel)] text-sm">
                {agent.emoji ?? <Bot className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.7} />}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-semibold text-foreground">
                  {agent.name}
                </span>
                <span className="block truncate text-[11px] uppercase tracking-[0.12em] text-muted-foreground/70">
                  {agent.role}
                </span>
              </span>
              <span className="hidden min-w-0 truncate text-[12px] text-muted-foreground md:block">
                {currentTask ? currentTask.title : "Idle — awaiting assignment"}
              </span>
              <span className={cn("hidden items-center gap-1.5 text-[11px] sm:flex", heartbeat.stale ? "text-amber-200/80" : "text-muted-foreground")}>
                <HeartPulse className="h-3 w-3" strokeWidth={1.8} />
                {heartbeat.label}
              </span>
              <span className={cn("flex items-center gap-1.5 text-[11px] font-semibold", meta.text)}>
                <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
                {meta.label}
              </span>
            </button>
          );
        })}
      </div>
      {agents.length > 6 && (
        <div className="border-t border-[var(--panel-line)] px-4 py-2 text-center text-[11px] text-muted-foreground">
          +{agents.length - 6} more in fleet
        </div>
      )}
    </Card>
  );
}
