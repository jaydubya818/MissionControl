import {mkdtempSync, mkdirSync,writeFileSync,copyFileSync,symlinkSync,readFileSync} from 'node:fs';
import {spawn,spawnSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {createRequire} from 'node:module';
const repo=process.cwd(), require=createRequire(repo+'/package.json');
const {ConvexHttpClient}=require('convex/browser');
const dir=mkdtempSync('/tmp/fdlc-liability-occ-'); mkdirSync(dir+'/convex'); mkdirSync(dir+'/convex/lib');
symlinkSync(repo+'/node_modules',dir+'/node_modules');
writeFileSync(dir+'/package.json',JSON.stringify({type:'module',dependencies:{convex:'1.34.0'}}));writeFileSync(dir+'/convex.json','{}');
for(const file of ['providerLiability.ts','genomeHash.ts'])copyFileSync(repo+'/convex/lib/'+file,dir+'/convex/lib/'+file);
writeFileSync(dir+'/convex/schema.ts',`import {defineSchema,defineTable} from 'convex/server';import {v} from 'convex/values';export default defineSchema({budgets:defineTable({workOrder:v.string(),snapshot:v.any(),price:v.any()}).index('by_work_order',['workOrder'])});`);
writeFileSync(dir+'/convex/probe.ts',`import {mutationGeneric as mutation,queryGeneric as query} from 'convex/server';import {v} from 'convex/values';import {reserveProviderRequest} from './lib/providerLiability';
export const create=mutation({args:{snapshot:v.any(),price:v.any()},handler:async(ctx,args)=>{if(await ctx.db.query('budgets').withIndex('by_work_order',q=>q.eq('workOrder',args.snapshot.scope.workOrderId)).first())throw new Error('BUDGET_EXISTS');return await ctx.db.insert('budgets',{workOrder:args.snapshot.scope.workOrderId,...args});}});
export const reserve=mutation({args:{id:v.id('budgets'),authority:v.any(),requestId:v.string(),requestDigest:v.string(),payloadBytes:v.number(),outputTokens:v.number(),now:v.number()},handler:async(ctx,args)=>{const row=await ctx.db.get(args.id);const decision=reserveProviderRequest({...args,reservation:row.snapshot,price:row.price});await ctx.db.patch(args.id,{snapshot:decision.reservation});return decision.hold;}});
export const get=query({args:{id:v.id('budgets')},handler:async(ctx,args)=>await ctx.db.get(args.id)});`);
const bin='/Users/jaywest/.cache/convex/binaries/precompiled-2026-08-25-7cce8fb/convex-local-backend';
const secret=randomBytes(32).toString('hex'),name='fdlc-liability-occ';
const key=spawnSync(bin,['keygen','admin-key','--instance-name',name,'--instance-secret',secret],{encoding:'utf8'}).stdout.trim();
const backend=spawn(bin,['--interface','127.0.0.1','--port','3272','--site-proxy-port','3273','--instance-name',name,'--instance-secret',secret,'--disable-beacon','--local-storage',dir+'/storage',dir+'/db.sqlite3'],{stdio:'ignore'});
try{
 for(let i=0;i<100;i++){try{await fetch('http://127.0.0.1:3272/version');break;}catch{await new Promise(r=>setTimeout(r,100));}}
 const env={...process.env,CONVEX_SELF_HOSTED_URL:'http://127.0.0.1:3272',CONVEX_SELF_HOSTED_ADMIN_KEY:key,CONVEX_DEPLOY_KEY:key,CONVEX_TELEMETRY_DISABLED:'1'};delete env.CONVEX_DEPLOYMENT;delete env.CONVEX_DEPLOY_KEY; // secret-scan: allow-fixture — computed ephemeral local key, deleted before CLI use; no literal secret.
 const deploy=spawnSync(process.execPath,[repo+'/node_modules/convex/bin/main.js','deploy','--yes','--typecheck','disable','--url','http://127.0.0.1:3272','--admin-key',key],{cwd:dir,env,encoding:'utf8',timeout:60000});
 if(deploy.status!==0)throw new Error('Fixture deployment failed: '+deploy.stderr.replaceAll(key,'[fixture-key]'));
 const client=new ConvexHttpClient('http://127.0.0.1:3272');const {liabilityDigest}=await import(repo+'/convex/lib/providerLiability.ts');
 const sha='sha256:'+'a'.repeat(64),now=Date.now();
 const price={schema:'factory-provider-price/v1',provider:'fixture',model:'fixture',api:'RESPONSES',currency:'USD',effectiveAt:now-1000,expiresAt:now+60000,source:'https://example.test/fixture',evidenceDigest:sha,inputNanoUsdPerToken:1,outputNanoUsdPerToken:2,maximumInputTokens:10,maximumOutputTokens:10,maximumPayloadBytes:100,inputBound:'CONSERVATIVELY_BOUNDED',outputIncludesReasoning:true,inclusiveCacheWorstCase:true,otherBillableDimensions:'NONE'};
 const scope={projectId:'fixture',repositoryId:'fixture',workOrderId:'fixture',workOrderRevision:1,executionProfileId:'fixture',executionProfileDigest:sha,modelRouteDigest:sha,priceDigest:liabilityDigest(price)};
 const snapshot={schema:'factory-provider-reservation/v1',scope,maximumNanoUsd:30,expiresAt:now+60000,maximumRequests:2,frozen:false,holds:[]};
 const creates=await Promise.allSettled([client.mutation('probe:create',{snapshot,price}),client.mutation('probe:create',{snapshot,price})]);
 const id=creates.find(r=>r.status==='fulfilled')?.value;if(creates.filter(r=>r.status==='fulfilled').length!==1)throw new Error('Duplicate budget admitted');
 const authority={attemptId:'fixture',leaseId:'fixture',generation:1,leaseExpiresAt:now+60000,current:true,canceled:false,scope};
 const calls=await Promise.allSettled(['A','B'].map(requestId=>client.mutation('probe:reserve',{id,authority,requestId,requestDigest:sha,payloadBytes:10,outputTokens:10,now})));
 const row=await client.query('probe:get',{id});
 if(calls.filter(r=>r.status==='fulfilled').length!==1||row.snapshot.holds.length!==1)throw new Error('Oversubscription');
 const evidence={schema:'fdlc-provider-liability-occ/v1',fixtureOnly:true,providerCalls:0,backend:'precompiled-2026-08-25-7cce8fb',scope:'isolated disposable Convex backend; same pure reservation function and production index read/write pattern, not end-to-end admission',concurrentBudgetCreation:creates.map(r=>({status:r.status})),concurrentRequests:calls.map(r=>({status:r.status})),maximumNanoUsd:30,holds:row.snapshot.holds};
 writeFileSync(repo+'/docs/testing/evidence/fdlc-phase1-docker-execution-path/closure-2026-09-05/liability-occ.json',JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify(evidence));
}finally{backend.kill('SIGTERM');}
