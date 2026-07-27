import { cn } from "@/lib/utils";
import { TrendingDown, TrendingUp, Minus } from "lucide-react";
import type { ReactNode } from "react";
import {
  FactoryPageHeader,
  FactoryPageShell,
} from "@/components/factory/FactoryPageLayout";

export function HarnessPage({
  title,
  description,
  eyebrow = "Harness engineering",
  icon,
  children,
  actions,
}: {
  title: string;
  description: string;
  eyebrow?: string;
  icon?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
}): JSX.Element {
  return (
    <FactoryPageShell>
      <FactoryPageHeader
        kicker={eyebrow}
        title={title}
        description={description}
        actions={
          actions ? (
            <div className="flex items-center gap-2">
              {icon}
              {actions}
            </div>
          ) : (
            icon
          )
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto pb-4">{children}</div>
    </FactoryPageShell>
  );
}

export function PillarCard({
  label,
  value,
  unit = "%",
  trend,
  hint,
  tone = "default",
}: {
  label: string;
  value: number;
  unit?: string;
  trend?: number;
  hint?: string;
  tone?: "default" | "ok" | "warn";
}): JSX.Element {
  const TrendIcon = trend === undefined || trend === 0 ? Minus : trend > 0 ? TrendingUp : TrendingDown;
  return (
    <div
      className={cn(
        "registry-top-card rounded-xl border p-4",
        tone === "ok" && "border-ok/30 bg-ok/5",
        tone === "warn" && "border-warn/30 bg-warn/5",
        tone === "default" && "border-line bg-surface-1"
      )}
    >
      <div className="text-[11px] font-medium uppercase tracking-[0.06em] text-ink-muted">{label}</div>
      <div className="mt-2 flex items-end gap-2">
        <span className="text-3xl font-semibold tabular-nums text-ink">
          {value}
          <span className="text-lg text-ink-muted">{unit}</span>
        </span>
        {trend !== undefined && (
          <span
            className={cn(
              "registry-delta mb-1 flex items-center gap-0.5 !bg-transparent !p-0 text-xs",
              trend >= 0 ? "text-registry-accent" : "text-err"
            )}
          >
            <TrendIcon className="h-3.5 w-3.5" />
            {Math.abs(trend)}%
          </span>
        )}
      </div>
      {hint ? <p className="mt-2 text-xs text-ink-secondary">{hint}</p> : null}
    </div>
  );
}

export function AutomateThisCta({
  onSchedule,
  onCi,
  onCron,
}: {
  onSchedule?: () => void;
  onCi?: () => void;
  onCron?: () => void;
}): JSX.Element {
  return (
    <div className="rounded-xl border border-registry-accent/20 bg-registry-accent-soft/40 p-4">
      <div className="text-sm font-semibold text-ink">Automate this</div>
      <p className="mt-1 text-xs text-ink-secondary">
        Built to stop using it — push this flow into the background factory.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="harness-btn harness-btn-primary" onClick={onSchedule}>
          Schedule recurring
        </button>
        <button type="button" className="harness-btn harness-btn-ghost" onClick={onCi}>
          Add CI check
        </button>
        <button type="button" className="harness-btn harness-btn-ghost" onClick={onCron}>
          Cron / GitHub Action
        </button>
      </div>
    </div>
  );
}

export function PipelineStrip({
  stages,
}: {
  stages: Array<{ id: string; label: string; status: "done" | "active" | "pending" | "blocked" }>;
}): JSX.Element {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {stages.map((s, i) => (
        <div key={s.id} className="flex items-center gap-2">
          <div
            className={cn(
              "rounded-lg border px-3 py-2 text-xs font-medium",
              s.status === "done" && "border-ok/40 bg-ok/10 text-registry-accent",
              s.status === "active" && "border-registry-accent/40 bg-registry-accent-soft text-ink",
              s.status === "pending" && "border-line bg-surface-2 text-ink-muted",
              s.status === "blocked" && "border-err/40 bg-err/10 text-err"
            )}
          >
            {s.label}
          </div>
          {i < stages.length - 1 && <span className="text-ink-muted">→</span>}
        </div>
      ))}
    </div>
  );
}

export const MATURITY_STAGES = [
  { id: "INTERACTIVE", label: "Interactive" },
  { id: "MULTI_SESSION", label: "Multi-session" },
  { id: "ISSUE_TO_PR", label: "Issue → PR" },
  { id: "FULL_FACTORY", label: "Full factory" },
] as const;

export function MaturityStepper({ current }: { current: string }): JSX.Element {
  const idx = MATURITY_STAGES.findIndex((s) => s.id === current);
  return (
    <div className="factory-tab-bar !inline-flex w-auto">
      {MATURITY_STAGES.map((s, i) => (
        <span
          key={s.id}
          className={cn(
            "factory-tab pointer-events-none",
            i <= idx && "factory-tab-active"
          )}
        >
          {s.label}
        </span>
      ))}
    </div>
  );
}
