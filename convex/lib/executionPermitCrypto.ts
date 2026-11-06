import { constantTimeEqual, ed25519Sign, ed25519Verify, fromBase64, parsePrivateKey, parsePublicKey, sha256Hex, toBase64Url } from '../../packages/shared/src/pureCrypto';
import { permitDenied, permitSigningText, type PermitControlDelivery, type ExecutionPermit, type AdmissionReceipt, type OwnerEnrollment, type SignedPermit } from '../../packages/shared/src/executionPermit';

export function signPermitDocument<T extends ExecutionPermit | AdmissionReceipt | PermitControlDelivery>(document: T, enrollment: OwnerEnrollment, privateKeyPem: string): SignedPermit<T> {
  const privateKey = parsePrivateKey(privateKeyPem);
  if (privateKey.asymmetricKeyType !== 'ed25519') return permitDenied();
  const publicKey = parsePublicKey(privateKeyPem) as { raw: Uint8Array; spki: Uint8Array };
  const keyId = sha256Hex(publicKey.spki);
  const registered = enrollment.permitKeys.filter(k => k.keyId === keyId);
  if (registered.length !== 1) return permitDenied();
  const key = registered[0];
  if (key.revokedAt !== null || key.activeFrom > document.issuedAt || key.notAfter < document.expiresAt) return permitDenied();
  const enrolled = parsePublicKey(key.publicKey);
  if (enrolled.asymmetricKeyType !== 'ed25519' || !constantTimeEqual(publicKey.spki, enrolled.spki)) return permitDenied();
  return { document, keyId, signature: toBase64Url(ed25519Sign(permitSigningText(document), privateKey.seed)) };
}
export function verifyPermitSignature<T extends ExecutionPermit | AdmissionReceipt | PermitControlDelivery>(signed: SignedPermit<T>, enrollment: OwnerEnrollment) {
  const keys = enrollment.permitKeys.filter(k => k.keyId === signed.keyId), signature = fromBase64(signed.signature);
  if (keys.length !== 1 || signature.length !== 64 || toBase64Url(signature) !== signed.signature) return permitDenied();
  const key = keys[0], publicKey = parsePublicKey(key.publicKey);
  if (publicKey.asymmetricKeyType !== 'ed25519' || key.revokedAt !== null || key.activeFrom > signed.document.issuedAt || key.notAfter < signed.document.expiresAt
    || sha256Hex(publicKey.spki) !== key.keyId
    || !ed25519Verify(signature, permitSigningText(signed.document), publicKey.raw)) return permitDenied();
}

export function signConfiguredPermitDocument(value:{document:ExecutionPermit|AdmissionReceipt|PermitControlDelivery;enrollment:OwnerEnrollment}) {
  let keys:Record<string,string>; try{keys=JSON.parse(process.env.MC_SOFIE_PERMIT_SIGNING_KEYS??'null');}catch{return permitDenied();}
  const available=value.enrollment.permitKeys.filter(k=>k.revokedAt===null&&k.activeFrom<=value.document.issuedAt&&k.notAfter>=value.document.expiresAt&&keys&&Object.prototype.hasOwnProperty.call(keys,k.keyId));
  if(available.length!==1||value.document.expiresAt<=Date.now()) return permitDenied();
  return signPermitDocument(value.document,value.enrollment,keys[available[0].keyId]);
}
