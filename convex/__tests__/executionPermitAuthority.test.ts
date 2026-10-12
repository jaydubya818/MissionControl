import {beforeEach,it,expect,vi} from 'vitest';
import {currentPermit,permitMission} from '../lib/executionPermitAuthority';
import {currentConnection} from '../lib/sofieEnterpriseAuthority';
import {installedEnrollment} from '../lib/installedSofieConnection';
import {requireWorkspaceAccess} from '../lib/companyAccess';
import {enterpriseDigest} from '../../packages/shared/src/sofieEnterprise';
import {canonicalPermitJson,permitDigest} from '../../packages/shared/src/executionPermit';
import {permitFixture} from './executionPermitFixture';
vi.mock('../lib/sofieEnterpriseAuthority',()=>({currentConnection:vi.fn()}));
vi.mock('../lib/installedSofieConnection',()=>({installedEnrollment:vi.fn(),installedServiceSecret:vi.fn()}));
vi.mock('../lib/companyAccess',()=>({COMPANY_PERMISSIONS:{APPROVE_DELIVERY:'approve'},requireWorkspaceAccess:vi.fn()}));
beforeEach(()=>vi.resetAllMocks());
function fixture(){
 const f=permitFixture();vi.spyOn(Date,'now').mockReturnValue(f.now);
 const connection={_id:'connection',ownerId:'operator',projectId:'project',tenantId:'tenant'},owner={_id:'operator',authId:'clerk-subject',tenantId:'tenant',active:true},project={_id:'project'};
 vi.mocked(currentConnection).mockResolvedValue({connection,owner,project} as any);
 vi.mocked(installedEnrollment).mockResolvedValue({enrollment:f.enrollment} as any);
 vi.mocked(requireWorkspaceAccess).mockResolvedValue({membership:{mode:'AUTHENTICATED',operatorId:'operator'}} as any);
 const proposal:any={_id:'proposal',connectionId:'connection',tenantId:'tenant',projectId:'project',ownerId:'operator',intentKey:'intent',proposal:{title:'real same mission'},authorizedAt:f.now,expiresAt:f.now+600000,missionId:'mission'};
 proposal.digest=enterpriseDigest({connectionId:proposal.connectionId,tenantId:proposal.tenantId,projectId:proposal.projectId,ownerId:proposal.ownerId,intentKey:proposal.intentKey,proposal:proposal.proposal});proposal.authorizedDigest=proposal.digest;
 const plan:any={_id:'plan',tenantId:'tenant',projectId:'project',missionId:'mission',status:'APPROVED',revisionNumber:1,approvedBy:'operator',decidedActorSource:'AUTHENTICATED',approvedAt:f.now,releasedWorkOrderIds:['workorder']};
 f.document.planDigest=enterpriseDigest(plan);
 const approval:any={_id:'approval',tenantId:'tenant',projectId:'project',workOrderId:'workorder',workOrderRevisionNumber:1,approvalType:'INSTALLED_EXECUTION_PERMIT',approver:'operator',status:'APPROVED',decision:'APPROVE',expiresAt:f.now+300000,
 metadata:{authenticatedSubject:'clerk-subject',planDigest:f.document.planDigest,workBinding:canonicalPermitJson(f.document.work),admissionBinding:canonicalPermitJson(f.document.admission)}};
 f.document.approvalDigest=enterpriseDigest(approval);
 const rows:any={operator:owner,proposal,plan,approval,mission:{_id:'mission',ownerOperatorId:'operator',tenantId:'tenant',projectId:'project',currentPlanId:'plan',state:'READY'},
 workorder:{_id:'workorder',tenantId:'tenant',projectId:'project',missionId:'mission',missionPlanId:'plan',missionPlanRevision:1,currentRevisionId:'revision',currentRevisionNumber:1,state:'READY'},
 revision:{_id:'revision',workOrderId:'workorder',tenantId:'tenant',projectId:'project',status:'APPLIED',revisionNumber:1},
 permit:{_id:'permit',connectionId:'connection',proposalId:'proposal',workOrderId:'workorder',approvalId:'approval',document:f.document,permitSha256:permitDigest(f.document)}};
 const identity:any={subject:'clerk-subject',issuer:f.enrollment.clerkIssuer,aud:f.enrollment.clerkAudience,azp:f.enrollment.clerkAuthorizedParty};
 const ctx:any={db:{get:async(id:string)=>rows[id]},auth:{getUserIdentity:async()=>identity}};
 return {rows,identity,ctx,run:()=>currentPermit(ctx,'permit' as any,true)};
}
it('accepts only exact current owner-approved Mission, plan, WorkOrder, revision and Work',async()=>{const f=fixture();expect((await f.run()).document.work.id).toBe('work');});
for(const [name,change] of Object.entries({
 'foreign subject':(f:any)=>f.identity.subject='foreign', 'foreign issuer':(f:any)=>f.identity.issuer='https://foreign.example.test',
 'foreign authorized party':(f:any)=>f.identity.azp='https://foreign.example.test', 'foreign audience':(f:any)=>f.identity.aud='other',
 'revoked permit':(f:any)=>f.rows.permit.revokedAt=1, 'revoked approval':(f:any)=>f.rows.approval.revokedAt=1,
 'revoked proposal':(f:any)=>f.rows.proposal.revokedAt=1,'stale plan':(f:any)=>f.rows.mission.currentPlanId='other',
 'edited plan':(f:any)=>f.rows.plan.summary='changed','foreign Mission':(f:any)=>f.rows.mission.ownerOperatorId='foreign',
 'changed revision':(f:any)=>f.rows.workorder.currentRevisionId='other','unapplied revision':(f:any)=>f.rows.revision.status='PENDING_APPROVAL',
 'other Work':(f:any)=>f.rows.permit.document.work.id='foreign','changed policy':(f:any)=>f.rows.permit.document.admission.capabilityPolicySha256='f'.repeat(64),
 'foreign work order':(f:any)=>f.rows.workorder.missionId='other','non-owner plan approval':(f:any)=>f.rows.plan.approvedBy='other',
 'development approval':(f:any)=>f.rows.plan.decidedActorSource='DEVELOPMENT_FALLBACK','expired permit':(f:any)=>f.rows.permit.document.expiresAt=1,
 'completed Mission':(f:any)=>f.rows.mission.state='DONE','completed WorkOrder':(f:any)=>f.rows.workorder.state='DONE',
 'unreleased work order':(f:any)=>f.rows.plan.releasedWorkOrderIds=[],
}))it(`rejects ${name} before admission`,async()=>{const f=fixture();change(f);await expect(f.run()).rejects.toThrow();});
it('denies missing owner auth even with valid application connection',async()=>{const f=fixture();f.ctx.auth.getUserIdentity=async()=>null;await expect(permitMission(f.ctx,'connection' as any,'proposal' as any,'workorder' as any,f.rows.permit.document.planDigest,true)).rejects.toThrow();});
