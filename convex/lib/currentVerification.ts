import { enterpriseMissionOwner } from "./enterpriseMissionOwner";
import { enterpriseDelegationApproval, enterprisePlanApprovedByOwner, DELEGATION_PREPARATION, type EnterpriseResultReadScope } from "./enterpriseDelegationAdmission";
import { canonicalDigest, canonicalHash } from "@mission-control/shared";
import { verificationContractDigest } from "@mission-control/workflow-engine/verification-identity";
import { enterpriseProject } from "./enterpriseAttemptAccounting";
import { createNativeQualificationEvidenceChecker } from "./nativeQualificationEvidence";
import {
  evaluateCurrentVerificationEligibility,
  evaluatePrepublicationVerification,
} from "@mission-control/workflow-engine/verification-currentness";
import type { VerificationIdentityTuple } from "@mission-control/workflow-engine";
import {
  qualityGateProjectionInputDigest,
  qualityGateStateForCurrentEligibility,
} from "./qualityGateDecision";

export type CurrentVerificationRoutingOutcome = ReturnType<
  typeof evaluateCurrentVerificationEligibility
>;

export type CurrentVerificationResult = Omit<
  ReturnType<typeof evaluateCurrentVerificationEligibility>,
  "exactIdentity" | "verifiedOutcome" | "verificationRecordedAt"
> & {
  exactIdentity?: VerificationIdentityTuple;
};

export async function getCurrentVerificationResult(
  ctx: any,
  workOrder: any,
  now = Date.now(),
  isolatedEnterpriseQualification = false,
): Promise<CurrentVerificationResult> {
  const current = await getCurrentVerificationRoutingOutcome(ctx, workOrder, now, "ACCEPTANCE", isolatedEnterpriseQualification);
  const {
    verifiedOutcome: _verifiedOutcome,
    verificationRecordedAt: _verificationRecordedAt,
    ...acceptanceEligibility
  } = current;
  return acceptanceEligibility;
}

/**
 * Return the canonical Policy V2 evaluation with its strictly verified outcome
 * classification. Acceptance deliberately consumes the narrower projection
 * above so this internal routing signal does not alter the public API shape.
 */
export async function getCurrentVerificationRoutingOutcome(
  ctx: any,
  workOrder: any,
  now = Date.now(),
  purpose: "ACCEPTANCE" | "PREPUBLICATION" = "ACCEPTANCE",
  isolatedEnterpriseQualification = false,
  resultReadScope?: EnterpriseResultReadScope,
): Promise<CurrentVerificationRoutingOutcome> {
  if (resultReadScope && (!isolatedEnterpriseQualification || purpose !== 'ACCEPTANCE'
    || workOrder.missionId !== resultReadScope.missionId || workOrder.missionPlanId !== resultReadScope.planId)) throw Error('ENTERPRISE_RESULT_SCOPE_REQUIRED');
  const [attempts, results, receipts, evidence, providerHeads, repository, installations, approvals] = await Promise.all([
    ctx.db.query("workflowRuns").withIndex("by_work_order", (q: any) => q.eq("workOrderId", workOrder._id)).collect(),
    ctx.db.query("verificationRuns").withIndex("by_work_order", (q: any) => q.eq("workOrderId", workOrder._id)).collect(),
    ctx.db.query("verificationReceipts").withIndex("by_work_order", (q: any) => q.eq("workOrderId", workOrder._id)).collect(),
    ctx.db.query("evidenceEnvelopes").withIndex("by_work_order", (q: any) => q.eq("workOrderId", workOrder._id)).collect(),
    ctx.db.query("harnessPrChecks").withIndex("by_work_order", (q: any) => q.eq("workOrderId", workOrder._id)).collect(),
    workOrder.repositoryId ? ctx.db.get(workOrder.repositoryId) : Promise.resolve(null),
    workOrder.repositoryId
      ? ctx.db.query("githubAppInstallations").withIndex("by_repository", (q: any) => q.eq("repositoryId", workOrder.repositoryId)).collect()
      : Promise.resolve([]),
    ctx.db.query("approvalDecisions").withIndex("by_work_order", (q: any) => q.eq("workOrderId", workOrder._id)).collect(),
  ]);
  const isolatedEvidence: any[] = [];
  if (isolatedEnterpriseQualification) {
    if (!await enterpriseProject(ctx, workOrder.projectId)) throw Error("ENTERPRISE_GATE_SCOPE_DENIED");
    const nativeEvidenceIsCurrent = createNativeQualificationEvidenceChecker(ctx, workOrder, attempts, now);
    for (const envelope of evidence) {
      if (await nativeEvidenceIsCurrent(envelope)) {
        isolatedEvidence.push(envelope);
        continue;
      }
      if (envelope.provenance !== "SYNTHETIC" || envelope.metadata?.authority !== "ISOLATED_ENTERPRISE_QUALIFICATION"
        || envelope.projectId !== workOrder.projectId || envelope.tenantId !== workOrder.tenantId) continue;
      const trial = await ctx.db.get(envelope.metadata.trialId);
      const factory = trial && await ctx.db.get(trial.factoryDefinitionId);
      const binding = trial?.binding;
      const mission = binding && await ctx.db.get(binding.missionId);
      const plan = binding && await ctx.db.get(binding.missionPlanId);
      const source = attempts.find((a: any) => a._id === binding?.workflowRunId);
      const reservation = source?.executionCostAuthorization?.enterprise;
      const verifier = attempts.find((a: any) => a._id === envelope.verificationAttemptId);
      const parent = verifier?.enterpriseAccountingParent;
      const artifact = envelope.artifactIds.length === 1 && await ctx.db.get(envelope.artifactIds[0]);
      const revision = binding && await ctx.db.get(binding.workOrderRevisionId);
      const approval = binding && await enterpriseDelegationApproval(ctx, plan, binding, source, resultReadScope).catch(() => null);
      if (!trial || trial.projectId !== workOrder.projectId || trial.tenantId !== workOrder.tenantId
        || !artifact || artifact.projectId !== workOrder.projectId || artifact.tenantId !== workOrder.tenantId
        || artifact.workflowRunId !== source?._id || artifact.contentHash !== envelope.metadata.resultDigest
        || !artifact.metadata?.authenticatedResponse || !envelope.metadata.authenticatedResponseDigest
        || canonicalDigest("enterprise-authenticated-readback/v1", artifact.metadata.authenticatedResponse) !== envelope.metadata.authenticatedResponseDigest
        || artifact.metadata?.resultDigest !== envelope.metadata.resultDigest
        || artifact.metadata?.bindingDigest !== trial.bindingDigest || artifact.metadata?.factoryVersion !== binding.factoryVersion
        || canonicalDigest("enterprise-custody-observation/v1", artifact.metadata?.custodyObservation)
          !== canonicalDigest("enterprise-custody-observation/v1", envelope.metadata.custodyObservation)
        || !parent || parent.workflowRunId !== source?._id || parent.reservationDigest !== reservation?.digest
        || parent.bindingDigest !== trial.bindingDigest || parent.resultDigest !== envelope.metadata.resultDigest
        || source.factoryDefinitionVersionId !== factory?.enterpriseRegistration?.config.definitionVersionId
        || !reservation || reservation.bindingDigest !== trial.bindingDigest || reservation.ownerId !== binding.ownerScope
        || reservation.factoryVersion !== binding.factoryVersion || reservation.provider !== "local-docker"
        || source.executionManifestDigest !== binding.executionManifestDigest
        || source.workOrderRevisionId !== binding.workOrderRevisionId || source.tenantId !== workOrder.tenantId
        || source.projectId !== workOrder.projectId || source.workOrderId !== workOrder._id
        || revision?.status !== "APPLIED" || workOrder.currentRevisionId !== binding.workOrderRevisionId
        || workOrder.missionPlanId !== binding.missionPlanId || workOrder.missionPlanRevision !== binding.missionPlanRevision
        || mission?.currentSpecRevisionId !== binding.missionSpecRevisionId
        || !["COMPLETED", "FAILED"].includes(trial.state) || trial.cancelRequested || trial.bindingDigest !== envelope.metadata.bindingDigest
        || binding.factoryVersion !== envelope.metadata.factoryVersion || binding.workOrderId !== workOrder._id
        || binding.qualityContractDigest !== workOrder.qualityContractDigest || binding.expiresAt <= now
        || (source.executionManifest?.schema === DELEGATION_PREPARATION
          ? (workOrder.currentExecutionRunId && ![source._id, verifier._id].includes(workOrder.currentExecutionRunId))
            || attempts.some((a: any) => ["PENDING", "RUNNING", "PAUSED", "WAITING", "WAITING_FOR_APPROVAL"].includes(a.status))
          : workOrder.currentExecutionRunId !== binding.workflowRunId) || workOrder.approvalStatus !== "APPROVED"
        || workOrder.verificationContractDigest !== verificationContractDigest(workOrder.verificationContract, workOrder.qualityContractDigest)
        || canonicalDigest("enterprise-verification-fields/v1", { requirements: workOrder.requirements ?? [], acceptanceCriteria: workOrder.acceptanceCriteria.map(({ status, ...criterion }: any) => criterion), negativeConstraints: workOrder.negativeConstraints, changeBudget: workOrder.changeBudget, verificationContract: workOrder.verificationContract })
          !== canonicalDigest("enterprise-verification-fields/v1", { requirements: approval?.verificationSpec?.requirements ?? [], acceptanceCriteria: approval?.verificationSpec?.acceptanceCriteria, negativeConstraints: approval?.verificationSpec?.negativeConstraints, changeBudget: approval?.verificationSpec?.changeBudget, verificationContract: approval?.verificationSpec?.verificationContract })
        || factory?.enterpriseRegistration?.digest !== trial.registrationDigest
        || factory.status === "ARCHIVED" || factory.enterpriseRegistration.health !== "HEALTHY"
        || factory.enterpriseRegistration.qualification !== "FIXTURE_QUALIFIED"
        || factory.enterpriseRegistration.revokedAt !== undefined || factory.enterpriseRegistration.validUntil <= now
        || factory.enterpriseRegistration.config.factoryVersion !== binding.factoryVersion
        || mission?.currentPlanId !== plan?._id || await enterpriseMissionOwner(ctx, mission) !== binding.ownerScope
        || plan?.status !== "APPROVED" || plan.revisionNumber !== binding.missionPlanRevision
        || canonicalDigest("mission-plan-fixture/v1", { revision: plan.revisionNumber, summary: plan.summary, blueprints: plan.workOrderBlueprints, assertions: plan.assertions ?? [] }) !== binding.missionPlanDigest
        || plan.decidedActorSource !== "AUTHENTICATED" || !await enterprisePlanApprovedByOwner(ctx, plan, binding.ownerScope) || !plan.approvedAt
        || approval?.ownerActorId !== binding.ownerScope || plan.qualityContractDigest !== binding.qualityContractDigest
        || `sha256:${canonicalHash(plan.qualityContractProjection)}` !== binding.qualityContractDigest
        || approval?.bindingDigest !== trial.bindingDigest || approval.revokedAt !== undefined) continue;
      isolatedEvidence.push(envelope);
    }
  }
  const connectedInstallationIds = new Set(
    installations.filter((installation: any) => installation.status === "CONNECTED")
      .map((installation: any) => installation.installationId),
  );

  const humanReviewValid = (receipt: any) => {
    const source = attempts.find((attempt: any) => String(attempt._id) === String(receipt.sourceAttemptId));
    const approval = approvals.find((item: any) => item._id === receipt.metadata?.humanReviewApprovalDecisionId);
    return Boolean(source?.verificationSubject?.version === 2 && source.verificationSubject.digest === receipt.verificationSubjectDigest
      && source.factoryContinuation?.approvalDecisionId === approval?._id
      && source.factoryContinuation?.resolvedVerificationReceiptId === receipt._id
      && source.factoryContinuation?.verificationReceiptId === receipt.metadata?.supersedesVerificationReceiptId
      && source.factoryContinuation?.candidateRevision === receipt.candidateRevision
      && approval?.approvalType === "HUMAN_REVIEW" && approval.status === "APPROVED"
      && approval.workflowRunId === source._id && approval.workOrderRevisionNumber === workOrder.currentRevisionNumber
      && typeof approval.expiresAt === "number" && approval.expiresAt > now);
  };
  const evaluate = purpose === "PREPUBLICATION" ? evaluatePrepublicationVerification : evaluateCurrentVerificationEligibility;
  return evaluate({
    projectId: String(workOrder.projectId), tenantId: String(workOrder.tenantId),
    workOrderId: String(workOrder._id),
    workOrderRevisionNumber: workOrder.currentRevisionNumber ?? 1,
    qualityContractDigest: workOrder.qualityContractDigest,
    verificationContractDigest: workOrder.verificationContractDigest,
    sourceAttempts: attempts.map((attempt: any) => ({
      id: String(attempt._id),
      repositoryId: attempt.repositoryId ? String(attempt.repositoryId) : undefined,
      attemptPurpose: attempt.attemptPurpose,
      status: attempt.status,
      candidateReadyAt: attempt.candidateReadyAt,
      qualityContractDigest: attempt.qualityContractDigest,
      verificationSubject: normalizeSubject(attempt.verificationSubject),
      subjectPublicationBinding: attempt.subjectPublicationBinding,
    })),
    verificationAttempts: attempts.map((attempt: any) => ({
      id: String(attempt._id),
      attemptPurpose: attempt.attemptPurpose,
      status: attempt.status,
      createdAt: isolatedEnterpriseQualification && attempt.enterpriseAccountingParent
        ? attempt.metadata?.signedFactoryExecutionStartedAt : attempt._creationTime ?? attempt.startedAt,
      executionManifestDigest: attempt.executionManifestDigest, executionProfileDigest: attempt.executionProfileDigest,
      supersededAt: attempt.metadata?.verificationSupersededAt,
      qualityContractDigest: attempt.qualityContractDigest,
      verificationAttemptBinding: normalizeTuple(attempt.verificationAttemptBinding),
    })),
    verificationResults: results.map((result: any) => ({
      id: String(result._id),
      workflowRunId: String(result.workflowRunId),
      workOrderId: String(result.workOrderId),
      workOrderRevisionNumber: result.workOrderRevisionNumber,
      verificationContractDigest: result.verificationContractDigest ?? "",
      sourceAttemptId: result.sourceAttemptId ? String(result.sourceAttemptId) : "",
      verificationSubjectDigest: result.verificationSubjectDigest ?? "",
      status: result.status,
      verdict: result.verdict,
      independenceValid: result.independenceValid,
      verificationPlanId: result.verificationPlanId,
      verificationPlanDigest: result.verificationPlanDigest,
      decisionInputDigest: result.decisionInputDigest,
      createdAt: result.createdAt ?? result._creationTime,
      completedAt: result.completedAt,
      invalidatedAt: result.invalidatedAt,
    })),
    verificationReceipts: receipts
      .filter((receipt: any) => receipt.receiptScope === "WORK_ORDER" && receipt.verificationRunId)
      .map((receipt: any) => ({
        id: String(receipt._id),
        verificationRunId: String(receipt.verificationRunId),
        verificationAttemptId: receipt.verificationAttemptId ? String(receipt.verificationAttemptId) : "",
        verificationPlanId: receipt.verificationPlanId ?? "",
        verificationPlanDigest: receipt.verificationPlanDigest ?? "",
        verificationSubjectId: receipt.verificationSubjectId ?? "",
        evidenceEnvelopeIds: receipt.evidenceEnvelopeIds?.map(String),
        workOrderId: String(receipt.workOrderId),
        workOrderRevisionNumber: receipt.workOrderRevisionNumber ?? 0,
        verificationContractDigest: receipt.verificationContractDigest ?? "",
        sourceAttemptId: receipt.sourceAttemptId ? String(receipt.sourceAttemptId) : "",
        verificationSubjectDigest: receipt.verificationSubjectDigest ?? "",
        status: receipt.status,
        verdict: receipt.verdict,
        independenceValid: receipt.independenceValid,
        decisionInputDigest: receipt.decisionInputDigest,
        recordedAt: receipt.recordedAt,
        validUntil: receipt.validUntil,
        invalidatedAt: receipt.invalidatedAt,
        humanReviewValid: humanReviewValid(receipt),
      })),
    // Qualification/imported/structural evidence cannot inherit production
    // acceptance authority merely because its identity tuple matches a receipt.
    // A qualification-only path must prove its environment scope separately.
    verificationEvidence: evidence.filter((envelope: any) => isolatedEvidence.includes(envelope) || envelope.provenance === "LIVE"
      && envelope.metadata?.authority !== "NONE"
      && envelope.metadata?.evidenceOrigin !== "CONTROL_FIXTURE").map((envelope: any) => ({
      id: String(envelope._id),
      workflowRunId: String(envelope.workflowRunId),
      verificationRunId: String(envelope.verificationRunId),
      verificationAttemptId: envelope.verificationAttemptId ? String(envelope.verificationAttemptId) : "",
      verificationSubjectId: envelope.verificationSubjectId ?? "",
      verificationPlanId: envelope.verificationPlanId ?? "",
      verificationPlanDigest: envelope.verificationPlanDigest ?? "",
      workOrderId: String(envelope.workOrderId),
      workOrderRevisionNumber: envelope.workOrderRevisionNumber ?? 0,
      verificationContractDigest: envelope.verificationContractDigest ?? "",
      sourceAttemptId: envelope.sourceAttemptId ? String(envelope.sourceAttemptId) : "",
      verificationSubjectDigest: envelope.verificationSubjectDigest ?? "",
      recordedAt: envelope.recordedAt,
    })),
    localCandidateObservations: isolatedEvidence.map((envelope: any) => {
      const attempt = attempts.find((a: any) => a._id === envelope.verificationAttemptId);
      const observation = envelope.metadata.nativeCandidateObservation ?? envelope.metadata.custodyObservation;
      return { ...normalizeTuple(envelope)!, evidenceEnvelopeId: String(envelope._id),
        projectId: String(envelope.projectId), tenantId: String(envelope.tenantId), repositoryId: String(attempt?.repositoryId),
        verificationAttemptId: String(envelope.verificationAttemptId), verificationRunId: String(envelope.verificationRunId),
        verificationPlanDigest: envelope.verificationPlanDigest, executionManifestDigest: attempt?.executionManifestDigest,
        executionProfileDigest: attempt?.executionProfileDigest, candidateSha: observation.candidateCommit,
        treeSha: observation.candidateTree, observedAt: observation.observedAt, expiresAt: observation.expiresAt };
    }),
    providerHeads: providerHeads
      .filter((head: any) => head.source === "GITHUB" && head.provider === "GITHUB"
        && head.repositoryId && String(head.repositoryId) === String(workOrder.repositoryId)
        && head.installationId && connectedInstallationIds.has(head.installationId)
        && head.providerRepositoryId && head.providerRepositoryId === repository?.providerRepositoryId
        && head.providerPullRequestId && head.workflowRunId
        && head.prNumber && head.headSha && head.prState)
      .map((head: any) => ({
        provider: "GITHUB" as const,
        repositoryId: String(head.repositoryId),
        installationId: head.installationId,
        sourceAttemptId: String(head.workflowRunId),
        providerRepositoryId: head.providerRepositoryId,
        providerPullRequestId: head.providerPullRequestId,
        pullRequestNumber: head.prNumber,
        pullRequestUrl: head.prUrl,
        state: head.prState,
        draft: head.draft === true,
        headSha: head.headSha,
        syncedAt: head.syncedAt,
        expiresAt: head.attestationExpiresAt,
      })),
    now,
  });
}

/**
 * Append the audit projection produced by the canonical policy-v2 currentness
 * calculation. Acceptance must never read this projection back as authority.
 */
export async function appendCurrentVerificationQualityGateDecision(
  ctx: any,
  workOrder: any,
  current: CurrentVerificationResult,
  idempotencyKey: string,
  now = Date.now(),
  qualificationScope?: "ISOLATED_ENTERPRISE_QUALIFICATION",
) {
  const projectionKey = `${idempotencyKey}${qualificationScope ? ":isolated-enterprise" : ""}:policy-v2-quality-gate`;
  const existing = await ctx.db.query("qualityGateDecisions")
    .withIndex("by_idempotency", (q: any) => q.eq("idempotencyKey", projectionKey))
    .first();
  if (existing) {
    if (existing.workOrderId !== workOrder._id || existing.metadata?.qualificationScope !== qualificationScope) {
      throw new Error("Quality Gate idempotency key is already bound to another WorkOrder or authority scope.");
    }
    return existing;
  }

  const sourceAttempt = current.sourceAttemptId ? await ctx.db.get(current.sourceAttemptId) : null;
  const decisionInput = {
    version: 2,
    workOrderId: String(workOrder._id),
    workOrderRevisionNumber: workOrder.currentRevisionNumber ?? 1,
    qualityContractDigest: workOrder.qualityContractDigest,
    verificationContractDigest: workOrder.verificationContractDigest,
    exactIdentity: current.exactIdentity,
    candidateRevision: current.candidateRevision,
    sourceAttemptId: current.sourceAttemptId,
    verificationAttemptId: current.verificationAttemptId,
    verificationRunId: current.verificationRunId,
    verificationReceiptId: current.verificationReceiptId,
    verificationPlanDigest: current.verificationPlanDigest,
    evidenceSetDigest: current.evidenceSetDigest,
    historicalVerdict: current.historicalVerdict,
    eligible: current.eligible,
    current: current.current,
    reasons: current.reasons,
    ...(qualificationScope ? { qualificationScope } : {}),
  };
  const qualityGateDecisionId = await ctx.db.insert("qualityGateDecisions", {
    tenantId: workOrder.tenantId,
    projectId: workOrder.projectId,
    missionId: workOrder.missionId,
    workOrderId: workOrder._id,
    workflowRunId: current.verificationAttemptId ?? current.sourceAttemptId,
    verificationRunId: current.verificationRunId,
    verificationReceiptId: current.verificationReceiptId,
    idempotencyKey: projectionKey,
    workOrderRevisionNumber: workOrder.currentRevisionNumber ?? 1,
    candidateRevision: current.candidateRevision,
    subjectDigest: current.exactIdentity?.verificationSubjectDigest,
    verificationContractDigest: workOrder.verificationContractDigest,
    verificationSubjectDigest: current.exactIdentity?.verificationSubjectDigest,
    sourceAttemptId: current.sourceAttemptId,
    verificationAttemptId: current.verificationAttemptId,
    verificationPlanDigest: current.verificationPlanDigest,
    qualityContractDigest: workOrder.qualityContractDigest,
    executionManifestDigest: sourceAttempt?.executionManifestDigest,
    evidenceSetDigest: current.evidenceSetDigest,
    decisionInputDigest: qualityGateProjectionInputDigest(decisionInput),
    governancePolicyId: workOrder.governancePolicyId,
    state: qualityGateStateForCurrentEligibility(current),
    mode: "ENFORCED",
    reasons: current.reasons,
    blockingFindingIds: [],
    requiredApprovalIds: [],
    evaluatedAt: now,
    metadata: {
      projectionSource: "POLICY_V2_CURRENT_VERIFICATION",
      authoritative: false,
      ...(qualificationScope ? { qualificationScope, qualificationOnly: true, productionAuthority: "NONE" } : {}),
      canonicalDecision: decisionInput,
    },
  });
  return await ctx.db.get(qualityGateDecisionId);
}

function normalizeTuple(tuple: any) {
  if (!tuple) return undefined;
  return {
    workOrderId: String(tuple.workOrderId),
    workOrderRevisionNumber: tuple.workOrderRevisionNumber,
    verificationContractDigest: tuple.verificationContractDigest,
    sourceAttemptId: String(tuple.sourceAttemptId),
    verificationSubjectDigest: tuple.verificationSubjectDigest,
  };
}

function normalizeSubject(subject: any) {
  if (!subject) return undefined;
  const common = {
    ...subject,
    workOrderId: String(subject.workOrderId),
    sourceAttemptId: String(subject.sourceAttemptId),
  };
  if (subject.kind === "GIT_CANDIDATE") {
    return { ...common, repositoryId: String(subject.repositoryId) };
  }
  return {
    ...common,
    automationWorkflowRunId: String(subject.automationWorkflowRunId),
    automationDefinitionId: String(subject.automationDefinitionId),
    outputSnapshotArtifactId: String(subject.outputSnapshotArtifactId),
    outputArtifactIds: subject.outputArtifactIds.map(String),
  };
}
