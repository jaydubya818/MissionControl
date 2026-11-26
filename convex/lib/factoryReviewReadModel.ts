import { deriveFactoryPublicationLineage, factoryExecutorIdentity } from "./factoryAttempt";
import { buildReviewPackage } from "./reviewPackage";
import { getCurrentVerificationResult } from "./currentVerification";
import { buildReviewIntelligenceProjection } from "./reviewIntelligence";
import { buildFileChanges, orderRunEvents } from "./runInspector";

export function buildFactoryAttemptReviewReadModel(input: {
  now: number;
  run: any;
  workOrder: any;
  events: any[];
  artifacts: any[];
  receipts: any[];
  evidenceEnvelopes?: any[];
  prChecks: any[];
  missionPlan?: any;
  repository?: any;
  receiptWorkflowRunId?: any;
  mission?: any;
  missionSpecRevision?: any;
  verificationRun?: any;
  qualityGateDecision?: any;
  decisions?: any[];
  judgments?: any[];
  residualAnalyses?: any[];
  currentVerification?: any;
  attempts?: any[];
}) {
  const orderedEvents = orderRunEvents(input.events);
  const claimEvent = orderedEvents.find((event) => event.eventType === "CHECKPOINT_CREATED"
    && event.status === "RUNNING"
    && event.commandSummary === "Factory attempt lease claimed"
    && typeof event.actor === "string"
    && event.actor.startsWith("service:")
    && event.metadata?.executionManifestDigest === input.run.executionManifestDigest);
  const recoveredExecutorIdentity = !input.run.executionClaimedBy
    && input.run.executionManifestDigest
    && input.run.executorAdapter
    && input.run.executorVersion
    && input.run.executorHostId
    && claimEvent
      ? factoryExecutorIdentity({
          ownerId: claimEvent.actor,
          executorAdapter: input.run.executorAdapter,
          executorVersion: input.run.executorVersion,
          executorHostId: input.run.executorHostId,
        })
      : undefined;
  const eventFileChanges = buildFileChanges(orderedEvents);
  const pullRequestArtifact = input.artifacts.find((artifact) => artifact.artifactType === "PULL_REQUEST");
  const codeDiffArtifact = input.artifacts.find((artifact) => artifact.artifactType === "CODE_DIFF");
  const receiptWorkflowRunId = input.receiptWorkflowRunId ?? input.run._id;
  const exactGateReceipt = input.receipts
    .filter((receipt) => receipt.receiptScope === "WORK_ORDER" && receipt.workflowRunId === receiptWorkflowRunId)
    .sort((left, right) => right.recordedAt - left.recordedAt)[0];
  const publicationLineage = deriveFactoryPublicationLineage({
    pullRequestArtifact,
    codeDiffArtifact,
    verifiedSourceRevision: exactGateReceipt?.sourceRevision,
    completedAt: input.run.completedAt,
  });
  const projectedRun = {
    ...input.run,
    ...publicationLineage.patch,
    executionClaimedBy: input.run.executionClaimedBy ?? recoveredExecutorIdentity,
  };
  const eventPaths = new Set(eventFileChanges
    .map((change) => change.repositoryPath)
    .filter((path): path is string => Boolean(path)));
  const fileChanges = [
    ...eventFileChanges,
    ...publicationLineage.changedFiles
      .filter((path) => !eventPaths.has(path))
      .map((repositoryPath) => ({
        sequenceNumber: 0,
        workflowStep: input.run.steps?.[input.run.currentStepIndex]?.stepId,
        repositoryPath,
        changeType: "modified",
        diffLocation: null,
        pullRequestUrl: publicationLineage.patch.pullRequestUrl ?? null,
        commandSummary: "Changed file recorded in the exact Attempt code-diff artifact.",
      })),
  ];
  const expectedRepository = input.repository?.repository ?? input.workOrder?.repository ?? null;
  const rollbackApproach = input.missionPlan?.rollbackApproach
    ?? (typeof input.workOrder?.metadata?.rollbackApproach === "string"
      ? input.workOrder.metadata.rollbackApproach
      : null);
  const reviewPackage = buildReviewPackage({
    now: input.now,
    run: projectedRun,
    workOrder: input.workOrder,
    receipts: input.receipts,
    evidenceEnvelopes: input.evidenceEnvelopes,
    prChecks: input.prChecks,
    events: orderedEvents,
    fileChanges,
    rollbackApproach,
    expectedRepository,
    githubAppInstallationId: typeof pullRequestArtifact?.metadata?.installationId === "string"
      ? pullRequestArtifact.metadata.installationId
      : null,
    receiptWorkflowRunId,
    currentVerification: input.currentVerification,
  });
  const reviewIntelligence = buildReviewIntelligenceProjection({
    workOrder: input.workOrder,
    run: projectedRun,
    mission: input.mission,
    missionSpecRevision: input.missionSpecRevision,
    missionPlan: input.missionPlan,
    verificationRun: input.verificationRun,
    evidenceEnvelopes: input.evidenceEnvelopes,
    prChecks: input.prChecks,
    qualityGateDecision: input.qualityGateDecision,
    criteria: reviewPackage.criteria,
    fileChanges,
    decisions: input.decisions,
    judgments: input.judgments,
    residualAnalyses: input.residualAnalyses,
    events: orderedEvents,
    currentVerification: input.currentVerification,
    attempts: input.attempts,
  });
  return {
    run: projectedRun,
    events: orderedEvents,
    fileChanges,
    reviewPackage: { ...reviewPackage, reviewIntelligence },
    exactGateReceipt: exactGateReceipt ?? null,
  };
}

export async function loadFactoryAttemptReviewReadModel(ctx: any, input: {
  run: any;
  workOrder: any;
  now?: number;
}) {
  const sourceRun = input.run.attemptPurpose === "VERIFICATION" && input.run.verificationAttemptBinding?.sourceAttemptId
    ? await ctx.db.get(input.run.verificationAttemptBinding.sourceAttemptId)
    : input.run;
  if (!sourceRun) throw new Error("Verification Attempt source lineage is unavailable.");
  const currentVerification = input.workOrder.verificationContract?.schemaVersion === 2
    ? await getCurrentVerificationResult(ctx, input.workOrder, input.now ?? Date.now())
    : null;
  const verificationRuns = input.run.attemptPurpose === "VERIFICATION"
    ? await ctx.db.query("verificationRuns").withIndex("by_run", (q: any) => q.eq("workflowRunId", input.run._id)).order("desc").collect()
    : await ctx.db.query("verificationRuns").withIndex("by_source_attempt", (q: any) => q.eq("sourceAttemptId", sourceRun._id)).order("desc").collect();
  const verificationRun = verificationRuns[0] ?? null;
  const receiptWorkflowRunId = verificationRun?.workflowRunId ?? input.run._id;
  const [events, artifacts, receipts, evidenceEnvelopes, prChecks, missionPlan, repository,
    mission, missionSpecRevision, qualityGateDecisions, decisions, judgments, residualAnalyses] = await Promise.all([
    ctx.db.query("runEvents").withIndex("by_run_sequence", (q: any) => q.eq("workflowRunId", sourceRun._id)).collect(),
    ctx.db.query("runArtifacts").withIndex("by_run", (q: any) => q.eq("workflowRunId", sourceRun._id)).collect(),
    ctx.db.query("verificationReceipts").withIndex("by_run", (q: any) => q.eq("workflowRunId", receiptWorkflowRunId)).collect(),
    ctx.db.query("evidenceEnvelopes").withIndex("by_run", (q: any) => q.eq("workflowRunId", receiptWorkflowRunId)).collect(),
    ctx.db.query("harnessPrChecks").withIndex("by_work_order", (q: any) => q.eq("workOrderId", input.workOrder._id)).collect(),
    input.workOrder.missionPlanId ? ctx.db.get(input.workOrder.missionPlanId) : null,
    sourceRun.repositoryId
      ? ctx.db.get(sourceRun.repositoryId)
      : input.workOrder.repositoryId
        ? ctx.db.get(input.workOrder.repositoryId)
        : null,
    input.workOrder.missionId ? ctx.db.get(input.workOrder.missionId) : null,
    input.workOrder.missionSpecLineage?.missionSpecRevisionId
      ? ctx.db.get(input.workOrder.missionSpecLineage.missionSpecRevisionId) : null,
    ctx.db.query("qualityGateDecisions").withIndex("by_work_order_evaluated", (q: any) => q.eq("workOrderId", input.workOrder._id)).order("desc").collect(),
    ctx.db.query("decisionCandidates").withIndex("by_attempt_created", (q: any) => q.eq("workflowRunId", sourceRun._id)).collect(),
    ctx.db.query("reviewJudgments").withIndex("by_attempt_recorded", (q: any) => q.eq("workflowRunId", sourceRun._id)).collect(),
    ctx.db.query("residualReviewAnalyses").withIndex("by_attempt_created", (q: any) => q.eq("workflowRunId", sourceRun._id)).collect(),
  ]);
  const attempts = await ctx.db.query("workflowRuns")
    .withIndex("by_work_order", (q: any) => q.eq("workOrderId", input.workOrder._id))
    .order("desc")
    .take(100);
  const qualityGateDecision = qualityGateDecisions.find((decision: any) =>
    !verificationRun || decision.verificationRunId === verificationRun._id) ?? null;
  return buildFactoryAttemptReviewReadModel({
    now: input.now ?? Date.now(),
    run: sourceRun,
    workOrder: input.workOrder,
    events,
    artifacts,
    receipts,
    evidenceEnvelopes,
    prChecks,
    missionPlan,
    repository,
    mission,
    missionSpecRevision,
    verificationRun,
    qualityGateDecision,
    decisions,
    judgments,
    residualAnalyses,
    currentVerification,
    attempts,
    receiptWorkflowRunId,
  });
}
