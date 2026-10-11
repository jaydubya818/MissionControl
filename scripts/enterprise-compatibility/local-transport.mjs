import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {canonicalDigest} from '@mission-control/shared';
import {signFixtureEnvelope,verifyFixtureEnvelope,COMPATIBILITY_PROTOCOL} from '../../apps/orchestration-server/src/myFactoryCompatibilityAdapter.ts';
export async function createLocalCompatibilityTransport(c,{dropResult=false,corruptResult=false,canonicalAccounting=false,partner}={}){
 let server, lastError;
 const key={id:'local-request',secret:randomBytes(32),tenantId:c.b.tenantId,projectId:c.b.projectId,factoryId:c.b.factoryId,validUntil:Date.now()+3600000,revoked:false};
 const responseKey={...key,id:'local-response',secret:randomBytes(32)};let drop=true,admissions=0,resultDrops=0;
 server=createServer(async(req,res)=>{try{
  const chunks=[];let size=0;for await(const x of req){size+=x.length;if(size>2000000)throw Error('BOUND');chunks.push(x);}
  const signed=JSON.parse(Buffer.concat(chunks)),operation=signed.envelope.operation;
  const e=verifyFixtureEnvelope(signed,key,'REQUEST',{bindingDigest:c.bindingDigest,operation,requestDigest:null},Date.now());let payload;
  if(operation==='ADMIT'){if(partner.digest(e.payload)!==c.b.partnerRequestDigest)throw Error('EXACT_REQUEST');await c.authority();payload=await c.factory.control.prepare(e.payload);admissions++;if(drop){drop=false;req.socket.destroy();return;}}
  else if(operation==='STATUS')payload=await c.factory.control.read(c.b.partnerRequestId);
  else if(operation==='CANCEL'){
   const state=await c.factory.control.read(c.b.partnerRequestId);
   if(!['COMPLETED','FAILED','CANCELLED'].includes(state.state)){await c.factory.store.stop('missioncontrol-local',state.identity??c.factory.identity(state));await c.factory.reconcile();}
   payload=await c.factory.control.read(c.b.partnerRequestId);
  }
  else if(operation==='RESULT'){
   payload=await c.factory.control.result(c.b.partnerRequestId);
   if(canonicalAccounting&&payload.result&&JSON.parse(Buffer.from(payload.result.encoded,'base64url').toString()).candidate){
    const source=await c.factory.control.source(c.b.partnerRequestId),observedAt=Date.now();
    payload.observation={bindingDigest:c.bindingDigest,resultDigest:'sha256:'+payload.result.manifestDigest,
     candidateCommit:source.candidateCommit,candidateTree:source.candidateTree,observedAt,expiresAt:observedAt+60000};
   }
  }
  else throw Error('OPERATION');
  if(operation==='RESULT'&&corruptResult&&payload.result?.artifacts.length)payload.result.artifacts[0].base64=Buffer.from('substituted-candidate').toString('base64');
  if(operation==='RESULT'&&dropResult&&resultDrops++===0){req.socket.destroy();return;}
  const reply=signFixtureEnvelope({...e,keyId:responseKey.id,payload,requestDigest:canonicalDigest('factory-fixture-request/v1',signed)},responseKey,'RESPONSE');res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(reply));
 }catch(error){lastError=String(error);res.writeHead(403);res.end('{}');}});server.listen(0,'127.0.0.1');await once(server,'listening');
 const call=async(operation,payload)=>{const envelope={protocol:COMPATIBILITY_PROTOCOL,keyId:key.id,tenantId:key.tenantId,projectId:key.projectId,factoryId:key.factoryId,bindingDigest:c.bindingDigest,operation,nonce:randomUUID(),expiresAt:Date.now()+30000,payload,requestDigest:null};
  const signed=signFixtureEnvelope(envelope,key,'REQUEST');const response=await fetch('http://127.0.0.1:'+server.address().port,{method:'POST',body:JSON.stringify(signed),redirect:'error',signal:AbortSignal.timeout(10000)});assert.equal(response.status,200,lastError);
  const authenticatedResponse=await response.json();return {...verifyFixtureEnvelope(authenticatedResponse,responseKey,'RESPONSE',{bindingDigest:c.bindingDigest,operation,requestDigest:canonicalDigest('factory-fixture-request/v1',signed)},Date.now()).payload,authenticatedResponse};};
 return{server,call,setCorruptResult:value=>{corruptResult=value;},endpoint:'http://127.0.0.1:'+server.address().port+'/compatibility',requestKey:key,responseKey,get admissions(){return admissions;},get resultDrops(){return resultDrops;}};
}
