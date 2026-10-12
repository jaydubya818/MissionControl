'use node';
import {createPublicKey} from 'node:crypto';
import {verifyPermitSignature} from './executionPermitCrypto';
import {canonicalPermitJson,permitDigest,type ExecutionPermit,type AdmissionReceipt,type OwnerEnrollment} from '../../packages/shared/src/executionPermit';
import {digest,verifyResult,type ResultKey,MAX_RESULT_BYTES} from '../../packages/shared/src/factoryResult/factory-producer-protocol';
import {workSpendV2Schema,validateSpendBinding} from '../../packages/shared/src/factoryResult/factory-spend';

export interface OwnerFactoryResultPins {
 schema:'mc-owner-factory-result-pins/v1';factoryId:string;sourceDigest:string;configurationDigest:string;
 profileHash:string;verifierPolicySha256:string;resultKeys:ResultKey[];checkCommands:string[];allowedFiles:string[];
}
export interface OwnerAdmissionEvidence {document:AdmissionReceipt;enrollment:OwnerEnrollment}

const deny=():never=>{throw Error('INSTALLED_OWNER_FACTORY_RESULT_UNVERIFIED');};
const object=(v:any):Record<string,any>=>v&&typeof v==='object'&&!Array.isArray(v)?v:deny();
const exact=(v:any,fields:string[])=>{if(Object.keys(object(v)).sort().join(',')!==fields.sort().join(','))deny();};
const hash=(v:any)=>{if(typeof v!=='string'||!/^[a-f0-9]{64}$/.test(v))deny();};
const text=(v:any)=>{if(typeof v!=='string'||!v.length||v.length>4000)deny();};
const amount=(v:any)=>{if(!Number.isSafeInteger(v)||v<0)deny();};
export function parseOwnerFactoryResultPins(value:unknown):OwnerFactoryResultPins {
 const p=object(value);exact(p,['schema','factoryId','sourceDigest','configurationDigest','profileHash','verifierPolicySha256','resultKeys','checkCommands','allowedFiles']);
 if(p.schema!=='mc-owner-factory-result-pins/v1')deny();text(p.factoryId);
 for(const field of ['sourceDigest','configurationDigest','profileHash','verifierPolicySha256'])hash(p[field]);
 for(const field of ['checkCommands','allowedFiles']){
  if(!Array.isArray(p[field])||!p[field].length||p[field].length>100||new Set(p[field]).size!==p[field].length)deny();p[field].forEach(text);
 }
 if(!Array.isArray(p.resultKeys)||!p.resultKeys.length||p.resultKeys.length>8||new Set(p.resultKeys.map((k:any)=>k.keyId)).size!==p.resultKeys.length)deny();
 for(const k of p.resultKeys){
  exact(k,['factoryId','keyId','publicKey','activeFrom','notAfter',...(k.revokedAt!==undefined?['revokedAt']:[]),...(k.retiredAt!==undefined?['retiredAt']:[])]);
  text(k.keyId);if(k.factoryId!==p.factoryId||createPublicKey(k.publicKey).asymmetricKeyType!=='ed25519'
   ||!Number.isFinite(Date.parse(k.activeFrom))||!Number.isFinite(Date.parse(k.notAfter))||Date.parse(k.notAfter)<=Date.parse(k.activeFrom))deny();
 }
 return p as OwnerFactoryResultPins;
}

/** Authenticated MyEve custody plus the original producer signature. No execution,
 * enterprise quality gate, owner acceptance or accounting settlement is granted here. */
export function verifyOwnerFactoryResult(document:Record<string,any>,permit:ExecutionPermit,pins:OwnerFactoryResultPins,now=Date.now(),admissionEvidence?:OwnerAdmissionEvidence) {
 if(Buffer.byteLength(JSON.stringify(document))>MAX_RESULT_BYTES+512000
  ||digest({sourceDigest:pins.sourceDigest,configurationDigest:pins.configurationDigest})!==permit.admission.factoryVersion)deny();
 const base={permitId:permit.permitId,missionId:permit.missionId,workOrderId:permit.workOrderId,work:permit.work,
  observedAt:document.observedAt,expiresAt:document.expiresAt,enterpriseQualityGate:'NOT_ESTABLISHED',executionAuthority:'NONE',accountingAuthority:'MYEVE_FACTORY'} as const;
 if(document.result===null){if(document.status==='SETTLED')deny();return {...base,status:document.status,result:null};}
 const a=object(document.admission),r=object(document.result);
 exact(a,['schema','binding','admissionReceipt','originalFactoryReadback','dispatchState','quiescence','fencedAt']);
 exact(r,['signedResult','resultId','manifestDigest','nativeResultId','proof','proofHash','cleanupConfirmed','settlementState','exposureUnknown','accounting','acceptance']);
 const b=object(a.binding),origin=object(b.origin),material=object(origin.tupleMaterial),q=object(b.factoryBinding);
 if(a.schema!=='mc-owner-factory-admission/v1'||b.schema!==a.schema||b.permitId!==permit.permitId||b.permitSha256!==permitDigest(permit)
  ||digest(material)!==permit.work.tupleSha256||origin.tupleSha256!==permit.work.tupleSha256
  ||material.ownerId!==permit.ownerId||material.installationId!==permit.installationId||material.connectionId!==permit.connectionId
  ||material.workId!==permit.work.id||material.version!==permit.work.version||material.generation!==permit.work.generation
  ||material.factoryVersion!==permit.admission.factoryVersion||material.executionContractSha256!==permit.admission.executionContractSha256
  ||material.capabilityPolicySha256!==permit.admission.capabilityPolicySha256||material.maxCostUsd*1e6!==permit.admission.maxCostMicrousd
  ||material.maxDurationSeconds!==permit.admission.maxDurationSeconds||origin.workOrderId!==permit.workOrderId
  ||origin.expectedWorkOrderRevisionId!==permit.workOrderRevisionId||origin.expectedPlanDigest!==permit.planDigest
  ||material.pins.factoryId!==pins.factoryId||material.pins.sourceDigest!==pins.sourceDigest||material.pins.configurationDigest!==pins.configurationDigest
  ||material.pins.profileHash!==pins.profileHash||digest(origin.pins)!==digest(material.pins))deny();
 const admitted=admissionEvidence??deny();
 if(canonicalPermitJson(a.admissionReceipt?.document)!==canonicalPermitJson(admitted.document)
  ||admitted.document.commandId!==b.commandId||admitted.document.permitSha256!==permitDigest(permit)
  ||admitted.document.permitId!==permit.permitId||admitted.document.connectionId!==permit.connectionId
  ||admitted.document.issuedAt>now||admitted.document.expiresAt<=admitted.document.issuedAt
  ||admitted.document.expiresAt-admitted.document.issuedAt>10000
  ||digest(a.admissionReceipt)!==b.receiptSha256)deny();
 verifyPermitSignature(a.admissionReceipt,admitted.enrollment);
 for(const key of ['commandId','factoryRequestId','routeDecisionId','routeRunId','dispatchIdentity'])text(b[key]);hash(b.receiptSha256);
 if(!Number.isSafeInteger(b.writerGeneration)||b.writerGeneration<1||q.workId!==permit.work.id||q.workVersion!==permit.work.version
  ||q.workGeneration!==permit.work.generation||q.factoryId!==pins.factoryId||q.factoryVersion!==permit.admission.factoryVersion
  ||q.sourceDigest!==pins.sourceDigest||q.configurationDigest!==pins.configurationDigest||q.agentId!==material.pins.agentId)deny();
 const {manifest}=verifyResult(r.signedResult,{keys:pins.resultKeys,factoryId:pins.factoryId,requestId:q.requestId,
  workOrderId:q.workOrderId,runId:q.runId,factoryVersion:permit.admission.factoryVersion,now});
 const e=manifest.execution,c=manifest.candidate??deny(),v=manifest.verification,proof=object(r.proof);
 if(!c||e.requestDigest!==q.requestDigest||e.attemptNumber!==q.attemptNumber||e.inputCommit!==q.inputCommit
  ||e.sourceDigest!==pins.sourceDigest||e.configurationDigest!==pins.configurationDigest||digest(manifest)!==r.manifestDigest
  ||canonicalPermitJson(e.configuration.commands)!==canonicalPermitJson(pins.checkCommands)
  ||canonicalPermitJson([...e.configuration.allowedPaths].sort())!==canonicalPermitJson([...pins.allowedFiles].sort())
  ||digest(proof)!==r.proofHash||proof.contractVersion!==2||proof.workId!==permit.work.id||proof.workVersion!==permit.work.version
  ||proof.criteriaVersion!==material.criteriaVersion||proof.resultRevision!==c.commit||!['PARTIAL','FAILED'].includes(proof.outcome)
  ||!Array.isArray(material.criteria)||!Array.isArray(proof.evidence)||proof.evidence.length!==material.criteria.length
  ||new Set(proof.evidence.map((item:any)=>item.criterionId)).size!==proof.evidence.length)deny();
 for(const item of proof.evidence)if(!material.criteria.some((criterion:any)=>criterion.id===item.criterionId)
  ||item.producer!=='trusted-verifier'||item.resultRevision!==c.commit||!['PASS','FAIL','UNKNOWN','NOT_RUN'].includes(item.state)
  ||item.sourceRef!==`native-verification:${permit.work.id}:${c.commit}:${item.criterionId}`)deny();
 if(v&&(v.workId!==permit.work.id||v.workGeneration!==permit.work.generation||v.policySha256!==pins.verifierPolicySha256
  ||e.configuration.cloud?.verificationPolicySha256!==pins.verifierPolicySha256))deny();
 const observation=object(a.originalFactoryReadback),remote=object(observation.value),identity=object(remote.identity);
 const observed=Date.parse(observation.backendObservedAt);
 if(!Number.isFinite(observed)||observed>now||observed<=now-30000||identity.workId!==permit.work.id||identity.workGeneration!==permit.work.generation
  ||identity.requestId!==q.requestId||identity.workOrderId!==q.workOrderId||identity.remoteRunId!==q.runId
  ||identity.runId!==b.routeRunId||identity.dispatchIdentity!==b.dispatchIdentity||identity.writerGeneration!==b.writerGeneration
  ||identity.factoryId!==pins.factoryId||identity.factoryVersion!==permit.admission.factoryVersion||identity.repository!==material.repository)deny();
 const spend=workSpendV2Schema.parse(remote.spend);validateSpendBinding(spend,{workId:identity.workId,workGeneration:identity.workGeneration,requestId:identity.requestId,
  workOrderId:identity.workOrderId,deadline:identity.deadline,remoteRunId:identity.remoteRunId,factoryVersion:identity.factoryVersion});
 if(spend.ceilingMicrousd>permit.admission.maxCostMicrousd)deny();
 const accounting=object(r.accounting);
 for(const field of ['sofieMicrousd','nativeMicrousd','factoryMicrousd','settledMicrousd','reservedMicrousd','unknownExposureMicrousd'])amount(accounting[field]);
 if(accounting.currency!=='USD'||accounting.unit!=='microUSD'||accounting.settledMicrousd!==accounting.sofieMicrousd+accounting.nativeMicrousd+accounting.factoryMicrousd
  ||accounting.settledMicrousd+accounting.reservedMicrousd>permit.admission.maxCostMicrousd||accounting.unknownExposureMicrousd>accounting.reservedMicrousd
  ||typeof r.exposureUnknown!=='boolean'||typeof r.cleanupConfirmed!=='boolean')deny();
 const exposureUnknown=r.exposureUnknown||accounting.unknownExposureMicrousd>0||spend.status==='UNKNOWN'||spend.unknownExposureMicrousd>0;
 const cleanupConfirmed=r.cleanupConfirmed&&v?.cleanupConfirmed===true&&a.dispatchState==='TERMINAL'&&!!a.fencedAt&&a.quiescence?.quiescent===true&&remote.quiescent===true&&['COMPLETED','FAILED','CANCELLED','NOT_DISPATCHED'].includes(remote.state);
 const settled=r.settlementState==='SETTLED'&&!exposureUnknown&&cleanupConfirmed&&accounting.coverage==='COMPLETE'&&accounting.reservedMicrousd===0
  &&spend.status==='KNOWN'&&spend.accountingComplete&&spend.retainedMicrousd===0;
 if(document.status==='SETTLED'&&!settled)deny();
 const key=pins.resultKeys.find(k=>k.factoryId===pins.factoryId&&k.keyId===manifest.keyId)!;
 return {...base,expiresAt:Math.min(document.expiresAt,observed+30000,Date.parse(key.notAfter)),admissionBinding:{commandId:b.commandId,documentSha256:digest(admitted.document)},
  status:settled?'RESULT_VERIFIED_SETTLEMENT_REPORTED':'RESULT_VERIFIED_PENDING_REPORTED',
  result:{resultId:r.resultId,nativeResultId:r.nativeResultId,manifestDigest:r.manifestDigest,proofHash:r.proofHash,candidate:c.commit,
   independentVerdict:manifest.status==='COMPLETED'&&v?.outcome==='PASS'&&proof.evidence.every((item:any)=>item.state==='PASS')?'PASS':'NOT_ESTABLISHED',
   proofOutcome:proof.outcome,accounting,exposureUnknown,cleanupConfirmed,ownerAcceptance:'SEPARATE_DECISION_REQUIRED'}};
}
