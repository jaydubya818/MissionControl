import { describe,it,expect } from 'vitest';
import { generateKeyPairSync,createHash,verify } from 'node:crypto';
import { admissionReceipt,canonicalPermitJson,parseExecutionPermit,parseOwnerEnrollment,parseAdmissionChallenge,permitDigest,permitSigningText,requirePermitEnrollment } from '../../packages/shared/src/executionPermit';
import {signPermitDocument,verifyPermitSignature} from '../lib/executionPermitCrypto';
import {permitFixture} from './executionPermitFixture';
describe('installed permit wire',()=>{
 it('signs exact consumer canonical bytes and validates pinned Ed25519',()=>{const f=permitFixture(),e=signPermitDocument(f.document,f.enrollment,f.privateKey);
 expect(verify(null,Buffer.from('mc-execution-permit/v1\n'+canonicalPermitJson(f.document)),f.publicKey,Buffer.from(e.signature,'base64url'))).toBe(true);
 expect(e.signature).toHaveLength(86);expect(()=>verifyPermitSignature(e,f.enrollment)).not.toThrow();requirePermitEnrollment(e.document,f.enrollment,f.now);
 expect(permitDigest(f.document)).toBe(createHash('sha256').update(permitSigningText(f.document)).digest('hex'));
 });
 it.each(['ownerId','ownerSubject','missionControlOwnerId','installationId','connectionId','projectId','tenantId','issuer','audience'] as const)('denies foreign %s',field=>{const f=permitFixture();(f.document as any)[field]='foreign';expect(()=>requirePermitEnrollment(f.document,f.enrollment,f.now)).toThrow();});
 it.each(['factoryVersion','executionContractSha256','capabilityPolicySha256'] as const)('denies changed %s',field=>{const f=permitFixture();f.document.admission[field]='b'.repeat(64);expect(()=>requirePermitEnrollment(f.document,f.enrollment,f.now)).toThrow();});
 it('denies stale incarnation, expiry, revocation and raised limits',()=>{for(const change of [ (f:any)=>f.document.enrollmentRevision++, (f:any)=>f.enrollment.revokedAt=f.now,
 (f:any)=>f.document.expiresAt=f.now, (f:any)=>f.document.issuedAt++, (f:any)=>f.document.admission.maxCostMicrousd++, (f:any)=>f.document.admission.maxDurationSeconds++]){const f=permitFixture();change(f);expect(()=>requirePermitEnrollment(f.document,f.enrollment,f.now)).toThrow();}});
 it('rejects unknown keys, noninteger versions and non-HTTPS origins',()=>{const f=permitFixture();for(const d of [{...f.document,extra:true},{...f.document,issuer:'http://localhost:3210'},{...f.document,work:{...f.document.work,version:1.5}}])expect(()=>parseExecutionPermit(d)).toThrow();});
 it('denies changed signatures, key substitution and revoked signer',()=>{const f=permitFixture(),e=signPermitDocument(f.document,f.enrollment,f.privateKey);e.document={...e.document,work:{...e.document.work,generation:2}};expect(()=>verifyPermitSignature(e,f.enrollment)).toThrow();f.enrollment.permitKeys[0].revokedAt=f.now;expect(()=>signPermitDocument(f.document,f.enrollment,f.privateKey)).toThrow();});
 it('binds current admission to unique challenge, permit and Work for at most ten seconds',()=>{const f=permitFixture();const r=parseAdmissionChallenge({schema:'mc-admission-challenge/v1',connectionId:'connection',permitId:'permit',permitSha256:permitDigest(f.document),challenge:'c'.repeat(32),work:f.document.work,capabilityPermits:{myeve:{message:'{}',keyId:'key',signature:'sig'},relay:{message:'{}',keyId:'key',signature:'sig'}}});
 const receipt=admissionReceipt(f.document,r,'command',f.now+50000,f.now);expect(receipt.expiresAt).toBe(f.now+10000);expect(receipt.challenge).toBe(r.challenge);
 expect(()=>admissionReceipt(f.document,{...r,work:{...r.work,generation:2}},'command',f.now+1000,f.now)).toThrow();
 expect(()=>admissionReceipt(f.document,{...r,permitSha256:'d'.repeat(64)},'command',f.now+1000,f.now)).toThrow();
 expect(()=>verifyPermitSignature(signPermitDocument(receipt,f.enrollment,f.privateKey),f.enrollment)).not.toThrow();});
});
