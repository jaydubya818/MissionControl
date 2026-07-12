import { ChevronRight } from "lucide-react";
import type { Doc } from "../../../../../convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { StatusBadge, type StatusBadgeProps } from "@/components/factory/badges";
import { CHART_SERIES } from "@/components/factory/chartTheme";

const RUN_BADGE_TONE: Record<string, StatusBadgeProps["tone"]> = {
  COMPLETED: "success",
  RUNNING: "info",
  FAILED: "error",
  TIMEOUT: "error",
};

function formatTokens(total: number): string {
  if (total >= 1_000_000) return `${(total / 1_000_000).toFixed(1)}M`;
  if (total >= 1000) return `${(total / 1000).toFixed(1)}k`;
  return String(total);
}

function shortSessionKey(sessionKey: string): string {
  if (sessionKey.length <= 28) return sessionKey;
  return `${sessionKey.slice(0, 12)}…${sessionKey.slice(-8)}`;
}

export function TopSessionsCard({
  runs,
  agents,
  windowLabel = "24h",
  onOpenRun,
  onViewAll,
}: {
  runs: Doc<"runs">[];
  agents: Doc<"agents">[];
  windowLabel?: string;
  onOpenRun?: (run: Doc<"runs">) => void;
  onViewAll?: () => void;
}): JSX.Element | null {
  if (runs.length === 0) return null;

  const agentName = new Map(agents.map((a) => [a._id, a.name]));
  const maxTokens = Math.max(
    ...runs.map((r) => (r.inputTokens ?? 0) + (r.outputTokens ?? 0)),
    1,
  );

  return (
    <section className="overflow-hidden rounded-xl border border-line bg-surface-1">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
            Top sessions
          </p>
          <p className="mt-0.5 text-[12px] text-ink-muted">By token usage · last {windowLabel}</p>
        </div>
        {onViewAll && (
          <button
            type="button"
            onClick={onViewAll}
            className="rounded-md border border-line px-2.5 py-1 text-[12px] font-medium text-ink-secondary transition-colors duration-150 hover:bg-surface-2 hover:text-ink"
          >
            View all
          </button>
        )}
      </div>
      <ul>
        {runs.map((run) => {
          const totalTokens = (run.inputTokens ?? 0) + (run.outputTokens ?? 0);
          const share = totalTokens / maxTokens;
          const clickable = Boolean(onOpenRun);
          return (
            <li key={run._id} className="border-b border-line last:border-b-0">
              <button
                type="button"
                disabled={!clickable}
                onClick={() => onOpenRun?.(run)}
                className={cn(
                  "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-150",
                  clickable && "hover:bg-surface-2",
                  !clickable && "cursor-default",
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[13px] font-medium text-ink">
                      {agentName.get(run.agentId) ?? "Unknown agent"}
                    </span>
                    <StatusBadge tone={RUN_BADGE_TONE[run.status] ?? "neutral"}>
                      {run.status.charAt(0) + run.status.slice(1).toLowerCase()}
                    </StatusBadge>
                  </div>
                  <p className="mt-0.5 truncate font-mono text-[11px] text-ink-muted">
                    {shortSessionKey(run.sessionKey)} · {run.model}
                  </p>
                  <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-surface-2">
                    <div
                      className="h-full rounded-full bg-info-accent"
                      style={{ width: `${Math.max(share * 100, 4)}%` }}
                    />
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-mono text-[13px] font-medium text-ink">
                    {formatTokens(totalTokens)}
                  </p>
                  <p className="mt-0.5 font-mono text-[11px] text-ink-muted">
                    ${run.costUsd.toFixed(2)}
                  </p>
                </div>
                {clickable && (
                  <ChevronRight
                    className="h-4 w-4 shrink-0 text-ink-muted"
                    strokeWidth={1.75}
                    aria-hidden
                  />
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
