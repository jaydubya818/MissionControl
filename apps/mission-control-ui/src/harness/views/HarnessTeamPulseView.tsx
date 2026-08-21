import { useQuery } from "convex/react";
import { Radio, TrendingUp } from "lucide-react";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { HarnessPage } from "../components/HarnessUi";
import { TeamSyncCallout } from "../components/HarnessPrinciples";
import { safeExternalUrl } from "../../lib/safeExternalUrl";

export function HarnessTeamPulseView({
  projectId,
}: {
  projectId: Id<"projects"> | null;
}): JSX.Element {
  const pulse = useQuery(api.factory.health.teamPulse, {
    projectId: projectId ?? undefined,
  });
  const health = useQuery(api.factory.health.getFactoryHealth, {
    projectId: projectId ?? undefined,
    periodDays: 7,
  });

  return (
    <HarnessPage
      title="Team Pulse"
      description="Communication is the bottleneck — PR velocity, active work, and who-shipped-what visibility."
      icon={<Radio className="h-5 w-5 text-registry-accent" />}
    >
      <div className="mx-auto flex max-w-[1000px] flex-col gap-6">
        {!pulse ? (
          <p className="text-sm text-ink-muted">Loading team pulse…</p>
        ) : (
          <>
            {pulse.communicationRisk ? (
              <TeamSyncCallout />
            ) : (
              <p className="text-sm text-ink-secondary">{pulse.suggestedAction}</p>
            )}

            <div className="grid gap-3 sm:grid-cols-3">
              <PulseCard
                label="PRs this week"
                value={pulse.prsThisWeek}
                sub={`${pulse.prGrowthPct >= 0 ? "+" : ""}${pulse.prGrowthPct}% vs prior week`}
                highlight={pulse.communicationRisk}
              />
              <PulseCard label="In progress" value={pulse.activeByStatus.inProgress} />
              <PulseCard label="In review" value={pulse.activeByStatus.review} />
            </div>

            {health?.metrics && (
              <div className="grid gap-3 sm:grid-cols-2">
                <PulseCard
                  label="Human PR comments (7d)"
                  value={health.metrics.humanPrComments}
                  sub="Drive down via outer loop + verifiers"
                />
                <PulseCard
                  label="Agent-initiated PRs"
                  value={health.metrics.agentInitiatedPrs}
                  sub="Drive up via maintenance agents"
                />
              </div>
            )}

            <div className="rounded-xl border border-line bg-surface-1 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-ink">
                <TrendingUp className="h-4 w-4 text-registry-accent" aria-hidden />
                Recent PR activity
              </div>
              {pulse.recentPrs.length === 0 ? (
                <p className="mt-2 text-xs text-ink-muted">
                  No PR checks synced yet. Use Change Review → Ingest CI.
                </p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {pulse.recentPrs.map((pr) => (
                    <li key={pr.prUrl} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <a href={safeExternalUrl(pr.prUrl)} target="_blank" rel="noreferrer" className="text-registry-accent underline">
                        {pr.repoFullName}
                      </a>
                      <span className="text-ink-muted">
                        {pr.title ?? "PR"} · {pr.ciStatus ?? "unknown"} ·{" "}
                        {new Date(pr.syncedAt).toLocaleDateString()}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-xl border border-line bg-surface-2 p-4 text-xs text-ink-secondary">
              <strong className="text-ink">Area ownership review (scale target):</strong> shift from
              reviewing every PR to owning a domain — review every 50–60 PRs or on quality metric
              drift. Agent review catches low-hanging fruit before humans build + click-through.
            </div>
          </>
        )}
      </div>
    </HarnessPage>
  );
}

function PulseCard({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: number;
  sub?: string;
  highlight?: boolean;
}): JSX.Element {
  return (
    <div
      className={`rounded-xl border p-4 ${
        highlight ? "border-warn/40 bg-warn/5" : "border-line bg-surface-1"
      }`}
    >
      <div className="text-[11px] uppercase tracking-wide text-ink-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-ink">{value}</div>
      {sub ? <div className="mt-1 text-[11px] text-ink-secondary">{sub}</div> : null}
    </div>
  );
}
