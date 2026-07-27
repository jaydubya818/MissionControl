import {
  COLLABORATION_MODES,
  TECH_MATURITY_STACK,
  ADOPTION_METRICS,
  SCALING_PLAYBOOK,
  PATTERNS_PRINCIPLES,
  HIRING_SIGNALS,
} from "@/lib/harnessPatterns";
import { cn } from "@/lib/utils";
import { CheckCircle2, XCircle, Users, Layers } from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";

export function HarnessCollaborationModes({ className }: { className?: string }): JSX.Element {
  return (
    <section className={cn("space-y-3", className)}>
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-registry-accent" aria-hidden />
        <h3 className="text-[15px] font-semibold text-ink">Solo → shared → multiplayer</h3>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {COLLABORATION_MODES.map((mode) => (
          <div key={mode.id} className="registry-top-card p-4">
            <div className="text-[11px] font-bold uppercase text-registry-accent">{mode.label}</div>
            <p className="mt-1.5 text-[13px] text-ink-secondary">{mode.description}</p>
            <p className="mt-2 text-[11.5px] text-ink-muted">{mode.unlock}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export function HarnessTechMaturityStack({ className }: { className?: string }): JSX.Element {
  const STATUS_STYLE = {
    settled: "bg-registry-accent text-surface-0",
    building: "bg-registry-accent/70 text-surface-0",
    next: "border border-dashed border-line bg-surface-2 text-ink-muted",
  } as const;

  return (
    <section className={cn("space-y-3", className)}>
      <div className="flex items-center gap-2">
        <Layers className="h-4 w-4 text-registry-accent" aria-hidden />
        <h3 className="text-[15px] font-semibold text-ink">Tech maturity stack</h3>
      </div>
      <p className="text-[12.5px] text-ink-muted">Layers add on — prompts and specs are keepers; verification is next bottleneck.</p>
      <div className="flex flex-wrap gap-2">
        {TECH_MATURITY_STACK.map((layer) => (
          <span
            key={layer.id}
            className={cn(
              "rounded-full px-3 py-1 text-[11px] font-medium",
              STATUS_STYLE[layer.status]
            )}
          >
            {layer.label}
          </span>
        ))}
      </div>
    </section>
  );
}

export function HarnessAdoptionMetrics({
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
  const health = useQuery(api.factory.health.getFactoryHealth, {
    projectId: projectId ?? undefined,
    periodDays: 7,
  });

  const humanTouches = adoption?.humanTouchesPerAgentTask ?? health?.metrics.humanTouchesPerAgentTask;
  const sharedContrib = adoption?.sharedComponentContributions ?? health?.metrics.sharedComponentContributions;

  return (
    <section className={cn("space-y-3", className)}>
      <h3 className="text-[15px] font-semibold text-ink">What to measure</h3>
      <ul className="space-y-2">
        {ADOPTION_METRICS.map((m) => {
          const liveHint =
            m.id === "human-touches" && humanTouches !== undefined
              ? `${humanTouches} touches / agent task (7–30d)`
              : m.id === "shared-contrib" && sharedContrib !== undefined
                ? `${sharedContrib} shared harness touches`
                : m.description;
          return (
            <li
              key={m.id}
              className={cn(
                "flex items-start gap-3 rounded-lg border px-3 py-2.5",
                m.good ? "border-registry-accent/30 bg-registry-accent-soft/40" : "border-line bg-surface-1 opacity-80"
              )}
            >
              {m.good ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-registry-accent" aria-hidden />
              ) : (
                <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" aria-hidden />
              )}
              <div>
                <div className="text-[13px] font-medium text-ink">{m.label}</div>
                <div className="text-[12px] text-ink-secondary">{liveHint}</div>
              </div>
            </li>
          );
        })}
      </ul>
      {adoption ? (
        <p className="text-[12px] text-ink-muted">
          Agent FinOps: ${adoption.tokenSpendUsd.toFixed(2)} interactive · $
          {adoption.workflowTokenSpendUsd.toFixed(2)} scheduled workflows (optimize workflows, not chat sessions).
        </p>
      ) : null}
    </section>
  );
}

export function HarnessScalingPlaybook({ className }: { className?: string }): JSX.Element {
  const AUDIENCE_LABEL = {
    "team-lead": "Team lead",
    platform: "Platform",
    vp: "VP Eng",
  } as const;

  return (
    <section className={cn("space-y-3", className)}>
      <h3 className="text-[15px] font-semibold text-ink">Scaling playbook</h3>
      <ul className="space-y-2">
        {SCALING_PLAYBOOK.map((item) => (
          <li key={item.id} className="registry-top-card p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-ink">{item.title}</span>
              <span className="registry-tag">{AUDIENCE_LABEL[item.audience]}</span>
            </div>
            <p className="mt-1 text-[13px] text-ink-secondary">{item.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function HarnessPatternsPrinciples(): JSX.Element {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {PATTERNS_PRINCIPLES.map((p) => (
        <div key={p.id} className="registry-top-card p-4">
          <h4 className="font-semibold text-ink">{p.title}</h4>
          <p className="mt-1 text-[13px] text-ink-secondary">{p.body}</p>
        </div>
      ))}
    </div>
  );
}

export function HarnessHiringSignals({ className }: { className?: string }): JSX.Element {
  return (
    <section className={cn("space-y-3", className)}>
      <h3 className="text-[15px] font-semibold text-ink">Hiring in the AI era</h3>
      <ul className="space-y-1.5">
        {HIRING_SIGNALS.map((s) => (
          <li
            key={s.id}
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-2 text-[13px]",
              s.positive ? "text-ink-secondary" : "text-ink-muted line-through decoration-ink-muted/50"
            )}
          >
            {s.positive ? (
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-registry-accent" aria-hidden />
            ) : (
              <XCircle className="h-3.5 w-3.5 shrink-0 text-err/70" aria-hidden />
            )}
            {s.signal}
          </li>
        ))}
      </ul>
    </section>
  );
}
