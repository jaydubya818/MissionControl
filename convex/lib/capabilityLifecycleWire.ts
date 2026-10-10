export type LifecycleState = 'PENDING_BACKEND' | 'PAUSE_CONFIRMED' | 'AUTHORITY_FENCED'
  | 'STOP_CONFIRMED' | 'CLEANUP_CONFIRMED' | 'STOP_FAILED' | 'STOP_UNKNOWN';
export type LifecycleReceipt = {
  schema: 'capability-control.lifecycle.v1'; kind: 'CONTROL_ACK'; authority: 'myeve';
  ownerId: string; organizationId: string; installationId: string; backendId: string;
  incarnation: string; enrollmentVersion: number; version: number; policyId: string;
  capabilityId: string; operation: 'pause' | 'revoke'; sequence: number;
  state: LifecycleState; observedAt: number; evidenceDigest: string;
  inventoryDigest: string; inventoryComplete: boolean;
};
export type SignedLifecycleReceipt = { message: string; keyId: string; signature: string };
export type LifecycleKey = { keyId: string; jwk: JsonWebKey };

const keys = ['schema', 'kind', 'authority', 'ownerId', 'organizationId', 'installationId',
  'backendId', 'incarnation', 'enrollmentVersion', 'version', 'policyId', 'capabilityId',
  'operation', 'sequence', 'state', 'observedAt', 'evidenceDigest', 'inventoryDigest', 'inventoryComplete'];
const numeric = new Set(['enrollmentVersion', 'version', 'sequence', 'observedAt']);
const states: LifecycleState[] = ['PENDING_BACKEND', 'PAUSE_CONFIRMED', 'AUTHORITY_FENCED',
  'STOP_CONFIRMED', 'CLEANUP_CONFIRMED', 'STOP_FAILED', 'STOP_UNKNOWN'];
const fail = (): never => { throw Error('CAPABILITY_LIFECYCLE_INVALID'); };

export function parseLifecycleReceipt(value: unknown): LifecycleReceipt {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail();
  const row = value as Record<string, unknown>;
  if (Object.keys(row).length !== keys.length || Object.keys(row).some(key => !keys.includes(key))) return fail();
  for (const key of keys) {
    if (key === 'inventoryComplete') { if (typeof row[key] !== 'boolean') return fail(); }
    else if (numeric.has(key)) { if (!Number.isSafeInteger(row[key]) || Number(row[key]) < 1) return fail(); }
    else if (typeof row[key] !== 'string' || !row[key].length || row[key].length > 255) return fail();
  }
  if (row.schema !== 'capability-control.lifecycle.v1' || row.kind !== 'CONTROL_ACK'
    || row.authority !== 'myeve' || !['pause', 'revoke'].includes(String(row.operation))
    || !states.includes(row.state as LifecycleState)
    || !/^[a-f0-9]{64}$/.test(String(row.evidenceDigest))
    || !/^[a-f0-9]{64}$/.test(String(row.inventoryDigest))) return fail();
  if (['PAUSE_CONFIRMED', 'STOP_CONFIRMED', 'CLEANUP_CONFIRMED'].includes(String(row.state))
    && row.inventoryComplete !== true) return fail();
  if ((row.operation === 'pause' && ['AUTHORITY_FENCED', 'STOP_CONFIRMED', 'CLEANUP_CONFIRMED'].includes(String(row.state)))
    || (row.operation === 'revoke' && row.state === 'PAUSE_CONFIRMED')) return fail();
  return Object.fromEntries(keys.map(key => [key, row[key]])) as LifecycleReceipt;
}

const bytes = (value: string) => new TextEncoder().encode(value);
export async function signLifecycleReceipt(value: LifecycleReceipt, key: LifecycleKey): Promise<SignedLifecycleReceipt> {
  const message = JSON.stringify(parseLifecycleReceipt(value));
  const privateKey = await crypto.subtle.importKey('jwk', key.jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, bytes(message));
  return { message, keyId: key.keyId, signature: btoa(String.fromCharCode(...new Uint8Array(signature))) };
}

export async function verifyLifecycleReceipt(envelope: SignedLifecycleReceipt, key: LifecycleKey, now = Date.now()) {
  if (!envelope || Object.keys(envelope).sort().join(',') !== 'keyId,message,signature'
    || envelope.keyId !== key.keyId || typeof envelope.message !== 'string' || envelope.message.length > 8192
    || typeof envelope.signature !== 'string' || envelope.signature.length > 128) return fail();
  const publicKey = await crypto.subtle.importKey('jwk', { kty: key.jwk.kty, crv: key.jwk.crv,
    x: key.jwk.x, y: key.jwk.y, ext: true }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  let signature: Uint8Array<ArrayBuffer>;
  try { signature = Uint8Array.from(atob(envelope.signature), char => char.charCodeAt(0)); } catch { return fail(); }
  if (!await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, publicKey, signature, bytes(envelope.message)))
    throw Error('CAPABILITY_LIFECYCLE_SIGNATURE');
  const receipt = parseLifecycleReceipt(JSON.parse(envelope.message));
  if (receipt.observedAt > now + 30_000) throw Error('CAPABILITY_LIFECYCLE_FUTURE');
  return receipt;
}

export function lifecycleComplete(receipt: LifecycleReceipt): boolean {
  return receipt.inventoryComplete && receipt.state === (receipt.operation === 'pause' ? 'PAUSE_CONFIRMED' : 'CLEANUP_CONFIRMED');
}
