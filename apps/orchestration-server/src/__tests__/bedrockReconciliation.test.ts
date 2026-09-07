import { describe,it,expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { bedrockModelRouteBinding } from '../bedrockModelRouteBinding.js';
import { bedrockRouteSchema } from '../bedrockRoute.js';
import { exactModelRouteDigest,exactModelRouteIssues,exactModelRouteQualificationSnapshot,modelRouteQualificationDigest } from '../../../../convex/lib/modelRouteAdmission.js';
import { executionProfileSnapshot } from '../../../../convex/lib/executionProfile.js';
import { factoryConfigurationDigest } from '../../../../convex/lib/factoryConfiguration.js';
import { summarizeWorkOrderReadiness } from '../../../../convex/lib/workOrderReadiness.js';
import { CODEX_V1_HARNESS_MANIFEST,harnessSupportsModel,harnessCapabilityManifestDigest,harnessRuntimeArtifactDigest,createGitVerificationSubject,verifyVerificationSubjectIdentity } from '@mission-control/workflow-engine';
import { DOCKER_CANDIDATE_IDENTITY } from '../dockerSandboxProvider.js';
import { canonicalHash } from '@mission-control/shared';
const raw=JSON.parse(readFileSync(new URL('../../../../docs/software-factory/fdlc-bedrock-qualification-inputs.json',import.meta.url),'utf8'));
const route=bedrockRouteSchema.parse({...raw,awsAccountId:'000000000000',projectEnvironmentId:'OFFLINE-FIXTURE',roleArn:'arn:aws:iam::000000000000:role/fixture',inferenceProfileArn:'arn:aws:bedrock:us-east-1:000000000000:inference-profile/us.anthropic.claude-sonnet-4-6'});
const sha=(c:string)=>`sha256:${c.repeat(64)}`;
describe('OFFLINE current-main composition',()=>{
 it('uses canonical V2 route identity without a second router',()=>{const b=bedrockModelRouteBinding(route);expect(exactModelRouteIssues(b.snapshot)).toEqual([]);expect(b.routeDigest).toBe(exactModelRouteDigest(b.snapshot));expect(b.snapshot).not.toHaveProperty('runtimeIdentity');expect(b.authority).toBe('NONE');});
 it.each(['role','project','account'] as const)('binds %s into canonical route identity',field=>{
  const changed={...route};if(field==='role')changed.roleArn='arn:aws:iam::000000000000:role/other';if(field==='project')changed.projectEnvironmentId='other';if(field==='account'){changed.awsAccountId='111111111111';changed.roleArn='arn:aws:iam::111111111111:role/fixture';changed.inferenceProfileArn='arn:aws:bedrock:us-east-1:111111111111:inference-profile/us.anthropic.claude-sonnet-4-6';}
  expect(bedrockModelRouteBinding(changed).routeDigest).not.toBe(bedrockModelRouteBinding(route).routeDigest);
 });
 it('keeps explicit global-profile denial after canonical binding',()=>expect(()=>bedrockModelRouteBinding({...route,inferenceProfileId:'global.anthropic.claude-sonnet-4-6' as any})).toThrow());
 it('cannot interpret complete account configuration as harness support',()=>expect(harnessSupportsModel(CODEX_V1_HARNESS_MANIFEST,'aws-bedrock',route.modelId)).toBe(false));
 it('preserves the exact Execution Profile rejection rather than relabeling Bedrock',()=>{
  const b=bedrockModelRouteBinding(route),manifest=CODEX_V1_HARNESS_MANIFEST;
  const imageDigest=DOCKER_CANDIDATE_IDENTITY.image.split('@')[1];
  const runtime={schemaVersion:'harness-runtime-artifact/v1' as const,kind:'CONTAINER_IMAGE' as const,name:'codex-cli-sandbox',version:'0.146.0',executableSha256:null,imageDigest};
  const runtimeDigest=harnessRuntimeArtifactDigest(runtime),manifestDigest=harnessCapabilityManifestDigest(manifest);
  const qualification=exactModelRouteQualificationSnapshot({routeDigest:b.routeDigest,evidenceReference:'OFFLINE-FIXTURE',evidenceDigest:sha('a'),workloadClasses:['SOFTWARE_CHANGE'],riskClasses:['GREEN'],promotedBy:'fixture',promotedAt:100,compatibility:{adapter:'codex',version:'v1',capabilityManifestDigest:manifestDigest,effectiveConfigSha256:manifest.effectiveConfigSha256,runtimeArtifactDigest:runtimeDigest,executionBackend:'remote-sandbox'}});
  const sandbox={schema:'factory-sandbox-profile/v1',profileKey:'docker-fixture',version:1,provider:'DOCKER',machine:{image:DOCKER_CANDIDATE_IDENTITY.image},security:{image:{digest:imageDigest}},qualification:{supportedWorkloadClasses:['SOFTWARE_CHANGE'],supportedRiskClasses:['GREEN']}};
  expect(()=>executionProfileSnapshot({profileKey:'bedrock-fixture',version:1,harness:{adapter:'codex',version:'v1',capabilityManifest:manifest,capabilityManifestDigest:manifestDigest,effectiveConfigSha256:manifest.effectiveConfigSha256},runtimeArtifact:{snapshot:runtime,digest:runtimeDigest},executionBackend:'remote-sandbox',modelRoute:{catalogId:'fixture',routeSnapshot:b.snapshot,routeDigest:b.routeDigest,qualificationSnapshot:qualification,qualificationDigest:modelRouteQualificationDigest(qualification)},sandboxProfile:{profileId:'fixture',profileSnapshot:sandbox,profileDigest:`sha256:${canonicalHash({namespace:'factory-sandbox-profile/v1',value:sandbox})}`},isolationModes:['WORKSPACE_WRITE']})).toThrow('model-route-unsupported');
 });
 it.each(['aws-identity','route','price','reservation','execution-profile','independent-verifier','factory-qualification'])('read-only readiness can represent %s without issuing authority',code=>{
  expect(summarizeWorkOrderReadiness([{code,label:code,status:'BLOCKED',boundary:'ADMISSION',reason:'Qualification missing'}])).toMatchObject({authoritative:false,admissionEligible:false,executionReady:false,status:'BLOCKED'});
 });
 it('preserves current-main LOCAL_GIT exact verification identities',()=>{
  const subject=createGitVerificationSubject({version:1,kind:'GIT_CANDIDATE',workOrderId:'fixture',workOrderRevisionNumber:1,verificationContractDigest:sha('a'),sourceAttemptId:'fixture-producing-attempt',repositoryId:'fixture',provider:'LOCAL_GIT',candidateSha:'a'.repeat(40),treeSha:'b'.repeat(40),localRef:{baseRef:'main',headRef:'fixture',headSha:'a'.repeat(40)}});
  expect(verifyVerificationSubjectIdentity(subject)).toBe(true);expect(verifyVerificationSubjectIdentity({...subject,candidateSha:'c'.repeat(40)})).toBe(false);
 });
 it('freezes route and profile identity using the existing Factory digest',()=>{
  const config:any={purpose:'SOFTWARE',repositoryId:'fixture',workflowId:'fixture',executor:{adapter:'codex',version:'v1'},modelRouteDigest:bedrockModelRouteBinding(route).routeDigest,executionProfileDigest:sha('b'),codeScopeIds:[],agentBindings:[],verifierIds:[]};
  expect(factoryConfigurationDigest({...config,executionProfileDigest:sha('c')})).not.toBe(factoryConfigurationDigest(config));
  expect(factoryConfigurationDigest({...config,modelRouteDigest:sha('c')})).not.toBe(factoryConfigurationDigest(config));
 });
});
