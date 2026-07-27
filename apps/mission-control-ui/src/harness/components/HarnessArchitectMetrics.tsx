import { useState } from "react";
import { useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { ARCHITECT_METRICS, TRIAGE_DEMO_STEPS } from "@/lib/harnessArchitect";
import { cn } from "@/lib/utils";

export function HarnessArchitectMetrics({
  projectId,
  className,
}: {
  projectId?: Id<"projects"> | null;
  className?: string;
}): JSX.Element {
  const adoption = useQuery(api.factory.health.getAdoptionMetrics, {
    projectId: projectId ?? undefined,
    periodDays: 30,
  });

  const m = adoption ?? {
    issuesOpened: ARCHITECT_METRICS.issuesOpened,
    shipped: ARCHITECT_METRICS.shipped,
    closedDuplicate: ARCHITECT_METRICS.closedDuplicate,
    medianTriageHours: ARCHITECT_METRICS.medianTriageHours,
    medianTriageToShipDays: ARCHITECT_METRICS.medianTriageToShipDays,
  };

  const shipRate = m.issuesOpened > 0 ? Math.round((m.shipped / m.issuesOpened) * 100) : 0;
  const isLive = adoption !== undefined;

  return (
    <section className={cn("space-y-4", className)}>
      <div className="flex items-center gap-2">
        <h3 className="text-[15px] font-semibold text-ink">Factory throughput (30 days)</h3>
        {isLive ? (
          <span className="registry-tag">Live</span>
        ) : (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-ink-muted" />
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Issues opened", value: m.issuesOpened },
          { label: "Shipped", value: m.shipped, sub: `${shipRate}% ship rate` },
          { label: "Median triage", value: `${m.medianTriageHours}h`, sub: "elapsed hours" },
          { label: "Triage → ship", value: `${m.medianTriageToShipDays}d`, sub: "including all gates" },
        ].map((item) => (
          <div key={item.label} className="registry-top-card p-4">
            <div className="text-[11px] uppercase tracking-wider text-ink-muted">{item.label}</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums text-registry-accent">{item.value}</div>
            {item.sub ? <div className="text-[11px] text-ink-secondary">{item.sub}</div> : null}
          </div>
        ))}
      </div>
      {adoption ? (
        <div className="registry-top-card p-4 text-[13px] text-ink-secondary">
          Human touches / agent task:{" "}
          <strong className="text-ink">{adoption.humanTouchesPerAgentTask}</strong> · Shared contributions:{" "}
          <strong className="text-registry-accent">{adoption.sharedComponentContributions}</strong> · Workflow spend: $
          {adoption.workflowTokenSpendUsd.toFixed(2)}
        </div>
      ) : null}
    </section>
  );
}

export function HarnessTriageDemoPanel({ className }: { className?: string }): JSX.Element {
  const [expanded, setExpanded] = useState(true);

  return (
    <section className={cn("registry-eval-card space-y-3", className)}>
      <button
        type="button"
        className="flex w-full items-center justify-between text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <div>
          <h3 className="text-[15px] font-semibold text-ink">Live triage demo · issue #518</h3>
          <p className="text-[12.5px] text-ink-muted">Kicked off before the talk — skill + Swamp CLI</p>
        </div>
        <span className="registry-tag">{expanded ? "Hide" : "Show"}</span>
      </button>
      {expanded ? (
        <ol className="space-y-2">
          {TRIAGE_DEMO_STEPS.map((step) => (
            <li
              key={step.id}
              className={cn(
                "flex gap-3 rounded-lg border px-3 py-2",
                step.status === "done" && "border-ok/25 bg-ok/5",
                step.status === "active" && "border-registry-accent/40 bg-registry-accent-soft",
                step.status === "pending" && "border-line bg-surface-2/50 opacity-70"
              )}
            >
              <span
                className={cn(
                  "mt-0.5 h-2 w-2 shrink-0 rounded-full",
                  step.status === "done" && "bg-registry-accent",
                  step.status === "active" && "animate-pulse bg-registry-accent",
                  step.status === "pending" && "bg-ink-muted"
                )}
              />
              <div>
                <div className="font-mono text-[12px] text-ink">{step.label}</div>
                <div className="text-[11.5px] text-ink-secondary">{step.detail}</div>
              </div>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
