import { useState } from "react";
import { ArrowUpRight, ClipboardList, PlayCircle, ShieldCheck } from "lucide-react";
import type { Id } from "../../../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getOrchestrationBaseUrl } from "@/lib/orchestrationUrl";
import { formatDate, formatDuration, runStatusLabel, statusTone, workspacePath } from "./automationModel";

export function AutomationRuns({
  projectId,
  runs,
  onSelectDefinition,
}: {
  projectId: Id<"projects">;
  runs: any[];
  onSelectDefinition: (definitionId: string) => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ error?: boolean; text: string } | null>(null);
  async function invoke(run: any, operation: "execution" | "verification") {
    setBusyId(run.workOrder._id); setMessage(null);
    try {
      const baseUrl = getOrchestrationBaseUrl() || "http://localhost:4100";
      const response = await fetch(`${baseUrl}/workorders/${run.workOrder._id}/automation-${operation}`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: operation === "verification" ? JSON.stringify({ evidenceLocation: run.definition?.artifactPath }) : "{}",
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? `${operation} failed`);
      setMessage({ text: operation === "execution" ? "Adapter run completed. Independent verification is still required." : "Independent receipts and final decision recorded." });
    } catch (error) {
      setMessage({ error: true, text: error instanceof Error ? error.message : `${operation} failed` });
    } finally { setBusyId(null); }
  }
  if (runs.length === 0) {
    return (
      <Card className="border-dashed p-8 text-center">
        <ClipboardList className="mx-auto h-5 w-5 text-muted-foreground" />
        <h2 className="mt-3 text-sm font-semibold text-foreground">No review-gate WorkOrders have been created</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Activating a Definition does not create work. Evaluation creates one approval-gated, read-only WorkOrder.
        </p>
      </Card>
    );
  }
  return (
    <div className="space-y-3">
      {message ? <p role={message.error ? "alert" : "status"} className={message.error ? "text-sm text-err" : "text-sm text-ok"}>{message.text}</p> : null}
    <div className="overflow-x-auto rounded-xl border border-[var(--panel-line)]">
      <table className="min-w-[1760px] w-full text-left text-sm">
        <thead className="bg-card/70 text-[11px] uppercase tracking-[0.13em] text-muted-foreground">
          <tr>
            {[
              "Automation / result", "Cadence window", "WorkOrder", "State", "Approval",
              "Dispatch", "Verification", "Receipt", "Workflow / scope", "Timeline",
              "Duration / cost", "Idempotency", "Required action / failure", "Links",
            ].map((label) => <th key={label} className="px-3 py-3 font-medium">{label}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--panel-line)]">
          {runs.map((run) => {
            const status = runStatusLabel(run);
            return (
              <tr key={run.workOrder._id} className="bg-card/30 align-top">
                <td className="px-3 py-3">
                  <button type="button" onClick={() => run.definition && onSelectDefinition(run.definition._id)} className="font-medium text-foreground hover:text-registry-accent">
                    {run.definition?.name ?? "Unknown Automation"}
                  </button>
                  <div className="mt-2"><Badge variant="outline" className={statusTone(status.toUpperCase().replace(/ /g, "_"))}>{status}</Badge></div>
                </td>
                <td className="max-w-[260px] break-all px-3 py-3 font-mono text-xs text-muted-foreground">{run.cadenceWindow ?? "Not recorded"}</td>
                <td className="px-3 py-3"><div className="text-foreground">{run.workOrder.title}</div><div className="mt-1 font-mono text-xs text-muted-foreground">{run.workOrder._id}</div></td>
                <td className="px-3 py-3"><Badge variant="outline" className={statusTone(run.workOrder.state)}>{run.workOrder.state}</Badge></td>
                <td className="px-3 py-3">{run.workOrder.approvalStatus}</td>
                <td className="px-3 py-3">{run.dispatchState}</td>
                <td className="px-3 py-3">{run.workOrder.verificationStatus}</td>
                <td className="px-3 py-3"><Badge variant="outline" className={statusTone(run.receiptState)}>{run.receiptState}</Badge></td>
                <td className="px-3 py-3 text-muted-foreground"><div>{run.workOrder.workflowId}@{run.workOrder.metadata?.automationWorkflowVersion}</div><div className="mt-1 text-xs">{run.workOrder.metadata?.automationScope}</div></td>
                <td className="px-3 py-3 text-muted-foreground">
                  <div>Created {formatDate(run.workOrder.createdAt)}</div>
                  <div className="mt-1 text-xs">Started {formatDate(run.workOrder.metadata?.startedAt)}</div>
                  <div className="mt-1 text-xs">Completed {formatDate(run.workOrder.metadata?.completedAt)}</div>
                </td>
                <td className="px-3 py-3"><div>{formatDuration(run.durationMs)}</div><div className="mt-1 text-xs text-muted-foreground">${run.costUsd.toFixed(2)}</div></td>
                <td className="px-3 py-3 text-muted-foreground">{run.idempotencyResult}</td>
                <td className="max-w-[280px] px-3 py-3">
                  <div className="text-warn">{run.workOrder.requiredHumanAction ?? "No action recorded"}</div>
                  {run.workOrder.blockingIssue ? <div className="mt-2 text-xs text-err">{run.workOrder.blockingIssue}</div> : null}
                  {run.workflowRun?.failureReason ? <div className="mt-2 text-xs text-err">{run.workflowRun.failureReason}</div> : null}
                  {run.events?.length ? <details className="mt-2"><summary className="cursor-pointer text-xs text-info-accent">Logs and events ({run.events.length})</summary><ul className="mt-1 space-y-1 text-xs text-muted-foreground">{run.events.slice(-8).map((event: any) => <li key={event._id}>{event.eventType}: {event.commandSummary ?? event.errorSummary ?? event.status}</li>)}</ul></details> : null}
                  {run.artifacts?.length ? <div className="mt-2 text-xs text-muted-foreground">Evidence: {run.artifacts.map((artifact: any) => artifact.name).join(", ")}</div> : null}
                </td>
                <td className="px-3 py-3">
                  <div className="flex flex-col items-start gap-2 text-xs">
                    <a href={workspacePath(`/v2/control-work-orders?workOrder=${run.workOrder._id}`, projectId)} className="inline-flex items-center gap-1 text-registry-accent hover:text-foreground">WorkOrder <ArrowUpRight className="h-3 w-3" /></a>
                    <a href={workspacePath(`/v2/harness-workshop?workflow=${run.workOrder.workflowId}`, projectId)} className="inline-flex items-center gap-1 text-registry-accent hover:text-foreground">Workflow <ArrowUpRight className="h-3 w-3" /></a>
                    {run.receipts[0] ? <a href={`?workspace=${projectId}&tab=receipts&receipt=${run.receipts[0]._id}`} className="inline-flex items-center gap-1 text-registry-accent hover:text-foreground">Receipt <ArrowUpRight className="h-3 w-3" /></a> : null}
                    <button type="button" onClick={() => run.definition && onSelectDefinition(run.definition._id)} className="inline-flex items-center gap-1 text-registry-accent hover:text-foreground">Definition / decisions <ArrowUpRight className="h-3 w-3" /></button>
                    {["DISPATCHED", "IN_PROGRESS"].includes(run.workOrder.state) && run.definition?.adapterType ? (
                      <Button size="sm" disabled={busyId === run.workOrder._id} onClick={() => void invoke(run, "execution")}><PlayCircle className="h-3.5 w-3.5" /> Execute adapter</Button>
                    ) : null}
                    {run.workOrder.state === "AWAITING_VERIFICATION" && run.definition?.adapterType ? (
                      <Button size="sm" disabled={busyId === run.workOrder._id} onClick={() => void invoke(run, "verification")}><ShieldCheck className="h-3.5 w-3.5" /> Verify independently</Button>
                    ) : null}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
    </div>
  );
}
