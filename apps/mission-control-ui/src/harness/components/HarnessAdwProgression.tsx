import { useState } from "react";
import { ADW_PROGRESSION, type AdwProgressionStep } from "@/lib/harnessAdw";
import { cn } from "@/lib/utils";

export function HarnessAdwProgression({ className }: { className?: string }): JSX.Element {
  const [active, setActive] = useState(ADW_PROGRESSION.length - 1);

  return (
    <section className={cn("space-y-4", className)}>
      <div>
        <h3 className="text-[15px] font-semibold text-ink">ADW progression</h3>
        <p className="mt-0.5 text-[12.5px] text-ink-muted">
          Forget loop engineering — this is a developer workflow. Loops are one control-flow piece.
        </p>
      </div>
      <div className="flex gap-1 overflow-x-auto pb-1">
        {ADW_PROGRESSION.map((step, i) => (
          <button
            key={step.id}
            type="button"
            onClick={() => setActive(i)}
            className={cn(
              "shrink-0 rounded-lg border px-2.5 py-1.5 text-[11px] transition-colors",
              i === active
                ? "border-registry-accent bg-registry-accent-soft text-ink"
                : "border-line text-ink-muted hover:text-ink-secondary"
            )}
          >
            {i + 1}. {step.title.split("→")[0]?.trim() ?? step.title}
          </button>
        ))}
      </div>
      <ProgressionDetail step={ADW_PROGRESSION[active]!} stepNum={active + 1} total={ADW_PROGRESSION.length} />
    </section>
  );
}

function ProgressionDetail({
  step,
  stepNum,
  total,
}: {
  step: AdwProgressionStep;
  stepNum: number;
  total: number;
}): JSX.Element {
  return (
    <div className="registry-top-card registry-top-card-glow p-4">
      <div className="text-[11px] font-bold uppercase tracking-wider text-registry-accent">
        Step {stepNum} of {total}
      </div>
      <h4 className="mt-1 text-lg font-semibold text-ink">{step.title}</h4>
      <p className="mt-1 text-[13px] text-ink-secondary">{step.description}</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {step.actors.map((a) => (
          <span key={a} className="registry-contains-pill capitalize">
            {a}
          </span>
        ))}
      </div>
    </div>
  );
}
