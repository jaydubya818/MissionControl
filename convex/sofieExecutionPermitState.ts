import { revokePermit, permitControlDocument, permitControlDigest } from './lib/permitLifecycle';
import { capabilityBindings, capabilityPolicyScope } from './capabilityPolicy';
import { admissionActionDigest, type AdmissionChallenge as PolicyAdmissionChallenge } from './lib/capabilityOrderingWire';
import { requireCapabilityReceiverRecovery } from './lib/capabilityReceiverRecovery';
import { sha256Hex } from '../packages/shared/src/canonicalDigest';
import { requireCapabilityAdmission } from './lib/capabilityAdmission';
import { v } from 'convex/values';
import { mutation, query } from './lib/missionScopedFunctions';
import { internalMutation } from './_generated/server';
import { admissionReceipt, canonicalPermitJson, parseAdmissionChallenge, parseExecutionPermit, parsePermitAdmission, parsePermitWork, permitDenied, permitDigest, requirePermitEnrollment } from '../packages/shared/src/executionPermit';
import { enterpriseDigest } from '../packages/shared/src/sofieEnterprise';
import { authenticatePermitCommand, currentPermit, permitConnection, permitMission, permitLifecycleOwner } from './lib/executionPermitAuthority';
import type { MutationCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';

export const commandEnvelope = v.object({serviceId:v.string(),capability:v.string(),projectId:v.string(),repositoryId:v.string(),commandId:v.string(),issuedAt:v.number(),expiresAt:v.number(),payloadDigest:v.string(),signature:v.string()});
export const approveArgs = { projectId:v.id('projects'), connectionId:v.id('enterpriseAppConnections'), proposalId:v.id('enterpriseMissionProposals'),
  workOrderId:v.id('workOrders'), expectedPlanDigest:v.string(), expectedWorkOrderRevisionId:v.id('workOrderRevisions'), work:v.any(), admission:v.any(), idempotencyKey:v.string() };
export async function approveExecutionPermit(ctx: MutationCtx,args: any) {
  if(!await ctx.auth.getUserIdentity())return permitDenied();
  const live = await permitMission(ctx,args.connectionId,args.proposalId,args.workOrderId,args.expectedPlanDigest,true);
  if (args.projectId !== live.project._id || args.expectedWorkOrderRevisionId !== live.workOrder.currentRevisionId
    || !/^[A-Za-z0-9._:-]{1,160}$/.test(args.idempotencyKey)) return permitDenied();
  const work = parsePermitWork(args.work), admission = parsePermitAdmission(args.admission), now=Date.now();
  const requestDigest=enterpriseDigest({...args,work,admission});
  const prior=await ctx.db.query('enterpriseExecutionPermits').withIndex('by_connection_intent',q=>q.eq('connectionId',args.connectionId).eq('intentKey',args.idempotencyKey)).unique();
  if(prior) {
    if(prior.requestDigest!==requestDigest) return permitDenied();
    const current=await currentPermit(ctx,prior._id,true); return {document:current.document,enrollment:current.enrollment};
  }
  const binding=canonicalPermitJson({installationId:live.enrollment.installationId,missionId:live.mission._id,planId:live.plan._id,
    workOrderId:live.workOrder._id,revisionId:live.workOrder.currentRevisionId,work});
  const existing=await ctx.db.query('enterpriseExecutionPermits').withIndex('by_binding',q=>q.eq('binding',binding)).unique();
  if(existing) {
    const current=await currentPermit(ctx,existing._id,true);
    if(canonicalPermitJson(current.document.admission)!==canonicalPermitJson(admission)) return permitDenied();
    return {document:current.document,enrollment:current.enrollment};
  }
  const expiresAt=Math.min(now+300000,live.enrollment.expiresAt,live.connection.expiresAt,live.proposal.expiresAt);
  const approvalId=await ctx.db.insert('approvalDecisions',{tenantId:live.connection.tenantId,projectId:live.project._id,workOrderId:live.workOrder._id,
    approvalType:'INSTALLED_EXECUTION_PERMIT',requestedAction:'Bind existing MyEve Work to this approved Mission Plan and WorkOrder revision',riskLevel:'HIGH',
    approver:live.owner._id,status:'APPROVED',decision:'APPROVE',workOrderRevisionNumber:live.workOrder.currentRevisionNumber,expiresAt,createdAt:now,decidedAt:now,
    metadata:{authenticatedSubject:live.enrollment.ownerSubject,planDigest:args.expectedPlanDigest,workBinding:canonicalPermitJson(work),admissionBinding:canonicalPermitJson(admission)}});
  const approval=await ctx.db.get(approvalId);
  const permitId=await ctx.db.insert('enterpriseExecutionPermits',{connectionId:args.connectionId,proposalId:args.proposalId,projectId:live.project._id,
    tenantId:live.connection.tenantId,ownerId:live.owner._id,missionId:live.mission._id,workOrderId:live.workOrder._id,approvalId,
    intentKey:args.idempotencyKey,requestDigest,binding,workKey:canonicalPermitJson(work),document:null,permitSha256:'',createdAt:now});
  const e=live.enrollment;
  const document=parseExecutionPermit({schema:'mc-execution-permit/v1',permitId,issuer:e.issuer,audience:e.audience,issuedAt:now,expiresAt,
    installationId:e.installationId,connectionId:e.connectionId,enrollmentRevision:e.revision,ownerId:e.ownerId,ownerSubject:e.ownerSubject,
    missionControlOwnerId:e.missionControlOwnerId,tenantId:e.tenantId,projectId:e.projectId,missionId:live.mission._id,planId:live.plan._id,
    planDigest:args.expectedPlanDigest,workOrderId:live.workOrder._id,workOrderRevisionId:live.workOrder.currentRevisionId,
    approvalId,approvalDigest:enterpriseDigest(approval),work,admission});
  requirePermitEnrollment(document,e,now);
  await ctx.db.patch(permitId,{document,permitSha256:permitDigest(document)});
  await ctx.db.insert('missionEvents',{missionId:live.mission._id,tenantId:live.connection.tenantId,projectId:live.project._id,eventType:'INSTALLED_PERMIT_APPROVED',
    actorType:'HUMAN',actorId:live.owner._id,timestamp:now,summary:'Owner approved exact existing Work binding; backend admission and accounting remain required',
    metadata:{permitId,approvalId,workId:work.id,planDigest:document.planDigest}});
  return {document,enrollment:e};
}
export const approve = mutation({args:approveArgs,handler:approveExecutionPermit});
export const revoke = mutation({args:{projectId:v.id('projects'),permitId:v.id('enterpriseExecutionPermits')},handler:async(ctx,args)=>{
  if(!await ctx.auth.getUserIdentity())return permitDenied();
  const row=await ctx.db.get(args.permitId); if(!row||row.projectId!==args.projectId) return permitDenied();
  await permitLifecycleOwner(ctx,row.connectionId);
  await revokePermit(ctx,row,'OWNER_REVOKED');
  const updated=await ctx.db.get(row._id);
  return {permitId:row._id,admission:'DENIED_NEW_PERMITS',authority:updated?.control?.acknowledgment?.authority??'PENDING_BACKEND',cleanup:updated?.control?.acknowledgment?.cleanup??'PENDING_BACKEND',accounting:'UNCHANGED'};
}});
export const inspect = query({args:{projectId:v.id('projects'),connectionId:v.id('enterpriseAppConnections')},handler:async(ctx,args)=>{
  if(!await ctx.auth.getUserIdentity())return permitDenied();
  // No writes; the common helper reads only for an authenticated owner.
  const live=await permitLifecycleOwner(ctx as any,args.connectionId); if(live.project._id!==args.projectId) return permitDenied();
  const rows=await ctx.db.query('enterpriseExecutionPermits').withIndex('by_connection_intent',q=>q.eq('connectionId',args.connectionId)).take(101);
  return {mode:'INSTALLED_NONPRODUCTION',installationId:live.enrollment.installationId,truncated:rows.length>100,permits:rows.slice(0,100).map(row=>({
    permitId:row._id,missionId:row.missionId,workOrderId:row.workOrderId,work:parseExecutionPermit(row.document).work,
    operation:row.control?.operation??null,status:row.revokedAt!==undefined?(row.control?.operation==='disable_new'?'NEW_ADMISSIONS_DENIED':'REVOKED'):parseExecutionPermit(row.document).expiresAt<=Date.now()?'EXPIRED':'OWNER_APPROVED',authority:row.control?.acknowledgment?.authority??'PENDING_BACKEND',cleanup:row.control?.acknowledgment?.cleanup??'PENDING_BACKEND'}))};
}});
// Internal-only service transaction authenticates its entire input before reading or writing permit state.
export const authorizeAdmission = internalMutation({args:{envelope:commandEnvelope,payloadJson:v.string()},handler:async(ctx,args)=>{
  let value:unknown; try {value=JSON.parse(args.payloadJson);}catch{return permitDenied();}
  const request=parseAdmissionChallenge(value);
  await authenticatePermitCommand(ctx,args.envelope,args.payloadJson,request.connectionId as Id<'enterpriseAppConnections'>,'enterprise.authorizeAdmission');
  const live=await currentPermit(ctx,request.permitId as Id<'enterpriseExecutionPermits'>,false);
  if(live.connection._id!==request.connectionId) return permitDenied();
  const proposed=admissionReceipt(live.document,request,args.envelope.commandId,Math.min(args.envelope.expiresAt,live.enrollment.expiresAt),Date.now());
  const prior=await ctx.db.query('enterprisePermitAdmissionReceipts').withIndex('by_connection_command',q=>q.eq('connectionId',live.connection._id).eq('commandId',args.envelope.commandId)).unique();
  const policy=await requireCapabilityAdmission(ctx,{...live.mission,ownerMemberId:live.connection.ownerMemberId},false,{
    workId:live.document.work.id,missionId:live.mission._id,generation:live.document.work.generation,capabilityId:'enterprise.fleet',
    args:{operation:'enterprise.authorizeAdmission',permitId:live.row._id,challenge:request.challenge,commandId:args.envelope.commandId},
    nativeSnapshot:{permitSha256:live.row.permitSha256},permits:request.capabilityPermits,
  },{authenticatedOwnerId:live.owner._id,policyOwnerId:live.enrollment.ownerId,installationId:live.enrollment.installationId,replay:!!prior});
  if(!policy||policy.budgetMicros<live.document.admission.maxCostMicrousd) return permitDenied();
  proposed.expiresAt=Math.min(proposed.expiresAt,policy.expiresAt);
  if(proposed.expiresAt<=Date.now())return permitDenied();
  if(prior) {
    if(prior.kind!=='ADMISSION'||prior.payloadDigest!==args.envelope.payloadDigest || prior.permitId!==live.row._id || prior.document.expiresAt<=Date.now()) return permitDenied();
    return {document:prior.document,enrollment:live.enrollment};
  }
  await ctx.db.insert('enterprisePermitAdmissionReceipts',{kind:'ADMISSION',connectionId:live.connection._id,commandId:args.envelope.commandId,permitId:live.row._id,
    payloadDigest:args.envelope.payloadDigest,document:proposed,createdAt:Date.now()});
  return {document:proposed,enrollment:live.enrollment};
}});
export const readForSigning = internalMutation({args:{permitId:v.id('enterpriseExecutionPermits')},handler:async(ctx,args)=>{
  const live=await currentPermit(ctx,args.permitId,true); return {document:live.document,enrollment:live.enrollment};
}});

export const readApproved = internalMutation({args:{envelope:commandEnvelope,payloadJson:v.string()},handler:async(ctx,args)=>{
  let input:any; try{input=JSON.parse(args.payloadJson);}catch{return permitDenied();}
  if(!input||Object.keys(input).sort().join(',')!=='admissionCommandId,challenge,connectionId,schema,work'
    ||input.schema!=='mc-approved-permit-read/v1'||typeof input.connectionId!=='string'
    ||typeof input.admissionCommandId!=='string'||!/^[A-Za-z0-9._:/-]{1,200}$/.test(input.admissionCommandId)
    ||typeof input.challenge!=='string'||!/^[a-f0-9]{32,128}$/.test(input.challenge)) return permitDenied();
  const work=parsePermitWork(input.work);
  await authenticatePermitCommand(ctx,args.envelope,args.payloadJson,input.connectionId,'enterprise.readApprovedPermit');
  const rows=await ctx.db.query('enterpriseExecutionPermits').withIndex('by_connection_work',q=>q.eq('connectionId',input.connectionId).eq('workKey',canonicalPermitJson(work))).take(2);
  if(rows.length!==1) return permitDenied();
  const live=await currentPermit(ctx,rows[0]._id,false);
  const binding=capabilityBindings().find(b=>b.ownerMemberId===live.connection.ownerMemberId&&b.tenantId===live.connection.tenantId&&b.projectId===live.project._id
    &&b.ownerId===live.enrollment.ownerId&&b.installationId===live.enrollment.installationId);
  if(!binding||binding.installationId!==process.env.MC_CAPABILITY_INSTALLATION_ID) return permitDenied();
  requireCapabilityReceiverRecovery(binding.incarnation);
  const enrollment=await ctx.db.query('capabilityEnrolledOwners').withIndex('by_owner',q=>q.eq('memberId',binding.ownerMemberId).eq('projectId',binding.projectId)).unique();
  if(!enrollment||enrollment.incarnation!==binding.incarnation||enrollment.installationId!==binding.installationId) return permitDenied();
  const fence=await ctx.db.query('capabilityPolicyFences').withIndex('by_scope',q=>q.eq('scope',capabilityPolicyScope({...binding,authority:'myeve'}))).unique();
  if(!fence||fence.enrollmentVersion!==binding.enrollmentVersion) return permitDenied();
  if(['work','missioncontrol','enterprise.fleet'].includes(fence.capabilityId)&&['disable','pause','revoke'].includes(fence.operation)) return permitDenied();
  const now=Date.now();
  const reference=sha256Hex(args.envelope.commandId+':'+args.envelope.payloadDigest).slice(0,32);
  const challenge:PolicyAdmissionChallenge={kind:'CHALLENGE',authority:'myeve',ownerId:binding.ownerId,organizationId:binding.organizationId,installationId:binding.installationId,
    backendId:binding.backendId,incarnation:binding.incarnation,enrollmentVersion:binding.enrollmentVersion,version:fence.version,policyId:fence.policyId,
    referenceId:[reference.slice(0,8),reference.slice(8,12),reference.slice(12,16),reference.slice(16,20),reference.slice(20)].join('-'),capabilityId:'enterprise.fleet',registryVersion:binding.registryVersion,agentId:binding.agentId,
    workId:work.id,missionId:live.mission._id,workGeneration:work.generation,budgetMicros:live.document.admission.maxCostMicrousd,
    actionDigest:await admissionActionDigest({workId:work.id,missionId:live.mission._id,generation:work.generation,nativeSnapshot:{permitSha256:live.row.permitSha256},
      args:{operation:'enterprise.authorizeAdmission',permitId:live.row._id,challenge:input.challenge,commandId:input.admissionCommandId}}),
    issuedAt:now,expiresAt:Math.min(now+30000,live.document.expiresAt,args.envelope.expiresAt)};
  const prior=await ctx.db.query('enterprisePermitAdmissionReceipts').withIndex('by_connection_command',q=>q.eq('connectionId',live.connection._id).eq('commandId',args.envelope.commandId)).unique();
  if(prior) {
    if(prior.kind!=='CHALLENGE'||prior.payloadDigest!==args.envelope.payloadDigest||prior.permitId!==live.row._id||prior.document.expiresAt<=now
      ||prior.document.version!==fence.version||prior.document.policyId!==fence.policyId) return permitDenied();
    return {document:live.document,enrollment:live.enrollment,challenge:prior.document};
  }
  await ctx.db.insert('enterprisePermitAdmissionReceipts',{kind:'CHALLENGE',connectionId:live.connection._id,commandId:args.envelope.commandId,
    permitId:live.row._id,payloadDigest:args.envelope.payloadDigest,document:challenge,createdAt:now});
  return {document:live.document,enrollment:live.enrollment,challenge};
}});

export const prepare = internalMutation({args:{envelope:commandEnvelope,payloadJson:v.string()},handler:async(ctx,args)=>{
  let input:any;try{input=JSON.parse(args.payloadJson);}catch{return permitDenied();}
  if(!input||Object.keys(input).sort().join(',')!=='admission,connectionId,expectedPlanDigest,expectedWorkOrderRevisionId,idempotencyKey,projectId,proposalId,schema,work,workOrderId'
    ||input.schema!=='mc-permit-request/v1') return permitDenied();
  await authenticatePermitCommand(ctx,args.envelope,args.payloadJson,input.connectionId,'enterprise.preparePermit');
  const live=await permitMission(ctx,input.connectionId,input.proposalId,input.workOrderId,input.expectedPlanDigest,false);
  if(input.projectId!==live.project._id||input.expectedWorkOrderRevisionId!==live.workOrder.currentRevisionId
    ||typeof input.idempotencyKey!=='string'||!/^[A-Za-z0-9._:-]{1,160}$/.test(input.idempotencyKey)) return permitDenied();
  const work=parsePermitWork(input.work),admission=parsePermitAdmission(input.admission),e=live.enrollment;
  if(admission.factoryVersion!==e.factoryVersion||admission.executionContractSha256!==e.executionContractSha256||admission.capabilityPolicySha256!==e.capabilityPolicySha256
    ||admission.maxCostMicrousd>e.maxCostMicrousd||admission.maxDurationSeconds>e.maxDurationSeconds) return permitDenied();
  const {schema:_,...request}=input;
  const requestDigest=enterpriseDigest({...request,work,admission});
  const prior=await ctx.db.query('enterprisePermitRequests').withIndex('by_connection_intent',q=>q.eq('connectionId',live.connection._id).eq('intentKey',input.idempotencyKey)).unique();
  if(prior) {if(prior.requestDigest!==requestDigest)return permitDenied();return {requestId:prior._id,status:'OWNER_APPROVAL_REQUIRED'};}
  const requestId=await ctx.db.insert('enterprisePermitRequests',{connectionId:live.connection._id,projectId:live.project._id,tenantId:live.connection.tenantId,
    ownerId:live.owner._id,missionId:live.mission._id,workOrderId:live.workOrder._id,proposalId:live.proposal._id,intentKey:input.idempotencyKey,
    requestDigest,request:{...request,work,admission},createdAt:Date.now()});
  return {requestId,status:'OWNER_APPROVAL_REQUIRED'};
}});
export const approvePrepared=mutation({args:{projectId:v.id('projects'),requestId:v.id('enterprisePermitRequests')},handler:async(ctx,args)=>{
  const request=await ctx.db.get(args.requestId);if(!request||request.projectId!==args.projectId||enterpriseDigest(request.request)!==request.requestDigest) return permitDenied();
  return approveExecutionPermit(ctx,request.request);
}});
export const pending=query({args:{projectId:v.id('projects'),connectionId:v.id('enterpriseAppConnections')},handler:async(ctx,args)=>{
  if(!await ctx.auth.getUserIdentity())return permitDenied();
  const live=await permitLifecycleOwner(ctx as any,args.connectionId);if(live.project._id!==args.projectId)return permitDenied();
  if(live.connection.revokedAt!==undefined||live.connection.expiresAt<=Date.now()||live.enrollment.revokedAt!==null||live.enrollment.expiresAt<=Date.now())return {truncated:false,requests:[],setupRequired:true};
  const rows=await ctx.db.query('enterprisePermitRequests').withIndex('by_connection_intent',q=>q.eq('connectionId',args.connectionId)).take(101);
  return {truncated:rows.length>100,requests:rows.slice(0,100).map(r=>({requestId:r._id,missionId:r.missionId,workOrderId:r.workOrderId,work:r.request.work,
    planDigest:r.request.expectedPlanDigest,admission:r.request.admission,createdAt:r.createdAt}))};
}});

export const pendingControl=internalMutation({args:{envelope:commandEnvelope,payloadJson:v.string()},handler:async(ctx,args)=>{
 let input:any;try{input=JSON.parse(args.payloadJson);}catch{return permitDenied();}
 if(!input||Object.keys(input).sort().join(',')!=='connectionId,permitId,schema'||input.schema!=='mc-permit-control-read/v1')return permitDenied();
 const live=await authenticatePermitCommand(ctx,args.envelope,args.payloadJson,input.connectionId,'enterprise.readPermitControl',true);
 const row=await ctx.db.get(input.permitId as Id<'enterpriseExecutionPermits'>);
 if(!row||row.connectionId!==live.connection._id||row.ownerId!==live.owner._id)return permitDenied();
 if(!row.control)return {status:'NO_CONTROL'};
 const document={...permitControlDocument(row),issuedAt:Date.now(),expiresAt:Math.min(Date.now()+30000,args.envelope.expiresAt)};
 return {status:'CONTROL',document,enrollment:live.enrollment,controlDigest:permitControlDigest(permitControlDocument(row))};
}});
export const acknowledgeControl=internalMutation({args:{envelope:commandEnvelope,payloadJson:v.string()},handler:async(ctx,args)=>{
 let input:any;try{input=JSON.parse(args.payloadJson);}catch{return permitDenied();}
 if(!input||Object.keys(input).sort().join(',')!=='authority,cleanup,connectionId,controlDigest,permitId,schema,sequence'
   ||input.schema!=='mc-permit-control-ack/v1'||!['FENCED','NEW_ADMISSIONS_DENIED'].includes(input.authority)||!['PENDING_BACKEND','CONFIRMED'].includes(input.cleanup))return permitDenied();
 const live=await authenticatePermitCommand(ctx,args.envelope,args.payloadJson,input.connectionId,'enterprise.acknowledgePermitControl',true);
 const row=await ctx.db.get(input.permitId as Id<'enterpriseExecutionPermits'>);
 if(!row||row.connectionId!==live.connection._id||row.ownerId!==live.owner._id||!row.control||row.control.sequence!==input.sequence
   ||(row.control.operation==='revoke'?input.authority!=='FENCED':input.authority!=='NEW_ADMISSIONS_DENIED')
   ||permitControlDigest(permitControlDocument(row))!==input.controlDigest)return permitDenied();
 const prior=row.control.acknowledgment;
 if(prior?.cleanup==='CONFIRMED'&&input.cleanup!=='CONFIRMED')return permitDenied();
 if(!prior||prior.cleanup!==input.cleanup)await ctx.db.patch(row._id,{control:{...row.control,acknowledgment:{controlDigest:input.controlDigest,authority:input.authority,cleanup:input.cleanup,acknowledgedAt:Date.now()}}});
 return {permitId:row._id,sequence:row.control.sequence,authority:input.authority,cleanup:input.cleanup,accounting:'UNCHANGED'};
}});
