import assert from 'node:assert/strict';
import { makeFunctionReference } from 'convex/server';
import { writeFile } from 'node:fs/promises';
import { startFixtureDatabase } from '../enterprise-compatibility/database.mjs';
const db = await startFixtureDatabase(process.cwd(), {nativeExecution:true});
const checks=[];
const check=async (name,fn)=>{await fn();checks.push(name);console.log('PASS',name);};
try {
 const s=db.seed, f=await db.owner.mutation('isolationFixture:seed',{scope:s});
 await check('creator reads Mission',async()=>assert.equal((await db.owner.query('missions:get',{missionId:f.missionId})).mission._id,f.missionId));
 for(const [label,client] of [['same-tenant Owner',db.peer],['cross-tenant Owner',db.other],['anonymous',db.anonymous]]) {
  await check(label+' denied across lineage',async()=>{
   for(const id of [f.missionId,f.workOrderId,f.taskId,f.workflowRunId,f.artifactId,f.eventId,f.auditId]) assert.equal(await client.query('isolationFixture:read',{id}),null);
   assert.equal(await client.query('missions:get',{missionId:f.missionId}),null);
   assert.equal(await client.query('tasks:get',{taskId:f.taskId}),null);
   assert.deepEqual(await client.query('workflowRuns:listEvents',{workflowRunId:f.workflowRunId}),[]);
   assert.deepEqual(await client.query('workflowRuns:listArtifacts',{workflowRunId:f.workflowRunId}),[]);
  });
 }
 await check('company administrator role alone grants no Mission visibility',async()=>{
  assert.equal(await db.peer.query('missions:get',{missionId:f.missionId}),null);
 });
 await check('task relation alternate routes denied',async()=>{
  assert.deepEqual(await db.anonymous.query('taskRelations:listForTask',{taskId:f.taskId}),{outgoing:[],incoming:[]});
  assert.deepEqual(await db.peer.query('taskRelations:listByProject',{projectId:s.projectId}),[]);
  await assert.rejects(()=>db.anonymous.mutation('taskRelations:remove',{relationId:f.relationId}));
 });
 await check('shared agent identity projects only authorized Run costs and Task pointers',async()=>{
  const own=await db.owner.query('agents:get',{agentId:f.agentId});
  assert.equal(own.currentTaskId,f.taskId);assert.equal(own.authorizedRunSpendToday,7);assert.equal(own.spendToday,7);
  for(const client of [db.peer,db.other,db.anonymous]) {
   const shared=await client.query('agents:get',{agentId:f.agentId});
   assert.equal(shared._id,f.agentId);assert.equal(shared.spendToday,0);assert.equal(shared.authorizedRunSpendToday,0);
   assert.equal(shared.spendScope,'AUTHORIZED_RUNS_UTC_DAY');assert.equal(shared.currentTaskId,undefined);assert.equal(shared.lastError,undefined);assert.equal(shared.errorStreak,undefined);
  }
  await assert.rejects(()=>db.owner.mutation('runs:start',{agentId:f.agentId,taskId:f.taskId,sessionKey:'isolation-budget',model:'qualification',idempotencyKey:'isolation-budget'}),/budget/i);
  assert.equal((await db.owner.mutation('isolationFixture:rawRead',{id:f.agentId})).spendToday,19);
  const recorded=await db.owner.mutation('agents:recordSpend',{agentId:f.agentId,amount:1,runId:f.runId});
  assert.equal(recorded.budgetExceeded,true);assert.equal(recorded.spendToday,undefined);assert.equal(recorded.budgetRemaining,undefined);
  assert.equal((await db.owner.mutation('isolationFixture:rawRead',{id:f.agentId})).spendToday,20);
 });
 await check('opaque QC parents and typed children retain Mission lineage',async()=>{
  for(const id of [f.qcRunId,f.qcArtifactId,f.costAlertId]) {
   assert.ok(await db.owner.query('isolationFixture:read',{id}));
   assert.equal(await db.peer.query('isolationFixture:read',{id}),null);
  }
  for(const id of [f.legacyCostAlertId,f.legacyMonitoringAlertId,f.legacyPerformanceAlertId]) assert.equal(await db.owner.query('isolationFixture:read',{id}),null);
  const legacyBudget=await db.peer.query('isolationFixture:read',{id:f.legacyBudgetAlertId});
  assert.equal(legacyBudget.description,'Agent daily budget limit reached');
  assert.equal(JSON.stringify(legacyBudget).includes('$19'),false);
 });
 await check('standup, monitoring and pattern audit copies preserve source authorization',async()=>{
  await db.owner.mutation('standup:save',{report:{projectId:s.projectId},savedAt:Date.now()});
  await db.owner.mutation('monitoring:logError',{projectId:s.projectId,source:'qualification',errorType:'CRITICAL',message:'Private monitoring error',runId:f.runId});
  await db.owner.mutation('monitoring:logPerformance',{projectId:s.projectId,operation:'Private monitoring slow',durationMs:11000,success:false,metadata:{runId:f.runId}});
  await db.owner.mutation('agentLearning:createPattern',{projectId:s.projectId,agentId:f.agentId,pattern:'Private pattern',confidence:0.9,evidence:[f.taskId]});
  const ownActivities=await db.owner.query('activities:list',{projectId:s.projectId});
  const ownAlerts=await db.owner.query('alerts:listOpen',{projectId:s.projectId});
  assert.ok(JSON.stringify(ownAlerts).includes('Private monitoring error'));
  assert.ok(JSON.stringify(ownAlerts).includes('Private monitoring slow'));
  assert.ok(JSON.stringify(ownActivities).includes('Private pattern'));
  assert.ok(ownActivities.some(row=>row.action==='STANDUP_REPORT'));
  for(const client of [db.peer,db.anonymous]) {
   const activities=await client.query('activities:list',{projectId:s.projectId});
   const alerts=await client.query('alerts:listOpen',{projectId:s.projectId});
   assert.equal(activities.some(row=>row.action==='STANDUP_REPORT'),false);
   assert.equal(JSON.stringify(activities).includes('Private pattern'),false);
   assert.equal(JSON.stringify(alerts).includes('Private monitoring'),false);
  }
 });
 const peerFixture=await db.owner.mutation('isolationFixture:seed',{scope:{...s,operatorId:s.peerId},sourceMissionId:f.missionId});
 await check('failure projections do not aggregate different owners',async()=>{
  await db.owner.mutation('isolationFixture:fault',{id:f.workflowRunId,patch:{status:'FAILED'}});
  await db.owner.mutation('isolationFixture:fault',{id:peerFixture.workflowRunId,patch:{status:'FAILED',workflowId:f.workflowId}});
  const a=await db.owner.mutation('factory/metaLoop:ingestWorkflowFailure',{workflowRunId:f.workflowRunId});
  const b=await db.peer.mutation('factory/metaLoop:ingestWorkflowFailure',{workflowRunId:peerFixture.workflowRunId});
  assert.notEqual(a.suggestionId,b.suggestionId);
  assert.equal((await db.owner.query('isolationFixture:read',{id:a.suggestionId})).evidenceCount,1);
  assert.equal(await db.owner.query('isolationFixture:read',{id:b.suggestionId}),null);
  assert.equal(await db.peer.query('isolationFixture:read',{id:a.suggestionId}),null);
 });
 await check('repository transport audit omits private Mission text and rejects unsigned replay',async()=>{
  const rows=await db.peer.query('githubAppConnections:listDeliveries',{repositoryId:f.repositoryId});
  assert.ok(rows.some(row=>row._id===f.webhookId));
  assert.equal(JSON.stringify(rows).includes('Private Mission'),false);
  const before=await db.owner.query('isolationFixture:read',{id:f.webhookId});
  const rejected=await db.owner.mutation('githubAppConnections:beginWebhookDelivery',{deliveryId:before.deliveryId,event:'pull_request_review',signatureStatus:'INVALID'});
  assert.equal(rejected.accepted,false);
  assert.deepEqual(await db.owner.query('isolationFixture:read',{id:f.webhookId}),before);
 });
 await check('generic approvals cannot mint service grants',async()=>{
  await assert.rejects(()=>db.owner.mutation('workOrders:requestApprovalDecision',{workOrderId:f.workOrderId,workflowRunId:f.workflowRunId,approvalType:'SERVICE_ATTEMPT_ACCESS',requestedAction:'bypass'}),/USE_SCOPED_SERVICE_GRANT_API/);
 });
 await check('opaque and logical graph edges respect hidden endpoints',async()=>{
  for(const id of [f.privateEntity,f.privateEdge,f.privateNode,f.logicalEdge]) {
   assert.ok(await db.owner.query('isolationFixture:read',{id}));
   assert.equal(await db.peer.query('isolationFixture:read',{id}),null);
  }
  assert.ok(await db.peer.query('isolationFixture:read',{id:f.sharedEntity}));
 });
 await check('webhook review summaries resolve canonical Mission or stay unpublished',async()=>{
  const args={projectId:s.projectId,kind:'SKILL_UPDATE',signalClass:'REVIEW_CORRECTION',target:'qualification/private',title:'Private review',summary:'Private Mission review evidence',sourceRef:'review-1',sourceLinks:[f.prUrl],confidence:0.75,impact:'MEDIUM',payload:{prUrl:f.prUrl}};
  const result=await db.owner.mutation('factory/metaLoop:ingestSignal',args);
  assert.ok(result.suggestionId);
  assert.equal(await db.peer.query('isolationFixture:read',{id:result.suggestionId}),null);
  assert.equal(JSON.stringify(await db.peer.query('factory/metaLoop:listInbox',{projectId:s.projectId})).includes('Private Mission review evidence'),false);
  const unresolved=await db.owner.mutation('factory/metaLoop:ingestSignal',{...args,payload:{prUrl:f.prUrl+'-unknown'}});
  assert.equal(unresolved.reason,'source-scope-unresolved');
 });
 await db.owner.mutation('isolationFixture:fault',{id:f.workflowRunId,patch:{startedAt:Date.now()-1000}});
 await db.owner.mutation('workflowMetrics:updateMetrics',{workflowId:f.workflowId,projectId:s.projectId});
 await db.owner.mutation('agentLearning:recordTaskCompletion',{taskId:f.taskId,success:true,costUsd:1});
 const metricsVisible=async(client,visible)=>{
  assert.equal(Boolean(await client.query('workflowMetrics:getWorkflowMetrics',{workflowId:f.workflowId,projectId:s.projectId})),visible);
  assert.equal((await client.query('agentLearning:getAgentPerformance',{agentId:f.agentId})).totalCompleted,visible?1:0);
 };
 await check('workflow and agent metric caches retain private source lineage',async()=>{
  await metricsVisible(db.owner,true);await metricsVisible(db.peer,false);await metricsVisible(db.anonymous,false);
 });
 await check('list and search isolation'  ,async()=>{
  assert.equal(JSON.stringify(await db.peer.query('missions:list',{projectId:s.projectId})).includes(f.missionId),false);
  assert.equal(JSON.stringify(await db.peer.query('workOrders:list',{projectId:s.projectId})).includes(f.workOrderId),false);
  const search=await db.peer.query('search:searchTasks',{projectId:s.projectId,query:'isolation-secret'});
  assert.equal(JSON.stringify(search).includes(f.taskId),false);
  assert.equal(JSON.stringify(await db.peer.query('activities:list',{projectId:s.projectId})).includes(f.auditId),false);
 });
 await check('unbound owner targets cannot orphan existing or new Missions',async()=>{
  const original=await db.owner.query('isolationFixture:read',{id:f.memberId});
  await db.owner.mutation('isolationFixture:fault',{id:f.memberId,patch:{},unset:['operatorId']});
  const draft={projectId:s.projectId,title:'Invalid owner',objective:'Reject unbound owner',stopCondition:'Stop',ownerMemberId:f.memberId,owningTeamId:s.teamId,repositoryId:f.repositoryId,codeScopeIds:[f.codeScopeId]};
  await assert.rejects(()=>db.owner.mutation('missions:createDraft',draft),/MISSION_MEMBER_OPERATOR_REQUIRED/);
  await assert.rejects(()=>db.owner.mutation('missions:updateDraft',{...draft,missionId:f.missionId,idempotencyKey:'invalid-owner-target'}),/MISSION_MEMBER_OPERATOR_REQUIRED/);
  assert.equal((await db.owner.query('missions:get',{missionId:f.missionId})).mission.ownerOperatorId,s.operatorId);
  await db.owner.mutation('isolationFixture:fault',{id:f.memberId,patch:{operatorId:original.operatorId}});
 });
 const assign=role=>db.owner.mutation('softwareFactoryControlPlane:assignMissionMember',{tenantId:s.tenantId,projectId:s.projectId,missionId:f.missionId,memberId:f.memberId,teamId:s.teamId,role});
 const grant=await assign('STAKEHOLDER');
 await check('explicit stakeholder reads and cannot write',async()=>{
  assert.equal((await db.peer.query('missions:get',{missionId:f.missionId})).mission._id,f.missionId);
  await metricsVisible(db.peer,true);
  await assert.rejects(()=>db.peer.mutation('isolationFixture:contribute',{id:f.missionId,title:'unauthorized'}));
  await assert.rejects(()=>db.peer.mutation('softwareFactoryControlPlane:assignMissionMember',{tenantId:s.tenantId,projectId:s.projectId,missionId:f.missionId,memberId:f.authorMemberId,teamId:s.teamId,role:'OWNER'}));
 });
 await check('frozen package reads only while source grant is active',async()=>{
  assert.ok(await db.peer.query('factoryMemory:getContextPackage',{projectId:s.projectId,contextPackageId:peerFixture.packageId}));
 });
 const subscription=db.subscription('fixture-peer');
 let subscriptionValue, subscriptionError;
 const unsubscribe=subscription.onUpdate(makeFunctionReference('missions:get'),{missionId:f.missionId},value=>{subscriptionValue=value;},error=>{subscriptionError=error;});
 const waitFor=async predicate=>{const deadline=Date.now()+10000;while(!predicate()){if(subscriptionError)throw subscriptionError;if(Date.now()>deadline)throw Error('Reactive query timeout');await new Promise(r=>setTimeout(r,25));}};
 try {
  await waitFor(()=>subscriptionValue?.mission?._id===f.missionId);
  await db.owner.mutation('softwareFactoryControlPlane:revokeMissionMember',{assignmentId:grant.assignmentId});
  await check('reactive event stream retracts revoked Mission',()=>waitFor(()=>subscriptionValue===null));
 } finally {unsubscribe();await subscription.close();}
 await check('frozen package denied after source revocation',async()=>{
  assert.equal(await db.peer.query('factoryMemory:getContextPackage',{projectId:s.projectId,contextPackageId:peerFixture.packageId}),null);
 });
 await check('revoked grant and cached query denied',async()=>{assert.equal(await db.peer.query('missions:get',{missionId:f.missionId}),null);await metricsVisible(db.peer,false);});
 const reviewer=await assign('REVIEWER');
 await check('reviewer records evidence without ownership',async()=>{
  const result=await db.peer.mutation('workOrders:recordVerificationReceipt',{workOrderId:f.workOrderId,workflowRunId:f.workflowRunId,acceptanceCriterionId:'isolation',status:'PENDING'});
  assert.ok(result.verificationReceipt);
  await assert.rejects(()=>db.peer.mutation('isolationFixture:contribute',{id:f.missionId,title:'reviewer cannot edit'}));
 });
 await check('wrong Attempt and candidate denied',async()=>{
  await assert.rejects(()=>db.peer.mutation('workOrders:recordVerificationReceipt',{workOrderId:f.workOrderId,workflowRunId:peerFixture.workflowRunId,acceptanceCriterionId:'isolation',status:'PENDING'}));
  await assert.rejects(()=>db.peer.mutation('workOrders:recordVerificationReceipt',{workOrderId:f.workOrderId,workflowRunId:f.workflowRunId,acceptanceCriterionId:'isolation',status:'PENDING',runArtifactIds:[peerFixture.artifactId]}));
 });
 await db.owner.mutation('softwareFactoryControlPlane:revokeMissionMember',{assignmentId:reviewer.assignmentId});
 const contributor=await assign('CONTRIBUTOR');
 await check('contributor can contribute',()=>db.peer.mutation('isolationFixture:contribute',{id:f.missionId,title:'authorized contribution'}));
 await check('concurrent revocation serializes with writes',async()=>{
  const results=await Promise.allSettled([db.owner.mutation('softwareFactoryControlPlane:revokeMissionMember',{assignmentId:contributor.assignmentId}),...Array.from({length:4},(_,i)=>db.client('fixture-peer').mutation('isolationFixture:contribute',{id:f.missionId,title:'race '+i}))]);
  assert.equal(results[0].status,'fulfilled');
  await assert.rejects(()=>db.peer.mutation('isolationFixture:contribute',{id:f.missionId,title:'after revoke'}));
  assert.equal(await db.peer.query('missions:get',{missionId:f.missionId}),null);
 });
 const expired=await assign('STAKEHOLDER');
 await db.owner.mutation('isolationFixture:fault',{id:expired.assignmentId,patch:{activeUntil:Date.now()-1}});
 await check('expired authorization denied',async()=>assert.equal(await db.peer.query('missions:get',{missionId:f.missionId}),null));
 await assign('STAKEHOLDER');
 await db.owner.mutation('isolationFixture:fault',{id:f.memberId,patch:{active:false}});
 await check('stale member denied',async()=>assert.equal(await db.peer.query('missions:get',{missionId:f.missionId}),null));
 await check('membership identity rebinding cannot transfer a grant',async()=>{
  await db.owner.mutation('isolationFixture:fault',{id:f.memberId,patch:{active:true,operatorId:s.authorId}});
  assert.equal(await db.peer.query('missions:get',{missionId:f.missionId}),null);
  assert.equal(await db.client('user_SyntheticPlanAuthorQualification').query('missions:get',{missionId:f.missionId}),null);
  await db.owner.mutation('isolationFixture:fault',{id:f.memberId,patch:{active:false,operatorId:s.peerId}});
 });
 await check('principal migration is dry-run first and idempotent',async()=>{
  await db.owner.mutation('isolationFixture:fault',{id:f.missionId,patch:{},unset:['ownerOperatorId']});
  assert.equal(await db.owner.query('missions:get',{missionId:f.missionId}),null);
  const dry=await db.owner.mutation('migrations/bindMissionPrincipals:run',{});
  assert.equal(dry.apply,false);assert.equal(dry.ownersBound,1);
  assert.equal(await db.owner.query('missions:get',{missionId:f.missionId}),null);
  const applied=await db.owner.mutation('migrations/bindMissionPrincipals:run',{apply:true});
  assert.equal(applied.ownersBound,1);
  assert.ok(await db.owner.query('missions:get',{missionId:f.missionId}));
  assert.equal((await db.owner.mutation('migrations/bindMissionPrincipals:run',{apply:true})).ownersBound,0);
 });
 await check('contradictory projection scope fails closed',async()=>{
  await db.owner.mutation('isolationFixture:fault',{id:f.artifactId,patch:{projectId:s.otherProjectId}});
  assert.equal(await db.owner.query('isolationFixture:read',{id:f.artifactId}),null);
  await db.owner.mutation('isolationFixture:fault',{id:f.artifactId,patch:{projectId:s.projectId}});
 });
 await db.owner.mutation('isolationFixture:fault',{id:f.memberId,patch:{active:true}});
 const timed=await db.owner.mutation('softwareFactoryControlPlane:assignMissionMember',{tenantId:s.tenantId,projectId:s.projectId,missionId:f.missionId,memberId:f.memberId,teamId:s.teamId,role:'STAKEHOLDER',expiresAt:Date.now()+2000});
 const timedClient=db.subscription('fixture-peer');let timedValue;
 const untimed=timedClient.onUpdate(makeFunctionReference('missions:get'),{missionId:f.missionId},value=>{timedValue=value;});
 try {
  await waitFor(()=>timedValue?.mission?._id===f.missionId);
  await check('grant expiry invalidates live cached authorization',()=>waitFor(()=>timedValue===null));
 } finally {untimed();await timedClient.close();}
 await db.restart();
 await check('restart retains isolation',async()=>assert.equal(await db.peer.query('missions:get',{missionId:f.missionId}),null));
 await check('transaction-local cache invalidates ancestor writes and denies cyclic foreign lineage',async()=>{
  const local=await db.owner.mutation('isolationFixture:seed',{scope:s});
  const foreign=await db.owner.mutation('isolationFixture:seed',{scope:{...s,operatorId:s.peerId}});
  assert.deepEqual(await db.owner.mutation('isolationFixture:transactionCacheProbe',{scope:s,local,foreign}),{ancestorWriteInvalidation:true,cyclicForeignReadOrderIndependent:true});
 });
 if(process.env.MC_ISOLATION_EVIDENCE) await writeFile(process.env.MC_ISOLATION_EVIDENCE,JSON.stringify({status:'PASS',checks},null,2)+'\n');
} finally { await db.destroy(); }

// Assertions, evidence writes and disposable database cleanup have completed.
// Convex subscription transport timers must not retain this one-shot process.
process.exit(0);
