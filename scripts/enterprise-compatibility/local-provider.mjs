import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomUUID,randomBytes} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {canonicalDigest,factoryDelegationBindingDigest,fixtureExposure,bindEngineeringTariff} from '@mission-control/shared';
import {compileApprovedPlanQualityContract} from '../../convex/lib/qualityContract.ts';
import {startFixtureDatabase} from './database.mjs';
import {compatibility} from './fixtures.mjs';
import {verifyLocalDelegationResult,verifyLocalTerminalResult,LOCAL_PROVIDER_QUALIFICATION_SHA} from '../../apps/orchestration-server/src/myFactoryLocalCompatibility.ts';
import {signFixtureEnvelope,verifyFixtureEnvelope,COMPATIBILITY_PROTOCOL} from '../../apps/orchestration-server/src/myFactoryCompatibilityAdapter.ts';
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
async function setup({expiresIn,withoutTariff=false}={}){
 db=await startFixtureDatabase(repo,{canonicalAccounting});f=await localFixture(root);await qualifyHost(f);pg=await startPostgres(root);
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
 changeBudget:{maxFilesChanged:1,maxLinesChanged:100,allowedPaths:request.input.allowedPaths,deniedPaths:[],allowedCommandClasses:['TEST'],prohibitedCommandClasses:['PRODUCTION_ACCESS','SECRETS_ACCESS','PUBLISH'],allowDependencyChanges:false,allowSchemaChanges:false,allowMigrations:false,allowInfrastructureChanges:false},
 verificationContract:{schemaVersion:1,enforcementMode:'OBSERVE_ONLY',requireHumanReview:true,checks:checkIds.map(id=>({id,name:id,category:'UNIT_TEST',verifierId:'delegated-local',mandatory:true,acceptanceCriterionIds:['delegated-behavior'],evidenceCategory:'TEST_RESULT'}))}};
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
async function transport(c){
 const key={id:'local-request',secret:randomBytes(32),tenantId:c.b.tenantId,projectId:c.b.projectId,factoryId:c.b.factoryId,validUntil:Date.now()+3600000,revoked:false};
 const responseKey={...key,id:'local-response',secret:randomBytes(32)};let drop=true,admissions=0;
 server=createServer(async(req,res)=>{try{
  const chunks=[];let size=0;for await(const x of req){size+=x.length;if(size>2000000)throw Error('BOUND');chunks.push(x);}
  const signed=JSON.parse(Buffer.concat(chunks)),operation=signed.envelope.operation;
  const e=verifyFixtureEnvelope(signed,key,'REQUEST',{bindingDigest:c.bindingDigest,operation,requestDigest:null},Date.now());let payload;
  if(operation==='ADMIT'){if(partner.digest(e.payload)!==c.b.partnerRequestDigest)throw Error('EXACT_REQUEST');await c.authority();payload=await c.factory.control.prepare(e.payload);admissions++;if(drop){drop=false;req.socket.destroy();return;}}
  else if(operation==='STATUS')payload=await c.factory.control.read(c.b.partnerRequestId);
  else if(operation==='RESULT')payload=await c.factory.control.result(c.b.partnerRequestId);
  else throw Error('OPERATION');
  const reply=signFixtureEnvelope({...e,keyId:responseKey.id,payload,requestDigest:canonicalDigest('factory-fixture-request/v1',signed)},responseKey,'RESPONSE');res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(reply));
 }catch{res.writeHead(403);res.end('{}');}});server.listen(0,'127.0.0.1');await once(server,'listening');
 const call=async(operation,payload)=>{const envelope={protocol:COMPATIBILITY_PROTOCOL,keyId:key.id,tenantId:key.tenantId,projectId:key.projectId,factoryId:key.factoryId,bindingDigest:c.bindingDigest,operation,nonce:randomUUID(),expiresAt:Date.now()+30000,payload,requestDigest:null};
  const signed=signFixtureEnvelope(envelope,key,'REQUEST');const response=await fetch('http://127.0.0.1:'+server.address().port,{method:'POST',body:JSON.stringify(signed),redirect:'error',signal:AbortSignal.timeout(10000)});assert.equal(response.status,200);
  return verifyFixtureEnvelope(await response.json(),responseKey,'RESPONSE',{bindingDigest:c.bindingDigest,operation,requestDigest:canonicalDigest('factory-fixture-request/v1',signed)},Date.now()).payload;};
 return{call,get admissions(){return admissions;}};
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
 await check('wrong candidate, wrong provider and stale result writer denied',async()=>{
  const swapped=structuredClone(r.result);swapped.artifacts[0].base64=Buffer.from('wrong').toString('base64');assert.throws(()=>verifyLocalDelegationResult(swapped,c.b,partner,expected));
  assert.throws(()=>verifyLocalDelegationResult(r.result,{...c.b,factoryVersion:'f'.repeat(64)},partner,expected));
  const wo=await c.inspect(c.s.workOrderId);await c.fault(c.s.workOrderId,{currentRevisionNumber:2});await assert.rejects(c.mut('ingestExecutionResult',{trialId:c.trialId,...projection}));await c.fault(c.s.workOrderId,{currentRevisionNumber:wo.currentRevisionNumber});
 });
 await check('real execution evidence enters enterprise shadow gate and settles once',async()=>{
  if(canonicalAccounting){
   await assert.rejects(c.mut('ingestExecutionResult',{trialId:c.trialId,...projection,tariffDigest:hash}));
   const {tariffDigest,...missingTariff}=projection;await assert.rejects(c.mut('ingestExecutionResult',{trialId:c.trialId,...missingTariff}));
   assert.equal(exposure(await c.query('getBudget',{missionId:c.s.missionId})),100);
  }

  const gateIds=await Promise.all(Array.from({length:4},()=>c.mut('ingestExecutionResult',{trialId:c.trialId,...projection})));assert.equal(new Set(gateIds).size,1);
  const gate=await c.inspect(gateIds[0]);assert.equal(gate.state,'AWAITING_HUMAN');assert.equal(gate.metadata.authoritativeAcceptance,false);
  for(const id of ['factory-verification-authority','factory-change-budget','factory-negative-constraints'])assert.equal(gate.metadata.checks.find(c=>c.checkId===id)?.status,'PASS');
  assert.equal(exposure(await c.query('getBudget',{missionId:c.s.missionId})),20);
  await assert.rejects(c.mut('ingestExecutionResult',{trialId:c.trialId,...projection,resultDigest:hash}));
  const settlement=(await c.inspect(c.s.workflowRunId)).enterpriseSettlement;
  if(canonicalAccounting){assert.equal(settlement.basis,'DETERMINISTIC_ENGINEERING_ZERO_CHARGE');assert.equal(settlement.resourceCost,'UNMEASURED');assert.equal(settlement.tariffDigest,c.tariff.digest);}
  journeys.push({state:r.state,resultDigest:r.result.manifestDigest,factoryVersion:f.version(),sourceDigest:f.sourceDigest,hostQualification:f.hostQualification,gateState:gate.state,execution:c.factory.evidence,...(settlement?{settlement}:{}),paidOperations:0});
 });
 await cleanup();
 for(const mode of ['cancel','failed','late-completed','expired',...(canonicalAccounting?['no-tariff']:[])]){
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
