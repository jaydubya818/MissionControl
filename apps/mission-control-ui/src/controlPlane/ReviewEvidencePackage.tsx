import { AlertTriangle, CheckCircle2, Clock3, ExternalLink, GitPullRequest, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export type ReviewEvidencePackageData = {
  status: "READY" | "BLOCKED" | "INCOMPLETE";
  summary: string;
  nextAction: string;
  blockers: string[];
  identity: {
    runId: string;
    workOrderId: string | null;
    workOrderRevisionNumber: number | null;
    repositoryId: string | null;
    repository: string | null;
    branch: string | null;
    baseSha: string | null;
    headSha: string | null;
    pullRequestUrl: string | null;
    pullRequestNumber: number | null;
    executionManifestDigest: string | null;
  };
  gate: {
    status: string;
    receiptId: string | null;
    verificationRunId: string | null;
    verdict: string | null;
    verifier: string | null;
    sourceRevision: string | null;
    candidateRevision: string | null;
    recordedAt: number | null;
    validUntil: number | null;
    reasons: string[];
    integrityIssue: string | null;
  };
  ci: {
    status: string;
    runUrl: string | null;
    evaluationId: string | null;
    headSha: string | null;
    prState: string;
    lenses: Array<{ id: string; label: string; enabled: boolean; score?: number }>;
  };
  criteria: Array<{
    id: string;
    title: string;
    verificationMethod: string | null;
    status: string;
    receiptId: string | null;
    verifier: string | null;
    result: string | null;
    evidenceLocation: string | null;
    validUntil: number | null;
    integrityIssue: string | null;
  }>;
  changedFiles: string[];
  deviations: string[];
  failedChecks: string[];
  risks: string[];
  riskLevel: string | null;
  reviewerFocus: string[];
  rollbackApproach: string | null;
  recovery: { attempts: number; staleRecoveries: number };
};

const packageTone = {
  READY: "border-success/30 bg-success/10 text-success",
  BLOCKED: "border-danger/30 bg-danger/10 text-danger",
  INCOMPLETE: "border-warning/30 bg-warning/10 text-warning",
};

const evidenceTone: Record<string, string> = {
  PASS: "border-success/30 text-success",
  WAIVED: "border-info/30 text-info",
  FAIL: "border-danger/30 text-danger",
  STALE: "border-danger/30 text-danger",
  UNKNOWN: "border-danger/30 text-danger",
  PENDING: "border-warning/30 text-warning",
  MISSING: "border-warning/30 text-warning",
};

function externalHttpUrl(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function externalHttpsUrl(value: string | null) {
  const url = externalHttpUrl(value);
  return url?.startsWith("https:") ? url : null;
}

function shortRevision(value: string | null) {
  return value?.slice(0, 10) ?? "—";
}

export function ReviewEvidencePackage({ review }: { review: ReviewEvidencePackageData }) {
  const StatusIcon = review.status === "READY" ? CheckCircle2 : review.status === "BLOCKED" ? AlertTriangle : Clock3;
  const pullRequestUrl = externalHttpsUrl(review.identity.pullRequestUrl);
  const ciRunUrl = externalHttpsUrl(review.ci.runUrl);
  return (
    <Card id="run-review-package" className="scroll-mt-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <StatusIcon className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div>
            <div className="text-sm font-medium text-foreground">Review evidence package</div>
            <p className="mt-1 text-sm text-muted-foreground">{review.summary}</p>
          </div>
        </div>
        <span role="status" aria-live="polite" className={`rounded border px-2 py-1 text-[10px] font-semibold tracking-wide ${packageTone[review.status]}`}>
          {review.status}
        </span>
      </div>

      <div className="mt-4 rounded-lg border border-[var(--panel-line)] bg-background/30 px-3 py-3">
        <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Next action</div>
        <p className="mt-1 text-sm text-foreground">{review.nextAction}</p>
      </div>

      {review.blockers.length > 0 ? (
        <div className="mt-4 rounded-lg border border-warning/20 bg-warning/5 p-3">
          <div className="text-xs font-medium text-foreground">Required before review</div>
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
            {review.blockers.map((blocker) => <li key={blocker}>• {blocker}</li>)}
          </ul>
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
        <PackageMeta label="Repository" value={review.identity.repository ?? "—"} mono />
        <PackageMeta label="WorkOrder revision" value={review.identity.workOrderRevisionNumber ? `v${review.identity.workOrderRevisionNumber}` : "—"} />
        <PackageMeta label="Branch" value={review.identity.branch ?? "—"} mono />
        <PackageMeta label="Base → head" value={`${shortRevision(review.identity.baseSha)} → ${shortRevision(review.identity.headSha)}`} mono />
        <PackageMeta label="Attempt" value={review.identity.runId} mono />
        <PackageMeta label="Manifest digest" value={shortRevision(review.identity.executionManifestDigest)} mono />
        <PackageMeta label="Attempts / recoveries" value={`${review.recovery.attempts} / ${review.recovery.staleRecoveries}`} />
        <PackageMeta label="Risk" value={review.riskLevel ?? "Not classified"} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(300px,0.75fr)]">
        <div>
          <div className="mb-2 text-xs font-medium text-foreground">Acceptance criteria</div>
          <div className="space-y-2">
            {review.criteria.length === 0 ? (
              <p className="rounded-lg border border-[var(--panel-line)] bg-background/30 p-3 text-sm text-muted-foreground">No criterion evidence is bound.</p>
            ) : review.criteria.map((criterion) => {
              const evidenceUrl = externalHttpUrl(criterion.evidenceLocation);
              return (
              <div key={criterion.id} className="rounded-lg border border-[var(--panel-line)] bg-background/30 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-medium text-foreground">{criterion.title}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {criterion.verificationMethod ?? "Method unspecified"} · {criterion.verifier ?? "Verifier missing"}
                    </div>
                  </div>
                  <Badge variant="outline" className={evidenceTone[criterion.status] ?? ""}>{criterion.status}</Badge>
                </div>
                {criterion.result ? <p className="mt-2 text-xs text-muted-foreground">{criterion.result}</p> : null}
                {criterion.integrityIssue ? (
                  <p role="alert" className="mt-2 text-xs text-danger">{criterion.integrityIssue}</p>
                ) : null}
                {evidenceUrl ? (
                  <Button asChild variant="link" size="sm" className="mt-1 h-auto p-0 text-xs">
                    <a href={evidenceUrl} target="_blank" rel="noreferrer">Open evidence <ExternalLink className="ml-1 h-3 w-3" aria-hidden="true" /></a>
                  </Button>
                ) : criterion.evidenceLocation ? (
                  <p className="mt-2 break-all font-mono text-xs text-muted-foreground">Evidence reference: {criterion.evidenceLocation}</p>
                ) : null}
              </div>
              );
            })}
          </div>
        </div>

        <div className="space-y-3">
          <div className="rounded-lg border border-[var(--panel-line)] bg-background/30 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-medium text-foreground"><ShieldCheck className="h-4 w-4" aria-hidden="true" />Authoritative verification gate</div>
              <Badge variant="outline" className={evidenceTone[review.gate.status] ?? ""}>{review.gate.status}</Badge>
            </div>
            <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
              <PackageMeta label="Verdict" value={review.gate.verdict ?? "No verdict"} />
              <PackageMeta label="Candidate" value={shortRevision(review.gate.candidateRevision)} mono />
              <PackageMeta label="Verifier" value={review.gate.verifier ?? "Verifier missing"} />
              <PackageMeta label="Valid until" value={review.gate.validUntil ? new Date(review.gate.validUntil).toLocaleString() : "No expiry recorded"} />
            </div>
            {review.gate.integrityIssue ? <p role="alert" className="mt-3 text-xs text-danger">{review.gate.integrityIssue}</p> : null}
            {review.gate.reasons.length > 0 ? <p className="mt-3 text-xs text-muted-foreground">{review.gate.reasons.join(" ")}</p> : null}
          </div>
          <div className="rounded-lg border border-[var(--panel-line)] bg-background/30 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-medium text-foreground"><GitPullRequest className="h-4 w-4" aria-hidden="true" />Pull request and exact-head CI</div>
              <div className="flex items-center gap-2"><Badge variant="outline">PR {review.ci.prState}</Badge><Badge variant="outline">{review.ci.status}</Badge></div>
            </div>
            <div className="mt-2 break-all font-mono text-xs text-muted-foreground">{review.ci.headSha ?? "No matching head SHA"}</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {pullRequestUrl ? <Button asChild size="sm"><a href={pullRequestUrl} target="_blank" rel="noreferrer">Open pull request <ExternalLink className="ml-1 h-3 w-3" aria-hidden="true" /></a></Button> : null}
              {ciRunUrl ? <Button asChild size="sm" variant="outline"><a href={ciRunUrl} target="_blank" rel="noreferrer">Open CI</a></Button> : null}
            </div>
          </div>
          <PackageList label="Reviewer focus" values={review.reviewerFocus} empty="No elevated focus areas recorded." />
          <PackageList label="Changed files" values={review.changedFiles} empty="No structured file lineage." mono />
          <div className="rounded-lg border border-[var(--panel-line)] bg-background/30 p-3">
            <div className="text-xs font-medium text-foreground">Rollback guidance</div>
            <p className="mt-2 text-xs text-muted-foreground">{review.rollbackApproach ?? "No rollback guidance recorded."}</p>
          </div>
        </div>
      </div>
    </Card>
  );
}

function PackageMeta({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div><div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{label}</div><div className={`mt-1 break-all text-sm text-foreground ${mono ? "font-mono" : ""}`}>{value}</div></div>;
}

function PackageList({ label, values, empty, mono = false }: { label: string; values: string[]; empty: string; mono?: boolean }) {
  const visibleValues = values.slice(0, 8);
  const remainingValues = values.slice(8);
  return (
    <div className="rounded-lg border border-[var(--panel-line)] bg-background/30 p-3">
      <div className="text-xs font-medium text-foreground">{label}</div>
      {values.length > 0 ? (
        <>
          <ul className={`mt-2 space-y-1 break-all text-xs text-muted-foreground ${mono ? "font-mono" : ""}`}>{visibleValues.map((value) => <li key={value}>• {value}</li>)}</ul>
          {remainingValues.length > 0 ? (
            <details className="mt-2 text-xs text-muted-foreground">
              <summary className="cursor-pointer rounded-sm py-1 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Show {remainingValues.length} more</summary>
              <ul className={`mt-2 space-y-1 break-all ${mono ? "font-mono" : ""}`}>{remainingValues.map((value) => <li key={value}>• {value}</li>)}</ul>
            </details>
          ) : null}
        </>
      ) : <p className="mt-2 text-xs text-muted-foreground">{empty}</p>}
    </div>
  );
}
