/**
 * Bearer token auth middleware for orchestration server.
 * When ORCHESTRATION_API_TOKEN or MC_API_TOKEN is set, protected routes require
 * Authorization: Bearer <token>. When neither is set, requests are allowed (dev mode).
 */

import type { Context, Next } from "hono";
import { timingSafeEqual } from "node:crypto";

const PUBLIC_ROUTES = new Set([
  "GET /health",
  "GET /gateway/status",
]);

export function orchestrationAuthFailure(
  expectedToken: string | null,
  production: boolean,
  authorizationHeader?: string
): { status: 401 | 503; error: string } | null {
  if (!expectedToken) {
    return production
      ? { status: 503, error: "Orchestration authentication is not configured" }
      : null;
  }
  const token = authorizationHeader?.startsWith("Bearer ")
    ? authorizationHeader.slice(7).trim()
    : null;
  return token && tokensMatch(token, expectedToken)
    ? null
    : { status: 401, error: "Unauthorized" };
}

export function requireAuth() {
  return async (c: Context, next: Next) => {
    const method = c.req.method.toUpperCase();
    if (isPublicOrchestrationRoute(method, c.req.path)) {
      await next();
      return;
    }
    const auth = c.req.header("Authorization");
    const { expectedToken, production } = currentAuthConfig();
    const failure = orchestrationAuthFailure(expectedToken, production, auth);
    if (failure) return c.json({ error: failure.error }, failure.status);
    await next();
  };
}

/**
 * Authorization check for WebSocket upgrade requests.
 *
 * Hono middleware never sees `upgrade` requests — Node hands them straight to
 * `server.on("upgrade")` — so `/gateway/ws` must apply the same bearer rule as
 * every protected HTTP route. Same semantics as `orchestrationAuthFailure`:
 * 401 on a missing/wrong bearer, 503 in production when no token is configured,
 * allowed only in tokenless local development.
 */
export function orchestrationUpgradeFailure(
  req: { headers: { authorization?: string | string[] } }
): { status: 401 | 503; error: string } | null {
  const raw = req.headers.authorization;
  const header = Array.isArray(raw) ? raw[0] : raw;
  const { expectedToken, production } = currentAuthConfig();
  return orchestrationAuthFailure(expectedToken, production, header);
}

function currentAuthConfig(): { expectedToken: string | null; production: boolean } {
  const orchestrationToken = process.env.ORCHESTRATION_API_TOKEN?.trim();
  const legacyToken = process.env.MC_API_TOKEN?.trim();
  return {
    expectedToken: orchestrationToken || legacyToken || null,
    production: process.env.NODE_ENV === "production",
  };
}

export function isPublicOrchestrationRoute(method: string, requestPath: string): boolean {
  const normalizedMethod = method.toUpperCase();
  return normalizedMethod === "OPTIONS"
    || PUBLIC_ROUTES.has(`${normalizedMethod} ${requestPath}`);
}

function tokensMatch(candidate: string, expected: string): boolean {
  const candidateBytes = Buffer.from(candidate, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");
  return candidateBytes.length === expectedBytes.length
    && timingSafeEqual(candidateBytes, expectedBytes);
}
