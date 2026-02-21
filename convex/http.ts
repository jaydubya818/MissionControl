/**
 * Convex HTTP Routes — Stripe webhooks and external integrations
 */

import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";

const http = httpRouter();

http.route({
  path: "/stripe/webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await request.text();

    let event: {
      id: string;
      type: string;
      data: { object: Record<string, any> };
    };
    try {
      event = JSON.parse(body);
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }

    const obj = event.data?.object;
    if (!obj) {
      return new Response("Missing event data", { status: 400 });
    }

    const typeMap: Record<string, string> = {
      "charge.succeeded": "CHARGE",
      "invoice.paid": "SUBSCRIPTION",
      "charge.refunded": "REFUND",
      "payout.paid": "PAYOUT",
    };

    const eventType = typeMap[event.type];
    if (!eventType) {
      return new Response("OK (ignored)", { status: 200 });
    }

    const amount = (obj.amount ?? obj.amount_paid ?? 0) / 100;
    const currency = (obj.currency ?? "usd").toUpperCase();

    await ctx.runMutation(api.revenue.record, {
      source: "STRIPE",
      eventType: eventType as "CHARGE" | "SUBSCRIPTION" | "REFUND" | "PAYOUT",
      amount,
      currency,
      description: obj.description ?? event.type,
      customerId: obj.customer ?? undefined,
      customerEmail: obj.receipt_email ?? obj.customer_email ?? undefined,
      externalId: event.id,
      externalRef: obj.id,
    });

    return new Response("OK", { status: 200 });
  }),
});

export default http;
