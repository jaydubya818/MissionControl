// MyFactory fcd8afd: identical Ed25519 domains and bytes; TypeScript annotations only.
import {sign,verify,createPrivateKey,createPublicKey, type KeyObject} from 'node:crypto';
function signingDomain(domain: string) {
  if (!['MYFACTORY_RECEIPT_V1','MYFACTORY_RESULT_V1'].includes(domain)) throw new Error('Unknown signing protocol');
}
export function signProtocolPayload(domain: string, encoded: string, privateKey: string | KeyObject) {
  signingDomain(domain);
  if(typeof privateKey !== 'string' && privateKey.type !== 'private') throw new Error('Private signing key required');
  const key = typeof privateKey === 'string' ? createPrivateKey(privateKey) : privateKey;
  if (key.asymmetricKeyType !== 'ed25519') throw new Error('Factory requires an Ed25519 signing key');
  return sign(null,Buffer.from(`${domain}\0${encoded}`),key).toString('base64url');
}
export function verifyProtocolPayload(domain: string, encoded: string, signature: string, publicKey: string | KeyObject) {
  signingDomain(domain);
  if (typeof encoded !== 'string' || typeof signature !== 'string' || !/^[A-Za-z0-9_-]{86}$/.test(signature)) return false;
  const key = typeof publicKey !== 'string' && publicKey.type === 'public' ? publicKey : createPublicKey(publicKey);
  if (key.asymmetricKeyType !== 'ed25519') return false;
  return verify(null,Buffer.from(`${domain}\0${encoded}`),key,Buffer.from(signature,'base64url'));
}
