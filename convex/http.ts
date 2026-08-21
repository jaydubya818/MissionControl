/**
 * Convex HTTP Routes — Stripe webhooks and external integrations
 *
 * Stripe webhook signature is verified with STRIPE_WEBHOOK_SECRET (whsec_...) when set.
 */

import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import {
  extractPrFromWebhookEvent,
  isSupportedPullRequestWebhookAction,
  verifyGithubWebhookSignature,
} from "./lib/githubCiIngest";
import {
  sha256Hex,
  verifyGithubInstallationSetup,
} from "./lib/githubAppAuth";

const http = httpRouter();

/** Maximum accepted age of a Stripe signature timestamp. */
const STRIPE_SIGNATURE_TOLERANCE_SECONDS = 300;

/**
 * Verify Stripe-Signature header (HMAC-SHA256) using Web Crypto.
 * Header format: "t=timestamp,v1=hex_signature[,v0=...]"
 * Signed payload: "${timestamp}.${rawBody}"
 */
async function verifyStripeSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string
): Promise<boolean> {
  if (!signatureHeader || !secret) return false;
  const parts = signatureHeader.split(",").reduce((acc, part) => {
    const [k, v] = part.split("=");
    if (k && v) acc[k.trim()] = v.trim();
    return acc;
  }, {} as Record<string, string>);
  const timestamp = parts["t"];
  const v1 = parts["v1"];
  if (!timestamp || !v1) return false;
  // Bound how long a captured, still-valid signature stays usable. Stripe's own
  // libraries apply the same 5-minute tolerance. Exactly-once semantics come
  // from `revenue.record`, which dedupes on the Stripe `event.id`
  // (`externalId`, `by_external_id`); this check bounds the injection window
  // for events that have not been seen at all.
  const issuedAtSeconds = Number(timestamp);
  if (!Number.isFinite(issuedAtSeconds)) return false;
  const skewSeconds = Math.abs(Date.now() / 1000 - issuedAtSeconds);
  if (skewSeconds > STRIPE_SIGNATURE_TOLERANCE_SECONDS) return false;
  const signedPayload = `${timestamp}.${rawBody}`;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    enc.encode(signedPayload)
  );
  const expected = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  if (v1.length !== expected.length) return false;
  let eq = true;
  for (let i = 0; i < v1.length; i++) {
    if (v1[i] !== expected[i]) eq = false;
  }
  return eq;
}

http.route({
  path: "/stripe/webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await request.text();
    const signature = request.headers.get("stripe-signature");
    const secret = process.env.STRIPE_WEBHOOK_SECRET;

    // Fail closed when the webhook is unconfigured — matching /github/webhook.
    // An unverified body must never be able to write revenue records.
    if (!secret) {
      return new Response("Stripe webhook is not configured", { status: 503 });
    }
    const valid = await verifyStripeSignature(body, signature, secret);
    if (!valid) {
      return new Response("Webhook signature verification failed", { status: 401 });
    }

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

http.route({
  path: "/github/app/setup",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const state = url.searchParams.get("state");
    const code = url.searchParams.get("code");
    const installationId = url.searchParams.get("installation_id");
    if (!state || !code || !installationId) {
      return new Response("GitHub App setup parameters are incomplete", { status: 400 });
    }

    let setup: {
      session: Doc<"githubAppSetupSessions">;
      repository: Doc<"workspaceRepositories">;
    };
    try {
      setup = await ctx.runQuery(internal.githubAppConnections.resolveSetupSession, {
        stateHash: await sha256Hex(state),
      });
    } catch {
      return new Response("GitHub App setup session is invalid or expired", { status: 400 });
    }

    const appId = process.env.GITHUB_APP_ID;
    const clientId = process.env.GITHUB_APP_CLIENT_ID;
    const clientSecret = process.env.GITHUB_APP_CLIENT_SECRET;
    const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;
    if (!appId || !clientId || !clientSecret || !privateKey) {
      await ctx.runMutation(internal.githubAppConnections.completeSetupSession, {
        setupSessionId: setup.session._id,
        status: "FAILED",
        error: "GitHub App server credentials are incomplete.",
      });
      return new Response("GitHub App server configuration is incomplete", { status: 503 });
    }

    try {
      const verified = await verifyGithubInstallationSetup({
        code,
        installationId,
        repository: setup.repository.repository,
        appId,
        clientId,
        clientSecret,
        privateKey,
      });
      await ctx.runMutation(internal.githubAppConnections.upsertInstallation, {
        repositoryId: setup.repository._id,
        providerRepositoryId: verified.providerRepositoryId,
        installationId: verified.installationId,
        appId,
        accountLogin: verified.accountLogin,
        accountType: verified.accountType,
        repositorySelection: verified.repositorySelection,
        permissions: verified.permissions,
        subscribedEvents: verified.subscribedEvents,
        status: "CONNECTED",
        installedAt: verified.installedAt,
        verifiedAt: verified.verifiedAt,
        lastTokenIssuedAt: verified.lastTokenIssuedAt,
      });
      await ctx.runMutation(internal.githubAppConnections.completeSetupSession, {
        setupSessionId: setup.session._id,
        status: "COMPLETED",
        installationId: verified.installationId,
      });

      const appUrl = process.env.MISSION_CONTROL_APP_URL;
      if (appUrl) {
        const redirect = new URL(appUrl);
        redirect.searchParams.set("github_app", "connected");
        redirect.searchParams.set("project", String(setup.repository.projectId));
        return Response.redirect(redirect.toString(), 302);
      }
      return new Response("GitHub App connected. Return to Mission Control.", { status: 200 });
    } catch (error) {
      const message = error instanceof Error ? error.message : "GitHub App verification failed.";
      await ctx.runMutation(internal.githubAppConnections.completeSetupSession, {
        setupSessionId: setup.session._id,
        status: "FAILED",
        error: message.slice(0, 1_000),
      });
      return new Response("GitHub App verification failed", { status: 403 });
    }
  }),
});

http.route({
  path: "/github/webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await request.text();
    const secret = process.env.GITHUB_WEBHOOK_SECRET;
    const signature = request.headers.get("x-hub-signature-256");
    const deliveryId = request.headers.get("x-github-delivery");
    const event = request.headers.get("x-github-event") ?? "";
    if (!deliveryId || !event) {
      return new Response("GitHub delivery and event headers are required", { status: 400 });
    }
    if (!secret) {
      return new Response("GitHub webhook is not configured", { status: 503 });
    }
    const valid = await verifyGithubWebhookSignature(body, signature, secret);
    if (!valid) {
      await ctx.runMutation(internal.githubAppConnections.beginWebhookDelivery, {
        deliveryId,
        event,
        signatureStatus: signature ? "INVALID" : "MISSING",
      });
      return new Response("GitHub webhook signature verification failed", { status: 401 });
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(body);
    } catch {
      await ctx.runMutation(internal.githubAppConnections.beginWebhookDelivery, {
        deliveryId,
        event,
        signatureStatus: "VALID",
      });
      return new Response("Invalid JSON", { status: 400 });
    }

    const repository = payload.repository as { id?: number; full_name?: string } | undefined;
    const installation = payload.installation as { id?: number } | undefined;
    const delivery = await ctx.runMutation(
      internal.githubAppConnections.beginWebhookDelivery,
      {
        deliveryId,
        event,
        action: typeof payload.action === "string" ? payload.action : undefined,
        repository: repository?.full_name,
        providerRepositoryId: repository?.id != null ? String(repository.id) : undefined,
        installationId: installation?.id != null ? String(installation.id) : undefined,
        signatureStatus: "VALID",
      }
    );
    if (delivery.duplicate) {
      return new Response("OK (duplicate)", { status: 200 });
    }
    if (!delivery.accepted) {
      return new Response(delivery.error ?? "GitHub installation is not authorized", { status: 403 });
    }

    const complete = async (
      status: "PROCESSED" | "IGNORED" | "FAILED",
      result?: string,
      error?: string
    ) => {
      await ctx.runMutation(internal.githubAppConnections.completeWebhookDelivery, {
        deliveryRecordId: delivery.deliveryRecordId,
        status,
        result,
        error,
      });
    };

    if (event === "installation" || event === "installation_repositories") {
      const removed = payload.repositories_removed as Array<{ id?: number }> | undefined;
      await ctx.runMutation(internal.githubAppConnections.markInstallationChanged, {
        installationId: String(installation?.id),
        action: typeof payload.action === "string" ? payload.action : "changed",
        removedProviderRepositoryIds: removed
          ?.flatMap((candidate) => candidate.id == null ? [] : [String(candidate.id)]),
      });
      await complete("PROCESSED", `Recorded GitHub installation action ${String(payload.action ?? "changed")}.`);
      return new Response("OK", { status: 200 });
    }

    const prRef = extractPrFromWebhookEvent(event, payload);
    if (!prRef) {
      await complete("IGNORED", "Event does not carry supported pull request evidence.");
      return new Response("OK (ignored)", { status: 200 });
    }

    if (
      event === "pull_request" &&
      !isSupportedPullRequestWebhookAction(payload.action)
    ) {
      await complete("IGNORED", `Unsupported pull_request action ${String(payload.action ?? "")}.`);
      return new Response("OK (ignored action)", { status: 200 });
    }

    if (event === "check_run" && payload.action !== "completed") {
      await complete("IGNORED", `Unsupported check_run action ${String(payload.action ?? "")}.`);
      return new Response("OK (ignored action)", { status: 200 });
    }

    if (event === "pull_request_review" && payload.action !== "submitted") {
      await complete("IGNORED", `Unsupported pull_request_review action ${String(payload.action ?? "")}.`);
      return new Response("OK (ignored action)", { status: 200 });
    }

    try {
      await ctx.runAction(internal.factory.prChecks.ingestPullRequestFromWebhook, {
        prUrl: prRef.prUrl,
        projectId: delivery.projectId,
        sourceEventId: deliveryId,
      });

      const review = payload.review as { state?: string; body?: string; html_url?: string } | undefined;
      if (
        event === "pull_request_review" &&
        review?.state === "changes_requested" &&
        delivery.projectId
      ) {
        await ctx.runMutation(internal.factory.metaLoop.ingestSignal, {
          projectId: delivery.projectId,
          kind: "SKILL_UPDATE",
          signalClass: "REVIEW_CORRECTION",
          target: `${prRef.owner}/${prRef.repo}`,
          title: `Reduce recurring review correction in ${prRef.repo}`,
          summary: review.body?.slice(0, 1_000) || "Pull request review requested changes.",
          sourceRef: deliveryId,
          sourceLinks: [review.html_url ?? prRef.prUrl],
          confidence: 0.75,
          impact: "MEDIUM",
          payload: { prUrl: prRef.prUrl },
        });
      }
      await complete("PROCESSED", `Ingested ${event} for ${prRef.prUrl}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "GitHub webhook processing failed.";
      await complete("FAILED", undefined, message.slice(0, 1_000));
      return new Response("GitHub webhook processing failed", { status: 500 });
    }

    return new Response("OK", { status: 200 });
  }),
});

export default http;
