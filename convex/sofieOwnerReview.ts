import { v } from "convex/values";
import { mutation, query } from "./lib/missionScopedFunctions";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  COMPANY_PERMISSIONS,
  requireWorkspaceAccess,
} from "./lib/companyAccess";
import { currentConnection } from "./lib/sofieEnterpriseAuthority";
import { enterpriseDigest } from "../packages/shared/src/sofieEnterprise";
import { enterpriseMissionOwner } from "./lib/enterpriseMissionOwner";
import {
  resultMissionScope,
  projectEnterpriseResult,
} from "./lib/sofieEnterpriseResult";
import { projectMission } from "./sofieEnterprise";
import { acceptMission } from "./missions";

const binding = {
  projectId: v.id("projects"),
  proposalId: v.id("enterpriseMissionProposals"),
  expectedDigest: v.string(),
};
const denied = (): never => {
  throw Error("ENTERPRISE_ACCESS_DENIED");
};
async function ownedProposal(
  ctx: MutationCtx,
  args: {
    projectId: Id<"projects">;
    proposalId: Id<"enterpriseMissionProposals">;
    expectedDigest: string;
  },
) {
  const proposal = await ctx.db.get(args.proposalId);
  if (
    !proposal ||
    proposal.projectId !== args.projectId ||
    proposal.digest !== args.expectedDigest
  )
    return denied();
  const access = await requireWorkspaceAccess(
    ctx,
    proposal.tenantId,
    proposal.projectId,
    { permission: COMPANY_PERMISSIONS.APPROVE_DELIVERY },
  );
  if (
    access.membership.mode !== "AUTHENTICATED" ||
    access.membership.operatorId !== proposal.ownerId
  )
    return denied();
  const live = await currentConnection(ctx, proposal.connectionId);
  if (
    proposal.ownerId !== live.owner._id ||
    proposal.tenantId !== live.connection.tenantId ||
    proposal.digest !==
      enterpriseDigest({
        connectionId: proposal.connectionId,
        tenantId: proposal.tenantId,
        projectId: proposal.projectId,
        ownerId: proposal.ownerId,
        intentKey: proposal.intentKey,
        proposal: proposal.proposal,
      })
  )
    return denied();
  if (proposal.missionId) {
    const mission = await ctx.db.get(proposal.missionId);
    if (
      !mission ||
      mission.projectId !== proposal.projectId ||
      mission.tenantId !== proposal.tenantId ||
      (await enterpriseMissionOwner(ctx, mission)) !== proposal.ownerId
    )
      return denied();
  }
  return { ...live, proposal };
}
export const list = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const project = await ctx.db.get(projectId);
    if (!project?.tenantId) return [];
    const access = await requireWorkspaceAccess(
      ctx,
      project.tenantId,
      projectId,
      { permission: COMPANY_PERMISSIONS.APPROVE_DELIVERY },
    );
    if (
      access.membership.mode !== "AUTHENTICATED" ||
      !access.membership.operatorId
    )
      return [];
    const connections = await ctx.db
      .query("enterpriseAppConnections")
      .withIndex("by_owner", (q) =>
        q.eq("ownerId", access.membership.operatorId!),
      )
      .take(51);
    const rows = [];
    for (const connection of connections.slice(0, 50)) {
      if (
        connection.projectId !== projectId ||
        connection.tenantId !== project.tenantId ||
        connection.revokedAt !== undefined ||
        connection.expiresAt <= Date.now()
      )
        continue;
      for (const p of await ctx.db
        .query("enterpriseMissionProposals")
        .withIndex("by_connection_intent", (q) =>
          q.eq("connectionId", connection._id),
        )
        .take(51)) {
        if (
          p.ownerId === access.membership.operatorId &&
          p.projectId === projectId &&
          p.tenantId === project.tenantId
        )
          rows.push({
            id: p._id,
            digest: p.digest,
            title: p.proposal.title,
            missionId: p.missionId ?? null,
          });
      }
    }
    return rows.slice(0, 100);
  },
});

export const inspect = mutation({
  args: binding,
  handler: async (ctx, args) => {
    const { proposal, connection } = await ownedProposal(ctx, args);
    const status =
      proposal.revokedAt !== undefined
        ? "REJECTED"
        : proposal.expiresAt <= Date.now()
          ? "EXPIRED"
          : proposal.missionId
            ? "CREATED"
            : proposal.authorizedDigest === proposal.digest
              ? "AUTHORIZED"
              : "PENDING";
    const mission = proposal.missionId
      ? await ctx.db.get(proposal.missionId)
      : null;
    // Both projections are read-only and start only after ownedProposal has
    // authenticated the owner. They retain independent currentness checks.
    const [detail, { scope, result }] = await Promise.all([
      mission ? projectMission(ctx, mission, null) : Promise.resolve(null),
      (async () => {
        const scope = mission?.currentPlanId
          ? (await resultMissionScope(ctx, connection, mission._id)).scope
          : null;
        const result = scope ? await projectEnterpriseResult(
          ctx, { ...connection, resultScope: scope }, scope.missionId, scope.planDigest,
        ) : null;
        return { scope, result };
      })(),
    ]);
    return {
      proposalId: proposal._id,
      digest: proposal.digest,
      connectionId: connection._id,
      status,
      proposal: proposal.proposal,
      missionId: mission?._id ?? null,
      detail,
      result,
      resultDigest: result ? proofDigest(result) : null,
      sofieResultAuthorized: Boolean(
        scope &&
        connection.resultScope &&
        enterpriseDigest(scope) === enterpriseDigest(connection.resultScope),
      ),
    };
  },
});

function proofDigest(
  result: Awaited<ReturnType<typeof projectEnterpriseResult>>,
) {
  const { observedAt, freshUntil, ...evidence } = result;
  return enterpriseDigest(evidence);
}
export const authorizeResultRead = mutation({
  args: {
    ...binding,
    missionId: v.id("missions"),
    expectedPlanDigest: v.string(),
  },
  handler: async (ctx, args) => {
    const { proposal, connection } = await ownedProposal(ctx, args);
    if (
      proposal.revokedAt !== undefined ||
      proposal.expiresAt <= Date.now() ||
      proposal.missionId !== args.missionId
    )
      return denied();
    const { scope } = await resultMissionScope(ctx, connection, args.missionId);
    if (scope.planDigest !== args.expectedPlanDigest)
      throw Error("ENTERPRISE_PLAN_STALE");
    await ctx.db.patch(connection._id, { resultScope: scope });
    const idempotencyKey = `sofie-result-read:${connection._id}:${scope.planDigest}`;
    const audit = await ctx.db
      .query("missionEvents")
      .withIndex("by_idempotency", (q) =>
        q.eq("idempotencyKey", idempotencyKey),
      )
      .first();
    if (!audit)
      await ctx.db.insert("missionEvents", {
        missionId: args.missionId,
        projectId: proposal.projectId,
        tenantId: proposal.tenantId,
        eventType: "SOFIE_RESULT_READ_AUTHORIZED",
        actorType: "HUMAN",
        actorId: String(proposal.ownerId),
        timestamp: Date.now(),
        summary:
          "Owner authorized Sofie to read the exact Mission and Plan Result",
        idempotencyKey,
        metadata: {
          proposalId: proposal._id,
          connectionId: connection._id,
          planDigest: scope.planDigest,
          executionAuthority: "NONE",
        },
      });
    return { missionId: args.missionId, scope, executionAuthority: "NONE" };
  },
});

export const decideResult = mutation({
  args: {
    ...binding,
    missionId: v.id("missions"),
    expectedPlanDigest: v.string(),
    expectedResultDigest: v.string(),
    decision: v.union(v.literal("ACCEPT"), v.literal("REJECT")),
    reason: v.string(),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    const { proposal, connection, owner } = await ownedProposal(ctx, args);
    if (
      proposal.revokedAt !== undefined ||
      proposal.expiresAt <= Date.now() ||
      proposal.missionId !== args.missionId ||
      !args.idempotencyKey.trim() ||
      args.idempotencyKey.length > 200 ||
      args.reason.length > 2000
    )
      return denied();
    const prior = await ctx.db
      .query("missionEvents")
      .withIndex("by_idempotency", (q) =>
        q.eq("idempotencyKey", args.idempotencyKey),
      )
      .first();
    const decisionBinding = enterpriseDigest({
      proposalId: args.proposalId,
      missionId: args.missionId,
      planDigest: args.expectedPlanDigest,
      resultDigest: args.expectedResultDigest,
      decision: args.decision,
      reason: args.reason,
      ownerId: owner._id,
    });
    if (prior) {
      if (
        prior.missionId !== args.missionId ||
        prior.metadata?.decisionBinding !== decisionBinding
      )
        return denied();
      return {
        missionId: args.missionId,
        decision: args.decision,
        created: false,
      };
    }
    const { mission, scope } = await resultMissionScope(
      ctx,
      connection,
      args.missionId,
    );
    if (scope.planDigest !== args.expectedPlanDigest)
      throw Error("ENTERPRISE_PLAN_STALE");
    const result = await projectEnterpriseResult(
      ctx,
      { ...connection, resultScope: scope },
      args.missionId,
      scope.planDigest,
    );
    if (
      mission.state !== "AWAITING_ACCEPTANCE" ||
      result.status !== "AVAILABLE" ||
      result.freshUntil <= Date.now() ||
      proofDigest(result) !== args.expectedResultDigest
    )
      throw Error("ENTERPRISE_RESULT_STALE");
    if (args.decision === "ACCEPT") {
      const accepted = await acceptMission(ctx, {
        missionId: mission._id,
        acceptedBy: String(owner._id),
        idempotencyKey: "owner-review-accept:" + args.idempotencyKey,
      });
      if (accepted.mission?.state !== "DONE")
        throw Error("ENTERPRISE_ACCEPTANCE_NOT_CONFIRMED");
    } else {
      if (!args.reason.trim()) throw Error("A rejection reason is required");
      await ctx.db.patch(mission._id, {
        state: "BLOCKED",
        blockingReason: args.reason.trim(),
        requiredHumanAction:
          "Owner rejected the Result. Review the reason and revise the plan before resubmission.",
        updatedAt: Date.now(),
      });
    }
    await ctx.db.insert("missionEvents", {
      missionId: mission._id,
      projectId: mission.projectId,
      tenantId: mission.tenantId,
      eventType: "OWNER_RESULT_" + args.decision,
      actorType: "HUMAN",
      actorId: String(owner._id),
      timestamp: Date.now(),
      summary:
        args.decision === "ACCEPT"
          ? "Owner accepted exact enterprise Result"
          : "Owner rejected enterprise Result",
      idempotencyKey: args.idempotencyKey,
      metadata: {
        decisionBinding,
        proposalId: proposal._id,
        planDigest: scope.planDigest,
        resultDigest: args.expectedResultDigest,
        reason: args.reason,
      },
    });
    return {
      missionId: args.missionId,
      decision: args.decision,
      created: true,
    };
  },
});
