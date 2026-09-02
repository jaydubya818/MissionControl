import { useState } from "react";
import { ArrowUpRight, ReceiptText } from "lucide-react";
import type { Id } from "../../../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatDate, statusTone, workspacePath } from "./automationModel";

const FILTERS = ["ALL", "FRESH", "REJECTED", "INCONCLUSIVE", "MISSING", "STALE", "EXPIRED", "WAIVED"] as const;

export function AutomationReceipts({ projectId, receipts }: { projectId: Id<"projects">; receipts: any[] }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("ALL");
  const matches = (receipt: any, value: (typeof FILTERS)[number]) =>
    value === "ALL"
    || receipt.evidenceState === value
    || (value === "REJECTED" && receipt.status === "FAILED")
    || (value === "INCONCLUSIVE" && receipt.status === "PENDING");
  const filtered = receipts.filter((receipt) => matches(receipt, filter));
  if (receipts.length === 0) {
    return (
      <Card className="border-dashed p-8 text-center">
        <ReceiptText className="mx-auto h-5 w-5 text-muted-foreground" />
        <h2 className="mt-3 text-sm font-semibold text-foreground">No independent verification receipts have been recorded</h2>
        <p className="mt-2 text-sm text-muted-foreground">Missing evidence will appear here as soon as an Automation review gate exists.</p>
      </Card>
    );
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2" aria-label="Receipt filters">
        {FILTERS.map((item) => (
          <Button key={item} size="sm" variant={filter === item ? "default" : "outline"} onClick={() => setFilter(item)}>
            {item} ({receipts.filter((receipt) => matches(receipt, item)).length})
          </Button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <Card className="border-dashed p-6 text-center text-sm text-muted-foreground">No receipts match this filter.</Card>
      ) : (
        <div className="grid gap-3">
          {filtered.map((receipt) => (
            <Card key={receipt._id} className={receipt.evidenceState === "MISSING" ? "border-warn/25 p-4" : "p-4"}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-medium text-foreground">{receipt.automationName ?? "Automation receipt"}</div>
                  <p className="mt-1 text-sm text-muted-foreground">{receipt.workOrderTitle}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{receipt.criterionTitle ?? receipt.acceptanceCriterionId}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className={statusTone(receipt.evidenceState)}>{receipt.evidenceState}</Badge>
                  <Badge variant="outline" className={statusTone(receipt.status)}>{receipt.status}</Badge>
                </div>
              </div>
              <dl className="mt-4 grid gap-3 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
                <Item label="Validator" value={receipt.verifier ?? "Not recorded"} />
                <Item label="Evidence" value={receipt.evidenceLocation ?? receipt.artifactReference ?? "Missing"} />
                <Item label="Recorded" value={formatDate(receipt.recordedAt)} />
                <Item label="Valid until" value={formatDate(receipt.validUntil)} />
                <Item label="Expected result" value={receipt.metadata?.expectedResult ?? "Not recorded"} />
                <Item label="Observed result" value={receipt.metadata?.observedResult ?? receipt.result ?? "Not recorded"} />
                <Item label="Integrity hash" value={receipt.metadata?.integrityHash ?? "Not recorded"} />
                <Item label="Recommended follow-up" value={receipt.metadata?.recommendedFollowUp ?? (receipt.status === "PASSED" ? "None" : "Operator review required")} />
              </dl>
              <details className="mt-3 rounded-lg border border-[var(--panel-line)] bg-muted/10 p-3 text-xs">
                <summary className="cursor-pointer font-medium text-registry-accent">Receipt evidence and lineage</summary>
                <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-all text-muted-foreground">{JSON.stringify({
                  receiptId: receipt._id,
                  definitionId: receipt.automationDefinitionId,
                  workOrderId: receipt.workOrderId,
                  runId: receipt.workflowRunId,
                  criterionId: receipt.acceptanceCriterionId,
                  evidence: receipt.evidenceLocation ?? receipt.artifactReference ?? null,
                  integrityHash: receipt.metadata?.integrityHash ?? null,
                  correlationId: receipt.metadata?.correlationId ?? null,
                }, null, 2)}</pre>
              </details>
              <div className="mt-3 flex flex-wrap gap-3 text-xs">
                <a href={workspacePath(`/v2/control-work-orders?workOrder=${receipt.workOrderId}`, projectId)} className="inline-flex items-center gap-1 text-registry-accent hover:text-foreground">Open WorkOrder <ArrowUpRight className="h-3 w-3" /></a>
                {receipt.evidenceLocation ? <a href={receipt.evidenceLocation} className="inline-flex items-center gap-1 text-registry-accent hover:text-foreground">Open evidence <ArrowUpRight className="h-3 w-3" /></a> : null}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}</dt><dd className="mt-1 break-words text-foreground">{value}</dd></div>;
}
