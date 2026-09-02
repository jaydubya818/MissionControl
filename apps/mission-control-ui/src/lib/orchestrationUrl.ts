/**
 * Base URL for the Mission Control orchestration server.
 * Without VITE_ORCHESTRATION_URL, uses same-origin. Development relies on the
 * Vite proxy; production must provide an authenticated reverse proxy.
 */

const env = typeof import.meta !== "undefined" ? (import.meta as any).env : undefined;
const explicit = env?.VITE_ORCHESTRATION_URL?.trim();

/** Base URL for HTTP requests (no trailing slash). Empty string = same origin (use with proxy). */
export function getOrchestrationBaseUrl(): string {
  if (explicit) return explicit;
  return "";
}

/** Full WebSocket URL for the authenticated gateway proxy. */
export function getGatewayWsUrl(): string {
  const base = getOrchestrationBaseUrl();
  if (base === "" && typeof window !== "undefined") {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${window.location.host}/gateway/ws`;
  }
  const wsBase = base.replace(/^http/, "ws");
  return `${wsBase}/gateway/ws`;
}
