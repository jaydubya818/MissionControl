/**
 * Webhooks — Event Subscriptions & Delivery
 * 
 * Subscribe to Mission Control events and receive HTTP POST notifications.
 */

import { v } from "convex/values";
import { mutation, query, internalAction, internalMutation } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { COMPANY_PERMISSIONS, listAccessibleWorkspaces, listCompanyMemberships, requireWorkspaceAccess } from "./lib/companyAccess";

async function requireWebhookWorkspace(ctx: QueryCtx | MutationCtx, projectId?: Id<"projects">, write = false) {
  if (!await ctx.auth.getUserIdentity()) throw new Error("Authentication is required for webhooks.");
  const project = projectId ? await ctx.db.get(projectId) : null;
  if (!project?.tenantId) throw new Error("Webhook workspace is unavailable or unauthorized.");
  return requireWorkspaceAccess(ctx, project.tenantId, project._id, {
    permission: write ? COMPANY_PERMISSIONS.MANAGE_WORKSPACES : undefined,
  });
}

async function requireWebhookRecord(ctx: QueryCtx | MutationCtx, webhookId: Id<"webhooks">, write = false) {
  if (!await ctx.auth.getUserIdentity()) throw new Error("Authentication is required for webhooks.");
  const webhook = await ctx.db.get(webhookId);
  if (!webhook) throw new Error("Webhook is unavailable or unauthorized.");
  const access = await requireWebhookWorkspace(ctx, webhook.projectId, write);
  if (webhook.tenantId && webhook.tenantId !== access.project.tenantId) throw new Error("Webhook company scope does not match its workspace.");
  return { webhook, access };
}

function webhookMetadata(webhook: Doc<"webhooks">) {
  const { secret, ...metadata } = webhook;
  return { ...metadata, secretConfigured: secret.length > 0 };
}

function validateWebhookUrl(value: string) {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("Invalid webhook URL"); }
  if (url.protocol !== "https:" || url.username || url.password || url.hash) {
    throw new Error("Webhook URL must use HTTPS without credentials or a fragment.");
  }
}

async function validateWebhookAgents(ctx: MutationCtx, projectId: Id<"projects">, agentIds?: Id<"agents">[]) {
  const project = await ctx.db.get(projectId);
  for (const agentId of agentIds ?? []) {
    const agent = await ctx.db.get(agentId);
    if (!agent || agent.projectId !== projectId || (agent.tenantId && agent.tenantId !== project?.tenantId)) {
      throw new Error("Webhook agent filter must belong to its workspace.");
    }
  }
}

async function auditWebhookChange(ctx: MutationCtx, input: {
  access: Awaited<ReturnType<typeof requireWebhookWorkspace>>;
  webhookId: Id<"webhooks">;
  action: string;
}) {
  await ctx.db.insert("activities", {
    tenantId: input.access.project.tenantId,
    projectId: input.access.project._id,
    actorType: "HUMAN",
    actorId: String(input.access.membership.operatorId),
    action: input.action,
    description: "Updated outbound webhook configuration",
    targetType: "WEBHOOK",
    targetId: String(input.webhookId),
  });
}

/** HMAC-SHA256 hex using Web Crypto (Convex default runtime). */
async function hmacSha256Hex(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(data)
  );
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ============================================================================
// QUERIES
// ============================================================================

export const list = query({
  args: {
    projectId: v.optional(v.id("projects")),
  },
  handler: async (ctx, args) => {
    if (args.projectId) {
      const access = await requireWebhookWorkspace(ctx, args.projectId);
      const rows = await ctx.db
        .query("webhooks")
        .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
        .collect();
      return rows.filter(row => !row.tenantId || row.tenantId === access.project.tenantId).map(webhookMetadata);
    }
    if (!await ctx.auth.getUserIdentity()) throw new Error("Authentication is required for webhooks.");
    const memberships = await listCompanyMemberships(ctx);
    const projects = (await Promise.all(memberships.map(membership => listAccessibleWorkspaces(ctx, membership.tenant._id)))).flat();
    const rows = await Promise.all(projects.map(async project => {
      const hooks = await ctx.db.query("webhooks").withIndex("by_project", q => q.eq("projectId", project._id)).collect();
      return hooks.filter(hook => !hook.tenantId || hook.tenantId === project.tenantId).map(webhookMetadata);
    }));
    return rows.flat();
  },
});

export const get = query({
  args: { webhookId: v.id("webhooks") },
  handler: async (ctx, args) => {
    const { webhook } = await requireWebhookRecord(ctx, args.webhookId);
    return webhookMetadata(webhook);
  },
});

export const getDeliveries = query({
  args: {
    webhookId: v.id("webhooks"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { webhook, access } = await requireWebhookRecord(ctx, args.webhookId);
    const limit = args.limit || 50;
    
    const deliveries = await ctx.db
      .query("webhookDeliveries")
      .withIndex("by_webhook", (q) => q.eq("webhookId", args.webhookId))
      .order("desc")
      .take(limit);
    return deliveries.filter(delivery => delivery.projectId === webhook.projectId
      && (!delivery.tenantId || delivery.tenantId === access.project.tenantId));
  },
});

// ============================================================================
// MUTATIONS
// ============================================================================

export const create = mutation({
  args: {
    projectId: v.optional(v.id("projects")),
    name: v.string(),
    url: v.string(),
    secret: v.string(),
    events: v.array(v.string()),
    filters: v.optional(v.object({
      taskTypes: v.optional(v.array(v.string())),
      agentIds: v.optional(v.array(v.id("agents"))),
      statuses: v.optional(v.array(v.string())),
    })),
    createdBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const access = await requireWebhookWorkspace(ctx, args.projectId, true);
    validateWebhookUrl(args.url);
    await validateWebhookAgents(ctx, access.project._id, args.filters?.agentIds);
    
    const webhookId = await ctx.db.insert("webhooks", {
      projectId: args.projectId,
      tenantId: access.project.tenantId,
      name: args.name,
      url: args.url,
      secret: args.secret,
      events: args.events,
      filters: args.filters,
      active: true,
      deliveryCount: 0,
      failureCount: 0,
      createdBy: String(access.membership.operatorId),
    });
    await auditWebhookChange(ctx, { access, webhookId, action: "WEBHOOK_CREATED" });
    return { webhookId };
  },
});

export const update = mutation({
  args: {
    webhookId: v.id("webhooks"),
    name: v.optional(v.string()),
    url: v.optional(v.string()),
    secret: v.optional(v.string()),
    events: v.optional(v.array(v.string())),
    filters: v.optional(v.object({
      taskTypes: v.optional(v.array(v.string())),
      agentIds: v.optional(v.array(v.id("agents"))),
      statuses: v.optional(v.array(v.string())),
    })),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { access } = await requireWebhookRecord(ctx, args.webhookId, true);
    const webhookId = args.webhookId;
    const updates = Object.fromEntries(Object.entries({
      name: args.name, url: args.url, secret: args.secret,
      events: args.events, filters: args.filters, active: args.active,
    }).filter(([, value]) => value !== undefined));
    if (args.url !== undefined) validateWebhookUrl(args.url);
    await validateWebhookAgents(ctx, access.project._id, args.filters?.agentIds);
    
    await ctx.db.patch(webhookId, updates);
    await auditWebhookChange(ctx, { access, webhookId, action: "WEBHOOK_UPDATED" });
    return { success: true };
  },
});

export const remove = mutation({
  args: { webhookId: v.id("webhooks") },
  handler: async (ctx, args) => {
    const { access } = await requireWebhookRecord(ctx, args.webhookId, true);
    await ctx.db.delete(args.webhookId);
    await auditWebhookChange(ctx, { access, webhookId: args.webhookId, action: "WEBHOOK_REMOVED" });
    return { success: true };
  },
});

// ============================================================================
// EVENT TRIGGERING
// ============================================================================

export const triggerEvent = internalMutation({
  args: {
    event: v.string(),
    payload: v.any(),
    projectId: v.optional(v.id("projects")),
    taskId: v.optional(v.id("tasks")),
    agentId: v.optional(v.id("agents")),
  },
  handler: async (ctx, args) => {
    const project = args.projectId ? await ctx.db.get(args.projectId) : null;
    if (!project?.tenantId) throw new Error("Webhook events require a valid workspace scope.");
    for (const id of [args.taskId, args.agentId]) {
      if (!id) continue;
      const source = await ctx.db.get(id);
      if (!source || source.projectId !== project._id || (source.tenantId && source.tenantId !== project.tenantId)) {
        throw new Error("Webhook event source does not match its workspace scope.");
      }
    }
    // Find matching webhooks
    let webhooks = await ctx.db
      .query("webhooks")
      .withIndex("by_active", (q) => q.eq("active", true))
      .collect();
    
    // Filter by project
    webhooks = webhooks.filter(w => w.projectId === project._id && (!w.tenantId || w.tenantId === project.tenantId));
    
    // Filter by event subscription
    webhooks = webhooks.filter((w) => w.events.includes(args.event));
    
    // Apply filters
    for (const webhook of webhooks) {
      let shouldDeliver = true;
      
      if (webhook.filters) {
        // Filter by task type
        if (webhook.filters.taskTypes && args.payload.taskType) {
          shouldDeliver = webhook.filters.taskTypes.includes(args.payload.taskType);
        }
        
        // Filter by agent
        if (webhook.filters.agentIds && args.agentId) {
          shouldDeliver = shouldDeliver && webhook.filters.agentIds.includes(args.agentId);
        }
        
        // Filter by status
        if (webhook.filters.statuses && args.payload.status) {
          shouldDeliver = shouldDeliver && webhook.filters.statuses.includes(args.payload.status);
        }
      }
      
      if (!shouldDeliver) continue;
      
      // Create delivery
      await ctx.db.insert("webhookDeliveries", {
        webhookId: webhook._id,
        tenantId: project.tenantId,
        projectId: project._id,
        event: args.event,
        payload: args.payload,
        url: webhook.url,
        status: "PENDING",
        attempts: 0,
        maxAttempts: 3,
      });
    }
  },
});

// ============================================================================
// DELIVERY (Actions) — uses Web Crypto for HMAC (no Node runtime)
// ============================================================================

/**
 * Drive pending webhook deliveries.
 *
 * `internalAction` restores what this used to be — `packages/telegram-bot`'s
 * built declaration still records it as `RegisteredAction<"internal">`. As a
 * public action it took no arguments and resolved no caller, so anyone holding
 * the deployment URL could drive outbound webhook delivery on demand.
 */
export const deliverPending = internalAction({
  args: {},
  handler: async (ctx): Promise<{ delivered: number }> => {
    const deliveries = await ctx.runMutation(internal.webhooks.getPendingDeliveries, {});

    let delivered = 0;

    for (const delivery of deliveries) {
      const webhook = await ctx.runMutation(internal.webhooks.getWebhook, {
        webhookId: delivery.webhookId,
      });

      if (!webhook || !webhook.active || webhook.projectId !== delivery.projectId
        || (delivery.tenantId && delivery.tenantId !== webhook.tenantId)
        || webhook.url !== delivery.url) {
        await ctx.runMutation(internal.webhooks.markFailed, {
          deliveryId: delivery._id,
          webhookId: delivery.webhookId,
          error: "Webhook delivery binding is no longer current or authorized.",
          permanent: true,
        });
        continue;
      }

      try {
        const signature = await hmacSha256Hex(
          webhook.secret,
          JSON.stringify(delivery.payload)
        );

        const response = await fetch(delivery.url, {
          method: "POST",
          redirect: "error",
          headers: {
            "Content-Type": "application/json",
            "X-Webhook-Signature": signature,
            "X-Webhook-Event": delivery.event,
            "User-Agent": "MissionControl-Webhooks/1.0",
          },
          body: JSON.stringify(delivery.payload),
        });

        const responseBody = await response.text();

        if (response.ok) {
          await ctx.runMutation(internal.webhooks.markDelivered, {
            deliveryId: delivery._id,
            webhookId: delivery.webhookId,
            responseStatus: response.status,
            responseBody: responseBody.substring(0, 1000),
          });
          delivered++;
        } else {
          await ctx.runMutation(internal.webhooks.markFailed, {
            deliveryId: delivery._id,
            webhookId: delivery.webhookId,
            responseStatus: response.status,
            error: `HTTP ${response.status}: ${responseBody.substring(0, 500)}`,
          });
        }
      } catch (error) {
        await ctx.runMutation(internal.webhooks.markFailed, {
          deliveryId: delivery._id,
          webhookId: delivery.webhookId,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return { delivered };
  },
});

export const getPendingDeliveries = internalMutation({
  args: {},
  handler: async (ctx) => {
    const pending = await ctx.db
      .query("webhookDeliveries")
      .withIndex("by_status", (q) => q.eq("status", "PENDING"))
      .filter(q => q.lt(q.field("attempts"), q.field("maxAttempts")))
      .take(10);
    const retrying = await ctx.db
      .query("webhookDeliveries")
      .withIndex("by_next_retry", q => q.gte("nextRetryAt", 0).lte("nextRetryAt", Date.now()))
      .filter(q => q.and(q.eq(q.field("status"), "RETRYING"), q.lt(q.field("attempts"), q.field("maxAttempts"))))
      .take(10);
    return [...pending, ...retrying]
      .sort((a, b) => (a.nextRetryAt ?? a._creationTime) - (b.nextRetryAt ?? b._creationTime))
      .slice(0, 10);
  },
});


export const getWebhook = internalMutation({
  args: { webhookId: v.id("webhooks") },
  handler: async (ctx, args) => {
    const webhook = await ctx.db.get(args.webhookId);
    const project = webhook?.projectId ? await ctx.db.get(webhook.projectId) : null;
    if (!webhook || !project?.tenantId || (webhook.tenantId && webhook.tenantId !== project.tenantId)) return null;
    try { validateWebhookUrl(webhook.url); } catch { return null; }
    return { ...webhook, tenantId: project.tenantId };
  },
});

export const markDelivered = internalMutation({
  args: {
    deliveryId: v.id("webhookDeliveries"),
    webhookId: v.id("webhooks"),
    responseStatus: v.number(),
    responseBody: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    
    await ctx.db.patch(args.deliveryId, {
      status: "DELIVERED",
      responseStatus: args.responseStatus,
      responseBody: args.responseBody,
      deliveredAt: now,
    });
    
    const webhook = await ctx.db.get(args.webhookId);
    if (webhook) {
      await ctx.db.patch(args.webhookId, {
        deliveryCount: webhook.deliveryCount + 1,
        lastDeliveryAt: now,
      });
    }
  },
});

export const markFailed = internalMutation({
  args: {
    deliveryId: v.id("webhookDeliveries"),
    webhookId: v.id("webhooks"),
    responseStatus: v.optional(v.number()),
    error: v.string(),
    permanent: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const delivery = await ctx.db.get(args.deliveryId);
    
    if (!delivery) return;
    
    const attempts = delivery.attempts + 1;
    
    if (args.permanent || attempts >= delivery.maxAttempts) {
      // Max retries reached
      await ctx.db.patch(args.deliveryId, {
        status: "FAILED",
        attempts,
        responseStatus: args.responseStatus,
        error: args.error,
      });
      
      const webhook = await ctx.db.get(args.webhookId);
      if (webhook) {
        await ctx.db.patch(args.webhookId, {
          failureCount: webhook.failureCount + 1,
          lastFailureAt: now,
        });
      }
    } else {
      // Retry with exponential backoff
      const retryDelay = Math.pow(2, attempts) * 1000; // 2s, 4s, 8s
      const nextRetryAt = now + retryDelay;
      
      await ctx.db.patch(args.deliveryId, {
        status: "RETRYING",
        attempts,
        nextRetryAt,
        responseStatus: args.responseStatus,
        error: args.error,
      });
    }
  },
});
