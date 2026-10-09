import { canonicalDigest } from "@mission-control/shared";
import { createGitVerificationSubject } from "@mission-control/workflow-engine/verification-subject";
import { verificationContractDigest } from "@mission-control/workflow-engine/verification-identity";
import { deriveSignedFactoryVerificationIndependence } from "@mission-control/workflow-engine/verification-independence";
import { compilePolicyV2VerificationPlan } from "./policyV2Verification";
import { persistPolicyV2Evaluation } from "./policyV2EvaluationPersistence";
import { getCurrentVerificationRoutingOutcome, appendCurrentVerificationQualityGateDecision } from "./currentVerification";
import { enterpriseProject } from "./enterpriseAttemptAccounting";

export async function ingestEnterpriseQualityGate(ctx: any, input: {
  workOrder: any; run: any; binding: any; trial: any; args: any; outcome: any; artifactId: any; now: number;
}) {
  const { workOrder: wo, run: source, binding: b, trial, args, outcome, artifactId, now } = input;
  const observation = args.custodyObservation;
  const wire = args.authenticatedResponse?.envelope;
  if (!wire || wire.protocol !== "MISSIONCONTROL_MYFACTORY_FIXTURE_V1" || wire.operation !== "RESULT"
    || wire.tenantId !== b.tenantId || wire.projectId !== b.projectId || wire.factoryId !== b.factoryId
    || wire.bindingDigest !== trial.bindingDigest || wire.payload?.state !== "COMPLETED"
    || `sha256:${wire.payload?.result?.manifestDigest}` !== args.resultDigest
    || canonicalDigest("enterprise-custody-observation/v1", wire.payload?.observation)
      !== canonicalDigest("enterprise-custody-observation/v1", observation)
    || !/^[a-f0-9]{64}$/.test(args.authenticatedResponse.signature)) throw Error("ENTERPRISE_RETAINED_PROOF_DENIED");
  const authenticatedResponseDigest = canonicalDigest("enterprise-authenticated-readback/v1", args.authenticatedResponse);
  if (!await enterpriseProject(ctx, wo.projectId) || wo.verificationContract?.schemaVersion !== 2
    || wo.verificationContract.enforcementMode !== "ENFORCED" || !wo.requirements?.length
    || wo.verificationContractDigest !== verificationContractDigest(wo.verificationContract, wo.qualityContractDigest)
    || !args.authenticatedResponse || !observation || observation.bindingDigest !== trial.bindingDigest || observation.resultDigest !== args.resultDigest
    || observation.candidateCommit !== args.candidateCommit || observation.candidateTree !== args.candidateTree
    || !Number.isSafeInteger(observation.observedAt) || observation.observedAt > now
    || !Number.isSafeInteger(observation.expiresAt) || observation.expiresAt <= now
    || observation.expiresAt > observation.observedAt + 60000
    || !Number.isSafeInteger(args.executionStartedAt) || args.executionStartedAt > observation.observedAt
    || args.executionStartedAt < b.issuedAt) throw Error("ENTERPRISE_GATE_AUTHORITY_DENIED");
  const subject = createGitVerificationSubject({ version: 1, kind: "GIT_CANDIDATE", provider: "LOCAL_GIT",
    workOrderId: String(wo._id), workOrderRevisionNumber: b.workOrderRevisionNumber,
    verificationContractDigest: wo.verificationContractDigest, sourceAttemptId: String(source._id),
    repositoryId: b.repositoryId, candidateSha: args.candidateCommit, treeSha: args.candidateTree,
    localRef: { baseRef: b.baseCommit, headRef: args.candidateCommit, headSha: args.candidateCommit } });
  const tuple = { workOrderId: wo._id, workOrderRevisionNumber: b.workOrderRevisionNumber,
    verificationContractDigest: wo.verificationContractDigest, sourceAttemptId: source._id,
    verificationSubjectDigest: subject.digest };
  const scope = { tenantId: wo.tenantId, projectId: wo.projectId, missionId: wo.missionId, workOrderId: wo._id };
  const verificationAttemptId = await ctx.db.insert("workflowRuns", { ...scope,
    runId: `${b.delegationId}:observed-verifier`, workflowId: "signed-factory-verifier-observation",
    workOrderRevisionId: source.workOrderRevisionId, workOrderRevisionNumber: b.workOrderRevisionNumber,
    attemptPurpose: "VERIFICATION", status: "COMPLETED", currentStepIndex: 0, totalSteps: 0, steps: [],
    context: {}, initialInput: "Authenticated external verifier observation", spentUsd: 0, reservedCostUsd: 0,
    executionPhase: "TERMINAL", completedAt: now, startedAt: args.executionStartedAt,
    qualityContractDigest: b.qualityContractDigest, verificationContractDigest: wo.verificationContractDigest,
    repositoryId: b.repositoryId, executionManifestDigest: b.executionManifestDigest,
    executionProfileDigest: b.executionProfileDigest, executorInvocationId: args.verifierSessionId,
    verificationAttemptBinding: { ...tuple, verificationSubject: subject },
    enterpriseAccountingParent: { workflowRunId: source._id, reservationDigest: source.executionCostAuthorization.enterprise.digest,
      bindingDigest: trial.bindingDigest, resultDigest: args.resultDigest },
    metadata: { signedFactoryResultDigest: args.resultDigest, signedFactoryExecutionStartedAt: args.executionStartedAt,
      observationOnly: true, factoryVersion: b.factoryVersion, producerAllocation: args.producerSessionId,
      verifierAllocation: args.verifierSessionId, evaluationMode: "IMPORTED_SIGNED_FACTORY_EVIDENCE" } });
  const plan = compilePolicyV2VerificationPlan({ now, workOrder: wo, sourceAttempt: source,
    verificationAttemptId, verificationSubject: subject, factoryDefinitionId: trial.factoryDefinitionId,
    factoryDefinitionVersionId: source.factoryDefinitionVersionId, executorInvocationId: args.verifierSessionId });
  const verificationRunId = await ctx.db.insert("verificationRuns", { ...scope, ...tuple,
    workflowRunId: verificationAttemptId, idempotencyKey: `${b.delegationId}:enterprise-evaluation`,
    engineVersion: "policy-v2-imported-factory-evaluation", verificationSubject: subject,
    verificationSubjectId: subject.subjectId, verificationPlan: plan, verificationPlanId: plan.planId,
    verificationPlanDigest: plan.planDigest, sourceRevision: b.baseCommit, candidateRevision: args.candidateCommit,
    status: "PLANNED", checks: [], criterionCoverage: [], requirementsPassed: 0, requirementsFailed: 0,
    violations: [], approvalRequirements: wo.requiredApprovals ?? [], riskLevel: wo.riskLevel, riskReasons: wo.riskReasons ?? [],
    verdictReasons: [], startedAt: now, createdAt: now });
  const verificationRun = await ctx.db.get(verificationRunId), run = await ctx.db.get(verificationAttemptId);
  const independence = deriveSignedFactoryVerificationIndependence({ expected: { ...tuple, verificationAttemptId,
    verificationRunId, verificationSubjectId: subject.subjectId, verificationPlanId: plan.planId, verificationPlanDigest: plan.planDigest },
    subject, sourceAttemptId: source._id, verificationAttemptId, verificationRun: { ...verificationRun, id: verificationRunId },
    factoryVersion: b.factoryVersion, expectedFactoryVersion: b.factoryVersion,
    bindingDigest: args.bindingDigest, expectedBindingDigest: trial.bindingDigest, resultDigest: args.resultDigest,
    producerAllocation: args.producerSessionId, verifierAllocation: args.verifierSessionId,
    candidateCommit: args.candidateCommit, candidateTree: args.candidateTree, cleanupConfirmed: args.cleanupConfirmed,
    authorityStatus: outcome.checks.find((c: any) => c.checkId === "factory-verification-authority")?.status,
    isolatedQualification: true });
  const evidenceEnvelopeIds: any[] = [], evidenceIdsByCheck = new Map<string, any[]>(), evidenceInputs: any[] = [];
  for (const check of outcome.checks) {
    const required = plan.requiredEvidence.find(item => item.id === check.checkId);
    if (!required) throw Error("ENTERPRISE_UNPLANNED_CHECK");
    const evidenceId = await ctx.db.insert("evidenceEnvelopes", { ...scope, ...tuple,
      workflowRunId: verificationAttemptId, verificationRunId, verificationAttemptId,
      verificationSubjectId: subject.subjectId, verificationPlanId: plan.planId, verificationPlanDigest: plan.planDigest,
      idempotencyKey: `${b.delegationId}:${check.checkId}`, evidenceKey: `${args.resultDigest}:${check.checkId}`,
      checkId: check.checkId, category: check.category === "UNIT_TEST" ? "TEST_RESULT" : "POLICY_RESULT",
      result: check.status, summary: check.summary, acceptanceCriterionIds: check.acceptanceCriterionIds,
      requirementIds: required.requirementIds, requiredRiskIds: required.requiredRiskIds, requiredEvidenceIds: [required.id],
      producer: { actorType: "SERVICE", actorId: b.ownerScope, role: check.verifierId === args.verifierSessionId ? "SIGNED_FACTORY_VERIFIER" : "MISSIONCONTROL_POLICY_EVALUATOR", independent: independence.passed,
        attemptId: verificationAttemptId, ...(check.verifierId === args.verifierSessionId ? { executorInvocationId: args.verifierSessionId } : {}) },
      independence, artifactIds: [artifactId], artifactReferences: [], sourceRevision: b.baseCommit,
      candidateRevision: args.candidateCommit, contentHash: args.evidenceDigest, provenance: "SYNTHETIC", recordedAt: now,
      metadata: { authority: "ISOLATED_ENTERPRISE_QUALIFICATION", resultDigest: args.resultDigest,
        trialId: trial._id, bindingDigest: trial.bindingDigest, factoryVersion: b.factoryVersion,
        custodyObservation: observation, authenticatedResponseDigest, evaluationMode: "IMPORTED_SIGNED_FACTORY_EVIDENCE" } });
    evidenceEnvelopeIds.push(evidenceId); evidenceIdsByCheck.set(check.checkId, [evidenceId]);
    evidenceInputs.push({ id: String(evidenceId), requiredEvidenceIds: [required.id], requirementIds: required.requirementIds,
      requiredRiskIds: required.requiredRiskIds, discoveredRiskIds: [], materializedRiskIds: [],
      conclusion: check.status === "PASS" ? "PASSED" : check.status === "FAIL" ? "FAILED" : "UNAVAILABLE",
      usable: ["PASS", "FAIL"].includes(check.status) });
  }
  await persistPolicyV2Evaluation(ctx, { workOrder: wo, plan, packet: { checks: outcome.checks,
    sourceRevision: b.baseCommit, candidateRevision: args.candidateCommit }, evidenceIdsByCheck, evidenceEnvelopeIds,
    evidenceInputs, independence, verificationRun, run, sourceAttempt: source, now, ownerId: b.ownerScope,
    receiptMetadata: { policyVersion: 2, authority: "ISOLATED_ENTERPRISE_QUALIFICATION", resultDigest: args.resultDigest, authenticatedResponseDigest },
    criterionMetadata: { policyVersion: 2, authority: "ISOLATED_ENTERPRISE_QUALIFICATION" } });
  await ctx.db.patch(source._id, { status: "COMPLETED", completedAt: now, lease: undefined, executionPhase: "TERMINAL",
    attemptPurpose: "IMPLEMENTATION", qualityContractDigest: b.qualityContractDigest, verificationSubject: subject,
    repositoryId: b.repositoryId, candidateReadyAt: now });
  const current = await getCurrentVerificationRoutingOutcome(ctx, wo, now, "ACCEPTANCE", true);
  const gate = await appendCurrentVerificationQualityGateDecision(ctx, wo, current, b.delegationId, now);
  return gate._id;
}
