import { TEST_LAYERS, SUPPLY_CHAIN_RULES, ARCHITECT_PRINCIPLES } from "@/lib/harnessArchitect";
import { cn } from "@/lib/utils";
import { Ban, FlaskConical, Lock } from "lucide-react";

export function HarnessTestPyramid({ className }: { className?: string }): JSX.Element {
  return (
    <section className={cn("space-y-3", className)}>
      <h3 className="text-[15px] font-semibold text-ink">Test strategy</h3>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="registry-top-card p-3">
          <div className="text-[11px] font-bold uppercase text-registry-accent">Pre-binary</div>
          <ul className="mt-2 space-y-1">
            {TEST_LAYERS.filter((t) => t.phase === "pre-binary").map((t) => (
              <li key={t.id} className="flex items-center gap-2 text-[12.5px] text-ink-secondary">
                <FlaskConical className="h-3.5 w-3.5 text-ink-muted" aria-hidden />
                {t.label}
              </li>
            ))}
          </ul>
        </div>
        <div className="registry-top-card border-warn/25 p-3">
          <div className="text-[11px] font-bold uppercase text-warn">Post-binary · separate UAT repo</div>
          <ul className="mt-2 space-y-1">
            {TEST_LAYERS.filter((t) => t.phase === "post-binary").map((t) => (
              <li key={t.id} className="flex items-center gap-2 text-[12.5px] text-ink-secondary">
                <FlaskConical className="h-3.5 w-3.5 text-ink-muted" aria-hidden />
                {t.label}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-ink-muted">Tests are source of truth — fix the binary, not the test.</p>
        </div>
      </div>
    </section>
  );
}

export function HarnessSupplyChainPanel({ className }: { className?: string }): JSX.Element {
  return (
    <section className={cn("space-y-3", className)}>
      <div className="flex items-center gap-2">
        <Lock className="h-4 w-4 text-registry-accent" aria-hidden />
        <h3 className="text-[15px] font-semibold text-ink">Supply chain policy</h3>
      </div>
      <ul className="space-y-2">
        {SUPPLY_CHAIN_RULES.map((r) => (
          <li key={r.id} className="flex gap-2 rounded-lg border border-line bg-surface-1 px-3 py-2.5">
            <Ban className="mt-0.5 h-3.5 w-3.5 shrink-0 text-err" aria-hidden />
            <div>
              <div className="text-[13px] font-medium text-ink">{r.label}</div>
              <div className="text-[12px] text-ink-secondary">{r.detail}</div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function HarnessArchitectPrinciples(): JSX.Element {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {ARCHITECT_PRINCIPLES.map((p) => (
        <div key={p.id} className="registry-top-card p-4">
          <h4 className="font-semibold text-ink">{p.title}</h4>
          <p className="mt-1 text-[13px] text-ink-secondary">{p.body}</p>
        </div>
      ))}
    </div>
  );
}
