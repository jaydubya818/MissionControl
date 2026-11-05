import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {startFixtureDatabase} from '../enterprise-compatibility/database.mjs';
const output=resolve(process.argv[2]);await mkdir(output,{recursive:true});
const report={recordedAt:new Date().toISOString(),source:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),sourceDirty:!!execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim(),scope:'DISPOSABLE_POLICY_AND_MISSION_TASK_AUTHORITY',checks:[],failures:[],status:'IN_PROGRESS'};
const db=await startFixtureDatabase(process.cwd(),{nativeExecution:true});
const check=async(name,fn)=>{try{await fn();report.checks.push(name);}catch(e){report.failures.push({name,error:String(e)});}};
const denied=/authenticated|unavailable|unauthorized|not permit|required|permission/i;
try{
 const s=db.seed,o=db.owner,f=await o.mutation('isolationFixture:approvalBoundarySeed',{scope:s});
 const mission=await db.peer.mutation('missions:createDraft',{projectId:s.projectId,title:'Delivery-owner authority regression',objective:'Preserve explicit approval authority',stopCondition:'No productive execution',idempotencyKey:randomUUID()});
 await o.mutation('isolationFixture:legacyDeliveryRole',{operatorId:s.peerId,projectId:s.projectId,tenantId:s.tenantId});
 const m=await o.mutation('isolationFixture:policyCompletionSeed',{scope:s,missionId:mission.mission._id});
 const approver=db.client('fixture-approver');
 const fault=(id,patch,unset=[])=>o.mutation('nativeFixture:fault',{id,patch,unset});
 const definition={name:'Approval boundary policy',scopeType:'GLOBAL',rules:{reviewToDoneRequiresApproval:false}};
 for(const[name,client]of[['anonymous',db.anonymous],['delivery-only',db.peer],['approver-only',approver],['foreign-tenant',db.other]]){
  await check(name+'-global-policy-create-denied',()=>assert.rejects(client.mutation('policy:create',definition),denied));
  await fault(f.policyId,{active:true});
  await check(name+'-policy-deactivate-denied',()=>assert.rejects(client.mutation('policy:deactivate',{policyId:f.policyId}),denied));
  await check(name+'-scoped-policy-create-denied',()=>assert.rejects(client.mutation('policy:create',{...definition,projectId:s.projectId}),denied));
 }
 await fault(f.policyId,{active:true});
 await check('owner-can-replace-own-policy-without-touching-foreign-policy',async()=>{
  const foreignBefore=(await o.query('policy:listAll',{})).find(p=>p.projectId===s.otherProjectId);
  const result=await o.mutation('policy:create',{...definition,projectId:s.projectId,rules:{reviewToDoneRequiresApproval:true}});
  assert.equal(result.policy.projectId,s.projectId);assert.equal(result.policy.tenantId,s.tenantId);assert.equal(result.policy.active,true);assert.equal(result.policy.rules.reviewToDoneRequiresApproval,true);
  if(foreignBefore)assert.deepEqual((await o.query('policy:listAll',{})).find(p=>p._id===foreignBefore._id),foreignBefore);
 });
 await check('owner-global-write-is-internal-only',()=>assert.rejects(o.mutation('policy:create',definition),denied));
 const link=(client,id)=>client.mutation('tasks:linkToWorkOrder',{projectId:s.projectId,taskId:id,workOrderId:m.wo,actorType:'HUMAN',actorId:'forged',idempotencyKey:randomUUID()});
 await check('delivery-only-Mission-owner-cannot-link-legacy-Task',()=>assert.rejects(link(db.peer,m.taskId),denied));
 await check('owner-cannot-reparent-started-or-review-Task',async()=>{await fault(mission.mission._id,{ownerOperatorId:s.operatorId});await assert.rejects(link(o,m.taskId),/pre-execution|started|before execution/i);await fault(mission.mission._id,{ownerOperatorId:s.peerId});});
 await check('authorized-owner-can-link-pre-execution-Task',async()=>{
  await fault(mission.mission._id,{ownerOperatorId:s.operatorId});
  const result=await link(o,m.readyId);assert.equal(result.linked,true);
  await fault(mission.mission._id,{ownerOperatorId:s.peerId});
 });
 for(const active of [true,false])await check('Mission-owner-without-approval-cannot-complete-policy-'+active,async()=>{
  for(const p of await o.query('policy:listAll',{}))await fault(p._id,{active});
  await fault(m.taskId,{workOrderId:m.wo,status:'NEEDS_APPROVAL'});
  await assert.rejects(db.peer.mutation('tasks:transition',{taskId:m.taskId,toStatus:'DONE',actorType:'HUMAN',idempotencyKey:randomUUID()}),denied);
  assert.equal((await db.peer.query('tasks:get',{taskId:m.taskId})).status,'NEEDS_APPROVAL');
 });
 await check('approver-owner-can-complete-Mission-Task-with-no-gate-policy',async()=>{
  await fault(mission.mission._id,{ownerOperatorId:s.operatorId});await fault(m.taskId,{status:'NEEDS_APPROVAL'});
  const result=await o.mutation('tasks:transition',{taskId:m.taskId,toStatus:'DONE',actorType:'HUMAN',idempotencyKey:randomUUID()});assert.equal(result.success,true);
 });
 await check('anonymous-policy-query-evaluation-denied',()=>assert.rejects(db.anonymous.query('policy:evaluate',{agentId:f.agentId,actionType:'TOOL_CALL',toolName:'shell'}),denied));
 for(const[name,client]of[['anonymous',db.anonymous],['delivery-only',db.peer],['foreign-tenant',db.other]])
  await check(name+'-mutating-policy-evaluation-denied',()=>assert.rejects(client.mutation('policy:evaluateWithARM',{agentId:f.agentId,actionType:'TOOL_CALL',toolName:'shell'}),denied));
 const envelopeArgs={projectId:s.projectId,tenantId:s.tenantId,name:'Scoped policy authority',rules:{defaultDecision:'DENY'}};
 const envelope=await o.mutation('governance/policyEnvelopes:createPolicyEnvelope',envelopeArgs);
 for(const[name,client]of[['anonymous',db.anonymous],['delivery-only',db.peer],['approver-only',approver],['foreign-tenant',db.other]]){
  await check(name+'-policy-envelope-create-denied',()=>assert.rejects(client.mutation('governance/policyEnvelopes:createPolicyEnvelope',envelopeArgs),denied));
  await check(name+'-policy-envelope-toggle-denied',()=>assert.rejects(client.mutation('governance/policyEnvelopes:attachPolicy',{envelopeId:envelope._id,active:false}),denied));
 }
 await check('owner-can-update-own-policy-envelope',async()=>{const result=await o.mutation('governance/policyEnvelopes:attachPolicy',{envelopeId:envelope._id,active:false});assert.equal(result.active,false);});
 await check('tenant-only-envelope-cannot-be-publicly-created',()=>assert.rejects(o.mutation('governance/policyEnvelopes:createPolicyEnvelope',{tenantId:s.tenantId,name:'Unbound envelope',rules:{}}),denied));
 await check('foreign-workspace-envelope-does-not-apply-through-tenant-index',async()=>{
  await o.mutation('governance/policyEnvelopes:createPolicyEnvelope',{...envelopeArgs,projectId:f.restrictedProjectId,priority:10000});
  const result=await o.query('governance/policyEnvelopes:evaluate',{tenantId:s.tenantId,projectId:s.projectId,riskLevel:'YELLOW'});assert.equal(result.source,'fallback');assert.equal(result.decision,'ALLOW');
 });
 const record=await o.mutation('governance/approvalRecords:createApprovalRecord',{tenantId:s.tenantId,projectId:s.projectId,actionType:'SYNTHETIC_AUDIT',riskLevel:'YELLOW',justification:'Authenticated audit control'});
 for(const[name,client]of[['anonymous',db.anonymous],['delivery-only',db.peer],['foreign-tenant',db.other]])for(const status of ['APPROVED','CANCELED'])
  await check(name+'-audit-record-'+status+'-denied',()=>assert.rejects(client.mutation('governance/approvalRecords:decideApproval',{approvalRecordId:record._id,status,decidedBy:s.operatorId}),denied));
 await check('audit-decision-uses-actual-operator',async()=>{const result=await o.mutation('governance/approvalRecords:decideApproval',{approvalRecordId:record._id,status:'APPROVED',decidedBy:s.peerId});assert.equal(result.decidedBy,s.operatorId);});
 await check('anonymous-platform-policy-maintenance-denied',()=>assert.rejects(db.anonymous.mutation('policy:setGlobal',{name:'Platform qualification',rules:{reviewToDoneRequiresApproval:true},active:true}),/public|not found/i));
 await check('internal-platform-policy-is-read-compatible-and-publicly-immutable',async()=>{
  const id=await db.maintenance.mutation('policy:setGlobal',{name:'Platform qualification',rules:{reviewToDoneRequiresApproval:true},active:true});
  assert.equal((await o.query('policy:getActive',{}))._id,id);
  assert.equal(await db.anonymous.query('policy:getActive',{}),null);
  assert.equal(await db.client('fixture-unregistered').query('policy:getActive',{}),null);
  await assert.rejects(o.mutation('policy:deactivate',{policyId:id}),denied);
 });
 assert.deepEqual(report.failures,[]);report.status='PASS';
}catch(e){report.status='FAIL';report.error=String(e);throw e;}
finally{await db.destroy();report.cleanup='VERIFIED';await writeFile(join(output,'qualification.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,checks:report.checks.length,failures:report.failures.length}));}
