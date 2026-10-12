'use node';
import {v} from 'convex/values';
import {makeFunctionReference} from 'convex/server';
import {internalAction} from './_generated/server';
import {signConfiguredPermitDocument} from './lib/executionPermitCrypto';
import {deliverInstalledControl} from './lib/installedControlDelivery';

export const deliver=internalAction({args:{permitId:v.id('enterpriseExecutionPermits'),sequence:v.number()},handler:async(ctx,args)=>{
 if(process.env.MC_SOFIE_CONTROL_DELIVERY_ENABLED!=='true')return {delivery:'DISABLED',authority:'PENDING_BACKEND'};
 const value=await ctx.runMutation(makeFunctionReference<'mutation'>('sofiePermitControlDeliveryState:read'),args);
 if(!value)return {delivery:'SUPERSEDED_OR_ACKNOWLEDGED'};
 let outcome:'DELIVERED'|'PENDING_BACKEND'='PENDING_BACKEND';
 try{const control=signConfiguredPermitDocument(value);outcome=await deliverInstalledControl({status:'CONTROL',control,controlDigest:value.controlDigest},value.enrollment.audience);}catch{/* Retain pending status; pull recovery reads the same durable sequence. */}
 return ctx.runMutation(makeFunctionReference<'mutation'>('sofiePermitControlDeliveryState:record'),{...args,controlDigest:value.controlDigest,outcome});
}});
