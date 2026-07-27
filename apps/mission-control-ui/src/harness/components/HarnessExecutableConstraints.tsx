import { EXECUTABLE_CONSTRAINTS } from "@/lib/harnessArchitect";
import { cn } from "@/lib/utils";

export function HarnessExecutableConstraints({ className }: { className?: string }): JSX.Element {
  return (
    <section className={cn("space-y-4", className)}>
      <div>
        <h3 className="text-[15px] font-semibold text-ink">AGENTS.md — executable contract</h3>
        <p className="mt-0.5 text-[12.5px] text-ink-muted">
          Not documentation — constraints the agent must obey. Center of gravity for every session.
        </p>
      </div>
      <div className="registry-cli-box overflow-hidden rounded-xl font-mono text-[12px]">
        <div className="border-b border-line/60 px-4 py-2 text-registry-accent"># AGENTS.md (excerpt)</div>
        <ul className="divide-y divide-line/40">
          {EXECUTABLE_CONSTRAINTS.map((c) => (
            <li key={c.id} className="flex items-start gap-3 px-4 py-2.5">
              <span className="shrink-0 text-[10px] uppercase text-ink-muted">{c.category}</span>
              <span className="text-ink-secondary">{c.rule}</span>
              {c.enforced ? (
                <span className="ml-auto shrink-0 text-[10px] text-registry-accent">enforced</span>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
      <p className="registry-eval-footnote">
        Turn tribal knowledge into constraints — encode what only one person in the org knows today.
      </p>
    </section>
  );
}
