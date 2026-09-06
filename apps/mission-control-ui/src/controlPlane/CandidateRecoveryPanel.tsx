import { useState } from "react";
import { Button } from "@/components/ui/button";

export function CandidateRecoveryPanel({ candidateRevision, publicationUncertain, onRecover }: {
  candidateRevision?: string;
  publicationUncertain: boolean;
  onRecover: () => Promise<unknown>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  return <div className="rounded-xl border border-warning/35 bg-warning/5 p-4" role="alert" aria-label="Candidate recovery required">
    <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h3 className="text-sm font-semibold text-foreground">{publicationUncertain ? "Publication outcome needs reconciliation" : "Independent verification has not started"}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{publicationUncertain
          ? "Inspect GitHub for this exact candidate. Recovery will not push a branch or create another pull request."
          : "Resolve the Verification Factory readiness issue, then retry dispatch for this captured candidate."}</p>
        <p className="mt-2 break-all font-mono text-xs text-muted-foreground">Candidate: {candidateRevision ?? "Unavailable"}</p>
      </div>
      <Button size="sm" className="shrink-0" disabled={busy || !candidateRevision} onClick={async () => {
        setError(null); setNotice(null); setBusy(true);
        try {
          await onRecover();
          setNotice(publicationUncertain ? "Read-only publication reconciliation queued. Inspect the Attempt for its result." : "Independent verification dispatch queued.");
        } catch (cause) { setError(cause instanceof Error ? cause.message : "Recovery could not be queued."); }
        finally { setBusy(false); }
      }}>{busy ? "Queuing recovery…" : publicationUncertain ? "Reconcile publication" : "Retry verification dispatch"}</Button>
    </div>
    {error ? <p className="mt-3 text-xs text-danger">{error}</p> : null}
    {notice ? <p role="status" className="mt-3 text-xs text-muted-foreground">{notice}</p> : null}
  </div>;
}
