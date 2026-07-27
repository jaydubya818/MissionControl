import { ARCHITECT_FLOW, type FlowStageId } from "@/lib/harnessArchitect";
import { cn } from "@/lib/utils";

const ACTOR_COLOR = {
  human: "border-[#facc15]/40 bg-[#facc15]/10 text-[#fde68a]",
  agent: "border-[#fb923c]/40 bg-[#fb923c]/12 text-[#fdba74]",
  code: "border-registry-accent/40 bg-registry-accent-soft text-registry-accent",
} as const;

export function HarnessArchitectFlow({
  activeStage = "plan-loop",
  className,
}: {
  activeStage?: FlowStageId;
  className?: string;
}): JSX.Element {
  const activeIdx = ARCHITECT_FLOW.findIndex((s) => s.id === activeStage);

  return (
    <section className={cn("space-y-4", className)}>
      <div>
        <h3 className="text-[15px] font-semibold text-ink">Issue → ship state machine</h3>
        <p className="mt-0.5 text-[12.5px] text-ink-muted">
          Skill + CLI — not shell scripts. Extend the state machine as you productionize.
        </p>
      </div>
      <div className="relative overflow-x-auto pb-2">
        <div className="flex min-w-[900px] items-start gap-1">
          {ARCHITECT_FLOW.map((stage, i) => {
            const active = i === activeIdx;
            const done = i < activeIdx;
            return (
              <div key={stage.id} className="flex flex-1 items-center gap-1">
                <div
                  className={cn(
                    "registry-top-card min-w-[120px] flex-1 p-3",
                    active && "border-registry-accent/50 registry-top-card-glow",
                    done && "opacity-85"
                  )}
                >
                  <span
                    className={cn(
                      "inline-block rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase",
                      ACTOR_COLOR[stage.actor]
                    )}
                  >
                    {stage.actor}
                  </span>
                  <div className="mt-1.5 text-[12px] font-semibold leading-tight text-ink">{stage.label}</div>
                  <p className="mt-1 text-[10.5px] leading-snug text-ink-muted">{stage.description}</p>
                </div>
                {i < ARCHITECT_FLOW.length - 1 ? (
                  <span className="shrink-0 text-ink-muted" aria-hidden>
                    →
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
      <div className="rounded-lg border border-warn/30 bg-warn/5 px-3 py-2 text-[12px] text-ink-secondary">
        <strong className="text-ink">Plan loop cap:</strong> adversarial plan ↔ review runs at most 5 times — then human
        arbiter reads structured diff output from Swamp query.
      </div>
    </section>
  );
}
