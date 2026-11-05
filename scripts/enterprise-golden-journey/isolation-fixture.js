import { requireServiceAttemptAuthority } from "./lib/missionServiceAuthority";
// Deployed only to the disposable qualification database.
import { mutationGeneric as fixtureMutation, internalMutationGeneric as fixtureInternalMutation } from "convex/server";
import { query, contributorMutation, missionScopedContext } from "./lib/missionScopedFunctions";
import { v } from "convex/values";
import schema from "./schema";
async function owner(ctx) {
  if (process.env.MC_NATIVE_SUCCESSOR_QUALIFICATION !== "1" || (await ctx.auth.getUserIdentity())?.subject !== "user_SyntheticHandoffQualification") throw Error("FIXTURE_DENIED");
}
export const seed = fixtureMutation({ args: { scope: v.any(), sourceMissionId: v.optional(v.id("missions")) }, handler: async (ctx, { scope: s, sourceMissionId }) => {
  await owner(ctx);
  const known = { tenants: s.tenantId, projects: s.projectId, operators: s.operatorId };
  function value(v) {
    if (v.type === "literal") return v.value;
    if (v.type === "string") return "isolation-secret";
    if (v.type === "number") return 1;
    if (v.type === "boolean") return false;
    if (v.type === "null" || v.type === "any") return null;
    if (v.type === "array") return [];
    if (v.type === "union") return value(v.value[0]);
    if (v.type === "id") { if (!known[v.tableName]) throw Error(`Missing ${v.tableName}`); return known[v.tableName]; }
    if (v.type === "object") return Object.fromEntries(Object.entries(v.value).filter(([, f]) => !f.optional).map(([k, f]) => [k, value(f.fieldType)]));
    throw Error(`Unhandled ${v.type}`);
  }
  async function insert(table, overrides) {
    const fields = schema.tables[table].validator.json.value;
    const row = { ...overrides };
    for (const [key, field] of Object.entries(fields)) if (!(key in row) && !field.optional) row[key] = value(field.fieldType);
    const id = await ctx.db.insert(table, row); known[table] = id; return id;
  }
  const tenantId=s.tenantId, projectId=s.projectId;
  const missionId = await insert("missions", { tenantId, projectId, requestedByOperatorId: s.operatorId, ownerOperatorId: s.operatorId, owner: "Display only", state: "DRAFT" });
  const workOrderId = await insert("workOrders", { tenantId, projectId, missionId, acceptanceCriteria: [{id:"isolation",title:"Isolation evidence",status:"PENDING"}] });
  const taskId = await insert("tasks", { tenantId, projectId, workOrderId });
  const agentId = await insert("agents", {projectId});
  await ctx.db.patch(taskId,{assigneeIds:[agentId]});
  const workflowKey = "isolation-"+Date.now()+"-"+Math.random().toString(36).slice(2,12);
  const workflowId = await insert("workflows", { projectId, workflowId:workflowKey });
  const workflowRunId = await insert("workflowRuns", { tenantId, projectId, missionId, workOrderId, parentTaskId: taskId, workflowId:workflowKey, runId:"isolation-"+missionId });
  const runId = await insert("runs", {tenantId,projectId,agentId,taskId,workflowRunId,costUsd:7,startedAt:Date.now(),status:"COMPLETED"});
  await ctx.db.patch(agentId,{currentTaskId:taskId,spendToday:19,budgetDaily:10,status:"ACTIVE",lastError:"Private Mission error",errorStreak:3});
  const qcRunId = await insert("qcRuns", {tenantId,projectId,scopeSpec:{workOrderId}});
  const qcArtifactId = await insert("qcArtifacts", {tenantId,projectId,qcRunId,content:"Private QC evidence"});
  const costAlertId = await insert("alerts", {projectId,type:"daily_cost_exceeded",metadata:{sourceRunIds:[runId]}});
  const legacyMonitoringAlertId = await insert("alerts", {projectId,type:"SYSTEM_ERROR",description:"Private legacy monitoring"});
  const legacyPerformanceAlertId = await insert("alerts", {projectId,type:"PERFORMANCE",description:"Private legacy performance"});
  const legacyBudgetAlertId = await insert("alerts", {projectId,agentId,type:"BUDGET_EXCEEDED",description:"Private legacy spend $19"});
  const legacyCostAlertId = await insert("alerts", {projectId,type:"daily_cost_exceeded"});
  const artifactId = await insert("runArtifacts", { projectId, workflowRunId });
  const eventId = await insert("runEvents", { projectId, workflowRunId });
  const auditId = await insert("activities", { projectId, targetId: missionId, targetType: "MISSION" });
  const memberId = await insert("orgMembers", { tenantId, projectId, operatorId: s.peerId, active: true });
  const authorMemberId = await insert("orgMembers", { tenantId, projectId, operatorId: s.authorId, active: true });
  for (const [assignedMemberId, operatorId] of [[memberId,s.peerId],[authorMemberId,s.authorId]]) {
    await insert("teamMemberships", { tenantId, projectId, memberId: assignedMemberId, operatorId, teamId:s.teamId, role:"DEVELOPER", active:true, activeFrom:Date.now() });
  }
  const relationId = await insert("taskRelations", { tenantId, projectId, sourceTaskId:taskId, targetTaskId:taskId });
  const traceId = await insert("traces", {tenantId,projectId,workflowRunId,workOrderId});
  const documentId = await insert("factoryMemoryDocuments", {tenantId,projectId,metadata:{missionId:sourceMissionId ?? missionId}});
  const chunkId = await insert("factoryMemoryChunks", {tenantId,projectId,documentId,metadata:{missionId:sourceMissionId ?? missionId},content:"private frozen content"});
  const chunk = await ctx.db.get(chunkId);
  const packageId = await insert("factoryContextPackages", {tenantId,projectId,workflowRunId,workOrderId,primaryTraceId:traceId,
    items:[{sourceType:chunk.sourceType,sourceId:chunk.sourceId,documentId,chunkId,content:chunk.content,reason:"source custody",priority:"required",estimatedTokens:1,retrievalMethod:"lexical",provenance:chunk.provenance}]});
  await insert("featureFlags", {projectId,key:"factory-memory.context-engine",enabled:true,createdAt:Date.now(),updatedAt:Date.now()});
  const privateEntity = await insert("factoryEntities", {tenantId,projectId,metadata:{workOrderId}});
  const sharedEntity = await insert("factoryEntities", {tenantId,projectId});
  const privateEdge = await insert("factoryRelationships", {tenantId,projectId,sourceId:sharedEntity,targetId:privateEntity});
  const privateNode = await insert("knowledgeGraphNodes", {projectId,externalId:"private-"+missionId,metadata:{workOrderId}});
  const sharedNode = await insert("knowledgeGraphNodes", {projectId,externalId:"shared-"+missionId});
  const logicalEdge = await insert("knowledgeGraphEdges", {projectId,fromExternalId:"shared-"+missionId,toExternalId:"private-"+missionId});
  const prUrl="https://github.com/qualification/private/pull/"+Date.now()+String(missionId).slice(-8);
  await insert("harnessPrChecks",{projectId,workOrderId,prUrl});
  const repositoryId=await insert("workspaceRepositories",{tenantId,projectId});
  const codeScopeId=await insert("repositoryCodeScopes",{tenantId,projectId,repositoryId,active:true});
  const webhookId=await insert("githubWebhookDeliveries",{tenantId,projectId,repositoryId,deliveryId:"private-delivery-"+String(missionId).slice(-8),event:"pull_request_review",signatureStatus:"VALID",result:"Private Mission review "+prUrl,error:"Private Mission error "+prUrl,attemptCount:1});
  return { legacyMonitoringAlertId,legacyPerformanceAlertId,legacyBudgetAlertId,runId,qcRunId,qcArtifactId,costAlertId,legacyCostAlertId,agentId,codeScopeId,repositoryId,webhookId,privateEntity,sharedEntity,privateEdge,privateNode,sharedNode,logicalEdge,prUrl,missionId, workOrderId, taskId, workflowId, workflowKey, workflowRunId, artifactId, eventId, auditId, memberId, authorMemberId,relationId,packageId,documentId,chunkId };
} });
export const read = query({ args: { id:v.string() }, handler: (ctx,{id}) => ctx.db.get(id) });
export const contribute = contributorMutation({ args: { id:v.id("missions"), title:v.string() }, handler: (ctx,{id,title}) => ctx.db.patch(id,{title}) });
export const fault = fixtureMutation({ args: { id:v.string(), patch:v.any(), unset:v.optional(v.array(v.string())) }, handler: async (ctx,{id,patch,unset}) => { await owner(ctx); for(const key of unset??[]) patch[key]=undefined; await ctx.db.patch(id,patch); } });

export const rawRead = fixtureMutation({args:{id:v.string()},handler:async(ctx,{id})=>{await owner(ctx);return ctx.db.get(id);}});

export const serviceInputProbe = fixtureMutation({args:{claim:v.any(),ids:v.array(v.string())},handler:async(ctx,{claim,ids})=>{
 await owner(ctx);
 const authority=await requireServiceAttemptAuthority(ctx,claim);
 const scoped=missionScopedContext(ctx,"OWNER",authority);
 const results=[];
 for(const id of ids) {
  const visible=Boolean(await scoped.db.get(id));
  let writable=false;try {await scoped.db.patch(id,{});writable=true;}catch(error){if(!String(error).includes("MISSION_UNAVAILABLE"))throw error;}
  results.push({id,visible,writable});
 }
 return results;
}});

export const transactionCacheProbe = fixtureMutation({args:{scope:v.any(),local:v.any(),foreign:v.any()},handler:async(ctx,{scope:s,local,foreign})=>{
 await owner(ctx);
 // Build a cyclic provenance graph before creating either request-local view.
 await ctx.db.patch(local.documentId,{metadata:{missionId:local.missionId,parent:foreign.documentId}});
 await ctx.db.patch(foreign.documentId,{metadata:{missionId:foreign.missionId,parent:local.documentId}});
 for(const ids of [[local.documentId,foreign.documentId],[foreign.documentId,local.documentId]]) {
  const cyclic=missionScopedContext(ctx);
  for(const id of ids) if(await cyclic.db.get(id)!==null) throw Error('CYCLIC_FOREIGN_LINEAGE_VISIBLE');
 }
 const scoped=missionScopedContext(ctx);
 if(!await scoped.db.get(local.artifactId)) throw Error('CACHE_WARM_FAILED');
 // Owner-authorized transfer changes an ancestor in this same transaction.
 await scoped.db.patch(local.missionId,{ownerOperatorId:s.peerId});
 if(await scoped.db.get(local.artifactId)!==null) throw Error('STALE_TRANSACTION_AUTHORIZATION');
 return {ancestorWriteInvalidation:true,cyclicForeignReadOrderIndependent:true};
}});

// Fresh, disposable capacity peers only. Never copied into a deployed project.
export const capacityPeers = fixtureMutation({ args: { workflowRunId:v.id("workflowRuns"), workerId:v.string() }, handler:async(ctx,args)=>{
 await owner(ctx);
 const sample=await ctx.db.get(args.workflowRunId), source=sample?.missionId&&await ctx.db.get(sample.missionId);
 const project=sample?.projectId&&await ctx.db.get(sample.projectId);
 if(!sample||!source||project?.metadata?.synthetic!==true)throw Error("SYNTHETIC_CAPACITY_SCOPE_REQUIRED");
 const peers=await ctx.db.query("operators").collect(),peer=peers.find(row=>row.tenantId===source.tenantId&&row.authId==="fixture-peer");
 if(!peer)throw Error("SYNTHETIC_PEER_REQUIRED");
 const required=(table,row)=>Object.fromEntries(Object.entries(schema.tables[table].validator.json.value).filter(([,field])=>!field.optional).map(([key])=>[key,row[key]]));
 const metadata={workerCapacityFixture:true};
 const missionId=await ctx.db.insert("missions",{...required("missions",source),tenantId:source.tenantId,projectId:source.projectId,ownerOperatorId:peer._id,state:"DRAFT",metadata});
 const now=Date.now(),runIds=[],names=[];
 for(let i=0;i<3;i++){
  const runId="private-capacity-"+String(missionId)+"-"+i;names.push(runId);
  runIds.push(await ctx.db.insert("workflowRuns",{...required("workflowRuns",sample),runId,tenantId:sample.tenantId,projectId:sample.projectId,missionId,status:"RUNNING",startedAt:now,spentUsd:0,reservedCostUsd:0,metadata,
   lease:{leaseId:runId,ownerId:args.workerId,workerId:args.workerId,claimedAt:now,heartbeatAt:now,expiresAt:now+120000}}));
 }
 return {missionId,runIds,names};
}});
export const clearCapacityPeers = fixtureMutation({args:{missionId:v.id("missions"),runIds:v.array(v.id("workflowRuns"))},handler:async(ctx,args)=>{
 await owner(ctx);const mission=await ctx.db.get(args.missionId);
 if(mission?.metadata?.workerCapacityFixture!==true)throw Error("SYNTHETIC_CAPACITY_SCOPE_REQUIRED");
 for(const id of args.runIds){const run=await ctx.db.get(id);if(run?.missionId!==args.missionId||run.metadata?.workerCapacityFixture!==true)throw Error("SYNTHETIC_CAPACITY_SCOPE_REQUIRED");await ctx.db.delete(id);}
 await ctx.db.delete(args.missionId);
}});

export const repositoryMutationPeer = fixtureMutation({args:{workOrderId:v.id("workOrders")},handler:async(ctx,args)=>{
 await owner(ctx);
 const source=await ctx.db.get(args.workOrderId),mission=source?.missionId&&await ctx.db.get(source.missionId);
 const project=source?.projectId&&await ctx.db.get(source.projectId);
 if(!source?.repositoryId||!mission||project?.metadata?.synthetic!==true)throw Error("SYNTHETIC_REPOSITORY_SCOPE_REQUIRED");
 const peer=(await ctx.db.query("operators").collect()).find(row=>row.tenantId===source.tenantId&&row.authId==="fixture-peer");
 if(!peer)throw Error("SYNTHETIC_PEER_REQUIRED");
 const required=(table,row)=>Object.fromEntries(Object.entries(schema.tables[table].validator.json.value).filter(([,field])=>!field.optional).map(([key])=>[key,row[key]]));
 const metadata={repositoryMutationFixture:true};
 const missionId=await ctx.db.insert("missions",{...required("missions",mission),tenantId:source.tenantId,projectId:source.projectId,ownerOperatorId:peer._id,state:"DRAFT",metadata});
 const workOrderId=await ctx.db.insert("workOrders",{...required("workOrders",source),tenantId:source.tenantId,projectId:source.projectId,missionId,repositoryId:source.repositoryId,isMutating:true,metadata});
 // A pending, unclaimed zero-exposure run is valid without an execution grant.
 const runId="private-repository-mutation-"+missionId;
 const workflowRunId=await ctx.db.insert("workflowRuns",{runId,workflowId:source.workflowId,tenantId:source.tenantId,projectId:source.projectId,missionId,workOrderId,repositoryId:source.repositoryId,
  status:"PENDING",isMutating:true,currentStepIndex:0,totalSteps:0,steps:[],context:{},initialInput:"Synthetic repository lock regression",startedAt:Date.now(),spentUsd:0,reservedCostUsd:0,metadata});
 return {missionId,workOrderId,workflowRunId,runId};
}});
export const clearRepositoryMutationPeer = fixtureMutation({args:{missionId:v.id("missions"),workOrderId:v.id("workOrders"),workflowRunId:v.id("workflowRuns")},handler:async(ctx,args)=>{
 await owner(ctx);
 const mission=await ctx.db.get(args.missionId),wo=await ctx.db.get(args.workOrderId),run=await ctx.db.get(args.workflowRunId);
 if(mission?.metadata?.repositoryMutationFixture!==true||wo?.missionId!==mission._id||run?.missionId!==mission._id||run.workOrderId!==wo._id
  ||wo.metadata?.repositoryMutationFixture!==true||run.metadata?.repositoryMutationFixture!==true)throw Error("SYNTHETIC_REPOSITORY_SCOPE_REQUIRED");
 await ctx.db.delete(run._id);await ctx.db.delete(wo._id);await ctx.db.delete(mission._id);
}});

// Disposable qualification only; this module is copied into the temporary backend.
export const legacyDeliveryRole = fixtureInternalMutation({
 args: { operatorId:v.id('operators'), projectId:v.id('projects'), tenantId:v.id('tenants') },
 handler: async(ctx,args)=>{
  const operator=await ctx.db.get(args.operatorId),project=await ctx.db.get(args.projectId);
  if(operator?.authId!=='fixture-peer'||operator.tenantId!==args.tenantId||project?.tenantId!==args.tenantId)throw Error('Fixture identity mismatch');
  for(const row of await ctx.db.query('roleAssignments').withIndex('by_operator',q=>q.eq('operatorId',args.operatorId)).collect())await ctx.db.delete(row._id);
  const roleId=await ctx.db.insert('roles',{tenantId:args.tenantId,name:'Delivery-only fixture',permissions:['factory.read','delivery.write']});
  await ctx.db.insert('roleAssignments',{operatorId:args.operatorId,roleId,assignedAt:Date.now(),scope:{type:'project',id:args.projectId}});
 }
});
