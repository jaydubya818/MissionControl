import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { MERGE_GATES } from "@/lib/harnessArchitect";
import { CheckCircle2, Shield, Terminal, Bug, FileCode, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const GATE_ICONS = {
  "code-review": FileCode,
  adversarial: Bug,
  "ux-review": Terminal,
  "ci-security": Shield,
  "skill-check": CheckCircle2,
} as const;

export function HarnessMergeGatesPanel({
  projectId,
  passedIds,
  className,
}: {
  projectId?: Id<"projects"> | null;
  passedIds?: string[];
  className?: string;
}): JSX.Element {
  const live = useQuery(
    api.factory.prChecks.getMergeGateStatus,
    projectId !== undefined ? { projectId: projectId ?? undefined } : {}
  );

  const gates =
    live?.gates ??
    MERGE_GATES.map((g) => ({
      id: g.id,
      label: g.label,
      description: g.description,
      passed: passedIds?.includes(g.id) ?? false,
    }));

  const allPass = live?.allPass ?? gates.every((g) => g.passed);

  if (projectId !== undefined && live === undefined) {
    return (
      <div className={cn("flex items-center gap-2 text-sm text-ink-muted", className)}>
        <Loader2 className="h-4 w-4 animate-spin" /> Loading merge gates…
      </div>
    );
  }

  return (
    <section className={cn("space-y-4", className)}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-semibold text-ink">Five merge gates</h3>
          <p className="mt-0.5 text-[12.5px] text-ink-muted">
            {live?.prUrl ? (
              <>
                Live from{" "}
                <a href={live.prUrl} target="_blank" rel="noreferrer" className="text-registry-accent underline">
                  latest PR
                </a>
              </>
            ) : (
              "All must pass before auto-merge — fail routes to implement."
            )}
          </p>
        </div>
        {allPass ? (
          <span className="registry-delta">Auto-merge eligible</span>
        ) : (
          <span className="rounded-full border border-warn/40 bg-warn/10 px-2 py-0.5 text-[11px] text-warn">
            Blocked
          </span>
        )}
      </div>
      <ul className="space-y-2">
        {gates.map((gate) => {
          const Icon = GATE_ICONS[gate.id as keyof typeof GATE_ICONS] ?? Shield;
          return (
            <li
              key={gate.id}
              className={cn(
                "flex items-start gap-3 rounded-xl border px-4 py-3",
                gate.passed ? "border-ok/30 bg-ok/5" : "border-line bg-surface-1"
              )}
            >
              <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", gate.passed ? "text-registry-accent" : "text-ink-muted")} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-ink">{gate.label}</span>
                  {gate.passed ? (
                    <span className="text-[10px] font-semibold uppercase text-registry-accent">Pass</span>
                  ) : (
                    <span className="text-[10px] font-semibold uppercase text-ink-muted">Pending</span>
                  )}
                </div>
                <p className="mt-0.5 text-[12.5px] text-ink-secondary">{gate.description}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
