import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { COMPANY_PERMISSIONS, requireWorkspaceAccess } from "./lib/companyAccess";

// Temporary one-purpose setup for the existing disposable qualification backend.
// Creates no execution, approval, acceptance or publication evidence.
export const prepare = internalMutation({
  args: { nonce: v.string() },
  handler: async (ctx, args) => {
    if (process.env.CONVEX_CLOUD_URL !== "http://127.0.0.1:3290"
      || process.env.CONVEX_SITE_URL !== "http://127.0.0.1:3291"
      || !process.env.MC_LOCAL_ENVIRONMENT_FIXTURE_NONCE || args.nonce !== process.env.MC_LOCAL_ENVIRONMENT_FIXTURE_NONCE) {
      throw new Error("Environment fixture requires the exact disposable backend and one-time authority.");
    }
    const projectId = "k57jpqmfrj3rtp5dkgrw1cgd398dww8j" as Id<"projects">;
    const tenantId = "r97jrhf2q47hm0njny43m3wr118dwj34" as Id<"tenants">;
    const operatorId = "hx7hzjvda7yk7hk0e93q1px22s8dxhge";
    const access = await requireWorkspaceAccess(ctx, tenantId, projectId, { permission: COMPANY_PERMISSIONS.MANAGE_REPOSITORIES });
    if (access.membership.operatorId !== operatorId || access.project.metadata?.schema !== "unpublished-handoff-fixture/v1"
      || access.project.metadata.synthetic !== true) throw new Error("Existing synthetic project/operator scope is required.");
    const name = "Local repository qualification only";
    const existing = await ctx.db.query("environments").withIndex("by_tenant_type", q => q.eq("tenantId", tenantId).eq("type", "dev")).collect();
    if (existing.length) throw new Error("Qualification environment setup is single-use.");
    return await ctx.db.insert("environments", { tenantId, name, type: "dev",
      metadata: { schema: "factory-qualification-environment/v1", synthetic: true, projectId, productionAuthority: false } });
  },
});
