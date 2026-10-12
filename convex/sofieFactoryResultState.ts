import {v} from 'convex/values';
import {internalMutation} from './_generated/server';
import type {MutationCtx} from './_generated/server';
import type {Id} from './_generated/dataModel';
import {permitLifecycleOwner} from './lib/executionPermitAuthority';
import {resultMissionScope} from './lib/sofieEnterpriseResult';
import {parseExecutionPermit,permitDenied,permitDigest} from '../packages/shared/src/executionPermit';
import {installedServiceSecret} from './lib/installedSofieConnection';
import {sha256Hex} from '../packages/shared/src/canonicalDigest';
import {enterpriseDigest} from '../packages/shared/src/sofieEnterprise';

export async function installedResultScope(ctx:MutationCtx,permitId:Id<'enterpriseExecutionPermits'>) {
 const row=await ctx.db.get(permitId);if(!row)return permitDenied();
 const live=await permitLifecycleOwner(ctx,row.connectionId),document=parseExecutionPermit(row.document);
 const {scope}=await resultMissionScope(ctx,live.connection,row.missionId);
 const workOrder=await ctx.db.get(row.workOrderId);
 const admitted=await ctx.db.query('enterprisePermitAdmissionReceipts').withIndex('by_permit_kind',q=>q.eq('permitId',permitId).eq('kind','ADMISSION')).first();
 if(row.ownerId!==live.owner._id||row.tenantId!==live.connection.tenantId||row.projectId!==live.project._id||row.permitSha256!==permitDigest(document)
  ||document.connectionId!==live.connection._id||document.ownerId!==live.enrollment.ownerId||document.installationId!==live.enrollment.installationId
  ||document.admission.factoryVersion!==live.enrollment.factoryVersion||scope.planId!==document.planId||scope.planDigest!==document.planDigest
  ||!workOrder||workOrder.missionId!==row.missionId||workOrder.missionPlanId!==scope.planId||workOrder.currentRevisionId!==document.workOrderRevisionId
  ||workOrder.projectId!==row.projectId||workOrder.tenantId!==row.tenantId||!admitted||admitted.connectionId!==row.connectionId
  ||admitted.document.permitSha256!==row.permitSha256)return permitDenied();
 let config:any;try{config=JSON.parse(process.env.MC_SOFIE_FACTORY_RESULT_PINS??'null');}catch{return permitDenied();}
 if(!config||!Object.prototype.hasOwnProperty.call(config,row.connectionId))return permitDenied();
 return {...live,row,document,pins:config[row.connectionId],pinsDigest:enterpriseDigest(config[row.connectionId]),serviceKeyDigest:sha256Hex('mc-result-service-key/v1\n'+live.connection.keyId+'\n'+installedServiceSecret(live.connection._id,live.connection.keyId))};
}
export const read=internalMutation({args:{permitId:v.id('enterpriseExecutionPermits')},handler:async(ctx,args)=>{
 const value=await installedResultScope(ctx,args.permitId);
 return {document:value.document,enrollment:value.enrollment,keyId:value.connection.keyId,pins:value.pins,pinsDigest:value.pinsDigest,serviceKeyDigest:value.serviceKeyDigest};
}});
export const retain=internalMutation({args:{permitId:v.id('enterpriseExecutionPermits'),permitSha256:v.string(),pinsDigest:v.string(),serviceKeyDigest:v.string(),observation:v.any()},handler:async(ctx,args)=>{
 const live=await installedResultScope(ctx,args.permitId),o=args.observation;
 if(live.row.permitSha256!==args.permitSha256||live.pinsDigest!==args.pinsDigest||live.serviceKeyDigest!==args.serviceKeyDigest||o.permitId!==live.row._id||o.missionId!==live.row.missionId
  ||o.workOrderId!==live.row.workOrderId||o.expiresAt<=Date.now()||o.observedAt>Date.now()||o.executionAuthority!=='NONE'||o.enterpriseQualityGate!=='NOT_ESTABLISHED')return permitDenied();
 // Observation cache only. No Work, native QualityGate, acceptance or accounting mutation.
 const previous=live.row.factoryResultObservation;
 if(previous?.observedAt>o.observedAt)return permitDenied();
 await ctx.db.patch(live.row._id,{factoryResultObservation:{...o,verificationBinding:{pinsDigest:args.pinsDigest,serviceKeyDigest:args.serviceKeyDigest,permitSha256:args.permitSha256}}});
 return o;
}});

/** Preserve the cached observation, but never present it as current after authority changes. */
export async function currentFactoryObservation(ctx:MutationCtx,row:any) {
 const saved=row.factoryResultObservation;if(!saved)return null;
 const {verificationBinding,...observation}=saved;
 try{
  const live=await installedResultScope(ctx,row._id);
  if(observation.expiresAt<=Date.now()||verificationBinding?.pinsDigest!==live.pinsDigest||verificationBinding?.serviceKeyDigest!==live.serviceKeyDigest||verificationBinding?.permitSha256!==live.row.permitSha256)throw Error('STALE');
  return observation;
 }catch{return {status:'STALE',expiresAt:0,result:null,enterpriseQualityGate:'NOT_ESTABLISHED',executionAuthority:'NONE'};}
}
