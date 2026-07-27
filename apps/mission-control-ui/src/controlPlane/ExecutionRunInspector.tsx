import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { orderTimelineEvents, latestHumanAttention, filterEvidenceArtifacts } from "./runInspectorModel";

export function ExecutionRunInspector({
  open,
  workflowRunId,
  verificationReceiptId,
  acceptanceCriterionId,
  onClose,
}: {
  open: boolean;
  workflowRunId: Id<"workflowRuns"> | null;
  verificationReceiptId?: Id<"verificationReceipts"> | null;
  acceptanceCriterionId?: string | null;
  onClose: () => void;
}) {
  const inspector = useQuery(
    api.workflowRuns.getInspector,
    open && workflowRunId
      ? {
          workflowRunId,
          verificationReceiptId: verificationReceiptId ?? undefined,
          acceptanceCriterionId: acceptanceCriterionId ?? undefined,
        }
      : "skip"
  );

  const orderedEvents = useMemo(() => orderTimelineEvents((inspector?.events ?? []) as any), [inspector?.events]);
  const attention = useMemo(() => latestHumanAttention((inspector?.events ?? []) as any), [inspector?.events]);
  const evidenceArtifacts = useMemo(
    () => filterEvidenceArtifacts((inspector?.artifacts ?? []) as any, { verificationReceiptId: verificationReceiptId ?? undefined, acceptanceCriterionId: acceptanceCriterionId ?? undefined }),
    [inspector?.artifacts, verificationReceiptId, acceptanceCriterionId]
  );

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-[1100px] overflow-hidden p-0">
        <DialogHeader className="border-b border-[var(--panel-line)] px-6 py-4">
          <DialogTitle>Execution Run Inspector</DialogTitle>
        </DialogHeader>

        <div className="max-h-[80vh] overflow-y-auto p-6">
          {!workflowRunId ? (
            <Card className="p-6 text-sm text-muted-foreground">Select a run to inspect.</Card>
          ) : !inspector ? (
            <Card className="p-6 text-sm text-muted-foreground">Loading run inspector…</Card>
          ) : (
            <div className="space-y-6">
              <Card className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-lg font-semibold text-foreground">{inspector.run.runId}</div>
                    <div className="mt-1 text-sm text-muted-foreground">{inspector.workOrder?.title ?? inspector.run.initialInput}</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">{inspector.run.status}</Badge>
                    <Badge variant="outline">{inspector.run.workflowId}</Badge>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-4">
                  <Meta label="WorkOrder" value={inspector.workOrder?._id} />
                  <Meta label="Runtime / model" value={[inspector.run.runtime, inspector.run.model].filter(Boolean).join(" / ") || "—"} />
                  <Meta label="Current step" value={inspector.summary.currentStep ?? "—"} />
                  <Meta label="Retry count" value={`${inspector.summary.retryCount}`} />
                  <Meta label="Started" value={new Date(inspector.run.startedAt).toLocaleString()} />
                  <Meta label="Duration" value={`${Math.max(0, Math.round(inspector.summary.durationMs / 1000))}s`} />
                  <Meta label="Blocking issue" value={inspector.summary.blockingIssue ?? "—"} />
                  <Meta label="Human intervention" value={attention ?? (inspector.summary.humanInterventionRequired ? "Required" : "Not required")} />
                </div>
              </Card>

              <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
                <div className="space-y-6">
                  <Card className="p-4">
                    <div className="mb-3 text-sm font-medium text-foreground">Timeline</div>
                    <div className="space-y-3">
                      {orderedEvents.length === 0 ? <p className="text-sm text-muted-foreground">No structured run events recorded yet.</p> : orderedEvents.map((event: any) => {
                        const highlighted = (verificationReceiptId && event.verificationReceiptId === verificationReceiptId)
                          || (acceptanceCriterionId && event.metadata?.acceptanceCriterionId === acceptanceCriterionId);
                        return (
                          <div key={event._id ?? `${event.sequenceNumber}-${event.eventType}`} className={`rounded-lg border px-3 py-3 ${highlighted ? "border-registry-accent/40 bg-registry-accent-soft" : "border-[var(--panel-line)] bg-background/30"}`}>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge variant="outline">#{event.sequenceNumber}</Badge>
                                <span className="text-sm font-medium text-foreground">{event.eventType}</span>
                                {event.workflowStep ? <Badge variant="outline">{event.workflowStep}</Badge> : null}
                                {event.status ? <Badge variant="outline">{event.status}</Badge> : null}
                              </div>
                              <div className="text-xs text-muted-foreground">{event.durationMs ? `${Math.round(event.durationMs)}ms` : "—"}</div>
                            </div>
                            <div className="mt-2 text-sm text-muted-foreground">{event.commandSummary ?? event.errorSummary ?? event.toolName ?? "No summary"}</div>
                            {(event.toolName || event.retryNumber || event.errorCategory) ? (
                              <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                                {event.toolName ? <span>Tool: {event.toolName}</span> : null}
                                {event.retryNumber ? <span>Retry: {event.retryNumber}</span> : null}
                                {event.errorCategory ? <span>Error: {event.errorCategory}</span> : null}
                              </div>
                            ) : null}
                            {event.metadata ? (
                              <details className="mt-2 text-xs text-muted-foreground">
                                <summary className="cursor-pointer">More context</summary>
                                <pre className="mt-2 overflow-x-auto rounded bg-background/60 p-2">{JSON.stringify(event.metadata, null, 2)}</pre>
                              </details>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </Card>

                  <Card className="p-4">
                    <div className="mb-3 text-sm font-medium text-foreground">Files changed</div>
                    <div className="space-y-2">
                      {(inspector.fileChanges ?? []).length === 0 ? <p className="text-sm text-muted-foreground">No structured file changes recorded.</p> : inspector.fileChanges.map((change: any) => (
                        <div key={`${change.sequenceNumber}-${change.repositoryPath}`} className="rounded-lg border border-[var(--panel-line)] bg-background/30 px-3 py-3 text-sm">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-mono text-foreground">{change.repositoryPath ?? "Unknown path"}</span>
                            <Badge variant="outline">{change.changeType}</Badge>
                          </div>
                          <div className="mt-2 text-xs text-muted-foreground">Event #{change.sequenceNumber} · {change.workflowStep ?? "—"}</div>
                          <div className="mt-1 flex flex-wrap gap-3 text-xs text-registry-accent">
                            {change.diffLocation ? <span>Diff: {change.diffLocation}</span> : null}
                            {change.pullRequestUrl ? <span>PR: {change.pullRequestUrl}</span> : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                </div>

                <div className="space-y-6">
                  <Card className="p-4">
                    <div className="mb-3 text-sm font-medium text-foreground">Artifacts</div>
                    <div className="space-y-2">
                      {(inspector.artifacts ?? []).length === 0 ? <p className="text-sm text-muted-foreground">No artifacts recorded yet.</p> : inspector.artifacts.map((artifact: any) => {
                        const highlighted = evidenceArtifacts.some((item: any) => item._id === artifact._id);
                        return (
                          <div key={artifact._id} className={`rounded-lg border px-3 py-3 ${highlighted ? "border-registry-accent/40 bg-registry-accent-soft" : "border-[var(--panel-line)] bg-background/30"}`}>
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="text-sm font-medium text-foreground">{artifact.name}</div>
                                <div className="mt-1 text-xs text-muted-foreground">{artifact.artifactType} · {artifact.producer ?? "unknown producer"}</div>
                              </div>
                              <Badge variant="outline">{new Date(artifact.createdAt).toLocaleString()}</Badge>
                            </div>
                            <div className="mt-2 text-xs text-muted-foreground">Criterion: {artifact.acceptanceCriterionId ?? "—"}</div>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {artifact.externalLocation ? <Button asChild size="sm" variant="outline"><a href={artifact.externalLocation} target="_blank" rel="noreferrer">Open</a></Button> : null}
                              {artifact.repositoryPath ? <Badge variant="outline">{artifact.repositoryPath}</Badge> : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </Card>

                  <Card className="p-4">
                    <div className="mb-3 text-sm font-medium text-foreground">Retry and recovery</div>
                    <div className="space-y-2">
                      {(inspector.retryTimeline ?? []).length === 0 ? <p className="text-sm text-muted-foreground">No retries recorded.</p> : inspector.retryTimeline.map((retry: any) => (
                        <div key={`${retry.retryNumber}-${retry.workflowStep}`} className="rounded-lg border border-[var(--panel-line)] bg-background/30 px-3 py-3 text-sm">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-foreground">Retry {retry.retryNumber}</span>
                            <Badge variant="outline">{retry.outcome ?? "pending"}</Badge>
                          </div>
                          <div className="mt-2 text-xs text-muted-foreground">Step: {retry.workflowStep ?? "—"}</div>
                          <div className="mt-1 text-xs text-muted-foreground">Reason: {retry.reason ?? "—"}</div>
                          <div className="mt-1 text-xs text-muted-foreground">Checkpoint: {retry.checkpointArtifactId ?? "—"}</div>
                        </div>
                      ))}
                    </div>
                  </Card>

                  <Card className="p-4">
                    <div className="mb-3 text-sm font-medium text-foreground">Evidence drill-down</div>
                    {(verificationReceiptId || acceptanceCriterionId) ? (
                      <div className="space-y-2 text-sm text-muted-foreground">
                        <div>Focused receipt: {verificationReceiptId ?? "—"}</div>
                        <div>Focused criterion: {acceptanceCriterionId ?? "—"}</div>
                        <div>Linked events: {inspector.evidenceLineage?.events?.length ?? 0}</div>
                        <div>Linked artifacts: {inspector.evidenceLineage?.artifacts?.length ?? 0}</div>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">Open this inspector from a verification receipt to jump straight to evidence lineage.</p>
                    )}
                  </Card>
                </div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Meta({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm text-foreground">{value ?? "—"}</div>
    </div>
  );
}
