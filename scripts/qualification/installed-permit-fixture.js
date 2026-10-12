// Included only in the disposable local database harness; never deployed.
import {internalMutationGeneric as mutation,internalQueryGeneric as query} from 'convex/server';
import {revokePlanPermits} from './lib/permitLifecycle';
import {enterpriseDigest} from '../packages/shared/src/sofieEnterprise';
export const setup=mutation({handler:async(ctx,{seed:s,enrollment})=>{
 if((await ctx.auth.getUserIdentity())?.subject!=='fixture-owner')throw Error('FIXTURE_OWNER');
 const now=Date.now();
 await ctx.db.patch(s.projectId,{metadata:{sofieMode:'INSTALLED_NONPRODUCTION',productionAuthority:false}});
 const memberId=await ctx.db.insert('orgMembers',{tenantId:s.tenantId,projectId:s.projectId,operatorId:s.operatorId,name:'Fixture owner',role:'Owner',level:0,active:true});
 const teamId=await ctx.db.insert('scrumTeams',{tenantId:s.tenantId,projectId:s.projectId,name:'Fixture team',slug:'fixture',status:'ACTIVE',createdAt:now,updatedAt:now});
 await ctx.db.insert('teamMemberships',{tenantId:s.tenantId,projectId:s.projectId,teamId,memberId,operatorId:s.operatorId,role:'LEAD',active:true,activeFrom:now-1000,createdAt:now,updatedAt:now});
 const connectionId=await ctx.db.insert('enterpriseAppConnections',{tenantId:s.tenantId,projectId:s.projectId,ownerId:s.operatorId,ownerMemberId:memberId,owningTeamId:teamId,applicationId:'myeve-sofie-readiness-v1',keyId:'fixture-service',expiresAt:now+600000,createdAt:now});
 const e={...enrollment,connectionId,tenantId:s.tenantId,projectId:s.projectId,missionControlOwnerId:s.operatorId};
 await ctx.db.patch(connectionId,{installedEnrollment:e});
 await ctx.db.patch(s.missionId,{state:'READY',ownerMemberId:memberId,owningTeamId:teamId,ownerOperatorId:s.operatorId});
 await ctx.db.insert('missionAssignments',{tenantId:s.tenantId,projectId:s.projectId,missionId:s.missionId,memberId,teamId,role:'OWNER',active:true,activeFrom:now-1000,createdAt:now,updatedAt:now});
 await ctx.db.patch(s.missionPlanId,{status:'APPROVED',revisionNumber:1,approvedBy:s.operatorId,approvedAt:now,decidedActorSource:'AUTHENTICATED',releasedWorkOrderIds:[s.workOrderId]});
 await ctx.db.patch(s.workOrderId,{state:'READY',missionPlanId:s.missionPlanId,missionPlanRevision:1,currentRevisionNumber:1,ownerMemberId:memberId,owningTeamId:teamId});
 await ctx.db.patch(s.workOrderRevisionId,{status:'APPLIED',revisionNumber:1});
 const proposal={connectionId,tenantId:s.tenantId,projectId:s.projectId,ownerId:s.operatorId,intentKey:'fixture',proposal:{title:'Same Mission',objective:'No execution',workstreams:['one'],milestones:['one'],stopCondition:'source only',budgetMicrousd:0}};
 const digest=enterpriseDigest(proposal);
 const proposalId=await ctx.db.insert('enterpriseMissionProposals',{...proposal,digest,authorizedDigest:digest,authorizedAt:now,createdAt:now,expiresAt:now+600000,missionId:s.missionId});
 return {...s,memberId,teamId,connectionId,proposalId,enrollment:e,planDigest:enterpriseDigest(await ctx.db.get(s.missionPlanId))};
}});
export const disablePlan=mutation({handler:async(ctx,{missionId,planId})=>{if((await ctx.auth.getUserIdentity())?.subject!=='fixture-owner')throw Error('FIXTURE_OWNER');await revokePlanPermits(ctx,missionId,planId,'fixture plan supersession');}});
export const patch=mutation({handler:async(ctx,{id,patch,unset=[]})=>{if((await ctx.auth.getUserIdentity())?.subject!=='fixture-owner')throw Error('FIXTURE_OWNER');await ctx.db.patch(id,{...patch,...Object.fromEntries(unset.map(k=>[k,undefined]))});}});
export const rows=query({handler:async(ctx,{table})=>{if((await ctx.auth.getUserIdentity())?.subject!=='fixture-owner')throw Error('FIXTURE_OWNER');return ctx.db.query(table).collect();}});
