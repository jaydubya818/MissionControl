import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {startFixtureDatabase} from '../enterprise-compatibility/database.mjs';
const output=resolve(process.argv[2]);await mkdir(output,{recursive:true});
const report={recordedAt:new Date().toISOString(),source:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),sourceDirty:!!execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim(),scope:'DISPOSABLE_POLICY_PRINCIPAL_COMPATIBILITY',checks:[],failures:[],status:'IN_PROGRESS'};
const db=await startFixtureDatabase(process.cwd(),{nativeExecution:true});
const check=async(name,fn)=>{try{await fn();report.checks.push(name);}catch(error){report.failures.push({name,error:String(error)});}};
const denied=/authenticated|unavailable|unauthorized|not permit|required|requires approval|permission|allowlist|returned DENY/i;
try{
 const s=db.seed,o=db.owner,peer=db.peer;
 const fault=(id,patch,unset=[])=>o.mutation('nativeFixture:fault',{id,patch,unset});
 const fixture=await o.mutation('isolationFixture:approvalBoundarySeed',{scope:s});
 const local=await o.mutation('isolationFixture:seed',{scope:s});
 const {roleId,assignmentId}=await o.mutation('isolationFixture:legacyDeliveryRole',{operatorId:s.peerId,projectId:s.projectId,tenantId:s.tenantId,detachWorkspaceMemberships:true});const role={_id:roleId};
 await fault(role._id,{permissions:['factory.read','factory.automation.manage','delivery.write','delivery.assign','delivery.dispatch','delivery.approve','factory.approve']});
 await fault(local.missionId,{ownerOperatorId:s.peerId});
 const policy=await o.mutation('governance/policyEnvelopes:createPolicyEnvelope',{projectId:s.projectId,tenantId:s.tenantId,name:'Principal compatibility',rules:{defaultDecision:'ALLOW'}});
 await fault(local.workflowRunId,{policyEnvelopeId:policy._id});
 const rawRun=await o.mutation('isolationFixture:rawRead',{id:local.workflowRunId});
 await check('non-admin-Mission-owner-reads-policy-bound-run',async()=>assert.equal((await peer.query('workflowRuns:get',{runId:rawRun.runId}))?._id,local.workflowRunId));
 await check('non-admin-Mission-owner-updates-policy-bound-run',async()=>{await peer.mutation('workflowRuns:updateContext',{runId:rawRun.runId,context:{policyPrincipal:true}});assert.equal((await peer.query('workflowRuns:get',{runId:rawRun.runId})).context.policyPrincipal,true);});
 await check('automation-role-policy-ID-argument-is-read-only',async()=>assert.equal((await peer.mutation('isolationFixture:policyReferenceProbe',{policyEnvelopeId:policy._id}))._id,policy._id));
 await check('non-admin-cannot-change-bound-policy',()=>assert.rejects(peer.mutation('governance/policyEnvelopes:attachPolicy',{envelopeId:policy._id,active:false}),denied));
 await fault(assignmentId,{scope:{type:'project',id:fixture.restrictedProjectId}});
 await check('Mission-grant-without-workspace-role-retains-run-read',async()=>assert.equal((await peer.query('isolationFixture:read',{id:local.workflowRunId}))._id,local.workflowRunId));
 await check('Mission-grant-does-not-expose-policy-resource',async()=>{report.detachedWorkspace=await peer.mutation('isolationFixture:policyWorkspaceProbe',{});assert.equal(await peer.query('isolationFixture:read',{id:policy._id}),null);});
 await check('foreign-Mission-run-remains-hidden',async()=>assert.equal(await db.other.query('isolationFixture:read',{id:local.workflowRunId}),null));
 await fault(assignmentId,{scope:{type:'project',id:s.projectId}});await fault(role._id,{permissions:['factory.read','factory.automation.manage','delivery.write']});
 await fault(fixture.agentId,{budgetDaily:100,budgetPerRun:10,spendToday:0,status:'ACTIVE'});
 await fault(policy._id,{active:false});
 const start=(client,tool=true,key=randomUUID())=>client.mutation('runs:start',{agentId:fixture.agentId,sessionKey:'synthetic-policy-compatibility',model:'synthetic-no-inference',idempotencyKey:key,...(tool===true?{toolName:'shell',toolArgs:{command:'rm synthetic-no-execution'}}:tool||{})});
 await start(o,false); // Materialize the legacy instance before testing callers.
 for(const decision of ['DENY','NEEDS_APPROVAL','LEGACY_ALLOWLIST']){
  await fault(policy._id,{active:decision!=='LEGACY_ALLOWLIST',rules:{defaultDecision:decision==='LEGACY_ALLOWLIST'?'ALLOW':decision}});
  await fault(fixture.policyId,{active:true,shellAllowlist:['echo']});
  for(const[name,client]of[['anonymous',db.anonymous],['non-member',db.client('fixture-unregistered')],['authorized-automation',peer]])
   await check('run-start-'+name+'-'+decision+'-denied',()=>assert.rejects(start(client),client===peer?(decision==='DENY'?/returned DENY/:decision==='NEEDS_APPROVAL'?/requires approval/:/Command not in allowlist/):denied));
 }
 await fault(fixture.policyId,{shellAllowlist:[]});await fault(policy._id,{active:false});
 await o.mutation('governance/policyEnvelopes:createPolicyEnvelope',{projectId:fixture.restrictedProjectId,name:'Foreign DENY',rules:{defaultDecision:'DENY'}});
 await check('foreign-workspace-policy-does-not-block-authorized-run',async()=>assert.equal((await start(peer,false)).created,true));
 await check('cached-run-receipt-does-not-bypass-authentication',async()=>{const key=randomUUID();await start(peer,false,key);await assert.rejects(start(db.anonymous,false,key),denied);});
 await check('identical-run-start-retry-is-idempotent',async()=>{const key=randomUUID(),first=await start(peer,false,key),next=await start(peer,false,key);assert.equal(next.created,false);assert.equal(next.run._id,first.run._id);});
 await check('run-replay-cannot-add-a-tool-to-a-no-tool-start',async()=>{const key=randomUUID();await start(peer,false,key);await assert.rejects(start(peer,true,key),/receipt|request|match|policy|allowlist/i);});
 await check('run-replay-cannot-change-tool-arguments',async()=>{const key=randomUUID();await start(peer,{toolName:'read_file',toolArgs:{path:'docs/allowed.md'}},key);await assert.rejects(start(peer,{toolName:'read_file',toolArgs:{path:'docs/different.md'}},key),/receipt|request|match/i);});
 await check('historical-unbound-run-receipt-requires-explicit-migration',async()=>{const key=randomUUID(),first=await start(peer,false,key);await fault(first.run._id,{},['requestDigest']);await assert.rejects(start(peer,false,key),/historical|migration|receipt/i);});
 await check('historical-encoding-run-receipt-requires-explicit-migration',async()=>{const key=randomUUID(),first=await start(peer,false,key);assert.match(first.run.requestDigest,/^convex-json\/v1:sha256:[a-f0-9]{64}$/);await fault(first.run._id,{requestDigest:first.run.requestDigest.replace('convex-json/v1:','')});await assert.rejects(start(peer,false,key),/older-encoding.*migration/i);});
 for(const [name,before,after]of [['bytes',new Uint8Array([1]).buffer,new Uint8Array([2]).buffer],['NaN-null',NaN,null],['infinity-sign',Infinity,-Infinity],['negative-zero',-0,0],['bigint-change',42n,43n]])await check('Convex-'+name+'-run-replay-cannot-change-payload',async()=>{const key=randomUUID(),tool=value=>({toolName:'read_file',toolArgs:{path:'docs/allowed.md',value}});await start(peer,tool(before),key);await assert.rejects(start(peer,tool(after),key),/receipt|request|match/i);});
 await check('Convex-bigint-identical-retry-is-idempotent',async()=>{const key=randomUUID(),tool={toolName:'read_file',toolArgs:{path:'docs/allowed.md',value:42n}},first=await start(peer,tool,key),next=await start(peer,tool,key);assert.equal(next.created,false);assert.equal(next.run._id,first.run._id);});
 const request=key=>peer.mutation('approvals:request',{projectId:s.projectId,taskId:fixture.taskId,requestorAgentId:fixture.agentId,actionType:'TASK_COMPLETION',actionSummary:'Synthetic retry',riskLevel:'YELLOW',justification:'No productive Work',idempotencyKey:key});
 for(const status of ['EXPIRED','APPROVED','WRONG_ACTION','DENIED','CANCELED'])await check('non-qualifying-'+status+'-approval-can-be-requested-again',async()=>{const key=randomUUID(),first=await request(key);await fault(first.approval._id,{status:status==='WRONG_ACTION'?'APPROVED':status,...(status==='WRONG_ACTION'?{actionType:'WORKFLOW_STEP_RETRY'}:{}),expiresAt:status==='EXPIRED'?Date.now()-1000:Date.now()+60000});const next=await request(key);assert.equal(next.created,true);assert.notEqual(next.approval._id,first.approval._id);assert.equal((await request(key)).created,false);});
 await check('live-escalated-approval-retry-is-idempotent',async()=>{const key=randomUUID(),first=await request(key);await fault(first.approval._id,{status:'ESCALATED'});const next=await request(key);assert.equal(next.created,false);assert.equal(next.approval._id,first.approval._id);});
 const {run}=await start(o,false);await fault(run.instanceId,{},['legacyAgentId']);
 for(const decision of ['NEEDS_APPROVAL','DENY','ALLOW'])await check('instance-only-policy-'+decision+'-keeps-authorized-workspace',async()=>{await fault(policy._id,{active:true,rules:{defaultDecision:decision}});const result=await peer.mutation('policy:evaluateWithARM',{instanceId:run.instanceId,actionType:'TOOL_CALL',toolName:'read_file',toolArgs:{path:'docs/synthetic.md'}});assert.equal(result.decision,decision);});
 assert.deepEqual(report.failures,[]);report.status='PASS';
}catch(error){report.status='FAIL';report.error=String(error);throw error;}
finally{await db.destroy();report.cleanup='VERIFIED';await writeFile(join(output,'qualification.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,checks:report.checks.length,failures:report.failures.length}));}
