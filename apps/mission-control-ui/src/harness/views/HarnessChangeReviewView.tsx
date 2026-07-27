import { useAction, useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { FileSearch, RefreshCw, MessageSquare } from "lucide-react";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { HarnessPage } from "../components/HarnessUi";
import { MutationTestingPanel } from "../components/MutationTestingPanel";
import {
  HarnessChangeRiskBadge,
  evaluateChangeRisk,
} from "../components/HarnessChangeRiskBadge";
import { HarnessFirstCallout, SmallPrIncentiveCallout } from "../components/HarnessPrinciples";
import { HarnessFirstReviewModal } from "../components/HarnessFirstReviewModal";
import { HarnessMergeGatesPanel } from "../components/HarnessMergeGatesPanel";

function prDiffLines(check: { metadata?: unknown } | null | undefined): number | undefined {
  if (!check?.metadata || typeof check.metadata !== "object") return undefined;
  const n = (check.metadata as { diffLineCount?: number }).diffLineCount;
  return typeof n === "number" ? n : undefined;
}

export function HarnessChangeReviewView({
  projectId,
}: {
  projectId: Id<"projects"> | null;
}): JSX.Element {
  const sync = useMutation(api.factory.prChecks.syncFromSources);
  const ingest = useAction(api.factory.prChecks.ingestPullRequest);
  const [prUrl, setPrUrl] = useState("");
  const [ingesting, setIngesting] = useState(false);
  const [ingestMsg, setIngestMsg] = useState<string | null>(null);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);

  const latest = useQuery(
    api.factory.prChecks.getLatest,
    projectId ? { projectId } : {}
  );
  const allChecks = useQuery(
    api.factory.prChecks.listForProject,
    projectId ? { projectId, limit: 10 } : { limit: 10 }
  );
  const lenses = latest?.changeReviewLenses ?? [];
  const riskPolicy = useQuery(api.context.changeRisk.getActivePolicy, {
    projectId: projectId ?? undefined,
  });
  const risk = latest
    ? evaluateChangeRisk({
        strictness: riskPolicy?.strictness ?? 50,
        repoFullName: latest.repoFullName,
        diffLineCount: prDiffLines(latest),
        ciStatus: latest.ciStatus,
      })
    : null;

  const runIngest = async () => {
    const url = prUrl.trim();
    if (!url || ingesting) return;
    setIngesting(true);
    setIngestMsg(null);
    try {
      const result = await ingest({ prUrl: url, projectId: projectId ?? undefined });
      setIngestMsg(
        `Ingested ${result.checkCount} check runs · CI ${result.ciStatus} · ${result.diffLineCount ?? 0} diff lines`
      );
    } catch (err) {
      setIngestMsg(err instanceof Error ? err.message : "Ingest failed");
    } finally {
      setIngesting(false);
    }
  };

  return (
    <HarnessPage
      title="Change Review"
      description="Multi-lens PR review synced from GitHub Checks, codegen, tasks, and workflow CI."
      icon={<FileSearch className="h-5 w-5 text-registry-accent" />}
    >
      <div className="mx-auto max-w-[900px] space-y-4">
        <HarnessFirstCallout />
        <SmallPrIncentiveCallout />
        <div className="rounded-xl border border-line bg-surface-1 p-4">
          <div className="text-sm font-semibold text-ink">Ingest from GitHub CI</div>
          <p className="mt-1 text-xs text-ink-secondary">
            Fetches check runs and diff stats for a PR. Webhook: POST /github/webhook on your Convex site URL.
          </p>
          <div className="mt-3 flex gap-2">
            <input
              type="url"
              value={prUrl}
              onChange={(e) => setPrUrl(e.target.value)}
              placeholder="https://github.com/owner/repo/pull/123"
              className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-surface-2 px-3 text-sm text-ink"
            />
            <Button size="sm" disabled={!prUrl.trim() || ingesting} onClick={() => void runIngest()}>
              {ingesting ? "Ingesting…" : "Ingest CI"}
            </Button>
          </div>
          {ingestMsg ? <p className="mt-2 text-xs text-ink-secondary">{ingestMsg}</p> : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => void sync({ projectId: projectId ?? undefined })}
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Sync internal PR sources
          </Button>
          {latest?.prUrl ? (
            <span className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
              <a href={latest.prUrl} target="_blank" rel="noreferrer" className="text-registry-accent underline">
                Latest: {latest.repoFullName}
                {latest.prNumber ? ` #${latest.prNumber}` : ""}
              </a>
              {risk ? (
                <HarnessChangeRiskBadge
                  requiresHuman={risk.requiresHuman}
                  reason={risk.reason}
                  prLines={prDiffLines(latest)}
                />
              ) : null}
              {latest.ciRunUrl ? (
                <a href={latest.ciRunUrl} target="_blank" rel="noreferrer" className="text-registry-accent underline">
                  CI run
                </a>
              ) : null}
              <span>· {latest.ciStatus ?? "unknown"}</span>
            </span>
          ) : (
            <span className="text-xs text-ink-muted">No PR checks synced yet</span>
          )}
        </div>

        {lenses.length > 0 ? (
          lenses.map((l) => (
            <div
              key={l.id}
              className="flex items-center justify-between rounded-xl border border-line bg-surface-1 px-4 py-3"
            >
              <div>
                <div className="font-medium text-ink">{l.label}</div>
                <div className="text-xs text-ink-muted">
                  {l.enabled ? "Active on PR open" : "Disabled"}
                </div>
              </div>
              {l.score !== undefined && (
                <div className="text-lg font-semibold tabular-nums text-ok">{l.score}%</div>
              )}
            </div>
          ))
        ) : (
          <p className="text-sm text-ink-secondary">
            Ingest a GitHub PR or sync internal sources to populate review lenses.
          </p>
        )}

        <MutationTestingPanel projectId={projectId} prUrl={latest?.prUrl} />

        <HarnessMergeGatesPanel projectId={projectId} className="mt-2" />

        {latest?.prUrl ? (
          <div className="flex justify-end">
            <Button size="sm" variant="outline" onClick={() => setReviewModalOpen(true)}>
              <MessageSquare className="mr-1.5 h-3.5 w-3.5" />
              Leave PR comment (harness-first)
            </Button>
          </div>
        ) : null}

        <HarnessFirstReviewModal
          open={reviewModalOpen}
          onClose={() => setReviewModalOpen(false)}
          onProceedComment={() => {
            setReviewModalOpen(false);
            if (latest?.prUrl) window.open(latest.prUrl, "_blank", "noopener,noreferrer");
          }}
        />

        {allChecks && allChecks.length > 1 ? (
          <div className="rounded-xl border border-line bg-surface-1 p-4">
            <div className="text-sm font-semibold text-ink">Recent PR checks</div>
            <ul className="mt-2 space-y-1 text-xs text-ink-secondary">
              {allChecks.map((c) => (
                <li key={c._id}>
                  <a href={c.prUrl} target="_blank" rel="noreferrer" className="text-registry-accent underline">
                    {c.repoFullName}
                    {c.prNumber ? ` #${c.prNumber}` : ""}
                  </a>
                  {" · "}
                  {c.source} · {c.ciStatus ?? "unknown"}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </HarnessPage>
  );
}
