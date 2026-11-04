import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { startFixtureDatabase } from '../enterprise-compatibility/database.mjs';
const output=resolve(process.argv[2]);await mkdir(output,{recursive:true});
const receipt={source:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),sourceDirty:!!execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim(),checks:[],status:'IN_PROGRESS',scope:'DISPOSABLE_TWO_MISSION_BACKEND'};
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
 receipt.status='PASS';console.log(JSON.stringify(receipt));
} catch(error){receipt.status='FAIL';receipt.error=String(error);throw error;}
finally {await db.destroy();receipt.cleanup='VERIFIED';await writeFile(join(output,'qualification.json'),JSON.stringify(receipt,null,2)+'\n');}
