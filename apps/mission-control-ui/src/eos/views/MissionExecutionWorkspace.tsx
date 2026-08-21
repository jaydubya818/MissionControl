import { useState } from "react";
import { useMutation } from "convex/react";
import { CheckCircle2, CircleDot, ExternalLink, RotateCcw, ShieldCheck } from "lucide-react";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { api } from "../../../../../convex/_generated/api";
import { CreateTaskModal } from "../../CreateTaskModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "../../components/factory/badges";
import { deriveMissionExecutionAction } from "../missionExecutionModel";
import { safeExternalUrl } from "../../lib/safeExternalUrl";

function workOrderHref(projectId: Id<"projects">, workOrderId: Id<"workOrders">) {
  return `/v2/control-work-orders?workspace=${encodeURIComponent(String(projectId))}&workOrder=${encodeURIComponent(String(workOrderId))}`;
}

export function MissionExecutionWorkspace({
  projectId,
  mission,
  workOrders,
}: {
  projectId: Id<"projects">;
  mission: any;
  workOrders: any[];
}) {
  const recordHandoff = useMutation(api.missions.recordHandoff);
  const [createTaskFor, setCreateTaskFor] = useState<Id<"workOrders"> | null>(null);
  const [handoffFor, setHandoffFor] = useState<Id<"workOrders"> | null>(null);
  const [nextAction, setNextAction] = useState("Continue with the next approved delivery stage.");
  const [knownRisks, setKnownRisks] = useState("");
  const [command, setCommand] = useState("Evidence reviewed in Mission Control");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const completed = workOrders.filter((workOrder) => deriveMissionExecutionAction(workOrder).action === "COMPLETE").length;
  const failed = workOrders.filter((workOrder) => deriveMissionExecutionAction(workOrder).action === "RETRY_RUN").length;

  const submitHandoff = async (workOrder: any) => {
    const run = workOrder.executionRuns?.find((candidate: any) => candidate.status === "COMPLETED");
    if (!run) return setError("A completed execution attempt is required for handoff.");
    setSubmitting(true);
    setError(null);
    try {
      await recordHandoff({
        missionId: mission._id,
        workOrderId: workOrder._id,
        workflowRunId: run._id,
        producingRole: workOrder.missionRole ?? "WORKER",
        consumingRole: workOrder.missionRole === "VALIDATOR" ? "OPERATOR" : "VALIDATOR",
        outcome: "COMPLETE",
        completedAssertionIds: workOrder.acceptanceCriteria.map((criterion: any) => criterion.id),
        incompleteAssertionIds: [],
        unknownAssertionIds: [],
        commands: [{ command: command.trim(), exitCode: 0 }],
        artifactIds: [],
        knownRisks: knownRisks.split("\n").map((risk) => risk.trim()).filter(Boolean),
        nextAction: nextAction.trim(),
        idempotencyKey: `ui-handoff:${workOrder._id}:${run._id}`,
      });
      setHandoffFor(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Handoff could not be recorded.");
    } finally {
      setSubmitting(false);
    }
  };

  if (workOrders.length === 0) {
    return <div className="rounded-xl border border-line bg-surface-1 px-5 py-10 text-center text-sm text-ink-muted">Approve and release a Mission plan to open its execution path.</div>;
  }

  return <div className="space-y-5">
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-xl border border-line bg-surface-1 p-4"><div className="text-xs text-ink-muted">Delivery stages</div><div className="mt-1 text-2xl font-semibold text-ink">{completed}/{workOrders.length}</div></div>
      <div className="rounded-xl border border-line bg-surface-1 p-4"><div className="text-xs text-ink-muted">Attempts needing recovery</div><div className="mt-1 text-2xl font-semibold text-ink">{failed}</div></div>
      <div className="rounded-xl border border-line bg-surface-1 p-4"><div className="text-xs text-ink-muted">Current Mission gate</div><div className="mt-1 text-sm font-semibold text-ink">{mission.state.replaceAll("_", " ")}</div></div>
    </div>

    {error ? <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div> : null}

    <ol className="space-y-3">
      {workOrders.map((workOrder, index) => {
        const next = deriveMissionExecutionAction(workOrder);
        const implementationAttempt = workOrder.executionRuns?.find((attempt: any) => (attempt.attemptPurpose ?? "IMPLEMENTATION") === "IMPLEMENTATION") ?? null;
        const verificationAttempt = workOrder.executionRuns?.find((attempt: any) => attempt.attemptPurpose === "VERIFICATION") ?? null;
        const latestAttempt = verificationAttempt ?? implementationAttempt;
        const latestVerificationRun = workOrder.verificationRuns?.[0] ?? null;
        const latestQualityGate = workOrder.qualityGateDecisions?.[0] ?? null;
        const review = workOrder.reviewPackage;
        const canonicalVerification = workOrder.currentVerification;
        const evidenceIds = [...new Set((workOrder.evidenceEnvelopes ?? [])
          .filter((evidence: any) => !canonicalVerification?.verificationRunId || evidence.verificationRunId === canonicalVerification.verificationRunId)
          .map((evidence: any) => String(evidence._id)))];
        const isComplete = next.action === "COMPLETE";
        const isRecovery = next.action === "RETRY_RUN";
        const Icon = isComplete ? CheckCircle2 : isRecovery ? RotateCcw : workOrder.missionRole === "VALIDATOR" ? ShieldCheck : CircleDot;
        return <li key={workOrder._id} className={`rounded-xl border bg-surface-1 p-4 ${isRecovery ? "border-destructive/40" : "border-line"}`}>
          <div className="flex flex-col gap-4">
            <div className="flex min-w-0 gap-3">
              <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${isComplete ? "bg-success/10 text-success" : isRecovery ? "bg-destructive/10 text-destructive" : "bg-accent/10 text-accent"}`}><Icon className="h-4 w-4" /></div>
              <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="text-xs text-ink-muted">Stage {index + 1}</span><StatusBadge tone={isComplete ? "success" : isRecovery ? "error" : "info"}>{workOrder.missionRole ?? "WORKER"}</StatusBadge><StatusBadge>{workOrder.state}</StatusBadge></div><h3 className="mt-1 text-sm font-semibold text-ink">{workOrder.title}</h3><p className="mt-1 text-xs text-ink-secondary">{next.detail}</p><div className="mt-2 text-xs font-medium text-ink">Next: {next.label}</div></div>
            </div>
            <div className="grid gap-2 rounded-lg border border-line bg-surface-2 p-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
              <EvidenceField label="Implementation Attempt" value={implementationAttempt?.runId ?? "Not dispatched"} mono />
              <EvidenceField label="Verification Attempt" value={verificationAttempt?.runId ?? "Not dispatched"} mono />
              <EvidenceField label="Factory version" value={latestAttempt?.factoryDefinitionVersionId ?? "Not frozen"} mono />
              <EvidenceField label="Executor" value={latestAttempt ? `${latestAttempt.executorAdapter ?? "unknown"}/${latestAttempt.executorVersion ?? "unknown"} · ${latestAttempt.executionClaimedBy ?? "unclaimed"}` : "Not claimed"} />
              <EvidenceField label="Candidate SHA" value={review?.identity?.headSha ?? implementationAttempt?.headSha ?? "Not created"} mono />
              <EvidenceField label="Verification subject" value={latestVerificationRun?.verificationSubjectDigest ?? "Not frozen"} mono />
              <EvidenceField label="Verification plan" value={latestVerificationRun?.verificationPlanId ?? "Not frozen"} mono />
              <EvidenceField label="Independent verifier" value={latestVerificationRun?.independenceValid === true ? "Server-derived independence passed" : latestVerificationRun?.independenceValid === false ? "Server-derived independence failed" : "Not verified"} />
              <EvidenceField label="Durable evidence" value={evidenceIds.length ? `${evidenceIds.length} envelope(s) · ${evidenceIds.slice(0, 2).join(", ")}` : "No evidence"} mono />
              <EvidenceField label="GitHub App PR" value={review?.identity?.pullRequestNumber ? `#${review.identity.pullRequestNumber} · installation ${review.identity.githubAppInstallationId ?? "missing"}` : "Not published"} />
              <EvidenceField label="Exact-current verification" value={canonicalVerification ? canonicalVerification.eligible ? "ELIGIBLE" : "INELIGIBLE" : review?.status ?? "NOT EVALUATED"} />
              <EvidenceField label="Quality Gate audit" value={latestQualityGate ? `${latestQualityGate.state} · non-authoritative projection` : "Not evaluated"} />
              {review?.identity?.pullRequestUrl ? <div className="sm:col-span-2 lg:col-span-4"><a className="inline-flex items-center text-accent hover:underline" href={safeExternalUrl(review.identity.pullRequestUrl)} target="_blank" rel="noreferrer">Open exact candidate pull request <ExternalLink className="ml-1 h-3 w-3" /></a></div> : null}
              {(canonicalVerification?.reasons?.length ?? 0) > 0 ? <div className="text-warning sm:col-span-2 lg:col-span-4">
                <div>Canonical verification status</div>
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  {canonicalVerification.reasons.map((reason: string) => <li key={reason}>{reason}</li>)}
                </ul>
              </div> : null}
            </div>
            <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-3">
              {next.action === "CREATE_TASK" ? <Button size="sm" onClick={() => setCreateTaskFor(workOrder._id)}>Create Task</Button> : null}
              {next.action === "RECORD_HANDOFF" ? <Button size="sm" onClick={() => setHandoffFor(workOrder._id)}>Record handoff</Button> : null}
              {!isComplete && next.action !== "WAITING" && next.action !== "CREATE_TASK" && next.action !== "RECORD_HANDOFF" ? <Button size="sm" asChild><a href={workOrderHref(projectId, workOrder._id)}>{next.label}<ExternalLink className="ml-1.5 h-3.5 w-3.5" /></a></Button> : null}
              <Button size="sm" variant="outline" asChild><a href={workOrderHref(projectId, workOrder._id)}>Open Work Order</a></Button>
            </div>
          </div>
          {handoffFor === workOrder._id ? <div className="mt-4 grid gap-3 border-t border-line pt-4">
            <div><label className="text-xs font-medium text-ink">Next action</label><Input className="mt-1" value={nextAction} onChange={(event) => setNextAction(event.target.value)} /></div>
            <div><label className="text-xs font-medium text-ink">Evidence command or check</label><Input className="mt-1 font-mono" value={command} onChange={(event) => setCommand(event.target.value)} /></div>
            <div><label className="text-xs font-medium text-ink">Known risks (one per line)</label><Textarea className="mt-1" value={knownRisks} onChange={(event) => setKnownRisks(event.target.value)} placeholder="Leave empty when no risks remain." /></div>
            <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setHandoffFor(null)}>Cancel</Button><Button disabled={submitting || !nextAction.trim() || !command.trim()} onClick={() => submitHandoff(workOrder)}>{submitting ? "Recording…" : "Confirm complete handoff"}</Button></div>
          </div> : null}
        </li>;
      })}
    </ol>
    {createTaskFor ? <CreateTaskModal projectId={projectId} defaultWorkOrderId={createTaskFor} onClose={() => setCreateTaskFor(null)} /> : null}
  </div>;
}

function EvidenceField({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div className="min-w-0"><div className="text-[10px] uppercase tracking-wide text-ink-muted">{label}</div><div className={`mt-1 break-all text-ink ${mono ? "font-mono" : ""}`}>{value}</div></div>;
}
