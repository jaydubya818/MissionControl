import {it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {digest} from '../../packages/shared/src/factoryResult/factory-producer-protocol';
import {ownerResultFixture as fixture} from './ownerFactoryReadbackFixture';
it('verifies owner Result under exact signed Mission and original Factory request without alpha authority',()=>{
 const f=fixture(),result=f.run();expect(result.status).toBe('RESULT_VERIFIED_SETTLEMENT_REPORTED');expect(result.result?.independentVerdict).toBe('PASS');
 expect(result.executionAuthority).toBe('NONE');expect(result.enterpriseQualityGate).toBe('NOT_ESTABLISHED');
 expect(f.document.admission.authorityDocument).toBeUndefined();
});
for(const [name,edit] of Object.entries({
 'substituted command':(f:any)=>f.document.admission.binding.commandId=randomUUID(),
 'substituted receipt digest':(f:any)=>f.document.admission.binding.receiptSha256='b'.repeat(64),
 'substituted command and receipt':(f:any)=>{f.document.admission.binding.commandId=randomUUID();f.document.admission.binding.receiptSha256='c'.repeat(64);},
 'missing original receipt':(f:any)=>delete f.document.admission.admissionReceipt,
 'changed canonical receipt':(f:any)=>f.admissionEvidence.document.challenge='b'.repeat(64),
 'changed original signature':(f:any)=>{f.document.admission.admissionReceipt.signature='a'.repeat(86);f.document.admission.binding.receiptSha256=digest(f.document.admission.admissionReceipt);},
 'revoked admission key':(f:any)=>f.admissionEvidence.enrollment.permitKeys[0].revokedAt=f.now,
 'foreign owner':(f:any)=>f.document.admission.binding.origin.tupleMaterial.ownerId='other',
 'foreign Mission':(f:any)=>f.document.missionId='other',
 'foreign permit':(f:any)=>f.document.admission.binding.permitId='other',
 'foreign WorkOrder':(f:any)=>f.document.admission.binding.origin.workOrderId='other',
 'changed attempt':(f:any)=>f.document.admission.binding.factoryBinding.attemptNumber=2,
 'changed source':(f:any)=>f.document.admission.binding.factoryBinding.sourceDigest='e'.repeat(64),
 'changed profile':(f:any)=>f.pins.profileHash='e'.repeat(64),
 'changed writer':(f:any)=>f.document.admission.binding.writerGeneration=2,
 'foreign remote run':(f:any)=>f.document.admission.originalFactoryReadback.value.identity.remoteRunId=randomUUID(),
 'stale readback':(f:any)=>f.document.admission.originalFactoryReadback.backendObservedAt=new Date(f.now-31000).toISOString(),
 'future readback':(f:any)=>f.document.admission.originalFactoryReadback.backendObservedAt=new Date(f.now+1).toISOString(),
 'modified original Result':(f:any)=>f.document.result.signedResult.artifacts[0].base64='dGFtcGVy',
 'revoked producer key':(f:any)=>f.pins.resultKeys[0].revokedAt=new Date(f.now).toISOString(),
 'changed Proof':(f:any)=>f.document.result.proof.evidence[0].state='FAIL',
 'foreign criterion':(f:any)=>{f.document.result.proof.evidence[0].criterionId=randomUUID();f.document.result.proofHash=digest(f.document.result.proof);},
 'false settled UNKNOWN':(f:any)=>f.document.result.exposureUnknown=true,
 'failed refresh of old backend bytes':(f:any)=>{f.document.admission.originalFactoryReadback.value.state='BLOCKED';f.document.admission.originalFactoryReadback.observedAt=new Date(f.now).toISOString();},
 'false stopped resource':(f:any)=>f.document.admission.originalFactoryReadback.value.quiescent=false,
 'over-ceiling accounting':(f:any)=>{f.document.result.accounting.sofieMicrousd=f.permit.admission.maxCostMicrousd+1;f.document.result.accounting.settledMicrousd=f.permit.admission.maxCostMicrousd+1;},
}))it(`rejects owner Result ${name}`,()=>{const f=fixture();edit(f);expect(f.run).toThrow();});
it('preserves owner UNKNOWN and cleanup pending without changing original producer signature or Proof',()=>{
 const f=fixture(),signature=f.document.result.signedResult.signature,proofHash=f.document.result.proofHash;
 f.document.status='PENDING';f.document.result.settlementState='PENDING';f.document.result.exposureUnknown=true;f.document.result.cleanupConfirmed=false;
 const result=f.run();expect(result.status).toBe('RESULT_VERIFIED_PENDING_REPORTED');expect(result.result?.exposureUnknown).toBe(true);expect(result.result?.cleanupConfirmed).toBe(false);
 expect(f.document.result.signedResult.signature).toBe(signature);expect(f.document.result.proofHash).toBe(proofHash);
});

it('preserves historical admission evidence signed by an expired unrevoked key',()=>{const f=fixture();f.admissionEvidence.enrollment.permitKeys[0].notAfter=f.admissionEvidence.document.expiresAt;const result=f.run();expect(result.executionAuthority).toBe('NONE');expect(result.status).toBe('RESULT_VERIFIED_SETTLEMENT_REPORTED');});
