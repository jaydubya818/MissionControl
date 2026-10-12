import {afterEach,expect,it,vi} from 'vitest';
import {read,retain,currentFactoryObservation} from '../sofieFactoryResultState';
import {permitLifecycleOwner} from '../lib/executionPermitAuthority';
import {resultMissionScope} from '../lib/sofieEnterpriseResult';
import {installedServiceSecret} from '../lib/installedSofieConnection';
import {ownerResultFixture} from './ownerFactoryReadbackFixture';
import {permitDigest} from '../../packages/shared/src/executionPermit';
vi.mock('../lib/executionPermitAuthority',()=>({permitLifecycleOwner:vi.fn()}));
vi.mock('../lib/sofieEnterpriseResult',()=>({resultMissionScope:vi.fn()}));
vi.mock('../lib/installedSofieConnection',()=>({installedServiceSecret:vi.fn()}));
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();});
function fixture(){
 const f=ownerResultFixture(),p=f.permit;vi.spyOn(Date,'now').mockReturnValue(f.now);
 const row:any={_id:p.permitId,ownerId:'operator',tenantId:p.tenantId,projectId:p.projectId,connectionId:p.connectionId,missionId:p.missionId,workOrderId:p.workOrderId,permitSha256:permitDigest(p),document:p};
 const receipt:any={kind:'ADMISSION',permitId:p.permitId,connectionId:p.connectionId,commandId:f.admissionEvidence.document.commandId,document:f.admissionEvidence.document};
 const enrollment={...f.admissionEvidence.enrollment,factoryVersion:p.admission.factoryVersion};
 vi.mocked(permitLifecycleOwner).mockImplementation(async()=>({owner:{_id:'operator'},connection:{_id:p.connectionId,tenantId:p.tenantId,keyId:'service'},project:{_id:p.projectId},enrollment}) as any);
 vi.mocked(resultMissionScope).mockResolvedValue({scope:{planId:p.planId,planDigest:p.planDigest}} as any);
 vi.mocked(installedServiceSecret).mockReturnValue('s'.repeat(32));vi.stubEnv('MC_SOFIE_FACTORY_RESULT_PINS',JSON.stringify({[p.connectionId]:f.pins}));
 const work={missionId:p.missionId,missionPlanId:p.planId,currentRevisionId:p.workOrderRevisionId,projectId:p.projectId,tenantId:p.tenantId};
 const ctx:any={db:{get:vi.fn(async id=>id===p.permitId?row:work),query:vi.fn(()=>({withIndex:(_index,build)=>{const eq=()=>({eq});build({eq});return {first:async()=>receipt,unique:async()=>receipt};}})),patch:vi.fn(async(_id,patch)=>Object.assign(row,patch))}};
 const load=()=> (read as any)._handler(ctx,{permitId:p.permitId,admissionCommandId:receipt.commandId});
 const save=async()=>{const s=await load();return (retain as any)._handler(ctx,{permitId:p.permitId,permitSha256:row.permitSha256,pinsDigest:s.pinsDigest,serviceKeyDigest:s.serviceKeyDigest,enrollmentDigest:s.enrollmentDigest,observation:f.run()});};
 return {f,ctx,row,receipt,enrollment,load,save};
}
it('retains the exact canonical receipt and makes key revocation stale without changing Work',async()=>{
 const f=fixture();await f.save();expect((await currentFactoryObservation(f.ctx,f.row)).status).toBe('RESULT_VERIFIED_SETTLEMENT_REPORTED');
 f.enrollment.permitKeys[0].revokedAt=f.f.now;expect((await currentFactoryObservation(f.ctx,f.row)).status).toBe('STALE');
 expect(f.ctx.db.patch).toHaveBeenCalledTimes(1);
});
it('denies receipt mutation between verification and retention',async()=>{
 const f=fixture(),s=await f.load(),observation=f.f.run();f.receipt.document.challenge='b'.repeat(64);
 await expect((retain as any)._handler(f.ctx,{permitId:f.row._id,permitSha256:f.row.permitSha256,pinsDigest:s.pinsDigest,serviceKeyDigest:s.serviceKeyDigest,enrollmentDigest:s.enrollmentDigest,observation})).rejects.toThrow();
 expect(f.ctx.db.patch).not.toHaveBeenCalled();
});
it('denies enrollment mutation between verification and retention',async()=>{
 const f=fixture(),s=await f.load(),observation=f.f.run();f.enrollment.permitKeys[0].revokedAt=f.f.now;
 await expect((retain as any)._handler(f.ctx,{permitId:f.row._id,permitSha256:f.row.permitSha256,pinsDigest:s.pinsDigest,serviceKeyDigest:s.serviceKeyDigest,enrollmentDigest:s.enrollmentDigest,observation})).rejects.toThrow();
 expect(f.ctx.db.patch).not.toHaveBeenCalled();
});
it('makes a changed canonical receipt stale on reconnect',async()=>{const f=fixture();await f.save();f.receipt.document.challenge='b'.repeat(64);expect((await currentFactoryObservation(f.ctx,f.row)).status).toBe('STALE');});
it('rejects a receipt belonging to another permit',async()=>{const f=fixture();f.receipt.permitId='foreign';await expect(f.load()).rejects.toThrow();});
it('does not reuse owner cache observations without the new admission binding',async()=>{const f=fixture();await f.save();delete f.row.factoryResultObservation.admissionBinding;expect((await currentFactoryObservation(f.ctx,f.row)).status).toBe('STALE');});
