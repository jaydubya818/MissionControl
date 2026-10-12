import { useCallback, useEffect, useRef, useState } from 'react';
import { useConvex, useMutation, useAction } from 'convex/react';
import { makeFunctionReference } from 'convex/server';
import type { Id } from '../../../../../convex/_generated/dataModel';
import { Button } from '@/components/ui/button';

type RequestRow = {requestId:Id<'enterprisePermitRequests'>;missionId:string;workOrderId:string;work:{id:string;version:number;generation:number};admission:{maxCostMicrousd:number;maxDurationSeconds:number}};
type FactoryObservation = {status:string;expiresAt:number;result:null|{candidate:string;independentVerdict:string;proofOutcome:string;exposureUnknown:boolean;cleanupConfirmed:boolean;accounting:{unknownMicrousd:number}}};
type PermitRow = {permitId:Id<'enterpriseExecutionPermits'>;missionId:string;workOrderId:string;work:{id:string;version:number;generation:number};status:string;authority?:string;cleanup:string;factoryResult?:FactoryObservation|null};
export type PermitReviewState = {requests:RequestRow[];permits:PermitRow[];truncated:boolean};
export function InstalledPermitReview({projectId,connectionId,missionId}:{projectId:Id<'projects'>;connectionId:Id<'enterpriseAppConnections'>;missionId:string}) {
 const client=useConvex();
 const approve=useMutation(makeFunctionReference<'mutation'>('sofieExecutionPermitState:approvePrepared'));
 const readResult=useAction(makeFunctionReference<'action'>('sofieFactoryResults:refresh'));
 const revoke=useMutation(makeFunctionReference<'mutation'>('sofieExecutionPermitState:revoke'));
 const [state,setState]=useState<PermitReviewState|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const generation=useRef(0),inFlight=useRef(false);
 const load=useCallback(async()=>{
   const g=++generation.current;setError('');setState(null);
   try {
     const [pending,current]=await Promise.all([
       client.query(makeFunctionReference<'query'>('sofieExecutionPermitState:pending'),{projectId,connectionId}),
       client.query(makeFunctionReference<'query'>('sofieExecutionPermitState:inspect'),{projectId,connectionId}),
     ]);
     if(g===generation.current)setState({requests:pending.requests.filter((r:RequestRow)=>r.missionId===missionId),permits:current.permits.filter((r:PermitRow)=>r.missionId===missionId),truncated:pending.truncated||current.truncated});
   }catch{if(g===generation.current)setError('Installed execution setup or owner authority is unavailable. No execution was authorized.');}
 },[client,projectId,connectionId,missionId]);
 useEffect(()=>{setNotice('');void load();return()=>{generation.current++;};},[load]);
 const decide=async(kind:'approve'|'revoke'|'result',id:string)=>{
   if(inFlight.current)return;inFlight.current=true;setBusy(true);setError('');setNotice('');const g=generation.current;
   try{
     if(kind==='approve')await approve({projectId,requestId:id as Id<'enterprisePermitRequests'>});
     else if(kind==='result')await readResult({permitId:id as Id<'enterpriseExecutionPermits'>});
     else await revoke({projectId,permitId:id as Id<'enterpriseExecutionPermits'>});
     if(g===generation.current){setNotice(kind==='result'?'Factory evidence refreshed. Enterprise acceptance remains a separate decision.':kind==='approve'?'Work binding approved. Return to the same Sofie conversation to request admission.':'New MissionControl admissions are denied. Receiving authority and cleanup are pending backend confirmation.');await load();}
   }catch{if(g===generation.current)setError('Decision not confirmed. Refresh and review the current plan, Work revision and approval before retrying.');}
   finally{inFlight.current=false;setBusy(false);}
 };
 return <InstalledPermitPanel state={state} busy={busy} error={error} notice={notice} onRefresh={()=>void load()} onApprove={id=>void decide('approve',id)} onRevoke={id=>void decide('revoke',id)} onReadResult={id=>void decide('result',id)}/>;
}
export function InstalledPermitPanel({state,busy,error,notice,onRefresh,onApprove,onRevoke,onReadResult}:{state:PermitReviewState|null;busy:boolean;error:string;notice:string;onRefresh:()=>void;onApprove:(id:string)=>void;onRevoke:(id:string)=>void;onReadResult?:(id:string)=>void}){
 const [now,setNow]=useState(Date.now);
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[]);
 return <section aria-label="Installed Work authorization" className="space-y-3 rounded-xl border border-line p-4">
  <h3 className="font-semibold">Installed Work authorization</h3>
  <p>Approve the exact existing Work for this Mission. Capability policy, backend authority and budget checks still apply before execution.</p>
  {!state&&!error&&<p role="status">Loading current Work requests…</p>}
  {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  {state&&!state.requests.length&&!state.permits.length&&<p>No installed Work is waiting for approval. Ask Sofie to prepare Work after the Mission plan is approved.</p>}
  {state?.requests.map(r=>{
   const approved=state.permits.some(p=>p.work.id===r.work.id&&p.work.version===r.work.version&&p.work.generation===r.work.generation);
   return <article key={r.requestId} className="space-y-2 border-t border-line pt-3">
    <p>Work {r.work.id}, version {r.work.version}, generation {r.work.generation}</p>
    <p>Limit ${(r.admission.maxCostMicrousd/1000000).toFixed(2)} and {r.admission.maxDurationSeconds} seconds. Approval reserves no money.</p>
    <Button disabled={busy||approved} onClick={()=>onApprove(r.requestId)}>{approved?'Work binding reviewed':'Approve this Work binding'}</Button>
   </article>;
  })}
  {state?.permits.map(p=><article key={p.permitId} className="space-y-2 border-t border-line pt-3">
   <p>Work {p.work.id}: {p.status==='REVOKED'?(p.authority==='FENCED'?'Receiving authority fenced':'Revocation requested'):p.status==='NEW_ADMISSIONS_DENIED'?'New admissions denied; existing Work preserved':p.status==='EXPIRED'?'Approval expired':'Owner approved'}</p>
   {p.status==='REVOKED'&&<p>Backend cleanup: {p.cleanup === 'CONFIRMED' ? 'confirmed' : 'pending confirmation'}.</p>}
   {p.factoryResult&&<div aria-label="Verified Factory evidence">
    <p>{p.factoryResult.expiresAt<=now?'Factory evidence expired. Refresh before review.':`Factory evidence: ${p.factoryResult.status}`}</p>
    {p.factoryResult.expiresAt>now&&p.factoryResult.result&&<>
     <p>Candidate: {p.factoryResult.result.candidate}</p>
     <p>Independent verdict: {p.factoryResult.result.independentVerdict}. Proof outcome: {p.factoryResult.result.proofOutcome}.</p>
     <p>Accounting exposure: {p.factoryResult.result.exposureUnknown?'UNKNOWN — reservation retained':'known'}. Cleanup: {p.factoryResult.result.cleanupConfirmed?'confirmed':'pending backend'}.</p>
    </>}
    <p>Enterprise acceptance is not established by this evidence.</p>
   </div>}
   {onReadResult&&<Button disabled={busy} onClick={()=>onReadResult(p.permitId)}>Refresh verified Factory evidence</Button>}
   <Button disabled={busy||p.status==='REVOKED'} onClick={()=>onRevoke(p.permitId)}>Revoke Work binding</Button>
  </article>)}
  {state?.truncated&&<p role="status">This list is limited. Review the exact Work from Sofie before proceeding.</p>}
  <Button disabled={busy} onClick={onRefresh}>Refresh Work authorizations</Button>
 </section>;
}
