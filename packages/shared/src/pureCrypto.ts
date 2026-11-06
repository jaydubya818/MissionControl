// Pure-JS, synchronous replacements for the node:crypto calls used by code bundled into the default Convex runtime
// (no Buffer, no node:crypto). Byte-identical outputs: SHA-256/SHA-1 hex, HMAC-SHA256, Ed25519 (RFC 8032, strict verify),
// SPKI/PKCS8 DER and PEM exactly as node:crypto exports them, and Node's lenient base64/base64url decoding.
import { ed25519 } from '@noble/curves/ed25519';
import { hmac } from '@noble/hashes/hmac';
import { sha1 } from '@noble/hashes/legacy';
import { sha256 } from '@noble/hashes/sha2';

const encoder = new TextEncoder(), decoder = new TextDecoder('utf-8');
export type Bytes = Uint8Array;
export const utf8 = (text: string): Bytes => encoder.encode(text);
export const fromUtf8 = (bytes: Bytes): string => decoder.decode(bytes);
const asBytes = (data: string | Bytes): Bytes => typeof data === 'string' ? utf8(data) : data;
export const toHex = (bytes: Bytes): string => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
export function fromHex(text: string): Bytes {
  // Node: decodes pairs until the first non-hex pair; odd trailing nibble dropped.
  const out: number[] = [];
  for (let i = 0; i + 1 < text.length; i += 2) { const v = Number.parseInt(text.slice(i, i + 2), 16); if (!/^[0-9a-fA-F]{2}$/.test(text.slice(i, i + 2))) break; out.push(v); }
  return Uint8Array.from(out);
}
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
function encode(bytes: Bytes, alphabet: string, pad: boolean): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0), left = bytes.length - i;
    out += alphabet[(n >> 18) & 63] + alphabet[(n >> 12) & 63] + (left > 1 ? alphabet[(n >> 6) & 63] : pad ? '=' : '') + (left > 2 ? alphabet[n & 63] : pad ? '=' : '');
  }
  return out;
}
export const toBase64 = (bytes: Bytes) => encode(bytes, B64, true);
export const toBase64Url = (bytes: Bytes) => encode(bytes, B64URL, false);
/** Node's Buffer.from(text, 'base64' | 'base64url'): both alphabets, invalid characters skipped, stops at '=', partial bits dropped. */
export function fromBase64(text: string): Bytes {
  const out: number[] = []; let acc = 0, bits = 0;
  for (const ch of text) {
    if (ch === '=') break;
    let v = B64.indexOf(ch); if (v < 0) v = ch === '-' ? 62 : ch === '_' ? 63 : -1;
    if (v < 0) continue;
    acc = (acc << 6) | v; bits += 6;
    if (bits >= 8) { bits -= 8; out.push((acc >> bits) & 255); }
  }
  return Uint8Array.from(out);
}
export const sha256Hex = (data: string | Bytes) => toHex(sha256(asBytes(data)));
export const sha256Bytes = (...parts: (string | Bytes)[]) => { const h = sha256.create(); for (const p of parts) h.update(asBytes(p)); return h.digest(); };
export const sha1Bytes = (...parts: (string | Bytes)[]) => { const h = sha1.create(); for (const p of parts) h.update(asBytes(p)); return h.digest(); };
export const hmacSha256 = (key: string | Bytes, data: string | Bytes): Bytes => hmac(sha256, asBytes(key), asBytes(data));
/** Constant-time for equal lengths (length is not secret), like crypto.timingSafeEqual; unequal lengths return false. */
export function constantTimeEqual(a: Bytes, b: Bytes): boolean {
  if (a.length !== b.length) return false;
  let diff = 0; for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
export function randomBytes(length: number): Bytes { const out = new Uint8Array(length); crypto.getRandomValues(out); return out; }

// --- Ed25519 keys, as node:crypto parses/exports them ---
const SPKI_ED25519 = Uint8Array.from([0x30,0x2a,0x30,0x05,0x06,0x03,0x2b,0x65,0x70,0x03,0x21,0x00]);
const PKCS8_ED25519 = Uint8Array.from([0x30,0x2e,0x02,0x01,0x00,0x30,0x05,0x06,0x03,0x2b,0x65,0x70,0x04,0x22,0x04,0x20]);
const startsWith = (b: Bytes, p: Bytes) => b.length >= p.length && p.every((v, i) => b[i] === v);
const concat = (a: Bytes, b: Bytes) => { const out = new Uint8Array(a.length + b.length); out.set(a); out.set(b, a.length); return out; };
/** Duck type of node's KeyObject (callers outside Convex may still pass one); never imported here. */
export type KeyLike = { type: string; asymmetricKeyType?: string; export(options: { format: 'der'; type: 'spki' | 'pkcs8' }): Uint8Array };
export type ParsedPublicKey = { asymmetricKeyType: 'ed25519'; raw: Bytes; spki: Bytes } | { asymmetricKeyType: 'other' };
function pem(text: string): { label: string; der: Bytes } {
  const m = /^\s*-----BEGIN ([A-Z0-9 ]+)-----\r?\n([A-Za-z0-9+/=\r\n]+?)-----END \1-----\s*$/.exec(text);
  if (!m) throw new Error('Unsupported key format');
  return { label: m[1], der: fromBase64(m[2].replace(/[\r\n]/g, '')) };
}
function ed25519Seed(der: Bytes): Bytes | null { return der.length === 48 && startsWith(der, PKCS8_ED25519) ? der.slice(16) : null; }
/** createPrivateKey(pem|KeyObject) restricted to what callers check: Ed25519 seed or 'other'. */
export function parsePrivateKey(key: string | KeyLike): { asymmetricKeyType: 'ed25519'; seed: Bytes } | { asymmetricKeyType: 'other' } {
  let der: Bytes;
  if (typeof key === 'string') { const p = pem(key); if (p.label !== 'PRIVATE KEY') throw new Error('Unsupported private key format'); der = p.der; }
  else { if (key.type !== 'private') throw new Error('Private key required'); der = Uint8Array.from(key.export({ format: 'der', type: 'pkcs8' })); }
  const seed = ed25519Seed(der); if (seed) return { asymmetricKeyType: 'ed25519', seed };
  if (der[0] !== 0x30) throw new Error('Unsupported private key format');
  return { asymmetricKeyType: 'other' };
}
/** createPublicKey(pem|KeyObject): SPKI public key, or the public half of a PKCS8 private key (as node derives it). */
export function parsePublicKey(key: string | KeyLike): ParsedPublicKey {
  let der: Bytes;
  if (typeof key === 'string') {
    const p = pem(key);
    if (p.label === 'PRIVATE KEY') { const s = ed25519Seed(p.der); if (!s) { if (p.der[0] !== 0x30) throw new Error('Unsupported key format'); return { asymmetricKeyType: 'other' }; }
      const raw = ed25519.getPublicKey(s); return { asymmetricKeyType: 'ed25519', raw, spki: concat(SPKI_ED25519, raw) }; }
    if (p.label !== 'PUBLIC KEY') throw new Error('Unsupported public key format');
    der = p.der;
  } else der = Uint8Array.from(key.export({ format: 'der', type: key.type === 'private' ? 'pkcs8' : 'spki' }));
  if (der.length === 44 && startsWith(der, SPKI_ED25519)) return { asymmetricKeyType: 'ed25519', raw: der.slice(12), spki: der };
  const s = ed25519Seed(der); if (s) { const raw = ed25519.getPublicKey(s); return { asymmetricKeyType: 'ed25519', raw, spki: concat(SPKI_ED25519, raw) }; }
  if (der[0] !== 0x30) throw new Error('Unsupported key format');
  return { asymmetricKeyType: 'other' };
}
export const ed25519PublicFromSeed = (seed: Bytes) => ed25519.getPublicKey(seed);
export const ed25519Sign = (message: string | Bytes, seed: Bytes): Bytes => ed25519.sign(asBytes(message), seed);
/** RFC 8032 strict verification (zip215 off), matching OpenSSL; any malformed input is a failed verification. */
export function ed25519Verify(signature: Bytes, message: string | Bytes, publicRaw: Bytes): boolean {
  if (signature.length !== 64 || publicRaw.length !== 32) return false;
  try { return ed25519.verify(signature, asBytes(message), publicRaw, { zip215: false }); } catch { return false; }
}
