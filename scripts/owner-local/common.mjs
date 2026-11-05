// Owner-local disposable MissionControl (private beta, Jay's Mac only). Shared paths and helpers.
// Nothing here talks to production Convex, Clerk or Vercel: every URL is 127.0.0.1 and every key is a temporary 0600 file under runtime/keys.
import { readFileSync, writeFileSync, existsSync, mkdirSync, chmodSync } from 'node:fs';
import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, createHash, randomBytes } from 'node:crypto';
import { join } from 'node:path';

export const RUNTIME = process.env.OWNER_LOCAL_RUNTIME ?? '/Users/jaywest/Myeve/output/private-beta-20261103/runtime';
export const KEYS = join(RUNTIME, 'keys'), CONFIG = join(RUNTIME, 'config'), MC_DIR = join(RUNTIME, 'mc'), EVIDENCE = join(RUNTIME, 'evidence');
export const MC_PORT = 8799, MC_SITE_PORT = 8800, BRIDGE_PORT = 8798;
export const MC_URL = `http://127.0.0.1:${MC_PORT}`, MC_SITE = `http://127.0.0.1:${MC_SITE_PORT}`;
export const OWNER_ID = 'bd78f31f-b369-443a-a1d4-6d7d2ecc0118';
// Identity labels (never network endpoints). They are https-shaped because the permit/enrollment schemas require it; the
// transport for this owner-local profile is the loopback MC_URL above.
export const LOCAL_ISSUER = 'https://owner-local-identity.myeve.invalid';
export const LOCAL_AUDIENCE = 'convex';
export const LOCAL_AZP = 'https://missioncontrol.owner-local.invalid';
export const MC_ISSUER_LABEL = 'https://missioncontrol.owner-local.invalid';
export const MYEVE_AUDIENCE_LABEL = 'https://myeve.owner-local.invalid';
export const PLANNER_SUBJECT = 'sofie-planner-owner-local';

for (const d of [KEYS, CONFIG, MC_DIR, EVIDENCE]) mkdirSync(d, { recursive: true, mode: 0o700 });
export const secretFile = name => join(KEYS, name);
export function writeSecret(name, value) { const p = secretFile(name); writeFileSync(p, value, { mode: 0o600 }); chmodSync(p, 0o600); return p; }
export function readSecret(name) { return readFileSync(secretFile(name), 'utf8').trim(); }
export function ensureSecret(name, make) { if (!existsSync(secretFile(name))) writeSecret(name, make()); return readSecret(name); }
export const sha256 = v => createHash('sha256').update(v).digest('hex');
export const b64u = b => Buffer.from(b).toString('base64url');

/** Temporary local identity issuer: ES256 key (0600). Public JWKS is non-secret. */
export function issuerKey() {
  ensureSecret('mc-identity-issuer.private.pem', () => generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey.export({ type: 'pkcs8', format: 'pem' }).toString());
  const privateKey = createPrivateKey(readSecret('mc-identity-issuer.private.pem'));
  const jwk = createPublicKey(privateKey).export({ format: 'jwk' });
  const kid = sha256(JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y })).slice(0, 16);
  const jwks = { keys: [{ ...jwk, kid, alg: 'ES256', use: 'sig' }] };
  writeFileSync(join(CONFIG, 'mc-identity-issuer.jwks.json'), JSON.stringify(jwks, null, 1));
  return { privateKey, kid, jwks };
}
/** Mints an ES256 JWT for one subject. Only the operator setup calls this (owner token for the bridge, planner token). */
export function mintToken(subject, ttlSeconds, extra = {}) {
  const { privateKey, kid } = issuerKey(), now = Math.floor(Date.now() / 1000);
  const header = { alg: 'ES256', typ: 'JWT', kid };
  const payload = { iss: LOCAL_ISSUER, sub: subject, aud: LOCAL_AUDIENCE, azp: LOCAL_AZP, iat: now, nbf: now - 5, exp: now + ttlSeconds, ...extra };
  const input = `${b64u(JSON.stringify(header))}.${b64u(JSON.stringify(payload))}`;
  const signature = sign('sha256', Buffer.from(input), { key: privateKey, dsaEncoding: 'ieee-p1363' });
  return `${input}.${b64u(signature)}`;
}
export const newSecret = () => randomBytes(32).toString('hex');
