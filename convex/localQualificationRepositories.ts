import { mutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { COMPANY_PERMISSIONS, requireWorkspaceAccess } from "./lib/companyAccess";
import { assertLocalRepositoryScope, parseLocalRepositoryAdmission, LOCAL_QUALIFICATION_MODE } from "./lib/localRepositoryAdmission";

/** No caller-selected identity, root, environment or scope. This creates only a
 * CONFIGURED repository; worker attestation and canonical readiness remain required. */
export const register = mutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const a = parseLocalRepositoryAdmission(process.env.MC_LOCAL_REPOSITORY_ADMISSION, now);
    const [project, tenant, operator, environment] = await Promise.all([
      ctx.db.get(a.projectId as Id<"projects">), ctx.db.get(a.tenantId as Id<"tenants">),
      ctx.db.get(a.operatorId as Id<"operators">), ctx.db.get(a.environmentId as Id<"environments">),
    ]);
    const access = await requireWorkspaceAccess(ctx, a.tenantId as Id<"tenants">, a.projectId as Id<"projects">,
      { permission: COMPANY_PERMISSIONS.MANAGE_REPOSITORIES });
    const digest = assertLocalRepositoryScope({ admission: a, project, tenant, operator, environment, actorId: String(access.actorId) });
    const repository = `local-qualification/${a.fixtureId}`;
    const existing = await ctx.db.query("workspaceRepositories").withIndex("by_project_repository", q =>
      q.eq("projectId", a.projectId as Id<"projects">).eq("repository", repository)).unique();
    if (existing) {
      assertLocalRepositoryScope({ admission: a, project, tenant, operator, environment, actorId: String(access.actorId), repository: existing });
      return existing._id;
    }
    if (environment!.metadata?.repositoryId) throw new Error("Qualification environment already belongs to a repository.");
    const repositoryId = await ctx.db.insert("workspaceRepositories", {
      tenantId: tenant!._id, projectId: project!._id, provider: "LOCAL", repositoryMode: LOCAL_QUALIFICATION_MODE,
      repository, displayName: "Local synthetic qualification — no publication", defaultBranch: "main", isDefault: false,
      status: "CONFIGURED", webhookStatus: "MISSING", dataClassification: "PUBLIC", fixtureKey: a.fixtureId,
      localAdmission: a, localAdmissionDigest: digest, createdBy: operator!._id, updatedBy: operator!._id,
      createdAt: now, updatedAt: now,
    });
    await ctx.db.patch(environment!._id, { metadata: { ...environment!.metadata, repositoryId } });
    return repositoryId;
  },
});
