import { verifyVerificationSubjectIdentity } from "@mission-control/workflow-engine/verification-subject";
import type { Doc, Id } from "../_generated/dataModel";
import { canonicalize, computeCanonicalHash } from "./genomeHash";
import { recommendImprovementPromotion } from "./factoryLearning";
import { snapshotRevisionFields } from "./workOrderRevision";
import type { CurrentVerificationRoutingOutcome } from "./currentVerification";

export type ReplayDefinition = Doc<"factoryReplayManifests">["definition"];
export type ReplayCaseDefinition = ReplayDefinition["cases"][number];
export type ReplayVariant = ReplayDefinition["variants"][number];

export function replayDigest(value: unknown) {
  return `sha256:${computeCanonicalHash(value)}`;
}

export function replaySnapshot<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

/** Definition revisions and evaluator implementation versions are distinct authorities. */
export function replayEvaluatorIdentity(definition: Doc<"evalDefinitions">) {
  const configuration = definition.configuration && typeof definition.configuration === "object"
    ? definition.configuration as Record<string, unknown> : {};
  if (definition.evaluatorType === "HUMAN") return { implementationVersion: `v${definition.version}` };
  if (definition.evaluatorType === "DETERMINISTIC" && definition.scoreType === "BOOLEAN"
    && typeof configuration.thresholdMs === "number" && Number.isFinite(configuration.thresholdMs) && configuration.thresholdMs > 0) {
    return { implementationVersion: "duration-threshold/v1" };
  }
  if (definition.evaluatorType === "DETERMINISTIC" && configuration.domain === "FACTORY_MEMORY_CONTEXT") {
    return { implementationVersion: "factory-memory-v1" };
  }
  const implementationVersion = configuration.evaluatorVersion;
  const model = configuration.model;
  if (typeof implementationVersion !== "string" || !implementationVersion.trim() || implementationVersion.length > 200
    || (definition.evaluatorType === "LLM_JUDGE" && (typeof model !== "string" || !model.trim() || model.length > 200))) {
    throw new Error("Replay evaluator requires a known canonical producer or immutable configuration.evaluatorVersion (and model for a judge).");
  }
  return { implementationVersion, ...(typeof model === "string" ? { model } : {}) };
}

export function snapshotReplayWorkload(workOrder: Doc<"workOrders">) {
  const snapshot = snapshotRevisionFields(workOrder);
  const { requestedBy: _requester, assignedAgent: _agent, assignedSquad: _squad,
    metadata: _metadata, riskReasons: _reasons, ...contract } = snapshot;
  return replaySnapshot({
    ...contract,
    repositoryId: workOrder.repositoryId,
    owningTeamId: workOrder.owningTeamId,
    ownerMemberId: workOrder.ownerMemberId,
    executionEnvironment: workOrder.executionEnvironment,
    planningRepositorySha: workOrder.planningRepositorySha,
    qualityContractDigest: workOrder.qualityContractDigest,
    isMutating: workOrder.isMutating ?? true,
    metadata: {
      implementationPolicy: workOrder.metadata?.implementationPolicy,
      estimatedCostUsd: workOrder.metadata?.estimatedCostUsd,
      modelBudgetRemainingUsd: workOrder.metadata?.modelBudgetRemainingUsd,
      requiredContextTokens: workOrder.metadata?.requiredContextTokens,
    },
  });
}

export function datasetWorkloadSummary(workOrder: {
  title: string; desiredOutcome: string; acceptanceCriteria?: unknown[]; constraints?: string[];
}) {
  return replaySnapshot({
    title: workOrder.title,
    desiredOutcome: workOrder.desiredOutcome,
    acceptanceCriteria: (workOrder.acceptanceCriteria ?? []).map((value) => {
      const { status: _status, ...criterion } = value as Record<string, unknown>;
      return criterion;
    }).sort((left, right) => String(left.id).localeCompare(String(right.id))),
    constraints: [...(workOrder.constraints ?? [])].sort(),
  });
}

export function assertReplayManifest(manifest: Doc<"factoryReplayManifests">) {
  const definition = manifest.definition;
  if (manifest.digest !== replayDigest(definition)
    || manifest.projectId !== definition.projectId
    || manifest.experimentId !== definition.experimentId
    || definition.schema !== "factory-replay/v1"
    || definition.variants.length !== 2
    || new Set(definition.variants.map((variant) => variant.id)).size !== 2
    || new Set(definition.variants.map((variant) => variant.factoryDefinitionVersionId)).size !== 2
    || definition.cases.length < 1 || definition.cases.length > 50
    || !Number.isSafeInteger(definition.minimumPairs) || definition.minimumPairs < 1 || definition.minimumPairs > definition.cases.length
    || !Number.isSafeInteger(definition.maxAttemptsPerCase) || definition.maxAttemptsPerCase < 1 || definition.maxAttemptsPerCase > 5
    || definition.evaluators.length < 1 || definition.evaluators.length > 20
    || new Set(definition.evaluators.map((item) => item.id)).size !== definition.evaluators.length
    || definition.datasetSnapshot?._id !== definition.datasetId
    || definition.datasetSnapshot?.version !== definition.datasetVersion
    || definition.datasetSnapshot?.projectId !== definition.projectId
    || definition.datasetDigest !== replayDigest({ dataset: definition.datasetSnapshot, items: definition.datasetItems })
    || definition.datasetItems.length !== definition.cases.length
    || new Set(definition.cases.map((item) => item.key)).size !== definition.cases.length
    || new Set(definition.cases.map((item) => item.datasetItemId)).size !== definition.cases.length
    || definition.cases.some((item) => {
      const source = definition.datasetItems.find((row) => row._id === item.datasetItemId);
      return item.workloadDigest !== replayDigest(item.workload) || !source
        || source.projectId !== definition.projectId || source.datasetId !== definition.datasetId
        || source.sourceWorkOrderId !== item.sourceWorkOrderId
        || replayDigest(source.input) !== replayDigest(item.input)
        || replayDigest(source.expectedOutcome ?? null) !== replayDigest(item.expectedOutcome ?? null);
    })
    || definition.evaluators.some((item) => item.digest !== replayDigest(item.definition)
      || replayDigest({ implementationVersion: item.implementationVersion, ...(item.model ? { model: item.model } : {}) })
        !== replayDigest(replayEvaluatorIdentity(item.definition)))) {
    throw new Error("Frozen replay manifest failed integrity validation.");
  }
}

export function replayAttemptSetDigest(attempts: Doc<"workflowRuns">[]) {
  return replayDigest(attempts.map((attempt) => replaySnapshot({
    id: attempt._id, purpose: attempt.attemptPurpose, status: attempt.status,
    startedAt: attempt.startedAt, completedAt: attempt.completedAt,
    invocation: attempt.executorInvocationId, manifest: attempt.executionManifestDigest,
    subject: attempt.verificationSubject?.digest,
    source: attempt.verificationAttemptBinding?.sourceAttemptId,
    humanInterventions: attempt.humanInterventions,
    cost: attempt.executionCostAuthorization?.actualCost,
  })).sort((left, right) => String(left.id).localeCompare(String(right.id))));
}

export interface ReplayCaseResult {
  caseKey: string;
  variantId: string;
  caseId?: Id<"factoryReplayCases">;
  workOrderId?: string;
  state: "UNBOUND" | "NOT_STARTED" | "RUNNING" | "VERIFIED" | "FAILED" | "INCOMPLETE" | "INVALID";
  reasons: string[];
  attemptIds: string[];
  failedAttemptIds: string[];
  sourceAttemptId?: string;
  verificationRunId?: string;
  receiptId?: string;
  candidateRevision?: string;
  subjectDigest?: string;
  humanReviewPending: boolean;
  evaluatorScoreIds: string[];
  scores: Record<string, number>;
  costUsd: number | null;
  knownCostUsd: number;
  unknownCostAttempts: string[];
  costScope: "RETAINED_ATTEMPTS";
  unattributedEvaluatorCostIds: string[];
  totalAttemptDurationMs: number | null;
  implementationAttempts: number;
  firstPassVerification: boolean;
  ownerInterventions: number | null;
  assistantOutsideFactoryInterventions: number | null;
  interventionSource: "OPERATOR_REPORTED" | "UNKNOWN";
  comparable: boolean;
}

type CaseEvidence = {
  manifest: Doc<"factoryReplayManifests">;
  caseDefinition: ReplayCaseDefinition;
  variant: ReplayVariant;
  binding?: Doc<"factoryReplayCases">;
  workOrder?: Doc<"workOrders"> | null;
  attempts: Doc<"workflowRuns">[];
  verificationRuns: Doc<"verificationRuns">[];
  receipts: Doc<"verificationReceipts">[];
  evidence: Doc<"evidenceEnvelopes">[];
  scores: Doc<"evalScores">[];
  definitions: Doc<"evalDefinitions">[];
  observations: Doc<"traceObservations">[];
  reports: Doc<"factoryReplayInterventionReports">[];
  currentVerification?: CurrentVerificationRoutingOutcome;
  now: number;
};

function finiteNonnegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function fixtureMetadata(value: unknown) {
  const item = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const producer = item.verifierMetadata && typeof item.verifierMetadata === "object"
    ? item.verifierMetadata as Record<string, unknown> : {};
  return [item, producer].some((metadata) => metadata.qualificationOnly === true || metadata.fixture === true
    || metadata.deterministicFixture === true || metadata.behavioralPass === false || metadata.liveModelCall === false
    || metadata.evidenceOrigin === "CONTROL_FIXTURE" || metadata.authority === "NONE");
}

function recordedNativeAttempt(attempt: Doc<"workflowRuns">) {
  return Boolean(attempt.executorInvocationId && attempt.executorAdapter && attempt.executorVersion
    && attempt.executionManifest && attempt.executionManifestDigest === replayDigest(attempt.executionManifest)
    && ["factory-execution-manifest/v1", "factory-execution-manifest/v2", "factory-execution-manifest/v3"].includes(attempt.executionManifest.version)
    && !fixtureMetadata(attempt.metadata) && !fixtureMetadata(attempt.context));
}

export function deriveReplayCase(input: CaseEvidence): ReplayCaseResult {
  const { manifest, caseDefinition, variant, binding, workOrder, now } = input;
  const result: ReplayCaseResult = {
    caseKey: caseDefinition.key, variantId: String(variant.id),
    caseId: binding?._id,
    workOrderId: binding ? String(binding.workOrderId) : undefined,
    state: binding ? "NOT_STARTED" : "UNBOUND", reasons: [], attemptIds: [],
    failedAttemptIds: [], humanReviewPending: false, evaluatorScoreIds: [], scores: {}, costUsd: null,
    knownCostUsd: 0, unknownCostAttempts: [], totalAttemptDurationMs: null,
    costScope: "RETAINED_ATTEMPTS", unattributedEvaluatorCostIds: [],
    implementationAttempts: 0, firstPassVerification: false, ownerInterventions: null,
    assistantOutsideFactoryInterventions: null, interventionSource: "UNKNOWN", comparable: false,
  };
  if (!binding) return result;
  if (!workOrder || workOrder._id !== binding.workOrderId
    || workOrder.projectId !== manifest.projectId || binding.projectId !== manifest.projectId
    || binding.manifestId !== manifest._id || binding.caseKey !== caseDefinition.key || binding.variantId !== variant.id
    || (workOrder.currentRevisionNumber ?? 1) !== binding.workOrderRevision
    || replayDigest(snapshotReplayWorkload(workOrder)) !== caseDefinition.workloadDigest) {
    return { ...result, state: "INVALID", reasons: ["BOUND_WORKLOAD_CHANGED_OR_OUT_OF_SCOPE"] };
  }
  const attempts = [...input.attempts].sort((a, b) => a.startedAt - b.startedAt || String(a._id).localeCompare(String(b._id)));
  result.attemptIds = attempts.map((attempt) => String(attempt._id));
  result.failedAttemptIds = attempts.filter((attempt) => ["FAILED", "CANCELED"].includes(attempt.status)).map((attempt) => String(attempt._id));
  if (!attempts.length) return result;
  if (attempts.some((attempt) => attempt.projectId !== manifest.projectId || attempt.workOrderId !== workOrder._id)) {
    return { ...result, state: "INVALID", reasons: ["ATTEMPT_SCOPE_MISMATCH"] };
  }
  const implementation = attempts.filter((attempt) => attempt.attemptPurpose === "IMPLEMENTATION");
  result.implementationAttempts = implementation.length;
  if (!implementation.length || implementation.length > manifest.definition.maxAttemptsPerCase
    || implementation.some((attempt) => attempt.factoryDefinitionVersionId !== variant.factoryDefinitionVersionId
      || attempt.factoryConfigurationDigest !== variant.configurationDigest
      || attempt.workOrderRevisionNumber !== binding.workOrderRevision
      || attempt.verificationContractDigest !== workOrder.verificationContractDigest
      || attempt.executionBaseSha !== caseDefinition.workload.planningRepositorySha
      || attempt.context?.factoryReplay?.manifestDigest !== manifest.digest
      || attempt.context?.factoryReplay?.caseId !== binding._id)) {
    return { ...result, state: "INVALID", reasons: ["ATTEMPT_NOT_ATTRIBUTABLE_TO_FROZEN_CASE"] };
  }
  const source = implementation[implementation.length - 1];
  result.sourceAttemptId = String(source._id);
  for (const attempt of attempts) {
    const cost = attempt.executionCostAuthorization?.actualCost;
    if (cost?.status === "MEASURED" && finiteNonnegative(cost.usd)) result.knownCostUsd += cost.usd;
    else result.unknownCostAttempts.push(String(attempt._id));
  }
  if (!result.unknownCostAttempts.length) result.costUsd = result.knownCostUsd;
  else result.reasons.push("MEASURED_COST_INCOMPLETE");
  const durations = attempts.map((attempt) => {
    const endedAt = attempt.completedAt ?? (attempt.verificationSubject ? attempt.candidateReadyAt : undefined);
    return finiteNonnegative(endedAt) && endedAt >= attempt.startedAt ? endedAt - attempt.startedAt : null;
  });
  if (durations.every((duration): duration is number => duration !== null)) {
    result.totalAttemptDurationMs = durations.reduce((sum, duration) => sum + duration, 0);
  }
  const report = input.reports.find((item) => item.caseId === binding._id
    && item.projectId === manifest.projectId && item.attemptSetDigest === replayAttemptSetDigest(attempts));
  const observedOwner = attempts.map((attempt) => attempt.humanInterventions);
  const knownOwnerMinimum = observedOwner.filter(finiteNonnegative).reduce((sum, value) => sum + value, 0);
  if (report && Number.isSafeInteger(report.ownerCount) && report.ownerCount >= knownOwnerMinimum
    && Number.isSafeInteger(report.assistantOutsideFactoryCount) && report.assistantOutsideFactoryCount >= 0
    && report.evidenceRefs.length) {
    result.ownerInterventions = report.ownerCount;
    result.assistantOutsideFactoryInterventions = report.assistantOutsideFactoryCount;
    result.interventionSource = "OPERATOR_REPORTED";
  } else result.reasons.push("CURRENT_INTERVENTION_REPORT_MISSING");

  if (source.status === "PENDING" || source.status === "RUNNING") return { ...result, state: "RUNNING" };
  if (!recordedNativeAttempt(source)) {
    return { ...result, state: "INVALID", reasons: [...result.reasons, "NATIVE_PRODUCER_PROVENANCE_MISSING"] };
  }
  const verification = [...input.verificationRuns]
    .filter((item) => item.sourceAttemptId === source._id)
    .sort((a, b) => b.createdAt - a.createdAt || String(b._id).localeCompare(String(a._id)))[0];
  if (!source.verificationSubject) {
    return { ...result, state: ["FAILED", "CANCELED"].includes(source.status) ? "FAILED" : "INCOMPLETE",
      reasons: [...result.reasons, "NO_VERIFIED_CANDIDATE"] };
  }
  const subject = source.verificationSubject;
  result.subjectDigest = subject.digest;
  if (subject.kind !== "GIT_CANDIDATE" || !verifyVerificationSubjectIdentity(subject)
    || subject.sourceAttemptId !== source._id || subject.workOrderId !== workOrder._id
    || subject.workOrderRevisionNumber !== binding.workOrderRevision
    || subject.repositoryId !== workOrder.repositoryId
    || subject.verificationContractDigest !== workOrder.verificationContractDigest
    || source.headSha !== subject.candidateSha || source.treeSha !== subject.treeSha) {
    return { ...result, state: "INVALID", reasons: [...result.reasons, "CANDIDATE_IDENTITY_MISMATCH"] };
  }
  result.candidateRevision = subject.candidateSha;
  if (!verification) return { ...result, state: "INCOMPLETE", reasons: [...result.reasons, "INDEPENDENT_VERIFICATION_MISSING"] };
  result.verificationRunId = String(verification._id);
  const verifier = attempts.find((attempt) => attempt._id === verification.workflowRunId);
  if (!verifier || verifier.attemptPurpose !== "VERIFICATION" || verifier.factoryPurpose !== "VERIFICATION"
    || !recordedNativeAttempt(verifier) || verifier.executorInvocationId === source.executorInvocationId
    || verifier.verificationAttemptBinding?.sourceAttemptId !== source._id
    || verifier.verificationAttemptBinding.verificationSubjectDigest !== subject.digest
    || verification.projectId !== manifest.projectId || verification.workOrderId !== workOrder._id
    || verification.verificationSubjectDigest !== subject.digest
    || verification.verificationContractDigest !== workOrder.verificationContractDigest
    || verification.workOrderRevisionNumber !== binding.workOrderRevision
    || verification.candidateRevision !== subject.candidateSha
    || verification.sourceRevision !== source.executionBaseSha
    || verification.invalidatedAt || verification.independenceValid !== true
    || ![source._id, verifier._id].includes(workOrder.currentExecutionRunId!)) {
    return { ...result, state: "INVALID", reasons: [...result.reasons, "VERIFIER_CURRENTNESS_OR_INDEPENDENCE_MISMATCH"] };
  }
  if (["PLANNED", "RUNNING"].includes(verification.status)) return { ...result, state: "RUNNING" };
  const receipt = [...input.receipts].filter((item) => item.receiptScope === "WORK_ORDER"
    && item.verificationRunId === verification._id).sort((a, b) => b.recordedAt - a.recordedAt)[0];
  if (!receipt || receipt.projectId !== manifest.projectId || receipt.workOrderId !== workOrder._id
    || receipt.sourceAttemptId !== source._id || receipt.workflowRunId !== verifier._id
    || receipt.verificationAttemptId !== verifier._id || receipt.workOrderRevisionNumber !== binding.workOrderRevision
    || receipt.verificationSubjectDigest !== subject.digest
    || receipt.verificationContractDigest !== workOrder.verificationContractDigest
    || receipt.verificationPlanDigest !== verification.verificationPlanDigest
    || receipt.sourceRevision !== source.executionBaseSha || receipt.candidateRevision !== subject.candidateSha
    || receipt.invalidatedAt || !receipt.validUntil || receipt.validUntil <= now
    || receipt.independenceValid !== true || fixtureMetadata(receipt.metadata)) {
    return { ...result, state: "INCOMPLETE", reasons: [...result.reasons, "CURRENT_VERIFICATION_RECEIPT_MISSING"] };
  }
  result.receiptId = String(receipt._id);
  const linkedEvidence = (receipt.evidenceEnvelopeIds ?? []).map((id) => input.evidence.find((item) => item._id === id));
  if (!linkedEvidence.length || linkedEvidence.some((item) => !item || item.provenance !== "LIVE"
    || item.projectId !== manifest.projectId || item.workOrderId !== workOrder._id
    || item.workflowRunId !== verifier._id || item.verificationRunId !== verification._id
    || item.sourceAttemptId !== source._id || item.verificationAttemptId !== verifier._id
    || item.verificationSubjectDigest !== subject.digest
    || item.verificationContractDigest !== workOrder.verificationContractDigest
    || item.verificationPlanDigest !== verification.verificationPlanDigest
    || item.workOrderRevisionNumber !== binding.workOrderRevision
    || item.sourceRevision !== source.executionBaseSha || item.candidateRevision !== subject.candidateSha
    || item.producer.independent !== true || item.producer.attemptId !== verifier._id
    || fixtureMetadata(item.metadata))) {
    return { ...result, state: "INVALID", reasons: [...result.reasons, "LIVE_EXACT_CANDIDATE_EVIDENCE_MISSING"] };
  }
  const mandatory = workOrder.verificationContract?.checks.filter((check) => check.mandatory) ?? [];
  const covered = mandatory.length > 0 && mandatory.every((check) =>
    receipt.checks?.some((result) => result.checkId === check.id && result.status === "PASS")
    && linkedEvidence.some((item) => item?.checkId === check.id && item.result === "PASS"));
  const current = input.currentVerification;
  const canonicalIdentity = current?.sourceAttemptId === source._id
    && current.verificationAttemptId === verifier._id && current.verificationRunId === verification._id
    && current.verificationReceiptId === receipt._id && current.candidateRevision === subject.candidateSha;
  result.humanReviewPending = subject.version === 2 && verification.verdict === "REQUIRES_HUMAN_REVIEW"
    && receipt.verdict === "REQUIRES_HUMAN_REVIEW" && receipt.status === "PENDING";
  const verifiedReceipt = verification.verdict === "VERIFIED" && receipt.verdict === "VERIFIED" && receipt.status === "PASSED";
  result.state = source.status !== "FAILED" && source.status !== "CANCELED"
    && verification.status === "COMPLETED" && verifier.status === "COMPLETED"
    && (verifiedReceipt || result.humanReviewPending) && covered && canonicalIdentity && current?.eligible && current.current ? "VERIFIED"
    : canonicalIdentity && current?.verifiedOutcome === "FAILURE"
      ? "FAILED" : "INCOMPLETE";
  if (result.state !== "VERIFIED") result.reasons.push("CANDIDATE_NOT_VERIFIED");
  result.firstPassVerification = result.state === "VERIFIED" && implementation.length === 1
    && attempts.filter((attempt) => attempt.attemptPurpose === "VERIFICATION").length === 1 && !result.failedAttemptIds.length;

  for (const evaluator of manifest.definition.evaluators) {
    const definition = input.definitions.find((item) => item._id === evaluator.id);
    const scores = input.scores.filter((score) => score.evalDefinitionId === evaluator.id
      && score.workflowRunId === source._id).sort((a, b) => b.createdAt - a.createdAt);
    const score = scores[0];
    const observation = score?.observationId ? input.observations.find((item) => item._id === score.observationId) : undefined;
    const value = score?.scoreType === "BOOLEAN" && typeof score.value === "boolean"
      ? Number(score.value) : score?.scoreType === "NUMERIC" ? score.value : undefined;
    if (!definition || replayDigest(definition) !== evaluator.digest || !score
      || score.projectId !== manifest.projectId || score.evaluator.type !== evaluator.definition.evaluatorType
      || score.scoreType !== evaluator.definition.scoreType
      || (score.experimentId && score.experimentId !== manifest.experimentId)
      || (score.experimentVariantId && score.experimentVariantId !== variant.id)
      || score.evaluator.version !== evaluator.implementationVersion
      || (evaluator.model && score.evaluator.model !== evaluator.model)
      || score.createdAt < source.startedAt || score.evaluator.model === "fixture-judge"
      || score.createdBy === "system:fixture-judge" || fixtureMetadata(score.metadata)
      || (score.observationId && (!observation || observation.projectId !== manifest.projectId
        || observation.traceId !== score.traceId || fixtureMetadata(observation.metadata)))
      || typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
      result.reasons.push(`EVALUATOR_EVIDENCE_MISSING_OR_INVALID:${evaluator.id}`);
      continue;
    }
    result.scores[String(evaluator.id)] = value;
    result.evaluatorScoreIds.push(String(score._id));
    if (["LLM_JUDGE", "EXTERNAL"].includes(evaluator.definition.evaluatorType)) {
      result.unattributedEvaluatorCostIds.push(String(evaluator.id));
    }
  }
  if (result.unattributedEvaluatorCostIds.length) result.reasons.push("EVALUATOR_PROVIDER_COST_UNATTRIBUTED");
  result.comparable = ["VERIFIED", "FAILED"].includes(result.state)
    && result.costUsd !== null && result.totalAttemptDurationMs !== null
    && result.ownerInterventions !== null && result.assistantOutsideFactoryInterventions !== null
    && !result.unattributedEvaluatorCostIds.length
    && Object.keys(result.scores).length === manifest.definition.evaluators.length;
  return result;
}

export function compareReplayCases(definition: ReplayDefinition, cases: ReplayCaseResult[]) {
  const pairedKeys = definition.cases.filter((item) => definition.variants.every((variant) =>
    cases.some((result) => result.caseKey === item.key && result.variantId === variant.id && result.comparable))).map((item) => item.key);
  const denominator = definition.cases.length;
  const complete = pairedKeys.length === denominator;
  const variants = definition.variants.map((variant) => {
    const results = definition.cases.map((item) => cases.find((result) => result.caseKey === item.key && result.variantId === variant.id));
    const paired = results.filter((item): item is ReplayCaseResult => Boolean(item?.comparable && pairedKeys.includes(item.caseKey)));
    const mean = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : undefined;
    const evaluatorScores = Object.fromEntries(definition.evaluators.map((evaluator) => [String(evaluator.id), mean(paired.map((item) => item.scores[String(evaluator.id)]))]));
    return {
      variantId: variant.id, name: variant.name, denominator,
      verifiedCount: results.filter((item) => item?.state === "VERIFIED").length,
      failedCount: results.filter((item) => item?.state === "FAILED").length,
      incompleteCount: results.filter((item) => !item?.comparable).length,
      pairedSampleSize: paired.length, evaluatorScores,
      metrics: {
        sampleSize: paired.length,
        successRate: mean(paired.map((item) => Number(item.state === "VERIFIED"))),
        firstPassVerificationRate: mean(paired.map((item) => Number(item.firstPassVerification))),
        averageScore: mean(Object.values(evaluatorScores).filter((value): value is number => value !== undefined)),
        averageCostUsd: mean(paired.map((item) => item.costUsd!)),
        averageDurationMs: mean(paired.map((item) => item.totalAttemptDurationMs!)),
        averageRetries: mean(paired.map((item) => Math.max(0, item.implementationAttempts - 1))),
        humanInterventionRate: mean(paired.map((item) => item.ownerInterventions!)),
        assistantOutsideFactoryInterventions: mean(paired.map((item) => item.assistantOutsideFactoryInterventions!)),
      },
    };
  });
  const recommendation = recommendImprovementPromotion({ baseline: variants[0].metrics, candidate: variants[1].metrics });
  for (const item of definition.cases) {
    const before = cases.find((result) => result.caseKey === item.key && result.variantId === definition.variants[0].id);
    const after = cases.find((result) => result.caseKey === item.key && result.variantId === definition.variants[1].id);
    if (before?.state === "VERIFIED" && after?.state === "FAILED") recommendation.regressions.push(`verified outcome:${item.key}`);
    if (before?.comparable && after?.comparable) {
      for (const evaluator of definition.evaluators) {
        if (after.scores[evaluator.id] < before.scores[evaluator.id]) {
          recommendation.regressions.push(`case evaluator:${item.key}:${evaluator.id}`);
        }
      }
    }
  }
  for (const evaluator of definition.evaluators) {
    const before = variants[0].evaluatorScores[evaluator.id];
    const after = variants[1].evaluatorScores[evaluator.id];
    if (before !== undefined && after !== undefined && after < before) recommendation.regressions.push(`evaluator:${evaluator.id}`);
  }
  const beforeAssist = variants[0].metrics.assistantOutsideFactoryInterventions;
  const afterAssist = variants[1].metrics.assistantOutsideFactoryInterventions;
  if (beforeAssist !== undefined && afterAssist !== undefined && afterAssist > beforeAssist) {
    recommendation.regressions.push("assistant interventions outside the factory");
  }
  if (!complete) recommendation.comparisonWarnings.push("The frozen workload set has incomplete matched evidence.");
  if (pairedKeys.length < definition.minimumPairs) recommendation.comparisonWarnings.push("Matched pairs are below the declared minimum.");
  if (recommendation.regressions.length) recommendation.recommendation = "REJECT_RECOMMENDED";
  else if (recommendation.comparisonWarnings.length) recommendation.recommendation = "HOLD_RECOMMENDED";
  return {
    denominator, matchedPairs: pairedKeys.length, pairedCaseKeys: pairedKeys,
    minimumPairs: definition.minimumPairs, complete,
    sampleSufficient: complete && pairedKeys.length >= definition.minimumPairs,
    variants, recommendation, autoPromote: false as const, statisticallySignificant: false as const,
    acceptanceAuthority: false as const, interventionAttribution: "OPERATOR_REPORTED" as const,
  };
}

export function assertBoundedReplayDefinition(definition: ReplayDefinition) {
  if (new TextEncoder().encode(canonicalize(definition)).byteLength > 500_000) {
    throw new Error("Replay manifest exceeds the bounded snapshot size.");
  }
}
