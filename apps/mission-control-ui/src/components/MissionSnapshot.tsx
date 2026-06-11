import { useMemo } from "react";
import type { Doc } from "../../../../convex/_generated/dataModel";
import {
  Target,
  Radar,
  ShieldAlert,
  OctagonAlert,
  Compass,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

type SnapshotTone = "ok" | "info" | "warn" | "critical" | "idle";

const TONE_STYLES: Record<SnapshotTone, { icon: string; value: string; bar: string }> = {
  ok: {
    icon: "border-emerald-300/25 bg-emerald-400/10 text-emerald-200",
    value: "text-emerald-200",
    bar: "bg-emerald-300/60",
  },
  info: {
    icon: "border-cyan-300/25 bg-cyan-400/10 text-cyan-200",
    value: "text-cyan-100",
    bar: "bg-cyan-300/60",
  },
  warn: {
    icon: "border-amber-300/25 bg-amber-400/10 text-amber-200",
    value: "text-amber-200",
    bar: "bg-amber-300/60",
  },
  critical: {
    icon: "border-red-400/25 bg-red-500/10 text-red-300",
    value: "text-red-300",
    bar: "bg-red-400/60",
  },
  idle: {
    icon: "border-[var(--panel-line-strong)] bg-[color:var(--shell-panel)] text-muted-foreground",
    value: "text-foreground/85",
    bar: "bg-zinc-500/40",
  },
};

interface SnapshotCard {
  id: string;
  label: string;
  icon: LucideIcon;
  value: string;
  detail: string;
  tone: SnapshotTone;
  onClick?: () => void;
}

interface MissionSnapshotProps {
  hasMission: boolean;
  agents: Doc<"agents">[];
  tasks: Doc<"tasks">[];
  approvals: Doc<"approvals">[];
  onOpenMission?: () => void;
  onOpenFleet?: () => void;
  onOpenApprovals?: () => void;
  onOpenTasks?: () => void;
  className?: string;
}

export function MissionSnapshot({
  hasMission,
  agents,
  tasks,
  approvals,
  onOpenMission,
  onOpenFleet,
  onOpenApprovals,
  onOpenTasks,
  className,
}: MissionSnapshotProps) {
  const cards = useMemo<SnapshotCard[]>(() => {
    const activeAgents = agents.filter((a) => a.status === "ACTIVE").length;
    const quarantined = agents.filter((a) => a.status === "QUARANTINED").length;
    const running = tasks.filter((t) => t.status === "IN_PROGRESS").length;
    const blocked = tasks.filter((t) => t.status === "BLOCKED").length;
    const failed = tasks.filter((t) => t.status === "FAILED").length;
    const needsApproval = tasks.filter((t) => t.status === "NEEDS_APPROVAL").length;
    const gates = approvals.length + needsApproval;

    // Mission status
    const missionStatus: SnapshotCard = {
      id: "mission",
      label: "Mission status",
      icon: Target,
      value: hasMission ? (running > 0 ? "Executing" : "Standing by") : "Not defined",
      detail: hasMission
        ? running > 0
          ? `${running} task${running === 1 ? "" : "s"} in flight under the mission.`
          : "Mission set. No live execution yet."
        : "Define the mission before launching autonomous work.",
      tone: hasMission ? (running > 0 ? "ok" : "info") : "warn",
      onClick: onOpenMission,
    };

    // Fleet readiness
    const fleetReadiness: SnapshotCard = {
      id: "fleet",
      label: "Fleet readiness",
      icon: Radar,
      value:
        agents.length === 0
          ? "No fleet"
          : quarantined > 0
            ? "Degraded"
            : activeAgents > 0
              ? `${activeAgents}/${agents.length} ready`
              : "All idle",
      detail:
        agents.length === 0
          ? "Register or resume agents to begin execution."
          : quarantined > 0
            ? `${quarantined} agent${quarantined === 1 ? "" : "s"} quarantined — review before resuming.`
            : activeAgents > 0
              ? "Fleet reporting heartbeats and accepting work."
              : "Agents registered but none are active.",
      tone:
        agents.length === 0 ? "idle" : quarantined > 0 ? "critical" : activeAgents > 0 ? "ok" : "warn",
      onClick: onOpenFleet,
    };

    // Pending human gates
    const humanGates: SnapshotCard = {
      id: "gates",
      label: "Pending human gates",
      icon: ShieldAlert,
      value: gates === 0 ? "Clear" : `${gates} waiting`,
      detail:
        gates === 0
          ? "No decisions are blocking autonomous progress."
          : "Approval gates protect risky actions before they reach production.",
      tone: gates === 0 ? "ok" : "warn",
      onClick: onOpenApprovals,
    };

    // Current bottleneck
    const bottleneck: SnapshotCard = {
      id: "bottleneck",
      label: "Current bottleneck",
      icon: OctagonAlert,
      value:
        failed > 0
          ? `${failed} failed`
          : blocked > 0
            ? `${blocked} blocked`
            : gates > 0
              ? "Approvals"
              : "None",
      detail:
        failed > 0
          ? "Failed runs need triage before the pipeline can trust itself."
          : blocked > 0
            ? "Blocked tasks are holding downstream work."
            : gates > 0
              ? "Operator review is the slowest link right now."
              : "Pipeline is unobstructed.",
      tone: failed > 0 ? "critical" : blocked > 0 ? "warn" : gates > 0 ? "info" : "ok",
      onClick: onOpenTasks,
    };

    // Recommended next action
    const nextAction: SnapshotCard = {
      id: "next",
      label: "Next best action",
      icon: Compass,
      value: !hasMission
        ? "Set mission"
        : agents.length === 0
          ? "Connect fleet"
          : gates > 0
            ? "Review gates"
            : failed > 0 || blocked > 0
              ? "Clear blockers"
              : tasks.length === 0
                ? "Seed tasks"
                : "Monitor",
      detail: !hasMission
        ? "Define the mission to initialize the execution graph."
        : agents.length === 0
          ? "Register Cursor, Claude Code, Codex, or custom agents."
          : gates > 0
            ? `${gates} decision${gates === 1 ? "" : "s"} need operator review.`
            : failed > 0 || blocked > 0
              ? "Resolve failed and blocked work to restore flow."
              : tasks.length === 0
                ? "Seed the queue so the system does not stall."
                : "System healthy. Watch throughput and spend.",
      tone: !hasMission || agents.length === 0 ? "warn" : gates > 0 ? "info" : "ok",
      onClick: !hasMission
        ? onOpenMission
        : agents.length === 0
          ? onOpenFleet
          : gates > 0
            ? onOpenApprovals
            : onOpenTasks,
    };

    return [missionStatus, fleetReadiness, humanGates, bottleneck, nextAction];
  }, [hasMission, agents, tasks, approvals, onOpenMission, onOpenFleet, onOpenApprovals, onOpenTasks]);

  return (
    <section className={cn("mb-6", className)} aria-label="Mission snapshot">
      <div className="mb-2.5 flex items-center gap-2">
        <span className="mc-kicker">Mission snapshot</span>
        <span className="h-px flex-1 bg-[var(--panel-line)]" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {cards.map((card) => {
          const tone = TONE_STYLES[card.tone];
          const Icon = card.icon;
          const interactive = !!card.onClick;
          return (
            <button
              key={card.id}
              type="button"
              onClick={card.onClick}
              disabled={!interactive}
              className={cn(
                "group relative overflow-hidden rounded-2xl border border-[var(--panel-line)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--shell-panel)_96%,transparent),color-mix(in_srgb,var(--background)_90%,transparent))] px-4 py-3.5 text-left shadow-[var(--card-shadow)] transition-all duration-200",
                interactive &&
                  "cursor-pointer hover:border-[var(--panel-line-strong)] hover:shadow-[var(--card-shadow-hover)]"
              )}
            >
              <span className={cn("absolute inset-x-4 top-0 h-[2px] rounded-b-full", tone.bar)} />
              <div className="flex items-center gap-2.5">
                <div
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border",
                    tone.icon
                  )}
                >
                  <Icon className="h-3.5 w-3.5" strokeWidth={1.7} />
                </div>
                <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {card.label}
                </span>
              </div>
              <div className={cn("mt-2.5 font-[family:var(--font-display)] text-base font-semibold", tone.value)}>
                {card.value}
              </div>
              <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
                {card.detail}
              </p>
            </button>
          );
        })}
      </div>
    </section>
  );
}
