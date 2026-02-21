import type { Doc, Id } from "../_generated/dataModel";
import type { GenomePayload } from "./genomeHash";
import { computeGenomeHash } from "./genomeHash";
import { resolveActiveTenantId } from "./getActiveTenant";

interface ResolverDb {
  get: (id: string) => Promise<any>;
  insert: (table: string, value: Record<string, unknown>) => Promise<any>;
  query: (table: string) => any;
}

interface ResolverCtx {
  db: ResolverDb;
}

export interface ResolvedAgentRef {
  instanceId: Id<"agentInstances">;
  versionId: Id<"agentVersions">;
  templateId: Id<"agentTemplates">;
  legacyAgentId?: Id<"agents">;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function statusFromLegacy(status: string):
  | "PROVISIONING"
  | "ACTIVE"
  | "PAUSED"
  | "READONLY"
  | "DRAINING"
  | "QUARANTINED"
  | "RETIRED" {
  switch (status) {
    case "ACTIVE":
      return "ACTIVE";
    case "PAUSED":
      return "PAUSED";
    case "DRAINED":
      return "DRAINING";
    case "QUARANTINED":
      return "QUARANTINED";
    case "OFFLINE":
      return "READONLY";
    default:
      return "PROVISIONING";
  }
}

function buildGenome(agent: Doc<"agents">): GenomePayload {
  const toolManifestHash = computeGenomeHash({
    modelConfig: {
      provider: "legacy",
      modelId: "legacy",
    },
    promptBundleHash: agent.soulVersionHash ?? "legacy-soul",
    toolManifestHash: JSON.stringify(agent.allowedTools ?? []),
    provenance: {
      createdBy: "legacy-migration",
      source: "mission-control",
      createdAt: Date.now(),
    },
  });

  return {
    modelConfig: {
      provider: "legacy",
      modelId: (agent.metadata as any)?.modelId ?? "legacy-model",
      temperature: (agent.metadata as any)?.temperature,
      maxTokens: (agent.metadata as any)?.maxTokens,
    },
    promptBundleHash: agent.soulVersionHash ?? "legacy-soul",
    toolManifestHash,
    provenance: {
      createdBy: "legacy-migration",
      source: "mission-control",
      createdAt: Date.now(),
    },
  };
}

export async function ensureInstanceForLegacyAgent(
  ctx: ResolverCtx,
  legacyAgentId: Id<"agents">
): Promise<ResolvedAgentRef> {
  const existing = await ctx.db
    .query("agentInstances")
    .withIndex("by_legacy_agent", (q: any) => q.eq("legacyAgentId", legacyAgentId))
    .first();

  if (existing) {
    return {
      instanceId: existing._id,
      versionId: existing.versionId,
      templateId: existing.templateId,
      legacyAgentId,
    };
  }

  const agent = (await ctx.db.get(legacyAgentId)) as Doc<"agents"> | null;
  if (!agent) {
    throw new Error(`Legacy agent not found: ${legacyAgentId}`);
  }

  const tenantId = await resolveActiveTenantId(
    { db: ctx.db as any },
    {
      tenantId: agent.tenantId,
      projectId: agent.projectId ?? undefined,
      createDefaultIfMissing: true,
    }
  );

  const now = Date.now();
  const slug = `legacy-${slugify(agent.name)}`;

  let template = await ctx.db
    .query("agentTemplates")
    .withIndex("by_slug", (q: any) => q.eq("slug", slug))
    .first();

  if (!template) {
    const templateId = await ctx.db.insert("agentTemplates", {
      tenantId,
      projectId: agent.projectId,
      name: `${agent.name} Template`,
      slug,
      description: `Auto-created template for legacy agent ${agent.name}`,
      active: true,
      createdAt: now,
      updatedAt: now,
      metadata: {
        source: "legacy-agent",
      },
    });
    template = await ctx.db.get(templateId);
  }

  if (!template) {
    throw new Error(`Failed to resolve template for agent ${agent.name}`);
  }

  const genome = buildGenome(agent);
  const genomeHash = computeGenomeHash(genome);

  const versions = await ctx.db
    .query("agentVersions")
    .withIndex("by_template", (q: any) => q.eq("templateId", template._id))
    .collect();

  let version = versions.find((v: any) => v.genomeHash === genomeHash);

  if (!version) {
    const maxVersion = versions.reduce((max: number, current: any) => Math.max(max, current.version ?? 0), 0);
    const versionId = await ctx.db.insert("agentVersions", {
      tenantId,
      projectId: agent.projectId,
      templateId: template._id,
      version: maxVersion + 1,
      genome,
      genomeHash,
      status: "APPROVED",
      notes: "Auto-created from legacy agent",
      createdAt: now,
      updatedAt: now,
      metadata: {
        source: "legacy-agent",
      },
    });
    version = await ctx.db.get(versionId);
  }

  if (!version) {
    throw new Error(`Failed to resolve version for agent ${agent.name}`);
  }

  const instanceId = await ctx.db.insert("agentInstances", {
    tenantId,
    projectId: agent.projectId,
    templateId: template._id,
    versionId: version._id,
    name: agent.name,
    status: statusFromLegacy(agent.status),
    legacyAgentId,
    activatedAt: now,
    metadata: {
      source: "legacy-agent",
      legacyRole: agent.role,
    },
  });

  return {
    instanceId,
    versionId: version._id,
    templateId: template._id,
    legacyAgentId,
  };
}

export async function resolveAgentRef(
  ctx: ResolverCtx,
  input: {
    agentId?: Id<"agents">;
    instanceId?: Id<"agentInstances">;
    createIfMissing?: boolean;
  }
): Promise<ResolvedAgentRef | null> {
  if (input.instanceId) {
    const instance = await ctx.db.get(input.instanceId);
    if (!instance) return null;
    return {
      instanceId: instance._id,
      versionId: instance.versionId,
      templateId: instance.templateId,
      legacyAgentId: instance.legacyAgentId,
    };
  }

  if (!input.agentId) return null;

  const existing = await ctx.db
    .query("agentInstances")
    .withIndex("by_legacy_agent", (q: any) => q.eq("legacyAgentId", input.agentId))
    .first();

  if (existing) {
    return {
      instanceId: existing._id,
      versionId: existing.versionId,
      templateId: existing.templateId,
      legacyAgentId: input.agentId,
    };
  }

  if (input.createIfMissing === false) {
    return null;
  }

  return ensureInstanceForLegacyAgent(ctx, input.agentId);
}

export async function getAgentByLegacyId(
  ctx: ResolverCtx,
  legacyAgentId: Id<"agents">
): Promise<{
  instance: Doc<"agentInstances">;
  version: Doc<"agentVersions"> | null;
  template: Doc<"agentTemplates"> | null;
} | null> {
  const resolved = await resolveAgentRef(ctx, { agentId: legacyAgentId, createIfMissing: false });
  if (!resolved) return null;

  const instance = (await ctx.db.get(resolved.instanceId)) as Doc<"agentInstances"> | null;
  if (!instance) return null;

  const version = (await ctx.db.get(resolved.versionId)) as Doc<"agentVersions"> | null;
  const template = (await ctx.db.get(resolved.templateId)) as Doc<"agentTemplates"> | null;

  return { instance, version, template };
}
