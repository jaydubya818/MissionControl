import type { Id } from "../_generated/dataModel";

type TenantLike = {
  _id: Id<"tenants">;
  slug: string;
  active: boolean;
};

type ProjectLike = {
  _id: Id<"projects">;
  tenantId?: Id<"tenants">;
};

type TemplateLike = {
  _id: Id<"agentTemplates">;
  tenantId?: Id<"tenants">;
};

type VersionLike = {
  _id: Id<"agentVersions">;
  tenantId?: Id<"tenants">;
};

type InstanceLike = {
  _id: Id<"agentInstances">;
  tenantId?: Id<"tenants">;
};

type EnvironmentLike = {
  _id: Id<"environments">;
  tenantId: Id<"tenants">;
};

type TenantResolverDb = {
  get: (id: string) => Promise<unknown>;
  insert?: (table: "tenants", value: Record<string, unknown>) => Promise<Id<"tenants">>;
  query: (table: "tenants" | "projects" | "agentTemplates" | "agentVersions" | "agentInstances" | "environments") => any;
};

type TenantResolverCtx = {
  db: TenantResolverDb;
};

type ResolveTenantArgs = {
  tenantId?: Id<"tenants">;
  projectId?: Id<"projects">;
  templateId?: Id<"agentTemplates">;
  versionId?: Id<"agentVersions">;
  instanceId?: Id<"agentInstances">;
  environmentId?: Id<"environments">;
  createDefaultIfMissing?: boolean;
};

async function findDefaultTenantId(ctx: TenantResolverCtx): Promise<Id<"tenants"> | undefined> {
  const defaultTenant = (await ctx.db
    .query("tenants")
    .withIndex("by_slug", (q: any) => q.eq("slug", "default"))
    .first()) as TenantLike | null;
  if (defaultTenant?.active) return defaultTenant._id;

  const activeTenants = (await ctx.db
    .query("tenants")
    .withIndex("by_active", (q: any) => q.eq("active", true))
    .collect()) as TenantLike[];
  if (activeTenants.length > 0) return activeTenants[0]._id;

  return undefined;
}

async function ensureDefaultTenantId(ctx: TenantResolverCtx): Promise<Id<"tenants"> | undefined> {
  const existing = await findDefaultTenantId(ctx);
  if (existing) return existing;
  if (!ctx.db.insert) return undefined;

  const id = await ctx.db.insert("tenants", {
    name: "Default Tenant",
    slug: "default",
    description: "Auto-created tenant for migration compatibility.",
    active: true,
    metadata: {
      source: "tenant-resolver",
      autoCreated: true,
    },
  });
  return id;
}

export async function resolveActiveTenantId(
  ctx: TenantResolverCtx,
  args: ResolveTenantArgs
): Promise<Id<"tenants"> | undefined> {
  if (args.tenantId) return args.tenantId;

  if (args.projectId) {
    const project = (await ctx.db.get(args.projectId)) as ProjectLike | null;
    if (project?.tenantId) return project.tenantId;
  }

  if (args.templateId) {
    const template = (await ctx.db.get(args.templateId)) as TemplateLike | null;
    if (template?.tenantId) return template.tenantId;
  }

  if (args.versionId) {
    const version = (await ctx.db.get(args.versionId)) as VersionLike | null;
    if (version?.tenantId) return version.tenantId;
  }

  if (args.instanceId) {
    const instance = (await ctx.db.get(args.instanceId)) as InstanceLike | null;
    if (instance?.tenantId) return instance.tenantId;
  }

  if (args.environmentId) {
    const environment = (await ctx.db.get(args.environmentId)) as EnvironmentLike | null;
    if (environment?.tenantId) return environment.tenantId;
  }

  if (args.createDefaultIfMissing) {
    return ensureDefaultTenantId(ctx);
  }

  return findDefaultTenantId(ctx);
}

