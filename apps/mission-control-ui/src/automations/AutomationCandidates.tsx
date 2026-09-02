import { useState } from "react";
import { useMutation } from "convex/react";
import {
  ArrowUpRight,
  Clock3,
  FileCheck2,
  GitBranch,
  ReceiptText,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  candidateEligibilityLabel,
  humanizeCron,
  statusTone,
  workspacePath,
} from "./automationModel";
import { SkillAutomationCandidates } from "./SkillAutomationCandidates";

type CandidateAction = "accept" | "reject" | "evidence";

export function AutomationCandidates({
  projectId,
  candidates,
}: {
  projectId: Id<"projects">;
  candidates: any[];
}) {
  const accept = useMutation(api.automations.acceptCandidate);
  const reject = useMutation(api.automations.rejectCandidate);
  const requestEvidence = useMutation(api.automations.requestCandidateEvidence);
  const [selection, setSelection] = useState<{ candidate: any; action: CandidateAction } | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ error?: boolean; text: string } | null>(null);

  async function confirm() {
    if (!selection || reason.trim().length < 5) return;
    setBusy(true);
    setMessage(null);
    const args = {
      projectId,
      candidateId: selection.candidate.id,
      actorId: "operator",
      reason: reason.trim(),
      policyVersion: "automation-v1",
    };
    try {
      if (selection.action === "accept") {
        const result = await accept(args);
        setMessage({
          text: result.created
            ? "Disabled Automation Definition created. Nothing was activated, approved, dispatched, or executed."
            : "This candidate already has an Automation Definition.",
        });
      } else if (selection.action === "reject") {
        await reject(args);
        setMessage({ text: "Candidate rejected and the reason was added to Decisions." });
      } else {
        await requestEvidence(args);
        setMessage({ text: "Evidence request recorded as a policy-blocked decision." });
      }
      setSelection(null);
      setReason("");
    } catch (error) {
      setMessage({ error: true, text: error instanceof Error ? error.message : "Candidate decision failed" });
    } finally {
      setBusy(false);
    }
  }

  if (candidates.length === 0) {
    return (
      <div className="space-y-5">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Registry skill candidates</h2>
          <p className="mt-1 text-xs text-muted-foreground">Published deterministic skills assessed against the governed Automation contract.</p>
        </div>
        <SkillAutomationCandidates projectId={projectId} />
        <Card className="border-dashed p-8 text-center">
          <Sparkles className="mx-auto h-5 w-5 text-muted-foreground" />
          <h2 className="mt-3 text-sm font-semibold text-foreground">No repeated governed work has enough evidence yet</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Two completed comparable WorkOrders and fresh verification evidence are required.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Registry skill candidates</h2>
        <p className="mt-1 text-xs text-muted-foreground">Published deterministic skills assessed against the governed Automation contract.</p>
      </div>
      <SkillAutomationCandidates projectId={projectId} />
      <div className="border-t border-[var(--panel-line)] pt-5">
        <h2 className="text-sm font-semibold text-foreground">Repeated WorkOrder candidates</h2>
        <p className="mt-1 text-xs text-muted-foreground">Evidence-backed repetition discovered from completed governed work.</p>
      </div>
      {message ? (
        <p
          role={message.error ? "alert" : "status"}
          className={message.error ? "text-sm text-err" : "text-sm text-ok"}
        >
          {message.text}
        </p>
      ) : null}
      <div className="grid gap-4">
        {candidates.map((candidate) => {
          const eligibility = candidateEligibilityLabel(candidate);
          const accepted = eligibility === "ACCEPTED";
          const rejected = eligibility === "REJECTED";
          return (
            <Card key={candidate.id} className="overflow-hidden">
              <div className="border-b border-[var(--panel-line)] bg-card/45 p-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold text-foreground">{candidate.pattern}</h2>
                      <Badge variant="outline" className={statusTone(eligibility)}>{eligibility}</Badge>
                      <Badge variant="outline">{candidate.riskLevel} risk</Badge>
                      <Badge variant="outline">{candidate.recommendedAutonomyLevel}</Badge>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {candidate.workflow
                        ? `${candidate.workflow.name} · ${candidate.workflow.workflowId}@v${candidate.workflow.version}`
                        : candidate.workflowId
                          ? `Workflow ${candidate.workflowId} is unavailable`
                          : "Repository pattern awaiting Workflow design"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      disabled={!candidate.eligible || accepted || rejected}
                      onClick={() => setSelection({ candidate, action: "accept" })}
                    >
                      Review and accept
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={accepted || rejected}
                      onClick={() => setSelection({ candidate, action: "evidence" })}
                    >
                      Request evidence
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={accepted || rejected}
                      onClick={() => setSelection({ candidate, action: "reject" })}
                    >
                      Reject
                    </Button>
                  </div>
                </div>
              </div>
              <div className="grid gap-5 p-4 xl:grid-cols-[1fr_0.9fr]">
                <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
                  <Metric label="Pattern type" value={candidate.workflowId ? "Workflow repetition" : "Repository repetition"} />
                  <Metric label="Scope" value={candidate.repository ?? candidate.pattern} />
                  <Metric label="Occurrences" value={String(candidate.occurrences)} />
                  <Metric label="Completed WorkOrders" value={String(candidate.completedCount)} />
                  <Metric label="Eligible receipts" value={String(candidate.receiptCount)} />
                  <Metric label="Confidence" value={`${Math.round(candidate.confidence * 100)}%`} />
                  <Metric label="Estimated time saved" value={`${candidate.estimatedHumanMinutesSaved} min / cadence`} />
                  <Metric label="Suggested cadence" value={humanizeCron(candidate.suggestedCadence)} />
                  <Metric label="Cron" value={candidate.suggestedCadence} />
                </dl>
                <div className="rounded-lg border border-[var(--panel-line)] bg-muted/10 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-xs font-semibold uppercase tracking-[0.13em] text-muted-foreground">
                      Supporting WorkOrders
                    </h3>
                    <span className="text-xs text-muted-foreground">{candidate.supportingWorkOrders.length}</span>
                  </div>
                  <ul className="mt-2 space-y-2">
                    {candidate.supportingWorkOrders.map((workOrder: any) => (
                      <li key={workOrder._id}>
                        <a
                          href={workspacePath(`/v2/control-work-orders?workOrder=${workOrder._id}`, projectId)}
                          className="flex items-center justify-between gap-3 rounded-md px-2 py-2 text-sm hover:bg-muted/30"
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-foreground">{workOrder.title}</span>
                            <span className="mt-0.5 block text-xs text-muted-foreground">
                              {workOrder.state} · verification {workOrder.verificationStatus}
                            </span>
                          </span>
                          <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              {!candidate.eligible ? (
                <div className="flex items-start gap-2 border-t border-warn/15 bg-warn-soft px-4 py-3 text-xs text-warn">
                  <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {candidate.eligibilityReason}
                  <a href={workspacePath("/v2/harness-workshop", projectId)} className="ml-auto shrink-0 font-medium hover:text-white">
                    Create or revise Workflow
                  </a>
                </div>
              ) : null}
            </Card>
          );
        })}
      </div>

      <Dialog
        open={!!selection}
        onOpenChange={(open) => {
          if (!open) {
            setSelection(null);
            setReason("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialogTitle(selection?.action)}: {selection?.candidate.pattern}</DialogTitle>
            <DialogDescription>{dialogDescription(selection?.action)}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 rounded-lg border border-border bg-muted/20 p-3 text-sm text-muted-foreground sm:grid-cols-3">
            <span className="flex items-center gap-1.5"><FileCheck2 className="h-4 w-4" /> {selection?.candidate.completedCount} completed</span>
            <span className="flex items-center gap-1.5"><ReceiptText className="h-4 w-4" /> {selection?.candidate.receiptCount} receipts</span>
            <span className="flex items-center gap-1.5"><Clock3 className="h-4 w-4" /> {humanizeCron(selection?.candidate.suggestedCadence)}</span>
            <span className="flex items-center gap-1.5 sm:col-span-3"><GitBranch className="h-4 w-4" /> {selection?.candidate.workflowId ?? "Workflow required"}</span>
          </div>
          <div className="space-y-2">
            <Label htmlFor="candidate-decision-reason">Decision reason</Label>
            <Textarea
              id="candidate-decision-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Record the evidence and rationale for this decision."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelection(null)}>Cancel</Button>
            <Button disabled={busy || reason.trim().length < 5} onClick={() => void confirm()}>
              {busy ? "Recording…" : dialogButton(selection?.action)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-foreground">{value}</dd>
    </div>
  );
}

function dialogTitle(action?: CandidateAction) {
  if (action === "reject") return "Reject candidate";
  if (action === "evidence") return "Request more evidence";
  return "Accept candidate";
}

function dialogDescription(action?: CandidateAction) {
  if (action === "reject") return "Rejection requires a reason and creates an audited governance decision.";
  if (action === "evidence") return "Record what additional proof is required before this Candidate can proceed.";
  return "This creates a disabled Automation Definition. It does not activate, approve, dispatch, or execute work.";
}

function dialogButton(action?: CandidateAction) {
  if (action === "reject") return "Reject candidate";
  if (action === "evidence") return "Request evidence";
  return "Create disabled Definition";
}
