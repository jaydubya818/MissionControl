import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {startFixtureDatabase} from '../enterprise-compatibility/database.mjs';
const output=resolve(process.argv[2]);await mkdir(output,{recursive:true});
const receipt={recordedAt:new Date().toISOString(),source:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),sourceDirty:!!execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim(),scope:'DISPOSABLE_LEGACY_WORKSPACE_BOUNDARY',checks:[],failures:[],status:'IN_PROGRESS'};
const db=await startFixtureDatabase(process.cwd(),{nativeExecution:true});
const check=async(name,fn)=>{try{await fn();receipt.checks.push(name);}catch(e){receipt.failures.push({name,error:String(e)});}};
try{
 const s=db.seed,owner=db.owner,privateFunction=/Could not find public function|not.*public|not found/i,denied=/Authenticated|unavailable|unauthorized|role does not permit|permission|required/i;
 const id='legacy-workspace-'+randomUUID();
 await owner.mutation('workflows:registerProduction',{projectId:s.projectId,workflowId:id,name:'Private v1',description:'Authorization fixture',topology:'LINEAR',agents:[{id:'worker',persona:'Private'}],steps:[{id:'gate',kind:'GATE',agent:'',input:'Wait',expects:'Owner',retryLimit:0,timeoutMinutes:1}],active:true});
 await owner.mutation('nativeFixture:fault',{id:s.projectId,patch:{},unset:['enterpriseAccountingMode']});
 const input='Private initial input '+randomUUID(),run=await owner.mutation('workflowRuns:start',{projectId:s.projectId,workflowId:id,initialInput:input});
 const created=await owner.mutation('tasks:create',{projectId:s.projectId,title:'Private legacy Task '+randomUUID(),description:input,type:'OPS'});const task=created.task;
 assert.ok(task?._id,'Owner fixture Task exists');
 for(const [name,client] of [['anonymous',db.anonymous],['foreign-tenant',db.other]]){
  await check(name+'-activity-privacy',async()=>{for(const [fn,args] of [['activities:list',{}],['activities:listRecent',{}],['activities:listByAction',{action:'WORKFLOW_STARTED'}]])assert.ok(!JSON.stringify(await client.query(fn,args)).includes(run.runId));});
  await check(name+'-task-privacy',async()=>{assert.equal(await client.query('tasks:get',{taskId:task._id}),null);assert.ok(!(await client.query('tasks:listAll',{})).some(t=>t._id===task._id));});
  await check(name+'-task-human-spoof-denied',()=>assert.rejects(client.mutation('tasks:transition',{taskId:task._id,toStatus:'READY',actorType:'HUMAN',actorUserId:'forged-owner',idempotencyKey:randomUUID()}),denied));
  await check(name+'-task-write-denied',()=>assert.rejects(client.mutation('tasks:update',{taskId:task._id,title:'Unauthorized modification'}),denied));
 }
 await check('owner-activity-input-redacted',async()=>{const rows=await owner.query('activities:listByAction',{action:'WORKFLOW_STARTED'});assert.ok(rows.some(r=>r.metadata?.runId===run.runId));assert.ok(!JSON.stringify(rows).includes(input));});
 await check('owner-retains-task-control',async()=>{await owner.mutation('tasks:update',{taskId:task._id,title:'Authorized edit'});assert.equal((await owner.query('tasks:get',{taskId:task._id})).title,'Authorized edit');});
 await check('task-human-identity-is-derived',async()=>{
  const result=await owner.mutation('tasks:transition',{taskId:task._id,toStatus:'CANCELED',actorType:'HUMAN',actorUserId:'forged-owner',idempotencyKey:randomUUID()});
  assert.equal(result.success,true);assert.equal(result.transition.actorUserId,db.ownerSubject);
 });
 for(const [name,client] of [['anonymous',db.anonymous],['foreign-tenant',db.other]]){
  await check(name+'-legacy-metrics-private',async()=>{assert.equal((await client.query('workflowMetrics:getSummary',{projectId:s.projectId})).total,0);});
  await check(name+'-metrics-refresh-denied',()=>assert.rejects(client.mutation('workflowMetrics:refreshAll',{projectId:s.projectId}),denied));
 }


 await owner.mutation('isolationFixture:legacyDeliveryRole',{operatorId:s.peerId,projectId:s.projectId,tenantId:s.tenantId});
 const runRecord=await owner.query('workflowRuns:get',{runId:run.runId});
 await check('delivery-role-cannot-control-automation-through-events',async()=>{
  await assert.rejects(db.peer.mutation('workflowRuns:recordEvent',{workflowRunId:runRecord._id,eventType:'RUN_PAUSED',idempotencyKey:randomUUID()}),denied);
  assert.deepEqual(await owner.query('workflowRuns:get',{runId:run.runId}),runRecord);
 });
 await check('delivery-role-cannot-control-automation-through-Task',async()=>{
  const extra=await owner.mutation('tasks:create',{projectId:s.projectId,title:'Legacy automation step',type:'OPS',metadata:{workflowRunId:runRecord._id}});
  await assert.rejects(db.peer.mutation('tasks:transition',{taskId:extra.task._id,toStatus:'CANCELED',actorType:'HUMAN',idempotencyKey:randomUUID()}),denied);
  assert.equal((await owner.query('tasks:get',{taskId:extra.task._id})).status,'INBOX');
 });

 await check('permission-cache-revocation-within-one-handler',async()=>{
  const result=await db.peer.mutation('isolationFixture:legacyPermissionRevocation',{taskId:task._id});
  assert.deepEqual(result,{visibleBefore:true,visibleAfter:false});
 });
 for(const [fn,args] of [['workOrders:seedDemo',{}],['e2e:seed',{runId:'unauthorized-seed'}],['e2e:cleanup',{runId:'unauthorized-cleanup'}],['seedMissionControlDemo:run',{}],['seed:seedV0',{}],['seed:clearAll',{}],['projects:createSoftwareFactoryProject',{}]])
  await check('administrator-only-'+fn,()=>assert.rejects(db.anonymous.mutation(fn,args),privateFunction));
 assert.deepEqual(receipt.failures,[]);receipt.status='PASS';
}catch(e){receipt.status='FAIL';receipt.error=String(e);throw e;}
finally{await db.destroy();receipt.cleanup='VERIFIED';await writeFile(join(output,'qualification.json'),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify({status:receipt.status,checks:receipt.checks.length,failures:receipt.failures.length}));}
