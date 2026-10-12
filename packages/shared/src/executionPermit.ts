import { sha256Hex } from './canonicalDigest';

export interface PermitWork { id: string; version: number; generation: number; tupleSha256: string }
export interface PermitAdmission { factoryVersion: string; executionContractSha256: string; capabilityPolicySha256: string; maxCostMicrousd: number; maxDurationSeconds: number }
export interface ExecutionPermit {
  schema: 'mc-execution-permit/v1'; permitId: string; issuer: string; audience: string;
  issuedAt: number; expiresAt: number; installationId: string; connectionId: string;
  enrollmentRevision: number; ownerId: string; ownerSubject: string; missionControlOwnerId: string;
  tenantId: string; projectId: string; missionId: string; planId: string; planDigest: string;
  workOrderId: string; workOrderRevisionId: string; approvalId: string; approvalDigest: string;
  work: PermitWork; admission: PermitAdmission;
}
export interface OwnerEnrollment extends PermitAdmission {
  schema: 'mc-owner-enrollment/v1'; environment: 'APPROVED_NONPRODUCTION'; installationId: string;
  revision: number; ownerId: string; ownerSubject: string; missionControlOwnerId: string;
  tenantId: string; projectId: string; connectionId: string; issuer: string; audience: string;
  clerkIssuer: string; clerkAudience: string; clerkAuthorizedParty: string;
  activeFrom: number; expiresAt: number; revokedAt: number | null;
  permitKeys: { keyId: string; publicKey: string; activeFrom: number; notAfter: number; revokedAt: number | null }[];
}
export interface AdmissionChallenge { schema: 'mc-admission-challenge/v1'; connectionId: string; permitId: string; permitSha256: string; challenge: string; work: PermitWork; capabilityPermits: {myeve:{message:string;keyId:string;signature:string};relay:{message:string;keyId:string;signature:string}} }
export type AdmissionReceipt = Omit<ExecutionPermit, 'schema' | 'admission'> & {
  schema: 'mc-admission-receipt/v1'; commandId: string; challenge: string; permitSha256: string; policyPairSha256: string;
};
export type PermitControlDelivery = {schema:'mc-permit-control/v1';issuedAt:number;expiresAt:number;[key:string]:unknown};
export type SignedPermit<T = ExecutionPermit> = { document: T; keyId: string; signature: string };
export const permitDenied = (): never => { throw Error('MISSIONCONTROL_PERMIT_DENIED'); };
const id = (v: unknown) => typeof v === 'string' && v.length > 0 && v.length <= 200 && v === v.trim() && !/[\u0000-\u001f\u007f]/.test(v);
const sha = (v: unknown) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const digest = (v: unknown) => typeof v === 'string' && /^sha256:[a-f0-9]{64}$/.test(v);
const positive = (v: unknown) => Number.isSafeInteger(v) && Number(v) > 0;
const timestamp = (v: unknown) => Number.isSafeInteger(v) && Number(v) >= 0;
const nullableTimestamp = (v: unknown) => v === null || timestamp(v);
export function permitOrigin(value: unknown): boolean {
  if (typeof value !== 'string' || value.length > 500) return false;
  try { const u = new URL(value); return u.origin === value && u.protocol === 'https:' && !u.username && !u.password && !u.port
    && u.hostname.includes('.') && !u.hostname.endsWith('.localhost') && !/^\d+\.\d+\.\d+\.\d+$/.test(u.hostname); } catch { return false; }
}
type Check = (v: unknown) => boolean;
function strict(value: unknown, fields: Record<string, Check>): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return permitDenied();
  const row = value as Record<string, unknown>;
  if (Object.keys(row).length !== Object.keys(fields).length || Object.entries(fields).some(([k, check]) => !Object.prototype.hasOwnProperty.call(row, k) || !check(row[k]))) return permitDenied();
  return row;
}
const workFields = { id, version: positive, generation: positive, tupleSha256: sha };
const admissionFields = { factoryVersion: sha, executionContractSha256: sha, capabilityPolicySha256: sha, maxCostMicrousd: positive, maxDurationSeconds: positive };
export function parsePermitWork(v: unknown): PermitWork { return strict(v, workFields) as unknown as PermitWork; }
export function parsePermitAdmission(v: unknown): PermitAdmission { return strict(v, admissionFields) as unknown as PermitAdmission; }
const permitFields = { schema: (v: unknown) => v === 'mc-execution-permit/v1', permitId: id, issuer: permitOrigin, audience: permitOrigin,
  issuedAt: timestamp, expiresAt: timestamp, installationId: id, connectionId: id, enrollmentRevision: positive, ownerId: id,
  ownerSubject: id, missionControlOwnerId: id, tenantId: id, projectId: id, missionId: id, planId: id, planDigest: digest,
  workOrderId: id, workOrderRevisionId: id, approvalId: id, approvalDigest: digest,
  work: (v: unknown) => Boolean(parsePermitWork(v)), admission: (v: unknown) => Boolean(parsePermitAdmission(v)) };
export function parseExecutionPermit(value: unknown): ExecutionPermit { return strict(value, permitFields) as unknown as ExecutionPermit; }
export function parseOwnerEnrollment(value: unknown): OwnerEnrollment {
  return strict(value, { ...admissionFields, schema: v => v === 'mc-owner-enrollment/v1', environment: v => v === 'APPROVED_NONPRODUCTION',
    installationId: id, revision: positive, ownerId: id, ownerSubject: id, missionControlOwnerId: id, tenantId: id, projectId: id,
    connectionId: id, issuer: permitOrigin, audience: permitOrigin, clerkIssuer: permitOrigin, clerkAudience: id, clerkAuthorizedParty: permitOrigin,
    activeFrom: timestamp, expiresAt: timestamp, revokedAt: nullableTimestamp, permitKeys: v => Array.isArray(v) && v.length > 0 && v.length <= 4
      && v.every(k => Boolean(strict(k, { keyId: sha, publicKey: p => typeof p === 'string' && p.length > 0 && p.length <= 2000,
        activeFrom: timestamp, notAfter: timestamp, revokedAt: nullableTimestamp })))
      && new Set(v.map(k => k.keyId)).size === v.length }) as unknown as OwnerEnrollment;
}
export function parseAdmissionChallenge(value: unknown): AdmissionChallenge {
  const envelope = (v: unknown) => Boolean(strict(v,{message:x=>typeof x==='string'&&x.length<=16384,keyId:id,signature:x=>typeof x==='string'&&x.length<=2000}));
  return strict(value, { schema: v => v === 'mc-admission-challenge/v1', connectionId: id, permitId: id, permitSha256: sha,
    challenge: v => typeof v === 'string' && /^[a-f0-9]{32,128}$/.test(v), work: v => Boolean(parsePermitWork(v)), capabilityPermits: v=>Boolean(strict(v,{myeve:envelope,relay:envelope})) }) as unknown as AdmissionChallenge;
}
export function canonicalPermitJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalPermitJson).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalPermitJson(item)}`).join(',')}}`;
  const encoded = JSON.stringify(value); if (encoded === undefined) return permitDenied(); return encoded;
}
export const permitSigningText = (document: ExecutionPermit | AdmissionReceipt | PermitControlDelivery) => `${document.schema}\n${canonicalPermitJson(document)}`;
export const permitDigest = (document: ExecutionPermit) => sha256Hex(permitSigningText(document));
export function requirePermitEnrollment(document: ExecutionPermit, enrollment: OwnerEnrollment, now: number) {
  if (!timestamp(now) || enrollment.revokedAt !== null || enrollment.activeFrom > now || enrollment.expiresAt <= now
    || document.issuedAt > now || document.expiresAt <= now || document.expiresAt <= document.issuedAt
    || document.expiresAt - document.issuedAt > 300000 || document.expiresAt > enrollment.expiresAt
    || document.enrollmentRevision !== enrollment.revision || document.admission.maxCostMicrousd > 1300000
    || document.admission.maxDurationSeconds > 180) return permitDenied();
  const fields = ['ownerId','ownerSubject','missionControlOwnerId','installationId','connectionId','tenantId','projectId','issuer','audience'] as const;
  if (fields.some(field => document[field] !== enrollment[field])
    || (['factoryVersion','executionContractSha256','capabilityPolicySha256'] as const).some(field => document.admission[field] !== enrollment[field])
    || document.admission.maxCostMicrousd > enrollment.maxCostMicrousd || document.admission.maxDurationSeconds > enrollment.maxDurationSeconds) return permitDenied();
}
export function admissionReceipt(document: ExecutionPermit, request: AdmissionChallenge, commandId: string, expiresAt: number, now: number): AdmissionReceipt {
  if (request.connectionId !== document.connectionId || request.permitId !== document.permitId || request.permitSha256 !== permitDigest(document)
    || canonicalPermitJson(request.work) !== canonicalPermitJson(document.work) || !id(commandId) || expiresAt <= now) return permitDenied();
  const { admission: _, schema: __, ...identity } = document;
  return { ...identity, schema: 'mc-admission-receipt/v1', commandId, challenge: request.challenge, permitSha256: request.permitSha256,
    policyPairSha256: sha256Hex(canonicalPermitJson(request.capabilityPermits)), issuedAt: now, expiresAt: Math.min(expiresAt, document.expiresAt, now + 10000) };
}
