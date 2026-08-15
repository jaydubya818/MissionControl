import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { internalMutation, internalQuery } from "../_generated/server";

const MIGRATION_VERSION = 2;
const MIGRATION_ACTOR = "migration:repository-code-scope-schema-v2";

type ScopeWithLegacyField = Doc<"repositoryCodeScopes"> & {
  approvalPolicyDescription?: string;
};

export type LegacyScopeMigrationPlan =
  | {
      status: "UNCHANGED";
    }
  | {
      status: "MIGRATE";
      description?: string;
      approvalPolicy?: string;
    }
  | {
      status: "CONFLICT";
      reason: string;
    };

function normalizedString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function planLegacyScopeMigration(
  scope: Pick<
    ScopeWithLegacyField,
    "description" | "approvalPolicy" | "approvalPolicyDescription"
  >
): LegacyScopeMigrationPlan {
  if (scope.approvalPolicyDescription === undefined) {
    return { status: "UNCHANGED" };
  }

  const legacyDescription = normalizedString(scope.approvalPolicyDescription);
  const description = normalizedString(scope.description);
  const approvalPolicy = normalizedString(scope.approvalPolicy);

  if (!legacyDescription) {
    return { status: "MIGRATE", description, approvalPolicy };
  }
  if (!description) {
    return {
      status: "MIGRATE",
      description: legacyDescription,
      approvalPolicy,
    };
  }
  if (description === legacyDescription || approvalPolicy === legacyDescription) {
    return { status: "MIGRATE", description, approvalPolicy };
  }
  if (!approvalPolicy) {
    return {
      status: "MIGRATE",
      description,
      approvalPolicy: legacyDescription,
    };
  }

  return {
    status: "CONFLICT",
    reason:
      "Legacy approval policy text differs from both canonical description and approval policy.",
  };
}

function inspectScope(scope: ScopeWithLegacyField) {
  const plan = planLegacyScopeMigration(scope);
  return {
    scopeId: scope._id,
    projectId: scope.projectId,
    status: plan.status,
    reason: plan.status === "CONFLICT" ? plan.reason : undefined,
  };
}

export const inspect = internalQuery({
  args: {},
  handler: async (ctx) => {
    const scopes = (await ctx.db
      .query("repositoryCodeScopes")
      .collect()) as ScopeWithLegacyField[];
    const candidates = scopes
      .filter((scope) => scope.approvalPolicyDescription !== undefined)
      .map(inspectScope);
    return {
      totalScopes: scopes.length,
      legacyCount: candidates.length,
      conflictCount: candidates.filter((candidate) => candidate.status === "CONFLICT").length,
      candidates,
    };
  },
});

export const run = internalMutation({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const scopes = (await ctx.db
      .query("repositoryCodeScopes")
      .collect()) as ScopeWithLegacyField[];
    const candidates = scopes.filter(
      (scope) => scope.approvalPolicyDescription !== undefined
    );
    const planned = candidates.map((scope) => ({
      scope,
      plan: planLegacyScopeMigration(scope),
    }));
    const conflicts = planned.filter(({ plan }) => plan.status === "CONFLICT");
    if (conflicts.length) {
      throw new Error(
        `Repository code-scope migration blocked by ${conflicts.length} canonical value conflict(s).`
      );
    }

    const limit = Math.max(1, Math.min(args.limit ?? 100, 500));
    const batch = planned.slice(0, limit);
    const now = Date.now();
    for (const { scope, plan } of batch) {
      if (plan.status !== "MIGRATE") continue;
      const {
        _id,
        _creationTime,
        approvalPolicyDescription: _legacyDescription,
        ...canonical
      } = scope;
      void _id;
      void _creationTime;
      void _legacyDescription;

      await ctx.db.replace(scope._id, {
        ...canonical,
        description: plan.description,
        approvalPolicy: plan.approvalPolicy,
        migrationVersion: Math.max(scope.migrationVersion ?? 0, MIGRATION_VERSION),
        updatedAt: now,
      });
      await ctx.db.insert("activities", {
        tenantId: scope.tenantId,
        projectId: scope.projectId,
        actorType: "SYSTEM",
        actorId: MIGRATION_ACTOR,
        action: "REPOSITORY_CODE_SCOPE_SCHEMA_MIGRATED",
        description: `Migrated legacy schema fields for code scope "${scope.name}"`,
        targetType: "REPOSITORY_CODE_SCOPE",
        targetId: scope._id,
        beforeState: { legacyApprovalPolicyDescription: true },
        afterState: {
          migrationVersion: MIGRATION_VERSION,
          preservedAsDescription: !normalizedString(scope.description),
        },
      });
    }

    return {
      scanned: scopes.length,
      migrated: batch.length,
      remaining: Math.max(0, candidates.length - batch.length),
      migrationVersion: MIGRATION_VERSION,
    };
  },
});
