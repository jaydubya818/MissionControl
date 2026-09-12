import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { COMPANY_PERMISSIONS } from "./lib/companyAccess";
import {
  assertAuthorizedDeliveryRecord,
  requireAuthorizedDeliveryScope,
} from "./lib/deliveryAuthorization";
import { resolveFlag, type FlagRow } from "./lib/flags";
import {
  MISSION_INTENT_CONTRIBUTION_FLAG,
  MISSION_INTENT_LIMITS,
  assertMissionIntentText,
  missionIntentContributionDigest,
  projectMissionIntentContributions,
  type MissionIntentContributorRole,
  type MissionIntentTargetSection,
} from "./lib/missionIntentContributions";
import {
  missionIntentContributorRoleValidator,
  missionIntentDecisionValidator,
  missionIntentTargetSectionValidator,
} from "./lib/missionIntentContributionValidators";

type Ctx = QueryCtx | MutationCtx;
const CONTRIBUTION_KEY = /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+$/;

async function requireMission(ctx: Ctx, projectId: Id<"projects">, missionId: Id<"missions">, write = false) {
  const access = await requireAuthorizedDeliveryScope(
    ctx,
    projectId,
    write ? COMPANY_PERMISSIONS.UPDATE_DELIVERY : undefined,
  );
  const [project, mission] = await Promise.all([ctx.db.get(projectId), ctx.db.get(missionId)]);
  if (!project) throw new Error("Workspace not found");
  if (!mission || mission.projectId !== projectId) throw new Error("Mission does not belong to the selected workspace");
  assertAuthorizedDeliveryRecord(access, mission);
  return { project, mission };
}

async function writesEnabled(ctx: Ctx, projectId: Id<"projects">) {
  const rows = await ctx.db.query("featureFlags")
    .withIndex("by_key", (q) => q.eq("key", MISSION_INTENT_CONTRIBUTION_FLAG))
    .collect() as FlagRow[];
  return resolveFlag(rows, MISSION_INTENT_CONTRIBUTION_FLAG, projectId).enabled;
}

async function currentRevision(ctx: Ctx, mission: Doc<"missions">) {
  if (!mission.currentSpecRevisionId) throw new Error("Save a Mission Spec revision before drafting contributions");
  const revision = await ctx.db.get(mission.currentSpecRevisionId);
  if (!revision || revision.missionId !== mission._id) throw new Error("Current Mission Spec revision is unavailable");
  return revision;
}

async function contributionProjection(ctx: Ctx, mission: Doc<"missions">) {
  const [revision, contributions, decisions] = await Promise.all([
    mission.currentSpecRevisionId ? ctx.db.get(mission.currentSpecRevisionId) : null,
    ctx.db.query("missionIntentContributions").withIndex("by_mission", (q) => q.eq("missionId", mission._id)).order("desc").take(MISSION_INTENT_LIMITS.list),
    ctx.db.query("missionIntentContributionDecisions").withIndex("by_mission", (q) => q.eq("missionId", mission._id)).order("desc").take(MISSION_INTENT_LIMITS.list),
  ]);
  return projectMissionIntentContributions({
    contributions: contributions.map((item) => ({ ...item, _id: String(item._id), supersedesContributionId: item.supersedesContributionId ? String(item.supersedesContributionId) : undefined, missionSpecRevisionId: String(item.missionSpecRevisionId) })),
    decisions: decisions.map((item) => ({ ...item, contributionId: String(item.contributionId) })),
    currentSpecRevisionId: revision ? String(revision._id) : undefined,
    currentSpecDigest: revision?.digest,
  });
}

async function audit(ctx: MutationCtx, args: {
  project: Doc<"projects">;
  actorId: string;
  actorType: "HUMAN" | "AGENT";
  action: string;
  description: string;
  targetType: string;
  targetId: string;
  metadata: Record<string, unknown>;
}) {
  await ctx.db.insert("activities", {
    tenantId: args.project.tenantId,
    projectId: args.project._id,
    actorType: args.actorType,
    actorId: args.actorId,
    action: args.action,
    description: args.description,
    targetType: args.targetType,
    targetId: args.targetId,
    metadata: args.metadata,
  });
}

type DraftArgs = {
  projectId: Id<"projects">;
  missionId: Id<"missions">;
  expectedCurrentSpecRevisionId: Id<"missionSpecRevisions">;
  expectedCurrentSpecDigest: string;
  expectedLatestContributionId?: Id<"missionIntentContributions">;
  contributionKey: string;
  contributorRole: MissionIntentContributorRole;
  targetSection: MissionIntentTargetSection;
  targetItemId?: string;
  title: string;
  body: string;
  evidenceExpectation: string;
  idempotencyKey: string;
};

async function draft(ctx: MutationCtx, args: DraftArgs, actor: {
  id: string;
  type: "HUMAN" | "AGENT";
  source: "AUTHENTICATED" | "DEVELOPMENT_FALLBACK" | "SERVICE_COMMAND";
}) {
  let scoped;
  if (actor.source === "SERVICE_COMMAND") {
    const [project, mission] = await Promise.all([ctx.db.get(args.projectId), ctx.db.get(args.missionId)]);
    if (!project) throw new Error("Workspace not found");
    if (!mission || mission.projectId !== project._id) throw new Error("Mission does not belong to the selected workspace");
    scoped = { project, mission };
  } else {
    scoped = await requireMission(ctx, args.projectId, args.missionId, true);
  }
  const { project, mission } = scoped;
  if (!await writesEnabled(ctx, project._id)) throw new Error(`Shared builder intent is disabled (${MISSION_INTENT_CONTRIBUTION_FLAG})`);
  const spec = await currentRevision(ctx, mission);
  if (spec._id !== args.expectedCurrentSpecRevisionId || spec.digest !== args.expectedCurrentSpecDigest) {
    throw new Error("Mission Spec changed in another session. Reload before drafting a contribution.");
  }
  if (!CONTRIBUTION_KEY.test(args.contributionKey)) throw new Error("Contribution key must be a stable uppercase identifier such as QA-AC-001");
  const duplicate = await ctx.db.query("missionIntentContributions").withIndex("by_idempotency", (q) => q.eq("idempotencyKey", args.idempotencyKey)).first();
  if (duplicate) {
    if (duplicate.missionId !== mission._id) throw new Error("Idempotency key is already bound to another Mission");
    return { contribution: duplicate, created: false };
  }
  const latest = await ctx.db.query("missionIntentContributions")
    .withIndex("by_mission_key_revision", (q) => q.eq("missionId", mission._id).eq("contributionKey", args.contributionKey))
    .order("desc").first();
  if ((latest?._id ?? null) !== (args.expectedLatestContributionId ?? null)) {
    throw new Error("Contribution changed in another session. Reload before creating a revision.");
  }
  const title = assertMissionIntentText(args.title, "Contribution title", MISSION_INTENT_LIMITS.title);
  const body = assertMissionIntentText(args.body, "Proposed change", MISSION_INTENT_LIMITS.body);
  const evidenceExpectation = assertMissionIntentText(args.evidenceExpectation, "Evidence expectation", MISSION_INTENT_LIMITS.evidenceExpectation);
  const targetItemId = args.targetItemId?.trim() || undefined;
  if (targetItemId && targetItemId.length > MISSION_INTENT_LIMITS.targetItemId) throw new Error(`Target item ID is limited to ${MISSION_INTENT_LIMITS.targetItemId} characters`);
  const now = Date.now();
  const digestInput = {
    contributionKey: args.contributionKey,
    revisionNumber: (latest?.revisionNumber ?? 0) + 1,
    supersedesContributionId: latest ? String(latest._id) : undefined,
    missionSpecRevisionId: String(spec._id),
    missionSpecDigest: spec.digest,
    contributorRole: args.contributorRole,
    targetSection: args.targetSection,
    targetItemId,
    title,
    body,
    evidenceExpectation,
    proposedBy: actor.id,
    proposedActorType: actor.type,
    proposedActorSource: actor.source,
  };
  const contributionId = await ctx.db.insert("missionIntentContributions", {
    tenantId: mission.tenantId,
    projectId: project._id,
    missionId: mission._id,
    missionSpecRevisionId: spec._id,
    missionSpecDigest: spec.digest,
    idempotencyKey: args.idempotencyKey,
    contributionKey: args.contributionKey,
    revisionNumber: digestInput.revisionNumber,
    supersedesContributionId: latest?._id,
    contributorRole: args.contributorRole,
    targetSection: args.targetSection,
    targetItemId,
    title,
    body,
    evidenceExpectation,
    digest: missionIntentContributionDigest(digestInput),
    proposedBy: actor.id,
    proposedActorType: actor.type,
    proposedActorSource: actor.source,
    proposedAt: now,
  });
  const contribution = await ctx.db.get(contributionId);
  await audit(ctx, {
    project,
    actorId: actor.id,
    actorType: actor.type,
    action: "MISSION_INTENT_CONTRIBUTION_DRAFTED",
    description: `Drafted ${args.contributorRole} contribution ${args.contributionKey} revision ${digestInput.revisionNumber}`,
    targetType: "MISSION_INTENT_CONTRIBUTION",
    targetId: String(contributionId),
    metadata: { missionId: mission._id, missionSpecRevisionId: spec._id, missionSpecDigest: spec.digest, contributionKey: args.contributionKey, actorSource: actor.source, proposalOnly: true, acceptanceAuthority: false },
  });
  return { contribution, created: true };
}

const draftArgs = {
  projectId: v.id("projects"),
  missionId: v.id("missions"),
  expectedCurrentSpecRevisionId: v.id("missionSpecRevisions"),
  expectedCurrentSpecDigest: v.string(),
  expectedLatestContributionId: v.optional(v.id("missionIntentContributions")),
  contributionKey: v.string(),
  contributorRole: missionIntentContributorRoleValidator,
  targetSection: missionIntentTargetSectionValidator,
  targetItemId: v.optional(v.string()),
  title: v.string(),
  body: v.string(),
  evidenceExpectation: v.string(),
  idempotencyKey: v.string(),
};

export const list = query({
  args: { projectId: v.id("projects"), missionId: v.id("missions") },
  handler: async (ctx, args) => {
    const { mission } = await requireMission(ctx, args.projectId, args.missionId);
    return { enabled: await writesEnabled(ctx, args.projectId), items: await contributionProjection(ctx, mission) };
  },
});

export const inspectInternal = internalQuery({
  args: { projectId: v.id("projects"), missionId: v.id("missions") },
  handler: async (ctx, args) => {
    const mission = await ctx.db.get(args.missionId);
    if (!mission || mission.projectId !== args.projectId) throw new Error("Mission contribution scope is unavailable");
    return { items: await contributionProjection(ctx, mission) };
  },
});

export const draftHuman = mutation({
  args: draftArgs,
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    return draft(ctx, args, identity
      ? { id: identity.subject, type: "HUMAN", source: "AUTHENTICATED" }
      : { id: "development:local-operator", type: "HUMAN", source: "DEVELOPMENT_FALLBACK" });
  },
});

export const draftAgentInternal = internalMutation({
  args: { ...draftArgs, agentId: v.string() },
  handler: async (ctx, args) => draft(ctx, args, {
    id: assertMissionIntentText(args.agentId, "Agent ID", 200),
    type: "AGENT",
    source: "SERVICE_COMMAND",
  }),
});

export const decideHuman = mutation({
  args: {
    projectId: v.id("projects"),
    missionId: v.id("missions"),
    contributionId: v.id("missionIntentContributions"),
    expectedCurrentSpecRevisionId: v.id("missionSpecRevisions"),
    expectedCurrentSpecDigest: v.string(),
    decision: missionIntentDecisionValidator,
    reason: v.string(),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    const { project, mission } = await requireMission(ctx, args.projectId, args.missionId, true);
    if (!await writesEnabled(ctx, project._id)) throw new Error(`Shared builder intent is disabled (${MISSION_INTENT_CONTRIBUTION_FLAG})`);
    const spec = await currentRevision(ctx, mission);
    if (spec._id !== args.expectedCurrentSpecRevisionId || spec.digest !== args.expectedCurrentSpecDigest) throw new Error("Mission Spec changed in another session. Reload before deciding.");
    const duplicate = await ctx.db.query("missionIntentContributionDecisions").withIndex("by_idempotency", (q) => q.eq("idempotencyKey", args.idempotencyKey)).first();
    if (duplicate) {
      if (duplicate.missionId !== mission._id) throw new Error("Idempotency key is already bound to another Mission");
      return { decision: duplicate, created: false };
    }
    const contribution = await ctx.db.get(args.contributionId);
    if (!contribution || contribution.missionId !== mission._id) throw new Error("Contribution not found");
    const expectedContributionDigest = missionIntentContributionDigest({
      contributionKey: contribution.contributionKey,
      revisionNumber: contribution.revisionNumber,
      supersedesContributionId: contribution.supersedesContributionId ? String(contribution.supersedesContributionId) : undefined,
      missionSpecRevisionId: String(contribution.missionSpecRevisionId),
      missionSpecDigest: contribution.missionSpecDigest,
      contributorRole: contribution.contributorRole,
      targetSection: contribution.targetSection,
      targetItemId: contribution.targetItemId,
      title: contribution.title,
      body: contribution.body,
      evidenceExpectation: contribution.evidenceExpectation,
      proposedBy: contribution.proposedBy,
      proposedActorType: contribution.proposedActorType,
      proposedActorSource: contribution.proposedActorSource,
    });
    if (contribution.digest !== expectedContributionDigest) throw new Error("Contribution digest does not match immutable content");
    if (contribution.missionSpecRevisionId !== spec._id || contribution.missionSpecDigest !== spec.digest) throw new Error("Contribution is stale. Revise it against the current Mission Spec before deciding.");
    const latest = await ctx.db.query("missionIntentContributions")
      .withIndex("by_mission_key_revision", (q) => q.eq("missionId", mission._id).eq("contributionKey", contribution.contributionKey))
      .order("desc").first();
    if (latest?._id !== contribution._id) throw new Error("Only the latest contribution revision can be decided");
    const existing = await ctx.db.query("missionIntentContributionDecisions").withIndex("by_contribution", (q) => q.eq("contributionId", contribution._id)).first();
    if (existing) throw new Error(`Contribution was already ${existing.decision.toLowerCase()}; decisions are immutable`);
    if (args.decision === "ACCEPTED") {
      const projected = await contributionProjection(ctx, mission);
      const row = projected.find((item) => item._id === String(contribution._id));
      if (row?.state === "CONFLICT") throw new Error("Resolve competing proposals for this target before accepting one");
    }
    const reason = assertMissionIntentText(args.reason, "Decision reason", MISSION_INTENT_LIMITS.decisionReason);
    const identity = await ctx.auth.getUserIdentity();
    const operator = identity
      ? { id: identity.subject, source: "AUTHENTICATED" as const }
      : { id: "development:local-operator", source: "DEVELOPMENT_FALLBACK" as const };
    const decisionId = await ctx.db.insert("missionIntentContributionDecisions", {
      tenantId: mission.tenantId,
      projectId: project._id,
      missionId: mission._id,
      contributionId: contribution._id,
      contributionDigest: contribution.digest,
      missionSpecRevisionId: spec._id,
      missionSpecDigest: spec.digest,
      idempotencyKey: args.idempotencyKey,
      decision: args.decision,
      reason,
      decidedBy: operator.id,
      decidedActorSource: operator.source,
      decidedAt: Date.now(),
    });
    const decision = await ctx.db.get(decisionId);
    await audit(ctx, {
      project,
      actorId: operator.id,
      actorType: "HUMAN",
      action: "MISSION_INTENT_CONTRIBUTION_DECIDED",
      description: `${args.decision === "ACCEPTED" ? "Accepted" : "Rejected"} contribution ${contribution.contributionKey} revision ${contribution.revisionNumber}`,
      targetType: "MISSION_INTENT_CONTRIBUTION_DECISION",
      targetId: String(decisionId),
      metadata: { missionId: mission._id, contributionId: contribution._id, contributionDigest: contribution.digest, decision: args.decision, actorSource: operator.source, mutatesSpec: false, acceptanceAuthority: false },
    });
    return { decision, created: true };
  },
});
