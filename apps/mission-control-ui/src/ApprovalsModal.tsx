import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

type ApprovalStatus = "PENDING" | "ESCALATED" | "APPROVED" | "DENIED";

const TAB_ORDER: ApprovalStatus[] = ["PENDING", "ESCALATED", "APPROVED", "DENIED"];
const TAB_LABEL: Record<ApprovalStatus, string> = {
  PENDING: "Pending",
  ESCALATED: "Escalated",
  APPROVED: "Approved",
  DENIED: "Denied",
};

export function ApprovalsModal({
  projectId,
  onClose,
}: {
  projectId: Id<"projects"> | null;
  onClose: () => void;
}) {
  const [activeTab, setActiveTab] = useState<ApprovalStatus>("PENDING");

  const pending = useQuery(
    api.approvals.listByStatus,
    projectId ? { projectId, status: "PENDING", limit: 100 } : { status: "PENDING", limit: 100 }
  );
  const escalated = useQuery(
    api.approvals.listByStatus,
    projectId ? { projectId, status: "ESCALATED", limit: 100 } : { status: "ESCALATED", limit: 100 }
  );
  const approved = useQuery(
    api.approvals.listByStatus,
    projectId ? { projectId, status: "APPROVED", limit: 100 } : { status: "APPROVED", limit: 100 }
  );
  const denied = useQuery(
    api.approvals.listByStatus,
    projectId ? { projectId, status: "DENIED", limit: 100 } : { status: "DENIED", limit: 100 }
  );
  const agents = useQuery(api.agents.listAll, projectId ? { projectId } : {});

  const approveMutation = useMutation(api.approvals.approve);
  const denyMutation = useMutation(api.approvals.deny);

  const isLoading = !pending || !escalated || !approved || !denied || !agents;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-[900px] max-h-[90vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>Approvals Center</DialogTitle>
          <DialogDescription>
            Escalated approvals breached SLA and should be actioned first.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="py-6 text-sm text-muted-foreground">Loading approvals...</div>
        ) : (() => {
          const agentMap = new Map<Id<"agents">, Doc<"agents">>(
            (agents as Doc<"agents">[]).map((agent) => [agent._id, agent])
          );
          const byStatus: Record<ApprovalStatus, Doc<"approvals">[]> = {
            PENDING: pending,
            ESCALATED: escalated,
            APPROVED: approved,
            DENIED: denied,
          };
          const rows = byStatus[activeTab];
          const counts = {
            PENDING: pending.length,
            ESCALATED: escalated.length,
            APPROVED: approved.length,
            DENIED: denied.length,
          };

          return (
            <>
              <div className="flex gap-2 flex-wrap" role="tablist">
                {TAB_ORDER.map((status) => (
                  <Button
                    key={status}
                    role="tab"
                    aria-selected={activeTab === status}
                    variant={activeTab === status ? "default" : "outline"}
                    size="sm"
                    onClick={() => setActiveTab(status)}
                  >
                    {TAB_LABEL[status]} ({counts[status]})
                  </Button>
                ))}
              </div>

              {rows.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">
                  No {TAB_LABEL[activeTab].toLowerCase()} approvals.
                </p>
              ) : (
                <div className="space-y-3">
                  {rows.map((approval) => (
                    <ApprovalCard
                      key={approval._id}
                      approval={approval}
                      requestor={agentMap.get(approval.requestorAgentId)}
                      canDecide={activeTab === "PENDING" || activeTab === "ESCALATED"}
                      onApprove={async (reason) => {
                        return await approveMutation({
                          approvalId: approval._id,
                          decidedByUserId: "operator",
                          reason,
                        });
                      }}
                      onDeny={async (reason) => {
                        return await denyMutation({
                          approvalId: approval._id,
                          decidedByUserId: "operator",
                          reason,
                        });
                      }}
                    />
                  ))}
                </div>
              )}
            </>
          );
        })()}
      </DialogContent>
    </Dialog>
  );
}

function ApprovalCard({
  approval,
  requestor,
  canDecide,
  onApprove,
  onDeny,
}: {
  approval: Doc<"approvals">;
  requestor: Doc<"agents"> | undefined;
  canDecide: boolean;
  onApprove: (reason: string) => Promise<any>;
  onDeny: (reason: string) => Promise<any>;
}) {
  const [loading, setLoading] = useState(false);
  const [approveReason, setApproveReason] = useState("");
  const [denyReason, setDenyReason] = useState("");
  const [showDeny, setShowDeny] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const expiryText = useMemo(() => {
    return new Date(approval.expiresAt).toLocaleString();
  }, [approval.expiresAt]);

  const decidedText = approval.decidedAt ? new Date(approval.decidedAt).toLocaleString() : null;
  const escalatedText = approval.escalatedAt ? new Date(approval.escalatedAt).toLocaleString() : null;
  const minutesRemaining = Math.floor((approval.expiresAt - Date.now()) / 60000);
  const needsDualControl = (approval.requiredDecisionCount ?? 1) > 1;

  async function handleApprove() {
    if (!approveReason.trim()) return;
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      const result = await onApprove(approveReason.trim());
      if (result?.pendingSecondDecision) {
        setInfo("First approval recorded. A second distinct approver is required.");
      } else {
        setInfo("Approval recorded.");
      }
      setApproveReason("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to approve. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDeny() {
    if (!denyReason.trim()) return;
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      await onDeny(denyReason.trim());
      setShowDeny(false);
      setDenyReason("");
      setInfo("Approval denied.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to deny. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className={cn(
        "p-4 rounded-lg border bg-card",
        approval.status === "ESCALATED" ? "border-orange-500/50" : "border-border"
      )}
    >
      <div className="flex justify-between items-center gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-foreground">
            {requestor?.emoji || "🤖"} {requestor?.name ?? "Agent"}
          </span>
          <span className="text-xs text-muted-foreground">· {approval.actionType}</span>
          <Badge
            variant={approval.riskLevel === "RED" ? "destructive" : "secondary"}
            className="text-xs"
          >
            {approval.riskLevel}
          </Badge>
          {needsDualControl && (
            <Badge variant="outline" className="text-xs">
              DUAL CONTROL
            </Badge>
          )}
        </div>
        <Badge
          variant={
            approval.status === "APPROVED" ? "default"
            : approval.status === "DENIED" ? "destructive"
            : "secondary"
          }
          className="text-xs"
        >
          {approval.status}
        </Badge>
      </div>

      <p className="font-medium text-sm mt-2">{approval.actionSummary}</p>

      <p className="text-xs text-muted-foreground mt-1.5 whitespace-pre-wrap">
        {approval.justification}
      </p>

      <p className={cn("text-xs mt-2", minutesRemaining < 10 ? "text-destructive" : "text-muted-foreground")}>
        Expires: {expiryText} ({minutesRemaining >= 0 ? `${minutesRemaining}m left` : "expired"})
      </p>

      {approval.status === "ESCALATED" && (
        <p className="text-xs text-orange-400 mt-1.5">
          Escalated: {escalatedText ?? "now"}
          {approval.escalationReason ? ` · ${approval.escalationReason}` : ""}
        </p>
      )}

      {approval.firstDecisionAt && (
        <p className="text-xs text-amber-400 mt-1.5">
          First approval: {approval.firstDecisionByUserId ?? "operator"} at {new Date(approval.firstDecisionAt).toLocaleString()}
        </p>
      )}

      {!canDecide && (
        <p className="text-xs text-foreground/70 mt-2">
          Decision reason: {approval.decisionReason || "No reason provided"}
          {decidedText ? ` · ${decidedText}` : ""}
        </p>
      )}

      {canDecide && (
        <div className="mt-3 pt-3 border-t border-border">
          {error && (
            <div className="mb-2 p-2 bg-destructive/10 border border-destructive/20 rounded-md text-xs text-destructive">
              {error}
            </div>
          )}

          {info && (
            <div className="mb-2 p-2 bg-primary/10 border border-primary/20 rounded-md text-xs text-primary">
              {info}
            </div>
          )}

          {!showDeny ? (
            <>
              <Input
                value={approveReason}
                onChange={(event) => setApproveReason(event.target.value)}
                placeholder="Approval reason (required)"
                className="mb-2"
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={handleApprove}
                  disabled={loading || !approveReason.trim()}
                >
                  {loading ? "Saving..." : needsDualControl && !approval.firstDecisionAt ? "Record 1st Approval" : "Approve"}
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => setShowDeny(true)}
                  disabled={loading}
                >
                  Deny
                </Button>
              </div>
            </>
          ) : (
            <>
              <Input
                value={denyReason}
                onChange={(event) => setDenyReason(event.target.value)}
                placeholder="Denial reason (required)"
                className="mb-2"
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={handleDeny}
                  disabled={loading || !denyReason.trim()}
                >
                  {loading ? "Saving..." : "Confirm Deny"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => { setShowDeny(false); setDenyReason(""); }}
                  disabled={loading}
                >
                  Cancel
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
