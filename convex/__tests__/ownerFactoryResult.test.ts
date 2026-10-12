import {it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {factoryReadbackFixture} from './installedFactoryReadbackFixture';
import {digest} from '../../packages/shared/src/factoryResult/factory-producer-protocol';
import {permitDigest} from '../../packages/shared/src/executionPermit';
import {parseFactoryResultPins,resultSignature,verifyResultReadbackPacket,verifyInstalledFactoryResult} from '../lib/installedFactoryResult';

/** Original Gate C signed producer envelope; owner provenance is a separate contract. */
function fixture(){
 const f=factoryReadbackFixture(),old=f.document.admission,manifest=JSON.parse(Buffer.from(f.document.result.signedResult.encoded,'base64url').toString());
 const profileHash='1'.repeat(64),pins=parseFactoryResultPins({schema:'mc-owner-factory-result-pins/v1',factoryId:f.pins.factoryId,
  sourceDigest:f.pins.sourceDigest,configurationDigest:f.pins.configurationDigest,profileHash,verifierPolicySha256:f.pins.verifierPolicySha256,
  resultKeys:f.pins.resultKeys,checkCommands:f.pins.checkCommands,allowedFiles:f.pins.allowedFiles});
 const material={schema:'mc-owner-factory-work/v1',ownerId:f.permit.ownerId,installationId:f.permit.installationId,
  connectionId:f.permit.connectionId,workId:f.permit.work.id,version:f.permit.work.version,generation:f.permit.work.generation,
  criteriaVersion:1,title:'Owner Work',objective:'Bounded qualified task',criteria:f.document.result.proof.evidence.map(item=>({id:item.criterionId,statement:'bounded criterion',method:'test'})),
  repository:'fixture/owner',maxCostUsd:f.permit.admission.maxCostMicrousd/1e6,maxDurationSeconds:f.permit.admission.maxDurationSeconds,
  factoryVersion:f.permit.admission.factoryVersion,executionContractSha256:f.permit.admission.executionContractSha256,
  capabilityPolicySha256:f.permit.admission.capabilityPolicySha256,pins:{factoryId:pins.factoryId,sourceDigest:pins.sourceDigest,
    configurationDigest:pins.configurationDigest,configurationHash:'2'.repeat(64),profileHash,repository:'fixture/owner',agentId:'owner-agent'}};
 f.permit.work.tupleSha256=digest(material);f.document.permitSha256=permitDigest(f.permit);
 const origin={schema:'mc-owner-factory-origin/v1',installationId:f.permit.installationId,connectionId:f.permit.connectionId,
  tupleSha256:f.permit.work.tupleSha256,tupleMaterial:material,factoryVersion:f.permit.admission.factoryVersion,pins:material.pins,
  proposalId:'proposal',workOrderId:f.permit.workOrderId,expectedWorkOrderRevisionId:f.permit.workOrderRevisionId,expectedPlanDigest:f.permit.planDigest};
 const q={factoryId:pins.factoryId,workId:f.permit.work.id,workVersion:f.permit.work.version,workGeneration:f.permit.work.generation,
  criteriaVersion:1,agentId:'owner-agent',requestId:old.requestId,requestDigest:old.requestDigest,workOrderId:old.factoryWorkOrderId,runId:old.runId,
  attemptNumber:1,inputCommit:manifest.execution.inputCommit,factoryVersion:f.permit.admission.factoryVersion,sourceDigest:pins.sourceDigest,configurationDigest:pins.configurationDigest};
 const runId=randomUUID(),dispatchIdentity=randomUUID();
 const identity={runId,writerGeneration:1,dispatchIdentity,workId:q.workId,workGeneration:q.workGeneration,factoryId:q.factoryId,factoryVersion:q.factoryVersion,
  requestId:q.requestId,workOrderId:q.workOrderId,remoteRunId:q.runId,repository:material.repository,baseSha:q.inputCommit,allowedPaths:pins.allowedFiles,deadline:old.admittedDeadline};
 const binding={schema:'mc-owner-factory-admission/v1',origin,permitId:f.permit.permitId,permitSha256:permitDigest(f.permit),
  commandId:randomUUID(),receiptSha256:'a'.repeat(64),factoryRequestId:dispatchIdentity,factoryBinding:q,routeDecisionId:randomUUID(),routeRunId:runId,writerGeneration:1,dispatchIdentity};
 const observation={observedAt:new Date(f.now).toISOString(),backendObservedAt:new Date(f.now).toISOString(),value:{identity,spend:f.attestation.spend,quiescent:true,state:'COMPLETED'}};
 const proof=structuredClone(f.document.result.proof);
 for(const e of proof.evidence)e.sourceRef=`native-verification:${q.workId}:${manifest.candidate.commit}:${e.criterionId}`;
 const result={signedResult:f.document.result.signedResult,resultId:f.document.result.resultId,manifestDigest:f.document.result.manifestDigest,
  nativeResultId:randomUUID(),proof,proofHash:digest(proof),cleanupConfirmed:true,settlementState:'SETTLED',exposureUnknown:false,
  accounting:{currency:'USD',unit:'microUSD',observedAt:new Date(f.now).toISOString(),sofieMicrousd:0,nativeMicrousd:0,factoryMicrousd:0,
   settledMicrousd:0,reservedMicrousd:0,unknownExposureMicrousd:0,coverage:'COMPLETE',externalCharges:'NOT_REPRESENTED'},acceptance:null};
 const document:any={...f.document,admission:{schema:'mc-owner-factory-admission/v1',binding,originalFactoryReadback:observation,
  dispatchState:'TERMINAL',quiescence:{...identity,state:'COMPLETED',quiescent:true,evidenceRef:'qualified'},fencedAt:new Date(f.now).toISOString()},result};
 const run=()=>verifyInstalledFactoryResult(verifyResultReadbackPacket({document,signature:resultSignature(document,'mc-result-readback/v1',f.secret)},f.request,f.permit,f.secret,f.now),f.permit,pins,f.now);
 return {...f,pins,document,run};
}
it('verifies owner Result under exact signed Mission and original Factory request without alpha authority',()=>{
 const f=fixture(),result=f.run();expect(result.status).toBe('VERIFIED_SETTLED');expect(result.result?.independentVerdict).toBe('PASS');
 expect(result.executionAuthority).toBe('NONE');expect(result.enterpriseQualityGate).toBe('NOT_ESTABLISHED');
 expect(f.document.admission.authorityDocument).toBeUndefined();
});
for(const [name,edit] of Object.entries({
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
 const result=f.run();expect(result.status).toBe('VERIFIED_PENDING');expect(result.result?.exposureUnknown).toBe(true);expect(result.result?.cleanupConfirmed).toBe(false);
 expect(f.document.result.signedResult.signature).toBe(signature);expect(f.document.result.proofHash).toBe(proofHash);
});
