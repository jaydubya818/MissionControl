'use node';
import { createHash, createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import { permitDenied, permitSigningText, type PermitControlDelivery, type ExecutionPermit, type AdmissionReceipt, type OwnerEnrollment, type SignedPermit } from '../../packages/shared/src/executionPermit';

export function signPermitDocument<T extends ExecutionPermit | AdmissionReceipt | PermitControlDelivery>(document: T, enrollment: OwnerEnrollment, privateKeyPem: string): SignedPermit<T> {
  const privateKey = createPrivateKey(privateKeyPem), publicKey = createPublicKey(privateKey);
  const keyId = createHash('sha256').update(publicKey.export({ type: 'spki', format: 'der' })).digest('hex');
  const registered = enrollment.permitKeys.filter(k => k.keyId === keyId);
  if (privateKey.asymmetricKeyType !== 'ed25519' || registered.length !== 1) return permitDenied();
  const key = registered[0];
  if (key.revokedAt !== null || key.activeFrom > document.issuedAt || key.notAfter < document.expiresAt
    || !publicKey.export({ type: 'spki', format: 'der' }).equals(createPublicKey(key.publicKey).export({ type: 'spki', format: 'der' }))) return permitDenied();
  return { document, keyId, signature: sign(null, Buffer.from(permitSigningText(document)), privateKey).toString('base64url') };
}
export function verifyPermitSignature<T extends ExecutionPermit | AdmissionReceipt | PermitControlDelivery>(signed: SignedPermit<T>, enrollment: OwnerEnrollment) {
  const keys = enrollment.permitKeys.filter(k => k.keyId === signed.keyId), signature = Buffer.from(signed.signature, 'base64url');
  if (keys.length !== 1 || signature.length !== 64 || signature.toString('base64url') !== signed.signature) return permitDenied();
  const key = keys[0], publicKey = createPublicKey(key.publicKey);
  if (publicKey.asymmetricKeyType !== 'ed25519' || key.revokedAt !== null || key.activeFrom > signed.document.issuedAt || key.notAfter < signed.document.expiresAt
    || createHash('sha256').update(publicKey.export({ type:'spki', format:'der' })).digest('hex') !== key.keyId
    || !verify(null, Buffer.from(permitSigningText(signed.document)), publicKey, signature)) return permitDenied();
}
