// Bounded duplex bootstrap. No network egress, mounts, credentials or host paths.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createInterface} from 'node:readline';
import http from 'node:http';
const exec=promisify(execFile),root='/var/lib/mission-control/attempt';
let deadline=Number(process.env.MC_DEADLINE_AT);
if(!Number.isSafeInteger(deadline)||deadline<=Date.now()||deadline>Date.now()+900000)throw new Error('Invalid deadline');
let timer=setTimeout(()=>process.exit(124),deadline-Date.now());
const remaining=()=>{const n=deadline-Date.now();if(n<=0)throw new Error('Deadline expired');return n};
let frameBytes=0;
process.stdin.on('data',chunk=>{for(const byte of chunk){if(byte===10)frameBytes=0;else if(++frameBytes>48*1024*1024)process.exit(125)}});
const lines=createInterface({input:process.stdin,crlfDelay:Infinity})[Symbol.asyncIterator]();
const first=await lines.next();if(first.done)throw new Error('Bootstrap required');
const {schema,config,repository,deadlineAt}=JSON.parse(first.value);
if(schema!=='factory-docker-duplex/v1'||Object.keys(config.environment).length||!Number.isSafeInteger(deadlineAt))throw new Error('Invalid bootstrap');
deadline=Math.min(deadline,deadlineAt);clearTimeout(timer);timer=setTimeout(()=>process.exit(124),remaining());
mkdirSync(root+'/home',{recursive:true});writeFileSync(root+'/repository.bundle',Buffer.from(repository,'base64'),{mode:0o600});
await exec('git',['clone','--quiet',root+'/repository.bundle',root+'/repository'],{timeout:remaining()});
await exec('git',['-C',root+'/repository','checkout','--quiet',config.sourceSha],{timeout:remaining()});
if(config.executor.outputSchemaPath!==root+'/factory-result.schema.json'||!config.executor.outputSchema)throw new Error('Bounded output schema required');
writeFileSync(config.executor.outputSchemaPath,JSON.stringify(config.executor.outputSchema),{mode:0o400});
writeFileSync(root+'/config.json',JSON.stringify(config),{mode:0o400});
let sequence=0,pending=null,failed=false,finished=false,requestActive=false;
const replyLoop=(async()=>{for await(const line of { [Symbol.asyncIterator]:()=>lines }){
  if(Buffer.byteLength(line)>4*1024*1024)throw new Error('Reply too large');
  const reply=JSON.parse(line);
  if(!pending||reply.type!=='reply'||reply.sequence!==pending.sequence||typeof reply.events!=='string')throw new Error('Unexpected reply');
  pending.resolve(reply);pending=null;
}throw new Error('Host disconnected')})().catch(()=>{if(finished)return;failed=true;pending?.reject(new Error('Host channel failed'));process.exit(125)});
const server=http.createServer(async(req,res)=>{
  if(failed||requestActive||req.method!=='POST'||req.url!=='/responses'||sequence>=100){res.writeHead(403).end();return}
  requestActive=true;const requestSequence=++sequence;
  let size=0;const chunks=[];
  try{
    for await(const chunk of req){size+=chunk.length;if(size>1024*1024)throw new Error('Request too large');chunks.push(chunk)}
    if(pending)throw new Error('Concurrent request');
    const body=JSON.parse(Buffer.concat(chunks));
    const response=new Promise((resolve,reject)=>{pending={sequence:requestSequence,resolve,reject}});
    process.stdout.write(JSON.stringify({type:'request',sequence:requestSequence,body})+'\n');
    const reply=await response;
    res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache'});res.end(reply.events);requestActive=false;
  }catch{failed=true;res.writeHead(403).end();}
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(43191,'127.0.0.1',resolve)});
try{
 await exec('node',['/opt/factory/supervisor.mjs',root+'/config.json'],{maxBuffer:1024*1024,timeout:remaining(),killSignal:'SIGKILL'});
 const body=JSON.parse(readFileSync(root+'/result.json','utf8'));
 process.stdout.write(JSON.stringify({type:'result',body})+'\n');
}finally{finished=true;server.close();clearTimeout(timer);process.stdin.destroy();}
