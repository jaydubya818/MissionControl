import type { MutationCtx } from '../_generated/server';
import type { Doc, Id } from '../_generated/dataModel';
import { sha256Hex } from '../../packages/shared/src/canonicalDigest';
import { enterpriseDigest } from '../../packages/shared/src/sofieEnterprise';
import { enterpriseMissionOwner } from './enterpriseMissionOwner';
import { enterprisePlanApprovedByOwner } from './enterpriseDelegationAdmission';
import { getCurrentVerificationRoutingOutcome } from './currentVerification';
import { missionReceiptMatchesExecution } from './missionExecution';
import { evaluateMissionAcceptance } from './missionGovernance';
import { scopeAttemptExposures } from './enterpriseAttemptAccounting';

const denied = (): never => { throw Error('ENTERPRISE_RESULT_BINDING'); };
export async function resultMissionScope(ctx: MutationCtx, connection: Pick<Doc<'enterpriseAppConnections'>, 'ownerId'|'projectId'|'tenantId'>, missionId: Id<'missions'>) {
  const mission = await ctx.db.get(missionId);
  if (!mission || mission.projectId !== connection.projectId || mission.tenantId !== connection.tenantId
    || await enterpriseMissionOwner(ctx, mission) !== connection.ownerId || !mission.currentPlanId) return denied();
  const plan = await ctx.db.get(mission.currentPlanId);
  if (!plan || plan.missionId !== mission._id || plan.projectId !== connection.projectId || plan.tenantId !== connection.tenantId
    || !await enterprisePlanApprovedByOwner(ctx, plan, connection.ownerId)) return denied();
  return { mission, plan, scope: { missionId: mission._id, planId: plan._id, planRevision: plan.revisionNumber, planDigest: enterpriseDigest(plan) } };
}

/** Read projection only. Stored gate projections and narrative summaries never establish PASS. */
export async function projectEnterpriseResult(ctx: MutationCtx, connection: Doc<'enterpriseAppConnections'>, missionId: Id<'missions'>, expectedPlanDigest: string) {
  if (!connection.resultScope || connection.resultScope.missionId !== missionId) return denied();
  const { mission, plan, scope } = await resultMissionScope(ctx, connection, missionId);
  if (enterpriseDigest(scope) !== enterpriseDigest(connection.resultScope) || scope.planDigest !== expectedPlanDigest) throw Error('ENTERPRISE_PLAN_STALE');
  const now = Date.now();
  const scoped = (row: any) => row && row.tenantId === connection.tenantId && row.projectId === connection.projectId && row.missionId === missionId;
  const [workOrders, assertions, handoffRows] = await Promise.all([
    ctx.db.query('workOrders').withIndex('by_mission', q => q.eq('missionId', missionId)).take(101),
    ctx.db.query('validationAssertions').withIndex('by_mission', q => q.eq('missionId', missionId)).take(101),
    ctx.db.query('missionHandoffs').withIndex('by_mission', q => q.eq('missionId', missionId)).order('desc').take(501),
  ]);
  if (workOrders.length > 100 || assertions.length > 100 || handoffRows.length > 500 || ![...workOrders,...assertions,...handoffRows].every(scoped)) return denied();
  const handoffs = [...new Map([...handoffRows].sort((a,b) => a.createdAt-b.createdAt).map(h => [h.workOrderId,h])).values()];
  const acceptance = evaluateMissionAcceptance({
    assertions: assertions.map(a => ({id:a.assertionId,status:a.status,requiresIndependentValidation:a.requiresIndependentValidation,
      validatorRunId:a.validatorWorkflowRunId,verificationReceiptId:a.verificationReceiptId,waiverApprovalId:a.waiverApprovalDecisionId})),
    workOrders: workOrders.map(w => ({id:w._id,state:w.state})),
    handoffs: handoffs.map(h => ({workOrderId:h.workOrderId,outcome:h.outcome,incompleteAssertionIds:h.incompleteAssertionIds,unknownAssertionIds:h.unknownAssertionIds})),
  });
  const reasons = [...acceptance.blockingReasons];
  const sameSet = (a: string[], b: string[]) => new Set(a).size === a.length && new Set(b).size === b.length && a.length === b.length && a.every(id => b.includes(id));
  if (!workOrders.length || !assertions.length || !sameSet(plan.releasedWorkOrderIds ?? [], workOrders.map(w=>w._id))
    || !sameSet(plan.workOrderBlueprints.map(b=>b.id),workOrders.map(w=>w.metadata?.missionBlueprintId))
    || !sameSet((plan.assertions ?? []).map(a=>a.assertionId),assertions.map(a=>a.assertionId))) reasons.push('APPROVED_PLAN_COVERAGE_INCOMPLETE');
  if (!['AWAITING_ACCEPTANCE','DONE'].includes(mission.state)) reasons.push('MISSION_NOT_COMPLETE');
  let freshUntil = Math.min(now+60000, connection.expiresAt);
  const results: any[] = [];
  // Independent read-only gates share this authorized transaction and captured
  // time. Await all before emitting any proof; preserve WorkOrder order below.
  const gates = await Promise.all(workOrders.map(wo => {
    if (wo.missionPlanId !== plan._id || wo.missionPlanRevision !== plan.revisionNumber || wo.qualityContractDigest !== plan.qualityContractDigest
      || !wo.currentRevisionId || wo.verificationContract?.schemaVersion !== 2 || wo.verificationContract.enforcementMode !== 'ENFORCED') return null;
    return getCurrentVerificationRoutingOutcome(ctx, wo, now, 'ACCEPTANCE', true, {ownerId:connection.ownerId,missionId,planId:plan._id,planDigest:scope.planDigest});
  }));
  for (const [index, wo] of workOrders.entries()) {
    const gate = gates[index];
    if (!gate) { reasons.push('WORK_ORDER_PLAN_OR_CONTRACT_CHANGED'); continue; }
    if (!gate.eligible || !gate.current || gate.verifiedOutcome !== 'SUCCESS' || !gate.sourceAttemptId || !gate.verificationAttemptId || !gate.verificationReceiptId || !gate.evidenceSetDigest) {
      reasons.push('CURRENT_INDEPENDENT_VERIFICATION_REQUIRED: '+wo._id+': '+gate.reasons.join('; ').slice(0,350)); continue;
    }
    const source = await ctx.db.get(gate.sourceAttemptId as Id<'workflowRuns'>);
    const verifier = await ctx.db.get(gate.verificationAttemptId as Id<'workflowRuns'>);
    const receipt = await ctx.db.get(gate.verificationReceiptId as Id<'verificationReceipts'>);
    const handoff = handoffs.find(h=>h.workOrderId===wo._id);
    if (!scoped(source) || !scoped(verifier) || !scoped(receipt) || !source || !verifier || !receipt
      || source.workOrderId !== wo._id || verifier.workOrderId !== wo._id || source._id === verifier._id
      || source.workOrderRevisionId !== wo.currentRevisionId || verifier.workOrderRevisionId !== wo.currentRevisionId
      || source.status !== 'COMPLETED' || verifier.status !== 'COMPLETED'
      || !handoff || handoff.workflowRunId !== source._id || handoff.outcome !== 'COMPLETE') return denied();
    const reservation = (source.executionCostAuthorization as any)?.enterprise;
    if (!reservation || reservation.ownerId !== connection.ownerId || !source.enterpriseSettlement
      || scopeAttemptExposures([source,verifier]).some(v=>v!==0)) { reasons.push('SETTLEMENT_REQUIRED'); continue; }
    if (source.enterpriseSettlement.basis !== 'DETERMINISTIC_ENGINEERING_ZERO_CHARGE'
      || (reservation.provider === 'local-docker' && source.enterpriseSettlement.proofDigest !== verifier.enterpriseAccountingParent?.resultDigest)) {
      reasons.push('EXECUTED_SETTLEMENT_PROOF_MISMATCH'); continue;
    }
    const artifacts = await Promise.all(handoff.artifactIds.map(id=>ctx.db.get(id)));
    if (!artifacts.length || artifacts.length > 100 || artifacts.some(a=>!scoped(a) || a?.workOrderId!==wo._id || a.workflowRunId!==source._id)) return denied();
    const evidence = await Promise.all((receipt.evidenceEnvelopeIds ?? []).map(id=>ctx.db.get(id)));
    if (!evidence.length || evidence.length > 100 || evidence.some(e=>!scoped(e) || e?.workOrderId!==wo._id
      || e.sourceAttemptId!==source._id || e.verificationAttemptId!==verifier._id)) return denied();
    for (const e of evidence) {
      const custodyExpiry = e?.metadata?.nativeCandidateObservation?.expiresAt ?? e?.metadata?.custodyObservation?.expiresAt;
      if (typeof custodyExpiry === 'number') freshUntil = Math.min(freshUntil,custodyExpiry);
      if (reservation.provider === 'local-docker' && e?.metadata?.resultDigest !== source.enterpriseSettlement.proofDigest) return denied();
    }
    if (receipt.validUntil) freshUntil = Math.min(freshUntil,receipt.validUntil);
    let producerInvocationId = source.executorInvocationId ?? null;
    if (reservation.provider === 'local-docker') {
      const retained = artifacts.find(a=>a?.metadata?.authenticatedResponse);
      const bundle = retained?.metadata?.authenticatedResponse?.envelope?.payload?.result;
      if (typeof bundle?.encoded !== 'string' || bundle.encoded.length > 256000) return denied();
      const bytes = Uint8Array.from(atob(bundle.encoded), c=>c.charCodeAt(0));
      if ('sha256:'+sha256Hex(bytes) !== source.enterpriseSettlement.proofDigest) return denied();
      const signed = JSON.parse(new TextDecoder().decode(bytes));
      if (signed.execution?.factoryVersion !== reservation.factoryVersion || signed.localExecution?.ownerScope !== connection.ownerId
        || signed.candidate?.commit !== gate.candidateRevision || signed.localExecution.verifierAllocation !== verifier.executorInvocationId
        || signed.localExecution.verifierAllocation !== verifier.metadata?.verifierAllocation
        || signed.localExecution.producerAllocation !== verifier.metadata?.producerAllocation
        || signed.localExecution.producerAllocation === signed.localExecution.verifierAllocation
        || verifier.metadata?.factoryVersion !== reservation.factoryVersion || verifier.factoryDefinitionVersionId
        || verifier.metadata?.observationOnly !== true || verifier.metadata?.evaluationMode !== 'IMPORTED_SIGNED_FACTORY_EVIDENCE') return denied();
      producerInvocationId = signed.localExecution.producerAllocation;
    }
    results.push({ workOrderId:wo._id, revisionId:wo.currentRevisionId, revision:wo.currentRevisionNumber ?? 1,
      sourceAttemptId:source._id, verificationAttemptId:verifier._id, candidate:gate.candidateRevision,
      producerInvocationId, provider:reservation.provider, factoryVersion:reservation.factoryVersion, factoryDefinitionVersionId:source.factoryDefinitionVersionId,
      verifierFactoryDefinitionVersionId:verifier.factoryDefinitionVersionId ?? null,
      verifierFactoryVersion:verifier.factoryConfigurationDigest ?? verifier.metadata?.factoryVersion, verifierInvocationId:verifier.executorInvocationId,
      runtimeImage:source.enterpriseSettlement.nativeUsage?.runtimeImage ?? null,
      qualityContractDigest:wo.qualityContractDigest, verificationContractDigest:wo.verificationContractDigest,
      verificationRunId:gate.verificationRunId, verificationReceiptId:receipt._id, verificationPlanDigest:gate.verificationPlanDigest,
      evidenceSetDigest:gate.evidenceSetDigest, evidenceIds:evidence.map(e=>e!._id),
      reservationDigest:reservation.digest, settlementDigest:source.enterpriseSettlement.digest, proofDigest:source.enterpriseSettlement.proofDigest,
      verifierSettlementDigest:verifier.enterpriseSettlement?.digest ?? null, handoffId:handoff._id,
      artifactIds:handoff.artifactIds, gate:'PASS', independentlyVerified:true });
  }
  const assertionProofs = [];
  for (const assertion of assertions) {
    const proof = assertion.verificationReceiptId && await ctx.db.get(assertion.verificationReceiptId);
    const result = results.find(r=>r.verificationAttemptId===assertion.validatorWorkflowRunId && assertion.linkedWorkOrderIds.includes(r.workOrderId));
    const verifier = result && await ctx.db.get(result.verificationAttemptId as Id<'workflowRuns'>);
    const wo = result && workOrders.find(w=>w._id===result.workOrderId);
    if (assertion.status !== 'PASS' || !proof || !scoped(proof) || !result || !verifier || !wo
      || proof.status !== 'PASSED' || proof.validationAssertionId !== assertion._id || proof.acceptanceCriterionId !== assertion.assertionId
      || !missionReceiptMatchesExecution({workOrder:wo,workflowRun:verifier,verificationReceipt:proof})
      || proof.sourceAttemptId !== result.sourceAttemptId || proof.verificationRunId !== result.verificationRunId
      || proof.verificationPlanDigest !== result.verificationPlanDigest || proof.verificationContractDigest !== result.verificationContractDigest
      || proof.candidateRevision !== result.candidate || !proof.evidenceEnvelopeIds?.length
      || proof.evidenceEnvelopeIds.some(id=>!result.evidenceIds.includes(id)) || !proof.validUntil || proof.validUntil <= now) {
      reasons.push('ASSERTION_VERIFICATION_BINDING_CHANGED'); continue;
    }
    freshUntil = Math.min(freshUntil,proof.validUntil);
    assertionProofs.push({assertionId:assertion.assertionId,workOrderId:wo._id,verificationReceiptId:proof._id,verificationAttemptId:verifier._id});
  }
  if (results.length !== workOrders.length) reasons.push('COMPLETE_RESULT_COVERAGE_REQUIRED');
  if (freshUntil <= now) reasons.push('EVIDENCE_EXPIRED');
  const available = !reasons.length;
  return { schema:'enterprise-result-projection/v1', scope:'ISOLATED_DETERMINISTIC', missionId, ownerId:connection.ownerId,
    tenantId:connection.tenantId, projectId:connection.projectId, plan:scope,
    qualityContract:{revision:plan.revisionNumber,digest:plan.qualityContractDigest},
    status:available?'AVAILABLE':'NOT_AVAILABLE', enterpriseQualityGate:available?'PASS':'NOT_ESTABLISHED',
    ownerAcceptance:mission.state==='DONE'?'ACCEPTED':'PENDING', observedAt:now, freshUntil:available?freshUntil:Math.min(now+60000,connection.expiresAt),
    reasons:[...new Set(reasons)], assertions:available?assertionProofs:[], workOrders:available?results:[], executionAuthority:'NONE',
    explanation:available?'Independent verification and settlement are current for the exact approved Plan. Owner acceptance is a separate decision. Isolated qualification only.':
      'A completed enterprise Result is not currently established. Stored success and narrative summaries do not establish PASS.' };
}
