import { execFileSync } from 'node:child_process';
import { readFile, writeFile, copyFile, symlink } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const [sourceArg, targetArg] = process.argv.slice(2), source = resolve(sourceArg), target = resolve(targetArg);
const sha = '9f1c83b0989abaedc168b740ddcf57582cf15a92';
assert.equal(execFileSync('git',['-C',source,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),sha);
execFileSync('git',['clone','--no-hardlinks','--no-checkout',source,target],{stdio:'pipe'});
execFileSync('git',['-C',target,'checkout','--detach',sha],{stdio:'pipe'});
await symlink(join(source,'node_modules'),join(target,'node_modules'));
await symlink(join(source,'apps/eve/node_modules'),join(target,'apps/eve/node_modules'));
const paths = ['apps/eve/agent/agent.ts','apps/eve/test/missioncontrol-result.integration.mjs','apps/eve/test/browser/local-transport.cjs'];
await copyFile('scripts/enterprise-golden-journey/sofie-browser-model.fixture.ts',join(target,paths[0]));
let fixture = await readFile(join(target,paths[1]),'utf8');
assert.ok(fixture.includes("await fault(missionId,{owner:s.peerId},['ownerMemberId']);"));
fixture=fixture.replace("    const beforeRuns=","    await db.anonymous.action('sofieEnterprise:command',signedCommand(config,input));\n    const beforeRuns=");
fixture=fixture.replace("await fault(missionId,{owner:s.peerId},['ownerMemberId']);","await fault(missionId,{ownerOperatorId:s.peerId});")
  .replace('await fault(missionId,{owner:mission.owner,ownerMemberId:mission.ownerMemberId});','await fault(missionId,{ownerOperatorId:mission.ownerOperatorId});')
  .replace("    result.completed=completed;", "    result.completed=completed;\n    let sameContext;\n    try {")
  .replace("    await mutate('sofieEnterprise:decide',{projectId:s.projectId,connectionId:connection.connectionId,decision:'REVOKE'});",`    } finally {
    if(process.env.MC_COMPOSED_BROWSER_MODULE) {
      const browser=await import(process.env.MC_COMPOSED_BROWSER_MODULE);
      result.browser=await browser.qualifySofieBrowser({source:fileURLToPath(new URL('../../../',import.meta.url)),pool,input,owner,db});
    }
    }
    await mutate('sofieEnterprise:decide',{projectId:s.projectId,connectionId:connection.connectionId,decision:'REVOKE'});`);
fixture=fixture.replace('const sameContext=context();','sameContext=context();');
fixture=fixture.replace('const call=(ctx=context())=>executeEnterpriseTool(input,ctx);', `const call=async(ctx=context())=>{try{return await executeEnterpriseTool(input,ctx);}catch(error){try{await db.anonymous.action('sofieEnterprise:command',signedCommand(config,input));}catch(canonical){console.error('Canonical Result diagnostic:',String(canonical));}throw error;}};`);
await writeFile(join(target,paths[1]),fixture);
let transport=await readFile(join(target,paths[2]),'utf8');
transport=transport.replace("configured.pathname !== '/blocker_fixes'","configured.pathname !== '/postgres'");
await writeFile(join(target,paths[2]),transport);
const overlays={};for(const path of paths)overlays[path]=createHash('sha256').update(await readFile(join(target,path))).digest('hex');
await writeFile(join(target,'COMPOSED_FIXTURE_OVERLAY.json'),JSON.stringify({sourceSha:sha,overlays,boundaries:['Deterministic model only; actual browser authentication, Eve session, tool and ActionGateway.','Dependency fault injection updated to frozen ownerOperatorId.','Local PostgreSQL transport; external network denied.'],paidOperations:0},null,2)+'\n');
console.log(JSON.stringify({sourceSha:sha,target,overlays}));
