import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {startFixtureDatabase} from '../enterprise-compatibility/database.mjs';
const output=resolve(process.argv[2]);await mkdir(output,{recursive:true});
const receipt={recordedAt:new Date().toISOString(),runId:randomUUID(),source:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),sourceDirty:!!execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim(),checks:[],failures:[],status:'IN_PROGRESS',scope:'DISPOSABLE_LEGACY_WORKFLOW_BOUNDARY'};
const db=await startFixtureDatabase(process.cwd(),{nativeExecution:true});
try{
 const s=db.seed,mutate=(name,args)=>db.owner.mutation(name,args),query=(name,args)=>db.owner.query(name,args);
 const check=async(name,fn)=>{try{await fn();receipt.checks.push(name);}catch(error){receipt.failures.push({name,error:String(error)});}};
 const denied=/Authenticated operator|unavailable or unauthorized|role does not permit|authorized workspace|MISSION_UNAVAILABLE|Workflow run not found/i;
 const privateFunction=/Could not find public function|not.*public|not found/i;
 const workflowId='legacy-entry-'+randomUUID();
 const args={projectId:s.projectId,workflowId,name:'Synthetic v1 boundary',description:'No execution; permission regression only',topology:'LINEAR',agents:[{id:'worker',persona:'Synthetic gate only'}],steps:[{id:'gate',kind:'GATE',agent:'',input:'Wait',expects:'Owner decision',retryLimit:0,timeoutMinutes:1}],active:true};
 await mutate('workflows:registerProduction',args);
 await mutate('nativeFixture:fault',{id:s.projectId,patch:{},unset:['enterpriseAccountingMode']});
 const start=()=>mutate('workflowRuns:start',{workflowId,projectId:s.projectId,initialInput:'Synthetic private initial input'});
 for(const [name,client] of [['anonymous',db.anonymous],['foreign-tenant',db.other]])for(const scoped of [true,false])
  await check(`${name}-start-${scoped?'scoped':'unbound'}-denied`,()=>assert.rejects(client.mutation('workflowRuns:start',{workflowId,...(scoped?{projectId:s.projectId}:{}),initialInput:'Must be denied'}),denied));
 const owned=await start(),runId=owned.runId,record=await query('workflowRuns:get',{runId});assert.ok(record);
 assert.ok((await query('workflowRuns:listEvents',{workflowRunId:record._id})).length>0);
 for(const [name,client] of [['anonymous',db.anonymous],['foreign-tenant',db.other]]){
  await check(`${name}-existing-legacy-run-reads-denied`,async()=>{
   assert.equal(await client.query('workflowRuns:get',{runId}),null);
   assert.equal(await client.query('workflowRuns:getById',{id:record._id}),null);
   assert.equal(await client.query('workflowRuns:getInspector',{workflowRunId:record._id}),null);
   for(const filters of [{},{projectId:s.projectId},{workflowId}])assert.ok(!(await client.query('workflowRuns:list',filters)).some(r=>r._id===record._id));
   assert.ok(!(await client.query('workflowRuns:search',{query:runId})).some(r=>r._id===record._id));
   assert.deepEqual(await client.query('workflowRuns:listEvents',{workflowRunId:record._id}),[]);
   assert.deepEqual(await client.query('workflowRuns:listArtifacts',{workflowRunId:record._id}),[]);
  });
  for(const [operation,extra] of [['updateContext',{context:{foreign:true}}],['updateStatus',{status:'FAILED'}],['updateStep',{stepIndex:0,status:'DONE'}],['incrementRetry',{stepIndex:0}],['advance',{}],['claimExecution',{leaseId:'foreign',ownerId:'foreign',dispatchMode:'MANUAL',estimatedCostUsd:0}]])
   await check(`${name}-${operation}-denied`,async()=>{const own=await start();const before=await query("workflowRuns:get",{runId:own.runId});await assert.rejects(client.mutation(`workflowRuns:${operation}`,{runId:own.runId,...extra}),denied);assert.deepEqual(await query("workflowRuns:get",{runId:own.runId}),before);});
 }
 await check('deployment-admin-only-legacy-upsert',async()=>{
  const legacy={workflowId:'synthetic-global-boundary',name:'Legacy',description:'Deployment administration fixture',agents:[],steps:[],active:false};
  await assert.rejects(db.anonymous.mutation('workflows:upsert',legacy),privateFunction);
  await mutate('workflows:upsert',legacy);
  assert.ok(await query('workflows:get',{workflowId:legacy.workflowId}));
  db.runLegacyWorkflowSeeder();
  assert.ok((await query('workflows:get',{workflowId:'feature-dev'})).active);
 });
 await check('deployment-admin-retires-legacy-and-owner-can-register-identity',async()=>{
  const id='synthetic-global-boundary';await assert.rejects(db.anonymous.mutation('workflows:retireLegacy',{workflowId:id}),privateFunction);
  const active=await start(),activeRun=await query('workflowRuns:get',{runId:active.runId});
  for(const status of ['PENDING','RUNNING','PAUSED']){
   await mutate('nativeFixture:fault',{id:activeRun._id,patch:{status,workflowId:'historical-legacy-alias',workflowSnapshot:{workflowId:id}}});
   await assert.rejects(mutate('workflows:retireLegacy',{workflowId:id}),/Cannot retire legacy workflow with active runs/);
  }
  await mutate('nativeFixture:fault',{id:activeRun._id,patch:{status:'CANCELED'}});
  await mutate('workflows:retireLegacy',{workflowId:id});assert.equal(await query('workflows:get',{workflowId:id}),null);
  await mutate('workflows:registerProduction',{...args,workflowId:id});assert.equal((await query('workflows:get',{workflowId:id})).projectId,s.projectId);
  await assert.rejects(mutate('workflows:retireLegacy',{workflowId:id}),/Workspace-owned workflows/);
 });
 await check('authorized-workspace-owner-retains-legacy-run-control',async()=>{
  const own=await start();await mutate('workflowRuns:updateContext',{runId:own.runId,context:{owner:true}});
  assert.equal((await query('workflowRuns:get',{runId:own.runId})).context.owner,true);
  const canonical=await mutate('isolationFixture:seed',{scope:s});
  await assert.rejects(mutate('workflowRuns:start',{workflowId,projectId:s.projectId,parentTaskId:canonical.taskId,initialInput:'Must use canonical WorkOrder'}),/canonical WorkOrder/);
 });
 assert.deepEqual(receipt.failures,[]);receipt.status='PASS';
}catch(error){receipt.status='FAIL';receipt.error=String(error);throw error;}
finally{await db.destroy();receipt.cleanup='VERIFIED';await writeFile(join(output,'qualification.json'),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify({status:receipt.status,checks:receipt.checks.length,failures:receipt.failures.length}));}
