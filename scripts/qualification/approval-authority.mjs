import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {startFixtureDatabase} from '../enterprise-compatibility/database.mjs';
const output=resolve(process.argv[2]);await mkdir(output,{recursive:true});
const receipt={recordedAt:new Date().toISOString(),source:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),sourceDirty:!!execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim(),scope:'DISPOSABLE_APPROVAL_AND_MEMBERSHIP_AUTHORITY',checks:[],failures:[],status:'IN_PROGRESS'};
const db=await startFixtureDatabase(process.cwd(),{nativeExecution:true});
const check=async(name,fn)=>{try{await fn();receipt.checks.push(name);}catch(e){receipt.failures.push({name,error:String(e)});}};
const denied=/Authenticated|unavailable|unauthorized|role does not permit|permission|required/i,privateFunction=/Could not find public function|not.*public|not found/i;
try{
 const s=db.seed,o=db.owner,f=await o.mutation('isolationFixture:approvalBoundarySeed',{scope:s});
 await o.mutation('isolationFixture:legacyDeliveryRole',{operatorId:s.peerId,projectId:s.projectId,tenantId:s.tenantId});
 const fault=(id,patch,unset=[])=>o.mutation('nativeFixture:fault',{id,patch,unset});
 const transition=(client,taskId,toStatus)=>client.mutation('tasks:transition',{taskId,toStatus,actorType:'HUMAN',actorUserId:'forged-actor',idempotencyKey:randomUUID()});
 await check('delivery-cannot-complete-through-NEEDS_APPROVAL',async()=>{
  assert.equal((await transition(db.peer,f.taskId,'NEEDS_APPROVAL')).success,true);
  try{const result=await transition(db.peer,f.taskId,'DONE');assert.equal(result.success,false);}catch(e){assert.match(String(e),denied);}
  assert.notEqual((await o.query('tasks:get',{taskId:f.taskId})).status,'DONE');
 });
 await check('owner-DONE-needs-approved-record-from-every-prior-state',async()=>{
  const result=await transition(o,f.secondTaskId,'DONE');assert.equal(result.success,false);assert.ok(result.errors.some(e=>/approval/i.test(e.message)));
 });
 for(const [name,client]of[['anonymous',db.anonymous],['delivery-only',db.peer],['foreign-tenant',db.other]])for(const op of ['approve','deny'])
  await check(name+'-'+op+'-denied',()=>assert.rejects(client.mutation('approvals:'+op,{approvalId:f.yellowId,decidedByUserId:'forged-actor',reason:'Synthetic decision'}),denied));
 await check('one-person-cannot-satisfy-dual-control-with-claimed-IDs',async()=>{
  const first=await o.mutation('approvals:approve',{approvalId:f.redId,decidedByUserId:'forged-first'});assert.equal(first.pendingSecondDecision,true);
  const second=await o.mutation('approvals:approve',{approvalId:f.redId,decidedByUserId:'forged-second'});assert.equal(second.success,false);
  const saved=await o.query('approvals:get',{approvalId:f.redId});assert.equal(saved.status,'PENDING');assert.equal(saved.firstDecisionByUserId,db.ownerSubject);assert.equal(saved.firstDecisionOperatorId,s.operatorId);
 });
 await check('two-distinct-authorized-operators-can-approve',async()=>{
  const result=await db.client('user_SyntheticPlanAuthorQualification').mutation('approvals:approve',{approvalId:f.redId,decidedByUserId:'forged-owner'});
  assert.equal(result.success,true);assert.equal(result.approval.status,'APPROVED');assert.equal(result.approval.decidedByOperatorId,s.authorId);
 });
 await check('unsigned-historical-APPROVED-record-cannot-complete-Task',async()=>{
  await fault(f.yellowId,{taskId:f.secondTaskId,status:'APPROVED',decidedByUserId:'unverified-old-label',decisionCount:1});
  const result=await transition(o,f.secondTaskId,'DONE');assert.equal(result.success,false);assert.ok(result.errors.some(e=>/authenticated approved/i.test(e.message)));
 });
 await check('authenticated-dual-control-allows-Task-completion',async()=>{
  assert.equal((await transition(o,f.taskId,'DONE')).success,true);
  assert.equal((await o.query('tasks:get',{taskId:f.taskId})).status,'DONE');
 });
 const requestArgs={projectId:s.projectId,taskId:f.secondTaskId,requestorAgentId:f.agentId,actionType:'TASK_COMPLETION',actionSummary:'Explicit operator review',riskLevel:'YELLOW',justification:'Synthetic public request'};
 await check('anonymous-approval-request-denied',()=>assert.rejects(db.anonymous.mutation('approvals:request',requestArgs),denied));
 await check('manual-request-cannot-mint-GREEN-auto-approval',()=>assert.rejects(o.mutation('approvals:request',{...requestArgs,riskLevel:'GREEN'}),/YELLOW or RED/));
 await check('owner-request-and-decision-complete-Task',async()=>{
  const created=await o.mutation('approvals:request',requestArgs);assert.equal(created.approval.status,'PENDING');
  const decided=await o.mutation('approvals:approve',{approvalId:created.approval._id,decidedByAgentId:f.agentId,decidedByUserId:'forged'});
  assert.equal(decided.approval.decidedByUserId,db.ownerSubject);assert.equal(decided.approval.decidedByOperatorId,s.operatorId);assert.equal(decided.approval.decidedByAgentId,undefined);
  assert.equal((await transition(o,f.secondTaskId,'DONE')).success,true);
 });
 await check('owner-can-deny-with-authenticated-audit-identity',async()=>{
  const created=await o.mutation('approvals:request',{...requestArgs,taskId:undefined});
  const denied=await o.mutation('approvals:deny',{approvalId:created.approval._id,decidedByUserId:'forged',reason:'Needs revision'});
  assert.equal(denied.approval.status,'DENIED');assert.equal(denied.approval.decidedByUserId,db.ownerSubject);
 });
 const newMember={projectId:s.projectId,name:'Synthetic new member',role:'Member',level:0};
 for(const[name,client]of[['anonymous',db.anonymous],['delivery-only',db.peer],['foreign-tenant',db.other]])
  await check(name+'-member-create-denied',()=>assert.rejects(client.mutation('orgMembers:create',newMember),denied));
 await check('owner-can-create-explicit-company-member',async()=>{const id=await o.mutation('orgMembers:create',newMember);assert.equal((await o.query('orgMembers:get',{id})).tenantId,s.tenantId);});
 await check('owner-cannot-create-member-with-foreign-project-grant',()=>assert.rejects(o.mutation('orgMembers:create',{...newMember,projectAccess:[{projectId:s.otherProjectId,accessLevel:'VIEW'}]}),denied));
 for(const[name,client]of[['anonymous',db.anonymous],['delivery-only',db.peer]]){
  for(const[operation,args]of [['update',{id:f.peerMemberId,active:false}],['updatePermissions',{id:f.peerMemberId,systemRole:'OWNER'}],['addProjectAccess',{memberId:f.peerMemberId,projectId:f.restrictedProjectId,accessLevel:'VIEW'}],['removeProjectAccess',{memberId:f.peerMemberId,projectId:s.projectId}],['remove',{id:f.peerMemberId}],['move',{id:f.peerMemberId,newLevel:2}]]){
   await fault(f.peerMemberId,{active:true,systemRole:'MEMBER',projectAccess:[],level:0});
   await check(name+'-member-'+operation+'-denied',()=>assert.rejects(client.mutation('orgMembers:'+operation,args),denied));
  }
 }
 await fault(f.peerMemberId,{active:true,projectAccess:[]});
 await check('linked-profile-cannot-self-grant-private-workspace',async()=>{
  assert.equal(await db.peer.query('tasks:get',{taskId:f.privateTaskId}),null);
  await assert.rejects(db.anonymous.mutation('orgMembers:addProjectAccess',{memberId:f.peerMemberId,projectId:f.restrictedProjectId,accessLevel:'VIEW'}),denied);
  assert.equal(await db.peer.query('tasks:get',{taskId:f.privateTaskId}),null);
 });
 await check('owner-can-manage-explicit-same-company-access',async()=>{
  await o.mutation('orgMembers:addProjectAccess',{memberId:f.peerMemberId,projectId:f.restrictedProjectId,accessLevel:'VIEW'});
  assert.ok(await db.peer.query('tasks:get',{taskId:f.privateTaskId}));
  await assert.rejects(o.mutation('orgMembers:addProjectAccess',{memberId:f.peerMemberId,projectId:s.otherProjectId,accessLevel:'VIEW'}),denied);
 });
 await check('unbound-project-cannot-be-publicly-adopted',()=>assert.rejects(db.anonymous.mutation('migrations/backfillInstanceRefs:backfillProjectTenant',{projectId:f.unboundProjectId}),privateFunction));
 for(const [fn,args] of [['standup:runDaily',{}],['approvals:expireStale',{}],['approvals:escalateOverdue',{}],['contentDrops:seedContentDrops',{}],['setupSellerFiAgents:createSellerFiAgents',{}],['agents:resetAll',{}]])
  await check('administrator-only-'+fn,()=>assert.rejects(db.anonymous.mutation(fn,args),privateFunction));
 await check('internal-project-migration-requires-explicit-tenant',()=>assert.rejects(db.maintenance.mutation('migrations/backfillInstanceRefs:backfillProjectTenant',{projectId:f.unboundProjectId}),/tenantId|required/i));
 await check('internal-project-migration-accepts-explicit-binding',async()=>{const result=await db.maintenance.mutation('migrations/backfillInstanceRefs:backfillProjectTenant',{projectId:f.unboundProjectId,tenantId:s.tenantId});assert.equal(result.updated,true);});
 await check('internal-project-migration-cannot-rebind-existing-owner',()=>assert.rejects(db.maintenance.mutation('migrations/backfillInstanceRefs:backfillProjectTenant',{projectId:f.unboundProjectId,tenantId:f.otherTenantId}),/immutable/));
 await check('internal-expiry-handles-Task-linked-legacy-approval',async()=>{
  await db.maintenance.mutation('approvals:expireStale',{});assert.equal((await o.query('approvals:get',{approvalId:f.expiredId})).status,'EXPIRED');
 });
 await check('internal-escalation-handles-taskless-approval',async()=>{
  await db.maintenance.mutation('approvals:escalateOverdue',{projectId:s.projectId,slaMinutes:0});assert.equal((await o.query('approvals:get',{approvalId:f.tasklessId})).status,'ESCALATED');
 });
 await check('internal-daily-standup-runs-without-user-identity',async()=>{assert.equal((await db.maintenance.mutation('standup:runDaily',{})).success,true);});
 await check('internal-migration-health-runs-without-guessing-a-tenant',async()=>{const result=await db.maintenance.mutation('migrations/backfillInstanceRefs:guardMigrationHealth',{});assert.equal(result.healthy,false);assert.ok(result.totalDrift>0);assert.ok(result.alertId);});
 await check('nested-write-invalidates-permission-and-read-cache',async()=>{
  const result=await db.peer.mutation('isolationFixture:nestedLegacyPermissionRevocation',{taskId:f.taskId});
  assert.deepEqual(result,{visibleBefore:true,visibleAfter:false});
 });
 assert.deepEqual(receipt.failures,[]);receipt.status='PASS';
}catch(e){receipt.status='FAIL';receipt.error=String(e);throw e;}
finally{await db.destroy();receipt.cleanup='VERIFIED';await writeFile(join(output,'qualification.json'),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify({status:receipt.status,checks:receipt.checks.length,failures:receipt.failures.length}));}
