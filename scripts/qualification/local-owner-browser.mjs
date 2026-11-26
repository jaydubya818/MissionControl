import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createRequire} from 'node:module';
const execute=promisify(execFile);
/** Owned, loopback-only frontend. No mocked Convex functions or responses. */
export async function startLocalOwnerBrowser(db,output){
 await mkdir(output,{recursive:true});
 const root=process.cwd(),require=createRequire(join(root,'apps/mission-control-ui/package.json'));
 const {createServer}=await import(require.resolve('vite'));
 const {default:react}=await import(require.resolve('@vitejs/plugin-react'));
 const {default:tailwind}=await import(require.resolve('@tailwindcss/vite'));
 const credentials=db.localBrowserCredentials();
 assert.match(credentials.url,/^http:\/\/127\.0\.0\.1:\d+$/);
 const session='mc-owner-'+randomUUID(),checks=[];
 const cli=async(...args)=>(await execute('agent-browser',['--session',session,...args],{timeout:45000,maxBuffer:1024*1024})).stdout;
 const server=await createServer({configFile:false,envFile:false,root:join(root,'apps/mission-control-ui/tests/local-owner'),
  plugins:[react(),tailwind(),{name:'disposable-owner-session',configureServer(server){server.middlewares.use('/__local_owner_session',(req,res)=>{res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');res.end(JSON.stringify(credentials));});}}],
  resolve:{alias:{'@':resolve(root,'apps/mission-control-ui/src')}},
  define:{'import.meta.env.VITE_FLAG_MISSIONS_PLAN_RELEASE_V1':'"true"'},
  server:{host:'127.0.0.1',port:5188,strictPort:true,fs:{allow:[root]}}});
 const base='http://127.0.0.1:5188';
 const wait=async(test)=>{let text;for(let n=0;n<120;n++){text=await cli('get','text','body');if(test(text))return text;await new Promise(r=>setTimeout(r,250));}await writeFile(join(output,'failure.txt'),text);await writeFile(join(output,'browser-errors.txt'),await cli('errors'));await cli('screenshot',join(output,'failure.png'),'--full');throw Error('Owner UI did not reach expected state');};
 const click=async name=>cli('find','role','button','click','--name',name,'--exact');
 const shot=async name=>{await writeFile(join(output,name+'.txt'),await cli('snapshot','-c'));await cli('screenshot',join(output,name+'.png'),'--full');};
 const open=async path=>cli('open',base+path);
 const reviewPath=binding=>'/v2/missions?workspace='+encodeURIComponent(binding.projectId)+'&proposal='+encodeURIComponent(binding.proposalId)+'&proposalDigest='+encodeURIComponent(binding.expectedDigest);
 try{await server.listen();await open('/v2/dashboard');await wait(t=>t.includes('Start with a Mission'));await click('Open Missions');await wait(t=>t.includes('Sofie owner decisions'));checks.push('actual-dashboard-and-owner-navigation');}
 catch(error){await cli('close').catch(()=>{});await server.close();throw error;}
 return {
  async authorize(binding,handoff){
    if(handoff){const url=new URL(handoff);assert.equal(url.origin,'http://localhost:5188');assert.equal(url.pathname,'/v2/missions');assert.equal(url.searchParams.get('proposal'),binding.proposalId);assert.equal(url.searchParams.get('proposalDigest'),binding.expectedDigest);assert.equal(url.searchParams.get('workspace'),binding.projectId);await cli('open',url.href);}
    else await open(reviewPath(binding));
    await wait(t=>t.includes('Authorize Mission creation'));await click('Authorize Mission creation');await wait(t=>t.includes('Creation authorized.'));await shot('proposal-authorized');checks.push('proposal-authorized-in-owner-UI');},
  async approvePlan(missionId){await open('/v2/missions/'+missionId+'?workspace='+credentials.projectId);await wait(t=>t.includes('Overview')&&t.includes('Plan')&&t.includes('Execution'));await cli('find','role','tab','click','--name','Plan','--exact');await wait(t=>t.includes('Decision rationale'));await cli('find','label','Decision rationale','fill','Approve the exact disposable local Plan. No production or publication authority.');await click('Approve and release 3 WorkOrders');await wait(t=>t.includes('Plan approved. WorkOrders were released'));await shot('plan-approved');checks.push('exact-Plan-approved-in-owner-UI');},
  async authorizeRead(binding){await open(reviewPath(binding));await wait(t=>t.includes('Accept enterprise Result'));await click('Allow Sofie to read this Result');await wait(t=>t.includes('Sofie may read this exact Mission and Plan.'));checks.push('current-Result-read-authorized-in-owner-UI');},
  async accept(){await wait(t=>t.includes('Accept enterprise Result'));await click('Accept enterprise Result');await wait(t=>t.includes('Result accepted.'));await shot('result-accepted');checks.push('current-Result-accepted-in-owner-UI');},
  report(){return {status:checks.length===5?'PASS':'INCOMPLETE',authentication:'LOCAL_SYNTHETIC_ADMIN_IMPERSONATION',transport:'REAL_LOOPBACK_CONVEX',frontend:'PRODUCTION_COMPONENTS_ON_TEST_VITE_ENTRY',checks,hostedClerk:'NOT_RUN'};},
  async stop(){try{await cli('close');}finally{await server.close();await writeFile(join(output,'report.json'),JSON.stringify(this.report(),null,2)+'\n');}}
 };
}
