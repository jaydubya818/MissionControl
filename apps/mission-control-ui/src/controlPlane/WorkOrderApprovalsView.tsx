import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShieldCheck } from "lucide-react";

const STATUS_OPTIONS = ["PENDING", "APPROVED", "CONDITIONAL", "REJECTED", "REVISION_REQUESTED", "EXPIRED", "SUPERSEDED", "REVOKED"] as const;

export function WorkOrderApprovalsView({ projectId }: { projectId: Id<"projects"> | null }) {
  const [status, setStatus] = useState<(typeof STATUS_OPTIONS)[number]>("PENDING");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [decisionNotes, setDecisionNotes] = useState<Record<string, string>>({});
  const [conditionNotes, setConditionNotes] = useState<Record<string, string>>({});
  const approvals = useQuery(api.workOrders.approvalQueue, projectId ? { projectId, status } : { status });
  const decideApprovalDecision = useMutation(api.workOrders.decideApprovalDecision);

  const counts = useMemo(() => ({
    total: approvals?.length ?? 0,
    waiting: (approvals ?? []).filter((item) => item.status === "PENDING").length,
    conditional: (approvals ?? []).filter((item) => item.status === "CONDITIONAL").length,
  }), [approvals]);

  async function handleDecision(approvalDecisionId: string, decision: "APPROVE" | "APPROVE_WITH_CONDITIONS" | "REJECT" | "REQUEST_REVISION") {
    try {
      setSavingId(approvalDecisionId);
      await decideApprovalDecision({
        approvalDecisionId: approvalDecisionId as Id<"approvalDecisions">,
        decision,
        approver: "operator",
        reason: decisionNotes[approvalDecisionId] || undefined,
        conditions: decision === "APPROVE_WITH_CONDITIONS"
          ? (conditionNotes[approvalDecisionId]?.split("\n").map((line) => line.trim()).filter(Boolean) ?? [])
          : undefined,
      });
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <PageHeader
        eyebrow="Software factory"
        title="Approval Center"
        description="Review WorkOrder approvals, evidence on hand, and remaining uncertainty before protected actions or acceptance."
        icon={<ShieldCheck className="h-5 w-5" />}
      />

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <div className="grid grid-cols-3 gap-3">
          <Card className="p-4"><div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Shown</div><div className="mt-2 text-2xl font-semibold">{counts.total}</div></Card>
          <Card className="p-4"><div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Pending</div><div className="mt-2 text-2xl font-semibold text-amber-300">{counts.waiting}</div></Card>
          <Card className="p-4"><div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Conditional</div><div className="mt-2 text-2xl font-semibold text-registry-accent">{counts.conditional}</div></Card>
        </div>

        <div className="mt-4 max-w-[220px] space-y-1.5">
          <Label className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Status</Label>
          <Select value={status} onValueChange={(value) => setStatus(value as (typeof STATUS_OPTIONS)[number])}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="mt-4 space-y-4">
          {(approvals ?? []).length === 0 ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">No approvals in this status.</Card>
          ) : (approvals ?? []).map((approval) => (
            <Card key={approval._id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-foreground">{approval.workOrder?.title ?? approval.workOrderId}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{approval.approvalType} · {approval.requestedAction}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">{approval.riskLevel}</Badge>
                  <Badge variant="outline">{approval.status}</Badge>
                </div>
              </div>

              <div className="mt-3 grid gap-2 text-xs text-muted-foreground md:grid-cols-2 xl:grid-cols-4">
                <div><span className="text-foreground/80">Evidence available:</span> {approval.evidenceAvailable}</div>
                <div><span className="text-foreground/80">Approver:</span> {approval.approver ?? "—"}</div>
                <div><span className="text-foreground/80">Requested by:</span> {approval.requestedBy ?? "—"}</div>
                <div><span className="text-foreground/80">Run:</span> {approval.latestRun?.runId ?? "—"}</div>
                <div><span className="text-foreground/80">Revision:</span> {approval.workOrderRevisionNumber ? `r${approval.workOrderRevisionNumber}` : "—"}</div>
                <div><span className="text-foreground/80">Expires:</span> {approval.expiresAt ? new Date(approval.expiresAt).toLocaleString() : "—"}</div>
              </div>

              <div className="mt-3 rounded-lg border border-[var(--panel-line)] bg-background/40 p-3 text-xs text-muted-foreground">
                <div className="font-medium text-foreground/85">Remaining uncertainty</div>
                <ul className="mt-2 list-disc space-y-1 pl-4">
                  {(approval.remainingUncertainty?.length ? approval.remainingUncertainty : ["No blocking uncertainty recorded."]).map((item: string, index: number) => (
                    <li key={`${approval._id}-${index}`}>{item}</li>
                  ))}
                </ul>
              </div>

              {approval.status === "PENDING" ? (
                <div className="mt-4 space-y-3">
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>Decision reason</Label>
                      <Input value={decisionNotes[approval._id] ?? ""} onChange={(event) => setDecisionNotes((current) => ({ ...current, [approval._id]: event.target.value }))} placeholder="Why this decision is safe / blocked" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Conditions</Label>
                      <Input value={conditionNotes[approval._id] ?? ""} onChange={(event) => setConditionNotes((current) => ({ ...current, [approval._id]: event.target.value }))} placeholder="One-line condition or newline-separated list" />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => handleDecision(approval._id, "APPROVE")} disabled={savingId === approval._id}>Approve</Button>
                    <Button size="sm" variant="outline" onClick={() => handleDecision(approval._id, "APPROVE_WITH_CONDITIONS")} disabled={savingId === approval._id}>Approve with conditions</Button>
                    <Button size="sm" variant="destructive" onClick={() => handleDecision(approval._id, "REJECT")} disabled={savingId === approval._id}>Reject</Button>
                    <Button size="sm" variant="secondary" onClick={() => handleDecision(approval._id, "REQUEST_REVISION")} disabled={savingId === approval._id}>Request revision</Button>
                  </div>
                </div>
              ) : null}
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
