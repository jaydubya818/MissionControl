'use node';
import { capabilityBindings } from './capabilityPolicy';
import { signPolicyMessage } from './lib/capabilityOrderingWire';
import { authenticateInstalledSofieCommand } from './lib/installedSofieTransport';
import { v } from 'convex/values';
import { action } from './_generated/server';
import { makeFunctionReference } from 'convex/server';
import { signConfiguredPermitDocument as signed } from './lib/executionPermitCrypto';
import { permitDenied, type PermitControlDelivery, type ExecutionPermit, type AdmissionReceipt, type OwnerEnrollment } from '../packages/shared/src/executionPermit';
const envelope=v.object({serviceId:v.string(),capability:v.string(),projectId:v.string(),repositoryId:v.string(),commandId:v.string(),issuedAt:v.number(),expiresAt:v.number(),payloadDigest:v.string(),signature:v.string()});
export const issue=action({args:{permitId:v.id('enterpriseExecutionPermits')},handler:async(ctx,args)=>{
  if(!await ctx.auth.getUserIdentity()) return permitDenied();
  const value=await ctx.runMutation(makeFunctionReference<'mutation'>('sofieExecutionPermitState:readForSigning'),args);
  return signed(value);
}});
export const authorizeAdmission=action({args:{envelope,payloadJson:v.string()},handler:async(ctx,args)=>{
 await authenticateInstalledSofieCommand(args,'enterprise.authorizeAdmission');
  const value=await ctx.runMutation(makeFunctionReference<'mutation'>('sofieExecutionPermitState:authorizeAdmission'),args);
  return signed(value);
}});

export const readApproved=action({args:{envelope,payloadJson:v.string()},handler:async(ctx,args)=>{
 await authenticateInstalledSofieCommand(args,'enterprise.readApprovedPermit');
  const value=await ctx.runMutation(makeFunctionReference<'mutation'>('sofieExecutionPermitState:readApproved'),args);
  const c=value.challenge;
  const binding=capabilityBindings().find(b=>b.ownerId===c.ownerId&&b.organizationId===c.organizationId&&b.installationId===c.installationId&&b.backendId===c.backendId
    &&b.incarnation===c.incarnation&&b.enrollmentVersion===c.enrollmentVersion);
  if(!binding||c.expiresAt<=Date.now()) return permitDenied();
  return {permit:signed(value),capabilityChallenge:await signPolicyMessage(c,binding.acknowledgmentKey)};
}});

export const preparePermit=action({args:{envelope,payloadJson:v.string()},handler:async(ctx,args)=>{
 await authenticateInstalledSofieCommand(args,'enterprise.preparePermit');
  return ctx.runMutation(makeFunctionReference<'mutation'>('sofieExecutionPermitState:prepare'),args);
}});

export const readControl=action({args:{envelope,payloadJson:v.string()},handler:async(ctx,args)=>{
 await authenticateInstalledSofieCommand(args,'enterprise.readPermitControl');
 const value=await ctx.runMutation(makeFunctionReference<'mutation'>('sofieExecutionPermitState:pendingControl'),args);
 return value.status==='NO_CONTROL'?value:{status:'CONTROL',control:signed(value),controlDigest:value.controlDigest};
}});
export const acknowledgeControl=action({args:{envelope,payloadJson:v.string()},handler:async(ctx,args)=>{
 await authenticateInstalledSofieCommand(args,'enterprise.acknowledgePermitControl');
 return ctx.runMutation(makeFunctionReference<'mutation'>('sofieExecutionPermitState:acknowledgeControl'),args);
}});
