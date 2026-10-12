import {configuredConnectionSecret} from './installedSofieConnection';
import {canonicalServiceCommand,validateServiceCommandEnvelope,type ServiceCommandEnvelope} from './serviceCommandAuth';
import {sha256Hex} from '../../packages/shared/src/canonicalDigest';
import {permitDenied} from '../../packages/shared/src/executionPermit';
import {SOFIE_APPLICATION} from '../../packages/shared/src/sofieEnterprise';
export async function authenticateInstalledSofieCommand(args:{envelope:ServiceCommandEnvelope;payloadJson:string},capability:string) {
 const limit=capability==='enterprise.authorizeAdmission'?40000:16000;
 if(args.payloadJson.length>limit)return permitDenied();
 let input:any;try{input=JSON.parse(args.payloadJson);}catch{return permitDenied();}
 if(!input||typeof input.connectionId!=='string'||input.connectionId.length>200)return permitDenied();
 const secret=configuredConnectionSecret(input.connectionId),now=Date.now();
 if(!secret||validateServiceCommandEnvelope(args.envelope,now,{serviceId:SOFIE_APPLICATION,capability})
   ||args.envelope.issuedAt>now||args.envelope.repositoryId!==`connection:${input.connectionId}`
   ||args.envelope.payloadDigest!==`sha256=${sha256Hex(args.payloadJson)}`)return permitDenied();
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
 const signature=Uint8Array.from(args.envelope.signature.slice(7).match(/../g)!,b=>parseInt(b,16));
 if(!await crypto.subtle.verify('HMAC',key,signature,new TextEncoder().encode(canonicalServiceCommand(args.envelope))))return permitDenied();
}
