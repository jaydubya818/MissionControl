import { v } from "convex/values";
import { mutation, query } from "../lib/missionScopedFunctions";
import { listCompanyMemberships, requireCompanyAccess } from "../lib/companyAccess";

export const createTenant = mutation({
  args: {
    name: v.string(),
    slug: v.string(),
    description: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const memberships = await listCompanyMemberships(ctx);
    const platformMembership = memberships.find(
      (membership) =>
        membership.mode === "DEMO" ||
        membership.permissions.includes("platform.tenants.create")
    );
    if (!platformMembership) throw new Error("Platform tenant administration is required.");
    const name = args.name.trim();
    const slug = args.slug.trim();
    if (!name || name.length > 120) throw new Error("Company name is required and must be 120 characters or fewer.");
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 80) {
      throw new Error("Company slug must use lowercase letters, numbers, and single hyphens.");
    }
    const existing = await ctx.db
      .query("tenants")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();
    if (existing) return existing;

    const id = await ctx.db.insert("tenants", {
      name,
      slug,
      description: args.description?.trim() || undefined,
      active: true,
      metadata: args.metadata,
    });
    await ctx.db.insert("activities", {
      tenantId: id,
      actorType: "HUMAN",
      actorId: platformMembership.operatorId ?? "demo:company-administrator",
      action: "COMPANY_CREATED",
      description: `Company account "${name}" created`,
      targetType: "TENANT",
      targetId: id,
      afterState: { slug },
    });
    return await ctx.db.get(id);
  },
});

export const getTenant = query({
  args: { tenantId: v.id("tenants") },
  handler: async (ctx, args) => {
    await requireCompanyAccess(ctx, args.tenantId);
    return await ctx.db.get(args.tenantId);
  },
});

export const listTenants = query({
  args: { activeOnly: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const memberships = await listCompanyMemberships(ctx);
    const tenants = memberships.map((membership) => membership.tenant);
    return (args.activeOnly ?? true)
      ? tenants.filter((tenant) => tenant.active)
      : tenants;
  },
});
