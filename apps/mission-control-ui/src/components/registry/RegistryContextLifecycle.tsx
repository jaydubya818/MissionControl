import { ArrowRight, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

const CDL_STAGES = [
  {
    id: "generate",
    title: "Generate",
    subtitle: "Create context",
    items: [
      "Library usage conventions",
      "Team process playbooks",
      "Security & API policies",
    ],
  },
  {
    id: "evaluate",
    title: "Evaluate",
    subtitle: "Test context",
    items: [
      "Structural skill review (quality)",
      "Scenario pressure tests (evals)",
      "With vs without context baselines",
    ],
  },
  {
    id: "distribute",
    title: "Distribute",
    subtitle: "Share context",
    items: [
      "Skills registry & versioning",
      "Private vs public packages",
      "Install policies across teams",
    ],
  },
  {
    id: "observe",
    title: "Observe",
    subtitle: "Close the loop",
    items: [
      "Did the agent follow the skill?",
      "What did it improvise or miss?",
      "Regenerate context from PR comments",
    ],
  },
] as const;

/** Patrick Debois Context Development Lifecycle — Generate → Evaluate → Distribute → Observe. */
export function RegistryContextLifecycle({ className }: { className?: string }): JSX.Element {
  return (
    <div className={cn("space-y-5", className)}>
      <div>
        <div className="registry-kicker">Context Development Lifecycle</div>
        <h2 className="mt-1 text-[20px] font-semibold tracking-tight text-ink">
          The bottleneck shifted from code to context
        </h2>
        <p className="mt-2 max-w-3xl text-[14px] leading-relaxed text-ink-secondary">
          In 2026, engineering looks like TDD for context: generate institutional wisdom, eval it,
          distribute it cross-functionally, then observe agent behavior and regenerate. Infinite
          context windows won&apos;t save you — evaluated, scoped context will.
        </p>
      </div>

      <div className="grid gap-3 lg:grid-cols-4">
        {CDL_STAGES.map((stage, i) => (
          <div key={stage.id} className="relative">
            <div className="h-full rounded-xl border border-line bg-surface-1 p-4">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-registry-accent">
                {stage.subtitle}
              </div>
              <h3 className="mt-1 text-[15px] font-semibold text-ink">{stage.title}</h3>
              <ul className="mt-3 space-y-1.5 text-[12.5px] text-ink-secondary">
                {stage.items.map((item) => (
                  <li key={item} className="flex gap-1.5">
                    <span className="text-registry-accent">·</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            {i < CDL_STAGES.length - 1 && (
              <ArrowRight
                className="absolute -right-2.5 top-1/2 z-10 hidden h-4 w-4 -translate-y-1/2 text-ink-muted lg:block"
                aria-hidden
              />
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-registry-accent/25 bg-registry-accent-soft/30 px-4 py-3 text-[13px] text-ink-secondary">
        <RefreshCw size={14} className="shrink-0 text-registry-accent" aria-hidden />
        <span>
          <strong className="text-ink">Context flywheel:</strong> individual context → team
          conventions → cross-functional policies → institutional wisdom. Code is the artifact;
          context is the asset.
        </span>
      </div>
    </div>
  );
}
