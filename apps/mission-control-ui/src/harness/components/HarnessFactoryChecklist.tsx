import { useMemo, useState } from "react";
import { Check, Circle, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CHECKLIST_CATEGORY_LABELS,
  FACTORY_CHECKLIST,
  type FactoryChecklistItem,
  type ChecklistCategory,
} from "@/lib/harnessWorkshop";

const DEFAULT_CHECKED = new Set([
  "modular-code",
  "usage-patterns",
  "tests",
  "skills-mcp",
  "runnable",
  "verifiable",
]);

export function HarnessFactoryChecklist({
  className,
}: {
  className?: string;
}): JSX.Element {
  const [checked, setChecked] = useState<Set<string>>(() => new Set(DEFAULT_CHECKED));

  const byCategory = useMemo(() => {
    const map = new Map<ChecklistCategory, FactoryChecklistItem[]>();
    for (const item of FACTORY_CHECKLIST) {
      const list = map.get(item.category) ?? [];
      list.push(item);
      map.set(item.category, list);
    }
    return map;
  }, []);

  const total = FACTORY_CHECKLIST.length;
  const done = checked.size;
  const pct = Math.round((done / total) * 100);

  const toggle = (id: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <section className={cn("space-y-4", className)}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-semibold text-ink">Factory build checklist</h3>
          <p className="mt-0.5 text-[12.5px] text-ink-muted">
            Primitives → guardrails → enablers → runnable → accessible → verifiable
          </p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-semibold tabular-nums text-registry-accent">{pct}%</div>
          <div className="text-[11px] text-ink-muted">
            {done}/{total} ready
          </div>
        </div>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full rounded-full bg-registry-accent transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from(byCategory.entries()).map(([category, items]) => (
          <div key={category} className="registry-top-card space-y-2 p-4">
            <h4 className="text-[11px] font-bold uppercase tracking-[0.08em] text-registry-accent">
              {CHECKLIST_CATEGORY_LABELS[category]}
            </h4>
            <ul className="space-y-2">
              {items.map((item) => {
                const isChecked = checked.has(item.id);
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => toggle(item.id)}
                      className="flex w-full items-start gap-2.5 rounded-lg px-1 py-1 text-left hover:bg-surface-2"
                    >
                      <span
                        className={cn(
                          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border",
                          isChecked
                            ? "border-registry-accent bg-registry-accent-soft text-registry-accent"
                            : "border-line bg-surface-2 text-ink-muted"
                        )}
                      >
                        {isChecked ? <Check className="h-3 w-3" /> : <Circle className="h-3 w-3" />}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[13px] font-medium text-ink">{item.label}</span>
                        <span className="block text-[12px] leading-relaxed text-ink-secondary">{item.description}</span>
                        {item.artifactHint ? (
                          <code className="mt-0.5 block font-mono text-[10.5px] text-ink-muted">{item.artifactHint}</code>
                        ) : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      {pct < 100 ? (
        <p className="flex items-center gap-1.5 text-[12px] text-warn">
          <Minus className="h-3.5 w-3.5" aria-hidden />
          Probabilistic agent output usually means missing guardrails — invest here before scaling agents.
        </p>
      ) : null}
    </section>
  );
}
