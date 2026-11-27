import { evaluateVerificationDecision } from "@mission-control/workflow-engine/verification-decision";
import { normalizePolicyV2VerificationResults } from "./policyV2Verification";
import { verificationValidUntil, DEFAULT_GOVERNANCE_POLICY } from "./workOrderRevision";

export async function persistPolicyV2Evaluation(ctx: any, input: {
  workOrder: any; plan: any; packet: any; evidenceIdsByCheck: Map<string, any[]>;
  evidenceEnvelopeIds: any[]; evidenceInputs: any[]; independence: any; isolation?: any;
  verificationRun: any; run: any; sourceAttempt: any; now: number; ownerId: string;
  receiptMetadata: any; criterionMetadata: any;
}) {
  const { workOrder, plan, packet, evidenceIdsByCheck, evidenceEnvelopeIds, evidenceInputs,
    independence, isolation, verificationRun, run, sourceAttempt, now, ownerId, receiptMetadata, criterionMetadata } = input;
    const normalizedResults = normalizePolicyV2VerificationResults({
      workOrder,
      plan,
      packetChecks: packet.checks,
      evidenceIdsByCheck,
    });
    const decision = evaluateVerificationDecision({
      plan,
      evidence: evidenceInputs,
      runStatus: "COMPLETED",
      independence: independence as any,
      requireHumanReview: workOrder.verificationContract.requireHumanReview,
      evaluatedAt: now,
    });
    await ctx.db.patch(verificationRun._id, {
      status: "COMPLETED",
      checks: normalizedResults.checks,
      criterionCoverage: normalizedResults.criterionCoverage,
      coverage: decision.coverage,
      requirementsPassed: decision.passedRequirementIds.length,
      requirementsFailed: decision.failedRequirementIds.length + decision.uncoveredRequirementIds.length,
      violations: [...decision.failedRequirementIds, ...decision.uncoveredRequirementIds, ...decision.uncoveredRiskIds],
      verdict: decision.verdict ?? undefined,
      verdictReasons: decision.reasons,
      independence: independence as any,
      independenceValid: independence.passed,
      decisionInputDigest: decision.decisionInputDigest,
      isolationAttestation: isolation,
      completedAt: now,
      durationMs: Math.max(0, now - verificationRun.startedAt),
      evaluatedAt: now,
    });
    const validUntil = verificationValidUntil(DEFAULT_GOVERNANCE_POLICY, now);
    const receiptId = await ctx.db.insert("verificationReceipts", {
      tenantId: run.tenantId,
      projectId: run.projectId,
      missionId: run.missionId,
      workOrderId: workOrder._id,
      receiptScope: "WORK_ORDER",
      workflowRunId: run._id,
      verificationRunId: verificationRun._id,
      sourceAttemptId: sourceAttempt._id,
      verificationAttemptId: run._id,
      verificationSubjectId: verificationRun.verificationSubjectId,
      verificationSubjectDigest: verificationRun.verificationSubjectDigest,
      verificationContractDigest: verificationRun.verificationContractDigest,
      verificationPlanId: plan.planId,
      verificationPlanDigest: plan.planDigest,
      workOrderRevisionNumber: workOrder.currentRevisionNumber ?? 1,
      idempotencyKey: `policy-v2-receipt:${String(verificationRun._id)}`,
      verificationMethod: "COMMAND",
      commandOrCheck: "Frozen policy-v2 Verification Plan",
      result: decision.reasons.join(" "),
      verifier: `service:${ownerId}`,
      status: decision.verdict === "VERIFIED" ? "PASSED" : decision.verdict === "REQUIRES_HUMAN_REVIEW" ? "PENDING" : "FAILED",
      evidenceEnvelopeIds,
      verdict: decision.verdict ?? undefined,
      independenceValid: independence.passed,
      decisionInputDigest: decision.decisionInputDigest,
      verdictReasons: decision.reasons,
      checks: normalizedResults.checks,
      criterionCoverage: normalizedResults.criterionCoverage,
      requirementsPassed: decision.passedRequirementIds.length,
      requirementsFailed: decision.failedRequirementIds.length + decision.uncoveredRequirementIds.length,
      violations: [...decision.failedRequirementIds, ...decision.uncoveredRequirementIds, ...decision.uncoveredRiskIds],
      approvalRequirements: workOrder.requiredApprovals,
      riskLevel: workOrder.riskLevel,
      riskReasons: workOrder.riskReasons,
      sourceRevision: sourceAttempt.executionBaseSha ?? packet.sourceRevision,
      candidateRevision: packet.candidateRevision,
      validUntil,
      recordedAt: now,
      metadata: receiptMetadata,
    });
    for (const criterion of workOrder.acceptanceCriteria) {
      const criterionEvidence = normalizedResults.checks.filter((check: any) => check.acceptanceCriterionIds.includes(criterion.id));
      const coverage = normalizedResults.criterionCoverage.find((item: any) => item.criterionId === criterion.id);
      await ctx.db.insert("verificationReceipts", {
        tenantId: run.tenantId,
        projectId: run.projectId,
        missionId: run.missionId,
        workOrderId: workOrder._id,
        receiptScope: "ACCEPTANCE_CRITERION",
        acceptanceCriterionId: criterion.id,
        workflowRunId: run._id,
        verificationRunId: verificationRun._id,
        sourceAttemptId: sourceAttempt._id,
        verificationAttemptId: run._id,
        verificationSubjectId: verificationRun.verificationSubjectId,
        verificationSubjectDigest: verificationRun.verificationSubjectDigest,
        verificationContractDigest: verificationRun.verificationContractDigest,
        verificationPlanId: plan.planId,
        verificationPlanDigest: plan.planDigest,
        workOrderRevisionNumber: workOrder.currentRevisionNumber ?? 1,
        idempotencyKey: `policy-v2-criterion:${String(verificationRun._id)}:${criterion.id}`,
        verificationMethod: criterion.verificationMethod,
        commandOrCheck: criterionEvidence.map((check: any) => check.checkId).join(", "),
        result: decision.reasons.join(" "),
        verifier: `service:${ownerId}`,
        status: decision.verdict === "VERIFIED" && coverage?.status === "EVIDENCED" ? "PASSED" : "FAILED",
        evidenceEnvelopeIds: coverage?.evidenceIds ?? [],
        verdict: decision.verdict ?? undefined,
        independenceValid: independence.passed,
        decisionInputDigest: decision.decisionInputDigest,
        verdictReasons: decision.reasons,
        sourceRevision: sourceAttempt.executionBaseSha ?? packet.sourceRevision,
        candidateRevision: packet.candidateRevision,
        validUntil,
        recordedAt: now,
        metadata: { ...criterionMetadata, workOrderReceiptId: receiptId },
      });
    }
  return { decision, receiptId, normalizedResults, validUntil };
}
