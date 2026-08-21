/**
 * Webhooks — Event Subscriptions & Delivery
 * 
 * Subscribe to Mission Control events and receive HTTP POST notifications.
 */

import { v } from "convex/values";
import { mutation, query, internalAction, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  COMPANY_PERMISSIONS,
  requireWorkspaceAccess,
} from "./lib/companyAccess";
import { requireOutboundUrl, validateOutboundUrl } from "./lib/outboundUrlPolicy";

/**
 * Webhook rows carry a plaintext HMAC signing secret. It is never returned to
 * a client — only a short fingerprint, which is enough for an operator to tell
 * two secrets apart without being able to forge a signature.
 */
async function secretFingerprint(secret: string): Promise<string> {
  // Fingerprint the DIGEST, not the secret. A prefix/suffix of the plaintext
  // would disclose 6 of a 16-character minimum secret to every reader and
  // materially reduce the cost of forging `X-Webhook-Signature`.
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return Array.from(new Uint8Array(digest))
    .slice(0, 4)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function redactWebhook(webhook: Doc<"webhooks">) {
  const { secret, ...rest } = webhook;
  return {
    ...rest,
    secretConfigured: Boolean(secret),
    secretFingerprint: secret ? await secretFingerprint(secret) : null,
  };
}

/**
 * Webhooks deliver Mission Control event payloads to an external endpoint, so
 * they are workspace configuration and require workspace management authority.
 * Fails closed: a webhook with no workspace binding cannot be read or changed.
 */
async function requireWebhookWorkspace(ctx: any, projectId: Id<"projects"> | undefined) {
  if (!projectId) {
    throw new Error("Webhooks must be scoped to a workspace.");
  }
  const project = await ctx.db.get(projectId);
  if (!project?.tenantId) {
    throw new Error("Workspace company assignment is incomplete.");
  }
  const access = await requireWorkspaceAccess(ctx, project.tenantId, project._id, {
    permission: COMPANY_PERMISSIONS.MANAGE_WORKSPACES,
  });
  return { project, access };
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
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    await requireWebhookWorkspace(ctx, args.projectId);
    const rows = await ctx.db
      .query("webhooks")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    return await Promise.all(rows.map(redactWebhook));
  },
});

export const get = query({
  args: { webhookId: v.id("webhooks") },
  handler: async (ctx, args) => {
    const webhook = await ctx.db.get(args.webhookId);
    if (!webhook) return null;
    await requireWebhookWorkspace(ctx, webhook.projectId);
    return await redactWebhook(webhook);
  },
});

export const getDeliveries = query({
  args: {
    webhookId: v.id("webhooks"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const webhook = await ctx.db.get(args.webhookId);
    if (!webhook) return [];
    await requireWebhookWorkspace(ctx, webhook.projectId);
    const limit = args.limit || 50;

    return await ctx.db
      .query("webhookDeliveries")
      .withIndex("by_webhook", (q) => q.eq("webhookId", args.webhookId))
      .order("desc")
      .take(limit);
  },
});

// ============================================================================
// MUTATIONS
// ============================================================================

export const create = mutation({
  args: {
    projectId: v.id("projects"),
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
    const { access } = await requireWebhookWorkspace(ctx, args.projectId);
    const url = requireOutboundUrl(args.url, "Webhook URL");
    if (args.secret.trim().length < 16) {
      throw new Error("Webhook signing secrets must be at least 16 characters.");
    }

    const webhookId = await ctx.db.insert("webhooks", {
      projectId: args.projectId,
      name: args.name,
      url,
      secret: args.secret,
      events: args.events,
      filters: args.filters,
      active: true,
      deliveryCount: 0,
      failureCount: 0,
      // Attribution is server-derived; `createdBy` from the client is ignored.
      createdBy: String(access.membership.operatorId ?? "demo:company-administrator"),
    });

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
    const { webhookId, ...updates } = args;
    const existing = await ctx.db.get(webhookId);
    if (!existing) throw new Error("Webhook not found");
    await requireWebhookWorkspace(ctx, existing.projectId);

    if (updates.url !== undefined) {
      updates.url = requireOutboundUrl(updates.url, "Webhook URL");
    }
    if (updates.secret !== undefined && updates.secret.trim().length < 16) {
      throw new Error("Webhook signing secrets must be at least 16 characters.");
    }

    await ctx.db.patch(webhookId, updates);

    return { success: true };
  },
});

export const remove = mutation({
  args: { webhookId: v.id("webhooks") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.webhookId);
    if (!existing) return { success: true };
    await requireWebhookWorkspace(ctx, existing.projectId);
    await ctx.db.delete(args.webhookId);
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
    // Find matching webhooks
    let webhooks = await ctx.db
      .query("webhooks")
      .withIndex("by_active", (q) => q.eq("active", true))
      .collect();
    
    // Filter by project. Exact match only — a webhook with no workspace
    // binding must never receive another workspace's event payloads.
    webhooks = webhooks.filter((w) => Boolean(w.projectId) && w.projectId === args.projectId);
    
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
        projectId: args.projectId,
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

export const deliverPending = internalAction({
  args: {},
  handler: async (ctx): Promise<{ delivered: number }> => {
    const deliveries = await ctx.runMutation(internal.webhooks.getPendingDeliveries, {});

    let delivered = 0;

    for (const delivery of deliveries) {
      const webhook = await ctx.runMutation(internal.webhooks.getWebhook, {
        webhookId: delivery.webhookId,
      });

      if (!webhook) continue;

      // Re-validate at delivery time. `create`/`update` validation does not
      // reach rows written before this policy existed, by a seed, or by a
      // direct insert — and those rows are exactly the SSRF risk.
      const destination = validateOutboundUrl(delivery.url);
      if (!destination.url) {
        await ctx.runMutation(internal.webhooks.markFailed, {
          deliveryId: delivery._id,
          webhookId: delivery.webhookId,
          error: `Destination rejected by outbound URL policy: ${destination.errors.join(" ")}`,
        });
        continue;
      }

      try {
        const signature = await hmacSha256Hex(
          webhook.secret,
          JSON.stringify(delivery.payload)
        );

        const response = await fetch(destination.url, {
          method: "POST",
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
    return await ctx.db
      .query("webhookDeliveries")
      .withIndex("by_status", (q) => q.eq("status", "PENDING"))
      .take(10);
  },
});


export const getWebhook = internalMutation({
  args: { webhookId: v.id("webhooks") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.webhookId);
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
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const delivery = await ctx.db.get(args.deliveryId);
    
    if (!delivery) return;
    
    const attempts = delivery.attempts + 1;
    
    if (attempts >= delivery.maxAttempts) {
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
