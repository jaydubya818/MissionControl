'use node';
import {parseOwnerFactoryResultPins,verifyOwnerFactoryResult,type OwnerFactoryResultPins} from './ownerFactoryResult';
import {createHash,createHmac,createPublicKey,timingSafeEqual,verify} from 'node:crypto';
import {canonicalPermitJson,permitDigest,type ExecutionPermit} from '../../packages/shared/src/executionPermit';
import {workSpendV2Schema,validateSpendBinding} from '../../packages/shared/src/factoryResult/factory-spend';
import {digest,verifyResult,type ResultKey,MAX_RESULT_BYTES} from '../../packages/shared/src/factoryResult/factory-producer-protocol';

function deny():never {throw Error('INSTALLED_FACTORY_RESULT_UNVERIFIED');}
const object=(value:any):Record<string,any>=>{if(!value||typeof value!=='object'||Array.isArray(value))return deny();return value;};
const exact=(value:any,fields:string[])=>{object(value);if(Object.keys(value).sort().join(',')!==fields.sort().join(','))deny();};
const hex=(value:any)=>{if(typeof value!=='string'||!/^[a-f0-9]{64}$/.test(value))deny();};
const text=(value:any)=>{if(typeof value!=='string'||!value.length||value.length>4000)deny();};
const integer=(value:any)=>{if(!Number.isSafeInteger(value)||value<0)deny();};
export interface FactoryResultPins {
 factoryId:'myfactory-external-alpha';sourceDigest:string;configurationDigest:string;verifierPolicySha256:string;
 resultKeys:ResultKey[];receiptKeys:{keyId:string;publicKey:string}[];checkCommands:string[];allowedFiles:string[];
}
/** Pins are installed out of band per connection. Incoming evidence never supplies them. */
export function parseFactoryResultPins(value:unknown):FactoryResultPins|OwnerFactoryResultPins {
 if(object(value).schema==='mc-owner-factory-result-pins/v1')return parseOwnerFactoryResultPins(value);
 const p=object(value);exact(p,['factoryId','sourceDigest','configurationDigest','verifierPolicySha256','resultKeys','receiptKeys','checkCommands','allowedFiles']);
 if(p.factoryId!=='myfactory-external-alpha')deny();
 for(const name of ['sourceDigest','configurationDigest','verifierPolicySha256'])hex(p[name]);
 for(const name of ['checkCommands','allowedFiles']){if(!Array.isArray(p[name])||!p[name].length||p[name].length>100||new Set(p[name]).size!==p[name].length)deny();p[name].forEach(text);}
 for(const name of ['resultKeys','receiptKeys'])if(!Array.isArray(p[name])||!p[name].length||p[name].length>8||new Set(p[name].map((k:any)=>k.keyId)).size!==p[name].length)deny();
 for(const key of p.receiptKeys){exact(key,['keyId','publicKey']);hex(key.keyId);text(key.publicKey);const parsed=createPublicKey(key.publicKey);if(parsed.asymmetricKeyType!=='ed25519'||createHash('sha256').update(parsed.export({type:'spki',format:'der'})).digest('hex')!==key.keyId)deny();}
 for(const key of p.resultKeys){exact(key,['factoryId','keyId','publicKey','activeFrom','notAfter',...(key.retiredAt!==undefined?['retiredAt']:[]),...(key.revokedAt!==undefined?['revokedAt']:[])]);if(key.factoryId!==p.factoryId||key.keyId!=='external-alpha-result-v1'||createPublicKey(key.publicKey).asymmetricKeyType!=='ed25519')deny();}
 return p as FactoryResultPins;
}
export type ResultRequest={schema:'mc-result-request/v1';connectionId:string;installationId:string;ownerId:string;projectId:string;permitId:string;commandId:string;challenge:string;issuer:string;audience:string;issuedAt:number;expiresAt:number};
export const resultSignature=(document:unknown,domain:string,secret:string)=>'sha256='+createHmac('sha256',secret).update(domain+'\n'+canonicalPermitJson(document)).digest('hex');
export function verifyResultReadbackPacket(packet:unknown,request:ResultRequest,permit:ExecutionPermit,secret:string,now=Date.now()) {
 const p=object(packet);exact(p,['document','signature']);const d=object(p.document);
 if(secret.length<32||typeof p.signature!=='string'||!/^sha256=[a-f0-9]{64}$/.test(p.signature)
   ||!timingSafeEqual(Buffer.from(p.signature),Buffer.from(resultSignature(d,'mc-result-readback/v1',secret))))deny();
 exact(d,['schema','commandId','challenge','connectionId','installationId','ownerId','permitId','permitSha256','missionId','planId','workOrderId','workOrderRevisionId','work','observedAt','expiresAt','status','admission','result']);
 if(d.schema!=='mc-result-readback/v1'||!['PENDING','SETTLED','NO_RESULT'].includes(d.status))deny();
 for(const k of ['commandId','challenge','connectionId','installationId','ownerId','permitId'] as const)if(d[k]!==request[k])deny();
 for(const k of ['connectionId','installationId','ownerId','permitId','missionId','planId','workOrderId','workOrderRevisionId'] as const)if(d[k]!==permit[k])deny();
 integer(d.observedAt);integer(d.expiresAt);
 if(d.observedAt<request.issuedAt||d.observedAt>now||d.expiresAt<=now||d.expiresAt>request.expiresAt||d.expiresAt>d.observedAt+30000
  ||d.permitSha256!==permitDigest(permit)||canonicalPermitJson(d.work)!==canonicalPermitJson(permit.work))deny();
 return d;
}
function verifyFactorySignature(domain:string,document:unknown,signature:unknown,pins:FactoryResultPins){
 if(typeof signature!=='string'||!/^[A-Za-z0-9_-]{86}$/.test(signature)||Buffer.from(signature,'base64url').toString('base64url')!==signature)deny();
 const bytes=Buffer.from(domain+'\0'+digest(document));
 if(!pins.receiptKeys.some(k=>verify(null,bytes,k.publicKey,Buffer.from(signature,'base64url'))))deny();
}
const criterionId=(index:number)=>{const h=createHash('sha256').update('EXTERNAL_ALPHA_CRITERION_V1:'+index).digest('hex').slice(0,32);return `${h.slice(0,8)}-${h.slice(8,12)}-8${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;};
/** Read-only evidence assessment. It cannot grant execution or settle accounting. */
export function verifyInstalledFactoryResult(document:Record<string,any>,permit:ExecutionPermit,pins:FactoryResultPins|OwnerFactoryResultPins,now=Date.now()) {
 if('schema' in pins)return verifyOwnerFactoryResult(document,permit,pins,now);
 if(Buffer.byteLength(JSON.stringify(document))>MAX_RESULT_BYTES+512000)deny();
 if(digest({sourceDigest:pins.sourceDigest,configurationDigest:pins.configurationDigest})!==permit.admission.factoryVersion)deny();
 const base={permitId:permit.permitId,missionId:permit.missionId,workOrderId:permit.workOrderId,work:permit.work,observedAt:document.observedAt,expiresAt:document.expiresAt,enterpriseQualityGate:'NOT_ESTABLISHED',executionAuthority:'NONE',accountingAuthority:'MYEVE_FACTORY'} as const;
 if(document.result===null){if(document.status==='SETTLED')deny();return {...base,status:document.status,result:null};}
 const a=object(document.admission),r=object(document.result),authority=object(a.authorityDocument),raw=object(a.originalSignedReadback);
 exact(a,['authorityId','authoritySha256','authorityDocument','requestId','requestDigest','admittedDeadline','factoryWorkOrderId','runId','attemptNumber','originalSignedReadback']);
 exact(r,['signedResult','resultId','manifestDigest','proof','proofHash','verdict','cleanupConfirmed','settlementState','exposureUnknown','accounting','acceptance']);
 if(digest(authority)!==a.authoritySha256||authority.schema!=='MYEVE_EXTERNAL_ALPHA_WORK_AUTHORITY_V1'||authority.authorityId!==a.authorityId
  ||authority.ownerId!==permit.ownerId||authority.factoryVersion!==permit.admission.factoryVersion||authority.candidateWriter?.requestId!==a.requestId
  ||authority.work?.id!==permit.work.id||authority.work?.version!==permit.work.version||authority.work?.generation!==permit.work.generation
  ||authority.project?.tupleSha256!==permit.work.tupleSha256||authority.source?.sourceDigest!==pins.sourceDigest
  ||authority.work?.criteriaSha256!=='266874e4e72dcce0f02ff58bedf56801d6e9906080ed6e7b987dc6537a20b466'
  ||authority.work?.criteriaCount!==10||authority.limits?.work?.microusd!==permit.admission.maxCostMicrousd
  ||authority.limits?.productiveSeconds!==permit.admission.maxDurationSeconds||!Number.isSafeInteger(authority.limits?.factory?.microusd)||authority.limits.factory.microusd>permit.admission.maxCostMicrousd||a.attemptNumber!==1)deny();
 if(canonicalPermitJson([...authority.source.allowedFiles].sort())!==canonicalPermitJson([...pins.allowedFiles].sort()))deny();
 const receipt=object(raw.authorityReceipt),attestation=object(raw.readbackAttestation);
 exact(receipt,['authorityId','authoritySha256','requestId','workOrderId','consumedAt']);
 verifyFactorySignature('MYFACTORY_EXTERNAL_ALPHA_RECEIPT_V1',receipt,raw.authorityReceiptSignature,pins);
 verifyFactorySignature('MYFACTORY_EXTERNAL_ALPHA_READBACK_V1',attestation,raw.readbackSignature,pins);
 exact(attestation,['schema','requestId','workOrderId','runId','attemptNumber','requestDigest','admittedDeadline','authorityId','authoritySha256','receiptDigest','state','quiescent','evidenceRef','blocker','spend','spendDigest','verdict','challenge','issuedAt','expiresAt']);
 for(const k of ['authorityId','authoritySha256','requestId'])if(receipt[k]!==a[k]||attestation[k]!==a[k])deny();
 const issued=Date.parse(attestation.issuedAt),expiry=Date.parse(attestation.expiresAt);
 if(attestation.schema!=='MYFACTORY_EXTERNAL_ALPHA_READBACK_V1'||receipt.workOrderId!==a.factoryWorkOrderId||attestation.workOrderId!==a.factoryWorkOrderId
  ||attestation.runId!==a.runId||attestation.attemptNumber!==1||attestation.requestDigest!==a.requestDigest||attestation.admittedDeadline!==a.admittedDeadline
  ||attestation.receiptDigest!==digest(receipt)||attestation.spendDigest!==digest(attestation.spend)
  ||!Number.isFinite(issued)||!Number.isFinite(expiry)||issued>now||issued<now-120000||expiry<=now||expiry>issued+120000)deny();
 const spend=workSpendV2Schema.parse(attestation.spend);
 validateSpendBinding(spend,{workId:permit.work.id,workGeneration:permit.work.generation,requestId:a.requestId,workOrderId:a.factoryWorkOrderId,deadline:a.admittedDeadline,remoteRunId:a.runId,factoryVersion:permit.admission.factoryVersion},authority.limits.factory.microusd/1000000);
 if(spend.operations.some(op=>op.workGeneration!==permit.work.generation||op.model!==authority.model.id))deny();
 const {manifest}=verifyResult(r.signedResult,{keys:pins.resultKeys,factoryId:pins.factoryId,requestId:a.requestId,workOrderId:a.factoryWorkOrderId,runId:a.runId,factoryVersion:permit.admission.factoryVersion,now});
 const resultKey=pins.resultKeys.find(k=>k.factoryId===pins.factoryId&&k.keyId===manifest.keyId)!;
 const keyExpiresAt=Date.parse(resultKey.notAfter);
 const e=manifest.execution,v=manifest.verification,c=manifest.candidate;
 if(!c||e.version!==2||e.requestDigest!==a.requestDigest||e.attemptNumber!==1||e.sourceDigest!==pins.sourceDigest||e.configurationDigest!==pins.configurationDigest
  ||e.inputCommit!==authority.source.baseSha||e.inputTree!==authority.source.treeSha||e.configuration.cloud?.verificationPolicySha256!==pins.verifierPolicySha256
  ||canonicalPermitJson(e.configuration.commands)!==canonicalPermitJson(pins.checkCommands)
  ||canonicalPermitJson([...e.configuration.allowedPaths].sort())!==canonicalPermitJson([...pins.allowedFiles].sort())||r.manifestDigest!==digest(manifest))deny();
 if(v&&(v.workId!==permit.work.id||v.workGeneration!==permit.work.generation||v.policySha256!==pins.verifierPolicySha256))deny();
 const proof=object(r.proof);hex(r.proofHash);
 if(r.proofHash!==digest(proof)||proof.contractVersion!==2||proof.workId!==permit.work.id||proof.workVersion!==permit.work.version
  ||!Number.isSafeInteger(proof.criteriaVersion)||proof.criteriaVersion<1||!['PARTIAL','FAILED'].includes(proof.outcome)
  ||proof.resultRevision!==c.commit||proof.createdAt!==manifest.issuedAt||!Array.isArray(proof.evidence)||proof.evidence.length!==10)deny();
 proof.evidence.forEach((item:any,index:number)=>{
  const id=criterionId(index),check=v?.checks.find(c=>c.id===`alpha-tasks-criterion-${index+1}`)??null;
  if(item.criterionId!==id||item.resultRevision!==c.commit||item.state!==(check?.result??'UNKNOWN')||item.producer!=='trusted-verifier'
   ||item.sourceRef!==`external-alpha-verification:${a.authorityId}:${c.commit}:${id}`
   ||item.contentHash!==`sha256:${digest({manifestDigest:digest(manifest),candidate:c.commit,criterionId:id,check})}`||item.observedAt!==(v?.finishedAt??manifest.issuedAt))deny();
 });
 const accounting=object(r.accounting);exact(accounting,['ceilingMicrousd','settledMicrousd','reservedMicrousd','unknownMicrousd']);Object.values(accounting).forEach(integer);
 if(accounting.ceilingMicrousd!==permit.admission.maxCostMicrousd||typeof r.exposureUnknown!=='boolean'||typeof r.cleanupConfirmed!=='boolean')deny();
 const total=accounting.settledMicrousd+accounting.reservedMicrousd+accounting.unknownMicrousd;
 if(!Number.isSafeInteger(total)||total>accounting.ceilingMicrousd)deny();
 const exposureUnknown=r.exposureUnknown||accounting.unknownMicrousd>0||spend.status==='UNKNOWN'||spend.unknownExposureMicrousd>0;
 const cleanupConfirmed=r.cleanupConfirmed&&v?.cleanupConfirmed===true&&attestation.quiescent===true;
 const independentPass=manifest.status==='COMPLETED'&&v?.outcome==='PASS'&&proof.evidence.every((e:any)=>e.state==='PASS')&&r.verdict==='PASS'&&attestation.verdict==='PASS';
 const settled=r.settlementState==='SETTLED'&&!exposureUnknown&&cleanupConfirmed&&accounting.unknownMicrousd===0&&accounting.reservedMicrousd===0
  &&attestation.quiescent===true&&spend.status==='KNOWN'&&spend.accountingComplete&&spend.retainedMicrousd===0&&spend.unknownExposureMicrousd===0;
 if(document.status==='SETTLED'&&!settled)deny();
 return {...base,expiresAt:Math.min(document.expiresAt,expiry,keyExpiresAt),status:settled?'VERIFIED_SETTLED':'VERIFIED_PENDING',
  result:{resultId:r.resultId,manifestDigest:r.manifestDigest,proofHash:r.proofHash,candidate:c.commit,independentVerdict:independentPass?'PASS':'NOT_ESTABLISHED',
   proofOutcome:proof.outcome,accounting,exposureUnknown,cleanupConfirmed,ownerAcceptance:'SEPARATE_DECISION_REQUIRED'}};
}
