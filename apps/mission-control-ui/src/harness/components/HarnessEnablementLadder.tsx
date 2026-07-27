import { ENABLEMENT_LADDER, type EnablementLevel } from "@/lib/harnessPatterns";
import { cn } from "@/lib/utils";

const MATURITY_STYLE = {
  emerging: "border-warn/30 bg-warn/5 text-warn",
  partial: "border-registry-accent/30 bg-registry-accent-soft text-registry-accent",
  established: "border-ok/30 bg-ok/5 text-ok",
} as const;

export function HarnessEnablementLadder({
  activeLevel = "team",
  className,
}: {
  activeLevel?: EnablementLevel;
  className?: string;
}): JSX.Element {
  return (
    <section className={cn("space-y-4", className)}>
      <div>
        <h3 className="text-[15px] font-semibold text-ink">Four enablement layers</h3>
        <p className="mt-0.5 text-[12.5px] text-ink-muted">
          Agent → team → platform → org — most conferences stop at level 0.
        </p>
      </div>
      <div className="grid gap-3 lg:grid-cols-4">
        {ENABLEMENT_LADDER.map((stage) => {
          const active = stage.id === activeLevel;
          return (
            <div
              key={stage.id}
              className={cn(
                "registry-top-card p-4",
                active && "border-registry-accent/50 registry-top-card-glow"
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-ink-muted">{stage.subtitle}</span>
                <span
                  className={cn(
                    "rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase",
                    MATURITY_STYLE[stage.maturity]
                  )}
                >
                  {stage.maturity}
                </span>
              </div>
              <h4 className="mt-2 font-semibold text-ink">{stage.label}</h4>
              <p className="mt-1 text-[12.5px] text-ink-secondary">{stage.description}</p>
              <p className="mt-2 text-[11.5px] text-ink-muted">{stage.focus}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
