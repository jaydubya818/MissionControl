import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { startFixtureDatabase } from '../enterprise-compatibility/database.mjs';
import { RENDER_MARKDOWN_OPERATION, RENDER_MARKDOWN_OPERATION_DIGEST } from '@mission-control/workflow-engine/harness-contract';
const output=resolve(process.argv[2]);await mkdir(output,{recursive:true});
const receipt={recordedAt:new Date().toISOString(),runId:randomUUID(),source:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),sourceDirty:!!execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim(),checks:[],status:'IN_PROGRESS',scope:'DISPOSABLE_TWO_MISSION_BACKEND'};
const db=await startFixtureDatabase(process.cwd(),{nativeExecution:true});
try {
 const s=db.seed,mutate=(name,args)=>db.owner.mutation(name,args);
 const fault=(id,patch,unset=[])=>mutate('nativeFixture:fault',{id,patch,unset});
 await fault(s.projectId,{},['enterpriseAccountingMode']);
 const visible=await mutate('isolationFixture:seed',{scope:s});
 const hidden=await mutate('isolationFixture:seed',{scope:s});
 await fault(hidden.missionId,{ownerOperatorId:s.peerId});
 await mutate('operatorControls:setMode',{projectId:s.projectId,mode:'NORMAL',userId:String(s.operatorId),dailyBudgetUsd:1,perRunBudgetUsd:10,maxConcurrentRuns:1});
 const now=Date.now(),lease={leaseId:'foreign-lease',ownerId:'foreign-worker',claimedAt:now,heartbeatAt:now,expiresAt:now+120000};
 await fault(visible.workflowRunId,{runId:'visible-budget-run',status:'PENDING',startedAt:now,spentUsd:0,reservedCostUsd:0});
 await fault(hidden.workflowRunId,{runId:'hidden-budget-run',status:'RUNNING',startedAt:now,spentUsd:0,reservedCostUsd:0,lease});
 assert.equal(await db.owner.query('workflowRuns:get',{runId:'hidden-budget-run'}),null);
 receipt.checks.push('foreign-Mission-run-remains-private');
 const claim=()=>mutate('workflowRuns:claimExecution',{runId:'visible-budget-run',leaseId:'owner-lease',ownerId:'owner-worker',dispatchMode:'MANUAL',estimatedCostUsd:0.1});
 assert.deepEqual(await claim(),{claimed:false,quarantined:false,reason:'workspace-concurrency-exhausted'});
 receipt.checks.push('hidden-active-lease-enforces-project-concurrency');
 await fault(hidden.workflowRunId,{reservedCostUsd:2},['lease']);
 assert.deepEqual(await claim(),{claimed:false,quarantined:false,reason:'workspace-budget-exhausted'});
 receipt.checks.push('hidden-reservation-enforces-project-daily-budget');
 await fault(visible.workflowRunId,{status:'RUNNING',budgetUsd:10,lease:{...lease,leaseId:'owner-lease',ownerId:'owner-worker'}});
 const heartbeat=await mutate('workflowRuns:heartbeatExecution',{runId:'visible-budget-run',leaseId:'owner-lease',ownerId:'owner-worker',costDeltaUsd:0});
 assert.equal(heartbeat.directive,'BUDGET_STOP');
 receipt.checks.push('heartbeat-stops-at-global-project-budget');
 assert.equal(await db.owner.query('workflowRuns:get',{runId:'hidden-budget-run'}),null);
 const failures=[];
 const check=async(name,fn)=>{try{await fn();receipt.checks.push(name);}catch(error){failures.push({name,error:String(error)});}};
 const permissionDenied=/Authenticated operator|unavailable or unauthorized|role does not permit/i;
 const workflowArgs=workflowId=>({projectId:s.projectId,workflowId,name:'Synthetic workflow authorization',description:'Disposable permission regression; no execution',topology:'LINEAR',maxConcurrency:1,agents:[],active:true,
   steps:[{id:'execute',kind:'DETERMINISTIC',agent:'',retryLimit:0,timeoutMinutes:1,input:JSON.stringify({reference:RENDER_MARKDOWN_OPERATION,digest:RENDER_MARKDOWN_OPERATION_DIGEST,input:{title:'Synthetic',paragraphs:['No execution'],outputPath:'docs/access.md'}}),expects:'Validated deterministic result',outputSchema:{type:'object',required:['status'],properties:{status:{type:'string'}}}}]});
 for(const [actor,client] of [['anonymous',db.anonymous],['foreign-tenant',db.other]])for(const operation of ['setActive','remove']){
   await check(`${actor}-workflow-${operation}-denied`,async()=>{
     const workflowId=`auth-${actor}-${operation.toLowerCase()}`;
     await mutate('workflows:registerProduction',workflowArgs(workflowId));
     try {await assert.rejects(client.mutation(`workflows:${operation}`,{workflowId,...(operation==='setActive'?{active:false}:{})}),permissionDenied);}
     finally {if(await db.owner.query('workflows:get',{workflowId}))await mutate('workflows:remove',{workflowId});}
   });
 }
 await check('project-workflow-reads-deny-anonymous-and-foreign-tenant',async()=>{
   const workflowId='auth-read-scope',id=await mutate('workflows:registerProduction',workflowArgs(workflowId));
   try {
     for(const client of [db.anonymous,db.other]){
       assert.equal(await client.query('workflows:get',{workflowId}),null);
       assert.equal(await client.query('workflows:getById',{id}),null);
       assert.ok(!(await client.query('workflows:list',{})).some(row=>row._id===id));
     }
     await mutate('workflows:setActive',{workflowId,active:false});
     assert.equal((await db.owner.query('workflows:get',{workflowId})).active,false);
     await mutate('workflows:setActive',{workflowId,active:true});
   }finally{await mutate('workflows:remove',{workflowId});}
 });
 await check('legacy-workflow-management-requires-project-registration',async()=>{
   const workflowId='legacy-auth-control';await mutate('workflows:upsert',{workflowId,name:'Legacy fixture',description:'Read compatibility only',agents:[],steps:[]});
   for(const operation of ['setActive','remove'])await assert.rejects(mutate(`workflows:${operation}`,{workflowId,...(operation==='setActive'?{active:false}:{})}),/Legacy global workflows/);
 });
 await check('owner-can-set-execution-environment-through-canonical-draft-edit',async()=>{
   await mutate('missions:updateDraft',{missionId:visible.missionId,projectId:s.projectId,idempotencyKey:'canonical-environment',title:'Synthetic capacity Mission',objective:'Exercise global controls',stopCondition:'Stop after assertions',budgetUsd:0.1,executionEnvironment:'LOCAL'});
   assert.equal((await db.owner.query('nativeFixture:inspectRecord',{id:visible.missionId})).executionEnvironment,'LOCAL');
 });
 await fault(s.teamId,{capacityPolicy:{maxConcurrentRuns:1,maxActiveMissionsPerMember:10,reviewReservePct:0}});
 for(const row of [visible,hidden]) await fault(row.workOrderId,{ownerMemberId:s.memberId,owningTeamId:s.teamId,scopeEnforcementVersion:1});
 await check('executor-binding-counts-private-team-runs',async()=>{
   const binding=await mutate('softwareFactoryControlPlane:bindExecutor',{workflowRunId:visible.workflowRunId,hostId:'capacity-fixture',executionEnvironment:'LOCAL',checkpointSummary:'Capacity check',budgetUsd:0.1,stopCondition:'No execution',escalationOwner:'Qualification owner'});
   assert.equal(binding.success,false);assert.ok(binding.reasonCodes.includes('TEAM_CONCURRENCY_LIMIT_REACHED'),JSON.stringify(binding));
 });
 await check('workflow-deletion-denied-with-private-active-run',async()=>{
   const workflow=await db.owner.query('nativeFixture:inspectRecord',{id:hidden.workflowId});
   await assert.rejects(mutate('workflows:remove',{workflowId:workflow.workflowId}),/Cannot delete workflow with.*active runs/);
   await fault(hidden.workflowRunId,{status:'PAUSED'});
   await assert.rejects(mutate('workflows:remove',{workflowId:workflow.workflowId}),/Cannot delete workflow with.*active runs/);
   await fault(hidden.workflowRunId,{workflowId:'historical-request-alias',workflowSnapshot:{...workflow,workflowId:workflow.workflowId}});
   await assert.rejects(mutate('workflows:remove',{workflowId:workflow.workflowId}),/Cannot delete workflow with.*active runs/);
   await fault(hidden.workflowRunId,{status:'RUNNING'});
   assert.equal(await db.owner.query('workflowRuns:get',{runId:'hidden-budget-run'}),null);
 });
 await check('workspace-kill-cancels-private-unleased-runs',async()=>{
   await mutate('operatorControls:setMode',{projectId:s.projectId,mode:'KILLED',userId:String(s.operatorId),reason:'Synthetic global stop regression'});
   const stopped=await db.owner.query('nativeFixture:inspectRecord',{id:hidden.workflowRunId});
   assert.equal(stopped.status,'CANCELED');assert.equal(stopped.reservedCostUsd,0);
 });
 receipt.failures=failures;assert.deepEqual(failures,[]);
 receipt.status='PASS';console.log(JSON.stringify(receipt));
} catch(error){receipt.status='FAIL';receipt.error=String(error);throw error;}
finally {await db.destroy();receipt.cleanup='VERIFIED';await writeFile(join(output,'qualification.json'),JSON.stringify(receipt,null,2)+'\n');}
