import {createLocalCompatibilityTransport} from './local-transport.mjs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {canonicalDigest,factoryDelegationBindingDigest,fixtureExposure,bindEngineeringTariff} from '@mission-control/shared';
import {compileApprovedPlanQualityContract} from '../../convex/lib/qualityContract.ts';
import {startFixtureDatabase} from './database.mjs';
import {compatibility} from './fixtures.mjs';
import {verifyLocalDelegationResult,verifyLocalTerminalResult,verifyLocalCustodyObservation,LOCAL_PROVIDER_QUALIFICATION_SHA} from '../../apps/orchestration-server/src/myFactoryLocalCompatibility.ts';
import {MyFactoryLocalRecovery} from '../../apps/orchestration-server/src/myFactoryLocalRecovery.ts';
const root=resolve(process.env.MC_LOCAL_MYFACTORY_ROOT),repo=process.cwd();
const canonicalAccounting=process.env.MC_CANONICAL_ACCOUNTING_QUALIFICATION==='1';
const exposure=budget=>canonicalAccounting?budget.exposureMicrousd:fixtureExposure(budget);
const load=path=>import(pathToFileURL(resolve(root,path)).href);
const sourceSha=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
if(sourceSha!==LOCAL_PROVIDER_QUALIFICATION_SHA||execFileSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'}).trim())throw Error('EXACT_CLEAN_LOCAL_SOURCE_REQUIRED');
const partner={...await load('packages/hosted-routing/src/result.ts'),sourceSha:LOCAL_PROVIDER_QUALIFICATION_SHA};
const {localFixture,qualifyHost,createLocalFactory}=await load('apps/cloud-control/test/fixtures/local-factory.mjs');
const {startPostgres}=await load('apps/cloud-control/test/fixtures/local-postgres.mjs');
const checks=[],journeys=[];let db,pg,f,server;
const check=async(name,fn)=>{await fn();checks.push(name);console.log('PASS '+name);};
const hash='sha256:'+'a'.repeat(64);
async function cleanup(){if(server){server.closeAllConnections();server.close();server=null;}await db?.stop();db=null;await pg?.stop();pg=null;await f?.stop();f=null;}
async function setup({expiresIn,withoutTariff=false,policyFailure=false,verifierFailure=false}={}){
 db=await startFixtureDatabase(repo,{canonicalAccounting});f=await localFixture(root);await qualifyHost(f);pg=await startPostgres(root);
 if(verifierFailure){f.policy=structuredClone(f.policy);f.policy.checks[0].expected={value:'intentionally-failing-protected-expectation'};f.configuration.local.verificationPolicySha256=partner.digest(f.policy);}
 const s=db.seed,now=Date.now(),request=f.request;
 if(canonicalAccounting)await db.owner.mutation('accountingFixture:configure',{seed:s});
 const b={schema:'factory-delegation-binding/v1',delegationId:'local-'+randomUUID(),tenantId:s.tenantId,projectId:s.projectId,
  missionId:s.missionId,missionSpecRevisionId:s.missionSpecRevisionId,missionPlanId:s.missionPlanId,missionPlanRevision:1,
  missionPlanDigest:canonicalDigest('mission-plan-fixture/v1',{revision:1,summary:'Fixture plan',blueprints:[],assertions:[]}),
  workOrderId:s.workOrderId,workOrderRevisionId:s.workOrderRevisionId,workOrderRevisionNumber:1,taskId:s.taskId,workflowRunId:s.workflowRunId,
  executionManifestDigest:hash,qualityContractDigest:hash,authorityGeneration:1,factoryId:f.signing.factoryId,factoryVersion:f.version(),
  executionProtocol:'MYFACTORY_EXECUTION_V2',clientId:'missioncontrol-local',ownerScope:s.operatorId,
  partnerWorkId:request.workId,partnerWorkGeneration:1,partnerRequestId:request.requestId,partnerRequestDigest:partner.digest(request),
  repositoryId:s.repositoryId,repository:request.repository,baseCommit:request.source.commit,baseTree:request.source.tree,
  sourceSnapshotDigest:canonicalDigest('factory-fixture-source/v1',request.source),executionProfileDigest:'sha256:'+partner.digest(f.configuration),
  modelPolicyDigest:canonicalDigest('factory-fixture-model/v1',{model:f.configuration.model,evidenceClass:'DETERMINISTIC'}),
  verificationPolicyDigest:'sha256:'+partner.digest(f.policy),allowedEffects:['repository.read','sandbox.write','candidate.create','verification.request'],
  budgetReservationId:'',maxSpendMicrousd:80,issuedAt:now-1000,expiresAt:Date.parse(request.deadline),deadline:Date.parse(request.deadline)};
 const checkIds=f.policy.checks.map(c=>c.id);
 const quality=compileApprovedPlanQualityContract({missionId:s.missionId,missionPlanId:s.missionPlanId,missionPlanRevision:1,objective:'Project slug protected behavior',businessContext:'Isolated provider qualification',rollbackApproach:'Discard the isolated candidate',repository:b.repository,repositoryBranch:'qualification',planningRepositorySha:b.baseCommit,summary:'Fixture plan',assertions:[{assertionId:'delegated-behavior',title:'Project slug protected behavior',outcome:'Canonical slug behavior',verificationMethod:'INDEPENDENT_TEST',passCondition:'All protected cases pass',requiredEvidence:'Signed independent Factory checks',requiresIndependentValidation:true,waiverAllowed:false}],workOrderBlueprints:[]});
 if(expiresIn)b.expiresAt=now+expiresIn;
 b.qualityContractDigest=quality.digest;
 const verificationSpec={id:s.workOrderId,revisionNumber:1,title:'Project slug protected behavior',riskLevel:'LOW',riskReasons:[],requiredApprovals:['HUMAN_REVIEW'],
 acceptanceCriteria:[{id:'delegated-behavior',title:'Project slug protected behavior',requiredEvidence:[{category:'TEST_RESULT',minimumCount:checkIds.length,independent:true,independenceLevel:'INDEPENDENT_REQUIRED'}]}],
 negativeConstraints:[{id:'no-test-removal',type:'NO_TEST_REMOVAL',description:'Preserve tests'},{id:'no-config-change',type:'NO_VERIFICATION_CONFIG_CHANGES',description:'Preserve verification'}],
 changeBudget:{maxFilesChanged:policyFailure?0:1,maxLinesChanged:100,allowedPaths:request.input.allowedPaths,deniedPaths:[],allowedCommandClasses:['TEST'],prohibitedCommandClasses:['PRODUCTION_ACCESS','SECRETS_ACCESS','PUBLISH'],allowDependencyChanges:false,allowSchemaChanges:false,allowMigrations:false,allowInfrastructureChanges:false},
 requirements:[{id:'slug-behavior',title:'Protected slug behavior',type:'FUNCTIONAL',description:'Protected slug behavior',priority:'MUST'}],
 verificationContract:{schemaVersion:canonicalAccounting?2:1,enforcementMode:canonicalAccounting?'ENFORCED':'OBSERVE_ONLY',...(canonicalAccounting?{requiredRisks:[],independence:{required:true,minimumBoundary:'SEPARATE_ATTEMPT'}}:{}),requireHumanReview:true,checks:checkIds.map(id=>({id,name:id,category:'UNIT_TEST',verifierId:'delegated-local',mandatory:true,acceptanceCriterionIds:['delegated-behavior'],evidenceCategory:'TEST_RESULT'}))}};
 b.budgetReservationId=b.delegationId;
 const tariff=canonicalAccounting&&!withoutTariff?bindEngineeringTariff(b,Date.now()):null;
 if(tariff)Object.assign(b,tariff.binding);
 const bindingDigest=factoryDelegationBindingDigest(b);
 f.executionBinding={ownerScope:b.ownerScope,delegationDigest:bindingDigest.slice(7),repository:b.repository,sourceSnapshotSha256:partner.digest(request.source)};
 const scope={projectId:s.projectId};
 const mut=(name,args,client=db.owner)=>client.mutation('factory/enterpriseCompatibility:'+name,{...scope,...args},{skipQueue:true});
 const query=(name,args,client=db.owner)=>client.query('factory/enterpriseCompatibility:'+name,{...scope,...args});
 const inspect=id=>db.owner.mutation('fixtureSeed:inspect',{id});
 const fault=(id,patch)=>db.owner.mutation('fixtureSeed:fault',{id,patch});
 await mut('register',{factoryDefinitionId:s.factoryDefinitionId,config:{kind:'MYFACTORY',factoryId:b.factoryId,factoryVersion:b.factoryVersion,definitionVersionId:s.definitionVersionId,capabilities:['BOUNDED_DELEGATION','SIGNED_RESULT'],capacity:2,admissionPolicy:'FIXTURE_ONLY',compatibility,executionProvider:'LOCAL_DOCKER_QUALIFICATION',localProviderSourceSha:sourceSha}});
 await assert.rejects(mut('initializeBudget',{missionId:s.missionId},db.peer));
 if(!canonicalAccounting)await mut('initializeBudget',{missionId:s.missionId});
 else {
  const version=await inspect(s.definitionVersionId),wo=await inspect(s.workOrderId);
  await fault(s.definitionVersionId,{budget:{...version.budget,maxRuntimeMinutes:3},executionProfileDigest:b.executionProfileDigest});
  await fault(s.workOrderId,{metadata:{...wo.metadata,implementationPolicy:{...wo.metadata.implementationPolicy,timeoutMinutes:3}}});
 }
 await mut('assess',{factoryDefinitionId:s.factoryDefinitionId,expectedRevision:1,health:'HEALTHY',evidenceDigest:hash,validUntil:b.deadline,revoke:false});
 await db.owner.mutation('fixtureSeed:approveExecution',{binding:b,bindingDigest,quality,verificationSpec,checkIdsDigest:canonicalDigest('enterprise-check-ids/v1',f.policy.checks.map(c=>c.id)),deferClaim:canonicalAccounting,...(tariff?{tariff:tariff.tariff}:{})});
 const base={missionId:s.missionId,factoryDefinitionId:s.factoryDefinitionId,binding:b};
 const ids=await Promise.all(Array.from({length:8},()=>mut('admitTrial',base)));assert.equal(new Set(ids).size,1);const trialId=ids[0];
 if(canonicalAccounting)await fault(s.workflowRunId,{status:'RUNNING',lease:{leaseId:'fixture-lease',ownerId:b.ownerScope,workerGeneration:b.authorityGeneration,claimedAt:Date.now(),heartbeatAt:Date.now(),expiresAt:b.deadline+60000}});
 const authority=()=>query('assertExecutionAuthority',{trialId});
 const factory=await createLocalFactory(f,pg.pool,authority);
 const reservation=(await inspect(s.workflowRunId)).executionCostAuthorization?.enterprise;
 return{s,b,bindingDigest,mut,query,inspect,fault,base,trialId,authority,factory,tariff:tariff?.tariff,admittedAt:reservation?.authorizedAt};
}
async function transport(c,options={}){
 const wire=await createLocalCompatibilityTransport(c,{...options,canonicalAccounting,partner});server=wire.server;return wire;
}
async function observe(c,p,state=p.state){await c.mut('observeTrial',{trialId:c.trialId,revision:state==='PREPARED'?1:2,state,partnerWorkOrderId:p.workOrderId,partnerRunId:p.runId,receiptDigest:canonicalDigest('local-observation/v1',{state,run:p.runId})});}
try{
 const c=await setup();
 await check('concurrent enterprise admission reserves exactly one delegated allowance',async()=>assert.equal(exposure(await c.query('getBudget',{missionId:c.s.missionId})),80));
 await check('cross-tenant and same-tenant cross-owner reads and mutations denied',async()=>{for(const client of [db.other,db.peer,db.anonymous]){await assert.rejects(c.query('readTrial',{trialId:c.trialId},client));await assert.rejects(c.query('getBudget',{missionId:c.s.missionId},client));await assert.rejects(c.mut('reserveNativeFixture',{missionId:c.s.missionId,id:'foreign',digest:hash,maximumMicrousd:1,expiresAt:c.b.deadline},client));await assert.rejects(c.mut('claimTrial',{trialId:c.trialId},client));await assert.rejects(c.mut('admitTrial',c.base,client));}});
 await check('budget owner remains fenced after current Plan removal or approval replacement',async()=>{
  const plan=await c.inspect(c.s.missionPlanId);
  for(const mode of ['removed','unapproved']){
   if(mode==='removed')await db.owner.mutation('fixtureSeed:fault',{id:c.s.missionId,patch:{},unset:['currentPlanId']});
   else await c.fault(c.s.missionPlanId,{metadata:{}});
   await assert.rejects(c.query('getBudget',{missionId:c.s.missionId},db.peer));
   await assert.rejects(c.mut('reserveNativeFixture',{missionId:c.s.missionId,id:'foreign-plan',digest:hash,maximumMicrousd:1,expiresAt:c.b.deadline},db.peer));
   await assert.rejects(c.mut('initializeBudget',{missionId:c.s.missionId},db.peer));
   assert.equal(exposure(await c.query('getBudget',{missionId:c.s.missionId})),80);
   await c.fault(c.s.missionId,{currentPlanId:c.s.missionPlanId});await c.fault(c.s.missionPlanId,{metadata:plan.metadata});
  }
 });
 await check('native and delegated concurrent budget contention is bounded',async()=>{if(canonicalAccounting){
  const version=await c.inspect(c.s.nativeVersionId);await c.fault(c.s.nativeVersionId,{budget:{...version.budget,maxCostUsd:0.00002}});
  const seeds=[];for(let i=0;i<2;i++)seeds.push(await db.owner.mutation('accountingFixture:cloneWork',{seed:c.s}));
  const results=await Promise.allSettled(seeds.map(seed=>db.owner.mutation('accountingFixture:reserveNative',{seed},{skipQueue:true})));
  assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(exposure(await c.query('getBudget',{missionId:c.s.missionId})),100);return;
 }const r=await Promise.allSettled(['a','b'].map(id=>c.mut('reserveNativeFixture',{missionId:c.s.missionId,id,digest:hash,maximumMicrousd:20,expiresAt:c.b.deadline})));assert.equal(r.filter(x=>x.status==='fulfilled').length,1);assert.equal(exposure(await c.query('getBudget',{missionId:c.s.missionId})),100);});
 await check('stale WorkOrder, stale Attempt, revoked Plan and stale lease deny execution',async()=>{
  for(const [id,patch] of [[c.s.workOrderId,{currentRevisionNumber:2}],[c.s.workOrderId,{currentExecutionRunId:c.s.workflowRunId+'x'}],[c.s.missionPlanId,{status:'SUPERSEDED'}],[c.s.workflowRunId,{lease:null}]]){
   const before=await c.inspect(id);
   if(patch.currentExecutionRunId){await db.owner.mutation('fixtureSeed:fault',{id,patch:{},unset:['currentExecutionRunId']});}else if(patch.lease===null){await c.fault(id,{lease:{...before.lease,workerGeneration:2}});}else await c.fault(id,patch);
   await assert.rejects(c.mut('claimTrial',{trialId:c.trialId}));const restore=Object.fromEntries(Object.keys(patch).map(k=>[k,before[k]]));await c.fault(id,restore);
  }
 });
 await check('frozen Quality Contract cannot lose mandatory verification checks',async()=>{
  const wo=await c.inspect(c.s.workOrderId);await c.fault(c.s.workOrderId,{verificationContract:{...wo.verificationContract,checks:[]}});
  await assert.rejects(c.mut('claimTrial',{trialId:c.trialId}));await c.fault(c.s.workOrderId,{verificationContract:wo.verificationContract});
 });
 await check('one controller claim survives lost admission acknowledgment and restart',async()=>{
  const claims=await Promise.all([c.mut('claimTrial',{trialId:c.trialId}),c.mut('claimTrial',{trialId:c.trialId})]);assert.equal(claims.filter(Boolean).length,1);
 });
 const wire=await transport(c);await assert.rejects(wire.call('ADMIT',f.request));await db.restart();assert.equal(await c.mut('claimTrial',{trialId:c.trialId}),false);
 const prepared=await wire.call('STATUS',{requestId:f.request.requestId});await observe(c,prepared);assert.equal(wire.admissions,1);
 const identity=c.factory.identity(prepared);await c.factory.control.dispatch(identity);await c.factory.execute(identity);
 const r=await wire.call('RESULT',{requestId:f.request.requestId});await observe(c,prepared,r.state);
 const expected={workOrderId:prepared.workOrderId,runId:prepared.runId,keys:[f.signing.key],now:Date.now(),...(c.tariff?{tariff:c.tariff,admittedAt:c.admittedAt}:{})};
 const projection=verifyLocalDelegationResult(r.result,c.b,partner,expected);
 if(canonicalAccounting){projection.custodyObservation=verifyLocalCustodyObservation(r.observation,projection,c.b,Date.now());projection.authenticatedResponse=r.authenticatedResponse;}
 await check('wrong candidate, wrong provider and stale result writer denied',async()=>{
  const swapped=structuredClone(r.result);swapped.artifacts[0].base64=Buffer.from('wrong').toString('base64');assert.throws(()=>verifyLocalDelegationResult(swapped,c.b,partner,expected));
  assert.throws(()=>verifyLocalDelegationResult(r.result,{...c.b,factoryVersion:'f'.repeat(64)},partner,expected));
  const wo=await c.inspect(c.s.workOrderId);await c.fault(c.s.workOrderId,{currentRevisionNumber:2});await assert.rejects(c.mut('ingestExecutionResult',{trialId:c.trialId,...projection}));await c.fault(c.s.workOrderId,{currentRevisionNumber:wo.currentRevisionNumber});
 });
 await check('real execution evidence enters enterprise gate and settles once',async()=>{
  if(canonicalAccounting){
   await assert.rejects(c.mut('ingestExecutionResult',{trialId:c.trialId,...projection,tariffDigest:hash}));
   const {tariffDigest,...missingTariff}=projection;await assert.rejects(c.mut('ingestExecutionResult',{trialId:c.trialId,...missingTariff}));
   assert.equal(exposure(await c.query('getBudget',{missionId:c.s.missionId})),100);
  }

  const gateIds=await Promise.all(Array.from({length:4},()=>c.mut('ingestExecutionResult',{trialId:c.trialId,...projection})));assert.equal(new Set(gateIds).size,1);
  const gate=await c.inspect(gateIds[0]);assert.equal(gate.state,'AWAITING_HUMAN');assert.equal(gate.mode,canonicalAccounting?'ENFORCED':'SHADOW');
  if(canonicalAccounting){const current=await c.query('currentIsolatedQualityGate',{trialId:c.trialId});assert.equal(current.isolated.current,true,JSON.stringify(current));assert.equal(current.isolated.eligible,false);assert.equal(current.production.current,false);}
  else assert.equal(gate.metadata.authoritativeAcceptance,false);
  if(!canonicalAccounting)for(const id of ['factory-verification-authority','factory-change-budget','factory-negative-constraints'])assert.equal(gate.metadata.checks.find(c=>c.checkId===id)?.status,'PASS');
  assert.equal(exposure(await c.query('getBudget',{missionId:c.s.missionId})),20);
  await assert.rejects(c.mut('ingestExecutionResult',{trialId:c.trialId,...projection,resultDigest:hash}));
  const settlement=(await c.inspect(c.s.workflowRunId)).enterpriseSettlement;
  if(canonicalAccounting){assert.equal(settlement.basis,'DETERMINISTIC_ENGINEERING_ZERO_CHARGE');assert.equal(settlement.resourceCost,'UNMEASURED');assert.equal(settlement.tariffDigest,c.tariff.digest);}
  journeys.push({state:r.state,resultDigest:r.result.manifestDigest,factoryVersion:f.version(),sourceDigest:f.sourceDigest,hostQualification:f.hostQualification,gateState:gate.state,execution:c.factory.evidence,...(settlement?{settlement}:{}),paidOperations:0});
 });
 if(canonicalAccounting)await check('currentness rejects changed authority and stale retained evidence while production stays fenced',async()=>{
  const current=()=>c.query('currentIsolatedQualityGate',{trialId:c.trialId});
  const first=await current(),receipt=await c.inspect(first.isolated.verificationReceiptId);
  const envelope=await c.inspect(receipt.evidenceEnvelopeIds[0]),artifact=await c.inspect(envelope.artifactIds[0]);
  const plan=await c.inspect(c.s.missionPlanId),wo=await c.inspect(c.s.workOrderId),factory=await c.inspect(c.s.factoryDefinitionId);
  const source=await c.inspect(c.s.workflowRunId);
  const variants=[
   [c.s.workOrderId,{currentExecutionRunId:first.isolated.verificationAttemptId}],
   [c.s.workOrderId,{currentRevisionNumber:2}],
   [c.s.workOrderId,{verificationContract:{...wo.verificationContract,requireHumanReview:false}}],
   [c.s.missionPlanId,{approvedBy:'wrong-owner'}],[c.s.missionPlanId,{revisionNumber:2}],
   [c.s.missionPlanId,{decidedActorSource:'DEVELOPMENT_FALLBACK'}],
   [c.s.factoryDefinitionId,{enterpriseRegistration:{...factory.enterpriseRegistration,health:'UNHEALTHY'}}],
   [artifact._id,{contentHash:hash}],
   [artifact._id,{metadata:{...artifact.metadata,authenticatedResponse:null}}],
   [artifact._id,{metadata:{...artifact.metadata,authenticatedResponse:{...artifact.metadata.authenticatedResponse,signature:'f'.repeat(64)}}}],
   [envelope._id,{metadata:{...envelope.metadata,custodyObservation:{...envelope.metadata.custodyObservation,expiresAt:Date.now()-1}}}],
   [c.s.workflowRunId,{verificationSubject:{...source.verificationSubject,candidateSha:'f'.repeat(40)}}],
  ];
  for(const [id,patch] of variants){
   const before=await c.inspect(id);await c.fault(id,patch);
   assert.equal((await current()).isolated.current,false,JSON.stringify(patch));
   await c.fault(id,Object.fromEntries(Object.keys(patch).map(k=>[k,before[k]])));
  }
  for(const client of [db.peer,db.other,db.anonymous])await assert.rejects(c.query('currentIsolatedQualityGate',{trialId:c.trialId},client));
  assert.equal((await current()).isolated.current,true);assert.equal((await current()).production.eligible,false);
 });
 await cleanup();
 if(canonicalAccounting){
  const c=await setup({policyFailure:true});await c.mut('claimTrial',{trialId:c.trialId});
  const p=await c.factory.control.prepare(f.request),identity=c.factory.identity(p);await observe(c,p);
  await c.factory.control.dispatch(identity);await c.factory.execute(identity);
  const wire=await transport(c),r=await wire.call('RESULT',{requestId:c.b.partnerRequestId});await observe(c,p,r.state);
  const projection=verifyLocalDelegationResult(r.result,c.b,partner,{workOrderId:p.workOrderId,runId:p.runId,keys:[f.signing.key],now:Date.now(),tariff:c.tariff,admittedAt:c.admittedAt});
  projection.custodyObservation=verifyLocalCustodyObservation(r.observation,projection,c.b,Date.now());projection.authenticatedResponse=r.authenticatedResponse;
  await check('Factory PASS cannot override an enterprise policy failure',async()=>{
   const gate=await c.inspect(await c.mut('ingestExecutionResult',{trialId:c.trialId,...projection}));
   assert.equal(gate.state,'INELIGIBLE');const result=await c.query('currentIsolatedQualityGate',{trialId:c.trialId});
   assert.equal(result.isolated.eligible,false);assert.equal(result.isolated.verifiedOutcome,'FAILURE');
   assert.equal(exposure(await c.query('getBudget',{missionId:c.s.missionId})),0);
   journeys.push({mode:'enterprise-policy-failed',factoryOutcome:'PASS',gateState:gate.state,paidOperations:0});
  });await cleanup();
 }
 if(canonicalAccounting&&process.env.MC_RECOVERY_QUALIFICATION==='1'){
  for(const mode of ['restart-lost-ack','unknown','cancel-executing','expired','stale-writer','verifier-failure','candidate-mismatch'].filter(mode=>!process.env.MC_RECOVERY_CASE||mode===process.env.MC_RECOVERY_CASE)){
   const c=await setup(mode==='unknown'?{expiresIn:2000}:mode==='expired'?{expiresIn:20000}:mode==='verifier-failure'?{verifierFailure:true}:{});
   await c.mut('claimTrial',{trialId:c.trialId});const wire=await transport(c,{dropResult:mode==='restart-lost-ack',corruptResult:mode==='candidate-mismatch'});
   let lostAck=mode==='restart-lost-ack',ingestions=0;
   const makeRecovery=()=>new MyFactoryLocalRecovery({endpoint:wire.endpoint,requestKey:wire.requestKey,responseKey:wire.responseKey,
    verifier:partner,keys:[f.signing.key],tariff:c.tariff,admittedAt:c.admittedAt,store:{
     read:()=>c.query('readTrial',{trialId:c.trialId}),authority:c.authority,
     observe:projection=>c.mut('observeTrial',{trialId:c.trialId,...projection}),
     ingest:async projection=>{ingestions++;const id=await c.mut('ingestExecutionResult',{trialId:c.trialId,...projection});if(lostAck){lostAck=false;throw Error('LOST_RESULT_ACK');}return id;},
     settle:projection=>c.mut('reconcileTerminalExecution',{trialId:c.trialId,...projection}),
    }});
   if(mode==='unknown'){
    await check('autonomous recovery retains missing admission UNKNOWN across cancellation expiry and restart',async()=>{
     assert.equal(await makeRecovery().reconcileOnce(),'UNKNOWN');await c.mut('cancelTrial',{trialId:c.trialId});
     await new Promise(resolve=>setTimeout(resolve,Math.max(0,c.b.expiresAt-Date.now()+10)));await db.restart();
     assert.equal(await makeRecovery().reconcileOnce(),'UNKNOWN');assert.equal(exposure(await c.query('getBudget',{missionId:c.s.missionId})),80);
     assert.equal(wire.admissions,0);assert.equal(c.factory.evidence.productiveExecutions,0);
    });journeys.push({mode,remainingExposure:80,admissions:wire.admissions,paidOperations:0});await cleanup();continue;
   }
   await assert.rejects(wire.call('ADMIT',f.request));
   const p=await c.factory.control.read(c.b.partnerRequestId),identity=c.factory.identity(p);
   await db.restart();c.factory=await createLocalFactory(f,pg.pool,c.authority);
   assert.equal(await makeRecovery().reconcileOnce(),'OBSERVED');assert.equal(c.factory.evidence.productiveExecutions,0);
   if(mode==='cancel-executing'){
    let entered;const barrier=new Promise(r=>{entered=r;}),execute=c.factory.provider.execute;
    c.factory.provider.execute=async(...args)=>{
     const command=c.factory.node(args[0],"require('node:fs').writeFileSync('/tmp/recovery-command-running','1');setTimeout(()=>process.stdout.write('fault-delay'),30000)");
     const completed=command.then(()=>null,error=>error);
     while(await c.factory.node(args[0],"process.stdout.write(String(require('node:fs').existsSync('/tmp/recovery-command-running')))" )!=='true')await new Promise(r=>setTimeout(r,20));
     entered();const error=await completed;if(error)throw error;return execute(...args);
    };
    await c.factory.control.dispatch(identity);const active=c.factory.execute(identity).catch(error=>error);await barrier;
    await c.mut('cancelTrial',{trialId:c.trialId});await wire.call('CANCEL',{requestId:c.b.partnerRequestId});await active;
   }else{await c.factory.control.dispatch(identity);await c.factory.execute(identity);}
   const executed=c.factory.evidence;
   const record=await c.factory.store.read('missioncontrol-local',c.b.partnerRequestId);
   if(record.resource)await assert.rejects(c.factory.store.noteResource(record.run_id,record.resource.lease_owner,record.resource.lease_generation+1,{failure:'STALE_WRITER'}));
   if(mode==='expired')await new Promise(resolve=>setTimeout(resolve,Math.max(0,c.b.expiresAt-Date.now()+10)));
   if(mode==='stale-writer')await c.fault(c.s.workOrderId,{currentRevisionNumber:2});
   c.factory=await createLocalFactory(f,pg.pool,c.authority);await db.restart();
   if(mode==='candidate-mismatch'){
    assert.equal(await makeRecovery().reconcileOnce(),'UNKNOWN');assert.equal(exposure(await c.query('getBudget',{missionId:c.s.missionId})),80);
    wire.setCorruptResult(false);
   }
   const observations=[];
   const duplicate=mode==='candidate-mismatch'?makeRecovery().run({signal:AbortSignal.timeout(15000),intervalMs:100}):null;
   const result=await makeRecovery().run({signal:AbortSignal.timeout(15000),intervalMs:100,onObservation:s=>observations.push(s)});
   await check('autonomous '+mode+' readback closes exactly once without redispatch',async()=>{
    assert.equal(result,'CLOSED',JSON.stringify(observations));const trial=await c.query('readTrial',{trialId:c.trialId});
    assert.equal(trial.closed,true);assert.equal(exposure(await c.query('getBudget',{missionId:c.s.missionId})),0);
    assert.equal(wire.admissions,1);assert.equal(c.factory.evidence.productiveExecutions,0);
    assert.equal(executed.productiveExecutions,mode==='cancel-executing'?0:1);
    for(const value of await Promise.all([makeRecovery().reconcileOnce(),makeRecovery().reconcileOnce()]))assert.equal(value,'CLOSED');
    if(duplicate){assert.equal(await duplicate,'CLOSED');assert.ok(ingestions>=1&&ingestions<=2);}
    else assert.equal(ingestions,mode==='restart-lost-ack'||mode==='verifier-failure'?1:0);
    if(mode==='restart-lost-ack'){assert.equal(lostAck,false);assert.ok(observations.includes('UNKNOWN'));assert.ok(wire.resultDrops>0);}
    if(mode==='verifier-failure'){const gate=await c.inspect(trial.qualityGateDecisionId);assert.equal(gate.state,'INELIGIBLE');}
    if(['expired','stale-writer','cancel-executing'].includes(mode))assert.equal(trial.qualityGateDecisionId,undefined);
    journeys.push({mode,observations,admissions:wire.admissions,ingestions,executions:executed.productiveExecutions,restartedExecutions:c.factory.evidence.productiveExecutions,paidOperations:0});
   });await cleanup();
  }
 }
 for(const mode of (process.env.MC_GATE_ONLY==='1'?[]:['cancel','failed','late-completed','expired',...(canonicalAccounting?['no-tariff']:[])])){
  const c=await setup(mode==='expired'?{expiresIn:30000}:mode==='no-tariff'?{withoutTariff:true}:{});await c.mut('claimTrial',{trialId:c.trialId});const p=await c.factory.control.prepare(f.request),i=c.factory.identity(p);await observe(c,p);
  if(mode==='cancel'){await c.mut('cancelTrial',{trialId:c.trialId});await c.factory.store.stop('missioncontrol-local',i);await c.factory.reconcile();}
  else{await c.factory.control.dispatch(i);if(mode==='failed')c.factory.provider.materialize=async()=>{throw Error('DETERMINISTIC_STARTUP_FAILURE');};await c.factory.execute(i);}
  const r=await c.factory.control.result(f.request.requestId);await observe(c,p,r.state);
  const terminal=verifyLocalTerminalResult(r.result,c.b,partner,{workOrderId:p.workOrderId,runId:p.runId,keys:[f.signing.key],now:Date.now(),...(c.tariff?{tariff:c.tariff,admittedAt:c.admittedAt}:{})});delete terminal.manifest;
  if(mode==='expired')await new Promise(resolve=>setTimeout(resolve,Math.max(0,c.b.expiresAt-Date.now()+50)));
  else await c.mut('assess',{factoryDefinitionId:c.s.factoryDefinitionId,expectedRevision:2,health:'UNKNOWN',evidenceDigest:hash,validUntil:c.b.deadline,revoke:true});
  if(mode==='late-completed'){await c.mut('cancelTrial',{trialId:c.trialId});await c.fault(c.s.workOrderId,{currentRevisionNumber:2});}
  await check(mode+' terminal proof reconciles after fencing without granting execution',async()=>{
   if(mode==='no-tariff'){
    await assert.rejects(c.mut('reconcileTerminalExecution',{trialId:c.trialId,...terminal}));
    const plan=await c.inspect(c.s.missionPlanId),lateTariff=bindEngineeringTariff(c.b,Date.now()).tariff;
    await c.fault(c.s.missionPlanId,{metadata:{...plan.metadata,enterpriseDelegationApproval:{...plan.metadata.enterpriseDelegationApproval,tariff:lateTariff}}});
    await assert.rejects(c.mut('reconcileTerminalExecution',{trialId:c.trialId,...terminal,tariffDigest:lateTariff.digest}));
    assert.equal(exposure(await c.query('getBudget',{missionId:c.s.missionId})),80);
    assert.equal((await c.inspect(c.s.workflowRunId)).enterpriseSettlement,undefined);return;
   }
   await assert.rejects(c.authority());await c.mut('reconcileTerminalExecution',{trialId:c.trialId,...terminal});await c.mut('reconcileTerminalExecution',{trialId:c.trialId,...terminal});
   assert.equal(exposure(await c.query('getBudget',{missionId:c.s.missionId})),0);assert.equal((await c.query('readTrial',{trialId:c.trialId})).qualityGateDecisionId,undefined);
   assert.equal(await c.mut('claimTrial',{trialId:c.trialId}),false);
  });journeys.push({mode,state:r.state,resultDigest:r.result.manifestDigest,settlement:(await c.inspect(c.s.workflowRunId)).enterpriseSettlement??null,remainingExposure:exposure(await c.query('getBudget',{missionId:c.s.missionId})),paidOperations:0});await cleanup();
 }
 const summary={canonicalAccounting,myFactorySourceSha:sourceSha,checks,journeys,paidOperations:0,productionIntegration:'NOT_RUN',executableProductionGrants:0,externalAlphaChanges:0};
 if(process.env.MC_LOCAL_PROVIDER_EVIDENCE)await writeFile(process.env.MC_LOCAL_PROVIDER_EVIDENCE,JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify(summary));
}finally{await cleanup();}
