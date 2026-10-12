import {it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {digest} from '../../packages/shared/src/factoryResult/factory-producer-protocol';
import {verifyResultReadbackPacket} from '../lib/installedFactoryResult';
import {factoryReadbackFixture as fixture} from './installedFactoryReadbackFixture';
it('independently verifies signed receipt, current readback, Result artifacts and per-criterion Proof without promoting completion',()=>{const f=fixture(),r=f.run();expect(r.status).toBe('VERIFIED_SETTLED');expect(r.result?.independentVerdict).toBe('PASS');expect(r.result?.proofOutcome).toBe('PARTIAL');expect(r.enterpriseQualityGate).toBe('NOT_ESTABLISHED');expect(r.executionAuthority).toBe('NONE');});
for(const [name,edit] of Object.entries({
 'foreign Mission':(f:any)=>f.document.missionId='foreign','foreign owner':(f:any)=>f.document.ownerId='foreign','foreign installation':(f:any)=>f.document.installationId='foreign',
 'different command':(f:any)=>f.document.commandId='foreign','different challenge':(f:any)=>f.document.challenge='d'.repeat(64),'expired response':(f:any)=>f.document.expiresAt=f.now,
 'foreign authority':(f:any)=>f.document.admission.authorityDocument.ownerId='foreign','wrong run from untrusted Result':(f:any)=>f.document.admission.runId='foreign',
 'wrong Factory WorkOrder':(f:any)=>f.document.admission.factoryWorkOrderId=randomUUID(),'wrong request':(f:any)=>f.document.admission.requestDigest='e'.repeat(64),
 'tampered receipt':(f:any)=>f.readback.authorityReceipt.workOrderId=randomUUID(),'tampered readback':(f:any)=>f.attestation.quiescent=false,
 'tampered artifact':(f:any)=>f.document.result.signedResult.artifacts[0].base64=Buffer.from('tampered').toString('base64'),
 'changed source pins':(f:any)=>f.pins.sourceDigest='e'.repeat(64),'changed verifier pins':(f:any)=>f.pins.verifierPolicySha256='e'.repeat(64),
 'revoked Result key':(f:any)=>f.pins.resultKeys[0].revokedAt=new Date(f.now).toISOString(),
 'changed immutable Proof':(f:any)=>f.document.result.proof.evidence[0].contentHash='sha256:'+'e'.repeat(64),
 'false completion Proof':(f:any)=>{f.document.result.proof.outcome='COMPLETED';f.document.result.proofHash=digest(f.document.result.proof);},
 'false settled UNKNOWN exposure':(f:any)=>f.document.result.exposureUnknown=true,
 'false settled reserved exposure':(f:any)=>f.document.result.accounting.reservedMicrousd=10,
 'future Factory attestation':(f:any)=>{f.attestation.issuedAt=new Date(f.now+1000).toISOString();f.readback.readbackSignature=f.factorySign('MYFACTORY_EXTERNAL_ALPHA_READBACK_V1',f.attestation);},
 'stale Factory evidence despite fresh MyEve HMAC':(f:any)=>{f.attestation.issuedAt=new Date(f.now-180000).toISOString();f.attestation.expiresAt=new Date(f.now-60000).toISOString();f.readback.readbackSignature=f.factorySign('MYFACTORY_EXTERNAL_ALPHA_READBACK_V1',f.attestation);},
}))it(`rejects ${name}`,()=>{const f=fixture();edit(f);expect(f.run).toThrow();});
it('keeps authenticated UNKNOWN exposure pending without settling or declaring cleanup',()=>{const f=fixture();f.document.status='PENDING';f.document.result.exposureUnknown=true;f.document.result.cleanupConfirmed=false;f.document.result.settlementState='PENDING';f.document.result.accounting.unknownMicrousd=100;const r=f.run();expect(r.status).toBe('VERIFIED_PENDING');expect(r.result?.exposureUnknown).toBe(true);expect(r.result?.cleanupConfirmed).toBe(false);});
it('requires exact service HMAC even for an otherwise valid packet',()=>{const f=fixture();expect(()=>verifyResultReadbackPacket(f.packet(),f.request,f.permit,'x'.repeat(32),f.now)).toThrow();});

it('does not report cleanup confirmed when signed Factory says non-quiescent',()=>{const f=fixture();f.document.status='PENDING';f.attestation.quiescent=false;f.readback.readbackSignature=f.factorySign('MYFACTORY_EXTERNAL_ALPHA_READBACK_V1',f.attestation);const result=f.run();expect(result.status).toBe('VERIFIED_PENDING');expect(result.result?.cleanupConfirmed).toBe(false);});
it('rejects an inconsistent MyEve accounting projection instead of claiming reconciliation',()=>{const f=fixture();f.document.result.accounting.settledMicrousd=f.permit.admission.maxCostMicrousd+1;expect(f.run).toThrow();});

it('bounds current Result evidence by signing key expiry inside response lifetime',()=>{const f=fixture();f.pins.resultKeys[0].notAfter=new Date(f.now+5000).toISOString();expect(f.run().expiresAt).toBe(f.now+5000);});
