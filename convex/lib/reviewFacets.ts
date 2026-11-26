import type { CurrentVerificationResult } from "./currentVerification";

export type ReviewFacetEvidence = {
  _id?: string;
  workOrderId?: string;
  workOrderRevisionNumber?: number;
  workflowRunId?: string;
  sourceAttemptId?: string;
  verificationAttemptId?: string;
  verificationRunId?: string;
  verificationSubjectId?: string;
  verificationSubjectDigest?: string;
  verificationContractDigest?: string;
  verificationPlanId?: string;
  verificationPlanDigest?: string;
  acceptanceCriterionIds?: string[];
  sourceRevision?: string;
  candidateRevision?: string;
  result?: string;
  provenance?: string;
  producer?: { actorId?: string; independent?: boolean };
  contentHash?: string;
  recordedAt?: number;
  metadata?: unknown;
};

type RollbackObservation = {
  estimatedMinutes: number;
  operatorSteps: number;
  requiresDataRestore: boolean;
  requiresRedeployment: boolean;
  restorationTest: "PASS" | "FAIL" | "NOT_RUN";
};
type DetectionObservation = { mechanism: string; faultInjected: boolean; signalObserved: boolean };
type RuntimeObservation = { platform: string; architecture: string; nodeVersion: string };
type ReviewObservation = { rollback: RollbackObservation | null; errorDetection: DetectionObservation | null };
type FacetStatus = "SUPPORTED" | "ATTENTION" | "UNKNOWN";
type Facet = { id: string; label: string; status: FacetStatus; summary: string; evidenceIds: string[] };

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function text(value: unknown, maximum = 160): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maximum && !/[\u0000-\u001f]/.test(value);
}

function nonnegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function verifierMetadata(metadata: unknown): Record<string, unknown> | null {
  const envelope = record(metadata);
  if (!envelope) return null;
  if (envelope.verifierMetadata === undefined) return envelope;
  // Policy V2 persists producer fields inside verifierMetadata. A mixed shape
  // is ambiguous, so it must not choose the more favorable observation.
  if (["output", "reviewObservation", "verifierHost"].some((key) => envelope[key] !== undefined)) return null;
  return record(envelope.verifierMetadata);
}

function parseObservation(metadata: Record<string, unknown>): ReviewObservation | null {
  let value: unknown = metadata.reviewObservation;
  if (value !== undefined && typeof metadata.output === "string"
    && metadata.output.split(/\r?\n/).some((line) => line.startsWith("MC_REVIEW_OBSERVATION="))) return null;
  if (value === undefined && typeof metadata.output === "string" && metadata.output.length <= 20_000) {
    if (metadata.outputTruncated !== undefined && metadata.outputTruncated !== false) return null;
    const lines = metadata.output.split(/\r?\n/).filter((line) => line.startsWith("MC_REVIEW_OBSERVATION="));
    if (lines.length !== 1) return null;
    try { value = JSON.parse(lines[0].slice("MC_REVIEW_OBSERVATION=".length)); } catch { return null; }
  }
  const observation = record(value);
  if (observation?.schema !== "factory-review-observation/v1") return null;
  const rollback = record(observation.rollback);
  const detection = record(observation.errorDetection);
  return {
    rollback: rollback && nonnegative(rollback.estimatedMinutes) && nonnegative(rollback.operatorSteps)
      && Number.isSafeInteger(rollback.operatorSteps) && typeof rollback.requiresDataRestore === "boolean"
      && typeof rollback.requiresRedeployment === "boolean" && typeof rollback.restorationTest === "string"
      && ["PASS", "FAIL", "NOT_RUN"].includes(rollback.restorationTest)
      ? { estimatedMinutes: rollback.estimatedMinutes, operatorSteps: rollback.operatorSteps,
        requiresDataRestore: rollback.requiresDataRestore, requiresRedeployment: rollback.requiresRedeployment,
        restorationTest: rollback.restorationTest as RollbackObservation["restorationTest"] } : null,
    errorDetection: detection && text(detection.mechanism) && typeof detection.faultInjected === "boolean"
      && typeof detection.signalObserved === "boolean"
      ? { mechanism: detection.mechanism.trim(), faultInjected: detection.faultInjected, signalObserved: detection.signalObserved } : null,
  };
}

export function buildReviewFacets(input: {
  now: number;
  packageStatus: string;
  workOrderId?: string;
  revision?: number;
  sourceAttemptId: string;
  sourceRevision?: string;
  candidateRevision?: string;
  executionClaimedBy?: string;
  currentVerification?: CurrentVerificationResult | null;
  gate?: {
    _id?: string;
    verificationSubjectId?: string;
    verificationPlanId?: string;
    evidenceEnvelopeIds?: string[];
  };
  criteria: Array<{ id: string; status: string; receiptId: string | null; evidenceEnvelopeIds: string[] }>;
  changedFiles: string[];
  deviations: string[];
  rollbackApproach?: string | null;
  evidence: ReviewFacetEvidence[];
}) {
  const current = input.currentVerification;
  const tuple = current?.exactIdentity;
  const usableCurrent = Boolean(current?.current && current.eligible && tuple && input.gate?._id
    && input.sourceRevision && input.candidateRevision
    && current.verificationReceiptId === input.gate._id && current.sourceAttemptId === input.sourceAttemptId
    && current.candidateRevision === input.candidateRevision && tuple.workOrderId === input.workOrderId
    && tuple.workOrderRevisionNumber === input.revision && tuple.sourceAttemptId === input.sourceAttemptId
    && current.verificationAttemptId && current.verificationRunId && current.verificationPlanDigest
    && tuple.verificationSubjectDigest && tuple.verificationContractDigest
    && input.gate.verificationSubjectId && input.gate.verificationPlanId && current.evidenceSetDigest);
  const accepted = input.criteria.filter((criterion) => criterion.status === "PASS" && criterion.receiptId);
  const linked = new Set(accepted.flatMap((criterion) => criterion.evidenceEnvelopeIds));
  const gateLinked = new Set(input.gate?.evidenceEnvelopeIds ?? []);
  const trusted = usableCurrent ? input.evidence.filter((envelope) => {
    const metadata = record(envelope.metadata);
    const producerMetadata = verifierMetadata(envelope.metadata);
    return Boolean(envelope._id && linked.has(envelope._id) && gateLinked.has(envelope._id)
      && envelope.workOrderId === tuple!.workOrderId && envelope.workOrderRevisionNumber === tuple!.workOrderRevisionNumber
      && envelope.sourceAttemptId === tuple!.sourceAttemptId && envelope.verificationSubjectDigest === tuple!.verificationSubjectDigest
      && envelope.verificationContractDigest === tuple!.verificationContractDigest
      && envelope.verificationAttemptId === current!.verificationAttemptId && envelope.workflowRunId === current!.verificationAttemptId
      && envelope.verificationRunId === current!.verificationRunId && envelope.verificationPlanDigest === current!.verificationPlanDigest
      && envelope.verificationSubjectId === input.gate!.verificationSubjectId && envelope.verificationPlanId === input.gate!.verificationPlanId
      && envelope.sourceRevision === input.sourceRevision && envelope.candidateRevision === input.candidateRevision
      && envelope.result === "PASS" && envelope.provenance === "LIVE"
      && metadata?.authority !== "NONE" && metadata?.evidenceOrigin !== "CONTROL_FIXTURE"
      && producerMetadata?.authority !== "NONE" && producerMetadata?.evidenceOrigin !== "CONTROL_FIXTURE"
      && envelope.producer?.independent === true && envelope.producer.actorId
      && envelope.producer.actorId !== input.executionClaimedBy
      && /^sha256:[a-f0-9]{64}$/.test(envelope.contentHash ?? "")
      && typeof envelope.recordedAt === "number" && Number.isFinite(envelope.recordedAt) && envelope.recordedAt <= input.now
      && envelope.acceptanceCriterionIds?.some((id) => accepted.some((criterion) => criterion.id === id && criterion.evidenceEnvelopeIds.includes(envelope._id!))));
  }).sort((a, b) => (b.recordedAt ?? 0) - (a.recordedAt ?? 0)) : [];
  const observations = trusted.map((envelope) => ({ envelope, observation: parseObservation(verifierMetadata(envelope.metadata) ?? {}) }));
  const rollbackEvidence = observations.find((item) => item.observation?.rollback);
  const detectionEvidence = observations.find((item) => item.observation?.errorDetection);
  const rollback = rollbackEvidence?.observation?.rollback ?? null;
  const errorDetection = detectionEvidence?.observation?.errorDetection ?? null;
  const runtimeEvidence = trusted.find((envelope) => {
    const host = record(verifierMetadata(envelope.metadata)?.verifierHost);
    return host && text(host.platform, 40) && text(host.architecture, 40) && text(host.nodeVersion, 40);
  });
  const verifierHost = runtimeEvidence ? record(verifierMetadata(runtimeEvidence.metadata)?.verifierHost) as RuntimeObservation : null;
  const allCriteriaSupported = usableCurrent && input.criteria.length > 0 && accepted.length === input.criteria.length;
  const facets: Facet[] = [
    { id: "alignment", label: "Alignment", status: allCriteriaSupported ? "SUPPORTED" : "UNKNOWN",
      summary: allCriteriaSupported ? "Every bound acceptance criterion has passing evidence. Review the original intent and scope." : "Complete current criterion evidence is unavailable. Intent alignment still needs review.",
      evidenceIds: accepted.flatMap((criterion) => criterion.evidenceEnvelopeIds) },
    { id: "impact", label: "Impact", status: input.deviations.length ? "ATTENTION" : input.changedFiles.length ? "SUPPORTED" : "UNKNOWN",
      summary: input.deviations.length ? "Unresolved policy deviations affect the review." : input.changedFiles.length ? `${input.changedFiles.length} changed files are recorded. Assess their behavioral impact.` : "Changed-file evidence is missing.", evidenceIds: [] },
    { id: "verification", label: "Verification", status: input.packageStatus === "READY" ? "SUPPORTED" : "ATTENTION",
      summary: input.packageStatus === "READY" ? "The existing review gate has the required evidence." : "Required checks or current evidence are incomplete or blocked.",
      evidenceIds: input.gate?._id ? [input.gate._id] : [] },
    { id: "rollback", label: "Rollback cost", status: rollback?.restorationTest === "FAIL" ? "ATTENTION" : rollback ? "SUPPORTED" : "UNKNOWN",
      summary: rollback ? `Verifier-reported estimate: ${rollback.estimatedMinutes} minutes and ${rollback.operatorSteps} operator steps. Restoration test: ${rollback.restorationTest}.`
        : input.rollbackApproach?.trim() ? "Rollback guidance exists. Cost and exercised restoration are unknown." : "Rollback guidance, cost, and exercised restoration are unknown.",
      evidenceIds: rollbackEvidence?.envelope._id ? [rollbackEvidence.envelope._id] : [] },
    { id: "error-detection", label: "Error detection", status: errorDetection ? errorDetection.faultInjected && errorDetection.signalObserved ? "SUPPORTED" : "ATTENTION" : "UNKNOWN",
      summary: errorDetection ? errorDetection.faultInjected && errorDetection.signalObserved ? `An independent verifier reports an injected fault and observed signal through ${errorDetection.mechanism}.`
        : "Detection was described, but an injected fault and observed signal were not both established." : "Application-error detection has no current independent observation.",
      evidenceIds: detectionEvidence?.envelope._id ? [detectionEvidence.envelope._id] : [] },
  ];
  return { schema: "factory-review-facets/v1" as const, authority: "ADVISORY" as const,
    mandatoryGateStatus: input.packageStatus, facets,
    rollback: { observation: rollback, evidenceId: rollbackEvidence?.envelope._id ?? null },
    errorDetection: { observation: errorDetection, evidenceId: detectionEvidence?.envelope._id ?? null },
    verifierHost: verifierHost ? { platform: verifierHost.platform, architecture: verifierHost.architecture,
      nodeVersion: verifierHost.nodeVersion, evidenceId: runtimeEvidence!._id! } : null,
    applicationRuntime: "UNVERIFIED" as const,
  };
}
