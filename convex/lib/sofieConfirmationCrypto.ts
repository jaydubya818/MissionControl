import { constantTimeEqual, ed25519Verify, fromBase64, fromHex, hmacSha256, parsePublicKey, sha256Hex, toBase64Url } from '../../packages/shared/src/pureCrypto';
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
    || envelope.repositoryId !== `installation:${payload.installationId}` || envelope.payloadDigest !== `sha256=${sha256Hex(args.payloadJson)}`) return refuse('SUBMITTER_ENVELOPE');
  const expected = hmacSha256(submitterSecret(payload.installationId), canonicalServiceCommand(envelope));
  const presented = fromHex(envelope.signature.slice('sha256='.length));
  if (presented.length !== expected.length || !constantTimeEqual(presented, expected)) return refuse('SUBMITTER_SIGNATURE');
  const c = payload.confirmation;
  if (!c || typeof c !== 'object' || Object.keys(c).sort().join(',') !== 'binding,keyId,signature' || typeof c.keyId !== 'string' || typeof c.signature !== 'string') return refuse('CONFIRMATION_SHAPE');
  const binding = parseConfirmationBinding(c.binding);
  if (binding.installationId !== payload.installationId) return refuse('INSTALLATION_MISMATCH');
  const installation = confirmationInstallation(binding.installationId);
  const key = installation.keys.find(k => k.keyId === c.keyId);
  if (!key || key.revokedAt !== null || key.activeFrom > now || key.notAfter <= now) return refuse('CONFIRMATION_KEY_NOT_ENROLLED');
  const publicKey = parsePublicKey(key.publicKey), signature = fromBase64(c.signature);
  if (publicKey.asymmetricKeyType !== 'ed25519' || sha256Hex(publicKey.spki) !== key.keyId
    || signature.length !== 64 || toBase64Url(signature) !== c.signature
    || !ed25519Verify(signature, confirmationSigningText(binding), publicKey.raw)) return refuse('CONFIRMATION_SIGNATURE');
  return { confirmation: { binding, keyId: c.keyId, signature: c.signature }, payload };
}
