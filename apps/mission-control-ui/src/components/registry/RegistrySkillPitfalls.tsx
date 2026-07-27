import { DESCRIPTION_EXAMPLES, type SkillPitfall } from "@/lib/skillPitfalls";
import { cn } from "@/lib/utils";

const STATIC_PITFALLS: Array<{ title: string; body: string }> = [
  {
    title: "Vague descriptions",
    body: "Generic activation text never fires at the right moment — name tools, file types, and triggers explicitly.",
  },
  {
    title: "God skills",
    body: "One skill that does everything is almost always activated for the wrong reason.",
  },
  {
    title: "Context bloat",
    body: "Thousand-line duplicative skills waste tokens; trim and use reference files.",
  },
  {
    title: "Human audience",
    body: "Skills are for agents — skip REST API tutorials and keep directive checklists.",
  },
  {
    title: "Model-dependent context",
    body: "Every skill is unique per model — version and eval under the conditions you ship with.",
  },
];

export function RegistryDescriptionExamples({ className }: { className?: string }): JSX.Element {
  return (
    <div className={cn("grid gap-3 sm:grid-cols-2", className)}>
      <div className="rounded-lg border border-warn/30 bg-warn/5 p-3">
        <div className="text-[11px] font-semibold uppercase text-warn">Weak activation</div>
        <p className="mt-2 text-[12.5px] italic text-ink-secondary">&ldquo;{DESCRIPTION_EXAMPLES.bad}&rdquo;</p>
      </div>
      <div className="rounded-lg border border-ok/30 bg-ok/5 p-3">
        <div className="text-[11px] font-semibold uppercase text-ok">Strong activation</div>
        <p className="mt-2 text-[12.5px] text-ink-secondary">&ldquo;{DESCRIPTION_EXAMPLES.good}&rdquo;</p>
      </div>
    </div>
  );
}

export function RegistrySkillPitfallsGuide({ className }: { className?: string }): JSX.Element {
  return (
    <div className={cn("space-y-4", className)}>
      <div>
        <h2 className="text-[18px] font-semibold text-ink">Common context pitfalls</h2>
        <p className="mt-1 text-[13px] text-ink-muted">
          From 10,000+ OSS skill reviews — patterns that burn tokens and degrade agent output.
        </p>
      </div>
      <RegistryDescriptionExamples />
      <ul className="space-y-2">
        {STATIC_PITFALLS.map((p) => (
          <li key={p.title} className="rounded-lg border border-line bg-surface-1 px-4 py-3">
            <div className="text-[13px] font-semibold text-ink">{p.title}</div>
            <p className="mt-0.5 text-[12.5px] text-ink-secondary">{p.body}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function RegistryPitfallAlerts({
  pitfalls,
  className,
}: {
  pitfalls: SkillPitfall[];
  className?: string;
}): JSX.Element | null {
  if (pitfalls.length === 0) return null;

  return (
    <div className={cn("space-y-2", className)}>
      <div className="text-[13px] font-semibold text-ink">Detected pitfalls</div>
      {pitfalls.map((p) => (
        <div
          key={p.id}
          className={cn(
            "rounded-lg border px-4 py-3",
            p.severity === "warn" ? "border-warn/30 bg-warn/5" : "border-line bg-surface-1"
          )}
        >
          <div className="text-[13px] font-medium text-ink">{p.title}</div>
          <p className="mt-1 text-[12px] text-ink-secondary">{p.detail}</p>
          <p className="mt-2 text-[12px] text-registry-accent">
            <strong>Fix:</strong> {p.fix}
          </p>
        </div>
      ))}
    </div>
  );
}
