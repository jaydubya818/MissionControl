import { useMemo, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  Activity,
  BarChart3,
  Bot,
  CheckCircle2,
  FileCode2,
  FlaskConical,
  GitCompareArrows,
  Inbox,
  Loader2,
  RefreshCw,
  SearchCheck,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import { EmptyState } from "../components/ui/empty-state";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { RiskBadge, StatusBadge } from "../components/factory/badges";
import { cn } from "../lib/utils";
import {
  canPromoteImprovement,
  candidateStatusTone,
  type FactorySurface,
} from "./factoryLearningModel";

type LearningDashboard = FunctionReturnType<typeof api.factory.learning.getDashboard>;
type Candidate = LearningDashboard["candidates"][number];
type Experiment = LearningDashboard["experiments"][number];

export function FactoryLearningView({
  projectId,
  surface,
}: {
  projectId: Id<"projects">;
  surface: Exclude<FactorySurface, "overview">;
}) {
  const [repositoryId, setRepositoryId] = useState<Id<"workspaceRepositories"> | undefined>();
  const dashboard = useQuery(api.factory.learning.getDashboard, {
    projectId,
    repositoryId,
    limit: 75,
  });
  const refresh = useMutation(api.factory.learning.refresh);
  const reviewCandidate = useMutation(api.factory.learning.reviewCandidate);
  const approveExperiment = useAction(api.factory.learning.approveExperiment);
  const recordOutcome = useMutation(api.observability.recordExperimentOutcome);
  const promoteCandidate = useAction(api.factory.metaLoop.resolve);
  const [selectedCandidateId, setSelectedCandidateId] = useState<Id<"metaLoopSuggestions"> | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const selectedCandidate = dashboard?.candidates.find((candidate) => candidate._id === selectedCandidateId);
  const experimentById = useMemo(
    () => new Map((dashboard?.experiments ?? []).map((experiment) => [String(experiment._id), experiment])),
    [dashboard?.experiments],
  );

  const execute = async (key: string, action: () => Promise<unknown>, success: string) => {
    setBusy(key);
    setMessage(null);
    try {
      await action();
      setMessage({ tone: "success", text: success });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "The Factory Improvement action failed." });
    } finally {
      setBusy(null);
    }
  };

  if (dashboard === undefined) {
    return (
      <div className="mx-auto flex max-w-[1600px] items-center justify-center gap-2 px-6 py-24 text-[13px] text-ink-muted">
        <Loader2 size={16} className="animate-spin" /> Loading Factory Improvement evidence…
      </div>
    );
  }

  const selectedExperiment = selectedCandidate?.experimentId
    ? experimentById.get(String(selectedCandidate.experimentId))
    : undefined;

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-4 px-4 py-5 sm:px-6">
      <section className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-line bg-surface-1 p-4">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-info-accent">
            <ShieldCheck size={13} /> Advisory improvement loop
          </div>
          <h2 className="mt-1 text-[18px] font-semibold text-ink">Evidence before change</h2>
          <p className="mt-1 max-w-3xl text-[12px] leading-relaxed text-ink-secondary">
            Deterministic signals become reviewable proposals. Factory Improvement cannot accept work, change active configuration, or promote an experiment without a human decision.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {dashboard.repositories.length > 1 ? (
            <select
              aria-label="Learning repository"
              className="h-8 rounded-md border border-line bg-surface-1 px-2.5 text-[11.5px] text-ink outline-none focus:border-info-accent"
              value={repositoryId ?? dashboard.selectedRepository.repositoryId ?? ""}
              onChange={(event) => setRepositoryId(event.target.value as Id<"workspaceRepositories">)}
            >
              {dashboard.repositories.map((repository) => (
                <option key={repository._id} value={repository._id}>{repository.repository}</option>
              ))}
            </select>
          ) : (
            <span className="rounded-md border border-line bg-surface-2 px-2.5 py-1.5 font-mono text-[10.5px] text-ink-muted">
              {dashboard.selectedRepository.repositoryKey}
            </span>
          )}
          <Button
            size="sm"
            variant="outline"
            disabled={busy === "refresh"}
            onClick={() => void execute(
              "refresh",
              () => refresh({ projectId, repositoryId }),
              "Deterministic learning evidence refreshed.",
            )}
          >
            {busy === "refresh" ? <Loader2 size={13} className="mr-1.5 animate-spin" /> : <RefreshCw size={13} className="mr-1.5" />}
            Refresh evidence
          </Button>
        </div>
      </section>

      {message ? <InlineMessage {...message} onClose={() => setMessage(null)} /> : null}

      {surface === "improvements" ? (
        <ImprovementsPanel
          dashboard={dashboard}
          experimentById={experimentById}
          onSelect={setSelectedCandidateId}
        />
      ) : surface === "signals" ? (
        <SignalsPanel dashboard={dashboard} />
      ) : surface === "experiments" ? (
        <ExperimentsPanel dashboard={dashboard} />
      ) : (
        <AgentConfigurationPanel dashboard={dashboard} projectId={projectId} />
      )}

      <CandidateReviewDialog
        candidate={selectedCandidate}
        experiment={selectedExperiment}
        dashboard={dashboard}
        busy={busy}
        onClose={() => setSelectedCandidateId(null)}
        onReview={(decision, reason) => execute(
          `review:${decision}`,
          () => reviewCandidate({
            candidateId: selectedCandidate!._id,
            decision,
            reason,
            snoozedUntil: decision === "SNOOZE" ? Date.now() + 7 * 24 * 60 * 60 * 1_000 : undefined,
          }),
          decision === "SNOOZE" ? "Candidate snoozed for seven days." : `Candidate ${decision.toLowerCase()}ed with an audit reason.`,
        )}
        onApproveExperiment={(datasetId, evalDefinitionId) => execute(
          "approve-experiment",
          () => approveExperiment({
            candidateId: selectedCandidate!._id,
            datasetId,
            evalDefinitionIds: [evalDefinitionId],
            baseline: { configuration: { source: "current-baseline", frozen: true } },
            candidate: {
              configuration: {
                source: "factory-learning-candidate",
                candidateType: selectedCandidate!.candidateType,
                proposedChange: selectedCandidate!.proposedChange,
                sourceCandidateId: selectedCandidate!._id,
                acceptanceAuthority: false,
              },
            },
          }),
          "Canonical two-variant experiment created. No active configuration changed.",
        )}
        onRecordOutcome={(variants) => execute(
          "record-outcome",
          () => recordOutcome({ experimentId: selectedExperiment!._id, variants }),
          "Experiment outcomes recorded. The comparison remains advisory.",
        )}
        onPromote={() => execute(
          "promote",
          () => promoteCandidate({ suggestionId: selectedCandidate!._id, action: "ACCEPT" }),
          "Governed Mission plan submitted. A separate plan approval releases the implementation WorkOrder.",
        )}
      />
    </div>
  );
}

function ImprovementsPanel({
  dashboard,
  experimentById,
  onSelect,
}: {
  dashboard: LearningDashboard;
  experimentById: Map<string, Experiment>;
  onSelect: (id: Id<"metaLoopSuggestions">) => void;
}) {
  const open = dashboard.candidates.filter((candidate) => ["OPEN", "SNOOZED", "ACCEPTED"].includes(candidate.status));
  const ready = open.filter((candidate) => canPromoteImprovement({
    candidateStatus: candidate.status,
    experimentStatus: candidate.experimentId ? experimentById.get(String(candidate.experimentId))?.status : undefined,
  }));
  const metrics = [
    { label: "Needs review", value: open.filter((candidate) => candidate.status === "OPEN").length, icon: Inbox },
    { label: "High risk", value: open.filter((candidate) => ["HIGH", "CRITICAL"].includes(candidate.risk ?? "")).length, icon: TriangleAlert },
    { label: "Ready for work", value: ready.length, icon: CheckCircle2 },
    { label: "Evidence items", value: open.reduce((sum, candidate) => sum + (candidate.evidenceCount ?? 0), 0), icon: SearchCheck },
  ];
  return (
    <>
      <section className="grid overflow-hidden rounded-xl border border-line bg-surface-1 grid-cols-2 lg:grid-cols-4" aria-label="Improvement queue posture">
        {metrics.map(({ label, value, icon: Icon }, index) => (
          <div key={label} className={cn("px-3.5 py-3", index > 1 && "border-t border-line lg:border-t-0", index % 2 === 1 && "border-l border-line", index > 0 && "lg:border-l") }>
            <div className="flex items-center gap-1.5 text-[9.5px] uppercase tracking-[0.08em] text-ink-muted"><Icon size={11} /> {label}</div>
            <div className="mt-1.5 font-mono text-[17px] font-semibold text-ink">{value}</div>
          </div>
        ))}
      </section>
      {dashboard.candidates.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="No improvement candidates yet"
          description={`A candidate appears after ${dashboard.policy.minimumOccurrences} matching deterministic signals within ${dashboard.policy.windowDays} days. Refreshing is bounded to ${dashboard.policy.maximumSourceRows} records per source and makes no model calls.`}
        />
      ) : (
        <section className="overflow-hidden rounded-xl border border-line bg-surface-1" aria-labelledby="improvement-queue-title">
          <div className="border-b border-line px-4 py-3">
            <h2 id="improvement-queue-title" className="text-[14px] font-semibold text-ink">Improvement candidates</h2>
            <p className="mt-0.5 text-[11.5px] text-ink-muted">Ranked by recent deterministic evidence. Open a candidate to inspect lineage and make a governed decision.</p>
          </div>
          <div className="divide-y divide-line">
            {dashboard.candidates.map((candidate) => {
              const experiment = candidate.experimentId ? experimentById.get(String(candidate.experimentId)) : undefined;
              return (
                <button key={candidate._id} type="button" onClick={() => onSelect(candidate._id)} className="grid w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2/60 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-info-accent/30 md:grid-cols-[minmax(0,1fr)_150px_110px]">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-[12.5px] font-medium text-ink">{humanize(candidate.candidateType ?? candidate.kind)}</h3>
                      <StatusBadge tone={candidateStatusTone(candidate.status)}>{humanize(candidate.status)}</StatusBadge>
                      {candidate.risk ? <RiskBadge level={candidate.risk} /> : null}
                    </div>
                    <p className="mt-1 line-clamp-2 text-[11.5px] leading-relaxed text-ink-secondary">{candidate.problemStatement ?? candidate.summary}</p>
                    <div className="mt-1.5 font-mono text-[9.5px] text-ink-muted">{candidate.evidenceCount ?? 0} evidence · {Math.round((candidate.confidence ?? 0) * 100)}% confidence · no acceptance authority</div>
                  </div>
                  <div className="text-[10.5px] text-ink-muted">
                    <div className="uppercase tracking-[0.06em]">Experiment</div>
                    <div className="mt-1 text-ink-secondary">{experiment ? humanize(experiment.status) : "Not approved"}</div>
                  </div>
                  <div className="self-center text-right text-[11px] font-medium text-info-accent">Review →</div>
                </button>
              );
            })}
          </div>
        </section>
      )}
    </>
  );
}

function SignalsPanel({ dashboard }: { dashboard: LearningDashboard }) {
  return dashboard.clusters.length === 0 ? (
    <EmptyState icon={Activity} title="No recurring signal clusters" description="Refresh evidence after governed runs produce verification, quality-gate, retry, recovery, routing, or human-decision records." />
  ) : (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(380px,.9fr)]">
      <section className="overflow-hidden rounded-xl border border-line bg-surface-1">
        <div className="border-b border-line px-4 py-3"><h2 className="text-[14px] font-semibold text-ink">Recurring clusters</h2><p className="mt-0.5 text-[11.5px] text-ink-muted">Exact normalized signatures; semantic similarity is disabled in V1.</p></div>
        <div className="divide-y divide-line">
          {dashboard.clusters.map((cluster) => (
            <div key={cluster._id} className="px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2"><StatusBadge tone={cluster.occurrenceCount >= cluster.minimumOccurrences ? "warning" : "neutral"}>{humanize(cluster.signalType)}</StatusBadge><RiskBadge level={cluster.severity} /></div>
                <span className="font-mono text-[10.5px] text-ink-muted">{cluster.occurrenceCount} occurrences</span>
              </div>
              <p className="mt-2 text-[11.5px] text-ink-secondary">{cluster.reasonSummary}</p>
              <div className="mt-2 truncate font-mono text-[9.5px] text-ink-muted" title={cluster.deterministicKey}>{cluster.deterministicKey}</div>
            </div>
          ))}
        </div>
      </section>
      <section className="overflow-hidden rounded-xl border border-line bg-surface-1">
        <div className="border-b border-line px-4 py-3"><h2 className="text-[14px] font-semibold text-ink">Recent evidence</h2><p className="mt-0.5 text-[11.5px] text-ink-muted">Immutable source lineage retained with each advisory signal.</p></div>
        <div className="divide-y divide-line">
          {dashboard.signals.map((signal) => (
            <div key={signal._id} className="px-4 py-3">
              <div className="flex items-center justify-between gap-2"><span className="text-[11px] font-medium text-ink">{humanize(signal.signalType)}</span><span className="font-mono text-[9.5px] text-ink-muted">{formatRelativeTime(signal.observedAt)}</span></div>
              <p className="mt-1 line-clamp-2 text-[10.5px] leading-relaxed text-ink-secondary">{signal.reasonSummary}</p>
              <div className="mt-1 font-mono text-[9px] text-ink-muted">{signal.sourceType} · {shortId(signal.sourceId)}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function ExperimentsPanel({ dashboard }: { dashboard: LearningDashboard }) {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_360px]">
      {dashboard.experiments.length === 0 ? (
        <EmptyState icon={FlaskConical} title="No approved learning experiments" description="Approve an open candidate against a frozen eval dataset and enabled evaluator. V1 always compares exactly two variants." />
      ) : (
        <section className="overflow-hidden rounded-xl border border-line bg-surface-1">
          <div className="border-b border-line px-4 py-3"><h2 className="text-[14px] font-semibold text-ink">Governed experiments</h2><p className="mt-0.5 text-[11.5px] text-ink-muted">Canonical Observability records; small samples are labeled and never auto-promoted.</p></div>
          <div className="divide-y divide-line">
            {dashboard.experiments.map((experiment) => (
              <div key={experiment._id} className="px-4 py-4">
                <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-[12.5px] font-medium text-ink">{experiment.name}</h3><StatusBadge tone={experiment.status === "COMPLETED" ? "success" : experiment.status === "FAILED" ? "error" : "neutral"}>{humanize(experiment.status)}</StatusBadge></div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {experiment.variants.map((variant) => (
                    <Card key={variant._id} className="p-3">
                      <div className="text-[11.5px] font-medium text-ink">{variant.name}</div>
                      <dl className="mt-2 grid grid-cols-2 gap-2 text-[10px]"><Metric label="Sample" value={String(variant.sampleSize)} /><Metric label="Success" value={formatPercent(asNumber(variant.metrics?.successRate))} /><Metric label="Duration" value={formatDuration(asNumber(variant.metrics?.averageDurationMs))} /><Metric label="Cost" value={formatUsd(asNumber(variant.metrics?.averageCostUsd))} /></dl>
                    </Card>
                  ))}
                </div>
                <p className="mt-2 text-[10px] text-ink-muted">Dataset v{experiment.datasetVersion} · aggregate outcome comparison · no significance claim</p>
              </div>
            ))}
          </div>
        </section>
      )}
      <aside className="space-y-4">
        <Card className="p-4"><div className="flex items-center gap-2 text-[11px] font-medium text-ink"><BarChart3 size={14} className="text-ink-muted" /> Evaluation readiness</div><dl className="mt-3 space-y-2"><MetricRow label="Frozen datasets" value={dashboard.datasets.length} /><MetricRow label="Enabled evaluators" value={dashboard.evalDefinitions.length} /><MetricRow label="Variant count" value="Exactly 2" /><MetricRow label="Auto-promotion" value="Disabled" /></dl></Card>
        <Card className="p-4"><div className="flex items-center gap-2 text-[11px] font-medium text-ink"><GitCompareArrows size={14} className="text-ink-muted" /> Promotion rule</div><p className="mt-2 text-[11px] leading-relaxed text-ink-secondary">A completed comparison can recommend promote, hold, or reject. A human must still create governed implementation work.</p></Card>
      </aside>
    </div>
  );
}

function AgentConfigurationPanel({ dashboard, projectId }: { dashboard: LearningDashboard; projectId: Id<"projects"> }) {
  const command = `node scripts/mc-context.mjs agent-config --sync --project-id ${projectId}${dashboard.selectedRepository.repositoryId ? ` --repository-id ${dashboard.selectedRepository.repositoryId}` : ""}`;
  if (!dashboard.configuration.scan) {
    return <EmptyState icon={FileCode2} title="No agent configuration scan synced" description="Run the bounded tracked-file scanner from the repository root. It inventories hierarchy and drift but never edits source files or active harness configuration." action={<code className="block max-w-3xl overflow-x-auto rounded-lg border border-line bg-surface-2 px-3 py-2 text-left font-mono text-[10px] text-ink-secondary">{command}</code>} />;
  }
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(420px,.8fr)]">
      <section className="overflow-hidden rounded-xl border border-line bg-surface-1">
        <div className="border-b border-line px-4 py-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-[14px] font-semibold text-ink">Configuration registry</h2><p className="mt-0.5 text-[11.5px] text-ink-muted">Read-only projection at commit {shortId(dashboard.configuration.scan.commitSha, 12)}.</p></div><StatusBadge tone="neutral">{dashboard.configuration.entries.length} sources</StatusBadge></div></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-left">
            <thead className="border-b border-line bg-surface-2 text-[9.5px] uppercase tracking-[0.07em] text-ink-muted"><tr><th className="px-4 py-2.5 font-medium">Source</th><th className="px-4 py-2.5 font-medium">Harness</th><th className="px-4 py-2.5 font-medium">Kind</th><th className="px-4 py-2.5 font-medium">Scope</th><th className="px-4 py-2.5 font-medium">Directives</th></tr></thead>
            <tbody className="divide-y divide-line">
              {dashboard.configuration.entries.map((entry) => <tr key={entry._id} className="text-[10.5px]"><td className="max-w-[260px] truncate px-4 py-2.5 font-mono text-ink" title={entry.sourcePath}>{entry.sourcePath}</td><td className="px-4 py-2.5 text-ink-secondary">{humanize(entry.harness)}</td><td className="px-4 py-2.5 text-ink-secondary">{humanize(entry.kind)}</td><td className="px-4 py-2.5 font-mono text-ink-muted">{entry.scope}</td><td className="px-4 py-2.5 font-mono text-ink">{entry.directives.length}</td></tr>)}
            </tbody>
          </table>
        </div>
      </section>
      <section className="overflow-hidden rounded-xl border border-line bg-surface-1">
        <div className="border-b border-line px-4 py-3"><h2 className="text-[14px] font-semibold text-ink">Drift findings</h2><p className="mt-0.5 text-[11.5px] text-ink-muted">Contradictions are surfaced for review, never reconciled automatically.</p></div>
        {dashboard.configuration.findings.length ? <div className="divide-y divide-line">{dashboard.configuration.findings.map((finding) => <div key={finding._id} className="px-4 py-3"><div className="flex items-center gap-2"><StatusBadge tone={finding.severity === "HIGH" ? "error" : finding.severity === "WARNING" ? "warning" : "neutral"}>{finding.severity}</StatusBadge><span className="font-mono text-[10px] text-ink-muted">{humanize(finding.findingType)}</span></div><h3 className="mt-2 text-[11.5px] font-medium text-ink">{finding.summary}</h3><p className="mt-1 text-[10.5px] leading-relaxed text-ink-secondary">{finding.suggestedRemediation}</p><div className="mt-2 flex flex-wrap gap-1.5">{finding.sources.map((source) => <span key={`${finding._id}:${source.path}`} className="rounded border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[9px] text-ink-muted">{source.path}</span>)}</div></div>)}</div> : <div className="p-10 text-center text-[11.5px] text-ink-muted">No deterministic drift findings in this scan.</div>}
      </section>
    </div>
  );
}

function CandidateReviewDialog({
  candidate,
  experiment,
  dashboard,
  busy,
  onClose,
  onReview,
  onApproveExperiment,
  onRecordOutcome,
  onPromote,
}: {
  candidate?: Candidate;
  experiment?: Experiment;
  dashboard: LearningDashboard;
  busy: string | null;
  onClose: () => void;
  onReview: (decision: "DISMISS" | "REJECT" | "SNOOZE", reason: string) => Promise<void>;
  onApproveExperiment: (datasetId: Id<"evalDatasets">, evalDefinitionId: Id<"evalDefinitions">) => Promise<void>;
  onRecordOutcome: (variants: Array<{ variantId: Id<"experimentVariants">; sampleSize: number; successCount: number; averageDurationMs?: number; averageCostUsd?: number }>) => Promise<void>;
  onPromote: () => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [datasetId, setDatasetId] = useState<Id<"evalDatasets"> | "">("");
  const [definitionId, setDefinitionId] = useState<Id<"evalDefinitions"> | "">("");
  const [outcomes, setOutcomes] = useState<Record<string, { sample: string; successes: string; duration: string; cost: string }>>({});
  if (!candidate) return null;
  const reviewable = ["OPEN", "SNOOZED"].includes(candidate.status);
  const recordable = candidate.status === "ACCEPTED" && experiment?.status === "DRAFT" && experiment.variants.length === 2;
  const canRecord = recordable && experiment.variants.every((variant) => {
    const row = outcomes[String(variant._id)];
    const sample = Number(row?.sample);
    const successes = Number(row?.successes);
    return Number.isInteger(sample) && sample > 0 && Number.isInteger(successes) && successes >= 0 && successes <= sample;
  });
  return (
    <Dialog open={Boolean(candidate)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <div className="flex flex-wrap items-center gap-2 pr-8"><StatusBadge tone={candidateStatusTone(candidate.status)}>{humanize(candidate.status)}</StatusBadge>{candidate.risk ? <RiskBadge level={candidate.risk} /> : null}<span className="font-mono text-[9.5px] text-ink-muted">proposal only</span></div>
          <DialogTitle className="pt-2 text-[17px]">{humanize(candidate.candidateType ?? candidate.kind)}</DialogTitle>
          <DialogDescription>{candidate.problemStatement ?? candidate.summary}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <ReviewFact label="Proposed change" value={candidate.proposedChange ?? candidate.summary} />
          <ReviewFact label="Expected benefit" value={candidate.expectedBenefit ?? "Measure against the frozen baseline."} />
          <ReviewFact label="Evidence" value={`${candidate.evidenceCount ?? 0} items · ${Math.round((candidate.confidence ?? 0) * 100)}% confidence`} />
          <ReviewFact label="Observed cost" value={formatObservedCost(candidate.observedCostImpact)} />
        </div>
        {(candidate.sourceLinks?.length ?? 0) > 0 ? <section><h3 className="text-[10px] font-medium uppercase tracking-[0.07em] text-ink-muted">Evidence lineage</h3><div className="mt-2 flex flex-wrap gap-1.5">{candidate.sourceLinks?.map((link) => <span key={link} className="max-w-full truncate rounded border border-line bg-surface-2 px-2 py-1 font-mono text-[9.5px] text-ink-secondary" title={link}>{link}</span>)}</div></section> : null}

        {candidate.missionId && candidate.missionPlanId ? (
          <section className="rounded-xl border border-warn/30 bg-warn-soft p-4">
            <div className="flex items-center gap-2 text-[11.5px] font-medium text-ink"><ShieldCheck size={14} className="text-warn" /> Mission plan approval required</div>
            <p className="mt-1 text-[10.5px] leading-relaxed text-ink-secondary">The improvement is now a canonical Mission with a submitted Plan. A separate human plan approval must release the implementation WorkOrder; no execution has started.</p>
            <a className="mt-3 inline-flex text-[10.5px] font-medium text-accent hover:underline" href={`/v2/missions/${encodeURIComponent(String(candidate.missionId))}`}>Open governed Mission</a>
          </section>
        ) : null}

        {reviewable ? (
          <section className="rounded-xl border border-line bg-surface-1 p-4">
            <div className="flex items-center gap-2 text-[11.5px] font-medium text-ink"><FlaskConical size={14} className="text-ink-muted" /> Approve a governed experiment</div>
            <p className="mt-1 text-[10.5px] leading-relaxed text-ink-muted">Creates current-baseline and proposed-candidate variants against one frozen dataset. It does not change the live Factory.</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <select aria-label="Experiment dataset" className="h-9 rounded-md border border-line bg-surface-2 px-2.5 text-[11px] text-ink" value={datasetId} onChange={(event) => setDatasetId(event.target.value as Id<"evalDatasets">)}><option value="">Select dataset</option>{dashboard.datasets.map((dataset) => <option key={dataset._id} value={dataset._id}>{dataset.name} v{dataset.version}</option>)}</select>
              <select aria-label="Experiment evaluator" className="h-9 rounded-md border border-line bg-surface-2 px-2.5 text-[11px] text-ink" value={definitionId} onChange={(event) => setDefinitionId(event.target.value as Id<"evalDefinitions">)}><option value="">Select evaluator</option>{dashboard.evalDefinitions.map((definition) => <option key={definition._id} value={definition._id}>{definition.name} v{definition.version}</option>)}</select>
            </div>
            <Button className="mt-3" size="sm" disabled={!datasetId || !definitionId || busy !== null} onClick={() => void onApproveExperiment(datasetId as Id<"evalDatasets">, definitionId as Id<"evalDefinitions">)}>{busy === "approve-experiment" ? <Loader2 size={13} className="mr-1.5 animate-spin" /> : <FlaskConical size={13} className="mr-1.5" />}Approve experiment</Button>
            {dashboard.datasets.length === 0 || dashboard.evalDefinitions.length === 0 ? <p className="mt-2 text-[10.5px] text-warn">Create a regression dataset and enabled evaluator in Observability before approving this experiment.</p> : null}
          </section>
        ) : null}

        {experiment ? (
          <section className="rounded-xl border border-line bg-surface-1 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2 text-[11.5px] font-medium text-ink"><GitCompareArrows size={14} className="text-ink-muted" /> {experiment.name}</div><StatusBadge tone={experiment.status === "COMPLETED" ? "success" : "neutral"}>{humanize(experiment.status)}</StatusBadge></div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {experiment.variants.map((variant) => {
                const row = outcomes[String(variant._id)] ?? { sample: "", successes: "", duration: "", cost: "" };
                return <div key={variant._id} className="rounded-lg border border-line bg-surface-2 p-3"><div className="text-[11px] font-medium text-ink">{variant.name}</div>{recordable ? <div className="mt-2 grid grid-cols-2 gap-2"><OutcomeInput label="Sample" value={row.sample} onChange={(value) => setOutcomes((current) => ({ ...current, [String(variant._id)]: { ...row, sample: value } }))} /><OutcomeInput label="Successes" value={row.successes} onChange={(value) => setOutcomes((current) => ({ ...current, [String(variant._id)]: { ...row, successes: value } }))} /><OutcomeInput label="Avg ms" value={row.duration} onChange={(value) => setOutcomes((current) => ({ ...current, [String(variant._id)]: { ...row, duration: value } }))} /><OutcomeInput label="Avg USD" value={row.cost} onChange={(value) => setOutcomes((current) => ({ ...current, [String(variant._id)]: { ...row, cost: value } }))} /></div> : <dl className="mt-2 grid grid-cols-2 gap-2"><Metric label="Sample" value={String(variant.sampleSize)} /><Metric label="Success" value={formatPercent(asNumber(variant.metrics?.successRate))} /><Metric label="Duration" value={formatDuration(asNumber(variant.metrics?.averageDurationMs))} /><Metric label="Cost" value={formatUsd(asNumber(variant.metrics?.averageCostUsd))} /></dl>}</div>;
              })}
            </div>
            {recordable ? <Button className="mt-3" size="sm" variant="outline" disabled={!canRecord || busy !== null} onClick={() => void onRecordOutcome(experiment.variants.map((variant) => { const row = outcomes[String(variant._id)]; return { variantId: variant._id, sampleSize: Number(row.sample), successCount: Number(row.successes), averageDurationMs: optionalNumber(row.duration), averageCostUsd: optionalNumber(row.cost) }; }))}>{busy === "record-outcome" ? <Loader2 size={13} className="mr-1.5 animate-spin" /> : <BarChart3 size={13} className="mr-1.5" />}Record observed outcome</Button> : null}
            <p className="mt-2 text-[9.5px] text-ink-muted">Aggregate comparison only; Mission Control does not claim statistical significance or auto-promote small samples.</p>
          </section>
        ) : null}

        {reviewable ? <section><Textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Reason required for dismiss, reject, or snooze" aria-label="Candidate review reason" className="min-h-20" /><div className="mt-2 flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={!reason.trim() || busy !== null} onClick={() => void onReview("SNOOZE", reason)}>Snooze 7 days</Button><Button size="sm" variant="outline" disabled={!reason.trim() || busy !== null} onClick={() => void onReview("DISMISS", reason)}>Dismiss</Button><Button size="sm" variant="outline" disabled={!reason.trim() || busy !== null} onClick={() => void onReview("REJECT", reason)}>Reject</Button></div></section> : null}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
          {!candidate.missionPlanId && canPromoteImprovement({ candidateStatus: candidate.status, experimentStatus: experiment?.status }) ? <Button disabled={busy !== null} onClick={() => void onPromote()}>{busy === "promote" ? <Loader2 size={13} className="mr-1.5 animate-spin" /> : <Bot size={13} className="mr-1.5" />}Create governed Mission plan</Button> : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReviewFact({ label, value }: { label: string; value: string }) { return <div className="rounded-lg border border-line bg-surface-2 p-3"><div className="text-[9.5px] uppercase tracking-[0.07em] text-ink-muted">{label}</div><div className="mt-1 text-[11.5px] leading-relaxed text-ink-secondary">{value}</div></div>; }
function Metric({ label, value }: { label: string; value: string }) { return <div><dt className="text-[9px] uppercase tracking-[0.06em] text-ink-muted">{label}</dt><dd className="mt-0.5 font-mono text-[10.5px] text-ink">{value}</dd></div>; }
function MetricRow({ label, value }: { label: string; value: string | number }) { return <div className="flex items-center justify-between gap-3 border-t border-line pt-2 first:border-t-0 first:pt-0"><dt className="text-[10.5px] text-ink-muted">{label}</dt><dd className="font-mono text-[10.5px] text-ink">{value}</dd></div>; }
function OutcomeInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="text-[9px] uppercase tracking-[0.05em] text-ink-muted">{label}<Input type="number" min="0" step="any" className="mt-1 h-8 font-mono text-[10px]" value={value} onChange={(event) => onChange(event.target.value)} /></label>; }
function InlineMessage({ tone, text, onClose }: { tone: "success" | "error"; text: string; onClose: () => void }) { return <div className={cn("flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-[11.5px]", tone === "error" ? "border-err/30 bg-err-soft text-err" : "border-ok/30 bg-ok-soft text-ok")} role={tone === "error" ? "alert" : "status"}><span>{text}</span><button type="button" className="text-[10px] underline" onClick={onClose}>Dismiss</button></div>; }
function asNumber(value: unknown) { return typeof value === "number" && Number.isFinite(value) ? value : undefined; }
function optionalNumber(value: string) { const number = Number(value); return value.trim() && Number.isFinite(number) ? number : undefined; }
function humanize(value: string) { return value.toLowerCase().replace(/_/g, " ").replace(/(^|\s)\w/g, (character) => character.toUpperCase()); }
function shortId(value: string, length = 10) { return value.length > length ? `${value.slice(0, length)}…` : value; }
function formatPercent(value?: number) { return value === undefined ? "—" : `${(value * 100).toFixed(1)}%`; }
function formatDuration(value?: number) { return value === undefined ? "—" : value < 1_000 ? `${Math.round(value)} ms` : `${(value / 1_000).toFixed(1)} s`; }
function formatUsd(value?: number) { return value === undefined ? "—" : `$${value.toFixed(3)}`; }
function formatRelativeTime(value: number) { const minutes = Math.max(0, Math.floor((Date.now() - value) / 60_000)); return minutes < 60 ? `${minutes}m ago` : minutes < 1_440 ? `${Math.floor(minutes / 60)}h ago` : `${Math.floor(minutes / 1_440)}d ago`; }
function formatObservedCost(value: Candidate["observedCostImpact"]) { if (!value) return "No cost metadata recorded"; return [value.modelCalls !== undefined ? `${value.modelCalls} model calls` : null, value.tokens !== undefined ? `${value.tokens.toLocaleString()} tokens` : null, value.costUsd !== undefined ? formatUsd(value.costUsd) : null].filter(Boolean).join(" · ") || "No cost metadata recorded"; }
