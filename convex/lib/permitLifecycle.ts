import {makeFunctionReference} from 'convex/server';
import type { MutationCtx } from '../_generated/server';
import type { Doc,Id } from '../_generated/dataModel';
import {parseExecutionPermit,canonicalPermitJson} from '../../packages/shared/src/executionPermit';
import {sha256Hex} from '../../packages/shared/src/canonicalDigest';

export function permitControlDocument(row:Doc<'enterpriseExecutionPermits'>) {
 const p=parseExecutionPermit(row.document);
 if(!row.control||row.revokedAt===undefined)throw Error('PERMIT_CONTROL_UNAVAILABLE');
 return {schema:'mc-permit-control/v1' as const,permitId:row._id,permitSha256:row.permitSha256,sequence:row.control.sequence,
   operation:row.control.operation,reason:row.control.reason,requestedAt:row.control.requestedAt,issuer:p.issuer,audience:p.audience,
   installationId:p.installationId,connectionId:p.connectionId,enrollmentRevision:p.enrollmentRevision,ownerId:p.ownerId,ownerSubject:p.ownerSubject,
   missionControlOwnerId:p.missionControlOwnerId,tenantId:p.tenantId,projectId:p.projectId,missionId:p.missionId,planId:p.planId,
   workOrderId:p.workOrderId,workOrderRevisionId:p.workOrderRevisionId,work:p.work};
}
export const permitControlDigest=(document:ReturnType<typeof permitControlDocument>)=>sha256Hex(`mc-permit-control/v1\n${canonicalPermitJson(document)}`);
export async function revokePermit(ctx:MutationCtx,row:Doc<'enterpriseExecutionPermits'>,reason:string,operation:'revoke'|'disable_new'='revoke') {
 if(row.control?.operation==='revoke'||row.control?.operation===operation)return;
 const now=Date.now();
 await ctx.db.patch(row._id,{revokedAt:now,control:{sequence:(row.control?.sequence??0)+1,operation,reason,requestedAt:now}});
 await ctx.db.patch(row.approvalId,{revokedAt:now});
 if(process.env.MC_SOFIE_CONTROL_DELIVERY_ENABLED==='true')await ctx.scheduler.runAfter(0,makeFunctionReference<'action'>('sofiePermitControlDelivery:deliver'),{permitId:row._id,sequence:(row.control?.sequence??0)+1});
 await ctx.db.insert('missionEvents',{missionId:row.missionId,projectId:row.projectId,tenantId:row.tenantId,eventType:'INSTALLED_PERMIT_REVOKE_REQUESTED',
   actorType:'SYSTEM',actorId:row.ownerId,timestamp:now,summary:'New MissionControl admissions denied; receiving authority and cleanup pending',metadata:{permitId:row._id,reason}});
}
export async function revokePlanPermits(ctx:MutationCtx,missionId:Id<'missions'>,planId:Id<'missionPlans'>,reason:string) {
 const rows=await ctx.db.query('enterpriseExecutionPermits').withIndex('by_mission',q=>q.eq('missionId',missionId)).take(101);
 if(rows.length>100)throw Error('PERMIT_REVOCATION_RECONCILIATION_REQUIRED');
 for(const row of rows)if(parseExecutionPermit(row.document).planId===planId)await revokePermit(ctx,row,reason,'disable_new');
}
