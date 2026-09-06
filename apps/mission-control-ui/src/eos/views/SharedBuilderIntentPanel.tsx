import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { GitPullRequestArrow, RefreshCw, UsersRound } from "lucide-react";

import { api } from "../../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "../../components/factory/badges";

type ContributorRole = "PRODUCT" | "QA" | "DESIGN" | "ENGINEERING" | "SECURITY_OPERATIONS";
type TargetSection = "OUTCOME" | "REQUIREMENTS" | "NON_FUNCTIONAL_REQUIREMENTS" | "ACCEPTANCE_EXPECTATIONS" | "VERIFICATION_EXPECTATIONS" | "NON_GOALS" | "CONSTRAINTS" | "RISKS" | "REPOSITORY_SCOPE";

const roleGuidance: Record<ContributorRole, string> = {
  PRODUCT: "Business outcome, user impact, priority, constraints, or non-goals",
  QA: "Acceptance criteria, negative cases, environment, or evidence needs",
  DESIGN: "Interaction intent, accessibility, visual evidence, or UX risk",
  ENGINEERING: "Architecture, scope, dependencies, rollout, or recovery",
  SECURITY_OPERATIONS: "Threat, policy, SLO, containment, or rollback",
};

const sectionLabels: Record<TargetSection, string> = {
  OUTCOME: "Outcome",
  REQUIREMENTS: "Requirement",
  NON_FUNCTIONAL_REQUIREMENTS: "Non-functional requirement",
  ACCEPTANCE_EXPECTATIONS: "Acceptance expectation",
  VERIFICATION_EXPECTATIONS: "Verification expectation",
  NON_GOALS: "Non-goal",
  CONSTRAINTS: "Constraint",
  RISKS: "Risk",
  REPOSITORY_SCOPE: "Repository scope",
};

const stateTone = (state: string) => {
  if (state === "ACCEPTED") return "success" as const;
  if (state === "REJECTED" || state === "SUPERSEDED") return "neutral" as const;
  if (state === "STALE" || state === "CONFLICT") return "warning" as const;
  return "info" as const;
};

const actionKey = (action: string) => `ui-shared-intent:${action}:${crypto.randomUUID()}`;

export function sharedIntentErrorMessage(error: unknown, fallback: string) {
  if (!(error instanceof Error)) return fallback;
  const serverMessage = error.message.match(/Uncaught Error:\s*([^\n]+?)(?:\s+at\s|\n|$)/)?.[1];
  return serverMessage?.trim() || error.message.split("\n")[0] || fallback;
}

export function SharedBuilderIntentPanel({
  projectId,
  mission,
  currentRevision,
}: {
  projectId: Id<"projects">;
  mission: Doc<"missions">;
  currentRevision: Doc<"missionSpecRevisions"> | null;
}) {
  const result = useQuery(api.missionIntentContributions.list, { projectId, missionId: mission._id });
  const draftContribution = useMutation(api.missionIntentContributions.draftHuman);
  const decideContribution = useMutation(api.missionIntentContributions.decideHuman);
  const [role, setRole] = useState<ContributorRole>("QA");
  const [targetSection, setTargetSection] = useState<TargetSection>("ACCEPTANCE_EXPECTATIONS");
  const [contributionKey, setContributionKey] = useState("");
  const [targetItemId, setTargetItemId] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [evidenceExpectation, setEvidenceExpectation] = useState("");
  const [expectedLatestContributionId, setExpectedLatestContributionId] = useState<Id<"missionIntentContributions"> | undefined>();
  const [decisionReasons, setDecisionReasons] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<"idle" | "working" | "success" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  const clearDraft = () => {
    setContributionKey("");
    setTargetItemId("");
    setTitle("");
    setBody("");
    setEvidenceExpectation("");
    setExpectedLatestContributionId(undefined);
  };

  const fail = (error: unknown, fallback: string) => {
    setStatus("error");
    setMessage(sharedIntentErrorMessage(error, fallback));
  };

  const submit = async () => {
    if (!currentRevision || status === "working") return;
    setStatus("working");
    setMessage(null);
    try {
      const saved = await draftContribution({
        projectId,
        missionId: mission._id,
        expectedCurrentSpecRevisionId: currentRevision._id,
        expectedCurrentSpecDigest: currentRevision.digest,
        expectedLatestContributionId,
        contributionKey,
        contributorRole: role,
        targetSection,
        targetItemId: targetItemId.trim() || undefined,
        title,
        body,
        evidenceExpectation,
        idempotencyKey: actionKey("draft"),
      });
      setStatus("success");
      setMessage(`Contribution ${saved.contribution?.contributionKey} r${saved.contribution?.revisionNumber} saved against Spec r${currentRevision.revisionNumber}.`);
      clearDraft();
    } catch (error) {
      fail(error, "Contribution could not be saved. Your form remains available.");
    }
  };

  const decide = async (contributionId: Id<"missionIntentContributions">, decision: "ACCEPTED" | "REJECTED") => {
    if (!currentRevision || status === "working") return;
    setStatus("working");
    setMessage(null);
    try {
      await decideContribution({
        projectId,
        missionId: mission._id,
        contributionId,
        expectedCurrentSpecRevisionId: currentRevision._id,
        expectedCurrentSpecDigest: currentRevision.digest,
        decision,
        reason: decisionReasons[String(contributionId)] ?? "",
        idempotencyKey: actionKey("decision"),
      });
      setStatus("success");
      setMessage(`${decision === "ACCEPTED" ? "Accepted" : "Rejected"} the exact contribution. The Mission Spec was not changed.`);
    } catch (error) {
      fail(error, "Contribution decision could not be recorded.");
    }
  };

  return (
    <section aria-labelledby="shared-builder-intent-title" className="rounded-xl border border-line bg-surface-1 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <UsersRound className="mt-0.5 h-5 w-5 text-info-accent" aria-hidden />
          <div>
            <h2 id="shared-builder-intent-title" className="text-[13px] font-semibold text-ink">Shared builder contributions</h2>
            <p className="mt-1 max-w-3xl text-[12px] leading-relaxed text-ink-muted">
              Product, QA, design, engineering, and security/operations propose changes in this exact Spec lineage. Human decisions do not silently edit the Spec or approve delivery.
            </p>
          </div>
        </div>
        <StatusBadge tone={result?.enabled ? "info" : "neutral"}>{result?.enabled ? "Proposal-only" : "Read-only"}</StatusBadge>
      </div>

      {message ? (
        <div role={status === "error" ? "alert" : "status"} className={`mt-4 rounded-lg border p-3 text-sm ${status === "error" ? "border-destructive/30 bg-destructive/10 text-destructive" : "border-success/30 bg-success/5 text-ink-secondary"}`}>
          {message}
        </div>
      ) : null}

      {result && !result.enabled ? (
        <div className="mt-4 rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-ink-secondary">
          Shared contribution writes are disabled. Enable <code className="font-mono">missions.shared-builder-intent-v1</code> for this workspace; existing history remains inspectable.
        </div>
      ) : null}

      {result === undefined ? (
        <div role="status" className="py-10 text-center text-sm text-ink-muted">Loading shared contributions…</div>
      ) : !currentRevision ? (
        <div className="py-10 text-center text-sm text-ink-muted">Save the first Mission Spec revision before collecting contributions.</div>
      ) : (
        <div className="mt-5 grid gap-5 2xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <form className="space-y-4 rounded-lg border border-line bg-surface-2/40 p-4" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
            <div>
              <div className="text-xs font-semibold text-ink">{expectedLatestContributionId ? "Revise contribution" : "Draft contribution"}</div>
              <div className="mt-1 text-[11px] text-ink-muted">Bound to Spec r{currentRevision.revisionNumber} · {currentRevision.digest.slice(0, 20)}…</div>
            </div>
            <div className="grid gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="intent-role">Contributor role</Label>
                <select id="intent-role" value={role} disabled={!result.enabled || status === "working"} onChange={(event) => setRole(event.target.value as ContributorRole)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-ink">
                  {Object.keys(roleGuidance).map((value) => <option key={value} value={value}>{value.replace("_", " / ")}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="intent-section">Spec target</Label>
                <select id="intent-section" value={targetSection} disabled={!result.enabled || status === "working"} onChange={(event) => setTargetSection(event.target.value as TargetSection)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-ink">
                  {Object.entries(sectionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </div>
            </div>
            <p className="text-[11px] text-ink-muted">{roleGuidance[role]}</p>
            <div className="grid gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="intent-key">Stable contribution key</Label>
                <Input id="intent-key" value={contributionKey} disabled={Boolean(expectedLatestContributionId) || !result.enabled || status === "working"} onChange={(event) => setContributionKey(event.target.value.toUpperCase())} placeholder="QA-AC-001" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="intent-target-id">Target item ID (optional)</Label>
                <Input id="intent-target-id" value={targetItemId} disabled={!result.enabled || status === "working"} onChange={(event) => setTargetItemId(event.target.value)} placeholder="AC-001" />
              </div>
            </div>
            <div className="space-y-1.5"><Label htmlFor="intent-title">Title</Label><Input id="intent-title" value={title} disabled={!result.enabled || status === "working"} onChange={(event) => setTitle(event.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="intent-body">Proposed change</Label><Textarea id="intent-body" value={body} disabled={!result.enabled || status === "working"} onChange={(event) => setBody(event.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="intent-evidence">Evidence expectation</Label><Textarea id="intent-evidence" value={evidenceExpectation} disabled={!result.enabled || status === "working"} onChange={(event) => setEvidenceExpectation(event.target.value)} placeholder="What exact evidence should prove this intent?" /></div>
            <div className="flex flex-wrap justify-end gap-2">
              {expectedLatestContributionId ? <Button type="button" variant="ghost" onClick={clearDraft}>Cancel revision</Button> : null}
              <Button type="submit" disabled={!result.enabled || status === "working"}>{status === "working" ? "Saving…" : expectedLatestContributionId ? "Save contribution revision" : "Save proposal"}</Button>
            </div>
          </form>

          <div aria-live="polite" className="space-y-3">
            {result.items.length === 0 ? (
              <div className="rounded-lg border border-dashed border-line px-4 py-12 text-center">
                <GitPullRequestArrow className="mx-auto h-5 w-5 text-ink-muted" aria-hidden />
                <div className="mt-2 text-sm font-medium text-ink">No contributions yet</div>
                <p className="mt-1 text-xs text-ink-muted">Draft the first proposal. It will remain attached to this exact Spec revision.</p>
              </div>
            ) : result.items.map((item) => (
              <article key={item._id} className="rounded-lg border border-line p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex flex-wrap items-center gap-2"><span className="font-mono text-[10px] text-ink-muted">{item.contributionKey} · r{item.revisionNumber}</span><StatusBadge tone={stateTone(item.state)}>{item.state}</StatusBadge>{item.currentness === "STALE" && item.state !== "STALE" ? <StatusBadge tone="warning">SPEC STALE</StatusBadge> : null}</div>
                    <h3 className="mt-1 text-sm font-medium text-ink">{item.title}</h3>
                  </div>
                  <span className="text-[10px] uppercase tracking-wide text-ink-muted">{item.contributorRole.replace("_", " / ")}</span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-ink-secondary">{item.body}</p>
                <div className="mt-3 rounded-md bg-surface-2 p-2 text-[11px] text-ink-muted"><span className="font-medium text-ink-secondary">Evidence:</span> {item.evidenceExpectation}</div>
                <dl className="mt-3 grid gap-1 text-[10px] text-ink-muted">
                  <div><dt className="inline font-medium">Target: </dt><dd className="inline">{sectionLabels[item.targetSection as TargetSection]}{item.targetItemId ? ` · ${item.targetItemId}` : ""}</dd></div>
                  <div><dt className="inline font-medium">Source: </dt><dd className="inline">Spec {String(item.missionSpecRevisionId).slice(-8)} · {item.proposedActorType.toLowerCase()} {item.proposedBy}</dd></div>
                </dl>
                {item.state === "CONFLICT" ? <p role="alert" className="mt-3 text-xs text-warning">Conflicts with {item.conflictIds.length} current proposal(s) for the same target. Reject or revise competing proposals before acceptance.</p> : null}
                {item.state === "STALE" ? <p className="mt-3 text-xs text-warning">This proposal targets an older Spec. Revise it against the current revision before deciding.</p> : null}
                {item.state === "PROPOSED" || item.state === "CONFLICT" || item.state === "STALE" ? (
                  <div className="mt-3 space-y-2 border-t border-line pt-3">
                    <Label htmlFor={`decision-${item._id}`}>Human decision rationale</Label>
                    <Input id={`decision-${item._id}`} value={decisionReasons[item._id] ?? ""} onChange={(event) => setDecisionReasons((current) => ({ ...current, [item._id]: event.target.value }))} placeholder="Why should this be accepted or rejected?" />
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button type="button" size="sm" variant="outline" onClick={() => { setRole(item.contributorRole as ContributorRole); setTargetSection(item.targetSection as TargetSection); setContributionKey(item.contributionKey); setTargetItemId(item.targetItemId ?? ""); setTitle(item.title); setBody(item.body); setEvidenceExpectation(item.evidenceExpectation); setExpectedLatestContributionId(item._id as Id<"missionIntentContributions">); }}> <RefreshCw className="mr-1 h-3.5 w-3.5" aria-hidden />Revise against current</Button>
                      {item.state !== "STALE" ? <Button type="button" size="sm" variant="outline" disabled={!decisionReasons[item._id]?.trim() || status === "working"} onClick={() => void decide(item._id as Id<"missionIntentContributions">, "REJECTED")}>Reject</Button> : null}
                      {item.state === "PROPOSED" ? <Button type="button" size="sm" disabled={!decisionReasons[item._id]?.trim() || status === "working"} onClick={() => void decide(item._id as Id<"missionIntentContributions">, "ACCEPTED")}>Accept as Spec input</Button> : null}
                    </div>
                  </div>
                ) : item.decision ? <p className="mt-3 border-t border-line pt-3 text-xs text-ink-muted">Decision by {item.decision.decidedBy}: {item.decision.reason}</p> : null}
              </article>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
