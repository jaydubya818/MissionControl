/**
 * Canonical Factory Incident Command.
 *
 * Incidents are a thin, append-only decision aggregate over existing evidence.
 * They do not copy traces, alerts, Attempts, releases, or audit records and do
 * not infer restoration from alert closure or runtime recovery.
 */

import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import {
  FACTORY_PERMISSIONS,
  requireWorkspacePermission,
  type FactoryPermission,
} from "../lib/companyAccess";
import {
  factoryIncidentContainmentActionValidator,
  factoryIncidentControlExecutionValidator,
  factoryIncidentEvidenceRefValidator,
  factoryIncidentPhaseValidator,
  factoryIncidentProposalKindValidator,
  factoryIncidentSeverityValidator,
  controlReceiptRejectionReason,
  evaluateIncidentWrite,
  incidentStatusForPhase,
  normalizeControlExecutions,
  normalizeEvidenceRefs,
  normalizeIncidentText,
  validateFactoryIncidentTransition,
  type FactoryIncidentPhase,
} from "../lib/factoryIncident";

const evidenceRefsArg = v.array(factoryIncidentEvidenceRefValidator);
const containmentActionsArg = v.array(factoryIncidentContainmentActionValidator);

function cleanIdempotencyKey(value: string) {
  const key = value.trim();
  if (!/^[A-Za-z0-9._:/-]{8,200}$/.test(key)) {
    throw new Error("Incident idempotency key is invalid.");
  }
  return key;
}

async function incidentWithAccess(
  ctx: any,
  incidentId: Id<"factoryIncidents">,
  permission: FactoryPermission = FACTORY_PERMISSIONS.VIEW,
) {
  const incident = await ctx.db.get(incidentId) as Doc<"factoryIncidents"> | null;
  if (!incident) throw new Error("Factory incident is unavailable or unauthorized.");
  const access = await requireWorkspacePermission(ctx, incident.projectId, permission);
  return { incident, access };
}

async function appendActivity(ctx: any, input: {
  incident: Doc<"factoryIncidents">;
  actorId: string;
  action: string;
  description: string;
  metadata?: Record<string, unknown>;
}) {
  await ctx.db.insert("activities", {
    tenantId: input.incident.tenantId,
    projectId: input.incident.projectId,
    actorType: "HUMAN",
    actorId: input.actorId,
    action: input.action,
    description: input.description,
    targetType: "FACTORY_INCIDENT",
    targetId: String(input.incident._id),
    metadata: input.metadata,
  });
}

const evidenceTables: Partial<Record<string, string>> = {
  MISSION: "missions",
  WORK_ORDER: "workOrders",
  TASK: "tasks",
  ATTEMPT: "workflowRuns",
  TRACE: "traces",
  TOOL_CALL: "toolCalls",
  MODEL_ROUTE: "modelCatalog",
  FACTORY_VERSION: "factoryDefinitionVersions",
  SANDBOX: "sandboxAllocations",
  RELEASE: "factoryReleases",
  ALERT: "alerts",
  EVIDENCE: "evidenceEnvelopes",
  AUDIT: "activities",
};

async function requireEvidenceScope(
  ctx: any,
  projectId: Id<"projects">,
  refs: Array<{ kind: string; recordId: string }>,
  requireCanonical = false,
) {
  for (const ref of refs) {
    const table = evidenceTables[ref.kind];
    if (!table) {
      if (requireCanonical) throw new Error("Incident evidence must reference a canonical durable record.");
      continue;
    }
    const normalizedId = ctx.db.normalizeId(table, ref.recordId);
    if (!normalizedId) {
      if (requireCanonical) throw new Error("Incident evidence must reference a canonical durable record.");
      continue; // External provider or repository reference.
    }
    const record = await ctx.db.get(normalizedId);
    if (!record || record.projectId !== projectId) {
      throw new Error("Incident evidence reference is unavailable or outside this workspace.");
    }
  }
}

async function requireCanonicalControlReceipts(
  ctx: any,
  projectId: Id<"projects">,
  earliestCreatedAt: number,
  executions: Array<{
    controlKey: string;
    commandReceipt: { kind: string; recordId: string };
    acknowledgmentReceipt: { kind: string; recordId: string };
    observedEffectReceipt: { kind: string; recordId: string };
    observedAt: number;
  }>,
) {
  for (const execution of executions) {
    for (const [receiptKind, receipt] of [
      ["command", execution.commandReceipt],
      ["acknowledgment", execution.acknowledgmentReceipt],
      ["effect", execution.observedEffectReceipt],
    ] as const) {
      const normalizedId = receipt.kind === "EVIDENCE"
        ? ctx.db.normalizeId("evidenceEnvelopes", receipt.recordId)
        : null;
      if (!normalizedId) {
        throw new Error("Control proof must reference a canonical durable receipt.");
      }
      const record = await ctx.db.get(normalizedId);
      const expectedCheckId = `factory-control:${execution.controlKey}:${receiptKind}`;
      if (!record || controlReceiptRejectionReason({
        projectId: record.projectId ? String(record.projectId) : undefined,
        expectedProjectId: String(projectId),
        result: record.result,
        checkId: record.checkId,
        expectedCheckId,
        createdAt: record._creationTime,
        earliestCreatedAt,
        observedAt: execution.observedAt,
      })) {
        throw new Error("Control receipt is unavailable, stale, or outside this workspace.");
      }
    }
  }
}

export const list = query({
  args: {
    projectId: v.id("projects"),
    status: v.optional(v.union(
      v.literal("OPEN"),
      v.literal("CONTAINED"),
      v.literal("RECOVERING"),
      v.literal("MONITORING"),
      v.literal("RESOLVED"),
    )),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireWorkspacePermission(ctx, args.projectId, FACTORY_PERMISSIONS.VIEW);
    const limit = Math.max(1, Math.min(100, Math.floor(args.limit ?? 50)));
    const rows = args.status
      ? await ctx.db.query("factoryIncidents")
          .withIndex("by_project_status", (q) => q.eq("projectId", args.projectId).eq("status", args.status!))
          .order("desc")
          .take(limit)
      : await ctx.db.query("factoryIncidents")
          .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
          .order("desc")
          .take(limit);
    return rows;
  },
});

export const get = query({
  args: { incidentId: v.id("factoryIncidents") },
  handler: async (ctx, args) => {
    const { incident } = await incidentWithAccess(ctx, args.incidentId);
    const [transitions, proposals] = await Promise.all([
      ctx.db.query("factoryIncidentTransitions")
        .withIndex("by_incident", (q) => q.eq("incidentId", incident._id))
        .collect(),
      ctx.db.query("factoryIncidentProposals")
        .withIndex("by_incident", (q) => q.eq("incidentId", incident._id))
        .collect(),
    ]);
    return { incident, transitions, proposals };
  },
});

export const getScopeInternal = internalQuery({
  args: { incidentId: v.id("factoryIncidents") },
  handler: async (ctx, args) => {
    const incident = await ctx.db.get(args.incidentId);
    if (!incident?.repositoryId) {
      throw new Error("Service incident proposals require an exact repository scope.");
    }
    return {
      projectId: incident.projectId,
      repositoryId: incident.repositoryId,
    };
  },
});

export const create = mutation({
  args: {
    projectId: v.id("projects"),
    repositoryId: v.optional(v.id("workspaceRepositories")),
    sourceFingerprint: v.string(),
    title: v.string(),
    summary: v.string(),
    severity: factoryIncidentSeverityValidator,
    commanderActorId: v.optional(v.string()),
    businessImpact: v.string(),
    recoveryObjective: v.string(),
    evidenceRefs: evidenceRefsArg,
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    const access = await requireWorkspacePermission(ctx, args.projectId, FACTORY_PERMISSIONS.IMPROVE);
    const idempotencyKey = cleanIdempotencyKey(args.idempotencyKey);
    const sourceFingerprint = args.sourceFingerprint.trim();
    if (!/^sha256=[a-f0-9]{64}$/.test(sourceFingerprint)) {
      throw new Error("Incident source fingerprint must be a canonical SHA-256 digest.");
    }
    const existingTransition = await ctx.db.query("factoryIncidentTransitions")
      .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", idempotencyKey))
      .first();
    if (existingTransition) {
      const existing = await ctx.db.get(existingTransition.incidentId);
      if (
        !existing
        || existing.projectId !== args.projectId
        || existing.repositoryId !== args.repositoryId
        || existing.sourceFingerprint !== sourceFingerprint
      ) {
        throw new Error("Incident idempotency key is already bound outside this request.");
      }
      return { incident: existing, created: false as const };
    }
    if (args.repositoryId) {
      const repository = await ctx.db.get(args.repositoryId);
      if (!repository || repository.projectId !== args.projectId) {
        throw new Error("Incident repository is unavailable or unauthorized.");
      }
    }
    const sameSource = await ctx.db.query("factoryIncidents")
      .withIndex("by_project_source", (q) => q.eq("projectId", args.projectId).eq("sourceFingerprint", sourceFingerprint))
      .first();
    if (sameSource) {
      if (sameSource.repositoryId !== args.repositoryId) {
        throw new Error("Incident source fingerprint is already bound to a different repository scope.");
      }
      return { incident: sameSource, created: false as const };
    }
    await requireEvidenceScope(ctx, args.projectId, args.evidenceRefs);
    const now = Date.now();
    const incidentKey = `INC-${now.toString(36).toUpperCase()}-${sourceFingerprint.slice(-6).toUpperCase()}`;
    const incidentId = await ctx.db.insert("factoryIncidents", {
      tenantId: access.project.tenantId,
      projectId: args.projectId,
      repositoryId: args.repositoryId,
      incidentKey,
      sourceFingerprint,
      title: normalizeIncidentText(args.title, "Incident title", 160),
      summary: normalizeIncidentText(args.summary, "Incident summary"),
      severity: args.severity,
      phase: "CLARIFY",
      status: "OPEN",
      commanderActorId: args.commanderActorId?.trim() || undefined,
      businessImpact: normalizeIncidentText(args.businessImpact, "Business impact"),
      recoveryObjective: normalizeIncidentText(args.recoveryObjective, "Recovery objective"),
      containmentState: "UNCONTAINED",
      authorityRestored: false,
      currentSequence: 1,
      createdByType: "HUMAN",
      createdBy: access.actorId,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("factoryIncidentTransitions", {
      tenantId: access.project.tenantId,
      projectId: args.projectId,
      incidentId,
      sequence: 1,
      toPhase: "CLARIFY",
      decisionKind: "DETECTION",
      actorType: "HUMAN",
      actorId: access.actorId,
      reason: normalizeIncidentText(args.summary, "Incident summary"),
      evidenceRefs: normalizeEvidenceRefs(args.evidenceRefs),
      containmentActions: [],
      controlExecutions: [],
      idempotencyKey,
      createdAt: now,
    });
    const incident = await ctx.db.get(incidentId) as Doc<"factoryIncidents">;
    await appendActivity(ctx, {
      incident,
      actorId: access.actorId,
      action: "FACTORY_INCIDENT_CREATED",
      description: `Created ${incident.incidentKey} at Clarify`,
      metadata: { severity: incident.severity, sourceFingerprint },
    });
    return { incident, created: true as const };
  },
});

export const advance = mutation({
  args: {
    incidentId: v.id("factoryIncidents"),
    expectedSequence: v.number(),
    nextPhase: factoryIncidentPhaseValidator,
    reason: v.string(),
    evidenceRefs: evidenceRefsArg,
    containmentActions: containmentActionsArg,
    controlExecutions: v.array(factoryIncidentControlExecutionValidator),
    restoreAuthority: v.optional(v.boolean()),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    const elevated = ["CONTAIN", "RESTORE", "RESOLVED"].includes(args.nextPhase);
    const { incident, access } = await incidentWithAccess(
      ctx,
      args.incidentId,
      elevated ? FACTORY_PERMISSIONS.APPROVE : FACTORY_PERMISSIONS.IMPROVE,
    );
    const idempotencyKey = cleanIdempotencyKey(args.idempotencyKey);
    const duplicate = await ctx.db.query("factoryIncidentTransitions")
      .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", idempotencyKey))
      .first();
    const writeDecision = evaluateIncidentWrite({
      currentSequence: incident.currentSequence,
      expectedSequence: args.expectedSequence,
      status: incident.status,
      targetIncidentId: String(incident._id),
      duplicateIncidentId: duplicate ? String(duplicate.incidentId) : undefined,
    });
    if (writeDecision.reason === "idempotency-key-bound-elsewhere") {
      throw new Error("Incident transition key is already bound.");
    }
    if (writeDecision.duplicate && duplicate) {
      return { incident, transition: duplicate, duplicate: true as const };
    }
    if (writeDecision.reason === "stale-sequence") {
      throw new Error("Incident changed since inspection; refresh before deciding.");
    }
    if (writeDecision.reason === "incident-resolved") throw new Error("Resolved incidents are immutable.");
    const containmentActions = [...new Set(args.containmentActions)];
    const controlExecutions = normalizeControlExecutions(args.controlExecutions, Date.now(), incident.createdAt);
    const evidenceRefs = normalizeEvidenceRefs(args.evidenceRefs);
    const priorTransitions = args.nextPhase === "RESTORE"
      ? await ctx.db.query("factoryIncidentTransitions")
          .withIndex("by_incident", (q) => q.eq("incidentId", incident._id))
          .collect()
      : [];
    const restorationControlKeys = priorTransitions
      .filter((transition) => transition.decisionKind === "CONTAINMENT")
      .flatMap((transition) => transition.containmentActions);
    await requireEvidenceScope(
      ctx,
      incident.projectId,
      evidenceRefs,
      args.nextPhase === "RESTORE" || args.nextPhase === "MEASURE",
    );
    await requireCanonicalControlReceipts(ctx, incident.projectId, incident.updatedAt, controlExecutions);
    const transitionError = validateFactoryIncidentTransition({
      currentPhase: incident.phase as FactoryIncidentPhase,
      nextPhase: args.nextPhase as FactoryIncidentPhase,
      containmentActions,
      controlExecutions,
      restorationControlKeys,
      measurementReferenceCount: args.nextPhase === "MEASURE" ? evidenceRefs.length : 0,
    });
    if (transitionError) throw new Error(`Incident transition denied (${transitionError}).`);
    if (args.nextPhase === "CONTAIN" && !incident.commanderActorId) {
      throw new Error("Assign an incident commander before containment.");
    }
    if (args.nextPhase === "RESTORE") {
      if (args.restoreAuthority !== true) throw new Error("Restoration requires an explicit authority decision.");
      if (evidenceRefs.length === 0 || controlExecutions.length === 0) {
        throw new Error("Restoration requires known-safe evidence and observed restored-control effects.");
      }
    } else if (args.restoreAuthority) {
      throw new Error("Authority restoration is valid only in the Restore phase.");
    }
    if (args.nextPhase === "RESOLVED" && !incident.authorityRestored) {
      throw new Error("An incident cannot resolve before explicit authority restoration.");
    }
    const now = Date.now();
    const sequence = incident.currentSequence + 1;
    const decisionKind = args.nextPhase === "CONTAIN"
      ? "CONTAINMENT" as const
      : args.nextPhase === "RESTORE"
        ? "RESTORATION" as const
        : args.nextPhase === "CORRECT"
          ? "CORRECTIVE_WORK" as const
          : args.nextPhase === "MEASURE"
            ? "MEASUREMENT" as const
            : args.nextPhase === "RESOLVED"
              ? "RESOLUTION" as const
              : "PHASE_ADVANCE" as const;
    const transitionId = await ctx.db.insert("factoryIncidentTransitions", {
      tenantId: incident.tenantId,
      projectId: incident.projectId,
      incidentId: incident._id,
      sequence,
      fromPhase: incident.phase,
      toPhase: args.nextPhase,
      decisionKind,
      actorType: "HUMAN",
      actorId: access.actorId,
      reason: normalizeIncidentText(args.reason, "Transition reason"),
      evidenceRefs,
      containmentActions,
      controlExecutions,
      idempotencyKey,
      createdAt: now,
    });
    const authorityRestored = args.nextPhase === "RESTORE" ? true : incident.authorityRestored;
    await ctx.db.patch(incident._id, {
      phase: args.nextPhase,
      status: incidentStatusForPhase(args.nextPhase),
      containmentState: args.nextPhase === "CONTAIN"
        ? "CONTAINED"
        : args.nextPhase === "RESTORE"
          ? "RESTORED"
          : incident.containmentState,
      authorityRestored,
      currentSequence: sequence,
      updatedAt: now,
      resolvedAt: args.nextPhase === "RESOLVED" ? now : undefined,
    });
    const transition = await ctx.db.get(transitionId);
    await appendActivity(ctx, {
      incident,
      actorId: access.actorId,
      action: `FACTORY_INCIDENT_${decisionKind}`,
      description: `${incident.incidentKey}: ${incident.phase} → ${args.nextPhase}`,
      metadata: {
        sequence,
        commandReceipts: controlExecutions.map((execution) => execution.commandReceipt),
        acknowledgmentReceipts: controlExecutions.map((execution) => execution.acknowledgmentReceipt),
        observedEffectReceipts: controlExecutions.map((execution) => execution.observedEffectReceipt),
        authorityRestored,
      },
    });
    return {
      incident: await ctx.db.get(incident._id),
      transition,
      duplicate: false as const,
    };
  },
});

export const assignCommander = mutation({
  args: {
    incidentId: v.id("factoryIncidents"),
    expectedSequence: v.number(),
    commanderActorId: v.string(),
    reason: v.string(),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    const { incident, access } = await incidentWithAccess(ctx, args.incidentId, FACTORY_PERMISSIONS.APPROVE);
    const idempotencyKey = cleanIdempotencyKey(args.idempotencyKey);
    const duplicate = await ctx.db.query("factoryIncidentTransitions")
      .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", idempotencyKey))
      .first();
    const writeDecision = evaluateIncidentWrite({
      currentSequence: incident.currentSequence,
      expectedSequence: args.expectedSequence,
      status: incident.status,
      targetIncidentId: String(incident._id),
      duplicateIncidentId: duplicate ? String(duplicate.incidentId) : undefined,
    });
    if (writeDecision.reason === "idempotency-key-bound-elsewhere") throw new Error("Incident transition key is already bound.");
    if (writeDecision.duplicate) {
      return { incident: await ctx.db.get(incident._id), duplicate: true as const };
    }
    if (!writeDecision.allowed) throw new Error(writeDecision.reason === "incident-resolved" ? "Resolved incidents are immutable." : "Incident changed since inspection; refresh before deciding.");
    const commanderActorId = args.commanderActorId.trim();
    if (commanderActorId.length < 3 || commanderActorId.length > 200) throw new Error("Incident commander identity is invalid.");
    const now = Date.now();
    const sequence = incident.currentSequence + 1;
    await ctx.db.insert("factoryIncidentTransitions", {
      tenantId: incident.tenantId,
      projectId: incident.projectId,
      incidentId: incident._id,
      sequence,
      fromPhase: incident.phase,
      toPhase: incident.phase,
      decisionKind: "COMMANDER_ASSIGNED",
      actorType: "HUMAN",
      actorId: access.actorId,
      reason: normalizeIncidentText(args.reason, "Commander assignment reason"),
      evidenceRefs: [],
      containmentActions: [],
      controlExecutions: [],
      idempotencyKey,
      createdAt: now,
    });
    await ctx.db.patch(incident._id, { commanderActorId, currentSequence: sequence, updatedAt: now });
    await appendActivity(ctx, {
      incident,
      actorId: access.actorId,
      action: "FACTORY_INCIDENT_COMMANDER_ASSIGNED",
      description: `Assigned incident commander for ${incident.incidentKey}`,
      metadata: { commanderActorId, sequence },
    });
    return { incident: await ctx.db.get(incident._id), duplicate: false as const };
  },
});

export const decideProposal = mutation({
  args: {
    proposalId: v.id("factoryIncidentProposals"),
    decision: v.union(v.literal("ACCEPTED"), v.literal("REJECTED")),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const proposal = await ctx.db.get(args.proposalId);
    if (!proposal) throw new Error("Incident proposal is unavailable or unauthorized.");
    const access = await requireWorkspacePermission(ctx, proposal.projectId, FACTORY_PERMISSIONS.APPROVE);
    if (proposal.status !== "OPEN") {
      if (proposal.status === args.decision) return proposal;
      throw new Error("Incident proposal decision is immutable.");
    }
    const now = Date.now();
    await ctx.db.patch(proposal._id, {
      status: args.decision,
      decidedBy: access.actorId,
      decidedAt: now,
      decisionReason: normalizeIncidentText(args.reason, "Proposal decision reason"),
    });
    const incident = await ctx.db.get(proposal.incidentId) as Doc<"factoryIncidents">;
    await appendActivity(ctx, {
      incident,
      actorId: access.actorId,
      action: `FACTORY_INCIDENT_PROPOSAL_${args.decision}`,
      description: `${args.decision.toLowerCase()} ${proposal.kind.toLowerCase()} proposal for ${incident.incidentKey}`,
      metadata: { proposalId: proposal._id },
    });
    return await ctx.db.get(proposal._id);
  },
});

export const fileFromService = internalMutation({
  args: {
    projectId: v.id("projects"),
    repositoryId: v.id("workspaceRepositories"),
    sourceFingerprint: v.string(),
    title: v.string(),
    summary: v.string(),
    severity: factoryIncidentSeverityValidator,
    businessImpact: v.string(),
    recoveryObjective: v.string(),
    evidenceRefs: evidenceRefsArg,
    agentId: v.optional(v.string()),
    serviceId: v.string(),
    serviceCommandReceiptId: v.id("serviceCommandReceipts"),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    const repository = await ctx.db.get(args.repositoryId);
    if (!project || !repository || repository.projectId !== project._id) {
      throw new Error("Incident service scope is invalid.");
    }
    const sourceFingerprint = args.sourceFingerprint.trim();
    if (!/^sha256=[a-f0-9]{64}$/.test(sourceFingerprint)) {
      throw new Error("Incident source fingerprint must be a canonical SHA-256 digest.");
    }
    const existing = await ctx.db.query("factoryIncidents")
      .withIndex("by_project_source", (q) => q.eq("projectId", project._id).eq("sourceFingerprint", sourceFingerprint))
      .first();
    if (existing) {
      if (existing.repositoryId !== repository._id) {
        throw new Error("Incident source fingerprint is already bound to a different repository scope.");
      }
      return existing;
    }
    await requireEvidenceScope(ctx, project._id, args.evidenceRefs);
    const now = Date.now();
    const actorId = args.agentId?.trim() || args.serviceId;
    const incidentId = await ctx.db.insert("factoryIncidents", {
      tenantId: project.tenantId,
      projectId: project._id,
      repositoryId: repository._id,
      incidentKey: `INC-${now.toString(36).toUpperCase()}-${sourceFingerprint.slice(-6).toUpperCase()}`,
      sourceFingerprint,
      title: normalizeIncidentText(args.title, "Incident title", 160),
      summary: normalizeIncidentText(args.summary, "Incident summary"),
      severity: args.severity,
      phase: "CLARIFY",
      status: "OPEN",
      businessImpact: normalizeIncidentText(args.businessImpact, "Business impact"),
      recoveryObjective: normalizeIncidentText(args.recoveryObjective, "Recovery objective"),
      containmentState: "UNCONTAINED",
      authorityRestored: false,
      currentSequence: 1,
      createdByType: args.agentId ? "AGENT" : "SERVICE",
      createdBy: actorId,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("factoryIncidentTransitions", {
      tenantId: project.tenantId,
      projectId: project._id,
      incidentId,
      sequence: 1,
      toPhase: "CLARIFY",
      decisionKind: "DETECTION",
      actorType: args.agentId ? "AGENT" : "SERVICE",
      actorId,
      reason: normalizeIncidentText(args.summary, "Incident summary"),
      evidenceRefs: normalizeEvidenceRefs(args.evidenceRefs),
      containmentActions: [],
      controlExecutions: [],
      idempotencyKey: `service-command:${args.serviceCommandReceiptId}`,
      createdAt: now,
    });
    return await ctx.db.get(incidentId);
  },
});

export const proposeFromService = internalMutation({
  args: {
    incidentId: v.id("factoryIncidents"),
    kind: factoryIncidentProposalKindValidator,
    summary: v.string(),
    evidenceRefs: evidenceRefsArg,
    containmentActions: containmentActionsArg,
    serviceId: v.string(),
    serviceCommandReceiptId: v.id("serviceCommandReceipts"),
  },
  handler: async (ctx, args) => {
    const incident = await ctx.db.get(args.incidentId);
    if (!incident) throw new Error("Incident proposal target is unavailable.");
    if (args.kind !== "CONTAINMENT" && args.containmentActions.length > 0) {
      throw new Error("Only containment proposals may include containment actions.");
    }
    if (args.kind === "CONTAINMENT" && args.containmentActions.length === 0) {
      throw new Error("Containment proposal requires at least one bounded action.");
    }
    await requireEvidenceScope(ctx, incident.projectId, args.evidenceRefs);
    const existing = await ctx.db.query("factoryIncidentProposals")
      .withIndex("by_incident", (q) => q.eq("incidentId", incident._id))
      .collect();
    const duplicate = existing.find((proposal) => proposal.serviceCommandReceiptId === args.serviceCommandReceiptId);
    if (duplicate) return duplicate;
    const proposalId = await ctx.db.insert("factoryIncidentProposals", {
      tenantId: incident.tenantId,
      projectId: incident.projectId,
      incidentId: incident._id,
      kind: args.kind,
      summary: normalizeIncidentText(args.summary, "Incident proposal"),
      evidenceRefs: normalizeEvidenceRefs(args.evidenceRefs),
      containmentActions: args.containmentActions,
      createdByService: args.serviceId,
      serviceCommandReceiptId: args.serviceCommandReceiptId,
      status: "OPEN",
      createdAt: Date.now(),
    });
    return await ctx.db.get(proposalId);
  },
});
