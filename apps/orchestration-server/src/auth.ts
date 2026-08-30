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

export function isPublicOrchestrationRoute(method: string, requestPath: string): boolean {
  const normalizedMethod = method.toUpperCase();
  return normalizedMethod === "OPTIONS"
    || isDedicatedExecutionIntentRoute(normalizedMethod, requestPath)
    || PUBLIC_ROUTES.has(`${normalizedMethod} ${requestPath}`);
}

export function isShadowProviderRoute(method: string, requestPath: string): boolean {
  const normalizedMethod = method.toUpperCase();
  return (normalizedMethod === "GET" && requestPath === "/health")
    || isDedicatedExecutionIntentRoute(normalizedMethod, requestPath);
}

function isDedicatedExecutionIntentRoute(method: string, requestPath: string): boolean {
  if (method !== "GET" && method !== "POST") return false;
  return requestPath === "/v1/execution-intents"
    || /^\/v1\/execution-intents\/[A-Za-z][A-Za-z0-9_-]{5,127}(?:\/events)?$/.test(requestPath);
}

function tokensMatch(candidate: string, expected: string): boolean {
  const candidateBytes = Buffer.from(candidate, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");
  return candidateBytes.length === expectedBytes.length
    && timingSafeEqual(candidateBytes, expectedBytes);
}
