import { sha256Hex } from '../../packages/shared/src/canonicalDigest';
import { canonicalPermitJson, parseOwnerEnrollment, type OwnerEnrollment } from '../../packages/shared/src/executionPermit';

/**
 * HOSTED Sofie confirmation bridge (production-compatible; no local issuer, no stored user or owner token).
 *
 * One authenticated Sofie `confirm <plan>` in hosted MyEve = one confirmation binding, signed by MyEve's per-installation Ed25519 confirmation
 * key over the exact user subject, installation, MissionControl connection/enrollment, proposal, Plan specification (and its digest),
 * repository, Work tuples, limits, a <= 10 minute validity window and a nonce. Hosted MyEve submits it server-to-server with a credential that
 * can ONLY submit confirmations (MC_SOFIE_CONFIRMATION_SUBMITTER_SECRETS). MissionControl then:
 *   - verifies the signature against the key the operator enrolled for that installation (MC_SOFIE_CONFIRMATION_INSTALLATIONS);
 *   - requires the signed subject to be the installation's enrolled owner AND the connection's enrolled ownerSubject AND the MissionControl owner's
 *     authId (each user confirms only their own Work);
 *   - consumes the nonce in the same transaction as every approval (all or nothing; concurrent duplicates: exactly one commits);
 *   - performs the owner decisions by running MissionControl's EXISTING public mutation handlers, unchanged, under the confirmed owner's identity
 *     (exactly the identity Convex derives from a real token of the pinned provider), so every existing authorization check and audit row applies;
 *   - re-verifies the submitted Plan against the confirmed specification before approving it, and records `confirmed-by-sofie` with the
 *     confirmation digest on the approval and in its own audit receipts.
 * Nothing here can approve anything without a valid confirmation bound to that user's own Work.
 */
export const CONFIRMATION_SCHEMA = 'myeve-hosted-confirmation/v1' as const;
export const SUBMISSION_SCHEMA = 'mc-sofie-confirmation-submission/v1' as const;
export const CONFIRMATION_SERVICE_ID = 'myeve-hosted-confirmation' as const;
export const CONFIRM_PLAN = 'sofie.confirmPlan' as const;
export const APPROVE_CONFIRMED_PERMIT = 'sofie.approveConfirmedPermit' as const;
/** The confirmation may be accepted (Plan step) only within its signed window of at most 10 minutes. */
export const CONFIRMATION_MAX_TTL_MS = 10 * 60 * 1000;
/**
 * The confirmed request's stage Works run one after another and MissionControl permits live at most 5 minutes, so each permit is approved just in
 * time. The person's confirmation therefore signs, explicitly, how long it authorizes those exact permits: `permitsExpiresAt` (>= expiresAt,
 * <= issuedAt + 45 minutes, <= the enrollment's expiry). MissionControl never substitutes a window of its own; a stage that starts after it fails closed.
 */
export const PERMITS_MAX_TTL_MS = 45 * 60 * 1000;
/** The hosted journey is exactly three stage Works (one WorkOrder blueprint each, `stage-1..3`), fixed when the person confirms. */
export const STAGE_WORKS = 3;
const CLOCK_SKEW_MS = 30 * 1000;

export class ConfirmationRefused extends Error { constructor(readonly code: string) { super(`SOFIE_CONFIRMATION_REFUSED:${code}`); } }
export const refuse = (code: string): never => { throw new ConfirmationRefused(code); };

const SHA = /^[a-f0-9]{64}$/;
const ID = /^[A-Za-z0-9._:|@-]{1,200}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const isId = (v: unknown): v is string => typeof v === 'string' && ID.test(v);
const isSha = (v: unknown): v is string => typeof v === 'string' && SHA.test(v);
const positive = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) > 0;
function exact(value: unknown, keys: string[], code: string): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return refuse(code);
  const actual = Object.keys(value).sort(), expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((k, i) => k !== expected[i])) return refuse(code);
  return value as Record<string, any>;
}

export type ConfirmedWork = { stage: number; id: string; version: number; generation: number; tupleSha256: string };
export type PlanSpecification = { summary: string; rollbackApproach: string; workOrderBlueprints: any[]; assertions: any[]; metadata: Record<string, unknown>; estimatedCostUsd?: number };
export type ConfirmationBinding = {
  schema: typeof CONFIRMATION_SCHEMA; installationId: string; subject: string; myeveOwnerId: string;
  connectionId: string; enrollmentRevision: number; proposalId: string; proposalDigest: string;
  planSha256: string; planContentSha256: string; plan: PlanSpecification; repository: string;
  works: ConfirmedWork[]; limits: { factoryVersion: string; maxCostMicrousd: number; maxDurationSeconds: number };
  issuedAt: number; expiresAt: number; permitsExpiresAt: number; nonce: string;
};
export type SignedConfirmation = { binding: ConfirmationBinding; keyId: string; signature: string };

export const confirmationSigningText = (binding: unknown) => `${CONFIRMATION_SCHEMA}\n${canonicalPermitJson(binding)}`;
export const confirmationDigest = (binding: unknown) => sha256Hex(confirmationSigningText(binding));
/** Digest of the exact Plan specification the user confirmed (what MissionControl must hold, before MissionControl adds workflow versions). */
export const planContentDigest = (plan: unknown) => sha256Hex(`mc-sofie-confirmed-plan/v1\n${canonicalPermitJson(plan)}`);

export function parseConfirmationBinding(value: unknown): ConfirmationBinding {
  const b = exact(value, ['schema', 'installationId', 'subject', 'myeveOwnerId', 'connectionId', 'enrollmentRevision', 'proposalId', 'proposalDigest',
    'planSha256', 'planContentSha256', 'plan', 'repository', 'works', 'limits', 'issuedAt', 'expiresAt', 'permitsExpiresAt', 'nonce'], 'BINDING_SHAPE');
  if (b.schema !== CONFIRMATION_SCHEMA || !isId(b.installationId) || !isId(b.subject) || !isId(b.myeveOwnerId) || !isId(b.connectionId)
    || !positive(b.enrollmentRevision) || !isId(b.proposalId) || typeof b.proposalDigest !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(b.proposalDigest)
    || !isSha(b.planSha256) || !isSha(b.planContentSha256) || typeof b.repository !== 'string' || !/^[A-Za-z0-9._-]{1,100}\/[A-Za-z0-9._-]{1,100}$/.test(b.repository)
    || typeof b.nonce !== 'string' || !UUID.test(b.nonce) || !Number.isSafeInteger(b.issuedAt) || !Number.isSafeInteger(b.expiresAt)
    || !Number.isSafeInteger(b.permitsExpiresAt)) return refuse('BINDING_FIELDS');
  const plan = exact(b.plan, ['summary', 'rollbackApproach', 'workOrderBlueprints', 'assertions', 'metadata', ...(b.plan?.estimatedCostUsd !== undefined ? ['estimatedCostUsd'] : [])], 'PLAN_SHAPE');
  if (typeof plan.summary !== 'string' || typeof plan.rollbackApproach !== 'string' || !Array.isArray(plan.workOrderBlueprints) || plan.workOrderBlueprints.length !== STAGE_WORKS
    || plan.workOrderBlueprints.some((bp: any, i: number) => bp?.id !== `stage-${i + 1}` || bp?.sequence !== i + 1) || !Array.isArray(plan.assertions) || !plan.metadata || typeof plan.metadata !== 'object' || Array.isArray(plan.metadata)
    || plan.workOrderBlueprints.some((bp: any) => bp?.workflowVersion !== undefined)) return refuse('PLAN_SHAPE');
  if (planContentDigest(plan) !== b.planContentSha256) return refuse('PLAN_CONTENT_DIGEST');
  // Exactly the confirmed request's stage Work tuples: count and ids are fixed at signing.
  if (!Array.isArray(b.works) || b.works.length !== STAGE_WORKS) return refuse('WORKS');
  b.works.forEach((w: any, i: number) => {
    exact(w, ['stage', 'id', 'version', 'generation', 'tupleSha256'], 'WORKS');
    if (w.stage !== i + 1 || !isId(w.id) || !positive(w.version) || !positive(w.generation) || !isSha(w.tupleSha256)) refuse('WORKS');
  });
  if (new Set(b.works.map((w: any) => w.id)).size !== b.works.length) return refuse('WORKS');
  // The confirmed Plan names the MyEve plan and exactly the confirmed Works (one WorkOrder blueprint per Work, in stage order).
  if (plan.metadata.myevePlanSha256 !== b.planSha256 || canonicalPermitJson(plan.metadata.works) !== canonicalPermitJson(b.works.map((w: any) => w.id))) return refuse('PLAN_WORK_BINDING');
  const limits = exact(b.limits, ['factoryVersion', 'maxCostMicrousd', 'maxDurationSeconds'], 'LIMITS');
  if (!isSha(limits.factoryVersion) || !positive(limits.maxCostMicrousd) || !positive(limits.maxDurationSeconds)) return refuse('LIMITS');
  return b as ConfirmationBinding;
}

/** Both signed windows must be well-formed: acceptance <= 10 minutes; permit authorization from acceptance expiry to <= 45 minutes after issue. */
export function requireSignedWindows(binding: ConfirmationBinding, now: number) {
  if (binding.expiresAt <= binding.issuedAt || binding.expiresAt - binding.issuedAt > CONFIRMATION_MAX_TTL_MS
    || binding.permitsExpiresAt < binding.expiresAt || binding.permitsExpiresAt - binding.issuedAt > PERMITS_MAX_TTL_MS
    || binding.issuedAt > now + CLOCK_SKEW_MS) return refuse('CONFIRMATION_WINDOW');
}
/** Plan step: only while the signed acceptance window is open. */
export function requireConfirmationFresh(binding: ConfirmationBinding, now: number) {
  requireSignedWindows(binding, now);
  if (binding.expiresAt <= now) return refuse('CONFIRMATION_EXPIRED');
}
/** Permit step: only while the signed permit authorization is open (no window substituted by MissionControl). */
export function requirePermitsOpen(binding: ConfirmationBinding, now: number) {
  requireSignedWindows(binding, now);
  if (binding.permitsExpiresAt <= now) return refuse('CONFIRMATION_EXPIRED');
}

export type ConfirmationKey = { keyId: string; publicKey: string; activeFrom: number; notAfter: number; revokedAt: number | null };
export type ConfirmationInstallation = {
  installationId: string; ownerSubject: string; missionControlOwnerId: string; repository: string; repositoryId: string; codeScopeIds: string[];
  planner: { subject: string; memberId: string }; keys: ConfirmationKey[];
};
/**
 * Operator-enrolled installations (deployed configuration, never writable from a request): each installation is ONE person; its
 * confirmation key can only speak for that person's MissionControl owner subject, repository and planner principal.
 */
export function confirmationInstallation(installationId: string, raw: string | undefined = process.env.MC_SOFIE_CONFIRMATION_INSTALLATIONS): ConfirmationInstallation {
  let all: unknown; try { all = JSON.parse(raw ?? 'null'); } catch { return refuse('INSTALLATIONS_CONFIG'); }
  if (!all || typeof all !== 'object' || Array.isArray(all) || !Object.prototype.hasOwnProperty.call(all, installationId)) return refuse('INSTALLATION_NOT_ENROLLED');
  const i = exact((all as any)[installationId], ['ownerSubject', 'missionControlOwnerId', 'repository', 'repositoryId', 'codeScopeIds', 'planner', 'keys'], 'INSTALLATION_CONFIG');
  const planner = exact(i.planner, ['subject', 'memberId'], 'INSTALLATION_CONFIG');
  if (!isId(i.ownerSubject) || !isId(i.missionControlOwnerId) || typeof i.repository !== 'string' || !isId(i.repositoryId) || !Array.isArray(i.codeScopeIds)
    || i.codeScopeIds.length < 1 || !i.codeScopeIds.every(isId) || !isId(planner.subject) || !isId(planner.memberId) || planner.subject === i.ownerSubject
    || !Array.isArray(i.keys) || i.keys.length < 1 || i.keys.length > 4) return refuse('INSTALLATION_CONFIG');
  for (const k of i.keys) {
    exact(k, ['keyId', 'publicKey', 'activeFrom', 'notAfter', 'revokedAt'], 'INSTALLATION_CONFIG');
    if (!isSha(k.keyId) || typeof k.publicKey !== 'string' || k.publicKey.length > 2000 || !Number.isSafeInteger(k.activeFrom) || !Number.isSafeInteger(k.notAfter)
      || !(k.revokedAt === null || Number.isSafeInteger(k.revokedAt))) return refuse('INSTALLATION_CONFIG');
  }
  return { installationId, ...i } as ConfirmationInstallation;
}
/** Default `sofieEnterprise:connect` lifetime cap. */
export const SOFIE_CONNECTION_MAX_MS = 3_600_000;
/**
 * Private beta, connection option A: ONE long-lived connection per person, renewed by the owner (re-run `connect` before expiry).
 * Only the owner of an operator-enrolled confirmation installation may request it; everyone else keeps the 1 h cap. The connection still
 * approves nothing; every approval needs a fresh signed per-Work confirmation, and `decide REVOKE` ends it immediately.
 */
export const PRIVATE_BETA_SOFIE_CONNECTION_MAX_MS = 7 * 24 * 3_600_000;
export type SofieConnectionKind = 'PRIVATE_BETA_SOFIE';
/** Max allowed `expiresAt - now` for a new connection, or null when the requested kind is not allowed for this owner. */
export function connectionLifetimeCap(kind: SofieConnectionKind | undefined, missionControlOwnerId: string,
  raw: string | undefined = process.env.MC_SOFIE_CONFIRMATION_INSTALLATIONS): number | null {
  if (kind === undefined) return SOFIE_CONNECTION_MAX_MS;
  if (kind !== 'PRIVATE_BETA_SOFIE') return null;
  let all: unknown; try { all = JSON.parse(raw ?? 'null'); } catch { return null; }
  if (!all || typeof all !== 'object' || Array.isArray(all)) return null;
  for (const installationId of Object.keys(all)) {
    try { if (confirmationInstallation(installationId, raw).missionControlOwnerId === missionControlOwnerId) return PRIVATE_BETA_SOFIE_CONNECTION_MAX_MS; }
    catch { return null; }
  }
  return null;
}
/** The narrowly scoped server credential: per installation, usable only for the two confirmation submissions. */
export function submitterSecret(installationId: string, raw: string | undefined = process.env.MC_SOFIE_CONFIRMATION_SUBMITTER_SECRETS): string {
  let all: any; try { all = JSON.parse(raw ?? 'null'); } catch { return refuse('SUBMITTER_CONFIG'); }
  const value = all && typeof all === 'object' && !Array.isArray(all) && Object.prototype.hasOwnProperty.call(all, installationId) ? all[installationId] : null;
  if (!value || typeof value.secret !== 'string' || value.secret.length < 32) return refuse('SUBMITTER_NOT_ENROLLED');
  return value.secret;
}

/** Each user confirms only their own Work: the signed subject must be the installation's owner, the connection's enrolled owner and the MC owner. */
export function requireOwnConfirmation(binding: ConfirmationBinding, installation: ConfirmationInstallation, enrollmentValue: unknown,
  connection: { _id: string; ownerId: string; projectId: string; tenantId: string }, owner: { _id: string; authId?: string; active?: boolean } | null): OwnerEnrollment {
  const enrollment = parseOwnerEnrollment(enrollmentValue);
  if (binding.subject !== installation.ownerSubject || enrollment.ownerSubject !== binding.subject || enrollment.installationId !== binding.installationId
    || !owner?.active || owner._id !== connection.ownerId || owner.authId !== binding.subject || connection.ownerId !== installation.missionControlOwnerId
    || enrollment.missionControlOwnerId !== connection.ownerId || enrollment.connectionId !== connection._id || connection._id !== binding.connectionId
    || enrollment.ownerId !== binding.myeveOwnerId || enrollment.revision !== binding.enrollmentRevision) return refuse('IDENTITY_MISMATCH');
  if (binding.repository !== installation.repository) return refuse('REPOSITORY_MISMATCH');
  if (binding.permitsExpiresAt > enrollment.expiresAt) return refuse('WINDOW_EXCEEDS_ENROLLMENT');
  if (binding.limits.factoryVersion !== enrollment.factoryVersion || binding.limits.maxCostMicrousd > enrollment.maxCostMicrousd
    || binding.limits.maxDurationSeconds > enrollment.maxDurationSeconds) return refuse('LIMITS_EXCEED_ENROLLMENT');
  return enrollment;
}

/** Exactly the identity Convex derives from a real token of the pinned provider for this subject (no aud; issuer-scoped tokenIdentifier). */
export function confirmedIdentity(subject: string, enrollment: Pick<OwnerEnrollment, 'clerkIssuer' | 'clerkAuthorizedParty'>) {
  return Object.freeze({ subject, issuer: enrollment.clerkIssuer, tokenIdentifier: `${enrollment.clerkIssuer}|${subject}`, azp: enrollment.clerkAuthorizedParty });
}
/** A context whose authenticated principal is exactly `identity` for the existing handlers; everything else is the transaction's own context. */
export function asPrincipal<T extends { auth: { getUserIdentity(): Promise<unknown> } }>(ctx: T, identity: ReturnType<typeof confirmedIdentity>): T {
  return { ...ctx, auth: { ...ctx.auth, getUserIdentity: async () => identity } };
}

/** Returns the digest of a submitted/approved Plan that is EXACTLY the confirmed specification (MissionControl may only add workflowVersion). */
export function verifyConfirmedPlan(plan: any, expected: PlanSpecification, at: { planId: string; missionId: string; repository: string; status: 'PROPOSED' | 'APPROVED' }) {
  if (!plan || plan._id !== at.planId || plan.missionId !== at.missionId || plan.status !== at.status) return refuse('PLAN_NOT_AS_CONFIRMED');
  if (plan.repository !== at.repository) return refuse('PLAN_REPOSITORY_MISMATCH');
  const blueprints = Array.isArray(plan.workOrderBlueprints) ? plan.workOrderBlueprints : [];
  if (blueprints.length !== expected.workOrderBlueprints.length) return refuse('PLAN_CHANGED');
  const stripped = blueprints.map((bp: any) => { const { workflowVersion, ...rest } = bp ?? {}; if (!Number.isSafeInteger(workflowVersion)) refuse('PLAN_CHANGED'); return rest; });
  const submitted = { summary: plan.summary, rollbackApproach: plan.rollbackApproach, workOrderBlueprints: stripped, assertions: plan.assertions, metadata: plan.metadata,
    estimatedCostUsd: plan.estimatedCostUsd ?? null };
  const want = { ...expected, estimatedCostUsd: expected.estimatedCostUsd ?? null };
  if (canonicalPermitJson(submitted) !== canonicalPermitJson(want)) return refuse('PLAN_CHANGED');
  return sha256Hex(`mc-sofie-verified-plan/v1\n${canonicalPermitJson({ planId: at.planId, missionId: at.missionId, repository: at.repository, ...want })}`);
}
