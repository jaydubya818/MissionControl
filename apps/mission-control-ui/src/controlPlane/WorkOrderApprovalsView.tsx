import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  FileCheck2,
  GitBranch,
  Loader2,
  Scale,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { workspacePath } from "@/automations/automationModel";
import {
  buildOperatorDecisionPacket,
  sortOperatorApprovals,
  type DecisionEvidenceItem,
  type OperatorApproval,
} from "./operatorDecisionModel";

const STATUS_OPTIONS = ["PENDING", "APPROVED", "CONDITIONAL", "REJECTED", "REVISION_REQUESTED", "EXPIRED", "SUPERSEDED", "REVOKED"] as const;
type ApprovalStatus = (typeof STATUS_OPTIONS)[number];
type Decision = "APPROVE" | "APPROVE_WITH_CONDITIONS" | "REJECT" | "REQUEST_REVISION";

const RISK_TONE: Record<string, string> = {
  CRITICAL: "border-red-500/40 bg-red-500/10 text-red-200",
  HIGH: "border-amber-500/40 bg-amber-500/10 text-amber-200",
  MEDIUM: "border-cyan-500/30 bg-cyan-500/10 text-cyan-200",
  LOW: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
};

function StatCard({ label, value, note, tone = "neutral" }: { label: string; value: number; note: string; tone?: "neutral" | "warning" | "danger" }) {
  return (
    <Card className={cn("p-4", tone === "warning" && "border-amber-500/25", tone === "danger" && "border-red-500/25")}>
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <div className={cn("font-mono text-2xl font-semibold", tone === "warning" && "text-amber-200", tone === "danger" && "text-red-200")}>{value}</div>
        <div className="text-right text-[11px] text-muted-foreground">{note}</div>
      </div>
    </Card>
  );
}

function statusLabel(status: string) {
  return status.toLowerCase().replace(/_/g, " ");
}

function evidenceTone(status: string) {
  if (["PASSED", "WAIVED"].includes(status)) return "text-emerald-300";
  if (["FAILED", "STALE"].includes(status)) return "text-red-300";
  return "text-amber-200";
}

function EvidenceRow({ item }: { item: DecisionEvidenceItem }) {
  return (
    <li className="grid gap-2 border-b border-[var(--panel-line)] px-3 py-3 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto]">
      <div className="min-w-0">
        <div className="text-[12.5px] font-medium text-foreground">{item.title}</div>
        <div className="mt-1 text-[11.5px] text-muted-foreground">
          {item.method}{item.verifier ? ` · ${item.verifier}` : " · verifier unknown"}
        </div>
        {item.result ? <div className="mt-1 line-clamp-2 text-[11.5px] text-muted-foreground">{item.result}</div> : null}
        {item.location ? <div className="mt-1 break-all font-mono text-[10.5px] text-cyan-200">{item.location}</div> : null}
      </div>
      <div className={cn("font-mono text-[11px] font-semibold", evidenceTone(item.status))}>{item.status}</div>
    </li>
  );
}

export function WorkOrderApprovalsView({ projectId }: { projectId: Id<"projects"> | null }) {
  const [status, setStatus] = useState<ApprovalStatus>("PENDING");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [decisionReason, setDecisionReason] = useState("");
  const [conditionNotes, setConditionNotes] = useState("");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [outcomeNotice, setOutcomeNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const approvals = useQuery(api.workOrders.approvalQueue, projectId ? { projectId, status } : { status });
  const decideApprovalDecision = useMutation(api.workOrders.decideApprovalDecision);

  const ordered = useMemo(
    () => sortOperatorApprovals((approvals ?? []) as unknown as OperatorApproval[]),
    [approvals]
  );
  const selected = ordered.find((item) => item._id === selectedId) ?? ordered[0] ?? null;
  const packet = selected ? buildOperatorDecisionPacket(selected) : null;
  const resumesVerifiedAttempt = selected?.approvalType === "HUMAN_REVIEW"
    && selected.latestRun?.status === "PAUSED"
    && selected.latestRun?.factoryContinuationStatus === "AWAITING_HUMAN_REVIEW"
    && selected.latestRun?.factoryApprovalDecisionId === selected._id;
  const workOrderHref = packet?.workOrderId
    ? projectId
      ? workspacePath(`/v2/control-work-orders?workOrder=${packet.workOrderId}`, String(projectId))
      : `/v2/control-work-orders?workOrder=${packet.workOrderId}`
    : null;

  useEffect(() => {
    if (!selectedId && ordered[0]) setSelectedId(ordered[0]._id);
    if (selectedId && !ordered.some((item) => item._id === selectedId)) setSelectedId(ordered[0]?._id ?? null);
  }, [ordered, selectedId]);

  useEffect(() => {
    setDecisionReason("");
    setConditionNotes("");
    setMessage(null);
  }, [selected?._id]);

  const counts = useMemo(() => ({
    shown: ordered.length,
    critical: ordered.filter((item) => ["CRITICAL", "HIGH"].includes(item.riskLevel)).length,
    uncertain: ordered.filter((item) => (item.remainingUncertainty ?? []).length > 0).length,
    expiring: ordered.filter((item) => item.expiresAt && item.expiresAt - Date.now() <= 30 * 60_000).length,
  }), [ordered]);

  async function handleDecision(decision: Decision) {
    if (!selected || !packet) return;
    const reason = decisionReason.trim();
    if (!reason) {
      setMessage({ type: "error", text: "Record why this decision is safe, blocked, or needs revision." });
      return;
    }
    const conditions = conditionNotes.split("\n").map((line) => line.trim()).filter(Boolean);
    if (decision === "APPROVE_WITH_CONDITIONS" && conditions.length === 0) {
      setMessage({ type: "error", text: "Conditional approval requires at least one explicit condition." });
      return;
    }
    if (!packet.canDecide && ["APPROVE", "APPROVE_WITH_CONDITIONS"].includes(decision)) {
      setMessage({ type: "error", text: packet.blockingReasons.join(" ") || "This decision is not ready for approval." });
      return;
    }

    try {
      setSavingId(selected._id);
      setMessage(null);
      const result = await decideApprovalDecision({
        approvalDecisionId: selected._id as Id<"approvalDecisions">,
        projectId: projectId ?? undefined,
        decision,
        reason,
        conditions: decision === "APPROVE_WITH_CONDITIONS" ? conditions : undefined,
        metadata: { surface: "operator-decision-workspace", packetVersion: "v1" },
      });
      const resultLabel = decision === "REQUEST_REVISION" ? "Revision requested" : decision === "REJECT" ? "Decision rejected" : "Authorization recorded";
      const continuationOutcome = (result as { factoryContinuationOutcome?: "RESUME_PUBLISH" | "FAIL_ATTEMPT" } | null)
        ?.factoryContinuationOutcome;
      const decisionRejectedReason = (result as { decisionRejectedReason?: string } | null)?.decisionRejectedReason;
      if (decisionRejectedReason) {
        setOutcomeNotice({ type: "error", text: decisionRejectedReason });
        return;
      }
      const continuationMessage = continuationOutcome === "RESUME_PUBLISH"
        ? "The same verified Attempt is queued to resume at pull-request publication."
        : continuationOutcome === "FAIL_ATTEMPT"
            ? "The paused Attempt is closed and cannot publish."
            : "Dispatch remains a separate governed action.";
      setOutcomeNotice({ type: "success", text: `${resultLabel}. ${continuationMessage}` });
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Decision could not be recorded." });
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <PageHeader
        eyebrow="Operator control plane"
        title="Decision Center"
        description="Prioritize exceptions, inspect the governing record, authorize bounded work, and follow the evidence through acceptance."
        icon={<ShieldCheck className="h-5 w-5" />}
      />

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <StatCard label="In view" value={counts.shown} note={statusLabel(status)} />
          <StatCard label="High risk" value={counts.critical} note="review scope" tone={counts.critical ? "danger" : "neutral"} />
          <StatCard label="Uncertain" value={counts.uncertain} note="evidence gaps" tone={counts.uncertain ? "warning" : "neutral"} />
          <StatCard label="Expiring" value={counts.expiring} note="within 30 min" tone={counts.expiring ? "warning" : "neutral"} />
        </div>

        <div className="mt-4 flex flex-wrap items-end justify-between gap-3 rounded-xl border border-[var(--panel-line)] bg-card/40 p-3">
          <div>
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-cyan-200">Decision gate</div>
            <p className="mt-1 text-[12.5px] text-muted-foreground">Approval records authority. A verification checkpoint may resume only the exact reviewed candidate; every other dispatch remains explicit.</p>
          </div>
          <div className="w-[220px] space-y-1.5">
            <Label className="text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">Decision status</Label>
            <Select value={status} onValueChange={(value) => { setStatus(value as ApprovalStatus); setSelectedId(null); }}>
              <SelectTrigger aria-label="Approval status filter"><SelectValue /></SelectTrigger>
              <SelectContent>{STATUS_OPTIONS.map((option) => <SelectItem key={option} value={option}>{statusLabel(option)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>

        {outcomeNotice ? (
          <div
            role={outcomeNotice.type === "error" ? "alert" : "status"}
            className={cn(
              "mt-4 flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-[12.5px]",
              outcomeNotice.type === "error"
                ? "border-red-500/30 bg-red-500/[0.08] text-red-200"
                : "border-emerald-500/30 bg-emerald-500/[0.08] text-emerald-200",
            )}
          >
            <span>{outcomeNotice.text}</span>
            <Button size="sm" variant="ghost" onClick={() => setOutcomeNotice(null)}>Dismiss</Button>
          </div>
        ) : null}

        {approvals === undefined ? (
          <Card className="mt-4 flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading governed decisions…</Card>
        ) : ordered.length === 0 ? (
          <Card className="mt-4 p-10 text-center">
            <CheckCircle2 className="mx-auto h-5 w-5 text-emerald-300" />
            <div className="mt-3 text-sm font-medium text-foreground">No {statusLabel(status)} decisions</div>
            <p className="mt-1 text-sm text-muted-foreground">The queue is clear for this decision state.</p>
          </Card>
        ) : (
          <div className="mt-4 grid min-h-[620px] gap-4 xl:grid-cols-[minmax(280px,0.72fr)_minmax(0,1.6fr)]">
            <Card className="overflow-hidden self-start">
              <div className="border-b border-[var(--panel-line)] px-4 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Attention queue</div>
                <div className="mt-1 text-[12px] text-muted-foreground">Risk first, then expiry. Ordering does not determine the decision.</div>
              </div>
              <div className="divide-y divide-[var(--panel-line)]">
                {ordered.map((approval) => {
                  const itemPacket = buildOperatorDecisionPacket(approval);
                  const active = approval._id === selected?._id;
                  return (
                    <button
                      key={approval._id}
                      type="button"
                      onClick={() => setSelectedId(approval._id)}
                      className={cn("w-full px-4 py-3.5 text-left transition-colors", active ? "bg-cyan-400/[0.08]" : "hover:bg-card/70")}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-[13px] font-medium text-foreground">{itemPacket.title}</div>
                          <div className="mt-1 line-clamp-2 text-[11.5px] leading-relaxed text-muted-foreground">{itemPacket.attentionReason}</div>
                        </div>
                        <Badge variant="outline" className={cn("shrink-0 font-mono text-[10px]", RISK_TONE[approval.riskLevel])}>{approval.riskLevel}</Badge>
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2 font-mono text-[10.5px] text-muted-foreground">
                        <span>{approval.approvalType}</span>
                        <span>{approval.expiresAt ? new Date(approval.expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "no expiry"}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </Card>

            {selected && packet ? (
              <div className="min-w-0 space-y-4">
                <Card className="overflow-hidden">
                  <div className="border-b border-[var(--panel-line)] bg-card/60 px-5 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-cyan-200">Needs attention</div>
                        <h2 className="mt-1 text-lg font-semibold tracking-tight text-foreground">{packet.title}</h2>
                        <p className="mt-1 text-[12.5px] text-amber-100">{packet.attentionReason}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={cn("font-mono", RISK_TONE[packet.riskLevel])}>{packet.riskLevel}</Badge>
                        <Badge variant="outline">{statusLabel(selected.status)}</Badge>
                      </div>
                    </div>
                  </div>

                  <div className="grid divide-y divide-[var(--panel-line)] lg:grid-cols-2 lg:divide-x lg:divide-y-0">
                    <section className="p-5">
                      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"><Scale className="h-3.5 w-3.5" /> Governed decision</div>
                      <div className="mt-3 text-[14px] font-medium text-foreground">{packet.requestedDecision}</div>
                      <p className="mt-3 text-[12.5px] leading-relaxed text-muted-foreground">{packet.authority}</p>
                      <div className="mt-4 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Policy</div>
                      <ul className="mt-2 space-y-1.5 text-[12px] text-foreground/80">{packet.policy.map((item) => <li key={item}>— {item}</li>)}</ul>
                    </section>
                    <section className="p-5">
                      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"><GitBranch className="h-3.5 w-3.5" /> Authorized scope</div>
                      <ul className="mt-3 space-y-2 text-[12px] text-foreground/80">{packet.scope.map((item) => <li key={item} className={item.includes("unknown") || item.includes("unassigned") || item.includes("not selected") ? "text-amber-200" : ""}>— {item}</li>)}</ul>
                    </section>
                  </div>
                </Card>

                <div className="grid gap-4 2xl:grid-cols-2">
                  <Card className="overflow-hidden">
                    <div className="flex items-center justify-between border-b border-[var(--panel-line)] px-4 py-3">
                      <div className="flex items-center gap-2 text-[12px] font-semibold text-foreground"><FileCheck2 className="h-4 w-4 text-cyan-200" /> Evidence on hand</div>
                      <span className="font-mono text-[10.5px] text-muted-foreground">{packet.evidence.filter((item) => ["PASSED", "WAIVED"].includes(item.status)).length}/{packet.evidence.length}</span>
                    </div>
                    {packet.evidence.length ? <ul>{packet.evidence.map((item) => <EvidenceRow key={item.criterionId} item={item} />)}</ul> : <div className="p-5 text-[12px] text-amber-200">No acceptance criteria are defined. Completion cannot be proven.</div>}
                  </Card>

                  <Card className="overflow-hidden">
                    <div className="border-b border-[var(--panel-line)] px-4 py-3 text-[12px] font-semibold text-foreground">Unknowns and blockers</div>
                    <div className="p-4">
                      {packet.missingInformation.length ? (
                        <ul className="space-y-2 text-[12px] text-amber-100">{packet.missingInformation.map((item) => <li key={item} className="flex gap-2"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {item}</li>)}</ul>
                      ) : (
                        <div className="flex items-center gap-2 text-[12px] text-emerald-200"><CheckCircle2 className="h-4 w-4" /> No blocking unknowns recorded for this gate.</div>
                      )}
                      {packet.blockingReasons.length ? <div className="mt-4 rounded-lg border border-red-500/25 bg-red-500/[0.06] p-3 text-[12px] text-red-200">{packet.blockingReasons.join(" ")}</div> : null}
                    </div>
                  </Card>
                </div>

                <Card className="overflow-hidden">
                  <div className="grid lg:grid-cols-2">
                    <section className="border-b border-[var(--panel-line)] p-4 lg:border-b-0 lg:border-r">
                      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"><ArrowUpRight className="h-3.5 w-3.5" /> {resumesVerifiedAttempt ? "Resume after decision" : "Dispatch after decision"}</div>
                      <p className="mt-2 text-[12.5px] leading-relaxed text-foreground/85">{packet.dispatchPreview}</p>
                      {resumesVerifiedAttempt ? (
                        <div className="mt-3 rounded-lg border border-cyan-500/25 bg-cyan-500/[0.06] p-3 text-[11.5px] text-cyan-100">
                          Same Attempt · candidate <span className="font-mono">{selected.latestRun?.candidateRevision?.slice(0, 12)}</span> · resumes at publication · no agent or verifier rerun
                        </div>
                      ) : null}
                    </section>
                    <section className="p-4">
                      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"><FileCheck2 className="h-3.5 w-3.5" /> Proof required to close</div>
                      {packet.proofRequirements.length ? <ul className="mt-2 space-y-1.5 text-[12px] text-foreground/80">{packet.proofRequirements.map((item) => <li key={item}>— {item}</li>)}</ul> : <p className="mt-2 text-[12px] text-amber-200">Proof requirements are not defined.</p>}
                    </section>
                  </div>
                </Card>

                {selected.status === "PENDING" ? (
                  <Card className="p-5">
                    <div className="grid gap-4 lg:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="decision-reason">Decision reason</Label>
                        <Textarea id="decision-reason" value={decisionReason} onChange={(event) => setDecisionReason(event.target.value)} placeholder="Cite the scope, policy, evidence, and remaining risk behind this decision." rows={4} />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="decision-conditions">Conditions</Label>
                        <Textarea id="decision-conditions" value={conditionNotes} onChange={(event) => setConditionNotes(event.target.value)} placeholder="One enforceable condition per line. Required for conditional approval." rows={4} />
                      </div>
                    </div>
                    {message ? <div role={message.type === "error" ? "alert" : "status"} className={cn("mt-3 rounded-lg border px-3 py-2 text-[12.5px]", message.type === "error" ? "border-red-500/30 bg-red-500/[0.08] text-red-200" : "border-emerald-500/30 bg-emerald-500/[0.08] text-emerald-200")}>{message.text}</div> : null}
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button size="sm" onClick={() => handleDecision("APPROVE")} disabled={savingId === selected._id || !packet.canDecide}>{savingId === selected._id ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}{resumesVerifiedAttempt ? "Approve & resume publish" : "Approve scope"}</Button>
                      <Button size="sm" variant="outline" onClick={() => handleDecision("APPROVE_WITH_CONDITIONS")} disabled={savingId === selected._id || !packet.canDecide}>{resumesVerifiedAttempt ? "Require retry with conditions" : "Approve with conditions"}</Button>
                      <Button size="sm" variant="secondary" onClick={() => handleDecision("REQUEST_REVISION")} disabled={savingId === selected._id}>Request revision</Button>
                      <Button size="sm" variant="destructive" onClick={() => handleDecision("REJECT")} disabled={savingId === selected._id}>Reject</Button>
                    </div>
                  </Card>
                ) : (
                  <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div>
                      <div className="text-[12.5px] font-medium text-foreground">Decision recorded</div>
                      <div className="mt-1 text-[12px] text-muted-foreground">{selected.reason ?? "No reason recorded."}</div>
                    </div>
                    {workOrderHref && ["APPROVED", "CONDITIONAL"].includes(selected.status) ? (
                      <a href={workOrderHref} className="inline-flex h-9 items-center rounded-md border border-[var(--panel-line)] px-3 text-[12.5px] font-medium text-cyan-200 hover:bg-card">Open dispatch & proof <ArrowUpRight className="ml-1.5 h-3.5 w-3.5" /></a>
                    ) : null}
                  </Card>
                )}

                {workOrderHref ? (
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--panel-line)] bg-card/30 px-4 py-3 text-[12px] text-muted-foreground">
                    <span>Operational truth remains on the WorkOrder: dispatch, run state, receipts, and acceptance.</span>
                    <a href={workOrderHref} className="shrink-0 font-medium text-cyan-200 hover:text-foreground">Inspect WorkOrder →</a>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
