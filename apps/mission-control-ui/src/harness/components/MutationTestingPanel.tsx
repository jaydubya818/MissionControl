import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { safeExternalUrl } from "../../lib/safeExternalUrl";

export function MutationTestingPanel({
  projectId,
  prUrl,
}: {
  projectId?: Id<"projects"> | null;
  prUrl?: string;
}): JSX.Element {
  const byUrl = useQuery(
    api.factory.prChecks.getByPrUrl,
    prUrl ? { prUrl } : "skip"
  );
  const latest = useQuery(
    api.factory.prChecks.getLatest,
    !prUrl && projectId ? { projectId } : "skip"
  );
  const check = prUrl ? byUrl : latest;
  const report = check?.mutationTesting;
  const findings = report?.findings ?? [];
  const coverage = report?.diffCoveragePct ?? 0;

  if (check === undefined) {
    return (
      <div className="registry-mutation-panel rounded-xl border border-line bg-surface-1 p-4 text-xs text-ink-muted">
        Loading mutation testing report…
      </div>
    );
  }

  if (!check) {
    return (
      <div className="registry-mutation-panel rounded-xl border border-line bg-surface-1 p-4">
        <div className="text-sm font-semibold text-ink">Mutation testing (PR diff)</div>
        <p className="mt-2 text-xs text-ink-secondary">
          No PR check synced yet. Open Change Review and run sync, or link a PR to a workflow run.
        </p>
      </div>
    );
  }

  return (
    <div className="registry-mutation-panel rounded-xl border border-line bg-surface-1 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-semibold text-ink">Mutation testing (PR diff)</div>
        {safeExternalUrl(check.prUrl) ? (
          <a
            href={safeExternalUrl(check.prUrl)}
            target="_blank"
            rel="noreferrer"
            className="text-[11px] text-registry-accent underline"
          >
            {check.repoFullName}
            {check.prNumber ? ` #${check.prNumber}` : ""}
          </a>
        ) : null}
      </div>
      <p className="mt-1 text-xs text-ink-secondary">
        Synced from {check.source.toLowerCase()} · CI {check.ciStatus ?? "unknown"}
      </p>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full rounded-full bg-ok"
          style={{ width: `${Math.min(100, coverage)}%` }}
        />
      </div>
      <div className="mt-1 text-xs text-ink-muted">Diff coverage {coverage}%</div>
      {findings.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {findings.map((f) => (
            <li key={f.id} className="flex items-center justify-between rounded-lg border border-line px-3 py-2 text-xs">
              <span className="text-ink-secondary">{f.mutation}</span>
              <span className={f.caught ? "text-ok" : "text-warn"}>{f.caught ? "Caught" : "Missed"}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-xs text-ink-muted">No mutation findings recorded for this PR.</p>
      )}
    </div>
  );
}
