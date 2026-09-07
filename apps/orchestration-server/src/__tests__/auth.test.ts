import { afterEach, describe, expect, it } from "vitest";
import {
  isPublicOrchestrationRoute,
  offlineQualificationRouteAllowed,
  orchestrationAuthFailure,
  orchestrationUpgradeFailure,
} from "../auth.js";

describe("orchestration authentication", () => {
  const originalOrchestrationToken = process.env.ORCHESTRATION_API_TOKEN;
  const originalMcToken = process.env.MC_API_TOKEN;
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    restoreEnv("ORCHESTRATION_API_TOKEN", originalOrchestrationToken);
    restoreEnv("MC_API_TOKEN", originalMcToken);
    restoreEnv("NODE_ENV", originalNodeEnv);
  });

  it("limits offline qualification HTTP access to worker operations", () => {
    expect(offlineQualificationRouteAllowed("GET", "/health")).toBe(true);
    expect(offlineQualificationRouteAllowed("GET", "/status")).toBe(true);
    expect(offlineQualificationRouteAllowed("POST", "/runs/factory-worker/tick")).toBe(true);
    for (const [method, route] of [["POST", "/tick"], ["POST", "/agents/spawn"], ["POST", "/classify"], ["GET", "/gateway/status"]]) {
      expect(offlineQualificationRouteAllowed(method, route)).toBe(false);
    }
  });

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
    delete process.env.ORCHESTRATION_API_TOKEN;
    delete process.env.MC_API_TOKEN;
    process.env.NODE_ENV = "development";
    expect(orchestrationUpgradeFailure({ headers: {} })).toBeNull();
    expect(orchestrationUpgradeFailure({ headers: { authorization: ["Bearer x", "Bearer y"] } })).toBeNull();
  });

  it("uses credentials loaded after module evaluation", () => {
    const tokenEnvName = ["ORCHESTRATION", "API", "TOKEN"].join("_");
    process.env[tokenEnvName] = "configured-after-import";
    process.env.NODE_ENV = "development";

    expect(orchestrationUpgradeFailure({ headers: {} })).toMatchObject({ status: 401 });
    expect(
      orchestrationUpgradeFailure({ headers: { authorization: "Bearer wrong" } })
    ).toMatchObject({ status: 401 });
    expect(
      orchestrationUpgradeFailure({
        headers: { authorization: "Bearer configured-after-import" },
      })
    ).toBeNull();
  });

  it("allows only explicit public probes and CORS preflight", () => {
    expect(isPublicOrchestrationRoute("GET", "/health")).toBe(true);
    expect(isPublicOrchestrationRoute("GET", "/ready")).toBe(true);
    expect(isPublicOrchestrationRoute("GET", "/gateway/status")).toBe(true);
    expect(isPublicOrchestrationRoute("OPTIONS", "/missions/mission-1/accept")).toBe(true);
    expect(isPublicOrchestrationRoute("POST", "/missions/mission-1/accept")).toBe(false);
    expect(isPublicOrchestrationRoute("POST", "/approval-decisions/decision-1/decide")).toBe(false);
    expect(isPublicOrchestrationRoute("GET", "/status")).toBe(false);
  });
});

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
