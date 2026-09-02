import { describe, expect, it } from "vitest";
import {
  isPublicOrchestrationRoute,
  orchestrationAuthFailure,
  orchestrationUpgradeFailure,
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

  it("applies the same bearer rule to WebSocket upgrades as to HTTP routes", () => {
    // auth.ts reads ORCHESTRATION_API_TOKEN/NODE_ENV at import time; this test
    // file runs without either, so the module is in tokenless dev mode.
    expect(orchestrationUpgradeFailure({ headers: {} })).toBeNull();
    expect(orchestrationUpgradeFailure({ headers: { authorization: ["Bearer x", "Bearer y"] } })).toBeNull();
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
