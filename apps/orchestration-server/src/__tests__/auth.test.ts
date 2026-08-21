import { describe, expect, it } from "vitest";
import {
  gatewayUpgradeDenialReason,
  isPublicOrchestrationRoute,
  orchestrationAuthFailure,
  resolveAllowedGatewayOrigins,
} from "../auth.js";

describe("orchestration authentication", () => {
  it("fails closed in production when no inbound token is configured", () => {
    expect(orchestrationAuthFailure(null, true)).toEqual({
      status: 503,
      error: "Orchestration authentication is not configured",
    });
  });

  it("permits explicit tokenless local development only", () => {
    expect(orchestrationAuthFailure(null, false)).toBeNull();
  });

  it("accepts only an exact bearer credential", () => {
    expect(orchestrationAuthFailure("expected", true, "Bearer expected")).toBeNull();
    expect(orchestrationAuthFailure("expected", true, "Bearer wrong")).toMatchObject({ status: 401 });
  });

  it("allows only explicit public probes and CORS preflight", () => {
    expect(isPublicOrchestrationRoute("GET", "/health")).toBe(true);
    expect(isPublicOrchestrationRoute("GET", "/gateway/status")).toBe(true);
    expect(isPublicOrchestrationRoute("OPTIONS", "/missions/mission-1/accept")).toBe(true);
    expect(isPublicOrchestrationRoute("POST", "/missions/mission-1/accept")).toBe(false);
    expect(isPublicOrchestrationRoute("POST", "/approval-decisions/decision-1/decide")).toBe(false);
    expect(isPublicOrchestrationRoute("GET", "/status")).toBe(false);
  });
});

describe("gateway WebSocket upgrade authorization", () => {
  // Regression: the upgrade is handled on the raw Node server, so Hono's
  // requireAuth() never runs for it, and the proxy splices the server-held
  // GATEWAY_TOKEN into the upstream connect frame. WebSocket handshakes are
  // exempt from CORS, so any page the operator visited could drive an
  // authenticated upstream Gateway session.
  const allowedOrigins = ["https://mc.example.com"];

  it("rejects any path other than the gateway socket", () => {
    expect(gatewayUpgradeDenialReason({
      pathname: "/anything-else",
      origin: "https://mc.example.com",
      expectedToken: "expected",
      production: true,
      allowedOrigins,
    })).toBe("unexpected_path");
  });

  it("never accepts an Origin in place of the configured bearer", () => {
    // Regression: `Origin` is only unforgeable for browsers. Treating an
    // allowlisted Origin as sufficient let any non-browser client
    // (`wscat -H "Origin: https://mc.example.com"`) open the socket with no
    // credential and have the proxy splice in the server-held GATEWAY_TOKEN.
    expect(gatewayUpgradeDenialReason({
      pathname: "/gateway/ws",
      origin: "https://mc.example.com",
      expectedToken: "expected",
      production: true,
      allowedOrigins,
    })).toBe("unauthorized");
    expect(gatewayUpgradeDenialReason({
      pathname: "/gateway/ws",
      origin: "https://attacker.example",
      expectedToken: "expected",
      production: true,
      allowedOrigins,
    })).toBe("unauthorized");
  });

  it("accepts a valid bearer, and lets Origin narrow it further", () => {
    expect(gatewayUpgradeDenialReason({
      pathname: "/gateway/ws",
      authorization: "Bearer expected",
      origin: "https://mc.example.com",
      expectedToken: "expected",
      production: true,
      allowedOrigins,
    })).toBeNull();
    expect(gatewayUpgradeDenialReason({
      pathname: "/gateway/ws",
      authorization: "Bearer expected",
      origin: "https://attacker.example",
      expectedToken: "expected",
      production: true,
      allowedOrigins,
    })).toBe("origin_not_allowed");
  });

  it("uses the Origin allowlist only in tokenless local development", () => {
    expect(gatewayUpgradeDenialReason({
      pathname: "/gateway/ws",
      origin: "http://localhost:5199",
      expectedToken: null,
      production: false,
      allowedOrigins: resolveAllowedGatewayOrigins(undefined, false),
    })).toBeNull();
    expect(gatewayUpgradeDenialReason({
      pathname: "/gateway/ws",
      origin: "https://attacker.example",
      expectedToken: null,
      production: false,
      allowedOrigins: resolveAllowedGatewayOrigins(undefined, false),
    })).toBe("origin_not_allowed");
  });

  it("accepts an exact bearer credential from a non-browser caller", () => {
    expect(gatewayUpgradeDenialReason({
      pathname: "/gateway/ws",
      authorization: "Bearer expected",
      expectedToken: "expected",
      production: true,
      allowedOrigins,
    })).toBeNull();
    expect(gatewayUpgradeDenialReason({
      pathname: "/gateway/ws",
      authorization: "Bearer wrong",
      expectedToken: "expected",
      production: true,
      allowedOrigins,
    })).toBe("unauthorized");
  });

  it("fails closed in production when no inbound token is configured", () => {
    expect(gatewayUpgradeDenialReason({
      pathname: "/gateway/ws",
      expectedToken: null,
      production: true,
      allowedOrigins,
    })).toBe("authentication_not_configured");
    expect(gatewayUpgradeDenialReason({
      pathname: "/gateway/ws",
      expectedToken: null,
      production: false,
      allowedOrigins,
    })).toBeNull();
  });

  it("permits local Vite origins only outside production", () => {
    expect(resolveAllowedGatewayOrigins("https://mc.example.com/", true)).toEqual([
      "https://mc.example.com",
    ]);
    const dev = resolveAllowedGatewayOrigins(undefined, false);
    expect(dev).toContain("http://localhost:5199");
    expect(dev).toContain("http://localhost:5173");
  });
});
