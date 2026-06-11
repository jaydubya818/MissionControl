import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  AUTONOMY_LABELS,
  EPIC_HEALTH_LABELS,
  HEALTH_BADGE_CLASS,
  RISK_BADGE_CLASS,
  STATE_BADGE_CLASS,
  type AgentRunState,
  type AutonomyLevel,
  type EpicHealth,
  type RiskLevel,
} from "./types";

export function RiskBadge({ risk, className }: { risk: RiskLevel; className?: string }) {
  return (
    <Badge variant="outline" className={cn("font-mono text-[10px]", RISK_BADGE_CLASS[risk], className)}>
      {risk}
    </Badge>
  );
}

export function HealthBadge({ health, className }: { health: EpicHealth; className?: string }) {
  return (
    <Badge variant="outline" className={cn("text-[10px] uppercase tracking-wide", HEALTH_BADGE_CLASS[health], className)}>
      {EPIC_HEALTH_LABELS[health]}
    </Badge>
  );
}

export function StateBadge({ state, className }: { state: AgentRunState; className?: string }) {
  return (
    <Badge variant="outline" className={cn("font-mono text-[10px]", STATE_BADGE_CLASS[state], className)}>
      {state}
    </Badge>
  );
}

export function AutonomyBadge({ level, className }: { level: AutonomyLevel; className?: string }) {
  return (
    <Badge
      variant="outline"
      className={cn("border-border/60 bg-secondary/40 text-[10px] text-foreground/80", className)}
    >
      {AUTONOMY_LABELS[level]}
    </Badge>
  );
}

/** Marks views fed by deterministic demo data until backend protocol lands. */
export function DemoDataBadge() {
  return (
    <Badge
      variant="outline"
      className="border-dashed border-amber-500/40 bg-amber-500/10 text-[10px] uppercase tracking-wide text-amber-300"
      title="This view renders deterministic demo data until the epic/fleet/approval backend protocol is wired."
    >
      Demo data
    </Badge>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = "default",
  onClick,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: "default" | "good" | "warn" | "bad";
  onClick?: () => void;
}) {
  const toneClass =
    tone === "good"
      ? "text-emerald-300"
      : tone === "warn"
        ? "text-amber-300"
        : tone === "bad"
          ? "text-red-300"
          : "text-foreground";
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      onClick={onClick}
      className={cn(
        "flex min-w-0 flex-col gap-1 rounded-xl border border-[var(--panel-line)] bg-card/60 px-4 py-3 text-left",
        onClick && "cursor-pointer transition-colors hover:border-cyan-400/30 hover:bg-card"
      )}
    >
      <span className="truncate text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </span>
      <span className={cn("font-[family:var(--font-display)] text-xl font-semibold leading-none", toneClass)}>
        {value}
      </span>
      {hint && <span className="truncate text-[11px] text-muted-foreground/80">{hint}</span>}
    </Comp>
  );
}

export function ProgressBar({ value, className }: { value: number; className?: string }) {
  const clamped = Math.max(0, Math.min(100, value));
  const barClass =
    clamped >= 90 ? "bg-violet-400" : clamped >= 60 ? "bg-emerald-400" : clamped >= 30 ? "bg-cyan-400" : "bg-amber-400";
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="h-1.5 w-full min-w-12 overflow-hidden rounded-full bg-secondary/60">
        <div className={cn("h-full rounded-full", barClass)} style={{ width: `${clamped}%` }} />
      </div>
      <span className="w-9 shrink-0 text-right font-mono text-[11px] text-muted-foreground">{clamped}%</span>
    </div>
  );
}
