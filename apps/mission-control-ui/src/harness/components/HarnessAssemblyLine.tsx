import { ASSEMBLY_LINE, type AssemblyStageId } from "@/lib/harnessWorkshop";
import { cn } from "@/lib/utils";
import { ArrowRight } from "lucide-react";

export function HarnessAssemblyLine({
  activeStage = "review",
  className,
}: {
  activeStage?: AssemblyStageId;
  className?: string;
}): JSX.Element {
  const activeIdx = ASSEMBLY_LINE.findIndex((s) => s.id === activeStage);

  return (
    <section className={cn("space-y-4", className)}>
      <div>
        <h3 className="text-[15px] font-semibold text-ink">Assembly line</h3>
        <p className="mt-0.5 text-[12.5px] text-ink-muted">
          Plan → Produce → Review → Ship — automate the SLC loop Eric runs at Cursor.
        </p>
      </div>
      <div className="flex flex-wrap items-stretch gap-2">
        {ASSEMBLY_LINE.map((stage, i) => {
          const active = i === activeIdx;
          const done = i < activeIdx;
          return (
            <div key={stage.id} className="flex min-w-[140px] flex-1 items-center gap-2">
              <div
                className={cn(
                  "registry-top-card flex-1 p-3",
                  active && "border-registry-accent/40 registry-top-card-glow",
                  done && "border-ok/30 bg-ok/5"
                )}
              >
                <div className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">
                  {i + 1}. {stage.label}
                </div>
                <p className="mt-1 text-[12px] leading-snug text-ink-secondary">{stage.description}</p>
                <ul className="mt-2 space-y-0.5">
                  {stage.automations.map((a) => (
                    <li key={a} className="text-[10.5px] text-registry-accent">
                      · {a}
                    </li>
                  ))}
                </ul>
              </div>
              {i < ASSEMBLY_LINE.length - 1 ? (
                <ArrowRight className="hidden h-4 w-4 shrink-0 text-ink-muted sm:block" aria-hidden />
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
