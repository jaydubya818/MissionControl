import { cn } from "@/lib/utils";
import { AUTONOMY_STAGES, type AutonomyLevel } from "@/lib/harnessWorkshop";
import { Factory } from "lucide-react";

export function HarnessAutonomyLadder({
  currentLevel = 4,
  className,
}: {
  currentLevel?: AutonomyLevel;
  className?: string;
}): JSX.Element {
  return (
    <section className={cn("space-y-4", className)}>
      <div className="flex items-center gap-2">
        <Factory className="h-4 w-4 text-registry-accent" aria-hidden />
        <h3 className="text-[15px] font-semibold text-ink">Levels of autonomy</h3>
        <span className="registry-tag">Dan Shapiro · 6 stages</span>
      </div>
      <div className="relative">
        <div className="absolute left-[19px] top-6 bottom-6 w-px bg-line" aria-hidden />
        <ol className="space-y-2">
          {AUTONOMY_STAGES.map((stage) => {
            const active = stage.level === currentLevel;
            const passed = stage.level < currentLevel;
            return (
              <li
                key={stage.id}
                className={cn(
                  "relative flex gap-4 rounded-xl border px-4 py-3 transition-colors",
                  active && "border-registry-accent/40 bg-registry-accent-soft registry-top-card-glow",
                  passed && !active && "border-line bg-surface-1 opacity-80",
                  !active && !passed && "border-line/60 bg-surface-1/50"
                )}
              >
                <div
                  className={cn(
                    "relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border text-sm font-bold tabular-nums",
                    active && "border-registry-accent bg-registry-accent-soft text-registry-accent",
                    passed && "border-ok/40 bg-ok/10 text-registry-accent",
                    !active && !passed && "border-line bg-surface-2 text-ink-muted"
                  )}
                >
                  {stage.level}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-ink">{stage.label}</span>
                    <span className="text-[11px] text-ink-muted">{stage.subtitle}</span>
                    {active ? (
                      <span className="registry-delta !bg-registry-accent/20">You are here</span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-[13px] leading-relaxed text-ink-secondary">{stage.description}</p>
                  <p className="mt-1 text-[11.5px] text-ink-muted">
                    Human role: <span className="text-ink-secondary">{stage.humanRole}</span>
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
