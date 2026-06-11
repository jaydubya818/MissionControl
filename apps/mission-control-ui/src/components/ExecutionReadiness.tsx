import { useEffect, useState } from "react";
import {
  CheckCircle2,
  Circle,
  ListChecks,
  SlidersHorizontal,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────────────
// Autonomy settings (operator-local until backed by policy engine)
// ─────────────────────────────────────────────────────────────────────────────

const AUTONOMY_STORAGE_KEY = "mc.autonomy.settings.v1";

export type AutonomyLevel = "manual" | "assisted" | "supervised" | "autonomous";

export interface AutonomySettings {
  level: AutonomyLevel;
  approveDangerous: boolean;
  approveDeploys: boolean;
  approveProdData: boolean;
}

const DEFAULT_AUTONOMY: AutonomySettings = {
  level: "supervised",
  approveDangerous: true,
  approveDeploys: true,
  approveProdData: true,
};

const AUTONOMY_LEVELS: Array<{ id: AutonomyLevel; label: string; detail: string }> = [
  { id: "manual", label: "Manual", detail: "Agents propose. Operator executes everything." },
  { id: "assisted", label: "Assisted", detail: "Agents execute. Operator confirms each step." },
  {
    id: "supervised",
    label: "Supervised Autonomous",
    detail: "Agents run loops. Human approval is required for deploys, destructive actions, and permission changes.",
  },
  {
    id: "autonomous",
    label: "Fully Autonomous",
    detail: "Agents run end-to-end. Only policy-flagged actions pause for review.",
  },
];

export function loadAutonomySettings(): AutonomySettings {
  try {
    const raw = localStorage.getItem(AUTONOMY_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AutonomySettings>;
      return { ...DEFAULT_AUTONOMY, ...parsed };
    }
  } catch {
    // ignore
  }
  return DEFAULT_AUTONOMY;
}

function saveAutonomySettings(settings: AutonomySettings) {
  try {
    localStorage.setItem(AUTONOMY_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // ignore
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Readiness checklist
// ─────────────────────────────────────────────────────────────────────────────

export interface ReadinessInputs {
  missionDefined: boolean;
  actorsSelected: boolean;
  toolsConnected: boolean;
  observabilityEnabled: boolean;
}

interface ChecklistItem {
  id: string;
  label: string;
  done: boolean;
  hint: string;
  onClick?: () => void;
}

interface ExecutionReadinessProps {
  readiness: ReadinessInputs;
  onOpenMission?: () => void;
  onOpenFleet?: () => void;
  onOpenGateway?: () => void;
  onOpenApprovals?: () => void;
  className?: string;
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="group flex w-full items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-white/[0.03]"
    >
      <span className="text-[12px] leading-snug text-muted-foreground group-hover:text-foreground/90">
        {label}
      </span>
      <span
        className={cn(
          "relative h-4.5 w-8 shrink-0 rounded-full border transition-colors duration-150",
          checked
            ? "border-emerald-300/40 bg-emerald-400/25"
            : "border-[var(--panel-line-strong)] bg-[color:var(--shell-panel-strong)]"
        )}
      >
        <span
          className={cn(
            "absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full transition-all duration-150",
            checked ? "left-[calc(100%-0.875rem)] bg-emerald-200" : "left-0.5 bg-zinc-500"
          )}
        />
      </span>
    </button>
  );
}

function PanelHeader({ icon: Icon, title, badge }: { icon: LucideIcon; title: string; badge?: string }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-[var(--panel-line)] px-4 py-3">
      <div className="flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 text-cyan-200/80" strokeWidth={1.7} />
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {title}
        </span>
      </div>
      {badge ? (
        <span className="rounded-full border border-[var(--panel-line)] bg-[color:var(--shell-panel)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {badge}
        </span>
      ) : null}
    </div>
  );
}

export function ExecutionReadiness({
  readiness,
  onOpenMission,
  onOpenFleet,
  onOpenGateway,
  onOpenApprovals,
  className,
}: ExecutionReadinessProps) {
  const [autonomy, setAutonomy] = useState<AutonomySettings>(() =>
    typeof window === "undefined" ? DEFAULT_AUTONOMY : loadAutonomySettings()
  );
  const [autonomyTouched, setAutonomyTouched] = useState<boolean>(() => {
    try {
      return localStorage.getItem(AUTONOMY_STORAGE_KEY) !== null;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    saveAutonomySettings(autonomy);
  }, [autonomy]);

  const gatesConfigured =
    autonomy.approveDangerous || autonomy.approveDeploys || autonomy.approveProdData;

  const items: ChecklistItem[] = [
    {
      id: "mission",
      label: "Mission defined",
      done: readiness.missionDefined,
      hint: "Set the north star statement.",
      onClick: onOpenMission,
    },
    {
      id: "actors",
      label: "Actors selected",
      done: readiness.actorsSelected,
      hint: "Register at least one agent.",
      onClick: onOpenFleet,
    },
    {
      id: "tools",
      label: "Tools connected",
      done: readiness.toolsConnected,
      hint: "Connect the agent gateway.",
      onClick: onOpenGateway,
    },
    {
      id: "autonomy",
      label: "Autonomy level configured",
      done: autonomyTouched,
      hint: "Choose how much agents act alone.",
    },
    {
      id: "gates",
      label: "Approval gates configured",
      done: gatesConfigured,
      hint: "Protect risky actions with review.",
      onClick: onOpenApprovals,
    },
    {
      id: "observability",
      label: "Observability enabled",
      done: readiness.observabilityEnabled,
      hint: "Activity and alert streams are live.",
    },
  ];

  const doneCount = items.filter((i) => i.done).length;
  const activeLevel = AUTONOMY_LEVELS.find((l) => l.id === autonomy.level) ?? AUTONOMY_LEVELS[2];

  return (
    <section className={cn("mb-6", className)} aria-label="Execution readiness">
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Checklist */}
        <Card className="overflow-hidden">
          <PanelHeader
            icon={ListChecks}
            title="Execution readiness"
            badge={`${doneCount}/${items.length} ready`}
          />
          <div className="px-2 py-2">
            {items.map((item) => {
              const interactive = !!item.onClick && !item.done;
              const Row = interactive ? "button" : "div";
              return (
                <Row
                  key={item.id}
                  {...(interactive ? { type: "button" as const, onClick: item.onClick } : {})}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left",
                    interactive && "cursor-pointer transition-colors hover:bg-white/[0.03]"
                  )}
                >
                  {item.done ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-300" strokeWidth={1.8} />
                  ) : (
                    <Circle className="h-4 w-4 shrink-0 text-muted-foreground/40" strokeWidth={1.8} />
                  )}
                  <span
                    className={cn(
                      "text-[13px] font-medium",
                      item.done ? "text-foreground/80" : "text-foreground"
                    )}
                  >
                    {item.label}
                  </span>
                  <span className="ml-auto hidden text-[11px] text-muted-foreground/70 sm:inline">
                    {item.done ? "Ready" : item.hint}
                  </span>
                </Row>
              );
            })}
          </div>
          <div className="border-t border-[var(--panel-line)] px-4 py-2.5">
            <div className="h-1 w-full overflow-hidden rounded-full bg-[color:var(--shell-panel-strong)]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-cyan-400/70 to-emerald-400/70 transition-all duration-500"
                style={{ width: `${(doneCount / items.length) * 100}%` }}
              />
            </div>
          </div>
        </Card>

        {/* Autonomy control */}
        <Card className="overflow-hidden">
          <PanelHeader icon={SlidersHorizontal} title="Autonomy control" badge={activeLevel.label} />
          <div className="px-4 py-3">
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              {AUTONOMY_LEVELS.map((level) => {
                const isActive = autonomy.level === level.id;
                return (
                  <button
                    key={level.id}
                    type="button"
                    onClick={() => {
                      setAutonomy((prev) => ({ ...prev, level: level.id }));
                      setAutonomyTouched(true);
                    }}
                    className={cn(
                      "rounded-lg border px-2 py-2 text-center text-[11px] font-semibold leading-tight transition-all duration-150",
                      isActive
                        ? "border-cyan-300/35 bg-cyan-400/12 text-cyan-100 shadow-[var(--glow-cyan)]"
                        : "border-[var(--panel-line)] bg-[color:var(--shell-panel)] text-muted-foreground hover:border-cyan-300/20 hover:text-foreground"
                    )}
                    aria-pressed={isActive}
                  >
                    {level.label}
                  </button>
                );
              })}
            </div>
            <p className="mt-2.5 min-h-[2.25rem] text-[11px] leading-relaxed text-muted-foreground">
              {activeLevel.detail}
            </p>
            <div className="mt-2 space-y-0.5 border-t border-[var(--panel-line)] pt-2">
              <ToggleRow
                label="Dangerous actions require approval"
                checked={autonomy.approveDangerous}
                onChange={(v) => setAutonomy((prev) => ({ ...prev, approveDangerous: v }))}
              />
              <ToggleRow
                label="Deployments require approval"
                checked={autonomy.approveDeploys}
                onChange={(v) => setAutonomy((prev) => ({ ...prev, approveDeploys: v }))}
              />
              <ToggleRow
                label="Production data access requires approval"
                checked={autonomy.approveProdData}
                onChange={(v) => setAutonomy((prev) => ({ ...prev, approveProdData: v }))}
              />
            </div>
            <div className="mt-2.5 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground/70">
              <ShieldCheck className="h-3 w-3 text-emerald-300/80" strokeWidth={1.8} />
              Approval gates protect risky actions before they reach production.
            </div>
          </div>
        </Card>
      </div>
    </section>
  );
}
