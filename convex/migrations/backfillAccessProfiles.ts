import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { PersonaKey } from "@mission-control/shared";
import {
  COMPANY_PERMISSIONS,
  requireCompanyPermission,
} from "../lib/companyAccess";
import {
  isScopeAllowedForPersona,
  mapLegacyRoleNameToPersona,
} from "../lib/accessControl";

type MigrationCtx = QueryCtx | MutationCtx;

type AssignmentScope = NonNullable<Doc<"roleAssignments">["scope"]>;

interface MigrationCandidate {
  operatorId: Id<"operators">;
  operatorName: string;
  operatorActive: boolean;
  systemKey: PersonaKey;
  sourceRoleId: Id<"roles">;
  sourceRoleName: string;
  scope: AssignmentScope;
}

function normalizedScope(
  tenantId: Id<"tenants">,
  assignment: Doc<"roleAssignments">,
): AssignmentScope {
  return assignment.scope ?? { type: "tenant", id: String(tenantId) };
}

async function buildReport(ctx: MigrationCtx, tenantId: Id<"tenants">) {
  const [operators, roles] = await Promise.all([
    ctx.db
      .query("operators")
      .withIndex("by_tenant", (q) => q.eq("tenantId", tenantId))
      .collect(),
    ctx.db
      .query("roles")
      .withIndex("by_tenant", (q) => q.eq("tenantId", tenantId))
      .collect(),
  ]);
  const roleById = new Map(roles.map((role) => [role._id, role]));
  const systemRoleByKey = new Map(
    roles
      .filter((role): role is Doc<"roles"> & { systemKey: PersonaKey } => Boolean(role.systemKey))
      .map((role) => [role.systemKey, role]),
  );

  const ready: MigrationCandidate[] = [];
  const alreadyMapped: Array<{ operatorId: Id<"operators">; operatorName: string; systemKey: PersonaKey }> = [];
  const manualReview: Array<{
    operatorId: Id<"operators">;
    operatorName: string;
    reason: "NO_EXACT_MATCH" | "MULTIPLE_PRIMARY_PERSONAS" | "AMBIGUOUS_EXACT_MATCH" | "INVALID_SCOPE";
    details: string;
  }> = [];

  for (const operator of operators) {
    const assignments = await ctx.db
      .query("roleAssignments")
      .withIndex("by_operator", (q) => q.eq("operatorId", operator._id))
      .collect();
    const tenantAssignments = assignments
      .map((assignment) => ({ assignment, role: roleById.get(assignment.roleId) }))
      .filter((item): item is { assignment: Doc<"roleAssignments">; role: Doc<"roles"> } =>
        Boolean(item.role?.tenantId === tenantId)
      );
    const personaAssignments = tenantAssignments.filter((item) => Boolean(item.role.systemKey));
    if (personaAssignments.length === 1) {
      alreadyMapped.push({
        operatorId: operator._id,
        operatorName: operator.name,
        systemKey: personaAssignments[0].role.systemKey as PersonaKey,
      });
      continue;
    }
    if (personaAssignments.length > 1) {
      manualReview.push({
        operatorId: operator._id,
        operatorName: operator.name,
        reason: "MULTIPLE_PRIMARY_PERSONAS",
        details: personaAssignments.map((item) => item.role.name).join(", "),
      });
      continue;
    }

    const exactMatches = tenantAssignments.flatMap(({ assignment, role }) => {
      const systemKey = mapLegacyRoleNameToPersona(role.name);
      return systemKey ? [{ assignment, role, systemKey }] : [];
    });
    if (exactMatches.length === 0) {
      manualReview.push({
        operatorId: operator._id,
        operatorName: operator.name,
        reason: "NO_EXACT_MATCH",
        details: tenantAssignments.map((item) => item.role.name).join(", ") || "No assigned role",
      });
      continue;
    }
    const candidateKeys = new Set(exactMatches.map((item) => item.systemKey));
    if (candidateKeys.size !== 1 || exactMatches.length !== 1) {
      manualReview.push({
        operatorId: operator._id,
        operatorName: operator.name,
        reason: "AMBIGUOUS_EXACT_MATCH",
        details: exactMatches.map((item) => `${item.role.name} → ${item.systemKey}`).join(", "),
      });
      continue;
    }
    const match = exactMatches[0];
    const scope = normalizedScope(tenantId, match.assignment);
    if (!isScopeAllowedForPersona(match.systemKey, scope.type)) {
      manualReview.push({
        operatorId: operator._id,
        operatorName: operator.name,
        reason: "INVALID_SCOPE",
        details: `${match.role.name} maps to ${match.systemKey}, which cannot use ${scope.type} scope`,
      });
      continue;
    }
    if (!systemRoleByKey.has(match.systemKey)) {
      manualReview.push({
        operatorId: operator._id,
        operatorName: operator.name,
        reason: "NO_EXACT_MATCH",
        details: `${match.systemKey} access profile is not initialized`,
      });
      continue;
    }
    ready.push({
      operatorId: operator._id,
      operatorName: operator.name,
      operatorActive: operator.active,
      systemKey: match.systemKey,
      sourceRoleId: match.role._id,
      sourceRoleName: match.role.name,
      scope,
    });
  }

  return {
    tenantId,
    exactOnly: true as const,
    profilesInitialized: systemRoleByKey.size === 4,
    counts: {
      operators: operators.length,
      ready: ready.length,
      alreadyMapped: alreadyMapped.length,
      manualReview: manualReview.length,
    },
    ready,
    alreadyMapped,
    manualReview,
    systemRoleByKey,
  };
}

export const dryRun = query({
  args: { tenantId: v.id("tenants") },
  handler: async (ctx, args) => {
    await requireCompanyPermission(
      ctx,
      args.tenantId,
      COMPANY_PERMISSIONS.MANAGE_ACCESS_PROFILES,
    );
    const report = await buildReport(ctx, args.tenantId);
    return {
      tenantId: report.tenantId,
      exactOnly: report.exactOnly,
      profilesInitialized: report.profilesInitialized,
      counts: report.counts,
      ready: report.ready,
      alreadyMapped: report.alreadyMapped,
      manualReview: report.manualReview,
    };
  },
});

export const applyExactMatches = mutation({
  args: {
    tenantId: v.id("tenants"),
    expectedReadyCount: v.number(),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requireCompanyPermission(
      ctx,
      args.tenantId,
      COMPANY_PERMISSIONS.MANAGE_ACCESS_PROFILES,
    );
    const reason = args.reason.trim();
    if (reason.length < 3 || reason.length > 1_000) {
      throw new Error("Migration reason must be between 3 and 1,000 characters.");
    }
    const report = await buildReport(ctx, args.tenantId);
    if (!report.profilesInitialized) {
      throw new Error("Initialize all four access profiles before migrating members.");
    }
    if (report.counts.ready !== args.expectedReadyCount) {
      throw new Error("Migration candidates changed after the dry run. Run the preview again.");
    }

    const assignmentIds: Id<"roleAssignments">[] = [];
    for (const candidate of report.ready) {
      const role = report.systemRoleByKey.get(candidate.systemKey);
      if (!role) throw new Error(`${candidate.systemKey} access profile is unavailable.`);
      assignmentIds.push(await ctx.db.insert("roleAssignments", {
        operatorId: candidate.operatorId,
        roleId: role._id,
        scope: candidate.scope,
        assignedBy: actor.operatorId,
        assignedAt: Date.now(),
        metadata: {
          primaryPersona: true,
          migratedExactOnly: true,
          sourceRoleId: candidate.sourceRoleId,
          sourceRoleName: candidate.sourceRoleName,
          accessProfileVersion: role.profileVersion ?? 1,
        },
      }));
    }
    await ctx.db.insert("activities", {
      tenantId: args.tenantId,
      actorType: "HUMAN",
      actorId: actor.operatorId ?? "demo:company-administrator",
      action: "ACCESS_PROFILE_MIGRATION_APPLIED",
      description: `${assignmentIds.length} exact persona mappings applied`,
      targetType: "TENANT",
      targetId: String(args.tenantId),
      afterState: {
        exactOnly: true,
        applied: assignmentIds.length,
        manualReview: report.counts.manualReview,
      },
      metadata: { reason },
    });
    return {
      success: true as const,
      applied: assignmentIds.length,
      assignmentIds,
      manualReview: report.counts.manualReview,
    };
  },
});
