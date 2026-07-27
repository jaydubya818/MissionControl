import { THREE_ACTORS, type ValueActorMeta } from "@/lib/harnessAdw";
import { cn } from "@/lib/utils";
import { Code2, Cpu, User } from "lucide-react";

const ICONS = {
  code: Code2,
  engineer: User,
  agent: Cpu,
} as const;

export function HarnessThreeActors({ className }: { className?: string }): JSX.Element {
  return (
    <section className={cn("space-y-4", className)}>
      <div>
        <h3 className="text-[15px] font-semibold text-ink">Three actors of value creation</h3>
        <p className="mt-0.5 text-[12.5px] text-ink-muted">
          Place engineers, agents, and code at the right node — reliability: code → engineer → agent.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {THREE_ACTORS.map((actor) => (
          <ActorCard key={actor.id} actor={actor} />
        ))}
      </div>
      <p className="registry-eval-footnote">
        <strong className="text-ink">Two constraints:</strong> prompting (plan) at the start, reviewing (validate) at the
        end. The ADW handles everything between.
      </p>
    </section>
  );
}

function ActorCard({ actor }: { actor: ValueActorMeta }): JSX.Element {
  const Icon = ICONS[actor.id];
  return (
    <div className="registry-top-card p-4">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-registry-accent" aria-hidden />
        <span className="font-semibold text-ink">{actor.label}</span>
        <span className="ml-auto font-mono text-[11px] tabular-nums text-registry-accent">{actor.reliability}%</span>
      </div>
      <p className="mt-2 text-[12.5px] leading-relaxed text-ink-secondary">{actor.tagline}</p>
      <span className="mt-2 inline-block rounded-full border border-line px-2 py-0.5 text-[10px] uppercase text-ink-muted">
        cost: {actor.cost}
      </span>
    </div>
  );
}
