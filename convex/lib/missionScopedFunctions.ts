import { SOFIE_APPLICATION } from '../../packages/shared/src/sofieEnterprise';
import { getFunctionName } from 'convex/server';
import { authorizeSofieApplicationCommand, requireSofieApplicationAuthority, type SofieApplicationAuthority } from './sofieEnterpriseAuthority';
import { serviceInputLineageRow } from "./missionServiceInputs";
import { v } from "convex/values";
import { requireServiceAttemptAuthority, type ServiceAttemptClaim, type ServiceAttemptAuthority } from "./missionServiceAuthority";
import { missionLineage } from "./missionLineage";
import { query as rawQuery, mutation as rawMutation, action as rawAction, internalQuery as rawInternalQuery, internalMutation as rawInternalMutation, internalAction as rawInternalAction } from "../_generated/server";
import type { QueryCtx, MutationCtx } from "../_generated/server";
import { canAccessMission, type MissionCapability } from "./missionAccess";
export { httpAction, internalAction } from "../_generated/server";
export type { QueryCtx, MutationCtx, ActionCtx } from "../_generated/server";

type Context = QueryCtx | MutationCtx;
type Row = Record<string, any>;
const authorityDatabase = Symbol("missionAuthorityDatabase");
const checkArguments = Symbol("missionArguments");
const serviceAuthority = Symbol("serviceAuthority");
export function missionServiceBinding(ctx: Context): ServiceAttemptAuthority | undefined { return (ctx as any)[serviceAuthority]; }
export function missionAuthorityDatabase(ctx: Context): Context["db"] {
  return (ctx as any)[authorityDatabase] ?? ctx.db;
}

/** The raw context is used only to resolve authority; handlers receive the filtered database. */
export function missionScopedContext<T extends Context>(ctx: T, writeCapability: MissionCapability = "OWNER", service?: ServiceAttemptAuthority, serviceClaim?: ServiceAttemptClaim, application?: SofieApplicationAuthority): T {
  const raw = ctx.db;
  let createdMissionId: string | undefined;
  const lineage = missionLineage(raw);
  const rowCache = new Map<string, Promise<any>>();
  const decisions = new Map<string, Promise<boolean>>();
  const resourceDecisions = new Map<string, Promise<boolean>>();
  const completedReads = new Map<string, readonly string[]>();
  let authorizationEpoch = 0;
  let pendingWrites = 0;
  let writeQueue: Promise<unknown> = Promise.resolve();
  // Existing handlers issue Promise.all writes. Serialize at this boundary so
  // each sibling validates current authority after the previous write finishes.
  const serializedWrite = <R>(operation: () => Promise<R>): Promise<R> => {
    const result = writeQueue.then(operation);
    writeQueue = result.then(() => undefined, () => undefined);
    return result;
  };
  const references = new WeakMap<Row, string[]>();
  const read = (id: string) => {
    if (!rowCache.has(id)) rowCache.set(id, raw.get(id as any));
    return rowCache.get(id)!;
  };
  const policyCtx = { ...ctx, db: new Proxy(raw, { get(target, key) {
    if (key === "get") return (id: string) => read(id);
    const value = Reflect.get(target, key); return typeof value === "function" ? value.bind(target) : value;
  } }) };
  const invalidate = (id: string) => { rowCache.clear(); decisions.clear(); resourceDecisions.clear(); completedReads.clear(); authorizationEpoch++; };
  function allowed(row: Row | null, capability: MissionCapability, seen = new Set<string>(), table?: string, epoch = authorizationEpoch): Promise<boolean> {
    if (epoch !== authorizationEpoch || pendingWrites) return Promise.resolve(false);
    if (capability !== "READ" || !row?._id) return evaluateAllowed(row, capability, seen, table, epoch);
    const key = row._id + ":" + (table ?? lineage.tableOf(row._id) ?? "");
    // Reuse only a fully checked root closure, never a partial recursive walk.
    const completed = completedReads.get(key);
    if (completed) {
      for (const id of completed) seen.add(id);
      return Promise.resolve(seen.size <= 256);
    }
    if (seen.size) return evaluateAllowed(row, capability, seen, table, epoch);
    if (!resourceDecisions.has(key)) {
      resourceDecisions.set(key, evaluateAllowed(row, capability, seen, table, epoch).then(result => {
        // Writes invalidate the entire traversal generation, including recursive
        // policy reads. An older traversal cannot publish into a newer generation.
        if (epoch !== authorizationEpoch) return false;
        if (result) completedReads.set(key, [...seen]);
        return result;
      }));
    }
    return resourceDecisions.get(key)!;
  }
  async function evaluateAllowed(row: Row | null, capability: MissionCapability, seen: Set<string>, table: string | undefined, epoch: number): Promise<boolean> {
    if (epoch !== authorizationEpoch) return false;
    if (!row) return true;
    table ??= row._id ? lineage.tableOf(row._id) ?? undefined : undefined;
    if (application && capability !== "READ") {
      const op = application.request.operation;
      if (table === "serviceCommandReceipts") {
        if (row.commandId !== application.envelope.commandId || row.serviceId !== application.envelope.serviceId
          || row.claimedProjectId !== application.connection.projectId || row.claimedRepositoryId !== application.envelope.repositoryId
          || row.payloadDigest !== application.envelope.payloadDigest || row.capability !== op) return false;
      } else if (table === "enterpriseMissionProposals") {
        if (op !== "enterprise.propose" && !(op === "enterprise.submit" && row._id === application.proposal?._id)) return false;
      } else if (table === "missionEvents") {
        if (op !== "enterprise.submit" || row.missionId !== createdMissionId || row.eventType !== "MISSION_CREATED") return false;
      } else return false;
    }
    if (table === "enterpriseAppConnections" || table === "enterpriseMissionProposals") {
      if (application) {
        if (row.ownerId !== application.connection.ownerId || row.tenantId !== application.connection.tenantId
          || row.projectId !== application.connection.projectId
          || (table === "enterpriseAppConnections" ? row._id !== application.connection._id : row.connectionId !== application.connection._id)) return false;
      } else {
        const identity = await ctx.auth.getUserIdentity();
        const owner = await read(row.ownerId);
        if (!identity || !owner?.active || owner.authId !== identity.subject || owner.tenantId !== row.tenantId) return false;
      }
    }
    if (table === "serviceCommandReceipts" && row.serviceId === SOFIE_APPLICATION) {
      const connectionId = row.claimedRepositoryId?.replace(/^connection:/, "");
      const connection = connectionId ? await read(connectionId) : null;
      if (!connection || !await allowed(connection, "READ", seen, "enterpriseAppConnections", epoch)) return false;
    }
    // These policy parents are read by the bounded service handlers, never returned as resources.
    if (service && ["missionPlans", "missionSpecRevisions"].includes(table ?? "")) {
      if (capability !== "READ" && seen.size === 0) return false;
      return row.missionId === service.missionId;
    }
    if (service && table === "workOrders" && row._id !== service.workOrderId) return false;
    if (service && table === "workflowRuns" && row._id !== service.workflowRunId) {
      const generatedVerifier = row.context?.sourceAttemptId === service.workflowRunId && row.attemptPurpose === "VERIFICATION";
      const grantedRun = await read(service.workflowRunId);
      const verificationInput = (capability === "READ" || service.allowedEffects.includes("verification.record"))
        && grantedRun?.verificationAttemptBinding?.sourceAttemptId === row._id;
      if (!(generatedVerifier && service.allowedEffects.includes("verification.request")) && !verificationInput) return false;
    }
    if (table === "missions") {
      if (application) return capability === "READ" && row._id === (application.missionId ?? createdMissionId)
        && row.ownerOperatorId === application.connection.ownerId && row.tenantId === application.connection.tenantId
        && row.projectId === application.connection.projectId;
      if (service) return row._id === service.missionId && row.ownerOperatorId === service.ownerOperatorId;
      if (epoch !== authorizationEpoch) return false;
      const key = row._id + ":" + capability;
      if (!decisions.has(key)) decisions.set(key, canAccessMission(policyCtx, row as any, capability));
      return decisions.get(key)!;
    }
    if (table === "serviceCommandReceipts" && /^(attempts\.|verification:)/.test(row.capability) && !row.missionId) return false;
    if (table === "metaLoopSuggestions" && (row.payload?.type === "WORKFLOW_FAILURE" || row.payload?.signalClass) && !Array.isArray(row.sourceMissionIds)) return false;
    if (table === "activities" && row.action === "STANDUP_REPORT" && (!Array.isArray(row.metadata?.sourceRunIds) || !Array.isArray(row.metadata?.sourceTaskIds) || !Array.isArray(row.metadata?.sourceApprovalIds))) return false;
    if (table === "activities" && /^PATTERN_(CREATED|UPDATED|DELETED|DISCOVERED)$/.test(row.action) && !Array.isArray(row.metadata?.sourceEvidence)) return false;
    if (table === "alerts" && ["SYSTEM_ERROR", "PERFORMANCE"].includes(row.type) && row.metadata?.missionProvenanceVersion !== 1) return false;
    if (table === "alerts" && row.type === "daily_cost_exceeded" && !Array.isArray(row.metadata?.sourceRunIds)) return false;
    if (table === "agentDocuments" && row.metadata?.loopDetection && !row.metadata.taskId) return false;
    if (table === "workflowMetrics" && !Array.isArray(row.sourceWorkflowRunIds)) return false;
    if (table === "agentPerformance" && !Array.isArray(row.sourceTaskIds)) return false;
    if (table === "inferenceRouteComparisons" && !Array.isArray(row.missionIds)) return false;
    if (row._id) {
      if (seen.has(row._id)) return true;
      seen.add(row._id);
    }
    if (seen.size > 256) return false;
    if (table === "knowledgeGraphEdges" || table === "knowledgeGraphHyperedges") {
      const endpoints = table === "knowledgeGraphEdges" ? [row.fromExternalId, row.toExternalId] : row.nodeExternalIds;
      for (const externalId of endpoints) {
        const nodes = await raw.query("knowledgeGraphNodes").withIndex("by_external", q => q.eq("source", row.source).eq("externalId", externalId))
          .filter(q => q.eq(q.field("projectId"), row.projectId)).take(2);
        if (nodes.length !== 1 || !await allowed(nodes[0], capability, seen, "knowledgeGraphNodes", epoch)) return false;
      }
    }
    const lineageRow = service && table === "workOrders" && row._id === service.workOrderId
      ? { ...row, dependencies: [] }
      : service && table === "workOrderRevisions" && row.workOrderId === service.workOrderId
        ? { ...row, ...Object.fromEntries(["requestedChanges", "previousSnapshot", "nextSnapshot"].map(key => [key, { ...row[key], dependencies: [] }])) }
        : row;
    const referenceRow = service ? serviceInputLineageRow(lineageRow, table, service) : lineageRow;
    if (!references.has(referenceRow)) references.set(referenceRow, lineage.references(referenceRow, table));
    for (const id of references.get(referenceRow)!) {
      const parent = await read(id);
      // Edge consistency is checked even when a completed closure visited its parent.
      if (!parent || (row.tenantId && parent.tenantId && row.tenantId !== parent.tenantId)
        || (row.projectId && parent.projectId && row.projectId !== parent.projectId)) return false;
      if (seen.has(id)) continue;
      if (!await allowed(parent, application ? "READ" : service && row._id === service.workflowRunId && row.verificationAttemptBinding?.sourceAttemptId === id ? "READ" : capability, seen, undefined, epoch)) return false;
    }
    return true;
  }
  async function assertWrite(row: Row, table: string | undefined, epoch: number) {
    if (!await allowed(row, writeCapability, new Set(), table, epoch) || epoch !== authorizationEpoch || pendingWrites) throw Error("MISSION_UNAVAILABLE");
  }
  // Agent identities are shared; their live Task/error and accounting fields are not.
  // spendToday is a compatibility alias for the explicitly named visible subtotal.
  // Enforcement and additive accounting must use missionAuthorityDatabase instead.
  async function projectRead(row: Row | null, table: string | undefined, epoch: number): Promise<any> {
    if (epoch !== authorizationEpoch || pendingWrites) return null;
    if (!row) return row;
    table ??= lineage.tableOf(row._id) ?? undefined;
    if (table === "alerts" && row.type === "BUDGET_EXCEEDED" && row.agentId) {
      return { ...row, description: "Agent daily budget limit reached", metadata: undefined };
    }
    if (table !== "agents") return row;
    const start = new Date(); start.setUTCHours(0, 0, 0, 0);
    let authorizedRunSpendToday = 0;
    for await (const run of raw.query("runs").withIndex("by_agent", q => q.eq("agentId", row._id))) {
      if (run.startedAt >= start.getTime() && (run.taskId || run.workflowRunId) && await allowed(run, "READ", new Set(), undefined, epoch)) authorizedRunSpendToday += run.costUsd;
    }
    const currentTask = row.currentTaskId ? await read(row.currentTaskId) : null;
    const { lastError: _lastError, errorStreak: _errorStreak, currentTaskId: _currentTaskId, ...identity } = row;
    if (epoch !== authorizationEpoch || pendingWrites) return null;
    return { ...identity, spendToday: authorizedRunSpendToday, authorizedRunSpendToday,
      spendScope: "AUTHORIZED_RUNS_UTC_DAY",
      ...(currentTask && await allowed(currentTask, "READ", new Set(), undefined, epoch) ? { currentTaskId: currentTask._id } : {}) };
  }
  function scopedQuery(query: any, table: string): any {
    async function* rows() {
      const epoch = authorizationEpoch;
      for await (const row of query) {
        if (await allowed(row, "READ", new Set(), table, epoch)) {
          const projected = await projectRead(row, table, epoch);
          if (epoch === authorizationEpoch && !pendingWrites && projected) yield projected;
        }
      }
    }
    return new Proxy(query, { get(target, key) {
      if (key === Symbol.asyncIterator) return rows;
      if (key === "collect") return async () => { const epoch = authorizationEpoch; const result: Row[] = []; for await (const row of rows()) result.push(row); return epoch === authorizationEpoch && !pendingWrites ? result : []; };
      if (key === "take") return async (count: number) => {
        const epoch = authorizationEpoch;
        if (!Number.isSafeInteger(count) || count < 0) throw Error("Invalid query limit");
        const result: Row[] = []; if (!count) return result;
        for await (const row of rows()) { result.push(row); if (result.length === count) break; } return epoch === authorizationEpoch && !pendingWrites ? result : [];
      };
      if (key === "first" || key === "unique") return async () => {
        const epoch = authorizationEpoch;
        const result: Row[] = []; for await (const row of rows()) { result.push(row); if (key === "first" || result.length === 2) break; }
        if (epoch !== authorizationEpoch || pendingWrites) return null;
        if (result.length > 1) throw Error("Query is not unique"); return result[0] ?? null;
      };
      if (key === "paginate") return async (options: any) => {
        const epoch = authorizationEpoch;
        const page = await target.paginate(options);
        const visible = []; for (const row of page.page) if (await allowed(row, "READ", new Set(), table, epoch)) visible.push(await projectRead(row, table, epoch));
        return { ...page, page: epoch === authorizationEpoch && !pendingWrites ? visible.filter(Boolean) : [] };
      };
      if (["withIndex", "withSearchIndex", "filter", "order", "fullTableScan"].includes(String(key))) {
        return (...args: any[]) => scopedQuery(target[key](...args), table);
      }
      const value = Reflect.get(target, key); return typeof value === "function" ? value.bind(target) : value;
    } });
  }
  const db = new Proxy(raw, { get(target: any, key) {
    if (key === "query") return (table: string) => scopedQuery(target.query(table), table);
    if (key === "get") return async (...args: any[]) => {
      const epoch = authorizationEpoch;
      const row = await read(args[args.length - 1]);
      if (await allowed(row, "READ", new Set(), undefined, epoch)) {
        const projected = await projectRead(row, undefined, epoch);
        if (epoch === authorizationEpoch && !pendingWrites) return projected;
      }
      return null;
    };
    if (key === "insert") return (table: string, row: Row) => serializedWrite(async () => {
      const epoch = authorizationEpoch;
      if (table === "missions") {
        if (service) throw Error("MISSION_OWNER_REQUIRED");
        if (application) {
          if (application.request.operation !== "enterprise.submit" || application.missionId || createdMissionId
            || row.ownerOperatorId !== application.connection.ownerId || row.tenantId !== application.connection.tenantId
            || row.projectId !== application.connection.projectId || row.state !== "DRAFT" || row.budgetUsd !== 0
            || row.metadata?.proposalId !== application.proposal?._id || row.metadata?.proposalDigest !== application.proposal?.digest
            || row.ownerMemberId || row.owningTeamId) throw Error("MISSION_OWNER_REQUIRED");
        } else if (!await canAccessMission(ctx, row as any, "OWNER")) throw Error("MISSION_OWNER_REQUIRED");
      } else await assertWrite(row, table, epoch);
      if (epoch !== authorizationEpoch || pendingWrites) throw Error("MISSION_UNAVAILABLE");
      pendingWrites++; invalidate("");
      try {
        const result = await target.insert(table, row);
        if (application && table === "missions") createdMissionId = result;
        return result;
      } finally { pendingWrites--; invalidate(""); }
    });
    if (key === "patch" || key === "replace" || key === "delete") return (...args: any[]) => serializedWrite(async () => {
      const epoch = authorizationEpoch;
      const idIndex = args.length === (key === "delete" ? 2 : 3) ? 1 : 0;
      const old = await target.get(args[idIndex]);
      if (!old) throw Error("MISSION_UNAVAILABLE");
      await assertWrite(old, undefined, epoch);
      if (key !== "delete") {
        const next = key === "patch" ? { ...old, ...args[idIndex + 1] } : { ...args[idIndex + 1], _id: old._id };
        // A caller may not attach a visible record to a foreign Mission.
        if (raw.normalizeId("missions", old._id)) {
          if (next.tenantId !== old.tenantId || next.projectId !== old.projectId) throw Error("MISSION_SCOPE_IMMUTABLE");
        } else await assertWrite(next, undefined, epoch);
      }
      if (epoch !== authorizationEpoch || pendingWrites) throw Error("MISSION_UNAVAILABLE");
      pendingWrites++; invalidate(args[idIndex]);
      try { return await target[key](...args); } finally { pendingWrites--; invalidate(args[idIndex]); }
    });
    if (key === "table") return (table: string) => ({
      get: (id: string) => (db as any).get(table, id), query: () => (db as any).query(table),
      insert: (value: Row) => (db as any).insert(table, value),
      patch: (id: string, value: Row) => (db as any).patch(table, id, value),
      replace: (id: string, value: Row) => (db as any).replace(table, id, value),
      delete: (id: string) => (db as any).delete(table, id),
    });
    const value = Reflect.get(target, key); return typeof value === "function" ? value.bind(target) : value;
  } });
  async function assertArguments(args: Row, epoch = authorizationEpoch) {
    for (const [key, value] of Object.entries(args)) {
      if (typeof value === "string" && (key === "id" || /Ids?$/.test(key))) {
        let record;
        try { record = await read(value); } catch { continue; }
        if (record && !await allowed(record, service ? "READ" : writeCapability, new Set(), undefined, epoch)) throw Error("MISSION_UNAVAILABLE");
      } else if (value && typeof value === "object") {
        if (Array.isArray(value)) {
          for (const item of value) await assertArguments(typeof item === "object" ? item : { id: item }, epoch);
        } else await assertArguments(value, epoch);
      }
    }
  }
  const scoped: any = { ...ctx, db, [authorityDatabase]: raw, [checkArguments]: assertArguments, [serviceAuthority]: service };
  if (serviceClaim) {
    const carry = (input: Row) => ({ ...input, __missionService: serviceClaim });
    for (const method of ["runQuery", "runMutation"] as const) if (method in ctx) {
      scoped[method] = (reference: any, input: Row) => (ctx as any)[method](reference, carry(input));
    }
    if ("scheduler" in ctx) scoped.scheduler = new Proxy(ctx.scheduler, { get(target: any, key) {
      if (key === "runAt" || key === "runAfter") return (when: any, reference: any, input: Row) => target[key](when, reference, carry(input));
      const value = Reflect.get(target, key); return typeof value === "function" ? value.bind(target) : value;
    } });
  }
  return scoped;

}

// Preserve Convex's generic builder signatures while substituting only the handler context.
export const query: typeof rawQuery = ((definition: any) => rawQuery({ ...definition,
  handler: (ctx: QueryCtx, args: any) => definition.handler(missionScopedContext(ctx), args),
})) as typeof rawQuery;
export const mutation: typeof rawMutation = ((definition: any) => rawMutation({ ...definition,
  handler: async (ctx: MutationCtx, args: any) => {
    const scoped = missionScopedContext(ctx);
    await (scoped as any)[checkArguments](args);
    return definition.handler(scoped, args);
  },
})) as typeof rawMutation;
export const contributorMutation: typeof rawMutation = ((definition: any) => rawMutation({ ...definition,
  handler: async (ctx: MutationCtx, args: any) => {
    const scoped = missionScopedContext(ctx, "CONTRIBUTE");
    await (scoped as any)[checkArguments](args);
    return definition.handler(scoped, args);
  },
})) as typeof rawMutation;

export const reviewerMutation: typeof rawMutation = ((definition: any) => rawMutation({ ...definition,
  handler: async (ctx: MutationCtx, args: any) => {
    const scoped = missionScopedContext(ctx, "VERIFY");
    await (scoped as any)[checkArguments](args);
    return definition.handler(scoped, args);
  },
})) as typeof rawMutation;

export const action: typeof rawAction = ((definition: any) => rawAction({ ...definition,
  handler: async (ctx: any, args: any) => {
    if (!await ctx.auth.getUserIdentity()) throw Error("AUTHENTICATED_PRINCIPAL_REQUIRED");
    return definition.handler(ctx, args);
  },
})) as typeof rawAction;

const serviceClaimValidator = v.optional(v.object({
  serviceId: v.string(), workflowRunId: v.id("workflowRuns"), capability: v.string(), expiresAt: v.number(),
}));
const serviceState = Symbol("missionServiceClaim");
export function bindServiceAttempt(ctx: any, claim: ServiceAttemptClaim) {
  if (!(serviceState in ctx)) throw Error("SERVICE_ATTEMPT_ACTION_REQUIRED");
  ctx[serviceState] = claim;
}
export const serviceAttemptAction: typeof rawAction = ((definition: any) => rawAction({ ...definition,
  handler: (ctx: any, args: any) => {
    const scoped: any = { ...ctx, [serviceState]: undefined };
    for (const method of ["runQuery", "runMutation"]) scoped[method] = (reference: any, input: any) => {
      const claim = scoped[serviceState];
      return ctx[method](reference, claim ? { ...input, __missionService: claim } : input);
    };
    return definition.handler(scoped, args);
  },
})) as typeof rawAction;

async function internalContext(ctx: Context, claim: ServiceAttemptClaim | undefined, capabilities: readonly string[]) {
  if (claim) {
    if (!capabilities.includes(claim.capability)) throw Error("SERVICE_EFFECT_NOT_ALLOWED");
    return missionScopedContext(ctx, "OWNER", await requireServiceAttemptAuthority(ctx, claim), claim);
  }
  return await ctx.auth.getUserIdentity() ? missionScopedContext(ctx) : ctx;
}
export const serviceInternalQuery = (capabilities: readonly string[]): typeof rawInternalQuery => ((definition: any) => rawInternalQuery({ ...definition,
  ...(definition.args ? { args: { ...definition.args, __missionService: serviceClaimValidator } } : {}),
  handler: async (ctx: QueryCtx, { __missionService, ...args }: any) => definition.handler(await internalContext(ctx, __missionService, capabilities), args),
})) as typeof rawInternalQuery;
export const serviceInternalMutation = (capabilities: readonly string[]): typeof rawInternalMutation => ((definition: any) => rawInternalMutation({ ...definition,
  ...(definition.args ? { args: { ...definition.args, __missionService: serviceClaimValidator } } : {}),
  handler: async (ctx: MutationCtx, { __missionService, ...args }: any) => {
    const scoped = await internalContext(ctx, __missionService, capabilities);
    if ((scoped as any)[checkArguments]) await (scoped as any)[checkArguments](args);
    return definition.handler(scoped, args);
  },
})) as typeof rawInternalMutation;

export const internalQuery = serviceInternalQuery([]);
export const internalMutation = serviceInternalMutation([]);

export const serviceInternalAction = (capabilities: readonly string[]): typeof rawInternalAction => ((definition: any) => rawInternalAction({ ...definition,
  args: { ...definition.args, __missionService: serviceClaimValidator },
  handler: async (ctx: any, { __missionService, ...args }: any) => {
    if (!__missionService) return definition.handler(ctx, args);
    if (!capabilities.includes(__missionService.capability)) throw Error("SERVICE_EFFECT_NOT_ALLOWED");
    const scoped = { ...ctx };
    for (const method of ["runQuery", "runMutation"]) scoped[method] = (reference: any, input: any) => ctx[method](reference, { ...input, __missionService });
    return definition.handler(scoped, args);
  },
})) as typeof rawInternalAction;

/** Only signed Sofie commands can reach the one application transaction. */
export const sofieApplicationAction: typeof rawAction = ((definition: any) => rawAction({ ...definition,
  handler: async (ctx: any, args: any) => {
    await authorizeSofieApplicationCommand(args);
    const scoped = { ...ctx,
      runMutation: (reference: any, input: any) => {
        if (getFunctionName(reference) !== "sofieEnterprise:apply" || JSON.stringify(input) !== JSON.stringify(args)) throw Error("ENTERPRISE_ACCESS_DENIED");
        return ctx.runMutation(reference, input);
      },
      runQuery: () => { throw Error("ENTERPRISE_ACCESS_DENIED"); },
      runAction: () => { throw Error("ENTERPRISE_ACCESS_DENIED"); },
    };
    return definition.handler(scoped, args);
  },
})) as typeof rawAction;

export const sofieApplicationMutation: typeof rawInternalMutation = ((definition: any) => rawInternalMutation({ ...definition,
  handler: async (ctx: MutationCtx, args: any) => {
    const authority = await requireSofieApplicationAuthority(ctx, args);
    const scoped = missionScopedContext(ctx, "OWNER", undefined, undefined, authority);
    // This authority cannot be carried into another function or scheduled operation.
    Object.assign(scoped, { runMutation: undefined, runQuery: undefined, scheduler: undefined });
    return definition.handler(scoped, args);
  },
})) as typeof rawInternalMutation;
