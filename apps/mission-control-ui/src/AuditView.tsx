import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

function fmtTime(ts?: number) {
  if (!ts) return "n/a";
  return new Date(ts).toLocaleString();
}

export function AuditView({ projectId }: { projectId: Id<"projects"> | null }) {
  const [limit, setLimit] = useState(100);
  const [changeTypeFilter, setChangeTypeFilter] = useState("");

  const changes = useQuery(api["governance/changeRecords"].listChangeRecords, {
    type: changeTypeFilter || undefined,
    limit,
  });
  const approvals = useQuery(api["governance/approvalRecords"].listApprovals, {});

  return (
    <main className="flex-1 overflow-auto p-6">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-foreground">ARM Audit</h2>
        <p className="text-sm text-muted-foreground">
          Governance trail for approvals, lifecycle transitions, deployments, and policy decisions.
        </p>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Change Records" value={(changes ?? []).length} />
        <Stat label="Approval Records" value={(approvals ?? []).length} />
        <Stat label="Pending Approvals" value={(approvals ?? []).filter((row) => row.status === "PENDING").length} />
        <Stat label="Denied Decisions" value={(approvals ?? []).filter((row) => row.status === "DENIED").length} />
      </div>

      <section className="mb-4 rounded-md border border-border bg-card p-4">
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <div className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Change type</div>
            <input
              className="rounded border border-border bg-secondary px-2 py-1 text-foreground"
              placeholder="e.g. DEPLOYMENT_ACTIVATED"
              value={changeTypeFilter}
              onChange={(e) => setChangeTypeFilter(e.target.value)}
            />
          </label>
          <label className="text-sm">
            <div className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Limit</div>
            <select
              className="rounded border border-border bg-secondary px-2 py-1 text-foreground"
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
            >
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
            </select>
          </label>
        </div>

        <div className="overflow-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-2 py-1">Time</th>
                <th className="px-2 py-1">Type</th>
                <th className="px-2 py-1">Summary</th>
                <th className="px-2 py-1">Project</th>
                <th className="px-2 py-1">Instance</th>
                <th className="px-2 py-1">Version</th>
                <th className="px-2 py-1">Related</th>
              </tr>
            </thead>
            <tbody>
              {(changes ?? []).map((change) => (
                <tr key={change._id} className="border-t border-border">
                  <td className="px-2 py-2 text-xs text-muted-foreground">{fmtTime(change.timestamp)}</td>
                  <td className="px-2 py-2">
                    <StatusPill value={change.type} />
                  </td>
                  <td className="px-2 py-2">{change.summary}</td>
                  <td className="px-2 py-2 font-mono text-xs text-muted-foreground">{change.projectId ?? "n/a"}</td>
                  <td className="px-2 py-2 font-mono text-xs text-muted-foreground">{change.instanceId ?? "n/a"}</td>
                  <td className="px-2 py-2 font-mono text-xs text-muted-foreground">{change.versionId ?? "n/a"}</td>
                  <td className="px-2 py-2 text-xs text-muted-foreground">
                    {change.relatedTable ?? "n/a"} {change.relatedId ? `• ${change.relatedId}` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {(changes ?? []).length === 0 && (
            <div className="rounded border border-dashed border-border p-3 text-sm text-muted-foreground">
              No change records found.
            </div>
          )}
        </div>
      </section>

      <section className="rounded-md border border-border bg-card p-4">
        <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Approval Records
        </div>
        <div className="overflow-auto">
          <table className="w-full min-w-[840px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-2 py-1">Requested</th>
                <th className="px-2 py-1">Action</th>
                <th className="px-2 py-1">Risk</th>
                <th className="px-2 py-1">Status</th>
                <th className="px-2 py-1">Decided</th>
                <th className="px-2 py-1">Reason</th>
              </tr>
            </thead>
            <tbody>
              {(approvals ?? []).map((approval) => (
                <tr key={approval._id} className="border-t border-border">
                  <td className="px-2 py-2 text-xs text-muted-foreground">{fmtTime(approval.requestedAt)}</td>
                  <td className="px-2 py-2">{approval.actionType}</td>
                  <td className="px-2 py-2">
                    <StatusPill value={approval.riskLevel} />
                  </td>
                  <td className="px-2 py-2">
                    <StatusPill value={approval.status} />
                  </td>
                  <td className="px-2 py-2 text-xs text-muted-foreground">{fmtTime(approval.decidedAt)}</td>
                  <td className="px-2 py-2 text-xs text-muted-foreground">{approval.decisionReason ?? approval.justification}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {(approvals ?? []).length === 0 && (
            <div className="rounded border border-dashed border-border p-3 text-sm text-muted-foreground">
              No approval records found.
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

function StatusPill({ value }: { value: string }) {
  const v = value.toUpperCase();
  const classes =
    v === "ACTIVE" || v === "APPROVED" || v === "ALLOW" || v === "GREEN"
      ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40"
      : v === "PENDING" || v === "YELLOW" || v === "NEEDS_APPROVAL"
      ? "bg-amber-500/15 text-amber-300 border-amber-500/40"
      : v === "DENIED" || v === "RED" || v === "FAILED"
      ? "bg-red-500/15 text-red-300 border-red-500/40"
      : "bg-secondary text-foreground border-border";
  return <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${classes}`}>{value}</span>;
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold text-foreground">{value}</div>
    </div>
  );
}
