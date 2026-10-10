import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, writeFile, readFile, open } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { chromium } from '@playwright/test';

/** The browser uses the actual login form; no synthetic cookie or ToolContext is supplied. */
export async function qualifySofieBrowser({source,pool,input,owner,db}) {
  const output=resolve(process.env.MC_COMPOSED_BROWSER_OUTPUT), app=join(source,'apps/eve');
  await mkdir(output,{recursive:true});
  const inputPath=join(output,'tool-input.json');await writeFile(inputPath,JSON.stringify(input));
  const require=createRequire(join(source,'package.json'));
  const password=randomBytes(24).toString('hex'), port=3077;
  const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>/^(PATH|HOME|TMPDIR|NODE_PATH|EVE_ENABLED_FEATURES|MYEVE_MISSIONCONTROL_.*)$/.test(key)));
  Object.assign(env,{MYEVE_TEST_DATABASE_URL:'postgresql://postgres@localhost:55529/postgres',DATABASE_URL:'postgresql://postgres@localhost:55529/postgres',
    MYEVE_OWNER_ID:owner,OWNER_NAME:'Qualification Owner',NEXT_PUBLIC_OWNER_NAME:'Qualification Owner',NEXT_PUBLIC_AGENT_NAME:'Sofie',
    MYEVE_ENGINEERING_MODE:'dogfood',MYEVE_ACCESS_PASSWORD:password,MYEVE_SESSION_SECRET:randomBytes(32).toString('hex'),
    MC_COMPOSED_BROWSER_INPUT:inputPath,NODE_OPTIONS:'--require='+join(app,'test/browser/local-transport.cjs'),
    NEXT_TELEMETRY_DISABLED:'1',DO_NOT_TRACK:'1'});
  const log=await open(join(output,'server.log'),'wx');
  const server=spawn(process.execPath,[require.resolve('next/dist/bin/next'),'dev','--webpack','--hostname','127.0.0.1','--port',String(port)],{cwd:app,env,stdio:['ignore',log.fd,log.fd]});
  const report={schema:'composed-sofie-browser/v1',status:'IN_PROGRESS',checks:[],model:'DETERMINISTIC_FIXTURE',ownerAuthorizationUI:'NOT_IMPLEMENTED',paidOperations:0};
  let browser, page;
  const check=async(name,fn)=>{await fn();report.checks.push(name);console.log('PASS browser '+name);};
  try {
    let ready=false;const deadline=Date.now()+120000;while(Date.now()<deadline){if(server.exitCode!==null)break;try{if((await fetch(`http://localhost:${port}/login`,{signal:AbortSignal.timeout(5000)})).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,500));}assert.ok(ready,'MyEve browser server ready');
    browser=await chromium.launch({headless:true});
    const context=await browser.newContext({viewport:{width:1280,height:900}});page=await context.newPage();
    const posts=[];page.on('request',r=>{if(r.method()==='POST'&&new URL(r.url()).pathname.startsWith('/eve/v1/session'))posts.push(new URL(r.url()).pathname);});
    await check('anonymous-owner-route-denied',async()=>{const response=await context.request.get(`http://localhost:${port}/api/threads`);assert.equal(response.status(),401);});
    await page.goto(`http://localhost:${port}/login?returnTo=/chat`);
    await page.getByLabel('Your access password').fill(password);
    const loginResponse=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/auth/login' && r.request().method()==='POST',{timeout:60000});
    await page.getByRole('button',{name:'Open Sofie',exact:true}).click();
    const login=await loginResponse;assert.equal(login.status(),200,'Owner login response must succeed');
    await page.waitForURL(url=>url.pathname==='/chat',{timeout:60000});
    await check('actual-password-login-issued-httpOnly-session',async()=>{assert.ok((await context.cookies()).some(c=>c.name==='myeve_session'&&c.httpOnly));});
    await page.getByRole('button',{name:'New thread',exact:true}).click();
    const send=async(text)=>{await page.getByRole('textbox',{name:'Message Sofie',exact:true}).fill(text);await page.getByRole('button',{name:'Send',exact:true}).click();};
    await send('Read the completed enterprise Result and its Proof for this Mission.');
    await check('authenticated-Eve-session-invokes-real-enterprise-tool',async()=>{
      await page.getByText('Deterministic Sofie readback from the actual tool:',{exact:false}).first().waitFor({timeout:120000});
      const text=await page.locator('body').innerText();assert.ok(text.includes(input.missionId));assert.ok(text.includes('enterprise-result-projection/v1'),text.slice(-3000));
      report.completedResultVisible=text.includes('Quality Gate is PASS');
      report.browserEvidenceState=report.completedResultVisible?'AVAILABLE':'NOT_AVAILABLE';
    });
    await page.screenshot({path:join(output,'result-desktop.png'),fullPage:true});
    await page.reload();
    await check('durable-same-conversation-reload',async()=>{await page.getByText('Deterministic Sofie readback from the actual tool:',{exact:false}).first().waitFor({timeout:45000});});
    await send('Re-read current Result evidence after reconnect.');
    await check('same-conversation-fresh-result-observation',async()=>{
      await page.waitForFunction(()=>document.body.innerText.split('Deterministic Sofie readback from the actual tool:').length>=3,{},{timeout:120000});
      assert.equal(posts.filter(p=>p==='/eve/v1/session').length,1);assert.ok(posts.some(p=>/^\/eve\/v1\/session\/[^/]+$/.test(p)));
      const actions=await pool.query("SELECT count(*)::int AS count FROM action_requests WHERE owner_id=$1 AND trigger->>'kind'='owner_chat'",[owner]);
      report.ownerActions=actions.rows[0].count;
    });
    await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});
    report.accessibility=await page.evaluate(async()=>{const result=await window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}});return {violations:result.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.length})),passes:result.passes.length};});
    await page.setViewportSize({width:390,height:844});await page.screenshot({path:join(output,'result-mobile.png'),fullPage:true});
    await check('mobile-horizontal-reflow',async()=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)));
    report.status=report.accessibility.violations.length || !report.completedResultVisible?'PARTIAL':'PASS';report.sessionRequests=posts;
    report.fullJourney='NOT_RUN';report.remaining=['No owner proposal authorization UI','Mission creation and acceptance are exercised via authenticated database clients, not browser UI','Deterministic model is not live Sofie model qualification'];
  } catch(error){report.status='FAIL';report.error=String(error);if(page)await page.screenshot({path:join(output,'failure.png'),fullPage:true}).catch(()=>{});}
  finally{await browser?.close();server.kill('SIGTERM');if(server.exitCode===null && server.signalCode===null) await new Promise(r=>server.once('exit',r));await log.close();await writeFile(join(output,'report.json'),JSON.stringify(report,null,2)+'\n');}
  return report;
}
