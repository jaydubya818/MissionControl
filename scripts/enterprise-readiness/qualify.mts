import assert from 'node:assert/strict';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { startFixtureDatabase } from '../enterprise-compatibility/database.mjs';
import { canonicalServiceCommand } from '../../packages/shared/src/serviceCommandEnvelope';
import { sha256Hex } from '../../packages/shared/src/canonicalDigest';
import { SOFIE_APPLICATION, assessSoftwareInitiative } from '../../packages/shared/src/sofieEnterprise';
const output = resolve(process.argv[2] ?? '/tmp/mc-enterprise-readiness-' + randomUUID());
await mkdir(output);
const db: any = await startFixtureDatabase(process.cwd(), { nativeExecution: true, canonicalAccounting: true });
const checks: string[] = [], secret = randomBytes(32).toString('hex');
const result: any = { schema: 'enterprise-integration-readiness/v1', sourceSha: execFileSync('git', ['rev-parse','HEAD'], { encoding:'utf8' }).trim(),
  dirty: !!execFileSync('git',['status','--porcelain'], { encoding:'utf8' }).trim(), checks, paidOperations: 0, productionIntegration: 'NOT_RUN', executableProductionGrants: 0 };
const check = async (name: string, fn: () => Promise<any>) => { await fn(); checks.push(name); console.log('PASS ' + name); };
const mutate = (name: string, args: any, client = db.owner) => client.mutation(name, args, { skipQueue: true });
const fault = (id: string, patch: any, unset: string[] = []) => mutate('nativeFixture:fault', { id, patch, unset });
const inspect = (id: string) => db.owner.query('nativeFixture:inspectRecord', { id });
function sign(request: any, overrides = {}) {
  const payloadJson = JSON.stringify(request), now = Date.now();
  const envelope = { serviceId: SOFIE_APPLICATION, capability: request.operation, projectId: db.seed.projectId,
    repositoryId: 'connection:' + request.connectionId, commandId: randomUUID(), issuedAt: now, expiresAt: now + 60000,
    payloadDigest: 'sha256=' + sha256Hex(payloadJson), ...overrides };
  return { envelope: { ...envelope, signature: 'sha256=' + createHmac('sha256', secret).update(canonicalServiceCommand(envelope)).digest('hex') }, payloadJson };
}
const send = (packet: any) => db.anonymous.action('sofieEnterprise:command', packet);
try {
  const s = db.seed;
  db.setEnvironment('MC_SOFIE_READINESS_ENVIRONMENT_ID', s.environmentId);
  db.setEnvironment('MC_SOFIE_APPLICATION_SECRET', secret);
  db.setEnvironment('MC_SOFIE_APPLICATION_OWNER_ID', s.operatorId);
  db.setEnvironment('MC_SOFIE_APPLICATION_KEY_ID', 'readiness-key-1');
  const connectArgs = { projectId:s.projectId, ownerMemberId:s.memberId, owningTeamId:s.teamId, expiresAt:Date.now()+600000 };
  for (const [name, client] of [['anonymous',db.anonymous],['other-tenant',db.other],['other-owner',db.peer]] as const)
    await check(name+'-connection-denied', () => assert.rejects(() => mutate('sofieEnterprise:connect',connectArgs,client)));
  const connection = await mutate('sofieEnterprise:connect',connectArgs), connectionId=connection.connectionId;
  result.recognition = { ownerIntent: 'Build an Agentic HR platform.', interpretedFacts: { software:true,workstreams:4,enterpriseGovernance:true,boundedRepositoryChange:false },
    assessment:assessSoftwareInitiative({ software:true,workstreams:4,enterpriseGovernance:true,boundedRepositoryChange:false }) };
  assert.equal(result.recognition.assessment.recommendation,'PROPOSE_MISSIONCONTROL');
  const proposal = { title:'Agentic HR platform',objective:'Prepare a governed platform for recruiting, onboarding, employee operations and audit.',
    workstreams:['Recruiting','Onboarding','Employee operations','Audit and security'], milestones:['Approve scope and data boundaries','Approve Plan and Quality Contract','Independently verify implementation'],
    budgetMicrousd:0,stopCondition:'Stop after draft and Plan inspection. No execution is authorized.' };
  const propose={operation:'enterprise.propose',connectionId,intentKey:'hr-platform-owner-intent-1',proposal};
  for (const [name,packet] of [
    ['wrong-application',sign(propose,{serviceId:'orchestration-server'})],['expired-command',sign(propose,{expiresAt:Date.now()-1})],
    ['wrong-project',sign(propose,{projectId:s.otherProjectId})],['wrong-connection-binding',sign(propose,{repositoryId:'connection:other'})],
    ['settlement-capability',sign({...propose,operation:'enterprise.settle'})],['forged-result',sign({...propose,operation:'enterprise.result'})],
    ['unrestricted-admin',sign({...propose,operation:'missions.start'})],['nonzero-budget',sign({...propose,proposal:{...proposal,budgetMicrousd:1}})],
    ['owner-spoofing',sign({...propose,ownerId:s.peerId})],['extra-factory-authority',sign({...propose,factoryVersion:'forged'})],
  ] as const) await check(name+'-denied',()=>assert.rejects(()=>send(packet)));
  const bad=sign(propose);bad.envelope.signature='sha256='+'0'.repeat(64);
  await check('invalid-signature-denied',()=>assert.rejects(()=>send(bad)));
  const tampered=sign(propose);tampered.payloadJson=JSON.stringify({...propose,intentKey:'tampered'});
  await check('changed-payload-denied',()=>assert.rejects(()=>send(tampered)));
  const packet=sign(propose), prepared=await send(packet);result.proposal=prepared;
  await check('concurrent-proposal-deduplication',async()=>{
    const replies=await Promise.all(Array.from({length:5},()=>send(sign(propose))));assert.ok(replies.every(r=>r.response.proposalId===prepared.response.proposalId));
  });
  await check('changed-intent-payload-denied',()=>assert.rejects(()=>send(sign({...propose,proposal:{...proposal,title:'Changed'}}))));
  const proposalId=prepared.response.proposalId,proposalDigest=prepared.response.digest;
  const submit={operation:'enterprise.submit',connectionId,proposalId,proposalDigest};
  await check('unapproved-submit-denied',()=>assert.rejects(()=>send(sign(submit))));
  const decision={projectId:s.projectId,connectionId,proposalId,expectedDigest:proposalDigest,decision:'AUTHORIZE_DRAFT'};
  for(const [name,client] of [['application',db.anonymous],['other-owner',db.peer],['other-tenant',db.other]] as const)
    await check(name+'-approval-denied',()=>assert.rejects(()=>mutate('sofieEnterprise:decide',decision,client)));
  await check('changed-proposal-approval-denied',()=>assert.rejects(()=>mutate('sofieEnterprise:decide',{...decision,expectedDigest:'sha256:'+'0'.repeat(64)})));
  result.authorization=await mutate('sofieEnterprise:decide',decision);
  let submitted:any;
  await check('concurrent-single-canonical-mission',async()=>{
    const replies=await Promise.all(Array.from({length:6},()=>send(sign(submit))));assert.equal(replies.filter(r=>r.response.created).length,1);
    assert.equal(new Set(replies.map(r=>r.response.missionId)).size,1);submitted=replies[0];
  });
  const missionId=submitted.response.missionId;result.submission=submitted;
  const read={operation:'enterprise.read',connectionId,proposalId,missionId,expectedPlanDigest:null};
  result.initialStatus=await send(sign(read));assert.equal(result.initialStatus.response.mission.state,'DRAFT');
  assert.equal(result.initialStatus.response.resultProof.status,'NOT_AVAILABLE');
  assert.equal(result.initialStatus.response.resultProof.reason,'COMPLETED_RESULT_CONSUMPTION_NOT_QUALIFIED');assert.equal(result.initialStatus.response.workOrders.length,0);
  await check('lost-submit-ack-restart',async()=>{await db.restart();const retry=await send(sign(submit));assert.equal(retry.response.missionId,missionId);assert.equal(retry.response.created,false)});
  await check('changed-mission-identity-denied',()=>assert.rejects(()=>send(sign({...read,missionId:s.projectId}))));
  await check('changed-proposal-digest-denied',()=>assert.rejects(()=>send(sign({...submit,proposalDigest:'sha256:'+'0'.repeat(64)}))));
  const colliding=sign({...propose,intentKey:'another'},{commandId:packet.envelope.commandId});
  await check('command-id-payload-collision-denied',()=>assert.rejects(()=>send(colliding)));
  const plan=await mutate('missions:savePlanDraft',{projectId:s.projectId,missionId,idempotencyKey:'hr-plan-draft',summary:'Inspectable HR platform decomposition',rollbackApproach:'No execution has occurred.',estimatedCostUsd:0,
    assertions:[],workOrderBlueprints:proposal.workstreams.map((title,i)=>({id:'hr-'+i,title,desiredOutcome:'Define '+title,sequence:i,role:'WORKER',isMutating:false,priority:3,riskLevel:'LOW',constraints:['Proposal only'],requiredApprovals:[],dependsOnBlueprintIds:[],assertionIds:[]}))});
  result.planStatus=await send(sign(read));assert.equal(result.planStatus.response.plan.status,'DRAFT');assert.equal(result.planStatus.response.plan.milestones.length,4);
  const planDigest=result.planStatus.response.plan.digest;
  await check('stale-plan-binding-denied',()=>assert.rejects(()=>send(sign({...read,expectedPlanDigest:'sha256:'+'0'.repeat(64)})),/ENTERPRISE_PLAN_STALE/));
  await check('current-plan-binding',async()=>assert.equal((await send(sign({...read,expectedPlanDigest:planDigest}))).response.plan.digest,planDigest));
  const original=await inspect(proposalId);
  await fault(proposalId,{proposal:{...proposal,title:'Tampered at rest'}});
  await check('stored-proposal-tamper-denied',()=>assert.rejects(()=>send(sign(submit))));await fault(proposalId,{proposal:original.proposal});
  await fault(connectionId,{expiresAt:Date.now()-1});
  await check('expired-connection-denied',()=>assert.rejects(()=>send(sign(read))));await fault(connectionId,{expiresAt:connectArgs.expiresAt});
  db.setEnvironment('MC_SOFIE_APPLICATION_OWNER_ID',s.peerId);await check('application-key-owner-binding',()=>assert.rejects(()=>send(sign(read))));db.setEnvironment('MC_SOFIE_APPLICATION_OWNER_ID',s.operatorId);
  await fault(s.tenantId,{active:false});await check('disabled-tenant-denied',()=>assert.rejects(()=>send(sign(read))));await fault(s.tenantId,{active:true});
  const assignments=await db.owner.query('nativeFixture:inspect',{table:'roleAssignments'});
  const assignment=assignments.find((a:any)=>a.operatorId===s.operatorId);
  await fault(assignment._id,{scope:{type:'project',id:s.otherProjectId}});
  await check('unrelated-project-role-cannot-authorize',()=>assert.rejects(()=>send(sign(read))));await fault(assignment._id,{},['scope']);
  const memberships=await db.owner.query('nativeFixture:inspect',{table:'teamMemberships'});
  const membership=memberships.find((m:any)=>m.operatorId===s.operatorId);
  await fault(membership._id,{activeUntil:Date.now()-1});await check('expired-membership-denied',()=>assert.rejects(()=>send(sign(read))));await fault(membership._id,{},['activeUntil']);
  await fault(membership._id,{activeFrom:Date.now()+60000});await check('future-membership-denied',()=>assert.rejects(()=>send(sign(read))));await fault(membership._id,{activeFrom:membership.activeFrom});
  await fault(s.environmentId,{type:'prod'});await check('production-environment-denied',()=>assert.rejects(()=>send(sign(read))));await fault(s.environmentId,{type:'dev'});
  await fault(s.operatorId,{active:false});await check('inactive-owner-denied',()=>assert.rejects(()=>send(sign(read))));await fault(s.operatorId,{active:true});
  await check('key-rotation-denies-old-connection',async()=>{db.setEnvironment('MC_SOFIE_APPLICATION_KEY_ID','readiness-key-2');await assert.rejects(()=>send(sign(read)));db.setEnvironment('MC_SOFIE_APPLICATION_KEY_ID','readiness-key-1')});
  await mutate('sofieEnterprise:decide',{...decision,decision:'REVOKE'});
  await check('revoked-proposal-denies-read-and-retry',async()=>{await assert.rejects(()=>send(sign(read)));await assert.rejects(()=>send(sign(submit)))});
  await mutate('sofieEnterprise:decide',{projectId:s.projectId,connectionId,decision:'REVOKE'});
  await check('revoked-connection-denies-new-proposal',()=>assert.rejects(()=>send(sign({...propose,intentKey:'new'}))));
  result.canonicalMission=await inspect(missionId);assert.equal(result.canonicalMission.state,'PLANNING');assert.equal(result.canonicalMission.spentUsd,0);
  const runs=await db.owner.query('nativeFixture:inspect',{table:'workflowRuns'});assert.deepEqual(runs,[]);
  const workOrders=await db.owner.query('nativeFixture:inspect',{table:'workOrders'});assert.deepEqual(workOrders,[]);
  await check('no-reservation-or-delegation-authority',async()=>{
    for (const table of ['inferenceReservations','factoryProviderReservations','factoryDelegationTrials'])
      assert.deepEqual(await db.owner.query('nativeFixture:inspect',{table}),[]);
  });
  result.spendingReservations=0;
  result.executionAttempts=0;result.workOrdersReleased=0;result.result='PASS';
  await writeFile(join(output,'conversation.md'), [
    '# Synthetic Sofie enterprise journey',
    'Owner: Build an Agentic HR platform.',
    'Sofie: This spans recruiting, onboarding, employee operations and audit. I recommend a MissionControl proposal. This recommendation grants no execution authority.',
    'Inspectable proposal: '+proposalId+'; digest '+proposalDigest+'.',
    'Synthetic owner decision: AUTHORIZE_DRAFT for that exact proposal digest.',
    'Sofie: Canonical Mission '+missionId+' exists. Current state: '+result.canonicalMission.state+'.',
    'Plan '+result.planStatus.response.plan.id+' is '+result.planStatus.response.plan.status+'. Milestones: '+result.planStatus.response.plan.milestones.map((m:any)=>m.title).join(', ')+'.',
    'Progress: 0 WorkOrders released; 0 execution Attempts; 0 spending reservations. No completion percentage is claimed.',
    'Needs You: '+result.planStatus.response.needsYou,
    'Enterprise Quality Gate: NOT_EVALUATED. Result/Proof: NOT_AVAILABLE. Independent verification and canonical enterprise acceptance remain separate requirements.',
    'Revocation checks run after this conversation deny subsequent app access.',
  ].join('\n\n')+'\n');

  await writeFile(join(output,'qualification.json'),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({result:'PASS',checks:checks.length,executionAttempts:0,output}));
} finally {
  await db.stop();
  assert.match(db.root, /\/mc-enterprise-1b-[A-Za-z0-9]+$/);
  await rm(db.root,{recursive:true,force:true});
  result.databaseCleanup='VERIFIED';
  await writeFile(join(output,'qualification.json'),JSON.stringify(result,null,2)+'\n');
}

process.exit(0);
