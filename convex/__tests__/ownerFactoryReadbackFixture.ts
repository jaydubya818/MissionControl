import {randomUUID} from 'node:crypto';
import {permitFixture} from './executionPermitFixture';
import {signPermitDocument} from '../lib/executionPermitCrypto';
import {factoryReadbackFixture} from './installedFactoryReadbackFixture';
import {digest} from '../../packages/shared/src/factoryResult/factory-producer-protocol';
import {permitDigest,admissionReceipt} from '../../packages/shared/src/executionPermit';
import {parseFactoryResultPins,resultSignature,verifyResultReadbackPacket,verifyInstalledFactoryResult} from '../lib/installedFactoryResult';

/** Original Gate C signed producer envelope; owner provenance is a separate contract. */
export function ownerResultFixture(){
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
 const signing=permitFixture();
 signing.enrollment.permitKeys[0].activeFrom=f.now-120000;
 signing.enrollment.permitKeys[0].notAfter=f.now+600000;
 const receipt=admissionReceipt(f.permit,{schema:'mc-admission-challenge/v1',connectionId:f.permit.connectionId,permitId:f.permit.permitId,
  permitSha256:permitDigest(f.permit),challenge:'f'.repeat(64),work:f.permit.work,capabilityPermits:{} as any},binding.commandId,f.now-40000,f.now-50000);
 const originalReceipt=signPermitDocument(receipt,signing.enrollment,signing.privateKey);
 binding.receiptSha256=digest(originalReceipt);
 const admissionEvidence={document:structuredClone(receipt),enrollment:signing.enrollment};
 const observation={observedAt:new Date(f.now).toISOString(),backendObservedAt:new Date(f.now).toISOString(),value:{identity,spend:f.attestation.spend,quiescent:true,state:'COMPLETED'}};
 const proof=structuredClone(f.document.result.proof);
 for(const e of proof.evidence)e.sourceRef=`native-verification:${q.workId}:${manifest.candidate.commit}:${e.criterionId}`;
 const result={signedResult:f.document.result.signedResult,resultId:f.document.result.resultId,manifestDigest:f.document.result.manifestDigest,
  nativeResultId:randomUUID(),proof,proofHash:digest(proof),cleanupConfirmed:true,settlementState:'SETTLED',exposureUnknown:false,
  accounting:{currency:'USD',unit:'microUSD',observedAt:new Date(f.now).toISOString(),sofieMicrousd:0,nativeMicrousd:0,factoryMicrousd:0,
   settledMicrousd:0,reservedMicrousd:0,unknownExposureMicrousd:0,coverage:'COMPLETE',externalCharges:'NOT_REPRESENTED'},acceptance:null};
 const document:any={...f.document,admission:{schema:'mc-owner-factory-admission/v1',binding,admissionReceipt:originalReceipt,originalFactoryReadback:observation,
  dispatchState:'TERMINAL',quiescence:{...identity,state:'COMPLETED',quiescent:true,evidenceRef:'qualified'},fencedAt:new Date(f.now).toISOString()},result};
 const run=()=>verifyInstalledFactoryResult(verifyResultReadbackPacket({document,signature:resultSignature(document,'mc-result-readback/v1',f.secret)},f.request,f.permit,f.secret,f.now),f.permit,pins,f.now,admissionEvidence);
 return {...f,pins,document,run,admissionEvidence};
}
