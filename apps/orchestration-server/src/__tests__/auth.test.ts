import { describe, expect, it } from "vitest";
import {
  isPublicOrchestrationRoute,
  isShadowProviderRoute,
  orchestrationAuthFailure,
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

  it("delegates only exact ExecutionIntent routes to their dedicated service authentication", () => {
    expect(isPublicOrchestrationRoute("POST", "/v1/execution-intents")).toBe(true);
    expect(isPublicOrchestrationRoute("GET", "/v1/execution-intents/executionIntent_shadow1")).toBe(true);
    expect(isPublicOrchestrationRoute("GET", "/v1/execution-intents/executionIntent_shadow1/events")).toBe(true);
    expect(isPublicOrchestrationRoute("DELETE", "/v1/execution-intents/executionIntent_shadow1")).toBe(false);
    expect(isPublicOrchestrationRoute("GET", "/v1/execution-intents/../status")).toBe(false);
    expect(isPublicOrchestrationRoute("POST", "/v1/execution-intents-extra")).toBe(false);
  });

  it("limits shadow-provider-only mode to health and exact ExecutionIntent routes", () => {
    expect(isShadowProviderRoute("GET", "/health")).toBe(true);
    expect(isShadowProviderRoute("POST", "/v1/execution-intents")).toBe(true);
    expect(isShadowProviderRoute("GET", "/v1/execution-intents/executionIntent_shadow1")).toBe(true);
    expect(isShadowProviderRoute("GET", "/v1/execution-intents/executionIntent_shadow1/events")).toBe(true);
    expect(isShadowProviderRoute("GET", "/gateway/status")).toBe(false);
    expect(isShadowProviderRoute("POST", "/tick")).toBe(false);
    expect(isShadowProviderRoute("OPTIONS", "/v1/execution-intents")).toBe(false);
  });
});
