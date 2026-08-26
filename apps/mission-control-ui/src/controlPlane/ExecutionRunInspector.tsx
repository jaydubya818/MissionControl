import { useEffect, useMemo, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { orderTimelineEvents, latestHumanAttention, filterEvidenceArtifacts } from "./runInspectorModel";
import { RunRecoveryPanel } from "./RunRecoveryPanel";
import { EvidenceLineagePanel, type EvidenceLineageStage } from "./EvidenceLineagePanel";
import { ExecutionRecoveryCard, type ExecutionRecoveryData } from "./ExecutionRecoveryCard";
import { ReviewEvidencePackage, type ReviewEvidencePackageData } from "./ReviewEvidencePackage";
import { FactoryContextRunCard } from "./FactoryContextRunCard";

type FrozenExecutionRoutingSnapshot = {
  algorithmVersion: string;
  evidenceCutoffAt: number;
  result: {
    mode: string;
    recommendedTupleKey?: string;
    appliedTupleKey?: string;
    fallbackReason?: string;
    candidates: Array<{
      tuple: { tupleKey: string; harness: { adapter: string; version: string }; model: { provider: string; modelId: string }; backend: string };
      eligible: boolean;
      rejectionReasons: string[];
      score?: number;
      evidenceCoverage: number;
      evidence: { verifiedAttemptCount: number; attemptCount: number };
    }>;
  };
};

export function ExecutionRunInspector({
  open,
  workflowRunId,
  verificationReceiptId,
  acceptanceCriterionId,
  unavailable = false,
  retrying = false,
  onRetryFailedRun,
  onClose,
}: {
  open: boolean;
  workflowRunId: Id<"workflowRuns"> | null;
  verificationReceiptId?: Id<"verificationReceipts"> | null;
  acceptanceCriterionId?: string | null;
  unavailable?: boolean;
  retrying?: boolean;
  onRetryFailedRun?: (input: {
    workflowRunId: Id<"workflowRuns">;
    reason: string;
    runtime?: string;
    model?: string;
  }) => Promise<void>;
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
  const routingDecision = useQuery(
    api.modelRoutingDecisions.getForWorkflowRun,
    open && workflowRunId ? { workflowRunId } : "skip"
  );
  const factoryContextEnabled = useQuery(
    api.featureFlags.isEnabled,
    open && inspector?.run.projectId
      ? {
          key: "factory-memory.context-engine",
          projectId: inspector.run.projectId,
        }
      : "skip"
  );
  const factoryContext = useQuery(
    api.factoryMemory.getContextPackage,
    open && workflowRunId && inspector?.run.projectId && factoryContextEnabled
      ? {
          projectId: inspector.run.projectId,
          workflowRunId,
        }
      : "skip"
  );
  const requestCancellation = useAction(api.workflowRuns.requestCancellation);
  const recordReviewJudgment = useMutation(api.reviewIntelligence.recordReviewJudgment);
  const [cancelReason, setCancelReason] = useState("");
  const [canceling, setCanceling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelConfirmation, setCancelConfirmation] = useState<string | null>(null);
  useEffect(() => {
    setCancelReason("");
    setCancelError(null);
    setCancelConfirmation(null);
  }, [workflowRunId]);

  const orderedEvents = useMemo(() => orderTimelineEvents((inspector?.events ?? []) as any), [inspector?.events]);
  const attention = useMemo(() => latestHumanAttention((inspector?.events ?? []) as any), [inspector?.events]);
  const evidenceArtifacts = useMemo(
    () => filterEvidenceArtifacts((inspector?.artifacts ?? []) as any, { verificationReceiptId: verificationReceiptId ?? undefined, acceptanceCriterionId: acceptanceCriterionId ?? undefined }),
    [inspector?.artifacts, verificationReceiptId, acceptanceCriterionId]
  );
  const receiptOnlyCompletion = inspector?.run.status === "COMPLETED"
    && ((inspector.run.metadata as { completionMode?: string; receiptPacketKey?: string } | undefined)?.completionMode === "VERIFICATION_ONLY"
      || ((inspector.run.metadata as { receiptPacketKey?: string } | undefined)?.receiptPacketKey
        && (inspector.run.steps ?? []).every((step: any) => step.status === "PENDING")));
  const routingSnapshot = routingDecision?.executionRoutingSnapshot as FrozenExecutionRoutingSnapshot | undefined;
  const appliedRoute = routingSnapshot?.result.candidates.find((candidate) => candidate.tuple.tupleKey === routingSnapshot.result.appliedTupleKey);
  const verificationRun = inspector?.verificationRuns?.[0];
  const navigateToRecords = (target: EvidenceLineageStage["target"]) => {
    document.getElementById(`run-${target}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-[1100px] overflow-hidden p-0">
        <DialogHeader className="border-b border-[var(--panel-line)] px-4 py-4 sm:px-6">
          <DialogTitle>Execution Run Inspector</DialogTitle>
          <DialogDescription className="sr-only">
            Inspect execution state, continuous evidence lineage, artifacts, verification, and recovery history.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[80vh] overflow-y-auto p-4 sm:p-6">
          {unavailable ? (
            <Card role="alert" className="border-red-500/30 p-6">
              <div className="text-sm font-medium text-foreground">Run unavailable</div>
              <p className="mt-2 text-sm text-muted-foreground">
                This run no longer exists or is outside the selected WorkOrder. Close the inspector and select a current Attempt.
              </p>
              <Button className="mt-4" variant="outline" onClick={onClose}>Close inspector</Button>
            </Card>
          ) : !workflowRunId ? (
            <Card className="p-6">
              <div className="text-sm font-medium text-foreground">Select an Attempt</div>
              <p className="mt-2 text-sm text-muted-foreground">Choose a current WorkOrder Attempt to inspect its review evidence and recovery history.</p>
            </Card>
          ) : inspector === undefined ? (
            <Card role="status" className="p-6" aria-live="polite">
              <div className="text-sm font-medium text-foreground">Loading review evidence</div>
              <p className="mt-2 text-sm text-muted-foreground">Resolving the exact Attempt, candidate, verification gate, and pull-request lineage…</p>
            </Card>
          ) : inspector === null ? (
            <Card role="alert" className="border-red-500/30 p-6">
              <div className="text-sm font-medium text-foreground">Run unavailable</div>
              <p className="mt-2 text-sm text-muted-foreground">
                This run no longer exists or is outside your authorized workspace. Close the inspector and select a current Attempt.
              </p>
              <Button className="mt-4" variant="outline" onClick={onClose}>Close inspector</Button>
            </Card>
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
                    {inspector.run.cancellationRequestedAt ? <Badge variant="outline" className="border-amber-500/30 text-amber-300">Cancellation requested</Badge> : null}
                    {receiptOnlyCompletion ? <Badge variant="outline" className="border-amber-500/30 text-amber-300">Verification-only closeout</Badge> : null}
                    <Badge variant="outline">{inspector.run.workflowId}</Badge>
                  </div>
                </div>
                {receiptOnlyCompletion ? (
                  <div className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-sm text-amber-100">
                    Completed via verification receipt — workflow steps were not executed.
                  </div>
                ) : null}
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

              <ReviewEvidencePackage
                review={inspector.reviewPackage as ReviewEvidencePackageData}
                onInspectEvidence={() => navigateToRecords("receipts")}
                onRecordJudgment={async (judgment) => {
                  await recordReviewJudgment({
                    workOrderId: judgment.workOrderId as Id<"workOrders">,
                    workflowRunId: judgment.workflowRunId as Id<"workflowRuns">,
                    expectedWorkOrderRevisionNumber: judgment.workOrderRevisionNumber,
                    expectedCandidateRevision: judgment.candidateRevision,
                    reviewPackageDigest: judgment.reviewPackageDigest,
                    action: judgment.action,
                    correctionCategory: judgment.correctionCategory,
                    summary: judgment.summary,
                    sourceReference: `run-inspector:${judgment.workflowRunId}`,
                    idempotencyKey: `ui-review:${judgment.workOrderId}:${crypto.randomUUID()}`,
                  });
                }}
              />

              <FactoryContextRunCard enabled={factoryContextEnabled} detail={factoryContext} />

              <ExecutionRecoveryCard recovery={inspector.recovery as ExecutionRecoveryData} />

              {inspector.sandbox ? <RemoteSandboxCard sandbox={inspector.sandbox} /> : null}

              {inspector.run.executionManifest ? (
                <Card className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-foreground">Frozen agent execution manifest</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        Reproducible prompt, agent, tool, model, harness, context, and causation authority. Prompt content stays collapsed from the operator view.
                      </div>
                    </div>
                    <Badge variant="outline">{inspector.run.executionManifest.version}</Badge>
                  </div>
                  <div className="mt-4 grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-4">
                    <Meta label="Manifest digest" value={inspector.run.executionManifestDigest ?? "—"} />
                    <Meta label="Compiled prompt hash" value={inspector.run.executionManifest.compiledPromptHash ?? "—"} />
                    <Meta label="Context hash" value={inspector.run.executionManifest.workflow?.contextHash ?? "—"} />
                    <Meta label="Completion contract" value={inspector.run.executionManifest.harness?.completionContract ?? "—"} />
                    <Meta label="Harness" value={[inspector.run.executionManifest.harness?.harnessId, inspector.run.executionManifest.harness?.harnessVersion].filter(Boolean).join(" / ") || "—"} />
                    <Meta label="Adapter" value={[inspector.run.executionManifest.harness?.adapter, inspector.run.executionManifest.harness?.version].filter(Boolean).join(" / ") || "—"} />
                    <Meta label="Harness commit" value={inspector.run.executionManifest.harness?.harnessCommit ?? "—"} />
                    <Meta label="Capability manifest" value={inspector.run.executionManifest.harness?.capabilityManifestSha256 ?? "—"} />
                    <Meta label="Effective config" value={inspector.run.executionManifest.harness?.effectiveConfigSha256 ?? "—"} />
                    <Meta label="Provider / model" value={[inspector.run.executionManifest.harness?.provider, inspector.run.executionManifest.harness?.model].filter(Boolean).join(" / ") || "—"} />
                    <Meta label="PR authority" value={inspector.run.executionManifest.harness?.pullRequestAuthority ?? "—"} />
                    <Meta label="Allowed paths" value={inspector.run.executionManifest.repository?.allowedPaths?.join(", ") || "—"} />
                    <Meta label="Excluded paths" value={inspector.run.executionManifest.repository?.excludedPaths?.join(", ") || "None"} />
                    <Meta label="Lease owner" value={inspector.run.lease?.ownerId ?? "Not currently leased"} />
                    <Meta label="Lease expiry" value={inspector.run.lease?.expiresAt ? new Date(inspector.run.lease.expiresAt).toLocaleString() : "—"} />
                  </div>
                  <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                    {(inspector.run.executionManifest.workflow?.steps ?? []).map((step: any) => (
                      <div key={step.stepId} className="rounded-lg border border-[var(--panel-line)] bg-background/30 p-3 text-xs">
                        <div className="font-mono text-foreground">{step.stepId}</div>
                        <div className="mt-2 text-muted-foreground">Agent v{step.agentVersion} · {step.agentVersionId}</div>
                        <div className="mt-1 text-muted-foreground">Model: {step.modelRoute}</div>
                        <div className="mt-1 text-muted-foreground">Prompt: {step.promptBundleHash}</div>
                        <div className="mt-1 text-muted-foreground">Tools: {step.toolManifestHash}</div>
                      </div>
                    ))}
                  </div>
                </Card>
              ) : null}

              <Card id="run-verification" className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-foreground">Independent verification</div>
                    <div className="mt-1 text-xs text-muted-foreground">Server-recomputed checks and evidence for the exact candidate revision.</div>
                  </div>
                  <Badge variant="outline" className={verificationRun?.verdict === "VERIFIED" ? "border-success/30 text-success" : "border-warning/30 text-warning"}>
                    {verificationRun?.verdict ?? "NO RECEIPT"}
                  </Badge>
                </div>
                {verificationRun ? (
                  <>
                    <div className="mt-4 grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-4">
                      <Meta label="Candidate" value={verificationRun.candidateRevision} />
                      <Meta label="Source" value={verificationRun.sourceRevision} />
                      <Meta label="Requirements" value={`${verificationRun.requirementsPassed} passed / ${verificationRun.requirementsFailed} missing`} />
                      <Meta label="Evidence envelopes" value={`${inspector.evidenceEnvelopes?.length ?? 0}`} />
                    </div>
                    <div className="mt-4 overflow-x-auto rounded-lg border border-[var(--panel-line)]">
                      <table className="w-full text-left text-xs">
                        <thead className="border-b border-[var(--panel-line)] text-muted-foreground"><tr><th className="px-3 py-2 font-medium">Check</th><th className="px-3 py-2 font-medium">Status</th><th className="px-3 py-2 font-medium">Evidence</th><th className="px-3 py-2 font-medium">Duration</th></tr></thead>
                        <tbody className="divide-y divide-[var(--panel-line)]">{verificationRun.checks.map((check: any) => <tr key={check.checkId}><td className="px-3 py-2 text-foreground">{check.name}</td><td className={check.status === "PASS" ? "px-3 py-2 text-success" : "px-3 py-2 text-danger"}>{check.status}</td><td className="px-3 py-2 text-muted-foreground">{check.evidenceIds.length}</td><td className="px-3 py-2 text-muted-foreground">{check.durationMs}ms</td></tr>)}</tbody>
                      </table>
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground">{verificationRun.verdictReasons.join(" ")}</p>
                    {verificationRun.violations.length ? <div role="alert" className="mt-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">{verificationRun.violations.join(" ")}</div> : null}
                  </>
                ) : (
                  <p className="mt-3 text-sm text-warning">No independent verification run is linked. Execution-agent output is not treated as proof.</p>
                )}
              </Card>

              <Card className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-foreground">Execution binding</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Immutable Factory, repository, host, executor, policy, and scope captured before execution.
                    </div>
                  </div>
                  <Badge variant="outline">
                    {inspector.run.factoryDefinitionVersionId ? "Governed" : "Legacy / unbound"}
                  </Badge>
                </div>
                <div className="mt-4 grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-4">
                  <Meta label="Factory version" value={inspector.run.factoryDefinitionVersionId ?? "—"} />
                  <Meta label="Configuration digest" value={inspector.run.factoryConfigurationDigest ?? "—"} />
                  <Meta label="Repository / branch" value={[inspector.run.repositoryId, inspector.run.branch].filter(Boolean).join(" / ") || "—"} />
                  <Meta label="Host binding" value={inspector.run.hostBindingId ?? "—"} />
                  <Meta label="Executor" value={[inspector.run.executorAdapter, inspector.run.executorVersion].filter(Boolean).join("/") || "—"} />
                  <Meta label="Policy / environment" value={[inspector.run.policyEnvelopeId, inspector.run.environmentId].filter(Boolean).join(" / ") || "—"} />
                  <Meta label="Worktree" value={inspector.run.worktree ?? "—"} />
                  <Meta label="Allowed tools" value={inspector.run.allowedTools?.join(", ") || "None declared"} />
                  <Meta label="Worker / phase" value={[inspector.run.executionClaimedBy, inspector.run.executionPhase].filter(Boolean).join(" / ") || "Awaiting claim"} />
                  <Meta label="Lease heartbeat" value={inspector.run.executionHeartbeatAt ? new Date(inspector.run.executionHeartbeatAt).toLocaleString() : "—"} />
                  <Meta label="Base / head commit" value={[inspector.run.executionBaseSha?.slice(0, 12), inspector.run.headSha?.slice(0, 12)].filter(Boolean).join(" → ") || "—"} />
                  <div className="rounded-lg border border-[var(--panel-line)] bg-background/30 px-3 py-2">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Pull request</div>
                    {inspector.run.pullRequestUrl ? (
                      <a className="mt-1 block break-all text-sm text-primary underline-offset-4 hover:underline" href={inspector.run.pullRequestUrl} target="_blank" rel="noreferrer">
                        #{inspector.run.pullRequestNumber ?? "open"} · {inspector.run.pullRequestUrl}
                      </a>
                    ) : <div className="mt-1 break-words text-sm text-foreground">Not published</div>}
                  </div>
                </div>
              </Card>

              {["PENDING", "RUNNING", "PAUSED"].includes(inspector.run.status) ? (
                <Card className="border-amber-500/20 p-4">
                  <div className="text-sm font-medium text-foreground">Cancel this Attempt</div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Cancellation is durable. The active worker will stop at its next heartbeat; an unclaimed Attempt stops immediately.
                  </p>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <Input
                      aria-label="Cancellation reason"
                      value={cancelReason}
                      onChange={(event) => setCancelReason(event.target.value)}
                      placeholder="Why should this Attempt stop?"
                    />
                    <Button
                      variant="outline"
                      disabled={canceling || cancelReason.trim().length < 3}
                      onClick={async () => {
                        setCanceling(true);
                        setCancelError(null);
                        setCancelConfirmation(null);
                        try {
                          const result = await requestCancellation({
                            workflowRunId: inspector.run._id,
                            reason: cancelReason.trim(),
                          });
                          setCancelConfirmation(result.status === "CANCELED"
                            ? "Attempt canceled."
                            : "Cancellation requested; waiting for the worker heartbeat.");
                        } catch (error) {
                          setCancelError(error instanceof Error ? error.message : "Cancellation request failed.");
                        } finally {
                          setCanceling(false);
                        }
                      }}
                    >
                      {canceling ? "Requesting…" : "Request cancellation"}
                    </Button>
                  </div>
                  {cancelError ? <p className="mt-2 text-sm text-destructive">{cancelError}</p> : null}
                  {cancelConfirmation ? <p className="mt-2 text-sm text-emerald-300">{cancelConfirmation}</p> : null}
                </Card>
              ) : null}

              <Card className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-foreground">Execution routing evidence</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      The immutable harness, model, backend, policy, and verified-evidence decision captured before execution.
                    </div>
                  </div>
                  <Badge variant="outline">
                    {routingDecision?.mode ?? "Route unknown (legacy)"}
                  </Badge>
                </div>
                {routingDecision ? (
                  <div className="mt-4 grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-4">
                    <Meta label="Selected tuple" value={appliedRoute ? `${appliedRoute.tuple.harness.adapter}/${appliedRoute.tuple.harness.version} · ${appliedRoute.tuple.model.modelId} · ${appliedRoute.tuple.backend}` : routingDecision.selectedModelId ?? "No safe route"} />
                    <Meta label="Provider" value={appliedRoute?.tuple.model.provider ?? routingDecision.selectedProvider ?? "—"} />
                    <Meta label="Source" value={routingDecision.source} />
                    <Meta label="Policy version" value={`v${routingDecision.policyVersion}`} />
                    <Meta label="Algorithm" value={routingDecision.algorithmVersion ?? "Legacy model routing"} />
                    <Meta label="Decision digest" value={inspector.run.routingDecisionDigest ?? routingDecision.decisionDigest ?? "—"} />
                    <Meta label="Evidence cutoff" value={routingSnapshot?.evidenceCutoffAt ? new Date(routingSnapshot.evidenceCutoffAt).toLocaleString() : "—"} />
                    <Meta label="Evidence coverage" value={appliedRoute ? `${Math.round(appliedRoute.evidenceCoverage * 100)}% · ${appliedRoute.evidence.verifiedAttemptCount}/${appliedRoute.evidence.attemptCount} verified` : "Unknown"} />
                    <div className="md:col-span-2 xl:col-span-4">
                      <Meta label="Explanation" value={routingDecision.explanation} />
                    </div>
                    {routingSnapshot?.result.fallbackReason ? (
                      <div className="md:col-span-2 xl:col-span-4">
                        <Meta label="Fallback reason" value={routingSnapshot.result.fallbackReason} />
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">
                    This run predates routing evidence or was created outside Work Order dispatch.
                  </p>
                )}
              </Card>

              {["FAILED", "CANCELED"].includes(inspector.run.status) ? (
                <RunRecoveryPanel
                  runId={inspector.run.runId}
                  failureSummary={inspector.summary.failureSummary}
                  busy={retrying}
                  onRetry={onRetryFailedRun
                    ? (reason) => onRetryFailedRun({
                        workflowRunId: inspector.run._id,
                        reason,
                        runtime: inspector.run.runtime,
                        model: inspector.run.model,
                      })
                    : undefined}
                />
              ) : null}

              <EvidenceLineagePanel
                stages={(inspector.continuousEvidenceLineage ?? []) as EvidenceLineageStage[]}
                onNavigate={navigateToRecords}
              />

              <Card className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-foreground">Operational observability</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Fixed, non-sensitive workflow and usage totals linked by a typed run reference.
                    </div>
                  </div>
                  <Badge variant="outline">
                    {receiptOnlyCompletion
                      ? "Verification-only closeout"
                      : inspector.observability.usageComplete ? "Complete rollup" : "Bounded partial rollup"}
                  </Badge>
                </div>
                <div className="mt-4 grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-4">
                  <Meta label="Correlation ID" value={inspector.observability.correlationId} />
                  <Meta label="Status" value={inspector.observability.status} />
                  <Meta label="Attempts / retries" value={`${inspector.observability.attempts} / ${inspector.observability.retries}`} />
                  <Meta label="Duration" value={`${Math.max(0, Math.round(inspector.observability.durationMs / 1000))}s`} />
                  <Meta label="Input tokens" value={inspector.observability.inputTokens.toLocaleString()} />
                  <Meta label="Output tokens" value={inspector.observability.outputTokens.toLocaleString()} />
                  <Meta label="Cost" value={`$${inspector.observability.costUsd.toFixed(4)}`} />
                </div>
              </Card>

              <Card className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-foreground">Graph execution plan</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {receiptOnlyCompletion
                        ? "No workflow nodes executed; completion evidence came from a verification receipt."
                        : "Dependencies, isolation, and node state from the durable run record."}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">{inspector.run.topology ?? "LINEAR"}</Badge>
                    <Badge variant="outline">
                      Max concurrency {inspector.run.maxConcurrency ?? 1}
                    </Badge>
                    <Badge variant="outline">
                      {(inspector.run.steps ?? []).filter((step: any) =>
                        ["DONE", "SKIPPED"].includes(step.status)
                      ).length}
                      /{inspector.run.steps?.length ?? 0} complete
                    </Badge>
                  </div>
                </div>
                <ol className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {(inspector.run.steps ?? []).map((step: any, index: number) => (
                    <li
                      key={step.stepId}
                      className="rounded-lg border border-[var(--panel-line)] bg-background/30 p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                            Node {index + 1}
                          </div>
                          <div className="mt-1 font-mono text-sm text-foreground">
                            {step.stepId}
                          </div>
                        </div>
                        <Badge variant="outline">{step.status}</Badge>
                      </div>
                      <dl className="mt-3 space-y-1.5 text-xs">
                        <GraphMeta label="Kind" value={step.kind ?? "AGENT"} />
                        <GraphMeta
                          label="Depends on"
                          value={step.dependsOn?.length ? step.dependsOn.join(", ") : "Ready at start"}
                        />
                        <GraphMeta label="Isolation" value={step.isolation ?? "SHARED"} />
                        <GraphMeta label="Failure" value={step.failurePolicy ?? "RETRY"} />
                      </dl>
                      {step.error ? (
                        <div className="mt-3 rounded border border-red-500/20 bg-red-500/5 p-2 text-xs text-red-200">
                          {step.error}
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ol>
              </Card>

              <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
                <div className="space-y-6">
                  <Card id="run-timeline" className="scroll-mt-4 p-4">
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

                  <Card id="run-files" className="scroll-mt-4 p-4">
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
                  <Card id="run-artifacts" className="scroll-mt-4 p-4">
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

                  <Card id="run-receipts" className="scroll-mt-4 p-4">
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

export function RemoteSandboxCard({ sandbox }: { sandbox: any }) {
  const allocation = sandbox.allocation ?? {};
  const profile = sandbox.profileSnapshot ?? allocation.profileSnapshot ?? {};
  const credentialGrants = sandbox.credentialGrants ?? [];
  const currentCredential = credentialGrants[0];
  const lifecycleEvents = sandbox.lifecycleEvents ?? [];
  const latestLifecycle = lifecycleEvents[lifecycleEvents.length - 1];
  const readiness = profile.readiness?.state ?? "UNKNOWN";
  const degraded = readiness === "DEGRADED" || profile.network?.egress === "UNRESTRICTED";
  const resourceAbsent = Boolean(allocation.resourceAbsentAt || allocation.teardownReceipt?.resourceAbsent);
  const privatePreviewUrl = safePrivatePreviewUrl(allocation.privatePreviewUrl);
  const totalCost = [allocation.providerCostUsd, allocation.inferenceCostUsd]
    .reduce((sum: number, value: unknown) => sum + (typeof value === "number" ? value : 0), 0);

  return (
    <Card className="p-4" aria-labelledby="remote-sandbox-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div id="remote-sandbox-title" className="text-sm font-medium text-foreground">Remote sandbox boundary</div>
          <div className="mt-1 text-xs text-muted-foreground">
            Attempt-scoped execution only. Acceptance, independent verification, publication, and merge authority remain on the Mission Control host.
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className={readiness === "BLOCKED" ? "border-danger/30 text-danger" : degraded ? "border-warning/30 text-warning" : "border-success/30 text-success"}>{readiness}</Badge>
          <Badge variant="outline">{allocation.state ?? "UNKNOWN"}</Badge>
          <Badge variant="outline" className={resourceAbsent ? "border-success/30 text-success" : "border-warning/30 text-warning"}>{resourceAbsent ? "Resource absent" : "Teardown unverified"}</Badge>
        </div>
      </div>

      {degraded ? (
        <div role="status" className="mt-4 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
          Degraded isolation: provider network egress is unrestricted. No public ingress is exposed, but destination allowlisting is not enforced.
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-4">
        <Meta label="Profile" value={[profile.profileKey, profile.version ? `v${profile.version}` : null].filter(Boolean).join(" · ") || "—"} />
        <Meta label="Profile digest" value={allocation.profileDigest ?? "—"} />
        <Meta label="Provider / allocation" value={[allocation.provider, allocation.providerResourceId].filter(Boolean).join(" / ") || "—"} />
        <Meta label="Resource name" value={allocation.resourceName ?? "—"} />
        <Meta label="Machine" value={profile.machine ? `${profile.machine.cpu} CPU · ${Math.round(profile.machine.memoryMb / 1024)} GB RAM · ${profile.machine.diskGb} GB disk` : "—"} />
        <Meta label="Runtime cap" value={profile.runtime?.maxRuntimeMs ? `${Math.round(profile.runtime.maxRuntimeMs / 60_000)} minutes` : "—"} />
        <Meta label="Network" value={profile.network ? `${String(profile.network.egress).toLowerCase().replace(/_/g, " ")} · no public ports` : "—"} />
        <Meta label="Spend cap / observed" value={profile.spend ? `$${Number(profile.spend.maxUsd).toFixed(2)} / $${totalCost.toFixed(4)}` : `$${totalCost.toFixed(4)}`} />
        <Meta label="Provider heartbeat" value={allocation.lastHeartbeatAt ? new Date(allocation.lastHeartbeatAt).toLocaleString() : "—"} />
        <Meta label="Latest lifecycle" value={latestLifecycle ? `${latestLifecycle.eventType} · ${new Date(latestLifecycle.occurredAt).toLocaleString()}` : "—"} />
        <Meta label="Result" value={[allocation.resultStatus, allocation.resultDigest].filter(Boolean).join(" · ") || "Awaiting result"} />
        <Meta label="Attempt credential" value={currentCredential ? `${currentCredential.provider} · ${currentCredential.state} · cap $${Number(currentCredential.maxCostUsd).toFixed(2)}` : "No runtime credential recorded"} />
        <Meta label="Credential expiry" value={currentCredential?.expiresAt ? new Date(currentCredential.expiresAt).toLocaleString() : "—"} />
        <Meta label="Teardown" value={resourceAbsent ? `Confirmed absent ${new Date(allocation.resourceAbsentAt ?? allocation.teardownReceipt.confirmedAbsentAt).toLocaleString()}` : allocation.failureReason ?? "Awaiting exact absence receipt"} />
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--panel-line)] pt-3 text-xs text-muted-foreground">
        <span>No repository, GitHub App, provider-management, or long-lived inference credentials are stored in this record.</span>
        {privatePreviewUrl ? <Button asChild size="sm" variant="outline"><a href={privatePreviewUrl} target="_blank" rel="noreferrer">Open private preview</a></Button> : <span>Private preview unavailable</span>}
      </div>
    </Card>
  );
}

function safePrivatePreviewUrl(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && parsed.hostname.endsWith(".exe.xyz") ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function Meta({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
      <div className="mt-1 break-all text-sm text-foreground">{value ?? "—"}</div>
    </div>
  );
}

function GraphMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right text-foreground/85">{value}</dd>
    </div>
  );
}
