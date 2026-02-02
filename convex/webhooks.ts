/**
 * Webhooks — Event Subscriptions & Delivery
 * 
 * Subscribe to Mission Control events and receive HTTP POST notifications.
 */

import { v } from "convex/values";
import { mutation, query, action, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

// ============================================================================
// QUERIES
// ============================================================================

export const list = query({
  args: {
    projectId: v.optional(v.id("projects")),
  },
  handler: async (ctx, args) => {
    if (args.projectId) {
      return await ctx.db
        .query("webhooks")
        .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
        .collect();
    }
    
    return await ctx.db.query("webhooks").collect();
  },
});

export const get = query({
  args: { webhookId: v.id("webhooks") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.webhookId);
  },
});

export const getDeliveries = query({
  args: {
    webhookId: v.id("webhooks"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
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
    // Validate URL
    try {
      new URL(args.url);
    } catch {
      throw new Error("Invalid URL");
    }
    
    const webhookId = await ctx.db.insert("webhooks", {
      projectId: args.projectId,
      name: args.name,
      url: args.url,
      secret: args.secret,
      events: args.events,
      filters: args.filters,
      active: true,
      deliveryCount: 0,
      failureCount: 0,
      createdBy: args.createdBy,
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
    
    // Validate URL if provided
    if (updates.url) {
      try {
        new URL(updates.url);
      } catch {
        throw new Error("Invalid URL");
      }
    }
    
    await ctx.db.patch(webhookId, updates);
    
    return { success: true };
  },
});

export const remove = mutation({
  args: { webhookId: v.id("webhooks") },
  handler: async (ctx, args) => {
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
    
    // Filter by project
    if (args.projectId) {
      webhooks = webhooks.filter((w) => !w.projectId || w.projectId === args.projectId);
    }
    
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
// DELIVERY (Actions)
// ============================================================================

export const deliverPending = action({
  args: {},
  handler: async (ctx): Promise<{ delivered: number }> => {
    // Get pending deliveries directly
    const deliveries = await ctx.runMutation(internal.webhooks.getPendingDeliveries, {});
    
    let delivered = 0;
    
    for (const delivery of deliveries) {
      const webhook = await ctx.runMutation(internal.webhooks.getWebhook, {
        webhookId: delivery.webhookId,
      });
      
      if (!webhook) continue;
      
      try {
        // Create HMAC signature
        const crypto = await import("crypto");
        const signature = crypto
          .createHmac("sha256", webhook.secret)
          .update(JSON.stringify(delivery.payload))
          .digest("hex");
        
        // Deliver webhook
        const response = await fetch(delivery.url, {
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
          // Success
          await ctx.runMutation(internal.webhooks.markDelivered, {
            deliveryId: delivery._id,
            webhookId: delivery.webhookId,
            responseStatus: response.status,
            responseBody: responseBody.substring(0, 1000),
          });
          delivered++;
        } else {
          // Failed
          await ctx.runMutation(internal.webhooks.markFailed, {
            deliveryId: delivery._id,
            webhookId: delivery.webhookId,
            responseStatus: response.status,
            error: `HTTP ${response.status}: ${responseBody.substring(0, 500)}`,
          });
        }
      } catch (error) {
        // Error
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
