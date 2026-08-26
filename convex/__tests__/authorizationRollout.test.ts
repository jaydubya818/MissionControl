import { describe, expect, it } from "vitest";
import {
  anonymousDemoEnabledFor,
  authorizationIsEnforced,
  authorizationModeSummary,
  authorizationRequiredFor,
  parseBackendDeploymentClass,
  resolveAuthorizationMode,
} from "../lib/authorizationRollout";

describe("authorization rollout", () => {
  it("enforces as soon as the deployment has an operator, even with the flag off", () => {
    // Regression: `control-plane.team-authorization` and `company.context` both
    // ship default-off, and their gates returned null/false when off — so an
    // unconfigured deployment authorized everything, indefinitely. Provisioning
    // is the migration signal: once anyone CAN pass a check, checks apply.
    expect(
      resolveAuthorizationMode({
        flagEnabled: false,
        hasActiveOperator: true,
        anonymousDemo: false,
      }),
    ).toBe("ENFORCED");
  });

  it("retains legacy access only while nobody could pass a check", () => {
    const mode = resolveAuthorizationMode({
      flagEnabled: false,
      hasActiveOperator: false,
      anonymousDemo: false,
    });
    expect(mode).toBe("UNPROVISIONED");
    expect(authorizationIsEnforced(mode)).toBe(false);
    expect(authorizationRequiredFor(mode, "READ")).toBe(false);
    expect(authorizationRequiredFor(mode, "WRITE")).toBe(true);
    // The state must be self-describing, not silent.
    expect(authorizationModeSummary(mode).headline).toMatch(/no operators provisioned/i);
  });

  it("lets an operator opt in before provisioning finishes", () => {
    expect(
      resolveAuthorizationMode({
        flagEnabled: true,
        hasActiveOperator: false,
        anonymousDemo: false,
      }),
    ).toBe("ENFORCED");
  });

  it("reports the anonymous demo override as unsafe and unenforced", () => {
    const mode = resolveAuthorizationMode({
      flagEnabled: true,
      hasActiveOperator: true,
      anonymousDemo: true,
    });
    expect(mode).toBe("ANONYMOUS_DEMO");
    expect(authorizationIsEnforced(mode)).toBe(false);
    const summary = authorizationModeSummary(mode);
    expect(summary.enforced).toBe(false);
    expect(summary.headline).toMatch(/UNSAFE/);
    expect(summary.detail).toMatch(/MC_ALLOW_ANONYMOUS_COMPANY_CONTEXT/);
    expect(authorizationRequiredFor(mode, "WRITE")).toBe(false);
  });

  it.each([
    [undefined, null],
    ["", null],
    ["preview", null],
    ["LOCAL", "local"],
    ["shared", "shared"],
    ["production", "production"],
  ])("parses backend deployment class %s", (value, expected) => {
    expect(parseBackendDeploymentClass(value)).toBe(expected);
  });

  it("allows anonymous demo access only for an explicitly local backend", () => {
    expect(
      anonymousDemoEnabledFor({ requested: true, deploymentClass: "local" }),
    ).toBe(true);
    expect(
      anonymousDemoEnabledFor({ requested: false, deploymentClass: "production" }),
    ).toBe(false);
  });

  it.each([undefined, "", "preview", "shared", "production"])(
    "rejects anonymous demo access for backend class %s",
    (deploymentClass) => {
      expect(() => anonymousDemoEnabledFor({ requested: true, deploymentClass }))
        .toThrow(/MC_BACKEND_DEPLOYMENT_CLASS=local/);
    },
  );

  it("describes the enforced state without hedging", () => {
    const summary = authorizationModeSummary("ENFORCED");
    expect(summary.enforced).toBe(true);
    expect(summary.headline).toBe("Authorization enforced");
  });
});
