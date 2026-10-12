'use node';
import {permitOrigin} from '../../packages/shared/src/executionPermit';
/** Delivery is never a stop or cleanup acknowledgment. The receiver ACKs separately. */
export async function deliverInstalledControl(packet:unknown,origin:string,transport:typeof fetch=fetch) {
 if(!permitOrigin(origin))throw Error('PERMIT_CONTROL_ORIGIN');
 const body=JSON.stringify(packet);if(Buffer.byteLength(body)>8192)throw Error('PERMIT_CONTROL_SIZE');
 try{
  const response=await transport(new URL('/api/missioncontrol/control',origin),{method:'POST',headers:{'content-type':'application/json'},body,redirect:'error',signal:AbortSignal.timeout(5000)});
  if(response.status!==200||!response.body)return 'PENDING_BACKEND' as const;
  const reader=response.body.getReader();let bytes=0;const chunks:Uint8Array[]=[];
  try{for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>1024)return 'PENDING_BACKEND' as const;chunks.push(value);}}finally{await reader.cancel();}
  const result=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  return result&&Object.keys(result).join(',')==='received'&&result.received===true?'DELIVERED' as const:'PENDING_BACKEND' as const;
 }catch{return 'PENDING_BACKEND' as const;}
}
