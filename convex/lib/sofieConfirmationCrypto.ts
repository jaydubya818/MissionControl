'use node';
import { createHash, createHmac, createPublicKey, timingSafeEqual, verify } from 'node:crypto';
import { canonicalServiceCommand, validateServiceCommandEnvelope, type ServiceCommandEnvelope } from './serviceCommandAuth';
import {
  APPROVE_CONFIRMED_PERMIT, CONFIRM_PLAN, CONFIRMATION_SERVICE_ID, SUBMISSION_SCHEMA, confirmationInstallation, confirmationSigningText,
  parseConfirmationBinding, refuse, submitterSecret, type ConfirmationBinding,
} from './sofieConfirmation';

export type AuthenticatedSubmission = { confirmation: { binding: ConfirmationBinding; keyId: string; signature: string }; payload: Record<string, any> };

/**
 * Authenticates a hosted MyEve confirmation submission: (1) the per-installation submitter credential (HMAC service-command envelope; it can
 * only reach the two confirmation actions), then (2) MyEve's Ed25519 confirmation signature under the key the operator enrolled for exactly
 * that installation. The credential alone authorizes nothing; the signature alone cannot be submitted.
 */
export async function authenticateSofieConfirmationSubmission(args: { envelope: ServiceCommandEnvelope; payloadJson: string },
  capability: typeof CONFIRM_PLAN | typeof APPROVE_CONFIRMED_PERMIT, now = Date.now()): Promise<AuthenticatedSubmission> {
  if (typeof args.payloadJson !== 'string' || args.payloadJson.length > 64000) return refuse('SUBMISSION_SIZE');
  let payload: any; try { payload = JSON.parse(args.payloadJson); } catch { return refuse('SUBMISSION_JSON'); }
  const keys = capability === CONFIRM_PLAN ? ['confirmation', 'installationId', 'schema', 'submit'] : ['confirmation', 'installationId', 'requestId', 'schema', 'workId'];
  if (!payload || typeof payload !== 'object' || Object.keys(payload).sort().join(',') !== keys.join(',') || payload.schema !== SUBMISSION_SCHEMA
    || typeof payload.installationId !== 'string') return refuse('SUBMISSION_SHAPE');
  const envelope = args.envelope;
  if (validateServiceCommandEnvelope(envelope, now, { serviceId: CONFIRMATION_SERVICE_ID, capability }) || envelope.issuedAt > now
    || envelope.repositoryId !== `installation:${payload.installationId}` || envelope.payloadDigest !== `sha256=${createHash('sha256').update(args.payloadJson).digest('hex')}`) return refuse('SUBMITTER_ENVELOPE');
  const expected = createHmac('sha256', submitterSecret(payload.installationId)).update(canonicalServiceCommand(envelope)).digest();
  const presented = Buffer.from(envelope.signature.slice('sha256='.length), 'hex');
  if (presented.length !== expected.length || !timingSafeEqual(presented, expected)) return refuse('SUBMITTER_SIGNATURE');
  const c = payload.confirmation;
  if (!c || typeof c !== 'object' || Object.keys(c).sort().join(',') !== 'binding,keyId,signature' || typeof c.keyId !== 'string' || typeof c.signature !== 'string') return refuse('CONFIRMATION_SHAPE');
  const binding = parseConfirmationBinding(c.binding);
  if (binding.installationId !== payload.installationId) return refuse('INSTALLATION_MISMATCH');
  const installation = confirmationInstallation(binding.installationId);
  const key = installation.keys.find(k => k.keyId === c.keyId);
  if (!key || key.revokedAt !== null || key.activeFrom > now || key.notAfter <= now) return refuse('CONFIRMATION_KEY_NOT_ENROLLED');
  const publicKey = createPublicKey(key.publicKey), signature = Buffer.from(c.signature, 'base64url');
  if (publicKey.asymmetricKeyType !== 'ed25519' || createHash('sha256').update(publicKey.export({ type: 'spki', format: 'der' })).digest('hex') !== key.keyId
    || signature.length !== 64 || signature.toString('base64url') !== c.signature
    || !verify(null, Buffer.from(confirmationSigningText(binding)), publicKey, signature)) return refuse('CONFIRMATION_SIGNATURE');
  return { confirmation: { binding, keyId: c.keyId, signature: c.signature }, payload };
}
