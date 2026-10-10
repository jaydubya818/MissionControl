import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, copyFile, open } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { lock, sourceIdentity, seal } from './evidence.mjs';

const output=resolve(process.argv[2]);await mkdir(output);
const root=process.cwd(), source=await sourceIdentity();
const required=name=>{assert.ok(process.env[name],`Missing ${name}; no fallback permitted`);return resolve(process.env[name]);};
const myeve=required('MC_COMPOSED_MYEVE_ROOT'),factory=required('MC_LOCAL_MYFACTORY_ROOT');
const runtime=required('MC_GOLDEN_RUNTIME_BUILD'),docker=required('MC_GOLDEN_DOCKER');
required('MC_COMPATIBILITY_CONVEX_BINARY');required('MYFACTORY_FIXTURE_GIT');
for(const [path,sha] of [[myeve,lock.myEve],[factory,lock.myFactory]]) {
  assert.equal(execFileSync('git',['-C',path,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),sha);
  assert.equal(execFileSync('git',['-C',path,'status','--porcelain'],{encoding:'utf8'}).trim(),'');
}
const scratch=await mkdtemp(join(tmpdir(),'mc-composed-sofie-')),fixture=join(scratch,'source');
const report={schema:'factory-of-factories-composed/v1',source,missionControlDependency:lock.composedDependencies.missionControl,
  myEve:lock.myEve,myFactory:lock.myFactory,releaseGate:'ADVISORY',releaseEligible:false,paidOperations:0,productionIntegration:'NOT_RUN',externalAlphaChanges:0,publication:'DISABLED',status:'IN_PROGRESS'};
let code;
try {
  execFileSync(process.execPath,['scripts/enterprise-golden-journey/prepare-sofie-browser.mjs',myeve,fixture],{stdio:'pipe'});
  await copyFile(join(fixture,'COMPOSED_FIXTURE_OVERLAY.json'),join(output,'myeve-fixture-overlay.json'));
  const log=await open(join(output,'hybrid.log'),'wx');
  try {
    code=await new Promise((resolveCode,reject)=>{
      const child=spawn(process.execPath,['--import','tsx','scripts/qualification/native-successor-journey.mts',runtime,docker,join(output,'hybrid'),'hybrid'],{
        cwd:root,env:{...process.env,MC_SOFIE_RESULT_CONSUMER_ROOT:fixture,MC_COMPOSED_BROWSER_MODULE:join(root,'scripts/enterprise-golden-journey/sofie-browser.mjs'),MC_COMPOSED_BROWSER_OUTPUT:join(output,'browser')},stdio:['ignore',log.fd,log.fd]});
      child.once('error',reject);child.once('exit',(status,signal)=>resolveCode(signal?-1:status));
    });
  } finally {await log.close();}
  const journey=JSON.parse(await readFile(join(output,'hybrid/journey.json'),'utf8'));
  const consumer=journey.stages.completedEnterpriseResultConsumer;
  let browserEvidence=consumer?.browser;
  if(!browserEvidence)try{browserEvidence=JSON.parse(await readFile(join(output,'browser/report.json'),'utf8'));}catch{}
  report.execution={native:journey.nativeExecution??'NOT_RUN',hybrid:journey.hybridMission??'NOT_RUN',accounting:journey.nativeDelegatedAccounting??'NOT_RUN',completedResult:consumer?.status??'NOT_RUN',browser:browserEvidence??{status:'NOT_RUN'}};
  report.status=code!==0?'FAIL':'PARTIAL';
  report.blockers=['No browser control is wired to Sofie proposal authorization in the qualified frontends.','Mission creation and acceptance use synthetic authenticated database clients.','Proposal and Result browser steps do not form one end-to-end owner-created Mission.','Deterministic model, native documents and delegated slug utility do not qualify Recruiting UI or live model behavior.','Hosted private native runtime distribution and independent Claude review remain separate gates.'];
  if(journey.failure)report.failure=journey.failure;
} catch(error){report.status='FAIL';report.failure=String(error);}
finally {
  report.commandExitCode=code??null;report.fixtureSource=scratch;
  report.sourceUnchanged=(await sourceIdentity()).treeDigest===source.treeDigest;
  if(!report.sourceUnchanged)report.status='FAIL';
  await writeFile(join(output,'report.json'),JSON.stringify(report,null,2)+'\n');await seal(output);
  console.log(JSON.stringify({status:report.status,releaseGate:report.releaseGate,output}));
}
if(report.status==='FAIL')process.exitCode=1;
