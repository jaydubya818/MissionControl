export type PolicyIdentity = {
  authority: 'myeve' | 'relay'; ownerId: string; organizationId: string;
  installationId: string; backendId: string; incarnation: string;
  enrollmentVersion: number; version: number; policyId: string;
};
export type Fence = PolicyIdentity & {
  kind: 'FENCE'; capabilityId: string; operation: 'enable' | 'disable' | 'pause' | 'revoke' | 'set_budget';
};
export type FenceAck = PolicyIdentity & { kind: 'FENCE_ACK'; fenceHash: string };
export type AdmissionPermit = PolicyIdentity & {
  kind: 'PERMIT'; referenceId: string; capabilityId: string; requiredCapabilities: string[];
  registryVersion: string; agentId: string; agentRevision: number; workId: string;
  missionId: string; workGeneration: number; actionDigest: string; budgetMicros: number;
  issuedAt: number; expiresAt: number;
  sourcePermitHash: string;
};
export type PolicyMessage = Fence | FenceAck | AdmissionPermit;
export type SignedPolicyMessage = { message: string; keyId: string; signature: string };
export type PolicyKey = { keyId: string; jwk: JsonWebKey };

const identityKeys = ['authority', 'ownerId', 'organizationId', 'installationId', 'backendId',
  'incarnation', 'enrollmentVersion', 'version', 'policyId'];
const fields = {
  FENCE: ['capabilityId', 'operation'], FENCE_ACK: ['fenceHash'],
  PERMIT: ['referenceId', 'capabilityId', 'requiredCapabilities', 'registryVersion', 'agentId',
    'agentRevision', 'workId', 'missionId', 'workGeneration', 'actionDigest', 'budgetMicros', 'issuedAt', 'expiresAt', 'sourcePermitHash'],
};
const numeric = new Set(['enrollmentVersion', 'version', 'agentRevision', 'workGeneration', 'budgetMicros', 'issuedAt', 'expiresAt']);
const fail = (): never => { throw new Error('CAPABILITY_PROTOCOL_INVALID'); };
export function parsePolicyMessage(value: unknown): PolicyMessage {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail();
  const row = value as Record<string, unknown>;
  if (!Object.prototype.hasOwnProperty.call(fields, String(row.kind))) return fail();
  const keys = ['kind', ...identityKeys, ...fields[row.kind as keyof typeof fields]];
  if (Object.keys(row).length !== keys.length || Object.keys(row).some(key => !keys.includes(key))) return fail();
  for (const key of keys) {
    if (key === 'requiredCapabilities') {
      if (!Array.isArray(row[key]) || !row[key].length || row[key].length > 36
        || row[key].some(item => typeof item !== 'string' || !item.length || item.length > 100)
        || new Set(row[key]).size !== row[key].length) return fail();
    } else if (numeric.has(key)) {
      if (!Number.isSafeInteger(row[key]) || Number(row[key]) < (['budgetMicros', 'agentRevision'].includes(key) ? 0 : 1)) return fail();
    } else if (typeof row[key] !== 'string' || !row[key].length || row[key].length > 255) return fail();
  }
  if (!['myeve', 'relay'].includes(String(row.authority))) return fail();
  if (row.kind === 'FENCE' && !['enable', 'disable', 'pause', 'revoke', 'set_budget'].includes(String(row.operation))) return fail();
  if (row.kind === 'PERMIT' && (!(row.requiredCapabilities as string[]).includes(String(row.capabilityId))
    || !(row.requiredCapabilities as string[]).includes('work') || Number(row.budgetMicros) > 1e12
    || Number(row.expiresAt) <= Number(row.issuedAt) || Number(row.expiresAt) - Number(row.issuedAt) > 30_000
    || !/^[a-f0-9]{64}$/.test(String(row.actionDigest)))) return fail();
  if (row.kind === 'FENCE_ACK' && !/^[a-f0-9]{64}$/.test(String(row.fenceHash))) return fail();
  if (row.kind === 'PERMIT' && (row.authority === 'myeve' ? row.sourcePermitHash !== 'SELF'
    : !/^[a-f0-9]{64}$/.test(String(row.sourcePermitHash)))) return fail();
  return Object.fromEntries(keys.map(key => [key, row[key]])) as PolicyMessage;
}
const bytes = (text: string) => new TextEncoder().encode(text);
const encode = (value: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(value)));
const decode = (value: string) => Uint8Array.from(atob(value), char => char.charCodeAt(0));
export async function admissionActionDigest(value: unknown): Promise<string> {
  const canonical = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(canonical);
    if (item && typeof item === 'object') return Object.fromEntries(Object.entries(item)
      .filter(([, child]) => child !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([key, child]) => [key, canonical(child)]));
    return item;
  };
  const digest = await crypto.subtle.digest('SHA-256', bytes(JSON.stringify(canonical(value))));
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
}
export async function policyMessageHash(message: PolicyMessage) {
  const hash = await crypto.subtle.digest('SHA-256', bytes(JSON.stringify(parsePolicyMessage(message))));
  return [...new Uint8Array(hash)].map(value => value.toString(16).padStart(2, '0')).join('');
}
export async function signPolicyMessage(value: PolicyMessage, key: PolicyKey): Promise<SignedPolicyMessage> {
  const message = JSON.stringify(parsePolicyMessage(value));
  const privateKey = await crypto.subtle.importKey('jwk', key.jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  return { message, keyId: key.keyId, signature: encode(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, bytes(message))) };
}
export async function verifyPolicyMessage(envelope: SignedPolicyMessage, key: PolicyKey): Promise<PolicyMessage> {
  if (!envelope || Object.keys(envelope).sort().join(',') !== 'keyId,message,signature'
    || envelope.keyId !== key.keyId || typeof envelope.message !== 'string' || envelope.message.length > 16_384
    || typeof envelope.signature !== 'string' || envelope.signature.length > 128) return fail();
  const publicKey = await crypto.subtle.importKey('jwk', { kty: key.jwk.kty, crv: key.jwk.crv,
    x: key.jwk.x, y: key.jwk.y, ext: true }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  if (!await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, publicKey, decode(envelope.signature), bytes(envelope.message)))
    throw new Error('CAPABILITY_SIGNATURE_INVALID');
  return parsePolicyMessage(JSON.parse(envelope.message));
}
export function assertPolicyIdentity(actual: PolicyIdentity, expected: PolicyIdentity) {
  if (identityKeys.some(key => actual[key as keyof PolicyIdentity] !== expected[key as keyof PolicyIdentity]))
    throw new Error('CAPABILITY_POLICY_IDENTITY_MISMATCH');
}
