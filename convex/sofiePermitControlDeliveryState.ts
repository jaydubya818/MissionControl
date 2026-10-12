import {v} from 'convex/values';
import {internalMutation} from './_generated/server';
import {controlConnection} from './lib/executionPermitAuthority';
import {permitControlDigest,permitControlDocument} from './lib/permitLifecycle';

export const read=internalMutation({args:{permitId:v.id('enterpriseExecutionPermits'),sequence:v.number()},handler:async(ctx,args)=>{
 const row=await ctx.db.get(args.permitId);if(!row?.control||row.control.sequence!==args.sequence||row.control.acknowledgment)return null;
 const live=await controlConnection(ctx,row.connectionId,'enterprise.readPermitControl');
 const document=permitControlDocument(row),now=Date.now();
 return {document:{...document,issuedAt:now,expiresAt:now+30000},enrollment:live.enrollment,controlDigest:permitControlDigest(document)};
}});
export const record=internalMutation({args:{permitId:v.id('enterpriseExecutionPermits'),sequence:v.number(),controlDigest:v.string(),outcome:v.union(v.literal('DELIVERED'),v.literal('PENDING_BACKEND'))},handler:async(ctx,args)=>{
 const row=await ctx.db.get(args.permitId);
 if(!row?.control||row.control.sequence!==args.sequence||permitControlDigest(permitControlDocument(row))!==args.controlDigest)return {delivery:'SUPERSEDED'};
 await ctx.db.patch(row._id,{control:{...row.control,delivery:{attemptedAt:Date.now(),outcome:args.outcome}}});
 return {delivery:args.outcome,authority:row.control.acknowledgment?.authority??'PENDING_BACKEND',cleanup:row.control.acknowledgment?.cleanup??'PENDING_BACKEND'};
}});
