import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Card } from "@/components/ui/card";
import { PageHeader } from "./components/PageHeader";
import { FileText, ShieldCheck, Clock, XCircle, Filter, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge, type StatusBadgeProps } from "@/components/factory/badges";
import { cn } from "@/lib/utils";

function fmtTime(ts?: number) {
  if (!ts) return "n/a";
  return new Date(ts).toLocaleString();
}

const PILL_TONES: Record<string, StatusBadgeProps["tone"]> = {
  ACTIVE:            "success",
  APPROVED:          "success",
  ALLOW:             "success",
  GREEN:             "success",
  PENDING:           "warning",
  YELLOW:            "warning",
  NEEDS_APPROVAL:    "warning",
  DENIED:            "error",
  RED:               "error",
  FAILED:            "error",
  TASK_TRANSITIONED: "info",
  APPROVAL_REQUESTED:"info",
};

function StatusPill({ value }: { value: string }) {
  return (
    <StatusBadge tone={PILL_TONES[value.toUpperCase()] ?? "neutral"} className="whitespace-nowrap">
      {value}
    </StatusBadge>
  );
}

function StatCard({ icon: Icon, label, value, accent }: {
  icon: React.ElementType; label: string; value: number; accent?: string;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-1.5">
        <Icon className="h-3.5 w-3.5 text-ink-muted" strokeWidth={1.6} />
        <span className="text-[12.5px] font-medium text-ink-secondary">{label}</span>
      </div>
      <p className={cn("text-[20px] font-semibold leading-none tabular-nums", accent ?? "text-ink")}>{value}</p>
    </Card>
  );
}

function TableSection({
  title,
  children,
  controls,
  empty,
}: {
  title: string;
  children: React.ReactNode;
  controls?: React.ReactNode;
  empty: boolean;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="px-5 py-3 border-b border-line flex items-center justify-between gap-3 flex-wrap">
        <p className="text-[15px] font-semibold text-ink">{title}</p>
        {controls}
      </div>
      {empty ? (
        <div className="py-10 text-center text-[13.5px] text-ink-muted">No records found.</div>
      ) : (
        <div className="overflow-auto">{children}</div>
      )}
    </Card>
  );
}

export function AuditView({ projectId: _projectId }: { projectId: Id<"projects"> | null }) {
  const [limit, setLimit] = useState(100);
  const [changeTypeFilter, setChangeTypeFilter] = useState("");

  const changes   = useQuery(api["governance/changeRecords"].listChangeRecords, { type: changeTypeFilter || undefined, limit });
  const approvals = useQuery(api["governance/approvalRecords"].listApprovals, {});

  const pendingCount = (approvals ?? []).filter((r) => r.status === "PENDING").length;
  const deniedCount  = (approvals ?? []).filter((r) => r.status === "DENIED").length;

  const handleExport = () => {
    const changeRows = (changes ?? []).map((c) =>
      [fmtTime(c.timestamp), c.type, c.summary, c.projectId ?? "", c.instanceId ?? "", c.versionId ?? "", `${c.relatedTable ?? ""} ${c.relatedId ?? ""}`].join(",")
    );
    const approvalRows = (approvals ?? []).map((a) =>
      [fmtTime(a.requestedAt), a.actionType, a.riskLevel, a.status, fmtTime(a.decidedAt), (a.decisionReason ?? a.justification ?? "").replace(/"/g, '""')].join(",")
    );
    const csv =
      "Change Records\nTime,Type,Summary,Project,Instance,Version,Related\n" + changeRows.join("\n") +
      "\n\nApproval Records\nRequested,Action,Risk,Status,Decided,Reason\n" + approvalRows.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `arm-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-app">
      <PageHeader
        title="ARM Audit"
        description="Governance trail for approvals, lifecycle transitions, deployments, and policy decisions."
        eyebrow="Operations"
        actions={
          <Button size="sm" variant="outline" onClick={handleExport}>
            <Download className="h-3.5 w-3.5 mr-1.5" strokeWidth={1.7} />
            Export CSV
          </Button>
        }
      />

      {/* Stats */}
      <div className="mx-auto flex min-h-0 w-full max-w-[1200px] flex-1 flex-col gap-4 overflow-hidden px-6 pb-6 pt-4">
      <div className="grid shrink-0 grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard icon={FileText}   label="Change Records"   value={(changes ?? []).length} />
        <StatCard icon={ShieldCheck} label="Approval Records" value={(approvals ?? []).length} />
        <StatCard icon={Clock}      label="Pending Approvals" value={pendingCount} accent={pendingCount > 0 ? "text-warn" : undefined} />
        <StatCard icon={XCircle}    label="Denied Decisions"  value={deniedCount}  accent={deniedCount  > 0 ? "text-err"  : undefined} />
      </div>

      <div className="grid min-h-0 flex-1 gap-4 overflow-hidden xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
        {/* Change records */}
        <TableSection
          title="Change Records"
          empty={(changes ?? []).length === 0}
          controls={
            <div className="flex shrink-0 items-center gap-3 overflow-x-auto flex-nowrap">
              <div className="flex items-center gap-2">
                <Filter className="h-3 w-3 text-ink-muted" strokeWidth={1.6} />
                <input
                  className="h-9 rounded-lg border border-line bg-surface-1 px-3 text-[13.5px] text-ink placeholder:text-ink-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring w-44"
                  placeholder="Filter by type…"
                  aria-label="Filter change records by type"
                  value={changeTypeFilter}
                  onChange={(e) => setChangeTypeFilter(e.target.value)}
                />
              </div>
              <select
                className="h-9 rounded-lg border border-line bg-surface-1 px-3 text-[13.5px] text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Row limit"
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
              >
                <option value={50}>50 rows</option>
                <option value={100}>100 rows</option>
                <option value={200}>200 rows</option>
              </select>
            </div>
          }
        >
          <table className="w-full min-w-[980px] border-collapse text-left text-[13px]">
            <thead>
              <tr className="border-b border-line">
                {["Time", "Type", "Summary", "Project", "Instance", "Version", "Related"].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-[11.5px] font-medium uppercase tracking-[0.06em] text-ink-muted">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(changes ?? []).map((change) => (
                <tr
                  key={change._id}
                  className="border-b border-line last:border-b-0 hover:bg-surface-2 transition-colors duration-150"
                >
                  <td className="px-4 py-3.5 text-ink-muted whitespace-nowrap font-mono">{fmtTime(change.timestamp)}</td>
                  <td className="px-4 py-3.5"><StatusPill value={change.type} /></td>
                  <td className="px-4 py-3.5 text-ink-secondary max-w-[280px] truncate">{change.summary}</td>
                  <td className="px-4 py-3.5 font-mono text-ink-muted truncate max-w-[140px]">{change.projectId ?? "n/a"}</td>
                  <td className="px-4 py-3.5 font-mono text-ink-muted truncate max-w-[120px]">{change.instanceId ?? "n/a"}</td>
                  <td className="px-4 py-3.5 font-mono text-ink-muted truncate max-w-[120px]">{change.versionId ?? "n/a"}</td>
                  <td className="px-4 py-3.5 text-ink-muted truncate max-w-[180px]">
                    {change.relatedTable ?? "n/a"}{change.relatedId ? ` · ${change.relatedId}` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableSection>

        {/* Approval records */}
        <TableSection title="Approval Records" empty={(approvals ?? []).length === 0}>
          <table className="w-full min-w-[840px] border-collapse text-left text-[13px]">
            <thead>
              <tr className="border-b border-line">
                {["Requested", "Action", "Risk", "Status", "Decided", "Reason"].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-[11.5px] font-medium uppercase tracking-[0.06em] text-ink-muted">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(approvals ?? []).map((approval) => (
                <tr
                  key={approval._id}
                  className="border-b border-line last:border-b-0 hover:bg-surface-2 transition-colors duration-150"
                >
                  <td className="px-4 py-3.5 text-ink-muted whitespace-nowrap font-mono">{fmtTime(approval.requestedAt)}</td>
                  <td className="px-4 py-3.5 text-ink-secondary">{approval.actionType}</td>
                  <td className="px-4 py-3.5"><StatusPill value={approval.riskLevel} /></td>
                  <td className="px-4 py-3.5"><StatusPill value={approval.status} /></td>
                  <td className="px-4 py-3.5 text-ink-muted whitespace-nowrap font-mono">{fmtTime(approval.decidedAt)}</td>
                  <td className="px-4 py-3.5 text-ink-muted truncate max-w-[200px]">
                    {approval.decisionReason ?? approval.justification ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableSection>
      </div>

      <Card className="p-5">
        <div className="text-[15px] font-semibold text-ink">Audit guidance</div>
        <div className="mt-2 space-y-3 text-[13.5px] leading-relaxed text-ink-secondary">
          <p>Use this surface to confirm that risky actions were reviewed and that the decision trail still makes sense after the fact.</p>
          <p>If audit volume becomes noisy, the real fix is tighter routing and better change summaries upstream, not more rows here.</p>
        </div>
      </Card>
      </div>
      </div>
    </main>
  );
}
