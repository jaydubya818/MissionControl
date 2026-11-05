import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../lib/companyAccess', () => ({
  COMPANY_PERMISSIONS:{UPDATE_DELIVERY:'delivery.write'},
  FACTORY_PERMISSIONS:{VIEW:'factory.read',MANAGE_AUTOMATION:'factory.automation.manage'},
  requireWorkspaceAccess:vi.fn(async()=>undefined),
  requireWorkspacePermission:vi.fn(async()=>undefined),
  requireCompanyAccess:vi.fn(async()=>undefined),
}));
import { requireWorkspacePermission, requireWorkspaceAccess, requireCompanyAccess } from '../lib/companyAccess';
import { legacyWorkspaceAccess } from '../lib/legacyWorkspaceAccess';
const row=(id:string)=>({_id:id,projectId:'workspace'});
const create=()=>legacyWorkspaceAccess({auth:{getUserIdentity:async()=>({subject:'owner'})}} as any,async()=>({tenantId:'tenant'}),{tableOf:()=>null,references:()=>[]});
describe('request-scoped legacy workspace permission cache',()=>{
 beforeEach(()=>vi.clearAllMocks());
 it('coalesces same-workspace permission checks across rows and concurrent readers',async()=>{
  const access=create();
  expect(await Promise.all(Array.from({length:20},(_,i)=>access(row('task'+i),'tasks',false)))).toEqual(Array(20).fill(true));
  expect(requireWorkspacePermission).toHaveBeenCalledTimes(1);
 });
 it('does not share grants across requests or operation permissions',async()=>{
  const first=create(),second=create();
  expect(await first(row('one'),'tasks',false)).toBe(true);
  expect(await second(row('two'),'tasks',false)).toBe(true);
  expect(await first(row('three'),'tasks',true)).toBe(true);
  expect(await first(row('four'),'workflowRuns',true)).toBe(true);
  expect(requireWorkspacePermission).toHaveBeenCalledTimes(3);
  expect(requireWorkspaceAccess).toHaveBeenCalledTimes(1);
 });
 it('rechecks a revoked grant after a write invalidates the context',async()=>{
  const access=create();expect(await access(row('before'),'tasks',false)).toBe(true);
  vi.mocked(requireWorkspacePermission).mockRejectedValueOnce(new Error('revoked'));
  (access as typeof access & {invalidate():void}).invalidate();
  expect(await access(row('after'),'tasks',false)).toBe(false);
 });
 it('reads defaults for an authenticated subject with multiple company operators',async()=>{
  const operators=[{active:false,tenantId:'inactive'},{active:true,tenantId:'denied'},{active:true,tenantId:'allowed'}];
  vi.mocked(requireCompanyAccess).mockImplementation(async(_ctx,tenant)=>{if(tenant==='denied')throw Error('no membership');return undefined as any;});
  const ctx:any={auth:{getUserIdentity:async()=>({subject:'multi-company'})},db:{query:()=>({withIndex:()=>({collect:async()=>operators})})}};
  const access=legacyWorkspaceAccess(ctx,async()=>null,{tableOf:()=>null,references:()=>[]});
  expect(await access({_id:'platform-default'},'policies',false)).toBe(true);
  expect(requireCompanyAccess).toHaveBeenCalledTimes(2);
 });
});
