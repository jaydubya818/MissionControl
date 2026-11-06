import type { MutationCtx } from '../_generated/server';
import { enterpriseDigest } from '../../packages/shared/src/sofieEnterprise';
import { canonicalPermitJson } from '../../packages/shared/src/executionPermit';
import {
  asPrincipal, CONFIRMED_JOURNEY_MS, confirmationDigest, confirmationInstallation, confirmedIdentity, parseConfirmationBinding, refuse,
  requireConfirmationFresh, requireOwnConfirmation, verifyConfirmedPlan, type ConfirmationBinding, type ConfirmationInstallation,
} from './sofieConfirmation';

/**
 * The EXISTING MissionControl mutation handlers the bridge runs, each under the confirmed principal's identity. Production wiring
 * (convex/sofieConfirmationState.ts) passes the registered functions' own handlers; tests pass recording stubs.
 */
export type ConfirmationHandlers = {
  decide(ctx: any, args: any): Promise<any>;            // sofieEnterprise:decide            (owner)
  submit(ctx: any, args: any): Promise<any>;            // sofieEnterprise:apply             (Sofie application, HMAC service command)
  updateDraft(ctx: any, args: any): Promise<any>;       // missions:updateDraft              (owner)
  assignMissionMember(ctx: any, args: any): Promise<any>; // softwareFactoryControlPlane:assignMissionMember (owner)
  savePlanDraft(ctx: any, args: any): Promise<any>;     // missions:savePlanDraft            (planner)
  submitPlan(ctx: any, args: any): Promise<any>;        // missions:submitPlan               (planner)
  approvePlan(ctx: any, args: any): Promise<any>;       // missions:approvePlan              (owner)
  approvePrepared(ctx: any, args: any): Promise<any>;   // sofieExecutionPermitState:approvePrepared (owner)
};
export type SignedConfirmationInput = { binding: unknown; keyId: string; signature: string };
export const CONFIRMED_BY_SOFIE = 'confirmed-by-sofie' as const;

function requireEnrolledKey(installation: ConfirmationInstallation, keyId: string, now: number) {
  const key = installation.keys.find(k => k.keyId === keyId);
  if (!key || key.revokedAt !== null || key.activeFrom > now || key.notAfter <= now) return refuse('CONFIRMATION_KEY_NOT_ENROLLED');
}

async function liveOwnConfirmation(ctx: MutationCtx, binding: ConfirmationBinding, installation: ConfirmationInstallation) {
  const connection: any = await ctx.db.get(binding.connectionId as any);
  if (!connection || connection.revokedAt !== undefined || connection.expiresAt <= Date.now()) return refuse('CONNECTION_NOT_LIVE');
  const owner: any = await ctx.db.get(connection.ownerId);
  const enrollment = requireOwnConfirmation(binding, installation, connection.installedEnrollment, connection, owner);
  return { connection, owner, enrollment };
}

/** Single-use claim inside the approving transaction: Convex mutations are serializable, so of two concurrent claims exactly one commits. */
async function claim(ctx: MutationCtx, row: { installationId: string; nonce: string; confirmationDigest: string; step: 'PLAN' | 'PERMIT'; workId: string;
  subject: string; keyId: string; signature: string; connectionId: string }) {
  const sameNonce = await ctx.db.query('sofieConfirmationReceipts' as any).withIndex('by_installation_nonce', (q: any) => q.eq('installationId', row.installationId).eq('nonce', row.nonce)).collect();
  if (row.step === 'PLAN' ? sameNonce.length > 0 : sameNonce.some((r: any) => r.step === 'PERMIT' && r.workId === row.workId)) return refuse('CONFIRMATION_REPLAYED');
  const sameStep = await ctx.db.query('sofieConfirmationReceipts' as any).withIndex('by_digest_step_work', (q: any) => q.eq('confirmationDigest', row.confirmationDigest).eq('step', row.step).eq('workId', row.workId)).first();
  if (sameStep) return refuse('CONFIRMATION_REPLAYED');
  const now = Date.now();
  return ctx.db.insert('sofieConfirmationReceipts' as any, { ...row, status: 'CLAIMED', createdAt: now, updatedAt: now } as any);
}

export async function applyPlanConfirmation(ctx: MutationCtx, input: { confirmation: SignedConfirmationInput; submit: { envelope: any; payloadJson: string } }, h: ConfirmationHandlers) {
  const now = Date.now(), binding = parseConfirmationBinding(input.confirmation.binding);
  requireConfirmationFresh(binding, now);
  const installation = confirmationInstallation(binding.installationId);
  requireEnrolledKey(installation, input.confirmation.keyId, now);
  const digest = confirmationDigest(binding);
  const receiptId = await claim(ctx, { installationId: binding.installationId, nonce: binding.nonce, confirmationDigest: digest, step: 'PLAN', workId: '',
    subject: binding.subject, keyId: input.confirmation.keyId, signature: input.confirmation.signature, connectionId: binding.connectionId });
  const { connection, enrollment } = await liveOwnConfirmation(ctx, binding, installation);
  const proposal: any = await ctx.db.get(binding.proposalId as any);
  if (!proposal || proposal.connectionId !== connection._id || proposal.digest !== binding.proposalDigest || proposal.missionId !== undefined) return refuse('PROPOSAL_NOT_CONFIRMED');
  let submitRequest: any; try { submitRequest = JSON.parse(input.submit.payloadJson); } catch { return refuse('SUBMIT_COMMAND'); }
  if (submitRequest?.operation !== 'enterprise.submit' || submitRequest.connectionId !== binding.connectionId || submitRequest.proposalId !== binding.proposalId
    || submitRequest.proposalDigest !== binding.proposalDigest) return refuse('SUBMIT_COMMAND');
  const owner = asPrincipal(ctx, confirmedIdentity(binding.subject, enrollment));
  const planner = asPrincipal(ctx, confirmedIdentity(installation.planner.subject, enrollment));
  const projectId = connection.projectId, tag = `${CONFIRMED_BY_SOFIE}:${digest}`;
  // 1 Owner decision: authorize creation of exactly the confirmed Mission draft.
  await h.decide(owner, { projectId, connectionId: connection._id, proposalId: proposal._id, expectedDigest: binding.proposalDigest, decision: 'AUTHORIZE_DRAFT' });
  // Sofie application (its own HMAC service command, unchanged path) creates the draft.
  const submitted = await h.submit(ctx, input.submit);
  const missionId = submitted?.response?.missionId;
  const mission: any = missionId ? await ctx.db.get(missionId) : null;
  if (!mission || mission.ownerOperatorId !== connection.ownerId || mission.projectId !== projectId) return refuse('MISSION_NOT_CONFIRMED');
  // 2 Owner decision: scope the Mission to exactly the enrolled repository and code scope.
  await h.updateDraft(owner, { missionId, projectId, idempotencyKey: `${tag}:scope`, title: mission.title, objective: mission.objective, stopCondition: mission.stopCondition,
    ownerMemberId: connection.ownerMemberId, owningTeamId: connection.owningTeamId, repositoryId: installation.repositoryId, codeScopeIds: installation.codeScopeIds,
    ...(mission.constraints ? { constraints: mission.constraints } : {}) });
  // 3 Owner decision: delegate authorship of this Mission's Plan to the enrolled Sofie planner (time-boxed CONTRIBUTOR; never an approver).
  await h.assignMissionMember(owner, { tenantId: connection.tenantId, projectId, missionId, memberId: installation.planner.memberId, teamId: connection.owningTeamId,
    role: 'CONTRIBUTOR', expiresAt: Math.min(now + CONFIRMED_JOURNEY_MS, connection.expiresAt) });
  // The planner authors and submits exactly the confirmed specification; a PROPOSED Plan is immutable in MissionControl.
  const draft = await h.savePlanDraft(planner, { projectId, missionId, idempotencyKey: `${tag}:plan`, ...binding.plan });
  const planId = draft?.plan?._id ?? refuse('PLAN_NOT_AUTHORED');
  await h.submitPlan(planner, { projectId, missionId, planId, idempotencyKey: `${tag}:submit` });
  const at = { planId: String(planId), missionId: String(missionId), repository: binding.repository };
  const verifiedPlanDigest = verifyConfirmedPlan(await ctx.db.get(planId), binding.plan, { ...at, status: 'PROPOSED' });
  // 4 Owner decision: approve exactly the verified Plan, which releases one WorkOrder per confirmed Work.
  const approved = await h.approvePlan(owner, { projectId, missionId, planId, idempotencyKey: `${tag}:approve`,
    decisionReason: `${CONFIRMED_BY_SOFIE}: confirmation ${digest}; Sofie plan ${binding.planSha256}; verified MissionControl Plan ${verifiedPlanDigest}` });
  const approvedPlan: any = await ctx.db.get(planId);
  // approvePlan records the authenticated actor (the identity subject), so the approval must name exactly the confirmed person.
  if (verifyConfirmedPlan(approvedPlan, binding.plan, { ...at, status: 'APPROVED' }) !== verifiedPlanDigest || approvedPlan.approvedBy !== binding.subject
    || approved?.workOrders?.length !== binding.works.length) return refuse('PLAN_APPROVAL_MISMATCH');
  const workOrders = binding.works.map((work, index) => {
    const blueprintId = binding.plan.workOrderBlueprints[index]?.id;
    const wo = approved.workOrders.find((w: any) => (w.metadata?.missionBlueprintId ?? w.missionBlueprintId) === blueprintId);
    if (!wo?.currentRevisionId) return refuse('PLAN_WORKORDERS_INCOMPLETE');
    return { stage: work.stage, workId: work.id, workOrderId: String(wo._id), expectedWorkOrderRevisionId: String(wo.currentRevisionId) };
  });
  const planDigest = enterpriseDigest(approvedPlan);
  const result = { confirmationDigest: digest, connectionId: String(connection._id), proposalId: String(proposal._id), missionId: String(missionId),
    planId: String(planId), planDigest, verifiedPlanDigest, workOrders };
  await ctx.db.patch(receiptId, { status: 'APPLIED', ownerId: connection.ownerId, result, updatedAt: Date.now() } as any);
  await ctx.db.insert('missionEvents', { missionId, tenantId: connection.tenantId, projectId, eventType: 'SOFIE_CONFIRMATION_APPLIED', actorType: 'HUMAN',
    actorId: String(connection.ownerId), timestamp: Date.now(), idempotencyKey: `${tag}:applied`,
    summary: 'Owner confirmed this exact Plan in Sofie; MissionControl verified the confirmation and recorded each owner decision through its own checks',
    metadata: { approvalReason: CONFIRMED_BY_SOFIE, confirmationDigest: digest, installationId: binding.installationId, subject: binding.subject,
      keyId: input.confirmation.keyId, planSha256: binding.planSha256, planContentSha256: binding.planContentSha256, verifiedPlanDigest, planDigest,
      decisions: ['AUTHORIZE_DRAFT', 'SCOPE_MISSION_REPOSITORY', 'ASSIGN_PLANNER_CONTRIBUTOR', 'APPROVE_PLAN_RELEASE_WORKORDERS'], works: binding.works } } as any);
  return result;
}

export async function approveConfirmedPermit(ctx: MutationCtx, input: { confirmation: SignedConfirmationInput; requestId: string; workId: string }, h: ConfirmationHandlers) {
  const now = Date.now(), binding = parseConfirmationBinding(input.confirmation.binding);
  const installation = confirmationInstallation(binding.installationId);
  requireEnrolledKey(installation, input.confirmation.keyId, now);
  const digest = confirmationDigest(binding);
  // Only Work of an ACCEPTED confirmation, within its journey window (MissionControl permits themselves live at most 5 minutes).
  const plan: any = await ctx.db.query('sofieConfirmationReceipts' as any).withIndex('by_digest_step_work', (q: any) => q.eq('confirmationDigest', digest).eq('step', 'PLAN').eq('workId', '')).first();
  if (!plan || plan.status !== 'APPLIED' || plan.installationId !== binding.installationId || plan.nonce !== binding.nonce) return refuse('CONFIRMATION_NOT_ACCEPTED');
  if (now > plan.createdAt + CONFIRMED_JOURNEY_MS || now > binding.issuedAt + CONFIRMED_JOURNEY_MS) return refuse('CONFIRMATION_EXPIRED');
  const work = binding.works.find(w => w.id === input.workId) ?? refuse('WORK_NOT_CONFIRMED');
  const receiptId = await claim(ctx, { installationId: binding.installationId, nonce: binding.nonce, confirmationDigest: digest, step: 'PERMIT', workId: work.id,
    subject: binding.subject, keyId: input.confirmation.keyId, signature: input.confirmation.signature, connectionId: binding.connectionId });
  const { connection, enrollment } = await liveOwnConfirmation(ctx, binding, installation);
  const accepted = plan.result, wo = accepted.workOrders.find((w: any) => w.workId === work.id && w.stage === work.stage);
  const row: any = await ctx.db.get(input.requestId as any);
  const r = row?.request;
  if (!row || !wo || row.connectionId !== connection._id || row.projectId !== connection.projectId || String(row.missionId) !== accepted.missionId
    || enterpriseDigest(r) !== row.requestDigest || canonicalPermitJson(r.work) !== canonicalPermitJson({ id: work.id, version: work.version, generation: work.generation, tupleSha256: work.tupleSha256 })
    || r.expectedPlanDigest !== accepted.planDigest || String(r.workOrderId) !== wo.workOrderId || String(r.expectedWorkOrderRevisionId) !== wo.expectedWorkOrderRevisionId
    || String(r.proposalId) !== binding.proposalId || r.admission?.factoryVersion !== binding.limits.factoryVersion
    || !(r.admission?.maxCostMicrousd <= binding.limits.maxCostMicrousd) || !(r.admission?.maxDurationSeconds <= binding.limits.maxDurationSeconds)) return refuse('PERMIT_REQUEST_NOT_CONFIRMED');
  const owner = asPrincipal(ctx, confirmedIdentity(binding.subject, enrollment));
  const approved = await h.approvePrepared(owner, { projectId: connection.projectId, requestId: row._id });
  const permitId = approved?.document?.permitId ?? refuse('PERMIT_NOT_ISSUED'), approvalId = approved.document.approvalId;
  const result = { confirmationDigest: digest, workId: work.id, requestId: String(row._id), permitId: String(permitId), approvalId: String(approvalId) };
  await ctx.db.patch(receiptId, { status: 'APPLIED', ownerId: connection.ownerId, result, updatedAt: Date.now() } as any);
  await ctx.db.insert('missionEvents', { missionId: row.missionId, tenantId: connection.tenantId, projectId: connection.projectId, workOrderId: row.workOrderId,
    eventType: 'SOFIE_CONFIRMED_PERMIT_APPROVED', actorType: 'HUMAN', actorId: String(connection.ownerId), timestamp: Date.now(),
    idempotencyKey: `${CONFIRMED_BY_SOFIE}:${digest}:permit:${work.id}`,
    summary: 'Owner-confirmed Work: MissionControl approved exactly this Work permit through its own checks',
    metadata: { approvalReason: CONFIRMED_BY_SOFIE, confirmationDigest: digest, work: r.work, admission: r.admission, permitId, approvalId, requestId: row._id } } as any);
  return result;
}

/** Audits a refused, signature-verified submission and burns its nonce/Work step (fail closed: a refused confirmation is never retried). */
export async function recordConfirmationRefusal(ctx: MutationCtx, input: { confirmation: SignedConfirmationInput; step: 'PLAN' | 'PERMIT'; workId: string; reason: string }) {
  let binding: ConfirmationBinding; try { binding = parseConfirmationBinding(input.confirmation.binding); } catch { return { recorded: false }; }
  const digest = confirmationDigest(binding), workId = input.step === 'PLAN' ? '' : input.workId;
  const prior = await ctx.db.query('sofieConfirmationReceipts' as any).withIndex('by_digest_step_work', (q: any) => q.eq('confirmationDigest', digest).eq('step', input.step).eq('workId', workId)).first();
  const sameNonce = input.step === 'PLAN' ? await ctx.db.query('sofieConfirmationReceipts' as any).withIndex('by_installation_nonce', (q: any) => q.eq('installationId', binding.installationId).eq('nonce', binding.nonce)).first() : null;
  if (prior || sameNonce) return { recorded: false };
  const now = Date.now();
  await ctx.db.insert('sofieConfirmationReceipts' as any, { installationId: binding.installationId, nonce: binding.nonce, confirmationDigest: digest, step: input.step, workId,
    subject: binding.subject, keyId: input.confirmation.keyId, signature: input.confirmation.signature, connectionId: binding.connectionId, status: 'REFUSED',
    reason: input.reason.slice(0, 300), createdAt: now, updatedAt: now } as any);
  return { recorded: true };
}
