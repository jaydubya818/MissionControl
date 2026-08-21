import { useEffect, useMemo, useState } from "react";
import { useAction, useQuery } from "convex/react";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  GitPullRequest,
  Link2,
  Loader2,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/factory/badges";
import { useToast } from "../../Toast";
import { cn } from "@/lib/utils";
import { safeExternalUrl } from "../../lib/safeExternalUrl";

function shortSha(value?: string) {
  return value ? value.slice(0, 8) : "not recorded";
}

export function PrEvidenceReconciliationInbox({
  projectId,
}: {
  projectId: Id<"projects"> | null;
}) {
  const unresolved = useQuery(
    api.factory.prChecks.listUncorrelated,
    projectId ? { projectId, limit: 20 } : "skip"
  );
  const history = useQuery(
    api.factory.prChecks.listReconciliationHistory,
    projectId ? { projectId, limit: 5 } : "skip"
  );
  const reconcile = useAction(api.factory.prChecks.reconcileEvidence);
  const { toast } = useToast();
  const [selectedEvaluationId, setSelectedEvaluationId] = useState<Id<"harnessPrChecks"> | null>(null);
  const [selectedWorkOrderId, setSelectedWorkOrderId] = useState<Id<"workOrders"> | null>(null);
  const [selectedWorkflowRunId, setSelectedWorkflowRunId] = useState<Id<"workflowRuns"> | null>(null);
  const [reason, setReason] = useState("");
  const [busyDecision, setBusyDecision] = useState<"LINKED" | "DISMISSED" | null>(null);
  const [pendingDecision, setPendingDecision] = useState<"LINKED" | "DISMISSED" | null>(null);

  useEffect(() => {
    if (!unresolved?.length) {
      setSelectedEvaluationId(null);
      return;
    }
    if (!selectedEvaluationId || !unresolved.some((item) => item._id === selectedEvaluationId)) {
      setSelectedEvaluationId(unresolved[0]._id);
      setSelectedWorkOrderId(null);
      setSelectedWorkflowRunId(null);
      setReason("");
      setPendingDecision(null);
    }
  }, [selectedEvaluationId, unresolved]);

  const selectedEvidence = unresolved?.find((item) => item._id === selectedEvaluationId);
  const candidates = useQuery(
    api.factory.prChecks.getReconciliationCandidates,
    projectId && selectedEvaluationId
      ? { projectId, evaluationId: selectedEvaluationId }
      : "skip"
  );
  const eligibleCandidates = useMemo(
    () => (candidates ?? []).filter((candidate) => candidate.eligible),
    [candidates]
  );
  const selectedCandidate = candidates?.find(
    (candidate) => candidate.workOrderId === selectedWorkOrderId
      && candidate.workflowRunId === selectedWorkflowRunId
  );

  const decide = async (decision: "LINKED" | "DISMISSED") => {
    if (!projectId || !selectedEvidence || reason.trim().length < 10) return;
    if (decision === "LINKED" && (!selectedCandidate?.eligible || !selectedCandidate.workflowRunId)) return;
    setBusyDecision(decision);
    try {
      await reconcile({
        projectId,
        evaluationId: selectedEvidence._id,
        decision,
        workOrderId: decision === "LINKED" ? selectedCandidate?.workOrderId : undefined,
        workflowRunId: decision === "LINKED" ? selectedCandidate?.workflowRunId : undefined,
        reason: reason.trim(),
        idempotencyKey: [
          "pr-evidence-reconciliation",
          selectedEvidence._id,
          decision,
          decision === "LINKED" ? selectedCandidate?.workOrderId : "none",
          decision === "LINKED" ? selectedCandidate?.workflowRunId : "none",
        ].join(":"),
      });
      toast(decision === "LINKED"
        ? "PR evidence linked to exact WorkOrder and Attempt lineage."
        : "PR evidence marked reviewed and retained in reconciliation history.");
      setSelectedWorkOrderId(null);
      setSelectedWorkflowRunId(null);
      setReason("");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not reconcile PR evidence", true);
    } finally {
      setBusyDecision(null);
    }
  };

  if (!projectId) return null;

  return (
    <section
      className="rounded-xl border border-line bg-surface-1 p-5"
      aria-labelledby="evidence-reconciliation-title"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warn" aria-hidden />
            <h2 id="evidence-reconciliation-title" className="text-[18px] font-semibold text-ink">
              Evidence reconciliation
            </h2>
            {unresolved !== undefined && (
              <StatusBadge tone={unresolved.length ? "warning" : "success"}>
                {unresolved.length} unresolved
              </StatusBadge>
            )}
          </div>
          <p className="mt-1 max-w-[78ch] text-[12.5px] text-ink-secondary">
            Valid PR and CI evidence stays quarantined until one authorized operator confirms exact workspace,
            repository, branch, WorkOrder, and producing Attempt lineage.
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-[11.5px] text-ink-muted">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
          Immutable decision record
        </div>
      </div>

      {unresolved === undefined ? (
        <div className="mt-4 grid gap-3 lg:grid-cols-[0.8fr_1.2fr]" aria-label="Loading evidence reconciliation">
          <div className="h-28 animate-pulse rounded-lg bg-surface-2" />
          <div className="h-28 animate-pulse rounded-lg bg-surface-2" />
        </div>
      ) : unresolved.length === 0 ? (
        <div className="mt-4 rounded-lg border border-ok/25 bg-ok/5 px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-medium text-ink">
            <CheckCircle2 className="h-4 w-4 text-ok" aria-hidden />
            No uncorrelated PR evidence requires attention
          </div>
          <p className="mt-1 text-xs text-ink-secondary">
            New unmatched webhook or CI records will appear here without changing delivery history.
          </p>
        </div>
      ) : (
        <div className="mt-4 grid min-h-[320px] gap-4 lg:grid-cols-[minmax(260px,0.72fr)_minmax(0,1.28fr)]">
          <div className="max-h-[560px] space-y-2 overflow-y-auto pr-1" aria-label="Uncorrelated PR evidence" tabIndex={0}>
            {unresolved.map((evidence) => {
              const active = evidence._id === selectedEvaluationId;
              return (
                <button
                  key={evidence._id}
                  type="button"
                  onClick={() => {
                    setSelectedEvaluationId(evidence._id);
                    setSelectedWorkOrderId(null);
                    setSelectedWorkflowRunId(null);
                    setReason("");
                  }}
                  className={cn(
                    "w-full rounded-lg border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-registry-accent",
                    active
                      ? "border-registry-accent/50 bg-registry-accent-soft"
                      : "border-line bg-surface-2 hover:border-line-strong"
                  )}
                  aria-pressed={active}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-ink">
                        {evidence.repoFullName}{evidence.prNumber ? ` #${evidence.prNumber}` : ""}
                      </div>
                      <div className="mt-1 truncate text-[11.5px] text-ink-muted">
                        {evidence.branch ?? "Branch not recorded"} · {shortSha(evidence.headSha)}
                      </div>
                    </div>
                    <StatusBadge tone={evidence.ciStatus === "PASS" ? "success" : evidence.ciStatus === "FAIL" ? "error" : "warning"}>
                      CI {evidence.ciStatus ?? "UNKNOWN"}
                    </StatusBadge>
                  </div>
                </button>
              );
            })}
          </div>

          {selectedEvidence && (
            <div className="rounded-lg border border-line bg-surface-2 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <GitPullRequest className="h-4 w-4 text-registry-accent" aria-hidden />
                    <h3 className="text-sm font-semibold text-ink">
                      Select exact producing lineage
                    </h3>
                  </div>
                  <p className="mt-1 text-xs text-ink-secondary">
                    Candidates are workspace-scoped and ranked by deterministic evidence signals.
                  </p>
                </div>
                <a
                  href={safeExternalUrl(selectedEvidence.prUrl)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-registry-accent underline"
                >
                  Open PR <ExternalLink className="h-3 w-3" aria-hidden />
                </a>
              </div>

              {candidates === undefined ? (
                <div className="mt-4 flex items-center gap-2 text-xs text-ink-muted">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  Evaluating exact candidates…
                </div>
              ) : candidates.length === 0 ? (
                <div className="mt-4 rounded-lg border border-warn/25 bg-warn/5 p-3 text-xs text-ink-secondary">
                  No WorkOrder candidates exist in this workspace. Keep the evidence unresolved until governed work is available.
                </div>
              ) : (
                <div className="mt-4 max-h-[340px] space-y-2 overflow-y-auto pr-1" aria-label="Reconciliation candidates" tabIndex={0}>
                  {candidates.map((candidate) => {
                    const active = candidate.workOrderId === selectedWorkOrderId
                      && candidate.workflowRunId === selectedWorkflowRunId;
                    return (
                      <button
                        key={`${candidate.workOrderId}:${candidate.workflowRunId ?? "no-attempt"}`}
                        type="button"
                        disabled={!candidate.eligible}
                        onClick={() => {
                          setSelectedWorkOrderId(candidate.workOrderId);
                          setSelectedWorkflowRunId(candidate.workflowRunId ?? null);
                        }}
                        className={cn(
                          "w-full rounded-lg border p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-registry-accent",
                          candidate.eligible
                            ? active
                              ? "border-registry-accent/50 bg-registry-accent-soft"
                              : "border-line bg-surface-1 hover:border-line-strong"
                            : "cursor-not-allowed border-line/70 bg-surface-1/60 opacity-75"
                        )}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <div className="text-[13px] font-medium text-ink">{candidate.title}</div>
                            <div className="mt-0.5 text-[11px] text-ink-muted">
                              {candidate.workflowRunLabel
                                ? `Attempt ${candidate.workflowRunLabel} · ${candidate.workflowRunStatus}`
                                : "No producing Attempt"}
                            </div>
                          </div>
                          <StatusBadge tone={candidate.eligible ? "success" : "neutral"}>
                            {candidate.eligible ? "Exact candidate" : "Not eligible"}
                          </StatusBadge>
                        </div>
                        <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                          {candidate.signals.map((signal) => (
                            <li key={signal.key} className="flex items-start gap-1.5 text-[11px] text-ink-secondary">
                              {signal.matches
                                ? <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-ok" aria-hidden />
                                : <XCircle className="mt-0.5 h-3 w-3 shrink-0 text-danger" aria-hidden />}
                              <span><span className="font-medium text-ink">{signal.label}:</span> {signal.detail}</span>
                            </li>
                          ))}
                        </ul>
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="mt-4 border-t border-line pt-4">
                <Label htmlFor="reconciliation-reason">Operator reason</Label>
                <Textarea
                  id="reconciliation-reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Explain why this evidence belongs to the selected Attempt, or why it should be dismissed."
                  className="mt-1.5 min-h-20"
                />
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] text-ink-muted" aria-live="polite">
                    {eligibleCandidates.length} exact candidate{eligibleCandidates.length === 1 ? "" : "s"} · reason must be at least 10 characters
                  </span>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={Boolean(busyDecision) || reason.trim().length < 10}
                      onClick={() => setPendingDecision("DISMISSED")}
                    >
                      {busyDecision === "DISMISSED" && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />}
                      Mark reviewed
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={Boolean(busyDecision) || reason.trim().length < 10 || !selectedCandidate?.eligible}
                      onClick={() => setPendingDecision("LINKED")}
                    >
                      {busyDecision === "LINKED"
                        ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
                        : <Link2 className="mr-1.5 h-3.5 w-3.5" aria-hidden />}
                      Link exact evidence
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {history && history.length > 0 && (
        <details className="mt-4 border-t border-line pt-3">
          <summary className="cursor-pointer text-xs font-medium text-ink-secondary">
            Recent immutable decisions ({history.length})
          </summary>
          <ul className="mt-2 space-y-1.5">
            {history.map((decision) => (
              <li key={decision._id} className="flex flex-wrap items-center justify-between gap-2 text-[11.5px] text-ink-secondary">
                <span>{decision.evidenceSnapshot.repoFullName} · {decision.decision.toLowerCase()} · {decision.reason}</span>
                <time dateTime={new Date(decision.decidedAt).toISOString()} className="text-ink-muted">
                  {new Date(decision.decidedAt).toLocaleString()}
                </time>
              </li>
            ))}
          </ul>
        </details>
      )}

      <Dialog open={pendingDecision !== null} onOpenChange={(open) => { if (!open && !busyDecision) setPendingDecision(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {pendingDecision === "LINKED" ? "Link this evidence permanently?" : "Dismiss this evidence from the inbox?"}
            </DialogTitle>
            <DialogDescription>
              {pendingDecision === "LINKED"
                ? "This creates an immutable decision and makes the selected WorkOrder and Attempt authoritative for this PR/CI record."
                : "This creates an immutable dismissal record. It does not delete the PR/CI evidence or rewrite delivery history."}
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-line bg-surface-2 p-3 text-xs text-ink-secondary">
            <span className="font-medium text-ink">Retained reason:</span> {reason.trim()}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={Boolean(busyDecision)} onClick={() => setPendingDecision(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={Boolean(busyDecision)}
              onClick={() => pendingDecision && void decide(pendingDecision)}
            >
              {busyDecision && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />}
              Confirm {pendingDecision === "LINKED" ? "link" : "dismissal"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
