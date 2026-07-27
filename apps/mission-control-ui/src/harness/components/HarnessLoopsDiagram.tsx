import { cn } from "@/lib/utils";
import { ArrowDown, ArrowRight } from "lucide-react";

const LOOP_STAGES = [
  {
    id: "inner",
    title: "Inner loop",
    subtitle: "Drives autonomy",
    color: "border-registry-accent/40 bg-registry-accent-soft",
    items: [
      "Unit tests & linters (agent-maintained)",
      "Skill-lint & pedantic module rules",
      "TDD / red-green while agent works",
      "CLI-accessible product surfaces",
    ],
    quote: "Every agent mistake → a check so it never happens again.",
  },
  {
    id: "outer",
    title: "Outer loop",
    subtitle: "Builds automation",
    color: "border-violet-400/40 bg-violet-500/10",
    items: [
      "Multi-lens agentic code review",
      "Build, run, click-through QA",
      "Mutation testing on PR diff",
      "Change risk gate at PR boundary",
    ],
    quote: "Expensive checks you run once per PR — not while coding.",
  },
  {
    id: "meta",
    title: "Meta loop",
    subtitle: "Continuous improvement",
    color: "border-amber-400/40 bg-amber-500/10",
    items: [
      "Mine PR comments & CI failures",
      "Maintenance agents propose fixes",
      "Extract evals from observed failures",
      "Rule retirement when models change",
    ],
    quote: "React to suggestions — don't hunt problems proactively.",
  },
] as const;

/** Dru Knox inner → outer → meta loop literacy diagram. */
export function HarnessLoopsDiagram({ className }: { className?: string }): JSX.Element {
  return (
    <div className={cn("space-y-4", className)}>
      <p className="text-sm text-ink-secondary">
        Harness engineering shifts focus from writing code to building and monitoring loops that review
        code and system health. Start inner, add outer at the PR boundary, then automate meta maintenance.
      </p>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-stretch">
        {LOOP_STAGES.map((stage, i) => (
          <div key={stage.id} className="relative flex flex-1 flex-col">
            <div className={cn("flex h-full flex-col rounded-xl border p-4", stage.color)}>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
                {stage.subtitle}
              </div>
              <h3 className="mt-1 text-base font-semibold text-ink">{stage.title}</h3>
              <ul className="mt-3 flex-1 space-y-1.5 text-xs text-ink-secondary">
                {stage.items.map((item) => (
                  <li key={item} className="flex gap-1.5">
                    <span className="text-registry-accent">·</span>
                    {item}
                  </li>
                ))}
              </ul>
              <p className="mt-3 border-t border-line/60 pt-3 text-[11px] italic text-ink-muted">
                "{stage.quote}"
              </p>
            </div>
            {i < LOOP_STAGES.length - 1 && (
              <div className="absolute -bottom-3 left-1/2 z-10 hidden -translate-x-1/2 lg:flex">
                <ArrowRight className="h-5 w-5 text-ink-muted" aria-hidden />
              </div>
            )}
            {i < LOOP_STAGES.length - 1 && (
              <div className="flex justify-center py-1 lg:hidden">
                <ArrowDown className="h-4 w-4 text-ink-muted" aria-hidden />
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="rounded-lg border border-line bg-surface-2 px-4 py-3 text-xs text-ink-secondary">
        <strong className="text-ink">Review bottleneck trap:</strong> agents may be autonomous (few
        course corrections) but not automated (you still review everything). Drive automation by
        trusting outer-loop checks — target 40–50% PRs without human review.
      </div>
    </div>
  );
}
