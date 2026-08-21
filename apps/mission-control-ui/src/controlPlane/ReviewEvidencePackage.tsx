import { useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Clock3, ExternalLink, FileCode2, GitPullRequest, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { safeExternalUrl, safeHttpsUrl } from "../lib/safeExternalUrl";

type ReviewLevel = "BASIC" | "INTERMEDIATE" | "ADVANCED";

type ReviewIntelligenceData = {
  projectionVersion: number;
  digest: string;
  intent: {
    mission: { id: string; title: string; objective: string } | null;
    spec: { id: string; revisionNumber: number | null; digest: string } | null;
    plan: { id: string; revisionNumber: number; status: string; summary: string } | null;
    workOrder: { id: string; revisionNumber: number | null; title: string; desiredOutcome: string };
    qualityContractDigest: string | null;
    definitionOfDone: Array<{ id: string; title: string }>;
  };
  criterionMatrix: Array<{
    criterion: { id: string; title: string; description: string | null; requirementIds: string[] };
    specRequirements: Array<{ id: string; title: string; priority: string }>;
    planAssertions: Array<{ id: string; title: string; verificationMethod: string; requiredEvidence: string }>;
    verificationChecks: Array<{ id: string; name: string; verifierId: string; status: string; evidenceIds: string[] }>;
    evidence: Array<{ id: string; verificationRunId: string; sourceAttemptId: string | null; artifactReferences: string[]; contentHash: string | null; candidateRevision: string; recordedAt: number }>;
    result: string;
    method: string | null;
    receiptId: string | null;
    verifier: string | null;
    current: boolean;
    integrityIssue: string | null;
    lineage?: Record<string, unknown>;
  }>;
  changes: {
    summary: string | null;
    semanticGroups: Array<{ id: string; name: string; method: "DETERMINISTIC"; authority: "ADVISORY"; files: Array<{ path: string; diffLocation?: string | null }> }>;
    rawDiffUrl: string | null;
  };
  failedOrRecovered: Array<{ eventType: string; sequenceNumber: number; status: string | null; summary: string }>;
  decisions: Array<{ _id: string; category: string; proposedTarget: string; summary: string; status: string; origin: string; originActorId: string; trustedSource: boolean; contentDigest: string }>;
  historicalDecisionCount: number;
  judgments: Array<{ _id: string; action: string; summary: string; actorId: string; recordedAt: number; correctionCategory?: string }>;
  historicalJudgmentCount: number;
  residualAnalyses: Array<{
    _id?: string; current: boolean; reviewerId: string; provider: string; model: string;
    promptVersion?: string; contextDigest?: string; verificationSubjectDigest?: string;
    verificationPlanDigest?: string; evidenceSetDigest?: string;
    tokenUsage?: { input?: number; output?: number; cached?: number; total?: number };
    estimatedCostUsd?: number; authority: "ADVISORY";
    findings: Array<{ findingId: string; category: string; summary: string; fileReferences: string[]; authority: "ADVISORY" }>;
  }>;
  residualRisks: string[];
  exactLineage: Record<string, unknown> & {
    workOrderId: string; workOrderRevisionNumber: number; workflowRunId: string;
    candidateRevision: string | null; current: boolean; currentnessReasons: string[];
  };
  authority: { deterministicEvidence: string; advisoryFindings: string; reviewPackage: string; reviewApproval: string; acceptanceMutation: string };
};

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
    githubAppInstallationId: string | null;
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
  reviewIntelligence?: ReviewIntelligenceData;
};

const packageTone = {
  READY: "border-success/40 bg-success/10 text-ink",
  BLOCKED: "border-danger/30 bg-danger/10 text-danger",
  INCOMPLETE: "border-warning/30 bg-warning/10 text-warning",
};

const evidenceTone: Record<string, string> = {
  PASS: "border-success/40 text-ink",
  WAIVED: "border-info/30 text-info",
  FAIL: "border-danger/30 text-danger",
  STALE: "border-danger/30 text-danger",
  UNKNOWN: "border-danger/30 text-danger",
  PENDING: "border-warning/30 text-warning",
  MISSING: "border-warning/30 text-warning",
};

// Thin aliases over the single shared policy in lib/safeExternalUrl.
const externalHttpUrl = (value: string | null) => safeExternalUrl(value) ?? null;
const externalHttpsUrl = (value: string | null) => safeHttpsUrl(value) ?? null;

function shortRevision(value: string | null) {
  return value?.slice(0, 10) ?? "—";
}

export function ReviewEvidencePackage({
  review,
  onRecordJudgment,
  onInspectEvidence,
}: {
  review: ReviewEvidencePackageData;
  onInspectEvidence?: (criterion: { id: string; receiptId: string }) => void;
  onRecordJudgment?: (input: {
    action: "COMMENT" | "REQUEST_CLARIFICATION" | "REQUEST_CHANGE" | "ACKNOWLEDGE_RESIDUAL_RISK" | "RECORD_ARCHITECTURE_CONCERN" | "CORRECTION" | "APPROVE_REVIEW_PACKAGE";
    correctionCategory?: "REPEATED_REVIEW_CORRECTION" | "ARCHITECTURAL_REVIEW_PATTERN" | "MISSING_ACCEPTANCE_CRITERION" | "MISSING_DETERMINISTIC_GATE" | "REPEATED_SECURITY_COMMENT" | "REPEATED_SCOPE_CORRECTION" | "REVIEW_DISCOVERED_REQUIREMENT" | "POST_VERIFICATION_HUMAN_DEFECT";
    summary: string;
    workOrderId: string;
    workflowRunId: string;
    workOrderRevisionNumber: number;
    candidateRevision?: string;
    reviewPackageDigest: string;
  }) => Promise<void>;
}) {
  const [level, setLevel] = useState<ReviewLevel>("BASIC");
  const [reviewComposerOpen, setReviewComposerOpen] = useState(false);
  const [judgmentSummary, setJudgmentSummary] = useState("");
  const [judgmentAction, setJudgmentAction] = useState<"COMMENT" | "REQUEST_CLARIFICATION" | "REQUEST_CHANGE" | "ACKNOWLEDGE_RESIDUAL_RISK" | "RECORD_ARCHITECTURE_CONCERN" | "CORRECTION" | "APPROVE_REVIEW_PACKAGE">("COMMENT");
  const [correctionCategory, setCorrectionCategory] = useState<"REPEATED_REVIEW_CORRECTION" | "ARCHITECTURAL_REVIEW_PATTERN" | "MISSING_ACCEPTANCE_CRITERION" | "MISSING_DETERMINISTIC_GATE" | "REPEATED_SECURITY_COMMENT" | "REPEATED_SCOPE_CORRECTION" | "REVIEW_DISCOVERED_REQUIREMENT" | "POST_VERIFICATION_HUMAN_DEFECT">("REPEATED_REVIEW_CORRECTION");
  const [judgmentState, setJudgmentState] = useState<"IDLE" | "SAVING" | "SAVED" | "ERROR">("IDLE");
  const [judgmentError, setJudgmentError] = useState<string | null>(null);
  const StatusIcon = review.status === "READY" ? CheckCircle2 : review.status === "BLOCKED" ? AlertTriangle : Clock3;
  const pullRequestUrl = externalHttpsUrl(review.identity.pullRequestUrl);
  const ciRunUrl = externalHttpsUrl(review.ci.runUrl);
  const intelligence = review.reviewIntelligence;
  const rawDiffUrl = externalHttpsUrl(intelligence?.changes.rawDiffUrl ?? (pullRequestUrl ? `${pullRequestUrl}/files` : null));
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
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-md border border-[var(--panel-line)] bg-background/40 p-0.5" aria-label="Review detail level">
            {(["BASIC", "INTERMEDIATE", "ADVANCED"] as const).map((item) => (
              <button key={item} type="button" onClick={() => setLevel(item)} aria-pressed={level === item}
                className={`min-h-8 rounded px-2.5 text-[10px] font-semibold tracking-wide focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${level === item ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}>
                {item[0]}{item.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
          <span role="status" aria-live="polite" className={`rounded border px-2 py-1 text-[10px] font-semibold tracking-wide ${packageTone[review.status]}`}>
            {review.status}
          </span>
        </div>
      </div>

      {intelligence ? (
        <section aria-labelledby="review-intent-heading" className="mt-4 border-l-2 border-info/40 pl-4">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">01 · Intent</div>
          <h3 id="review-intent-heading" className="mt-1 text-base font-medium text-foreground">
            {intelligence.intent.mission?.title ?? intelligence.intent.workOrder.title}
          </h3>
          <p className="mt-1 max-w-4xl text-sm leading-6 text-muted-foreground">
            {intelligence.intent.mission?.objective ?? intelligence.intent.workOrder.desiredOutcome}
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
            {intelligence.intent.spec ? <span className="rounded border border-[var(--panel-line)] px-2 py-1">Spec r{intelligence.intent.spec.revisionNumber ?? "?"}</span> : null}
            {intelligence.intent.plan ? <span className="rounded border border-[var(--panel-line)] px-2 py-1">Plan r{intelligence.intent.plan.revisionNumber} · {intelligence.intent.plan.status}</span> : null}
            <span className="rounded border border-[var(--panel-line)] px-2 py-1">WorkOrder v{intelligence.intent.workOrder.revisionNumber ?? "?"}</span>
          </div>
        </section>
      ) : null}

      <div className="mt-4 rounded-lg border border-[var(--panel-line)] bg-background/30 px-3 py-3">
        <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Next action</div>
        <p className="mt-1 text-sm text-foreground">{review.nextAction}</p>
      </div>

      {onRecordJudgment && intelligence ? (
        <div className="mt-3 rounded-lg border border-[var(--panel-line)] bg-background/20 p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs font-medium text-foreground">Human review judgment</div>
              <p className="mt-1 text-xs text-muted-foreground">Recorded against this exact package. Approval here is not WorkOrder acceptance.</p>
            </div>
            <Button type="button" size="sm" variant={reviewComposerOpen ? "outline" : "default"} onClick={() => setReviewComposerOpen((open) => !open)}>
              {reviewComposerOpen ? "Close" : "Record review"}
            </Button>
          </div>
          {reviewComposerOpen ? (
            <form className="mt-3 grid gap-3" onSubmit={async (event) => {
              event.preventDefault();
              setJudgmentState("SAVING");
              setJudgmentError(null);
              try {
                await onRecordJudgment({
                  action: judgmentAction,
                  correctionCategory: judgmentAction === "CORRECTION" ? correctionCategory : undefined,
                  summary: judgmentSummary.trim(),
                  workOrderId: intelligence.exactLineage.workOrderId,
                  workflowRunId: intelligence.exactLineage.workflowRunId,
                  workOrderRevisionNumber: intelligence.exactLineage.workOrderRevisionNumber,
                  candidateRevision: intelligence.exactLineage.candidateRevision ?? undefined,
                  reviewPackageDigest: reviewIntelligenceSubjectDigest(intelligence),
                });
                setJudgmentSummary("");
                setJudgmentState("SAVED");
              } catch (error) {
                setJudgmentState("ERROR");
                setJudgmentError(error instanceof Error ? error.message : "Review judgment could not be recorded.");
              }
            }}>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-xs text-muted-foreground">Action
                  <select value={judgmentAction} onChange={(event) => setJudgmentAction(event.target.value as typeof judgmentAction)}
                    className="min-h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <option value="COMMENT">Comment</option><option value="REQUEST_CLARIFICATION">Request clarification</option>
                    <option value="REQUEST_CHANGE">Request change</option><option value="CORRECTION">Record correction</option>
                    <option value="RECORD_ARCHITECTURE_CONCERN">Architecture concern</option>
                    <option value="ACKNOWLEDGE_RESIDUAL_RISK">Acknowledge residual risk</option>
                    <option value="APPROVE_REVIEW_PACKAGE" disabled={review.status !== "READY"}>Approve review package (not acceptance)</option>
                  </select>
                </label>
                {judgmentAction === "CORRECTION" ? <label className="grid gap-1 text-xs text-muted-foreground">Learning category
                  <select value={correctionCategory} onChange={(event) => setCorrectionCategory(event.target.value as typeof correctionCategory)}
                    className="min-h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <option value="REPEATED_REVIEW_CORRECTION">Repeated review correction</option>
                    <option value="ARCHITECTURAL_REVIEW_PATTERN">Architectural review pattern</option>
                    <option value="MISSING_ACCEPTANCE_CRITERION">Missing acceptance criterion</option>
                    <option value="MISSING_DETERMINISTIC_GATE">Missing deterministic gate</option>
                    <option value="REPEATED_SECURITY_COMMENT">Repeated security comment</option>
                    <option value="REPEATED_SCOPE_CORRECTION">Repeated scope correction</option>
                    <option value="REVIEW_DISCOVERED_REQUIREMENT">Review-discovered requirement</option>
                    <option value="POST_VERIFICATION_HUMAN_DEFECT">Post-verification human defect</option>
                  </select>
                </label> : null}
              </div>
              <Textarea aria-label="Review judgment summary" value={judgmentSummary} onChange={(event) => setJudgmentSummary(event.target.value)} rows={3}
                placeholder="State the correction, question, decision, or residual risk with enough context to act." maxLength={2000} />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span role="status" className={`text-xs ${judgmentState === "ERROR" ? "text-danger" : judgmentState === "SAVED" ? "text-success" : "text-muted-foreground"}`}>
                  {judgmentError ?? (judgmentState === "SAVED" ? "Review judgment recorded." : "Bounded to 2,000 characters; secret-shaped values are redacted server-side.")}
                </span>
                <Button type="submit" size="sm" disabled={judgmentState === "SAVING" || judgmentSummary.trim().length < 3}>
                  {judgmentState === "SAVING" ? "Recording…" : "Record judgment"}
                </Button>
              </div>
            </form>
          ) : null}
        </div>
      ) : null}

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
        <PackageMeta label="GitHub App installation" value={review.identity.githubAppInstallationId ?? "—"} mono />
        <PackageMeta label="Attempts / recoveries" value={`${review.recovery.attempts} / ${review.recovery.staleRecoveries}`} />
        <PackageMeta label="Risk" value={review.riskLevel ?? "Not classified"} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(300px,0.75fr)]">
        <div>
          <div className="mb-2 text-xs font-medium text-foreground">02 · Acceptance criteria and evidence</div>
          <div className="space-y-2">
            {review.criteria.length === 0 ? (
              <p className="rounded-lg border border-[var(--panel-line)] bg-background/30 p-3 text-sm text-muted-foreground">No criterion evidence is bound.</p>
            ) : review.criteria.map((criterion) => {
              const evidenceUrl = externalHttpUrl(criterion.evidenceLocation);
              const matrixRow = intelligence?.criterionMatrix.find((row) => row.criterion.id === criterion.id);
              return (
              <div key={criterion.id} className="rounded-lg border border-[var(--panel-line)] bg-background/30 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-medium text-foreground">{criterion.title}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {criterion.verificationMethod ?? "Method unspecified"} · {criterion.verifier ?? "Verifier missing"}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className={evidenceTone[criterion.status] ?? ""}>{criterion.status}</Badge>
                    {matrixRow ? <Badge variant="outline" className={matrixRow.current ? "border-success/40 text-ink" : "border-danger/30 text-danger"}>{matrixRow.current ? "CURRENT" : "NOT CURRENT"}</Badge> : null}
                  </div>
                </div>
                {criterion.result ? <p className="mt-2 text-xs text-muted-foreground">{criterion.result}</p> : null}
                {level === "ADVANCED" && matrixRow ? (
                  <div className="mt-3 grid gap-2 border-t border-[var(--panel-line)] pt-3 text-xs sm:grid-cols-2">
                    <PackageMeta label="Spec requirements" value={matrixRow.specRequirements.map((item) => item.id).join(", ") || "—"} mono />
                    <PackageMeta label="Plan assertions" value={matrixRow.planAssertions.map((item) => item.id).join(", ") || "—"} mono />
                    <PackageMeta label="Verification checks" value={matrixRow.verificationChecks.map((item) => item.id).join(", ") || "—"} mono />
                    <PackageMeta label="Evidence envelopes" value={matrixRow.evidence.map((item) => item.id).join(", ") || "—"} mono />
                    <PackageMeta label="Receipt" value={matrixRow.receiptId ?? "—"} mono />
                    <PackageMeta label="Result / current" value={`${matrixRow.result} / ${matrixRow.current ? "CURRENT" : "NOT CURRENT"}`} mono />
                  </div>
                ) : null}
                {criterion.integrityIssue ? (
                  <p role="alert" className="mt-2 text-xs text-danger">{criterion.integrityIssue}</p>
                ) : null}
                {criterion.receiptId && onInspectEvidence ? (
                  <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => onInspectEvidence({ id: criterion.id, receiptId: criterion.receiptId! })}>
                    Inspect exact evidence
                  </Button>
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

      {intelligence && level !== "BASIC" ? (
        <div className="mt-5 grid gap-4 xl:grid-cols-2">
          <ReviewSection number="03" title="Failed and recovered work" empty="No failures or recovery events are recorded.">
            {intelligence.failedOrRecovered.map((event, index) => (
              <div key={`${event.sequenceNumber}-${event.eventType}-${index}`} className="border-l border-[var(--panel-line)] pl-3">
                <div className="text-xs font-medium text-foreground">{event.eventType.replace(/_/g, " ")}</div>
                <div className="mt-1 text-xs text-muted-foreground">#{event.sequenceNumber} · {event.summary}</div>
              </div>
            ))}
          </ReviewSection>
          <ReviewSection number="04" title="Implementation decisions" empty="No bounded implementation decisions are recorded.">
            {intelligence.decisions.map((decision) => (
              <div key={decision._id} className="rounded-md border border-[var(--panel-line)] p-3">
                <div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{decision.status.replace(/_/g, " ")}</Badge><span className="text-xs text-muted-foreground">{decision.category.replace(/_/g, " ")} → {decision.proposedTarget.replace(/_/g, " ")}</span></div>
                <p className="mt-2 text-sm text-foreground">{decision.summary}</p>
                <p className="mt-1 text-xs text-muted-foreground">{decision.origin} · {decision.originActorId}{decision.trustedSource ? " · trusted source" : " · untrusted source"}</p>
              </div>
            ))}
          </ReviewSection>
          <ReviewSection number="05" title="Semantic change groups" empty="No changed-file lineage is available for grouping.">
            {intelligence.changes.semanticGroups.map((group) => (
              <details key={group.id} className="rounded-md border border-[var(--panel-line)] bg-background/20 p-3">
                <summary className="cursor-pointer text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{group.name} <span className="text-xs font-normal text-muted-foreground">· {group.files.length} files · deterministic</span></summary>
                <ul className="mt-2 space-y-1 font-mono text-xs text-muted-foreground">{group.files.map((file) => <li key={file.path}>{file.path}</li>)}</ul>
              </details>
            ))}
          </ReviewSection>
          <ReviewSection number="06" title="Residual risk and advisory findings" empty="No residual findings are recorded.">
            {intelligence.residualAnalyses.flatMap((analysis) => analysis.findings.map((finding) => (
              <div key={`${analysis._id}-${finding.findingId}`} className="rounded-md border border-warning/20 bg-warning/5 p-3">
                <div className="flex flex-wrap items-center gap-2"><Badge variant="outline" className="border-warning/30 text-warning">ADVISORY</Badge><span className="text-xs text-muted-foreground">{finding.category.replace(/_/g, " ")}</span>{!analysis.current ? <Badge variant="outline">HISTORICAL</Badge> : null}</div>
                <p className="mt-2 text-sm text-foreground">{finding.summary}</p>
                <p className="mt-1 text-xs text-muted-foreground">{analysis.provider}/{analysis.model} · {analysis.reviewerId}</p>
                {level === "ADVANCED" ? (
                  <div className="mt-3 grid gap-2 border-t border-[var(--panel-line)] pt-3 text-xs sm:grid-cols-2">
                    <PackageMeta label="Prompt version" value={analysis.promptVersion ?? "—"} mono />
                    <PackageMeta label="Context digest" value={analysis.contextDigest ?? "—"} mono />
                    <PackageMeta label="Evidence set" value={analysis.evidenceSetDigest ?? "—"} mono />
                    <PackageMeta label="Tokens / cost" value={`${analysis.tokenUsage?.total ?? "—"} / ${analysis.estimatedCostUsd == null ? "—" : `$${analysis.estimatedCostUsd.toFixed(4)}`}`} mono />
                  </div>
                ) : null}
              </div>
            )))}
          </ReviewSection>
        </div>
      ) : null}

      {intelligence && level === "ADVANCED" ? (
        <section className="mt-5 rounded-lg border border-[var(--panel-line)] bg-background/20 p-4" aria-labelledby="exact-review-lineage">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">07 · Advanced · exact lineage</div>
          <div className="mt-2 flex flex-wrap items-center gap-2"><h3 id="exact-review-lineage" className="text-sm font-medium text-foreground">Canonical IDs, digests, and currentness</h3><Badge variant="outline" className={intelligence.exactLineage.current ? "border-success/40 text-ink" : "border-danger/30 text-danger"}>{intelligence.exactLineage.current ? "CURRENT" : "NOT CURRENT"}</Badge></div>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {Object.entries(intelligence.exactLineage).filter(([key]) => !["current", "currentnessReasons", "harnessIdentity"].includes(key)).map(([key, value]) => (
              <div key={key} className="min-w-0"><dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{key.replace(/([A-Z])/g, " $1")}</dt><dd className="mt-1 break-all font-mono text-xs text-foreground">{value == null ? "—" : typeof value === "object" ? JSON.stringify(value) : String(value)}</dd></div>
            ))}
          </dl>
          {intelligence.exactLineage.currentnessReasons.length ? <ul className="mt-4 space-y-1 text-xs text-muted-foreground">{intelligence.exactLineage.currentnessReasons.map((reason) => <li key={reason}>• {reason}</li>)}</ul> : null}
          <div className="mt-4 rounded-md border border-info/20 bg-info/5 p-3 text-xs text-muted-foreground">Deterministic verification is canonical. Review Package approval and every AI finding are non-accepting advisory records. Acceptance remains <span className="font-mono text-foreground">{intelligence.authority.acceptanceMutation}</span>.</div>
        </section>
      ) : null}

      <section className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--panel-line)] bg-background/20 p-4" aria-labelledby="raw-diff-heading">
        <div className="flex items-start gap-3"><FileCode2 className="mt-0.5 h-4 w-4 text-muted-foreground" aria-hidden="true" /><div><div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">08 · Source code</div><h3 id="raw-diff-heading" className="mt-1 text-sm font-medium text-foreground">Raw diff remains available</h3><p className="mt-1 text-xs text-muted-foreground">Use the evidence package to focus review; inspect source whenever judgment requires it.</p></div></div>
        {rawDiffUrl ? <Button asChild size="sm" variant="outline"><a href={rawDiffUrl} target="_blank" rel="noreferrer">Open raw diff <ExternalLink className="ml-1 h-3 w-3" aria-hidden="true" /></a></Button> : <span className="text-xs text-warning">No exact pull-request diff is linked.</span>}
      </section>
    </Card>
  );
}

function reviewIntelligenceSubjectDigest(intelligence: ReviewIntelligenceData) {
  // Mutations bind to the exact server-projected subject digest exposed by
  // getAttemptReviewContext. The package projection carries the same exact
  // subject fields, while its broader digest includes evidence currentness.
  return (intelligence.exactLineage.reviewPackageDigest as string | undefined) ?? intelligence.digest;
}

function ReviewSection({ number, title, empty, children }: { number: string; title: string; empty: string; children: ReactNode }) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return <section className="rounded-lg border border-[var(--panel-line)] bg-background/20 p-4"><div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{number}</div><h3 className="mt-1 text-sm font-medium text-foreground">{title}</h3><div className="mt-3 space-y-2">{hasChildren ? children : <p className="text-xs text-muted-foreground">{empty}</p>}</div></section>;
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
