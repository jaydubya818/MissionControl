import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { MERGE_GATES } from "@/lib/harnessArchitect";
import { CheckCircle2, Shield, Terminal, Bug, FileCode, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { safeExternalUrl } from "../../lib/safeExternalUrl";

const GATE_ICONS = {
  "code-review": FileCode,
  adversarial: Bug,
  "ux-review": Terminal,
  "ci-security": Shield,
  "skill-check": CheckCircle2,
} as const;

export function HarnessMergeGatesPanel({
  projectId,
  cycleId,
  passedIds,
  className,
}: {
  projectId?: Id<"projects"> | null;
  cycleId?: Id<"loopEngineeringCycles"> | null;
  passedIds?: string[];
  className?: string;
}): JSX.Element {
  const live = useQuery(
    api.factory.prChecks.getMergeGateStatus,
    projectId !== undefined
      ? {
          projectId: projectId ?? undefined,
          cycleId: cycleId ?? undefined,
        }
      : {}
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

  if (projectId !== undefined && live && !live.prUrl) {
    return (
      <div className={cn("rounded-xl border border-line bg-surface-2 px-4 py-5", className)}>
        <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
          {live.scopeLabel}
        </div>
        <h3 className="mt-1 text-[15px] font-semibold text-ink">
          {live.scope === "CYCLE" ? "No correlated PR for this cycle" : "No PR evidence in this workspace"}
        </h3>
        <p className="mt-1 max-w-[72ch] text-[12.5px] text-ink-secondary">
          {live.scope === "CYCLE"
            ? "Mission Control will not substitute the workspace's latest PR. Record an explicit WorkOrder and Attempt artifact, or ingest an exact recorded branch match."
            : "Ingest a PR before evaluating the outer loop. Unmatched PRs remain uncorrelated and cannot change WorkOrder state."}
        </p>
      </div>
    );
  }

  return (
    <section className={cn("space-y-4", className)}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-semibold text-ink">Five merge gates</h3>
          {live?.scopeLabel ? (
            <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
              {live.scopeLabel}
            </p>
          ) : null}
          <p className="mt-0.5 text-[12.5px] text-ink-muted">
            {safeExternalUrl(live?.prUrl) ? (
              <>
                Live from{" "}
                <a href={safeExternalUrl(live.prUrl)} target="_blank" rel="noreferrer" className="text-registry-accent underline">
                  {live.scope === "WORKSPACE_LATEST" ? "workspace latest PR (unscoped)" : "correlated PR"}
                </a>
              </>
            ) : (
              "All must pass before merge eligibility; failed evidence routes back to correction."
            )}
          </p>
          {live?.headSha && (
            <p className="mt-1 font-mono text-[11px] text-ink-muted">
              Head {live.headSha.slice(0, 12)} · CI {live.ciStatus ?? "UNKNOWN"}
              {live.workOrderId ? ` · WorkOrder ${String(live.workOrderId).slice(0, 10)}` : " · lineage unavailable"}
            </p>
          )}
          {live?.mergedAt && (
            <p className="mt-1 text-[11px] text-ok">
              Merge recorded by {live.mergeActor} · {live.mergeCommitSha?.slice(0, 12)} · {new Date(live.mergedAt).toLocaleString()}
            </p>
          )}
        </div>
        {allPass ? (
          <span className="registry-delta">Gate evidence complete</span>
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
