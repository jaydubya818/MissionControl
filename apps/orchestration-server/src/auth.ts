/**
 * Bearer token auth middleware for orchestration server.
 * When ORCHESTRATION_API_TOKEN or MC_API_TOKEN is set, protected routes require
 * Authorization: Bearer <token>. When neither is set, requests are allowed (dev mode).
 */

import type { Context, Next } from "hono";
import { timingSafeEqual } from "node:crypto";

const ORCHESTRATION_TOKEN = process.env.ORCHESTRATION_API_TOKEN?.trim();
const MC_TOKEN = process.env.MC_API_TOKEN?.trim();
const EXPECTED_TOKEN = ORCHESTRATION_TOKEN || MC_TOKEN || null;
const PRODUCTION = process.env.NODE_ENV === "production";

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
    const failure = orchestrationAuthFailure(EXPECTED_TOKEN, PRODUCTION, auth);
    if (failure) return c.json({ error: failure.error }, failure.status);
    await next();
  };
}

/**
 * Decide whether a WebSocket upgrade to the Gateway proxy may proceed.
 *
 * The upgrade is handled on the raw Node server, so Hono middleware — and
 * therefore `requireAuth()` — never runs for it. The proxy also splices the
 * server-held `GATEWAY_TOKEN` into the upstream `connect` frame, so an
 * unauthenticated upgrade is a credential-use primitive, not just an open
 * socket.
 *
 * Authority model, in strict order:
 *
 *  1. The path must be the Gateway socket.
 *  2. **If an inbound token is configured, an exact bearer is MANDATORY.**
 *     `Origin` is trivially forgeable by any non-browser client (`curl`,
 *     `wscat`, any HTTP library), so it can only ever *narrow* access — it can
 *     never substitute for the credential that every HTTP route requires.
 *     A browser reaching this socket in a token-configured deployment must
 *     therefore come through the same reverse proxy that injects the bearer
 *     for `/orchestration/*` HTTP calls (in local development that is the Vite
 *     proxy, see `apps/mission-control-ui/vite.config.ts`).
 *  3. Only in an explicitly tokenless local-development deployment does the
 *     `Origin` allowlist become the control, because WebSocket handshakes are
 *     exempt from CORS and a wildcard policy would otherwise let any page the
 *     operator visits drive this socket.
 *  4. Production with no configured token fails closed, matching
 *     `orchestrationAuthFailure`.
 *
 * Returns `null` when the upgrade is allowed, otherwise a short denial reason.
 */
export function gatewayUpgradeDenialReason(input: {
  pathname: string | null;
  origin?: string;
  authorization?: string;
  expectedToken: string | null;
  production: boolean;
  allowedOrigins: string[];
}): string | null {
  if (input.pathname !== "/gateway/ws") return "unexpected_path";

  const bearer = input.authorization?.startsWith("Bearer ")
    ? input.authorization.slice(7).trim()
    : null;

  if (input.expectedToken) {
    // Bearer is mandatory. Origin may narrow further but never substitutes.
    if (!bearer || !tokensMatch(bearer, input.expectedToken)) return "unauthorized";
    const authorizedOrigin = input.origin?.trim();
    if (authorizedOrigin && !input.allowedOrigins.includes(normalizeOrigin(authorizedOrigin))) {
      return "origin_not_allowed";
    }
    return null;
  }

  if (input.production) return "authentication_not_configured";

  // Tokenless local development: the Origin allowlist is the only control.
  const origin = input.origin?.trim();
  if (origin) {
    return input.allowedOrigins.includes(normalizeOrigin(origin))
      ? null
      : "origin_not_allowed";
  }
  return null;
}

/** Origins permitted to open the Gateway WebSocket from a browser. */
export function resolveAllowedGatewayOrigins(
  configured: string | undefined,
  production: boolean,
): string[] {
  const explicit = (configured ?? "")
    .split(",")
    .map((entry) => normalizeOrigin(entry.trim()))
    .filter((entry) => entry.length > 0);
  if (production) return [...new Set(explicit)];
  // Local development serves the operator UI from Vite on a rotating port.
  const localhost = [5173, 5174, 5199, 4173, 3000].flatMap((port) => [
    `http://localhost:${port}`,
    `http://127.0.0.1:${port}`,
  ]);
  return [...new Set([...explicit, ...localhost])];
}

function normalizeOrigin(value: string): string {
  if (!value) return "";
  try {
    return new URL(value).origin;
  } catch {
    return value.replace(/\/+$/, "");
  }
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
