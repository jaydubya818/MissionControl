import { describe, it, expect } from 'vitest';
import { missionScopedContext } from '../lib/missionScopedFunctions';

function fixture() {
  const rows = new Map<string, any>(); let next = 1;
  const add = (table: string, row: any = {}) => { const id = String(next++).padStart(32, '0'); rows.set(id, { table, row: { ...row, _id: id } }); return id; };
  const tenant = add('tenants', {active:true}), project = add('projects', {tenantId:tenant});
  const owner = add('operators',{active:true,tenantId:tenant,authId:'owner'}), peer = add('operators',{active:true,tenantId:tenant,authId:'peer'});
  const mission = add('missions',{tenantId:tenant,projectId:project,ownerOperatorId:owner});
  const foreign = add('missions',{tenantId:tenant,projectId:project,ownerOperatorId:peer});
  const doc = (parents: string[]) => add('factoryMemoryDocuments',{tenantId:tenant,projectId:project,metadata:{parents}});
  const pauses = new Map<string,{entered:()=>void,wait:Promise<void>}>();
  const db = {
    normalizeId(table: string,id: string) { return rows.get(id)?.table === table ? id : null; },
    async get(id: string) {
      const row = rows.get(id)?.row ?? null;
      const pause=pauses.get(id);if(pause){pauses.delete(id);pause.entered();await pause.wait;}
      return row;
    },
    async patch(id: string,patch: any) { const entry=rows.get(id);entry.row={...entry.row,...patch}; },
    query(table: string) {
      const filters: [string,any][]=[];
      const query={withIndex(_name: string,fn: any){const q={eq(key: string,value: any){filters.push([key,value]);return q;}};fn(q);return query;},
        async collect(){return [...rows.values()].filter(e=>e.table===table&&filters.every(([k,v])=>e.row[k]===v)).map(e=>e.row);}};
      return query;
    },
  };
  const ctx:any={db,auth:{getUserIdentity:async()=>({subject:'owner'})}};
  return {rows,add,doc,mission,foreign,owner,peer,project,tenant,scope:()=>missionScopedContext(ctx),serviceScope:(service:any)=>missionScopedContext({...ctx,auth:{getUserIdentity:async()=>null}},'OWNER',service),applicationScope:(application:any)=>missionScopedContext({...ctx,auth:{getUserIdentity:async()=>null}},'OWNER',undefined,undefined,application),
    pause(id:string){let entered!:()=>void,release!:()=>void;const reached=new Promise<void>(r=>{entered=r;});
      const wait=new Promise<void>(r=>{release=r;});pauses.set(id,{entered,wait});return {reached,release};}};
}

describe('transaction-local complete authorization closures',()=>{
  it('denies foreign sibling provenance after warming an overlapping allowed closure',async()=>{
    const f=fixture(), shared=f.doc([f.mission]), allowed=f.doc([shared]), mixed=f.doc([shared,f.foreign]);
    const ctx=f.scope();expect(await ctx.db.get(allowed as any)).not.toBeNull();expect(await ctx.db.get(mixed as any)).toBeNull();
  });
  it('checks incoming scope consistency even for parents in a cached closure',async()=>{
    const f=fixture(), parent=f.doc([f.mission]), child=f.doc([parent]);
    const otherProject=f.add('projects',{tenantId:f.tenant});f.rows.get(child).row.projectId=otherProject;
    const root=f.doc([parent,child]), ctx=f.scope();
    expect(await ctx.db.get(parent as any)).not.toBeNull();expect(await ctx.db.get(root as any)).toBeNull();
  });
  it('counts reused footprints toward the traversal bound',async()=>{
    const f=fixture(), branches:string[]=[];
    for(let branch=0;branch<4;branch++){let parent=f.mission;for(let i=0;i<65;i++)parent=f.doc([parent]);branches.push(parent);}
    const root=f.doc(branches),ctx=f.scope();
    for(const branch of branches)expect(await ctx.db.get(branch as any)).not.toBeNull();
    expect(await ctx.db.get(root as any)).toBeNull();
  });
  it('does not publish stale completed authority after a write during a pending read',async()=>{
    const f=fixture(),child=f.doc([f.mission]),ctx=f.scope();
    const pause=f.pause(f.mission), pending=ctx.db.get(child as any);await pause.reached;
    await ctx.db.patch(f.mission as any,{ownerOperatorId:f.peer} as any);pause.release();await pending;
    expect(await ctx.db.get(child as any)).toBeNull();
  });
  it('denies a newer read while an older traversal is still held after ownership changed',async()=>{
    const f=fixture(),second=f.doc([]),older=f.doc([f.mission,second]),newer=f.doc([f.mission]),ctx=f.scope();
    const firstPause=f.pause(f.mission),firstRead=ctx.db.get(older as any);await firstPause.reached;
    await ctx.db.patch(f.mission as any,{ownerOperatorId:f.peer} as any);
    const secondPause=f.pause(second);firstPause.release();
    // The fixed traversal stops immediately; the vulnerable one reaches the
    // second ancestor and leaves its stale owner decision available to B.
    await Promise.race([firstRead,secondPause.reached]);
    try {expect(await ctx.db.get(newer as any)).toBeNull();}
    finally {secondPause.release();await firstRead;}
  });

  it('captures authority generation before the initial root row fetch',async()=>{
    const f=fixture(), child=f.doc([f.mission]), ctx=f.scope();
    const pause=f.pause(f.mission), oldRead=ctx.db.get(f.mission as any);await pause.reached;
    await ctx.db.patch(f.mission as any,{ownerOperatorId:f.peer} as any);
    pause.release();expect(await oldRead).toBeNull();expect(await ctx.db.get(child as any)).toBeNull();
  });
  it('serializes authorized Promise.all writes and revalidates after owner transfer',async()=>{
    const f=fixture(),ctx=f.scope();
    await Promise.all([ctx.db.patch(f.mission as any,{title:'first'} as any),ctx.db.patch(f.mission as any,{title:'second'} as any)]);
    expect(f.rows.get(f.mission).row.title).toBe('second');
    const transfer=ctx.db.patch(f.mission as any,{ownerOperatorId:f.peer} as any);
    const staleWrite=ctx.db.patch(f.mission as any,{title:'stale'} as any);
    await transfer;await expect(staleWrite).rejects.toThrow('MISSION_UNAVAILABLE');
    expect(f.rows.get(f.mission).row.title).toBe('second');
  });

});

describe('application policy dependency reads',()=>{
 function applicationFixture(operation='enterprise.result'){
  const f=fixture(),policy=f.add('policyEnvelopes',{tenantId:f.tenant,projectId:f.project,name:'Bound policy'}),other=f.add('policyEnvelopes',{tenantId:f.tenant,projectId:f.project,name:'Unrelated policy'});
  const version=f.add('factoryDefinitionVersions',{tenantId:f.tenant,projectId:f.project,policyEnvelopeId:policy});
  const run=f.add('workflowRuns',{tenantId:f.tenant,projectId:f.project,missionId:f.mission,factoryDefinitionVersionId:version,policyEnvelopeId:policy});
  const scope=f.applicationScope({missionId:f.mission,request:{operation},connection:{ownerId:f.owner,tenantId:f.tenant,projectId:f.project},envelope:{}});
  return {...f,policy,other,version,run,scope};
 }
 it.each(['enterprise.result','enterprise.read'])('allows only the bound run policy dependency for %s',async operation=>{const f=applicationFixture(operation);expect((await f.scope.db.get(f.run as any))?._id).toBe(f.run);});
 it('does not expose policy resources directly',async()=>{const f=applicationFixture();expect(await f.scope.db.get(f.policy as any)).toBeNull();expect(await f.scope.db.get(f.other as any)).toBeNull();});
 it('does not allow application policy writes',async()=>{const f=applicationFixture();await expect(f.scope.db.patch(f.policy as any,{active:false} as any)).rejects.toThrow('MISSION_UNAVAILABLE');});
 it('does not allow another operation to read the dependency',async()=>{const f=applicationFixture('enterprise.inspect');expect(await f.scope.db.get(f.run as any)).toBeNull();});
 it('requires the immutable version and run to select the same policy',async()=>{const f=applicationFixture();f.rows.get(f.run).row.policyEnvelopeId=f.other;expect(await f.scope.db.get(f.run as any)).toBeNull();});
 it('denies a foreign Mission even when it uses the same policy',async()=>{const f=applicationFixture();f.rows.get(f.run).row.missionId=f.foreign;expect(await f.scope.db.get(f.run as any)).toBeNull();});
 it('retains foreign Mission provenance inside the bound policy',async()=>{const f=applicationFixture();f.rows.get(f.policy).row.metadata={sourceMissionId:f.foreign};expect(await f.scope.db.get(f.run as any)).toBeNull();});
});

describe('service policy dependency reads',()=>{
 function serviceFixture(){
  const f=fixture(),policy=f.add('policyEnvelopes',{tenantId:f.tenant,projectId:f.project,name:'Approved bound policy'}),other=f.add('policyEnvelopes',{tenantId:f.tenant,projectId:f.project,name:'Unrelated policy'});
  const version=f.add('factoryDefinitionVersions',{tenantId:f.tenant,projectId:f.project,policyEnvelopeId:policy});
  const run=f.add('workflowRuns',{tenantId:f.tenant,projectId:f.project,missionId:f.mission,factoryDefinitionVersionId:version,policyEnvelopeId:policy});
  const scope=f.serviceScope({tenantId:f.tenant,projectId:f.project,ownerOperatorId:f.owner,missionId:f.mission,workflowRunId:run,factoryDefinitionVersionId:version,allowedEffects:[],dependencyHandoffIds:[],workOrderId:'none'});
  return{...f,policy,other,version,run,scope};
 }
 it('allows the approved version-bound policy without a human session',async()=>{const f=serviceFixture();expect((await f.scope.db.get(f.policy as any))?._id).toBe(f.policy);});
 it('does not grant access to another policy in the same workspace',async()=>{const f=serviceFixture();expect(await f.scope.db.get(f.other as any)).toBeNull();});
 it('does not allow the service to change its policy',async()=>{const f=serviceFixture();await expect(f.scope.db.patch(f.policy as any,{active:false} as any)).rejects.toThrow('MISSION_UNAVAILABLE');});
 it('requires the run and immutable version to select the same policy',async()=>{const f=serviceFixture();f.rows.get(f.run).row.policyEnvelopeId=f.other;expect(await f.scope.db.get(f.policy as any)).toBeNull();expect(await f.scope.db.get(f.other as any)).toBeNull();});
 it('retains foreign Mission provenance checks inside the bound policy',async()=>{const f=serviceFixture();f.rows.get(f.policy).row.metadata={sourceMissionId:f.foreign};expect(await f.scope.db.get(f.policy as any)).toBeNull();});
});
