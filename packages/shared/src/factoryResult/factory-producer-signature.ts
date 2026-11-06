// MyFactory fcd8afd: identical Ed25519 domains and bytes; TypeScript annotations only.
// Pure-JS (no node:crypto) so it runs in the default Convex runtime; KeyObject inputs are still accepted (duck-typed).
import { ed25519Sign, ed25519Verify, fromBase64, parsePrivateKey, parsePublicKey, toBase64Url, type KeyLike } from '../pureCrypto';
function signingDomain(domain: string) {
  if (!['MYFACTORY_RECEIPT_V1','MYFACTORY_RESULT_V1'].includes(domain)) throw new Error('Unknown signing protocol');
}
export function signProtocolPayload(domain: string, encoded: string, privateKey: string | KeyLike) {
  signingDomain(domain);
  if(typeof privateKey !== 'string' && privateKey.type !== 'private') throw new Error('Private signing key required');
  const key = parsePrivateKey(privateKey);
  if (key.asymmetricKeyType !== 'ed25519') throw new Error('Factory requires an Ed25519 signing key');
  return toBase64Url(ed25519Sign(`${domain}\0${encoded}`, key.seed));
}
export function verifyProtocolPayload(domain: string, encoded: string, signature: string, publicKey: string | KeyLike) {
  signingDomain(domain);
  if (typeof encoded !== 'string' || typeof signature !== 'string' || !/^[A-Za-z0-9_-]{86}$/.test(signature)) return false;
  const key = parsePublicKey(publicKey);
  if (key.asymmetricKeyType !== 'ed25519') return false;
  return ed25519Verify(fromBase64(signature), `${domain}\0${encoded}`, key.raw);
}
