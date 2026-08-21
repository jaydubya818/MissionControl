/**
 * Gateway connection settings (OpenClaw Studio parity).
 * Stores only the Gateway URL; token is supplied via server env (GATEWAY_TOKEN).
 */

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireCompanyAdministrator } from "./lib/companyAccess";

const GATEWAY_CONNECTION_ID = "default" as const;

export const get = query({
  args: {},
  handler: async (ctx) => {
    const row = await ctx.db
      .query("gatewayConnection")
      .withIndex("by_updatedAt")
      .order("desc")
      .first();
    if (!row) return null;
    return { url: row.url, updatedAt: row.updatedAt };
  },
});

/**
 * Authenticated read used by server-side callers that will attach the
 * deployment's Gateway credential to a request built from this URL.
 *
 * `get` above stays open for the orchestration service, which reads the URL
 * without a human identity; anything that combines the URL with a secret must
 * resolve an administrator first.
 */
export const getAuthorized = query({
  args: {},
  handler: async (ctx) => {
    await requireCompanyAdministrator(ctx);
    const row = await ctx.db
      .query("gatewayConnection")
      .withIndex("by_updatedAt")
      .order("desc")
      .first();
    if (!row) return null;
    return { url: row.url, updatedAt: row.updatedAt };
  },
});

/**
 * The stored URL becomes the destination for requests that carry the
 * deployment's `GATEWAY_TOKEN`. An unauthenticated writer here is a credential
 * exfiltration and SSRF primitive, so this is company-administrator only and
 * attribution is server-derived.
 */
export const setUrl = mutation({
  args: { url: v.string(), updatedBy: v.optional(v.string()) },
  handler: async (ctx, { url }) => {
    const admin = await requireCompanyAdministrator(ctx);
    const updatedBy = String(admin.operatorId ?? "demo:company-administrator");
    const now = Date.now();
    const existing = await ctx.db
      .query("gatewayConnection")
      .withIndex("by_updatedAt")
      .order("desc")
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        url: url.trim(),
        updatedAt: now,
        ...(updatedBy !== undefined && { updatedBy }),
      });
      return existing._id;
    }
    return await ctx.db.insert("gatewayConnection", {
      url: url.trim(),
      updatedAt: now,
      ...(updatedBy !== undefined && { updatedBy }),
    });
  },
});
