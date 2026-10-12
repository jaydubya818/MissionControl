'use node';
import {randomBytes,randomUUID} from 'node:crypto';
import {v} from 'convex/values';
import {makeFunctionReference} from 'convex/server';
import {action} from './_generated/server';
import {installedServiceSecret} from './lib/installedSofieConnection';
import {parseFactoryResultPins,resultSignature,verifyResultReadbackPacket,verifyInstalledFactoryResult,type ResultRequest} from './lib/installedFactoryResult';
import {permitDenied,permitDigest,type ExecutionPermit} from '../packages/shared/src/executionPermit';
import {MAX_RESULT_BYTES} from '../packages/shared/src/factoryResult/factory-producer-protocol';

export const refresh=action({args:{permitId:v.id('enterpriseExecutionPermits')},handler:async(ctx,args)=>{
 if(!await ctx.auth.getUserIdentity())return permitDenied();
 const state=await ctx.runMutation(makeFunctionReference<'mutation'>('sofieFactoryResultState:read'),args);
 const permit:ExecutionPermit=state.document,pins=parseFactoryResultPins(state.pins),secret=installedServiceSecret(permit.connectionId,state.keyId),now=Date.now();
 const request:ResultRequest={schema:'mc-result-request/v1',connectionId:permit.connectionId,installationId:permit.installationId,ownerId:permit.ownerId,projectId:permit.projectId,
  permitId:permit.permitId,commandId:randomUUID(),challenge:randomBytes(32).toString('hex'),issuer:permit.issuer,audience:permit.audience,issuedAt:now,expiresAt:now+30000};
 const response=await fetch(new URL('/api/missioncontrol/result',state.enrollment.audience),{method:'POST',headers:{'content-type':'application/json'},
  body:JSON.stringify({document:request,signature:resultSignature(request,request.schema,secret)}),redirect:'error',signal:AbortSignal.timeout(15000)});
 if(!response.ok||!response.body)return permitDenied();
 const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_RESULT_BYTES+512000)return permitDenied();chunks.push(value);}}finally{await reader.cancel();}
 const packet=JSON.parse(Buffer.concat(chunks).toString('utf8'));
 const document=verifyResultReadbackPacket(packet,request,permit,secret);
 let admissionEvidence;
 if('schema' in pins&&document.result!==null){
  const commandId=document.admission?.binding?.commandId;
  if(typeof commandId!=='string'||!commandId.length||commandId.length>200)return permitDenied();
  const admitted=await ctx.runMutation(makeFunctionReference<'mutation'>('sofieFactoryResultState:read'),{permitId:args.permitId,admissionCommandId:commandId});
  if(admitted.enrollmentDigest!==state.enrollmentDigest||admitted.pinsDigest!==state.pinsDigest||admitted.serviceKeyDigest!==state.serviceKeyDigest||permitDigest(admitted.document)!==permitDigest(permit))return permitDenied();
  admissionEvidence={document:admitted.admissionDocument,enrollment:admitted.enrollment};
 }
 const observation=verifyInstalledFactoryResult(document,permit,pins,Date.now(),admissionEvidence);
 // Reauthenticate the owner and exact current Plan/revision/pins after network I/O.
 return ctx.runMutation(makeFunctionReference<'mutation'>('sofieFactoryResultState:retain'),{permitId:args.permitId,enrollmentDigest:state.enrollmentDigest,permitSha256:permitDigest(permit),pinsDigest:state.pinsDigest,serviceKeyDigest:state.serviceKeyDigest,observation});
}});
