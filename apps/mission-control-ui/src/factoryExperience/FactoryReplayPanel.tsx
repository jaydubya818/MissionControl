import { useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { FactoryPreviewBoundary } from "./FactoryPreviewBoundary";

export function FactoryReplayPanel({ experimentId, experimentStatus, hasManifest, canFreeze }: {
  experimentId: Id<"experiments">; experimentStatus: string; hasManifest: boolean; canFreeze: boolean;
}) {
  const [open, setOpen] = useState(false);
  if (!hasManifest && !canFreeze) return null;
  return <section className="mt-3 rounded-lg border border-line bg-surface-2 p-3" aria-label="Frozen workload replay">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h4 className="text-xs font-semibold text-ink">Frozen workload replay <span className="font-normal text-ink-muted">· Preview</span></h4>
      <Button size="sm" variant="outline" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? "Hide replay" : "Review replay"}</Button>
    </div>
    {open ? <FactoryPreviewBoundary key={experimentId} label="Replay"><ReplayDetails experimentId={experimentId} experimentStatus={experimentStatus} hasManifest={hasManifest} /></FactoryPreviewBoundary> : null}
  </section>;
}

function ReplayDetails({ experimentId, experimentStatus, hasManifest }: {
  experimentId: Id<"experiments">; experimentStatus: string; hasManifest: boolean;
}) {
  const review = useQuery(api.factory.replay.getReview, { experimentId });
  const freeze = useMutation(api.factory.replay.freeze);
  const prepare = useMutation(api.factory.replay.prepareCase);
  const reconcile = useMutation(api.factory.replay.reconcile);
  const dispatch = useAction(api.factory.replay.dispatchPending);
  const [minimumPairs, setMinimumPairs] = useState("1");
  const [maxAttempts, setMaxAttempts] = useState("1");
  const [busy, setBusy] = useState(false);
  const [cursor, setCursor] = useState<number | null>(0);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  const [blocked, setBlocked] = useState<string[]>([]);
  const closed = ["COMPLETED", "CANCELED"].includes(experimentStatus);
  async function act(operation: () => Promise<unknown>, success: string) {
    setBusy(true); setMessage(null);
    try { await operation(); setMessage({ error: false, text: success }); }
    catch (error) { setMessage({ error: true, text: error instanceof Error ? error.message : "The replay action failed." }); }
    finally { setBusy(false); }
  }
  const validLimits = Number.isSafeInteger(Number(minimumPairs)) && Number(minimumPairs) >= 1 && Number(minimumPairs) <= 50
    && Number.isSafeInteger(Number(maxAttempts)) && Number(maxAttempts) >= 1 && Number(maxAttempts) <= 5;
  return <div className="mt-3 space-y-3">
    {message ? <p role={message.error ? "alert" : "status"} className="break-words text-xs text-ink-secondary">{message.text}</p> : null}
    {review === undefined ? <p role="status" className="text-xs text-ink-muted">Loading current replay evidence…</p> : !review ? <>
      <p className="text-xs text-ink-secondary">Freeze the current dataset, exact Factory Versions, and evaluator definitions before preparing fresh WorkOrders. Existing approvals are not copied.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-xs text-ink-muted">Minimum matched pairs<Input type="number" min={1} max={50} step={1} value={minimumPairs} onChange={(event) => setMinimumPairs(event.target.value)} /></label>
        <label className="text-xs text-ink-muted">Maximum attempts per case<Input type="number" min={1} max={5} step={1} value={maxAttempts} onChange={(event) => setMaxAttempts(event.target.value)} /></label>
      </div>
      <Button size="sm" disabled={busy || hasManifest || experimentStatus !== "DRAFT" || !validLimits} onClick={() => void act(() => freeze({ experimentId,
        minimumPairs: Number(minimumPairs), maxAttemptsPerCase: Number(maxAttempts) }), "The replay definition is frozen. Prepare its cases before dispatch.")}>Freeze replay definition</Button>
    </> : <>
      <p className="text-xs text-ink-secondary">{review.comparison.matchedPairs} of {review.comparison.denominator} matched case pairs · minimum {review.comparison.minimumPairs} · {review.comparison.sampleSufficient ? "Declared sample threshold met" : "Evidence incomplete or sample threshold unmet"}</p>
      <p className="text-xs text-ink-secondary">{review.comparison.recommendation.recommendation.replace(/_/g, " ")}</p>
      {review.comparison.recommendation.comparisonWarnings.length ? <ul className="list-inside list-disc text-xs text-ink-muted">{review.comparison.recommendation.comparisonWarnings.map((warning) => <li key={warning}>{warning}</li>)}</ul> : null}
      <ul className="divide-y divide-line">{review.cases.map((entry) => {
        const variant = review.manifest.definition.variants.find((item) => item.id === entry.variantId);
        const workload = review.manifest.definition.cases.find((item) => item.key === entry.caseKey);
        return <li key={`${entry.variantId}:${entry.caseKey}`} className="space-y-1 py-3">
          <h5 className="break-words text-xs font-medium text-ink">{variant?.name ?? "Variant"} · {workload?.workload.title ?? entry.caseKey}</h5>
          <p className="text-xs text-ink-secondary">{entry.state} · {entry.implementationAttempts} implementation attempts · {entry.failedAttemptIds.length} retained failures</p>
          <p className="text-xs text-ink-muted">Attempt cost: {entry.costUsd === null ? "Unknown" : `$${entry.costUsd.toFixed(3)}`} · Owner interventions: {entry.ownerInterventions ?? "Unknown"} · Outside-factory assistant interventions: {entry.assistantOutsideFactoryInterventions ?? "Unknown"}</p>
          {entry.unattributedEvaluatorCostIds.length ? <p className="text-xs text-ink-muted">Evaluator cost remains unattributed.</p> : null}
          {entry.reasons.length ? <p className="break-words text-xs text-ink-secondary">{entry.reasons.join(" · ")}</p> : null}
          {entry.state === "UNBOUND" ? <Button size="sm" variant="outline" disabled={busy || closed} onClick={() => void act(() => prepare({ manifestId: review.manifest._id,
            variantId: entry.variantId as Id<"experimentVariants">, caseKey: entry.caseKey }), "A fresh WorkOrder was prepared. Current policy and admission still govern dispatch.")}>Prepare case</Button> : null}
        </li>;
      })}</ul>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={busy || closed || cursor === null} onClick={() => void act(async () => {
          const result = await dispatch({ manifestId: review.manifest._id, cursor: cursor ?? 0, limit: 10 });
          setCursor(result.nextCursor);
          setBlocked(result.results.filter((entry) => entry.status === "BLOCKED").map((entry) => `${entry.caseKey}: ${entry.reason ?? "Dispatch refused"}`));
          return result;
        }, "The bounded batch was checked. Current case evidence and any blocked reasons are shown below.")}>Dispatch batch{cursor === null ? " complete" : ` from ${cursor + 1}`}</Button>
        <Button size="sm" variant="outline" disabled={busy || closed || cursor === 0} onClick={() => { setCursor(0); setBlocked([]); }}>Recheck from first case</Button>
        <Button size="sm" variant="outline" disabled={busy || experimentStatus === "CANCELED"} onClick={() => void act(() => reconcile({ manifestId: review.manifest._id }), "Comparison refreshed from current canonical records.")}>Reconcile evidence</Button>
      </div>
      {blocked.length ? <ul aria-label="Blocked replay cases" className="list-inside list-disc break-words text-xs text-ink-secondary">{blocked.map((reason) => <li key={reason}>{reason}</li>)}</ul> : null}
    </>}
    <p className="text-xs text-ink-muted">Replay does not establish release acceptance or unattended completion. Missing cost or intervention evidence stays unknown. Failed attempts require an explicit bounded retry; no promotion happens here.</p>
  </div>;
}
